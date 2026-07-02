'use client'

import { useEffect, useState, useCallback } from 'react'
import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { authClient } from '@/lib/auth/client'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'

type Incident = {
  id: string
  title: string
  reference_number?: string | null
  severity?: string | null
  status?: string | null
  is_drill?: boolean
  is_confidential?: boolean
  owner_id?: string | null
  summary?: string | null
  created_at?: string
  updated_at?: string
}

type Anchor = {
  id: string
  incident_id: string
  anchor_type: string
  label?: string | null
  occurred_at: string
}

type Facts = {
  id?: string
  incident_id?: string
  data_categories?: string[] | null
  special_category?: boolean
  encrypted?: boolean
  attacker_access_confirmed?: boolean
  exfiltration_confirmed?: boolean
  risk_of_harm?: string | null
  notes?: string | null
}

type Comment = {
  id: string
  entity_type: string
  entity_id: string
  author_id?: string | null
  body: string
  created_at?: string
  updated_at?: string
}

type Attachment = {
  id: string
  entity_type: string
  entity_id: string
  name: string
  content_type?: string | null
  uri: string
  uploaded_by?: string | null
  created_at?: string
}

const SEVERITIES = ['low', 'medium', 'high', 'critical']
const STATUSES = ['open', 'investigating', 'contained', 'notifying', 'closed']
const ANCHOR_TYPES = ['discovery', 'occurrence', 'confirmation', 'containment', 'awareness']
const RISK_LEVELS = ['none', 'low', 'medium', 'high', 'severe']

function severityTone(s?: string | null): 'red' | 'amber' | 'blue' | 'zinc' {
  switch ((s || '').toLowerCase()) {
    case 'critical':
    case 'high':
      return 'red'
    case 'medium':
      return 'amber'
    case 'low':
      return 'blue'
    default:
      return 'zinc'
  }
}

function statusTone(s?: string | null): 'red' | 'amber' | 'green' | 'zinc' {
  switch ((s || '').toLowerCase()) {
    case 'open':
    case 'investigating':
      return 'red'
    case 'contained':
    case 'notifying':
      return 'amber'
    case 'closed':
      return 'green'
    default:
      return 'zinc'
  }
}

function fmtDateTime(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString()
}

