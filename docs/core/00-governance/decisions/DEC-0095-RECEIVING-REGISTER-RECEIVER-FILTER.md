# DEC-0095 — Receiving Register Receiver Filter

## Metadata

- Decision ID: `DEC-0095`
- Title: Receiving register receiver filter and historical option contract
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: Receiving / Inventory workstream
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Receiving register and exports
- Related decision brief: Parent-agent Receiving receiver-filter council review (confirmed 2026-07-24)

## Decision

Phase B will add an exact server-owned `receivedByUserId` filter to the ordinary Receiving register. Receiver options will be derived from receipts in the current authorized scope, will include inactive historical receivers when they occur on an in-scope receipt, and will use one shared predicate for rows, counts, tabs, pagination, and ordinary CSV export. The item filter remains deferred until the reporting/product owner confirms whether item-filtered CSV returns matching lines or the full receipt context and a separate relation/query-plan decision is recorded. Accepted-value filtering remains deferred to Phase C.

## Context

The Phase A Receiving register contract (`DEC-0094`) established server-owned supplier and Purchase Order filters and intentionally deferred receiver, item, and accepted-value refinements. Receiver filtering is now sufficiently bounded if it uses the receipt's authoritative `receivedByUserId` relation rather than a client-supplied name or a broad user directory. Historical receipts may legitimately reference users who are no longer active, so option loading must not silently remove those values or make existing records impossible to find. The filter must preserve the ordinary register's authorization, pagination, count, tab, and CSV parity.

## Options considered

### Option A — Receipt-derived exact receiver filter (selected)

- Summary: Add `receivedByUserId` to the normalized Receiving register contract; load distinct receivers from the already authorized receipt population, retain inactive users represented by those receipts, and reuse the predicate across every ordinary list/export path.
- Benefits: Uses the source-of-truth receipt relationship, preserves historical discoverability, avoids broad user enumeration, and keeps rows/counts/tabs/pages/CSV consistent.
- Failure modes: A large historical population could make option loading expensive; inactive labels may require a clear status indicator; a caller could accidentally use a different predicate in one output path.
- Why selected: It satisfies the scope and visible-surface gates with a bounded, read-only query and no schema change while preserving historical operational evidence.

### Option B — Active-user directory selector (rejected)

- Summary: Populate the receiver selector from currently active users with receiving-related permissions or assignments.
- Benefits: Simple option query and familiar active-user labels.
- Failure modes: Omits historical receivers, can enumerate users outside the receipt population, and may diverge from the authoritative receipt relation or scope.
- Why rejected: It weakens historical searchability and risks authorization/data-minimization errors.

### Option C — Item and receiver filters together, with item-matched CSV lines (deferred/rejected for this phase)

- Summary: Add both selectors immediately and have CSV contain only lines matching the selected item.
- Benefits: Appears to complete the documented refinement list and produces compact item-focused exports.
- Failure modes: Item relation/query cost is not yet evidenced; line-only CSV can omit receipt headers, discrepancies, supplier context, and audit-relevant information; page rows and export semantics could diverge.
- Why deferred: The reporting/product owner must confirm the authoritative item relation and whether filtered CSV is line-matched or full-receipt context before implementation.

## Hard-gate assessment

- **Tenant/company/brand/location isolation:** Receiver IDs are constrained by the existing authorized receipt population and current tenant/company/location scope; no directory-wide option query may widen visibility.
- **Authorization:** The normalized receiver predicate is shared by rows, counts, tabs, pagination, and ordinary CSV. Existing read authorization remains unchanged: action-only users may list where currently permitted, while ordinary export continues to require `receiving.view`.
- **Data integrity and audit:** The filter is read-only and does not alter receipt, PO, inventory, or audit state. Historical inactive receiver values remain discoverable without reactivating or mutating users.
- **Visible-surface truthfulness:** The receiver control is rendered only when backed by the confirmed server behavior. Inactive options must be visibly identified; no item or accepted-value control is rendered while its decision remains open.
- **Performance and recovery:** Option loading is receipt-derived and bounded according to the register's established option-loading safeguards. The shared predicate and deterministic pagination prevent rows/counts/export drift; item filtering requires separate query-plan evidence.
- **Phase scope:** This decision is limited to the ordinary Phase I Receiving register and does not change receiving workflow authority, receiver assignment, or user lifecycle semantics.

