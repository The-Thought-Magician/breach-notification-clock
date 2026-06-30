import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  deliveries,
  notice_artifacts,
  obligations,
  incidents,
  notifications,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

async function ownedArtifact(artifactId: string, userId: string) {
  const [artifact] = await db
    .select()
    .from(notice_artifacts)
    .where(eq(notice_artifacts.id, artifactId))
  if (!artifact) return { artifact: null, incident: null }
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, artifact.incident_id))
  if (!incident || incident.user_id !== userId) return { artifact, incident: null }
  return { artifact, incident }
}

const deliverySchema = z.object({
  artifact_id: z.string().min(1),
  obligation_id: z.string().min(1),
  method: z.enum(['portal', 'email', 'certified_mail', 'courier']),
  confirmation_ref: z.string().optional(),
  evidence_uri: z.string().optional(),
  delivered_at: z.string().optional(),
})

// GET / — list deliveries filtered by artifact or obligation (auth + ownership)
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const artifactId = c.req.query('artifactId')
  const obligationId = c.req.query('obligationId')

  if (artifactId) {
    const { artifact, incident } = await ownedArtifact(artifactId, userId)
    if (!artifact) return c.json({ error: 'Not found' }, 404)
    if (!incident) return c.json({ error: 'Forbidden' }, 403)
    const rows = await db
      .select()
      .from(deliveries)
      .where(eq(deliveries.artifact_id, artifactId))
      .orderBy(desc(deliveries.delivered_at))
    return c.json(rows)
  }

  if (obligationId) {
    const [obligation] = await db.select().from(obligations).where(eq(obligations.id, obligationId))
    if (!obligation) return c.json({ error: 'Not found' }, 404)
    const [incident] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, obligation.incident_id))
    if (!incident || incident.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
    const rows = await db
      .select()
      .from(deliveries)
      .where(eq(deliveries.obligation_id, obligationId))
      .orderBy(desc(deliveries.delivered_at))
    return c.json(rows)
  }

  return c.json({ error: 'artifactId or obligationId is required' }, 400)
})

// POST / — record proof of delivery. Computes was_late against the obligation
// deadline, and marks both the artifact and the obligation as delivered.
router.post('/', authMiddleware, zValidator('json', deliverySchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const { artifact, incident } = await ownedArtifact(body.artifact_id, userId)
  if (!artifact) return c.json({ error: 'Artifact not found' }, 404)
  if (!incident) return c.json({ error: 'Forbidden' }, 403)

  const [obligation] = await db
    .select()
    .from(obligations)
    .where(eq(obligations.id, body.obligation_id))
  if (!obligation) return c.json({ error: 'Obligation not found' }, 404)
  if (obligation.incident_id !== artifact.incident_id) {
    return c.json({ error: 'Obligation does not belong to this artifact' }, 400)
  }

  const deliveredAt = body.delivered_at ? new Date(body.delivered_at) : new Date()
  if (Number.isNaN(deliveredAt.getTime())) {
    return c.json({ error: 'delivered_at must be a valid ISO instant' }, 400)
  }

  // Late iff there is a hard deadline and delivery happened after it.
  const wasLate = obligation.deadline_at
    ? deliveredAt.getTime() > new Date(obligation.deadline_at).getTime()
    : false

  const [created] = await db
    .insert(deliveries)
    .values({
      artifact_id: body.artifact_id,
      obligation_id: body.obligation_id,
      method: body.method,
      confirmation_ref: body.confirmation_ref ?? null,
      evidence_uri: body.evidence_uri ?? null,
      delivered_at: deliveredAt,
      was_late: wasLate,
      created_by: userId,
    })
    .returning()

  // Mark the artifact and obligation as delivered.
  await db
    .update(notice_artifacts)
    .set({ status: 'delivered', updated_at: new Date() })
    .where(eq(notice_artifacts.id, body.artifact_id))

  await db
    .update(obligations)
    .set({ status: 'delivered', updated_at: new Date() })
    .where(eq(obligations.id, body.obligation_id))

  // Notify the incident owner of the recorded delivery.
  await db.insert(notifications).values({
    user_id: incident.user_id,
    kind: 'delivery',
    title: `${wasLate ? 'Late ' : ''}Delivery recorded: ${artifact.title}`,
    body: `Delivered via ${body.method} to ${obligation.recipient}.`,
    link: `/dashboard/artifacts/${artifact.id}`,
  })

  return c.json(created, 201)
})

export default router
