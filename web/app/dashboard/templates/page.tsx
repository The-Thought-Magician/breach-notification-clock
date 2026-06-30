'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'

interface Template {
  id: string
  user_id?: string
  name: string
  jurisdiction_code?: string | null
  recipient_type?: string | null
  body: string
  merge_fields?: string[] | null
  created_at?: string
  updated_at?: string
}

const RECIPIENT_TYPES = ['regulator', 'data_subject', 'controller', 'processor', 'partner', 'other']

const MERGE_FIELD_RE = /\{\{\s*([\w.]+)\s*\}\}/g

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function extractMergeFields(body: string): string[] {
  const out = new Set<string>()
  let m: RegExpExecArray | null
  MERGE_FIELD_RE.lastIndex = 0
  while ((m = MERGE_FIELD_RE.exec(body)) !== null) out.add(m[1])
  return [...out]
}

function recipientTone(t?: string | null) {
  switch (t) {
    case 'regulator':
      return 'red' as const
    case 'data_subject':
      return 'amber' as const
    case 'processor':
    case 'controller':
      return 'blue' as const
    default:
      return 'zinc' as const
  }
}

const emptyForm = { name: '', jurisdiction_code: '', recipient_type: '', body: '' }

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [recipientFilter, setRecipientFilter] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Template | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .getTemplates()
      .then((data) => setTemplates(asArray<Template>(data)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load templates'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const jurisdictionOptions = useMemo(() => {
    const s = new Set<string>()
    for (const t of templates) if (t.jurisdiction_code) s.add(t.jurisdiction_code)
    return [...s].sort()
  }, [templates])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return templates.filter((t) => {
      if (recipientFilter && t.recipient_type !== recipientFilter) return false
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        (t.jurisdiction_code || '').toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q)
      )
    })
  }, [templates, search, recipientFilter])

  const formMergeFields = useMemo(() => extractMergeFields(form.body), [form.body])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(t: Template) {
    setEditing(t)
    setForm({
      name: t.name,
      jurisdiction_code: t.jurisdiction_code || '',
      recipient_type: t.recipient_type || '',
      body: t.body || '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError('Name is required')
      return
    }
    if (!form.body.trim()) {
      setFormError('Body is required')
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = {
      name: form.name.trim(),
      jurisdictionCode: form.jurisdiction_code.trim().toUpperCase() || null,
      recipientType: form.recipient_type || null,
      body: form.body,
      mergeFields: extractMergeFields(form.body),
    }
    try {
      if (editing) await api.updateTemplate(editing.id, payload)
      else await api.createTemplate(payload)
      setModalOpen(false)
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  async function remove(t: Template) {
    if (!confirm(`Delete template "${t.name}"?`)) return
    setDeletingId(t.id)
    try {
      await api.deleteTemplate(t.id)
      setTemplates((cur) => cur.filter((x) => x.id !== t.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template')
    } finally {
      setDeletingId(null)
    }
  }

  function insertField(field: string) {
    setForm((f) => ({ ...f, body: `${f.body}{{${field}}}` }))
  }

  const COMMON_FIELDS = ['incident.title', 'incident.reference', 'breach.date', 'affected.count', 'jurisdiction', 'regulator.name', 'deadline', 'contact.email']

  if (loading) return <PageSpinner label="Loading templates..." />

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-red-500">Notice Templates</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-100">Template library</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Reusable breach-notice drafts with {'{{merge_fields}}'} that populate when an artifact is generated for an
            obligation.
          </p>
        </div>
        <Button onClick={openCreate}>+ New template</Button>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Templates" value={templates.length} hint="In your library" />
        <Stat
          label="Recipient types"
          value={new Set(templates.map((t) => t.recipient_type).filter(Boolean)).size}
          hint="Distinct audiences covered"
        />
        <Stat label="Jurisdictions" value={jurisdictionOptions.length} tone="amber" hint="With a tailored template" />
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, body, jurisdiction..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 sm:max-w-xs"
          />
          <select
            value={recipientFilter}
            onChange={(e) => setRecipientFilter(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          >
            <option value="">All recipients</option>
            {RECIPIENT_TYPES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardBody>
          {filtered.length === 0 ? (
            <EmptyState
              title={templates.length === 0 ? 'No templates yet' : 'No matches'}
              description={
                templates.length === 0
                  ? 'Create your first notice template to speed up artifact drafting during an incident.'
                  : 'No templates match your search or filter.'
              }
              action={templates.length === 0 ? <Button onClick={openCreate}>+ New template</Button> : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((t) => {
                const fields = asArray<string>(t.merge_fields)
                const resolved = fields.length ? fields : extractMergeFields(t.body)
                return (
                  <div
                    key={t.id}
                    className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 transition-colors hover:border-zinc-700"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-zinc-100">{t.name}</h3>
                      {t.recipient_type && (
                        <Badge tone={recipientTone(t.recipient_type)}>{t.recipient_type}</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      {t.jurisdiction_code && (
                        <span className="font-mono text-zinc-400">{t.jurisdiction_code}</span>
                      )}
                      <span>{resolved.length} merge fields</span>
                    </div>
                    <p className="mt-3 line-clamp-4 flex-1 whitespace-pre-wrap text-sm text-zinc-400">
                      {t.body}
                    </p>
                    {resolved.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {resolved.slice(0, 5).map((f) => (
                          <span
                            key={f}
                            className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400"
                          >
                            {`{{${f}}}`}
                          </span>
                        ))}
                        {resolved.length > 5 && (
                          <span className="text-[11px] text-zinc-600">+{resolved.length - 5}</span>
                        )}
                      </div>
                    )}
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setPreview(t)}>
                        Preview
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openEdit(t)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => remove(t)}
                        disabled={deletingId === t.id}
                      >
                        {deletingId === t.id ? '...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit template' : 'New template'}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="template-form" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Create template'}
            </Button>
          </>
        }
      >
        <form id="template-form" onSubmit={submit} className="space-y-4">
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
              placeholder="e.g. GDPR Article 33 regulator notice"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Jurisdiction code</span>
              <input
                value={form.jurisdiction_code}
                onChange={(e) => setForm((f) => ({ ...f, jurisdiction_code: e.target.value.toUpperCase() }))}
                placeholder="optional, e.g. EU-DE"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm uppercase text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Recipient type</span>
              <select
                value={form.recipient_type}
                onChange={(e) => setForm((f) => ({ ...f, recipient_type: e.target.value }))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <option value="">—</option>
                {RECIPIENT_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Body</span>
              <span className="text-xs text-zinc-600">
                {formMergeFields.length} merge field{formMergeFields.length === 1 ? '' : 's'} detected
              </span>
            </div>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={10}
              placeholder="Dear {{regulator.name}},&#10;&#10;We are writing to notify you of a personal data breach affecting {{affected.count}} residents..."
              className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <div className="flex flex-wrap gap-1 pt-1">
              <span className="text-xs text-zinc-600">Insert:</span>
              {COMMON_FIELDS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => insertField(f)}
                  className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300 hover:bg-zinc-700"
                >
                  {`{{${f}}}`}
                </button>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name} className="max-w-2xl">
        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {preview.recipient_type && (
                <Badge tone={recipientTone(preview.recipient_type)}>{preview.recipient_type}</Badge>
              )}
              {preview.jurisdiction_code && <Badge tone="zinc">{preview.jurisdiction_code}</Badge>}
            </div>
            <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-200">
              {preview.body}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  )
}
