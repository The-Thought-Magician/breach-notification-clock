import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { regulators, jurisdictions } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const regulatorSchema = z.object({
  jurisdiction_id: z.string().min(1).nullable().optional(),
  name: z.string().min(1),
  portal_url: z.string().url().nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  submission_method: z.string().nullable().optional(),
})

// Public: list regulators, optionally filtered by jurisdiction code.
router.get('/', async (c) => {
  const jurisdiction = c.req.query('jurisdiction')

  if (jurisdiction) {
    const [j] = await db
      .select()
      .from(jurisdictions)
      .where(eq(jurisdictions.code, jurisdiction))
    if (!j) return c.json([])
    const rows = await db
      .select()
      .from(regulators)
      .where(eq(regulators.jurisdiction_id, j.id))
      .orderBy(desc(regulators.created_at))
    return c.json(rows)
  }

  const rows = await db.select().from(regulators).orderBy(desc(regulators.created_at))
  return c.json(rows)
})

// Auth: create a regulator.
router.post('/', authMiddleware, zValidator('json', regulatorSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  if (body.jurisdiction_id) {
    const [j] = await db
      .select()
      .from(jurisdictions)
      .where(eq(jurisdictions.id, body.jurisdiction_id))
    if (!j) return c.json({ error: 'Jurisdiction not found' }, 400)
  }

  const [created] = await db
    .insert(regulators)
    .values({
      jurisdiction_id: body.jurisdiction_id ?? null,
      name: body.name,
      portal_url: body.portal_url ?? null,
      contact_email: body.contact_email ?? null,
      submission_method: body.submission_method ?? null,
      created_by: userId,
    })
    .returning()
  return c.json(created, 201)
})

// Auth: update a regulator (owner only).
router.put('/:id', authMiddleware, zValidator('json', regulatorSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(regulators).where(eq(regulators.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.created_by !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')

  if (body.jurisdiction_id) {
    const [j] = await db
      .select()
      .from(jurisdictions)
      .where(eq(jurisdictions.id, body.jurisdiction_id))
    if (!j) return c.json({ error: 'Jurisdiction not found' }, 400)
  }

  const [updated] = await db
    .update(regulators)
    .set(body)
    .where(eq(regulators.id, id))
    .returning()
  return c.json(updated)
})

// Auth: delete a regulator (owner only).
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(regulators).where(eq(regulators.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.created_by !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(regulators).where(eq(regulators.id, id))
  return c.json({ success: true })
})

export default router
