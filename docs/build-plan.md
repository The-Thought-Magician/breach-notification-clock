# BreachNotificationClock — Authoritative Build Contract

This is the single source of truth. Filenames, mount paths, api method names, and page files declared here are binding. Every api method is implemented by exactly one route endpoint and consumed by at least one page.

Stack: Hono 4.12.27 + TypeScript backend (Render), Next.js 16 + React 19 + Tailwind 4 + Neon Auth frontend, Neon Postgres + drizzle-orm. Backend trusts `X-User-Id`; use `getUserId(c)` everywhere. Routes mount under `/api/v1` via a child Hono `api` router. Every domain route file `export default router`. Public reads / auth-gated writes with zod validation + ownership checks. Frontend calls `fetch('/api/proxy/<path>')` mapping 1:1 to `/api/v1/<path>`. Auth pages use client `onSubmit` + `authClient`. Landing page is purely static.

---

## (a) Tables (columns)

1. **incidents** — id, user_id, title, reference_number, severity, status, is_drill, is_confidential, owner_id, watchers(jsonb), summary, created_at, updated_at
2. **incident_anchors** — id, incident_id→incidents, anchor_type, label, occurred_at, created_at
3. **incident_facts** — id, incident_id→incidents(unique), data_categories(jsonb), special_category, encrypted, attacker_access_confirmed, exfiltration_confirmed, risk_of_harm, notes, created_at, updated_at
4. **jurisdictions** — id, code(unique), name, region, sector, created_at
5. **rules** — id, jurisdiction_id→jurisdictions, citation, title, category, recipient_type, clock_anchor, deadline_hours, is_undue_delay, harm_threshold, resident_threshold, trigger_data_categories(jsonb), content_requirements, delivery_method, effective_from, effective_to, created_at
6. **regulators** — id, jurisdiction_id→jurisdictions, name, portal_url, contact_email, submission_method, created_by, created_at
7. **obligations** — id, incident_id→incidents, rule_id→rules, regulator_id→regulators, jurisdiction_code, recipient, recipient_type, deadline_at, clock_anchor, is_undue_delay, status, owner_id, source, why_triggered, created_at, updated_at
8. **notice_artifacts** — id, obligation_id→obligations, incident_id→incidents, title, body, status, recipient_detail, delivery_channel, created_by, created_at, updated_at
9. **artifact_versions** — id, artifact_id→notice_artifacts, version, body, created_by, created_at
10. **signoffs** — id, artifact_id→notice_artifacts, approver_id, decision, comment, approved_version, decided_at, created_by, created_at
11. **deliveries** — id, artifact_id→notice_artifacts, obligation_id→obligations, method, confirmation_ref, evidence_uri, delivered_at, was_late, created_by, created_at
12. **contracts** — id, user_id, customer_name, dpa_reference, notify_within_hours, clock_anchor, contact_email, notes, created_at, updated_at
13. **contract_obligations** — id, incident_id→incidents, contract_id→contracts, obligation_id→obligations, deadline_at, status, created_at; UNIQUE(incident_id, contract_id)
14. **affected_populations** — id, incident_id→incidents, jurisdiction_code, count, data_categories(jsonb), created_at; UNIQUE(incident_id, jurisdiction_code)
15. **templates** — id, user_id, name, jurisdiction_code, recipient_type, body, merge_fields(jsonb), created_at, updated_at
16. **tasks** — id, incident_id→incidents, obligation_id→obligations, artifact_id→notice_artifacts, title, assignee_id, status, due_at, created_by, created_at, updated_at
17. **notifications** — id, user_id, kind, title, body, link, is_read, created_at
18. **comments** — id, entity_type, entity_id, author_id, body, created_at, updated_at
19. **attachments** — id, entity_type, entity_id, name, content_type, uri, uploaded_by, created_at
20. **activity_log** — id, incident_id, actor_id, action, entity_type, entity_id, before(jsonb), after(jsonb), created_at
21. **defensibility_packs** — id, incident_id→incidents, integrity_hash, snapshot(jsonb), generated_by, created_at
22. **saved_views** — id, user_id, name, config(jsonb), is_default, is_shared, created_at
23. **exposure_profiles** — id, user_id, jurisdiction_code, data_categories(jsonb), has_template, has_approver, notes, created_at; UNIQUE(user_id, jurisdiction_code)
24. **plans** — id, name, price_cents
25. **subscriptions** — id, user_id(unique), plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, created_at, updated_at

