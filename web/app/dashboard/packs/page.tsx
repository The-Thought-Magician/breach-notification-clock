'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'

interface Incident {
  id: string
  title: string
  reference_number?: string | null
  severity?: string
  status?: string
  is_drill?: boolean
}

interface Pack {
  id: string
  incident_id: string
  integrity_hash: string
  snapshot?: Record<string, unknown> | null
  generated_by: string
  created_at: string
}

function shortHash(h: string): string {
  if (!h) return '—'
  return h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

export default function PacksPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [packsByIncident, setPacksByIncident] = useState<Record<string, Pack[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // snapshot viewer
  const [viewOpen, setViewOpen] = useState(false)
  const [viewLoading, setViewLoading] = useState(false)
  const [viewPack, setViewPack] = useState<Pack | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const inc: Incident[] = await api.getIncidents()
      const list = Array.isArray(inc) ? inc : []
      setIncidents(list)
      const entries = await Promise.all(
        list.map(async (i) => {
          try {
            const packs: Pack[] = await api.getPacks(i.id)
            return [i.id, Array.isArray(packs) ? packs : []] as const
          } catch {
            return [i.id, [] as Pack[]] as const
          }
        }),
      )
      setPacksByIncident(Object.fromEntries(entries))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load defensibility packs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const totalPacks = useMemo(
    () => Object.values(packsByIncident).reduce((acc, p) => acc + p.length, 0),
    [packsByIncident],
  )
  const coveredIncidents = useMemo(
    () => Object.values(packsByIncident).filter((p) => p.length > 0).length,
    [packsByIncident],
  )

  const visibleIncidents = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return incidents
    return incidents.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.reference_number ?? '').toLowerCase().includes(q),
    )
  }, [incidents, search])

  async function generate(incidentId: string) {
    setGeneratingId(incidentId)
    setActionError(null)
    try {
      const pack: Pack = await api.generatePack({ incidentId })
      setPacksByIncident((prev) => ({
        ...prev,
        [incidentId]: [pack, ...(prev[incidentId] ?? [])],
      }))
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to generate pack')
    } finally {
      setGeneratingId(null)
    }
  }

  async function openSnapshot(pack: Pack) {
    setViewOpen(true)
    setViewPack(pack)
    // if snapshot not present, fetch full pack detail
    if (!pack.snapshot || Object.keys(pack.snapshot).length === 0) {
      setViewLoading(true)
      try {
        const full: Pack = await api.getPack(pack.id)
        setViewPack(full)
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Failed to load snapshot')
      } finally {
        setViewLoading(false)
      }
    }
  }

  if (loading) return <PageSpinner label="Loading defensibility packs..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">Defensibility Packs</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Immutable, hash-sealed snapshots of an incident&apos;s timeline, obligations, notices
            and deliveries. Generate one to evidence a defensible response to regulators.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Incidents" value={incidents.length} />
        <Stat label="Packs sealed" value={totalPacks} tone={totalPacks > 0 ? 'green' : 'default'} />
        <Stat label="Incidents covered" value={coveredIncidents} />
        <Stat
          label="Uncovered"
          value={incidents.length - coveredIncidents}
          tone={incidents.length - coveredIncidents > 0 ? 'amber' : 'green'}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {actionError && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          {actionError}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search incidents..."
          className="w-64 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-600 focus:border-red-600 focus:outline-none"
        />
      </div>

      {incidents.length === 0 ? (
        <EmptyState
          title="No incidents yet"
          description="Create an incident first, then generate a defensibility pack to seal its record."
          icon="🗂️"
        />
      ) : visibleIncidents.length === 0 ? (
        <EmptyState title="No incidents match your search" icon="🔍" />
      ) : (
        <div className="space-y-4">
          {visibleIncidents.map((inc) => {
            const packs = packsByIncident[inc.id] ?? []
            return (
              <Card key={inc.id}>
                <CardHeader className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-neutral-100">{inc.title}</span>
                      {inc.is_drill && <Badge tone="blue">Drill</Badge>}
                      {inc.severity && (
                        <Badge tone={inc.severity === 'critical' || inc.severity === 'high' ? 'red' : 'zinc'}>
                          {inc.severity}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {inc.reference_number || inc.id} · {packs.length} pack
                      {packs.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <Button
                    className="ml-auto"
                    size="sm"
                    onClick={() => generate(inc.id)}
                    disabled={generatingId === inc.id}
                  >
                    {generatingId === inc.id ? <Spinner label="Sealing..." /> : 'Generate pack'}
                  </Button>
                </CardHeader>
                <CardBody className="p-0">
                  {packs.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-neutral-500">
                      No packs sealed for this incident yet.
                    </div>
                  ) : (
                    <ul className="divide-y divide-neutral-800">
                      {packs.map((p, idx) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-neutral-900/50"
                        >
                          <Badge tone={idx === 0 ? 'green' : 'zinc'}>
                            {idx === 0 ? 'Latest' : `v${packs.length - idx}`}
                          </Badge>
                          <code className="rounded bg-neutral-950 px-2 py-0.5 font-mono text-xs text-neutral-400">
                            {shortHash(p.integrity_hash)}
                          </code>
                          <span className="text-xs text-neutral-500">{fmtDate(p.created_at)}</span>
                          <Button
                            className="ml-auto"
                            variant="ghost"
                            size="sm"
                            onClick={() => openSnapshot(p)}
                          >
                            View snapshot
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title="Pack snapshot"
        className="max-w-3xl"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setViewOpen(false)}>
            Close
          </Button>
        }
      >
        {viewLoading || !viewPack ? (
          <Spinner label="Loading snapshot..." />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500">Integrity hash</div>
                <code className="mt-1 block break-all rounded bg-neutral-950 px-2 py-1 font-mono text-xs text-emerald-400">
                  {viewPack.integrity_hash}
                </code>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500">Generated</div>
                <div className="mt-1 text-sm text-neutral-300">{fmtDate(viewPack.created_at)}</div>
                <div className="mt-1 text-xs text-neutral-500">by {viewPack.generated_by}</div>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
                Sealed snapshot
              </div>
              <pre className="max-h-[50vh] overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs leading-relaxed text-neutral-300">
                {JSON.stringify(viewPack.snapshot ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
