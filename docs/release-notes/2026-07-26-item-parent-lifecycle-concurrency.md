# OGFI ERP Release Notes — Item parent lifecycle saves fail safely

**Release date:** July 26, 2026

**Audience:** System Administrators and company administrators who manage Item Master data

## What Changed

- Item creation and editing now coordinate with deactivation of their selected Item Category and base, purchase, or issue UOM.
- If an item save and parent deactivation happen at the same time, one completes first and the waiting action rechecks the latest records.
- The action that is no longer valid fails with the existing message that the selected Category or UOM is no longer available, or that the Category or UOM is still used by active items.
- A failed item save creates or changes no partial item and records no partial item audit event. A failed parent deactivation records no partial deactivation audit event of its own; refresh to confirm the current parent state.

## What You Need To Do

- Refresh Item Master and review the Item, Categories, and UOMs tabs before retrying.
- If the selected Category or UOM is no longer available, choose an active replacement and save the item again.
- If deactivation reports active items, move or deactivate those items through the existing Item Master controls before retrying the deactivation.

## Important Notes

- This changes concurrent save safety only. It does not change permissions, required reasons, Item/UOM definitions, lifecycle statuses, inventory, purchasing records, or historical audit data.
- Do not assume that a failed action partially succeeded; review the refreshed register and retry only the action still required.
- The disposable-PostgreSQL race checks are authored and registered but have not run because the required disposable database administration URL is unavailable. This release has no PostgreSQL concurrency-execution credit yet.
- This note does not declare Item Master, the wider Master Data workspace, Workspace 1, or Phase I production-ready.

## Training Impact

No separate training is required. Include the refresh-review-retry guidance in administrator release briefing notes.

## Learn More

- [Managing the Item Master](../knowledge-base/administration/managing-item-master.md)

## Support

If the refreshed records do not explain the message, report the selected company, Item code when applicable, Category or UOM code, action attempted, and time observed through the normal OGFI ERP support channel.
