# OGFI ERP Release Notes — Zero Stock Rows dashboard profile

**Release date:** July 26, 2026

**Audience:** Inventory, warehouse, storekeeping, branch management, operations, and authorized support users

**Affected locations / roles:** Users with Stock Balance view access in the selected location; CSV remains separately export-authorized

## What Changed

- The Overview `Zero stock rows` signal now opens a focused, read-only Zero Stock Rows profile instead of the broader Stock Balances list.
- The dashboard count, exact profile total and pages, and profile CSV share the same current-location definition: existing balance rows at exactly zero under active Inventory Locations.
- Negative balances and catalog items without an existing balance row are excluded. The measure counts balance rows, not unique catalog items.
- Search may narrow the fixed profile, up to 120 characters. Invalid or widening profile links fail visibly instead of opening a broader list.

## What You Need To Do

- Confirm the selected location before relying on the profile.
- Use `Open all stock balances` when you intentionally need the ordinary Stock Balances workspace.
- If an export exceeds the configured synchronous limit, narrow Search and try again. No partial file is produced.

## Important Notes

- Zero Stock Rows is a live balance inquiry, not a historical dashboard snapshot, catalog-completeness report, or automatic replenishment queue.
- The profile does not create a Purchase Request, Purchase Order, Transfer Request, movement, or adjustment. Follow the approved replenishment or correction workflow when action is needed.
- Stock-balance view, CSV export, and Inventory Ledger access are authorized separately. Opening a link rechecks current permission and selected-location scope.
- PostgreSQL query-plan and fixture evidence, authenticated responsive-browser verification, hosted recovery, and UAT remain required before Workspace 1 is production-ready.

## Learn More

- [Viewing Stock Balances](../knowledge-base/warehouse-inventory/viewing-stock-balances.md)

## Support

Report an unexpected count, row, or export limit through the normal OGFI ERP support channel. Include the selected location, visible profile label, and time observed; do not include sensitive record contents.
