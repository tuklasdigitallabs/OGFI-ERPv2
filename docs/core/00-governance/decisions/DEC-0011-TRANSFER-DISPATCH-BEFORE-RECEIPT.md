# Decision Record — Transfer Dispatch Before Receipt

## Metadata

- Decision ID: `DEC-0011`
- Title: Transfer Dispatch Before Receipt
- Status: `Confirmed`
- Date: 2026-06-29
- Decision owner: Operations + Warehouse + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Inventory Transfers
- Related decision: `DEC-0010`

## Decision

Implement source-location transfer dispatch as the next controlled stock-affecting slice before destination receipt posting.

Dispatch moves a transfer from `REQUESTED` to `DISPATCHED`, posts one deterministic immutable `TRANSFER_OUT` movement per transfer line, updates the source inventory balance through the inventory posting service, increments dispatched quantities, and records audit history in the same database transaction.

Destination receipt, `TRANSFER_IN`, partial/disputed receipt, reversal, and discrepancy resolution remain future controlled decisions.

## Context

Transfer foundation records now exist, but transfer posting changes stock and carries higher data-integrity risk than request tracking. The deliberation council agreed that a complete dispatch-plus-receipt lifecycle is the correct operational target. Database review identified a sequencing blocker: dispatch metadata, status constraints, and movement counterparty/correlation fields should be proven before enabling receipt.

## Options considered

### Option A — selected

- Summary: Implement source dispatch only.
- Benefits: Validates the first stock-affecting transfer event with minimal scope, preserves the existing local inventory posting guard, and creates traceable in-transit state for the future receipt slice.
- Failure modes: Stock can remain operationally in transit until receipt is implemented.
- Why selected: Safest irreversible stock movement step while still advancing Phase I transfer controls.

### Option B — deferred

- Summary: Implement dispatch and receipt together.
- Benefits: Completes the warehouse-to-branch stock lifecycle.
- Failure modes: Too broad before dispatch idempotency, source authorization, status constraints, and movement correlation are validated.
- Why deferred: Receipt should follow immediately after dispatch validation.

### Option C — rejected

- Summary: Add only approval/preparation statuses.
- Why rejected: Does not test ledger posting or source stock controls.

### Option D — rejected

- Summary: Defer transfers.
- Why rejected: Transfers are a core Phase I inventory control and the foundation is ready for a narrow dispatch slice.

## Hard-gate assessment

- Dispatch requires `inventory.transfer.dispatch`.
- Dispatch is server-enforced to the user's current authorized source location.
- Source and destination remain distinct active locations.
- Dispatch uses the immutable inventory movement ledger; balances are not directly overwritten.
- Dispatch movement keys are deterministic by transfer line.
- Transfer status, line dispatched quantity, movement posting, balance update, and audit event are transactional.
- Cancellation after dispatch is blocked.
- Destination receipt is not enabled in this slice.

## Required safeguards

- Add `DISPATCHED` to the transfer status constraint.
- Add dispatch metadata on the transfer header.
- Add nullable related inventory location support on inventory movements.
- Add dispatch permission separately from transfer view/create/submit/cancel.
- Keep destination receipt hidden and unavailable until its own controlled implementation.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Validate transfer dispatch migration, seed, service, UI, and tests | Parent implementation | Current slice | Complete |
| Implement destination receipt with sender/receiver separation and `TRANSFER_IN` posting | Parent implementation + council if needed | After dispatch validation | Complete - see `DEC-0012` and `DEC-0025` |
| Define transfer discrepancy/reversal policy | Operations + Warehouse + Finance + IT | Before exception handling UI | Partial - partial receipt, discrepancy recording, and receipt-event reversal are implemented by `DEC-0025`; dispatch reversal, replacement handling, and finance treatment remain deferred |

## Evidence

- `docs/phases/phase-01-procurement-inventory/workflows/receiving-transfer-workflow.md`
- `docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md`
- `docs/core/03-data/ERP_DATA_DICTIONARY.md`
- Round 1 deliberation by Dalisay, Hiraya, Ligaya, and Lualhati.
- `DEC-0012` exact receipt decision and `DEC-0025` transfer receipt-event implementation.
