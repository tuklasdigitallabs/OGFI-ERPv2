# DEC-0233 — Lot / Expiry Data dashboard profile

## Metadata

- Decision ID: `DEC-0233`
- Title: Versioned, closed Lot / Expiry Data dashboard profile
- Status: `Confirmed and implemented — PostgreSQL/browser/hosted gates pending`
- Date: 2026-07-26
- Decision owner: Inventory / Overview
- Decision Chair: Parent agent
- Related phase/module: Phase I Overview and Inventory
- Related decision brief: Lot/expiry data-presence destination and export parity, 2026-07-26

## Decision

Create the versioned, closed `lot-expiry-data-v1` profile with the visible label
`Rows with lot or expiry data`. Its grain is one existing `InventoryBalance` row.
Membership requires either a nonblank trimmed lot value or a recorded expiry date;
all quantity signs are included. Dashboard count, profile count/page, and bounded
profile export must share one server-owned predicate covering the current session's
tenant, company, selected location, active `InventoryLocation`, and exact ownership
parity across Location, Item, Item Category, and base UOM relations.

The read implementation must use static, parameterized `Prisma.sql`/CTE structure.
Request values may bind parameters but must not construct SQL fragments, identifiers,
operators, order clauses, or predicate structure. The profile accepts only strict
`dashboard`, `q`, and `page` parameters; normalized search is capped at 120
characters and may only narrow the closed population.

This is a live, read-only data-presence view. It is not a historical snapshot and
does not claim lot-tracking compliance, coverage, accountability, traceability, or
operational completeness. A missing lot or expiry value is displayed as
`Not recorded`. Future inventory movement/balance lot writes must normalize lot text
to trimmed nonblank text or null. Existing legacy rows are not rewritten. Blank-lot
legacy data quality remains a separate follow-up observation.

## Context

Overview needs a useful destination for the existing lot/expiry-data signal without
turning data presence into a policy or compliance assertion. The same item may have
several balance rows, and a balance row may carry lot data, expiry data, both, or
neither regardless of its current quantity sign. Counting catalog items, distinct
items, positive stock only, or records that satisfy an inferred completeness rule
would change the signal's meaning.

Blank and whitespace-only lot values created a material deliberation question.
Reporting/Product and UX recommended excluding them because the label promises
recorded data. Security initially recommended preserving and flagging stored blank
values to avoid silent normalization. The challenge round resolved the disagreement:
Security accepted trim-and-exclude for this data-presence profile only when the
predicate is explicit, legacy rows are not mutated, future writes normalize to
trimmed-or-null, adversarial database evidence covers blank values, and a separate
data-quality observation retains the legacy issue. Preserving blank rows is blocked
under the confirmed label because it would falsely present absence as recorded data.

## Options considered

### Option A — selected: closed data-presence profile

- Summary: count existing balance rows with nonblank trimmed lot data or a recorded
  expiry date, using one static parameterized predicate for dashboard, page, and
  export.
- Benefits: truthful row grain and label; exact scope/ownership parity; includes all
  quantity signs; bounded search/export; no policy invention; reversible without a
  migration.
- Failure modes: whitespace lots can be misclassified; copied predicates can drift;
  relation mismatch can leak data; users can mistake presence for compliance; or
  request-driven SQL construction can create injection or query-plan risk.
- Why selected: trim-aware membership, shared static SQL, explicit non-compliance
  copy, ownership fixtures, and future-write normalization control those risks while
  preserving the useful signal.

### Option B — rejected: lot/expiry policy-compliance profile

- Summary: evaluate whether inventory items that should be lot- or expiry-tracked
  have complete, correct, accountable records.
- Benefits: potentially stronger operational assurance and exception ownership.
- Failure modes: no confirmed requiredness matrix, item policy, completeness rule,
  accountability owner, exception lifecycle, or historical correction standard
  exists. The result would invent compliance policy and could misclassify stock.
