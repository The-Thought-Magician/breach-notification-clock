// ─────────────────────────────────────────────────────────────────────────────
// cron.ts — THE ENGINE
//
// Pure, deterministic scheduling primitives used by the routes. No DB, no
// network, no clock-dependent globals beyond the explicit `fromISO` arguments
// passed in by callers. Every function is fully self-contained and typed.
//
// A "schedule" has one of three kinds:
//   - 'cron'   : a standard 5/6-field cron expression evaluated in a timezone
//   - 'rate'   : "every N minutes|hours|days" computed arithmetically
//   - 'oneoff' : a single ISO instant
// ─────────────────────────────────────────────────────────────────────────────

import { CronExpressionParser } from 'cron-parser'

export type ScheduleKind = 'cron' | 'rate' | 'oneoff'

export interface Job {
  id: string
  kind: ScheduleKind
  expr: string
  timezone: string
  resourceId?: string | null
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface CollisionWindow {
  windowStart: string
  windowEnd: string
  jobIds: string[]
  severity: 'low' | 'medium' | 'high'
  resourceId?: string
}

export interface HeatmapBucket {
  bucket: string
  count: number
}

export type DstTrapType = 'double_fire' | 'skip' | 'ambiguous'

export interface DstTrap {
  type: DstTrapType
  atLocal: string
  atUtc: string
}

export interface CoverageGap {
  gapStart: string
  gapEnd: string
  durationMinutes: number
}

export interface SpreadSuggestion {
  jobId: string
  suggestedExpr: string
  reason: string
}

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

// ── helpers ──────────────────────────────────────────────────────────────────

const RATE_RE = /^\s*every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)\s*$/i

function parseRate(expr: string): { ms: number; n: number; unit: string } | null {
  const m = RATE_RE.exec(expr)
  if (!m) return null
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = m[2].toLowerCase()
  const per = unit.startsWith('minute') ? MINUTE_MS : unit.startsWith('hour') ? HOUR_MS : DAY_MS
  return { ms: n * per, n, unit }
}

function toIso(d: Date): string {
  return d.toISOString()
}

function floorToMinuteIso(d: Date): string {
  const t = Math.floor(d.getTime() / MINUTE_MS) * MINUTE_MS
  return new Date(t).toISOString()
}

// Offset (in minutes, east-of-UTC positive) of `tz` at the given instant.
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value
  let hour = parseInt(map.hour, 10)
  if (hour === 24) hour = 0
  const asUtc = Date.UTC(
    parseInt(map.year, 10),
    parseInt(map.month, 10) - 1,
    parseInt(map.day, 10),
    hour,
    parseInt(map.minute, 10),
    parseInt(map.second, 10),
  )
  return Math.round((asUtc - date.getTime()) / MINUTE_MS)
}

function localStamp(date: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value
  let hour = map.hour
  if (hour === '24') hour = '00'
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}`
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// ── validateExpression ─────────────────────────────────────────────────────────

export function validateExpression(kind: ScheduleKind, expr: string): ValidationResult {
  if (typeof expr !== 'string' || expr.trim() === '') {
    return { valid: false, error: 'Expression is empty' }
  }
  if (kind === 'cron') {
    try {
      CronExpressionParser.parse(expr)
      return { valid: true }
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  if (kind === 'rate') {
    return parseRate(expr)
      ? { valid: true }
      : { valid: false, error: 'Rate must be "every N minutes|hours|days"' }
  }
  if (kind === 'oneoff') {
    const t = Date.parse(expr)
    return Number.isNaN(t)
      ? { valid: false, error: 'One-off must be a valid ISO instant' }
      : { valid: true }
  }
  return { valid: false, error: `Unknown kind: ${kind}` }
}

// ── describeExpression ──────────────────────────────────────────────────────────

export function describeExpression(kind: ScheduleKind, expr: string, timezone: string): string {
  const v = validateExpression(kind, expr)
  if (!v.valid) return `Invalid expression: ${v.error}`
  if (kind === 'rate') {
    const r = parseRate(expr)!
    return `Every ${r.n} ${r.unit.replace(/s$/, '')}${r.n === 1 ? '' : 's'}`
  }
  if (kind === 'oneoff') {
    return `Once at ${new Date(expr).toISOString()}`
  }
  // cron
  const fields = expr.trim().split(/\s+/)
  const tzNote = timezone ? ` (${timezone})` : ''
  if (fields.length >= 5) {
    const [min, hour, dom, mon, dow] = fields
    if (min === '0' && hour === '0' && dom === '*' && mon === '*' && dow === '*') {
      return `Daily at midnight${tzNote}`
    }
    if (dom === '*' && mon === '*' && dow === '*' && /^\d+$/.test(min) && /^\d+$/.test(hour)) {
      return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}${tzNote}`
    }
    if (min.startsWith('*/')) {
      return `Every ${min.slice(2)} minutes${tzNote}`
    }
  }
  return `Cron "${expr}"${tzNote}`
}

