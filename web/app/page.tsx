import Link from 'next/link'

const FEATURES = [
  {
    title: 'Deterministic obligation engine',
    body: 'One incident timeline in. Every triggered obligation out, checked against GDPR Article 33/34, all 50 US states, HIPAA, GLBA, and sector rules. Computed deadline, and why it triggered.',
  },
  {
    title: 'Obligation matrix, sorted by soonest',
    body: 'Every regulator and customer notice, ranked by time left. Red, amber, green. Filter it, group it, bulk-edit it.',
  },
  {
    title: 'Countdown war room',
    body: 'Full-screen countdown wall. Next deadline front and center. Per-jurisdiction views for live incident command.',
  },
  {
    title: 'Notice tracker to verified delivery',
    body: 'Draft. Sign-off. Send. Proof of delivery. The clock isn\'t met until delivery is verified against the deadline.',
  },
  {
    title: 'Contractual DPA overlay',
    body: 'Register customer DPA windows. We surface whichever deadline is tighter, statutory or contractual.',
  },
  {
    title: 'Immutable defensibility pack',
    body: 'One export. Content-hashed, append-only. Timeline, obligations, artifacts, sign-offs, delivery proof. For regulators, auditors, litigation.',
  },
  {
    title: 'Drill mode and templates',
    body: 'Run readiness drills before you need them. Seed sample incidents. Keep a template library per jurisdiction.',
  },
  {
    title: 'Affected population thresholds',
    body: 'Real resident counts, real data categories. Substitute-notice and attorney-general thresholds trigger on the actual numbers.',
  },
]

const PROBLEMS = [
  'Dozens of overlapping laws. Each one with its own trigger, clock anchor, deadline unit.',
  'Customer DPAs demanding notice in 24 to 48 hours. Inside every statutory window.',
  'Drafting, routing, sending, and proving delivery for every single notice, by hand.',
  'No record that proves every clock was met, after the fact, unaltered.',
]

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <nav className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-600 text-sm font-black text-white">B</span>
          <span className="text-lg font-black tracking-tight">BreachNotificationClock</span>
        </span>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-neutral-300 hover:text-white">Pricing</Link>
          <Link href="/auth/sign-in" className="text-neutral-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg font-medium">Get Started</Link>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.18),_transparent_60%)]" aria-hidden />
        <div className="relative max-w-4xl mx-auto px-6 py-28 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-800 bg-sky-950/40 px-3 py-1 text-xs font-medium text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" /> The clock starts at discovery
          </span>
          <h1 className="mt-6 text-4xl sm:text-6xl font-black tracking-tight">
            72 hours. That&apos;s it. <span className="text-sky-500">Don&apos;t miss it.</span>
          </h1>
          <p className="mt-6 text-lg text-neutral-400 max-w-2xl mx-auto">
            One incident, dozens of clocks. BreachNotificationClock computes every regulator and customer deadline the second you log the timeline, then tracks each notice to verified delivery. No spreadsheets. No guessing. No missed clocks.
          </p>
          <div className="mt-9 flex items-center justify-center gap-3">
            <Link href="/auth/sign-up" className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-3 rounded-lg font-semibold">Start the clock</Link>
            <Link href="/auth/sign-in" className="border border-neutral-700 hover:bg-neutral-800 text-neutral-200 px-6 py-3 rounded-lg font-semibold">Sign in</Link>
          </div>
          <p className="mt-4 text-xs text-neutral-600">Free while in beta. No credit card.</p>
        </div>
      </section>

      <section className="border-t border-neutral-800 bg-neutral-900/30">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-center">Miss one clock, pay for all of them</h2>
          <p className="mt-2 text-center text-neutral-500 max-w-2xl mx-auto">
            GDPR fines run up to 4% of global turnover. State AGs pile on. Contracts get breached. Spreadsheets don&apos;t compute deadlines and they don&apos;t prove delivery. Here&apos;s what you&apos;re actually up against:
          </p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {PROBLEMS.map((p) => (
              <li key={p} className="flex gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
                <span className="mt-0.5 text-sky-500">▣</span>
                <span className="text-sm text-neutral-300">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-24">
        <h2 className="text-3xl font-bold text-center">Every clock, computed. Every notice, tracked.</h2>
        <p className="mt-3 text-center text-neutral-500 max-w-2xl mx-auto">
          One rules dataset. Every trigger, every clock anchor, every deadline offset, every recipient. No manual lookups.
        </p>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 hover:border-sky-900/60 transition-colors">
              <h3 className="text-base font-semibold text-neutral-100">{f.title}</h3>
              <p className="mt-2 text-sm text-neutral-400 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-neutral-800">
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <h2 className="text-3xl font-bold">Get ready now. Not mid-incident.</h2>
          <p className="mt-3 text-neutral-400">
            Run a drill today. Map your jurisdictions and contracts today. When the real thing hits, the matrix is already built and the clock is already running.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/auth/sign-up" className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-3 rounded-lg font-semibold">Get started free</Link>
            <Link href="/pricing" className="border border-neutral-700 hover:bg-neutral-800 text-neutral-200 px-6 py-3 rounded-lg font-semibold">See pricing</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-800 py-10 text-center text-neutral-600">
        <p className="text-sm">BreachNotificationClock</p>
        <p className="mt-1 text-xs">Deadlines computed. Notices tracked. Proof kept.</p>
      </footer>
    </main>
  )
}
