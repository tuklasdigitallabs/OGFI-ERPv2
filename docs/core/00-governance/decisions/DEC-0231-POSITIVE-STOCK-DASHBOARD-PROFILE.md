# DEC-0231 — Positive Stock dashboard profile

## Metadata

- Decision ID: `DEC-0231`
- Title: Versioned, closed Positive Stock dashboard profile
- Status: `Confirmed and implemented — PostgreSQL, browser, and hosted gates pending`
- Date: 2026-07-26
- Decision owner: Inventory / Overview
- Decision Chair: Parent agent
- Related phase/module: Phase I Overview and Inventory
- Related decision brief: Positive Stock dashboard destination and export parity, 2026-07-26

## Decision

Create the versioned, closed `positive-stock-v1` profile on `/inventory`. Its
dashboard no-search count, destination exact count and page, and profile export must
share one server-owned predicate: the current session's selected tenant, company,
and location; an active `InventoryLocation`; and `qtyOnHand > 0`.

The profile accepts only a normalized search of at most 120 characters as an
additive narrowing condition. It is read-only and reflects live inventory balances,
not a historical snapshot. It retains the existing Inventory balance-view and
export permissions and creates no stock, ledger, approval, or workflow authority.

Profile export must enforce the configured `reporting.export.max_rows` limit with an
exact count preflight and a `maxRows + 1` race guard. An oversized or concurrently
grown result returns a user-safe `413` response with no partial or truncated file.
Export audit remains profile-aware and redacted.

## Context

Overview exposes a Positive Stock measure, while the ordinary Inventory workspace
offers broader tabs and filters. Reusing the ordinary positive tab as an implicit
dashboard contract would not prove that the dashboard count, destination total,
page, and export share the exact active-location population. It would also allow
raw workspace parameters to redefine the clicked measure.

