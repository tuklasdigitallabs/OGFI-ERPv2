# DEC-0232 — Zero Stock dashboard profile

## Metadata

- Decision ID: `DEC-0232`
- Title: Versioned, closed Zero Stock dashboard profile
- Status: `Confirmed and implemented — PostgreSQL/browser/hosted gates pending`
- Date: 2026-07-26
- Decision owner: Inventory / Overview
- Decision Chair: Parent agent
- Related phase/module: Phase I Overview and Inventory
- Related decision brief: Zero Stock dashboard destination and export parity, 2026-07-26

## Decision

Create the versioned, closed `zero-stock-v1` profile at
`/inventory?dashboard=zero-stock-v1`. Its grain is one existing
`InventoryBalance` row whose `qtyOnHand = 0`. Negative balances are excluded. The
dashboard count, destination count and page, and bounded profile export must share
one server-owned predicate covering the current session's tenant, company, selected
location, active `InventoryLocation`, and exact relation-ownership constraints.

The profile accepts only a normalized search of at most 120 characters as an
additive narrowing condition. It is a current, live, read-only balance view: it is
not a historical snapshot, an item-catalog completeness report, or an automatic
replenishment instruction. Visible copy must describe balance **rows** and must not
use the false label `Items configured`.

Profile export retains existing permissions and enforces the configured
`reporting.export.max_rows` limit with an exact count preflight and a `maxRows + 1`
race guard. An oversized or concurrently grown result returns a user-safe `413`
with no partial or truncated file. Export audit contains only the profile identity
and safe aggregate outcomes. Ledger navigation independently reauthorizes access and
preserves canonical return context.

## Context

Overview exposes a Zero Stock measure, while the ordinary Inventory workspace is a
broader balance register with other tabs and filters. Reusing that register as an implicit dashboard
contract would not prove identical scope, relation ownership, row grain, count,
pagination, export, or authorization semantics. It could also perpetuate copy that
mistakes existing balance rows for all configured catalog items.

An item with no `InventoryBalance` row is not counted by this decision. Multiple
valid balance rows for the same item remain multiple rows when the existing data
model and relation ownership allow them. The profile does not infer a missing
balance, create a replenishment request, check warehouse availability, or mutate
inventory. A schema or index change is deferred until representative PostgreSQL
query-plan and volume evidence shows it is necessary.

## Options considered

### Option A — selected: closed `zero-stock-v1` profile on `/inventory`

- Summary: use one versioned profile and one canonical existing-balance-row
  predicate for dashboard count, destination count/page, and bounded export.
- Benefits: exact semantic and authorization parity; truthful row grain; additive
  bounded search; deterministic pagination; bounded audited export; and no duplicate
  Inventory workspace.
- Failure modes: independently copied predicates can drift; inactive or malformed
  relations can leak into one surface; ordinary filters can override membership;
  export can grow after preflight; or copy can imply catalog completeness.
- Why selected: an exhaustive server dispatcher, shared predicate, strict
  parameters, two-stage export cap, relation fixtures, and explicit copy constraints
  directly control those risks.

### Option B — rejected: ordinary Inventory zero tab

- Summary: link the metric to the existing ordinary zero-stock tab.
- Benefits: smallest routing change and familiar controls.
- Failure modes: ordinary tab/search/filter behavior can drift from the dashboard;
  client parameters can redefine the population; export may not match the card; and
  existing copy may incorrectly imply all configured items are represented.
- Why rejected: an ordinary tab is not a closed, evidence-backed dashboard profile.

### Option C — rejected except as a fail-safe: defer or disable the destination

- Summary: leave the card without a destination until a later Inventory redesign.
- Benefits: avoids presenting an unverified drilldown.
- Failure modes: leaves an operational metric without its required useful
  destination and delays a bounded, reversible improvement.
- Why rejected: the profile can be implemented safely now. Disablement remains the
  required fail-safe if exact predicate, authorization, export, or UI gates fail.

## Decision scorecard

| Criterion | Weight | Option A | Option B | Option C |
|---|---:|---:|---:|---:|
| Operational correctness and control | 30% | 5 | 2 | 4 |
| Business value | 20% | 4 | 3 | 1 |
| User adoption and branch usability | 15% | 4 | 3 | 1 |
| Delivery effort and risk | 15% | 4 | 5 | 5 |
| Maintainability and scalability | 10% | 5 | 2 | 3 |
| Operating cost | 5% | 5 | 5 | 5 |
| Reversibility | 5% | 5 | 4 | 5 |
| **Weighted total** | **100%** | **4.50 / 5** | **3.05 / 5** | **3.10 / 5** |

