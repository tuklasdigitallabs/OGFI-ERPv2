# DEC-0228 — Incident dashboard profiles

## Metadata

- Decision ID: `DEC-0228`
- Title: Versioned, server-owned Incident dashboard profiles
- Status: Confirmed
- Date: 2026-07-26
- Decision owner: Incident Management / Overview
- Decision Chair: Parent agent
- Related phase/module: Phase I Overview and Phase II Incident Management
- Related decision brief: Incident dashboard destination parity, 2026-07-26

## Decision

Incident Management exposes exactly four allowlisted, read-only dashboard profiles:
`incident-open-v1`, `incident-critical-v1`, `incident-pending-review-v1`, and
`incident-overdue-v1`. Each profile is a versioned server-owned incident-record
population, not a client-defined filter preset. Its dashboard count and destination
use the same exact session tenant, selected company, nullable selected brand, and
selected location predicates.

`incident-open-v1` contains incidents in `OPEN`, `IN_PROGRESS`, or
`PENDING_REVIEW`. `incident-critical-v1` contains every `CRITICAL` incident across
all statuses, including retained `RESOLVED` and `CANCELLED` history; it is a
historical severity lens, not an active-work count. `incident-pending-review-v1`
contains all scoped `PENDING_REVIEW` incidents and is an oversight view, not a claim
that the current actor owns or can act on every row.

`incident-overdue-v1` contains incidents whose `dueAt` is before a captured
operating-day cutoff, whose `resolvedAt` is null, and whose status is not
`CANCELLED`. The dashboard captures the operating date once and includes it as the
required `asOf=YYYY-MM-DD` parameter. The destination applies the same cutoff but
reads current records: later resolution, cancellation, correction, or newly entered
backdated incidents can therefore change the rows. It is not a historical snapshot.

While a profile is active, raw status, severity, and incident-date inputs are
ignored and cannot redefine membership. A normalized search of no more than 120
characters may only narrow the server-owned population. Missing, empty, duplicate,
invalid, or stale profile parameters fail visibly before data access. The overdue
profile requires exactly one valid, non-future `asOf`; other profiles reject
`asOf`. Profile mode is read-only: create and ordinary export controls are hidden,
and direct dashboard-profile export requests are rejected. Detail, back, and action
redirects preserve only canonical profile, search, page, and overdue-cutoff context;
every source action independently reauthorizes the live actor, selected scope,
record status, and action policy.

## Context

Overview already calculates scoped open, critical, pending-review, and overdue
Incident measures, but every card linked to the ordinary Incident register. That
register accepts general date, status, severity, search, create, and CSV-export
controls whose population and authority are broader than a closed dashboard
destination contract. The dashboard and list also differed in nullable-brand scope
handling. A shared exact-scope predicate and versioned profiles are required to keep
card and destination semantics aligned without granting workflow authority.

The existing Incident documents and service do not yet provide one reconciled
contract for correction authority, entry into `PENDING_REVIEW`, assignment, or
terminal-status/`resolvedAt` consistency. This decision does not select or invent
those policies. Profile membership remains read-only and policy-neutral while the
gaps stay open for owner confirmation and controlled reconciliation.

## Options considered

### Option A — selected: four versioned server-owned profiles

- Benefits: exact population and scope parity, retained critical history, explicit
  oversight semantics, stable operating-day overdue cutoff, bounded narrowing, and
  safe return continuity.
- Failure modes: predicates can drift, historical critical rows can be mistaken for
  active work, saved overdue links can be mistaken for snapshots, and profile rows
  can be mistaken for assigned or actionable work.
- Why selected: shared typed predicates, explicit labels, a required captured cutoff,
  minimal projections, and independent detail/action authorization mitigate those
  risks without changing Incident lifecycle policy.

### Option B — rejected: ordinary register with prefilled filters

- Benefits: fewer read contracts and familiar register controls.
- Failure modes: raw filters can redefine or widen the population, nullable-brand
  handling can diverge, invalid links can silently fall back, and create/export
  controls imply authority outside the dashboard contract.
- Why rejected: it does not provide a closed, auditable card-to-destination contract.

### Option C — rejected: active-only critical and actor-actionable review profiles

- Benefits: returned rows are more likely to have an immediate action.
- Failure modes: retained critical history disappears, actor permission changes the
  reporting population, and the dashboard becomes coupled to unresolved assignment
  and pending-review transition policy.
- Why rejected: Critical is a severity-history lens and Pending Review is scoped
  oversight; action eligibility remains authoritative on source detail.

### Option D — rejected: recompute overdue from the viewer's current day

- Benefits: saved links always show today's overdue population.
- Failure modes: the opened destination may not reconcile to the clicked card, and
  users cannot distinguish cutoff drift from current-record changes.
- Why rejected: a captured date-only cutoff gives deterministic card-to-link
  semantics while the required notice truthfully states that rows remain current.

## Hard-gate assessment

- Scope isolation: every profile requires exact session tenant, selected company,
  nullable selected brand, and selected location predicates.
- Server authorization: profile parsing, cutoff validation, scope, membership, and
  query bounds are server-owned; browser parameters cannot broaden them.
- Action authority: profiles are read-only. Detail actions retain independent live
  permission, scope, actor, status, and policy checks.
- Data truth: each row is one Incident record; profile populations can overlap and
  must not be added together. Critical includes terminal history. Overdue uses the
  locked due/status/resolution predicate without silently normalizing anomalies.