The inventory destination therefore needs the same closed, source-owned semantics
established for other dashboard profiles. The change must remain additive and
reversible. No index or schema migration is justified until representative
PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` and volume evidence demonstrates that one is
necessary and identifies the safe database design.

## Options considered

### Option A — selected: `positive-stock-v1` on the Inventory workspace

- Summary: register one versioned profile on `/inventory` and reuse one canonical
  selected-scope, active-location, positive-balance predicate for the dashboard
  count, destination count/page, and profile export.
- Benefits: preserves source-workspace context, provides exact count/page/export
  parity, prevents filter widening, reuses existing authorization, and remains
  reversible without schema change.
- Failure modes: independently copied predicates can drift; a race can grow an
  export after count preflight; search can accidentally become a scope override;
  or unstable ordering can duplicate or omit rows across pages.
- Why selected: shared predicate construction, strict parameter validation,
  deterministic ordering, and the two-stage export cap directly control these
  risks without creating a second Inventory workspace.

### Option B — rejected: link to the ordinary positive-stock tab

- Summary: open `/inventory` with its ordinary positive tab selected.
- Benefits: minimal routing work and a familiar surface.
- Failure modes: ordinary tab, search, scope, and filter semantics can drift from
  the dashboard; raw parameters can redefine the population; and export can exceed
  or differ from the clicked count.
- Why rejected: an ordinary tab is not an exact, closed dashboard destination
  contract and cannot by itself prove count/page/export parity.

### Option C — rejected: dedicated Positive Stock route

- Summary: create a separate route and UI for the same balance population.
- Benefits: strong visual separation from ordinary Inventory filters.
- Failure modes: duplicates Inventory authorization, paging, export, empty/error,
  responsive, and support behavior; increases drift and maintenance risk; and can
  become a second source of truth.
- Why rejected: the existing Inventory workspace can host a closed profile without
  duplicating the authoritative source surface.

## Hard-gate assessment

- **Tenant, company, and location isolation:** every count, page, and export applies
  the current session's canonical selected tenant, company, and location. No URL
  parameter may select or widen scope.
- **Active inventory context:** membership requires the balance's related
  `InventoryLocation` to be active as well as `qtyOnHand > 0`.
- **Server-enforced authorization:** the existing Inventory balance-view permission
  authorizes list/count access; the existing export permission independently
  authorizes export. A dashboard link grants neither.
- **Inventory and audit integrity:** this is a read-only balance profile. It posts no
  movement, changes no cached balance, and does not replace the immutable ledger or
  existing export audit.
- **Closed population truth:** missing, empty, duplicate, invalid, or stale profile
  input fails visibly. Raw tab, scope, status, quantity, and generic filter inputs
  cannot redefine membership.
- **Export safety:** the configured row cap is enforced before serialization and
  again through a `maxRows + 1` fetch guard. Oversize returns `413`; truncation is
  prohibited.
- **Recovery and reversibility:** disabling the profile changes no source record.
  No migration or index is introduced without query-plan evidence.

## Required safeguards

- Register exactly `positive-stock-v1` in a server-owned allowlist. Require exactly
  one non-empty profile value and reject duplicates, unknown versions, or stale
  identifiers before profile data access.
- For profile mode, require exact cardinality for `dashboard`, `q`, and `page`.
  Validate `page` as the supported positive integer contract. Reject raw tab, scope,
  quantity, status, and generic filter overrides rather than ignoring them or
  falling back to the ordinary workspace.
- Use one canonical predicate builder for the dashboard no-search count,
  destination exact count/page, and export: selected tenant, company, location,
  active `InventoryLocation`, and `qtyOnHand > 0`.
- Permit only a normalized maximum-120-character `q` that adds a search condition to
  the closed predicate. Search must not alter scope or positive-stock membership.
- Keep profile mode read-only and visibly identify it as current live balance data,
  not a historical snapshot. Source balance and ledger detail continue to
  reauthorize independently.
- Use deterministic server ordering with `id` as the final tie-breaker for page and
  export parity.
- Apply `reporting.export.max_rows` through its validated configured value. Perform
  an exact filtered count before export, then request no more than `maxRows + 1`
  rows. If either check exceeds the cap, return a safe `413` and generate no file;
  never truncate silently.
- Record authorized export start/success/failure through the existing audit
  contract, including the closed profile identifier and safe aggregate metadata.
  Do not record search text, row payloads, item/location identifiers, database
  errors, stack traces, or other sensitive query content in profile audit metadata.
- Test strict parameter cardinality, invalid/stale profiles, raw override rejection,
  additive search bounds, exact nullable-independent selected scope, inactive
  InventoryLocation exclusion, zero/negative quantity exclusion, dashboard/count/
  page/export parity, deterministic paging, permission denial, both export cap
  checks, no truncation, race growth, safe `413`, and redacted audit behavior.
- Do not add a schema migration or index until representative PostgreSQL query-plan
  and volume evidence is reviewed and a separate migration decision is confirmed.

## Implementation and documentation impact

- Code / architecture: add a typed Inventory dashboard-profile parser and one shared
  positive-stock predicate used by dashboard, list/count/page, and export. Keep the
  ordinary Inventory tab/filter path separate.
- Data / schema: no migration or index in this checkpoint.
- Workflow / permissions: no new permission, scope, posting, adjustment, transfer,
  approval, or ledger authority. Existing balance-view and export permissions remain
  authoritative.
- UI / mobile: `/inventory?dashboard=positive-stock-v1` becomes a read-only,
  server-paginated profile with bounded search, strict invalid states, live-data
  disclosure, hidden or disabled mutation controls as applicable, and responsive
  desktop/tablet/mobile presentation.
- Reporting: profile CSV uses the exact profile predicate, deterministic order,
  configured cap, count preflight, race guard, safe `413`, and redacted audit.
- Knowledge base / training: Dunong must assess dashboard, Inventory, export-cap,
  live-balance, and permission guidance only after implementation behavior and labels
  are verified.
- Tests / UAT: focused service/route/UI/export parity tests are required before the
  source checkpoint. Hosted PostgreSQL volume/query-plan, authenticated responsive
  browser, recovery, and UAT evidence remain separate production gates.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the typed `positive-stock-v1` profile and shared predicate | Backend + Frontend Engineering | Current Inventory destination checkpoint | Complete |
| Implement exact profile export parity, cap preflight/race guard, safe `413`, and redacted audit | Backend + QA | Current checkpoint | Complete |
| Prove strict parameters, permission boundaries, count/page/export parity, and responsive states | QA + Security + Product | Before source-checkpoint acceptance | Complete; final Security/QA and Product/UX source reviews GO, C0/H0/M0 |
| Execute representative PostgreSQL query-plan and volume evidence | Database + Release | Before production-readiness claim | Pending / NO-GO |
| Assess user guidance, release summary, and training impact | Dunong | After verified implementation | Complete; KB, glossary, reporting/UI sources, and release note aligned; no training workflow change |

## Evidence

- The Decision Chair confirmed the closed `/inventory` profile, exact canonical
  population, strict parameter contract, live read-only semantics, existing
  permissions, bounded export, deterministic order, and no-migration posture on
  2026-07-26.
- Independent Product, Security/QA, and Backend reviewers unanimously recommended
  this option with High confidence. They rejected the ordinary-tab and dedicated-
  route alternatives and retained PostgreSQL, browser, recovery, and UAT hard gates.
- Requested Code Spark and exact GPT-5.4 models were unavailable in the active
  toolset. The closest permitted GPT-5.6 specialist fallbacks were used without
  relaxing any control or evidence requirement.
- `DEC-0055` establishes closed, server-owned dashboard destinations with shared
  dashboard/list/count/page/export semantics and independent source authorization.
- `DEC-0070` demonstrates the stricter Inventory precedent for a dedicated
  server-owned diagnostic profile, permissioned export, deterministic paging, and
  source-authoritative detail navigation.
- The source candidate implements the shared canonical predicate, including
  tenant/company parity for the balance and its Inventory Location, Location, Item,
  Item Category, and base UOM relations; an exact `dashboard`, `q`, and `page`
  allowlist; strict profile
  presentation, exact page/count behavior, profile-preserving ledger return,
  configured bounded export, count and `maxRows + 1` guards, safe `413`, and
  aggregate-only audit metadata. Focused service/dashboard/route/UI coverage passes
  72/72; the complete non-database web suite passes 1,405 tests with 305 skipped
  and one existing TODO across 129 passed/11 skipped files. Web and E2E typecheck,
  web lint, production build, secret review, and `git diff --check` pass. The
  authorization manifest passes 20/20 after binding the new protected reads to an
  extended real-PostgreSQL case. The procurement/inventory PostgreSQL runner and
  authenticated E2E runner were attempted and both failed closed before database
  creation with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`; no database, query-plan,
  browser, or hosted execution credit is claimed. The PostgreSQL source fixture also
  covers inactive locations, mismatched related-record ownership, negative and
  cross-scope balances, and before/after balance and audit snapshots. Final
  Security/QA and Product/UX source re-reviews returned GO with C0/H0/M0. Recovery,
  browser, hosted, and UAT evidence remain production-readiness gates.

## Supersession

Not superseded. A later change to positive-stock membership, scope, permission,
search, ordering, export cap, audit, or route semantics must version or explicitly
supersede this profile rather than silently changing `positive-stock-v1`.
