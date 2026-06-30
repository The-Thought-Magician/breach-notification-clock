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

interface Rule {
  id: string
  jurisdiction_id?: string | null
  jurisdiction_code?: string | null
  citation?: string | null
  title: string
  category?: string | null
  recipient_type?: string | null
  clock_anchor?: string | null
  deadline_hours?: number | null
  is_undue_delay?: boolean | null
  harm_threshold?: string | null
  resident_threshold?: number | null
  trigger_data_categories?: string[] | null
  content_requirements?: string | null
  delivery_method?: string | null
  effective_from?: string | null
  effective_to?: string | null
  created_by?: string | null
  created_at?: string
}

const RECIPIENT_TYPES = ['regulator', 'data_subject', 'controller', 'processor', 'partner', 'other']
const CLOCK_ANCHORS = ['discovery', 'awareness', 'confirmation', 'occurrence', 'controller_notified']
const CATEGORIES = ['statutory', 'sectoral', 'contractual', 'voluntary']

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function fmtDeadline(r: Rule): string {
  if (r.is_undue_delay) return 'Without undue delay'
  if (r.deadline_hours == null) return '—'
  const h = r.deadline_hours
  if (h % 24 === 0) return `${h / 24} day${h / 24 === 1 ? '' : 's'} (${h}h)`
  return `${h}h`
}

function deadlineTone(r: Rule): 'red' | 'amber' | 'green' | 'zinc' {
  if (r.is_undue_delay) return 'amber'
  if (r.deadline_hours == null) return 'zinc'
  if (r.deadline_hours <= 72) return 'red'
  if (r.deadline_hours <= 24 * 7) return 'amber'
  return 'green'
}

const emptyForm = {
  title: '',
  citation: '',
  jurisdiction_code: '',
  category: 'statutory',
  recipient_type: 'regulator',
  clock_anchor: 'discovery',
  deadline_hours: '72',
  is_undue_delay: false,
  harm_threshold: '',
  resident_threshold: '',
  trigger_data_categories: '',
  content_requirements: '',
  delivery_method: '',
}

