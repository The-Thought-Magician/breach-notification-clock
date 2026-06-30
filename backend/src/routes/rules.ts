import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { rules, jurisdictions } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Public reads (rules library browse); auth-gated custom-rule writes.

const ruleSchema = z.object({
  jurisdiction_id: z.string().min(1),
  citation: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(['regulator', 'individual', 'controller', 'media_substitute']),
  recipient_type: z.string().min(1),
  clock_anchor: z.enum(['discovery', 'confirmation', 'containment', 'belief_of_harm']),
  deadline_hours: z.number().int().min(0).nullable().optional(),
  is_undue_delay: z.boolean().optional().default(false),
  harm_threshold: z.enum(['any', 'medium', 'high']).optional().default('any'),
  resident_threshold: z.number().int().min(0).optional().default(0),
  trigger_data_categories: z.array(z.string()).optional().default([]),
  content_requirements: z.string().nullable().optional(),
  delivery_method: z.string().nullable().optional(),
  effective_from: z.string().datetime().nullable().optional(),
  effective_to: z.string().datetime().nullable().optional(),
})

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : new Date(t)
}

// Resolve a jurisdiction code to its id; returns null when not found.
async function jurisdictionIdForCode(code: string): Promise<string | null> {
  const [j] = await db.select().from(jurisdictions).where(eq(jurisdictions.code, code))
  return j ? j.id : null
}

// GET / — public: list rules (?jurisdiction=<code>&category=)
router.get('/', async (c) => {
  const jurisdiction = c.req.query('jurisdiction')
  const category = c.req.query('category')

  const conditions = []
  if (jurisdiction) {
    const jid = await jurisdictionIdForCode(jurisdiction)
    if (!jid) return c.json([])
    conditions.push(eq(rules.jurisdiction_id, jid))
  }
  if (category) conditions.push(eq(rules.category, category))

  const rows = conditions.length
    ? await db.select().from(rules).where(and(...conditions)).orderBy(desc(rules.created_at))
    : await db.select().from(rules).orderBy(desc(rules.created_at))
  return c.json(rows)
})

// GET /:id — public: rule detail
router.get('/:id', async (c) => {
  const [r] = await db.select().from(rules).where(eq(rules.id, c.req.param('id')))
  if (!r) return c.json({ error: 'Not found' }, 404)
  return c.json(r)
})

// POST / — auth: create a custom rule
router.post('/', authMiddleware, zValidator('json', ruleSchema), async (c) => {
  getUserId(c)
  const body = c.req.valid('json')
  // jurisdiction must exist (FK)
  const [j] = await db.select().from(jurisdictions).where(eq(jurisdictions.id, body.jurisdiction_id))
  if (!j) return c.json({ error: 'Unknown jurisdiction' }, 400)
  const [r] = await db
    .insert(rules)
    .values({
      jurisdiction_id: body.jurisdiction_id,
      citation: body.citation,
      title: body.title,
      category: body.category,
      recipient_type: body.recipient_type,
      clock_anchor: body.clock_anchor,
      deadline_hours: body.deadline_hours ?? null,
      is_undue_delay: body.is_undue_delay,
      harm_threshold: body.harm_threshold,
      resident_threshold: body.resident_threshold,
      trigger_data_categories: body.trigger_data_categories,
      content_requirements: body.content_requirements ?? null,
      delivery_method: body.delivery_method ?? null,
      effective_from: toDate(body.effective_from),
      effective_to: toDate(body.effective_to),
    })
    .returning()
  return c.json(r, 201)
})

// PUT /:id — auth: update a rule
router.put('/:id', authMiddleware, zValidator('json', ruleSchema.partial()), async (c) => {
  getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(rules).where(eq(rules.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')

  if (body.jurisdiction_id) {
    const [j] = await db.select().from(jurisdictions).where(eq(jurisdictions.id, body.jurisdiction_id))
    if (!j) return c.json({ error: 'Unknown jurisdiction' }, 400)
  }

  const set: Record<string, unknown> = {}
  if (body.jurisdiction_id !== undefined) set.jurisdiction_id = body.jurisdiction_id
  if (body.citation !== undefined) set.citation = body.citation
  if (body.title !== undefined) set.title = body.title
  if (body.category !== undefined) set.category = body.category
  if (body.recipient_type !== undefined) set.recipient_type = body.recipient_type
  if (body.clock_anchor !== undefined) set.clock_anchor = body.clock_anchor
  if (body.deadline_hours !== undefined) set.deadline_hours = body.deadline_hours
  if (body.is_undue_delay !== undefined) set.is_undue_delay = body.is_undue_delay
  if (body.harm_threshold !== undefined) set.harm_threshold = body.harm_threshold
  if (body.resident_threshold !== undefined) set.resident_threshold = body.resident_threshold
  if (body.trigger_data_categories !== undefined) set.trigger_data_categories = body.trigger_data_categories
  if (body.content_requirements !== undefined) set.content_requirements = body.content_requirements
  if (body.delivery_method !== undefined) set.delivery_method = body.delivery_method
  if (body.effective_from !== undefined) set.effective_from = toDate(body.effective_from)
  if (body.effective_to !== undefined) set.effective_to = toDate(body.effective_to)

  if (Object.keys(set).length === 0) return c.json(existing)

  const [updated] = await db.update(rules).set(set).where(eq(rules.id, id)).returning()
  return c.json(updated)
})

// DELETE /:id — auth: delete a rule
router.delete('/:id', authMiddleware, async (c) => {
  getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(rules).where(eq(rules.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.delete(rules).where(eq(rules.id, id))
  return c.json({ success: true })
})

export default router
