# Inventory Workflow — Phase I
**Document ID:** inventory-workflow  
**Version:** 0.1  
**Date:** 25 June 2026  
**Applies to:** Inventory Master Data, Inventory Ledger, Stock Balances, Physical Counts, Variance Review, Inventory Controls

---

## 1. Purpose

This workflow establishes a perpetual, location-based inventory-control model for a multi-branch restaurant group. It replaces manual tallying with validated stock movements, controlled physical counts, and traceable corrections.

The immutable inventory movement ledger is the source of truth. On-hand balance records may be used for speed but must always reconcile to posted movements.

---

## 2. Scope

### In scope
- Inventory item, category, UOM, conversion, lot, and expiry master data
- Location-level on-hand stock
- Receipt, transfer, wastage, adjustment, count variance, returns, and opening-balance movements
- Physical count sessions and recounts
- Stock balance and movement inquiry
- Low-stock and negative-stock exception controls
- Audit, attachments, notifications, and exportable reporting

### Out of scope
- Recipe consumption and theoretical food cost
- POS-driven depletion
- Commissary production transformation
- Automated replenishment forecasting
- Advanced inventory valuation / general-ledger accounting
- Barcode scanning as a hard dependency, though the model remains ready for it

---

## 3. Inventory Model

```text
Item Master
  + UOM Conversion
  + Item Controls: inventory / lot / expiry / inspection
  + Inventory Location
  + Posted Inventory Movements
  = On-hand and available balance
```

### 3.1 Inventory locations

Stock can exist only in an active location where `is_inventory_location=true`.

Supported examples:
- Central warehouse
- Commissary / central kitchen
- Branch store room
- Branch kitchen
- Bar
- Quarantine / damaged area
- Project site

Phase I may begin with a single stock location per branch. The data model must still support sublocations later.

### 3.2 Units of measure

Every item has one base UOM. Purchase, transfer, count, and issue UOMs may differ.

Every source document keeps entered quantity and UOM. Every posted ledger movement stores converted base-UOM quantity. Item-specific UOM conversion and rounding must be configured before use.

### 3.3 Lot and expiry

For tracked items, receipt captures lot and / or expiry. All subsequent transfers, counts, wastage, returns, and adjustments preserve those identifiers. Expired stock can be flagged and quarantined.

---

## 4. Roles and Segregation of Duties

| Role | Main responsibility |
|---|---|
| Storekeeper / Inventory Custodian | Receipts, transfers, count entry, wastage / adjustment submission. |
| Warehouse Manager | Warehouse stock control and major exception review. |
| Branch Manager | Branch stock issue, count, and wastage review. |
| Operations Manager | Material variance and branch operational review. |
| Purchasing | Item and supplier reference maintenance; stock visibility; not routine adjustment posting. |
| Finance / Accounting | Value-impact review and audit reports. |
| Auditor | Read-only compliance review. |
| ERP Administrator | Access/configuration; not routine stock posting. |

A counter should not be the only final approver of a material adjustment resulting from their own count.

---

## 5. Inventory Movement Types

| Movement | Direction | Source |
|---|---:|---|
| Receipt | In | Posted Receiving Report |
| Transfer Out | Out | Dispatch of Transfer Order |
| Transfer In | In | Destination receipt of Transfer Order |
| Wastage | Out | Posted Wastage Report |
| Adjustment Increase | In | Posted Stock Adjustment |
| Adjustment Decrease | Out | Posted Stock Adjustment |
| Count Variance | In / Out | Approved count result |
| Return to Supplier | Out | Authorized supplier return |
| Return from Branch | In | Approved return transfer |
| Opening Balance | In / Out | Approved go-live / migration balance |
| Reversal | Opposite | Correction of original movement |

A posted movement is immutable. Corrections use reversal and a new valid movement.

---

## 6. Core Controls

1. Movement ledger is the authoritative record; balances reconcile to it.
2. Only accepted receipt quantity becomes stock.
3. Transfer source stock reduces at dispatch; destination stock increases only at destination receipt.
4. Wastage, adjustment, and count variance post only after configured approval.
5. Negative stock is blocked by default.
6. Lot / expiry items preserve those fields across all movements.
7. Item and location must be active and within user scope.
8. Every movement needs source-document lineage and actor / timestamp.
9. Users cannot alter posted quantities or backdate without explicit controls.
10. Count results preserve original evidence and recounts.

---

## 7. Item Master Workflow

### Create item

**Owner:** Authorized Purchasing / Warehouse / Inventory Master Data role.

Required before stock transaction:
- Item code and name
- Category
- Item type
- Base UOM
- Track inventory flag
- Lot / expiry flags
- Status
- UOM conversion where needed

Optional:
- Minimum, maximum, reorder point
- Default supplier
- Reference cost
- Storage / handling notes
- Image

### Change item

Audit changes to category, base UOM, tracking flags, conversions, and status. Changing base UOM after transactions exist must be blocked or handled as controlled migration, never a normal edit.

---

## 8. Inventory Inquiry

Appropriate users can view, by item and location:
- On-hand quantity
- Reserved and available quantity where used
- Lot / expiry balance
- Last movement date
- Receipt, transfer, wastage, adjustment, and count history
- Low-stock, negative-stock, expiry, and quarantine flags

Required filters: company, brand, location, item category, item, lot / expiry, movement type, status, date range, and exception flags.

---

## 9. Physical Count Workflow

