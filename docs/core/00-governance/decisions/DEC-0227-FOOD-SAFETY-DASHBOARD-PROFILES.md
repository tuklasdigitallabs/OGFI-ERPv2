# DEC-0227 — Food Safety dashboard profiles

## Metadata

- Decision ID: `DEC-0227`
- Title: Versioned, server-owned Food Safety dashboard profiles
- Status: Confirmed
- Date: 2026-07-26
- Decision owner: Food Safety / Overview
- Decision Chair: Parent agent
- Related phase/module: Phase I Overview and Phase II Food Safety
- Related decision brief: Food Safety dashboard destination parity, 2026-07-26

## Decision

Food Safety exposes exactly two allowlisted, read-only dashboard profiles:
`food-safety-exceptions-v1` and `food-safety-reviews-v1`. A profile is a
versioned server-owned population, not a client-defined filter preset. Its card
and destination use the same exact session tenant, selected company, optional
selected brand, and selected location predicates.

`food-safety-reviews-v1` includes the complete scoped oversight population in
`SUBMITTED` or `EXCEPTION_REVIEW`. Profile membership does not assert that the
current actor can review, return, close, or otherwise act on every row.

`food-safety-exceptions-v1` preserves two different grains: the card value is the
sum of exception readings, while the destination contains affected Food Safety
logs whose stored `exceptionCount` is greater than zero. The exception profile
includes all statuses and retained history; terminal records do not disappear
merely because no current action is available.

While either profile is active, raw type, status, and business-date inputs are
ignored and cannot widen or redefine membership. A normalized search of no more
than 120 characters may only narrow the server-owned population. Invalid or
stale profile identifiers fail visibly instead of falling back to the ordinary
register. Create and export controls are hidden. Detail and back navigation
preserve only canonical profile context, and every source action independently
reauthorizes the live actor, selected scope, record status, and action policy.

## Context

Overview already derives bounded Food Safety counts and candidates, but its cards
did not have closed source destinations guaranteed to preserve their definitions.
The ordinary register accepts broad type, status, date, and export controls. It
also lists log rows, whereas the exception card measures exception readings.
Without an explicit profile contract, raw filters can produce a different
population and a log-row destination can misleadingly appear to reconcile to a
reading-grain card.

The existing version-controlled Phase II workflow policy catalog and live Food
Safety service also differ in their review, return, close, and evidence contracts.
This decision does not select between those policies or use dashboard membership
to normalize them. That discrepancy remains open for separate policy-owner
confirmation and controlled service/catalog reconciliation.

## Options considered

### Option A — selected: two versioned server-owned profiles

- Benefits: exact scope and population parity; truthful reading-versus-log grains;
  retained historical exceptions; bounded narrowing; no implied action authority.
- Failure modes: dashboard and destination predicates may drift, oversight may be
  mistaken for assigned work, and exception reading totals may be confused with
  affected-log counts.
- Why selected: one shared typed predicate contract, explicit grain labels,
  versioned identifiers, and independent detail authorization mitigate those risks
  without changing Food Safety workflow policy.

### Option B — rejected: ordinary register with prefilled filters

- Benefits: fewer server read contracts and familiar register controls.
- Failure modes: client status/type/date inputs can redefine the population,
  invalid links can silently fall back, export/create controls imply authority, and
  reading-grain exception totals cannot reconcile to log-row pages.
- Why rejected: it does not provide a closed or auditable card-to-destination
  contract.

### Option C — rejected: actionable-only review and active-only exceptions

- Benefits: returned rows are more likely to have an immediate action.
- Failure modes: actor permission changes the oversight population, terminal
  exception history disappears, and dashboard reporting becomes coupled to the
  unresolved workflow policy discrepancy.
- Why rejected: the confirmed profiles are scoped oversight/history views, while
  action eligibility remains authoritative on the source detail.

## Hard-gate assessment

- Scope isolation: both profiles require the exact session tenant, selected
  company, nullable brand, and selected location predicates used by dashboard
  reads.
- Server authorization: profile parsing, scope, membership, and query bounds are
  server-owned; browser parameters cannot expand them.
- Action authority: profiles are read-only. Detail actions retain independent live
  permission, scope, actor, status, and policy checks.
- Data truth: Reviews reports scoped log rows. Exceptions separately exposes the
  sum of exception readings and the affected-log count.
- History: the exception population includes every status where
  `exceptionCount > 0`; no profile action mutates or removes historical logs.
