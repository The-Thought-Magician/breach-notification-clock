'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical', tone: 'border-red-700 bg-red-950/40 text-red-300' },
  { value: 'high', label: 'High', tone: 'border-red-800 bg-red-950/30 text-red-300' },
  { value: 'medium', label: 'Medium', tone: 'border-amber-800 bg-amber-950/30 text-amber-300' },
  { value: 'low', label: 'Low', tone: 'border-emerald-800 bg-emerald-950/30 text-emerald-300' },
]

const STATUS_OPTIONS = ['triage', 'investigating', 'notifying', 'monitoring', 'closed']

interface FieldProps {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}

function Field({ label, hint, required, children }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-zinc-300">
        {label}
        {required && <span className="text-red-500">*</span>}
        {hint && <span className="ml-auto text-xs font-normal text-zinc-600">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500'

export default function NewIncidentPage() {
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [severity, setSeverity] = useState('high')
  const [status, setStatus] = useState('triage')
  const [summary, setSummary] = useState('')
  const [isDrill, setIsDrill] = useState(false)
  const [isConfidential, setIsConfidential] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('A title is required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        severity,
        status,
        is_drill: isDrill,
        is_confidential: isConfidential,
      }
      if (referenceNumber.trim()) payload.reference_number = referenceNumber.trim()
      if (summary.trim()) payload.summary = summary.trim()

      const created = await api.createIncident(payload)
      const id = created?.id
      if (id) router.push(`/dashboard/incidents/${id}`)
      else router.push('/dashboard/incidents')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create incident')
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link href="/dashboard/incidents" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Back to incidents
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-100">Log a new incident</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Start the notification clock. You can add anchors, facts, and affected populations after creation.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-zinc-200">Incident details</h2>
          </CardHeader>
          <CardBody className="space-y-5">
            <Field label="Title" required>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Unauthorized access to customer database"
                className={inputCls}
                autoFocus
              />
            </Field>

            <Field label="Reference number" hint="optional internal ID">
              <input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. INC-2026-0042"
                className={`${inputCls} font-mono`}
              />
            </Field>

            <Field label="Severity" required>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SEVERITY_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setSeverity(opt.value)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      severity === opt.value
                        ? opt.tone
                        : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Summary" hint="optional">
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={4}
                placeholder="What happened, what systems are involved, and current understanding of scope..."
                className={`${inputCls} resize-y`}
              />
            </Field>

            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={isDrill}
                  onChange={(e) => setIsDrill(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-red-600"
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-200">Tabletop drill</span>
                  <span className="block text-xs text-zinc-500">
                    Mark as a practice exercise. Drills are excluded from real deadline counts.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={isConfidential}
                  onChange={(e) => setIsConfidential(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-red-600"
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-200">Privileged / confidential</span>
                  <span className="block text-xs text-zinc-500">
                    Flag work product as confidential for legal-privilege handling.
                  </span>
                </span>
              </label>
            </div>
          </CardBody>
        </Card>

        <div className="mt-5 flex items-center justify-end gap-3">
          <Link href="/dashboard/incidents">
            <Button type="button" variant="ghost" disabled={submitting}>
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create incident'}
          </Button>
        </div>
      </form>
    </div>
  )
}
