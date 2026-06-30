'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Incident {
  id: string
  title: string
  reference_number?: string | null
  severity?: string
  status?: string
  is_drill?: boolean
  summary?: string | null
  created_at?: string
}

interface UpcomingObligation {
  id: string
  incident_id?: string
  incidentId?: string
  recipient?: string
  recipient_type?: string
  jurisdiction_code?: string
  deadline_at?: string | null
  status?: string
  is_undue_delay?: boolean
}

interface Counts {
  red?: number
  amber?: number
  green?: number
  overdue?: number
  open_incidents?: number
  total?: number
  [k: string]: number | undefined
}

interface Overview {
  incidents?: Incident[]
  upcoming?: UpcomingObligation[]
  counts?: Counts
}

const SEVERITY_TONE: Record<string, 'red' | 'amber' | 'green' | 'zinc'> = {
  critical: 'red',
  high: 'red',
  medium: 'amber',
  low: 'green',
}

const STATUS_TONE: Record<string, 'red' | 'amber' | 'green' | 'blue' | 'zinc'> = {
  triage: 'amber',
  open: 'red',
  active: 'red',
  investigating: 'amber',
  notifying: 'blue',
  monitoring: 'blue',
  closed: 'green',
  resolved: 'green',
}

function msUntil(iso?: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return t - Date.now()
}

function band(ms: number | null): 'overdue' | 'red' | 'amber' | 'green' | 'none' {
  if (ms === null) return 'none'
  if (ms < 0) return 'overdue'
  const hours = ms / 3_600_000
  if (hours <= 24) return 'red'
  if (hours <= 72) return 'amber'
  return 'green'
}

function formatRemaining(ms: number | null): string {
  if (ms === null) return '—'
  const overdue = ms < 0
  let s = Math.abs(ms) / 1000
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  parts.push(`${h}h`)
  parts.push(`${m}m`)
  const label = parts.join(' ')
  return overdue ? `${label} overdue` : label
}

