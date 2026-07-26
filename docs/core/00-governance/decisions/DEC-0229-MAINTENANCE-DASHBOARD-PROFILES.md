# DEC-0229 — Maintenance dashboard profiles

## Metadata

- Decision ID: `DEC-0229`
- Title: Versioned, server-owned Maintenance dashboard profiles
- Status: Confirmed
- Date: 2026-07-26
- Decision owner: Maintenance Management / Overview
- Decision Chair: Parent agent
- Related phase/module: Phase I Overview and Phase II Maintenance Management
- Related decision brief: Maintenance dashboard destination parity, 2026-07-26

## Decision

Maintenance Management exposes exactly four allowlisted, read-only dashboard
profiles: `maintenance-follow-up-v1`, `maintenance-critical-v1`,
`maintenance-pending-vendor-v1`, and `maintenance-overdue-v1`. Each profile is a
versioned, server-owned maintenance-ticket population, not a client-defined filter
preset. Its dashboard count and destination use the same exact session tenant,
selected company, nullable selected brand, and selected location predicates.

`maintenance-follow-up-v1` contains tickets in `OPEN`, `IN_PROGRESS`, or
`PENDING_VENDOR`. `maintenance-critical-v1` contains every `CRITICAL` ticket across
all statuses, including retained `COMPLETED` and `CANCELLED` history; it is a
historical priority lens, not an active-work count. `maintenance-pending-vendor-v1`
contains all scoped `PENDING_VENDOR` tickets and is an oversight view, not a claim
that the current actor owns, is the vendor contact for, or can act on every row.

`maintenance-overdue-v1` contains tickets whose `targetDueAt` is before a captured
operating-day cutoff, whose `completedAt` is null, and whose status is one of
`OPEN`, `IN_PROGRESS`, or `PENDING_VENDOR`. The active-status whitelist
intentionally excludes cancelled tickets and completed tickets with inconsistent
null `completedAt` values, correcting the earlier dashboard overdue defect without
silently repairing stored data. The dashboard captures the operating date once and
includes it as the required `asOf=YYYY-MM-DD` parameter. The destination applies
the same cutoff but reads current records: later completion, cancellation,
correction, or newly entered backdated tickets can therefore change the rows. It is
not a historical snapshot.

While a profile is active, raw status, priority, and requested-date inputs are
ignored and cannot redefine membership. A normalized search of no more than 120
characters may only narrow the server-owned population through visible ticket
metadata. Missing, empty, duplicate, invalid, or stale profile parameters fail
visibly before data access. The overdue profile requires exactly one valid,
non-future `asOf`; other profiles reject `asOf`. Profile mode is read-only: create
and ordinary export controls are hidden, and direct dashboard-profile export
requests are rejected. Detail, back, and action redirects preserve only canonical
profile, search, page, and overdue-cutoff context; every source action independently
reauthorizes the live actor, selected scope, record status, and action policy.

The linked source Incident identifier is excluded from profile projections. A
source-Incident link may be shown from authoritative detail only when the actor has
permission for that source, and the Incident destination reauthorizes independently.

## Context

Overview already calculates scoped follow-up, critical, pending-vendor, and overdue
Maintenance measures, but the cards did not yet have one closed destination
contract. The ordinary register accepts general requested-date, status, priority,
search, create, and CSV-export controls whose population and authority are broader
than a dashboard destination. The earlier overdue calculation could also include a
cancelled ticket or a completed ticket with a null `completedAt`, contradicting the
active follow-up meaning. Shared exact-scope predicates and versioned profiles are
required to keep card and destination semantics aligned without granting workflow
authority.

Maintenance documentation and implementation do not yet define complete assignment,
vendor-state transition, terminal reopen, terminal status/date integrity, or
authoritative operating-timezone policy. This decision does not invent those
policies. Profile membership remains read-only and policy-neutral while the gaps
stay open for owner confirmation and controlled reconciliation.

## Options considered

### Option A — selected: four versioned server-owned profiles

- Benefits: exact population and scope parity, retained critical history, explicit
  vendor oversight, deterministic active-only overdue semantics, bounded narrowing,
  and safe return continuity.
