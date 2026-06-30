import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { saved_views } from '../db/schema.js'
import { eq, or, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const createSchema = z.object({
  name: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  is_default: z.boolean().optional().default(false),
  is_shared: z.boolean().optional().default(false),
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  is_default: z.boolean().optional(),
  is_shared: z.boolean().optional(),
})

// If a view is being set as default, clear the default flag on the caller's
// other views so at most one default exists per user.
async function clearOtherDefaults(userId: string, exceptId?: string) {
  const rows = await db
    .select()
    .from(saved_views)
    .where(and(eq(saved_views.user_id, userId), eq(saved_views.is_default, true)))
  for (const row of rows) {
    if (exceptId && row.id === exceptId) continue
    await db.update(saved_views).set({ is_default: false }).where(eq(saved_views.id, row.id))
  }
}

// GET / — auth — caller's own views plus any view shared by another user.
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const rows = await db
    .select()
    .from(saved_views)
    .where(or(eq(saved_views.user_id, userId), eq(saved_views.is_shared, true)))
    .orderBy(desc(saved_views.is_default), desc(saved_views.created_at))
  return c.json(rows)
})

// POST / — auth — create a saved view owned by the caller.
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  if (body.is_default) await clearOtherDefaults(userId)

  const [view] = await db
    .insert(saved_views)
    .values({
      user_id: userId,
      name: body.name,
      config: body.config as Record<string, unknown>,
      is_default: body.is_default,
      is_shared: body.is_shared,
    })
    .returning()
  return c.json(view, 201)
})

// PUT /:id — auth — update a view the caller owns.
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(saved_views).where(eq(saved_views.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  if (body.is_default) await clearOtherDefaults(userId, id)

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.config !== undefined) patch.config = body.config
  if (body.is_default !== undefined) patch.is_default = body.is_default
  if (body.is_shared !== undefined) patch.is_shared = body.is_shared

  const [updated] = await db
    .update(saved_views)
    .set(patch)
    .where(eq(saved_views.id, id))
    .returning()
  return c.json(updated)
})

// DELETE /:id — auth — delete a view the caller owns.
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(saved_views).where(eq(saved_views.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(saved_views).where(eq(saved_views.id, id))
  return c.json({ success: true })
})

export default router
