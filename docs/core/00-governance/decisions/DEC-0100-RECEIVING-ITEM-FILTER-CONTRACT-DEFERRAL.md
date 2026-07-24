# DEC-0100 — Receiving Item-Filter Contract Deferral

## Metadata

- Decision ID: `DEC-0100`
- Title: Receiving item-filter contract, CSV grain, and query-plan gate
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: Receiving / Inventory and Reporting workstreams
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Receiving register and ordinary CSV export
- Related decision brief: Parent-agent Receiving item-filter contract review (confirmed 2026-07-24)
- Related decisions: `DEC-0094`, `DEC-0096`

## Decision

Keep the Receiving item filter non-operative: do not add an `itemId` URL parameter, selector, page predicate, count behavior, pagination behavior, or ordinary CSV behavior until the product/reporting owner confirms the intended reporting grain and a reviewed implementation/query plan is available. The decision must explicitly choose between receipt-level matching with all receipt lines in the export and matching-line grain; it must also document the scoped `GoodsReceiptLine` relation, option-loading bounds, rows/counts/tabs/pages/CSV parity, and representative PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)`/volume evidence. A future activation requires a new confirmed implementation decision.

## Context

The ordinary Receiving register is receipt-grain: its rows, statuses, suppliers, locations, discrepancies, and audit context describe a Goods Receipt. An item filter can either select receipts that contain a matching line while retaining complete receipt context, or change the result/export grain to matching receipt lines. Those choices produce different counts, pagination, duplicate handling, CSV headers, and reconciliation expectations. The current register contract has no approved answer, and an unbounded item catalog or line hydration could leak records or regress performance. `DEC-0096` therefore deferred the filter; this record formalizes the activation gate and required evidence.

## Options considered

### Option A — Receipt-level match, export all lines (future candidate; not activated)

- Summary: Select a receipt when any authorized `GoodsReceiptLine` matches the item; retain one receipt-grain row and export the complete receipt header and all lines.
- Benefits: Preserves supplier, location, discrepancy, status, and audit context for reconciliation; keeps the register's receipt grain stable.
- Failure modes: Larger exports; users may expect nonmatching lines to be excluded; the relation query must deduplicate receipts and preserve exact counts/pages.
- Why not activated: Product/reporting must confirm this is the intended CSV contract and query-plan/volume evidence is still required.

### Option B — Receipt-level match, export matching lines only (future candidate; not activated)

- Summary: Select receipts containing a matching line but emit only matching lines in ordinary CSV, with explicit receipt identity/header fields.
- Benefits: Compact item-focused export while retaining receipt identity.
- Failure modes: Omits nonmatching line context, can mislead reconciliation, and creates ambiguity about line totals, pagination, and count semantics.
- Why not activated: The reporting grain and completeness expectations are unresolved.

### Option C — Matching-line register and CSV grain (future candidate; not activated)

- Summary: Treat each matching GoodsReceiptLine as a result row and make counts/pages/CSV line-grain.
- Benefits: Direct item analysis and intuitive line-level filtering.
- Failure modes: Changes the existing receipt-grain workspace, duplicates receipt headers, complicates statuses/discrepancies and mobile behavior, and may expose line-level costs or quantities beyond the existing register contract.
- Why not activated: It is a materially different workspace/reporting product requiring separate UX, authorization, and reporting approval.

### Option D — Defer item filter until contract and evidence close (selected)

- Summary: Keep item filtering absent and non-operative while preserving the Phase A supplier/PO contract and explicit deferred-control messaging.
- Benefits: Prevents misleading visible behavior, protects receipt-level audit context, avoids unbounded option/query work, and keeps all current outputs consistent.
- Failure modes: Users cannot filter the register by item yet; a future product decision and implementation slice remain necessary.
- Why selected: It is the only option that does not invent reporting semantics or weaken current authorization/performance gates.

## Hard-gate assessment

- **Tenant/company/brand/location isolation:** Item options and line predicates must be derived from the already authorized Goods Receipt population, not from a broad item directory. Every join must preserve tenant/company/location scope.
- **Authorization and confidentiality:** Rows, counts, tabs, pagination, and ordinary CSV must share one server-owned predicate. Existing list/export permissions remain distinct; item filtering cannot reveal unauthorized receipt lines, quantities, or costs.
- **Reporting grain and data integrity:** The selected grain must define deduplication, count totals, pagination, CSV headers, complete versus matching lines, and multi-line receipt behavior. No silent change to receipt reconciliation semantics is allowed.
- **Visible-surface truthfulness:** No item selector, operative query parameter, range hint, or export promise is shown while the contract is open.
- **Performance:** Representative PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` and volume evidence must cover option loading, page rows, counts, pagination, and ordinary CSV. N+1 line reads and unbounded browser filtering are prohibited.
- **Recovery and scope discipline:** This is read-only and reversible. No schema/index or persisted aggregate is authorized without a separate reviewed migration and rollback plan.

