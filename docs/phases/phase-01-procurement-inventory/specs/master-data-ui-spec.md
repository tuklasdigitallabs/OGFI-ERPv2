# OGFI ERP — Master Data UI Specification

**Phase:** I  
**Primary users:** System Administrator, Master Data Steward, Purchasing, Warehouse, Finance, Operations  
**Purpose:** Maintain controlled organization, location, item, category, unit, conversion, par-level, and reason-code data without creating duplicates or hidden policy changes.

---

## 1. Screen inventory

| ID | Screen | Purpose |
|---|---|---|
| MDM-01 | Master Data Home | Controlled entry point by data domain |
| MDM-02 | Organization & Locations | Company, brands, branches, warehouses, sublocations |
| MDM-03 | Departments & Cost Centers | Finance/operational classification |
| MDM-04 | Item Categories | Controlled category list |
| MDM-05 | Inventory Item List | Search/manage items with controls and lifecycle |
| MDM-06 | Inventory Item Detail | Item, UOM, conversion, supplier links, controls, par levels |
| MDM-07 | Units & Conversions | Central UOM definitions and item conversions |
| MDM-08 | Par Levels / Reorder Settings | Location-item settings |
| MDM-09 | Reason Codes | Wastage, adjustment, discrepancy, cancellation, emergency reasons |
| MDM-10 | Import / Change Request Review | Controlled bulk or change management |

## 2. Master Data Home

- Domain cards show record counts, pending change requests, data quality warnings, and last update.
- Only show domains the user can administer or view.
- Make data ownership visible on each domain.

## 3. Item detail requirements

### Required sections

- Identity: code, name, alternate/supplier code, active status.
- Classification: category, stock/non-stock, criticality.
- UOM: base UOM, purchase/issue UOM, conversion table.
- Inventory controls: lot tracking, expiry tracking, count policy, negative-stock policy.
- Supplier links / approved source context.
- Location par levels and effective dates.
- Change history and audit trail.

### Validation

- Prevent duplicate active item code.
- Require valid UOM and conversion for every transactable purchase/issue unit.
- Warn if item is changed while used in open transactions.
- Deactivation is blocked/controlled when open stock or transactions exist.

## 4. Organization/location management

- Location type must be explicit: branch, warehouse, commissary, head office, project site, pop-up, other.
- Brand is optional for shared company locations; required only where relevant.
- Support parent/child sublocations for stock storage areas.
- Changes to operating location/cost center must be effective-dated/audited.

## 5. Bulk import

- Use downloadable templates and pre-import validation preview.
- Show valid rows, warning rows, rejected rows, duplicate candidates, and responsible owner.
- No irreversible import without review/approval where configured.
- Keep import file, mapping, user, timestamp, results, and exception log.

## 6. Responsive behavior

- Full master-data administration is desktop-first.
- Mobile supports lookup, barcode/item search, and controlled request submission; avoid complex bulk editing on mobile.

## 7. Acceptance criteria

- Controlled users can manage records within domain permissions only.
- Duplicate and missing-required-data checks work before activation.
- Changes are auditable and do not alter historical transactions retroactively.
