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

`Inventory → Stock Balances`, `Operations Dashboard → Positive Stock`, or `Operations Dashboard → Zero stock rows`

## Steps

1. Open `Inventory`.
2. Select `Stock Balances`.
3. Confirm the posting context in the header.
4. Use search to filter by item code, item name, lot, or storage location.
5. Review on-hand quantity, base UOM, lot, expiry, storage location, last update, and balance version.

When you open `Positive Stock` or `Zero stock rows` from the Operations Dashboard, the page enters a closed, read-only dashboard profile:

- `Positive Stock` contains current balance rows above zero.
- `Zero stock rows` contains existing balance rows whose on-hand quantity is exactly zero. Negative rows and catalog items that do not yet have a balance row are excluded. The count is for balance rows, not unique catalog items.

Both profiles use the selected authorized location and active Inventory Location relationships. Search can narrow the fixed population, up to 120 characters. Select `Open all stock balances` to deliberately return to the broader Stock Balances workspace.

[Screenshot placeholder: Stock Balances page showing current-location balance rows and search.]

## Expected result

- The page shows only balance rows for your current authorized location.
- Quantities come from posted inventory movements and cannot be edited from this page.
- Lot and expiry details appear when the posted balance row carries those identifiers.
- Results are loaded with server-side pagination (10 rows per page). Search, `Positive stock`, and `Expiring soon` filters are applied before counting and paging; tab counts remain query-aware.
- `Balance rows` shows the exact number matching the current search and selected tab, not only the rows on the visible page.
- Updated dates use the selected company's displayed timezone. If it is not configured, the operational default is `Asia/Manila`.
- `Export CSV` exports all matching current-location rows for the search, not just the visible page.
- In either dashboard profile, the exact list total, pages, and CSV export use the same fixed row definition and current search.
- CSV export appears only for export-authorized users. If the configured synchronous row limit is exceeded, narrow Search and try again; no partial file is downloaded.

## Important controls and warnings

- Do not use Stock Balances to correct inventory. Corrections must go through approved receiving, transfer, count, wastage, adjustment, or reversal workflows.
- Viewing, searching, paging, or exporting these rows requires no evidence and changes no document status, approval, inventory quantity, or financial value. Profile exports produce an aggregate operational audit event without storing the search text or row contents.
- The page does not show all-company or all-location stock for ordinary posting users.
- A missing balance row is not included in `Zero stock rows`; the profile is not an item-catalog completeness report. A zero balance does not automatically create or recommend a Purchase Request, Purchase Order, or Transfer Request.
- Positive Stock and Zero stock rows are live inquiries, not saved dashboard snapshots. Posted movements can change their rows between opening the dashboard, the profile, and an export.
- A copied dashboard-profile link does not grant stock-balance or export permission. Invalid, retired, duplicate, or widening profile inputs do not fall back to the broader balance list.
- `View Ledger` appears only for separately authorized users. Opening it rechecks current ledger permission and location scope; the dashboard profile does not grant ledger access.

## What happens next

Use the appropriate controlled workflow when the balance shows a need: transfer request for available internal stock, Purchase Request for external replenishment, stock count for physical verification, wastage for loss, or Stock Adjustment for approved corrections.

## Related articles

- Reviewing Ledger Variance
- Receiving Issued Purchase Orders
- Understanding Purchase Order statuses
- Requesting stock when a branch item is low