## Required safeguards and evidence

- Obtain written product/reporting approval of the result grain and CSV contract: receipt-level match/all lines, receipt-level match/matching lines, or a separately scoped line-grain workspace.
- Document the authoritative `GoodsReceiptLine` → item relation, tenant/company/location joins, status/date/search interaction, deterministic ordering, and deduplication rule.
- Bound item option loading with authorized receipt-derived search and selected-value retention; do not enumerate all tenant items or hydrate all receipt lines in the browser.
- Implement one parameterized predicate and reuse it for page rows, tab counts, pagination links, and ordinary CSV. Add explicit parity tests for multi-line receipts and no-match/empty states.
- Provide representative PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)`/volume evidence and review any required index or schema migration before activation.
- Test malformed/foreign item IDs, scope denial, unauthorized export, line-level redaction, mixed statuses, duplicate receipt matches, pagination/count parity, CSV grain, mobile filter behavior, and timeout/error states.
- Keep accepted-value filtering under its independent Phase C authorization, aggregate, currency/null-cost, and query-plan decision (`DEC-0097`).

## Implementation and documentation impact

- **Code / architecture:** No code or filter-contract change now. Future implementation must extend the normalized Receiving register contract and shared predicate only after product and query evidence gates close.
- **Data / schema:** No schema change now. Any new index or projection requires a reviewed data-safety and rollback decision.
- **Workflow / permissions:** No lifecycle, posting, or approval change; existing receiving list/export authorization remains unchanged.
- **UI / mobile:** Keep item controls absent or explicitly marked pending; do not ship a passive selector. Future controls must work on responsive filter surfaces.
- **Reporting:** CSV grain, receipt context, counts, and pagination are intentionally unresolved until product confirmation.
- **Knowledge base / training:** Do not promise item filtering or item-specific exports until activation is approved and verified.
- **Tests / UAT:** Require focused service/route parity, disposable PostgreSQL query-plan/volume, responsive-browser, and production-readiness evidence.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Confirm receipt-level versus matching-line result and CSV grain | Reporting/product owner | Before item filter implementation | Open prerequisite |
| Document scoped GoodsReceiptLine relation, dedupe, and option bounds | Receiving / Data engineering | After product confirmation | Open prerequisite |
| Produce reviewed PostgreSQL EXPLAIN and representative volume evidence | Data engineering + QA | Before URL/UI activation | Open prerequisite |
| Record activation decision and update Receiving UI/spec, plan, glossary, and KB | Mithi + Dunong + Receiving engineering | After all prerequisites | Deferred |
| Keep accepted-value contract under DEC-0097 Phase C gate | Reporting + Data engineering | Independent future phase | Deferred |

## Evidence

- `DEC-0094-RECEIVING-REGISTER-FILTER-CONTRACT.md`: normalized server predicate and Phase A supplier/PO behavior.
- `DEC-0096-RECEIVING-REGISTER-ITEM-FILTER-DEFERRAL.md`: initial item-filter deferral and required product/query evidence.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md`: remaining item relation, CSV, query-plan, browser, and hosted gates.
- Parent-agent independent workflow, security, data, reporting, and UX review on 2026-07-24. Requested Code Spark/GPT-5.4 reviewer identifiers were unavailable; the closest permitted GPT-5.6 fallback was used without relaxing hard gates.

## Supersession

This record refines and confirms the item-filter deferral in `DEC-0096`; it does not activate item filtering or supersede the broader Phase A contract in `DEC-0094`.
