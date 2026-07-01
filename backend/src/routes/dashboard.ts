import { Hono } from 'hono'
import { db } from '../db/index.js'
import { incidents, obligations } from '../db/schema.js'
import { eq, and, desc, inArray, ne } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const HOUR_MS = 3_600_000

// Band a deadline by hours remaining (relative to now):
//   overdue  : deadline already passed and not yet satisfied
//   red      : < 24h remaining
//   amber     : < 72h remaining
//   green     : >= 72h remaining
//   undue    : undue-delay obligation with no fixed deadline
function bandFor(deadlineAt: Date | null, isUndueDelay: boolean, nowMs: number): string {
  if (deadlineAt == null) return isUndueDelay ? 'undue' : 'none'
  const ms = deadlineAt.getTime() - nowMs
  if (ms < 0) return 'overdue'
  const hours = ms / HOUR_MS
  if (hours < 24) return 'red'
  if (hours < 72) return 'amber'
  return 'green'
}

// ── GET /overview ───────────────────────────────────────────────────────────
// Program overview for the caller: open incidents, the soonest upcoming
// deadlines across all of their incidents, and obligation counts bucketed by
// urgency band.

router.get('/overview', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const nowMs = Date.now()

  // All incidents owned by the caller, newest first.
  const myIncidents = await db
    .select()
    .from(incidents)
    .where(eq(incidents.user_id, userId))
    .orderBy(desc(incidents.created_at))

  const openIncidents = myIncidents.filter((i) => i.status !== 'closed')
  const incidentIds = myIncidents.map((i) => i.id)
  const incidentTitle = new Map(myIncidents.map((i) => [i.id, i.title]))

  // Obligations across the caller's incidents that are not yet resolved.
  let myObligations: Array<typeof obligations.$inferSelect> = []
  if (incidentIds.length > 0) {
    myObligations = await db
      .select()
      .from(obligations)
      .where(
        and(
          inArray(obligations.incident_id, incidentIds),
          ne(obligations.status, 'delivered'),
          ne(obligations.status, 'na'),
        ),
      )
  }

  // Counts by band.
  const counts: Record<string, number> = {
    overdue: 0,
    red: 0,
    amber: 0,
    green: 0,
    undue: 0,
    none: 0,
  }
  for (const o of myObligations) {
    const band = bandFor(o.deadline_at, o.is_undue_delay, nowMs)
    counts[band] = (counts[band] ?? 0) + 1
  }

  // Soonest deadlines: obligations with a concrete deadline, ascending, top 10.
  const upcoming = myObligations
    .filter((o) => o.deadline_at != null)
    .sort((a, b) => (a.deadline_at as Date).getTime() - (b.deadline_at as Date).getTime())
    .slice(0, 10)
    .map((o) => {
      const deadline = o.deadline_at as Date
      return {
        id: o.id,
        incident_id: o.incident_id,
        incidentTitle: incidentTitle.get(o.incident_id) ?? null,
        recipient: o.recipient,
        recipient_type: o.recipient_type,
        jurisdiction_code: o.jurisdiction_code,
        deadline_at: deadline.toISOString(),
        hoursRemaining: Math.round(((deadline.getTime() - nowMs) / HOUR_MS) * 10) / 10,
        is_undue_delay: o.is_undue_delay,
        band: bandFor(deadline, o.is_undue_delay, nowMs),
        status: o.status,
      }
    })

  return c.json({
    incidents: openIncidents,
    upcoming,
    counts: {
      openIncidents: openIncidents.length,
      totalIncidents: myIncidents.length,
      openObligations: myObligations.length,
      open_incidents: openIncidents.length,
      overdue: counts.overdue,
      red: counts.red,
      amber: counts.amber,
      green: counts.green,
      undue: counts.undue,
      byBand: counts,
    },
  })
})

export default router
