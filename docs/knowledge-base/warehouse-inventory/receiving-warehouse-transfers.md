# Receiving Warehouse Transfers

**Audience / required role:** Branch, warehouse, or destination-location user with `inventory.transfer.receive`  
**Applies to:** Current ERP header location as the transfer destination  
**Related phase/module:** Phase I / Inventory Transfers  
**Last verified against:** `inventory-workflow.md`, `transfers-ui-spec.md`, and implemented transfer receipt/reversal flow

## Purpose

Use this article to confirm stock received from a dispatched transfer. Only accepted quantity posts destination stock. Rejected, damaged, and short/discrepant quantities are recorded for follow-up but do not increase inventory.

## Before you begin

- The transfer must be `DISPATCHED`, `PARTIALLY_RECEIVED`, or `DISPUTED`.
- Your current ERP header location must match the destination location.
- Your role must include `inventory.transfer.receive`.
- You must be different from the user who dispatched the transfer.
- Evidence reference is required when any line has rejected, damaged, or short/discrepant quantity.

## Navigation path

`Inventory -> Transfers -> View Details`

## Steps

1. Open `Inventory`.
2. Select `Transfers`.
3. Open the dispatched transfer.
4. Confirm the source, destination, and line quantities.
5. In `Destination Receipt`, enter accepted quantity for each received line.
6. Enter rejected, damaged, or short quantity when applicable.
7. Enter a discrepancy reason and evidence reference for any rejected, damaged, or short quantity.
8. Add an optional receiving note.
9. Select `Post Receipt`.

[Screenshot placeholder: Transfer detail page showing Destination Receipt fields for accepted, rejected, damaged, short, reason, and evidence reference.]

## Expected result

- Accepted quantity creates `TRANSFER_IN` movements and increases destination stock through the inventory ledger.
- Rejected, damaged, and short/discrepant quantities are recorded on receipt-event lines but do not increase stock.
- A partial receipt keeps the transfer open for remaining dispatched quantity.
- A discrepancy moves the transfer into a disputed/follow-up state.
- Receipt events remain visible with receiver, timestamp, status, discrepancy summary, and audit history.

## Reversing a transfer receipt

An authorized destination user with `inventory.transfer.receipt.reverse` can reverse a posted receipt event when correction is required.

1. Open the transfer detail page.
2. Find the receipt event.
3. Enter a reversal reason.
4. Select `Reverse Receipt`.

Reversal writes linked `REVERSAL` movements for accepted quantity, updates transfer rollups, preserves the original receipt event, and records who reversed it and why.

## Important controls and warnings

- You cannot receive more than the remaining dispatched quantity.
- You cannot receive a transfer you dispatched.
- Discrepancy reason must be specific enough for operations follow-up.
- Evidence reference can be a photo filename, document ID, incident reference, or other approved operational reference. Binary upload/download remains part of the shared attachment-service roadmap.
- Reversal is the correction path for posted receipt events. Do not edit posted inventory movements.

## Related articles

- Creating Transfer Requests
- Dispatching Warehouse Transfers
- Viewing Stock Balances
- Viewing Inventory Movement History
