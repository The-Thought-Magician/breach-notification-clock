'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Incident {
  id: string
  title: string
  reference_number?: string | null
}

interface Activity {
  id: string
  incident_id?: string | null
  actor_id: string
  action: string
  entity_type: string
  entity_id: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  created_at: string
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function fmtDateTime(s: string) {
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function relTime(s: string) {
  const d = new Date(s).getTime()
  if (isNaN(d)) return ''
  const diff = Date.now() - d
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

function actionTone(action: string): 'green' | 'red' | 'amber' | 'blue' | 'zinc' {
  const a = action.toLowerCase()
  if (a.includes('create') || a.includes('add') || a.includes('generate')) return 'green'
  if (a.includes('delete') || a.includes('remove')) return 'red'
  if (a.includes('deliver') || a.includes('approve') || a.includes('sign')) return 'blue'
  if (a.includes('update') || a.includes('edit') || a.includes('recompute')) return 'amber'
  return 'zinc'
}

function actorShort(id: string) {
  if (!id) return '—'
  return id.length > 10 ? `${id.slice(0, 8)}…` : id
}

export default function ActivityPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [incidentFilter, setIncidentFilter] = useState<string>('')
  const [entityFilter, setEntityFilter] = useState<string>('')
  const [actionFilter, setActionFilter] = useState<string>('')
  const [search, setSearch] = useState('')

  const [detail, setDetail] = useState<Activity | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .getIncidents()
      .then((data) => {
        if (alive) setIncidents(asArray<Incident>(data))
      })
      .catch(() => {
        /* incidents are only used for the filter label; non-fatal */
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const load = useCallback((incidentId: string, initial = false) => {
    if (!initial) setReloading(true)
    setError(null)
    api
      .getActivity(incidentId ? { incidentId } : undefined)
      .then((data) => setActivity(asArray<Activity>(data)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load activity'))
      .finally(() => setReloading(false))
  }, [])

  useEffect(() => {
    load(incidentFilter, true)
  }, [incidentFilter, load])

  const incidentTitle = useCallback(
    (id?: string | null) => {
      if (!id) return null
      const inc = incidents.find((i) => i.id === id)
      if (!inc) return id.slice(0, 8)
      return inc.reference_number || inc.title
    },
    [incidents],
  )

  const entityTypes = useMemo(
    () => Array.from(new Set(activity.map((a) => a.entity_type))).sort(),
    [activity],
  )
  const actions = useMemo(
    () => Array.from(new Set(activity.map((a) => a.action))).sort(),
    [activity],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return activity.filter((a) => {
      if (entityFilter && a.entity_type !== entityFilter) return false
      if (actionFilter && a.action !== actionFilter) return false
      if (q) {
        const hay = `${a.action} ${a.entity_type} ${a.entity_id} ${a.actor_id}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [activity, entityFilter, actionFilter, search])

  const todayCount = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return activity.filter((a) => new Date(a.created_at).getTime() >= start.getTime()).length
  }, [activity])

  const distinctActors = useMemo(
    () => new Set(activity.map((a) => a.actor_id)).size,
    [activity],
  )

  function clearFilters() {
    setIncidentFilter('')
    setEntityFilter('')
    setActionFilter('')
    setSearch('')
  }

  const hasFilters = !!(incidentFilter || entityFilter || actionFilter || search)

  if (loading) return <PageSpinner label="Loading activity log..." />

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-red-500">Activity Log</p>
          <h1 className="mt-1 text-2xl font-bold text-neutral-100">Audit trail</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Append-only record of every change across your incidents. Defensible evidence of who did what,
            when.
          </p>
        </div>
        <Button variant="secondary" onClick={() => load(incidentFilter)} disabled={reloading}>
          {reloading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total events" value={activity.length} hint={incidentFilter ? 'For selected incident' : 'Across your incidents'} />
        <Stat label="Today" value={todayCount} tone="amber" hint="Events since midnight" />
        <Stat label="Actors" value={distinctActors} hint="Distinct users" />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:flex-row">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Incident</span>
                <select
                  value={incidentFilter}
                  onChange={(e) => setIncidentFilter(e.target.value)}
                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 lg:w-52"
                >
                  <option value="">All incidents</option>
                  {incidents.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.reference_number ? `${i.reference_number} — ` : ''}
                      {i.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Entity</span>
                <select
                  value={entityFilter}
                  onChange={(e) => setEntityFilter(e.target.value)}
                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 lg:w-44"
                >
                  <option value="">All types</option>
                  {entityTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Action</span>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 lg:w-44"
                >
                  <option value="">All actions</option>
                  {actions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-end gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search action, entity, actor..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 lg:w-64"
              />
              {hasFilters && (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {error ? (
            <div className="px-5 py-4">
              <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            </div>
          ) : reloading ? (
            <div className="flex justify-center py-12">
              <Spinner label="Loading..." />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10">
              <EmptyState
                title={activity.length === 0 ? 'No activity yet' : 'No matching events'}
                description={
                  activity.length === 0
                    ? 'As you create incidents, edit facts, recompute obligations, and deliver notices, every action is logged here.'
                    : 'No events match the current filters.'
                }
                action={
                  activity.length > 0 && hasFilters ? (
                    <Button variant="secondary" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Action</TH>
                  <TH>Entity</TH>
                  <TH className="hidden md:table-cell">Incident</TH>
                  <TH className="hidden lg:table-cell">Actor</TH>
                  <TH className="text-right">Detail</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <div className="whitespace-nowrap text-sm text-neutral-200">{relTime(a.created_at)}</div>
                      <div className="whitespace-nowrap text-xs text-neutral-500">{fmtDateTime(a.created_at)}</div>
                    </TD>
                    <TD>
                      <Badge tone={actionTone(a.action)}>{a.action}</Badge>
                    </TD>
                    <TD>
                      <div className="text-sm text-neutral-200">{a.entity_type}</div>
                      <div className="font-mono text-xs text-neutral-600">{actorShort(a.entity_id)}</div>
                    </TD>
                    <TD className="hidden md:table-cell">
                      {a.incident_id ? (
                        <span className="text-sm text-neutral-300">{incidentTitle(a.incident_id)}</span>
                      ) : (
                        <span className="text-xs text-neutral-600">global</span>
                      )}
                    </TD>
                    <TD className="hidden lg:table-cell">
                      <span className="font-mono text-xs text-neutral-400">{actorShort(a.actor_id)}</span>
                    </TD>
                    <TD className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDetail(a)}>
                        View
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.action} · ${detail.entity_type}` : ''}
      >
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">When</div>
                <div className="mt-0.5 text-neutral-200">{fmtDateTime(detail.created_at)}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Actor</div>
                <div className="mt-0.5 break-all font-mono text-xs text-neutral-300">{detail.actor_id}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Entity type</div>
                <div className="mt-0.5 text-neutral-200">{detail.entity_type}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Entity id</div>
                <div className="mt-0.5 break-all font-mono text-xs text-neutral-300">{detail.entity_id}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Incident</div>
                <div className="mt-0.5 text-neutral-200">
                  {detail.incident_id ? incidentTitle(detail.incident_id) : 'Global (no incident)'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Before</div>
                <pre className="max-h-48 overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-400">
                  {detail.before && Object.keys(detail.before).length > 0
                    ? JSON.stringify(detail.before, null, 2)
                    : '—'}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">After</div>
                <pre className="max-h-48 overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs text-emerald-300/80">
                  {detail.after && Object.keys(detail.after).length > 0
                    ? JSON.stringify(detail.after, null, 2)
                    : '—'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
