# Decision Record — Stock Adjustment Foundation Before Posting

## Metadata

- Decision ID: `DEC-0019`
- Title: Stock Adjustment Foundation Before Posting
- Status: `Confirmed`
- Date: 2026-06-29
- Decision owner: Operations + Warehouse + Finance + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Stock Adjustments and Inventory Controls

## Decision

Implement the Phase I Stock Adjustment foundation as non-posting `StockAdjustment` and `StockAdjustmentLine` records only.

This slice may capture scoped stock-adjustment headers and lines for documented correction requests, including company, location, requester, adjustment type, reason, line item, quantity impact, lot/expiry context where applicable, value context where available, status, and audit history.

It must not integrate with the approval engine, create inventory movements, update inventory balances, create opening balances, post physical-count variance, allow backdated posting, reverse posted records, or create finance/accounting entries.

## Context

Stock adjustments are high-risk because they can directly change inventory quantity and value. The foundation is useful for replacing informal correction tracking, but posting requires resolved controls for approval routing, segregation of duties, count variance linkage, opening-balance cutover, backdating, reversal, negative-stock handling, and finance visibility.

## Options considered

### Option A — selected

- Summary: Implement non-posting `StockAdjustment` and `StockAdjustmentLine` foundation only.
- Benefits: Creates structured records and audit context while preserving inventory-ledger integrity.
- Failure modes: Users may assume a submitted stock adjustment already changed stock.
- Why selected: It passes the hard gates because no stock, finance, approval, opening-balance, count-variance, backdate, or reversal side effect is introduced.

### Option B — deferred

- Summary: Add approval-engine integration without posting.
- Why deferred: Approval routes for adjustment type, value, count linkage, opening balance, backdate, and self-approval controls need a separate implementation slice and tests.

### Option C — rejected for this slice

- Summary: Full adjustment approval and inventory posting.
- Why rejected: Posting mutates the immutable inventory ledger and balance cache; it requires idempotent posting, authorization, approval, count/opening-balance policy, reversal, and recovery controls that are outside this slice.

### Option D — rejected for this slice

- Summary: Include opening balance, count variance posting, backdating, and reversal with the foundation.
- Why rejected: Each item is a material inventory/accountability policy decision and must not be bundled into the basic record foundation.

## Hard-gate assessment

- Stock-adjustment records remain tenant/company/location scoped.
- No approval instance is created by this slice.
- No `InventoryMovement` or `InventoryBalance` row is created or changed by this slice.
- Opening balance is not implemented through Stock Adjustment in this slice.
- Count variance posting is not implemented through Stock Adjustment in this slice.
- Backdated stock-adjustment posting is not implemented.
- Reversal is not implemented because there is no stock-adjustment posting in this slice.
- Important actions must preserve audit history.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Decide and implement stock-adjustment approval routes | Operations + Finance + IT | Before approval-enabled adjustment release | Complete — see `DEC-0023` |
| Decide posting semantics for `adjustment_in`, `adjustment_out`, and count variance | Warehouse + Finance + IT | Before stock-adjustment posting release | Complete for manual `INCREASE`/`DECREASE` and count-generated Stock Adjustment bridge — see `DEC-0023` and `DEC-0026`; direct `COUNT_VARIANCE_*` movement posting remains deferred |
| Decide opening-balance cutover process | Finance + Operations + IT | Before go-live stock cutover | Open |
| Decide backdated adjustment policy and closed-period controls | Operations + Finance + IT | Before backdated posting | Open |
| Decide controlled reversal for posted stock adjustments | Warehouse + Finance + IT | Before production correction workflow | Complete for full-document reversal — see `DEC-0023`; partial reversal remains deferred |

## Evidence

- Parent deliberation conclusion confirming Option A.
- `docs/phases/phase-01-procurement-inventory/workflows/wastage-stock-adjustment-workflow.md`
- `docs/phases/phase-01-procurement-inventory/specs/wastage-adjustments-ui-spec.md`
- `docs/core/03-data/ERP_DATA_DICTIONARY.md`
- Existing related controls in `DEC-0013`, `DEC-0015`, `DEC-0017`, and `DEC-0018`.
- `DEC-0023` supersedes this foundation only for manual `INCREASE`/`DECREASE` Stock Adjustment approval, posting, and full-document reversal.
- `DEC-0026` adds count-generated Stock Adjustments as the controlled bridge for reviewed stock-count variance.
