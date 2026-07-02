# Requesting Stock When A Branch Item Is Low

**Audience / required role:** Branch managers, storekeepers, supervisors, purchasing users, and warehouse users with scoped stock or request access  
**Applies to:** Current branch or destination location  
**Related phase/module:** Phase I / Replenishment, Transfers, and Purchase Requests  
**Last verified against:** transfer request routing controls, stock balance inquiry, and implemented Purchase Request and Transfer Request workflows

## Purpose

Use this article when a branch item is low and the team needs replenishment.

Low stock must not automatically create a Purchase Order. The correct route is to check available warehouse stock first. If stock is available from an authorized warehouse or source location, create a Transfer Request. If stock is not available, create a Purchase Request according to policy.

## Before You Start

- Confirm the ERP header shows the branch or destination location that needs stock.
- Your role must allow stock-balance viewing, transfer request creation, or Purchase Request creation as needed.
- Know the item, quantity needed, required date, and operational reason.
- Check whether the item is active and inventory-tracked.

## Navigation Path

Start with `Inventory -> Stock Balances`.

Use one of these follow-up paths:

- `Inventory -> Transfers`
- `Purchase Requests`

## Steps

1. Open `Inventory`.
2. Select `Stock Balances`.
3. Search for the item at your current branch or destination location.
4. Confirm the current on-hand quantity and operational need.
5. Check the assigned warehouse or authorized source location availability using the stock inquiry or manager/warehouse coordination process.
6. If warehouse stock is available, open `Inventory -> Transfers` and create a Transfer Request.
7. If warehouse stock is unavailable, open `Purchase Requests` and create a draft Purchase Request.
8. Submit the Transfer Request or Purchase Request through its normal approval or review workflow.

## Expected Result

- Available internal stock is requested through the transfer workflow.
- External purchasing starts with a Purchase Request, not a direct PO.
- The request keeps location, requester, item, quantity, purpose, and audit context.
- No stock balance changes until dispatch/receipt or purchasing/receiving workflows post controlled inventory movements.

## Important Controls And Warnings

- Do not create a Purchase Order directly for low stock.
- Do not use chat, paper, or spreadsheet instructions as the controlling replenishment record.
- A Transfer Request does not reduce source stock or increase destination stock until authorized dispatch and receipt are posted.
- A Purchase Request does not select a supplier, issue a PO, receive goods, or update inventory.
- Stock Balances is an inquiry screen. It cannot be used to correct or reserve stock.

## What To Check

- The branch or destination location is correct before requesting stock.
- The source warehouse is different from the destination location when creating a transfer.
- The requested quantity and purpose match the actual operational need.
- The resulting request appears in the correct list with audit history.

## Related Articles

- Viewing current stock balances
- Creating a transfer request
- Creating a Purchase Request
- Receiving a warehouse transfer
