import Link from 'next/link'

const FEATURES = [
  {
    title: 'Deterministic obligation engine',
    body: 'Evaluate one incident timeline against a maintained corpus of GDPR Article 33/34, all 50 US state laws, HIPAA, GLBA, and sector rules. Every triggered obligation comes with a computed deadline and a "why triggered" trace.',
  },
  {
    title: 'Obligation matrix, sorted by soonest',
    body: 'A live table of every regulator and customer notice ranked by time remaining, with red/amber/green banding, filters, group-by, and bulk owner and status edits.',
  },
  {
    title: 'Countdown war room',
    body: 'A full-screen countdown wall with a next-deadline hero card, configurable urgency thresholds, and per-jurisdiction sub-team views for live incident command.',
  },
  {
    title: 'Notice tracker to verified delivery',
    body: 'Drive each notice from draft, through approver sign-off, to recorded proof of delivery. The clock is only met when delivery is verified against the deadline.',
  },
  {
    title: 'Contractual DPA overlay',
    body: 'Register customer Data Processing Agreement windows and surface the tighter of the statutory or contractual deadline for every affected customer.',
  },
  {
    title: 'Immutable defensibility pack',
    body: 'Generate a content-hashed, append-only export of the timeline, obligations, every artifact version, sign-off, and proof of delivery for regulators, auditors, and litigation hold.',
  },
  {
    title: 'Drill mode and templates',
    body: 'Run breach-readiness drills flagged out of real metrics, seed realistic sample incidents, and maintain a reusable per-jurisdiction notice template library.',
  },
  {
    title: 'Affected population thresholds',
    body: 'Per-jurisdiction resident counts and data-category breakdowns drive substitute-notice and attorney-general thresholds, so obligations trigger on the real numbers.',
  },
]

const PROBLEMS = [
  'Dozens of overlapping laws, each with its own trigger, clock anchor, and deadline unit.',
  'Customer DPAs that demand notice in 24 to 48 hours, well inside any statutory window.',
  'Drafting, routing for sign-off, sending, and proving delivery of every individual notice.',
  'Producing an after-the-fact record that proves every clock was met and cannot be altered.',
]

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-red-600 text-sm font-black text-white">B</span>
          <span className="text-lg font-black tracking-tight">BreachNotificationClock</span>
        </span>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-zinc-300 hover:text-white">Pricing</Link>
          <Link href="/auth/sign-in" className="text-zinc-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-medium">Get Started</Link>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(220,38,38,0.18),_transparent_60%)]" aria-hidden />
        <div className="relative max-w-4xl mx-auto px-6 py-28 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-red-800 bg-red-950/40 px-3 py-1 text-xs font-medium text-red-300">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> The clock starts at discovery
          </span>
          <h1 className="mt-6 text-4xl sm:text-6xl font-black tracking-tight">
            Every breach deadline, <span className="text-red-500">computed and counting down.</span>
          </h1>
          <p className="mt-6 text-lg text-zinc-400 max-w-2xl mx-auto">
            BreachNotificationClock turns one incident timeline into the full obligation matrix across every jurisdiction and contract you are exposed to, then tracks each notice from draft to verified delivery with an immutable audit trail.
          </p>
          <div className="mt-9 flex items-center justify-center gap-3">
            <Link href="/auth/sign-up" className="bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-lg font-semibold">Start the clock</Link>
            <Link href="/auth/sign-in" className="border border-zinc-700 hover:bg-zinc-800 text-zinc-200 px-6 py-3 rounded-lg font-semibold">Sign in</Link>
          </div>
          <p className="mt-4 text-xs text-zinc-600">Free while in beta. No credit card.</p>
        </div>
      </section>

      <section className="border-t border-zinc-800 bg-zinc-900/30">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-center">During a live incident, the scramble is the risk</h2>
          <p className="mt-2 text-center text-zinc-500 max-w-2xl mx-auto">
            A single missed clock means GDPR fines up to 4% of global turnover, US attorney-general penalties, consent decrees, and contract breach. Spreadsheets and email threads neither compute deadlines deterministically nor prove delivery.
          </p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {PROBLEMS.map((p) => (
              <li key={p} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <span className="mt-0.5 text-red-500">▣</span>
                <span className="text-sm text-zinc-300">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-24">
        <h2 className="text-3xl font-bold text-center">From chaos to a deterministic, defensible workflow</h2>
        <p className="mt-3 text-center text-zinc-500 max-w-2xl mx-auto">
          Built on a maintained breach-notification rules dataset where each rule encodes its trigger, clock anchor, deadline offset, recipient, content requirements, and delivery method.
        </p>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 hover:border-red-900/60 transition-colors">
              <h3 className="text-base font-semibold text-zinc-100">{f.title}</h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-zinc-800">
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <h2 className="text-3xl font-bold">Be ready before the next incident, not during it.</h2>
          <p className="mt-3 text-zinc-400">
            Run a drill today. Map your jurisdictions and contracts. When a real breach hits, the matrix is already waiting.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/auth/sign-up" className="bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-lg font-semibold">Get started free</Link>
            <Link href="/pricing" className="border border-zinc-700 hover:bg-zinc-800 text-zinc-200 px-6 py-3 rounded-lg font-semibold">See pricing</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-800 py-10 text-center text-zinc-600">
        <p className="text-sm">BreachNotificationClock</p>
        <p className="mt-1 text-xs">Statutory and contractual breach-notification deadline engine and notice tracker.</p>
      </footer>
    </main>
  )
}
