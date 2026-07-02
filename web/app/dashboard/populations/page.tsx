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
  severity?: string | null
  status?: string | null
}

interface Population {
  id: string
  incident_id: string
  jurisdiction_code: string
  count: number
  data_categories?: string[] | null
  created_at?: string
}

const CATEGORY_OPTIONS = [
  'name',
  'email',
  'phone',
  'address',
  'national_id',
  'financial',
  'health',
  'credentials',
  'biometric',
  'location',
]

function nf(n: number) {
  return new Intl.NumberFormat('en-US').format(n)
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

export default function PopulationsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [incidentsLoading, setIncidentsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('')

  const [populations, setPopulations] = useState<Population[]>([])
  const [popLoading, setPopLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Population | null>(null)
  const [form, setForm] = useState({ jurisdiction_code: '', count: '', data_categories: [] as string[] })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setIncidentsLoading(true)
    api
      .getIncidents()
      .then((data) => {
        if (!alive) return
        const list = asArray<Incident>(data)
        setIncidents(list)
        if (list.length > 0) setSelectedId((cur) => cur || list[0].id)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load incidents')
      })
      .finally(() => {
        if (alive) setIncidentsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const loadPopulations = useCallback((incidentId: string) => {
    if (!incidentId) {
      setPopulations([])
      return
    }
    setPopLoading(true)
    setError(null)
    api
      .getPopulations(incidentId)
      .then((data) => setPopulations(asArray<Population>(data)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load populations'))
      .finally(() => setPopLoading(false))
  }, [])

  useEffect(() => {
    loadPopulations(selectedId)
  }, [selectedId, loadPopulations])

  const selectedIncident = useMemo(
    () => incidents.find((i) => i.id === selectedId) || null,
    [incidents, selectedId],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = q
      ? populations.filter(
          (p) =>
            p.jurisdiction_code.toLowerCase().includes(q) ||
            asArray<string>(p.data_categories).some((c) => c.toLowerCase().includes(q)),
        )
      : populations
    return [...rows].sort((a, b) => b.count - a.count)
  }, [populations, search])

  const totalAffected = useMemo(() => populations.reduce((s, p) => s + (p.count || 0), 0), [populations])
  const maxCount = useMemo(() => populations.reduce((m, p) => Math.max(m, p.count || 0), 0), [populations])
  const jurisdictionCount = populations.length

  function openCreate() {
    setEditing(null)
    setForm({ jurisdiction_code: '', count: '', data_categories: [] })
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(p: Population) {
    setEditing(p)
    setForm({
      jurisdiction_code: p.jurisdiction_code,
      count: String(p.count ?? ''),
      data_categories: asArray<string>(p.data_categories),
    })
    setFormError(null)
    setModalOpen(true)
  }

  function toggleCategory(c: string) {
    setForm((f) => ({
      ...f,
      data_categories: f.data_categories.includes(c)
        ? f.data_categories.filter((x) => x !== c)
        : [...f.data_categories, c],
    }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    const code = form.jurisdiction_code.trim().toUpperCase()
    const count = Number(form.count)
    if (!code) {
      setFormError('Jurisdiction code is required')
      return
    }
    if (!Number.isFinite(count) || count < 0) {
      setFormError('Count must be a non-negative number')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      // upsert: backend uses UNIQUE(incident_id, jurisdiction_code)
      await api.savePopulation({
        incidentId: selectedId,
        jurisdictionCode: code,
        count,
        dataCategories: form.data_categories,
      })
      setModalOpen(false)
      loadPopulations(selectedId)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function remove(p: Population) {
    if (!confirm(`Remove affected population for ${p.jurisdiction_code}?`)) return
    setDeletingId(p.id)
    try {
      await api.deletePopulation(p.id)
      setPopulations((cur) => cur.filter((x) => x.id !== p.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  if (incidentsLoading) return <PageSpinner label="Loading incidents..." />

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-red-500">Affected Populations</p>
          <h1 className="mt-1 text-2xl font-bold text-neutral-100">Per-jurisdiction headcount</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Record how many residents are affected in each jurisdiction. These counts drive resident-threshold
            triggers in the obligation engine.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!selectedId}>
          + Add jurisdiction
        </Button>
      </header>

      {incidents.length === 0 ? (
        <EmptyState
          icon="⚠"
          title="No incidents yet"
          description="Create an incident first, then return here to record affected populations per jurisdiction."
        />
      ) : (
        <>
          <Card>
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex flex-1 flex-col gap-1 sm:max-w-md">
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
              {selectedIncident && (
                <div className="flex flex-wrap items-center gap-2">
                  {selectedIncident.severity && (
                    <Badge tone={selectedIncident.severity === 'critical' ? 'red' : 'amber'}>
                      {selectedIncident.severity}
                    </Badge>
                  )}
                  {selectedIncident.status && <Badge tone="zinc">{selectedIncident.status}</Badge>}
                </div>
              )}
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Total affected" value={nf(totalAffected)} tone="red" hint="Across all jurisdictions" />
            <Stat label="Jurisdictions" value={jurisdictionCount} hint="Distinct rows recorded" />
            <Stat label="Largest population" value={nf(maxCount)} tone="amber" hint="Highest single jurisdiction" />
          </div>

          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-neutral-200">Breakdown</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by jurisdiction or category..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 sm:w-64"
              />
            </CardHeader>
            <CardBody className="p-0">
              {popLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner label="Loading populations..." />
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-5 py-10">
                  <EmptyState
                    title={populations.length === 0 ? 'No populations recorded' : 'No matches'}
                    description={
                      populations.length === 0
                        ? 'Add a jurisdiction to start tracking affected residents for this incident.'
                        : 'No jurisdictions match your filter.'
                    }
                    action={
                      populations.length === 0 ? (
                        <Button onClick={openCreate}>+ Add jurisdiction</Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Jurisdiction</TH>
                      <TH>Affected</TH>
                      <TH className="hidden md:table-cell">Share</TH>
                      <TH className="hidden lg:table-cell">Data categories</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filtered.map((p) => {
                      const share = totalAffected > 0 ? (p.count / totalAffected) * 100 : 0
                      const bar = maxCount > 0 ? (p.count / maxCount) * 100 : 0
                      return (
                        <TR key={p.id}>
                          <TD>
                            <span className="font-mono text-sm font-semibold text-neutral-100">
                              {p.jurisdiction_code}
                            </span>
                          </TD>
                          <TD className="tabular-nums font-semibold">{nf(p.count || 0)}</TD>
                          <TD className="hidden md:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-28 overflow-hidden rounded-full bg-neutral-800">
                                <div
                                  className="h-full rounded-full bg-red-600"
                                  style={{ width: `${bar}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums text-neutral-500">{share.toFixed(1)}%</span>
                            </div>
                          </TD>
                          <TD className="hidden lg:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {asArray<string>(p.data_categories).length === 0 ? (
                                <span className="text-xs text-neutral-600">—</span>
                              ) : (
                                asArray<string>(p.data_categories).map((c) => (
                                  <Badge key={c} tone="zinc">
                                    {c}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TD>
                          <TD className="text-right">
                            <div className="inline-flex gap-2">
                              <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => remove(p)}
                                disabled={deletingId === p.id}
                              >
                                {deletingId === p.id ? '...' : 'Delete'}
                              </Button>
                            </div>
                          </TD>
                        </TR>
                      )
                    })}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.jurisdiction_code}` : 'Add affected jurisdiction'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="population-form" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Add jurisdiction'}
            </Button>
          </>
        }
      >
        <form id="population-form" onSubmit={submit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Jurisdiction code</span>
            <input
              value={form.jurisdiction_code}
              onChange={(e) => setForm((f) => ({ ...f, jurisdiction_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. US-CA, EU-DE, UK"
              disabled={!!editing}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm uppercase text-neutral-100 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-60"
            />
            {editing && (
              <span className="text-xs text-neutral-600">Jurisdiction is fixed; delete and re-add to change.</span>
            )}
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Affected residents</span>
            <input
              type="number"
              min={0}
              value={form.count}
              onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))}
              placeholder="0"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm tabular-nums text-neutral-100 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </label>
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Data categories</span>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((c) => {
                const on = form.data_categories.includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCategory(c)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      on
                        ? 'border-red-700 bg-red-950/60 text-red-300'
                        : 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-600'
                    }`}
                  >
                    {c}
                  </button>
                )
              })}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
