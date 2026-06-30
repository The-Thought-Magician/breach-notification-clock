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

interface Task {
  id: string
  incident_id?: string | null
  obligation_id?: string | null
  artifact_id?: string | null
  title: string
  assignee_id?: string | null
  status: string
  due_at?: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

const STATUSES = ['open', 'in_progress', 'blocked', 'done'] as const
type Status = (typeof STATUSES)[number]

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
}

function statusTone(s: string): 'red' | 'amber' | 'blue' | 'green' | 'zinc' {
  if (s === 'done') return 'green'
  if (s === 'blocked') return 'red'
  if (s === 'in_progress') return 'amber'
  if (s === 'open') return 'blue'
  return 'zinc'
}

function dueInfo(due?: string | null): { label: string; tone: 'red' | 'amber' | 'green' | 'zinc' } {
  if (!due) return { label: 'No due date', tone: 'zinc' }
  const d = new Date(due).getTime()
  const now = Date.now()
  const ms = d - now
  const hours = ms / 3_600_000
  const abs = Math.abs(hours)
  const human =
    abs >= 48 ? `${Math.round(abs / 24)}d` : abs >= 1 ? `${Math.round(abs)}h` : `${Math.round(abs * 60)}m`
  if (ms < 0) return { label: `${human} overdue`, tone: 'red' }
  if (hours <= 24) return { label: `in ${human}`, tone: 'red' }
  if (hours <= 72) return { label: `in ${human}`, tone: 'amber' }
  return { label: `in ${human}`, tone: 'green' }
}

function toLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