## Required safeguards

- Parse `receivedByUserId` as a UUID in the shared `ReceivingRegisterFilters` contract and reject malformed or foreign IDs with stable user-safe feedback.
- Build the receiver option list from distinct receivers on receipts in the authorized tenant/company/location population. Include selected historical values even when the user is inactive, and label their inactive status without exposing unrelated users.
- Reuse one parameterized receiver predicate for page rows, all applicable tab counts, pagination links, and ordinary CSV. Preserve the active filter in links/forms and keep deterministic ordering.
- Keep action-only list access and `receiving.view` export authorization as separate existing controls; do not infer export permission from the presence of the receiver filter.
- Add tests for malformed/foreign receiver IDs, inactive historical options, scope denial, no-match and empty states, rows/counts/tabs/pages/CSV parity, pagination preservation, and responsive selector behavior.
- Before implementing `itemId`, document the authoritative receipt-line relation, bounded option-loading strategy, and representative `EXPLAIN (ANALYZE, BUFFERS)` evidence. The reporting/product owner must decide whether filtered CSV contains matching lines only or complete receipt context; record that decision separately.
- Keep accepted-value filtering deferred until currency, nullable-cost, cost-visibility, and query-plan semantics are separately confirmed.

## Implementation and documentation impact

- **Code / architecture:** Extend the existing normalized Receiving register filter and shared predicate; add bounded receiver option loading with inactive historical labels.
- **Data / schema:** No schema change. Use the existing `GoodsReceipt.receivedByUserId` relationship and scoped receipt population.
- **Workflow / permissions:** No lifecycle or action-authority change. Existing list and export permissions remain in force.
- **UI / mobile:** Add a working receiver selector that identifies inactive historical users and preserves the filter on responsive list controls. Do not show item or value controls yet.
- **Reporting:** Ordinary CSV uses the same receiver predicate as page rows and counts. Item-filtered CSV semantics require a later reporting decision.
- **Knowledge base / training:** Explain receiver filtering, historical inactive options, and the deferred item/value refinements without promising unsupported export behavior.
- **Tests / UAT:** Extend focused service/route tests and disposable PostgreSQL scope/parity evidence; browser, query-plan, and full release gates remain required before closing the Receiving workspace.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement exact receiver filter and receipt-derived historical options | Receiving / Inventory engineering | Phase B implementation checkpoint | Confirmed for implementation |
| Add rows/counts/tabs/pages/CSV parity and inactive-option tests | QA + Receiving engineering | With Phase B implementation | Required |
| Confirm item relation and item-filtered CSV context semantics | Reporting/product owner | Before item filter implementation | Deferred |
| Record item filter/query-plan decision after product confirmation | Mithi + Receiving/Data engineering | Before Phase B item controls | Deferred |
| Define accepted-value currency/null/cost-visibility semantics | Reporting + Data engineering | Phase C gate | Deferred |
| Update Receiving UI specification, pending plan, glossary, and user guidance | Mithi + Dunong | With each phase checkpoint | Required |

## Evidence

- `DEC-0094-RECEIVING-REGISTER-FILTER-CONTRACT.md`: Phase A shared predicate and explicit receiver/item/value deferral.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md`: Receiving register checkpoints and remaining filter gates.
- `docs/phases/phase-01-procurement-inventory/specs/receiving-ui-spec.md` and `workflows/receiving-transfer-workflow.md`: documented Receiving list/filter/export expectations.
- Parent-agent independent workflow/data/security council review and challenge round on 2026-07-24. Requested Code Spark/GPT-5.4 reviewer identifiers were unavailable; the closest permitted GPT-5.6 fallback was used without relaxing hard gates.

## Supersession

Not superseded.
