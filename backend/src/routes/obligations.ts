import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { obligations, incidents, notice_artifacts } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const updateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'sent', 'delivered', 'na']).optional(),
  owner_id: z.string().nullable().optional(),
})

// Confirm the obligation belongs to an incident owned by the caller.
async function loadOwnedObligation(id: string, userId: string) {
  const [obligation] = await db.select().from(obligations).where(eq(obligations.id, id))
  if (!obligation) return { obligation: null, forbidden: false }
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, obligation.incident_id))
  if (!incident || incident.user_id !== userId) return { obligation, forbidden: true }
  return { obligation, forbidden: false }
}

// List obligations: filter by incident/status/jurisdiction, sorted by deadline.
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const incidentId = c.req.query('incidentId')
  const status = c.req.query('status')
  const jurisdiction = c.req.query('jurisdiction')

  // restrict to incidents the caller owns
  const ownedIncidents = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(eq(incidents.user_id, userId))
  const ownedIds = new Set(ownedIncidents.map((i) => i.id))
  if (ownedIds.size === 0) return c.json([])

  const conditions = []
  if (incidentId) {
    if (!ownedIds.has(incidentId)) return c.json([])
    conditions.push(eq(obligations.incident_id, incidentId))
  }
  if (status) conditions.push(eq(obligations.status, status))
  if (jurisdiction) conditions.push(eq(obligations.jurisdiction_code, jurisdiction))

  const rows = await db
    .select()
    .from(obligations)
    .where(conditions.length ? and(...conditions) : undefined)

  const scoped = incidentId ? rows : rows.filter((r) => ownedIds.has(r.incident_id))

  // Sort by deadline ascending; undue-delay / null deadlines sort last.
  scoped.sort((a, b) => {
    const ta = a.deadline_at ? new Date(a.deadline_at as unknown as string).getTime() : Number.POSITIVE_INFINITY
    const tb = b.deadline_at ? new Date(b.deadline_at as unknown as string).getTime() : Number.POSITIVE_INFINITY
    return ta - tb
  })

  return c.json(scoped)
})

// Obligation detail w/ its artifacts.
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const { obligation, forbidden } = await loadOwnedObligation(c.req.param('id'), userId)
  if (!obligation) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  const artifacts = await db
    .select()
    .from(notice_artifacts)
    .where(eq(notice_artifacts.obligation_id, obligation.id))
    .orderBy(desc(notice_artifacts.created_at))
  return c.json({ obligation, artifacts })
})

// Update status / owner.
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const { obligation, forbidden } = await loadOwnedObligation(id, userId)
  if (!obligation) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const patch: Record<string, unknown> = { updated_at: new Date() }
  if (body.status !== undefined) patch.status = body.status
  if (body.owner_id !== undefined) patch.owner_id = body.owner_id
  const [updated] = await db.update(obligations).set(patch).where(eq(obligations.id, id)).returning()
  return c.json(updated)
})

export default router
