# DEC-0235 — Suppress Purchase Order dashboard monetary signals

## Metadata

- Decision ID: `DEC-0235`
- Title: Suppress unauthoritative Purchase Order dashboard monetary signals
- Status: `Confirmed — implemented in source; production gates remain open`
- Date: 2026-07-26
- Decision owner: Purchasing / Overview
- Decision Chair: Parent agent
- Related phase/module: Phase I Overview and Purchase Orders
- Related decision brief: Purchase Order dashboard monetary reconciliation, 2026-07-26

## Decision

Suppress Overview `PO commitment`, `Open PO exposure`, and `Received value`. Remove
`committedValue`, `openValue`, `receivedValue`, and `primaryCurrency` from
`PurchaseOrderDashboardRead` and its broad dashboard queries. No replacement
monetary metric is authorized.

Preserve the exact non-monetary `po-open-v1` count/profile and selected-scope overdue
Purchase Order queue. Their lifecycle, authorization, paging, export, and source
contracts do not depend on the suppressed rollups and must not be widened.

## Context

The monetary signals aggregate Purchase Order headers and lines across broad status
populations without one reconciled basis. They can include approval-rejected
cancellation subtypes whose line remainder is not a live commitment, mix header and
line calculations, and format a multi-currency aggregate using the newest PO's
currency. Child-line lineage, snapshot consistency, live authorization, and a
closed count/page/export destination are also incomplete.

The values therefore cannot prove one lifecycle meaning, currency, amount basis, or
reconciling population. Suppression changes no PO source data and retains useful
open-count and overdue operational controls.

## Options considered

### Option A — challenged and blocked: narrow open-line monetary metric

- Summary: replace the broad figures with one open-line amount for eligible POs.
- Benefits: retains a useful value signal and narrows lifecycle ambiguity.
- Failure modes: header/line basis, amendments, receiving races, rejected/closed
  remainder, currency mixing, Decimal arithmetic, and destination parity remain
  unresolved.
- Challenge result: Reporting initially proposed this option. Challenge review
  classified it **Blocking** until one Decimal-safe, snapshot-consistent,
  relation-safe, single-currency query is shared by dashboard, closed profile, page,
  and export with live authorization.
- Why rejected now: it fails monetary truth, currency, relation, and parity gates.

### Option B — rejected: retain or relabel current rollups

- Summary: retain the broad aggregates with softer labels or approximate currency.
- Benefits: smallest implementation change.
- Failure modes: copy cannot reconcile all-status scope, rejected subtype remainder,
  header/line basis, mixed currency, or child-line races.
- Why rejected: the data contract, not only the label, is unsafe.

### Option C — selected: suppress without replacement

- Summary: remove the three figures and currency field/query work while retaining
  open-count/profile and overdue follow-up.
- Benefits: removes misleading money, preserves operational controls, adds no
  authority or migration, and is reversible after a complete contract is confirmed.
- Failure modes: Overview temporarily loses PO monetary context.
- Why selected: truthful absence is the only current option that passes all money,
  scope, authorization, and destination-parity hard gates.

## Scorecard and hard-gate result

| Criterion | Weight | Option A | Option B | Option C |
|---|---:|---:|---:|---:|
| Monetary correctness and reconciliation | 30% | Blocked | 1 | 5 |
| Authorization and scope integrity | 20% | Blocked | 2 | 5 |
| Operational value | 15% | 4 | 3 | 3 |
| Delivery effort and risk | 15% | 1 | 4 | 5 |
| Maintainability | 10% | 2 | 2 | 5 |
| Reversibility | 10% | 3 | 3 | 5 |
| **Result** | **100%** | **Ineligible until safeguards exist** | **Fails hard gates** | **Selected** |

No weighted preference overrides the Blocking monetary-consistency finding.

## Hard-gate assessment

- No aggregate may mix currencies or use one PO's currency to label a multi-record
  result. Any future metric requires Decimal-safe arithmetic and one amount basis.
- Approval-rejected, cancelled, closed, received, amendment, and balance-closure
  semantics cannot be inferred from broad status or line remainder.
- Any future metric requires one snapshot-consistent, relation-safe query over
  authoritative header/line lineage.
- Suppression removes broad amount reads without changing tenant/company/location
  authorization. Every future dashboard/profile/export boundary must reauthorize.
