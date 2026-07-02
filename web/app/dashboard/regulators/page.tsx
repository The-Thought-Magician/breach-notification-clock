'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Jurisdiction {
  id: string
  code: string
  name: string
}

interface Regulator {
  id: string
  jurisdiction_id: string
  name: string
  portal_url?: string | null
  contact_email?: string | null
  submission_method?: string | null
  created_by?: string | null
  created_at?: string
}

const SUBMISSION_METHODS = ['portal', 'email', 'post', 'phone', 'api', 'other']

const emptyForm = {
  jurisdiction_id: '',
  name: '',
  portal_url: '',
  contact_email: '',
  submission_method: 'portal',
}

export default function RegulatorsPage() {
  const [regulators, setRegulators] = useState<Regulator[]>([])
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Regulator | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<Regulator | null>(null)
  const [deleting, setDeleting] = useState(false)

  const jMap = useMemo(() => {
    const m = new Map<string, Jurisdiction>()
    for (const j of jurisdictions) m.set(j.id, j)
    return m
  }, [jurisdictions])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [regs, jur] = await Promise.all([api.getRegulators(), api.getJurisdictions()])
      setRegulators(Array.isArray(regs) ? regs : [])
      setJurisdictions(Array.isArray(jur) ? jur : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load regulators')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, jurisdiction_id: jurisdictions[0]?.id ?? '' })
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(r: Regulator) {
    setEditing(r)
    setForm({
      jurisdiction_id: r.jurisdiction_id ?? '',
      name: r.name ?? '',
      portal_url: r.portal_url ?? '',
      contact_email: r.contact_email ?? '',
      submission_method: r.submission_method ?? 'portal',
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function save() {
    if (!form.name.trim()) {
      setFormError('Name is required.')
      return
    }
    if (!form.jurisdiction_id) {
      setFormError('Jurisdiction is required.')
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = {
      jurisdiction_id: form.jurisdiction_id,
      name: form.name.trim(),
      portal_url: form.portal_url.trim() || null,
      contact_email: form.contact_email.trim() || null,
      submission_method: form.submission_method || null,
    }
    try {
      if (editing) {
        await api.updateRegulator(editing.id, payload)
      } else {
        await api.createRegulator(payload)
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save regulator')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await api.deleteRegulator(confirmDelete.id)
      setConfirmDelete(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete regulator')
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return regulators.filter((r) => {
      if (jurisdictionFilter !== 'all' && r.jurisdiction_id !== jurisdictionFilter) return false
      if (!q) return true
      const j = jMap.get(r.jurisdiction_id)
      return (
        r.name.toLowerCase().includes(q) ||
        (r.contact_email ?? '').toLowerCase().includes(q) ||
        (r.submission_method ?? '').toLowerCase().includes(q) ||
        (j?.name ?? '').toLowerCase().includes(q) ||
        (j?.code ?? '').toLowerCase().includes(q)
      )
    })
  }, [regulators, search, jurisdictionFilter, jMap])

  const withPortal = regulators.filter((r) => r.portal_url).length
  const withEmail = regulators.filter((r) => r.contact_email).length

  if (loading) return <PageSpinner label="Loading regulators..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">Regulator Directory</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Supervisory authorities and their submission channels for breach notices.
          </p>
        </div>
        <Button onClick={openCreate}>+ New Regulator</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Regulators" value={regulators.length} />
        <Stat label="With portal" value={withPortal} tone="amber" />
        <Stat label="With email" value={withEmail} tone="green" />
        <Stat label="Matches" value={filtered.length} tone="red" />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-neutral-200">All regulators</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, jurisdiction..."
              className="w-60 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-red-600 focus:outline-none"
            />
            <select
              value={jurisdictionFilter}
              onChange={(e) => setJurisdictionFilter(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 focus:border-red-600 focus:outline-none"
            >
              <option value="all">All jurisdictions</option>
              {jurisdictions.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} — {j.name}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={regulators.length === 0 ? 'No regulators yet' : 'No matches'}
                description={
                  regulators.length === 0
                    ? 'Add a supervisory authority so breach notices can be routed to the right recipient.'
                    : 'No regulator matches the current filters.'
                }
                action={
                  regulators.length === 0 ? <Button onClick={openCreate}>+ New Regulator</Button> : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Jurisdiction</TH>
                  <TH>Submission</TH>
                  <TH>Contact</TH>
                  <TH>Portal</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((r) => {
                  const j = jMap.get(r.jurisdiction_id)
                  return (
                    <TR key={r.id}>
                      <TD className="font-medium text-neutral-100">{r.name}</TD>
                      <TD>
                        {j ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-mono text-xs text-red-300">{j.code}</span>
                            <span className="text-neutral-400">{j.name}</span>
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </TD>
                      <TD>
                        {r.submission_method ? (
                          <Badge tone="blue">{r.submission_method}</Badge>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </TD>
                      <TD>
                        {r.contact_email ? (
                          <a
                            href={`mailto:${r.contact_email}`}
                            className="text-sky-400 hover:underline"
                          >
                            {r.contact_email}
                          </a>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </TD>
                      <TD>
                        {r.portal_url ? (
                          <a
                            href={r.portal_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-400 hover:underline"
                          >
                            Open
                          </a>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                            Edit
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(r)}>
                            Delete
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit regulator' : 'New regulator'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Create regulator'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <Field label="Name">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Information Commissioner's Office"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-red-600 focus:outline-none"
            />
          </Field>
          <Field label="Jurisdiction">
            <select
              value={form.jurisdiction_id}
              onChange={(e) => setForm((f) => ({ ...f, jurisdiction_id: e.target.value }))}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-red-600 focus:outline-none"
            >
              <option value="">Select jurisdiction...</option>
              {jurisdictions.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} — {j.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Submission method">
            <select
              value={form.submission_method}
              onChange={(e) => setForm((f) => ({ ...f, submission_method: e.target.value }))}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-red-600 focus:outline-none"
            >
              {SUBMISSION_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Portal URL">
            <input
              value={form.portal_url}
              onChange={(e) => setForm((f) => ({ ...f, portal_url: e.target.value }))}
              placeholder="https://..."
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-red-600 focus:outline-none"
            />
          </Field>
          <Field label="Contact email">
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
              placeholder="breach@regulator.example"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-red-600 focus:outline-none"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete regulator"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          Delete regulator <span className="font-semibold text-neutral-100">{confirmDelete?.name}</span>? This
          cannot be undone.
        </p>
      </Modal>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      {children}
    </label>
  )
}
