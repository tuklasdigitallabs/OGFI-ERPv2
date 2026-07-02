# Creating Transfer Requests

**Audience / required role:** Branch, warehouse, storekeeping, or authorized operations users with transfer request access  
**Applies to:** Current assigned destination location  
**Related phase/module:** Phase I / Inventory Transfers  
**Last verified against:** `receiving-transfer-workflow.md`, `inventory-ui-spec.md`, and implemented transfer foundation

## Purpose

Use this article to create and track a transfer request between inventory locations. Dispatch and receipt are separate controlled actions so source and destination stock are posted only after the right location confirms each step.

## Before you begin

- Your role must include the needed transfer permission, such as `inventory.transfer.create`.
- Your current ERP header location is used as the destination location.
- The source must be a different active inventory location in the same company.
- At least one active inventory-tracked item must exist.

## Navigation path

`Inventory → Transfers`

## Steps

1. Open `Inventory`.
2. Select `Transfers`.
3. Choose a source inventory location.
4. Confirm the destination shown on the form.
5. Select the item and enter a positive requested quantity.
6. Select the transfer type and enter the purpose.
7. Optionally enter a required-by date and handling note.
8. Select `Create Transfer Request`.
9. Review the request detail and select `Submit Request` when ready.

[Screenshot placeholder: Transfers page showing a source location, destination context, item, quantity, and purpose.]

## Expected result

- A draft transfer request is created with source, destination, requester, item, quantity, purpose, and audit history.
- Submitted requests move from `DRAFT` to `REQUESTED`.
- Source dispatch is available only to an authorized user whose current ERP location is the source location.
- Destination receipt is available only to an authorized user whose current ERP location is the destination location.
- Cancelled requests remain visible with cancellation reason and audit history.
- No inventory movement or stock-balance change occurs from create, submit, or cancel.

## Important controls and warnings

- A transfer request is not a dispatch confirmation.
- A transfer request is not a destination receipt confirmation.
- Source and destination must be different.
- Dispatch creates `TRANSFER_OUT` only from the authorized source location.
- Receipt creates `TRANSFER_IN` only for accepted quantity at the authorized destination location.
- Rejected, damaged, and short/discrepant receipt quantities are recorded but do not increase destination stock.

## What happens next

The request gives warehouse and branch teams a controlled planning record. After submission, the source location dispatches stock, then the destination location receives accepted quantity or records discrepancy details.

## Related articles

- Viewing Stock Balances
- Viewing Inventory Movement History
- Dispatching Warehouse Transfers
- Receiving Warehouse Transfers
