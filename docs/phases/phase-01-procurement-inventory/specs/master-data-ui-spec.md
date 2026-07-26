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

Implementation note (`DEC-0124`): the Administration Reason Codes register is
server-paginated and selected-company scoped, with URL-backed query/workflow/status
filters, exact totals, deterministic ordering, and a selected-code read-only detail
surface. Existing create and ACTIVE-to-INACTIVE deactivation are retained; inactive
codes remain for history and are not offered in new-entry dropdowns.

Implementation note (`DEC-0138`/`DEC-0140`): the Item Master tabs use URL-backed
server filters, deterministic pagination, exact matching totals, and bounded
server-side selector catalogs. Conversion creation remains unavailable until its
full option catalog and focused action composer are migrated.

Implementation note (`DEC-0141`): the Supplier Register is company-scoped with
server-backed search, lifecycle/accreditation filters, deterministic pagination,
and exact totals; supplier catalog detail remains a separate paginated surface.

Implementation note (`DEC-0142`): supplier accreditation and deactivation use a
selected supplier action composer in the catalog workspace; registry rows do not
repeat the full mutation forms.

Implementation note (`DEC-0143`): item edit and deactivation use a selected item
action composer with context-preserving redirects. Base UOM changes after posted
inventory movements require controlled migration and are rejected server-side.

Implementation note (`DEC-0239`): Item create/edit and Item Category/UOM
deactivation share a transactional lifecycle-lock contract. Item writes lock and
revalidate the exact tenant/company-scoped active Category followed by sorted,
distinct base/purchase/issue UOMs. Category and UOM deactivation lock the scoped
active parent before checking active dependent Items. A concurrent pair must
serialize so the Item write either commits against active parents and blocks the
later deactivation, or the parent deactivates first and the Item write rejects it;
it must never create an active Item against an inactive parent. This checkpoint
does not add a lifecycle state, permission, composer, TaskSheet, or large-catalog
behavior. The executable disposable-PostgreSQL matrix is authored and registered:
eight tests cover Item create/update against Category and base/purchase/issue UOM
deactivation, with both winner orders for 16 total races. It requires distinct
backend PIDs, observes `pg_blocking_pids` waits, and asserts stable loser errors,
the final invariant, and atomic source/audit outcomes. It skips safely without the
integration sentinel, while the disposable runner still fails closed at
`DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`; no PostgreSQL execution credit is
claimed, and the race evidence gate remains open before Master Data can claim
production readiness.

Implementation note (`DEC-0180`): Item Master tabs are URL-backed and use an
active-tab projection. The selected register and only its required counts,
selected record, and option catalogs are read; inactive registers are not
hydrated. Authorization and mutations remain server-authoritative.

Categories and UOMs use the same selected-record action pattern; repeated row
controls are disabled with guidance to open the selected composer.

Conversion edits use a selected conversion composer with scoped item/UOM detail;
row edit controls are disabled with guidance and creation uses bounded selectors.
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
