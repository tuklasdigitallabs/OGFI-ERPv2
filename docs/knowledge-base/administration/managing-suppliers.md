# Managing Suppliers and Supplier Catalog Links

**Who can do this:** In the current build, a Core Administrator with active `MANAGE` scope for the selected company can use the Supplier workspace. Viewing or entering confidential Supplier commercial values also requires `Supplier confidential access`. That additional permission does not grant access to Suppliers by itself.

## Purpose

Use the company-scoped Supplier Register to find Suppliers, review a selected Supplier, create Supplier records and item links, update accreditation, or deactivate an active Supplier or link. Supplier payment terms and catalog reference-price details are separately restricted.

## Prerequisites

- Select the company whose Supplier records you are authorized to manage.
- Confirm that you have the current Supplier workspace authority and active company `MANAGE` scope.
- For payment terms or a Supplier Item reference unit price and effective date, also confirm that `Supplier confidential access` is explicitly assigned.
- Prepare the required reason for a create, accreditation, or deactivation action. Accreditation evidence is optional in the current screen.
- For a new Supplier Item link, identify the active Supplier, Item, and purchase UOM. The exact combination cannot already be linked.

`Supplier confidential access` is not assigned or recommended to `CONFIGURED_ADMIN` by default. Granting it requires an approved access decision outside this article; do not add it merely to remove a `Restricted` label.

## Navigation path

Open **Suppliers**. The selected company in your session is the company boundary for the register and all actions on this page.

## Review a Supplier and its catalog

1. In **Supplier Register**, search by Supplier code or name, or apply lifecycle and accreditation filters.
2. Use the page controls to move through the matching records. The displayed total and page range reflect the applied server filters.
3. Select a Supplier, then use **Overview**, **Catalog**, **Accreditation**, or **Audit** for the task you need.
4. In **Catalog**, search by Item, Supplier SKU, or Supplier item name. You can also filter by link status or Item Category.
5. Page through the catalog or the Category options as needed. The selected section, filters, pages, and action context are stored in the page URL and remain available when you close a focused task.
6. On a desktop-sized screen, review the catalog table. On a smaller screen, review the responsive cards. Both presentations represent the same filtered page of Supplier Item links; mobile use does not require horizontal table scrolling.

**Expected result:** You see only Suppliers and links in the selected company scope. An out-of-range page is returned to the last valid page. A true empty catalog is distinguished from a filter with no matches.

## Understand confidential values

1. Check the Supplier payment terms and the catalog's latest reference unit price, currency, and effective date.
2. If you do not have `Supplier confidential access`, these areas show **Restricted**. The confidential values are not sent to the page, and the related inputs are unavailable.
3. If you do have `Supplier confidential access`, the values or the appropriate not-configured state are shown. Your existing Supplier authority and selected-company scope are still required.
4. You may create an otherwise valid Supplier or Supplier Item link without entering confidential values. Leave payment terms, reference unit price, and effective date blank.

**Expected result:** Confidential Supplier values are visible and editable only when both ordinary Supplier authority and the additional confidential clearance apply. The confidential permission alone never opens the Supplier workspace or grants create, edit, accreditation, or deactivation authority.

## Create a Supplier

1. Choose **Create Supplier** to open the focused creation task.
2. Enter the required Supplier code and legal name. Add the available non-confidential identity and primary-contact details as needed.
3. If the payment-terms input is available and the value is needed, enter it. Otherwise leave it blank; do not place confidential terms in another field.
4. Enter the creation reason.
5. Choose **Create Supplier**.

**Expected result:** The Supplier is created as an active record with accreditation set to **Pending review**, and the creation is recorded in the audit trail. No Purchase Order, payment, inventory balance, or inventory-ledger movement is created.

## Create a Supplier Item link

1. Select an active Supplier and open **Catalog**.
2. Choose **Create supplier-item link** to open the focused link task.
3. Search and page through the active Item and purchase-UOM options, then select one of each.
4. Enter the ordinary link details needed for sourcing, such as Supplier SKU, Supplier item name, lead days, preferred rank, or minimum order quantity.
5. If the reference-price inputs are available and a price is needed, enter the reference unit price and effective date. Without confidential clearance, create the ordinary link without these values.
6. Enter a link reason and choose **Link supplier item**.

The effective date must be a real calendar date. If the action is not completed,
the focused task keeps your entered draft and places the safe error message inside
the task so you can correct and retry it. During submission, close, cancel, and
submit controls are temporarily unavailable to prevent duplicate actions.
Ordinary draft fields and selected Item/UOM context survive lookup paging within
the same signed-in user's browser tab. Confidential price/date fields are never
written to tab storage; recheck them after lookup navigation before submission.

**Expected result:** The new active link belongs to the exact selected Supplier, Item, purchase UOM, company, and tenant. The action is audited. The link and any permitted reference price are master data only; they do not approve a Supplier, create a Purchase Order, post inventory, or create a financial transaction.

## Deactivate a Supplier or Supplier Item link

1. Open the selected active Supplier's controls, or choose **Open controls** for one active link in **Catalog**.
2. In the focused deactivation task, verify the selected Supplier. For a link, also verify the Item and purchase UOM.
3. Enter a deactivation reason of at least five characters.
4. Choose **Deactivate supplier** or **Deactivate link**.
5. If the action reports that the record is unavailable, refresh the register and review its current status before deciding whether another action is needed.

An unsuccessful link deactivation keeps the entered reason in the open task. A
successful link action confirms completion before closing and returns focus to the
Catalog context. A success message cannot be created merely by changing the page
URL.

**Expected result:** A successful Supplier deactivation changes the Supplier to **Inactive** and its accreditation to **Suspended**. A successful link deactivation changes that exact link to **Inactive**. Both retain their history. If two users try to deactivate the same record at the same time, only the first valid action succeeds and produces the deactivation audit entry; the other user must refresh and review the retained result.

## Important controls and warnings

- Company and tenant scope, ordinary Supplier authority, active status, and the exact selected Supplier/link relationship are rechecked by the server.
- `Supplier confidential access` is additional clearance only. It does not replace current Supplier authority or selected-company scope.
- Without confidential clearance, payment terms and reference-price details show **Restricted** and confidential inputs are unavailable. Do not copy these values into reasons, contact fields, or other ordinary fields.
- Inactive Suppliers and links remain visible as retained history; they are not deleted.
- Deactivation requires a reason. A losing, stale, already inactive, foreign-company, or mismatched action does not create a second deactivation or audit entry.
- Supplier deactivation is serialized with accreditation changes and new link creation. A writer that starts after deactivation cannot restore accreditation or add a new link to the inactive Supplier.
- Supplier and link maintenance does not bypass quotation, approval, Purchase Order, receiving, payment, or inventory controls. It creates no inventory movement or direct financial posting.
- Supplier **Audit** opens the authoritative, company-scoped Admin Audit view for the selected Supplier. Availability still depends on the user's audit authority.

## What happens next

- Review a new Supplier's accreditation in the **Accreditation** tab using the authorized company process.
- Use an active Supplier Item link only through the applicable sourcing and procurement workflow. A link or reference price is not a purchase authorization.
- After a stale or concurrent deactivation message, return to the preserved register context, refresh, and review the current record before retrying any remaining valid task.

## Related articles

- [Managing the Item Master](managing-item-master.md)
- [Managing user access and controlled scopes](managing-user-access-and-controlled-scopes.md)
- [Understanding statuses, audit history, and attachments](../getting-started/understanding-statuses-audit-history-and-attachments.md)
- [Creating a Purchase Request](../purchasing/creating-a-purchase-request.md)
