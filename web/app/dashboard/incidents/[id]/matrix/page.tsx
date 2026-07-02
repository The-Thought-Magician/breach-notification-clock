'use client'

import { useEffect, useState, useCallback, useMemo, use } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type Obligation = {
  id: string
  incident_id: string
  rule_id?: string | null
  regulator_id?: string | null
  jurisdiction_code?: string | null
  recipient?: string | null
  recipient_type?: string | null
  deadline_at?: string | null
  clock_anchor?: string | null
  is_undue_delay?: boolean
  status?: string | null
  owner_id?: string | null
  source?: string | null
  why_triggered?: string | null
}

type SavedView = {
  id: string
  name: string
  config?: Record<string, unknown> | null
  is_default?: boolean
  is_shared?: boolean
}

const STATUSES = ['pending', 'in_progress', 'drafting', 'awaiting_signoff', 'delivered', 'not_required', 'closed']

type Band = 'overdue' | 'critical' | 'warning' | 'ok' | 'none'

function bandFor(deadlineAt?: string | null, status?: string | null): Band {
  if (status === 'delivered' || status === 'not_required' || status === 'closed') return 'ok'
  if (!deadlineAt) return 'none'
  const ms = new Date(deadlineAt).getTime() - Date.now()
  if (isNaN(ms)) return 'none'
  if (ms < 0) return 'overdue'
  const hrs = ms / 3_600_000
  if (hrs <= 24) return 'critical'
  if (hrs <= 72) return 'warning'
  return 'ok'
}

const BAND_META: Record<Band, { label: string; tone: 'red' | 'amber' | 'green' | 'zinc'; rowBg: string; bar: string }> = {
  overdue: { label: 'Overdue', tone: 'red', rowBg: 'bg-red-950/30', bar: 'bg-red-600' },
  critical: { label: '< 24h', tone: 'red', rowBg: 'bg-red-950/20', bar: 'bg-red-500' },
  warning: { label: '< 72h', tone: 'amber', rowBg: 'bg-amber-950/15', bar: 'bg-amber-500' },
  ok: { label: 'On track', tone: 'green', rowBg: '', bar: 'bg-emerald-500' },
  none: { label: 'No deadline', tone: 'zinc', rowBg: '', bar: 'bg-neutral-600' },
}

function fmtDeadline(s?: string | null): string {
  if (!s) return 'No deadline'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString()
}

function timeRemaining(s?: string | null): string {
  if (!s) return '—'
  const ms = new Date(s).getTime() - Date.now()
  if (isNaN(ms)) return '—'
  const abs = Math.abs(ms)
  const d = Math.floor(abs / 86_400_000)
  const h = Math.floor((abs % 86_400_000) / 3_600_000)
  const m = Math.floor((abs % 3_600_000) / 60_000)
  const str = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
  return ms < 0 ? `${str} late` : `${str} left`
}

