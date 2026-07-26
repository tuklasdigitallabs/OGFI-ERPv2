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

`Inventory → Stock Balances`, or `Operations Dashboard → Positive Stock`

## Steps

1. Open `Inventory`.
2. Select `Stock Balances`.
3. Confirm the posting context in the header.
4. Use search to filter by item code, item name, lot, or storage location.
5. Review on-hand quantity, base UOM, lot, expiry, storage location, last update, and balance version.

When you open `Positive Stock` from the Operations Dashboard, the page enters a read-only dashboard profile. It contains only current balance rows above zero for the selected location. Search can narrow that population, and `Open all stock balances` deliberately returns to the ordinary Stock Balances workspace.

[Screenshot placeholder: Stock Balances page showing current-location balance rows and search.]

## Expected result

- The page shows only balance rows for your current authorized location.
- Quantities come from posted inventory movements and cannot be edited from this page.
- Lot and expiry details appear when the posted balance row carries those identifiers.
- Results are loaded with server-side pagination (10 rows per page). Search, `Positive stock`, and `Expiring soon` filters are applied before counting and paging; tab counts remain query-aware.
- `Balance rows` shows the exact number matching the current search and selected tab, not only the rows on the visible page.
- Updated dates use the selected company's displayed timezone. If it is not configured, the operational default is `Asia/Manila`.
- `Export CSV` exports all matching current-location rows for the search, not just the visible page.
- In the Positive Stock dashboard profile, list totals, pages, and CSV export use the same positive-row definition. The export fails visibly rather than downloading a partial file when the configured synchronous row limit is exceeded.

## Important controls and warnings

- Do not use Stock Balances to correct inventory. Corrections must go through approved receiving, transfer, count, wastage, adjustment, or reversal workflows.
- The page does not show all-company or all-location stock for ordinary posting users.
- A zero or missing balance may mean there has not yet been a posted movement for that item/location.
- Positive Stock is a live inquiry, not a saved dashboard snapshot. Posted movements can change its rows between opening the dashboard, the profile, and an export.
- A copied dashboard-profile link does not grant stock-balance or export permission. Invalid, retired, duplicate, or widening profile inputs do not fall back to the broader balance list.

## What happens next

Use the appropriate controlled workflow when the balance shows a need: transfer request for available internal stock, Purchase Request for external replenishment, stock count for physical verification, wastage for loss, or Stock Adjustment for approved corrections.

## Related articles

- Reviewing Ledger Variance
- Receiving Issued Purchase Orders
- Understanding Purchase Order statuses
- Requesting stock when a branch item is low
