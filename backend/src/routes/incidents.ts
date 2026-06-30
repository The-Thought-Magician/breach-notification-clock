import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  incidents,
  incident_anchors,
  incident_facts,
  obligations,
  affected_populations,
  jurisdictions,
  rules,
  regulators,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ── validation ────────────────────────────────────────────────────────────────

const incidentSchema = z.object({
  title: z.string().min(1),
  reference_number: z.string().optional().nullable(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  status: z.enum(['triage', 'investigating', 'notifying', 'monitoring', 'closed']).optional().default('triage'),
  is_drill: z.boolean().optional().default(false),
  is_confidential: z.boolean().optional().default(false),
  owner_id: z.string().optional().nullable(),
  watchers: z.array(z.string()).optional().default([]),
  summary: z.string().optional().nullable(),
})

const incidentUpdateSchema = incidentSchema.partial()

const anchorSchema = z.object({
  anchor_type: z.enum(['discovery', 'confirmation', 'containment', 'belief_of_harm', 'custom']),
  label: z.string().min(1),
  occurred_at: z.string().min(1),
})

const anchorUpdateSchema = anchorSchema.partial()

const factsSchema = z.object({
  data_categories: z.array(z.string()).optional().default([]),
  special_category: z.boolean().optional().default(false),
  encrypted: z.boolean().optional().default(false),
  attacker_access_confirmed: z.boolean().optional().default(false),
  exfiltration_confirmed: z.boolean().optional().default(false),
  risk_of_harm: z.enum(['low', 'medium', 'high', 'unknown']).optional().default('unknown'),
  notes: z.string().optional().nullable(),
})

// ── ownership helper ────────────────────────────────────────────────────────────

async function loadOwnedIncident(id: string, userId: string) {
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, id))
  if (!incident) return { incident: null, forbidden: false }
  if (incident.user_id !== userId) return { incident, forbidden: true }
  return { incident, forbidden: false }
}

// ── obligation engine ───────────────────────────────────────────────────────────
// Determines, from an incident's anchors + facts + affected populations, which
// statutory rules are triggered and computes a concrete deadline per rule.

const HARM_ORDER: Record<string, number> = { low: 1, medium: 2, high: 3, any: 0, unknown: 0 }

function meetsHarmThreshold(threshold: string, riskOfHarm: string): boolean {
  if (threshold === 'any') return true
  const need = HARM_ORDER[threshold] ?? 0
  const have = HARM_ORDER[riskOfHarm] ?? 0
  return have >= need
}

function dataCategoriesMatch(trigger: string[] | null | undefined, present: string[]): boolean {
  if (!trigger || trigger.length === 0) return true
  if (present.length === 0) return false
  return trigger.some((t) => present.includes(t))
}

interface ComputedObligation {
  rule_id: string | null
  regulator_id: string | null
  jurisdiction_code: string | null
  recipient: string
  recipient_type: string
  deadline_at: Date | null
  clock_anchor: string | null
  is_undue_delay: boolean
  status: string
  source: string
  why_triggered: string
}