const BAND_TONE: Record<string, 'red' | 'amber' | 'green' | 'zinc'> = {
  overdue: 'red',
  red: 'red',
  amber: 'amber',
  green: 'green',
  none: 'zinc',
}

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [, setTick] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getDashboardOverview()
      setData(res || {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overview')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Live countdown re-render every 30s.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const handleSeed = async () => {
    setSeeding(true)
    setError(null)
    try {
      await api.seedSample()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to seed sample incident')
    } finally {
      setSeeding(false)
    }
  }

  if (loading) return <PageSpinner label="Loading program overview..." />

  const incidents = data?.incidents ?? []
  const upcoming = (data?.upcoming ?? [])
    .slice()
    .sort((a, b) => {
      const ta = a.deadline_at ? new Date(a.deadline_at).getTime() : Infinity
      const tb = b.deadline_at ? new Date(b.deadline_at).getTime() : Infinity
      return ta - tb
    })
  const counts = data?.counts ?? {}

  const overdue = counts.overdue ?? upcoming.filter((o) => band(msUntil(o.deadline_at)) === 'overdue').length
  const red = counts.red ?? upcoming.filter((o) => band(msUntil(o.deadline_at)) === 'red').length
  const amber = counts.amber ?? upcoming.filter((o) => band(msUntil(o.deadline_at)) === 'amber').length
  const openIncidents =
    counts.open_incidents ?? incidents.filter((i) => !['closed', 'resolved'].includes((i.status ?? '').toLowerCase())).length

  const soonest = upcoming.find((o) => o.deadline_at)
  const soonestMs = soonest ? msUntil(soonest.deadline_at) : null

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Breach Notification Clock</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Program overview — soonest regulatory and contractual deadlines across every open incident.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} disabled={seeding}>
            Refresh
          </Button>
          <Button onClick={handleSeed} disabled={seeding}>
            {seeding ? 'Seeding...' : 'Seed sample incident'}
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Next-deadline hero */}
      <Card
        className={
          soonestMs !== null && soonestMs < 0
            ? 'border-red-700 bg-red-950/30'
            : band(soonestMs) === 'red'
              ? 'border-red-800 bg-gradient-to-br from-red-950/40 to-zinc-900'
              : band(soonestMs) === 'amber'
                ? 'border-amber-800 bg-gradient-to-br from-amber-950/30 to-zinc-900'
                : ''
        }
      >
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Next deadline</div>
            {soonest ? (
              <>
                <div
                  className={`mt-1 text-4xl font-bold tabular-nums ${
                    soonestMs !== null && soonestMs < 0
                      ? 'text-red-400'
                      : band(soonestMs) === 'red'
                        ? 'text-red-400'
                        : band(soonestMs) === 'amber'
                          ? 'text-amber-400'
                          : 'text-zinc-100'
                  }`}
                >
                  {formatRemaining(soonestMs)}
                </div>
                <div className="mt-1 text-sm text-zinc-400">
                  {soonest.recipient || soonest.recipient_type || 'Recipient'}
                  {soonest.jurisdiction_code ? ` · ${soonest.jurisdiction_code}` : ''}
                  {soonest.deadline_at ? ` · due ${new Date(soonest.deadline_at).toLocaleString()}` : ''}
                </div>
              </>
            ) : (
              <div className="mt-1 text-2xl font-bold text-zinc-500">No active deadlines</div>
            )}
          </div>
          {soonest && (soonest.incident_id || soonest.incidentId) && (
            <Link href={`/dashboard/incidents/${soonest.incident_id || soonest.incidentId}/warroom`}>
              <Button variant="danger">Open war room</Button>
            </Link>
          )}
        </CardBody>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open incidents" value={openIncidents} tone="default" hint={`${incidents.length} total`} />
        <Stat label="Overdue" value={overdue} tone={overdue > 0 ? 'red' : 'default'} hint="Past deadline" />
        <Stat label="Due ≤ 24h" value={red} tone={red > 0 ? 'red' : 'default'} hint="Critical band" />
        <Stat label="Due ≤ 72h" value={amber} tone={amber > 0 ? 'amber' : 'default'} hint="Warning band" />
      </div>

      {/* Band distribution bar */}
      {upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-zinc-200">Deadline pressure</h2>
          </CardHeader>
          <CardBody>
            <BandBar overdue={overdue} red={red} amber={amber} green={Math.max(upcoming.length - overdue - red - amber, 0)} />
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Soonest deadlines */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Soonest deadlines</h2>
            <span className="text-xs text-zinc-500">{upcoming.length} obligations</span>
          </CardHeader>
          <CardBody className="!p-0">
            {upcoming.length === 0 ? (
              <div className="px-5 py-10">
                <EmptyState
                  title="No upcoming deadlines"
                  description="Create an incident and recompute obligations, or seed a sample incident to see the clock in action."
                  action={
                    <Button onClick={handleSeed} disabled={seeding}>
                      {seeding ? 'Seeding...' : 'Seed sample incident'}
                    </Button>
                  }
                />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Recipient</TH>
                    <TH>Jurisdiction</TH>
                    <TH>Time left</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {upcoming.slice(0, 12).map((o) => {
                    const ms = msUntil(o.deadline_at)
                    const b = band(ms)
                    const recipientLabel = o.recipient || o.recipient_type || '—'
                    return (
                      <TR key={o.id}>
                        <TD className="font-medium text-zinc-100">
                          <Link href={`/dashboard/obligations/${o.id}`} className="hover:text-red-300">
                            {recipientLabel}
                          </Link>
                          {o.is_undue_delay && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-400">undue delay</span>
                          )}
                        </TD>
                        <TD>
                          <span className="font-mono text-xs text-zinc-400">{o.jurisdiction_code || '—'}</span>
                        </TD>
                        <TD>
                          <Badge tone={BAND_TONE[b]}>{formatRemaining(ms)}</Badge>
                        </TD>
                        <TD>
                          <span className="text-xs capitalize text-zinc-400">{o.status || 'pending'}</span>
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>

        {/* Open incidents */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Open incidents</h2>
            <Link href="/dashboard/incidents" className="text-xs text-red-400 hover:text-red-300">
              View all →
            </Link>
          </CardHeader>
          <CardBody className="!p-0">
            {incidents.length === 0 ? (
              <div className="px-5 py-10">
                <EmptyState
                  title="No incidents yet"
                  description="Log your first breach incident to start the notification clock."
                  action={
                    <Link href="/dashboard/incidents/new">
                      <Button>New incident</Button>
                    </Link>
                  }
                />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Incident</TH>
                    <TH>Severity</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {incidents.slice(0, 12).map((i) => (
                    <TR key={i.id}>
                      <TD>
                        <Link href={`/dashboard/incidents/${i.id}`} className="font-medium text-zinc-100 hover:text-red-300">
                          {i.title}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                          {i.reference_number && <span className="font-mono">{i.reference_number}</span>}
                          {i.is_drill && <Badge tone="blue">drill</Badge>}
                        </div>
                      </TD>
                      <TD>
                        <Badge tone={SEVERITY_TONE[(i.severity ?? '').toLowerCase()] ?? 'zinc'}>
                          {i.severity || 'unset'}
                        </Badge>
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONE[(i.status ?? '').toLowerCase()] ?? 'zinc'}>{i.status || 'triage'}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function BandBar({ overdue, red, amber, green }: { overdue: number; red: number; amber: number; green: number }) {
  const total = overdue + red + amber + green
  if (total === 0) return <p className="text-sm text-zinc-500">No obligations to band.</p>
  const seg = (n: number, cls: string, label: string) =>
    n > 0 ? (
      <div
        className={`flex h-full items-center justify-center ${cls}`}
        style={{ width: `${(n / total) * 100}%` }}
        title={`${label}: ${n}`}
      >
        {(n / total) > 0.08 && <span className="text-[10px] font-semibold text-black/70">{n}</span>}
      </div>
    ) : null
  return (
    <div className="space-y-3">
      <div className="flex h-6 w-full overflow-hidden rounded-full border border-zinc-800">
        {seg(overdue, 'bg-red-600', 'Overdue')}
        {seg(red, 'bg-red-500', 'Due ≤ 24h')}
        {seg(amber, 'bg-amber-500', 'Due ≤ 72h')}
        {seg(green, 'bg-emerald-600', 'On track')}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-zinc-400">
        <LegendDot cls="bg-red-600" label={`Overdue ${overdue}`} />
        <LegendDot cls="bg-red-500" label={`≤ 24h ${red}`} />
        <LegendDot cls="bg-amber-500" label={`≤ 72h ${amber}`} />
        <LegendDot cls="bg-emerald-600" label={`On track ${green}`} />
      </div>
    </div>
  )
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />
      {label}
    </span>
  )
}
