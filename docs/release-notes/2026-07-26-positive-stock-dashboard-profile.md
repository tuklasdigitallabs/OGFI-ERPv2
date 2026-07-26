# OGFI ERP Release Notes — Positive Stock dashboard profile

**Release date:** July 26, 2026

**Audience:** Inventory, warehouse, storekeeping, branch management, operations, and authorized support users

**Affected locations / roles:** Users with Stock Balance view access in the selected location; CSV remains separately export-authorized

## What Changed

- The Overview Positive Stock metric and Active stock rows signal now open a focused, read-only Positive Stock profile instead of the broader Stock Balances list.
- The dashboard count, profile total and pages, and profile CSV use the same current-location definition: active inventory locations with quantity on hand above zero.
- Search may narrow the profile. Invalid or widening profile links fail visibly instead of opening a broader list.
- The profile CSV enforces the configured synchronous export limit and returns an error instead of silently truncating rows.

## What You Need To Do

- Confirm the selected location before relying on the profile.
- Use `Open all stock balances` when you intentionally need the ordinary All, Positive stock, or Expiring soon tabs.
- If an export exceeds the configured limit, narrow the search and try again. No partial file is produced.

## Important Notes

- Positive Stock is a live balance inquiry, not a historical snapshot of the earlier dashboard value.
- The profile does not post inventory, edit a balance, create an adjustment, or grant ledger access. Every page, export, and ledger handoff rechecks current permission and scope.
- PostgreSQL query-plan/volume evidence, authenticated responsive-browser verification, hosted recovery, and UAT remain required before Workspace 1 is production-ready.

## Learn More

- [Viewing Stock Balances](../knowledge-base/warehouse-inventory/viewing-stock-balances.md)

## Support

Report an unexpected count, row, or export limit through the normal OGFI ERP support channel. Include the selected location, visible profile label, and time observed; do not include sensitive record contents.
