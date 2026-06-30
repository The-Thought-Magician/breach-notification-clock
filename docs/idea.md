# BreachNotificationClock — Product & Feature Specification

## Overview

BreachNotificationClock is a statutory-and-contractual breach notification deadline engine and notice-tracking system for privacy and security teams. From a single incident timeline, it computes every applicable regulator and customer notification deadline across all jurisdictions and sectors a company is exposed to, sorts them by soonest due, and tracks each individual notice from draft, through approver sign-off, to verified proof of delivery. When a data incident hits, the platform turns a chaotic spreadsheet-and-email scramble into a deterministic, defensible, countdown-driven workflow with an immutable audit trail.

The product is built on a maintained rules dataset of breach-notification laws (GDPR Article 33/34, US state breach laws across all 50 states, HIPAA, GLBA, sector and contractual obligations) where each rule encodes its trigger, clock-start anchor, deadline offset, recipient, content requirements, and delivery method. The engine evaluates an incident's facts (affected data types, affected resident counts per jurisdiction, discovery and containment timestamps, risk of harm) against the rule set and emits a concrete obligation matrix with hard dates.

## Problem

During a live data incident, privacy counsel, DPOs, and CISOs must simultaneously:
- Determine which of dozens of overlapping breach-notification laws are triggered by the facts of the incident.
- Compute each law's deadline, where the clock starts on different anchors (discovery vs confirmation vs containment) and runs on different units (72 hours, "without undue delay", 30/45/60 days, "most expedient time possible").
- Layer in tighter contractual windows promised in customer Data Processing Agreements (DPAs), which frequently demand notice in 24-48 hours, well inside any statutory window.
- Draft, route for sign-off, send, and then prove delivery of each individual notice to each regulator, affected individual population, and business customer.
- Produce a defensible record afterward showing every clock was met, with timestamps that cannot be retroactively altered.

A single missed clock carries catastrophic exposure: GDPR fines up to 4% of global turnover, US state attorney-general penalties, regulatory consent decrees, and customer contract breach. The work is currently done in spreadsheets and email threads, which neither compute deadlines deterministically nor prove delivery.

## Target Users

- **Privacy Counsel / General Counsel** at multi-jurisdiction companies who personally sign breach notifications.
- **Data Protection Officers (DPOs)** responsible for GDPR Article 33/34 compliance.
- **CISOs and Incident Response leads** who own the incident timeline and must hand counsel accurate facts on a clock.
- **Privacy program managers** running breach-readiness drills and maintaining the company's notification playbook.
- **Outside privacy law firms and incident-response consultancies** managing breach notifications on behalf of multiple clients.

The buyer is the privacy counsel / DPO / CISO who carries personal liability for a missed statutory window. Demand is driven by a hard trigger (an active incident, or a board breach-readiness mandate) and fine-avoidance ROI where one avoided late-notice penalty dwarfs the subscription cost.

## Why This Is NOT an Existing Project

BreachNotificationClock is distinct from its nearest neighbors:

- **Incident management / incident-comms platforms** (PagerDuty, incident.io, Blameless, FireHydrant): these coordinate the *response* to an incident (paging, status pages, war rooms, postmortems). They do **not** encode statutory breach-notification law, do **not** compute regulator deadlines, and do **not** track proof-of-delivery for legal notices. BreachNotificationClock starts where the incident is already declared and computes the *legal notification deadline matrix*.
- **Consent / privacy management platforms** (OneTrust, TrustArc, Osano): these manage cookie consent, DSARs, data mapping, and privacy assessments in steady state. They are not incident-time deadline engines and do not track per-obligation notice delivery against a running clock.
- **Data-residency / data-mapping tools** (the "where data lives at rest" cluster): these tell you where personal data is stored. BreachNotificationClock instead consumes the affected-data facts and computes *when you must notify whom* once that data is breached.
- **export-screening-ledger** (a sibling venture): screens transactions/parties against export-control and sanctions lists. Different domain (trade compliance), different artifact (screening decision vs notification deadline).
- **secret-exposure-blast-radius** (a sibling venture): credential incident response — maps the blast radius of a leaked secret and drives rotation. It is credential IR, not statutory notification deadline computation or proof-of-delivery tracking.