async function computeObligations(incidentId: string): Promise<ComputedObligation[]> {
  const anchors = await db
    .select()
    .from(incident_anchors)
    .where(eq(incident_anchors.incident_id, incidentId))
  const [facts] = await db
    .select()
    .from(incident_facts)
    .where(eq(incident_facts.incident_id, incidentId))
  const populations = await db
    .select()
    .from(affected_populations)
    .where(eq(affected_populations.incident_id, incidentId))

  const presentCategories: string[] = facts?.data_categories ?? []
  const riskOfHarm = facts?.risk_of_harm ?? 'unknown'
  const encrypted = facts?.encrypted ?? false

  // anchor instant lookup by type (latest occurrence wins for each type)
  const anchorTime = new Map<string, Date>()
  for (const a of anchors) {
    const t = a.occurred_at instanceof Date ? a.occurred_at : new Date(a.occurred_at as unknown as string)
    const prev = anchorTime.get(a.anchor_type)
    if (!prev || t.getTime() > prev.getTime()) anchorTime.set(a.anchor_type, t)
  }

  // residents per jurisdiction from affected_populations
  const residentsByJurisdiction = new Map<string, number>()
  for (const p of populations) {
    residentsByJurisdiction.set(
      p.jurisdiction_code,
      (residentsByJurisdiction.get(p.jurisdiction_code) ?? 0) + (p.count ?? 0),
    )
  }

  const allJurisdictions = await db.select().from(jurisdictions)
  const jurisdictionById = new Map(allJurisdictions.map((j) => [j.id, j]))
  const allRules = await db.select().from(rules)
  const allRegulators = await db.select().from(regulators)

  // first regulator per jurisdiction for regulator-type obligations
  const regulatorByJurisdiction = new Map<string, (typeof allRegulators)[number]>()
  for (const r of allRegulators) {
    if (r.jurisdiction_id && !regulatorByJurisdiction.has(r.jurisdiction_id)) {
      regulatorByJurisdiction.set(r.jurisdiction_id, r)
    }
  }

  const now = Date.now()
  const computed: ComputedObligation[] = []

  for (const rule of allRules) {
    const jur = jurisdictionById.get(rule.jurisdiction_id)
    const jurisdictionCode = jur?.code ?? null

    // effective window
    if (rule.effective_from) {
      const ef = rule.effective_from instanceof Date ? rule.effective_from : new Date(rule.effective_from as unknown as string)
      if (now < ef.getTime()) continue
    }
    if (rule.effective_to) {
      const et = rule.effective_to instanceof Date ? rule.effective_to : new Date(rule.effective_to as unknown as string)
      if (now > et.getTime()) continue
    }

    // harm threshold gate
    if (!meetsHarmThreshold(rule.harm_threshold ?? 'any', riskOfHarm)) continue

    // data-category trigger gate
    if (!dataCategoriesMatch(rule.trigger_data_categories ?? [], presentCategories)) continue

    // resident threshold gate (per the rule's jurisdiction)
    const residents = jurisdictionCode ? residentsByJurisdiction.get(jurisdictionCode) ?? 0 : 0
    if ((rule.resident_threshold ?? 0) > 0 && residents < (rule.resident_threshold ?? 0)) continue

    // encryption safe harbor: encrypted data with no confirmed access/exfiltration
    // suppresses individual-notification obligations.
    if (encrypted && rule.category === 'individual' && !(facts?.attacker_access_confirmed || facts?.exfiltration_confirmed)) {
      continue
    }

    // resolve the clock anchor; fall back to discovery then any available anchor
    const anchorInstant =
      anchorTime.get(rule.clock_anchor) ??
      anchorTime.get('discovery') ??
      [...anchorTime.values()].sort((a, b) => a.getTime() - b.getTime())[0] ??
      null

    let deadlineAt: Date | null = null
    if (!rule.is_undue_delay && rule.deadline_hours != null && anchorInstant) {
      deadlineAt = new Date(anchorInstant.getTime() + rule.deadline_hours * 3_600_000)
    }

    const reasons: string[] = []
    reasons.push(`Rule ${rule.citation} (${rule.category})`)
    if (jurisdictionCode) reasons.push(`jurisdiction ${jurisdictionCode}`)
    if ((rule.trigger_data_categories ?? []).length > 0) {
      reasons.push(`data categories ${(rule.trigger_data_categories ?? []).join(', ')} present`)
    }
    if ((rule.resident_threshold ?? 0) > 0) reasons.push(`${residents} affected residents >= ${rule.resident_threshold}`)
    if (rule.harm_threshold && rule.harm_threshold !== 'any') reasons.push(`risk of harm ${riskOfHarm} meets ${rule.harm_threshold}`)
    if (rule.is_undue_delay) reasons.push('undue-delay clock (no fixed hours)')
    else if (rule.deadline_hours != null) reasons.push(`${rule.deadline_hours}h from ${rule.clock_anchor}`)

    const regulator = rule.category === 'regulator' && jur ? regulatorByJurisdiction.get(jur.id) : undefined

    computed.push({
      rule_id: rule.id,
      regulator_id: regulator?.id ?? null,
      jurisdiction_code: jurisdictionCode,
      recipient: regulator?.name ?? rule.title,
      recipient_type: rule.recipient_type,
      deadline_at: deadlineAt,
      clock_anchor: rule.clock_anchor,
      is_undue_delay: rule.is_undue_delay ?? false,
      status: 'open',
      source: 'statutory',
      why_triggered: reasons.join('; '),
    })
  }

  return computed
}