// ── nextFirings ─────────────────────────────────────────────────────────────────

export function nextFirings(
  kind: ScheduleKind,
  expr: string,
  timezone: string,
  fromISO: string,
  count: number,
): string[] {
  const n = Math.max(0, Math.floor(count))
  if (n === 0) return []
  const from = new Date(fromISO)
  if (Number.isNaN(from.getTime())) return []

  if (kind === 'cron') {
    try {
      const opts: { currentDate: Date; tz?: string } = { currentDate: from }
      if (timezone && isValidTimezone(timezone)) opts.tz = timezone
      const it = CronExpressionParser.parse(expr, opts)
      const out: string[] = []
      for (let i = 0; i < n; i++) {
        out.push(it.next().toDate().toISOString())
      }
      return out
    } catch {
      return []
    }
  }

  if (kind === 'rate') {
    const r = parseRate(expr)
    if (!r) return []
    const out: string[] = []
    let t = from.getTime() + r.ms
    for (let i = 0; i < n; i++) {
      out.push(new Date(t).toISOString())
      t += r.ms
    }
    return out
  }

  if (kind === 'oneoff') {
    const t = Date.parse(expr)
    if (Number.isNaN(t)) return []
    return t > from.getTime() ? [new Date(t).toISOString()] : []
  }

  return []
}

// Internal: all firings within a horizon (capped to avoid runaway expansion).
function firingsWithinHorizon(job: Job, fromISO: string, horizonDays: number): string[] {
  const from = new Date(fromISO)
  if (Number.isNaN(from.getTime())) return []
  const horizonEnd = from.getTime() + horizonDays * DAY_MS
  const CAP = 50_000
  const out: string[] = []

  if (job.kind === 'cron') {
    try {
      const opts: { currentDate: Date; endDate: Date; tz?: string } = {
        currentDate: from,
        endDate: new Date(horizonEnd),
      }
      if (job.timezone && isValidTimezone(job.timezone)) opts.tz = job.timezone
      const it = CronExpressionParser.parse(job.expr, opts)
      while (out.length < CAP) {
        try {
          const next = it.next().toDate()
          if (next.getTime() > horizonEnd) break
          out.push(next.toISOString())
        } catch {
          break
        }
      }
    } catch {
      return []
    }
    return out
  }

  if (job.kind === 'rate') {
    const r = parseRate(job.expr)
    if (!r) return []
    let t = from.getTime() + r.ms
    while (t <= horizonEnd && out.length < CAP) {
      out.push(new Date(t).toISOString())
      t += r.ms
    }
    return out
  }

  if (job.kind === 'oneoff') {
    const t = Date.parse(job.expr)
    if (!Number.isNaN(t) && t > from.getTime() && t <= horizonEnd) {
      return [new Date(t).toISOString()]
    }
    return []
  }

  return []
}

// ── computeCollisions ────────────────────────────────────────────────────────────
// Bucket every firing by minute. Flag minutes where concurrency >= threshold
// OR where >= 2 jobs share the same resourceId.

export function computeCollisions(
  jobs: Job[],
  opts: { horizonDays: number; threshold: number },
): CollisionWindow[] {
  const horizonDays = opts.horizonDays > 0 ? opts.horizonDays : 7
  const threshold = opts.threshold > 0 ? opts.threshold : 2
  const fromISO = new Date().toISOString()

  // minute-bucket -> set of jobIds
  const byMinute = new Map<number, Set<string>>()
  for (const job of jobs) {
    const firings = firingsWithinHorizon(job, fromISO, horizonDays)
    for (const f of firings) {
      const minuteBucket = Math.floor(Date.parse(f) / MINUTE_MS)
      let set = byMinute.get(minuteBucket)
      if (!set) {
        set = new Set<string>()
        byMinute.set(minuteBucket, set)
      }
      set.add(job.id)
    }
  }

  const resourceOf = new Map<string, string | null | undefined>()
  for (const j of jobs) resourceOf.set(j.id, j.resourceId)

  const windows: CollisionWindow[] = []
  for (const [minuteBucket, set] of [...byMinute.entries()].sort((a, b) => a[0] - b[0])) {
    const jobIds = [...set]

    // resource sharing inside this minute
    const resCounts = new Map<string, string[]>()
    for (const id of jobIds) {
      const r = resourceOf.get(id)
      if (r) {
        const arr = resCounts.get(r) ?? []
        arr.push(id)
        resCounts.set(r, arr)
      }
    }
    let sharedResource: string | undefined
    for (const [r, ids] of resCounts) {
      if (ids.length >= 2) {
        sharedResource = r
        break
      }
    }

    const concurrency = jobIds.length
    const flagged = concurrency >= threshold || sharedResource !== undefined
    if (!flagged) continue

    let severity: CollisionWindow['severity'] = 'low'
    if (concurrency >= threshold * 3) severity = 'high'
    else if (concurrency >= threshold * 2 || sharedResource) severity = 'medium'

    const start = minuteBucket * MINUTE_MS
    windows.push({
      windowStart: new Date(start).toISOString(),
      windowEnd: new Date(start + MINUTE_MS).toISOString(),
      jobIds,
      severity,
      ...(sharedResource ? { resourceId: sharedResource } : {}),
    })
  }
  return windows
}