Option B fails the closed-population and parity hard gates. Option C is acceptable
only as the fail-safe when implementation evidence fails; it does not meet the
requested operational destination outcome.

## Hard-gate assessment

- **Tenant, company, and location isolation:** every dashboard count, profile count,
  row page, and export applies the current session's canonical tenant, company, and
  selected location. Client scope is never accepted.
- **Relation ownership:** each row must satisfy the existing `InventoryBalance` to
  active `InventoryLocation` tenant/company/location ownership relationship. A
  malformed, inactive, or cross-scope relation is excluded.
- **Exact data truth:** membership is an existing balance row with
  `qtyOnHand = 0`. Positive and negative quantities and absent balance rows are
  excluded. Counts describe rows, not distinct catalog items.
- **Server-enforced authorization:** existing balance-view permission authorizes the
  list/count. Existing export permission independently authorizes export. Ledger
  navigation independently reauthorizes access.
- **Inventory integrity:** the profile is read-only and cannot create a Purchase
  Request, Purchase Order, Transfer Request, movement, adjustment, balance, or
  replenishment instruction.
- **Closed dispatch:** the server profile dispatcher is exhaustive. Unknown or newly
  added profiles cannot silently fall through to ordinary behavior.
- **Export safety and audit:** count preflight plus `maxRows + 1` protects the
  configured cap; oversize returns safe `413`, never truncation. Audit is
  aggregate-only and carries no row payload, search text, identifiers, or internal
  error details.
- **Recovery and reversibility:** the profile can be disabled without mutating data.
  No migration or index is authorized without reviewed PostgreSQL evidence.

## Required safeguards

- Register exactly `zero-stock-v1` in an exhaustive server-owned profile dispatcher.
  Require exact cardinality for `dashboard`, `q`, and `page`; reject missing, empty,
  duplicate, unknown, stale, or unsupported values before profile data access.
- Reject raw tab, scope, quantity, status, and generic filter overrides instead of
  ignoring them or falling back to the ordinary Inventory workspace.
- Use one canonical predicate for dashboard no-search count, destination exact
  count/page, and export: current tenant, company, selected location, active
  `InventoryLocation`, exact relation ownership, and `qtyOnHand = 0`.
- Normalize `q`, cap it at 120 characters, and allow it only as an additive search
  over approved visible fields. Search cannot change scope or zero-row membership.
- State `Zero-stock balance rows` or equivalent truthful row language. Replace
  `Items configured`; do not imply missing catalog items, catalog completeness,
  historical state, or replenishment action.
- Keep the profile read-only and label it as current live data. It exposes no create,
  edit, posting, adjustment, transfer, replenishment, or generic-filter controls.
- Use deterministic server ordering with `id` as the final tie-breaker for stable
  page and export behavior.
- Apply `reporting.export.max_rows` through its validated configured value. Run the
  exact filtered count before export, fetch no more than `maxRows + 1`, and return a
  safe `413` with no file if either stage exceeds the cap. Never truncate silently.
- Emit profile-aware export start/success/failure audit containing only safe
  aggregate metadata. Exclude search text, balance/item/location identifiers, row
  data, SQL/database errors, and stack traces.
- Preserve canonical profile, bounded search, and page return context for ledger
  navigation. The ledger destination must independently authorize the current actor
  and selected scope; the profile link is not a capability.
- Add PostgreSQL fixtures for malformed relation ownership, inactive locations,
  positive and negative balances, and multiple balance rows for the same item.
  Prove exact dashboard/count/page/export parity and exclusion behavior.
- Do not add a migration or index until representative PostgreSQL
  `EXPLAIN (ANALYZE, BUFFERS)` and volume evidence is reviewed and a separate
  migration decision is confirmed.

## Implementation and documentation impact

- Code / architecture: add an exhaustive typed `zero-stock-v1` dispatcher and one
  shared Inventory predicate used by dashboard, destination count/page, and export.
  Keep ordinary Inventory filters separate.
- Data / schema: no migration or index in this checkpoint.
- Workflow / permissions: no new permission, scope, replenishment, transfer,
  purchasing, adjustment, posting, or ledger authority.
- UI / mobile: add a read-only, paginated profile with truthful row copy, bounded
  search, explicit invalid/empty/error/denied states, ledger return continuity, and
  responsive desktop/tablet/mobile behavior.
