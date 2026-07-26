# OGFI ERP Release Notes — Existing Item details now enforce controlled corrections

**Release date:** July 26, 2026

**Audience:** Current Item Master administrators and future authorized master-data users

## What Changed

- `Open item details` now opens one selected Item TaskSheet while preserving the Item register's search, status filter, and page.
- For an Active Item, only the Item name can be corrected. A reason is required, and the change and audit event are recorded together.
- Item code, Category, item type, base/purchase/issue UOMs, and inventory, expiry, lot, and receiving-inspection controls are read-only. The server rejects attempts to change them pending a governed owner-approval and impact-review workflow.
- Inactive and archived Items are read-only and remain available for historical reference.
- Item deactivation is unavailable. The Item remains Active and no deactivation request is recorded. Warehouse/Purchasing review, on-hand stock and open procurement/inventory transaction checks, and a replacement plan where required must be supported before this action can be released.
- The sheet opens authoritative, Item-filtered Admin Audit history in a new tab. Correcting a name does not post stock or change financial or transaction records.

## What You Need To Do

1. Open `Item Master`, select `Items`, find the record, and choose `Open item details`.
2. Review the selected company, Item, lifecycle status, Category, UOMs, type, and operational controls.
3. For an Active Item name correction, enter the corrected name and a reason, then choose `Save Item Name`.
4. Use `View authoritative item audit history (opens in new tab)` when you need the bounded, company-scoped audit record.
5. If the correction is rejected as stale, return to the refreshed register, reopen the Item, and review its current details before deciding whether to retry.

## Important Notes

- Do not treat the disabled `Deactivate Item` control as a request. No request or approval is created.
- Do not use the Item name to encode a Category, UOM, lifecycle, or operational-control change.
- The current build still requires a Core Administrator session plus selected-company `MANAGE`; the broader approved Item Master role policy remains unresolved.
- The 14-case disposable-PostgreSQL correction specification is discovered but unexecuted because the required database administration URL is unavailable. It covers stale and concurrent correction, inactive and foreign-scope denial, direct deactivation fail-closed behavior, and nine material-field forgery attempts; there is no database execution credit yet.
- This note does not declare Item Master, the wider Master Data workspace, Workspace 1, or Phase I production-ready. Governed material-change/deactivation, responsive-browser, disposable-PostgreSQL, hosted recovery/deployment, UAT, access-policy, and other applicable gates remain open.

## Training Impact

No separate course is required. Update the Item Master administrator briefing to cover the name-only correction boundary, required reason, stale refresh/reopen behavior, authoritative audit handoff, inactive/archived read-only state, and the difference between a disabled deactivation action and a recorded request.

## Learn More

- [Managing the Item Master](../knowledge-base/administration/managing-item-master.md)
- [Item parent lifecycle saves fail safely](2026-07-26-item-parent-lifecycle-concurrency.md)

## Support

If the current Item details or audit history do not explain a rejected correction, report the selected company, Item code, action attempted, and time observed through the normal OGFI ERP support channel. Do not include sensitive audit contents.