### 9.1 Create count session

**Allowed users:** scoped Storekeeper, Warehouse Manager, Branch Manager, authorized inventory roles.

Required:
- Location
- Count type: full, cycle, spot, high-value, closing
- Date and counters
- Count scope: all items, category, selected items, or high-value list
- Freeze-inventory or cutoff-timestamp approach

Default operational standard:
- Full count: monthly or configured frequency.
- High-value / fast-moving items: cycle count frequency configurable.
- Spot count: allowed for investigation.

### 9.2 Prepare count

1. Generate count list without system quantities for ordinary counters by default.
2. Freeze movements or record a precise cutoff time.
3. Include lot / expiry breakdown where required.
4. Notify counters and verifier.
5. Permit controlled add-on lines for physical items not expected by the system.

### 9.3 Enter count

Counter records item, lot / expiry when tracked, count quantity, UOM, notes, and optional photo. The system converts to base UOM and prevents accidental duplicate item/lot lines.

### 9.4 Review variance

On submission, system calculates quantity and value variance against system quantity at cutoff. It flags material differences according to configurable amount, percentage, category, and repeat-variance thresholds.

Non-zero material variance requires reason code and narrative. It is routed for approval according to policy.

### 9.5 Approve and post

After required approval:
- system posts count-variance movement or linked approved adjustment;
- balance cache updates;
- count becomes `posted`;
- all counts, approvers, reasons, and action timestamps remain auditable.

Implemented Phase I note under `DEC-0026`: reviewed count variances generate one linked `COUNT_VARIANCE` Stock Adjustment from non-zero count lines. The count page does not post inventory. The generated adjustment must follow the Stock Adjustment approval and separate posting workflow before `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` movements update inventory. Direct `COUNT_VARIANCE_IN` / `COUNT_VARIANCE_OUT` posting remains deferred.

When a count session is configured to freeze movements and is active for an inventory location, receiving, transfer, wastage, and adjustment posting for that locked location is blocked at the inventory movement posting boundary until the count is reviewed, cancelled, or otherwise no longer active.

The count-start boundary and every inventory posting path serialize on the complete tenant/company-scoped set of affected inventory locations in stable identifier order. Count start reads the balance snapshot only after that lock is held and commits the database cutoff, non-empty snapshot, status transition, and audit atomically. A racing movement therefore either commits before the cutoff and is included in the snapshot, or waits and is rejected when an active freeze applies.

First-pass count execution is assigned work. Only the recorded counter may start, enter, or submit the count; a future-scheduled count cannot start before its Manila operating date. Entry, submission, review, cancellation, and variance-adjustment generation lock and reload the current count before mutation so submitted or cancelled evidence cannot be overwritten by a stale save. A zero-balance snapshot does not activate the count and must be corrected through setup or cancellation/rescheduling rather than a false empty task.

`My Tasks` enrolls only assigned first-pass `DRAFT` start and `IN_PROGRESS` entry/submission. It excludes `RECOUNT_REQUESTED`, submitted review/recount, cancellation, reviewed variance generation, and empty snapshots. These exclusions do not activate Count Variance or resolve the immutable recount-attempt work required by `DEC-0061`.

### 9.6 Recount

Recount is required where policy calls for it, for example high-value variance, missing lot detail, counter / verifier mismatch, or audit request. Recount creates a separate record or version and never overwrites original evidence.

During the additive `DEC-0098` cutover, first-pass start, entry-save, submission, review, and cancellation actions transactionally mirror the legacy session/line records into the linked immutable attempt-1 records. The legacy tables remain the read compatibility path until the full recount recovery and Count Variance activation gates pass; no recount, void-for-recount, or variance-posting behavior is enabled by this mirror. A cancellation that cannot update the selected attempt atomically rolls back the session mutation and audit event.

Scoped count reads and locks require a populated current-attempt pointer. A session without that lineage is denied rather than silently treated as a complete first-pass record; attempt-line projection parity remains a release gate before switching read authority.

---

## 10. Low Stock and Negative Stock

### Low stock

Where reorder point is set, flag items at or below available quantity threshold. Phase I may notify branch / warehouse but does not automatically create a PR.

### Negative stock

Default rule: block a stock-out movement that would make stock negative. If a selected item is allowed to go negative temporarily by policy, log the exception, alert managers / Finance, and require later resolution.

---

## 11. Reporting

Required, exportable reports:
- Stock on hand by branch / warehouse
- Item movement history / item card
- Inventory reference valuation
- Count result and variance report
- Negative and low-stock exceptions
- Expiring / expired item report
- Transfer in-transit / unreceived report
- Wastage summary
- Stock adjustment log
- Inventory action audit log

---

## 12. Phase I Acceptance Criteria

1. Every item has base UOM and valid conversions before movement use.
2. Receipts, transfers, wastage, adjustments, and count variances create correctly signed ledger entries.
3. Item-location balance reconciles to sum of posted ledger movements.
4. User cannot post outside location scope.
5. Lot / expiry items require those fields across relevant movements.
6. A count can be created, completed, reviewed, approved, and posted without losing original evidence.
7. Material variance is flagged and requires reason / approval.
8. Negative stock is blocked by default and exceptions are auditable.
9. Movement history identifies source document, actor, date, quantity, UOM, location, and reason.
10. Branch users can complete routine count steps on tablet / mobile.
11. Reports filter and export by company, brand, location, category, item, date, type, variance, and status.
