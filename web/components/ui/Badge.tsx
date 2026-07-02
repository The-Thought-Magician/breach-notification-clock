import type { HTMLAttributes } from 'react'

type Tone = 'neutral' | 'red' | 'amber' | 'green' | 'blue' | 'zinc'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

const tones: Record<Tone, string> = {
  neutral: 'bg-neutral-800 text-neutral-300 border-neutral-700',
  zinc: 'bg-neutral-800 text-neutral-300 border-neutral-700',
  red: 'bg-red-950/60 text-red-300 border-red-800',
  amber: 'bg-amber-950/50 text-amber-300 border-amber-800',
  green: 'bg-emerald-950/50 text-emerald-300 border-emerald-800',
  blue: 'bg-sky-950/50 text-sky-300 border-sky-800',
}

export function Badge({ tone = 'neutral', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}

export default Badge