- Reporting: profile export uses exact predicate/order parity, configured cap,
  preflight and race guards, safe `413`, no partial file, and aggregate-only audit.
- Knowledge base / training: Dunong must assess zero-balance row grain, live-data
  semantics, absence of catalog/replenishment meaning, permission behavior, export
  cap, and ledger navigation after implementation labels are verified.
- Tests / UAT: focused service, route, UI, export, authorization, exhaustive-
  dispatcher, and copy tests are required. PostgreSQL fixtures/query plans,
  authenticated browser/mobile, hosted recovery, and UAT remain production gates.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement `zero-stock-v1`, exhaustive dispatch, shared predicate, paging, and truthful copy | Backend + Frontend Engineering | Current Inventory checkpoint | Complete locally |
| Implement bounded export parity, cap race guard, safe `413`, and aggregate audit | Backend + QA | Current checkpoint | Complete locally |
| Execute malformed/inactive/positive/negative/multi-row PostgreSQL fixtures and query plans | Database + QA | Before production-readiness claim | Pending / NO-GO |
| Complete independent source review | UX + Security | Before source checkpoint | Complete — GO, C0/H0/M0 |
| Verify authenticated desktop/tablet/mobile states and ledger return continuity | Product + QA + Security | Before workspace completion | Pending / NO-GO |
| Complete hosted recovery and UAT evidence | Release + Operations owner | Before production promotion | Pending / NO-GO |
| Assess user guidance, release summary, and training impact | Dunong | After verified implementation | Pending handoff |

## Evidence

- The Decision Chair confirmed Option A and the exact row-grain, predicate, strict
  parameter, copy, authorization, export, audit, navigation, and no-migration
  safeguards on 2026-07-26.
- Independent Reporting/Product, UX, and Security Round-1 reviewers unanimously
  recommended Option A with High confidence. No challenge round was required because
  there was no genuine disagreement.
- Requested Code Spark and exact GPT-5.4 models were unavailable in the active
  toolset. The closest permitted GPT-5.6 specialist fallbacks were used without
  relaxing hard gates.
- `DEC-0055` establishes the closed, server-owned dashboard-profile requirement and
  exact dashboard/list/count/page/export parity.
- `DEC-0231` confirms the adjacent Positive Stock Inventory profile pattern while
  preserving a separately versioned predicate and meaning.
- The server dispatcher exhaustively handles `positive-stock-v1` and
  `zero-stock-v1`. The zero profile uses exact `qtyOnHand = 0` row membership,
  strict `dashboard`/`q`/`page` parsing, truthful row copy, canonical page/search/
  export/ledger return context, and bounded redacted export behavior.
- The strengthened PostgreSQL specification includes two zero rows for the same
  item plus positive, negative, inactive-location, mismatched-relation, cross-scope,
  and no-mutation cases. It is authored but unexecuted and is not production
  evidence.
- Focused relevant coverage passes 74/74: Inventory 29, dashboard 30, Inventory page
  4, ledger 7, and export 4. The broader Inventory-filter run passes 127/127. Web
  typecheck, web lint, and the 20/20 authorization manifest pass.
- UX initially found 36px PaginationBar controls. The profile now supplies the
  shared `controlClassName` with `min-h-11`, backed by a visible-surface regression
  test. UX re-review returned GO with C0/H0/M0.
- Security initially found three Medium evidence/consistency gaps. Remediation adds
  zero-valued adversarial PostgreSQL relation rows, stale cached-permission denial,
  `id`/quantity/version plus movement/audit no-mutation snapshots, authorization
  registry/baseline alignment, and corrected broad-register wording. Security
  re-review returned GO with C0/H0/M0.
- PostgreSQL and authenticated E2E were not executed, so no database, query-plan,
  browser/mobile, hosted, recovery, or UAT credit is claimed. Final source review is
  complete and GO; it does not close those execution gates.
- The complete non-database web suite passes 1,407 tests with 305 skipped and one
  existing TODO across 129 passed/11 skipped files. Production build, E2E
  typecheck, secret review, and final diff hygiene pass.
- No schema, migration, permission, or training-workflow change was introduced.
  Requested Code Spark and exact GPT-5.4 models were unavailable; the closest
  permitted GPT-5.6 fallbacks were used without relaxing gates.

## Supersession

Not superseded. Any later change to zero-stock row grain, relation ownership, scope,
search, ordering, export cap, audit, permission, ledger navigation, or route semantics
must version or explicitly supersede `zero-stock-v1` rather than silently changing
its meaning.
