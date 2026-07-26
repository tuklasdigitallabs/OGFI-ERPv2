# DEC-0236 — Branch critical-exceptions dashboard profile

## Metadata

- Decision ID: `DEC-0236`
- Title: Add an all-status Branch Operations critical-exception profile and suppress ambiguous standalone review-state signals
- Status: `Confirmed — implemented locally`
- Date: 2026-07-26
- Decision owner: Branch Operations / Overview
- Decision Chair: Parent agent
- Related phase/module: Phase I Overview and Phase II Branch Operations
- Related decision brief: Branch Operations critical and review-state dashboard signals, 2026-07-26

## Decision

Add exactly one Branch Operations dashboard profile:
`branch-checklist-critical-exceptions-v1`. Its primary metric is the exact number
of retained checklist lines whose severity is `CRITICAL` and result is `EXCEPTION`,
across every checklist status. The destination reports that critical-line total
and the distinct number of affected checklists as separate grains.

The card and destination share relation-safe tenant, selected company, optional
selected brand, and selected location predicates. The profile supports only
bounded search and server-owned pagination as narrowing controls. It is read-only;
source-record actions independently reauthorize the live actor, scope, status, and
record.

Suppress the standalone Overview signals backed by
`branch-manager-review-count` and `branch-reviewed-count`. Preserve the combined
Reviews card and `branch-checklist-reviews-v1` profile confirmed by `DEC-0226`.
`Manager Review` is redundant with that profile, and its `waiting` copy conflicts
with the fact that manager review has already started. `Reviewed` is an
intermediate state that excludes `CLOSED`; without a confirmed period, owner, and
close-policy definition, it is not an authoritative completion metric.

On tablet widths below `lg`, render the relevant signals as cards. Use the truthful
actor label `Reviewed by`, and show the selected-brand badge when a brand is
selected. This decision changes no schema, permission, workflow, action, or export
contract.

## Context

Overview already exposes combined review oversight and all-severity exception-line
profiles. It also has a bounded critical-exception aggregate, but no exact closed
destination for that line-grain count. Separately exposing Manager Review and
Reviewed state counts would duplicate or misstate operational meaning: the former
is already inside combined review oversight, while the latter cannot represent
completed work because closed records are excluded.

The new profile closes only the critical-line drilldown gap. It does not create a
new task population, redefine review or close eligibility, or turn historical
critical lines into current actor obligations.

## Options considered and challenge positions

### Option A — selected: add only the critical-line profile and suppress both standalone state signals

- Position: retain the useful all-status critical severity lens, preserve the
  existing combined Reviews profile, and remove state-only cards that lack distinct
  authoritative meaning.
- Why it works: it gives the existing critical-line aggregate an exact destination,
  keeps line and checklist grains explicit, and avoids implying that an intermediate
  state is completion or assignment.
- Likely failure modes: predicates can drift between card and destination; critical
  lines can be mislabeled as checklists; all-status membership can be mistaken for
  open work; source actions can be inferred from read access.
- Safeguards: one shared scoped predicate, separate line/checklist totals, explicit
  all-status/read-only copy, independent action authorization, bounded narrowing,
  and parity tests.

### Option B — challenged and rejected: retain standalone Manager Review

- Strongest argument: it exposes a recognizable source status and could help users
  isolate a stage within the review population.
- Most likely failure mode: it duplicates the combined Reviews card/profile and the
  word `waiting` falsely implies review has not begun even though `MANAGER_REVIEW`
  denotes started-review semantics.
- Evidence that would weaken the rejection: a confirmed, non-overlapping operational
  obligation and copy definition not already represented by combined Reviews.
- Required safeguard if reconsidered: a distinct source-owned population, purpose,
  destination, and action-authority contract.
- Severity: **Serious but manageable** through suppression; no such distinct contract
  is confirmed.

### Option C — challenged and rejected: retain standalone Reviewed as a completion signal

- Strongest argument: it exposes how many checklists reached review outcome.
- Most likely failure mode: `REVIEWED` is intermediate and excludes `CLOSED`, so the
  value can fall as work advances and cannot truthfully describe completed work.
- Evidence that would weaken the rejection: a confirmed reporting period, owner,
  reviewed-versus-closed grain, and close-policy definition.
- Required safeguard if reconsidered: a versioned period-aware profile whose exact
  lifecycle semantics and destination parity are approved.
- Severity: **Blocking** for any completion or throughput claim.

### Option D — rejected: add critical plus new standalone Manager Review and Reviewed profiles

- Benefits: more visible source-state counts.
- Failure modes: dashboard duplication, misleading stage semantics, extra profile
  surface, and unconfirmed reporting policy.
- Why rejected: only the critical-line destination has a confirmed distinct metric.

## Hard-gate assessment

- Scope isolation: use exact tenant, company, nullable-brand, and location ownership
  through relations; no client scope override may widen the population.
- Server authorization: profile visibility grants no new permission. The destination
  uses the existing protected Branch Operations read boundary.
- Action authority: profile membership grants no review, return, correction, close,
  create, or export authority. Source detail actions reauthorize independently.
