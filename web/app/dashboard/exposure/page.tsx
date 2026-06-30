'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Jurisdiction {
  id: string
  code: string
  name: string
  region: string
  sector?: string | null
}

interface ExposureProfile {
  id: string
  user_id: string
  jurisdiction_code: string
  data_categories: string[]
  has_template: boolean
  has_approver: boolean
  notes?: string | null
  created_at: string
}

interface ObligationPreview {
  jurisdiction_code?: string
  recipient?: string
  recipient_type?: string
  citation?: string
  title?: string
  clock_anchor?: string
  deadline_hours?: number | null
  is_undue_delay?: boolean
  why_triggered?: string
  [k: string]: unknown
}

const DATA_CATEGORIES = [
  'name',
  'contact',
  'government_id',
  'financial',
  'health',
  'biometric',
  'credentials',
  'location',
  'children',
  'special_category',
]

function readinessTone(hasTemplate: boolean, hasApprover: boolean): 'green' | 'amber' | 'red' {
  if (hasTemplate && hasApprover) return 'green'
  if (hasTemplate || hasApprover) return 'amber'
  return 'red'
}

export default function ExposurePage() {
  const [profiles, setProfiles] = useState<ExposureProfile[]>([])
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // form state (create / edit upsert)
  const [editing, setEditing] = useState<ExposureProfile | null>(null)
  const [formCode, setFormCode] = useState('')
  const [formCats, setFormCats] = useState<string[]>([])
  const [formTemplate, setFormTemplate] = useState(false)
  const [formApprover, setFormApprover] = useState(false)
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // preview state
  const [previewCode, setPreviewCode] = useState('')
  const [previewCats, setPreviewCats] = useState<string[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previews, setPreviews] = useState<ObligationPreview[] | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [exp, juris] = await Promise.all([api.getExposure(), api.getJurisdictions()])
      setProfiles(Array.isArray(exp) ? exp : [])
      setJurisdictions(Array.isArray(juris) ? juris : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load exposure profiles')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const jurisByCode = useMemo(
    () => Object.fromEntries(jurisdictions.map((j) => [j.code, j])),
    [jurisdictions],
  )

  const readyCount = useMemo(
    () => profiles.filter((p) => p.has_template && p.has_approver).length,
    [profiles],
  )
  const gapCount = profiles.length - readyCount

  function resetForm() {
    setEditing(null)
    setFormCode('')
    setFormCats([])
    setFormTemplate(false)
    setFormApprover(false)
    setFormNotes('')
  }

  function startEdit(p: ExposureProfile) {
    setEditing(p)
    setFormCode(p.jurisdiction_code)
    setFormCats(p.data_categories ?? [])
    setFormTemplate(p.has_template)
    setFormApprover(p.has_approver)
    setFormNotes(p.notes ?? '')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggle(list: string[], setter: (v: string[]) => void, cat: string) {
    setter(list.includes(cat) ? list.filter((c) => c !== cat) : [...list, cat])
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!formCode) {
      setActionError('Select a jurisdiction')
      return
    }
    setSaving(true)
    setActionError(null)
    try {
      const saved: ExposureProfile = await api.saveExposure({
        jurisdiction_code: formCode,
        data_categories: formCats,
        has_template: formTemplate,
        has_approver: formApprover,
        notes: formNotes || null,
      })
      setProfiles((prev) => {
        const idx = prev.findIndex(
          (p) => p.id === saved.id || p.jurisdiction_code === saved.jurisdiction_code,
        )
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = saved
          return next
        }
        return [saved, ...prev]
      })
      resetForm()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  async function remove(p: ExposureProfile) {
    setDeletingId(p.id)
    setActionError(null)
    try {
      await api.deleteExposure(p.id)
      setProfiles((prev) => prev.filter((x) => x.id !== p.id))
      if (editing?.id === p.id) resetForm()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete profile')
    } finally {
      setDeletingId(null)
    }
  }

  async function runPreview(e: React.FormEvent) {
    e.preventDefault()
    if (!previewCode) {
      setPreviewError('Choose a jurisdiction to preview')
      return
    }
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviews(null)
    try {
      const res = await api.previewExposure({
        jurisdiction: previewCode,
        categories: previewCats.join(','),
      })
      const list: ObligationPreview[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.previews)
          ? res.previews
          : []
      setPreviews(list)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to run preview')
    } finally {
      setPreviewLoading(false)
    }
  }

  function loadProfileIntoPreview(p: ExposureProfile) {
    setPreviewCode(p.jurisdiction_code)
    setPreviewCats(p.data_categories ?? [])
  }

  if (loading) return <PageSpinner label="Loading exposure profile..." />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Exposure Profile</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Map where you hold personal data and what you process. Pre-stage templates and approvers
          so the breach clock never catches you flat-footed. Run an &quot;if breached&quot; preview to
          see the obligations you&apos;d face.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Profiles" value={profiles.length} />
        <Stat label="Response-ready" value={readyCount} tone={readyCount > 0 ? 'green' : 'default'} />
        <Stat label="Readiness gaps" value={gapCount} tone={gapCount > 0 ? 'red' : 'green'} />
        <Stat label="Jurisdictions tracked" value={new Set(profiles.map((p) => p.jurisdiction_code)).size} />
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

      {/* Profile form */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-zinc-100">
            {editing ? 'Edit exposure profile' : 'Add exposure profile'}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Upsert is keyed on jurisdiction — re-saving an existing one updates it.
          </p>
        </CardHeader>
        <CardBody>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Jurisdiction
                </span>
                <select
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  disabled={!!editing}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-600 focus:outline-none disabled:opacity-60"
                >
                  <option value="">Select jurisdiction…</option>
                  {jurisdictions.map((j) => (
                    <option key={j.id} value={j.code}>
                      {j.name} ({j.code})
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col justify-end gap-2">
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={formTemplate}
                    onChange={(e) => setFormTemplate(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-red-600"
                  />
                  Notice template pre-drafted
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={formApprover}
                    onChange={(e) => setFormApprover(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-red-600"
                  />
                  Approver assigned
                </label>
              </div>
            </div>

            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Data categories held
              </span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DATA_CATEGORIES.map((cat) => {
                  const active = formCats.includes(cat)
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggle(formCats, setFormCats, cat)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? 'border-red-700 bg-red-950/60 text-red-300'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {cat.replace(/_/g, ' ')}
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Notes</span>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                placeholder="Processing context, data residency, sub-processors…"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-red-600 focus:outline-none"
              />
            </label>

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner label="Saving..." /> : editing ? 'Update profile' : 'Add profile'}
              </Button>
              {editing && (
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Profiles list */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-zinc-100">Your exposure</h2>
        </CardHeader>
        <CardBody className="p-0">
          {profiles.length === 0 ? (
            <EmptyState
              title="No exposure profiles yet"
              description="Add a profile above for each jurisdiction where you hold personal data."
              icon="🌍"
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Jurisdiction</TH>
                  <TH>Data categories</TH>
                  <TH>Readiness</TH>
                  <TH>Notes</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {profiles.map((p) => {
                  const j = jurisByCode[p.jurisdiction_code]
                  const tone = readinessTone(p.has_template, p.has_approver)
                  return (
                    <TR key={p.id}>
                      <TD>
                        <div className="font-medium text-zinc-100">
                          {j?.name ?? p.jurisdiction_code}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {p.jurisdiction_code}
                          {j?.region ? ` · ${j.region}` : ''}
                        </div>
                      </TD>
                      <TD>
                        {(p.data_categories ?? []).length === 0 ? (
                          <span className="text-xs text-zinc-600">none recorded</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {p.data_categories.map((c) => (
                              <Badge key={c} tone="zinc">
                                {c.replace(/_/g, ' ')}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TD>
                      <TD>
                        <div className="flex flex-col gap-1">
                          <Badge tone={tone}>
                            {tone === 'green' ? 'Ready' : tone === 'amber' ? 'Partial' : 'Not ready'}
                          </Badge>
                          <span className="text-xs text-zinc-500">
                            {p.has_template ? '✓ template' : '✗ template'} ·{' '}
                            {p.has_approver ? '✓ approver' : '✗ approver'}
                          </span>
                        </div>
                      </TD>
                      <TD className="max-w-[16rem]">
                        <span className="text-xs text-zinc-400">{p.notes || '—'}</span>
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => loadProfileIntoPreview(p)}
                          >
                            Preview
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => startEdit(p)}>
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => remove(p)}
                            disabled={deletingId === p.id}
                          >
                            {deletingId === p.id ? '…' : 'Delete'}
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

      {/* If-breached preview */}
      <Card className="border-red-900/60">
        <CardHeader className="border-red-900/40">
          <h2 className="text-base font-semibold text-red-300">If breached — obligation preview</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Simulate a breach in a jurisdiction with given data categories and see the statutory
            clocks you would be on.
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          <form onSubmit={runPreview} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Jurisdiction
                </span>
                <select
                  value={previewCode}
                  onChange={(e) => setPreviewCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-600 focus:outline-none"
                >
                  <option value="">Select jurisdiction…</option>
                  {jurisdictions.map((j) => (
                    <option key={j.id} value={j.code}>
                      {j.name} ({j.code})
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <Button type="submit" disabled={previewLoading}>
                  {previewLoading ? <Spinner label="Computing..." /> : 'Run preview'}
                </Button>
              </div>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Data categories breached
              </span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DATA_CATEGORIES.map((cat) => {
                  const active = previewCats.includes(cat)
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggle(previewCats, setPreviewCats, cat)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? 'border-red-700 bg-red-950/60 text-red-300'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {cat.replace(/_/g, ' ')}
                    </button>
                  )
                })}
              </div>
            </div>
          </form>

          {previewError && (
            <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
              {previewError}
            </div>
          )}

          {previews !== null &&
            (previews.length === 0 ? (
              <EmptyState
                title="No obligations triggered"
                description="With these inputs, no statutory notification rule fires. Try different data categories."
                icon="✅"
              />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-zinc-400">
                  <Badge tone="red">{previews.length} obligation{previews.length === 1 ? '' : 's'}</Badge>
                  would be triggered.
                </div>
                <Table>
                  <THead>
                    <TR>
                      <TH>Recipient</TH>
                      <TH>Rule</TH>
                      <TH>Clock anchor</TH>
                      <TH>Deadline</TH>
                      <TH>Why</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {previews.map((p, i) => (
                      <TR key={i}>
                        <TD>
                          <div className="font-medium text-zinc-100">
                            {p.recipient || p.recipient_type || '—'}
                          </div>
                          {p.recipient_type && p.recipient && (
                            <div className="text-xs text-zinc-500">{p.recipient_type}</div>
                          )}
                        </TD>
                        <TD>
                          <div className="text-zinc-200">{p.title || '—'}</div>
                          {p.citation && (
                            <div className="text-xs text-zinc-500">{p.citation}</div>
                          )}
                        </TD>
                        <TD>
                          <span className="text-xs text-zinc-400">{p.clock_anchor || '—'}</span>
                        </TD>
                        <TD>
                          {p.is_undue_delay ? (
                            <Badge tone="amber">without undue delay</Badge>
                          ) : p.deadline_hours != null ? (
                            <Badge tone={p.deadline_hours <= 72 ? 'red' : 'amber'}>
                              {p.deadline_hours}h
                            </Badge>
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </TD>
                        <TD className="max-w-[18rem]">
                          <span className="text-xs text-zinc-400">{p.why_triggered || '—'}</span>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            ))}
        </CardBody>
      </Card>
    </div>
  )
}
