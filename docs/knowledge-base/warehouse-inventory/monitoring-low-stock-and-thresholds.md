# Monitoring Low Stock and Setting Thresholds

**Audience / required role:** Branch and warehouse managers, storekeepers, Operations, Purchasing, and administrators with the permissions below.  
**Applies to:** Selected company and branch or warehouse; one threshold per item and storage location.  
**Related phase/module:** Phase I / Inventory  
**Last verified against:** DEC-0283; inventory workflow and UI specification; roles and permissions; implemented low-stock service, dashboard, workspace, and form.

## Purpose

Monitor recorded on-hand stock against an explicit threshold and identify items needing review. Configure Main Warehouse and SM North EDSA separately: a warehouse threshold does not configure the branch, even for the same item.

Configure thresholds on tracked inventory items, including raw materials used by recipes. Do not add a second threshold to an approved recipe. Future recipe availability will be calculated from its required ingredients and the stock available at the relevant location.

## Before you begin

- Viewing the register, dashboard signal, or export requires `inventory.balance.view` and active scope for the selected location; existing company MANAGE authority is supported.
- Saving thresholds additionally requires `master_data.item.edit` and MANAGE access to the selected location or company. VIEW or OPERATE alone does not authorize configuration.
- Know the exact item code, its base unit of measure, the correct storage location, and the threshold authorized by your workflow owner. No default thresholds are supplied.
- New monitoring requires an active inventory-tracked item, active base UOM, and eligible storage location. A reason is required for each configuration change; this form does not require an evidence upload.

## Navigation path

`Inventory → Low stock and thresholds` (`/inventory/low-stock`). You can also open `Dashboard → Low-stock alerts → Review low stock and thresholds` when that dashboard section is available.

## Steps

1. Select the intended location in the ERP header, such as Main Warehouse.
2. Open **Low stock and thresholds**. Use **Low-stock alerts** for matching exceptions or **Configured thresholds** to check coverage, including deactivated configurations.
3. Search by item or storage and use the page controls. **Export this view** exports the selected view and search within your authorized scope.
4. To configure monitoring, select **Set stock threshold**. Choose **Storage location**, enter **Item code**, and enter **Alert threshold** in the item's base UOM, not purchase packs. Use a nonnegative quantity with up to six decimal places.
5. Set **Monitoring** to **Active**, enter **Reason for change**, and select **Save threshold**. Wait for the saved confirmation.
6. To change or deactivate a threshold, open **Configured thresholds → Edit threshold**. Change the quantity or Monitoring state, give a reason, and save. The item and storage identity cannot be changed in this editor; configure the other pair separately.
7. Switch the ERP header to SM North EDSA and repeat for the branch's own storage and required items. Verify each location's **Configured thresholds** view separately.

## Expected result

- An eligible active item/storage pair is low stock when recorded on-hand is **at or below** its threshold; equality triggers an alert.
- Recorded on-hand sums the matching balance rows across lots in that storage location and uses the item's base UOM.
- An explicitly configured pair with no balance rows shows zero recorded on-hand and **No balance recorded; initialize or reconcile inventory**. This is not confirmation that the physical stock is zero.
- Deactivated thresholds and inactive item/storage pairs do not generate low-stock alerts. They remain visible in the configured view.
- A saved change records audit history. The editor shows the latest ten threshold changes, not a complete audit export.
- Saving changes monitoring only. It does not change stock, create a financial effect, approve a request, or post an inventory movement.

## Important controls and warnings

- Recorded on-hand is not available-to-dispatch stock: reservations, quarantine, and stock in transit are not deducted by this measure. Verify actual availability with the custodian.
- No thresholds means no coverage. Zero alerts can also mean configured stock is above threshold or the current search excludes alerts; it does not establish complete monitoring.
- These are live dashboard/register signals, not persistent notification messages. No Purchase Request, Purchase Order, or Transfer Request is created automatically.
- A blind-count protected state suppresses stock quantities, alert membership, counts, and exports. It is not zero alerts. Continue assigned count work and use an independent authorized reviewer where eligible.
- An access-unavailable message means the current permission, location scope, or record is unavailable. A read-only explanation means you cannot configure thresholds with your current authority.
- If loading fails, use **Try again** or contact support. If a save reports that the threshold changed or already exists, return to the list and reopen it before saving; do not overwrite another user's work from the stale form.

## What happens next

Review the alert with the responsible custodian. Follow the existing Request Stock process: check assigned Main Warehouse availability first, then use a Transfer Request for available internal stock or a Purchase Request when warehouse stock is unavailable, with the required approval controls. Do not interpret an alert as purchasing authority.

## Related articles

- [Viewing Stock Balances](viewing-stock-balances.md)
- [Creating Transfer Requests](creating-transfer-requests.md)
- [Running Stock Counts](running-stock-counts.md)
- [Low-stock feature and UAT preparation](../../release-notes/2026-09-07-low-stock-thresholds.md)