function toLocalInput(s?: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

export default function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string>('')

  const [incident, setIncident] = useState<Incident | null>(null)
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const [facts, setFacts] = useState<Facts | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])

  // Incident edit form
  const [editForm, setEditForm] = useState<Partial<Incident>>({})
  const [savingIncident, setSavingIncident] = useState(false)

  // Facts form
  const [factsForm, setFactsForm] = useState<Facts>({})
  const [savingFacts, setSavingFacts] = useState(false)
  const [dataCatInput, setDataCatInput] = useState('')

  // Recompute
  const [recomputing, setRecomputing] = useState(false)
  const [recomputeResult, setRecomputeResult] = useState<string | null>(null)

  // Anchor modal
  const [anchorModalOpen, setAnchorModalOpen] = useState(false)
  const [editingAnchor, setEditingAnchor] = useState<Anchor | null>(null)
  const [anchorForm, setAnchorForm] = useState<{ anchor_type: string; label: string; occurred_at: string }>({
    anchor_type: 'discovery',
    label: '',
    occurred_at: '',
  })
  const [savingAnchor, setSavingAnchor] = useState(false)

  // Comments
  const [commentBody, setCommentBody] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  // Attachment modal
  const [attachModalOpen, setAttachModalOpen] = useState(false)
  const [attachForm, setAttachForm] = useState<{ name: string; uri: string; content_type: string }>({
    name: '',
    uri: '',
    content_type: '',
  })
  const [savingAttach, setSavingAttach] = useState(false)

  // Delete incident confirm
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const detail = await api.getIncident(id)
      const inc: Incident = detail?.incident ?? detail
      const ancFromDetail: Anchor[] | undefined = detail?.anchors
      const factsFromDetail: Facts | null = detail?.facts ?? null
      setIncident(inc)
      setEditForm({
        title: inc?.title,
        reference_number: inc?.reference_number ?? '',
        severity: inc?.severity ?? 'medium',
        status: inc?.status ?? 'open',
        summary: inc?.summary ?? '',
        is_drill: inc?.is_drill ?? false,
        is_confidential: inc?.is_confidential ?? false,
      })

      const [anc, com, att] = await Promise.all([
        ancFromDetail ? Promise.resolve(ancFromDetail) : api.getAnchors(id),
        api.getComments('incident', id),
        api.getAttachments('incident', id),
      ])
      setAnchors(Array.isArray(anc) ? anc : ancFromDetail ?? [])
      setComments(Array.isArray(com) ? com : [])
      setAttachments(Array.isArray(att) ? att : [])

      const f = factsFromDetail ?? {}
      setFacts(f)
      setFactsForm({
        data_categories: f?.data_categories ?? [],
        special_category: f?.special_category ?? false,
        encrypted: f?.encrypted ?? false,
        attacker_access_confirmed: f?.attacker_access_confirmed ?? false,
        exfiltration_confirmed: f?.exfiltration_confirmed ?? false,
        risk_of_harm: f?.risk_of_harm ?? 'none',
        notes: f?.notes ?? '',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load incident')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    ;(async () => {
      try {
        const s = await authClient.getSession()
        const u = s?.data?.user as { id?: string } | undefined
        if (u?.id) setUserId(u.id)
      } catch {
        /* proxy injects user id anyway */
      }
    })()
    load()
  }, [load])

  const saveIncident = async () => {
    setSavingIncident(true)
    setActionError(null)
    try {
      const updated = await api.updateIncident(id, {
        title: editForm.title,
        reference_number: editForm.reference_number || null,
        severity: editForm.severity,
        status: editForm.status,
        summary: editForm.summary || null,
        is_drill: editForm.is_drill,
        is_confidential: editForm.is_confidential,
      })
      setIncident(updated?.incident ?? updated)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to update incident')
    } finally {
      setSavingIncident(false)
    }
  }

  const deleteIncident = async () => {
    setDeleting(true)
    setActionError(null)
    try {
      await api.deleteIncident(id)
      router.push('/dashboard/incidents')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete incident')
      setDeleting(false)
    }
  }

  const openNewAnchor = () => {
    setEditingAnchor(null)
    setAnchorForm({ anchor_type: 'discovery', label: '', occurred_at: toLocalInput(new Date().toISOString()) })
    setAnchorModalOpen(true)
  }

  const openEditAnchor = (a: Anchor) => {
    setEditingAnchor(a)
    setAnchorForm({
      anchor_type: a.anchor_type,
      label: a.label ?? '',
      occurred_at: toLocalInput(a.occurred_at),
    })
    setAnchorModalOpen(true)
  }

  const saveAnchor = async () => {
    if (!anchorForm.occurred_at) {
      setActionError('Occurred-at time is required')
      return
    }
    setSavingAnchor(true)
    setActionError(null)
    try {
      const payload = {
        anchor_type: anchorForm.anchor_type,
        label: anchorForm.label || null,
        occurred_at: new Date(anchorForm.occurred_at).toISOString(),
      }
      if (editingAnchor) {
        const updated = await api.updateAnchor(id, editingAnchor.id, payload)
        const u: Anchor = updated?.anchor ?? updated
        setAnchors((prev) => prev.map((x) => (x.id === editingAnchor.id ? u : x)))
      } else {
        const created = await api.createAnchor(id, payload)
        const c: Anchor = created?.anchor ?? created
        setAnchors((prev) => [...prev, c])
      }
      setAnchorModalOpen(false)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save anchor')
    } finally {
      setSavingAnchor(false)
    }
  }

  const removeAnchor = async (a: Anchor) => {
    setActionError(null)
    try {
      await api.deleteAnchor(id, a.id)
      setAnchors((prev) => prev.filter((x) => x.id !== a.id))
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete anchor')
    }
  }

  const addDataCategory = () => {
    const v = dataCatInput.trim()
    if (!v) return
    const cur = factsForm.data_categories ?? []
    if (!cur.includes(v)) setFactsForm({ ...factsForm, data_categories: [...cur, v] })
    setDataCatInput('')
  }

  const removeDataCategory = (c: string) => {
    setFactsForm({ ...factsForm, data_categories: (factsForm.data_categories ?? []).filter((x) => x !== c) })
  }

  const saveFacts = async () => {
    setSavingFacts(true)
    setActionError(null)
    try {
      const updated = await api.updateFacts(id, {
        data_categories: factsForm.data_categories ?? [],
        special_category: factsForm.special_category ?? false,
        encrypted: factsForm.encrypted ?? false,
        attacker_access_confirmed: factsForm.attacker_access_confirmed ?? false,
        exfiltration_confirmed: factsForm.exfiltration_confirmed ?? false,
        risk_of_harm: factsForm.risk_of_harm ?? 'none',
        notes: factsForm.notes || null,
      })
      setFacts(updated?.facts ?? updated)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save facts')
    } finally {
      setSavingFacts(false)
    }
  }

  const recompute = async () => {
    setRecomputing(true)
    setRecomputeResult(null)
    setActionError(null)
    try {
      const res = await api.recomputeObligations(id)
      const count = res?.created ?? (Array.isArray(res?.obligations) ? res.obligations.length : 0)
      setRecomputeResult(`Recomputed obligations — ${count} obligation${count === 1 ? '' : 's'} generated.`)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to recompute obligations')
    } finally {
      setRecomputing(false)
    }
  }

  const postComment = async () => {
    const body = commentBody.trim()
    if (!body) return
    setPostingComment(true)
    setActionError(null)
    try {
      const created = await api.createComment({ entity_type: 'incident', entity_id: id, body })
      const c: Comment = created?.comment ?? created
      setComments((prev) => [...prev, c])
      setCommentBody('')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to post comment')
    } finally {
      setPostingComment(false)
    }
  }

  const saveAttachment = async () => {
    if (!attachForm.name.trim() || !attachForm.uri.trim()) {
      setActionError('Attachment name and URI are required')
      return
    }
    setSavingAttach(true)
    setActionError(null)
    try {
      const created = await api.createAttachment({
        entity_type: 'incident',
        entity_id: id,
        name: attachForm.name.trim(),
        uri: attachForm.uri.trim(),
        content_type: attachForm.content_type.trim() || null,
      })
      const a: Attachment = created?.attachment ?? created
      setAttachments((prev) => [...prev, a])
      setAttachModalOpen(false)
      setAttachForm({ name: '', uri: '', content_type: '' })
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to add attachment')
    } finally {
      setSavingAttach(false)
    }
  }

  const removeAttachment = async (a: Attachment) => {
    setActionError(null)
    try {
      await api.deleteAttachment(a.id)
      setAttachments((prev) => prev.filter((x) => x.id !== a.id))
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete attachment')
    }
  }

  if (loading) return <PageSpinner label="Loading incident..." />

  if (error || !incident) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          title="Could not load incident"
          description={error ?? 'This incident may not exist or you may not have access.'}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => load()}>
                Retry
              </Button>
              <Link href="/dashboard/incidents">
                <Button variant="ghost">Back to incidents</Button>
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  const sortedAnchors = [...anchors].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-neutral-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Link href="/dashboard/incidents" className="hover:text-neutral-300">
              Incidents
            </Link>
            <span>/</span>
            <span className="truncate text-neutral-400">{incident.reference_number || incident.id.slice(0, 8)}</span>
          </div>
          <h1 className="mt-1 truncate text-2xl font-bold text-neutral-100">{incident.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={severityTone(incident.severity)}>{incident.severity || 'unset'} severity</Badge>
            <Badge tone={statusTone(incident.status)}>{incident.status || 'open'}</Badge>
            {incident.is_drill && <Badge tone="blue">DRILL</Badge>}
            {incident.is_confidential && <Badge tone="zinc">confidential</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/incidents/${id}/matrix`}>
            <Button variant="secondary" size="sm">
              Obligation Matrix
            </Button>
          </Link>
          <Link href={`/dashboard/incidents/${id}/warroom`}>
            <Button variant="primary" size="sm">
              War Room
            </Button>
          </Link>
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {actionError}
        </div>
      )}

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Anchors" value={anchors.length} tone={anchors.length ? 'default' : 'amber'} />
        <Stat label="Data Categories" value={(factsForm.data_categories ?? []).length} />
        <Stat label="Comments" value={comments.length} />
        <Stat label="Attachments" value={attachments.length} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: incident edit + facts */}
        <div className="space-y-6 lg:col-span-2">
          {/* Incident details edit */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-200">Incident Details</h2>
              <Button size="sm" onClick={saveIncident} disabled={savingIncident}>
                {savingIncident ? <Spinner /> : 'Save'}
              </Button>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Title</label>
                <input
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
                  value={editForm.title ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-400">Reference #</label>
                  <input
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
                    value={editForm.reference_number ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, reference_number: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-400">Severity</label>
                  <select
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
                    value={editForm.severity ?? 'medium'}
                    onChange={(e) => setEditForm({ ...editForm, severity: e.target.value })}
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-400">Status</label>
                  <select
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
                    value={editForm.status ?? 'open'}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Summary</label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
                  value={editForm.summary ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-red-600"
                    checked={!!editForm.is_drill}
                    onChange={(e) => setEditForm({ ...editForm, is_drill: e.target.checked })}
                  />
                  Drill / tabletop exercise
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-red-600"
                    checked={!!editForm.is_confidential}
                    onChange={(e) => setEditForm({ ...editForm, is_confidential: e.target.checked })}
                  />
                  Confidential
                </label>
              </div>
            </CardBody>
          </Card>

          {/* Anchors editor */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-neutral-200">Clock Anchors</h2>
                <p className="text-xs text-neutral-500">Timestamps that start the regulatory clock.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={openNewAnchor}>
                Add Anchor
              </Button>
            </CardHeader>
            <CardBody>
              {sortedAnchors.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-500">
                  No anchors yet. Add a discovery or occurrence time to start the clock.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sortedAnchors.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge tone="amber">{a.anchor_type}</Badge>
                          {a.label && <span className="truncate text-sm text-neutral-300">{a.label}</span>}
                        </div>
                        <div className="mt-1 font-mono text-xs text-neutral-500">{fmtDateTime(a.occurred_at)}</div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditAnchor(a)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeAnchor(a)}>
                          Delete
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Facts panel */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-neutral-200">Breach Facts</h2>
                <p className="text-xs text-neutral-500">Drives which obligations trigger on recompute.</p>
              </div>
              <Button size="sm" onClick={saveFacts} disabled={savingFacts}>
                {savingFacts ? <Spinner /> : 'Save Facts'}
              </Button>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Data Categories</label>
                <div className="flex flex-wrap gap-2">
                  {(factsForm.data_categories ?? []).map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-300"
                    >
                      {c}
                      <button
                        type="button"
                        className="text-neutral-500 hover:text-red-400"
                        onClick={() => removeDataCategory(c)}
                        aria-label={`Remove ${c}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {(factsForm.data_categories ?? []).length === 0 && (
                    <span className="text-xs text-neutral-600">No categories added</span>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
                    placeholder="e.g. financial, health, credentials"
                    value={dataCatInput}
                    onChange={(e) => setDataCatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addDataCategory()
                      }
                    }}
                  />
                  <Button size="sm" variant="secondary" onClick={addDataCategory}>
                    Add
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(
                  [
                    ['special_category', 'Special-category data'],
                    ['encrypted', 'Data was encrypted'],
                    ['attacker_access_confirmed', 'Attacker access confirmed'],
                    ['exfiltration_confirmed', 'Exfiltration confirmed'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-red-600"
                      checked={!!factsForm[key]}
                      onChange={(e) => setFactsForm({ ...factsForm, [key]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Risk of Harm</label>
                <select
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
                  value={factsForm.risk_of_harm ?? 'none'}
                  onChange={(e) => setFactsForm({ ...factsForm, risk_of_harm: e.target.value })}
                >
                  {RISK_LEVELS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Notes</label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
                  value={factsForm.notes ?? ''}
                  onChange={(e) => setFactsForm({ ...factsForm, notes: e.target.value })}
                />
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Right column: recompute, comments, attachments */}
        <div className="space-y-6">
          {/* Recompute */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-neutral-200">Obligation Engine</h2>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="text-xs text-neutral-500">
                Recompute regenerates the obligation matrix from current anchors and facts. Existing obligations are
                replaced.
              </p>
              <Button className="w-full" onClick={recompute} disabled={recomputing}>
                {recomputing ? <Spinner label="Recomputing..." /> : 'Recompute Obligations'}
              </Button>
              {recomputeResult && (
                <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
                  {recomputeResult}{' '}
                  <Link href={`/dashboard/incidents/${id}/matrix`} className="underline hover:text-emerald-200">
                    View matrix
                  </Link>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Comments */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-neutral-200">Comments</h2>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="max-h-72 space-y-3 overflow-y-auto">
                {comments.length === 0 ? (
                  <p className="text-xs text-neutral-600">No comments yet.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2">
                      <div className="flex items-center justify-between text-xs text-neutral-500">
                        <span className="truncate">{c.author_id === userId ? 'You' : c.author_id || 'Unknown'}</span>
                        <span>{fmtDateTime(c.created_at)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-200">{c.body}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-2">
                <textarea
                  rows={2}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
                  placeholder="Add a comment. Use @name to notify."
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                />
                <Button
                  size="sm"
                  className="w-full"
                  onClick={postComment}
                  disabled={postingComment || !commentBody.trim()}
                >
                  {postingComment ? <Spinner /> : 'Post Comment'}
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-200">Attachments</h2>
              <Button size="sm" variant="secondary" onClick={() => setAttachModalOpen(true)}>
                Add
              </Button>
            </CardHeader>
            <CardBody>
              {attachments.length === 0 ? (
                <p className="text-xs text-neutral-600">No attachments.</p>
              ) : (
                <ul className="space-y-2">
                  {attachments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <a
                          href={a.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm text-neutral-200 hover:text-red-400"
                        >
                          {a.name}
                        </a>
                        {a.content_type && <span className="text-xs text-neutral-600">{a.content_type}</span>}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeAttachment(a)}>
                        Delete
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Anchor modal */}
      <Modal
        open={anchorModalOpen}
        onClose={() => setAnchorModalOpen(false)}
        title={editingAnchor ? 'Edit Anchor' : 'Add Anchor'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAnchorModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAnchor} disabled={savingAnchor}>
              {savingAnchor ? <Spinner /> : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Anchor Type</label>
            <select
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
              value={anchorForm.anchor_type}
              onChange={(e) => setAnchorForm({ ...anchorForm, anchor_type: e.target.value })}
            >
              {ANCHOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Label (optional)</label>
            <input
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
              value={anchorForm.label}
              onChange={(e) => setAnchorForm({ ...anchorForm, label: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Occurred At</label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
              value={anchorForm.occurred_at}
              onChange={(e) => setAnchorForm({ ...anchorForm, occurred_at: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {/* Attachment modal */}
      <Modal
        open={attachModalOpen}
        onClose={() => setAttachModalOpen(false)}
        title="Add Attachment"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAttachModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAttachment} disabled={savingAttach}>
              {savingAttach ? <Spinner /> : 'Add'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Name</label>
            <input
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
              value={attachForm.name}
              onChange={(e) => setAttachForm({ ...attachForm, name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">URI</label>
            <input
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
              placeholder="https://..."
              value={attachForm.uri}
              onChange={(e) => setAttachForm({ ...attachForm, uri: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Content Type (optional)</label>
            <input
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-red-600 focus:outline-none"
              placeholder="application/pdf"
              value={attachForm.content_type}
              onChange={(e) => setAttachForm({ ...attachForm, content_type: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Incident"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteIncident} disabled={deleting}>
              {deleting ? <Spinner /> : 'Delete Permanently'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          This permanently deletes <span className="font-semibold text-neutral-100">{incident.title}</span> and all of its
          obligations, anchors, comments, and attachments. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
