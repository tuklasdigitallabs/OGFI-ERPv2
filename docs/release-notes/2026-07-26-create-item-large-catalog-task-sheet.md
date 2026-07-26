# OGFI ERP Release Notes — Create Item supports large Category and UOM catalogs

**Release date:** July 26, 2026

**Audience:** Current Item Master administrators and future authorized master-data users

## What changed

- `Create Item` now opens a focused TaskSheet instead of becoming unavailable when a company has a large Category or UOM catalog.
- Category, Base UOM, Purchase UOM, and Issue UOM each have independent server-paged search and page controls.
- Base UOM remains required. Purchase UOM and Issue UOM explicitly default to `None` and are not inferred from lookup results.
- A selected option remains identified while the user searches or changes pages in that selector.
- The TaskSheet distinguishes loading, no configured active records, no search matches, and lookup failure with retry.
- A rejected save keeps the draft available for correction. If a Category or UOM became unavailable, the catalogs refresh and the unresolved option must be selected again.
- A successful save closes the TaskSheet and leaves a persistent confirmation naming the new Item. Creating an Item posts no stock movement.

## What you need to do

1. Open `Item Master`, select `Items`, and choose `Create Item`.
2. Search and select an active Category and Base UOM.
3. Leave Purchase UOM or Issue UOM at `None` when no separate unit applies, or search for an active option.
4. Complete the tracking controls and required creation reason, then choose `Create Item`.
5. If a lookup fails, use its Retry action. If the save reports an unavailable Category or UOM, re-select the unresolved option before retrying.

## Important notes

- The current build requires a Core Administrator session and selected-company `MANAGE` scope. The approved master-data role matrix is broader; that access-policy mismatch remains an open release gate.
- Server authorization, selected-company scope, active-parent validation, duplicate-code control, and audit recording remain authoritative.
- This change does not create or alter inventory balances, ledger movements, purchasing records, supplier links, approvals, finance records, or historical transactions.
- This note does not declare Item Master, the wider Master Data workspace, Workspace 1, or Phase I production-ready. Responsive-browser, disposable-PostgreSQL, hosted recovery/deployment, UAT, access-policy, and other visible-workspace gates remain open.

## Training impact

No separate course is warranted for this bounded interface change. Add the independent selector, optional `None`, retry, stale-parent re-selection, and no-stock-effect points to the Item Master administrator briefing. Role-based training sign-off remains blocked until the Item Master access-policy mismatch is resolved.

## Learn more

- [Managing the Item Master](../knowledge-base/administration/managing-item-master.md)

## Support

If the draft cannot be completed after retrying, report the selected company, Item code, affected Category or UOM code, action attempted, and time observed through the normal OGFI ERP support channel.