---

## (b) Backend route files (mount under /api/v1)

### incidents.ts — mount `incidents`
- `GET /` — auth — list caller's incidents — `Incident[]`
- `POST /` — auth — create incident — `Incident`
- `GET /:id` — auth — incident detail w/ anchors+facts — `{ incident, anchors, facts }`
- `PUT /:id` — auth — update incident (title/severity/status/etc) — `Incident`
- `DELETE /:id` — auth — delete incident — `{ success }`
- `GET /:id/anchors` — auth — list anchors — `Anchor[]`
- `POST /:id/anchors` — auth — add anchor — `Anchor`
- `PUT /:id/anchors/:anchorId` — auth — update anchor — `Anchor`
- `DELETE /:id/anchors/:anchorId` — auth — delete anchor — `{ success }`
- `PUT /:id/facts` — auth — upsert facts — `Facts`
- `POST /:id/recompute` — auth — run obligation engine, replace obligations — `{ created: number, obligations: Obligation[] }`

### obligations.ts — mount `obligations`
- `GET /` — auth — list obligations (filter `?incidentId=&status=&jurisdiction=`) sorted by deadline — `Obligation[]`
- `GET /:id` — auth — obligation detail w/ artifacts — `{ obligation, artifacts }`
- `PUT /:id` — auth — update status/owner — `Obligation`

### artifacts.ts — mount `artifacts`
- `GET /` — auth — list artifacts (`?obligationId=` or `?incidentId=`) — `Artifact[]`
- `GET /:id` — auth — artifact detail w/ versions+signoffs+delivery — `{ artifact, versions, signoffs, delivery }`
- `POST /` — auth — create artifact for obligation — `Artifact`
- `PUT /:id` — auth — update artifact (body/title/status), snapshot version on body change — `Artifact`
- `DELETE /:id` — auth — delete artifact — `{ success }`
- `GET /:id/versions` — auth — list versions — `ArtifactVersion[]`

### signoffs.ts — mount `signoffs`
- `GET /` — auth — list signoffs (`?artifactId=`) — `Signoff[]`
- `POST /` — auth — request signoff (assign approver) — `Signoff`
- `PUT /:id` — auth — record decision (approve/reject + comment) — `Signoff`

### deliveries.ts — mount `deliveries`
- `GET /` — auth — list deliveries (`?artifactId=` or `?obligationId=`) — `Delivery[]`
- `POST /` — auth — record proof of delivery (computes was_late, sets artifact+obligation delivered) — `Delivery`

### contracts.ts — mount `contracts`
- `GET /` — auth — list caller's contracts — `Contract[]`
- `POST /` — auth — create contract — `Contract`
- `GET /:id` — auth — contract detail — `Contract`
- `PUT /:id` — auth — update contract — `Contract`
- `DELETE /:id` — auth — delete contract — `{ success }`
- `GET /obligations` — auth — list contract obligations (`?incidentId=`) — `ContractObligation[]`
- `POST /obligations` — auth — attach contract to incident, compute deadline — `ContractObligation`

### populations.ts — mount `populations`
- `GET /` — auth — list populations (`?incidentId=`) — `Population[]`
- `POST /` — auth — upsert population row — `Population`
- `DELETE /:id` — auth — delete population — `{ success }`

