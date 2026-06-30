import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  incidents,
  obligations,
  deliveries,
  incident_anchors,
} from '../db/schema.js'
import { eq, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const HOUR_MS = 3_600_000

function bandFromMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// ── Cross-incident program metrics ──────────────────────────────────────────
router.get('/summary', authMiddleware, async (c) => {
  const userId = getUserId(c)

  const myIncidents = await db
    .select()
    .from(incidents)
    .where(eq(incidents.user_id, userId))
  const incidentIds = myIncidents.map((i) => i.id)

  const empty = {
    totals: {
      incidents: 0,
      openIncidents: 0,
      obligations: 0,
      openObligations: 0,
      sentObligations: 0,
      overdueObligations: 0,
      deliveries: 0,
      lateDeliveries: 0,
    },
    onTimeRate: 0,
    byJurisdiction: [] as Array<Record<string, unknown>>,
    trend: [] as Array<Record<string, unknown>>,
  }
  if (incidentIds.length === 0) return c.json(empty)

  const allObligations = await db
    .select()
    .from(obligations)
    .where(inArray(obligations.incident_id, incidentIds))

  const obligationIds = allObligations.map((o) => o.id)
  const allDeliveries =
    obligationIds.length > 0
      ? await db
          .select()
          .from(deliveries)
          .where(inArray(deliveries.obligation_id, obligationIds))
      : []

  const now = Date.now()

  const openObligations = allObligations.filter(
    (o) => o.status === 'open' || o.status === 'in_progress',
  ).length
  const sentObligations = allObligations.filter(
    (o) => o.status === 'sent' || o.status === 'delivered',
  ).length
  const overdueObligations = allObligations.filter((o) => {
    if (o.status === 'sent' || o.status === 'delivered' || o.status === 'na') return false
    if (!o.deadline_at) return false
    return new Date(o.deadline_at).getTime() < now
  }).length

  const lateDeliveries = allDeliveries.filter((d) => d.was_late).length
  const onTimeDeliveries = allDeliveries.length - lateDeliveries
  const onTimeRate =
    allDeliveries.length > 0 ? onTimeDeliveries / allDeliveries.length : 0

  // by jurisdiction: obligation + on-time breakdown
  const deliveryByObligation = new Map<string, boolean>() // obligationId -> wasLate
  for (const d of allDeliveries) {
    // if any delivery for the obligation was on-time keep that; prefer the latest
    const prev = deliveryByObligation.get(d.obligation_id)
    if (prev === undefined) deliveryByObligation.set(d.obligation_id, d.was_late)
    else deliveryByObligation.set(d.obligation_id, prev && d.was_late)
  }

  const jurMap = new Map<
    string,
    { jurisdictionCode: string; total: number; sent: number; overdue: number; late: number }
  >()
  for (const o of allObligations) {
    const code = o.jurisdiction_code ?? 'unspecified'
    const entry =
      jurMap.get(code) ?? { jurisdictionCode: code, total: 0, sent: 0, overdue: 0, late: 0 }
    entry.total += 1
    if (o.status === 'sent' || o.status === 'delivered') entry.sent += 1
    if (
      o.status !== 'sent' &&
      o.status !== 'delivered' &&
      o.status !== 'na' &&
      o.deadline_at &&
      new Date(o.deadline_at).getTime() < now
    ) {
      entry.overdue += 1
    }
    const wasLate = deliveryByObligation.get(o.id)
    if (wasLate === true) entry.late += 1
    jurMap.set(code, entry)
  }
  const byJurisdiction = [...jurMap.values()].sort((a, b) => b.total - a.total)

  // trend: deliveries per month, on-time vs late
  const trendMap = new Map<string, { month: string; total: number; late: number }>()
  for (const d of allDeliveries) {
    const month = bandFromMonth(new Date(d.delivered_at))
    const entry = trendMap.get(month) ?? { month, total: 0, late: 0 }
    entry.total += 1
    if (d.was_late) entry.late += 1
    trendMap.set(month, entry)
  }
  const trend = [...trendMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((t) => ({
      month: t.month,
      total: t.total,
      late: t.late,
      onTime: t.total - t.late,
      onTimeRate: t.total > 0 ? (t.total - t.late) / t.total : 0,
    }))

  return c.json({
    totals: {
      incidents: myIncidents.length,
      openIncidents: myIncidents.filter(
        (i) => i.status !== 'closed' && i.status !== 'resolved',
      ).length,
      obligations: allObligations.length,
      openObligations,
      sentObligations,
      overdueObligations,
      deliveries: allDeliveries.length,
      lateDeliveries,
    },
    onTimeRate,
    byJurisdiction,
    trend,
  })
})

// ── Per-incident summary ────────────────────────────────────────────────────
router.get('/incident/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const incidentId = c.req.param('id')

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
  const obligationIds = obs.map((o) => o.id)

  const dels =
    obligationIds.length > 0
      ? await db
          .select()
          .from(deliveries)
          .where(inArray(deliveries.obligation_id, obligationIds))
      : []

  const anchors = await db
    .select()
    .from(incident_anchors)
    .where(eq(incident_anchors.incident_id, incidentId))

  const now = Date.now()

  // earliest anchor = clock start for time-to-first-notice
  const clockStart =
    anchors.length > 0
      ? Math.min(...anchors.map((a) => new Date(a.occurred_at).getTime()))
      : null

  const firstDelivery =
    dels.length > 0
      ? Math.min(...dels.map((d) => new Date(d.delivered_at).getTime()))
      : null

  const timeToFirstNoticeHours =
    clockStart != null && firstDelivery != null
      ? Math.round(((firstDelivery - clockStart) / HOUR_MS) * 10) / 10
      : null

  const metOnTime = dels.filter((d) => !d.was_late).length
  const late = dels.filter((d) => d.was_late).length
  const onTimeRate = dels.length > 0 ? metOnTime / dels.length : 0

  const overdue = obs.filter((o) => {
    if (o.status === 'sent' || o.status === 'delivered' || o.status === 'na') return false
    if (!o.deadline_at) return false
    return new Date(o.deadline_at).getTime() < now
  }).length

  const sent = obs.filter((o) => o.status === 'sent' || o.status === 'delivered').length
  const open = obs.filter((o) => o.status === 'open' || o.status === 'in_progress').length

  return c.json({
    incidentId,
    title: incident.title,
    status: incident.status,
    severity: incident.severity,
    obligations: obs.length,
    open,
    sent,
    overdue,
    deliveries: dels.length,
    metOnTime,
    late,
    onTimeRate,
    clockStartAt: clockStart != null ? new Date(clockStart).toISOString() : null,
    firstNoticeAt: firstDelivery != null ? new Date(firstDelivery).toISOString() : null,
    timeToFirstNoticeHours,
  })
})

export default router
