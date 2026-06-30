'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'

interface Notification {
  id: string
  user_id: string
  kind: string
  title: string
  body?: string | null
  link?: string | null
  is_read: boolean
  created_at: string
}

type KindTone = 'red' | 'amber' | 'green' | 'blue' | 'zinc'

const KIND_TONE: Record<string, KindTone> = {
  deadline: 'red',
  signoff: 'amber',
  delivery: 'green',
  mention: 'blue',
}

const KIND_LABEL: Record<string, string> = {
  deadline: 'Deadline',
  signoff: 'Sign-off',
  delivery: 'Delivery',
  mention: 'Mention',
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread' | string>('all')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getNotifications()
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items])
  const kinds = useMemo(() => Array.from(new Set(items.map((n) => n.kind))), [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((n) => {
      if (filter === 'unread' && n.is_read) return false
      if (filter !== 'all' && filter !== 'unread' && n.kind !== filter) return false
      if (q) {
        const hay = `${n.title} ${n.body ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, filter, search])

  async function markRead(n: Notification) {
    if (n.is_read) return
    setBusyId(n.id)
    // optimistic
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
    try {
      await api.markNotificationRead(n.id)
    } catch (e) {
      // revert
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: false } : x)))
      setError(e instanceof Error ? e.message : 'Failed to mark read')
    } finally {
      setBusyId(null)
    }
  }

  async function markAll() {
    if (unreadCount === 0) return
    setMarkingAll(true)
    const snapshot = items
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })))
    try {
      await api.markAllNotificationsRead()
    } catch (e) {
      setItems(snapshot)
      setError(e instanceof Error ? e.message : 'Failed to mark all read')
    } finally {
      setMarkingAll(false)
    }
  }

  if (loading) return <PageSpinner label="Loading notifications..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Notifications</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Deadline alerts, sign-off requests, delivery confirmations and mentions.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total" value={items.length} />
        <Stat label="Unread" value={unreadCount} tone={unreadCount > 0 ? 'red' : 'green'} />
        <Stat label="Deadline alerts" value={items.filter((n) => n.kind === 'deadline').length} tone="amber" />
        <Stat label="Sign-off requests" value={items.filter((n) => n.kind === 'signoff').length} />
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              All
            </FilterChip>
            <FilterChip active={filter === 'unread'} onClick={() => setFilter('unread')}>
              Unread {unreadCount > 0 && <span className="ml-1 text-red-400">{unreadCount}</span>}
            </FilterChip>
            {kinds.map((k) => (
              <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)}>
                {KIND_LABEL[k] ?? k}
              </FilterChip>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications..."
              className="w-48 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-red-600 focus:outline-none"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={markAll}
              disabled={unreadCount === 0 || markingAll}
            >
              {markingAll ? <Spinner label="Working..." /> : 'Mark all read'}
            </Button>
          </div>
        </div>

        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              title={items.length === 0 ? 'No notifications yet' : 'Nothing matches'}
              description={
                items.length === 0
                  ? 'Alerts about approaching deadlines, sign-off requests and deliveries will appear here.'
                  : 'Adjust the filter or search to see more.'
              }
              icon="🔔"
            />
          ) : (
            <ul className="divide-y divide-zinc-800">
              {filtered.map((n) => {
                const tone = KIND_TONE[n.kind] ?? 'zinc'
                return (
                  <li
                    key={n.id}
                    className={`flex items-start gap-4 px-5 py-4 transition-colors hover:bg-zinc-900/60 ${
                      n.is_read ? 'opacity-70' : ''
                    }`}
                  >
                    <span
                      className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                        n.is_read ? 'bg-zinc-700' : 'bg-red-500'
                      }`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={tone}>{KIND_LABEL[n.kind] ?? n.kind}</Badge>
                        <span className="truncate font-medium text-zinc-100">{n.title}</span>
                        <span className="ml-auto shrink-0 text-xs text-zinc-500">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      {n.body && <p className="mt-1 text-sm text-zinc-400">{n.body}</p>}
                      <div className="mt-2 flex items-center gap-3">
                        {n.link && (
                          <Link
                            href={n.link}
                            onClick={() => markRead(n)}
                            className="text-xs font-medium text-red-400 hover:text-red-300"
                          >
                            View →
                          </Link>
                        )}
                        {!n.is_read && (
                          <button
                            onClick={() => markRead(n)}
                            disabled={busyId === n.id}
                            className="text-xs font-medium text-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                          >
                            {busyId === n.id ? 'Marking...' : 'Mark read'}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-red-700 bg-red-950/60 text-red-300'
          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}
