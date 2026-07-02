'use client'

import { useEffect, useState, useCallback, useMemo, use } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

type Obligation = {
  id: string
  recipient?: string | null
  recipient_type?: string | null
  jurisdiction_code?: string | null
  deadline_at?: string | null
  status?: string | null
  is_undue_delay?: boolean
  why_triggered?: string | null
}

type WarRoom = {
  incident?: { id: string; title: string; status?: string | null; severity?: string | null } | null
  obligations?: Obligation[]
  nextDeadline?: string | null
  counts?: Record<string, number> | null
}

type Band = 'overdue' | 'critical' | 'warning' | 'ok' | 'done' | 'none'

function bandFor(deadlineAt?: string | null, status?: string | null): Band {
  if (status === 'delivered' || status === 'not_required' || status === 'closed') return 'done'
  if (!deadlineAt) return 'none'
  const ms = new Date(deadlineAt).getTime() - Date.now()
  if (isNaN(ms)) return 'none'
  if (ms < 0) return 'overdue'
  const hrs = ms / 3_600_000
  if (hrs <= 24) return 'critical'
  if (hrs <= 72) return 'warning'
  return 'ok'
}

const BAND: Record<Band, { ring: string; text: string; chip: string; label: string }> = {
  overdue: { ring: 'border-red-600 bg-red-950/40', text: 'text-red-400', chip: 'bg-red-600 text-white', label: 'OVERDUE' },
  critical: { ring: 'border-red-700/70 bg-red-950/25', text: 'text-red-400', chip: 'bg-red-700 text-white', label: '< 24H' },
  warning: { ring: 'border-amber-700/70 bg-amber-950/20', text: 'text-amber-400', chip: 'bg-amber-600 text-black', label: '< 72H' },
  ok: { ring: 'border-neutral-800 bg-neutral-900', text: 'text-emerald-400', chip: 'bg-emerald-700 text-white', label: 'ON TRACK' },
  done: { ring: 'border-emerald-800/60 bg-emerald-950/20', text: 'text-emerald-400', chip: 'bg-emerald-800 text-emerald-100', label: 'DONE' },
  none: { ring: 'border-neutral-800 bg-neutral-900', text: 'text-neutral-400', chip: 'bg-neutral-700 text-neutral-200', label: 'NO DEADLINE' },
}