type FormState = typeof emptyForm

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [jurisdictionFilter, setJurisdictionFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [detail, setDetail] = useState<Rule | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const params: Record<string, string> = {}
    if (jurisdictionFilter) params.jurisdiction = jurisdictionFilter
    if (categoryFilter) params.category = categoryFilter
    api
      .getRules(Object.keys(params).length ? params : undefined)
      .then((data) => setRules(asArray<Rule>(data)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load rules'))
      .finally(() => setLoading(false))
  }, [jurisdictionFilter, categoryFilter])

  useEffect(() => {
    load()
  }, [load])

  const jurisdictionOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of rules) if (r.jurisdiction_code) s.add(r.jurisdiction_code)
    return [...s].sort()
  }, [rules])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rules.filter((r) => {
      if (!q) return true
      return (
        r.title.toLowerCase().includes(q) ||
        (r.citation || '').toLowerCase().includes(q) ||
        (r.jurisdiction_code || '').toLowerCase().includes(q)
      )
    })
  }, [rules, search])

  const customCount = useMemo(() => rules.filter((r) => r.created_by).length, [rules])
  const urgentCount = useMemo(
    () => rules.filter((r) => !r.is_undue_delay && (r.deadline_hours ?? Infinity) <= 72).length,
    [rules],
  )

  function isCustom(r: Rule) {
    return !!r.created_by
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(r: Rule) {
    setEditing(r)
    setForm({
      title: r.title || '',
      citation: r.citation || '',
      jurisdiction_code: r.jurisdiction_code || '',
      category: r.category || 'statutory',
      recipient_type: r.recipient_type || 'regulator',
      clock_anchor: r.clock_anchor || 'discovery',
      deadline_hours: r.deadline_hours != null ? String(r.deadline_hours) : '',
      is_undue_delay: !!r.is_undue_delay,
      harm_threshold: r.harm_threshold || '',
      resident_threshold: r.resident_threshold != null ? String(r.resident_threshold) : '',
      trigger_data_categories: asArray<string>(r.trigger_data_categories).join(', '),
      content_requirements: r.content_requirements || '',
      delivery_method: r.delivery_method || '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function openDetail(r: Rule) {
    setDetail(r)
    setDetailLoading(true)
    try {
      const full = await api.getRule(r.id)
      if (full) setDetail(full as Rule)
    } catch {
      // fall back to list row already set
    } finally {
      setDetailLoading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setFormError('Title is required')
      return
    }
    if (!form.is_undue_delay && form.deadline_hours.trim() === '') {
      setFormError('Deadline hours required unless "without undue delay" is set')
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = {
      title: form.title.trim(),
      citation: form.citation.trim() || null,
      jurisdictionCode: form.jurisdiction_code.trim().toUpperCase() || null,
      category: form.category || null,
      recipientType: form.recipient_type || null,
      clockAnchor: form.clock_anchor || null,
      deadlineHours: form.is_undue_delay ? null : Number(form.deadline_hours),
      isUndueDelay: form.is_undue_delay,
      harmThreshold: form.harm_threshold.trim() || null,
      residentThreshold: form.resident_threshold.trim() === '' ? null : Number(form.resident_threshold),
      triggerDataCategories: form.trigger_data_categories
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      contentRequirements: form.content_requirements.trim() || null,
      deliveryMethod: form.delivery_method.trim() || null,
    }
    try {
      if (editing) await api.updateRule(editing.id, payload)
      else await api.createRule(payload)
      setModalOpen(false)
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save rule')
    } finally {
      setSaving(false)
    }
  }

  async function remove(r: Rule) {
    if (!confirm(`Delete custom rule "${r.title}"?`)) return
    setDeletingId(r.id)
    try {
      await api.deleteRule(r.id)
      setRules((cur) => cur.filter((x) => x.id !== r.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <PageSpinner label="Loading rules..." />

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-red-500">Rules Library</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-100">Notification rules</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Statutory and custom deadlines that the obligation engine evaluates against each incident's facts and
            affected populations.
          </p>
        </div>
        <Button onClick={openCreate}>+ Custom rule</Button>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Stat label="Rules" value={rules.length} hint="Visible in library" />
        <Stat label="Jurisdictions" value={jurisdictionOptions.length} hint="Covered" />
        <Stat label="≤72h deadlines" value={urgentCount} tone="red" hint="Hard, fast clocks" />
        <Stat label="Custom rules" value={customCount} tone="amber" hint="Authored by you" />
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, citation, jurisdiction..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 lg:max-w-xs"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={jurisdictionFilter}
              onChange={(e) => setJurisdictionFilter(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="">All jurisdictions</option>
              {jurisdictionOptions.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="px-5 py-10">
              <EmptyState
                title={rules.length === 0 ? 'No rules found' : 'No matches'}
                description={
                  rules.length === 0
                    ? 'No rules match the current jurisdiction/category filters. Add a custom rule or adjust filters.'
                    : 'No rules match your search.'
                }
                action={<Button onClick={openCreate}>+ Custom rule</Button>}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Rule</TH>
                  <TH className="hidden md:table-cell">Jurisdiction</TH>
                  <TH className="hidden md:table-cell">Recipient</TH>
                  <TH>Deadline</TH>
                  <TH className="hidden lg:table-cell">Anchor</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <button onClick={() => openDetail(r)} className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-100 hover:text-red-400">{r.title}</span>
                          {isCustom(r) && <Badge tone="blue">custom</Badge>}
                        </div>
                        {r.citation && <div className="text-xs text-zinc-500">{r.citation}</div>}
                      </button>
                    </TD>
                    <TD className="hidden md:table-cell">
                      {r.jurisdiction_code ? (
                        <span className="font-mono text-sm text-zinc-300">{r.jurisdiction_code}</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </TD>
                    <TD className="hidden md:table-cell text-zinc-400">{r.recipient_type || '—'}</TD>
                    <TD>
                      <Badge tone={deadlineTone(r)}>{fmtDeadline(r)}</Badge>
                    </TD>
                    <TD className="hidden lg:table-cell text-zinc-400">{r.clock_anchor || '—'}</TD>
                    <TD className="text-right">
                      <div className="inline-flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(r)}>
                          View
                        </Button>
                        {isCustom(r) && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => remove(r)}
                              disabled={deletingId === r.id}
                            >
                              {deletingId === r.id ? '...' : 'Delete'}
                            </Button>
                          </>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit custom rule' : 'New custom rule'}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="rule-form" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Create rule'}
            </Button>
          </>
        }
      >
        <form id="rule-form" onSubmit={submit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Title</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Notify supervisory authority of personal data breach"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Citation</span>
              <input
                value={form.citation}
                onChange={(e) => setForm((f) => ({ ...f, citation: e.target.value }))}
                placeholder="e.g. GDPR Art. 33"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Jurisdiction code</span>
              <input
                value={form.jurisdiction_code}
                onChange={(e) => setForm((f) => ({ ...f, jurisdiction_code: e.target.value.toUpperCase() }))}
                placeholder="e.g. EU-DE"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm uppercase text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Category</span>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Recipient type</span>
              <select
                value={form.recipient_type}
                onChange={(e) => setForm((f) => ({ ...f, recipient_type: e.target.value }))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                {RECIPIENT_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Clock anchor</span>
              <select
                value={form.clock_anchor}
                onChange={(e) => setForm((f) => ({ ...f, clock_anchor: e.target.value }))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                {CLOCK_ANCHORS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Deadline (hours)</span>
              <input
                type="number"
                min={0}
                value={form.deadline_hours}
                disabled={form.is_undue_delay}
                onChange={(e) => setForm((f) => ({ ...f, deadline_hours: e.target.value }))}
                placeholder="e.g. 72"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm tabular-nums text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                checked={form.is_undue_delay}
                onChange={(e) => setForm((f) => ({ ...f, is_undue_delay: e.target.checked }))}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm text-zinc-300">Without undue delay (no fixed hours)</span>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Harm threshold</span>
              <input
                value={form.harm_threshold}
                onChange={(e) => setForm((f) => ({ ...f, harm_threshold: e.target.value }))}
                placeholder="e.g. risk_to_rights"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Resident threshold</span>
              <input
                type="number"
                min={0}
                value={form.resident_threshold}
                onChange={(e) => setForm((f) => ({ ...f, resident_threshold: e.target.value }))}
                placeholder="e.g. 500 (blank = any)"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm tabular-nums text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Trigger data categories
            </span>
            <input
              value={form.trigger_data_categories}
              onChange={(e) => setForm((f) => ({ ...f, trigger_data_categories: e.target.value }))}
              placeholder="comma-separated, e.g. health, financial, national_id"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Delivery method</span>
            <input
              value={form.delivery_method}
              onChange={(e) => setForm((f) => ({ ...f, delivery_method: e.target.value }))}
              placeholder="e.g. online_portal, email, registered_mail"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Content requirements</span>
            <textarea
              value={form.content_requirements}
              onChange={(e) => setForm((f) => ({ ...f, content_requirements: e.target.value }))}
              rows={3}
              placeholder="What the notice must contain..."
              className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </label>
        </form>
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title} className="max-w-2xl">
        {detail && (
          <div className="space-y-4">
            {detailLoading && (
              <div className="flex justify-center py-2">
                <Spinner label="Loading detail..." />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {detail.citation && <Badge tone="zinc">{detail.citation}</Badge>}
              {detail.jurisdiction_code && <Badge tone="blue">{detail.jurisdiction_code}</Badge>}
              {detail.category && <Badge tone="neutral">{detail.category}</Badge>}
              <Badge tone={deadlineTone(detail)}>{fmtDeadline(detail)}</Badge>
              {isCustom(detail) && <Badge tone="blue">custom</Badge>}
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Recipient type" value={detail.recipient_type} />
              <Field label="Clock anchor" value={detail.clock_anchor} />
              <Field label="Harm threshold" value={detail.harm_threshold} />
              <Field
                label="Resident threshold"
                value={detail.resident_threshold != null ? String(detail.resident_threshold) : null}
              />
              <Field label="Delivery method" value={detail.delivery_method} />
              <Field
                label="Effective"
                value={
                  detail.effective_from
                    ? `${detail.effective_from}${detail.effective_to ? ` → ${detail.effective_to}` : ''}`
                    : null
                }
              />
            </dl>
            {asArray<string>(detail.trigger_data_categories).length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Trigger data categories
                </div>
                <div className="flex flex-wrap gap-1">
                  {asArray<string>(detail.trigger_data_categories).map((c) => (
                    <Badge key={c} tone="amber">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {detail.content_requirements && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Content requirements
                </div>
                <p className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
                  {detail.content_requirements}
                </p>
              </div>
            )}
            {isCustom(detail) && (
              <div className="flex justify-end gap-2 border-t border-zinc-800 pt-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const r = detail
                    setDetail(null)
                    openEdit(r)
                  }}
                >
                  Edit
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-200">{value || <span className="text-zinc-600">—</span>}</dd>
    </div>
  )
}
