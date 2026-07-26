# OGFI ERP Release Notes — Item parent lifecycle saves fail safely

**Release date:** July 26, 2026

**Audience:** System Administrators and company administrators who manage Item Master data

## What Changed

- Item creation now coordinates with deactivation of its selected Item Category and base, purchase, or issue UOM.
- If Item creation and parent deactivation happen at the same time, one completes first and the waiting action rechecks the latest records.
- The action that is no longer valid fails with the existing message that the selected Category or UOM is no longer available, or that the Category or UOM is still used by active items.
- A failed Item creation creates no partial Item and records no partial Item audit event. A failed parent deactivation records no partial deactivation audit event of its own; refresh to confirm the current parent state.

## What You Need To Do

- Refresh Item Master and review the Item, Categories, and UOMs tabs before retrying.
- If the selected Category or UOM is no longer available, choose an active replacement and resubmit `Create Item`.
- If Category or UOM deactivation reports active dependent Items, review those Items and contact the company master-data owner. The current Item details sheet does not provide material reassignment or Item deactivation.

## Important Notes

- This changes concurrent Item-creation safety only. It does not change permissions, required reasons, Item/UOM definitions, lifecycle statuses, inventory, purchasing records, or historical audit data.
- Do not assume that a failed action partially succeeded; review the refreshed register and retry only the action still required.
- The disposable-PostgreSQL parent-lifecycle matrix contains four tests covering eight Item-creation race orders. It is authored and registered but has not run because the required disposable database administration URL is unavailable. This release has no PostgreSQL concurrency-execution credit yet.
- This note does not declare Item Master, the wider Master Data workspace, Workspace 1, or Phase I production-ready.

## Training Impact

No separate training is required. Include the refresh-review-retry guidance in administrator release briefing notes.

## Learn More

- [Managing the Item Master](../knowledge-base/administration/managing-item-master.md)

## Support

If the refreshed records do not explain the message, report the selected company, Item code when applicable, Category or UOM code, action attempted, and time observed through the normal OGFI ERP support channel.