### jurisdictions.ts — mount `jurisdictions`
- `GET /` — public — list jurisdictions — `Jurisdiction[]`
- `GET /:id` — public — jurisdiction detail — `Jurisdiction`

### rules.ts — mount `rules`
- `GET /` — public — list rules (filter `?jurisdiction=&category=`) — `Rule[]`
- `GET /:id` — public — rule detail — `Rule`
- `POST /` — auth — create custom rule — `Rule`
- `PUT /:id` — auth — update rule — `Rule`
- `DELETE /:id` — auth — delete rule — `{ success }`

### regulators.ts — mount `regulators`
- `GET /` — public — list regulators (`?jurisdiction=`) — `Regulator[]`
- `POST /` — auth — create regulator — `Regulator`
- `PUT /:id` — auth — update regulator — `Regulator`
- `DELETE /:id` — auth — delete regulator — `{ success }`

### templates.ts — mount `templates`
- `GET /` — auth — list caller's templates — `Template[]`
- `GET /:id` — auth — template detail — `Template`
- `POST /` — auth — create template — `Template`
- `PUT /:id` — auth — update template — `Template`
- `DELETE /:id` — auth — delete template — `{ success }`

### tasks.ts — mount `tasks`
- `GET /` — auth — list tasks (`?incidentId=`) — `Task[]`
- `GET /mine` — auth — caller's assigned tasks across incidents — `Task[]`
- `POST /` — auth — create task — `Task`
- `PUT /:id` — auth — update task (status/assignee/due) — `Task`
- `DELETE /:id` — auth — delete task — `{ success }`

### notifications.ts — mount `notifications`
- `GET /` — auth — caller's notifications — `Notification[]`
- `PUT /:id/read` — auth — mark one read — `Notification`
- `PUT /read-all` — auth — mark all read — `{ updated: number }`

### comments.ts — mount `comments`
- `GET /` — auth — list comments (`?entityType=&entityId=`) — `Comment[]`
- `POST /` — auth — add comment (creates @mention notifications) — `Comment`
- `PUT /:id` — auth — edit own comment — `Comment`
- `DELETE /:id` — auth — delete own comment — `{ success }`

### attachments.ts — mount `attachments`
- `GET /` — auth — list attachments (`?entityType=&entityId=`) — `Attachment[]`
- `POST /` — auth — add attachment metadata — `Attachment`
- `DELETE /:id` — auth — delete attachment — `{ success }`

### activity.ts — mount `activity`
- `GET /` — auth — activity log (filter `?incidentId=`) — `Activity[]`

### packs.ts — mount `packs`
- `GET /` — auth — list defensibility packs (`?incidentId=`) — `Pack[]`
- `GET /:id` — auth — pack detail w/ snapshot — `Pack`
- `POST /` — auth — generate pack for incident (immutable snapshot + integrity hash) — `Pack`

### views.ts — mount `views`
- `GET /` — auth — caller's + shared saved views — `SavedView[]`
- `POST /` — auth — create saved view — `SavedView`
- `PUT /:id` — auth — update saved view — `SavedView`
- `DELETE /:id` — auth — delete saved view — `{ success }`

### exposure.ts — mount `exposure`
- `GET /` — auth — caller's exposure profiles — `ExposureProfile[]`
- `POST /` — auth — upsert exposure profile — `ExposureProfile`
- `DELETE /:id` — auth — delete profile — `{ success }`
- `GET /preview` — auth — "if breached" obligation preview (`?jurisdiction=&categories=`) — `{ previews: ObligationPreview[] }`

### warroom.ts — mount `warroom`
- `GET /:incidentId` — auth — countdown aggregate: obligations w/ live time-remaining + banding + next deadline — `{ incident, obligations, nextDeadline, counts }`

### analytics.ts — mount `analytics`
- `GET /summary` — auth — cross-incident program metrics — `{ totals, onTimeRate, byJurisdiction, trend }`
- `GET /incident/:id` — auth — per-incident summary (obligations, met-on-time, late, time-to-first-notice) — `IncidentSummary`