- Why rejected: data presence cannot substitute for an approved tracking-compliance
  model. Compliance/coverage requires a separate material decision.

### Option C — rejected except as fail-safe: defer or disable the destination

- Summary: leave the signal without a drilldown until a broader lot-tracking model is
  approved.
- Benefits: avoids accidental compliance claims.
- Failure modes: withholds a safe data-presence view that can be delivered without
  changing policy or inventory state.
- Why rejected: Option A is bounded and truthful. Disablement remains mandatory if
  predicate, authorization, export, SQL-safety, or visible-copy gates fail.

## Decision scorecard

| Criterion | Weight | Option A | Option B | Option C |
|---|---:|---:|---:|---:|
| Operational correctness and control | 30% | 5 | 1 | 4 |
| Business value | 20% | 4 | 4 | 1 |
| User adoption and branch usability | 15% | 4 | 3 | 1 |
| Delivery effort and risk | 15% | 4 | 1 | 5 |
| Maintainability and scalability | 10% | 5 | 2 | 3 |
| Operating cost | 5% | 5 | 2 | 5 |
| Reversibility | 5% | 5 | 2 | 5 |
| **Weighted total** | **100%** | **4.50 / 5** | **2.10 / 5** | **3.10 / 5** |

Option B fails the policy-authority and truthful-meaning hard gates. Option C is a
valid fail-safe but does not meet the operational destination outcome while Option A
can satisfy all hard gates.

## Hard-gate assessment

- **Tenant, company, and location isolation:** dashboard count, page, and export use
  only the current session's canonical tenant, company, and selected location.
- **Relation ownership:** each balance row must belong through an active
  `InventoryLocation`, with exact tenant/company/location ownership parity across
  Location, Item, Item Category, and base UOM relations. Malformed or cross-scope
  relations are excluded.
- **Exact data truth:** grain is an existing `InventoryBalance` row. Membership is
  `(trimmed lot is nonblank) OR (expiry date is recorded)` for positive, zero, and
  negative quantities. Blank-only lot with no expiry is excluded.
- **Server-enforced authorization:** existing balance-view permission authorizes
  profile reads; existing export permission independently authorizes export. Ledger
  navigation independently authorizes current access and scope.
- **SQL safety:** query shape is closed and static. Only parameter values enter
  `Prisma.sql`; no request-driven raw fragment, identifier, operator, predicate, or
  ordering construction is allowed.
- **Inventory integrity:** the profile is read-only and posts no movement or balance
  change. Future-write normalization changes only how new lot text is stored; it
  does not rewrite legacy rows or change quantity, ledger, approval, or posting
  semantics.
- **Meaning and adoption:** visible language states data presence and `Not recorded`.
  It must not claim tracking compliance, coverage, accountability, traceability,
  completeness, historical state, or automated replenishment.
- **Recovery and reversibility:** the profile can be disabled without changing
  source records. No schema or index is authorized without reviewed PostgreSQL
  query-plan evidence.

## Required safeguards

- Register exactly `lot-expiry-data-v1` in an exhaustive server-owned Inventory
  profile dispatcher. Require exact cardinality for `dashboard`, optional `q`, and
  optional `page`; reject missing, empty, duplicate, unknown, stale, or unsupported
  inputs before profile data access.
- Reject raw tab, scope, quantity, lot, expiry, status, order, and generic filter
  overrides rather than ignoring them or falling back to ordinary Inventory.
- Build one static parameterized `Prisma.sql`/CTE predicate shared by dashboard
  no-search count, exact profile count/page, and export. Do not concatenate request
  input or select query fragments from request values.
- Enforce exact scope, active Inventory Location, Location/Item/Category/UOM relation
  ownership, and `(NULLIF(BTRIM(lot), '') IS NOT NULL OR expiryDate IS NOT NULL)` or
  its exact parameterized equivalent. Do not add a quantity-sign condition.
