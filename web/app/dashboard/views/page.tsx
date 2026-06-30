'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'

interface SavedView {
  id: string
  user_id: string
  name: string
  config: Record<string, unknown> | null
  is_default: boolean
  is_shared: boolean
  created_at?: string
}

interface FormState {
  name: string
  config: string
  is_default: boolean
  is_shared: boolean
}

const EMPTY_FORM: FormState = { name: '', config: '{}', is_default: false, is_shared: false }

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function fmtDate(s?: string) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function configSummary(config: Record<string, unknown> | null): string {
  if (!config) return 'No filters'
  const keys = Object.keys(config)
  if (keys.length === 0) return 'No filters'
  return keys.map((k) => `${k}: ${String((config as Record<string, unknown>)[k])}`).join(', ')
}

export default function ViewsPage() {
  const [views, setViews] = useState<SavedView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SavedView | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    api
      .getViews()
      .then((data) => setViews(asArray<SavedView>(data)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load saved views'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const ownViews = useMemo(() => views, [views])
  const defaultCount = useMemo(() => views.filter((v) => v.is_default).length, [views])
  const sharedCount = useMemo(() => views.filter((v) => v.is_shared).length, [views])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(v: SavedView) {
    setEditing(v)
    setForm({
      name: v.name,
      config: JSON.stringify(v.config ?? {}, null, 2),
      is_default: v.is_default,
      is_shared: v.is_shared,
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setFormError('Name is required')
      return
    }
    let config: Record<string, unknown>
    try {
      const parsed = form.config.trim() ? JSON.parse(form.config) : {}
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setFormError('Config must be a JSON object')
        return
      }
      config = parsed as Record<string, unknown>
    } catch {
      setFormError('Config is not valid JSON')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        name,
        config,
        is_default: form.is_default,
        is_shared: form.is_shared,
      }
      if (editing) {
        await api.updateView(editing.id, payload)
      } else {
        await api.createView(payload)
      }
      setModalOpen(false)
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save view')
    } finally {
      setSaving(false)
    }
  }

  async function toggleDefault(v: SavedView) {
    setBusyId(v.id)
    setError(null)
    try {
      await api.updateView(v.id, { is_default: !v.is_default })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update view')
      setBusyId(null)
    }
  }

  async function toggleShared(v: SavedView) {
    setBusyId(v.id)
    setError(null)
    try {
      await api.updateView(v.id, { is_shared: !v.is_shared })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update view')
      setBusyId(null)
    }
  }

  async function remove(v: SavedView) {
    if (!confirm(`Delete saved view "${v.name}"?`)) return
    setBusyId(v.id)
    setError(null)
    try {
      await api.deleteView(v.id)
      setViews((cur) => cur.filter((x) => x.id !== v.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete view')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <PageSpinner label="Loading saved views..." />

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-red-500">Saved Views</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-100">View manager</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Reusable filter configurations for obligation matrices and lists. Mark one as default, or share
            with your team.
          </p>
        </div>
        <Button onClick={openCreate}>+ New view</Button>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Saved views" value={views.length} hint="Yours + shared" />
        <Stat label="Default" value={defaultCount} tone={defaultCount > 0 ? 'amber' : 'default'} hint="At most one" />
        <Stat label="Shared" value={sharedCount} hint="Visible to the team" />
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {ownViews.length === 0 ? (
        <EmptyState
          icon="◳"
          title="No saved views"
          description="Create a saved view to capture a set of obligation filters you reuse often. You can mark it as your default or share it with the team."
          action={<Button onClick={openCreate}>+ New view</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ownViews.map((v) => (
            <Card key={v.id} className={v.is_default ? 'ring-1 ring-red-800/60' : ''}>
              <CardHeader className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-zinc-100">{v.name}</h2>
                  <p className="mt-0.5 text-xs text-zinc-600">Created {fmtDate(v.created_at)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {v.is_default && <Badge tone="red">Default</Badge>}
                  {v.is_shared && <Badge tone="blue">Shared</Badge>}
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Config</div>
                  <p className="line-clamp-2 break-words text-xs text-zinc-400">{configSummary(v.config)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => toggleDefault(v)}
                    disabled={busyId === v.id}
                  >
                    {v.is_default ? 'Unset default' : 'Set default'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => toggleShared(v)}
                    disabled={busyId === v.id}
                  >
                    {v.is_shared ? 'Unshare' : 'Share'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(v)} disabled={busyId === v.id}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(v)} disabled={busyId === v.id}>
                    {busyId === v.id ? '...' : 'Delete'}
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit "${editing.name}"` : 'New saved view'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="view-form" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Create view'}
            </Button>
          </>
        }
      >
        <form id="view-form" onSubmit={submit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Overdue regulator notices"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Filter config (JSON)
            </span>
            <textarea
              value={form.config}
              onChange={(e) => setForm((f) => ({ ...f, config: e.target.value }))}
              rows={6}
              spellCheck={false}
              placeholder={'{\n  "status": "open",\n  "jurisdiction": "EU-DE"\n}'}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <span className="text-xs text-zinc-600">
              Key/value filters applied when this view is loaded in an obligation matrix.
            </span>
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-500"
              />
              Set as default
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={form.is_shared}
                onChange={(e) => setForm((f) => ({ ...f, is_shared: e.target.checked }))}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-500"
              />
              Share with team
            </label>
          </div>
        </form>
      </Modal>
    </div>
  )
}
