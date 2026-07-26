# DEC-0237 — Food Safety critical-exceptions dashboard profile

## Metadata

- Decision ID: `DEC-0237`
- Title: Add an all-status Food Safety critical-exception profile and suppress ambiguous standalone review-state signals
- Status: `Confirmed — implemented locally`
- Date: 2026-07-26
- Decision owner: Food Safety / Overview
- Decision Chair: Parent agent
- Related phase/module: Phase I Overview and Phase II Food Safety
- Related decision brief: Food Safety critical and review-state dashboard signals, 2026-07-26

## Decision

Add exactly one Food Safety dashboard profile:
`food-safety-critical-exceptions-v1`. Its primary metric is the exact number of
retained readings whose result is `EXCEPTION` and severity is `CRITICAL`, across
every Food Safety log status. The destination reports that critical-reading total
and the distinct number of affected Food Safety logs as separate grains.

The card and destination share relation-safe tenant, selected company, optional
selected brand, and selected location predicates on both parent logs and child
readings. The profile supports only bounded search and server-owned pagination as
narrowing controls. It is read-only; source-record actions independently
reauthorize the live actor, scope, status, and record.

Suppress the standalone Overview signals backed by
`food-safety-exception-review-count` and `food-safety-reviewed-count`. Preserve
the combined Reviews card and `food-safety-reviews-v1` profile confirmed by
`DEC-0227`, together with the all-severity `food-safety-exceptions-v1` profile.
`Exception Review` is already represented by combined review oversight and its
`waiting` wording conflicts with started-review semantics. `REVIEWED` is an
intermediate state that excludes `CLOSED`; without a confirmed period, owner, and
close-policy definition, it is not an authoritative completion metric.

This decision changes no schema, permission, workflow, action, export, or
notification contract. It does not select or reconcile the known Phase II
Food Safety workflow-catalog/live-service discrepancy.

## Context

Overview exposes combined review oversight and all-severity exception history,
and has a bounded critical-reading aggregate without an exact closed destination.
The new profile closes only that critical-reading drilldown gap. It must not
mislabel reading-grain data as logs, turn historical readings into current actor
obligations, or infer workflow authority from read access.

The existing policy catalog and live Food Safety service differ in review, return,
close, and evidence contracts. The new profile remains policy-neutral and
read-only so it neither obscures nor resolves that separately governed gap.

## Options considered and challenge positions

### Option A — selected: add only the critical-reading profile and suppress both standalone state signals

- Why it works: gives the existing critical-reading aggregate an exact destination,
  keeps reading and log grains explicit, and avoids presenting ambiguous
  intermediate states as distinct operational measures.
- Likely failure modes: parent/child predicates can drift; readings can be
  mislabeled as logs; all-status history can be mistaken for actionable work; a
  profile can be widened by raw parameters.
- Safeguards: one relation-safe scoped predicate, separate reading/log totals,
  explicit all-status/read-only copy, closed parameters, independent action
  authorization, and parity tests.

### Option B — rejected: retain standalone Exception Review

- Strongest argument: it exposes a recognizable source status.
- Failure mode: it duplicates the retained combined Reviews population and implies
  waiting even though `EXCEPTION_REVIEW` denotes a started review state.
- Evidence that would weaken rejection: a confirmed non-overlapping obligation,
  purpose, and destination not already served by Reviews.
- Safeguard if reconsidered: a source-owned population and approved action/copy
  contract.
- Severity: **Serious but manageable** through suppression.

### Option C — rejected: retain standalone Reviewed as a completion signal

- Strongest argument: it exposes logs that reached review outcome.
- Failure mode: `REVIEWED` excludes `CLOSED`, so its value is neither a stable
  completion nor throughput measure.
- Evidence that would weaken rejection: a confirmed reporting period, owner,
  reviewed-versus-closed grain, and close-policy definition.
- Safeguard if reconsidered: a versioned, period-aware profile with approved
  lifecycle semantics and destination parity.
- Severity: **Blocking** for a completion or throughput claim.

### Option D — rejected: create profiles for all three signals

- Benefits: more visible status counts.
- Failure modes: duplicate dashboard surface, misleading state semantics, and
  new unconfirmed reporting policy.
- Why rejected: only the critical-reading signal has a confirmed distinct metric
  and closed drilldown need.

## Hard-gate assessment

- Scope isolation: parent logs and child readings use exact relation-safe tenant,
  company, nullable-brand, and location ownership; no client input widens scope.
- Server authorization: profile parsing, membership, search bounds, and paging are
  server-owned and reuse the protected Food Safety read boundary.
- Action authority: membership grants no create, review, return, correction,
  close, or export authority; source detail reauthorizes every action.
- Data truth: count retained `EXCEPTION` + `CRITICAL` readings across all statuses
  and separately count affected logs; do not conflate the two grains.
- Consistency: dashboard count, destination total, rows, and bounded search reuse
  one versioned predicate; invalid, duplicate, empty, stale, or widening inputs
  fail visibly.
- Recovery: suppressing signals or removing this profile is non-mutating;
  source logs, readings, history, and permissions remain unchanged.
