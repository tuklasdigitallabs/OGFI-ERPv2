# DEC-0024: Goods Receipt Reversal

**Status:** Accepted
**Date:** 2026-06-30

## Decision

Implement a narrow full-document Goods Receipt reversal for Phase I.

Eligible receipts are `POSTED` and `POSTED_WITH_DISCREPANCY` only. Reversal transitions the receipt through `REVERSING` to terminal `REVERSED`, creates one linked `REVERSAL` inventory movement for each original `RECEIPT_IN` movement, restores Purchase Order received quantities, recalculates the Purchase Order status, and writes audit history.

This slice does not implement partial line reversal, posted receipt editing, return-to-supplier, credit memo, finance valuation, closed-period handling, or reopening closed Purchase Orders.

## Required Controls

- Require `inventory.receiving.reverse`.
- Require receiving-location scope.
- Require a reversal reason.
- Block same-user self-reversal by the original receiver.
- Block reversal for `CLOSED` or `CANCELLED` Purchase Orders.
- Block reversal when a PO remaining-balance closure is pending or approved.
- Block reversal when any accepted receipt line lacks a valid original `RECEIPT_IN` movement.
- Block duplicate reversal and already reversed original movements.
- Block reversal when the resulting stock movement would make inventory negative.
- Preserve original Goods Receipt, line quantities, discrepancy evidence, and original movements.

## Rationale

The immutable inventory ledger is the source of truth. A posted receiving error must be corrected through linked reversal movements and a corrected new receipt, not by editing posted quantities or deleting ledger entries. Restoring PO received quantities keeps purchasing fulfillment aligned with stock history.

## Deferred

- Partial receipt-line reversal.
- Approval routing or threshold policy for reversal.
- Reversal after PO closure or accounting period close.
- Supplier credit, return-to-supplier, or finance/accounting effects.
