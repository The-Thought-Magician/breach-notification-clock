'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Incident {
  id: string
  title: string
  reference_number?: string | null
  severity?: string
  status?: string
  is_drill?: boolean
  is_confidential?: boolean
  summary?: string | null
  created_at?: string
  updated_at?: string
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

const SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low']
const STATUS_OPTIONS = ['triage', 'investigating', 'notifying', 'monitoring', 'closed']

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showDrills, setShowDrills] = useState(true)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getIncidents()
      setIncidents(Array.isArray(res) ? res : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load incidents')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return incidents.filter((i) => {
      if (severityFilter && (i.severity ?? '').toLowerCase() !== severityFilter) return false
      if (statusFilter && (i.status ?? '').toLowerCase() !== statusFilter) return false
      if (!showDrills && i.is_drill) return false
      if (q) {
        const hay = `${i.title} ${i.reference_number ?? ''} ${i.summary ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [incidents, search, severityFilter, statusFilter, showDrills])

  const stats = useMemo(() => {
    const open = incidents.filter((i) => !['closed', 'resolved'].includes((i.status ?? '').toLowerCase())).length
    const critical = incidents.filter((i) => ['critical', 'high'].includes((i.severity ?? '').toLowerCase())).length
    const drills = incidents.filter((i) => i.is_drill).length
    return { total: incidents.length, open, critical, drills }
  }, [incidents])

  const allVisibleSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id))

  const toggleAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev)
        filtered.forEach((i) => next.delete(i.id))
        return next
      }
      const next = new Set(prev)
      filtered.forEach((i) => next.add(i.id))
      return next
    })
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const bulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} incident(s)? This cannot be undone.`)) return
    setBulkBusy(true)
    setError(null)
    const ids = Array.from(selected)
    try {
      const results = await Promise.allSettled(ids.map((id) => api.deleteIncident(id)))
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) setError(`${failed} incident(s) could not be deleted.`)
      setSelected(new Set())
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk delete failed')
    } finally {
      setBulkBusy(false)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setSeverityFilter('')
    setStatusFilter('')
    setShowDrills(true)
  }

  if (loading) return <PageSpinner label="Loading incidents..." />

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Incidents</h1>
          <p className="mt-1 text-sm text-zinc-500">Every logged breach incident, ranked by severity and status.</p>
        </div>
        <Link href="/dashboard/incidents/new">
          <Button>New incident</Button>
        </Link>
      </header>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total" value={stats.total} />
        <Stat label="Open" value={stats.open} tone={stats.open > 0 ? 'amber' : 'default'} />
        <Stat label="High / Critical" value={stats.critical} tone={stats.critical > 0 ? 'red' : 'default'} />
        <Stat label="Drills" value={stats.drills} tone="default" />
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, reference, summary..."
            className="w-full flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-red-500 focus:outline-none"
          >
            <option value="">All severities</option>
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-red-500 focus:outline-none"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <label className="inline-flex select-none items-center gap-2 whitespace-nowrap text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={showDrills}
              onChange={(e) => setShowDrills(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-red-600"
            />
            Show drills
          </label>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        </CardBody>
      </Card>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm">
          <span className="text-zinc-200">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            {bulkBusy && <Spinner />}
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={bulkBusy}>
              Deselect
            </Button>
            <Button variant="danger" size="sm" onClick={bulkDelete} disabled={bulkBusy}>
              Delete selected
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {incidents.length === 0 ? (
        <EmptyState
          title="No incidents yet"
          description="Log your first breach incident to start tracking notification deadlines."
          action={
            <Link href="/dashboard/incidents/new">
              <Button>New incident</Button>
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No incidents match your filters"
          description="Try adjusting the search or filter criteria."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH className="w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-red-600"
                />
              </TH>
              <TH>Incident</TH>
              <TH>Severity</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((i) => (
              <TR key={i.id} className={selected.has(i.id) ? 'bg-red-950/20' : ''}>
                <TD>
                  <input
                    type="checkbox"
                    checked={selected.has(i.id)}
                    onChange={() => toggleOne(i.id)}
                    aria-label={`Select ${i.title}`}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-red-600"
                  />
                </TD>
                <TD>
                  <Link href={`/dashboard/incidents/${i.id}`} className="font-medium text-zinc-100 hover:text-red-300">
                    {i.title}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                    {i.reference_number && <span className="font-mono">{i.reference_number}</span>}
                    {i.is_drill && <Badge tone="blue">drill</Badge>}
                    {i.is_confidential && <Badge tone="zinc">confidential</Badge>}
                  </div>
                </TD>
                <TD>
                  <Badge tone={SEVERITY_TONE[(i.severity ?? '').toLowerCase()] ?? 'zinc'}>{i.severity || 'unset'}</Badge>
                </TD>
                <TD>
                  <Badge tone={STATUS_TONE[(i.status ?? '').toLowerCase()] ?? 'zinc'}>{i.status || 'triage'}</Badge>
                </TD>
                <TD className="whitespace-nowrap text-xs text-zinc-500">
                  {i.created_at ? new Date(i.created_at).toLocaleDateString() : '—'}
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Link href={`/dashboard/incidents/${i.id}/warroom`}>
                      <Button variant="ghost" size="sm">
                        War room
                      </Button>
                    </Link>
                    <Link href={`/dashboard/incidents/${i.id}`}>
                      <Button variant="secondary" size="sm">
                        Open
                      </Button>
                    </Link>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <p className="text-xs text-zinc-600">
        Showing {filtered.length} of {incidents.length} incidents.
      </p>
    </div>
  )
}