- Data truth: count retained `EXCEPTION` + `CRITICAL` lines across all checklist
  statuses and separately count affected checklists; do not conflate the grains.
- Consistency: dashboard count, destination total, rows, and bounded search reuse one
  versioned server-owned predicate; stale or invalid identifiers fail visibly.
- Recovery: suppression and profile removal are non-mutating and reversible; source
  checklists, lines, history, and permissions remain unchanged.
- Phase discipline: no schema, workflow, permission, approval, inventory, finance,
  incident, maintenance, notification, or export expansion is authorized.

## Required safeguards and tests

- Add only `branch-checklist-critical-exceptions-v1` to the existing profile
  allowlist; preserve the two `DEC-0226` profiles. Unknown, duplicate, empty, stale,
  or widening profile inputs fail visibly.
- Require exact `result = EXCEPTION` and `severity = CRITICAL` line membership across
  all checklist statuses; do not add an open-status predicate.
- Enforce relation-safe tenant, selected-company, optional-brand, and selected-location
  ownership on every count and page query.
- Report `Critical exception lines` and `Affected checklists` separately.
- Cap and normalize search so it may only narrow; use deterministic server paging.
- Hide create and ordinary export in profile mode. Keep source navigation and every
  source action independently authorized.
- Remove `branch-manager-review-count` and `branch-reviewed-count` presentation and
  preserve the existing combined Reviews card/profile unchanged.
- Verify selected-brand badge, `Reviewed by` copy, tablet-card behavior through
  widths below `lg`, empty/error/denied states, mobile usability, and canonical
  return navigation.
- Cover exact all-status predicate, line-versus-checklist totals, nullable-brand and
  cross-scope denial, bounded search/page parity, no mutation, and absent standalone
  signals in focused and disposable-PostgreSQL tests.

## Implementation and documentation impact

- Code / architecture: add one typed profile and shared critical-line count/page
  predicate; suppress two standalone Overview presentation signals.
- Data / schema: no schema, migration, index, backfill, or source-data change.
- Workflow / permissions: no review, correction, close, role, or scope-authority
  change.
- UI / responsive: add the read-only critical profile, tablet cards below `lg`,
  selected-brand context, and truthful reviewer labeling; retain combined Reviews.
- Reporting: add an exact all-status critical-line lens with affected-checklist
  context. Do not add or change export behavior.
- Knowledge base / training: Dunong must assess dashboard guidance and the end-user
  release summary after implementation behavior is verified.
- Tests / UAT: focused source tests, complete non-database regression, typecheck,
  lint, E2E typecheck, production build, authorization-manifest, secret, diff, and
  independent data/security and UX review gates pass. Authenticated responsive
  browser, PostgreSQL execution, hosted, recovery, and UAT evidence remain open
  workspace/release gates.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the critical-line profile and suppress standalone state signals | Parent implementation agent | Current checkpoint | Complete locally |
| Verify focused source, parity, authorization, and diff gates | QA / Security / UX | Before source-completion claim | Complete locally; PostgreSQL execution unavailable |
| Update user-facing help and release summary | Dunong | After verified implementation | Complete |
| Execute disposable-PostgreSQL, hosted, recovery, and UAT evidence | QA / Release owner | Before workspace completion | Open release gate |
| Deliberate any future Reviewed period/owner/close-policy metric | Product / Reporting / Operations | Before reintroduction | Unapproved / blocked |

## Evidence and model fallback

- The Decision Chair confirmed Option A after independent challenge positions
  identified redundancy, started-review wording conflict, intermediate-state
  ambiguity, count-grain risk, and authorization/parity safeguards.
- The exact requested Code Spark and GPT-5.4 subagent models were unavailable in the
  active toolset. The closest permitted GPT-5.6 specialist fallbacks were used for
  the material deliberation; the fallback did not relax any hard gate.
- `DEC-0226` remains authoritative for the combined Reviews and all-exception
  profiles. This decision supplements it with one critical-severity profile and
  suppresses only the ambiguous standalone state signals.
- Implementation evidence: the profile, exact relation-safe count/page/search
  predicates, scope-filtered child-line projections, visible invalid-parameter
  recovery, canonical navigation, responsive profile presentation, and signal
  suppression are implemented. Focused service tests pass 57/57; the complete
  non-database web suite passes 1,416 tests with 305 skipped and one existing TODO
  across 129 passed/11 skipped files. Web typecheck, lint, E2E typecheck,
  production build, secret review, the 20/20 authorization manifest, and
  `git diff --check` pass. Independent Data/Security and UX re-reviews returned
  **GO**, each with C0/H0/M0/L0.
- The disposable Projects/Operations authorization runner was attempted and
  failed closed before database creation with
  `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`; no PostgreSQL execution credit is
  claimed. Authenticated responsive-browser/E2E, hosted deployment/recovery, and
  UAT evidence remain open and continue to block wider workspace and phase
  completion.

## Supersession

Not superseded. This decision supplements `DEC-0226`; it does not change that
decision's combined Reviews or Exceptions populations.
