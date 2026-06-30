'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Artifact {
  id: string
  obligation_id: string
  incident_id: string
  title: string
  body: string | null
  status: string
  recipient_detail: string | null
  delivery_channel: string | null
  created_by: string
  created_at: string
  updated_at: string
}

interface ArtifactVersion {
  id: string
  artifact_id: string
  version: number
  body: string
  created_by: string
  created_at: string
}

interface Signoff {
  id: string
  artifact_id: string
  approver_id: string
  decision: string
  comment: string | null
  approved_version: number | null
  decided_at: string | null
  created_by: string
  created_at: string
}

interface Delivery {
  id: string
  artifact_id: string
  obligation_id: string
  method: string
  confirmation_ref: string | null
  evidence_uri: string | null
  delivered_at: string
  was_late: boolean
  created_by: string
  created_at: string
}

const ARTIFACT_STATUSES = ['not_started', 'drafting', 'in_review', 'approved', 'sent', 'delivered', 'failed']

function statusTone(status: string): 'red' | 'amber' | 'green' | 'blue' | 'zinc' {
  switch (status) {
    case 'not_started':
    case 'failed':
      return 'red'
    case 'drafting':
    case 'in_review':
      return 'amber'
    case 'approved':
    case 'sent':
      return 'blue'
    case 'delivered':
      return 'green'
    default:
      return 'zinc'
  }
}

function decisionTone(decision: string): 'red' | 'amber' | 'green' | 'zinc' {
  switch (decision) {
    case 'approved':
      return 'green'
    case 'rejected':
      return 'red'
    case 'pending':
      return 'amber'
    default:
      return 'zinc'
  }
}

