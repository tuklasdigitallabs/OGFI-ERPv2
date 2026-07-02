# DEC-0026: Stock Count Variance Adjustment Bridge

**Status:** Accepted
**Date:** 2026-06-30

## Decision

Implement Phase I count variance posting through a linked Stock Adjustment bridge.

A reviewed Stock Count Session may generate one `COUNT_VARIANCE` Stock Adjustment containing one line per non-zero counted variance. The generated adjustment remains non-posting until it completes the existing Stock Adjustment approval and separate posting workflow.

This slice does not post `COUNT_VARIANCE_IN` / `COUNT_VARIANCE_OUT` movements directly. Approved generated adjustments post the existing `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` movement types, preserving source links back to the count session and count lines.

## Required Controls

- Generation is allowed only for `REVIEWED` stock count sessions in the user's authorized location scope.
- Generation copies tenant, company, inventory location, item, UOM, lot/expiry, system snapshot, counted variance, and source count line IDs from the reviewed count.
- Zero-variance lines are excluded.
- Uncounted/null lines block generation.
- Database uniqueness prevents duplicate generated adjustments for the same stock count session and duplicate generated adjustment lines for the same count line.
- Generated adjustments must still pass approval and separate posting before inventory changes.
- Reversal remains the existing full-document Stock Adjustment reversal path.

## Rationale

The schema already has `StockAdjustment.sourceStockCountSessionId` and `StockAdjustmentLine.sourceStockCountLineId`, and the Stock Adjustment workflow already provides approval, posting, reversal, audit, idempotency, and negative-stock protection. Reusing that controlled workflow is safer than adding a second count-specific posting engine.

## Deferred

- Direct `COUNT_VARIANCE_IN` / `COUNT_VARIANCE_OUT` posting.
- Materiality-specific approval routing beyond the current Stock Adjustment approval rule.
- Recount versioning beyond the existing recount request state.
- Partial count variance reversal.
- Finance/accounting effects.
