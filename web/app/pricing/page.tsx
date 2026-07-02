'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const INCLUDED = [
  'Unlimited incidents and timeline anchors',
  'Full statutory rules dataset: GDPR, all 50 US states, HIPAA, GLBA, sector rules',
  'Deterministic obligation computation engine with why-triggered traces',
  'Obligation matrix and live countdown war room',
  'Notice artifact tracker, approver sign-off, and proof of delivery',
  'Customer DPA contract overlay and tighter-window surfacing',
  'Affected population and resident-count thresholds',
  'Immutable, content-hashed defensibility packs',
  'Drill mode, template library, and sample-incident seeder',
  'Tasks, assignments, notifications, and full activity audit log',
]

export default function Pricing() {
  const [stripeEnabled, setStripeEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/proxy/billing/plan')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setStripeEnabled(Boolean(data?.stripeEnabled))
      } catch {
        // public page — billing may require auth; ignore failures
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <nav className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-600 text-sm font-black text-white">B</span>
          <span className="text-lg font-black tracking-tight">BreachNotificationClock</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/auth/sign-in" className="text-neutral-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg font-medium">Get Started</Link>
        </div>
      </nav>

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl font-black tracking-tight">Simple pricing while we are in beta</h1>
        <p className="mt-3 text-neutral-400">
          Every feature is free. One avoided late-notice penalty dwarfs any subscription, so we are not gating the tools that keep your clocks met.
        </p>

        <div className="mt-12 rounded-2xl border border-sky-900/50 bg-neutral-900 p-8 text-left shadow-2xl">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-xl font-bold text-neutral-100">Free</h2>
              <p className="text-sm text-neutral-500">All features, no limits, during beta.</p>
            </div>
            <div className="text-right">
              <span className="text-4xl font-black text-sky-500">$0</span>
              <span className="block text-xs text-neutral-500">per month</span>
            </div>
          </div>

          <ul className="mt-6 space-y-2.5">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm text-neutral-300">
                <span className="mt-0.5 text-sky-500">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <Link
            href="/auth/sign-up"
            className="mt-8 block w-full rounded-lg bg-sky-600 px-4 py-3 text-center font-semibold text-white hover:bg-sky-500"
          >
            Start free
          </Link>
          {stripeEnabled === false && (
            <p className="mt-3 text-center text-xs text-neutral-600">Paid plans are not enabled yet. Everything is included free.</p>
          )}
        </div>

        <p className="mt-10 text-sm text-neutral-500">
          Already have an account? <Link href="/auth/sign-in" className="text-sky-400 hover:text-sky-300">Sign in</Link>
        </p>
      </section>

      <footer className="border-t border-neutral-800 py-10 text-center text-neutral-600">
        <p className="text-sm">BreachNotificationClock</p>
      </footer>
    </main>
  )
}
