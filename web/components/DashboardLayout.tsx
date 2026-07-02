'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth/client'
import CommandPalette, { type CommandRoute } from '@/components/CommandPalette'

const ROUTES: CommandRoute[] = [
  { label: 'Dashboard', href: '/dashboard', group: 'Overview' },
  { label: 'All Incidents', href: '/dashboard/incidents', group: 'Incidents' },
  { label: 'New Incident', href: '/dashboard/incidents/new', group: 'Incidents' },
  { label: 'My Tasks', href: '/dashboard/tasks', group: 'Response' },
  { label: 'Notifications', href: '/dashboard/notifications', group: 'Response' },
  { label: 'Rules', href: '/dashboard/rules', group: 'Reference Data' },
  { label: 'Jurisdictions', href: '/dashboard/jurisdictions', group: 'Reference Data' },
  { label: 'Regulators', href: '/dashboard/regulators', group: 'Reference Data' },
  { label: 'Templates', href: '/dashboard/templates', group: 'Reference Data' },
  { label: 'Contracts', href: '/dashboard/contracts', group: 'Customers & Exposure' },
  { label: 'Affected Populations', href: '/dashboard/populations', group: 'Customers & Exposure' },
  { label: 'Exposure Profile', href: '/dashboard/exposure', group: 'Customers & Exposure' },
  { label: 'Defensibility Packs', href: '/dashboard/packs', group: 'Records & Insight' },
  { label: 'Analytics', href: '/dashboard/analytics', group: 'Records & Insight' },
  { label: 'Activity Log', href: '/dashboard/activity', group: 'Records & Insight' },
  { label: 'Saved Views', href: '/dashboard/views', group: 'Records & Insight' },
  { label: 'Settings', href: '/dashboard/settings', group: 'Account' },
]

const RAIL: { label: string; href: string; glyph: string }[] = [
  { label: 'Dashboard', href: '/dashboard', glyph: 'D' },
  { label: 'Incidents', href: '/dashboard/incidents', glyph: 'I' },
  { label: 'My Tasks', href: '/dashboard/tasks', glyph: 'T' },
  { label: 'Notifications', href: '/dashboard/notifications', glyph: 'N' },
  { label: 'Rules', href: '/dashboard/rules', glyph: 'R' },
  { label: 'Contracts', href: '/dashboard/contracts', glyph: 'C' },
  { label: 'Defensibility Packs', href: '/dashboard/packs', glyph: 'P' },
  { label: 'Analytics', href: '/dashboard/analytics', glyph: 'A' },
  { label: 'Settings', href: '/dashboard/settings', glyph: 'S' },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [workspace, setWorkspace] = useState<string>('')
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await authClient.getSession()
      if (cancelled) return
      if (!s?.data?.user) {
        router.push('/auth/sign-in')
        return
      }
      const u = s.data.user as { name?: string; email?: string }
      setWorkspace(u.name || u.email || 'Workspace')
      setChecking(false)
    })()
    return () => { cancelled = true }
  }, [router])

  const closePalette = useCallback(() => setPaletteOpen(false), [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const signOut = async () => {
    await authClient.signOut()
    router.push('/')
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="flex items-center gap-2 text-neutral-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-700 border-t-sky-500" />
          <span className="text-sm">Verifying session...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-neutral-950">
      <aside className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-neutral-800 bg-neutral-950 py-4 lg:flex">
        <Link href="/dashboard" className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-sky-600 text-sm font-black text-white">
          B
        </Link>
        {RAIL.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold transition-colors ${
                active ? 'bg-sky-600/15 text-sky-300' : 'text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-100'
              }`}
            >
              {item.glyph}
            </Link>
          )
        })}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-800 bg-neutral-950/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-600 text-sm font-black text-white lg:hidden">B</span>
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
            >
              <span>Jump to...</span>
              <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-500">⌘K</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-neutral-300 sm:inline">{workspace}</span>
            <button
              onClick={signOut}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      <CommandPalette routes={ROUTES} open={paletteOpen} onClose={closePalette} />
    </div>
  )
}
