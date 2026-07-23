# Viewing Stock Balances

**Audience / required role:** Warehouse, storekeeping, branch management, operations, or authorized support users with stock-balance view access  
**Applies to:** Current assigned location  
**Related phase/module:** Phase I / Inventory  
**Last verified against:** `inventory-ui-spec.md`, `ERP_ROLES_AND_PERMISSIONS.md`, and implemented inventory balance inquiry

## Purpose

Use this article to view current stock on hand for the location selected in the ERP header. Stock Balances is an inquiry page: it shows posted inventory balance-cache rows that were created or updated by controlled inventory movements.

## Before you begin

- Your role must include `inventory.balance.view`.
- You must switch the header location to the branch, warehouse, commissary, or other assigned location you want to inspect.
- Stock quantities appear only after posted inventory movements exist for that item and location.

## Navigation path

`Inventory → Stock Balances`

## Steps

1. Open `Inventory`.
2. Select `Stock Balances`.
3. Confirm the posting context in the header.
4. Use search to filter by item code, item name, lot, or storage location.
5. Review on-hand quantity, base UOM, lot, expiry, storage location, last update, and balance version.

[Screenshot placeholder: Stock Balances page showing current-location balance rows and search.]

## Expected result

- The page shows only balance rows for your current authorized location.
- Quantities come from posted inventory movements and cannot be edited from this page.
- Lot and expiry details appear when the posted balance row carries those identifiers.
- Results are loaded with server-side pagination (10 rows per page). Search, `Positive stock`, and `Expiring soon` filters are applied before counting and paging; tab counts remain query-aware.
- `Export CSV` exports all matching current-location rows for the search, not just the visible page.

## Important controls and warnings

- Do not use Stock Balances to correct inventory. Corrections must go through approved receiving, transfer, count, wastage, adjustment, or reversal workflows.
- The page does not show all-company or all-location stock for ordinary posting users.
- A zero or missing balance may mean there has not yet been a posted movement for that item/location.

## What happens next

Use the appropriate controlled workflow when the balance shows a need: transfer request for available internal stock, Purchase Request for external replenishment, stock count for physical verification, wastage for loss, or Stock Adjustment for approved corrections.

## Related articles

- Reviewing Ledger Variance
- Receiving Issued Purchase Orders
- Understanding Purchase Order statuses
- Requesting stock when a branch item is low
