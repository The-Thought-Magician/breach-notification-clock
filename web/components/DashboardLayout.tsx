'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth/client'

type NavItem = { label: string; href: string }
type NavSection = { title: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard' }],
  },
  {
    title: 'Incidents',
    items: [
      { label: 'All Incidents', href: '/dashboard/incidents' },
      { label: 'New Incident', href: '/dashboard/incidents/new' },
    ],
  },
  {
    title: 'Response',
    items: [
      { label: 'My Tasks', href: '/dashboard/tasks' },
      { label: 'Notifications', href: '/dashboard/notifications' },
    ],
  },
  {
    title: 'Reference Data',
    items: [
      { label: 'Rules', href: '/dashboard/rules' },
      { label: 'Jurisdictions', href: '/dashboard/jurisdictions' },
      { label: 'Regulators', href: '/dashboard/regulators' },
      { label: 'Templates', href: '/dashboard/templates' },
    ],
  },
  {
    title: 'Customers & Exposure',
    items: [
      { label: 'Contracts', href: '/dashboard/contracts' },
      { label: 'Affected Populations', href: '/dashboard/populations' },
      { label: 'Exposure Profile', href: '/dashboard/exposure' },
    ],
  },
  {
    title: 'Records & Insight',
    items: [
      { label: 'Defensibility Packs', href: '/dashboard/packs' },
      { label: 'Analytics', href: '/dashboard/analytics' },
      { label: 'Activity Log', href: '/dashboard/activity' },
      { label: 'Saved Views', href: '/dashboard/views' },
    ],
  },
  {
    title: 'Account',
    items: [{ label: 'Settings', href: '/dashboard/settings' }],
  },
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
  const [drawerOpen, setDrawerOpen] = useState(false)

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

  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const signOut = async () => {
    await authClient.signOut()
    router.push('/')
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex items-center gap-2 text-zinc-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-red-500" />
          <span className="text-sm">Verifying session...</span>
        </div>
      </div>
    )
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5">
      <Link href="/dashboard" className="flex items-center gap-2 px-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-red-600 text-sm font-black text-white">B</span>
        <span className="text-sm font-bold tracking-tight text-zinc-100">BreachNotificationClock</span>
      </Link>
      <div className="flex flex-col gap-5">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{section.title}</div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? 'bg-red-600/15 font-medium text-red-300'
                        : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <aside className="hidden w-64 shrink-0 border-r border-zinc-800 bg-zinc-950 lg:block">
        {sidebar}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDrawerOpen(false)} aria-hidden />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-zinc-800 bg-zinc-950">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <span className="text-sm font-medium text-zinc-300">{workspace}</span>
          </div>
          <button
            onClick={signOut}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            Sign out
          </button>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
