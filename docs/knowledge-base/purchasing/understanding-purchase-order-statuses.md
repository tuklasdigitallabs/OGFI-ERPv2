# Understanding Purchase Order Statuses

**Audience / required role:** Purchasing users, approvers, managers, and administrators with scoped Purchase Order access  
**Applies to:** Company and assigned delivery-location scope  
**Related phase/module:** Phase I / Purchase Orders  
**Last verified against:** `docs/core/03-data/ERP_DATA_DICTIONARY.md` and `PHASE1_BUILD_BACKLOG_AND_ACCEPTANCE_CRITERIA.md`

## Purpose

Use this article to understand what each available Purchase Order status means in the current Phase I foundation and which actions are available through approval, supplier issue/send, and receiving.

## Before you begin

- You must have Purchase Order view access for the delivery location.
- Creating a draft PO requires an approved supplier recommendation.
- The selected supplier must have an allowed accreditation status. The DEC-0036 pilot default allows normal PO creation, submission, and issue for `APPROVED` suppliers only; `PENDING_REVIEW`, `SUSPENDED`, and `BLOCKED` suppliers are stopped unless a future controlled exception workflow is implemented.
- Submitting a PO requires `purchasing.purchase_order.submit`.
- Approving, returning, or rejecting a PO requires `purchasing.purchase_order.approve`, assignment to the current approval step, and the correct location scope.
- Recording supplier issue/send or re-send requires `purchasing.purchase_order.issue`.

## Navigation path

`Purchase Orders → View Details`

The ordinary Purchase Orders register is server-paginated and preserves its selected filters while moving between pages; the Open PO dashboard view is a separate read-only population.

## Statuses

| Status | Meaning | Available action |
|---|---|---|
| `DRAFT` | The PO was created from an approved supplier recommendation and has not been submitted for PO approval. | Authorized users may submit it for approval or cancel it before any Receiving Report exists. |
| `PENDING_APPROVAL` | The PO is waiting for the configured PO approval step. | Assigned approvers may approve, return, or reject it. |
| `APPROVED` | The PO passed approval but has not yet been issued/sent to the supplier. | Authorized users may record supplier issue/send or cancel it before any Receiving Report exists. |
| `ISSUED` | The PO has been issued/sent to the supplier. | Authorized users may record a re-send. Receiving users may create a Receiving Report for the assigned delivery location. Authorized users may cancel it before any Receiving Report exists, with supplier notice evidence or an explanation. |
| `PARTIALLY_RECEIVED` | At least one posted Receiving Report has accepted quantity, but one or more PO lines remain outstanding. | Receiving users may create another Receiving Report for remaining quantities, or authorized users may request approval-backed remaining-balance closure when the supplier will not deliver the rest. |
| `FULLY_RECEIVED` | Posted Receiving Reports cover the ordered quantity, net of cancelled quantity. | No further receiving is available unless an authorized full-document receipt reversal restores received quantity. |
| `CLOSED` | A partially received PO was closed through the approved remaining-balance closure workflow. Received quantities stay intact and the outstanding supplier commitment is closed. | No further receiving is available unless an authorized correction or reversal workflow restores an eligible state. |
| `CANCELLED` | The PO was rejected during approval or cancelled before receiving. | No supplier issue/send or receiving action is available from this PO. |

## Steps

1. Open `Purchase Orders`.
2. Use search, status, expected-delivery, amount, and approver filters to find the PO.
3. Select `View Details`.
4. Review the supplier, source Purchase Request, selected quote, lines, totals, status, and audit history.
5. If the PO is `DRAFT` and you have submit access, select `Submit PO for Approval`.
6. If the PO appears in your approval queue and you are the assigned approver, approve it, return it with remarks, or reject it with remarks.
7. If the PO is `APPROVED` and you have issue access, record the supplier issue/send method and recipient or reference.
8. If the PO is `DRAFT`, `APPROVED`, or `ISSUED` and no Receiving Report exists, authorized users may cancel it from the detail page with a required reason. Issued POs also require supplier notice evidence or an explanation.
9. If the PO is `PARTIALLY_RECEIVED`, outstanding quantity remains open until another receipt is posted or an authorized remaining-balance closure is requested, approved, and applied.
10. If the PO is `ISSUED` or `PARTIALLY_RECEIVED` and you have receiving access for the delivery location, open `Receiving` to create and post a Receiving Report.

[Screenshot placeholder: Purchase Order detail page showing status, source lineage, lines, submit button, and audit history.]

## Expected result

- Submitted POs move from `DRAFT` to `PENDING_APPROVAL`.
- Approved POs move to `APPROVED`.
- Issued/sent POs move from `APPROVED` to `ISSUED`.
- Posted Receiving Reports move an issued PO to `PARTIALLY_RECEIVED` or `FULLY_RECEIVED`.
- Approved remaining-balance closure moves an eligible partially received PO to `CLOSED` without creating inventory movements.
- Returned POs move back to `DRAFT`; approver remarks appear in audit history so the requester can correct and resubmit.
- Rejected POs move to `CANCELLED`; the approval instance and audit history preserve the rejection outcome.
- CSV export follows the same scoped filters shown on the Purchase Orders list.

## Important controls and warnings

- A user cannot approve their own PO, the source Purchase Request they requested, or the supplier recommendation they prepared.
- Approval actions are server-enforced by permission, approval-step assignment, company, and delivery-location scope.
- An approved PO is not the same as an issued PO. Supplier issue/send creates audit evidence and changes the PO to `ISSUED`.
- A PO issue/send or re-send does not create a receiving record or inventory ledger movement; posting a Receiving Report is the controlled stock-in action.
- Remaining-balance closure is not receiving. It closes the supplier commitment for outstanding quantities after approval and supplier-notice evidence or explanation.
- Low stock must not automatically create a PO. Warehouse availability and transfer rules still apply before external purchasing.
- PO audit history is retained; important records are not hard-deleted.

## What happens next

After issue/send, the PO is supplier-facing and available to the Receiving page for the scoped delivery location. Accepted quantities from posted receipts create immutable `RECEIPT_IN` inventory movements.

## Related articles

- Reviewing and approving a Purchase Request
- Understanding statuses, audit history, and attachments
- How to export a report
