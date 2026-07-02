# OGFI ERP — Migration and Seed Data Plan

**Status:** Phase I cutover standard  
**Purpose:** Move clean foundational data into the ERP without importing the same spreadsheet and paper problems that the system is meant to solve.

---

## 1. Migration objectives

- Establish clean, controlled master data before live transactions begin.
- Load opening inventory only after reconciliation and approval.
- Preserve source, owner, validation, and approval evidence for imported data.
- Avoid duplicate suppliers, items, units, locations, and users.
- Use staged imports and reconciliation rather than one large uncontrolled upload.

## 2. Data migration approach

```text
Discover → Extract → Clean → Map → Validate → Test Import → Reconcile → Approve → Production Load → Hypercare
```

No production migration is final until the responsible business owner signs off on the reconciliation result.

## 3. Phase I migration scope

| Data set | Required for go-live | Source owner | Target owner |
|---|---:|---|---|
| Tenant/company profile | Yes | Executive/Admin | System Administrator |
| Brands | Yes | Management | System Administrator |
| Locations and sublocations | Yes | Operations/Warehouse | System Administrator |
| Departments and cost centers | Yes | Finance/HR Admin | Finance Admin |
| Users, roles, scopes | Yes | HR + Department Heads | System Administrator |
| Suppliers | Yes | Purchasing | Purchasing Master Data Steward |
| Supplier documents/status | Where available | Purchasing/Finance | Purchasing |
| Item categories | Yes | Purchasing/Finance | Master Data Steward |
| Units of measure/conversions | Yes | Warehouse/Finance | Inventory Master Data Steward |
| Inventory items | Yes | Purchasing/Warehouse | Inventory Master Data Steward |
| Supplier-item price lists | Recommended | Purchasing | Purchasing |
| Par levels | Recommended for pilot locations | Operations/Warehouse | Operations |
| Opening inventory quantities/values | Yes for pilot locations | Warehouse/Branch | Finance + Warehouse |
| Open PRs/POs | Optional, controlled decision | Purchasing | Purchasing |
| Historical movements | Not required for Phase I go-live | Legacy files | Archive only unless specifically approved |

## 4. Source discovery and data inventory

Before import, record each source file or system:

- Owner and access level
- Last updated date
- Coverage (brand, branch, warehouse, time period)
- Fields available
- Known issues and duplicate patterns
- Whether it is authoritative or a working copy
- Import priority and retention requirement

Do not assume the latest file name means the data is correct.

## 5. Standard templates

Use controlled import templates with a data dictionary reference. At minimum:

1. `locations.csv` — company, brand where applicable, code, name, type, parent location, address, timezone, status.
2. `departments_cost_centers.csv` — code, name, company, parent, status.
3. `users_roles_scopes.csv` — employee/user identifier, email, role, company, brand/location scope, effective dates.
4. `suppliers.csv` — supplier code, legal/display name, category, contact, tax fields where applicable, status, terms.
5. `items.csv` — item code, name, category, stock flag, base UOM, control flags, active status.
6. `uom_conversions.csv` — item code, from UOM, to UOM, factor, effective date.
7. `supplier_item_prices.csv` — supplier, item, UOM, price, effective date, currency, MOQ, lead time.
8. `par_levels.csv` — location, item, par level, reorder point, effective date.
9. `opening_inventory.csv` — location, item, UOM, counted quantity, unit cost, lot/expiry where required, count timestamp, approver.

## 6. Data-cleaning rules

- Normalize casing, whitespace, punctuation, phone numbers, email, and address formats.
- Replace free-text UOMs with approved UOM codes.
- Resolve duplicate suppliers and items before import; do not load “maybe duplicate” records as active.
- Verify all item UOM conversions.
- Verify location codes against the official organization/location list.
- Do not import inactive or obsolete items unless history or outstanding orders require them.
- Record a source row identifier for every imported record.
- Maintain an exception log for records excluded from import and why.

## 7. Opening inventory cutover

### 7.1 Preparation

- Freeze or tightly control stock movements at each pilot location during the count window.
- Ensure item masters, UOM conversions, locations, and approved par levels are complete.
- Assign counters and approvers.
- Prepare count sheets or mobile count workflow.

### 7.2 Count and valuation

- Count physical stock by actual storage location.
- Record lot and expiry details where configured.
- Reconcile count to approved opening balance template.
- Finance confirms the approved unit-cost/valuation basis.
- Post opening inventory through a dedicated opening-balance transaction type, never by manually editing stock balance.

### 7.3 Approval and sign-off

Opening inventory requires sign-off from:

- Warehouse/branch custodian
- Location manager
- Warehouse/Operations manager
- Finance representative

## 8. Open transactions decision

Default Phase I recommendation:

- Do **not** migrate all historical PRs, POs, counts, transfers, or wastage records.
- Migrate only open POs and open transfer obligations when they are necessary for operational continuity.
- Keep legacy files read-only in a controlled archive and reference them in cutover notes.
- Any migrated open record must have a documented source, status mapping, owner, and reconciliation result.

## 9. Test migration and reconciliation

Perform at least one test migration before production:

| Test | Acceptance condition |
|---|---|
| Unique codes | No duplicate active company, location, supplier, or item code. |
| Required fields | All mandatory fields complete or listed as controlled exceptions. |
| UOM conversion | Purchase/issue/base conversions pass validation. |
| Supplier links | Supplier status and item-price records match approved source. |
| Opening inventory | Quantity and valuation totals reconcile by location/category/item. |
| Role scopes | Pilot users see only their permitted scope. |
| Approval routing | Seeded users/roles route test transactions correctly. |
| Reporting | On-hand and opening value reports reconcile to approved upload totals. |

## 10. Cutover checklist

1. Freeze master-data changes for the cutover window.
2. Complete final approved imports.
3. Load and validate users/roles/scopes.
4. Load opening inventory using controlled ledger transaction.
5. Reconcile dashboard/report totals.
6. Run a full pilot: PR → approval → PO → receiving → transfer → count → wastage.
7. Obtain written go-live sign-off.
8. Maintain hypercare support and daily reconciliation for the first operating period.

## 11. Hypercare

For the first 2–4 weeks after pilot go-live:

- Daily review of failed imports, role/scope issues, notification failures, and inventory discrepancies.
- Daily report of open POs, unreceived transfers, critical stock, counts due, and unapproved adjustments.
- Maintain a cutover issue log with priority, owner, workaround, and permanent fix.
