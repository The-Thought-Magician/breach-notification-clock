import { db } from './index.js'
import { sql } from 'drizzle-orm'

const statements: string[] = [
  `CREATE TABLE IF NOT EXISTS incidents (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    title text NOT NULL,
    reference_number text,
    severity text NOT NULL DEFAULT 'medium',
    status text NOT NULL DEFAULT 'triage',
    is_drill boolean NOT NULL DEFAULT false,
    is_confidential boolean NOT NULL DEFAULT false,
    owner_id text,
    watchers jsonb DEFAULT '[]'::jsonb,
    summary text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS incident_anchors (
    id text PRIMARY KEY,
    incident_id text NOT NULL REFERENCES incidents(id),
    anchor_type text NOT NULL,
    label text NOT NULL,
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS incident_facts (
    id text PRIMARY KEY,
    incident_id text NOT NULL UNIQUE REFERENCES incidents(id),
    data_categories jsonb DEFAULT '[]'::jsonb,
    special_category boolean NOT NULL DEFAULT false,
    encrypted boolean NOT NULL DEFAULT false,
    attacker_access_confirmed boolean NOT NULL DEFAULT false,
    exfiltration_confirmed boolean NOT NULL DEFAULT false,
    risk_of_harm text NOT NULL DEFAULT 'unknown',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS jurisdictions (
    id text PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    region text NOT NULL,
    sector text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS rules (
    id text PRIMARY KEY,
    jurisdiction_id text NOT NULL REFERENCES jurisdictions(id),
    citation text NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    recipient_type text NOT NULL,
    clock_anchor text NOT NULL,
    deadline_hours integer,
    is_undue_delay boolean NOT NULL DEFAULT false,
    harm_threshold text NOT NULL DEFAULT 'any',
    resident_threshold integer DEFAULT 0,
    trigger_data_categories jsonb DEFAULT '[]'::jsonb,
    content_requirements text,
    delivery_method text,
    effective_from timestamptz,
    effective_to timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS regulators (
    id text PRIMARY KEY,
    jurisdiction_id text REFERENCES jurisdictions(id),
    name text NOT NULL,
    portal_url text,
    contact_email text,
    submission_method text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS obligations (
    id text PRIMARY KEY,
    incident_id text NOT NULL REFERENCES incidents(id),
    rule_id text REFERENCES rules(id),
    regulator_id text REFERENCES regulators(id),
    jurisdiction_code text,
    recipient text NOT NULL,
    recipient_type text NOT NULL,
    deadline_at timestamptz,
    clock_anchor text,
    is_undue_delay boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'open',
    owner_id text,
    source text NOT NULL DEFAULT 'statutory',
    why_triggered text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS notice_artifacts (
    id text PRIMARY KEY,
    obligation_id text NOT NULL REFERENCES obligations(id),
    incident_id text NOT NULL REFERENCES incidents(id),
    title text NOT NULL,
    body text DEFAULT '',
    status text NOT NULL DEFAULT 'not_started',
    recipient_detail text,
    delivery_channel text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS artifact_versions (
    id text PRIMARY KEY,
    artifact_id text NOT NULL REFERENCES notice_artifacts(id),
    version integer NOT NULL,
    body text NOT NULL,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS signoffs (
    id text PRIMARY KEY,
    artifact_id text NOT NULL REFERENCES notice_artifacts(id),
    approver_id text NOT NULL,
    decision text NOT NULL DEFAULT 'pending',
    comment text,
    approved_version integer,
    decided_at timestamptz,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS deliveries (
    id text PRIMARY KEY,
    artifact_id text NOT NULL REFERENCES notice_artifacts(id),
    obligation_id text NOT NULL REFERENCES obligations(id),
    method text NOT NULL,
    confirmation_ref text,
    evidence_uri text,
    delivered_at timestamptz NOT NULL,
    was_late boolean NOT NULL DEFAULT false,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS contracts (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    customer_name text NOT NULL,
    dpa_reference text,
    notify_within_hours integer NOT NULL DEFAULT 48,
    clock_anchor text NOT NULL DEFAULT 'confirmation',
    contact_email text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS contract_obligations (
    id text PRIMARY KEY,
    incident_id text NOT NULL REFERENCES incidents(id),
    contract_id text NOT NULL REFERENCES contracts(id),
    obligation_id text REFERENCES obligations(id),
    deadline_at timestamptz,
    status text NOT NULL DEFAULT 'open',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (incident_id, contract_id)
  )`,

  `CREATE TABLE IF NOT EXISTS affected_populations (
    id text PRIMARY KEY,
    incident_id text NOT NULL REFERENCES incidents(id),
    jurisdiction_code text NOT NULL,
    count integer NOT NULL DEFAULT 0,
    data_categories jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (incident_id, jurisdiction_code)
  )`,

  `CREATE TABLE IF NOT EXISTS templates (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    jurisdiction_code text,
    recipient_type text,
    body text NOT NULL DEFAULT '',
    merge_fields jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS tasks (
    id text PRIMARY KEY,
    incident_id text REFERENCES incidents(id),
    obligation_id text REFERENCES obligations(id),
    artifact_id text REFERENCES notice_artifacts(id),
    title text NOT NULL,
    assignee_id text,
    status text NOT NULL DEFAULT 'open',
    due_at timestamptz,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS comments (
    id text PRIMARY KEY,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    author_id text NOT NULL,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS attachments (
    id text PRIMARY KEY,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    name text NOT NULL,
    content_type text,
    uri text NOT NULL,
    uploaded_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS activity_log (
    id text PRIMARY KEY,
    incident_id text,
    actor_id text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    before jsonb DEFAULT '{}'::jsonb,
    after jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS defensibility_packs (
    id text PRIMARY KEY,
    incident_id text NOT NULL REFERENCES incidents(id),
    integrity_hash text NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb,
    generated_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS saved_views (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    is_default boolean NOT NULL DEFAULT false,
    is_shared boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS exposure_profiles (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    jurisdiction_code text NOT NULL,
    data_categories jsonb DEFAULT '[]'::jsonb,
    has_template boolean NOT NULL DEFAULT false,
    has_approver boolean NOT NULL DEFAULT false,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, jurisdiction_code)
  )`,

  `CREATE TABLE IF NOT EXISTS plans (
    id text PRIMARY KEY,
    name text NOT NULL,
    price_cents integer NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS subscriptions (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    plan_id text NOT NULL DEFAULT 'free',
    stripe_customer_id text,
    stripe_subscription_id text,
    status text NOT NULL DEFAULT 'active',
    current_period_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
]

const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_incidents_user_id ON incidents(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_incident_anchors_incident_id ON incident_anchors(incident_id)`,
  `CREATE INDEX IF NOT EXISTS idx_incident_facts_incident_id ON incident_facts(incident_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rules_jurisdiction_id ON rules(jurisdiction_id)`,
  `CREATE INDEX IF NOT EXISTS idx_regulators_jurisdiction_id ON regulators(jurisdiction_id)`,
  `CREATE INDEX IF NOT EXISTS idx_obligations_incident_id ON obligations(incident_id)`,
  `CREATE INDEX IF NOT EXISTS idx_obligations_rule_id ON obligations(rule_id)`,
  `CREATE INDEX IF NOT EXISTS idx_obligations_deadline_at ON obligations(deadline_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notice_artifacts_obligation_id ON notice_artifacts(obligation_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notice_artifacts_incident_id ON notice_artifacts(incident_id)`,
  `CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact_id ON artifact_versions(artifact_id)`,
  `CREATE INDEX IF NOT EXISTS idx_signoffs_artifact_id ON signoffs(artifact_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deliveries_artifact_id ON deliveries(artifact_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deliveries_obligation_id ON deliveries(obligation_id)`,
  `CREATE INDEX IF NOT EXISTS idx_contracts_user_id ON contracts(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_contract_obligations_incident_id ON contract_obligations(incident_id)`,
  `CREATE INDEX IF NOT EXISTS idx_affected_populations_incident_id ON affected_populations(incident_id)`,
  `CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_incident_id ON tasks(incident_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_log_incident_id ON activity_log(incident_id)`,
  `CREATE INDEX IF NOT EXISTS idx_defensibility_packs_incident_id ON defensibility_packs(incident_id)`,
  `CREATE INDEX IF NOT EXISTS idx_saved_views_user_id ON saved_views(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_exposure_profiles_user_id ON exposure_profiles(user_id)`,
]

export async function migrate() {
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt))
  }
  for (const idx of indexes) {
    await db.execute(sql.raw(idx))
  }
  console.log('Migration complete')
}
