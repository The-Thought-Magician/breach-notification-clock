import { Hono } from 'hono'
import { db } from '../db/index.js'
import { activity_log, incidents } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// GET / — auth — append-only activity log, optionally filtered by incident.
// Only rows for incidents the caller owns are returned. Rows with no
// incident_id (global actions) are returned only when no incident filter is set
// and were authored by the caller.
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const incidentId = c.req.query('incidentId')

  if (incidentId) {
    // Ownership check: caller must own the incident to read its log.
    const [incident] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, incidentId))
    if (!incident) return c.json({ error: 'Not found' }, 404)
    if (incident.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

    const rows = await db
      .select()
      .from(activity_log)
      .where(eq(activity_log.incident_id, incidentId))
      .orderBy(desc(activity_log.created_at))
    return c.json(rows)
  }

  // No incident filter: return activity across all incidents the caller owns,
  // plus any incident-less actions the caller performed themselves.
  const owned = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(eq(incidents.user_id, userId))
  const ownedIds = new Set(owned.map((r) => r.id))

  const all = await db
    .select()
    .from(activity_log)
    .orderBy(desc(activity_log.created_at))

  const visible = all.filter((row) => {
    if (row.incident_id) return ownedIds.has(row.incident_id)
    return row.actor_id === userId
  })

  return c.json(visible)
})

export default router
