# DEC-0096 — Receiving Register Item Filter Deferral

## Metadata

- Decision ID: `DEC-0096`
- Title: Receiving register item filter and CSV semantics deferral
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: Receiving / Inventory and Reporting workstreams
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Receiving register and exports
- Related decision brief: Parent-agent Receiving item-filter council review (confirmed 2026-07-24)

## Decision

Do not expose or add an operative `itemId` filter to the ordinary Receiving register yet. Before implementation, the product/reporting owner must confirm whether an item-filtered ordinary CSV returns complete receipt context for receipts containing the item or only matching receipt lines. The implementation council must then confirm the scoped `GoodsReceiptLine` relation and bounded option-loading strategy and provide representative PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` evidence. A separate decision is required before the item control, query parameter, or export behavior is released.

## Context

The Receiving register already has a server-owned filter contract and parity requirements for page rows, counts, tabs, pagination, and ordinary CSV. An item selector appears in the documented workflow, but a receipt contains header-level supplier, location, status, discrepancy, and audit context in addition to its lines. Filtering the page by a matching line while emitting only matching lines in CSV could silently remove that context; emitting full receipt context has different query, deduplication, and user-expectation implications. The authoritative relation, scope predicate, option population, and query cost therefore need explicit confirmation before a visible control is added.

## Options considered

### Option A — Defer item filter pending product and query evidence (selected)

- Summary: Keep `itemId` non-operative and absent from the visible filter controls until CSV context semantics, scoped relation/options, and PostgreSQL plan evidence are confirmed in a separate decision.
- Benefits: Prevents misleading exports, avoids unbounded item enumeration or line hydration, preserves the existing shared predicate contract, and keeps the visible surface truthful.
- Failure modes: Users cannot yet narrow the register by item; a future decision and implementation slice remain required.
- Why selected: The unresolved export meaning and data/performance evidence are material and cannot be safely inferred from the current header-level register contract.

### Option B — Filter receipts by `GoodsReceiptLine` and export matching lines only (rejected for now)

- Summary: Add an item selector and return only lines whose item matches.
- Benefits: Compact item-specific output and straightforward line predicate.
- Failure modes: Omits receipt-level context, can confuse reconciliation, may duplicate or collapse receipts inconsistently in page/count results, and lacks demonstrated authorization/query-plan evidence.
- Why rejected for now: Product ownership has not confirmed that line-only CSV is the intended reporting contract.

### Option C — Filter receipts by `GoodsReceiptLine` and export full matching receipts (rejected for now)

- Summary: Select receipts having a matching line while retaining all receipt header and line context in CSV.
- Benefits: Preserves audit and supplier/location context and supports receipt-level reconciliation.
- Failure modes: Larger exports, more complex deduplication and pagination semantics, and potentially expensive relation scans without indexes/plan evidence; users may expect only matching lines.
- Why rejected for now: Requires explicit reporting semantics and representative PostgreSQL plan/volume evidence before commitment.

## Hard-gate assessment

- **Tenant/company/brand/location isolation:** Any future item relation must be joined through the authorized Goods Receipt population and preserve all existing scope predicates; an item catalog query alone is insufficient.
- **Authorization:** Rows, tab counts, pagination, and ordinary CSV must use one parameterized item predicate and the existing read/export authorization boundaries.
- **Data integrity and audit:** This is read-only, but CSV semantics must not remove header/discrepancy/audit context needed to reconcile a receipt.
- **Visible-surface truthfulness:** No item selector or operative URL parameter is presented while its behavior and export meaning remain unresolved.
- **Performance and recovery:** A representative PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` plan on realistic volume, with deterministic ordering and bounded option loading, is required before release. No schema/index change is implied by this record.
- **Phase scope:** The decision is limited to the ordinary Phase I Receiving register and does not change Goods Receipt workflow or inventory posting.

## Required safeguards

- Obtain written product/reporting confirmation of full-receipt-context versus matching-line CSV semantics, including how page rows and counts represent receipts with multiple lines.
- Define the authoritative `GoodsReceiptLine` item relation and scope join. Resolve item options only from the authorized receipt population, with bounded search/selection and selected-value retention; never enumerate the whole item catalog for an unbounded selector.
- Build one shared, parameterized predicate for rows, counts, tabs, pagination, and ordinary CSV. Preserve deterministic receipt ordering and document whether CSV contains all lines or only matching lines.
- Provide PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` evidence for representative item cardinality, receipt-line volume, tenant/company/location scope, and ordinary CSV execution. Add an index only through a reviewed schema decision if the plan requires it.
- Add tests for malformed/foreign item IDs, scope denial, multi-line receipts, page/count/export parity, no-match and empty states, option bounds, and responsive behavior.
- Keep accepted-value filtering independently deferred until its currency, nullable-cost, cost-visibility, and query-plan semantics are confirmed.

## Implementation and documentation impact

- **Code / architecture:** No code or query-contract change in this decision. A future slice must extend the existing normalized Receiving filter contract only after the gates close.
- **Data / schema:** No schema change now. The future relation/index decision must be separately reviewed and migrated if required.
- **Workflow / permissions:** No lifecycle, posting, or authority change.
- **UI / mobile:** Keep the item control absent or clearly documented as pending; do not ship a passive selector.
- **Reporting:** CSV output semantics are intentionally unresolved and must be recorded before implementation.
- **Knowledge base / training:** Do not promise item filtering or item-specific CSV behavior; update enablement only after the future decision is confirmed.
- **Tests / UAT:** Query-plan, disposable PostgreSQL, parity, and responsive-browser evidence are mandatory in the future item-filter checkpoint.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Confirm full-receipt-context versus matching-line CSV semantics | Reporting/product owner | Before item filter implementation | Open prerequisite |
| Document scoped GoodsReceiptLine relation and bounded item options | Receiving / Data engineering | After product confirmation | Open prerequisite |
| Produce representative PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` evidence | Data engineering | Before UI/contract activation | Open prerequisite |
| Record implementation decision and update UI/spec/KB | Mithi + Dunong + Receiving engineering | After all prerequisites | Deferred |
| Keep accepted-value filter under its separate Phase C gate | Reporting + Data engineering | Phase C | Deferred |

## Evidence

- `DEC-0094-RECEIVING-REGISTER-FILTER-CONTRACT.md`: shared register predicate and phased filter gates.
- `DEC-0095-RECEIVING-REGISTER-RECEIVER-FILTER.md`: receiver-specific receipt-derived option contract; item remains separate.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md`: Receiving register filter and query-plan checkpoints.
- Parent-agent independent council review and challenge round on 2026-07-24. Requested Code Spark/GPT-5.4 reviewer identifiers were unavailable; the closest permitted GPT-5.6 fallback was used without relaxing hard gates.

## Supersession

Not superseded.