- Failure modes: predicates can drift, historical critical rows can be mistaken for
  active work, saved overdue links can be mistaken for snapshots, and oversight
  rows can be mistaken for assigned or actionable work.
- Why selected: shared typed predicates, explicit labels, a captured cutoff, minimal
  projections, and independent detail/action authorization mitigate those risks
  without changing Maintenance lifecycle policy.

### Option B — rejected: ordinary register with prefilled filters

- Benefits: fewer read contracts and familiar register controls.
- Failure modes: raw filters can redefine or widen the population, invalid links can
  silently fall back, and create/export controls imply authority outside the
  dashboard contract.
- Why rejected: it does not provide a closed, auditable card-to-destination contract.

### Option C — rejected: active-only Critical and actor-actionable Vendor profiles

- Benefits: returned rows are more likely to have an immediate action.
- Failure modes: retained critical history disappears, actor permission changes the
  reporting population, and the dashboard becomes coupled to unresolved assignment
  and vendor workflow policy.
- Why rejected: Critical is a priority-history lens and Pending Vendor is scoped
  oversight; action eligibility remains authoritative on source detail.

### Option D — rejected: broad null-completion overdue predicate

- Benefits: preserves the earlier simple `targetDueAt`/`completedAt` calculation.
- Failure modes: cancelled and malformed completed tickets can appear as active
  overdue obligations, making the dashboard operationally misleading.
- Why rejected: the exact active-status whitelist truthfully represents follow-up
  work while preserving inconsistent terminal records for separate reconciliation.

## Hard-gate assessment

- Scope isolation: every profile requires exact session tenant, selected company,
  nullable selected brand, and selected location predicates.
- Server authorization: profile parsing, cutoff validation, scope, membership, and
  query bounds are server-owned; browser parameters cannot broaden them.
- Action authority: profiles are read-only. Detail actions retain independent live
  permission, scope, actor, status, and policy checks.
- Data truth: each row is one Maintenance ticket; profile populations can overlap
  and must not be added together. Critical includes terminal history. Overdue uses
  the active whitelist and does not rewrite inconsistent source rows.
- Data minimization: profile search and rows use only visible triage metadata; source
  Incident ID, corrective-action narrative, evidence, downtime detail, and audit
  content remain outside the list projection.
- Recovery: invalid links fail visibly, canonical return context survives record
  actions, and removing a profile version changes no source record.
- Phase discipline: no Maintenance status, assignment, vendor, Incident, inventory,
  finance, purchasing, or approval record is mutated by these profiles.

## Required safeguards

- Keep all four identifiers in a server-owned allowlist and reject missing, empty,
  duplicate, invalid, or stale profile values before any profile query.
- Reuse one exact nullable-brand scope and membership contract across dashboard
  counts, bounded candidates, destination totals, and destination rows.
- Preserve active `OPEN`/`IN_PROGRESS`/`PENDING_VENDOR` membership for Follow-up;
  all-status `CRITICAL` membership for Critical; and `PENDING_VENDOR` oversight
  membership for Pending Vendor.
- Capture the operating date once for dashboard assembly. Require exactly one
  `YYYY-MM-DD` non-future `asOf` for Overdue, reject it for other profiles, and use
  `targetDueAt <` the UTC start of that operating date, `completedAt = null`, and
  the exact active-status whitelist.
- Label the overdue cutoff and state that status, completion, cancellation, and
  corrected target dates reflect current records; do not call the view a snapshot.
- Ignore raw status, priority, and requested-date inputs. Normalize and validate
  `q`, cap it at 120 characters, and search only visible metadata.
- Hide create and ordinary export in profile mode; reject direct profile-export
  requests rather than exporting an ordinary broader population.
- Preserve only canonical profile, bounded search, page, and applicable cutoff
  through detail, back, and action redirects. Discard raw filters and open redirects.
- Keep profile projection minimal and exclude source Incident ID. Permission-gate
  any source link on detail and independently reauthorize its destination.