The defining capability no neighbor has: a maintained statutory rules dataset that deterministically computes the *full obligation matrix with hard deadline dates* from one incident timeline, plus per-notice tracking to verified delivery and an immutable defensibility export.

## Feature Sections

### 1. Incident Workspace & Timeline Anchor
The root object. Every analysis hangs off an incident.
- Create an incident with a title, reference number, severity, and confidential status.
- Timeline anchor events: discovery timestamp, confirmation timestamp, containment timestamp, "reasonable belief of harm" timestamp, and custom anchor events.
- Each rule references which anchor starts its clock; editing an anchor recomputes all dependent deadlines.
- Incident status lifecycle: triage, active, notifications-in-progress, closed.
- Per-incident facts panel: affected data categories, special-category data flags, encryption status, attacker access confirmed, data exfiltration confirmed.
- Incident assignment to an owner and watchers.
- Activity/audit log of every fact and anchor change with actor and timestamp.

### 2. Jurisdiction & Rules Dataset
The maintained corpus of breach-notification law.
- Jurisdiction registry: countries, US states, EU member states, sectors (health, financial, telecom).
- Rule records: each encodes statute citation, trigger condition, clock-start anchor, deadline offset (hours/days/"without undue delay"), recipient type, harm threshold, content requirements, and delivery method.
- Rule versioning: effective-from / effective-to dates so historical incidents evaluate against the law in force at the time.
- Rule categories: regulator notice, affected-individual notice, sub-processor/controller notice, media/substitute notice.
- Searchable, filterable rules library independent of any incident.
- Seeded with GDPR, all 50 US states, HIPAA, GLBA, and representative sector rules.

### 3. Obligation Computation Engine
The deterministic core.
- Evaluate an incident's facts against the full rules dataset and emit triggered obligations.
- Each obligation gets: source rule, jurisdiction, recipient, computed deadline datetime, clock-start anchor used, and a "why triggered" explanation trace.
- Recompute on demand and automatically when facts/anchors change.
- Handle "without undue delay" rules with a configurable default cap and a flag that they are soft deadlines.
- Conflict surfacing: when multiple rules cover the same population, show the binding (tightest) one.
- Suppress obligations whose harm threshold is not met (with explicit reasoning).

### 4. Obligation Matrix View
The triage surface.
- Tabular matrix of all triggered obligations sorted by soonest deadline.
- Columns: recipient, jurisdiction, deadline, time-remaining, status, owner.
- Red/amber/green banding by time remaining against configurable thresholds.
- Filter by jurisdiction, recipient type, status, owner.
- Bulk-assign owners and bulk status transitions.
- Group-by jurisdiction or recipient type.

### 5. Notification Artifact Tracker
Per-obligation notice lifecycle.
- Each obligation has one or more notice artifacts (the actual letters/filings).
- Artifact lifecycle: not-started, drafting, in-review, approved, sent, delivered, failed.
- Draft body editor with template merge fields.
- Version history of the draft.
- Link each artifact to its obligation and incident.
- Per-artifact recipient details (regulator portal, email, postal address).

### 6. Approver Sign-Off Workflow
Legal gating.
- Designate required approvers per artifact or per jurisdiction.
- Request sign-off; approver approves or rejects with comment.
- Block "sent" status until required approvals are recorded.
- Sign-off records actor, decision, timestamp, and the exact draft version approved (immutable).
- Multi-approver and sequential vs parallel approval modes.

### 7. Proof of Delivery
Closing the loop.
- Record delivery method (regulator portal confirmation number, email receipt, certified mail tracking, courier).
- Attach delivery evidence (confirmation reference, screenshot reference, receipt metadata).
- Mark delivered with a verified delivery timestamp.
- Compare delivery timestamp against the deadline; flag late deliveries.
- Per-obligation delivered/total rollup.

### 8. Customer & Contractual Notice Layer
The DPA window overlay.
- Register customer contracts with promised notification windows (e.g., "notify within 24 hours of confirmation").
- Map which customers are affected by an incident.
- Compute contractual deadlines alongside statutory ones, surfacing the tighter window.
- Track per-customer notice artifacts and delivery just like regulator notices.
- Contract registry independent of incidents (reusable across incidents).

