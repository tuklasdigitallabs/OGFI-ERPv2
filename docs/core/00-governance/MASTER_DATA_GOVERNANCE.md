# OGFI ERP — Master Data Governance

**Status:** Phase I operating control standard  
**Purpose:** Keep the ERP usable, auditable, and free from duplicate or uncontrolled master data.

---

## 1. Policy statement

Master data is shared operational infrastructure. It must be controlled because bad master data creates duplicate suppliers, incorrect purchases, wrong inventory balances, inconsistent reporting, and approval failures.

No ordinary user may create uncontrolled master records directly in production. Requests, validation, approval, activation, deactivation, and audit history are required according to the record type.

## 2. Governance principles

1. One record per real-world entity whenever practical.
2. Use stable codes; never use display names as system identifiers.
3. Deactivate instead of delete when records have transaction history.
4. Prevent near-duplicates before creation.
5. Maintain effective dates for prices, role assignments, locations, and policy-sensitive records.
6. Record a data owner, steward, approver, and source for material master data.
7. Changes to data that affect purchases, inventory, approvals, reporting, or financial value must be auditable.

## 3. Ownership matrix

| Master data | Business owner | Data steward | Creation / change approval | Notes |
|---|---|---|---|---|
| Tenant and company | Executive / System Owner | System Administrator | Executive | Future multi-client boundary. |
| Brands | Executive / Business Development | System Administrator | Executive | Open/configurable brands. |
| Locations / warehouses / sublocations | Operations + Finance | System Administrator | Operations Manager + Finance where cost center impacts | Includes branch, warehouse, commissary, project site. |
| Departments / cost centers | Finance / HR-Admin | Finance Admin | Accounting Manager | Needed for reporting and budget context. |
| Users / role assignments | Department Head + HR | System Administrator | Role owner / IT Admin | Segregate HR source data from app access changes. |
| Approval templates | Executive + Finance + Process Owner | System Administrator | Authorized policy owners | No code change for normal policy change. |
| Suppliers | Purchasing | Purchasing Officer | Purchasing Manager + Finance where required | Supplier status must be controlled. |
| Supplier-item links / price lists | Purchasing | Purchasing Officer | Purchasing Manager | Effective dated; retain history. |
| Inventory categories | Purchasing + Finance | Master Data Steward | Purchasing Manager + Finance | Keep categories stable for reporting. |
| Inventory items | Purchasing + Warehouse + Finance | Inventory Master Data Steward | Purchasing + Warehouse + Finance approval | Item codes, UOM, conversions, and controls required. |
| Units of measure / conversions | Warehouse + Finance | Inventory Master Data Steward | Warehouse Manager + Finance | No free-text units in transactions. |
| Par levels / reorder rules | Operations + Warehouse | Storekeeper / Warehouse Planner | Operations Manager | Location-specific, effective dated. |
| Wastage / adjustment reasons | Operations + Finance | System Administrator | Operations + Finance | Locked controlled list. |
| Document types / numbering | Finance + System Administrator | System Administrator | Finance / Executive | Configuration only. |

## 4. Master data lifecycle

```text
Requested → Validated → Approved → Active → Changed / Superseded → Inactive
```

- **Requested:** Submitted through the appropriate master-data form or controlled import template.
- **Validated:** Steward checks completeness, duplicates, dependencies, and documentation.
- **Approved:** Authorized owner approves material changes.
- **Active:** Record may be used in transactions.
- **Changed / Superseded:** Material changes are effective-dated; old values remain historical.
- **Inactive:** Record is not selectable for new transactions but remains visible in historical records.

## 5. Supplier governance

### Required supplier controls

- Legal/display name, supplier code, contact data, category, payment terms, tax/registration data where needed.
- Status: `prospective`, `pending_review`, `approved`, `conditional`, `blocked`, `inactive`.
- Duplicate check on name, tax identifier, bank account where recorded, contact number, and email.
- Documents and expiration dates where required by procurement policy.
- Supplier changes affecting payment or legal identity require Finance review.
- A blocked supplier cannot be selected for a new PO unless an authorized exception is recorded.

## 6. Inventory item governance

### Required item fields before activation

- Item code, item name, normalized description, category, stock/non-stock flag.
- Base UOM and valid purchase/issue UOM conversions.
- Default inventory control behavior: stock tracked, lot tracked, expiry tracked, count frequency, criticality.
- Default supplier links where available.
- Costing method / valuation behavior as defined by Finance.
- Active locations and par level configuration where applicable.

### Duplicate-prevention rules

- Search by code, normalized name, supplier item code, brand, category, and unit before creation.
- Do not create a separate item because of a supplier-specific package size; use approved UOM conversions where feasible.
- Do not create “miscellaneous” item records for recurring items. Create a proper master record after the first controlled purchase.

## 7. Change controls by impact

| Change | Minimum control |
|---|---|
| Typo or non-material description fix | Steward edit + audit log |
| Item category, UOM, conversion, stock flag, expiry flag | Owner approval; impact review |
| Supplier bank/tax/legal data | Purchasing + Finance approval |
| Supplier status to blocked/approved | Purchasing Manager + Finance where applicable |
| Location activation/deactivation | Operations + Finance approval |
| Cost center or department change | Finance approval |
| Approval route/template change | Process owner + Finance/Executive as applicable |
| Par level change | Operations/warehouse authorization; effective date |

## 8. Data quality controls

The system should report and prevent:

- Duplicate active supplier names or tax identifiers.
- Duplicate active inventory item codes.
- Active stock item with no base UOM.
- Purchase UOM without valid conversion to base UOM.
- Stock item configured with no active storage location where required.
- Item or supplier used in open transaction but deactivated without replacement plan.
- Expiry-tracked item received without expiry data.
- Location-based par level missing for items included in reorder monitoring.

## 9. Periodic governance cadence

| Cadence | Activity | Owner |
|---|---|---|
| Weekly | Review pending master-data requests and duplicates | Stewards |
| Monthly | Review inactive/unused items, supplier status, missing item controls | Purchasing + Warehouse + Finance |
| Quarterly | Review approval templates, role assignments, location/department changes | Process owners + IT Admin |
| Annually | Review codes, numbering, archive/retention, inactive master data | Executive + Finance + IT |

## 10. Audit requirements

For controlled master records, store: previous value, new value, reason, actor, approver where required, effective timestamp, source of change, and linked change request.
