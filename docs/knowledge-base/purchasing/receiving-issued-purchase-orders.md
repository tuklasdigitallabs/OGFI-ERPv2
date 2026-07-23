# Receiving Issued Purchase Orders

**Audience / required role:** Storekeeper, receiver, warehouse staff, or authorized manager with receiving permissions  
**Applies to:** Assigned receiving location  
**Related phase/module:** Phase I / Receiving  
**Last verified against:** `receiving-transfer-workflow.md`, `inventory-workflow.md`, and implemented receiving service

## Purpose

Use this article to create and post a Receiving Report from an issued Purchase Order. Posting a receipt records accepted quantities into inventory through the immutable movement ledger.

## Before you begin

- The Purchase Order must be `ISSUED` or `PARTIALLY_RECEIVED`.
- Your role must have receiving create/post access for the location.
- An active inventory location must exist for the receiving location.
- Rejected, damaged, or short quantities require a discrepancy reason.
- Rejected, damaged, or short quantities require a discrepancy evidence reference.
- Delivered and accepted quantities cannot exceed the remaining open PO quantity without a future approved exception workflow.

## Navigation path

`Receiving → Create Draft Receipt → Post Receipt`

## Steps

1. Open `Receiving`.
   The ordinary register is server-paginated. Use the `All`, `Draft`, `Posted`, or `Discrepancies` tabs, search by GRN, Purchase Order reference, or supplier name, and optionally filter by receipt status or received-date range to narrow the current authorized location; page changes do not load the full receipt history into the browser.
2. Find the issued Purchase Order under `Create Draft Receipt`.
3. Enter the supplier delivery receipt or reference when available.
4. Enter delivered, accepted, rejected, and damaged quantities for each received line.
5. Add lot or expiry details when required by the item.
6. Add a discrepancy reason and evidence reference for rejected, damaged, or short quantities.
7. Select `Create Draft Receipt`.
8. Review the draft receipt, then select `Post Receipt`.

[Screenshot placeholder: Receiving page showing an issued PO receipt form and draft receipt post action.]

## Expected result

- A draft Receiving Report is created first.
- Posting records `RECEIPT_IN` inventory movements only for accepted quantities.
- Inventory balance cache updates in the same transaction as the movement.
- PO line received quantities update.
- The PO moves to `PARTIALLY_RECEIVED` or `FULLY_RECEIVED`.

## Important controls and warnings

- Receiving is not allowed from an `APPROVED` PO; the PO must be issued/sent first.
- Receiving more than the remaining open PO quantity is blocked in the current Phase I foundation.
- Rejected, damaged, and short quantities do not stock in.
- Posted receipts are not edited directly; authorized full-document reversal is the correction path.
- Posting does not perform supplier invoice matching, payment release, GL posting, or valuation finalization.

## What happens next

Purchasing can monitor PO fulfillment status. If a posted receipt is wrong, an authorized user can reverse the full receipt with a reason and then post a corrected receipt. Partial line reversal, supplier credit, return-to-supplier, notification fanout, and advanced inspection workflows remain future controlled slices.

## Related articles

- Understanding Purchase Order statuses
- Receiving a partial, short, damaged, or rejected delivery
- Understanding statuses, audit history, and attachments