### 9. Countdown War-Room View
The live incident dashboard.
- Full-screen countdown wall showing every obligation's live time-remaining.
- Red/amber banding with configurable thresholds; auto-sorts most-urgent first.
- "Next deadline" hero card.
- Filter to a single jurisdiction or recipient type for sub-team war rooms.
- Auto-refresh and a quiet/at-risk-only mode.

### 10. Post-Incident Defensibility Pack
The immutable export.
- Generate a timestamped, append-only record of the incident: timeline, computed obligations, every artifact version, every sign-off, every proof of delivery.
- Content hash / integrity stamp so the export cannot be retroactively altered without detection.
- Export as a structured document for regulators, auditors, or litigation hold.
- List of generated packs per incident with their integrity stamps and generation time.

### 11. Drill Mode & Templates
Breach-readiness practice.
- Mark an incident as a drill (clearly flagged, excluded from real metrics).
- Reusable per-jurisdiction notice templates seeded into draft artifacts.
- Scenario seeder: spin up a realistic sample incident with affected populations to demo or train on.
- Template library CRUD with merge-field placeholders.
- Convert a drill's learnings into updated templates.

### 12. Affected Population & Resident Counts
The threshold inputs.
- Per-jurisdiction affected-individual counts that drive substitute-notice and AG-notice thresholds.
- Affected data category breakdown (SSN, financial, health, credentials, biometric).
- Resident-count thresholds that change which obligations trigger (e.g., >500 residents triggers media notice).
- Import counts from an uploaded CSV.

### 13. Tasks & Assignments
Operational execution.
- Per-obligation and per-artifact tasks with assignee, due date, and status.
- "My tasks" view across all incidents for the logged-in user.
- Task completion feeds artifact/obligation status.
- Overdue task flagging.

### 14. Notifications & Alerts (in-app)
Keep the clock loud.
- In-app alerts when an obligation crosses an amber/red threshold.
- Alerts on sign-off requests, rejections, and delivery failures.
- Per-user notification feed with mark-read.
- Digest of soonest deadlines.

### 15. Comments & Collaboration
Incident-room discussion.
- Threaded comments on incidents, obligations, and artifacts.
- @-mention to notify a teammate.
- Comment edit/delete by author.

### 16. Document & Evidence Attachments
Supporting material.
- Attach reference documents to incidents, obligations, and artifacts (metadata records: name, type, reference URI, uploader).
- List and remove attachments.
- Link evidence to proof-of-delivery records.

### 17. Audit Log & Activity Trail
Defensibility substrate.
- Append-only activity log across incidents, obligations, artifacts, sign-offs, and deliveries.
- Actor, action, entity, before/after snapshot, timestamp.
- Per-incident and global filtered views.

### 18. Reporting & Analytics
Program-level insight.
- Per-incident summary: total obligations, met-on-time rate, late count, time-to-first-notice.
- Cross-incident program metrics: average time-to-notify by jurisdiction, drill vs real.
- Jurisdiction exposure heatmap (which laws trigger most often).
- Trend of obligations and delivery performance over time.

### 19. Saved Views & Filters
Personalization.
- Save obligation-matrix filter/sort combinations as named views.
- Per-user default view.
- Share a saved view across the workspace.

### 20. Jurisdiction Exposure Profile
Pre-incident readiness.
- Declare which jurisdictions/sectors the company is exposed to.
- Pre-compute "if breached" obligation previews per data category.
- Readiness gaps: jurisdictions with no template prepared, no approver assigned.

### 21. Regulator Directory
Recipient reference.
- Directory of regulators per jurisdiction with portal URL, contact, and submission method.
- Link obligations to the correct regulator record.
- CRUD for custom regulator entries.

### 22. Settings & Workspace Configuration
Account-level config.
- Threshold configuration (amber/red banding hours).
- Default "without undue delay" cap.
- Workspace member roles (owner/member) reference.
- Billing/plan view (all features free; Stripe optional, 503).