- Phase discipline: no schema, workflow, permission, approval, inventory, wastage,
  incident, finance, notification, or export expansion is authorized.

## Required safeguards and tests

- Add only `food-safety-critical-exceptions-v1` to the existing allowlist; retain
  `food-safety-reviews-v1` and `food-safety-exceptions-v1` unchanged.
- Require exact `result = EXCEPTION` and `severity = CRITICAL` reading membership
  across every log status; do not add an open-status predicate.
- Enforce parent-and-child relation-safe tenant, selected-company, optional-brand,
  and selected-location ownership on every count, page, projection, and search.
- Report `Critical exception readings` and `Affected logs` separately.
- Permit only capped normalized search and deterministic server paging; reject raw
  log type, status, business date, scope, duplicate, empty, stale, and unknown
  profile parameters in profile mode.
- Hide create and ordinary export in profile mode. Keep source navigation and each
  source action independently authorized.
- Remove the two standalone Overview presentation signals and retain the combined
  Reviews and all-severity Exceptions profiles.
- Verify selected-brand context, tablet-card behavior below `lg`, empty/error/
  denied states, mobile usability, and canonical return navigation.
- Cover exact all-status predicate, reading-versus-log totals, nullable-brand and
  cross-scope denial, parent/child scope mismatch, bounded search/page parity,
  no mutation, and absent standalone signals in focused and disposable-PostgreSQL
  tests.

## Implementation and documentation impact

- Code / architecture: add one typed profile and shared relation-safe
  critical-reading count/page/search predicate; suppress two Overview signals.
- Data / schema: no schema, migration, index, backfill, or source-data change.
- Workflow / permissions: no review, correction, close, role, or scope-authority
  change; the catalog/live-service discrepancy remains open.
- UI / responsive: add a read-only critical profile with truthful grains and
  selected-scope context; retain existing Reviews and Exceptions profiles.
- Reporting: add an exact all-status critical-reading lens with affected-log
  context. Do not add or change export behavior.
- Knowledge base / training: Dunong must assess dashboard guidance and the
  end-user release summary after implementation behavior is verified.
- Tests / UAT: focused source tests, complete non-database regression, typecheck,
  lint, E2E typecheck, production build, authorization-manifest, secret, diff,
  and independent data/security and UX review gates pass. PostgreSQL,
  authenticated browser, hosted recovery, and UAT evidence remain wider release
  gates.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement profile, shared predicates, signal suppression, and visible profile state | Parent implementation agent | Current checkpoint | Complete locally |
| Align Overview, Food Safety workflow/UI/reporting, decision index, and pending plan | Mithi | Current checkpoint | Complete |
| Reconcile Phase II workflow catalog and live-service contracts | Policy owner / Product / Engineering | Before workflow production-readiness claim | Open policy/implementation gap |
| Update user-facing guidance and release summary | Dunong | After final behavior evidence | Complete |
| Execute scope/parity cases on disposable PostgreSQL | QA / release owner | Before production-readiness claim | Open release gate |
| Verify authenticated desktop, tablet, and mobile navigation | QA / product owner | Before workspace completion | Open release gate |

## Evidence

- The Phase I Dashboard UI Specification requires every KPI/widget to have a
  scoped, authoritative destination and prohibits unauthorized client-defined
  populations.
- `DEC-0227` supplies the retained Reviews and all-severity Exceptions profile
  contracts; this decision supplements rather than replaces them.
- The Food Safety workflow and UI specifications make source records authoritative
  for review/correction actions and prohibit dashboard mutation.
- The known workflow catalog/live-service discrepancy remains open, so no profile
  can claim to normalize policy or action eligibility.
- The parent-led independent deliberation reached consensus on the single
  critical-reading profile subject to exact relation-safe parity, truthful grain,
  all-status retained-source meaning, closed parameters, hidden create/export, independent action
  authorization, and navigation/parity testing. Requested Code Spark and exact
  GPT-5.4 were unavailable in the active toolset; closest permitted GPT-5.6
  specialist fallbacks were used without relaxing hard gates.
- Focused Food Safety/dashboard coverage passes 57/57. The complete non-database
  web suite passes 1,418 tests with 305 skipped and one existing TODO across 129
  passed/11 skipped files. Web typecheck, lint, E2E typecheck, production build,
  secret review, the 20/20 authorization manifest, and `git diff --check` pass.
  Data/Security final review returned **GO** with C0/H0/M0/L0. UX initially
  returned NO-GO with C0/H0/M1 for a profile-badge grain mismatch; after profile-
  aware narrowed totals remediated it, final UX review returned **GO** with
  C0/H0/M0/L0.
- The disposable Projects/Operations runner was attempted and failed closed before
  database creation with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`; no PostgreSQL
  execution credit is claimed. Authenticated responsive-browser/E2E, hosted
  deployment/recovery, UAT, and the known Food Safety workflow-catalog/live-service
  policy reconciliation remain open. This local implementation does not complete
  Overview, Food Safety, Workspace 1, or Phase I.

## Supersession

Not superseded. This decision supplements `DEC-0227`; it does not change that
decision's Reviews or all-severity Exceptions populations.
