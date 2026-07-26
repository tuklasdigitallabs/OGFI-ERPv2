# DEC-0238 — Truthful operational source views

## Metadata

- Decision ID: `DEC-0238`
- Title: Replace the ambiguous Overview Reports presentation with typed operational source destinations
- Status: `Confirmed — implemented locally`
- Date: 2026-07-26
- Decision owner: Overview / Application Shell
- Decision Chair: Parent agent
- Related phase/module: Phase I Overview and application shell
- Related decision brief: Overview Reports destination semantics, 2026-07-26

## Decision

Keep the existing dashboard `reports` URL/view key for compatible navigation, but
present it as **Source views**. It is a directory of two explicit destination
types: versioned, read-only exact scoped views and authorized source workspaces.
It is not a generic reporting surface and must not imply report definitions,
aggregate reconciliation, or data availability.

Enrol a destination only when its authorized dashboard source was attempted.
Show the attempted source as available or unavailable without treating failure as
zero. Split previously broad labels into their real controlled populations, and
use service-owned profile-link helpers for every exact view. This changes no
source record, schema, permission, workflow, export, or reporting definition.

## Context

The prior Overview Reports presentation grouped unlike operational destinations
under report wording. Some entries are exact, versioned source populations while
others are merely authoritative workspaces. Broad labels such as a combined
wastage/adjustment view or corrective-action/SLA view could imply a population,
completion, or reconciliation claim that the destination does not supply.

Overview already owns source observation outcomes and protected, service-owned
profile contracts. A typed directory can disclose these boundaries, preserve
selected-scope navigation, and make an unavailable source visible without
fabricating a count or availability claim.

## Options considered

### Option A — selected: compatible Source views directory with typed destinations

- Summary: retain the `reports` route key but relabel it and group destinations as
  `Exact operational views` or `Source workspaces`.
- Benefits: preserves navigation compatibility; distinguishes closed populations
  from module handoffs; keeps exact profile links service-owned; exposes source
  observation state without inferring zero or data completeness.
- Failure modes: an entry can be enrolled without its attempted source, a failed
  read can appear as a record result, or a descriptive label can overstate source
  semantics.
- Why selected: source-observation enrolment, typed copy, exact profile helpers,
  and explicit available/unavailable state mitigate these risks without inventing
  a report contract.

### Option B — rejected: retain Reports wording with generic destination cards

- Summary: leave the route and broad report-like labels unchanged.
- Benefits: smallest visible change.
- Failure modes: presents source modules and exact profiles as equivalent reports,
  enables unsupported aggregate or reconciliation interpretation, and can conceal
  source-read failure behind an apparently empty card.
- Why rejected: it does not make the authoritative destination or its limits clear.

### Option C — rejected: add a new report-builder or report-definition layer

- Summary: replace the presentation with configurable reports, saved views, or
  cross-module aggregation.
- Benefits: could support future reporting needs.
- Failure modes: new data definitions, export semantics, authorization paths,
  performance, and scope controls would be required; it would materially exceed
  the current Overview correction.
- Why rejected: out of scope and not needed to correct present destination truth.

## Hard-gate assessment

- Scope isolation: exact view URLs retain their existing server-owned selected-scope
  profile contracts; source-workspace routes independently enforce authority.
- Server authorization: the directory only reflects authorized attempted dashboard
  sources and does not grant source visibility or action authority.
- Data truth: exact views are labeled as scoped populations; source workspaces are
  not labeled reports. Unavailable source reads are not displayed as zero records
  or available data.
- Audit and workflow integrity: the directory is navigation-only and performs no
  source mutation, workflow action, export, approval, inventory, or financial
  operation.
- Recovery: the stable `reports` URL/view key remains valid; source destinations
  remain independently recoverable through their authoritative workspaces.
- Phase discipline: no generic report builder, new report calculation, or Phase II
  analytics activation is authorized.

## Required safeguards

- Render the visible tab label as `Source views` while retaining the existing
  `reports` dashboard view parameter for compatible links.
- Use only `EXACT_VIEW` and `SOURCE_WORKSPACE` destination types and visibly label
  their difference.