function parts(deadlineAt?: string | null): { d: number; h: number; m: number; s: number; late: boolean } | null {
  if (!deadlineAt) return null
  const diff = new Date(deadlineAt).getTime() - Date.now()
  if (isNaN(diff)) return null
  const abs = Math.abs(diff)
  return {
    d: Math.floor(abs / 86_400_000),
    h: Math.floor((abs % 86_400_000) / 3_600_000),
    m: Math.floor((abs % 3_600_000) / 60_000),
    s: Math.floor((abs % 60_000) / 1000),
    late: diff < 0,
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export default function WarRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<WarRoom | null>(null)
  const [, setTick] = useState(0)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await api.getWarRoom(id)
      setData(res ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load war room')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // 1s tick for countdowns
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Refetch data every 60s to stay in sync with backend
  useEffect(() => {
    const t = setInterval(() => load(), 60_000)
    return () => clearInterval(t)
  }, [load])

  const obligations = useMemo(() => data?.obligations ?? [], [data])

  const sorted = useMemo(() => {
    const active = obligations.filter((o) => bandFor(o.deadline_at, o.status) !== 'done')
    const done = obligations.filter((o) => bandFor(o.deadline_at, o.status) === 'done')
    const byDeadline = (a: Obligation, b: Obligation) => {
      const at = a.deadline_at ? new Date(a.deadline_at).getTime() : Number.MAX_SAFE_INTEGER
      const bt = b.deadline_at ? new Date(b.deadline_at).getTime() : Number.MAX_SAFE_INTEGER
      return at - bt
    }
    return [...active.sort(byDeadline), ...done.sort(byDeadline)]
  }, [obligations])

  const hero = useMemo(() => {
    const active = obligations
      .filter((o) => bandFor(o.deadline_at, o.status) !== 'done' && o.deadline_at)
      .sort((a, b) => new Date(a.deadline_at!).getTime() - new Date(b.deadline_at!).getTime())
    return active[0] ?? null
  }, [obligations])

  const counts = useMemo(() => {
    const c: Record<Band, number> = { overdue: 0, critical: 0, warning: 0, ok: 0, done: 0, none: 0 }
    for (const o of obligations) c[bandFor(o.deadline_at, o.status)]++
    return c
  }, [obligations])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label="Loading war room..." />
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        title="Could not load war room"
        description={error}
        action={
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        }
      />
    )
  }

  const heroBand = hero ? bandFor(hero.deadline_at, hero.status) : 'none'
  const heroMeta = BAND[heroBand]
  const heroParts = hero ? parts(hero.deadline_at) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-neutral-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Link href={`/dashboard/incidents/${id}`} className="hover:text-neutral-300">
              Incident
            </Link>
            <span>/</span>
            <span className="text-neutral-400">War Room</span>
          </div>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold text-neutral-100">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
            </span>
            {data?.incident?.title ?? 'Incident War Room'}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/incidents/${id}/matrix`}>
            <Button variant="secondary" size="sm">
              Matrix
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={load}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Hero next deadline */}
      <div className={`rounded-2xl border-2 p-8 text-center ${heroMeta.ring}`}>
        {hero && heroParts ? (
          <>
            <div className="flex items-center justify-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-bold tracking-widest ${heroMeta.chip}`}>
                {heroMeta.label}
              </span>
              <span className="text-sm uppercase tracking-widest text-neutral-500">Next deadline</span>
            </div>
            <div className="mt-4 text-lg font-semibold text-neutral-200">
              {hero.recipient || 'Recipient'}{' '}
              <span className="text-neutral-500">· {hero.jurisdiction_code || 'global'}</span>
            </div>
            <div className={`mt-4 font-mono text-5xl font-black tabular-nums sm:text-7xl ${heroMeta.text}`}>
              {heroParts.d > 0 && <span>{heroParts.d}d </span>}
              {pad(heroParts.h)}:{pad(heroParts.m)}:{pad(heroParts.s)}
            </div>
            <div className={`mt-2 text-sm font-medium ${heroMeta.text}`}>
              {heroParts.late ? 'PAST DEADLINE' : 'remaining'}
              {hero.is_undue_delay && <span className="ml-2 text-amber-400">· without undue delay</span>}
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              Due {hero.deadline_at ? new Date(hero.deadline_at).toLocaleString() : '—'}
            </div>
          </>
        ) : (
          <div className="py-8">
            <div className="text-2xl font-bold text-emerald-400">All clear</div>
            <p className="mt-2 text-sm text-neutral-500">No active deadlines. Every obligation is delivered or has no clock.</p>
          </div>
        )}
      </div>

      {/* Count strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(
          [
            ['overdue', 'Overdue', counts.overdue],
            ['critical', '< 24h', counts.critical],
            ['warning', '< 72h', counts.warning],
            ['ok', 'On track', counts.ok],
            ['done', 'Done', counts.done],
          ] as const
        ).map(([b, label, n]) => (
          <div key={b} className={`rounded-xl border p-4 text-center ${BAND[b].ring}`}>
            <div className={`text-3xl font-black tabular-nums ${BAND[b].text}`}>{n}</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-neutral-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Countdown wall */}
      {sorted.length === 0 ? (
        <EmptyState
          title="No obligations on the clock"
          description="Recompute obligations on the incident detail page to populate the war room."
          action={
            <Link href={`/dashboard/incidents/${id}`}>
              <Button>Go to incident</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((o) => {
            const band = bandFor(o.deadline_at, o.status)
            const meta = BAND[band]
            const p = parts(o.deadline_at)
            return (
              <Link
                key={o.id}
                href={`/dashboard/obligations/${o.id}`}
                className={`block rounded-xl border-2 p-5 transition-transform hover:scale-[1.01] ${meta.ring}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest ${meta.chip}`}>
                    {meta.label}
                  </span>
                  <span className="text-xs text-neutral-500">{o.jurisdiction_code || 'global'}</span>
                </div>
                <div className="mt-3 truncate text-sm font-semibold text-neutral-100">{o.recipient || 'Recipient'}</div>
                <div className="text-xs text-neutral-500">{o.recipient_type || ''}</div>
                <div className={`mt-3 font-mono text-3xl font-black tabular-nums ${meta.text}`}>
                  {band === 'done' ? (
                    '✓'
                  ) : p ? (
                    <>
                      {p.d > 0 && <span>{p.d}d </span>}
                      {pad(p.h)}:{pad(p.m)}:{pad(p.s)}
                    </>
                  ) : (
                    '—'
                  )}
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  {band === 'done'
                    ? o.status
                    : p?.late
                      ? 'past deadline'
                      : o.deadline_at
                        ? `due ${new Date(o.deadline_at).toLocaleString()}`
                        : 'no deadline set'}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
