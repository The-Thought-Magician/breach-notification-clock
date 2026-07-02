'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { authClient } from '@/lib/auth/client'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'

interface Plan {
  id: string
  name: string
  price_cents: number
}

interface Subscription {
  id: string
  user_id: string
  plan_id: string
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  status?: string | null
  current_period_end?: string | null
  created_at?: string
  updated_at?: string
}

interface BillingPlan {
  subscription: Subscription | null
  plan: Plan | null
  stripeEnabled: boolean
}

function fmtPrice(cents?: number | null): string {
  if (cents == null) return 'Free'
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(2)}/mo`
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function statusTone(status?: string | null): 'green' | 'amber' | 'red' | 'zinc' {
  switch ((status ?? '').toLowerCase()) {
    case 'active':
    case 'trialing':
      return 'green'
    case 'past_due':
    case 'incomplete':
    case 'unpaid':
      return 'amber'
    case 'canceled':
    case 'incomplete_expired':
      return 'red'
    default:
      return 'zinc'
  }
}

export default function SettingsPage() {
  const [billing, setBilling] = useState<BillingPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [user, setUser] = useState<{ name?: string | null; email?: string | null } | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState<string | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getBillingPlan()
      setBilling({
        subscription: data?.subscription ?? null,
        plan: data?.plan ?? null,
        stripeEnabled: Boolean(data?.stripeEnabled),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load billing details')
    } finally {
      setLoading(false)
    }
  }

  async function loadUser() {
    try {
      const session = await authClient.getSession()
      const u = (session as { data?: { user?: { name?: string; email?: string } } })?.data?.user
      if (u) setUser({ name: u.name, email: u.email })
    } catch {
      // session is optional context; ignore failures
    }
  }

  useEffect(() => {
    load()
    loadUser()
  }, [])

  async function handleCheckout() {
    setCheckingOut(true)
    setActionError(null)
    setActionNote(null)
    try {
      const res = await api.startCheckout()
      if (res?.url) {
        window.location.href = res.url
        return
      }
      setActionNote('Checkout session created, but no redirect URL was returned.')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not start checkout. Billing may not be configured.')
    } finally {
      setCheckingOut(false)
    }
  }

  async function handlePortal() {
    setOpeningPortal(true)
    setActionError(null)
    setActionNote(null)
    try {
      const res = await api.openPortal()
      if (res?.url) {
        window.location.href = res.url
        return
      }
      setActionNote('Portal session created, but no redirect URL was returned.')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not open the billing portal. Billing may not be configured.')
    } finally {
      setOpeningPortal(false)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await authClient.signOut()
      window.location.href = '/auth/sign-in'
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to sign out')
      setSigningOut(false)
    }
  }

  if (loading) return <PageSpinner label="Loading settings..." />

  const sub = billing?.subscription ?? null
  const plan = billing?.plan ?? null
  const stripeEnabled = billing?.stripeEnabled ?? false
  const hasActiveSub = Boolean(sub && ['active', 'trialing'].includes((sub.status ?? '').toLowerCase()))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-100">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Account, plan, and billing for your breach-notification program.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={load} className="ml-3 underline hover:text-red-200">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Current plan" value={plan?.name ?? 'Free'} />
        <Stat label="Price" value={fmtPrice(plan?.price_cents)} tone={plan?.price_cents ? 'amber' : 'green'} />
        <Stat
          label="Subscription"
          value={sub?.status ? sub.status : 'None'}
          tone={hasActiveSub ? 'green' : 'default'}
        />
      </div>

      {/* Account */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-neutral-200">Account</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Row label="Name" value={user?.name || '—'} />
            <Row label="Email" value={user?.email || '—'} />
          </div>
          <div className="flex items-center justify-between border-t border-neutral-800 pt-4">
            <div>
              <div className="text-sm font-medium text-neutral-200">Sign out</div>
              <div className="text-xs text-neutral-500">End your session on this device.</div>
            </div>
            <Button variant="secondary" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Billing */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-200">Plan &amp; Billing</h2>
          {stripeEnabled ? (
            <Badge tone="green">Billing enabled</Badge>
          ) : (
            <Badge tone="zinc">Billing not configured</Badge>
          )}
        </CardHeader>
        <CardBody className="space-y-5">
          {actionError && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {actionError}
            </div>
          )}
          {actionNote && (
            <div className="rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
              {actionNote}
            </div>
          )}

          {/* Plan summary */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-neutral-100">{plan?.name ?? 'Free'}</span>
                  {sub?.status && <Badge tone={statusTone(sub.status)}>{sub.status}</Badge>}
                </div>
                <div className="mt-1 text-sm text-neutral-400">{fmtPrice(plan?.price_cents)}</div>
              </div>
              <div className="text-right text-xs text-neutral-500">
                {sub?.current_period_end && (
                  <div>
                    Renews/ends{' '}
                    <span className="text-neutral-300">{fmtDate(sub.current_period_end)}</span>
                  </div>
                )}
                {sub?.created_at && <div className="mt-1">Started {fmtDate(sub.created_at)}</div>}
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-neutral-800 pt-4 sm:grid-cols-2">
              <Row label="Stripe customer" value={sub?.stripe_customer_id || '—'} mono />
              <Row label="Stripe subscription" value={sub?.stripe_subscription_id || '—'} mono />
              <Row label="Status" value={sub?.status || 'No active subscription'} />
              <Row label="Current period ends" value={fmtDate(sub?.current_period_end)} />
            </dl>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {hasActiveSub ? (
              <Button onClick={handlePortal} disabled={openingPortal}>
                {openingPortal ? 'Opening...' : 'Manage billing'}
              </Button>
            ) : (
              <Button onClick={handleCheckout} disabled={checkingOut}>
                {checkingOut ? 'Starting...' : 'Upgrade plan'}
              </Button>
            )}
            {hasActiveSub && (
              <Button variant="secondary" onClick={handleCheckout} disabled={checkingOut}>
                {checkingOut ? 'Starting...' : 'Change plan'}
              </Button>
            )}
            {!hasActiveSub && (sub?.stripe_customer_id || sub) && (
              <Button variant="secondary" onClick={handlePortal} disabled={openingPortal}>
                {openingPortal ? 'Opening...' : 'Billing portal'}
              </Button>
            )}
          </div>

          {!stripeEnabled && (
            <p className="text-xs text-neutral-500">
              Stripe is not configured for this deployment. Checkout and the billing portal will return a
              service-unavailable response until billing keys are set. All features remain available.
            </p>
          )}
        </CardBody>
      </Card>

      {/* What you get */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-neutral-200">Included in your plan</h2>
        </CardHeader>
        <CardBody>
          <ul className="grid grid-cols-1 gap-2 text-sm text-neutral-300 sm:grid-cols-2">
            {[
              'Unlimited breach incidents',
              'Multi-jurisdiction obligation engine',
              'Live deadline war room',
              'Notice artifacts, sign-off & delivery proof',
              'Customer DPA contract registry',
              'Defensibility packs & audit log',
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className={`mt-1 text-sm text-neutral-200 ${mono ? 'font-mono break-all text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
