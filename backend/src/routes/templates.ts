import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { templates } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const templateSchema = z.object({
  name: z.string().min(1),
  jurisdiction_code: z.string().nullable().optional(),
  recipient_type: z.string().nullable().optional(),
  body: z.string().optional().default(''),
  merge_fields: z.array(z.string()).optional().default([]),
})

// All template routes are scoped to the caller.

// Auth: list caller's templates.
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const rows = await db
    .select()
    .from(templates)
    .where(eq(templates.user_id, userId))
    .orderBy(desc(templates.created_at))
  return c.json(rows)
})

// Auth: template detail (owner only).
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [t] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.user_id, userId)))
  if (!t) return c.json({ error: 'Not found' }, 404)
  return c.json(t)
})

// Auth: create a template owned by caller.
router.post('/', authMiddleware, zValidator('json', templateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(templates)
    .values({
      user_id: userId,
      name: body.name,
      jurisdiction_code: body.jurisdiction_code ?? null,
      recipient_type: body.recipient_type ?? null,
      body: body.body ?? '',
      merge_fields: body.merge_fields ?? [],
    })
    .returning()
  return c.json(created, 201)
})

// Auth: update a template (owner only).
router.put('/:id', authMiddleware, zValidator('json', templateSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.user_id, userId)))
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const body = c.req.valid('json')
  const [updated] = await db
    .update(templates)
    .set({ ...body, updated_at: new Date() })
    .where(eq(templates.id, id))
    .returning()
  return c.json(updated)
})

// Auth: delete a template (owner only).
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.user_id, userId)))
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await db.delete(templates).where(eq(templates.id, id))
  return c.json({ success: true })
})

export default router