const emptyForm = {
  title: '',
  incident_id: '',
  obligation_id: '',
  status: 'open' as Status,
  due_at: '',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'board' | 'table'>('board')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getMyTasks()
      setTasks(Array.isArray(data) ? data : [])
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm })
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(t: Task) {
    setEditing(t)
    setForm({
      title: t.title ?? '',
      incident_id: t.incident_id ?? '',
      obligation_id: t.obligation_id ?? '',
      status: (STATUSES.includes(t.status as Status) ? t.status : 'open') as Status,
      due_at: toLocalInput(t.due_at),
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function save() {
    if (!form.title.trim()) {
      setFormError('Title is required.')
      return
    }
    setSaving(true)
    setFormError(null)
    const dueIso = form.due_at ? new Date(form.due_at).toISOString() : null
    try {
      if (editing) {
        await api.updateTask(editing.id, {
          title: form.title.trim(),
          status: form.status,
          due_at: dueIso,
        })
      } else {
        if (!form.incident_id.trim()) {
          setFormError('Incident ID is required to create a task.')
          setSaving(false)
          return
        }
        await api.createTask({
          title: form.title.trim(),
          incident_id: form.incident_id.trim(),
          obligation_id: form.obligation_id.trim() || null,
          status: form.status,
          due_at: dueIso,
        })
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(t: Task, status: Status) {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status } : x)))
    try {
      await api.updateTask(t.id, { status })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update task')
      await load()
    }
  }

  async function remove() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await api.deleteTask(confirmDelete.id)
      setConfirmDelete(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete task')
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  async function bulkSetStatus(status: Status) {
    if (selected.size === 0) return
    setBulkBusy(true)
    setError(null)
    try {
      await Promise.all(Array.from(selected).map((id) => api.updateTask(id, { status })))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk update failed')
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkDelete() {
    if (selected.size === 0) return
    setBulkBusy(true)
    setError(null)
    try {
      await Promise.all(Array.from(selected).map((id) => api.deleteTask(id)))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk delete failed')
    } finally {
      setBulkBusy(false)
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (!q) return true
      return (
        t.title.toLowerCase().includes(q) ||
        (t.incident_id ?? '').toLowerCase().includes(q) ||
        (t.obligation_id ?? '').toLowerCase().includes(q)
      )
    })
  }, [tasks, statusFilter, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, in_progress: 0, blocked: 0, done: 0 }
    for (const t of tasks) if (t.status in c) c[t.status]++
    return c
  }, [tasks])

  const overdue = useMemo(
    () => tasks.filter((t) => t.status !== 'done' && t.due_at && new Date(t.due_at).getTime() < Date.now()).length,
    [tasks]
  )

  if (loading) return <PageSpinner label="Loading your tasks..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">My Tasks</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Work assigned to you across all breach incidents, ordered by urgency.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-zinc-700">
            <button
              onClick={() => setView('board')}
              className={`px-3 py-1.5 text-xs font-medium ${
                view === 'board' ? 'bg-red-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setView('table')}
              className={`px-3 py-1.5 text-xs font-medium ${
                view === 'table' ? 'bg-red-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Table
            </button>
          </div>
          <Button onClick={openCreate}>+ New Task</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Total" value={tasks.length} />
        <Stat label="Open" value={counts.open} tone="default" />
        <Stat label="In progress" value={counts.in_progress} tone="amber" />
        <Stat label="Done" value={counts.done} tone="green" />
        <Stat label="Overdue" value={overdue} tone="red" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, incident, obligation..."
          className="w-64 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-red-600 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | Status)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 focus:border-red-600 focus:outline-none"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks assigned to you"
          description="Tasks created on incidents and assigned to you will appear here. Create one to get started."
          action={<Button onClick={openCreate}>+ New Task</Button>}
        />
      ) : view === 'board' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((col) => {
            const items = filtered.filter((t) => t.status === col)
            return (
              <div key={col} className="rounded-xl border border-zinc-800 bg-zinc-950/40">
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                    <Badge tone={statusTone(col)}>{STATUS_LABEL[col]}</Badge>
                  </span>
                  <span className="font-mono text-xs tabular-nums text-zinc-500">{items.length}</span>
                </div>
                <div className="space-y-2 p-3">
                  {items.length === 0 ? (
                    <p className="px-1 py-4 text-center text-xs text-zinc-600">Nothing here</p>
                  ) : (
                    items.map((t) => {
                      const due = dueInfo(t.due_at)
                      return (
                        <div
                          key={t.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 transition-colors hover:border-zinc-700"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-zinc-100">{t.title}</p>
                            <input
                              type="checkbox"
                              checked={selected.has(t.id)}
                              onChange={() => toggleSelect(t.id)}
                              className="mt-0.5 h-4 w-4 accent-red-600"
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge tone={due.tone}>{due.label}</Badge>
                            {t.incident_id && (
                              <span className="font-mono text-[10px] text-zinc-500">
                                inc:{t.incident_id.slice(0, 8)}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-1">
                            <select
                              value={t.status}
                              onChange={(e) => setStatus(t, e.target.value as Status)}
                              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 focus:border-red-600 focus:outline-none"
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABEL[s]}
                                </option>
                              ))}
                            </select>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                                Edit
                              </Button>
                              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(t)}>
                                Del
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardBody className="p-0">
            {filtered.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No matches" description="No task matches the current filters." />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH className="w-10"></TH>
                    <TH>Title</TH>
                    <TH>Status</TH>
                    <TH>Due</TH>
                    <TH>Incident</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((t) => {
                    const due = dueInfo(t.due_at)
                    return (
                      <TR key={t.id}>
                        <TD>
                          <input
                            type="checkbox"
                            checked={selected.has(t.id)}
                            onChange={() => toggleSelect(t.id)}
                            className="h-4 w-4 accent-red-600"
                          />
                        </TD>
                        <TD className="font-medium text-zinc-100">{t.title}</TD>
                        <TD>
                          <select
                            value={t.status}
                            onChange={(e) => setStatus(t, e.target.value as Status)}
                            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 focus:border-red-600 focus:outline-none"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        </TD>
                        <TD>
                          <Badge tone={due.tone}>{due.label}</Badge>
                        </TD>
                        <TD>
                          {t.incident_id ? (
                            <span className="font-mono text-xs text-zinc-500">{t.incident_id.slice(0, 8)}</span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </TD>
                        <TD className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                              Edit
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(t)}>
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
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/95 px-4 py-3 shadow-2xl backdrop-blur">
          <span className="text-sm text-zinc-300">{selected.size} selected</span>
          <div className="h-5 w-px bg-zinc-700" />
          <select
            onChange={(e) => {
              const v = e.target.value as Status
              if (v) bulkSetStatus(v)
              e.target.value = ''
            }}
            defaultValue=""
            disabled={bulkBusy}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 focus:border-red-600 focus:outline-none"
          >
            <option value="" disabled>
              Set status...
            </option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <Button variant="danger" size="sm" onClick={bulkDelete} disabled={bulkBusy}>
            {bulkBusy ? 'Working...' : 'Delete'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={bulkBusy}>
            Clear
          </Button>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit task' : 'New task'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Create task'}
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
          <Field label="Title">
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Draft regulator notice for ICO"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-red-600 focus:outline-none"
            />
          </Field>
          {!editing && (
            <>
              <Field label="Incident ID">
                <input
                  value={form.incident_id}
                  onChange={(e) => setForm((f) => ({ ...f, incident_id: e.target.value }))}
                  placeholder="incident uuid"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-red-600 focus:outline-none"
                />
              </Field>
              <Field label="Obligation ID (optional)">
                <input
                  value={form.obligation_id}
                  onChange={(e) => setForm((f) => ({ ...f, obligation_id: e.target.value }))}
                  placeholder="obligation uuid"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-red-600 focus:outline-none"
                />
              </Field>
            </>
          )}
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Status }))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-600 focus:outline-none"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due at">
            <input
              type="datetime-local"
              value={form.due_at}
              onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-red-600 focus:outline-none"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete task"
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
        <p className="text-sm text-zinc-300">
          Delete task <span className="font-semibold text-zinc-100">{confirmDelete?.title}</span>? This cannot
          be undone.
        </p>
      </Modal>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  )
}
