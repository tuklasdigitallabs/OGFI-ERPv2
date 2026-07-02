# Decision Record — Wastage Approval Before Posting

## Metadata

- Decision ID: `DEC-0016`
- Title: Wastage Approval Before Posting
- Status: `Confirmed`
- Date: 2026-06-29
- Decision owner: Operations + Warehouse + Finance + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Wastage and Inventory Controls

## Decision

Integrate `WastageReport` with the approval engine before any `WASTAGE_OUT` inventory posting is released.

Submitting a draft or returned Wastage Report creates an approval instance and moves the report to `PENDING_APPROVAL`. Assigned approvers may approve, return, or reject the report from the approval inbox. Approved wastage moves to `APPROVED`, remains non-posting, and does not change inventory balances.

Existing `REVIEWED` reports remain legacy non-posting review records. They must not be automatically promoted to `APPROVED` and must not trigger inventory posting.

## Options considered

### Option A — selected

- Summary: Approval-engine integration only, no inventory posting.
- Benefits: Adds configurable approval routing, scope checks, self-approval protection, and audit before stock is affected.
- Failure modes: Users may assume approved wastage already reduced stock.
- Why selected: It is the smallest safe progression and passes approval, inventory-ledger, audit, and segregation-of-duties hard gates.

### Option B — rejected

- Summary: Post `WASTAGE_OUT` from the current `REVIEWED` status.
- Why rejected: `REVIEWED` is not a configured approval-engine decision and posting from it would bypass final approval controls.

### Option C — deferred

- Summary: Approval plus inventory posting in one slice.
- Why deferred: Posting also needs posted-state semantics, idempotent movement linkage, reversal, backdating, negative-stock exception, evidence threshold, and valuation policy.

### Option D — rejected

- Summary: Defer wastage and move to another Phase I area.
- Why rejected: Approval integration is now the next control dependency for wastage and reduces ambiguity in the current foundation.

## Hard-gate assessment

- Wastage approvals are tenant/company scoped.
- Approval visibility and action are filtered by assigned approval step and approver scope.
- Reporter self-approval is blocked.
- Approval, return, reject, submit, and cancel write audit events.
- Cancelling a pending wastage report cancels the pending approval instance and skips waiting steps.
- No `InventoryMovement` or `InventoryBalance` row is created or changed by this slice.
- Existing `REVIEWED` records remain non-posting.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Decide evidence thresholds, reason-code policy, repeat-loss escalation, and high-value routes | Operations + Finance | Before posting release | Complete - see `DEC-0021` |
| Decide posted-state naming and whether final approval auto-posts or requires a separate `Post Wastage` action | Warehouse + Finance + IT | Before `WASTAGE_OUT` release | Implemented by `DEC-0017` |
| Implement idempotent `WASTAGE_OUT` posting | Warehouse + Finance + IT | After posting decision | Implemented by `DEC-0017` |
| Implement posted wastage reversal | Warehouse + Finance + IT | After reversal decision | Complete - see `DEC-0018` |
| Decide negative-stock and backdated wastage exception policy | Operations + Finance + IT | Before posting release | Partial - negative-stock blocking follows the inventory movement controls; backdated/closed-period policy remains open |
| Decide stock adjustment foundation separately from wastage | Operations + Finance + IT | Before stock adjustment records | Complete - see `DEC-0019` and `DEC-0023` |

## Evidence

- `docs/phases/phase-01-procurement-inventory/workflows/wastage-stock-adjustment-workflow.md`
- `docs/phases/phase-01-procurement-inventory/specs/wastage-adjustments-ui-spec.md`
- `docs/core/02-controls/ERP_APPROVAL_MATRIX.md`
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md`
- `docs/core/03-data/ERP_DATA_DICTIONARY.md`
- Round 1 deliberation by Dalisay, Hiraya, Ligaya, and Lualhati.
- `DEC-0018` wastage reversal, `DEC-0021` evidence routing, and `DEC-0023` stock adjustment posting/reversal decisions.
