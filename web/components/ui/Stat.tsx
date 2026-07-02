import type { ReactNode } from 'react'

interface StatProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'red' | 'amber' | 'green'
  className?: string
}

const tones = {
  default: 'text-neutral-100',
  red: 'text-red-400',
  amber: 'text-amber-400',
  green: 'text-emerald-400',
}

export function Stat({ label, value, hint, tone = 'default', className = '' }: StatProps) {
  return (
    <div className={`rounded-xl border border-neutral-800 bg-neutral-900 px-5 py-4 ${className}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
    </div>
  )
}

export default Stat