// ── routes ──────────────────────────────────────────────────────────────────────

// List caller's incidents
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const rows = await db
    .select()
    .from(incidents)
    .where(eq(incidents.user_id, userId))
    .orderBy(desc(incidents.created_at))
  return c.json(rows)
})

// Create incident
router.post('/', authMiddleware, zValidator('json', incidentSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(incidents)
    .values({
      user_id: userId,
      title: body.title,
      reference_number: body.reference_number ?? null,
      severity: body.severity ?? 'medium',
      status: body.status ?? 'triage',
      is_drill: body.is_drill ?? false,
      is_confidential: body.is_confidential ?? false,
      owner_id: body.owner_id ?? userId,
      watchers: body.watchers ?? [],
      summary: body.summary ?? null,
    })
    .returning()
  return c.json(created, 201)
})

// Incident detail w/ anchors + facts
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const { incident, forbidden } = await loadOwnedIncident(c.req.param('id'), userId)
  if (!incident) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  const anchors = await db
    .select()
    .from(incident_anchors)
    .where(eq(incident_anchors.incident_id, incident.id))
    .orderBy(incident_anchors.occurred_at)
  const [facts] = await db
    .select()
    .from(incident_facts)
    .where(eq(incident_facts.incident_id, incident.id))
  return c.json({ incident, anchors, facts: facts ?? null })
})

// Update incident
router.put('/:id', authMiddleware, zValidator('json', incidentUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const { incident, forbidden } = await loadOwnedIncident(id, userId)
  if (!incident) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(incidents)
    .set({ ...body, updated_at: new Date() })
    .where(eq(incidents.id, id))
    .returning()
  return c.json(updated)
})

// Delete incident (and dependent rows)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const { incident, forbidden } = await loadOwnedIncident(id, userId)
  if (!incident) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(obligations).where(eq(obligations.incident_id, id))
  await db.delete(incident_anchors).where(eq(incident_anchors.incident_id, id))
  await db.delete(incident_facts).where(eq(incident_facts.incident_id, id))
  await db.delete(affected_populations).where(eq(affected_populations.incident_id, id))
  await db.delete(incidents).where(eq(incidents.id, id))
  return c.json({ success: true })
})

// ── anchors sub-resource ──────────────────────────────────────────────────────

router.get('/:id/anchors', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const { incident, forbidden } = await loadOwnedIncident(c.req.param('id'), userId)
  if (!incident) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  const rows = await db
    .select()
    .from(incident_anchors)
    .where(eq(incident_anchors.incident_id, incident.id))
    .orderBy(incident_anchors.occurred_at)
  return c.json(rows)
})

router.post('/:id/anchors', authMiddleware, zValidator('json', anchorSchema), async (c) => {
  const userId = getUserId(c)
  const { incident, forbidden } = await loadOwnedIncident(c.req.param('id'), userId)
  if (!incident) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(incident_anchors)
    .values({
      incident_id: incident.id,
      anchor_type: body.anchor_type,
      label: body.label,
      occurred_at: new Date(body.occurred_at),
    })
    .returning()
  return c.json(created, 201)
})

