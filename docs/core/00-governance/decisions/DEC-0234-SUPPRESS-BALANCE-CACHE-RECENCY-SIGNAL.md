# DEC-0234 — Suppress balance-cache recency signal

## Metadata

- Decision ID: `DEC-0234`
- Title: Suppress unauthoritative Inventory Balance cache recency from Overview
- Status: `Confirmed and implemented — browser/hosted/UAT gates pending`
- Date: 2026-07-26
- Decision owner: Inventory / Overview
- Decision Chair: Parent agent
- Related phase/module: Phase I Overview and Inventory
- Related decision brief: Inventory recent-update signal authority, 2026-07-26

## Decision

Suppress the Overview `Updated this week` / recent-stock-updates signal and remove
`recentlyUpdatedRows` from the dashboard `InventoryBalance` read contract and query.
`InventoryBalance.updatedAt` is mutable balance-cache metadata and is not an
authoritative inventory-event timestamp. The generic `/inventory` workspace is not
a valid drilldown for a purported event-time measure because it has no closed,
shared event predicate across count, page, and export.

No replacement card, count, candidate list, profile, export, or generic destination
is approved in this checkpoint. A future immutable `InventoryMovement` profile is
preferred in principle but remains unapproved until the authoritative timestamp
(`createdAt` versus existing `occurredAt`), rolling versus calendar period,
week boundary and timezone, movement-versus-document grain, and ledger-permission
contract are confirmed.

## Context

The Overview Inventory source previously exposed balance rows whose mutable
`updatedAt` fell within a recent window and linked the signal to the ordinary
Inventory register. A cache row can update because quantity, lot-key normalization,
reconciliation, or another balance-maintenance operation changed; its latest cache
write is not necessarily when a business inventory event occurred. The timestamp
also overwrites earlier cache-write history, so it cannot support an event count,
period history, movement grain, or audit claim.

Keeping or relabeling the measure would make a non-authoritative timestamp look like
operational activity. Linking it to generic `/inventory` would also violate the
closed dashboard-profile contract established by `DEC-0055`. Suppression is the
only currently safe option and does not remove the authoritative Inventory Ledger
or its independently permissioned movement history.

## Options considered

### Option A — rejected: rolling seven-day balance-cache profile

- Summary: retain `InventoryBalance.updatedAt` with a closed profile labeled as
  balance rows changed during the trailing 168 hours.
- Benefits: makes the rolling boundary and balance-row grain explicit and could
  provide count/page/export parity without a schema change.
- Failure modes: multiple movements collapse into one latest cache timestamp;
  non-event cache maintenance can qualify; later writes overwrite earlier period
  membership; and the signal still cannot represent event volume or history.
- Why rejected: clearer wording cannot make mutable cache lifecycle metadata an
  authoritative operational-activity source.

### Option B — rejected: calendar-week balance-cache signal

- Summary: retain `InventoryBalance.updatedAt` but apply calendar-week boundaries
  and clearer date copy.
- Benefits: preserves a visible metric with a small query change.
- Failure modes: a better period boundary does not make mutable cache metadata an
  inventory event. Reconciliation or repeated balance writes can still overwrite
  meaning, and the ordinary destination still lacks closed parity.
- Why rejected: it improves presentation around an unauthoritative source rather
  than correcting the source-of-truth defect.

### Option C — selected: suppress without replacement

- Summary: remove the signal, candidates, and dashboard contract/query field; retain
  the independently authorized Inventory workspace and ledger without implying a
  recent-event metric.
- Benefits: immediately removes misleading data, grants no authority, requires no
  schema change, is reversible, and leaves space for a properly confirmed immutable
  movement profile.
- Failure modes: users temporarily lose a convenient activity indicator and may
  expect a replacement.
- Why selected: truthful absence is safer than a false operational measure. The
  existing ledger remains the authoritative movement history.

## Decision scorecard

| Criterion | Weight | Option A | Option B | Option C |
|---|---:|---:|---:|---:|
| Operational correctness and control | 30% | 3 | 1 | 5 |
| Business value | 20% | 4 | 3 | 3 |
| User adoption and branch usability | 15% | 3 | 3 | 3 |
| Delivery effort and risk | 15% | 1 | 4 | 5 |
| Maintainability and scalability | 10% | 3 | 4 | 5 |
| Operating cost | 5% | 4 | 4 | 5 |
| Reversibility | 5% | 3 | 2 | 4 |
| **Weighted total** | **100%** | **2.95 / 5** | **2.65 / 5** | **4.25 / 5** |

Options A and B fail the authoritative-event-time gate. Option C is the only current
option that passes every applicable hard gate. A future immutable movement profile
was identified as a separate preferred direction, not scored as an immediately
implementable option, and remains subject to a new material decision.

## Hard-gate assessment

- **Truthful reporting:** no dashboard value, label, or candidate may imply inventory
  events from mutable `InventoryBalance.updatedAt` cache metadata.
- **Tenant/company/location isolation:** suppression removes the read field and
  query; it neither widens nor replaces existing selected-scope Inventory or ledger
  authorization.
- **Server-enforced authorization:** the ordinary Inventory workspace and Inventory
  Ledger retain their existing independent permission and scope checks. No dashboard
  link becomes a capability.
