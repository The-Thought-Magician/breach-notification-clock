import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './db/index.js'
import { migrate } from './db/migrate.js'
import {
  plans,
  jurisdictions,
  rules,
  regulators,
  incidents,
} from './db/schema.js'
import { eq } from 'drizzle-orm'

import incidentRoutes from './routes/incidents.js'
import obligationRoutes from './routes/obligations.js'
import artifactRoutes from './routes/artifacts.js'
import signoffRoutes from './routes/signoffs.js'
import deliveryRoutes from './routes/deliveries.js'
import contractRoutes from './routes/contracts.js'
import populationRoutes from './routes/populations.js'
import jurisdictionRoutes from './routes/jurisdictions.js'
import ruleRoutes from './routes/rules.js'
import regulatorRoutes from './routes/regulators.js'
import templateRoutes from './routes/templates.js'
import taskRoutes from './routes/tasks.js'
import notificationRoutes from './routes/notifications.js'
import commentRoutes from './routes/comments.js'
import attachmentRoutes from './routes/attachments.js'
import activityRoutes from './routes/activity.js'
import packRoutes from './routes/packs.js'
import viewRoutes from './routes/views.js'
import exposureRoutes from './routes/exposure.js'
import warroomRoutes from './routes/warroom.js'
import analyticsRoutes from './routes/analytics.js'
import seedRoutes from './routes/seed.js'
import dashboardRoutes from './routes/dashboard.js'
import billingRoutes from './routes/billing.js'

const app = new Hono()

const allowedOrigins = [
  process.env.FRONTEND_URL ?? 'http://localhost:3000',
  'https://breach-notification-clock.vercel.app',
]

app.use(
  '*',
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    credentials: true,
  }),
)

const api = new Hono()
api.route('/incidents', incidentRoutes)
api.route('/obligations', obligationRoutes)
api.route('/artifacts', artifactRoutes)
api.route('/signoffs', signoffRoutes)
api.route('/deliveries', deliveryRoutes)
api.route('/contracts', contractRoutes)
api.route('/populations', populationRoutes)
api.route('/jurisdictions', jurisdictionRoutes)
api.route('/rules', ruleRoutes)
api.route('/regulators', regulatorRoutes)
api.route('/templates', templateRoutes)
api.route('/tasks', taskRoutes)
api.route('/notifications', notificationRoutes)
api.route('/comments', commentRoutes)
api.route('/attachments', attachmentRoutes)
api.route('/activity', activityRoutes)
api.route('/packs', packRoutes)
api.route('/views', viewRoutes)
api.route('/exposure', exposureRoutes)
api.route('/warroom', warroomRoutes)
api.route('/analytics', analyticsRoutes)
api.route('/seed', seedRoutes)
api.route('/dashboard', dashboardRoutes)
api.route('/billing', billingRoutes)

app.route('/api/v1', api)
app.get('/health', (c) => c.json({ ok: true }))

// ── Seed (idempotent: count-then-insert) ──────────────────────────────────────

const seedPlans = [
  { id: 'free', name: 'Free', price_cents: 0 },
  { id: 'pro', name: 'Pro', price_cents: 4900 },
]

const seedJurisdictions = [
  { code: 'EU-GDPR', name: 'EU (GDPR)', region: 'EU', sector: 'general' },
  { code: 'US-CA', name: 'California (CCPA/Civil Code)', region: 'US', sector: 'general' },
  { code: 'US-NY', name: 'New York (SHIELD Act)', region: 'US', sector: 'general' },
  { code: 'UK-GDPR', name: 'United Kingdom (UK GDPR)', region: 'EU', sector: 'general' },
  { code: 'US-HIPAA', name: 'US HIPAA', region: 'US', sector: 'health' },
]

async function seedIfEmpty() {
  // plans
  const existingPlans = await db.select().from(plans).limit(1)
  if (existingPlans.length === 0) {
    for (const p of seedPlans) {
      await db.insert(plans).values(p).onConflictDoNothing()
    }
    console.log('Seeded plans')
  }

  // jurisdictions + a couple of demo rules/regulators
  const existingJur = await db.select().from(jurisdictions).limit(1)
  if (existingJur.length === 0) {
    const jurIdByCode = new Map<string, string>()
    for (const j of seedJurisdictions) {
      const [row] = await db.insert(jurisdictions).values(j).returning()
      jurIdByCode.set(j.code, row.id)
    }
    console.log('Seeded jurisdictions')

    const euId = jurIdByCode.get('EU-GDPR')
    const caId = jurIdByCode.get('US-CA')
    if (euId) {
      await db.insert(rules).values({
        jurisdiction_id: euId,
        citation: 'GDPR Art. 33',
        title: 'Notification to supervisory authority',
        category: 'regulator',
        recipient_type: 'supervisory_authority',
        clock_anchor: 'discovery',
        deadline_hours: 72,
        is_undue_delay: false,
        harm_threshold: 'any',
        resident_threshold: 0,
        trigger_data_categories: [],
        content_requirements: 'Nature of breach, categories and approximate numbers, likely consequences, measures taken.',
        delivery_method: 'portal',
      })
      await db.insert(rules).values({
        jurisdiction_id: euId,
        citation: 'GDPR Art. 34',
        title: 'Communication to the data subject',
        category: 'individual',
        recipient_type: 'data_subject',
        clock_anchor: 'belief_of_harm',
        deadline_hours: null,
        is_undue_delay: true,
        harm_threshold: 'high',
        resident_threshold: 0,
        trigger_data_categories: [],
        content_requirements: 'Clear and plain language describing the nature of the breach.',
        delivery_method: 'email',
      })
      await db.insert(regulators).values({
        jurisdiction_id: euId,
        name: 'Lead Supervisory Authority',
        portal_url: 'https://edpb.europa.eu',
        submission_method: 'portal',
      })
    }
    if (caId) {
      await db.insert(rules).values({
        jurisdiction_id: caId,
        citation: 'Cal. Civ. Code 1798.82',
        title: 'Notification to California residents',
        category: 'individual',
        recipient_type: 'data_subject',
        clock_anchor: 'discovery',
        deadline_hours: null,
        is_undue_delay: true,
        harm_threshold: 'any',
        resident_threshold: 0,
        trigger_data_categories: [],
        content_requirements: 'Most expedient time possible and without unreasonable delay.',
        delivery_method: 'mail',
      })
    }
    console.log('Seeded demo rules and regulators')
  }

  // demo incident
  const existingIncidents = await db.select().from(incidents).limit(1)
  if (existingIncidents.length === 0) {
    await db.insert(incidents).values({
      user_id: 'demo-user',
      title: 'Sample: unauthorized access to customer database',
      reference_number: 'INC-0001',
      severity: 'high',
      status: 'triage',
      is_drill: true,
      summary: 'Demo incident seeded for first-run exploration.',
    })
    console.log('Seeded demo incident')
  }
}

const port = parseInt(process.env.PORT ?? '3001')

// CRITICAL boot order: bind the port FIRST so the platform health check sees a
// live service immediately, THEN run migrate + seed (both idempotent) after.
serve({ fetch: app.fetch, port }, () => console.log(`Server running on port ${port}`))

;(async () => {
  try {
    await migrate()
  } catch (e) {
    console.error('Migration error:', e)
  }
  try {
    await seedIfEmpty()
  } catch (e) {
    console.error('Seed error:', e)
  }
})()

export default app