// ── loadHeatmap ───────────────────────────────────────────────────────────────────
// Hourly buckets across the horizon with total firing counts.

export function loadHeatmap(jobs: Job[], opts: { horizonDays: number }): HeatmapBucket[] {
  const horizonDays = opts.horizonDays > 0 ? opts.horizonDays : 7
  const fromISO = new Date().toISOString()

  const byHour = new Map<number, number>()
  for (const job of jobs) {
    for (const f of firingsWithinHorizon(job, fromISO, horizonDays)) {
      const hourBucket = Math.floor(Date.parse(f) / HOUR_MS)
      byHour.set(hourBucket, (byHour.get(hourBucket) ?? 0) + 1)
    }
  }

  return [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hourBucket, count]) => ({
      bucket: new Date(hourBucket * HOUR_MS).toISOString(),
      count,
    }))
}

// ── dstTraps ──────────────────────────────────────────────────────────────────────
// Walk the window day-by-day looking for timezone offset changes, then classify
// the firings near each transition as double_fire / skip / ambiguous.

export function dstTraps(
  kind: ScheduleKind,
  expr: string,
  timezone: string,
  fromISO: string,
  days: number,
): DstTrap[] {
  if (!timezone || !isValidTimezone(timezone)) return []
  const from = new Date(fromISO)
  if (Number.isNaN(from.getTime())) return []
  const horizonDays = days > 0 ? days : 7

  // Find offset transitions by scanning at hour resolution.
  const transitions: { at: Date; before: number; after: number }[] = []
  let prevOffset = tzOffsetMinutes(from, timezone)
  let cursor = from.getTime()
  const end = from.getTime() + horizonDays * DAY_MS
  while (cursor < end) {
    const next = cursor + HOUR_MS
    const off = tzOffsetMinutes(new Date(next), timezone)
    if (off !== prevOffset) {
      transitions.push({ at: new Date(next), before: prevOffset, after: off })
      prevOffset = off
    }
    cursor = next
  }
  if (transitions.length === 0) return []

  const job: Job = { id: '_probe', kind, expr, timezone }
  const firings = firingsWithinHorizon(job, fromISO, horizonDays).map((s) => Date.parse(s))
  const traps: DstTrap[] = []

  for (const t of transitions) {
    const springForward = t.after > t.before // clocks jump forward → skipped local hour
    const fallBack = t.after < t.before // clocks fall back → repeated local hour
    const windowStart = t.at.getTime() - HOUR_MS
    const windowEnd = t.at.getTime() + HOUR_MS

    const near = firings.filter((f) => f >= windowStart && f <= windowEnd)

    if (fallBack) {
      // Repeated local hour: any firing here is ambiguous; if two firings land
      // on the same local stamp it is a literal double fire.
      const seenLocal = new Map<string, number>()
      for (const f of near) {
        const local = localStamp(new Date(f), timezone)
        seenLocal.set(local, (seenLocal.get(local) ?? 0) + 1)
      }
      for (const f of near) {
        const local = localStamp(new Date(f), timezone)
        const isDouble = (seenLocal.get(local) ?? 0) >= 2
        traps.push({
          type: isDouble ? 'double_fire' : 'ambiguous',
          atLocal: local,
          atUtc: new Date(f).toISOString(),
        })
      }
    } else if (springForward) {
      // Skipped local hour: a cron time that falls in the gap never fires.
      // Surface the transition itself as a potential skip if a firing would
      // have been expected in the lost interval (none present in `near`).
      const localTransition = localStamp(t.at, timezone)
      const firedInGap = near.length > 0
      if (!firedInGap) {
        traps.push({
          type: 'skip',
          atLocal: localTransition,
          atUtc: t.at.toISOString(),
        })
      } else {
        for (const f of near) {
          traps.push({
            type: 'skip',
            atLocal: localStamp(new Date(f), timezone),
            atUtc: new Date(f).toISOString(),
          })
        }
      }
    }
  }
  return traps
}

