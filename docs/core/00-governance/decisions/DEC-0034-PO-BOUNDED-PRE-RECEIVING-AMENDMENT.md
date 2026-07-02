# DEC-0034 — Bounded Pre-Receiving Purchase Order Amendment

**Status:** Accepted  
**Date:** 2026-06-30  
**Scope:** Phase I purchasing controls

## Decision

Implement a bounded controlled Purchase Order amendment workflow for `ISSUED` Purchase Orders before receiving starts.

The implemented amendment may change only:

- existing line ordered quantity
- existing line unit price
- existing line note
- expected delivery date

It must not change supplier, delivery location, item substitution, line add/delete, payment terms, freight, tax policy, received quantities, inventory, or finance state.

## Rationale

The Phase I purchasing workflow requires material PO changes to use an amendment and re-approval path. A full post-receiving amendment workflow affects receiving variances, inventory ledger reconciliation, supplier commitments, approvals, and potential finance integration. The safe Phase I slice is therefore limited to issued POs with no Receiving Report and no received quantity.

## Controls

- Request requires `purchasing.purchase_order.amend`.
- Approval uses `PurchaseOrderAmendment` approval instances and existing no-self-approval controls.
- Request requires reason plus supplier notice reference or unavailable explanation.
- Request stores before and proposed snapshots.
- Pending request moves the PO to `AMENDMENT_PENDING`, which blocks receiving.
- Approval applies the stored proposal transactionally and returns the PO to `ISSUED`.
- Return or rejection restores `ISSUED` without mutating PO lines.
- No inventory movement, balance update, receiving report, or finance posting is created by amendment.

## Deferred

Full post-receiving amendment and supplier/location/line-add/delete/substitution/payment-term amendment remain deferred controlled transitions.

## Required Tests

- Amendment blocked unless PO is `ISSUED`.
- Amendment blocked when any Receiving Report exists or any received quantity is present.
- Amendment blocked while remaining-balance closure or another amendment is pending.
- Proposal must include the exact current line set.
- Totals are recalculated server-side.
- Receiving is blocked while status is `AMENDMENT_PENDING`.
- Approval applies changes atomically with audit history.
- Return/rejection restores `ISSUED` without line mutation.