- Build each enrolled operational entry from an attempted authorized
  `sourceObservations` source. Do not show a destination when that source is not
  enrolled for the current role/scope.
- Render source read state as `Dashboard source available` or `Dashboard source
  unavailable`; do not equate unavailable with a zero count, complete data, or a
  successful source workspace query.
- Use the existing service-owned profile href helpers for Receiving Follow-up,
  Transfer Follow-up, Wastage Exceptions, Stock Adjustment Exceptions, Branch
  Checklist Exceptions, Food Safety Exceptions, Open Incidents, and Maintenance
  Follow-up.
- Keep Inventory Balances, Purchase Orders, Approval Inbox when available, and
  authorized Food Cost Analysis as clearly labeled source workspaces, not exact
  report populations.
- Keep controlled populations separate: Wastage Exceptions, Stock Adjustment
  Exceptions, Branch Checklist Exceptions, Open Incidents, and Maintenance
  Follow-up. Do not reintroduce broad combined labels or unsupported compliance,
  corrective-action, SLA, downtime, reconciliation, or availability claims.
- Provide an explicit empty state when no source destination is enrolled and retain
  accessible, touch-sized destination controls.

## Implementation and documentation impact

- Code / architecture: typed, source-observation-gated Overview destinations
  reuse existing protected profile-link helpers and workspace routes.
- Data / schema: no schema, migration, index, backfill, or source-data change.
- Workflow / permissions: no action, scope, approval, or role-authority change;
  every destination remains independently authorized.
- UI / mobile: rename the compatible tab to Source views, group exact views and
  workspaces, disclose source observation state, and provide a typed empty state.
- Reporting: no new report, report definition, export, aggregate, or reconciliation
  semantics are created.
- Knowledge base / training: Dunong updated the user-facing dashboard guidance,
  glossary, and release note to distinguish Source views from reports and source
  availability from record results. A short briefing is assessed; no separate
  training course is required because no operational workflow changed.
- Tests / UAT: focused dashboard page/service coverage, complete non-database
  regression, web typecheck/lint, E2E typecheck, production build, authorization
  manifest, secret review, and diff hygiene pass locally. Disposable PostgreSQL,
  authenticated browser/E2E, hosted recovery/deployment, and UAT remain applicable
  gates before broader completion.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement typed Source views directory and truthful source-state presentation | Parent implementation agent | Current checkpoint | Complete locally |
| Align dashboard UI specification, decision index, and pending plan | Mithi | Current checkpoint | Complete |
| Verify disposable PostgreSQL, protected-source behavior, and production presentation | QA / release owner | Before workspace completion | Open release gate |
| Verify authenticated desktop, tablet, and mobile navigation | QA / product owner | Before workspace completion | Open release gate |

## Evidence

- The Phase I Dashboard UI Specification requires each widget or drilldown to
  lead to an authorized filtered list or report, and requires partial source reads
  to remain visible without treating unavailable data as zero.
- Existing dashboard source observations provide the attempted authorized source
  boundary. Existing profile helpers remain the authority for exact destinations.
- Focused dashboard page/service coverage passes 46/46. The complete
  non-database web suite passes 1,423 tests with 305 skipped and one existing TODO
  across 129 passed/11 skipped files. Web typecheck/lint, E2E typecheck,
  production build, the 20/20 authorization manifest, secret review, and
  `git diff --check` pass. Final Data/Security and UX reviews each return **GO**
  with C0/H0/M0/L0.
- Disposable PostgreSQL, authenticated responsive-browser/E2E, hosted
  deployment/recovery, and UAT evidence remains open and is not claimed here.
  This local implementation does not complete Overview, Workspace 1, or Phase I.
- Parent-led deliberation confirmed the typed-directory option. Requested Code
  Spark and exact GPT-5.4 reviewers were unavailable in the active toolset; the
  closest permitted GPT-5.6 fallback was used without relaxing hard gates.

## Supersession

Not superseded. This corrects Overview destination presentation without changing
the existing exact profile decisions or source-workspace authority.