### seed.ts — mount `seed`
- `POST /sample` — auth — generate a realistic sample/drill incident with anchors, facts, populations, recomputed obligations — `{ incident: Incident }`

### dashboard.ts — mount `dashboard`
- `GET /overview` — auth — program overview: open incidents, soonest deadlines across all incidents, counts by band — `{ incidents, upcoming, counts }`

### billing.ts — mount `billing`
- `GET /plan` — auth — caller subscription + plan + stripeEnabled — `{ subscription, plan, stripeEnabled }`
- `POST /checkout` — auth — Stripe checkout (503 when unconfigured) — `{ url } | 503`
- `POST /portal` — auth — Stripe portal (503 when unconfigured) — `{ url } | 503`
- `POST /webhook` — public — Stripe webhook (503 when unconfigured) — `{ received } | 503`

Total route files: 25 (incidents, obligations, artifacts, signoffs, deliveries, contracts, populations, jurisdictions, rules, regulators, templates, tasks, notifications, comments, attachments, activity, packs, views, exposure, warroom, analytics, seed, dashboard, billing) — plus `health` served inline in index.ts.

---

## (c) lib/api.ts methods (relative `/api/proxy/...` path + verb)

**Dashboard / overview**
- `getDashboardOverview()` — GET `/api/proxy/dashboard/overview`

**Incidents**
- `getIncidents()` — GET `/api/proxy/incidents`
- `createIncident(data)` — POST `/api/proxy/incidents`
- `getIncident(id)` — GET `/api/proxy/incidents/${id}`
- `updateIncident(id, data)` — PUT `/api/proxy/incidents/${id}`
- `deleteIncident(id)` — DELETE `/api/proxy/incidents/${id}`
- `getAnchors(id)` — GET `/api/proxy/incidents/${id}/anchors`
- `createAnchor(id, data)` — POST `/api/proxy/incidents/${id}/anchors`
- `updateAnchor(id, anchorId, data)` — PUT `/api/proxy/incidents/${id}/anchors/${anchorId}`
- `deleteAnchor(id, anchorId)` — DELETE `/api/proxy/incidents/${id}/anchors/${anchorId}`
- `updateFacts(id, data)` — PUT `/api/proxy/incidents/${id}/facts`
- `recomputeObligations(id)` — POST `/api/proxy/incidents/${id}/recompute`

**Obligations**
- `getObligations(params)` — GET `/api/proxy/obligations` (query string)
- `getObligation(id)` — GET `/api/proxy/obligations/${id}`
- `updateObligation(id, data)` — PUT `/api/proxy/obligations/${id}`

**Artifacts**
- `getArtifacts(params)` — GET `/api/proxy/artifacts`
- `getArtifact(id)` — GET `/api/proxy/artifacts/${id}`
- `createArtifact(data)` — POST `/api/proxy/artifacts`
- `updateArtifact(id, data)` — PUT `/api/proxy/artifacts/${id}`
- `deleteArtifact(id)` — DELETE `/api/proxy/artifacts/${id}`
- `getArtifactVersions(id)` — GET `/api/proxy/artifacts/${id}/versions`

**Signoffs**
- `getSignoffs(artifactId)` — GET `/api/proxy/signoffs?artifactId=${artifactId}`
- `requestSignoff(data)` — POST `/api/proxy/signoffs`
- `decideSignoff(id, data)` — PUT `/api/proxy/signoffs/${id}`

**Deliveries**
- `getDeliveries(params)` — GET `/api/proxy/deliveries`
- `recordDelivery(data)` — POST `/api/proxy/deliveries`

