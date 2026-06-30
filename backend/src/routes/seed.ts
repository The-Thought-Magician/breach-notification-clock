import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  incidents,
  incident_anchors,
  incident_facts,
  affected_populations,
  jurisdictions,
  rules,
  regulators,
  obligations,
} from '../db/schema.js'
import { eq, and, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ── Obligation engine (inline) ───────────────────────────────────────────────
// Matches statutory rules against an incident's facts + affected populations,
// computes the deadline_at from the rule's clock_anchor against the matching
// incident anchor's occurred_at + deadline_hours, and explains why each
// obligation was triggered. Returns the obligation rows to insert.

const HARM_RANK: Record<string, number> = { any: 0, low: 0, medium: 1, high: 2 }

function harmRank(value: string | null | undefined): number {
  if (!value) return 0
  return HARM_RANK[value] ?? 0
}

interface AnchorRow {
  anchor_type: string
  occurred_at: Date
}

function anchorFor(anchorType: string, anchors: AnchorRow[]): AnchorRow | undefined {
  // Exact match first, then a sensible fallback chain so a rule still gets a
  // clock even if its preferred anchor was not recorded.
  const exact = anchors.find((a) => a.anchor_type === anchorType)
  if (exact) return exact
  const fallbackOrder = ['confirmation', 'discovery', 'belief_of_harm', 'containment']
  for (const t of fallbackOrder) {
    const found = anchors.find((a) => a.anchor_type === t)
    if (found) return found
  }
  return anchors[0]
}

async function computeObligationsForIncident(incidentId: string) {
  const [facts] = await db
    .select()
    .from(incident_facts)
    .where(eq(incident_facts.incident_id, incidentId))

  const anchorRows = await db
    .select()
    .from(incident_anchors)
    .where(eq(incident_anchors.incident_id, incidentId))
  const anchors: AnchorRow[] = anchorRows.map((a) => ({
    anchor_type: a.anchor_type,
    occurred_at: a.occurred_at,
  }))

  const populations = await db
    .select()
    .from(affected_populations)
    .where(eq(affected_populations.incident_id, incidentId))

  // Distinct jurisdiction codes with affected residents.
  const codes = [...new Set(populations.map((p) => p.jurisdiction_code))]
  if (codes.length === 0) return []

  const jurRows = await db
    .select()
    .from(jurisdictions)
    .where(inArray(jurisdictions.code, codes))
  const jurByCode = new Map(jurRows.map((j) => [j.code, j]))
  const jurIds = jurRows.map((j) => j.id)
  if (jurIds.length === 0) return []

  const applicableRules = await db
    .select()
    .from(rules)
    .where(inArray(rules.jurisdiction_id, jurIds))

  const allRegulators = await db
    .select()
    .from(regulators)
    .where(inArray(regulators.jurisdiction_id, jurIds))

  const incidentRiskRank = harmRank(facts?.risk_of_harm)
  const incidentCategories = (facts?.data_categories ?? []) as string[]

  const toInsert: Array<typeof obligations.$inferInsert> = []

  for (const rule of applicableRules) {
    const jur = jurRows.find((j) => j.id === rule.jurisdiction_id)
    if (!jur) continue

    // population for this jurisdiction
    const pop = populations.find((p) => p.jurisdiction_code === jur.code)
    const residents = pop?.count ?? 0

    // resident threshold gate
    if ((rule.resident_threshold ?? 0) > 0 && residents < (rule.resident_threshold ?? 0)) {
      continue
    }

    // harm threshold gate — only trigger when the assessed risk meets the bar
    const ruleHarm = harmRank(rule.harm_threshold)
    if (ruleHarm > 0 && incidentRiskRank < ruleHarm) {
      continue
    }

    // data-category trigger gate
    const triggerCats = (rule.trigger_data_categories ?? []) as string[]
    if (triggerCats.length > 0) {
      const overlap = triggerCats.some((t) => incidentCategories.includes(t))
      if (!overlap) continue
    }

    // clock
    const anchor = anchorFor(rule.clock_anchor, anchors)
    let deadlineAt: Date | null = null
    if (anchor && rule.deadline_hours != null && !rule.is_undue_delay) {
      deadlineAt = new Date(anchor.occurred_at.getTime() + rule.deadline_hours * 3_600_000)
    }

    const regulator =
      rule.category === 'regulator'
        ? allRegulators.find((r) => r.jurisdiction_id === rule.jurisdiction_id) ?? null
        : null

    const why: string[] = [`${jur.name}: ${rule.citation} (${rule.title})`]
    if ((rule.resident_threshold ?? 0) > 0) {
      why.push(`${residents} affected residents ≥ threshold ${rule.resident_threshold}`)
    } else {
      why.push(`${residents} affected residents`)
    }
    if (ruleHarm > 0) why.push(`risk_of_harm "${facts?.risk_of_harm}" meets "${rule.harm_threshold}"`)
    if (rule.is_undue_delay) {
      why.push('without undue delay (no fixed statutory hours)')
    } else if (rule.deadline_hours != null && anchor) {
      why.push(`${rule.deadline_hours}h from ${anchor.anchor_type} anchor`)
    }

    toInsert.push({
      incident_id: incidentId,
      rule_id: rule.id,
      regulator_id: regulator?.id ?? null,
      jurisdiction_code: jur.code,
      recipient: regulator?.name ?? rule.recipient_type,
      recipient_type: rule.recipient_type,
      deadline_at: deadlineAt,
      clock_anchor: rule.clock_anchor,
      is_undue_delay: rule.is_undue_delay,
      status: 'open',
      source: 'statutory',
      why_triggered: why.join('; '),
    })
  }

  return toInsert
}

// ── POST /sample ──────────────────────────────────────────────────────────────
// Generates a realistic drill incident with anchors, facts, populations, and a
// freshly computed set of statutory obligations. Replaces any prior obligations
// for the new incident (there are none on a fresh insert, but recompute is the
// authoritative path).

router.post('/sample', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const now = Date.now()
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')

  // 1. incident
  const [incident] = await db
    .insert(incidents)
    .values({
      user_id: userId,
      title: 'Drill: unauthorized access to customer CRM export',
      reference_number: `DRILL-${stamp}`,
      severity: 'high',
      status: 'triage',
      is_drill: true,
      is_confidential: false,
      owner_id: userId,
      watchers: [],
      summary:
        'Tabletop drill: an attacker obtained a database credential and exported a CRM table ' +
        'containing names, email addresses, and partial payment data for EU, UK, and California ' +
        'residents. Exfiltration confirmed; encryption did not cover the exported fields.',
    })
    .returning()

  // 2. anchors (discovery first, confirmation 6h later, belief_of_harm 18h later)
  const discoveryAt = new Date(now - 12 * 3_600_000)
  const confirmationAt = new Date(now - 6 * 3_600_000)
  const beliefAt = new Date(now - 2 * 3_600_000)
  await db.insert(incident_anchors).values([
    {
      incident_id: incident.id,
      anchor_type: 'discovery',
      label: 'Alert from anomalous export volume',
      occurred_at: discoveryAt,
    },
    {
      incident_id: incident.id,
      anchor_type: 'confirmation',
      label: 'Forensics confirmed credential compromise',
      occurred_at: confirmationAt,
    },
    {
      incident_id: incident.id,
      anchor_type: 'belief_of_harm',
      label: 'Assessed likely risk to individuals',
      occurred_at: beliefAt,
    },
  ])

  // 3. facts (upsert by unique incident_id)
  await db
    .insert(incident_facts)
    .values({
      incident_id: incident.id,
      data_categories: ['contact', 'financial', 'identifiers'],
      special_category: false,
      encrypted: false,
      attacker_access_confirmed: true,
      exfiltration_confirmed: true,
      risk_of_harm: 'high',
      notes: 'Exported fields were not covered by at-rest encryption; data is usable.',
    })
    .onConflictDoUpdate({
      target: incident_facts.incident_id,
      set: {
        data_categories: ['contact', 'financial', 'identifiers'],
        special_category: false,
        encrypted: false,
        attacker_access_confirmed: true,
        exfiltration_confirmed: true,
        risk_of_harm: 'high',
        updated_at: new Date(),
      },
    })

  // 4. affected populations — pick jurisdictions that exist in the dataset.
  const jurRows = await db.select().from(jurisdictions)
  const wanted: Array<{ code: string; count: number; cats: string[] }> = [
    { code: 'EU-GDPR', count: 8200, cats: ['contact', 'financial', 'identifiers'] },
    { code: 'UK-GDPR', count: 3100, cats: ['contact', 'identifiers'] },
    { code: 'US-CA', count: 5400, cats: ['contact', 'financial'] },
  ]
  const popValues = wanted
    .filter((w) => jurRows.some((j) => j.code === w.code))
    .map((w) => ({
      incident_id: incident.id,
      jurisdiction_code: w.code,
      count: w.count,
      data_categories: w.cats,
    }))
  if (popValues.length > 0) {
    await db.insert(affected_populations).values(popValues).onConflictDoNothing()
  }

  // 5. recompute obligations (replace any existing for this incident)
  await db.delete(obligations).where(eq(obligations.incident_id, incident.id))
  const computed = await computeObligationsForIncident(incident.id)
  let created: Array<typeof obligations.$inferSelect> = []
  if (computed.length > 0) {
    created = await db.insert(obligations).values(computed).returning()
  }

  return c.json(
    {
      incident,
      anchorsCreated: 3,
      populationsCreated: popValues.length,
      obligationsCreated: created.length,
    },
    201,
  )
})

export default router
