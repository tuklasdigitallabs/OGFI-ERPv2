# Managing the Item Master

## Who can do this

In the current build, Item Master actions require a Core Administrator session and active `MANAGE` scope for the selected company. The approved role matrix also identifies authorized Purchasing and Warehouse master-data users, but that broader access is not implemented consistently yet. Do not assume those roles can create items until the access-policy gap is resolved.

## Purpose

Use Item Master to maintain governed, company-scoped items, Categories, units of measure (UOMs), and conversions. Creating or changing an item does not post stock or rewrite historical transactions.

## Prerequisites

- Select the correct company before opening Item Master.
- Confirm that an active Category and active Base UOM already exist for the item.
- Prepare a unique item code, item name, item type, operational tracking settings, and a creation reason of at least five characters.
- Decide whether Purchase UOM and Issue UOM are needed. Both are optional and default to `None`.

## Navigation path

Open `Item Master`, then select the `Items` tab.

## Create an item

1. Confirm the selected company shown in Item Master, then choose `Create Item`.
2. Enter the Item code and Item name, then select the Item type.
3. In Category, search by Category code or name. Review the paged results and select one active Category.
4. In Base UOM, search by UOM code or name and select one active UOM. Base UOM is required.
5. For Purchase UOM and Issue UOM, leave `None` when no separate unit applies, or search and select an active UOM. `None` is an explicit non-assignment; the system does not infer a UOM.
6. Review the operational controls for inventory, expiry, lot, and receiving-inspection tracking.
7. Enter the Creation reason.
8. Choose `Create Item`. Submission remains unavailable until the required Category and Base UOM have resolved as active options.

Each Category or UOM selector has its own search and page controls. Changing one selector does not change the others. A selected value remains identified while you search or move through other result pages.

## Expected result

After a successful save, the TaskSheet closes and Item Master shows a persistent confirmation with the new Item code and name. Choose `View item register` to review the register. The item and its audit event are recorded together, and no inventory movement is posted.

## Empty, loading, and error states

- While a selector is loading, wait for its options to resolve before submitting.
- If no active Categories or UOMs are configured, close the TaskSheet and use the corresponding `Categories` or `UOMs` tab to create or reactivate the authoritative record.
- If a search returns no match, choose `Clear search`. Your current selection is not changed by an empty search result.
- If a lookup is unavailable, choose its `Retry ... lookup` action. An optional selector left at `None` remains unassigned even when its lookup fails.
- If creation fails, the TaskSheet keeps the draft and shows a user-safe message. Correct the indicated field and retry.
- If a selected Category or UOM became inactive or unavailable, the option catalogs refresh. Re-select every unresolved Category or UOM before retrying.
- If you cancel or close a changed draft, confirm whether to discard the entered information.

## Other Item Master controls

The Item, Category, UOM, and Conversion registers use server-backed search, filters, deterministic pagination, and exact matching totals. Only the active URL-backed tab and its required catalogs are loaded.

Select an existing item and choose `Open controls` to edit or deactivate it while preserving the register's current search and page context. If an item has posted inventory history, its Base UOM cannot be changed through normal editing; a controlled migration is required.

Categories and UOMs use the same selected-record control pattern. Conversion creation uses independent, bounded searches for Item, From UOM, and To UOM; the server requires company-scoped active records, distinct UOMs, a positive conversion factor, a reason, and valid audit context. Conversion edits keep the Item and UOM endpoints read-only while allowing the factor, rounding rule, and reason to be changed.

## Controls and warnings

- Item Master data belongs to the selected company. A search result or copied URL does not grant access to another company.
- The server rechecks authorization, company scope, duplicate item code, and active Category/UOM selections when saving.
- Important master data is deactivated, not hard-deleted, so historical use remains traceable.
- All create and change actions require a reason and preserve audit history.
- Creating or editing master data has no inventory or financial posting effect. Use receiving, transfers, stock counts, wastage, or adjustments for controlled stock effects.
- Concurrent item saves and Category/UOM deactivation settle in one safe order. Refresh the affected registers and review their current state before retrying a rejected action.
- This Create Item improvement does not mean the wider Master Data workspace or Phase I is production-ready. Responsive-browser, database, hosted recovery/deployment, UAT, access-policy, and other visible-workspace gates remain open.

## What happens next

The new governed item becomes available to later authorized workflows that use active Item Master records. Creating it does not create a Purchase Request, Purchase Order, receipt, transfer, balance, or ledger entry.

## Related articles

- [Managing Suppliers](managing-suppliers.md)
- [Item parent lifecycle saves fail safely](../../release-notes/2026-07-26-item-parent-lifecycle-concurrency.md)
- [Create Item supports large Category and UOM catalogs](../../release-notes/2026-07-26-create-item-large-catalog-task-sheet.md)
