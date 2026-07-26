# OGFI ERP Release Notes — Rows with lot or expiry data dashboard profile

**Release date:** July 26, 2026

**Audience:** Inventory, warehouse, storekeeping, branch management, operations, and authorized support users

**Affected locations / roles:** Users with Stock Balance view access in the selected location; CSV remains separately export-authorized

## What Changed

- The Overview `Rows with lot or expiry data` signal now opens the focused, read-only `lot-expiry-data-v1` Inventory profile.
- The dashboard count, exact profile total and pages, and profile CSV use the same row definition: an existing balance row with a nonblank trimmed lot number, a recorded expiry date, or both.
- Positive, zero, and negative on-hand quantities are included. An absent lot or expiry field is displayed as `Not recorded`.
- Search may narrow the fixed current-location population, up to 120 characters. Invalid or widening profile links fail visibly instead of opening a broader list.
- New lot values are saved after surrounding spaces are removed; a blank result is treated as not recorded. Existing legacy rows are not rewritten.

## What You Need To Do

- Confirm the selected location before relying on the profile.
- Use `Open all stock balances` when you intentionally need the broader Stock Balances register.
- Treat the profile as a data-presence inquiry, not as proof that lot or expiry tracking requirements have been met.
- If an export exceeds the configured synchronous limit, narrow Search and try again. No partial file is produced.

## Important Notes

- The profile is live and read-only, not a historical dashboard snapshot or a measure of compliance, coverage, accountability, complete traceability, or operational completeness.
- A blank-only legacy lot without an expiry date is excluded. Review of legacy blank-lot data quality remains a separate follow-up and is not performed by this profile.
- The profile does not edit lot or expiry data, post inventory, change a balance, or grant ledger access. Stock-balance view, CSV export, and Inventory Ledger access are authorized independently.
- PostgreSQL query-plan and fixture evidence, authenticated responsive-browser verification, hosted recovery, and UAT remain required before Workspace 1 is production-ready.

## Training Impact

No separate training course is required. Inventory and branch teams should receive a short briefing that the signal measures recorded data presence at the balance-row level, includes every quantity sign, and must not be used as a compliance or complete-traceability report.

## Learn More

- [Viewing Stock Balances](../knowledge-base/warehouse-inventory/viewing-stock-balances.md)

## Support

Report an unexpected count, row, missing-field display, or export limit through the normal OGFI ERP support channel. Include the selected location, visible profile label, and time observed; do not include sensitive record contents.
