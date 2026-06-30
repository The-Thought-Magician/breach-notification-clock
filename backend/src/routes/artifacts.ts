import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  notice_artifacts,
  artifact_versions,
  signoffs,
  deliveries,
  obligations,
  incidents,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const createSchema = z.object({
  obligation_id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional().default(''),
  status: z
    .enum(['not_started', 'drafting', 'in_review', 'approved', 'sent', 'delivered', 'failed'])
    .optional()
    .default('not_started'),
  recipient_detail: z.string().optional().nullable(),
  delivery_channel: z.string().optional().nullable(),
})

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  status: z
    .enum(['not_started', 'drafting', 'in_review', 'approved', 'sent', 'delivered', 'failed'])
    .optional(),
  recipient_detail: z.string().nullable().optional(),
  delivery_channel: z.string().nullable().optional(),
})

// Resolve the incident that owns an artifact and verify caller ownership.
async function loadOwnedArtifact(id: string, userId: string) {
  const [artifact] = await db.select().from(notice_artifacts).where(eq(notice_artifacts.id, id))
  if (!artifact) return { artifact: null, forbidden: false }
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, artifact.incident_id))
  if (!incident || incident.user_id !== userId) return { artifact, forbidden: true }
  return { artifact, forbidden: false }
}

// List artifacts (?obligationId= or ?incidentId=), scoped to caller's incidents.
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const obligationId = c.req.query('obligationId')
  const incidentId = c.req.query('incidentId')

  const ownedIncidents = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(eq(incidents.user_id, userId))
  const ownedIds = new Set(ownedIncidents.map((i) => i.id))
  if (ownedIds.size === 0) return c.json([])

  const conditions = []
  if (obligationId) conditions.push(eq(notice_artifacts.obligation_id, obligationId))
  if (incidentId) {
    if (!ownedIds.has(incidentId)) return c.json([])
    conditions.push(eq(notice_artifacts.incident_id, incidentId))
  }

  const rows = await db
    .select()
    .from(notice_artifacts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(notice_artifacts.created_at))

  const scoped = rows.filter((r) => ownedIds.has(r.incident_id))
  return c.json(scoped)
})

// Artifact detail w/ versions + signoffs + latest delivery.
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const { artifact, forbidden } = await loadOwnedArtifact(c.req.param('id'), userId)
  if (!artifact) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  const versions = await db
    .select()
    .from(artifact_versions)
    .where(eq(artifact_versions.artifact_id, artifact.id))
    .orderBy(desc(artifact_versions.version))
  const signoffRows = await db
    .select()
    .from(signoffs)
    .where(eq(signoffs.artifact_id, artifact.id))
    .orderBy(desc(signoffs.created_at))
  const [delivery] = await db
    .select()
    .from(deliveries)
    .where(eq(deliveries.artifact_id, artifact.id))
    .orderBy(desc(deliveries.delivered_at))
  return c.json({ artifact, versions, signoffs: signoffRows, delivery: delivery ?? null })
})

// Create artifact for an obligation (caller must own the obligation's incident).
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [obligation] = await db.select().from(obligations).where(eq(obligations.id, body.obligation_id))
  if (!obligation) return c.json({ error: 'Obligation not found' }, 404)
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, obligation.incident_id))
  if (!incident || incident.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [created] = await db
    .insert(notice_artifacts)
    .values({
      obligation_id: obligation.id,
      incident_id: obligation.incident_id,
      title: body.title,
      body: body.body ?? '',
      status: body.status ?? 'not_started',
      recipient_detail: body.recipient_detail ?? null,
      delivery_channel: body.delivery_channel ?? null,
      created_by: userId,
    })
    .returning()

  // Seed an initial version snapshot when the body has content.
  if (created.body && created.body.length > 0) {
    await db.insert(artifact_versions).values({
      artifact_id: created.id,
      version: 1,
      body: created.body,
      created_by: userId,
    })
  }

  return c.json(created, 201)
})

// Update artifact; snapshot a new version whenever the body changes.
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const { artifact, forbidden } = await loadOwnedArtifact(id, userId)
  if (!artifact) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')

  const bodyChanged = body.body !== undefined && body.body !== artifact.body

  const patch: Record<string, unknown> = { updated_at: new Date() }
  if (body.title !== undefined) patch.title = body.title
  if (body.body !== undefined) patch.body = body.body
  if (body.status !== undefined) patch.status = body.status
  if (body.recipient_detail !== undefined) patch.recipient_detail = body.recipient_detail
  if (body.delivery_channel !== undefined) patch.delivery_channel = body.delivery_channel

  const [updated] = await db
    .update(notice_artifacts)
    .set(patch)
    .where(eq(notice_artifacts.id, id))
    .returning()

  if (bodyChanged) {
    const [latest] = await db
      .select()
      .from(artifact_versions)
      .where(eq(artifact_versions.artifact_id, id))
      .orderBy(desc(artifact_versions.version))
    const nextVersion = (latest?.version ?? 0) + 1
    await db.insert(artifact_versions).values({
      artifact_id: id,
      version: nextVersion,
      body: body.body ?? '',
      created_by: userId,
    })
  }

  return c.json(updated)
})

// Delete artifact (and its dependent rows).
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const { artifact, forbidden } = await loadOwnedArtifact(id, userId)
  if (!artifact) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(artifact_versions).where(eq(artifact_versions.artifact_id, id))
  await db.delete(signoffs).where(eq(signoffs.artifact_id, id))
  await db.delete(deliveries).where(eq(deliveries.artifact_id, id))
  await db.delete(notice_artifacts).where(eq(notice_artifacts.id, id))
  return c.json({ success: true })
})

// List versions.
router.get('/:id/versions', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const { artifact, forbidden } = await loadOwnedArtifact(c.req.param('id'), userId)
  if (!artifact) return c.json({ error: 'Not found' }, 404)
  if (forbidden) return c.json({ error: 'Forbidden' }, 403)
  const versions = await db
    .select()
    .from(artifact_versions)
    .where(eq(artifact_versions.artifact_id, artifact.id))
    .orderBy(desc(artifact_versions.version))
  return c.json(versions)
})

export default router
