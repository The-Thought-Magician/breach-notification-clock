'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Jurisdiction {
  id: string
  code: string
  name: string
  region?: string | null
  sector?: string | null
  created_at?: string
}

export default function JurisdictionsPage() {
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [regionFilter, setRegionFilter] = useState<string>('all')

  const [detail, setDetail] = useState<Jurisdiction | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getJurisdictions()
      setJurisdictions(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load jurisdictions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function openDetail(id: string) {
    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)
    try {
      const data = await api.getJurisdiction(id)
      setDetail(data)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Failed to load jurisdiction')
    } finally {
      setDetailLoading(false)
    }
  }

  const regions = useMemo(() => {
    const set = new Set<string>()
    for (const j of jurisdictions) if (j.region) set.add(j.region)
    return Array.from(set).sort()
  }, [jurisdictions])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return jurisdictions.filter((j) => {
      if (regionFilter !== 'all' && j.region !== regionFilter) return false
      if (!q) return true
      return (
        j.name.toLowerCase().includes(q) ||
        j.code.toLowerCase().includes(q) ||
        (j.sector ?? '').toLowerCase().includes(q) ||
        (j.region ?? '').toLowerCase().includes(q)
      )
    })
  }, [jurisdictions, search, regionFilter])

  const byRegion = useMemo(() => {
    const map = new Map<string, number>()
    for (const j of jurisdictions) {
      const k = j.region || 'Unspecified'
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [jurisdictions])

  const maxRegion = byRegion.length ? Math.max(...byRegion.map(([, n]) => n)) : 0
  const sectorCount = useMemo(
    () => new Set(jurisdictions.map((j) => j.sector).filter(Boolean)).size,
    [jurisdictions]
  )

  if (loading) return <PageSpinner label="Loading jurisdictions..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Jurisdiction Registry</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Statutory breach-notification jurisdictions that drive obligation deadlines.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Jurisdictions" value={jurisdictions.length} />
        <Stat label="Regions" value={regions.length} tone="amber" />
        <Stat label="Sectors" value={sectorCount} tone="green" />
        <Stat label="Matches" value={filtered.length} tone="red" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-200">Jurisdictions</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, name, sector..."
                className="w-56 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-red-600 focus:outline-none"
              />
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 focus:border-red-600 focus:outline-none"
              >
                <option value="all">All regions</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {filtered.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title={jurisdictions.length === 0 ? 'No jurisdictions' : 'No matches'}
                  description={
                    jurisdictions.length === 0
                      ? 'The jurisdiction registry is empty. Seed reference data to populate it.'
                      : 'No jurisdiction matches the current search or region filter.'
                  }
                />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Code</TH>
                    <TH>Name</TH>
                    <TH>Region</TH>
                    <TH>Sector</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((j) => (
                    <TR key={j.id} className="cursor-pointer" onClick={() => openDetail(j.id)}>
                      <TD>
                        <span className="font-mono text-xs font-semibold text-red-300">{j.code}</span>
                      </TD>
                      <TD className="font-medium text-zinc-100">{j.name}</TD>
                      <TD>
                        {j.region ? <Badge tone="blue">{j.region}</Badge> : <span className="text-zinc-600">—</span>}
                      </TD>
                      <TD>
                        {j.sector ? (
                          <Badge tone="zinc">{j.sector}</Badge>
                        ) : (
                          <span className="text-zinc-600">General</span>
                        )}
                      </TD>
                      <TD className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            openDetail(j.id)
                          }}
                        >
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

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-zinc-200">Coverage by region</h2>
          </CardHeader>
          <CardBody>
            {byRegion.length === 0 ? (
              <p className="text-sm text-zinc-500">No region data.</p>
            ) : (
              <div className="space-y-3">
                {byRegion.map(([region, count]) => (
                  <div key={region}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-zinc-300">{region}</span>
                      <span className="font-mono tabular-nums text-zinc-500">{count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-red-600"
                        style={{ width: `${maxRegion ? (count / maxRegion) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal
        open={detailLoading || !!detail || !!detailError}
        onClose={() => {
          setDetail(null)
          setDetailError(null)
        }}
        title={detail ? detail.name : 'Jurisdiction detail'}
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setDetail(null)
              setDetailError(null)
            }}
          >
            Close
          </Button>
        }
      >
        {detailLoading ? (
          <div className="py-6">
            <Spinner label="Loading detail..." />
          </div>
        ) : detailError ? (
          <p className="text-sm text-red-300">{detailError}</p>
        ) : detail ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-red-300">{detail.code}</span>
              {detail.region && <Badge tone="blue">{detail.region}</Badge>}
              {detail.sector && <Badge tone="zinc">{detail.sector}</Badge>}
            </div>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Code" value={detail.code} mono />
              <Field label="Name" value={detail.name} />
              <Field label="Region" value={detail.region || '—'} />
              <Field label="Sector" value={detail.sector || 'General'} />
              <Field
                label="Registered"
                value={detail.created_at ? new Date(detail.created_at).toLocaleString() : '—'}
              />
            </dl>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`mt-0.5 text-sm text-zinc-200 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
