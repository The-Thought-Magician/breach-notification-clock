import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { comments, notifications } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const entityTypeEnum = z.enum(['incident', 'obligation', 'artifact'])

const createSchema = z.object({
  entity_type: entityTypeEnum,
  entity_id: z.string().min(1),
  body: z.string().min(1),
})

const updateSchema = z.object({
  body: z.string().min(1),
})

// Extract @mention user tokens from a comment body. Mentions look like
// @user-id (alphanumeric, dash, underscore, dot). Returns a de-duped list.
function extractMentions(body: string): string[] {
  const matches = body.match(/@([A-Za-z0-9_.-]+)/g) ?? []
  const ids = matches.map((m) => m.slice(1))
  return [...new Set(ids)]
}

// GET / — auth — list comments for an entity (oldest first for thread order)
router.get('/', authMiddleware, async (c) => {
  const entityType = c.req.query('entityType')
  const entityId = c.req.query('entityId')
  if (!entityType || !entityId) {
    return c.json({ error: 'entityType and entityId are required' }, 400)
  }
  const rows = await db
    .select()
    .from(comments)
    .where(and(eq(comments.entity_type, entityType), eq(comments.entity_id, entityId)))
    .orderBy(comments.created_at)
  return c.json(rows)
})

// POST / — auth — add comment, creating @mention notifications
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [comment] = await db
    .insert(comments)
    .values({
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      author_id: userId,
      body: body.body,
    })
    .returning()

  // Fan out @mention notifications (skip self-mentions).
  const mentioned = extractMentions(body.body).filter((id) => id !== userId)
  if (mentioned.length > 0) {
    const link = `/dashboard/${body.entity_type}s/${body.entity_id}`
    await db.insert(notifications).values(
      mentioned.map((mentionedId) => ({
        user_id: mentionedId,
        kind: 'mention',
        title: `You were mentioned in a comment`,
        body: body.body.slice(0, 280),
        link,
        is_read: false,
      })),
    )
  }

  return c.json(comment, 201)
})

// PUT /:id — auth — edit own comment
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(comments).where(eq(comments.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.author_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const { body } = c.req.valid('json')
  const [updated] = await db
    .update(comments)
    .set({ body, updated_at: new Date() })
    .where(eq(comments.id, id))
    .returning()
  return c.json(updated)
})

// DELETE /:id — auth — delete own comment
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(comments).where(eq(comments.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.author_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(comments).where(eq(comments.id, id))
  return c.json({ success: true })
})

export default router
