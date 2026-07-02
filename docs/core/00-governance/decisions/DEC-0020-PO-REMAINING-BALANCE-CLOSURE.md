# Decision Record — PO Remaining Balance Closure

## Metadata

- Decision ID: `DEC-0020`
- Title: PO Remaining Balance Closure
- Status: `Confirmed`
- Date: 2026-06-30
- Decision owner: Mithi
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Purchase Orders and Receiving
- Related decision brief: PO amendment and closure after partial receiving

## Decision

Implement approval-backed remaining-balance closure for partially received Purchase Orders. Do not implement full PO amendment in this slice.

## Context

Phase I receiving can leave a PO partially received with outstanding quantities. Operations needs a controlled way to close supplier commitment when remaining delivery will not arrive, while preserving received quantities, supplier history, inventory integrity, and segregation of duties.

## Options considered

### Option A — rejected

- Summary: Build full PO amendment for open and partially received POs.
- Benefits: Broader supplier commitment editing.
- Failure modes: High risk of changing ordered quantities after receipts, confusing audit, and weakening approval controls.
- Why rejected: Too large for the current stabilization slice and harder to reverse.

### Option B — selected

- Summary: Add controlled remaining-balance closure for `PARTIALLY_RECEIVED` POs only.
- Benefits: Solves the immediate operational need, preserves received quantities, and clearly distinguishes `FULLY_RECEIVED` from supplier-commitment closure.
- Failure modes: Users may treat closure as receiving completion unless reports and labels are clear.
- Why selected: Smallest controlled option that satisfies the hard gates.

### Option C — deferred

- Summary: Defer all post-receiving PO commitment changes.
- Benefits: No new workflow risk.
- Failure modes: Leaves stale partially received POs open indefinitely.
- Why rejected: Operations needs a closure path after confirmed partial delivery.

## Hard-gate assessment

- Tenant, company, and location scope remain enforced in service queries.
- Closure request requires `purchasing.purchase_order.close_remaining`; approval requires assigned approval authority and `purchasing.purchase_order.approve`.
- Self-approval is blocked for the closure requester, PO creator, PR requester, and quote recommendation preparer.
- Approval applies the transition in one transaction and revalidates PO status, outstanding quantities, and draft receiving reports.
- No inventory movement is created; received quantities and inventory ledger history remain unchanged.
- `FULLY_RECEIVED` and `CLOSED` remain distinct statuses.

## Required safeguards

- Eligible only for `PARTIALLY_RECEIVED` POs with outstanding quantity.
- Block when any non-posted Receiving Report exists.
- Block duplicate pending closure requests for the same PO.
- Require reason and supplier notice reference or unavailable explanation.
- On approval, add remaining quantities to `cancelledQty`, set PO status to `CLOSED`, and audit both closure approval and PO closure.
- Return or rejection closes only the closure request, not the PO.

## Implementation and documentation impact

- Code / architecture: Add `PurchaseOrderBalanceClosure` workflow integrated with the approval engine.
- Data / schema: Add closure table, `CLOSED` PO status, and approval document type `PurchaseOrderBalanceClosure`.
- Workflow / permissions: Add `purchasing.purchase_order.close_remaining`.
- UI / mobile: PO detail shows closure request controls and closure history.
- Reporting: PO lists and exports must preserve status distinction between `FULLY_RECEIVED` and `CLOSED`.
- Knowledge base / training: Add user guidance before release.
- Tests / UAT: Cover closure eligibility guards, supplier evidence requirement, and receiving exclusion for closed POs.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Add user-facing knowledge-base guidance for PO balance closure | Dunong | Before release notes | Complete — see `docs/knowledge-base/purchasing/understanding-purchase-order-statuses.md` |
| Decide full PO amendment semantics | Mithi / Decision Chair | Future amendment request | Deferred |

## Evidence

- Subagent deliberation consensus selected controlled approval-backed closure.
- Purchase order service tests cover closure eligibility, supplier notice evidence, and snapshot calculation.
- Receiving service accepts only `ISSUED` and `PARTIALLY_RECEIVED`, so `CLOSED` POs are not receivable.
- User-facing PO status guidance now explains `CLOSED`, remaining-balance closure, and the distinction from receiving.

## Supersession

Not superseded.
