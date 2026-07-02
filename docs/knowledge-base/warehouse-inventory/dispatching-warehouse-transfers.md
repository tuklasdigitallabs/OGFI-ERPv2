# Dispatching Warehouse Transfers

**Audience / required role:** Warehouse or source-location user with `inventory.transfer.dispatch`  
**Applies to:** Current ERP header location as the transfer source  
**Related phase/module:** Phase I / Inventory Transfers  
**Last verified against:** `inventory-workflow.md`, `transfers-ui-spec.md`, and implemented transfer dispatch flow

## Purpose

Use this article when the source location is ready to send stock for a submitted transfer request. Dispatch is the action that posts source stock out through the inventory ledger.

## Before you begin

- The transfer must be in `REQUESTED` status.
- Your current ERP header location must match the transfer source location.
- Your role must include `inventory.transfer.dispatch`.
- The item and inventory location must still be active and in scope.
- Available source stock must be sufficient; negative stock is blocked.

## Navigation path

`Inventory -> Transfers -> View Details`

## Steps

1. Open `Inventory`.
2. Select `Transfers`.
3. Open the requested transfer.
4. Confirm the source and destination locations.
5. Review requested item lines and quantities.
6. Select `Dispatch Stock`.

[Screenshot placeholder: Transfer detail page showing a requested transfer and the Dispatch Stock action.]

## Expected result

- The transfer moves from `REQUESTED` to `DISPATCHED`.
- The system posts source `TRANSFER_OUT` inventory movements.
- Source stock balance decreases through the inventory ledger.
- Dispatch actor, timestamp, line quantities, and audit history are retained.
- Destination stock does not increase until destination receipt is posted.

## Important controls and warnings

- Dispatch is not the same as destination receipt.
- A destination user must still receive the transfer.
- The same user who dispatched the transfer cannot receive that transfer at the destination.
- Dispatch is idempotent; repeated posting must not create duplicate source movements.
- A transfer can be cancelled only while it is still `DRAFT` or `REQUESTED`.

## What happens next

After dispatch, an authorized destination user receives the transfer and records accepted, rejected, damaged, or short/discrepant quantities.

## Related articles

- Creating Transfer Requests
- Receiving Warehouse Transfers
- Viewing Inventory Movement History
