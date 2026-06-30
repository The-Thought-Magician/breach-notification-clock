import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { jurisdictions } from '../db/schema.js'

const router = new Hono()

// Public jurisdiction registry — no auth on reads.

// GET / — list all jurisdictions, optionally filtered by region or sector
router.get('/', async (c) => {
  const region = c.req.query('region')
  const sector = c.req.query('sector')
  let rows = await db.select().from(jurisdictions).orderBy(jurisdictions.name)
  if (region) rows = rows.filter((r) => r.region === region)
  if (sector) rows = rows.filter((r) => r.sector === sector)
  return c.json(rows)
})

// GET /:id — jurisdiction detail (lookup by id, falling back to unique code)
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  let [j] = await db.select().from(jurisdictions).where(eq(jurisdictions.id, id))
  if (!j) {
    ;[j] = await db.select().from(jurisdictions).where(eq(jurisdictions.code, id))
  }
  if (!j) return c.json({ error: 'Not found' }, 404)
  return c.json(j)
})

export default router
