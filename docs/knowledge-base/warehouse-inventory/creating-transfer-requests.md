# Creating Transfer Requests

**Audience / required role:** Branch, warehouse, storekeeping, or authorized operations users with transfer request access  
**Applies to:** Current assigned destination location  
**Related phase/module:** Phase I / Inventory Transfers  
**Last verified against:** `receiving-transfer-workflow.md`, `inventory-ui-spec.md`, `DEC-0260`, `DEC-0261`, and implemented transfer foundation

## Purpose

Use this article to create and track a transfer request between inventory locations. Dispatch and receipt are separate controlled actions so source and destination stock are posted only after the right location confirms each step.

The pilot approval route described below is implemented locally but disabled by default. It is not currently a production, UAT, or deployment availability claim. Until an authorized release activates the route for an exact pilot cohort, transfers continue to use the existing legacy submission behavior.

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

If a future authorized release has activated the pilot approval route and the server admits this transfer to that exact cohort, submission places it in `PENDING_APPROVAL` and sends the approval work to the Approval Inbox. Do not assume that a pilot badge, a role, a selected location, or an environment setting admits a transfer; the server checks the exact active cohort and approval route.

[Screenshot placeholder: Transfers page showing a source location, destination context, item, quantity, and purpose.]

## Expected result

- A draft transfer request is created with source, destination, requester, item, quantity, purpose, and audit history.
- Under the current default-off behavior, submitted requests move from `DRAFT` to `REQUESTED`.
- For a transfer admitted to an activated pilot approval route, submission moves the request from `DRAFT` (or an eligible `RETURNED` request) to `PENDING_APPROVAL`. Final approval changes it to `REQUESTED`; only then can the existing controlled dispatch workflow proceed.
- A returned pilot transfer may be corrected and submitted again, creating a new approval cycle while preserving the earlier audit history. A rejected or cancelled transfer is non-dispatchable.
- Source dispatch is available only to an authorized user whose current ERP location is the source location.
- Destination receipt is available only to an authorized user whose current ERP location is the destination location.
- Cancelled requests remain visible with cancellation reason and audit history.
- No inventory movement or stock-balance change occurs from create, submit, or cancel.

## Important controls and warnings

- A transfer request is not a dispatch confirmation.
- A transfer request is not a destination receipt confirmation.
- The requester cannot approve their own pilot-admitted transfer. An approver of that transfer cannot dispatch or receive it. These checks are enforced by the server; seeing an action does not grant authority.
- Return, rejection, approval, and cancellation before dispatch do not create inventory movements or change stock balances. Cancellation of a pending pilot transfer closes its pending approval route and preserves the transfer, approval, reason, actor, and timestamp history.
- A release emergency disable can deny new pilot admissions. It cannot turn an already admitted controlled transfer into an uncontrolled legacy submission or remove its existing approval controls.
- Source and destination must be different.
- Dispatch creates `TRANSFER_OUT` only from the authorized source location.
- Receipt creates `TRANSFER_IN` only for accepted quantity at the authorized destination location.
- Rejected, damaged, and short/discrepant receipt quantities are recorded but do not increase destination stock.

## What happens next

The request gives warehouse and branch teams a controlled planning record. Under the current default-off behavior, a submitted request proceeds to the existing controlled dispatch workflow. For an admitted pilot transfer, wait for its Approval Inbox route to complete first; final approval makes it `REQUESTED`, after which the source location may dispatch and the destination may receive accepted quantity or record discrepancy details.

## Related articles

- Viewing Stock Balances
- Viewing Inventory Movement History
- Dispatching Warehouse Transfers
- Receiving Warehouse Transfers
