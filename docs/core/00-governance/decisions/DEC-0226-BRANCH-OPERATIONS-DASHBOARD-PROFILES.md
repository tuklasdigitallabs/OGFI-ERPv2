# DEC-0226 — Branch Operations dashboard profiles

## Metadata

- Decision ID: `DEC-0226`
- Title: Versioned, server-owned Branch Operations dashboard profiles
- Status: Confirmed
- Date: 2026-07-26
- Decision owner: Branch Operations / Overview
- Decision Chair: Parent agent
- Related phase/module: Phase I Overview and Phase II Branch Operations
- Related decision brief: Branch Operations dashboard destination parity, 2026-07-26

## Decision

Branch Operations exposes exactly two allowlisted, read-only dashboard profiles:
`branch-checklist-exceptions-v1` and `branch-checklist-reviews-v1`. Each profile is
a versioned server-owned population, not a client-defined filter preset. Its
dashboard count and authoritative Branch Operations destination reuse the same
tenant, selected company, optional selected brand, and selected location
predicates as the existing dashboard read.

`branch-checklist-reviews-v1` includes every scoped checklist in `SUBMITTED` or
`MANAGER_REVIEW`. Its total is an oversight population, not a claim that the
current actor can review or otherwise act on every row. The detail route decides
which actions, if any, are available after independently reauthorizing the live
actor and source record.

`branch-checklist-exceptions-v1` counts exception lines. Its destination reports
both the exception-line total and the number of affected checklist rows so the
line-grain card value is not misrepresented as a document count.

Raw status, shift, and business-date inputs cannot redefine or widen either
profile. A bounded search may only narrow the selected profile. Missing, invalid,
or stale profile identifiers fail visibly instead of falling back to the ordinary
register. Profile navigation preserves the return context needed to go back to
the same dashboard-derived view.

## Context

Overview already used bounded Branch Operations aggregates and candidates, but its
cards linked to the ordinary checklist register. That register accepted general
status, shift, date, and search filters whose populations did not guarantee parity
with the card definitions. It also could not represent the exceptions card's
line-grain count truthfully because the list is checklist-grain. A closed profile
contract is required so the card, destination totals, rows, and navigation describe
one stable server-owned population without granting workflow authority.

## Options considered

### Option A — selected: two versioned server-owned profiles

- Benefits: preserves exact scope and population parity; makes review oversight and
  exception line/document grain explicit; supports bounded narrowing and safe return
  navigation without exposing client-defined status authority.
- Failure modes: profile predicates can drift from dashboard reads; users can mistake
  oversight rows for assigned tasks; line and checklist totals can be conflated.
- Why selected: the shared predicate contract, explicit labels, versioned identifiers,
  and independent detail authorization address those risks without changing checklist
  workflow or permissions.

### Option B — rejected: link cards to the ordinary filtered register

- Benefits: fewer routes and query variants.
- Failure modes: raw filters can widen or change the card population, stale parameters
  can silently show unrelated rows, and exception line counts cannot reconcile with a
  checklist-row list.
- Why rejected: it does not provide an exact, auditable card-to-destination contract.

### Option C — rejected: expose only actor-actionable review rows

- Benefits: every returned review row would imply an available current action.
- Failure modes: it changes the existing management oversight metric, hides scoped
  submitted/review work from authorized viewers, and couples reporting membership to
  actor-specific action eligibility.
- Why rejected: the confirmed card is an oversight count, while source-detail actions
  already have their own live authorization boundary.

## Hard-gate assessment

- Scope isolation: both profiles require the exact selected tenant, company, nullable
  brand, and location predicates used by Branch Operations dashboard reads.
- Server authorization: the destination reauthorizes the current session and selected
  scope; the client cannot supply broader scope or population predicates.
- Action authority: profile membership grants no review, correction, close, export, or
  other workflow action. Detail actions independently enforce permission, status,
  actor, and scope rules.
- Data truth: Review count is labeled as scoped oversight. Exception count remains
  line-grain, with affected checklist rows reported separately.
