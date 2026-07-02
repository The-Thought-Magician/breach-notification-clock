'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export type CommandRoute = { label: string; href: string; group: string }

interface CommandPaletteProps {
  routes: CommandRoute[]
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ routes, open, onClose }: CommandPaletteProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return routes
    return routes.filter(
      (r) => r.label.toLowerCase().includes(q) || r.href.toLowerCase().includes(q) || r.group.toLowerCase().includes(q)
    )
  }, [query, routes])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      const t = setTimeout(() => inputRef.current?.focus(), 10)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const go = (href: string) => {
    router.push(href)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = results[activeIndex]
      if (target) go(target.href)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
          <span className="text-neutral-500">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page..."
            className="w-full bg-transparent text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none"
          />
          <button onClick={onClose} className="text-xs text-neutral-500 hover:text-neutral-300" aria-label="Close">
            Esc
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 && <div className="px-4 py-6 text-center text-sm text-neutral-500">No matches</div>}
          {results.map((r, i) => (
            <button
              key={r.href}
              onClick={() => go(r.href)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors ${
                i === activeIndex ? 'bg-sky-600/15 text-sky-300' : 'text-neutral-300 hover:bg-neutral-800/60'
              }`}
            >
              <span>{r.label}</span>
              <span className="text-xs text-neutral-600">{r.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
