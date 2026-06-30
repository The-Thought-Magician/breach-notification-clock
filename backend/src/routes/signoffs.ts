import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  signoffs,
  notice_artifacts,
  artifact_versions,
  incidents,
  notifications,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Ownership: a signoff belongs to its artifact, the artifact to an incident,
// the incident to a user. Returns the incident row when the caller owns it.
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

const requestSchema = z.object({
  artifact_id: z.string().min(1),
  approver_id: z.string().min(1),
  comment: z.string().optional(),
})

const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().optional(),
  approved_version: z.number().int().optional(),
})

// GET / — list signoffs for an artifact (auth + ownership)
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const artifactId = c.req.query('artifactId')
  if (!artifactId) return c.json({ error: 'artifactId is required' }, 400)
  const { artifact, incident } = await ownedArtifact(artifactId, userId)
  if (!artifact) return c.json({ error: 'Not found' }, 404)
  if (!incident) return c.json({ error: 'Forbidden' }, 403)
  const rows = await db
    .select()
    .from(signoffs)
    .where(eq(signoffs.artifact_id, artifactId))
    .orderBy(desc(signoffs.created_at))
  return c.json(rows)
})

// POST / — request a signoff (assign an approver) and move artifact into review
router.post('/', authMiddleware, zValidator('json', requestSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const { artifact, incident } = await ownedArtifact(body.artifact_id, userId)
  if (!artifact) return c.json({ error: 'Artifact not found' }, 404)
  if (!incident) return c.json({ error: 'Forbidden' }, 403)

  const [created] = await db
    .insert(signoffs)
    .values({
      artifact_id: body.artifact_id,
      approver_id: body.approver_id,
      decision: 'pending',
      comment: body.comment ?? null,
      created_by: userId,
    })
    .returning()

  // Move artifact to in_review so the workflow state reflects the pending request.
  await db
    .update(notice_artifacts)
    .set({ status: 'in_review', updated_at: new Date() })
    .where(eq(notice_artifacts.id, body.artifact_id))

  // Notify the assigned approver.
  await db.insert(notifications).values({
    user_id: body.approver_id,
    kind: 'signoff',
    title: `Sign-off requested: ${artifact.title}`,
    body: body.comment ?? null,
    link: `/dashboard/artifacts/${artifact.id}`,
  })

  return c.json(created, 201)
})

// PUT /:id — record an approve/reject decision with a comment and approved version
router.put('/:id', authMiddleware, zValidator('json', decisionSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(signoffs).where(eq(signoffs.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const { artifact, incident } = await ownedArtifact(existing.artifact_id, userId)
  if (!artifact) return c.json({ error: 'Not found' }, 404)
  if (!incident) return c.json({ error: 'Forbidden' }, 403)

  // Resolve the version being approved: explicit, else latest version, else 1.
  let approvedVersion = body.approved_version ?? null
  if (body.decision === 'approved' && approvedVersion == null) {
    const [latest] = await db
      .select()
      .from(artifact_versions)
      .where(eq(artifact_versions.artifact_id, existing.artifact_id))
      .orderBy(desc(artifact_versions.version))
      .limit(1)
    approvedVersion = latest ? latest.version : 1
  }

  const [updated] = await db
    .update(signoffs)
    .set({
      decision: body.decision,
      comment: body.comment ?? existing.comment,
      approved_version: approvedVersion,
      decided_at: new Date(),
    })
    .where(eq(signoffs.id, id))
    .returning()

  // Reflect the decision on the artifact: approved -> approved, rejected -> drafting.
  await db
    .update(notice_artifacts)
    .set({
      status: body.decision === 'approved' ? 'approved' : 'drafting',
      updated_at: new Date(),
    })
    .where(eq(notice_artifacts.id, existing.artifact_id))

  // Notify the requester of the outcome.
  await db.insert(notifications).values({
    user_id: existing.created_by,
    kind: 'signoff',
    title: `Sign-off ${body.decision}: ${artifact.title}`,
    body: body.comment ?? null,
    link: `/dashboard/artifacts/${artifact.id}`,
  })

  return c.json(updated)
})

export default router