## Data Model (Tables)

- `incidents` — incident root.
- `incident_anchors` — timeline anchor events per incident.
- `incident_facts` — affected data categories / flags per incident.
- `jurisdictions` — jurisdiction registry.
- `rules` — breach-notification rule records (versioned).
- `regulators` — regulator directory.
- `obligations` — computed obligations per incident.
- `notice_artifacts` — draft/sent notices per obligation.
- `artifact_versions` — version history of artifact drafts.
- `signoffs` — approver sign-off records.
- `deliveries` — proof-of-delivery records.
- `contracts` — customer DPA contracts with promised windows.
- `contract_obligations` — contractual notice obligations per incident.
- `affected_populations` — per-jurisdiction affected counts per incident.
- `templates` — reusable notice templates.
- `tasks` — operational tasks.
- `notifications` — in-app user notifications.
- `comments` — threaded comments.
- `attachments` — evidence/document metadata.
- `activity_log` — append-only audit trail.
- `defensibility_packs` — generated immutable export records.
- `saved_views` — saved obligation-matrix views.
- `exposure_profiles` — pre-incident jurisdiction exposure declarations.
- `plans` — billing plans.
- `subscriptions` — per-user subscription.

## API Surface (high level)

- `/api/v1/incidents` — incident CRUD, anchors, facts, recompute.
- `/api/v1/jurisdictions` — jurisdiction registry reads.
- `/api/v1/rules` — rules library reads + admin CRUD.
- `/api/v1/regulators` — regulator directory.
- `/api/v1/obligations` — obligation matrix reads, status/owner updates.
- `/api/v1/artifacts` — notice artifact lifecycle + versions.
- `/api/v1/signoffs` — sign-off request/decision.
- `/api/v1/deliveries` — proof-of-delivery records.
- `/api/v1/contracts` — customer DPA registry + contractual obligations.
- `/api/v1/populations` — affected population counts.
- `/api/v1/templates` — notice templates.
- `/api/v1/tasks` — tasks + my-tasks.
- `/api/v1/notifications` — in-app notifications.
- `/api/v1/comments` — comments.
- `/api/v1/attachments` — attachments.
- `/api/v1/activity` — audit log.
- `/api/v1/packs` — defensibility packs.
- `/api/v1/views` — saved views.
- `/api/v1/exposure` — exposure profiles.
- `/api/v1/warroom` — countdown war-room aggregate.
- `/api/v1/analytics` — reporting metrics.
- `/api/v1/seed` — sample-incident/drill seeder.
- `/api/v1/billing` — plan view.

## Frontend Pages (~24)

Public:
1. `/` — landing (static marketing).
2. `/auth/sign-in` — sign in.
3. `/auth/sign-up` — sign up.
4. `/pricing` — pricing (all free).

Dashboard:
5. `/dashboard` — program overview / next deadlines.
6. `/dashboard/incidents` — incident list.
7. `/dashboard/incidents/new` — create incident.
8. `/dashboard/incidents/[id]` — incident detail (anchors, facts, recompute).
9. `/dashboard/incidents/[id]/matrix` — obligation matrix.
10. `/dashboard/incidents/[id]/warroom` — countdown war room.
11. `/dashboard/obligations/[id]` — obligation detail + artifacts.
12. `/dashboard/artifacts/[id]` — artifact editor + versions + sign-off + delivery.
13. `/dashboard/contracts` — customer DPA registry.
14. `/dashboard/populations` — affected population manager (within incident context, listed page).
15. `/dashboard/templates` — template library.
16. `/dashboard/rules` — rules library.
17. `/dashboard/jurisdictions` — jurisdiction registry.
18. `/dashboard/regulators` — regulator directory.
19. `/dashboard/tasks` — my tasks.
20. `/dashboard/notifications` — notification feed.
21. `/dashboard/packs` — defensibility packs.
22. `/dashboard/exposure` — jurisdiction exposure profile.
23. `/dashboard/analytics` — reporting & analytics.
24. `/dashboard/activity` — audit log.
25. `/dashboard/views` — saved views.
26. `/dashboard/settings` — settings & billing.
