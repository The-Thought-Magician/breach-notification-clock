import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { affected_populations, incidents } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Every population row is scoped to an incident the caller owns.
router.use('*', authMiddleware)

const populationSchema = z.object({
  incident_id: z.string().min(1),
  jurisdiction_code: z.string().min(1),
  count: z.number().int().min(0).optional().default(0),
  data_categories: z.array(z.string()).optional().default([]),
})

async function ownsIncident(incidentId: string, userId: string): Promise<boolean> {
  const [inc] = await db.select().from(incidents).where(eq(incidents.id, incidentId))
  return !!inc && inc.user_id === userId
}

// GET / — list populations for an incident the caller owns (?incidentId=)
router.get('/', async (c) => {
  const userId = getUserId(c)
  const incidentId = c.req.query('incidentId')
  if (!incidentId) return c.json({ error: 'incidentId is required' }, 400)
  if (!(await ownsIncident(incidentId, userId))) return c.json({ error: 'Not found' }, 404)
  const rows = await db
    .select()
    .from(affected_populations)
    .where(eq(affected_populations.incident_id, incidentId))
    .orderBy(desc(affected_populations.created_at))
  return c.json(rows)
})

// POST / — upsert a population row (unique per incident_id + jurisdiction_code)
router.post('/', zValidator('json', populationSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  if (!(await ownsIncident(body.incident_id, userId))) return c.json({ error: 'Not found' }, 404)
  const [row] = await db
    .insert(affected_populations)
    .values({
      incident_id: body.incident_id,
      jurisdiction_code: body.jurisdiction_code,
      count: body.count,
      data_categories: body.data_categories,
    })
    .onConflictDoUpdate({
      target: [affected_populations.incident_id, affected_populations.jurisdiction_code],
      set: { count: body.count, data_categories: body.data_categories },
    })
    .returning()
  return c.json(row, 201)
})

// DELETE /:id — delete a population row the caller owns (via its incident)
router.delete('/:id', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(affected_populations)
    .where(eq(affected_populations.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await ownsIncident(existing.incident_id, userId))) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(affected_populations).where(eq(affected_populations.id, id))
  return c.json({ success: true })
})

export default router
