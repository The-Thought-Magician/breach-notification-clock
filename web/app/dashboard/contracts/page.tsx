'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Contract {
  id: string
  user_id: string
  customer_name: string
  dpa_reference: string | null
  notify_within_hours: number
  clock_anchor: string
  contact_email: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

const CLOCK_ANCHORS = ['discovery', 'confirmation', 'containment', 'belief_of_harm']

interface FormState {
  customer_name: string
  dpa_reference: string
  notify_within_hours: string
  clock_anchor: string
  contact_email: string
  notes: string
}

const emptyForm: FormState = {
  customer_name: '',
  dpa_reference: '',
  notify_within_hours: '48',
  clock_anchor: 'confirmation',
  contact_email: '',
  notes: '',
}

function fmt(dt: string | null | undefined): string {
  if (!dt) return '—'
  const d = new Date(dt)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function hoursTone(hours: number): 'red' | 'amber' | 'green' {
  if (hours <= 24) return 'red'
  if (hours <= 48) return 'amber'
  return 'green'
}

function toForm(c: Contract): FormState {
  return {
    customer_name: c.customer_name,
    dpa_reference: c.dpa_reference ?? '',
    notify_within_hours: String(c.notify_within_hours),
    clock_anchor: c.clock_anchor,
    contact_email: c.contact_email ?? '',
    notes: c.notes ?? '',
  }
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [anchorFilter, setAnchorFilter] = useState('all')
  const [sort, setSort] = useState<'name' | 'tightest'>('tightest')

  // editor modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // delete
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getContracts()
      setContracts(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contracts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = contracts.filter((c) => {
      if (anchorFilter !== 'all' && c.clock_anchor !== anchorFilter) return false
      if (!q) return true
      return (
        c.customer_name.toLowerCase().includes(q) ||
        (c.dpa_reference ?? '').toLowerCase().includes(q) ||
        (c.contact_email ?? '').toLowerCase().includes(q)
      )
    })
    rows = [...rows].sort((a, b) =>
      sort === 'name'
        ? a.customer_name.localeCompare(b.customer_name)
        : a.notify_within_hours - b.notify_within_hours,
    )
    return rows
  }, [contracts, search, anchorFilter, sort])

  const stats = useMemo(() => {
    if (contracts.length === 0) return { total: 0, tightest: 0, avg: 0, under24: 0 }
    const hours = contracts.map((c) => c.notify_within_hours)
    return {
      total: contracts.length,
      tightest: Math.min(...hours),
      avg: Math.round(hours.reduce((a, b) => a + b, 0) / hours.length),
      under24: contracts.filter((c) => c.notify_within_hours <= 24).length,
    }
  }, [contracts])

  // distribution for a simple SVG-free bar chart
  const distribution = useMemo(() => {
    const buckets = [
      { label: '≤24h', tone: 'red' as const, test: (h: number) => h <= 24 },
      { label: '25–48h', tone: 'amber' as const, test: (h: number) => h > 24 && h <= 48 },
      { label: '49–72h', tone: 'blue' as const, test: (h: number) => h > 48 && h <= 72 },
      { label: '>72h', tone: 'green' as const, test: (h: number) => h > 72 },
    ]
    const counts = buckets.map((b) => ({
      ...b,
      count: contracts.filter((c) => b.test(c.notify_within_hours)).length,
    }))
    const max = Math.max(1, ...counts.map((c) => c.count))
    return { counts, max }
  }, [contracts])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(c: Contract) {
    setEditingId(c.id)
    setForm(toForm(c))
    setFormError(null)
    setModalOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.customer_name.trim()) {
      setFormError('Customer name is required.')
      return
    }
    const hours = parseInt(form.notify_within_hours, 10)
    if (isNaN(hours) || hours <= 0) {
      setFormError('Notify-within hours must be a positive number.')
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = {
      customer_name: form.customer_name.trim(),
      dpa_reference: form.dpa_reference.trim() || null,
      notify_within_hours: hours,
      clock_anchor: form.clock_anchor,
      contact_email: form.contact_email.trim() || null,
      notes: form.notes.trim() || null,
    }
    try {
      if (editingId) {
        const updated: Contract = await api.updateContract(editingId, payload)
        setContracts((prev) => prev.map((c) => (c.id === editingId ? { ...c, ...updated } : c)))
      } else {
        const created: Contract = await api.createContract(payload)
        setContracts((prev) => [created, ...prev])
      }
      setModalOpen(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save contract')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteContract(deleteTarget.id)
      setContracts((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete contract')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Customer DPA registry</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Track per-customer data processing agreements and their contractual breach-notification
            windows. These feed the contractual obligation engine when an incident is recomputed.
          </p>
        </div>
        <Button onClick={openCreate}>+ New contract</Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <PageSpinner label="Loading contracts..." />
      ) : (
        <>
          {/* stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Contracts" value={stats.total} />
            <Stat
              label="Tightest window"
              value={stats.total ? `${stats.tightest}h` : '—'}
              tone={stats.total && stats.tightest <= 24 ? 'red' : 'default'}
            />
            <Stat label="Average window" value={stats.total ? `${stats.avg}h` : '—'} />
            <Stat
              label="≤24h window"
              value={stats.under24}
              tone={stats.under24 > 0 ? 'red' : 'default'}
              hint="most urgent"
            />
          </div>

          {/* distribution chart (div bars, no chart lib) */}
          {stats.total > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-zinc-200">Notification window distribution</h2>
              </CardHeader>
              <CardBody className="space-y-3">
                {distribution.counts.map((b) => (
                  <div key={b.label} className="flex items-center gap-3">
                    <div className="w-16 shrink-0 text-xs text-zinc-400">{b.label}</div>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-zinc-800/60">
                      <div
                        className={
                          b.tone === 'red'
                            ? 'h-full rounded bg-red-600'
                            : b.tone === 'amber'
                              ? 'h-full rounded bg-amber-500'
                              : b.tone === 'blue'
                                ? 'h-full rounded bg-sky-500'
                                : 'h-full rounded bg-emerald-500'
                        }
                        style={{ width: `${(b.count / distribution.max) * 100}%` }}
                      />
                    </div>
                    <div className="w-8 shrink-0 text-right text-xs tabular-nums text-zinc-300">
                      {b.count}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {/* filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, DPA reference, or contact…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none sm:max-w-xs"
            />
            <select
              value={anchorFilter}
              onChange={(e) => setAnchorFilter(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            >
              <option value="all">All clock anchors</option>
              {CLOCK_ANCHORS.map((a) => (
                <option key={a} value={a}>
                  {a.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as 'name' | 'tightest')}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            >
              <option value="tightest">Sort: tightest window</option>
              <option value="name">Sort: customer name</option>
            </select>
            <div className="text-xs text-zinc-500 sm:ml-auto">
              {filtered.length} of {contracts.length}
            </div>
          </div>

          {/* table / empty */}
          {contracts.length === 0 ? (
            <EmptyState
              title="No contracts yet"
              description="Add a customer DPA to track its contractual breach-notification clock alongside statutory deadlines."
              action={<Button onClick={openCreate}>Add your first contract</Button>}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No matches"
              description="No contracts match your current search or filter."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('')
                    setAnchorFilter('all')
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH>DPA reference</TH>
                  <TH>Notify within</TH>
                  <TH>Clock anchor</TH>
                  <TH>Contact</TH>
                  <TH>Updated</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium text-zinc-100">
                      {c.customer_name}
                      {c.notes && (
                        <div className="mt-0.5 max-w-xs truncate text-xs text-zinc-500">{c.notes}</div>
                      )}
                    </TD>
                    <TD className="text-zinc-400">{c.dpa_reference || '—'}</TD>
                    <TD>
                      <Badge tone={hoursTone(c.notify_within_hours)}>{c.notify_within_hours}h</Badge>
                    </TD>
                    <TD className="capitalize text-zinc-300">{c.clock_anchor.replace(/_/g, ' ')}</TD>
                    <TD className="text-zinc-400">
                      {c.contact_email ? (
                        <a
                          href={`mailto:${c.contact_email}`}
                          className="text-red-400 hover:text-red-300 hover:underline"
                        >
                          {c.contact_email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="text-zinc-400">{fmt(c.updated_at)}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(c)}>
                          Delete
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </>
      )}

      {/* create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit contract' : 'New contract'}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving} onClick={submit}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create contract'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Customer name
            </label>
            <input
              value={form.customer_name}
              onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
              placeholder="Acme Corp"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
                DPA reference
              </label>
              <input
                value={form.dpa_reference}
                onChange={(e) => setForm((f) => ({ ...f, dpa_reference: e.target.value }))}
                placeholder="DPA-2025-014"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
                Contact email
              </label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                placeholder="security@acme.com"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
                Notify within (hours)
              </label>
              <input
                type="number"
                min={1}
                value={form.notify_within_hours}
                onChange={(e) => setForm((f) => ({ ...f, notify_within_hours: e.target.value }))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
                Clock anchor
              </label>
              <select
                value={form.clock_anchor}
                onChange={(e) => setForm((f) => ({ ...f, clock_anchor: e.target.value }))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
              >
                {CLOCK_ANCHORS.map((a) => (
                  <option key={a} value={a}>
                    {a.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Escalation path, account owner, special terms…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            />
          </div>
        </form>
      </Modal>

      {/* delete confirm */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete contract"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-300">
          Delete the DPA for{' '}
          <span className="font-medium text-zinc-100">{deleteTarget?.customer_name}</span>? This does
          not affect contractual obligations already attached to past incidents.
        </p>
      </Modal>
    </div>
  )
}
