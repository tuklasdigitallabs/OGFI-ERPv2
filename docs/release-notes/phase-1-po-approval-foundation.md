# OGFI ERP Release Notes — Phase I PO Approval Foundation

**Superseded by:** `docs/release-notes/phase-i-phase-1-5-release-readiness-summary.md` for current Phase I and Phase 1.5 readiness guidance. This historical note describes an earlier PO approval foundation slice and should not be used as the latest release summary.

**Release date:** Pending Phase I stabilization  
**Audience:** Purchasing users, approvers, branch/location managers, administrators  
**Affected locations / roles:** Users with scoped Purchase Order view, create, submit, approve, issue, cancel, receiving, inventory, transfer, or stock-count permissions

## What changed

- Purchase Orders now have a detail page showing supplier, source Purchase Request, selected quote, lines, totals, status, and audit history.
- Authorized users can submit a draft Purchase Order for approval.
- Assigned approvers can approve, return, or reject a pending Purchase Order.
- Authorized users can record supplier issue/send from an approved Purchase Order and record re-send evidence for an issued PO.
- Authorized users can cancel draft, approved, or issued POs before any Receiving Report exists. Cancellation requires reason, requires supplier notice evidence or explanation for issued POs, clears open line quantities, and does not update inventory.
- Returned and rejected PO remarks appear in the PO audit history.
- The Purchase Orders list now supports search, status, expected-delivery date, amount range, approver filtering, and scoped CSV export.
- Receiving users can create and post Receiving Reports from issued POs; accepted quantities create inventory receipt movements and update balance cache.
- Inventory users can view current-location Stock Balances and recent Inventory Ledger movements.
- Transfer users can create, submit, dispatch, receive, view, and cancel controlled transfer records.
- Inventory users can schedule, start, enter, submit, and review physical stock counts without variance posting.
- Inventory users can log, submit for approval, approve, return, reject, post, reverse, cancel, view, and export Wastage Reports. Posting approved wastage creates `WASTAGE_OUT` inventory movements, and reversing posted wastage creates linked `REVERSAL` movements.
- Scoped CSV exports are available for Receiving Reports, Stock Balances, Inventory Ledger, Transfers, Stock Counts, and Wastage Reports.

## What you need to do

- Purchasing users should review the PO detail page before submitting a draft PO.
- Approvers should use the approvals queue for assigned PO decisions and enter clear remarks when returning or rejecting.
- Administrators should confirm PO and Wastage submit/approve permissions are assigned only to appropriate scoped roles.

## Important notes

- Supplier issue/send is released as an audited status transition to `ISSUED`; it does not send automated email by itself.
- PO cancellation is released only before receiving starts. POs with any Receiving Report or received quantity cannot be cancelled in this slice.
- Approved POs do not create receiving records or inventory ledger movements. Issued POs can be received through the Receiving page.
- Receipt reversal, attachment enforcement, and advanced inspection/discrepancy resolution are not released yet.
- Transfer requests can now be dispatched from the authorized source location and received at the authorized destination location, creating paired `TRANSFER_OUT` and `TRANSFER_IN` movements for exact transfers. Partial receipt, discrepancy, and reversal handling are not released yet.
- Stock count variances are review-only; they do not create `COUNT_VARIANCE_*` movements or update balances yet.
- Approved Wastage Reports do not change stock until an authorized user runs the separate `Post Wastage` action. Posted Wastage Reports can be reversed with reason; backdated wastage is not released yet.
- Users cannot approve their own PO, the source Purchase Request they requested, or the supplier recommendation they prepared.
- PO rejection-status semantics are confirmed in `DEC-0008`; approval rejection remains PO status `CANCELLED` with rejection evidence in approval and audit history.

## Learn more

- `docs/knowledge-base/purchasing/understanding-purchase-order-statuses.md`
- `docs/knowledge-base/purchasing/receiving-issued-purchase-orders.md`
- `docs/knowledge-base/warehouse-inventory/viewing-stock-balances.md`
- `docs/knowledge-base/warehouse-inventory/viewing-inventory-ledger.md`
- `docs/knowledge-base/warehouse-inventory/creating-transfer-requests.md`
- `docs/knowledge-base/warehouse-inventory/running-stock-counts.md`
- `docs/knowledge-base/warehouse-inventory/logging-wastage.md`

## Support

Raise implementation or UAT issues through the Phase I project tracker or the assigned ERP administrator.