- Normalize `q`, cap it at 120 characters, and allow it only as an additive search
  over approved visible fields. Search cannot alter scope or membership.
- Use the label `Rows with lot or expiry data`. Display absent lot or expiry fields
  as `Not recorded`. Include explicit help text that the profile is current live
  data presence, not compliance, coverage, accountability, traceability, or a
  historical snapshot.
- Keep the profile read-only. It exposes no lot correction, expiry correction,
  movement, balance edit, adjustment, transfer, purchasing, receiving, posting, or
  replenishment authority.
- Use deterministic server ordering with `id` as the final tie-breaker for stable
  page and export behavior.
- Reauthorize existing export permission. Apply the configured
  `reporting.export.max_rows` with exact count preflight and a `maxRows + 1` race
  guard; return a safe `413` and no file when either check exceeds the cap. Never
  truncate silently.
- Emit profile-aware export start/success/failure audit containing only safe
  aggregate metadata. Exclude search text, lot values, expiry values, row/item/
  location identifiers, payloads, SQL/database errors, and stack traces.
- Preserve canonical profile/search/page return context through ledger navigation.
  The ledger route must independently authorize the actor and selected scope; the
  profile link is not a capability.
- At future inventory movement and balance lot-write boundaries, trim lot text and
  persist null when the trimmed result is empty. Preserve legacy rows unchanged.
  Record blank-lot legacy data quality as a separate follow-up observation rather
  than including blank-only rows in this profile.
- Test positive, zero, and negative quantities; lot-only, expiry-only, both, neither,
  blank, whitespace, and trimmed lot values; duplicate/multi-row item cases; inactive
  and malformed relations; cross-scope isolation; strict parameters; search bounds;
  SQL-shape safety; dashboard/count/page/export parity; deterministic paging;
  permission denial; export cap/race/no-partial/audit redaction; ledger return; future
  write normalization; legacy non-mutation; and safe disabled fallback.
- Do not add a migration or index until representative PostgreSQL
  `EXPLAIN (ANALYZE, BUFFERS)` and volume evidence is reviewed and a separate
  migration decision is confirmed.

## Implementation and documentation impact

- Code / architecture: add `lot-expiry-data-v1` to the exhaustive Inventory profile
  dispatcher; use one static parameterized CTE/predicate for dashboard, page/count,
  and export; normalize future lot writes at authoritative movement/balance write
  boundaries.
- Data / schema: no migration, index, backfill, or legacy-row mutation in this
  checkpoint.
- Workflow / permissions: no new permission, compliance policy, exception owner,
  correction workflow, replenishment, posting, or ledger authority.
- UI / mobile: add a read-only, paginated live data-presence profile with strict
  parameters, bounded search, `Not recorded`, explicit non-compliance copy,
  empty/error/denied states, and independently authorized ledger return continuity.
- Reporting: bounded profile export uses exact predicate/order parity, configured
  cap, count/race guards, safe `413`, no partial file, and aggregate-only audit.
- Knowledge base / training: Dunong must assess the data-presence meaning, blank-lot
  exclusion, `Not recorded`, non-compliance warning, export bounds, and ledger
  navigation after implementation labels and behavior are verified.
- Tests / UAT: focused service/route/UI/export/write-normalization and authorization
  tests are required. PostgreSQL fixtures/query plans, authenticated responsive
  browser, hosted recovery, and UAT remain production gates.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement `lot-expiry-data-v1`, static shared predicate, strict parameters, paging, and truthful copy | Backend + Frontend Engineering | Current Inventory checkpoint | Complete locally |
