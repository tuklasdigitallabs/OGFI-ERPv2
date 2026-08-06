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
| Opening Balance | In / Out | Dedicated `DEC-0263` cohort activation only; never an ordinary Stock Adjustment |
| Reversal | Opposite | Correction of original movement |

A posted movement is immutable. Corrections use reversal and a new valid movement.

---

## 6. Core Controls

1. Movement ledger is the authoritative record. A database-owned movement
   trigger is the sole writer of the derived balance cache; balances reconcile
   exactly to it and cannot be directly edited by runtime users.
2. Only accepted receipt quantity becomes stock.
3. Transfer source stock reduces at dispatch; destination stock increases only at destination receipt.
4. Wastage, adjustment, and count variance post only after configured approval.
5. Negative stock is blocked by default.
6. Lot / expiry items preserve those fields across all movements.
7. Item and location must be active and within user scope.
8. Every movement needs source-document lineage and actor / timestamp.
9. Users cannot alter posted quantities or backdate without explicit controls.
10. Count results preserve original evidence; immutable recounts remain a gated future recovery workflow.

### 6.1 Opening inventory cutover

Opening inventory is a dedicated immutable cohort, not an ordinary Stock
Adjustment. Each selected location has a reviewed child cutover with complete
item coverage, including recorded zero quantities, controlled evidence, valuation snapshot,
and separate Operations and Accounting approval. `STAGE` validates and
reconciles a child only; it creates no inventory movement or balance. `ACTIVATE`
locks the complete selected set of inventory locations in stable identifier
order and atomically posts all eligible child batches. The same stable lock
order is used by ordinary movement writers, and the database movement fence
also locks before deciding, so a raw competing movement cannot bypass the
transition boundary.

The immutable zero-quantity line proves coverage but is absent from the posted
movement and balance cache. While a command is unresolved, exactly one semantic
action may exist for its target: freeze/activate for the cohort, or stage/reverse
for the exact location cutover. Database guards fail closed for malformed target
shapes and cutover/cohort/tenant/company lineage. The focused queue and detail
workspace use bounded server-side pages; activity is read through a bounded
database query rather than an all-row application-side slice. A reader who lacks
live scope for any cohort location may view the authorized local batch but not
cohort-shared evidence, authority events, or commands. Draft-cohort selection is
also exact-location scoped through the configuration revision's endpoint
membership, so an adjacent location cannot enumerate a draft cohort reference,
revision, or digest.

Submitting a location cutover for approval revalidates live permission at that
exact location before acquiring the tenant/company shared approval-producer
barrier. The forward migration
`20260731130000_opening_inventory_approval_producer_barrier` registers only the
exact `OpeningInventoryCutover` family and retains the closed producer allowlist.
For the related transfer approval boundary, exact replay is resolved first; the
locked transfer's terminal lifecycle is then checked before line validation or
pilot classification.

Opening command request handling establishes live scope for the exact target
and, for a cohort command, every affected cohort location before it takes target
or advisory locks. It rechecks scope inside the locked transaction before a
command can mutate. Approval decisions establish the cutover location scope
before their shared producer barrier and retain their transaction authority
checks. These controls are non-enumerating and do not replace the later release
and recovery gates.

Before cohort authority release, correction is an auditable logical
supersession with zero ledger effect. After release, correction uses a separately
approved delta adjustment. Direct balance mutation, partial cohort activation,
and ordinary `OPENING_BALANCE` adjustment posting are prohibited. Production
activation remains gated on exact ledger/cache preflight reconciliation,
coordinated application/schema deployment, recovery rehearsal, browser UAT,
typed source-specific ordinary-movement authority, and Release Board approval.
Local database and focused service evidence has passed, but full lint,
production build, and browser-authenticated responsive UAT have not yet passed
their release gates. Final regression and independent re-review of the current
location-disclosure, server-pagination, lock-order, and visible-surface
remediations remain pending before local Phase 3 completion can be recorded.

### 6.2 Inventory Pilot configuration preparation and Opening eligibility

The Inventory Pilot Setup Center prepares normalized mutable company drafts and
seals a ready draft atomically into the existing immutable configuration
revision boundary. The author selects exact endpoint capabilities, explicit
high-risk Item IDs, five distinct named Opening actors (preparer, submitter,
Operations reviewer, Accounting reviewer, and command requester), and one
active sealed Approval Rule snapshot for each of `PurchaseRequest`,
`QuotationRecommendation`, `PurchaseOrder`, `InventoryTransfer`,
`StockCountAttemptReview`, `WastageReport`, `StockAdjustment`, and
`OpeningInventoryCutover`.

The single `PurchaseRequest` readiness snapshot covers only a standard,
non-emergency pilot request. It persists resolver ID
`purchase_request_approval_rule_v1` and invokes the same production
`resolvePurchaseRequestApprovalRule` path with `isEmergency=false`. Readiness
requires the selected active/sealed route to be `DEFAULT`, the resolver outcome
to be `normal`, and fallback to be false. A valid `PR_EMERGENCY` route may remain
configured alongside it, but it is not part of this readiness evidence and is
not certified for pilot or emergency UAT. Live Opening eligibility rederives the
same resolver input/outcome and fails closed if it changes.

