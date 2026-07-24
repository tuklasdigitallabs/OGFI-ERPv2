# DEC-0094 — Receiving Register Filter Contract

## Metadata

- Decision ID: `DEC-0094`
- Title: Receiving register filter contract and phased option loading
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: Receiving / Inventory workstream
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Receiving register and exports
- Related decision brief: Parent-agent Receiving filter council review (confirmed 2026-07-24)

## Decision

Deliver Receiving register filtering in phases. Phase A implements exact server-owned `supplierId` and `purchaseOrderId` filters, alongside the existing `q`, status, and received-date filters, through one normalized `ReceivingRegisterFilters` contract and predicate builder shared by page rows, tab counts, pagination, and ordinary CSV export. Preserve stable future query parameters without rendering controls that do not yet work. Item, receiver, and accepted-value filters remain explicitly deferred: item and receiver require option/relationship evidence (Phase B), while accepted-value range requires currency, null-cost, and query-plan evidence (Phase C).

## Context

The ordinary Receiving register has server-backed pagination, search, lifecycle/date filtering, scoped counts, and export. Its documented workflow calls for supplier, PO, item, receiver, and value refinements, but exposing controls before their relations, authorization boundaries, and query costs are proven would create misleading or inconsistent surfaces. The implementation must keep every visible filter and export boundary aligned with the same authorized population and avoid client-only filtering or unbounded hydration.

## Options considered

### Option A — Phased server-owned contract with supplier/PO first (selected)

- Summary: Add exact `supplierId` and `purchaseOrderId` filters to a normalized server contract; reuse the same predicate for rows, counts, pagination, and ordinary CSV; defer item, receiver, and value controls until their evidence gates are met.
- Benefits: Closes two high-value header filters without inventing option sources, preserves list/export parity, and keeps the visible UI truthful.
- Failure modes: Users may expect the deferred refinements; future query parameters could be misunderstood if not documented; a caller could accidentally bypass the shared predicate.
- Why selected: It is the smallest production-safe slice and directly satisfies tenant/company/location authorization, pagination, export parity, and visible-surface requirements.

### Option B — Add all documented filters immediately (rejected)

- Summary: Render item, receiver, and accepted-value controls now and implement ad hoc relation/value predicates.
- Benefits: Appears to complete the full filter list quickly.
- Failure modes: Unproven option loading can leak or enumerate records; item/receiver relations may diverge from the authoritative receipt scope; nullable or mixed-currency values can produce misleading results; counts, pages, and CSV can disagree; query plans may regress.
- Why rejected: It violates the visible workflow completion gate and lacks the required authorization, data-definition, and performance evidence.

### Option C — Keep the register client-filtered or defer all refinements (rejected)

- Summary: Continue filtering hydrated rows in the browser or postpone supplier/PO filters with the other refinements.
- Benefits: Minimal implementation effort and no new query contract.
- Failure modes: Unbounded reads, incomplete pages, inaccurate counts/export, browser performance risk, and no server-enforced filter boundary.
- Why rejected: It does not meet the server-backed operational-list gate and leaves already-supported exact filters unnecessarily incomplete.

## Hard-gate assessment

- **Tenant/company/brand/location isolation:** Supplier and PO IDs are resolved and filtered inside the existing server-owned, scoped query; client parameters cannot widen the authorized scope.
- **Authorization:** The same service/data-access predicate is used for rows, counts, pagination, and ordinary CSV. Dashboard follow-up remains a separate closed profile and is not widened by these parameters.
- **Data integrity and audit:** Filters are read-only and do not alter receipt, PO, inventory, or audit state. No new source-of-truth relationship is created.
- **Visible-surface truthfulness:** Only working supplier/PO controls are rendered. Deferred item/receiver/value refinements are disclosed as pending rather than presented as inert controls.
- **Performance and recovery:** Phase A remains bounded by existing pagination and controlled export behavior. Phase B/C require relation, option-loading, null/currency, and query-plan evidence before activation.
- **Phase scope:** The decision is limited to the Phase I ordinary Receiving register; it does not change workflow authority or introduce a generic filter engine.

## Required safeguards

- Parse and normalize `supplierId`, `purchaseOrderId`, `q`, status, and received-date inputs in one `ReceivingRegisterFilters` contract. Reject malformed IDs and invalid dates with stable user-safe feedback.
- Build one parameterized predicate from that contract and reuse it for page rows, tab counts, pagination links, and ordinary CSV export. Preserve active filters in links/forms and keep deterministic ordering.
- Resolve supplier and PO matches only within the current tenant/company and authorized receiving scope; never use client-provided labels as authorization.
- Keep stable future query parameters only as non-operative compatibility inputs until their implementation is confirmed; do not render item, receiver, or value controls before their phase gate closes.
- Phase B must document authoritative item/receiver relations, option loading limits, scope behavior, and mobile interaction before UI activation. Phase C must document accepted-value currency/null semantics and representative `EXPLAIN (ANALYZE, BUFFERS)` evidence before range filtering.
- Add tests for filter normalization, malformed/foreign IDs, scope denial, rows/counts/export parity, pagination preservation, empty/no-match states, and deferred-control visibility. Add query-plan and responsive-browser evidence at the corresponding phase gates.

## Implementation and documentation impact

- **Code / architecture:** Introduce or extend the Receiving register’s shared normalized filter contract and server predicate; ordinary list, counts, pagination, and CSV call the same builder.
- **Data / schema:** No schema change in Phase A. Phase B/C must use existing authoritative relations and obtain a separate decision if a new relation or indexed projection is needed.
- **Workflow / permissions:** No lifecycle or action authority changes; all reads remain server-authorized by existing receiving scope.
- **UI / mobile:** Render supplier and PO selectors only when backed by working server behavior. Explain that item, receiver, and accepted-value refinements are deferred; avoid passive controls.
- **Reporting:** Ordinary CSV uses the same active Phase A filters as page rows and counts. Dashboard follow-up export remains independent.
- **Knowledge base / training:** Explain available Receiving register filters and clearly identify deferred refinements without promising unsupported controls.
- **Tests / UAT:** Extend focused service/route tests and execute disposable PostgreSQL scope/parity evidence; browser and query-plan evidence remain required before closing the Receiving gate.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement Phase A supplier/PO contract and shared predicate parity | Receiving / Inventory engineering | Before Phase A checkpoint | Confirmed for implementation |
| Add focused authorization, counts/pages/export, and visible-surface tests | QA + Receiving engineering | With Phase A implementation | Required |
| Define Phase B item/receiver option sources and relation/query-plan evidence | Receiving / Data engineering | Before rendering Phase B controls | Deferred |
| Define Phase C accepted-value currency/null semantics and query-plan evidence | Receiving / Reporting + Data engineering | Before rendering Phase C controls | Deferred |
| Update Receiving UI specification, pending plan, glossary, and user guidance | Mithi + Dunong | With each phase checkpoint | Required |

## Evidence

- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` Receiving register checkpoints: server pagination, `q`, status/date filters, and explicit item/receiver/value deferral.
- `docs/phases/phase-01-procurement-inventory/specs/receiving-ui-spec.md` and `workflows/receiving-transfer-workflow.md`: documented Receiving list/filter/export expectations.
- `AGENTS.md` §§ 2, 5, 7, and 9: targeted scope, server authorization, operational-list, visible-surface, and verification gates.
- Parent-agent independent council review and challenge round on 2026-07-24. Requested Code Spark/GPT-5.4 reviewer identifiers were unavailable; the closest permitted GPT-5.6 fallback was used without relaxing hard gates.

## Supersession

Not superseded.