- Consistency: allowlisted versioned identifiers and shared profile predicates keep
  card and destination semantics aligned; stale identifiers fail closed.
- Recovery: profile removal or version replacement does not mutate checklist records;
  invalid saved links fail visibly and users can return to the source dashboard.
- Phase discipline: the decision adds read-only dashboard destinations only and does
  not change Branch Operations lifecycle, approvals, inventory, finance, or incidents.

## Required safeguards

- Keep both identifiers in a server-owned allowlist and require the explicit version
  suffix; never treat an unknown value as the ordinary register.
- Reuse one selected-scope predicate contract across each card count, candidate read,
  destination total, destination rows, and any profile export that is later approved.
- For Reviews, fix membership to scoped `SUBMITTED` and `MANAGER_REVIEW` records and
  label the result as oversight rather than `Needs you` or assigned work.
- For Exceptions, count matching exception lines and compute affected checklist rows
  separately; do not substitute one grain for the other.
- Ignore or reject raw status, shift, and business-date values while a profile is
  active. Validate and cap search so it can only narrow profile membership.
- Preserve profile, bounded search, pagination, and safe return context through row,
  detail, and back navigation.
- Require source-detail authorization for every record and every action. Profile reads
  must not weaken live permission, scope, status, or actor checks.
- Cover invalid/stale profiles, forged widening filters, nullable-brand scope, count
  parity, line-versus-row totals, search narrowing, pagination, return continuity, and
  action non-authority in focused and disposable-PostgreSQL tests.

## Implementation and documentation impact

- Code / architecture: add typed Branch Operations profile parsing and reuse the
  dashboard population predicates in bounded list/count reads.
- Data / schema: no schema or checklist-state change.
- Workflow / permissions: no new authority; existing detail actions remain the source
  of truth for review, correction, and close eligibility.
- UI / mobile: cards open a visibly profiled, paginated checklist destination with
  truthful totals, bounded search, explicit invalid state, and preserved return path.
- Reporting: Reviews reports checklist rows; Exceptions reports exception lines and
  affected checklist rows as distinct measures.
- Knowledge base / training: explain the two dashboard destinations, oversight versus
  actionable work, and the exception line/document distinction.
- Tests / UAT: verify exact card/list parity and responsive navigation using seeded
  roles and scopes; retain external database, browser, hosted, recovery, and UAT gates.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the two allowlisted profile destinations and shared predicates | Parent implementation agent | Current checkpoint | Complete locally |
| Align dashboard, Branch Operations, decision index, and pending plan | Mithi | Current checkpoint | Complete |
| Update user-facing guidance and release summary | Dunong | Before user-facing release | Complete |
| Execute scope/parity cases on disposable PostgreSQL | QA / release owner | Before production-readiness claim | Open release gate |
| Verify authenticated desktop, tablet, and mobile navigation | QA / product owner | Before workspace completion | Open release gate |

## Evidence

- The Phase I Dashboard UI Specification requires each widget to link to a relevant
  filtered destination within the user's authorized scope.
- The Branch Operations UI Specification keeps dashboard entries read-only and makes
  the source record authoritative for review and correction actions.
- Independent Product, Security, and QA challenge review supported the bounded profile
  option subject to exact shared scope, truthful count grain, fail-closed identifiers,
  independent detail authorization, and parity/navigation testing. Requested Code
  Spark and exact GPT-5.4 models were unavailable; the closest permitted GPT-5.6
  specialists were used and recorded without relaxing any gate.
- Local source validation passed on the coherent implementation candidate: focused
  dashboard/adapter tests 54/54, authorization manifest 20/20, complete web suite
  1,365 passing (302 skipped, 1 todo), typecheck, lint, production build, and diff
  hygiene; E2E TypeScript and the secret review also pass. Disposable PostgreSQL,
  authenticated responsive-browser, hosted deployment/recovery, and UAT evidence
  remain separate open gates.

## Supersession

Not superseded.
