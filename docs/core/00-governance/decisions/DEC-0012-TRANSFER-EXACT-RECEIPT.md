# Decision Record — Transfer Exact Receipt

## Metadata

- Decision ID: `DEC-0012`
- Title: Transfer Exact Receipt
- Status: `Confirmed`
- Date: 2026-06-29
- Decision owner: Operations + Warehouse + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Inventory Transfers
- Related decisions: `DEC-0010`, `DEC-0011`

## Decision

Implement exact destination receipt for dispatched transfers as the next transfer slice.

Receipt moves a transfer from `DISPATCHED` to `RECEIVED`, posts one deterministic immutable `TRANSFER_IN` movement per transfer line for the dispatched quantity, updates destination inventory balances through the inventory posting service, increments received quantities, and records audit history in the same database transaction.

The dispatching user cannot receive the same transfer. Partial receipt, discrepancy, damage handling, reversal, and adjustment workflows remain future controlled decisions.

## Hard-gate assessment

- Receipt requires `inventory.transfer.receive`.
- Receipt is server-enforced to the user's current authorized destination location.
- Receipt is blocked before dispatch.
- Receipt is blocked for the same user who dispatched the transfer.
- Receipt uses immutable inventory movements and does not directly overwrite balances.
- Receipt movement keys are deterministic by transfer line.
- Transfer status, line received quantity, movement posting, balance update, and audit event are transactional.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Validate exact receipt migration, seed, service, UI, and tests | Parent implementation | Current slice | Complete |
| Define partial receipt and discrepancy workflow | Operations + Warehouse + Finance + IT | Before exception handling UI | Complete - see `DEC-0025` |
| Define transfer reversal/return policy | Operations + Warehouse + Finance + IT | Before correcting posted transfers | Partial - receipt-event reversal is implemented by `DEC-0025`; dispatch reversal, return-to-source workflow, replacement handling, and finance treatment remain deferred |

## Evidence

- `docs/phases/phase-01-procurement-inventory/workflows/receiving-transfer-workflow.md`
- `docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md`
- `docs/core/03-data/ERP_DATA_DICTIONARY.md`
- Round 1 deliberation by Dalisay, Hiraya, Ligaya, and Lualhati.
- `DEC-0025` partial transfer receipt, discrepancy, and receipt-event reversal decision.
