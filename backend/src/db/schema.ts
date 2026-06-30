import { pgTable, text, integer, boolean, timestamp, jsonb, unique, real } from 'drizzle-orm/pg-core'

// ── Incident core ───────────────────────────────────────────────────────────

export const incidents = pgTable('incidents', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  title: text('title').notNull(),
  reference_number: text('reference_number'),
  severity: text('severity').notNull().default('medium'),
  status: text('status').notNull().default('triage'),
  is_drill: boolean('is_drill').default(false).notNull(),
  is_confidential: boolean('is_confidential').default(false).notNull(),
  owner_id: text('owner_id'),
  watchers: jsonb('watchers').$type<string[]>().default([]),
  summary: text('summary'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const incident_anchors = pgTable('incident_anchors', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  incident_id: text('incident_id').notNull().references(() => incidents.id),
  anchor_type: text('anchor_type').notNull(), // discovery|confirmation|containment|belief_of_harm|custom
  label: text('label').notNull(),
  occurred_at: timestamp('occurred_at').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const incident_facts = pgTable('incident_facts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  incident_id: text('incident_id').notNull().references(() => incidents.id).unique(),
  data_categories: jsonb('data_categories').$type<string[]>().default([]),
  special_category: boolean('special_category').default(false).notNull(),
  encrypted: boolean('encrypted').default(false).notNull(),
  attacker_access_confirmed: boolean('attacker_access_confirmed').default(false).notNull(),
  exfiltration_confirmed: boolean('exfiltration_confirmed').default(false).notNull(),
  risk_of_harm: text('risk_of_harm').notNull().default('unknown'), // low|medium|high|unknown
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ── Rules dataset ─────────────────────────────────────────────────────────────

export const jurisdictions = pgTable('jurisdictions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  region: text('region').notNull(), // EU|US|APAC|sector
  sector: text('sector'), // health|financial|telecom|general
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const rules = pgTable('rules', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  jurisdiction_id: text('jurisdiction_id').notNull().references(() => jurisdictions.id),
  citation: text('citation').notNull(),
  title: text('title').notNull(),
  category: text('category').notNull(), // regulator|individual|controller|media_substitute
  recipient_type: text('recipient_type').notNull(),
  clock_anchor: text('clock_anchor').notNull(), // discovery|confirmation|containment|belief_of_harm
  deadline_hours: integer('deadline_hours'), // null when undue_delay
  is_undue_delay: boolean('is_undue_delay').default(false).notNull(),
  harm_threshold: text('harm_threshold').notNull().default('any'), // any|medium|high
  resident_threshold: integer('resident_threshold').default(0),
  trigger_data_categories: jsonb('trigger_data_categories').$type<string[]>().default([]),
  content_requirements: text('content_requirements'),
  delivery_method: text('delivery_method'),
  effective_from: timestamp('effective_from'),
  effective_to: timestamp('effective_to'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const regulators = pgTable('regulators', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  jurisdiction_id: text('jurisdiction_id').references(() => jurisdictions.id),
  name: text('name').notNull(),
  portal_url: text('portal_url'),
  contact_email: text('contact_email'),
  submission_method: text('submission_method'),
  created_by: text('created_by'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ── Computed obligations ──────────────────────────────────────────────────────

export const obligations = pgTable('obligations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  incident_id: text('incident_id').notNull().references(() => incidents.id),
  rule_id: text('rule_id').references(() => rules.id),
  regulator_id: text('regulator_id').references(() => regulators.id),
  jurisdiction_code: text('jurisdiction_code'),
  recipient: text('recipient').notNull(),
  recipient_type: text('recipient_type').notNull(),
  deadline_at: timestamp('deadline_at'),
  clock_anchor: text('clock_anchor'),
  is_undue_delay: boolean('is_undue_delay').default(false).notNull(),
  status: text('status').notNull().default('open'), // open|in_progress|sent|delivered|na
  owner_id: text('owner_id'),
  source: text('source').notNull().default('statutory'), // statutory|contractual
  why_triggered: text('why_triggered'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ── Notice artifacts ──────────────────────────────────────────────────────────

export const notice_artifacts = pgTable('notice_artifacts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  obligation_id: text('obligation_id').notNull().references(() => obligations.id),
  incident_id: text('incident_id').notNull().references(() => incidents.id),
  title: text('title').notNull(),
  body: text('body').default(''),
  status: text('status').notNull().default('not_started'), // not_started|drafting|in_review|approved|sent|delivered|failed
  recipient_detail: text('recipient_detail'),
  delivery_channel: text('delivery_channel'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const artifact_versions = pgTable('artifact_versions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  artifact_id: text('artifact_id').notNull().references(() => notice_artifacts.id),
  version: integer('version').notNull(),
  body: text('body').notNull(),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const signoffs = pgTable('signoffs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  artifact_id: text('artifact_id').notNull().references(() => notice_artifacts.id),
  approver_id: text('approver_id').notNull(),
  decision: text('decision').notNull().default('pending'), // pending|approved|rejected
  comment: text('comment'),
  approved_version: integer('approved_version'),
  decided_at: timestamp('decided_at'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const deliveries = pgTable('deliveries', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  artifact_id: text('artifact_id').notNull().references(() => notice_artifacts.id),
  obligation_id: text('obligation_id').notNull().references(() => obligations.id),
  method: text('method').notNull(), // portal|email|certified_mail|courier
  confirmation_ref: text('confirmation_ref'),
  evidence_uri: text('evidence_uri'),
  delivered_at: timestamp('delivered_at').notNull(),
  was_late: boolean('was_late').default(false).notNull(),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ── Contractual / customer layer ──────────────────────────────────────────────

export const contracts = pgTable('contracts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  customer_name: text('customer_name').notNull(),
  dpa_reference: text('dpa_reference'),
  notify_within_hours: integer('notify_within_hours').notNull().default(48),
  clock_anchor: text('clock_anchor').notNull().default('confirmation'),
  contact_email: text('contact_email'),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const contract_obligations = pgTable('contract_obligations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  incident_id: text('incident_id').notNull().references(() => incidents.id),
  contract_id: text('contract_id').notNull().references(() => contracts.id),
  obligation_id: text('obligation_id').references(() => obligations.id),
  deadline_at: timestamp('deadline_at'),
  status: text('status').notNull().default('open'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.incident_id, t.contract_id)])

// ── Affected populations ──────────────────────────────────────────────────────

export const affected_populations = pgTable('affected_populations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  incident_id: text('incident_id').notNull().references(() => incidents.id),
  jurisdiction_code: text('jurisdiction_code').notNull(),
  count: integer('count').notNull().default(0),
  data_categories: jsonb('data_categories').$type<string[]>().default([]),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.incident_id, t.jurisdiction_code)])

// ── Templates ─────────────────────────────────────────────────────────────────

export const templates = pgTable('templates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  jurisdiction_code: text('jurisdiction_code'),
  recipient_type: text('recipient_type'),
  body: text('body').notNull().default(''),
  merge_fields: jsonb('merge_fields').$type<string[]>().default([]),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  incident_id: text('incident_id').references(() => incidents.id),
  obligation_id: text('obligation_id').references(() => obligations.id),
  artifact_id: text('artifact_id').references(() => notice_artifacts.id),
  title: text('title').notNull(),
  assignee_id: text('assignee_id'),
  status: text('status').notNull().default('open'), // open|done
  due_at: timestamp('due_at'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ── Notifications ─────────────────────────────────────────────────────────────

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  kind: text('kind').notNull(), // deadline|signoff|delivery|mention
  title: text('title').notNull(),
  body: text('body'),
  link: text('link'),
  is_read: boolean('is_read').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ── Comments ──────────────────────────────────────────────────────────────────

export const comments = pgTable('comments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  entity_type: text('entity_type').notNull(), // incident|obligation|artifact
  entity_id: text('entity_id').notNull(),
  author_id: text('author_id').notNull(),
  body: text('body').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ── Attachments ───────────────────────────────────────────────────────────────

export const attachments = pgTable('attachments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  entity_type: text('entity_type').notNull(), // incident|obligation|artifact
  entity_id: text('entity_id').notNull(),
  name: text('name').notNull(),
  content_type: text('content_type'),
  uri: text('uri').notNull(),
  uploaded_by: text('uploaded_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ── Activity log ──────────────────────────────────────────────────────────────

export const activity_log = pgTable('activity_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  incident_id: text('incident_id'),
  actor_id: text('actor_id').notNull(),
  action: text('action').notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id').notNull(),
  before: jsonb('before').$type<Record<string, unknown>>().default({}),
  after: jsonb('after').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ── Defensibility packs ───────────────────────────────────────────────────────

export const defensibility_packs = pgTable('defensibility_packs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  incident_id: text('incident_id').notNull().references(() => incidents.id),
  integrity_hash: text('integrity_hash').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().default({}),
  generated_by: text('generated_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ── Saved views ───────────────────────────────────────────────────────────────

export const saved_views = pgTable('saved_views', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().default({}),
  is_default: boolean('is_default').default(false).notNull(),
  is_shared: boolean('is_shared').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ── Exposure profiles ─────────────────────────────────────────────────────────

export const exposure_profiles = pgTable('exposure_profiles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  jurisdiction_code: text('jurisdiction_code').notNull(),
  data_categories: jsonb('data_categories').$type<string[]>().default([]),
  has_template: boolean('has_template').default(false).notNull(),
  has_approver: boolean('has_approver').default(false).notNull(),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.user_id, t.jurisdiction_code)])

// ── Billing ───────────────────────────────────────────────────────────────────

export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price_cents: integer('price_cents').notNull().default(0),
})

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull().unique(),
  plan_id: text('plan_id').notNull().default('free'),
  stripe_customer_id: text('stripe_customer_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  status: text('status').notNull().default('active'),
  current_period_end: timestamp('current_period_end'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})
