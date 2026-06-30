import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { attachments } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const entityTypeEnum = z.enum(['incident', 'obligation', 'artifact'])

const createSchema = z.object({
  entity_type: entityTypeEnum,
  entity_id: z.string().min(1),
  name: z.string().min(1),
  content_type: z.string().optional(),
  uri: z.string().min(1),
})

// GET / — auth — list attachments for an entity (newest first)
router.get('/', authMiddleware, async (c) => {
  const entityType = c.req.query('entityType')
  const entityId = c.req.query('entityId')
  if (!entityType || !entityId) {
    return c.json({ error: 'entityType and entityId are required' }, 400)
  }
  const rows = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.entity_type, entityType), eq(attachments.entity_id, entityId)))
    .orderBy(desc(attachments.created_at))
  return c.json(rows)
})

// POST / — auth — add attachment metadata
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [attachment] = await db
    .insert(attachments)
    .values({
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      name: body.name,
      content_type: body.content_type ?? null,
      uri: body.uri,
      uploaded_by: userId,
    })
    .returning()
  return c.json(attachment, 201)
})

// DELETE /:id — auth — delete own attachment
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(attachments).where(eq(attachments.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.uploaded_by !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(attachments).where(eq(attachments.id, id))
  return c.json({ success: true })
})

export default router
