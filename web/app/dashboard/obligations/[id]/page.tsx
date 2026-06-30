'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

interface Obligation {
  id: string
  incident_id: string
  rule_id: string | null
  regulator_id: string | null
  jurisdiction_code: string | null
  recipient: string
  recipient_type: string
  deadline_at: string | null
  clock_anchor: string | null
  is_undue_delay: boolean
  status: string
  owner_id: string | null
  source: string
  why_triggered: string | null
  created_at: string
  updated_at: string
}

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

interface Comment {
  id: string
  entity_type: string
  entity_id: string
  author_id: string
  body: string
  created_at: string
  updated_at: string
}

const OBLIGATION_STATUSES = ['open', 'in_progress', 'sent', 'delivered', 'na']
const ARTIFACT_STATUSES = ['not_started', 'drafting', 'in_review', 'approved', 'sent', 'delivered', 'failed']

function statusTone(status: string): 'red' | 'amber' | 'green' | 'blue' | 'zinc' {
  switch (status) {
    case 'open':
    case 'not_started':
      return 'red'
    case 'in_progress':
    case 'drafting':
    case 'in_review':
      return 'amber'
    case 'sent':
    case 'approved':
      return 'blue'
    case 'delivered':
      return 'green'
    case 'failed':
      return 'red'
    case 'na':
      return 'zinc'
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

interface Remaining {
  ms: number
  label: string
  band: 'overdue' | 'critical' | 'warning' | 'ok' | 'none'
}

function remaining(deadline: string | null, now: number): Remaining {
  if (!deadline) return { ms: 0, label: 'Undue delay', band: 'none' }
  const target = new Date(deadline).getTime()
  if (isNaN(target)) return { ms: 0, label: '—', band: 'none' }
  const ms = target - now
  const abs = Math.abs(ms)
  const h = Math.floor(abs / 3_600_000)
  const m = Math.floor((abs % 3_600_000) / 60_000)
  const s = Math.floor((abs % 60_000) / 1000)
  const d = Math.floor(h / 24)
  const hr = h % 24
  let label: string
  if (d > 0) label = `${d}d ${hr}h ${m}m`
  else label = `${h}h ${m}m ${s}s`
  if (ms < 0) return { ms, label: `${label} overdue`, band: 'overdue' }
  let band: Remaining['band'] = 'ok'
  if (ms < 24 * 3_600_000) band = 'critical'
  else if (ms < 72 * 3_600_000) band = 'warning'
  return { ms, label, band }
}

const bandColor: Record<Remaining['band'], string> = {
  overdue: 'text-red-500',
  critical: 'text-red-400',
  warning: 'text-amber-400',
  ok: 'text-emerald-400',
  none: 'text-zinc-400',
}

export default function ObligationDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()

  const [obligation, setObligation] = useState<Obligation | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // status/owner edit
  const [savingMeta, setSavingMeta] = useState(false)

  // create-artifact modal
  const [createOpen, setCreateOpen] = useState(false)
  const [artTitle, setArtTitle] = useState('')
  const [artRecipient, setArtRecipient] = useState('')
  const [artChannel, setArtChannel] = useState('portal')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // comments
  const [commentBody, setCommentBody] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const detail = await api.getObligation(id)
      const obl: Obligation = detail.obligation ?? detail
      setObligation(obl)
      // detail may include artifacts; still fetch authoritative list
      const arts = detail.artifacts ?? (await api.getArtifacts({ obligationId: id }))
      setArtifacts(Array.isArray(arts) ? arts : [])
      const cmts = await api.getComments('obligation', id)
      setComments(Array.isArray(cmts) ? cmts : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load obligation')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const rem = useMemo(
    () => (obligation ? remaining(obligation.deadline_at, now) : null),
    [obligation, now],
  )

  async function changeStatus(status: string) {
    if (!obligation) return
    setSavingMeta(true)
    try {
      const updated = await api.updateObligation(obligation.id, { status })
      setObligation((prev) => (prev ? { ...prev, ...(updated.obligation ?? updated) } : prev))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setSavingMeta(false)
    }
  }

  async function saveOwner(owner_id: string) {
    if (!obligation) return
    setSavingMeta(true)
    try {
      const updated = await api.updateObligation(obligation.id, { owner_id })
      setObligation((prev) => (prev ? { ...prev, ...(updated.obligation ?? updated) } : prev))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update owner')
    } finally {
      setSavingMeta(false)
    }
  }

  async function submitArtifact(e: React.FormEvent) {
    e.preventDefault()
    if (!obligation) return
    setCreating(true)
    setCreateError(null)
    try {
      const created: Artifact = await api.createArtifact({
        obligation_id: obligation.id,
        incident_id: obligation.incident_id,
        title: artTitle.trim(),
        recipient_detail: artRecipient.trim() || null,
        delivery_channel: artChannel,
      })
      setArtifacts((prev) => [created, ...prev])
      setCreateOpen(false)
      setArtTitle('')
      setArtRecipient('')
      setArtChannel('portal')
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create artifact')
    } finally {
      setCreating(false)
    }
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentBody.trim()) return
    setPostingComment(true)
    try {
      const created: Comment = await api.createComment({
        entity_type: 'obligation',
        entity_id: id,
        body: commentBody.trim(),
      })
      setComments((prev) => [...prev, created])
      setCommentBody('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post comment')
    } finally {
      setPostingComment(false)
    }
  }

  if (loading) return <PageSpinner label="Loading obligation..." />

  if (error && !obligation) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <Card className="border-red-900/60">
          <CardBody>
            <h2 className="text-lg font-semibold text-red-300">Could not load obligation</h2>
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

  if (!obligation) return null

  const recipientLabel = obligation.recipient_type.replace(/_/g, ' ')

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      {/* breadcrumb / header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Link href="/dashboard/incidents" className="hover:text-zinc-300">
              Incidents
            </Link>
            <span>/</span>
            <Link
              href={`/dashboard/incidents/${obligation.incident_id}`}
              className="hover:text-zinc-300"
            >
              Incident
            </Link>
            <span>/</span>
            <span className="text-zinc-400">Obligation</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-zinc-100">{obligation.recipient}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(obligation.status)}>{obligation.status.replace(/_/g, ' ')}</Badge>
            <Badge tone="zinc">{recipientLabel}</Badge>
            <Badge tone={obligation.source === 'contractual' ? 'blue' : 'neutral'}>
              {obligation.source}
            </Badge>
            {obligation.jurisdiction_code && (
              <Badge tone="neutral">{obligation.jurisdiction_code}</Badge>
            )}
            {obligation.is_undue_delay && <Badge tone="amber">undue delay</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/incidents/${obligation.incident_id}/matrix`}>
            <Button variant="secondary" size="sm">
              Obligation matrix
            </Button>
          </Link>
          <Link href={`/dashboard/incidents/${obligation.incident_id}/warroom`}>
            <Button variant="secondary" size="sm">
              War room
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* countdown + stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          <CardBody>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Time remaining
            </div>
            <div className={`mt-2 font-mono text-2xl font-bold tabular-nums ${rem ? bandColor[rem.band] : ''}`}>
              {rem?.label ?? '—'}
            </div>
            <div className="mt-1 text-xs text-zinc-500">Deadline {fmt(obligation.deadline_at)}</div>
          </CardBody>
        </Card>
        <Stat label="Clock anchor" value={obligation.clock_anchor ?? '—'} />
        <Stat label="Artifacts" value={artifacts.length} hint="notices linked" />
      </div>

      {/* details + meta editor */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-sm font-semibold text-zinc-200">Why this obligation triggered</h2>
          </CardHeader>
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-zinc-300">
              {obligation.why_triggered || 'No trigger rationale recorded.'}
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Recipient type</dt>
                <dd className="mt-0.5 text-zinc-200">{recipientLabel}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Jurisdiction</dt>
                <dd className="mt-0.5 text-zinc-200">{obligation.jurisdiction_code ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Source</dt>
                <dd className="mt-0.5 text-zinc-200">{obligation.source}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Created</dt>
                <dd className="mt-0.5 text-zinc-200">{fmt(obligation.created_at)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-zinc-200">Manage</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
                Status
              </label>
              <select
                value={obligation.status}
                disabled={savingMeta}
                onChange={(e) => changeStatus(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none disabled:opacity-50"
              >
                {OBLIGATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
                Owner
              </label>
              <input
                defaultValue={obligation.owner_id ?? ''}
                placeholder="owner user id"
                disabled={savingMeta}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v !== (obligation.owner_id ?? '')) saveOwner(v)
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none disabled:opacity-50"
              />
              <p className="mt-1 text-[11px] text-zinc-500">Saved on blur.</p>
            </div>
            {savingMeta && <div className="text-xs text-zinc-500">Saving…</div>}
          </CardBody>
        </Card>
      </div>

      {/* artifacts */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Notice artifacts</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            + New artifact
          </Button>
        </CardHeader>
        <CardBody>
          {artifacts.length === 0 ? (
            <EmptyState
              title="No artifacts yet"
              description="Draft the notice that satisfies this obligation, route it for sign-off, and record proof of delivery."
              action={<Button size="sm" onClick={() => setCreateOpen(true)}>Draft the first notice</Button>}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Status</TH>
                  <TH>Channel</TH>
                  <TH>Recipient</TH>
                  <TH>Updated</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {artifacts.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-medium text-zinc-100">{a.title}</TD>
                    <TD>
                      <Badge tone={statusTone(a.status)}>{a.status.replace(/_/g, ' ')}</Badge>
                    </TD>
                    <TD>{a.delivery_channel ?? '—'}</TD>
                    <TD>{a.recipient_detail ?? '—'}</TD>
                    <TD className="text-zinc-400">{fmt(a.updated_at)}</TD>
                    <TD className="text-right">
                      <Link href={`/dashboard/artifacts/${a.id}`}>
                        <Button variant="ghost" size="sm">
                          Open →
                        </Button>
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* comments */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-zinc-200">Discussion</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          {comments.length === 0 ? (
            <p className="text-sm text-zinc-500">No comments yet. Start the discussion below.</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="font-medium text-zinc-400">{c.author_id}</span>
                    <span>{fmt(c.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={postComment} className="space-y-2">
            <textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              rows={3}
              placeholder="Add a comment. Use @userid to mention a teammate."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={postingComment || !commentBody.trim()}>
                {postingComment ? 'Posting…' : 'Comment'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* create artifact modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New notice artifact"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={creating || !artTitle.trim()} onClick={submitArtifact}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </>
        }
      >
        <form onSubmit={submitArtifact} className="space-y-4">
          {createError && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {createError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Title</label>
            <input
              value={artTitle}
              onChange={(e) => setArtTitle(e.target.value)}
              placeholder={`Notice to ${obligation.recipient}`}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Recipient detail
            </label>
            <input
              value={artRecipient}
              onChange={(e) => setArtRecipient(e.target.value)}
              placeholder="e.g. dpo@regulator.gov or portal reference"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Delivery channel
            </label>
            <select
              value={artChannel}
              onChange={(e) => setArtChannel(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-500 focus:outline-none"
            >
              <option value="portal">Portal</option>
              <option value="email">Email</option>
              <option value="certified_mail">Certified mail</option>
              <option value="courier">Courier</option>
            </select>
          </div>
        </form>
      </Modal>
    </div>
  )
}
