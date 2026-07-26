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
- If the screen reports that too many option searches are in progress, wait until the retry action becomes available, then retry manually. The system does not retry automatically, and it keeps the current selection and draft unchanged.
- If creation fails, the TaskSheet keeps the draft and shows a user-safe message. Correct the indicated field and retry.
- If a selected Category or UOM became inactive or unavailable, the option catalogs refresh. Re-select every unresolved Category or UOM before retrying.
- If you cancel or close a changed draft, confirm whether to discard the entered information.

## Other Item Master controls

The Item, Category, UOM, and Conversion registers use server-backed search, filters, deterministic pagination, and exact matching totals. Only the active URL-backed tab and its required catalogs are loaded.

### Open an existing item or correct its name

1. In the `Items` register, find the company-scoped Item and choose `Open item details`.
2. Review the company, Item code and name, status, Category, UOMs, item type, and operational-control summary.
3. If the Item is Active and only its display name needs a non-material correction, enter the corrected Item name and a correction reason of at least five characters.
4. Choose `Save Item Name`.
5. Review the confirmation, then choose `Return to Item Register`. The register returns to the search, status filter, and page you were using.
6. To inspect the authoritative change history, choose `View authoritative item audit history (opens in new tab)`. Admin Audit opens with the selected Item Entity ID filter.

Only an Active Item's display name is writable in this sheet. Item code, Category,
item type, base/purchase/issue UOMs, inventory tracking, expiry tracking, lot
tracking, and receiving-inspection controls are read-only. These material changes
require governed owner approval and impact review, and the current build does not
provide that request workflow. A copied or modified submission cannot bypass the
server-side restriction.

Inactive or archived Items are read-only and remain visible for transaction and
audit history. Reactivation is not available in this workspace.

Item deactivation is also unavailable. The Item remains Active, and opening its
details does not record a deactivation request. Deactivation requires Warehouse
and Purchasing review, checks of on-hand stock and open procurement or inventory
transactions, and a replacement plan where the Item is in use. Contact the
company's master-data owner; do not treat the disabled `Deactivate Item` control
as a submitted request.

**Expected result:** A successful Item-name correction records the before/after
name and reason in audit history without changing the Item's governed fields,
lifecycle status, inventory balance, financial records, or transaction history.
If another action changed the Item first, return to the refreshed register,
reopen the Item, review its current details, and decide whether the correction is
still required.

Categories and UOMs use the same selected-record control pattern. Conversion creation uses independent, bounded searches for Item, From UOM, and To UOM; the server requires company-scoped active records, distinct UOMs, a positive conversion factor, a reason, and valid audit context. Conversion edits keep the Item and UOM endpoints read-only while allowing the factor, rounding rule, and reason to be changed.

During Conversion creation, each of the three selectors can load or recover independently. If one is rate-limited or unavailable, wait for that selector's retry action and retry it manually; the other selections and the conversion draft remain unchanged.

## Controls and warnings

- Item Master data belongs to the selected company. A search result or copied URL does not grant access to another company.
- The server rechecks authorization, company scope, duplicate item code, and active Category/UOM selections when saving.
- Important master data is never hard-deleted. Item deactivation is currently unavailable until its governed review workflow is implemented; inactive and archived Items remain traceable.
- Available Item create and Item-name correction actions require a reason and preserve audit history.
- Creating or editing master data has no inventory or financial posting effect. Use receiving, transfers, stock counts, wastage, or adjustments for controlled stock effects.
- Concurrent Item creation and Category/UOM deactivation settle in one safe order. Refresh the affected registers and review their current state before retrying a rejected action.
- A stale Item-name correction is rejected instead of overwriting a newer change. Reopen the Item from the refreshed register before deciding whether to retry.
- These Item improvements do not mean the wider Master Data workspace or Phase I is production-ready. Responsive-browser, database, hosted recovery/deployment, UAT, access-policy, governed material-change/deactivation, and other visible-workspace gates remain open.

## What happens next

The new governed item becomes available to later authorized workflows that use active Item Master records. Creating it does not create a Purchase Request, Purchase Order, receipt, transfer, balance, or ledger entry.

An Item-name correction changes only the display name. Material changes and
deactivation remain pending governed workflows; no request or approval is created
from the current Item details sheet.

## Related articles

- [Managing Suppliers](managing-suppliers.md)
- [Item parent lifecycle saves fail safely](../../release-notes/2026-07-26-item-parent-lifecycle-concurrency.md)
- [Create Item supports large Category and UOM catalogs](../../release-notes/2026-07-26-create-item-large-catalog-task-sheet.md)
- [Existing Item details now enforce controlled corrections](../../release-notes/2026-07-26-selected-item-controlled-correction-sheet.md)
- [Item option searches now recover without losing the draft](../../release-notes/2026-07-27-item-option-catalog-admission-and-observability.md)