- **Closed profile parity:** generic `/inventory` is not used as an event destination.
  Any future movement signal requires one versioned predicate shared by dashboard,
  count/page, and export.
- **Inventory and audit integrity:** no balance, movement, ledger, source document,
  audit, approval, or posting state is changed. Immutable movements remain the
  authoritative history.
- **Phase scope and reversibility:** this is a bounded read-model/UI suppression with
  no schema migration or new workflow. Reintroduction requires a separately
  confirmed source contract.

## Required safeguards

- Remove `recentlyUpdatedRows` from the Inventory dashboard read type, query,
  assembly, fixtures, and tests; do not leave an unused or hidden broad read.
- Remove the `Updated this week` KPI, recent-stock-updates candidate section, generic
  `/inventory` drilldown, and any copy or totals derived from that cache timestamp.
- Do not replace the signal with another `InventoryBalance.updatedAt` interval,
  calendar-week calculation, client filter, ordinary tab, or generic link.
- Preserve all confirmed `positive-stock-v1`, `zero-stock-v1`, and
  `lot-expiry-data-v1` predicates and destinations without expanding their meaning.
- Preserve the Inventory Ledger and ordinary Inventory workspace as independently
  authorized source surfaces. Their existence does not authorize a new Overview
  event metric.
- Test that Overview no longer queries, serializes, labels, or links balance-cache
  recency; the remaining Inventory dashboard aggregates and profiles must retain
  exact scope, count, and authorization behavior.
- Keep the future Inventory Movement profile unapproved until a Decision Chair
  confirms timestamp authority, rolling/calendar period, week/timezone boundary,
  row/document grain, movement-type inclusion, ledger permission, closed destination,
  export, and audit semantics.
- Add no schema, index, migration, backfill, or legacy-row mutation in this
  suppression checkpoint.

## Implementation and documentation impact

- Code / architecture: remove `recentlyUpdatedRows` and its query from the bounded
  Inventory dashboard read; remove the associated Overview presentation.
- Data / schema: no change. `InventoryBalance.updatedAt` remains cache lifecycle
  metadata, not authoritative event time.
- Workflow / permissions: no new permission or change to inventory, ledger, posting,
  approval, adjustment, transfer, receiving, or replenishment authority.
- UI / mobile: remove the misleading signal and generic destination on every
  viewport. Do not show a placeholder replacement that implies future availability.
- Reporting: no recent-inventory-event report or export is created. Existing
  profile and ledger exports remain unchanged.
- Knowledge base / training: Dunong should assess whether user guidance or release
  notes mention the removed signal after implementation verification; no new term or
  training workflow is introduced.
- Tests / UAT: focused dashboard service/page regression, full source-control gates,
  then authenticated responsive-browser verification are required. Hosted and UAT
  gates remain open with Workspace 1.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Remove the cache-recency query contract and Overview presentation | Backend + Frontend Engineering | Current dashboard checkpoint | Complete locally |
| Verify no hidden query, count, candidate, label, or generic drilldown remains | QA + Security + UX | Before source-checkpoint completion | Complete; GO C0/H0/M0 |
| Deliberate an immutable Inventory Movement recent-activity profile | Product + Reporting + Data + Security | Only after timestamp/period/grain/permission inputs are confirmed | Unapproved / blocked |
| Execute responsive browser and hosted regression evidence | QA + Release | Before Workspace 1 completion | Pending / NO-GO |

## Evidence

- The Decision Chair confirmed Option C on 2026-07-26 after independent
  Reporting/Product, Security, and UX review.
- Reporting/Product, Security, and UX unanimously recommended suppression. Option C
  scored 4.25/5, compared with 2.95 for a rolling seven-day balance-cache profile
  and 2.65 for a calendar-week cache calculation.
- The reviewers agreed that a future immutable Inventory Movement profile is the
  preferred product direction but is blocked by unresolved timestamp, period,
  timezone, grain, and ledger-permission decisions.
- Requested Code Spark and exact GPT-5.4 models were unavailable in the active
  toolset. The closest permitted GPT-5.6 Reporting/Product, Security, UX, and
  documentation fallbacks were used without relaxing hard gates.
- `DEC-0055` requires closed, source-owned dashboard predicates and destinations.
  `DEC-0231` through `DEC-0233` demonstrate exact Inventory balance-profile parity;
  none authorizes an event-time meaning for cache metadata.
- The cache-recency DTO field, query predicate, card, icon mapping, label, detail,
  and generic drilldown are removed. The remaining three closed Inventory signals
  use a balanced one-column mobile and three-column tablet/desktop layout.
- Focused Security review passed 79/79 tests and final independent Security and UX
  reviews returned GO with C0/H0/M0. The complete non-database web suite passes
  1,412 tests with 305 skipped and one existing TODO across 129 passed/11 skipped
  files; web typecheck, lint, E2E typecheck, production build, secret review, the
  20/20 authorization manifest, and diff hygiene pass.
- The disposable procurement/inventory runner failed closed before database
  creation with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`; no PostgreSQL credit is
  claimed. Authenticated responsive-browser/E2E, hosted recovery, and UAT evidence
  remain open Workspace 1 gates.

## Supersession

Not superseded. Any future recent-inventory-activity signal must explicitly
supersede this suppression with a confirmed immutable-source timestamp, period,
timezone, grain, permission, profile, export, and audit contract.
