# Decision Record — Wastage Foundation Before Posting

## Metadata

- Decision ID: `DEC-0015`
- Title: Wastage Foundation Before Posting
- Status: `Confirmed`
- Date: 2026-06-29
- Decision owner: Operations + Warehouse + Finance + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Wastage and Inventory Controls

## Decision

Implement a non-posting Wastage Report foundation before approval-engine integration and `WASTAGE_OUT` inventory posting.

This slice captures scoped wastage reports and lines with item, quantity, inventory location, reason, evidence reference, lot/expiry context, estimated value, submit/review/return/reject/cancel status, CSV export, and audit history.

It must not create inventory movements, update inventory balances, post finance/accounting entries, or mark wastage as fully approved.

## Context

Wastage is Phase I scope and needs structured evidence before branch teams can move away from paper/chat reporting. However, full wastage posting changes stock and depends on unresolved approval routing, evidence thresholds, reversal, backdating, negative-stock exception, repeat-loss escalation, and future finance valuation rules.

## Options considered

### Option A — selected

- Summary: Wastage document foundation only, with no approval-engine integration and no stock posting.
- Benefits: Creates durable evidence and reporting surface while preserving inventory-ledger integrity.
- Failure modes: Users may assume submitted/reviewed wastage already reduced stock.
- Why selected: It passes all hard gates and follows the same controlled pattern as stock counts before variance posting.

### Option B — deferred

- Summary: Wastage with approval integration, no posting.
- Why deferred: Useful next step, but current approval handling is document-type-specific and needs a separate integration slice with self-approval and scope tests.

### Option C — rejected for this slice

- Summary: Full wastage approval and `WASTAGE_OUT` posting.
- Why rejected: Posting is irreversible except through controlled reversal, and reversal/evidence/backdate/high-value policy is not implemented.

### Option D — rejected

- Summary: Defer wastage and continue dashboards/notifications.
- Why rejected: Dashboards need authoritative source records; foundation records are the better next step.

## Hard-gate assessment

- Wastage records are tenant/company/current-location scoped server-side.
- Create, submit, review, and cancel are permission-gated separately.
- Reviewed wastage does not approve or post stock.
- No `InventoryMovement` or `InventoryBalance` row is created or changed by this slice.
- Lot and expiry are required for tracked items.
- Item-category photo default requires an evidence reference.
- Important actions write audit events.
- Self-review is blocked.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Integrate Wastage Report with approval engine | Operations + Finance + IT | Before final wastage approval | Implemented by `DEC-0016` |
| Decide evidence thresholds, reason-code policy, repeat-loss escalation, and high-value routes | Operations + Finance | Before posting release | Complete - see `DEC-0021` |
| Implement `WASTAGE_OUT` posting and reversal | Warehouse + Finance + IT | After approval/reversal decision | Complete - posting by `DEC-0017`, reversal by `DEC-0018` |
| Decide stock adjustment foundation separately from wastage | Operations + Finance + IT | Before stock adjustment records | Complete - see `DEC-0019` and `DEC-0023` |

## Evidence

- `docs/phases/phase-01-procurement-inventory/workflows/wastage-stock-adjustment-workflow.md`
- `docs/phases/phase-01-procurement-inventory/specs/wastage-adjustments-ui-spec.md`
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md`
- `docs/core/03-data/ERP_DATA_DICTIONARY.md`
- Round 1 deliberation by Dalisay, Hiraya, Ligaya, and Lualhati.
- `DEC-0017` wastage posting, `DEC-0018` posted reversal, `DEC-0021` evidence routing, and `DEC-0023` stock adjustment posting/reversal decisions.