- No monetary card is allowed without one closed versioned population shared by
  dashboard, count/page, bounded export, and source detail.
- No PO, approval, receiving, supplier commitment, budget, finance, inventory,
  movement, or audit record changes.

## Required safeguards

- Remove all four fields from the dashboard type, queries, assembly, fixtures, and
  tests; remove the three labels, values, formatting, and implied drilldowns.
- Preserve exact `po-open-v1` status/scope/count/page/export behavior and the overdue
  queue's selected-scope ordering and source authorization.
- Do not substitute header totals, line totals, remainder values, received quantity
  times price, newest/first PO currency, converted estimates, client aggregation, or
  an ordinary-list filter.
- Test absence of suppressed queries/serialization/presentation and regression-test
  open-profile and overdue-queue parity.
- Keep a future monetary signal blocked until one static Decimal-safe,
  snapshot-consistent, relation-safe, single-currency query defines exact lifecycle
  and subtype semantics and powers a closed dashboard/profile/page/export contract.
- Add no schema, migration, index, backfill, conversion, or historical rewrite.

## Implementation and documentation impact

- Code / architecture: narrow `PurchaseOrderDashboardRead` to non-monetary counts
  and overdue candidates and remove broad monetary queries.
- Data / schema: no change; source PO monetary fields remain available to authorized
  detail and source reports.
- Workflow / permissions: no PO lifecycle, approval, receiving, export, finance, or
  inventory authority change.
- UI / mobile: remove the monetary signals on every viewport; preserve Open POs and
  overdue follow-up without replacement placeholders.
- Reporting: create no Overview monetary report/export. Existing PO Status/source
  exports remain separate and are not aggregate reconciliation evidence.
- Knowledge base / training: dashboard guidance and the end-user release note explain
  the suppression and retained source-record paths; no new term or training workflow
  is introduced.
- Tests / UAT: focused and full source-control tests and final independent review
  pass. Responsive browser, PostgreSQL relation/snapshot, hosted, recovery, and UAT
  gates remain required.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Remove monetary fields, broad queries, and Overview presentation | Backend + Frontend Engineering | Current checkpoint | Complete in source |
| Verify preserved `po-open-v1` and overdue-queue parity | QA + Security + Product | Before source completion | Complete in source review/tests |
| Deliberate a closed single-currency PO monetary metric | Reporting + Product + Data + Security | After all Blocking safeguards are designed | Unapproved / blocked |
| Execute responsive-browser, PostgreSQL, hosted, and UAT evidence | QA + Database + Release | Before Workspace 1 completion | Pending / NO-GO |

## Evidence

- The Decision Chair confirmed Option C after a genuine challenge round.
- Reporting, Product, Security, and UX agreed the existing monetary values are not
  production-safe. Reporting's initial narrow open-line proposal was classified
  Blocking until the exact Decimal-safe, snapshot-consistent, relation-safe,
  single-currency closed-query and destination safeguards exist.
- Requested Code Spark and exact GPT-5.4 models were unavailable. The closest
  permitted GPT-5.6 Reporting, Product, Security, UX, and documentation fallbacks
  were used without relaxing hard gates.
- `DEC-0055` requires closed source-owned destinations and count/page/export parity;
  `po-open-v1` meets its non-monetary contract and is preserved.
- Source implementation removes all four DTO fields and broad value/currency reads,
  the three cards and icon mappings, and their monetary drilldowns. A first UX review
  rejected the stale `Purchase Order Exposure` report shortcut (C0/H1/M0); it was
  replaced with a neutral `Purchase Order Register` source link, after which UX and
  Security independently returned GO with C0/H0/M0.
- Focused adapter/service tests pass 70/70, the final dashboard-focused selection
  passes 93/93, and the complete non-database web suite passes 1,413 tests with 305
  skipped and one existing TODO. Web typecheck, lint, E2E typecheck, production
  build, secret review, the authorization manifest (20/20), and diff checks pass.
- The disposable PostgreSQL runner fails closed before database creation with
  `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`; PostgreSQL, responsive browser/E2E,
  hosted, recovery, and UAT evidence remain open. This decision does not mark
  Overview, Workspace 1, or Phase I complete.

## Supersession

Not superseded. Any future PO monetary Overview signal must explicitly supersede
this suppression with a confirmed amount, lifecycle, subtype, snapshot, currency,
authorization, profile, page, export, audit, and recovery contract.
