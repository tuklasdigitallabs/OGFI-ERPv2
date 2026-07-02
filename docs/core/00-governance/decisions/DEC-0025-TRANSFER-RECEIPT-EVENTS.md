# DEC-0025: Transfer Receipt Events

**Status:** Accepted
**Date:** 2026-06-30

## Decision

Implement transfer partial receipt and discrepancy opening through durable receipt-event records:

- `InventoryTransferReceipt`
- `InventoryTransferReceiptLine`

The transfer header and line quantities remain lifecycle rollups. Receipt events are the posting boundary for destination receipt, discrepancy capture, and future receipt-event reversal.

Update: full receipt-event reversal is implemented as the approved correction path. Posted receipt events are reversed as whole events with linked `REVERSAL` movements for accepted quantities; corrected quantities are posted through a replacement receipt event.

Update: final transfer discrepancy settlement is implemented as a non-posting closure action. A user with `inventory.transfer.discrepancy.settle` at the destination location can move a disputed transfer to `DISCREPANCY_SETTLED` with settlement type, reason, evidence reference, and audit metadata. The requester, dispatcher, and active receipt receiver cannot settle the same discrepancy.

## Required Controls

- Destination receipt must use `inventory.transfer.receive` and destination-location scope.
- The dispatcher cannot receive the same transfer.
- Accepted quantity posts `TRANSFER_IN`; damaged, rejected, and short/discrepancy quantities do not increase destination stock.
- Cumulative accepted/damaged/rejected/discrepancy quantities cannot exceed dispatched quantity.
- Transfer status is recalculated from receipt-event rollups:
  - `DISPATCHED` before receipt.
  - `PARTIALLY_RECEIVED` when some accepted quantity is posted and quantity remains outstanding.
  - `DISPUTED` when damaged, rejected, or short/discrepancy quantity is recorded.
  - `RECEIVED` when all dispatched quantity is accepted with no discrepancy.
- Do not create stock adjustments, wastage, replacement transfers, or finance entries from discrepancy capture in this slice.
- Discrepancy settlement is audit-only and must not create inventory movements, stock adjustments, wastage, replacement transfers, or finance entries.

## Rationale

The existing exact receipt action posts one `TRANSFER_IN` per transfer line using `receipt:<line.id>`, which cannot safely support multiple partial receipts or a controlled reversal record. Receipt events preserve auditability, idempotency, and future correction paths without changing Phase I ledger semantics.

## Deferred

- Dispatch reversal.
- Virtual in-transit inventory locations.
- Replacement transfer, return, wastage, adjustment, or finance treatment created automatically from discrepancies.
