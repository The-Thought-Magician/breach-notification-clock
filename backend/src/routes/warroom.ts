import { Hono } from 'hono'
import { db } from '../db/index.js'
import { incidents, obligations } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const HOUR_MS = 3_600_000

type Band = 'overdue' | 'red' | 'amber' | 'green' | 'met' | 'na'

// Banding policy driven by hours remaining until the statutory deadline.
//   met      → obligation already sent/delivered
//   na       → not applicable
//   overdue  → deadline passed and not met
//   red      → < 12h remaining
//   amber    → < 48h remaining
//   green    → > 48h remaining
function bandFor(
  status: string,
  isUndueDelay: boolean,
  deadlineAt: Date | null,
  now: number,
): Band {
  if (status === 'sent' || status === 'delivered') return 'met'
  if (status === 'na') return 'na'
  if (!deadlineAt) {
    // undue-delay obligations with no fixed clock: treat as red urgency until met
    return isUndueDelay ? 'red' : 'green'
  }
  const remainingMs = deadlineAt.getTime() - now
  if (remainingMs <= 0) return 'overdue'
  const remainingHours = remainingMs / HOUR_MS
  if (remainingHours < 12) return 'red'
  if (remainingHours < 48) return 'amber'
  return 'green'
}

function humanizeRemaining(ms: number): string {
  const abs = Math.abs(ms)
  const totalMinutes = Math.floor(abs / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  const label = parts.join(' ')
  return ms < 0 ? `${label} overdue` : label
}

// ── Countdown aggregate for one incident ────────────────────────────────────
router.get('/:incidentId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const incidentId = c.req.param('incidentId')

  const [incident] = await db
    .select()
    .from(incidents)
    .where(eq(incidents.id, incidentId))
  if (!incident) return c.json({ error: 'Not found' }, 404)
  if (incident.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const obs = await db
    .select()
    .from(obligations)
    .where(eq(obligations.incident_id, incidentId))

  const now = Date.now()

  const enriched = obs
    .map((o) => {
      const deadlineAt = o.deadline_at ? new Date(o.deadline_at) : null
      const remainingMs = deadlineAt ? deadlineAt.getTime() - now : null
      const band = bandFor(o.status, o.is_undue_delay, deadlineAt, now)
      return {
        ...o,
        deadlineAt: deadlineAt ? deadlineAt.toISOString() : null,
        remainingMs,
        remainingLabel:
          remainingMs == null
            ? o.is_undue_delay
              ? 'Without undue delay'
              : 'No deadline'
            : humanizeRemaining(remainingMs),
        band,
        isOverdue: band === 'overdue',
      }
    })
    .sort((a, b) => {
      // overdue + closest deadlines first; nulls last
      const order: Record<Band, number> = {
        overdue: 0,
        red: 1,
        amber: 2,
        green: 3,
        met: 4,
        na: 5,
      }
      if (order[a.band] !== order[b.band]) return order[a.band] - order[b.band]
      const ra = a.remainingMs ?? Number.MAX_SAFE_INTEGER
      const rb = b.remainingMs ?? Number.MAX_SAFE_INTEGER
      return ra - rb
    })

  // Next upcoming deadline among still-open obligations with a future deadline.
  const upcoming = enriched
    .filter(
      (o) =>
        o.deadlineAt != null &&
        o.band !== 'met' &&
        o.band !== 'na' &&
        o.band !== 'overdue',
    )
    .sort((a, b) => (a.remainingMs ?? 0) - (b.remainingMs ?? 0))
  const nextDeadline = upcoming[0]
    ? {
        obligationId: upcoming[0].id,
        recipient: upcoming[0].recipient,
        recipientType: upcoming[0].recipient_type,
        jurisdictionCode: upcoming[0].jurisdiction_code,
        deadlineAt: upcoming[0].deadlineAt,
        remainingMs: upcoming[0].remainingMs,
        remainingLabel: upcoming[0].remainingLabel,
        band: upcoming[0].band,
      }
    : null

  const counts = {
    total: enriched.length,
    overdue: enriched.filter((o) => o.band === 'overdue').length,
    red: enriched.filter((o) => o.band === 'red').length,
    amber: enriched.filter((o) => o.band === 'amber').length,
    green: enriched.filter((o) => o.band === 'green').length,
    met: enriched.filter((o) => o.band === 'met').length,
    na: enriched.filter((o) => o.band === 'na').length,
    open: enriched.filter((o) => o.status === 'open').length,
    inProgress: enriched.filter((o) => o.status === 'in_progress').length,
  }

  return c.json({
    incident,
    obligations: enriched,
    nextDeadline,
    counts,
    serverNow: new Date(now).toISOString(),
  })
})

export default router
