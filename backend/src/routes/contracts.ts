import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  contracts,
  contract_obligations,
  obligations,
  incidents,
  incident_anchors,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const contractSchema = z.object({
  customer_name: z.string().min(1),
  dpa_reference: z.string().optional(),
  notify_within_hours: z.number().int().positive().optional().default(48),
  clock_anchor: z
    .enum(['discovery', 'confirmation', 'containment', 'belief_of_harm'])
    .optional()
    .default('confirmation'),
  contact_email: z.string().email().optional(),
  notes: z.string().optional(),
})

const attachSchema = z.object({
  incident_id: z.string().min(1),
  contract_id: z.string().min(1),
})

// Resolve the contractual deadline for an incident: anchor matching the
// contract's clock_anchor (falling back to the earliest anchor) + notify hours.
async function computeContractDeadline(
  incidentId: string,
  clockAnchor: string,
  notifyWithinHours: number,
): Promise<Date | null> {
  const anchors = await db
    .select()
    .from(incident_anchors)
    .where(eq(incident_anchors.incident_id, incidentId))
  if (anchors.length === 0) return null
  const match = anchors.find((a) => a.anchor_type === clockAnchor)
  const base = match ?? anchors.slice().sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime())[0]
  return new Date(base.occurred_at.getTime() + notifyWithinHours * 3_600_000)
}

// ── Contract-obligation routes (literal — must precede /:id) ───────────────────

// GET /obligations — list contract obligations for an incident
router.get('/obligations', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const incidentId = c.req.query('incidentId')
  if (!incidentId) return c.json({ error: 'incidentId is required' }, 400)
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId))
  if (!incident) return c.json({ error: 'Not found' }, 404)
  if (incident.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const rows = await db
    .select()
    .from(contract_obligations)
    .where(eq(contract_obligations.incident_id, incidentId))
    .orderBy(desc(contract_obligations.created_at))
  return c.json(rows)
})

// POST /obligations — attach a contract to an incident, computing the deadline
router.post('/obligations', authMiddleware, zValidator('json', attachSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [incident] = await db.select().from(incidents).where(eq(incidents.id, body.incident_id))
  if (!incident) return c.json({ error: 'Incident not found' }, 404)
  if (incident.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [contract] = await db.select().from(contracts).where(eq(contracts.id, body.contract_id))
  if (!contract) return c.json({ error: 'Contract not found' }, 404)
  if (contract.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // Reject duplicate attachment (UNIQUE(incident_id, contract_id)).
  const [dup] = await db
    .select()
    .from(contract_obligations)
    .where(
      and(
        eq(contract_obligations.incident_id, body.incident_id),
        eq(contract_obligations.contract_id, body.contract_id),
      ),
    )
  if (dup) return c.json({ error: 'Contract already attached to this incident' }, 409)

  const deadlineAt = await computeContractDeadline(
    body.incident_id,
    contract.clock_anchor,
    contract.notify_within_hours,
  )

  // Mirror the contractual obligation into the main obligations table so it
  // shows up alongside statutory obligations in the matrix / war room.
  const [obligation] = await db
    .insert(obligations)
    .values({
      incident_id: body.incident_id,
      jurisdiction_code: null,
      recipient: contract.customer_name,
      recipient_type: 'controller',
      deadline_at: deadlineAt,
      clock_anchor: contract.clock_anchor,
      is_undue_delay: false,
      status: 'open',
      source: 'contractual',
      why_triggered: `Contractual DPA notification (${contract.dpa_reference ?? contract.customer_name}): notify within ${contract.notify_within_hours}h of ${contract.clock_anchor}.`,
    })
    .returning()

  const [created] = await db
    .insert(contract_obligations)
    .values({
      incident_id: body.incident_id,
      contract_id: body.contract_id,
      obligation_id: obligation.id,
      deadline_at: deadlineAt,
      status: 'open',
    })
    .returning()

  return c.json(created, 201)
})

// ── Contract CRUD ──────────────────────────────────────────────────────────────

// GET / — list the caller's contracts
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const rows = await db
    .select()
    .from(contracts)
    .where(eq(contracts.user_id, userId))
    .orderBy(desc(contracts.created_at))
  return c.json(rows)
})

// POST / — create a contract
router.post('/', authMiddleware, zValidator('json', contractSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(contracts)
    .values({
      user_id: userId,
      customer_name: body.customer_name,
      dpa_reference: body.dpa_reference ?? null,
      notify_within_hours: body.notify_within_hours,
      clock_anchor: body.clock_anchor,
      contact_email: body.contact_email ?? null,
      notes: body.notes ?? null,
    })
    .returning()
  return c.json(created, 201)
})

// GET /:id — contract detail
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, id))
  if (!contract) return c.json({ error: 'Not found' }, 404)
  if (contract.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  return c.json(contract)
})

// PUT /:id — update a contract
router.put('/:id', authMiddleware, zValidator('json', contractSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(contracts).where(eq(contracts.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(contracts)
    .set({ ...body, updated_at: new Date() })
    .where(eq(contracts.id, id))
    .returning()
  return c.json(updated)
})

// DELETE /:id — delete a contract (and its contract-obligation links)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(contracts).where(eq(contracts.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(contract_obligations).where(eq(contract_obligations.contract_id, id))
  await db.delete(contracts).where(eq(contracts.id, id))
  return c.json({ success: true })
})

export default router