View, draft, and seal use separate permissions and always require a current
active assignment plus exact selected-company `MANAGE`. Seal also requires
fresh MFA, reason, optimistic-version/idempotency checks, and a sealer who is
neither the creator nor latest editor. The server locks and revalidates the
draft, endpoint/item state, participant role/scope evidence, and current route
definitions before creating the schema-v2 revision, exact memberships, seal
record, terminal draft state, and audit event in one transaction. Failure or a
concurrent change produces no partial revision.

Named actors and route bindings are immutable, digest-covered evidence at the
seal cutoff; they do not grant live permission, scope, approval, routing,
command, executor, or posting authority. The Opening executor remains
deployment-controlled. Schema-v1 revisions remain historic for already pinned
records. A new Opening cohort may select only the latest unsuperseded schema-v2
revision after canonical/digest verification and current participant and route
readiness revalidation. A successor revision governs only future cohorts through
that controlled selection; existing cohorts remain pinned to their original
revision/digest. Drafting, evaluating, abandoning, creating a successor, and
sealing have no activation, approval, opening-command, ledger, balance, custody,
or financial effect. This remains local-only, **NO-GO** behavior and supplies no
emergency Purchase Request UAT or release credit.

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

Item UOM conversions are valid only when the item and both UOMs belong to the active tenant/company scope; updates also require active related master records, distinct UOMs, and a positive factor.

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

`DEC-0026` defines the controlled bridge, but Count Variance generation is currently disabled pending immutable recount recovery, attempt-lineage migration, and production evidence under `DEC-0098`. Once enabled, reviewed count variances may generate one linked `COUNT_VARIANCE` Stock Adjustment from non-zero count lines; the count page does not post inventory, and the generated adjustment must follow the Stock Adjustment approval and separate posting workflow before `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` movements update inventory. Direct `COUNT_VARIANCE_IN` / `COUNT_VARIANCE_OUT` posting remains deferred.

When a count session is configured to freeze movements and is active for an inventory location, receiving, transfer, wastage, and adjustment posting for that locked location is blocked at the inventory movement posting boundary until the count is reviewed, cancelled, or otherwise no longer active.

The count-start boundary and every inventory posting path serialize on the complete tenant/company-scoped set of affected inventory locations in stable identifier order. Count start reads the balance snapshot only after that lock is held and commits the database cutoff, non-empty snapshot, status transition, and audit atomically. A racing movement therefore either commits before the cutoff and is included in the snapshot, or waits and is rejected when an active freeze applies.

First-pass count execution is assigned work. Only the recorded counter may start, enter, or submit the count; a future-scheduled count cannot start before its Manila operating date. Entry, submission, review, cancellation, and variance-adjustment generation lock and reload the current count before mutation so submitted or cancelled evidence cannot be overwritten by a stale save. A zero-balance snapshot does not activate the count and must be corrected through setup or cancellation/rescheduling rather than a false empty task.

`My Tasks` enrolls only assigned first-pass `DRAFT` start and `IN_PROGRESS` entry/submission. It excludes `RECOUNT_REQUESTED`, submitted review/recount, cancellation, reviewed variance generation, and empty snapshots. These exclusions do not activate Count Variance or resolve the immutable recount-attempt work required by `DEC-0061`.

### 9.6 Recount

Recount is required where policy calls for it, for example high-value variance, missing lot detail, counter / verifier mismatch, or audit request. Recount creates a separate record or version and never overwrites original evidence.

The local DEC-0264 recovery foundation now models that successor lineage explicitly: the reviewed source attempt remains immutable, a successor begins with a new cutoff, and a linked adjustment must first reach a terminal disposition. Recovery admission requires live recovery authority, MFA, actor segregation, scoped idempotency, exact active Stock Count review-cohort pins, and an immutable controlled-evidence qualification. The qualification policy and recount adapter remain dormant under DEC-0077; free-text `evidenceReference` is supplemental and never satisfies the evidence gate. Until the evidence matrix, poster-versus-approver rule, and activation/UAT gates are approved, recovery fails closed before any void, successor, notification, audit, ledger, or balance mutation.

During the additive `DEC-0098` cutover, first-pass start, entry-save, submission, review, and cancellation actions transactionally mirror the legacy session/line records into the linked immutable attempt-1 records. The legacy tables remain the read compatibility path until the full recount recovery and Count Variance activation gates pass; no recount, void-for-recount, or variance-posting behavior is enabled by this mirror. A cancellation that cannot update the selected attempt atomically rolls back the session mutation and audit event. Any scoped read whose current-attempt lifecycle/header or line digest diverges from the compatibility projection fails closed; it does not silently mix case and attempt facts.

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
3. Item-location balance reconciles exactly to the sum of posted ledger
   movements, and no runtime or opening-cutover role can directly mutate the
   balance cache.
4. User cannot post outside location scope.
5. Lot / expiry items require those fields across relevant movements.
6. A count can be created, completed, reviewed, approved, and posted without losing original evidence.
7. Material variance is flagged and requires reason / approval.
8. Negative stock is blocked by default and exceptions are auditable.
9. Movement history identifies source document, actor, date, quantity, UOM, location, and reason.
10. Branch users can complete routine count steps on tablet / mobile.
11. Reports filter and export by company, brand, location, category, item, date, type, variance, and status.
