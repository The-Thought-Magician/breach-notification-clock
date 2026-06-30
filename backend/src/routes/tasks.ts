import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { tasks, incidents } from '../db/schema.js'
import { eq, and, or, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const createSchema = z.object({
  incident_id: z.string().min(1).nullable().optional(),
  obligation_id: z.string().min(1).nullable().optional(),
  artifact_id: z.string().min(1).nullable().optional(),
  title: z.string().min(1),
  assignee_id: z.string().nullable().optional(),
  status: z.enum(['open', 'done']).optional().default('open'),
  due_at: z.string().datetime().nullable().optional(),
})

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  assignee_id: z.string().nullable().optional(),
  status: z.enum(['open', 'done']).optional(),
  due_at: z.string().datetime().nullable().optional(),
})

// A caller may act on a task when they own its parent incident, or they
// created the task, or they are the assignee.
async function canAccessTask(
  userId: string,
  task: typeof tasks.$inferSelect,
): Promise<boolean> {
  if (task.created_by === userId) return true
  if (task.assignee_id === userId) return true
  if (task.incident_id) {
    const [inc] = await db.select().from(incidents).where(eq(incidents.id, task.incident_id))
    if (inc && inc.user_id === userId) return true
  }
  return false
}

// Auth: list tasks for an incident the caller owns (?incidentId=).
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const incidentId = c.req.query('incidentId')
  if (!incidentId) return c.json({ error: 'incidentId is required' }, 400)

  const [inc] = await db.select().from(incidents).where(eq(incidents.id, incidentId))
  if (!inc) return c.json({ error: 'Incident not found' }, 404)
  if (inc.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.incident_id, incidentId))
    .orderBy(desc(tasks.created_at))
  return c.json(rows)
})

// Auth: caller's assigned + created tasks across all incidents.
router.get('/mine', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const rows = await db
    .select()
    .from(tasks)
    .where(or(eq(tasks.assignee_id, userId), eq(tasks.created_by, userId)))
    .orderBy(desc(tasks.created_at))
  return c.json(rows)
})

// Auth: create a task. If linked to an incident, caller must own it.
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  if (body.incident_id) {
    const [inc] = await db.select().from(incidents).where(eq(incidents.id, body.incident_id))
    if (!inc) return c.json({ error: 'Incident not found' }, 400)
    if (inc.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  }

  const [created] = await db
    .insert(tasks)
    .values({
      incident_id: body.incident_id ?? null,
      obligation_id: body.obligation_id ?? null,
      artifact_id: body.artifact_id ?? null,
      title: body.title,
      assignee_id: body.assignee_id ?? null,
      status: body.status ?? 'open',
      due_at: body.due_at ? new Date(body.due_at) : null,
      created_by: userId,
    })
    .returning()
  return c.json(created, 201)
})

// Auth: update a task (status/assignee/due/title).
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await canAccessTask(userId, existing))) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const patch: Partial<typeof tasks.$inferInsert> = { updated_at: new Date() }
  if (body.title !== undefined) patch.title = body.title
  if (body.assignee_id !== undefined) patch.assignee_id = body.assignee_id
  if (body.status !== undefined) patch.status = body.status
  if (body.due_at !== undefined) patch.due_at = body.due_at ? new Date(body.due_at) : null

  const [updated] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning()
  return c.json(updated)
})

// Auth: delete a task.
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await canAccessTask(userId, existing))) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(tasks).where(eq(tasks.id, id))
  return c.json({ success: true })
})

export default router