**Contracts**
- `getContracts()` — GET `/api/proxy/contracts`
- `createContract(data)` — POST `/api/proxy/contracts`
- `getContract(id)` — GET `/api/proxy/contracts/${id}`
- `updateContract(id, data)` — PUT `/api/proxy/contracts/${id}`
- `deleteContract(id)` — DELETE `/api/proxy/contracts/${id}`
- `getContractObligations(incidentId)` — GET `/api/proxy/contracts/obligations?incidentId=${incidentId}`
- `attachContract(data)` — POST `/api/proxy/contracts/obligations`

**Populations**
- `getPopulations(incidentId)` — GET `/api/proxy/populations?incidentId=${incidentId}`
- `savePopulation(data)` — POST `/api/proxy/populations`
- `deletePopulation(id)` — DELETE `/api/proxy/populations/${id}`

**Jurisdictions**
- `getJurisdictions()` — GET `/api/proxy/jurisdictions`
- `getJurisdiction(id)` — GET `/api/proxy/jurisdictions/${id}`

**Rules**
- `getRules(params)` — GET `/api/proxy/rules`
- `getRule(id)` — GET `/api/proxy/rules/${id}`
- `createRule(data)` — POST `/api/proxy/rules`
- `updateRule(id, data)` — PUT `/api/proxy/rules/${id}`
- `deleteRule(id)` — DELETE `/api/proxy/rules/${id}`

**Regulators**
- `getRegulators(params)` — GET `/api/proxy/regulators`
- `createRegulator(data)` — POST `/api/proxy/regulators`
- `updateRegulator(id, data)` — PUT `/api/proxy/regulators/${id}`
- `deleteRegulator(id)` — DELETE `/api/proxy/regulators/${id}`

**Templates**
- `getTemplates()` — GET `/api/proxy/templates`
- `getTemplate(id)` — GET `/api/proxy/templates/${id}`
- `createTemplate(data)` — POST `/api/proxy/templates`
- `updateTemplate(id, data)` — PUT `/api/proxy/templates/${id}`
- `deleteTemplate(id)` — DELETE `/api/proxy/templates/${id}`

**Tasks**
- `getTasks(incidentId)` — GET `/api/proxy/tasks?incidentId=${incidentId}`
- `getMyTasks()` — GET `/api/proxy/tasks/mine`
- `createTask(data)` — POST `/api/proxy/tasks`
- `updateTask(id, data)` — PUT `/api/proxy/tasks/${id}`
- `deleteTask(id)` — DELETE `/api/proxy/tasks/${id}`

**Notifications**
- `getNotifications()` — GET `/api/proxy/notifications`
- `markNotificationRead(id)` — PUT `/api/proxy/notifications/${id}/read`
- `markAllNotificationsRead()` — PUT `/api/proxy/notifications/read-all`

**Comments**
- `getComments(entityType, entityId)` — GET `/api/proxy/comments?entityType=${entityType}&entityId=${entityId}`
- `createComment(data)` — POST `/api/proxy/comments`
- `updateComment(id, data)` — PUT `/api/proxy/comments/${id}`
- `deleteComment(id)` — DELETE `/api/proxy/comments/${id}`

**Attachments**
- `getAttachments(entityType, entityId)` — GET `/api/proxy/attachments?entityType=${entityType}&entityId=${entityId}`
- `createAttachment(data)` — POST `/api/proxy/attachments`
- `deleteAttachment(id)` — DELETE `/api/proxy/attachments/${id}`

**Activity**
- `getActivity(params)` — GET `/api/proxy/activity`

**Packs**
- `getPacks(incidentId)` — GET `/api/proxy/packs?incidentId=${incidentId}`
- `getPack(id)` — GET `/api/proxy/packs/${id}`
- `generatePack(data)` — POST `/api/proxy/packs`

**Views**
- `getViews()` — GET `/api/proxy/views`
- `createView(data)` — POST `/api/proxy/views`
- `updateView(id, data)` — PUT `/api/proxy/views/${id}`
- `deleteView(id)` — DELETE `/api/proxy/views/${id}`

