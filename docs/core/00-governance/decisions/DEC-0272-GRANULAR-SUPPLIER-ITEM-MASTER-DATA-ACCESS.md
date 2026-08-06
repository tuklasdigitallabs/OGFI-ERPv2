# DEC-0272 — Granular Supplier and Item Master-Data Access

## Metadata

- Decision ID: `DEC-0272`
- Status: `Confirmed`
- Date: 2026-08-04
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related scope: Phase I Supplier Master; Item Master; UAT access parity

## Decision

Replace the ordinary Supplier and Item Master `core.administer` gate with explicit
permissions. `core.administer` remains a backwards-compatible administrator
override; it must not be granted to operational users to obtain ordinary
master-data access.

| Permission | Granted capability | Intended matrix roles |
|---|---|---|
| `master_data.supplier.view` | View suppliers and non-confidential catalog links | Matrix Supplier `V` roles |
| `master_data.supplier.create` | Create a supplier | Purchasing Manager, Purchasing Officer |
| `master_data.supplier.edit` | Create non-confidential supplier-item links | Purchasing Manager, Purchasing Officer |
| `master_data.supplier.manage` | Accreditation and supplier/catalog-link deactivation | Purchasing Manager |
| `master_data.item.view` | View items, categories, UOMs, and conversions | Matrix Item `V` roles |
| `master_data.item.create` | Create item/category/UOM/conversion records | Warehouse Manager |
| `master_data.item.edit` | Make permitted non-material master-data corrections | Warehouse Manager |

Read requires an active assignment at the selected company, or an active Brand
or Location assignment belonging to that company. Create, edit, and manage
require an active `COMPANY`/`MANAGE` assignment because Supplier and Item Master
records are company-owned.

`purchasing.supplier_confidential.view` remains additive for payment terms and
reference prices. Item deactivation and other material lifecycle changes remain
under the existing fail-closed core-administration/governance path; this
decision does not introduce an Item lifecycle permission.

## Hard controls retained

- Tenant and selected-company predicates remain at every service/data read.
- Mutations retain server-side permission and Company `MANAGE` checks, required
  reason, duplicate validation, transactions, and immutable audit events.
- Supplier lifecycle changes remain non-destructive and serialized under the
  existing active-row lock.
- Item material fields and Item deactivation remain fail-closed.
- The UI projects view-only access without action controls; service checks remain
  authoritative for crafted requests.

## UAT configuration consequence

The permission records are seeded but no broad operational role is silently
assigned. An administrator must configure Purchasing/Warehouse role permissions
and the required active Company `MANAGE` scope before maintainer UAT. Branch and
Storekeeper roles are view-only and need active assigned scope.

## Opening Inventory dependency

This decision does not create or seal an Opening Inventory pilot configuration.
That operation has no production authoring surface and requires owner-confirmed
pilot endpoints, item scope, role separation, and cutover details. Manual
database creation is prohibited.