export default function ObligationMatrixPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [obligations, setObligations] = useState<Obligation[]>([])
  const [views, setViews] = useState<SavedView[]>([])

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [jurisdictionFilter, setJurisdictionFilter] = useState('')
  const [bandFilter, setBandFilter] = useState('')

  // Selection / bulk
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkOwner, setBulkOwner] = useState('')
  const [applyingBulk, setApplyingBulk] = useState(false)

  // Save view modal
  const [saveViewOpen, setSaveViewOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const [viewShared, setViewShared] = useState(false)
  const [savingView, setSavingView] = useState(false)

  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [obl, vws] = await Promise.all([api.getObligations({ incidentId: id }), api.getViews()])
      const list: Obligation[] = Array.isArray(obl) ? obl : obl?.obligations ?? []
      setObligations(list)
      setViews(Array.isArray(vws) ? vws : vws?.views ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load obligations')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const jurisdictions = useMemo(
    () => Array.from(new Set(obligations.map((o) => o.jurisdiction_code).filter(Boolean) as string[])).sort(),
    [obligations]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return obligations
      .filter((o) => {
        if (statusFilter && o.status !== statusFilter) return false
        if (jurisdictionFilter && o.jurisdiction_code !== jurisdictionFilter) return false
        if (bandFilter && bandFor(o.deadline_at, o.status) !== bandFilter) return false
        if (q) {
          const hay = [o.recipient, o.recipient_type, o.jurisdiction_code, o.why_triggered, o.owner_id, o.source]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        const at = a.deadline_at ? new Date(a.deadline_at).getTime() : Number.MAX_SAFE_INTEGER
        const bt = b.deadline_at ? new Date(b.deadline_at).getTime() : Number.MAX_SAFE_INTEGER
        return at - bt
      })
  }, [obligations, search, statusFilter, jurisdictionFilter, bandFilter])

  const counts = useMemo(() => {
    const c: Record<Band, number> = { overdue: 0, critical: 0, warning: 0, ok: 0, none: 0 }
    for (const o of obligations) c[bandFor(o.deadline_at, o.status)]++
    return c
  }, [obligations])

  const allVisibleSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.id))

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((o) => o.id)))
    }
  }

  const toggleOne = (oid: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(oid)) next.delete(oid)
      else next.add(oid)
      return next
    })
  }

  const updateOne = async (oid: string, data: Partial<Obligation>) => {
    setActionError(null)
    try {
      const updated = await api.updateObligation(oid, data)
      const u: Obligation = updated?.obligation ?? updated
      setObligations((prev) => prev.map((o) => (o.id === oid ? { ...o, ...u } : o)))
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to update obligation')
    }
  }

  const applyBulk = async () => {
    if (selected.size === 0) return
    if (!bulkStatus && !bulkOwner.trim()) {
      setActionError('Set a status or owner to apply')
      return
    }
    setApplyingBulk(true)
    setActionError(null)
    const payload: Partial<Obligation> = {}
    if (bulkStatus) payload.status = bulkStatus
    if (bulkOwner.trim()) payload.owner_id = bulkOwner.trim()
    try {
      const ids = Array.from(selected)
      const results = await Promise.allSettled(ids.map((oid) => api.updateObligation(oid, payload)))
      const okIds = new Set<string>()
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') okIds.add(ids[i])
      })
      setObligations((prev) => prev.map((o) => (okIds.has(o.id) ? { ...o, ...payload } : o)))
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) setActionError(`${failed} of ${ids.length} updates failed.`)
      setSelected(new Set())
      setBulkStatus('')
      setBulkOwner('')
    } finally {
      setApplyingBulk(false)
    }
  }

  const saveView = async () => {
    if (!viewName.trim()) {
      setActionError('View name is required')
      return
    }
    setSavingView(true)
    setActionError(null)
    try {
      const config = {
        kind: 'obligation_matrix',
        incidentId: id,
        search,
        status: statusFilter,
        jurisdiction: jurisdictionFilter,
        band: bandFilter,
      }
      const created = await api.createView({ name: viewName.trim(), config, is_shared: viewShared })
      const v: SavedView = created?.view ?? created
      setViews((prev) => [...prev, v])
      setSaveViewOpen(false)
      setViewName('')
      setViewShared(false)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save view')
    } finally {
      setSavingView(false)
    }
  }

  const applyView = (v: SavedView) => {
    const cfg = (v.config ?? {}) as Record<string, unknown>
    setSearch(typeof cfg.search === 'string' ? cfg.search : '')
    setStatusFilter(typeof cfg.status === 'string' ? cfg.status : '')
    setJurisdictionFilter(typeof cfg.jurisdiction === 'string' ? cfg.jurisdiction : '')
    setBandFilter(typeof cfg.band === 'string' ? cfg.band : '')
  }

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('')
    setJurisdictionFilter('')
    setBandFilter('')
  }

  if (loading) return <PageSpinner label="Loading obligation matrix..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-neutral-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Link href="/dashboard/incidents" className="hover:text-neutral-300">
              Incidents
            </Link>
            <span>/</span>
            <Link href={`/dashboard/incidents/${id}`} className="hover:text-neutral-300">
              Detail
            </Link>
            <span>/</span>
            <span className="text-neutral-400">Matrix</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-neutral-100">Obligation Matrix</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setSaveViewOpen(true)}>
            Save View
          </Button>
          <Link href={`/dashboard/incidents/${id}/warroom`}>
            <Button size="sm">War Room</Button>
          </Link>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">{actionError}</div>
      )}

      {/* Band stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Overdue" value={counts.overdue} tone={counts.overdue ? 'red' : 'default'} />
        <Stat label="< 24h" value={counts.critical} tone={counts.critical ? 'red' : 'default'} />
        <Stat label="< 72h" value={counts.warning} tone={counts.warning ? 'amber' : 'default'} />
        <Stat label="On track" value={counts.ok} tone="green" />
        <Stat label="Total" value={obligations.length} />
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs font-medium text-neutral-400">Search</label>
            <input
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
              placeholder="recipient, jurisdiction, reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Status</label>
            <select
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Jurisdiction</label>
            <select
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
              value={jurisdictionFilter}
              onChange={(e) => setJurisdictionFilter(e.target.value)}
            >
              <option value="">All</option>
              {jurisdictions.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Band</label>
            <select
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
              value={bandFilter}
              onChange={(e) => setBandFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="overdue">Overdue</option>
              <option value="critical">&lt; 24h</option>
              <option value="warning">&lt; 72h</option>
              <option value="ok">On track</option>
              <option value="none">No deadline</option>
            </select>
          </div>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        </CardBody>
      </Card>

      {/* Saved views */}
      {views.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">Saved views:</span>
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() => applyView(v)}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300 hover:border-red-700 hover:text-white"
            >
              {v.name}
              {v.is_shared && <span className="text-neutral-500">(shared)</span>}
            </button>
          ))}
        </div>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-800/60 bg-red-950/20 px-4 py-3">
          <span className="text-sm font-medium text-neutral-200">{selected.size} selected</span>
          <select
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
          >
            <option value="">Set status…</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
            placeholder="Set owner id…"
            value={bulkOwner}
            onChange={(e) => setBulkOwner(e.target.value)}
          />
          <Button size="sm" onClick={applyBulk} disabled={applyingBulk}>
            {applyingBulk ? <Spinner /> : 'Apply'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {/* Table */}
      {obligations.length === 0 ? (
        <EmptyState
          title="No obligations yet"
          description="Run the obligation engine on the incident detail page to generate the matrix from anchors and facts."
          action={
            <Link href={`/dashboard/incidents/${id}`}>
              <Button>Go to incident detail</Button>
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No obligations match your filters" action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>} />
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH className="w-10">
                <input type="checkbox" className="h-4 w-4 accent-red-600" checked={allVisibleSelected} onChange={toggleAll} />
              </TH>
              <TH>Recipient</TH>
              <TH>Jurisdiction</TH>
              <TH>Deadline</TH>
              <TH>Remaining</TH>
              <TH>Status</TH>
              <TH>Owner</TH>
              <TH>Reason</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((o) => {
              const band = bandFor(o.deadline_at, o.status)
              const meta = BAND_META[band]
              return (
                <TR key={o.id} className={meta.rowBg}>
                  <TD>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-red-600"
                      checked={selected.has(o.id)}
                      onChange={() => toggleOne(o.id)}
                    />
                  </TD>
                  <TD>
                    <Link href={`/dashboard/obligations/${o.id}`} className="font-medium text-neutral-100 hover:text-red-400">
                      {o.recipient || 'Recipient'}
                    </Link>
                    <div className="text-xs text-neutral-500">{o.recipient_type || ''}</div>
                  </TD>
                  <TD>
                    <Badge tone="zinc">{o.jurisdiction_code || '—'}</Badge>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${meta.bar}`} />
                      <span className="text-xs text-neutral-300">{fmtDeadline(o.deadline_at)}</span>
                    </div>
                    {o.is_undue_delay && <span className="text-[10px] uppercase text-amber-400">without undue delay</span>}
                  </TD>
                  <TD>
                    <Badge tone={meta.tone}>{timeRemaining(o.deadline_at)}</Badge>
                  </TD>
                  <TD>
                    <select
                      className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 focus:border-red-600 focus:outline-none"
                      value={o.status ?? 'pending'}
                      onChange={(e) => updateOne(o.id, { status: e.target.value })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </TD>
                  <TD>
                    <input
                      className="w-28 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 focus:border-red-600 focus:outline-none"
                      placeholder="unassigned"
                      defaultValue={o.owner_id ?? ''}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v !== (o.owner_id ?? '')) updateOne(o.id, { owner_id: v || null })
                      }}
                    />
                  </TD>
                  <TD className="max-w-[220px]">
                    <span className="block truncate text-xs text-neutral-500" title={o.why_triggered ?? ''}>
                      {o.why_triggered || '—'}
                    </span>
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      )}

      {/* Save view modal */}
      <Modal
        open={saveViewOpen}
        onClose={() => setSaveViewOpen(false)}
        title="Save Current View"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveViewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveView} disabled={savingView}>
              {savingView ? <Spinner /> : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-neutral-500">Saves the current filters (search, status, jurisdiction, band) as a reusable view.</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">View Name</label>
            <input
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" className="h-4 w-4 accent-red-600" checked={viewShared} onChange={(e) => setViewShared(e.target.checked)} />
            Share with team
          </label>
        </div>
      </Modal>
    </div>
  )
}
