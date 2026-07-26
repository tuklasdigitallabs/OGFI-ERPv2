# OGFI ERP Release Notes — Stock Balance total and updated-date clarity

**Release date:** July 26, 2026  
**Audience:** Inventory, warehouse, storekeeping, branch management, and operations users  
**Affected locations / roles:** Users with Stock Balance view access in the selected location  

## What changed

- `Balance rows` now shows the exact number matching the current search and tab,
  rather than only the rows on the visible ten-row page.
- Updated dates are labeled and rendered in the selected company's configured
  timezone, with `Asia/Manila` as the fallback default.

## What you need to do

- No action is required. Existing search, tabs, pagination, and export controls
  continue to work as before.

## Important notes

- Stock Balances remains a read-only inquiry derived from posted inventory
  movements. The change does not edit quantities or post ledger movements.

## Learn more

- `docs/knowledge-base/warehouse-inventory/viewing-stock-balances.md`

## Support

Report an unexpected total or date through the normal OGFI ERP support channel
and include the selected location, search text, and active tab.