// ── coverageGaps ───────────────────────────────────────────────────────────────────
// Given desired coverage windows [{windowStart,windowEnd}] and the actual job
// firings, find intervals inside the union of windows with no firing.

export function coverageGaps(
  windows: { windowStart: string; windowEnd: string }[],
  jobs: Job[],
  opts: { horizonDays: number },
): CoverageGap[] {
  const horizonDays = opts.horizonDays > 0 ? opts.horizonDays : 7
  const fromISO = new Date().toISOString()

  const firings: number[] = []
  for (const job of jobs) {
    for (const f of firingsWithinHorizon(job, fromISO, horizonDays)) firings.push(Date.parse(f))
  }
  firings.sort((a, b) => a - b)

  const gaps: CoverageGap[] = []
  for (const w of windows) {
    const ws = Date.parse(w.windowStart)
    const we = Date.parse(w.windowEnd)
    if (Number.isNaN(ws) || Number.isNaN(we) || we <= ws) continue

    const inside = firings.filter((f) => f >= ws && f <= we)
    if (inside.length === 0) {
      gaps.push({
        gapStart: new Date(ws).toISOString(),
        gapEnd: new Date(we).toISOString(),
        durationMinutes: Math.round((we - ws) / MINUTE_MS),
      })
      continue
    }
    // gap from window start to first firing
    let prev = ws
    for (const f of inside) {
      if (f - prev > MINUTE_MS) {
        gaps.push({
          gapStart: new Date(prev).toISOString(),
          gapEnd: new Date(f).toISOString(),
          durationMinutes: Math.round((f - prev) / MINUTE_MS),
        })
      }
      prev = f
    }
    // trailing gap from last firing to window end
    if (we - prev > MINUTE_MS) {
      gaps.push({
        gapStart: new Date(prev).toISOString(),
        gapEnd: new Date(we).toISOString(),
        durationMinutes: Math.round((we - prev) / MINUTE_MS),
      })
    }
  }
  return gaps
}

// ── autoSpread ─────────────────────────────────────────────────────────────────────
// For jobs that collide (share a firing minute / exceed threshold), suggest an
// offset cron expression that shifts each colliding job to a distinct minute.

export function autoSpread(jobs: Job[], opts: { threshold: number }): SpreadSuggestion[] {
  const threshold = opts.threshold > 0 ? opts.threshold : 2
  const collisions = computeCollisions(jobs, { horizonDays: 7, threshold })

  // Tally how often each job participates in a flagged minute.
  const offenders = new Map<string, number>()
  for (const w of collisions) {
    for (const id of w.jobIds) offenders.set(id, (offenders.get(id) ?? 0) + 1)
  }

  const jobById = new Map(jobs.map((j) => [j.id, j]))
  const suggestions: SpreadSuggestion[] = []

  // Keep the first job of each colliding minute as-is; spread the rest by an
  // incrementing minute offset so they no longer share the bucket.
  let offset = 0
  for (const [jobId, hits] of [...offenders.entries()].sort((a, b) => b[1] - a[1])) {
    const job = jobById.get(jobId)
    if (!job) continue
    offset = (offset + 7) % 60 // deterministic non-zero spread step
    if (offset === 0) offset = 7

    let suggestedExpr = job.expr
    let reason = `Job participates in ${hits} collision minute(s); spread by ${offset}m to reduce concurrency`

    if (job.kind === 'cron') {
      const fields = job.expr.trim().split(/\s+/)
      if (fields.length >= 5 && /^\d+$/.test(fields[0])) {
        const newMin = (parseInt(fields[0], 10) + offset) % 60
        fields[0] = String(newMin)
        suggestedExpr = fields.join(' ')
      } else if (fields.length >= 5) {
        // non-numeric minute field (e.g. */5 or *) → pin to an explicit offset minute
        fields[0] = String(offset)
        suggestedExpr = fields.join(' ')
        reason += ' (pinned minute field)'
      }
    } else if (job.kind === 'rate') {
      // rate jobs can't be phase-shifted via expression; recommend converting
      const r = parseRate(job.expr)
      if (r) {
        suggestedExpr = `${offset} */${Math.max(1, Math.round(r.ms / HOUR_MS))} * * *`
        reason = `Convert rate "${job.expr}" to an offset cron at minute ${offset} to break the collision`
      }
    } else {
      // one-off: shift the instant forward by `offset` minutes
      const t = Date.parse(job.expr)
      if (!Number.isNaN(t)) {
        suggestedExpr = new Date(t + offset * MINUTE_MS).toISOString()
        reason = `Shift one-off by ${offset}m to ${suggestedExpr} to avoid the shared firing minute`
      }
    }

    suggestions.push({ jobId, suggestedExpr, reason })
  }
  return suggestions
}

export { floorToMinuteIso, toIso }
