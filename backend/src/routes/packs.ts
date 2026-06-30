import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { db } from '../db/index.js'
import {
  defensibility_packs,
  incidents,
  incident_anchors,
  incident_facts,
  obligations,
  affected_populations,
  contract_obligations,
  notice_artifacts,
  artifact_versions,
  signoffs,
  deliveries,
  tasks,
  activity_log,
} from '../db/schema.js'
import { eq, desc, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'
import { describeExpression, nextFirings } from '../lib/cron.js'

const router = new Hono()

// Build a stable, deterministic serialization of a snapshot object so the
// integrity hash does not depend on key ordering. Recursively sorts object
// keys; arrays keep their order (they are already deterministically ordered by
// the queries below).
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

// Assemble the full, immutable evidence snapshot for an incident.
async function buildSnapshot(incidentId: string) {
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId))

  const anchors = await db
    .select()
    .from(incident_anchors)
    .where(eq(incident_anchors.incident_id, incidentId))
    .orderBy(incident_anchors.occurred_at)

  const [facts] = await db
    .select()
    .from(incident_facts)
    .where(eq(incident_facts.incident_id, incidentId))

  const obligationRows = await db
    .select()
    .from(obligations)
    .where(eq(obligations.incident_id, incidentId))
    .orderBy(obligations.deadline_at)

  const populations = await db
    .select()
    .from(affected_populations)
    .where(eq(affected_populations.incident_id, incidentId))
    .orderBy(affected_populations.jurisdiction_code)

  const contractObligations = await db
    .select()
    .from(contract_obligations)
    .where(eq(contract_obligations.incident_id, incidentId))

  const artifacts = await db
    .select()
    .from(notice_artifacts)
    .where(eq(notice_artifacts.incident_id, incidentId))
    .orderBy(notice_artifacts.created_at)

  const artifactIds = artifacts.map((a) => a.id)
  const versions = artifactIds.length
    ? await db
        .select()
        .from(artifact_versions)
        .where(inArray(artifact_versions.artifact_id, artifactIds))
        .orderBy(artifact_versions.version)
    : []
  const signoffRows = artifactIds.length
    ? await db
        .select()
        .from(signoffs)
        .where(inArray(signoffs.artifact_id, artifactIds))
        .orderBy(signoffs.created_at)
    : []
  const deliveryRows = artifactIds.length
    ? await db
        .select()
        .from(deliveries)
        .where(inArray(deliveries.artifact_id, artifactIds))
        .orderBy(deliveries.delivered_at)
    : []

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.incident_id, incidentId))
    .orderBy(tasks.created_at)

  const activity = await db
    .select()
    .from(activity_log)
    .where(eq(activity_log.incident_id, incidentId))
    .orderBy(activity_log.created_at)

  // Obligation timeline: a one-off "schedule" per obligation deadline, described
  // and projected via the cron engine so the pack records exactly when each
  // statutory clock fires from generation time.
  const generatedAtIso = new Date().toISOString()
  const timeline = obligationRows
    .filter((o) => o.deadline_at)
    .map((o) => {
      const deadlineIso = new Date(o.deadline_at as Date).toISOString()
      return {
        obligation_id: o.id,
        recipient: o.recipient,
        recipient_type: o.recipient_type,
        jurisdiction_code: o.jurisdiction_code,
        deadline_at: deadlineIso,
        description: describeExpression('oneoff', deadlineIso, 'UTC'),
        upcoming: nextFirings('oneoff', deadlineIso, 'UTC', generatedAtIso, 1),
        already_passed: new Date(deadlineIso).getTime() <= Date.parse(generatedAtIso),
      }
    })

  return {
    generated_at: generatedAtIso,
    incident,
    anchors,
    facts: facts ?? null,
    obligations: obligationRows,
    timeline,
    populations,
    contract_obligations: contractObligations,
    artifacts,
    artifact_versions: versions,
    signoffs: signoffRows,
    deliveries: deliveryRows,
    tasks: taskRows,
    activity,
    counts: {
      obligations: obligationRows.length,
      artifacts: artifacts.length,
      deliveries: deliveryRows.length,
      tasks: taskRows.length,
      populations: populations.length,
    },
  }
}

// GET / — auth — list defensibility packs for an incident the caller owns.
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const incidentId = c.req.query('incidentId')
  if (!incidentId) return c.json({ error: 'incidentId is required' }, 400)

  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId))
  if (!incident) return c.json({ error: 'Not found' }, 404)
  if (incident.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const rows = await db
    .select()
    .from(defensibility_packs)
    .where(eq(defensibility_packs.incident_id, incidentId))
    .orderBy(desc(defensibility_packs.created_at))
  return c.json(rows)
})

// GET /:id — auth — pack detail with full snapshot (ownership enforced).
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const [pack] = await db
    .select()
    .from(defensibility_packs)
    .where(eq(defensibility_packs.id, c.req.param('id')))
  if (!pack) return c.json({ error: 'Not found' }, 404)

  const [incident] = await db.select().from(incidents).where(eq(incidents.id, pack.incident_id))
  if (!incident || incident.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  return c.json(pack)
})

const generateSchema = z.object({
  incidentId: z.string().min(1),
})

// POST / — auth — generate an immutable snapshot + integrity hash for an incident.
router.post('/', authMiddleware, zValidator('json', generateSchema), async (c) => {
  const userId = getUserId(c)
  const { incidentId } = c.req.valid('json')

  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId))
  if (!incident) return c.json({ error: 'Not found' }, 404)
  if (incident.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const snapshot = await buildSnapshot(incidentId)
  const integrityHash = createHash('sha256').update(stableStringify(snapshot)).digest('hex')

  const [pack] = await db
    .insert(defensibility_packs)
    .values({
      incident_id: incidentId,
      integrity_hash: integrityHash,
      snapshot: snapshot as unknown as Record<string, unknown>,
      generated_by: userId,
    })
    .returning()

  // Record the generation in the append-only audit trail.
  await db.insert(activity_log).values({
    incident_id: incidentId,
    actor_id: userId,
    action: 'pack.generated',
    entity_type: 'defensibility_pack',
    entity_id: pack.id,
    after: { integrity_hash: integrityHash },
  })

  return c.json(pack, 201)
})

export default router