**Exposure**
- `getExposure()` — GET `/api/proxy/exposure`
- `saveExposure(data)` — POST `/api/proxy/exposure`
- `deleteExposure(id)` — DELETE `/api/proxy/exposure/${id}`
- `previewExposure(params)` — GET `/api/proxy/exposure/preview`

**War room**
- `getWarRoom(incidentId)` — GET `/api/proxy/warroom/${incidentId}`

**Analytics**
- `getAnalyticsSummary()` — GET `/api/proxy/analytics/summary`
- `getIncidentAnalytics(id)` — GET `/api/proxy/analytics/incident/${id}`

**Seed**
- `seedSample()` — POST `/api/proxy/seed/sample`

**Billing**
- `getBillingPlan()` — GET `/api/proxy/billing/plan`
- `startCheckout()` — POST `/api/proxy/billing/checkout`
- `openPortal()` — POST `/api/proxy/billing/portal`

---

## (d) Pages (URL · file · kind · api methods · renders)

1. `/` · `web/app/page.tsx` · public · (none) · static landing: hero, feature grid, CTAs to sign-up.
2. `/auth/sign-in` · `web/app/auth/sign-in/page.tsx` · public · authClient.signIn · email/password sign-in form.
3. `/auth/sign-up` · `web/app/auth/sign-up/page.tsx` · public · authClient.signUp · name/email/password sign-up form.
4. `/pricing` · `web/app/pricing/page.tsx` · public · (none) · static pricing (all free).
5. `/dashboard` · `web/app/dashboard/page.tsx` · dashboard · getDashboardOverview, seedSample · program overview, soonest deadlines, open incidents, "seed sample" button.
6. `/dashboard/incidents` · `web/app/dashboard/incidents/page.tsx` · dashboard · getIncidents · incident list table w/ status + severity.
7. `/dashboard/incidents/new` · `web/app/dashboard/incidents/new/page.tsx` · dashboard · createIncident · create-incident form.
8. `/dashboard/incidents/[id]` · `web/app/dashboard/incidents/[id]/page.tsx` · dashboard · getIncident, updateIncident, deleteIncident, getAnchors, createAnchor, updateAnchor, deleteAnchor, updateFacts, recomputeObligations, getComments, createComment, getAttachments, createAttachment, deleteAttachment · incident detail: anchors editor, facts panel, recompute button, comments, attachments.
9. `/dashboard/incidents/[id]/matrix` · `web/app/dashboard/incidents/[id]/matrix/page.tsx` · dashboard · getObligations, updateObligation, getViews, createView · obligation matrix table sorted by deadline w/ banding, filters, save-view, owner/status bulk edit.
10. `/dashboard/incidents/[id]/warroom` · `web/app/dashboard/incidents/[id]/warroom/page.tsx` · dashboard · getWarRoom · full-screen countdown wall, next-deadline hero, red/amber banding.
11. `/dashboard/obligations/[id]` · `web/app/dashboard/obligations/[id]/page.tsx` · dashboard · getObligation, updateObligation, getArtifacts, createArtifact, getComments, createComment · obligation detail + its artifacts list + create artifact.
12. `/dashboard/artifacts/[id]` · `web/app/dashboard/artifacts/[id]/page.tsx` · dashboard · getArtifact, updateArtifact, deleteArtifact, getArtifactVersions, getSignoffs, requestSignoff, decideSignoff, getDeliveries, recordDelivery · artifact editor, version history, sign-off workflow, proof-of-delivery.
13. `/dashboard/contracts` · `web/app/dashboard/contracts/page.tsx` · dashboard · getContracts, createContract, updateContract, deleteContract · customer DPA registry CRUD.
14. `/dashboard/populations` · `web/app/dashboard/populations/page.tsx` · dashboard · getIncidents, getPopulations, savePopulation, deletePopulation · pick incident, manage per-jurisdiction affected counts.
15. `/dashboard/templates` · `web/app/dashboard/templates/page.tsx` · dashboard · getTemplates, createTemplate, updateTemplate, deleteTemplate · notice template library CRUD.
16. `/dashboard/rules` · `web/app/dashboard/rules/page.tsx` · dashboard · getRules, getRule, createRule, updateRule, deleteRule · rules library browse + custom rule CRUD.
17. `/dashboard/jurisdictions` · `web/app/dashboard/jurisdictions/page.tsx` · dashboard · getJurisdictions, getJurisdiction · jurisdiction registry browse + detail.
18. `/dashboard/regulators` · `web/app/dashboard/regulators/page.tsx` · dashboard · getRegulators, createRegulator, updateRegulator, deleteRegulator · regulator directory CRUD.
19. `/dashboard/tasks` · `web/app/dashboard/tasks/page.tsx` · dashboard · getMyTasks, updateTask, deleteTask, createTask · my-tasks across incidents.
20. `/dashboard/notifications` · `web/app/dashboard/notifications/page.tsx` · dashboard · getNotifications, markNotificationRead, markAllNotificationsRead · notification feed.
21. `/dashboard/packs` · `web/app/dashboard/packs/page.tsx` · dashboard · getIncidents, getPacks, getPack, generatePack · defensibility packs list + generate + view snapshot.
22. `/dashboard/exposure` · `web/app/dashboard/exposure/page.tsx` · dashboard · getExposure, saveExposure, deleteExposure, previewExposure, getJurisdictions · jurisdiction exposure profile + "if breached" preview.
23. `/dashboard/analytics` · `web/app/dashboard/analytics/page.tsx` · dashboard · getAnalyticsSummary, getIncidents, getIncidentAnalytics · program metrics + per-incident summary.
24. `/dashboard/activity` · `web/app/dashboard/activity/page.tsx` · dashboard · getActivity, getIncidents · audit log filtered view.
25. `/dashboard/views` · `web/app/dashboard/views/page.tsx` · dashboard · getViews, createView, updateView, deleteView · saved views manager.
26. `/dashboard/settings` · `web/app/dashboard/settings/page.tsx` · dashboard · getBillingPlan, startCheckout, openPortal · settings + billing/plan view.