- Cover nullable-brand isolation, count/predicate parity, overlapping grains,
  terminal critical history, active-only overdue behavior, cutoff midnight, saved
  old links, later completion/cancellation/correction, backdated creation, malformed
  terminal rows, due-today exclusion, malformed/duplicate/missing/future cutoff,
  bounded visible-field search, hidden controls, export rejection, return continuity,
  source-link disclosure, and action reauthorization.
- Keep assignment, vendor transition, terminal reopen, status/date integrity, and
  authoritative timezone gaps open until their owners confirm the contracts.

## Implementation and documentation impact

- Code / architecture: add typed Maintenance profile/cutoff parsing and shared exact
  scope/population predicates for dashboard and destination reads.
- Data / schema: no schema, status, target-date, completion-date, or source-Incident
  mutation. Existing inconsistent terminal rows remain available for reconciliation.
- Workflow / permissions: no new authority and no change to correction, completion,
  cancellation, assignment, vendor, self-action, or evidence policy.
- UI / mobile: cards open visibly profiled, paginated, read-only destinations with
  bounded search, minimal rows, hidden create/export, explicit invalid states, and
  canonical return navigation. Overdue shows the cutoff/current-record notice.
- Reporting: profiles are overlapping maintenance-ticket lenses, not additive KPIs;
  ordinary filtered CSV remains a separate authorized reporting workflow.
- Knowledge base / training: Dunong must explain the four profiles, oversight versus
  actionable work, critical history, overlapping populations, overdue cutoff/current
  records, read-only controls, and source-detail reauthorization.
- Tests / UAT: validate exact parity and responsive navigation with seeded roles and
  scopes; external database, browser, hosted, recovery, and UAT gates remain open.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the four allowlisted profile destinations and shared predicates | Parent implementation agent | Current checkpoint | Complete locally |
| Align dashboard, Maintenance workflow/UI, decision index, open-gap register, and pending plan | Mithi | Current checkpoint | Complete |
| Reconcile assignment, vendor transitions, reopen, status/date integrity, and timezone policy | Policy owner / Product / Engineering / Data | Before Maintenance production-readiness claim | Open policy/data-integrity gaps |
| Update user-facing guidance and release summary | Dunong | Before user-facing release | Complete |
| Execute scope/parity cases on disposable PostgreSQL | QA / release owner | Before production-readiness claim | Open release gate |
| Verify authenticated desktop, tablet, and mobile navigation | QA / product owner | Before workspace completion | Open release gate |

## Evidence

- The Phase I Dashboard UI Specification requires widgets to open relevant scoped
  destinations rather than unauthoritative client-defined populations.
- The Maintenance workflow and UI specifications make the source ticket
  authoritative for correction, completion, and cancellation and prohibit
  downstream mutation.
- Parent-led specialist deliberation confirmed the four-profile design subject to
  exact nullable-brand scope, historical Critical
  semantics, Pending Vendor oversight labeling, active-only captured-cutoff overdue
  semantics, minimal visible-field projection, fail-closed parameters, export
  rejection, independent action/source-link authorization, and parity/navigation
  testing. Requested Code Spark and exact GPT-5.4 models were unavailable; the
  closest permitted GPT-5.6 specialists were used without relaxing hard gates.
- Local validation evidence: the combined Maintenance, Incident regression,
  dashboard, export, and authorization-manifest suite passes `167/167`; the full
  non-database web suite passes `1,389` tests across `127` files with `302` skipped
  and one TODO. Web and E2E typecheck, web lint, production build, secret review,
  and diff hygiene pass. Independent QA and Security re-reviews returned GO with
  no remaining Critical, High, or Medium finding after company-level nullable-brand
  normalization, source-Incident projection/reauthorization, return continuity,
  and touch-target evidence were corrected. The projects/operations disposable-
  PostgreSQL runner was attempted and failed closed before database creation with
  `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`; no PostgreSQL, authenticated responsive-
  browser, hosted deployment/recovery, production-authenticated E2E, or UAT credit
  is claimed here.
- Coherent commit: the checkpoint commit containing this record; its exact SHA is
  verified after push.

## Supersession

Not superseded.