| Normalize future movement/balance lot writes to trimmed-or-null without legacy rewrite | Backend + Data Engineering | Current checkpoint | Complete locally |
| Implement bounded export parity, safe `413`, aggregate audit, and ledger return continuity | Backend + QA | Current checkpoint | Complete locally |
| Record and assess blank-lot legacy data-quality observations separately | Product + Data owner | Before any compliance/coverage claim | Pending follow-up |
| Execute PostgreSQL relation/membership/query-plan fixtures | Database + QA | Before production-readiness claim | Pending / NO-GO |
| Verify authenticated desktop/tablet/mobile, hosted recovery, and UAT | Product + Security + Release | Before workspace/production completion | Pending / NO-GO |
| Assess user guidance, release summary, and training impact | Dunong | After verified implementation | Complete; role briefing only, no separate course |

## Evidence

- The Decision Chair confirmed Option A after the challenge round, including exact
  row membership, ownership scope, static SQL, strict parameters, non-compliance
  meaning, future-write normalization, legacy preservation, and no-migration gates.
- Round 1 produced unanimous Option A recommendations. Reporting/Product and UX
  recommended trimming and excluding blank-only lots; Security recommended
  preserving and flagging them. In challenge, Security accepted trim-and-exclude
  under the confirmed safeguards. Preserve-and-flag remains blocked under the
  data-presence label because blank-only text is absence, not recorded lot data.
- Requested Code Spark and exact GPT-5.4 models were unavailable in the active
  toolset. The closest permitted GPT-5.6 Reporting/Product, UX, Security, and
  documentation fallbacks were used without relaxing hard gates.
- `DEC-0055` establishes closed, server-owned dashboard-profile semantics and exact
  dashboard/list/count/page/export parity.
- `DEC-0231` and `DEC-0232` establish the adjacent exhaustive Inventory profile,
  strict parameter, bounded export, relation-ownership, and live read-only patterns.
- `lot-expiry-data-v1` is implemented through one static parameterized `Prisma.sql`
  scope/membership query shared by dashboard count, profile count/page, and export.
  Membership is trimmed nonblank lot or recorded expiry across all quantity signs.
- Overview labels the section `Stock balance signals`; its card and exact link use
  the confirmed data-presence wording. The Inventory profile shows `Not recorded`
  for absent fields, styles negative quantities distinctly, preserves strict
  profile/search/page and ledger-return context, and provides bounded redacted
  export behavior.
- `postInventoryMovement` now stores future movement and balance lot values as
  trimmed text or null. Existing legacy rows are not rewritten, and the separate
  blank-lot data-quality observation remains open.
- The authored PostgreSQL fixture covers lot-only, expiry-only, both, positive,
  zero, negative, whitespace exclusion, zero-valued cross-scope/inactive/mismatched
  relations, stale permission denial, and no mutation. It is unexecuted and provides
  no PostgreSQL or production evidence.
- Directly relevant coverage passes 86/86: Inventory service 32, dashboard service
  30, Inventory page 4, ledger 7, export 5, and dashboard page 8. The broader
  Inventory-filter run passed 130/130 before the additional normalization behavior
  test. The complete non-database web suite passes 1,411 tests with 305 skipped and
  one existing TODO across 129 passed/11 skipped files; web typecheck, lint, E2E
  typecheck, production build, secret review, the 20/20 authorization manifest, and
  diff hygiene pass.
- Final independent Security and UX re-reviews returned GO with C0/H0/M0. The
  disposable procurement/inventory runner failed closed before database creation
  with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`; PostgreSQL/query-plan,
  authenticated E2E, responsive browser, hosted recovery, and UAT remain pending.
  No schema, migration, index, permission, or training-workflow change was
  introduced.
- The confirmed challenge-round resolution and GPT-5.6 fallback remain the decision
  basis; requested Code Spark and exact GPT-5.4 models were unavailable.

## Supersession

Not superseded. Any later change to row grain, lot trimming, expiry membership,
quantity signs, scope/ownership, SQL shape, search, ordering, export, audit,
permission, ledger navigation, or data-presence meaning must version or explicitly
supersede `lot-expiry-data-v1` rather than silently changing it.