router.put('/:id/anchors/:anchorId', authMiddleware, zValidator('json', anchorUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const { incident, forbidden } = await loadOwnedIncident(c.req.param('id'), userId)
  if (!incident) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  const anchorId = c.req.param('anchorId')
  const [existing] = await db
    .select()
    .from(incident_anchors)
    .where(and(eq(incident_anchors.id, anchorId), eq(incident_anchors.incident_id, incident.id)))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')
  const patch: Record<string, unknown> = {}
  if (body.anchor_type !== undefined) patch.anchor_type = body.anchor_type
  if (body.label !== undefined) patch.label = body.label
  if (body.occurred_at !== undefined) patch.occurred_at = new Date(body.occurred_at)
  const [updated] = await db
    .update(incident_anchors)
    .set(patch)
    .where(eq(incident_anchors.id, anchorId))
    .returning()
  return c.json(updated)
})

router.delete('/:id/anchors/:anchorId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const { incident, forbidden } = await loadOwnedIncident(c.req.param('id'), userId)
  if (!incident) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  const anchorId = c.req.param('anchorId')
  const [existing] = await db
    .select()
    .from(incident_anchors)
    .where(and(eq(incident_anchors.id, anchorId), eq(incident_anchors.incident_id, incident.id)))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.delete(incident_anchors).where(eq(incident_anchors.id, anchorId))
  return c.json({ success: true })
})

// ── facts upsert ──────────────────────────────────────────────────────────────

router.put('/:id/facts', authMiddleware, zValidator('json', factsSchema), async (c) => {
  const userId = getUserId(c)
  const { incident, forbidden } = await loadOwnedIncident(c.req.param('id'), userId)
  if (!incident) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const values = {
    incident_id: incident.id,
    data_categories: body.data_categories ?? [],
    special_category: body.special_category ?? false,
    encrypted: body.encrypted ?? false,
    attacker_access_confirmed: body.attacker_access_confirmed ?? false,
    exfiltration_confirmed: body.exfiltration_confirmed ?? false,
    risk_of_harm: body.risk_of_harm ?? 'unknown',
    notes: body.notes ?? null,
  }
  const [upserted] = await db
    .insert(incident_facts)
    .values(values)
    .onConflictDoUpdate({
      target: incident_facts.incident_id,
      set: {
        data_categories: values.data_categories,
        special_category: values.special_category,
        encrypted: values.encrypted,
        attacker_access_confirmed: values.attacker_access_confirmed,
        exfiltration_confirmed: values.exfiltration_confirmed,
        risk_of_harm: values.risk_of_harm,
        notes: values.notes,
        updated_at: new Date(),
      },
    })
    .returning()
  return c.json(upserted)
})

// ── recompute: run obligation engine, replace statutory obligations ──────────────

router.post('/:id/recompute', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const { incident, forbidden } = await loadOwnedIncident(c.req.param('id'), userId)
  if (!incident) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)

  const computed = await computeObligations(incident.id)

  // Replace prior statutory obligations only; preserve contractual ones.
  await db
    .delete(obligations)
    .where(and(eq(obligations.incident_id, incident.id), eq(obligations.source, 'statutory')))

  const inserted = []
  for (const o of computed) {
    const [row] = await db
      .insert(obligations)
      .values({
        incident_id: incident.id,
        rule_id: o.rule_id,
        regulator_id: o.regulator_id,
        jurisdiction_code: o.jurisdiction_code,
        recipient: o.recipient,
        recipient_type: o.recipient_type,
        deadline_at: o.deadline_at,
        clock_anchor: o.clock_anchor,
        is_undue_delay: o.is_undue_delay,
        status: o.status,
        owner_id: incident.owner_id ?? userId,
        source: o.source,
        why_triggered: o.why_triggered,
      })
      .returning()
    inserted.push(row)
  }

  return c.json({ created: inserted.length, obligations: inserted })
})

export default router