function fmt(dt: string | null | undefined): string {
  if (!dt) return '—'
  const d = new Date(dt)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ArtifactDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()

  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [versions, setVersions] = useState<ArtifactVersion[]>([])
  const [signoffs, setSignoffs] = useState<Signoff[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  // editor
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState('drafting')
  const [savedBody, setSavedBody] = useState('')
  const [savedTitle, setSavedTitle] = useState('')
  const [saving, setSaving] = useState(false)

  // delete
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // version preview
  const [previewVersion, setPreviewVersion] = useState<ArtifactVersion | null>(null)

  // request signoff
  const [signoffOpen, setSignoffOpen] = useState(false)
  const [approverId, setApproverId] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [signoffError, setSignoffError] = useState<string | null>(null)

  // decision
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [decisionComment, setDecisionComment] = useState('')
  const [submittingDecision, setSubmittingDecision] = useState(false)

  // record delivery
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [delMethod, setDelMethod] = useState('portal')
  const [delConfirmation, setDelConfirmation] = useState('')
  const [delEvidence, setDelEvidence] = useState('')
  const [delAt, setDelAt] = useState('')
  const [recording, setRecording] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)

  const hydrate = useCallback((a: Artifact) => {
    setArtifact(a)
    setTitle(a.title)
    setSavedTitle(a.title)
    setBody(a.body ?? '')
    setSavedBody(a.body ?? '')
    setStatus(a.status)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const detail = await api.getArtifact(id)
      const a: Artifact = detail.artifact ?? detail
      hydrate(a)
      const vs = detail.versions ?? (await api.getArtifactVersions(id))
      setVersions(Array.isArray(vs) ? [...vs].sort((x, y) => y.version - x.version) : [])
      const so = detail.signoffs ?? (await api.getSignoffs(id))
      setSignoffs(Array.isArray(so) ? so : [])
      const dl = detail.delivery
        ? (Array.isArray(detail.delivery) ? detail.delivery : [detail.delivery])
        : await api.getDeliveries({ artifactId: id })
      setDeliveries(Array.isArray(dl) ? dl : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load artifact')
    } finally {
      setLoading(false)
    }
  }, [id, hydrate])

  useEffect(() => {
    load()
  }, [load])

  const dirty = artifact !== null && (body !== savedBody || title !== savedTitle || status !== artifact.status)

  async function refreshVersions() {
    try {
      const vs = await api.getArtifactVersions(id)
      setVersions(Array.isArray(vs) ? [...vs].sort((x, y) => y.version - x.version) : [])
    } catch {
      /* non-fatal */
    }
  }

  async function save() {
    if (!artifact) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateArtifact(artifact.id, { title, body, status })
      const a: Artifact = updated.artifact ?? updated
      hydrate(a)
      setBanner('Saved.')
      // body change snapshots a new version on the backend
      await refreshVersions()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save artifact')
    } finally {
      setSaving(false)
    }
  }

  async function quickStatus(next: string) {
    if (!artifact) return
    setSaving(true)
    try {
      const updated = await api.updateArtifact(artifact.id, { status: next })
      const a: Artifact = updated.artifact ?? updated
      hydrate(a)
      setStatus(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setSaving(false)
    }
  }

  async function doDelete() {
    if (!artifact) return
    setDeleting(true)
    try {
      await api.deleteArtifact(artifact.id)
      router.push(`/dashboard/obligations/${artifact.obligation_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete artifact')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function requestSignoff(e: React.FormEvent) {
    e.preventDefault()
    if (!artifact || !approverId.trim()) return
    setRequesting(true)
    setSignoffError(null)
    try {
      const created: Signoff = await api.requestSignoff({
        artifact_id: artifact.id,
        approver_id: approverId.trim(),
      })
      setSignoffs((prev) => [created, ...prev])
      setSignoffOpen(false)
      setApproverId('')
    } catch (e) {
      setSignoffError(e instanceof Error ? e.message : 'Failed to request sign-off')
    } finally {
      setRequesting(false)
    }
  }

  async function decide(signoffId: string, decision: 'approved' | 'rejected') {
    setSubmittingDecision(true)
    setError(null)
    try {
      const updated: Signoff = await api.decideSignoff(signoffId, {
        decision,
        comment: decisionComment.trim() || null,
      })
      setSignoffs((prev) => prev.map((s) => (s.id === signoffId ? { ...s, ...updated } : s)))
      setDecidingId(null)
      setDecisionComment('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record decision')
    } finally {
      setSubmittingDecision(false)
    }
  }

  async function recordDelivery(e: React.FormEvent) {
    e.preventDefault()
    if (!artifact) return
    setRecording(true)
    setDeliveryError(null)
    try {
      const payload: Record<string, unknown> = {
        artifact_id: artifact.id,
        obligation_id: artifact.obligation_id,
        method: delMethod,
        confirmation_ref: delConfirmation.trim() || null,
        evidence_uri: delEvidence.trim() || null,
      }
      if (delAt) payload.delivered_at = new Date(delAt).toISOString()
      const created: Delivery = await api.recordDelivery(payload)
      setDeliveries((prev) => [created, ...prev])
      setDeliveryOpen(false)
      setDelConfirmation('')
      setDelEvidence('')
      setDelAt('')
      // delivery flips artifact + obligation to delivered
      await load()
    } catch (e) {
      setDeliveryError(e instanceof Error ? e.message : 'Failed to record delivery')
    } finally {
      setRecording(false)
    }
  }

  if (loading) return <PageSpinner label="Loading artifact..." />

  if (error && !artifact) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <Card className="border-red-900/60">
          <CardBody>
            <h2 className="text-lg font-semibold text-red-300">Could not load artifact</h2>
            <p className="mt-1 text-sm text-zinc-400">{error}</p>
            <div className="mt-4 flex gap-2">
              <Button onClick={load}>Retry</Button>
              <Button variant="secondary" onClick={() => router.back()}>
                Go back
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  if (!artifact) return null

  const approvedCount = signoffs.filter((s) => s.decision === 'approved').length
  const pendingCount = signoffs.filter((s) => s.decision === 'pending').length
  const rejectedCount = signoffs.filter((s) => s.decision === 'rejected').length
  const latestDelivery = deliveries[0] ?? null

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Link
              href={`/dashboard/obligations/${artifact.obligation_id}`}
              className="hover:text-zinc-300"
            >
              Obligation
            </Link>
            <span>/</span>
            <span className="text-zinc-400">Artifact</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-zinc-100">{savedTitle || 'Untitled notice'}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(artifact.status)}>{artifact.status.replace(/_/g, ' ')}</Badge>
            {artifact.delivery_channel && <Badge tone="zinc">{artifact.delivery_channel}</Badge>}
            {latestDelivery && (
              <Badge tone={latestDelivery.was_late ? 'red' : 'green'}>
                {latestDelivery.was_late ? 'delivered late' : 'delivered on time'}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      {banner && (
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-300">
          {banner}
        </div>
      )}

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Versions" value={versions.length} />
        <Stat label="Approved" value={approvedCount} tone={approvedCount > 0 ? 'green' : 'default'} />
        <Stat label="Pending" value={pendingCount} tone={pendingCount > 0 ? 'amber' : 'default'} />
        <Stat label="Rejected" value={rejectedCount} tone={rejectedCount > 0 ? 'red' : 'default'} />
      </div>

      {/* editor */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Editor</h2>
          <div className="flex items-center gap-2">
            {dirty && <span className="text-xs text-amber-400">Unsaved changes</span>}
            <Button size="sm" onClick={save} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
              >
                {ARTIFACT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => quickStatus('in_review')}
                disabled={saving || artifact.status === 'in_review'}
              >
                Mark in review
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => quickStatus('approved')}
                disabled={saving || artifact.status === 'approved'}
              >
                Mark approved
              </Button>
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs uppercase tracking-wide text-zinc-500">
                Notice body
              </label>
              <span className="text-[11px] text-zinc-500">{body.length} chars</span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              placeholder="Draft the notice text. Saving with a changed body snapshots a new version."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm leading-relaxed text-zinc-200 focus:border-red-500 focus:outline-none"
            />
          </div>
        </CardBody>
      </Card>

      {/* sign-off workflow */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Sign-off workflow</h2>
          <Button size="sm" onClick={() => setSignoffOpen(true)}>
            + Request sign-off
          </Button>
        </CardHeader>
        <CardBody>
          {signoffs.length === 0 ? (
            <EmptyState
              title="No sign-offs requested"
              description="Assign an approver to route this notice for legal or DPO review before delivery."
              action={<Button size="sm" onClick={() => setSignoffOpen(true)}>Request a sign-off</Button>}
            />
          ) : (
            <ul className="space-y-3">
              {signoffs.map((s) => (
                <li key={s.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={decisionTone(s.decision)}>{s.decision}</Badge>
                      <span className="text-sm text-zinc-200">{s.approver_id}</span>
                      {s.approved_version != null && (
                        <span className="text-xs text-zinc-500">v{s.approved_version}</span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-500">
                      {s.decided_at ? `Decided ${fmt(s.decided_at)}` : `Requested ${fmt(s.created_at)}`}
                    </span>
                  </div>
                  {s.comment && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">{s.comment}</p>
                  )}
                  {s.decision === 'pending' && (
                    <div className="mt-3">
                      {decidingId === s.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={decisionComment}
                            onChange={(e) => setDecisionComment(e.target.value)}
                            rows={2}
                            placeholder="Optional decision comment"
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => decide(s.id, 'approved')}
                              disabled={submittingDecision}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => decide(s.id, 'rejected')}
                              disabled={submittingDecision}
                            >
                              Reject
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDecidingId(null)
                                setDecisionComment('')
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setDecidingId(s.id)
                            setDecisionComment('')
                          }}
                        >
                          Record decision
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* proof of delivery */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Proof of delivery</h2>
          <Button size="sm" onClick={() => setDeliveryOpen(true)}>
            + Record delivery
          </Button>
        </CardHeader>
        <CardBody>
          {deliveries.length === 0 ? (
            <EmptyState
              title="Not yet delivered"
              description="Recording delivery captures the method, confirmation reference, and evidence, computes whether it was late, and marks the obligation delivered."
              action={<Button size="sm" onClick={() => setDeliveryOpen(true)}>Record proof of delivery</Button>}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Method</TH>
                  <TH>Delivered at</TH>
                  <TH>Timeliness</TH>
                  <TH>Confirmation</TH>
                  <TH>Evidence</TH>
                </TR>
              </THead>
              <TBody>
                {deliveries.map((d) => (
                  <TR key={d.id}>
                    <TD className="capitalize">{d.method.replace(/_/g, ' ')}</TD>
                    <TD>{fmt(d.delivered_at)}</TD>
                    <TD>
                      <Badge tone={d.was_late ? 'red' : 'green'}>
                        {d.was_late ? 'Late' : 'On time'}
                      </Badge>
                    </TD>
                    <TD>{d.confirmation_ref ?? '—'}</TD>
                    <TD>
                      {d.evidence_uri ? (
                        <a
                          href={d.evidence_uri}
                          target="_blank"
                          rel="noreferrer"
                          className="text-red-400 hover:text-red-300 hover:underline"
                        >
                          View
                        </a>
                      ) : (
                        '—'
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* version history */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-zinc-200">Version history</h2>
        </CardHeader>
        <CardBody>
          {versions.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No versions yet. Each save with a changed body snapshots a version here.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Version</TH>
                  <TH>Author</TH>
                  <TH>Created</TH>
                  <TH>Size</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {versions.map((v) => (
                  <TR key={v.id}>
                    <TD className="font-medium text-zinc-100">v{v.version}</TD>
                    <TD>{v.created_by}</TD>
                    <TD className="text-zinc-400">{fmt(v.created_at)}</TD>
                    <TD className="text-zinc-400">{v.body.length} chars</TD>
                    <TD className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setPreviewVersion(v)}>
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

      {/* request signoff modal */}
      <Modal
        open={signoffOpen}
        onClose={() => setSignoffOpen(false)}
        title="Request sign-off"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setSignoffOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={requesting || !approverId.trim()} onClick={requestSignoff}>
              {requesting ? 'Requesting…' : 'Request'}
            </Button>
          </>
        }
      >
        <form onSubmit={requestSignoff} className="space-y-4">
          {signoffError && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {signoffError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Approver user id
            </label>
            <input
              value={approverId}
              onChange={(e) => setApproverId(e.target.value)}
              placeholder="user id of the approver"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              The approver gets a notification to approve or reject the current draft.
            </p>
          </div>
        </form>
      </Modal>

      {/* record delivery modal */}
      <Modal
        open={deliveryOpen}
        onClose={() => setDeliveryOpen(false)}
        title="Record proof of delivery"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDeliveryOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={recording} onClick={recordDelivery}>
              {recording ? 'Recording…' : 'Record'}
            </Button>
          </>
        }
      >
        <form onSubmit={recordDelivery} className="space-y-4">
          {deliveryError && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {deliveryError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Method</label>
            <select
              value={delMethod}
              onChange={(e) => setDelMethod(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            >
              <option value="portal">Portal</option>
              <option value="email">Email</option>
              <option value="certified_mail">Certified mail</option>
              <option value="courier">Courier</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Delivered at
            </label>
            <input
              type="datetime-local"
              value={delAt}
              onChange={(e) => setDelAt(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-zinc-500">Leave blank to use the current time.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Confirmation reference
            </label>
            <input
              value={delConfirmation}
              onChange={(e) => setDelConfirmation(e.target.value)}
              placeholder="portal ticket / tracking number"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Evidence URI
            </label>
            <input
              value={delEvidence}
              onChange={(e) => setDelEvidence(e.target.value)}
              placeholder="https://… receipt or screenshot"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            />
          </div>
        </form>
      </Modal>

      {/* version preview modal */}
      <Modal
        open={previewVersion !== null}
        onClose={() => setPreviewVersion(null)}
        title={previewVersion ? `Version ${previewVersion.version}` : 'Version'}
        className="max-w-2xl"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setPreviewVersion(null)}>
            Close
          </Button>
        }
      >
        {previewVersion && (
          <div className="space-y-3">
            <div className="text-xs text-zinc-500">
              {previewVersion.created_by} · {fmt(previewVersion.created_at)}
            </div>
            <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm text-zinc-200">
              {previewVersion.body || '(empty)'}
            </pre>
          </div>
        )}
      </Modal>

      {/* delete confirm modal */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete artifact"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={doDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-300">
          This permanently deletes <span className="font-medium text-zinc-100">{savedTitle}</span> and
          its version history. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
