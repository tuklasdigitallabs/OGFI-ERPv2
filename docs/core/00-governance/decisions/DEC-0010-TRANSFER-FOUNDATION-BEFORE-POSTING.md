# Decision Record — Transfer Foundation Before Posting

## Metadata

- Decision ID: `DEC-0010`
- Title: Transfer Foundation Before Posting
- Status: `Confirmed`
- Date: 2026-06-29
- Decision owner: Operations + Warehouse + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Inventory Transfers
- Related decision brief: Next transfer implementation slice after receiving and inventory inquiry

## Decision

Implement transfer schema, request/list/detail services, UI, permissions, and audit foundation before enabling stock-affecting transfer dispatch or destination receipt posting. This slice must not create `TRANSFER_OUT` or `TRANSFER_IN` inventory movements and must not update inventory balances.

## Context

Receiving, inventory movement posting, stock balances, and inventory ledger inquiry now exist. Transfers are a required Phase I workflow, but they are two-party stock events: source dispatch reduces source stock and destination receipt independently increases destination stock. That posting behavior requires a separate transaction, idempotency, sender/receiver separation, discrepancy, reversal, and cross-location authorization decision.

## Options considered

### Option A — rejected

- Summary: Build only a request/draft/list surface.
- Benefits: Lowest stock risk.
- Failure modes: Too thin; risks a temporary UI and schema that do not support dispatch, receipt, variance, audit, and future ledger correlation.
- Why rejected: It does not establish enough durable transfer foundation.

### Option B — rejected

- Summary: Build full transfer flow including dispatch `TRANSFER_OUT` and receipt `TRANSFER_IN`.
- Benefits: Fastest end-to-end operational value.
- Failure modes: Stock corruption risk if approval placeholders, idempotency, source/destination authorization, sender/receiver separation, over-dispatch prevention, and reversal are incomplete.
- Why rejected: Too much inventory-impacting behavior for the next slice.

### Option C — selected

- Summary: Add transfer header/line schema, request/list/detail services and UI, status/audit foundation, and future-ready quantity fields, with no stock posting.
- Benefits: Moves Phase I transfers forward while preserving inventory hard gates.
- Failure modes: Users may mistake requested transfers for dispatched stock unless UI is explicit.
- Why selected: It provides a testable transfer foundation and leaves stock posting to a separate controlled decision.

### Option D — rejected

- Summary: Defer transfers and continue to counts or wastage.
- Benefits: Avoids transfer risk.
- Failure modes: Leaves a core Phase I warehouse-to-branch control missing after receiving and ledger inquiry.
- Why rejected: Transfers are now the natural next Phase I inventory foundation.

## Hard-gate assessment

- Tenant/company/source/destination scope must be enforced server-side.
- Source and destination must be distinct active locations within the same company.
- Request creation, submission, cancellation, list, and detail must create no inventory movements and change no stock balances.
- Dispatch and receipt actions must not appear as enabled UI/actions in this slice.
- Transfer records must preserve requested, approved/prepared, dispatched, received, rejected/damaged, and discrepancy quantities for future audit-grade posting.
- Posted transfer behavior requires a future decision for idempotent paired movements, sender/receiver separation, discrepancy, reversal, and cross-location posting authorization.

## Required safeguards

- Add transfer permissions separately from balance, ledger, receiving, and admin permissions.
- Validate positive quantities and active inventory-tracked items.
- Create audit events for transfer creation, submission, and cancellation.
- Keep cancellation non-destructive.
- Label the UI as requested/not dispatched so users do not infer stock movement.
- Add tests proving transfer requests do not write inventory movements or balances.

## Implementation and documentation impact

- Code / architecture: Add transfer service, list/detail UI, and navigation.
- Data / schema: Add additive transfer header and line tables.
- Workflow / permissions: Add transfer view/create/submit/cancel permissions; dispatch/receive permissions remain future work.
- Inventory: No ledger or balance changes in this slice.
- Knowledge base / training: Document transfer request tracking as non-posting until dispatch/receipt controls are released.
- Tests / UAT: Validate source/destination separation, scope, positive quantities, status transitions, audit, and no stock mutation.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement transfer foundation schema/services/UI with no posting | Parent implementation | Current slice | Complete |
| Decide transfer dispatch/receipt posting semantics | Operations + Warehouse + IT | Before enabling dispatch or receipt actions | Complete — see `DEC-0011`, `DEC-0012`, and `DEC-0025` |
| Define transfer reversal and discrepancy resolution | Operations + Warehouse + Finance + IT | Before posted transfer correction UI | Partial — receipt-event reversal and non-posting discrepancy settlement implemented in `DEC-0025`; dispatch reversal and automatic replacement/finance treatment remain deferred |

## Evidence

- `docs/phases/phase-01-procurement-inventory/specs/inventory-ui-spec.md`
- `docs/phases/phase-01-procurement-inventory/workflows/receiving-transfer-workflow.md`
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md`
- `docs/core/03-data/ERP_DATA_DICTIONARY.md`
- Round 1 deliberation by Dalisay, Hiraya, Ligaya, and Lualhati.
- Later transfer decisions implemented dispatch, receipt, receipt-event reversal, partial/disputed receipt, export detail, and non-posting discrepancy settlement while keeping dispatch reversal and automatic replacement/finance treatment deferred.