- Recovery: invalid/stale profiles visibly fail, canonical profile context is
  retained for return navigation, and removing a profile version changes no source
  record.
- Phase discipline: no inventory, wastage, incident, approval, or finance effect;
  no implicit resolution of the existing workflow catalog/service discrepancy.

## Required safeguards

- Keep the two versioned identifiers in a server-owned allowlist and reject unknown
  values without ordinary-register fallback.
- Reuse one exact selected-scope and profile-membership contract across card count,
  bounded candidates, destination totals, and destination rows.
- Fix Reviews membership to all scoped `SUBMITTED` and `EXCEPTION_REVIEW` logs and
  label it as oversight, not actor-assigned or immediately actionable work.
- Fix Exceptions membership to logs with `exceptionCount > 0` in every status.
  Preserve the card's summed exception-reading value and report affected logs as a
  separate number.
- Ignore raw type, status, and business-date inputs while a profile is active.
  Normalize and validate `q`, cap it at 120 characters, and use it only to narrow.
- Hide create and export controls in both profiles. Profile membership must not
  confer record access or workflow authority.
- Preserve a canonical allowlisted profile/search/page return context; discard raw
  filter and open-redirect input.
- Cover invalid/stale profiles, forged scope/filter widening, nullable-brand scope,
  review parity, all-status exception history, reading-versus-log totals, search
  bounds/narrowing, hidden controls, return continuity, and action reauthorization.
- Keep the policy catalog/service discrepancy open until the policy owner confirms
  the authoritative Food Safety transition and evidence contract.

## Implementation and documentation impact

- Code / architecture: add typed Food Safety profile parsing and shared bounded
  scope/population predicates for dashboard and destination reads.
- Data / schema: no schema, status, reading, or source-record mutation.
- Workflow / permissions: no new authority and no change to review, return,
  correction, close, self-action, or evidence policy.
- UI / mobile: cards open a visibly profiled, paginated read-only destination with
  truthful totals, bounded search, hidden create/export, explicit invalid state, and
  canonical return navigation.
- Reporting: Reviews reports complete scoped oversight rows; Exceptions distinguishes
  summed exception readings from affected logs and retains historical statuses.
- Knowledge base / training: Dunong must explain oversight versus actionable work,
  exception-reading versus affected-log totals, and read-only profile controls.
- Tests / UAT: validate exact parity and responsive navigation with seeded roles and
  scopes; external database, browser, hosted, recovery, and UAT gates remain open.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the two allowlisted profile destinations and shared predicates | Parent implementation agent | Current checkpoint | Complete locally |
| Align dashboard, Food Safety workflow/UI, decision index, and pending plan | Mithi | Current checkpoint | Complete |
| Reconcile the Phase II policy catalog and live Food Safety service contracts | Policy owner / Product / Engineering | Before workflow production-readiness claim | Open policy/implementation gap |
| Update user-facing guidance and release summary | Dunong | Before user-facing release | Complete |
| Execute scope/parity cases on disposable PostgreSQL | QA / release owner | Before production-readiness claim | Open release gate |
| Verify authenticated desktop, tablet, and mobile navigation | QA / product owner | Before workspace completion | Open release gate |

## Evidence

- The Dashboard UI Specification requires scoped widget destinations rather than
  unauthoritative client-defined populations.
- The Food Safety workflow and UI specifications make source records authoritative
  for review/correction actions and prohibit dashboard mutation.
- The Phase II workflow policy catalog currently models a narrower/different Food
  Safety transition and evidence graph than the live Food Safety service. This
  confirms that the dashboard profile must remain read-only and policy-neutral.
- Independent Product, Security, and QA challenge review supported the bounded
  profile option subject to exact predicate parity, truthful count grain, all-status
  exception history, fail-closed identifiers, hidden create/export, independent
  action authorization, and navigation/parity tests. Requested Code Spark and exact
  GPT-5.4 models were unavailable; the closest permitted GPT-5.6 specialists were
  used without relaxing gates.
- The coherent local candidate passes 99/99 focused profile/dashboard/export/
  authorization-manifest tests, the complete web suite with 1,372 passing tests
  (302 skipped, 1 todo), web and E2E typecheck, lint, production build, secret
  review, and diff hygiene. Independent QA and Security re-reviews returned GO
  with no Critical, High, or Medium finding. Disposable PostgreSQL, authenticated responsive-browser,
  hosted deployment/recovery, and UAT evidence remain separate open gates.

## Supersession

Not superseded.
