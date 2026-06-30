import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  exposure_profiles,
  jurisdictions,
  rules,
  regulators,
} from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const profileSchema = z.object({
  jurisdiction_code: z.string().min(1),
  data_categories: z.array(z.string()).optional().default([]),
  has_template: z.boolean().optional().default(false),
  has_approver: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
})

// ── List caller's exposure profiles ─────────────────────────────────────────
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const rows = await db
    .select()
    .from(exposure_profiles)
    .where(eq(exposure_profiles.user_id, userId))
    .orderBy(exposure_profiles.created_at)
  return c.json(rows)
})

// ── "If breached" obligation preview ────────────────────────────────────────
// Given a jurisdiction code and a list of affected data categories, return the
// statutory obligations (rules) that would be triggered with their deadline
// windows, recipient types, and the regulator (if any) for that jurisdiction.
router.get('/preview', authMiddleware, async (c) => {
  const jurisdictionCode = c.req.query('jurisdiction') ?? ''
  const categoriesRaw = c.req.query('categories') ?? ''
  const categories = categoriesRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (!jurisdictionCode) {
    return c.json({ error: 'jurisdiction query param is required' }, 400)
  }

  const [jur] = await db
    .select()
    .from(jurisdictions)
    .where(eq(jurisdictions.code, jurisdictionCode))
  if (!jur) {
    return c.json({ previews: [] })
  }

  const jurRules = await db
    .select()
    .from(rules)
    .where(eq(rules.jurisdiction_id, jur.id))

  const jurRegulators = await db
    .select()
    .from(regulators)
    .where(eq(regulators.jurisdiction_id, jur.id))
  const defaultRegulator = jurRegulators[0]

  const now = Date.now()
  const HOUR_MS = 3_600_000

  const previews = jurRules
    .filter((r) => {
      // effective-window filter
      if (r.effective_from && new Date(r.effective_from).getTime() > now) return false
      if (r.effective_to && new Date(r.effective_to).getTime() < now) return false
      // data-category trigger filter: if the rule specifies trigger categories,
      // at least one of the supplied categories must match.
      const triggers = (r.trigger_data_categories ?? []) as string[]
      if (triggers.length > 0 && categories.length > 0) {
        return triggers.some((t) => categories.includes(t))
      }
      return true
    })
    .map((r) => {
      const deadlineHours = r.is_undue_delay ? null : r.deadline_hours ?? null
      const projectedDeadline =
        deadlineHours != null ? new Date(now + deadlineHours * HOUR_MS).toISOString() : null
      const recipient =
        r.category === 'regulator'
          ? defaultRegulator?.name ?? `${jur.name} regulator`
          : r.recipient_type
      return {
        ruleId: r.id,
        citation: r.citation,
        title: r.title,
        category: r.category,
        recipientType: r.recipient_type,
        recipient,
        clockAnchor: r.clock_anchor,
        isUndueDelay: r.is_undue_delay,
        deadlineHours,
        projectedDeadlineAt: projectedDeadline,
        harmThreshold: r.harm_threshold,
        residentThreshold: r.resident_threshold,
        triggerDataCategories: r.trigger_data_categories ?? [],
        contentRequirements: r.content_requirements,
        deliveryMethod: r.delivery_method,
        regulatorId: r.category === 'regulator' ? defaultRegulator?.id ?? null : null,
        whyTriggered: buildWhyTriggered(r, categories),
      }
    })
    .sort((a, b) => {
      const da = a.deadlineHours ?? Number.MAX_SAFE_INTEGER
      const dbb = b.deadlineHours ?? Number.MAX_SAFE_INTEGER
      return da - dbb
    })

  return c.json({
    jurisdiction: { code: jur.code, name: jur.name, region: jur.region, sector: jur.sector },
    categories,
    previews,
  })
})

function buildWhyTriggered(
  r: { trigger_data_categories?: unknown; is_undue_delay: boolean; deadline_hours: number | null; recipient_type: string },
  categories: string[],
): string {
  const triggers = (r.trigger_data_categories ?? []) as string[]
  const matched = triggers.filter((t) => categories.includes(t))
  const parts: string[] = []
  if (matched.length > 0) {
    parts.push(`Triggered by data categories: ${matched.join(', ')}`)
  } else {
    parts.push('Applies to any covered breach in this jurisdiction')
  }
  if (r.is_undue_delay) {
    parts.push('Notification required without undue delay')
  } else if (r.deadline_hours != null) {
    parts.push(`Notify ${r.recipient_type} within ${r.deadline_hours} hours`)
  }
  return parts.join('. ')
}

// ── Upsert exposure profile (one per user+jurisdiction) ──────────────────────
router.post('/', authMiddleware, zValidator('json', profileSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [row] = await db
    .insert(exposure_profiles)
    .values({
      user_id: userId,
      jurisdiction_code: body.jurisdiction_code,
      data_categories: body.data_categories,
      has_template: body.has_template,
      has_approver: body.has_approver,
      notes: body.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [exposure_profiles.user_id, exposure_profiles.jurisdiction_code],
      set: {
        data_categories: body.data_categories,
        has_template: body.has_template,
        has_approver: body.has_approver,
        notes: body.notes ?? null,
      },
    })
    .returning()
  return c.json(row, 201)
})

// ── Delete profile (ownership checked) ───────────────────────────────────────
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(exposure_profiles)
    .where(eq(exposure_profiles.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db
    .delete(exposure_profiles)
    .where(and(eq(exposure_profiles.id, id), eq(exposure_profiles.user_id, userId)))
  return c.json({ success: true })
})

export default router