- Data minimization: profile lists expose only fields required to identify and triage
  the record; narrative, corrective-action, evidence, source-record ID, and audit
  content remain outside the list projection.
- Recovery: invalid links fail visibly, canonical return context survives record
  actions, and removing a profile version changes no source record.
- Phase discipline: no Incident state, assignment, inventory, finance, approval, or
  linked source record is mutated by these profiles.

## Required safeguards

- Keep all four identifiers in a server-owned allowlist and reject missing, empty,
  duplicate, invalid, or stale profile values before any profile query.
- Reuse one exact nullable-brand scope and membership contract across dashboard
  counts, bounded candidates, destination totals, and destination rows.
- Preserve `OPEN`/`IN_PROGRESS`/`PENDING_REVIEW` membership for Open;
  all-status `CRITICAL` membership for Critical; and `PENDING_REVIEW` oversight
  membership for Pending Review.
- Capture the operating date once for dashboard assembly. Require exactly one
  `YYYY-MM-DD` non-future `asOf` for Overdue, reject it for other profiles, and use
  `dueAt <` the UTC start of that operating date, `resolvedAt = null`, and
  `status != CANCELLED` exactly.
- Label the overdue cutoff and state that status, resolution, cancellation, and
  corrected due dates reflect current records; do not call the view a snapshot.
- Ignore raw status, severity, and incident-date inputs. Normalize and validate `q`,
  cap it at 120 characters, and allow it only as a narrowing condition.
- Hide create and ordinary export in profile mode; reject direct profile-export
  requests rather than exporting an ordinary broader population.
- Preserve only canonical profile, bounded search, page, and applicable cutoff
  through detail, back, and action redirects. Discard raw filters and open redirects.
- Keep list projection minimal. Detail access and every correction, resolve, and
  cancel command must reauthorize independently.
- Cover nullable-brand isolation, predicate parity, overlapping grains, terminal
  critical history, overdue midnight/cutoff cases, saved old links, later resolution,
  backdated creation, resolved/null-resolution anomalies, cancellation, due today,
  malformed/duplicate/missing/future cutoff, bounded search, hidden controls, export
  rejection, return continuity, and action reauthorization.
- Keep correction authority, pending-review entry, assignment, and terminal
  consistency gaps open until their owners confirm the authoritative contracts.

## Implementation and documentation impact

- Code / architecture: add typed Incident profile/cutoff parsing and shared exact
  scope/population predicates for dashboard and destination reads.
- Data / schema: no schema, incident-status, due-date, resolution, or source-record
  mutation. Existing inconsistent terminal rows remain visible under the exact
  profile predicate rather than being silently repaired.
- Workflow / permissions: no new authority and no change to correction, resolution,
  cancellation, assignment, self-action, or evidence policy.
- UI / mobile: cards open visibly profiled, paginated, read-only destinations with
  bounded search, minimal rows, hidden create/export, explicit invalid states, and
  canonical return navigation. Overdue shows the cutoff/current-record notice.
- Reporting: profiles are overlapping incident-record lenses, not additive KPIs;
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
| Align dashboard, Incident workflow/UI, decision index, open-gap register, and pending plan | Mithi | Current checkpoint | Complete |
| Reconcile correction authority, pending-review entry, assignment, and terminal consistency | Policy owner / Product / Engineering / Data | Before Incident production-readiness claim | Open policy/data-integrity gaps |
| Update user-facing guidance and release summary | Dunong | Before user-facing release | Pending handoff |
| Execute scope/parity cases on disposable PostgreSQL | QA / release owner | Before production-readiness claim | Open release gate |
| Verify authenticated desktop, tablet, and mobile navigation | QA / product owner | Before workspace completion | Open release gate |

## Evidence

- The Phase I Dashboard UI Specification requires widgets to open relevant scoped
  destinations rather than unauthoritative client-defined populations.
- The Incident workflow and UI specifications make the source record authoritative
  for correction, resolution, and cancellation and prohibit downstream mutation.
- Independent Product, Workflow, and Security deliberation accepted the four-profile
  design subject to exact nullable-brand scope, historical Critical semantics,
  oversight labeling, captured-cutoff/current-record disclosure, minimal projection,
  fail-closed parameters, export rejection, independent action authorization, and
  parity/navigation testing. Requested Code Spark and exact GPT-5.4 models were
  unavailable; the closest permitted GPT-5.6 specialists were used without relaxing
  hard gates.
- Local validation passes 84 focused Incident/dashboard/export tests and 20
  authorization-manifest tests; the complete non-database web suite passes 1,379
  tests across 127 files (302 skipped, 1 todo). Web and E2E typecheck, lint,
  production build, secret review, and diff hygiene pass. Independent QA and
  Security re-reviews returned GO with no remaining Critical, High, or Medium
  finding after predicate/count parity, least-disclosure search, truthful cutoff
  presentation, and missing triage context were corrected. The projects/operations
  authorization runner failed closed before database creation with
  `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`, so no PostgreSQL execution credit is
  claimed. Disposable PostgreSQL,
  authenticated responsive-browser, hosted deployment/recovery,
  production-authenticated E2E, and UAT evidence remain open.
- Coherent commit: the checkpoint commit containing this record; exact SHA verified
  after push.

## Supersession

Not superseded.
