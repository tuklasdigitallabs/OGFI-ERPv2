# Receiving a Partial, Short, Damaged, or Rejected Delivery

**Audience / required role:** Storekeeper, receiver, warehouse staff, or authorized manager with receiving permissions  
**Applies to:** Assigned receiving location  
**Related phase/module:** Phase I / Receiving  
**Last verified against:** `receiving-transfer-workflow.md`, implemented receiving discrepancy and reversal controls

## Purpose

Use this article when a supplier delivery does not perfectly match the issued Purchase Order. The ERP records accepted, rejected, damaged, and short quantities separately so only accepted stock enters inventory.

## Before you begin

- The Purchase Order must be `ISSUED` or `PARTIALLY_RECEIVED`.
- Your role must have receiving create/post access for the location.
- An active inventory location must exist for the receiving location.
- Rejected, damaged, or short quantities require a discrepancy reason.
- Rejected, damaged, or short quantities also require an evidence reference.
- Lot and expiry details are required when the item is configured for them.

## Navigation path

`Receiving -> Create Draft Receipt -> Post Receipt`

## Steps

1. Open `Receiving`.
2. Find the issued or partially received Purchase Order.
3. Enter the supplier delivery reference when available.
4. For each received line, enter the delivered quantity.
5. Enter the accepted quantity that should stock in.
6. Enter rejected quantity for items refused or not accepted.
7. Enter damaged quantity for items physically damaged or unusable.
8. Leave the remaining outstanding quantity as short when the supplier delivered less than expected.
9. Enter a discrepancy reason for any rejected, damaged, or short quantity.
10. Enter an evidence reference, such as a photo filename, document ID, delivery note, or incident reference.
11. Add lot or expiry data when required.
12. Select `Create Draft Receipt`.
13. Review the draft and select `Post Receipt`.

[Screenshot placeholder: Receiving form showing delivered, accepted, rejected, damaged, discrepancy reason, and evidence reference fields.]

## Expected result

- The draft Receiving Report preserves the PO, supplier, receiver, delivery reference, line quantities, discrepancy reason, and evidence reference.
- Posting creates `RECEIPT_IN` movements only for accepted quantity.
- Rejected, damaged, and short quantities do not increase stock.
- The PO remains open when there is outstanding quantity unless a separate authorized closure/cancellation action is completed.
- A receipt with discrepancies is marked with discrepancy status and remains visible on the receiving detail page.

## Reversing a posted receipt

Posted receipts are not edited. If a posted receipt is materially wrong:

1. Open the receiving detail page.
2. Confirm the original receipt and discrepancy evidence.
3. Enter a reversal reason.
4. Select `Reverse Receipt`.

The system writes linked `REVERSAL` inventory movements for accepted quantity, restores PO received quantity/status, preserves the original receipt, and records who reversed it and why.

## Important controls and warnings

- Accepted, rejected, and damaged quantities cannot exceed delivered quantity.
- Delivered or accepted quantity cannot exceed the remaining outstanding PO quantity.
- A receiving discrepancy reason and evidence reference are required for rejected, damaged, or short quantities.
- Reversal is full-document only in the current Phase I release. Partial line reversal, return-to-supplier, supplier credit, and finance effects remain future controlled workflows.
- Receiving does not approve supplier invoices, release payment, post GL entries, or finalize valuation.
- If a Receiving status or date filter is invalid, the workspace explains the required format or date ordering so you can correct the filter without exposing an internal error.
- If a receipt changes during review or a search/profile value is no longer valid, the workspace explains the issue and directs you to refresh or shorten the input.

## Related articles

- Receiving Issued Purchase Orders
- Understanding Purchase Order statuses
- Viewing Inventory Movement History