Plus route handlers: `web/app/api/auth/[...path]/route.ts`, `web/app/api/proxy/[...path]/route.ts`. Total page.tsx routes: 26.

---

## (e) DashboardLayout sidebar nav sections

`web/app/dashboard/layout.tsx` renders `<DashboardLayout>` (`web/components/DashboardLayout.tsx`, `'use client'`, active state via `usePathname()`).

- **Overview**
  - Dashboard → `/dashboard`
- **Incidents**
  - All Incidents → `/dashboard/incidents`
  - New Incident → `/dashboard/incidents/new`
- **Response** (per-incident pages reached from incident detail; flat entries for direct nav)
  - My Tasks → `/dashboard/tasks`
  - Notifications → `/dashboard/notifications`
- **Reference Data**
  - Rules → `/dashboard/rules`
  - Jurisdictions → `/dashboard/jurisdictions`
  - Regulators → `/dashboard/regulators`
  - Templates → `/dashboard/templates`
- **Customers & Exposure**
  - Contracts → `/dashboard/contracts`
  - Affected Populations → `/dashboard/populations`
  - Exposure Profile → `/dashboard/exposure`
- **Records & Insight**
  - Defensibility Packs → `/dashboard/packs`
  - Analytics → `/dashboard/analytics`
  - Activity Log → `/dashboard/activity`
  - Saved Views → `/dashboard/views`
- **Account**
  - Settings → `/dashboard/settings`

Per-incident pages (`/dashboard/incidents/[id]`, `.../matrix`, `.../warroom`, `/dashboard/obligations/[id]`, `/dashboard/artifacts/[id]`) are navigated to contextually from the incident detail and obligation matrix, not from the global sidebar.
