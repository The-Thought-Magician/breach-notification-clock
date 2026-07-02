'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Totals {
  incidents: number
  openIncidents: number
  obligations: number
  openObligations: number
  sentObligations: number
  overdueObligations: number
  deliveries: number
  lateDeliveries: number
}

interface JurisdictionRow {
  jurisdictionCode: string
  total: number
  sent: number
  overdue: number
  late: number
}

interface TrendRow {
  month: string
  total: number
  late: number
  onTime: number
  onTimeRate: number
}

interface Summary {
  totals: Totals
  onTimeRate: number
  byJurisdiction: JurisdictionRow[]
  trend: TrendRow[]
}

interface Incident {
  id: string
  title: string
  reference_number?: string | null
  severity?: string | null
  status?: string | null
}

interface IncidentSummary {
  incidentId: string
  title: string
  status?: string | null
  severity?: string | null
  obligations: number
  open: number
  sent: number
  overdue: number
  deliveries: number
  metOnTime: number
  late: number
  onTimeRate: number
  clockStartAt?: string | null
  firstNoticeAt?: string | null
  timeToFirstNoticeHours?: number | null
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

function fmtHours(h: number | null | undefined) {
  if (h == null) return '—'
  if (h < 48) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function rateTone(rate: number, total: number): 'green' | 'amber' | 'red' | 'default' {
  if (total === 0) return 'default'
  if (rate >= 0.95) return 'green'
  if (rate >= 0.8) return 'amber'
  return 'red'
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string>('')
  const [incidentSummary, setIncidentSummary] = useState<IncidentSummary | null>(null)
  const [incidentLoading, setIncidentLoading] = useState(false)
  const [incidentError, setIncidentError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    Promise.all([api.getAnalyticsSummary(), api.getIncidents()])
      .then(([s, inc]) => {
        if (!alive) return
        setSummary(s as Summary)
        const list = asArray<Incident>(inc)
        setIncidents(list)
        if (list.length > 0) setSelectedId((cur) => cur || list[0].id)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load analytics')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const loadIncident = useCallback((id: string) => {
    if (!id) {
      setIncidentSummary(null)
      return
    }
    setIncidentLoading(true)
    setIncidentError(null)
    api
      .getIncidentAnalytics(id)
      .then((data) => setIncidentSummary(data as IncidentSummary))
      .catch((e) => setIncidentError(e instanceof Error ? e.message : 'Failed to load incident summary'))
      .finally(() => setIncidentLoading(false))
  }, [])

  useEffect(() => {
    loadIncident(selectedId)
  }, [selectedId, loadIncident])

  const totals = summary?.totals
  const trend = summary?.trend ?? []
  const byJurisdiction = summary?.byJurisdiction ?? []

  const trendMax = useMemo(() => trend.reduce((m, t) => Math.max(m, t.total), 0), [trend])

  if (loading) return <PageSpinner label="Loading analytics..." />

  if (error) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-red-500">Analytics</p>
          <h1 className="mt-1 text-2xl font-bold text-neutral-100">Program metrics</h1>
        </header>
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
        <Button variant="secondary" onClick={() => location.reload()}>
          Retry
        </Button>
      </div>
    )
  }

  const noData = !totals || totals.incidents === 0

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-red-500">Analytics</p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-100">Program metrics</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cross-incident compliance posture: obligations, on-time notice rate, jurisdiction load, and
          per-incident defensibility.
        </p>
      </header>

      {noData ? (
        <EmptyState
          icon="⏱"
          title="No program data yet"
          description="Once you create incidents and recompute obligations, your compliance metrics will appear here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Incidents" value={totals.incidents} hint={`${totals.openIncidents} open`} />
            <Stat
              label="Obligations"
              value={totals.obligations}
              hint={`${totals.openObligations} open · ${totals.sentObligations} sent`}
            />
            <Stat
              label="Overdue"
              value={totals.overdueObligations}
              tone={totals.overdueObligations > 0 ? 'red' : 'green'}
              hint="Past deadline, not sent"
            />
            <Stat
              label="On-time rate"
              value={pct(summary!.onTimeRate)}
              tone={rateTone(summary!.onTimeRate, totals.deliveries)}
              hint={`${totals.deliveries - totals.lateDeliveries}/${totals.deliveries} deliveries on time`}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Delivery trend chart (SVG-free bar chart via divs) */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-neutral-200">Delivery trend</h2>
                <p className="mt-0.5 text-xs text-neutral-500">Notices delivered per month, on-time vs late.</p>
              </CardHeader>
              <CardBody>
                {trend.length === 0 ? (
                  <p className="py-8 text-center text-sm text-neutral-600">No deliveries recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-end gap-2" style={{ height: 160 }}>
                      {trend.map((t) => {
                        const h = trendMax > 0 ? (t.total / trendMax) * 100 : 0
                        const lateH = t.total > 0 ? (t.late / t.total) * 100 : 0
                        return (
                          <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
                            <div
                              className="relative flex w-full max-w-[48px] flex-col justify-end overflow-hidden rounded-t bg-neutral-800"
                              style={{ height: `${Math.max(h, 4)}%`, minHeight: 4 }}
                              title={`${t.month}: ${t.onTime} on-time, ${t.late} late`}
                            >
                              <div className="w-full bg-emerald-600" style={{ height: `${100 - lateH}%` }} />
                              <div className="w-full bg-red-600" style={{ height: `${lateH}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex gap-2 border-t border-neutral-800 pt-2">
                      {trend.map((t) => (
                        <div key={t.month} className="flex-1 text-center text-[10px] text-neutral-500">
                          {t.month.slice(2)}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> On time
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-red-600" /> Late
                      </span>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* By jurisdiction */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-neutral-200">By jurisdiction</h2>
                <p className="mt-0.5 text-xs text-neutral-500">Obligation load and risk per jurisdiction.</p>
              </CardHeader>
              <CardBody className="p-0">
                {byJurisdiction.length === 0 ? (
                  <p className="py-8 text-center text-sm text-neutral-600">No obligations yet.</p>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Jurisdiction</TH>
                        <TH className="text-right">Total</TH>
                        <TH className="text-right">Sent</TH>
                        <TH className="text-right">Overdue</TH>
                        <TH className="text-right">Late</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {byJurisdiction.map((j) => (
                        <TR key={j.jurisdictionCode}>
                          <TD>
                            <span className="font-mono text-xs font-semibold text-neutral-100">
                              {j.jurisdictionCode}
                            </span>
                          </TD>
                          <TD className="text-right tabular-nums">{j.total}</TD>
                          <TD className="text-right tabular-nums text-emerald-400">{j.sent}</TD>
                          <TD className="text-right tabular-nums">
                            {j.overdue > 0 ? (
                              <span className="text-red-400">{j.overdue}</span>
                            ) : (
                              <span className="text-neutral-600">0</span>
                            )}
                          </TD>
                          <TD className="text-right tabular-nums">
                            {j.late > 0 ? (
                              <span className="text-amber-400">{j.late}</span>
                            ) : (
                              <span className="text-neutral-600">0</span>
                            )}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Per-incident summary */}
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-neutral-200">Per-incident summary</h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Drill into one incident&apos;s notice timeline and defensibility.
                </p>
              </div>
              <label className="flex flex-col gap-1 sm:w-72">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Incident</span>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  {incidents.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.reference_number ? `${i.reference_number} — ` : ''}
                      {i.title}
                    </option>
                  ))}
                </select>
              </label>
            </CardHeader>
            <CardBody>
              {incidentLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner label="Loading incident summary..." />
                </div>
              ) : incidentError ? (
                <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                  {incidentError}
                </div>
              ) : !incidentSummary ? (
                <p className="py-8 text-center text-sm text-neutral-600">Select an incident to view its summary.</p>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-neutral-100">{incidentSummary.title}</span>
                    {incidentSummary.severity && (
                      <Badge tone={incidentSummary.severity === 'critical' ? 'red' : 'amber'}>
                        {incidentSummary.severity}
                      </Badge>
                    )}
                    {incidentSummary.status && <Badge tone="zinc">{incidentSummary.status}</Badge>}
                  </div>

                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <Stat
                      label="Obligations"
                      value={incidentSummary.obligations}
                      hint={`${incidentSummary.open} open · ${incidentSummary.sent} sent`}
                    />
                    <Stat
                      label="Overdue"
                      value={incidentSummary.overdue}
                      tone={incidentSummary.overdue > 0 ? 'red' : 'green'}
                    />
                    <Stat
                      label="On-time rate"
                      value={pct(incidentSummary.onTimeRate)}
                      tone={rateTone(incidentSummary.onTimeRate, incidentSummary.deliveries)}
                      hint={`${incidentSummary.metOnTime}/${incidentSummary.deliveries} on time`}
                    />
                    <Stat
                      label="Time to first notice"
                      value={fmtHours(incidentSummary.timeToFirstNoticeHours)}
                      tone="amber"
                      hint="From earliest anchor"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Clock start</div>
                      <div className="mt-1 text-sm text-neutral-200">{fmtDate(incidentSummary.clockStartAt)}</div>
                    </div>
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">First notice</div>
                      <div className="mt-1 text-sm text-neutral-200">{fmtDate(incidentSummary.firstNoticeAt)}</div>
                    </div>
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Late notices</div>
                      <div className="mt-1 text-sm font-semibold tabular-nums text-neutral-200">
                        {incidentSummary.late > 0 ? (
                          <span className="text-red-400">{incidentSummary.late}</span>
                        ) : (
                          <span className="text-emerald-400">0</span>
                        )}{' '}
                        of {incidentSummary.deliveries}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
