# OGFI ERP — Database Schema and Multi-Tenant Data Model

**Status:** Phase I implementation baseline  
**Database:** PostgreSQL  
**Primary goal:** Preserve referential integrity, auditable workflows, and correct stock movement across multi-branch restaurant operations.

---

## 1. Database design principles

1. Use PostgreSQL as the system of record for transactional ERP data.
2. Use UUID or ULID primary keys; do not expose sequential database IDs as the only public record identifier.
3. Include `tenant_id` on every tenant-owned table from day one.
4. Keep company/location scope as structured foreign keys, not free-text labels.
5. Store money in integer minor units or fixed-precision decimals; never use floating-point values for currency.
6. Inventory balances are derived from an immutable movement ledger and may be cached for performance.
7. Workflow state transitions must be validated in application code and protected with database constraints where practical.
8. `AuditEvent`, `ProjectActivityEvent`, and posted `InventoryMovement` records are append-only. PostgreSQL rejects `UPDATE`, `DELETE`, and `TRUNCATE`; corrections use new events or linked reversal movements.
9. Soft deletion is allowed only for safe master data and must preserve historical references. Controlled transactions use cancellation/reversal.
10. Dates and timestamps are stored in UTC; company/location timezone is stored in configuration and used for display and operational cut-offs.

---

## 2. Identifier and timestamp conventions

### 2.1 Internal key

```text
id UUID / ULID primary key
```

### 2.2 Human-readable business references

Use configurable prefixes and date/sequence generation. Examples:

```text
PR-2026-000001
PO-2026-000021
GRN-2026-000014
TRF-2026-000009
WST-2026-000003
CNT-2026-000004
```

Rules:

- The human-readable reference is unique within company and document type.
- The database key remains the relationship key.
- A cancelled document keeps its reference and is never reused.

### 2.3 Required metadata on controlled tables

```text
id
public_reference
tenant_id
company_id
created_at
created_by_user_id
updated_at
updated_by_user_id (when editable)
status
version (optimistic concurrency)
```

Add `location_id`, `brand_id`, `department_id`, `cost_center_id`, `project_id`, and `currency_code` when relevant.

---

## 3. Core organization schema

### 3.1 Tenancy and company tables

| Table | Key fields | Notes |
|---|---|---|
| `tenants` | id, name, status, default_timezone, theme_config | Supports future client companies. OGFI is the first tenant. |
| `companies` | id, tenant_id, code, legal_name, trading_name, tax_identifier, currency_code, timezone | Legal or operating entity. Code is unique per tenant. |
| `brands` | id, tenant_id, company_id, name, code, status | Open-ended; any restaurant brand may be added. |
| `locations` | id, tenant_id, company_id, brand_id nullable, location_type, code, name, address, timezone, status | Branch, warehouse, commissary, head office, project site, temporary location. |
| `departments` | id, tenant_id, company_id, name, code, status | Configurable business department. |
| `cost_centers` | id, tenant_id, company_id, code, name, department_id nullable, location_id nullable, status | Enables budget and reporting scope. |
| `projects` | id, tenant_id, company_id, brand_id nullable, location_id nullable, name, stage, status | Phase IV-ready but may exist early for project-linked purchases. |

### 3.2 Location type enumeration

```text
BRANCH
WAREHOUSE
COMMISSARY
CENTRAL_KITCHEN
HEAD_OFFICE
PROJECT_SITE
TEMPORARY_SITE
```

Do not encode location type only in naming. A warehouse must be functionally distinguishable from a branch.

---

## 4. Identity, roles, and scope schema

| Table | Key fields | Notes |
|---|---|---|
| `users` | id, tenant_id, email, display_name, status, last_login_at | One authenticated person within a tenant. |
| `roles` | id, tenant_id nullable, code, name, system_role, status | System templates plus tenant-specific roles. |
| `permissions` | id, code, module, action, description | Stable permission catalog. |
| `role_permissions` | role_id, permission_id | Many-to-many capability mapping. |
| `user_role_assignments` | id, user_id, role_id, starts_at, ends_at, status | Role definition separate from scope. |
| `user_scope_assignments` | id, user_id, scope_type, scope_id, access_level, starts_at, ends_at | Company, brand, location, department, project scope. |
| `approval_delegations` | id, delegator_user_id, delegate_user_id, scope, starts_at, ends_at, status | Temporary delegated authority. |

### 4.1 Production authentication tables

| Table | Key fields | Integrity controls |
|---|---|---|
| `AuthIdentity` | tenant, user, provider, normalized identifier, provider subject, status | Composite tenant/user foreign key; tenant/provider identifier and subject uniqueness; immutable ownership in the service. |
| `PasswordCredential` | identity, Argon2id hash, algorithm, password-change metadata | One credential per identity; plaintext is never stored. |
| `MfaAuthenticator` / `MfaRecoveryCode` | tenant, user, encrypted TOTP fields and key version; keyed recovery-code hash and consumed time | Composite tenant/user foreign key; partial unique index permits one active authenticator per user; recovery codes are one-time. |
| `AuthSession` | tenant, user, identity, token hash, assurance, privilege epoch, idle/absolute expiry, challenge failures/lock, revocation | Tenant-qualified user and identity foreign keys; opaque token uniqueness; security transitions use compare-and-swap and never extend absolute expiry. |
| `AuthActivationToken` | tenant, target, issuer, token hash, expiry, consumption and delivery state | One active token per tenant/user; tenant-qualified target/issuer; only a non-reversible token hash is stored. A failed delivery is revoked and retry creates a replacement token. |
| `AuthLoginAttempt` | keyed tenant/account/source digests, attempt type, optional session, outcome, time | Legacy operational rows only; new password/MFA admission uses bounded windows. No raw identifier, source address, password, TOTP, or recovery code; attempted-time index supports bounded cleanup. |
| `AuthenticationThrottleWindow` / `AuthenticationThrottleControl` | fixed bounded dimensions and exact counters; singleton ACTIVE/PAUSED key-policy generation and bounded previous-key overlap | PostgreSQL-authoritative pre-verification admission. Signed one-time reservations convert to success only with the matching immutable success audit. Runtime can take the reviewed shared lock but cannot change operator control state. |
| `AuthRecoveryRequest` | tenant, company, target, requester, reviewer, reason/evidence, reset scope, status | Tenant-qualified company/users; one pending request per tenant/user across companies; review transitions use status compare-and-swap. |
| `AuthBootstrapState` | tenant primary key, target admin, authorization reference, issued time | Irreversible one-row-per-tenant marker that prevents the deployment bootstrap command from becoming a later recovery path. |

`Tenant.loginCode` is lowercase and unique. `Company(id, tenantId)` and `User(id, tenantId)` are alternate keys used by composite scope foreign keys. Partial unique indexes for active MFA, active activation tokens, and tenant-wide pending recovery requests are migration-level PostgreSQL controls and are intentionally stronger than application-only checks.

### 4.1 Permission naming convention

```text
purchasing.purchase_request.create
purchasing.purchase_request.submit
purchasing.purchase_request.approve
inventory.transfer.dispatch
inventory.receiving.post
inventory.adjustment.approve
reports.inventory.export
admin.approval_rule.manage
```

Keep permission names business-oriented and stable. Do not use screen-specific labels such as `button_click_approve`.

---

## 5. Supplier and item master schema

### 5.1 Supplier tables

| Table | Key fields | Notes |
|---|---|---|
| `suppliers` | id, tenant_id, company_id, supplier_code, legal_name, trading_name, tax_id, status, payment_terms | Supplier source of truth. |
| `supplier_contacts` | supplier_id, name, role, email, phone, is_primary | Operational contact list. |
| `supplier_locations` | supplier_id, address, city, country, default_delivery_terms | Supplier address records. |
| `supplier_documents` | supplier_id, document_type, expires_at, attachment_id, status | Accreditation/compliance evidence. |
| `supplier_item_links` | supplier_id, item_id, supplier_sku, lead_time_days, min_order_qty, preferred_rank, status | Supplier-item relationship. |
| `supplier_price_history` | supplier_id, item_id, currency_code, unit_price, effective_from, effective_to, source_document_id | Historical price analysis. |

### 5.2 Item master tables

| Table | Key fields | Notes |
|---|---|---|
| `item_categories` | id, tenant_id, company_id, parent_id nullable, code, name, item_type, status | Supports food, beverage, packaging, supplies, equipment, etc. |
| `uoms` | id, tenant_id nullable, code, name, decimal_precision, status | Kilogram, gram, liter, piece, case, pack, tray, bottle. |
| `items` | id, tenant_id, company_id, item_code, name, category_id, base_uom_id, inventory_tracking_type, is_active | Master inventory item. |
| `item_uom_conversions` | item_id, from_uom_id, to_uom_id, factor, rounding_rule | Purchase vs stock vs consumption units. |
| `item_location_settings` | item_id, location_id, par_level, reorder_point, reorder_qty, is_stocked, is_active | Branch/location-specific parameters. |
| `item_lot_settings` | item_id, track_lot, track_expiry, shelf_life_days nullable | Used for perishable controls. |
| `item_barcode_links` | item_id, barcode_value, barcode_type, uom_id nullable | Supports scanning. |

---

## 6. Purchasing schema

### 6.1 Purchase Request

| Table | Key fields |
|---|---|
| `purchase_requests` | id, tenant_id, company_id, public_reference, requester_user_id, request_location_id, department_id, cost_center_id, project_id nullable, required_date, urgency, justification, budget_status, status, current_approval_step |
| `purchase_request_lines` | purchase_request_id, line_number, item_id nullable, description, requested_qty, uom_id, estimated_unit_price, estimated_total, preferred_supplier_id nullable, purpose, notes |
| `purchase_request_attachments` | purchase_request_id, attachment_id, purpose |

### 6.2 Quotation comparison

| Table | Key fields |
|---|---|
| `quotation_requests` | id, tenant_id, company_id, public_reference, purchase_request_id nullable, status, required_date |
| `supplier_quotations` | quotation_request_id, supplier_id, quote_reference, quote_date, currency_code, total_amount, validity_date, attachment_id |
| `supplier_quotation_lines` | supplier_quotation_id, source_pr_line_id nullable, item_id nullable, quantity, uom_id, unit_price, line_total, lead_time_days, notes |
| `quotation_recommendations` | quotation_request_id, selected_supplier_quotation_id, prepared_by_user_id, status, currency_code, selected_evaluated_total, lowest_evaluated_total, quote_count, is_lowest_evaluated_cost, selection_reason, non_lowest_justification nullable, single_source_justification nullable, evaluation_snapshot, version, submitted_at nullable, approved_at nullable |

### 6.3 Purchase Order

| Table | Key fields |
|---|---|
| `purchase_orders` | id, tenant_id, company_id, public_reference, supplier_id, purchase_request_id, quotation_request_id, quotation_recommendation_id, selected_supplier_quotation_id, delivery_location_id, department_id nullable, cost_center_id nullable, currency_code, subtotal_amount, tax_amount, discount_amount, total_amount, expected_delivery_date, status, source_snapshot |
| `purchase_order_lines` | purchase_order_id, line_number, source_pr_line_id nullable, source_supplier_quote_line_id nullable, item_id nullable, description, ordered_qty, uom_id, unit_price, tax_amount, discount_amount, line_total, received_qty, cancelled_qty |
| `purchase_order_balance_closures` | purchase_order_id, requested_by_user_id, approved_by_user_id nullable, status, reason, supplier_notice_reference nullable, supplier_notice_unavailable_reason nullable, line_snapshot, total_closed_quantity, total_closed_value |
| `purchase_order_amendments` | purchase_order_id, amendment_number, reason, status, before_snapshot, after_snapshot, approved_by_user_id nullable |
| `purchase_order_attachments` | purchase_order_id, attachment_id, purpose |

Current implementation note: `purchase_orders` is generated from an approved quotation recommendation and supports `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ISSUED`, `AMENDMENT_PENDING`, receiving-driven `PARTIALLY_RECEIVED` / `FULLY_RECEIVED`, `CANCELLED`, and `CLOSED`. Returned POs move back to `DRAFT`. Supplier issue/send moves `APPROVED` to `ISSUED` and records communication evidence in audit metadata; list/export surfaces latest issue evidence from audit events, and the supplier copy is a scoped rendered view over the approved PO data. Scoped pre-receiving cancellation moves `DRAFT`, `APPROVED`, or `ISSUED` to `CANCELLED`, requires reason, blocks when any Receiving Report exists or any received quantity is present, sets line `cancelled_qty` to remaining ordered quantity, and creates no inventory movements. `purchase_order_amendments` stores bounded approval-backed amendment requests for issued POs with no receiving activity. It preserves before/proposed snapshots, reason, supplier notice evidence/explanation, requester/approver, decision timestamps, and applied timestamp. Pending amendment moves the PO to `AMENDMENT_PENDING` and blocks receiving; approval applies same-line quantity/unit-price/note/expected-date changes and returns the PO to `ISSUED`; return or rejection restores `ISSUED` without line mutation. `purchase_order_balance_closures` stores approval-backed closure requests for partially received POs. Approved closure sets remaining line quantities to `cancelled_qty`, moves the PO to `CLOSED`, records audit history, and creates no inventory movement. Full post-receiving amendment and supplier/location/line-add/delete/substitution/payment-term amendment remain future controlled transitions.

---

## 7. Receiving and inventory schema

### 7.1 Receiving

| Table | Key fields |
|---|---|
| `goods_receipts` | id, tenant_id, company_id, public_reference, purchase_order_id, receiving_location_id, supplier_id, delivery_receipt_number, received_at, received_by_user_id, idempotency_key nullable, idempotency_request_hash nullable, status, reversed_by_user_id nullable, reversed_at nullable, reversal_reason nullable, notes |
| `goods_receipt_lines` | goods_receipt_id, po_line_id, item_id, ordered_qty, delivered_qty, accepted_qty, rejected_qty, shortage_qty, uom_id, lot_id nullable, expiry_date nullable, posted_movement_id nullable, discrepancy_reason, notes |
| `receiving_discrepancies` | goods_receipt_line_id, discrepancy_type, value_amount, status, responsible_party, resolution, resolved_at |

Current implementation note: `goods_receipts` and `goods_receipt_lines` support draft capture, ledger-backed posting from issued or partially received POs, and full-document posted receipt reversal. New receipt-create requests carry a tenant/company-unique idempotency key and SHA-256 canonical request hash; exact retries return the original draft only for the same authorized actor, receiving location, PO, and payload, while changed or cross-scope reuse fails closed. The additive nullable columns preserve legacy rows and keys are retained without reuse. Posting creates `RECEIPT_IN` movements for accepted quantities, updates `inventory_balances`, increments PO line received quantities, and updates PO fulfillment status. Reversal is permissioned, requires reason, writes linked `REVERSAL` movements, decrements PO line received quantities, recalculates PO fulfillment status, keeps original discrepancy evidence intact, and blocks closed/cancelled POs or active remaining-balance closure cases. Attachment enforcement, partial line reversal, return-to-supplier, finance effects, and advanced inspection/discrepancy resolution are future controlled transitions.

### 7.2 Inventory location and balances

| Table | Key fields |
|---|---|
| `inventory_locations` | id, tenant_id, company_id, location_id, code, name, storage_type, status | Optional sub-location such as freezer, dry storage, bar. |
| `inventory_balances` | tenant_id, company_id, inventory_location_id, item_id, lot_id nullable, qty_on_hand, qty_reserved, qty_in_transit, avg_unit_cost, updated_at, version | Derived/cache table maintained transactionally. |
| `inventory_lots` | id, tenant_id, company_id, item_id, supplier_id nullable, lot_number, manufacture_date nullable, expiry_date nullable, status | Required only for tracked items. |

### 7.3 Immutable movement ledger

| Table | Key fields |
|---|---|
| `inventory_movements` | id, tenant_id, company_id, public_reference, movement_type, occurred_at, item_id, inventory_location_id, related_inventory_location_id nullable, lot_id nullable, quantity_delta, uom_id, unit_cost, total_cost, source_document_type, source_document_id, reason_code, posted_by_user_id, reversal_of_movement_id nullable |

Current implementation note: the quantity-ledger foundation is implemented through inventory locations, source-linked immutable inventory movements, and a balance cache. Movement posting is quantity-only and currently supports Receiving Report `RECEIPT_IN`, Transfer `TRANSFER_OUT` / accepted-quantity `TRANSFER_IN`, Wastage `WASTAGE_OUT`, Stock Adjustment `ADJUSTMENT_IN` / `ADJUSTMENT_OUT`, and linked `REVERSAL` movements for posted Receiving Reports, Wastage, and Stock Adjustment documents through controlled workflow services. Reviewed stock counts can generate linked `COUNT_VARIANCE` Stock Adjustments; those adjustments still post through the Stock Adjustment workflow. It intentionally avoids authoritative valuation, GL posting, opening-balance cutover, direct `COUNT_VARIANCE_*` posting, transfer reversal, and partial receipt-line reversal workflows until future controlled slices.

Movement types:

```text
RECEIPT_IN
TRANSFER_OUT
TRANSFER_IN
WASTAGE_OUT
ADJUSTMENT_IN
ADJUSTMENT_OUT
COUNT_VARIANCE_IN
COUNT_VARIANCE_OUT
REVERSAL
```

### 7.4 Transfers

| Table | Key fields |
|---|---|
| `InventoryTransfer` | id, tenant_id, company_id, public_reference, source_location_id, destination_location_id, requested_by_user_id, dispatched_by_user_id nullable, received_by_user_id nullable, transfer_type, purpose, required_by_date nullable, status, submitted_at nullable, dispatched_at nullable, received_at nullable, cancelled_at nullable, cancellation_reason nullable |
| `InventoryTransferLine` | inventory_transfer_id, line_number, source_inventory_location_id, destination_inventory_location_id, item_id, requested_qty, approved_qty, prepared_qty, dispatched_qty, received_qty, rejected_qty, damaged_qty, discrepancy_qty, uom_id, lot_number nullable, expiry_date nullable, notes nullable |
| `InventoryTransferReceipt` | inventory_transfer_id, received_by_user_id, status, received_at, idempotency_key nullable, idempotency_request_hash nullable, posted_at nullable, reversed_by_user_id nullable, reversed_at nullable, reversal_reason nullable, discrepancy_flag, discrepancy_summary nullable, notes nullable |
| `InventoryTransferReceiptLine` | transfer_receipt_id, inventory_transfer_id, inventory_transfer_line_id, item_id, uom_id, line_number, dispatched_qty_snapshot, accepted_qty, rejected_qty, damaged_qty, discrepancy_qty, outstanding_qty, discrepancy_type nullable, discrepancy_reason nullable, evidence_reference nullable, posted_movement_id nullable |

Current implementation note: transfer requests support source dispatch plus event-backed destination receipt from the current authorized action location. Dispatch moves `REQUESTED` to `DISPATCHED`, creates deterministic immutable `TRANSFER_OUT` movements, updates source balances, and records audit history in the same transaction. Receipt events can be posted from `DISPATCHED`, `PARTIALLY_RECEIVED`, or `DISPUTED`, create deterministic immutable `TRANSFER_IN` movements only for accepted quantities, update transfer line rollups, and block the dispatching user from receiving the same transfer. Damaged, rejected, and short/discrepant quantities are recorded on receipt lines and do not increase destination stock. Posted receipt events can be reversed as full events by a separate authorized user; reversal writes linked `REVERSAL` movements for accepted quantities, decrements receipt rollups, recalculates transfer status, and keeps the original receipt event. A legacy discrepancy-settlement path is retained for compatibility but is dormant and fail-closed under DEC-0265 until finality and reopen/reversal semantics are confirmed; `DISCREPANCY_SETTLED` is not an available or final operational state. Creating, submitting, cancelling, and discrepancy follow-up do not update stock. Dispatch reversal, replacement transfers, adjustment/wastage linkage, and finance effects remain future controlled decisions.
The additive migration `20260728100000_inventory_transfer_receipt_idempotency_coherence` preserves legacy `NULL`/`NULL` receipt identity and rejects one-sided or malformed key/hash pairs with the named PostgreSQL check `InventoryTransferReceipt_idempotency_pair_check`; it performs no backfill or automatic repair. PostgreSQL rehearsal and populated-restore evidence remain required before deployment.

### 7.5 Physical count

| Table | Key fields |
|---|---|
| `StockCountSession` | id, tenant_id, company_id, public_reference, inventory_location_id, count_type, scope_type, status, blind_count, freeze_movements, current_attempt_id nullable, scheduled_date nullable, cutoff_at nullable, started_at nullable, submitted_at nullable, reviewed_at nullable, cancelled_at nullable, cancellation_reason nullable, review_notes nullable, created_by_user_id, assigned_to_user_id nullable, reviewed_by_user_id nullable |
| `StockCountLine` | stock_count_session_id, inventory_location_id, item_id, uom_id, line_number, lot_key, lot_number nullable, expiry_date nullable, system_quantity_base_uom, counted_quantity_base_uom nullable, variance_quantity_base_uom nullable, notes nullable, counted_by_user_id nullable, counted_at nullable; legacy mutable line retained during additive cutover |
| `StockCountAttempt` | immutable-attempt child of stock_count_session; attempt_number, status, cutoff_at, actor timestamps, reason/evidence, company/location scope, and audit actors; terminal submitted/reviewed/cancelled/voided-for-recount rows are database-guarded against update/delete |
| `StockCountAttemptLine` | immutable-attempt line with item/UOM/lot/count quantities and optional legacy_stock_count_line_id lineage; terminal attempt evidence is database-guarded against update/delete |

Current implementation note: physical counts support scheduling, starting with a cutoff snapshot from current balance rows, blind count entry, submission for review, review/recount request, cancellation, audit history, and reviewed variance generation into one linked `COUNT_VARIANCE` Stock Adjustment. Count actions do not directly create `COUNT_VARIANCE_IN`, `COUNT_VARIANCE_OUT`, `ADJUSTMENT_IN`, or `ADJUSTMENT_OUT` movements and do not update `inventory_balances`; the generated Stock Adjustment must complete approval and separate posting before stock changes. Direct count-variance movement posting, materiality-specific routing, evidence enforcement, partial reversal, and backdate controls require future confirmed decisions.

### 7.6 Wastage and adjustments

| Table | Key fields |
|---|---|
| `wastage_reports` | id, tenant_id, company_id, public_reference, inventory_location_id, reported_by_user_id, reported_at, reason_code, status, total_estimated_cost, policy_flags, policy_snapshot, evidence_required, evidence_satisfied, notes |
| `wastage_lines` | wastage_report_id, item_id, lot_id nullable, quantity, uom_id, estimated_unit_cost, estimated_total_cost, reason_code, photo_required, notes |
| `wastage_policies` | tenant_id, company_id, optional inventory_location_id, optional wastage_type, optional reason_code, minimum_estimated_cost, evidence requirement, repeat window/count thresholds, active status | Configurable policy rows for evidence thresholds and factual repeat/high-value flags. |
| `operational_reason_codes` | tenant_id, company_id, workflow, code, label, wastage_types, inventory_classes, requires_evidence, status, sort_order | Company-scoped controlled dropdown values for wastage, stock adjustments, and future exception workflows. Under `DEC-0268`, `wastage_types` and `inventory_classes` are independent wastage eligibility dimensions; legacy overloaded `applies_to` remains for historical/non-wastage reference and is not authoritative for new wastage eligibility. The conservative F&B seed maps `SPOILAGE_EXPIRY` → `SPOILAGE_EXPIRY` / `FOOD`, `PREP_TRIM_LOSS` and `KITCHEN_ERROR` → `PREPARATION_LOSS` / `FOOD`, and `DAMAGED_PACKAGING` → `DAMAGE` / `FOOD, PACKAGING`; each company must review/configure its own rows, and remaining legacy codes require explicit mapping. |
| `stock_adjustments` | id, tenant_id, company_id, public_reference, inventory_location_id, requested_by_user_id, adjustment_type, reason_code, status, source_document_type nullable, source_document_id nullable, source_stock_count_session_id nullable, total_value_impact, posted_by_user_id nullable, reversed_by_user_id nullable, posted_at nullable, reversed_at nullable, reversal_reason nullable, notes |
| `stock_adjustment_lines` | stock_adjustment_id, item_id, lot_id nullable, quantity_delta, uom_id, unit_cost, value_impact, reason_code, source_stock_count_line_id nullable, posted_movement_id nullable, notes |

Current implementation note: `WastageReport` and `WastageLine` support scoped wastage capture, controlled reason-code selection from active `operational_reason_codes`, configurable evidence/repeat policy flag snapshots, approval-engine submission, approve/return/reject decisions, legacy review, cancellation, audit history, estimated cost, CSV export, separate posting after approval, and full-document posted reversal. Posting creates source-linked `WASTAGE_OUT` movement rows through the inventory posting service, links `WastageLine.postedMovementId`, sets report `postedAt` and `postedByUserId`, and marks the report `POSTED`. Reversal creates linked `REVERSAL` movement rows, sets `reversedAt`, `reversedByUserId`, and `reversalReason`, and marks the report `REVERSED`.

`StockAdjustment` and `StockAdjustmentLine` support scoped manual `INCREASE` / `DECREASE` / `OPENING_BALANCE` capture and count-generated `COUNT_VARIANCE` adjustments, controlled reason-code selection from active `operational_reason_codes`, approval-engine submission, approve/return/reject decisions, cancellation before approval completion, audit history, CSV export, separate posting after approval, and full-document posted reversal. Posting creates source-linked `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, or opening-balance movements through the inventory posting service, links `StockAdjustmentLine.postedMovementId`, sets `postedAt` and `postedByUserId`, and marks the adjustment `POSTED`. Count-generated adjustments carry unique source links to one Stock Count Session and its non-zero variance lines. Reversal creates linked `REVERSAL` movement rows, sets `reversedAt`, `reversedByUserId`, and `reversalReason`, and marks the adjustment `REVERSED`. Backdating, reclassification, and finance/accounting entries remain future controlled transitions.

### 7.7 Inventory Pilot configuration draft and seal

| Table | Key fields | Integrity role |
|---|---|---|
| `InventoryPilotConfigurationDraft` | tenant/company, schema_version=2, status, version, exact predecessor revision/number/digest, creator, latest editor, terminal sealed revision or abandonment metadata | Mutable only while `DRAFT`; optimistic concurrency; no hard delete or terminal reopen. |
| `InventoryPilotDraftEndpointMembership` | draft, exact InventoryLocation/Location, capability, included flag | Normalized exact `TRANSFER_SOURCE`, `TRANSFER_DESTINATION`, `COUNT_LOCATION`, and `OPENING_STOCK_LOCATION` selection. |
| `InventoryPilotDraftItemMembership` | draft, exact Item, included flag | Explicit selected high-risk Item-ID set; category or UI filtering is not membership. |
| `InventoryPilotDraftParticipant` | draft, responsibility, user, exact role assignment and role, included flag | Exactly one candidate for each of five opening responsibilities; all five users must be distinct at seal. |
| `InventoryPilotDraftRouteReadiness` | draft, exact family, Approval Rule key/identity/lineage/version, raw canonical definition/digest, optional resolver-evidence canonical JSON/digest, checked time | One captured route per exact readiness family; always-enabled validation rejects raw-rule drift. Resolver evidence is required only for `PurchaseRequest` and is validated against its bounded production-resolver result. |
| `InventoryPilotConfigurationSealOperation` | draft, expected version, idempotency key/request hash, sealed revision identity/digest, sealer, evidence cutoff | Append-only one-to-one atomic compilation and exact replay record. |
| `InventoryPilotParticipantMembership` | sealed revision identity/digest, responsibility, user/assignment/role, evidence cutoff | Immutable, digest-covered seal-time readiness evidence; not an authority grant. |
| `InventoryPilotRouteReadinessMembership` | sealed revision identity/digest, exact family, rule key/identity/lineage/version and raw canonical definition/digest, optional resolver-evidence canonical JSON/digest, evidence cutoff | Immutable, digest-covered seal-time route evidence for exactly eight families; only `PurchaseRequest` carries resolver evidence and live routing remains authoritative. |

`InventoryPilotConfigurationRevision` now supports schema versions 1 and 2.
Schema-v1 rows preserve their historic canonical representation, cannot acquire
predecessor lineage, and remain pinned to existing cohorts/intents. Every new
Setup Center seal is schema v2 and points to the exact latest predecessor; a
unique predecessor constraint permits only one successor. The configuration
digest for schema v2 covers predecessor lineage, endpoints, exact Item IDs, five
participant snapshots, eight route snapshots, sealer/time, and evidence cutoff.
Deferred always-enabled constraint triggers verify canonical/digest integrity,
draft-to-sealed parity, terminal draft/seal coherence, and the exact five/eight
cardinalities before commit.

For the single `PurchaseRequest` readiness record, resolver context is fixed to
the ordinary pilot scenario: stable resolver ID
`purchase_request_approval_rule_v1` invokes shared production
`resolvePurchaseRequestApprovalRule` with `isEmergency=false`. The raw Approval
Rule definition/digest remains independently verifiable. A separate
resolver-evidence canonical payload/digest must select the exact active/sealed
`DEFAULT` rule, report
`routeType=normal`, and report `fallbackUsed=false`. A valid `PR_EMERGENCY` rule
may coexist but is outside the certified snapshot. Live eligibility rederives
the same resolver result and fails closed on missing `DEFAULT`, fallback,
substitution, or resolver drift; no emergency-route UAT evidence follows.

The application service serializes sealing with a tenant/company advisory lock,
locks the exact draft, uses serializable isolation, and rechecks live permission,
active assignment/session, exact Company `MANAGE`, fresh MFA, editor/sealer
separation, and readiness. It then creates the revision, normalized memberships,
seal operation, terminal draft update, and audit event atomically. The seal has
no family-activation, approval, opening-command, ledger, balance, custody, or
financial effect. Only the latest unsuperseded schema-v2 revision may qualify a
new Opening Inventory cohort after current readiness is re-evaluated; prior
cohorts stay pinned to their original revision/digest.

---

## 8. Approval, task, notification, and audit schema

| Table | Key fields | Notes |
|---|---|---|
| `approval_rules` | id, tenant_id, company_id nullable, transaction_type, scope filters, amount_min, amount_max, priority, is_active | Configurable rule matching. |
| `approval_rule_steps` | approval_rule_id, step_order, approver_type, role_id nullable, user_id nullable, required, escalation_hours | Defines route. |
| `approval_instances` | id, tenant_id, company_id, document_type, document_id, approval_rule_id, status, current_step_order | One instantiated workflow per controlled document. A PostgreSQL partial unique index permits at most one `PENDING` row per tenant/company/document-type/document-ID tuple. Duplicate predecessor tuples fail migration preflight and require manual audited reconciliation without deletion or history rewriting. |
| `approval_instance_steps` | approval_instance_id, step_order, assigned_user_id nullable, assigned_role_id nullable, status, acted_at, remarks, delegated_from_user_id nullable | Actual approver action trail. Normalized v1 routing context, including `step_order`, is immutable and protected by always-enabled PostgreSQL triggers. |
| `approval_routing_backfill_runs` | tenant_id, company_id, mode, status, routing/capability contract versions and hashes, release_identity, request identity, database lease, fencing token, pass/cursor, receipt head, cumulative counts, timestamps | `DEC-0245` company-scoped durable `APPLY` orchestration. Contract and scope bindings are immutable; database time and a monotonic fence protect acquisition/takeover; a partial unique index permits one nonterminal authoritative run per company. `DRY_RUN` creates no row. |
| `approval_routing_backfill_batches` | run/scope, request_id, fencing_token, pass_no, batch_sequence, from/to `(created_at,id)` cursors, exact counts, outcome, receipt chain, committed_at | Append-only evidence for one bounded Serializable page. Database guards require the matching run checkpoint, receipt predecessor, outcome/status, and exact blocker cardinality in the same commit. |
| `approval_routing_backfill_blocker_observations` | run/batch/scope, pass_no, approval_instance_id, document_family, stable blocker_code, observed_at | Append-only known-blocker evidence. Exact run/pass/instance/code retries are unique and all parent relationships are tenant/company-qualified. Unknown infrastructure/database errors create no observation and do not advance progress. |
| `approval_routing_producer_barrier_generations` | id, tenant_id, company_id, generation_number, state, routing schema/mapping bindings, capability bindings, release_identity, created_at | Empty, append-only `DEC-0247` foundation. The only admitted state is `DORMANT`; tenant/company generation numbers are unique. It is not readiness, activation, certification, or drain-clean evidence. |
| `approval_routing_producer_provenance` | id, tenant_id, company_id, generation_id, approval_instance_id, document_type, document_id, routing schema/mapping bindings, capability bindings, release_identity, source_transaction_id, created_at | Empty, append-only producer-lineage foundation. Composite foreign keys bind one approval instance to the exact company generation and source document context. No application producer writes this relation in the dormant slice. |
| `petty_cash_approval_step_intents` | tenant_id, company_id, petty_cash_request_id, approval_instance_id, approval_step_id, step_order, requested_amount_snapshot_php, before_amount_php, effective_amount_php, actor_user_id, reason nullable, request_version_before, request_version_after, decision_payload_hash, idempotency_key, created_at | Immutable typed financial-intent schema foundation for one acted petty-cash approval step. Unique step, instance/order, and scoped-idempotency keys plus amount/version checks and an always-enabled lineage trigger bind inserted rows to the active request and approval chain. Always-enabled statement guards reject update, delete, and truncate. The application writer/version CAS remains pending while normalized routing is disabled; this relation does not grant amount-change authority. |
| `tasks` | id, tenant_id, user_id, task_type, document_type, document_id, priority, due_at, status | Inbox/action queue read model. |
| `notifications` | id, tenant_id, company_id nullable, location_id nullable, recipient_user_id, notification_type, priority, channel, title, body, deep_link, entity_type, entity_id nullable, source_event_key, recipient_basis, status, generated_at, read_at, archived_at, metadata | In-app workflow notification state with per-recipient source-event idempotency. |
| `attachments` | id, tenant_id, company_id, storage_environment, storage_provider, object_key, object_version_id, original_filename, mime_type, size_bytes, checksum, uploaded_by_user_id, upload_state, scan_state, availability_state, physical_state, retention_class, retain_until, legal_hold fields, row_version, status | Metadata and lifecycle authority only; encrypted file bytes stay behind the private Hostinger evidence broker. Exact-version clean availability, retention, legal hold, and audit state are company-scoped. |
| `controlled_evidence_attachments` | id, tenant_id, company_id, source_type, source_record_id, source_line_id nullable, source_key, attachment_id, purpose, caption, required_for_action nullable, status, archived_at nullable, archive_reason nullable, created_by_user_id, created_at | Authorized link between a controlled business source and one immutable attachment version. Active required or legally held evidence cannot be normally archived. |
| `audit_events` | id, tenant_id, company_id nullable, actor_user_id nullable, event_type, entity_type, entity_id, occurred_at, request_id, ip_address nullable, before_data nullable, after_data nullable, metadata | Append-only; no user-facing update/delete route. |
| `authorization_denial_buckets` | id, tenant_id, company_id nullable, location_id nullable, actor_user_id nullable, bounded subject/action/reason/resource enums, bucket_key, window bounds, exact denial_count, first/last denial times, first/final audit-event links, finalized_at, timestamps | Mutable bounded operational aggregation state under `DEC-0050`; deletion/truncation is prohibited and immutable first/final evidence remains in `AuditEvent`. |

Current implementation note: `Notification` is implemented as an in-app, recipient-scoped table for workflow attention records. It stores tenant/company/location scope, source entity reference, deep link, source event key, read/archive state, and metadata. The first fanout slice creates idempotent approval notifications for Purchase Request submission, Purchase Order submission, and Purchase Order remaining-balance closure requests. Email, reminder/escalation jobs, notification preferences, and broader workflow fanout remain future controlled transitions.

Approval-routing orchestration note: migration `20260727140000_approval_routing_backfill_orchestration` is additive and backfill-free. It creates three empty relations, closed checks, composite scope foreign keys, append-only evidence triggers, atomic receipt/checkpoint guards, and the partial pending-instance keyset index `(tenantId, companyId, createdAt, id)`. A fresh install therefore expects zero run, batch, and blocker rows; a governed candidate creates one run per affected company, approximately one batch per bounded page plus reconciliation pages, one blocker observation per unique run/pass/instance/code, and exactly one existing `approval.step_routing_backfilled` audit per successfully converted legacy instance. Standard approval, finance, inventory, and export results do not read these operational relations.

Producer-barrier foundation note: migration `20260727150000_approval_routing_producer_barrier_dormant` adds only the two empty protected relations above, a company-scoped shared-lock entry routine for the closed 18-family producer set, and always-enabled shared-lock triggers on the six approval-routing graph/provenance relations. Separate `ENABLE ALWAYS` statement triggers reject every generation or provenance `INSERT`, including from owner/replication-role sessions; update, delete, and truncate also remain rejected. Deferred validation triggers are intentionally inert. The slice creates no readiness or result relation, source-record trigger, provenance writer, exclusive scan/certification path, generation row, or activation state. Production/readiness remains blocked until the closed writer perimeter, executable PostgreSQL migration/contention/ACL evidence, hosted restore/recovery rehearsal, and the separately governed authority policy are complete.

Private observer note: migration `20260727160000_approval_routing_shadow_observers` adds schema `approval_shadow` and exactly 18 fixed-family functions with signature `(tenant uuid, company uuid, approval_instance uuid) -> text`. Each `SECURITY INVOKER`, `STABLE` routine performs structural identity-and-scope reads only and returns `SHADOW_MATCH` or `SHADOW_NO_MATCH`; `PUBLIC` and the ordinary runtime receive no usage or execute grant. The routines create no durable row, routing descriptor, readiness result, certification, or activation effect and are not application-integrated. Ordinary MVCC read locks apply; there is no explicit advisory, row, or table-lock statement. The controlled verifier pins live routine metadata and SHA-256 source bodies, and disposable execution covers all 31 optional/child/post-child corruption branches with rollback restoration and no durable controlled-row delta. The controlled deployment wrapper also requires a complete read-only migration-ledger preflight and exact-current postflight, but that audit/deploy interval remains non-atomic because Prisma deploy uses a separate connection. Any non-disposable application must still close that race or accept it through a separately reviewed control, reconcile migration history/checksums without rewriting the ledger, and pass populated hosted restore/performance gates recorded in `DEC-0247`.

Before production deployment, rehearse the exact migration on both an empty disposable PostgreSQL database and a populated isolated restore. Record pending instance and v0/v1 step counts by tenant/company/family, existing backfill-audit cardinality, malformed mixed-version rows, expected page count, index plans at production-like volume, lock duration, runtime privileges, and before/after business-table digests. Under the current Option D checkpoint, the ordinary application runtime receives zero privilege on all three orchestration relations, so the authored executor is deliberately non-operational. A later separately governed maintenance-role slice must define only the minimum run mutation and append-only batch/blocker privileges and independently prove it cannot rewrite bindings, forge progress, delete evidence, disable triggers, or bypass fenced STOP controls. This migration grants nothing to `PUBLIC`.

Run insertion is restricted to one exact `ACTIVE` start shape: pass 1, sequence 1, zero counts, empty cursors/receipt, fence 1, and a valid bounded database-time lease. Progress and status changes require a matching batch; the only no-batch status transition is fenced `STOPPED`, linked to an exact immutable same-transaction Audit Event through `stop_audit_event_id`, with matching request, owner, fence, release, before/after status, and stop time. Lease and standalone orchestration evidence times are `TIMESTAMPTZ(3)`; cursor timestamps intentionally retain the source `ApprovalInstance.createdAt` `TIMESTAMP(3)` type so direct `(createdAt,id)` keyset predicates remain indexable under the enforced UTC database/session contract.

Rollback is stop/flag-false/forward-repair. Before any run exists, code may ignore the empty additive tables. After evidence exists, do not drop or truncate the relations and never downgrade committed v1 routing. Backup/restore must preserve the run, receipt chain, blocker observations, routing children, and immutable audit together. `BARRIER_REQUIRED` is not `DRAIN_CLEAN`: the separate producer barrier, all-18 writer proof, final from-zero reconciliation, certification, maintenance-role authority, and activation decision remain mandatory.

Append-only enforcement note: under `DEC-0049`, the physical Prisma tables `AuditEvent`, `ProjectActivityEvent`, and `InventoryMovement` each have an unconditional PostgreSQL `ENABLE ALWAYS` statement trigger that rejects `UPDATE`, `DELETE`, and `TRUNCATE` with SQLSTATE `55000`. The migration is additive and does not rewrite existing rows. `SELECT` and append-only `INSERT` remain valid; inventory corrections use a new linked `REVERSAL` movement and audit/project corrections use a new explanatory event. Hosted ownership and grants separate the non-login owner, controlled migrator, and membership-free runtime. The runtime receives only `SELECT` and `INSERT` on these protected tables and cannot alter or disable the controls. Deployment or restore remains fail-closed until the exact release passes ownership, effective-grant, mutation-denial, positive-insert, escalation, snapshot-equivalence, and reconciliation checks from the actual Hostinger connections.

Bounded denial note: under `DEC-0050`, authorization denials aggregate into fixed windows keyed only by tenant/scope/actor-or-bounded-subject and closed action/reason/resource enums. The default window is 15 minutes and configured values must be integer minutes from 5 through 60. Creation and the first immutable audit event are atomic; increments preserve an exact count; lazy and timer finalization share one compare-and-set path; count-one buckets produce no final summary and repeated buckets produce exactly one immutable final summary. Raw target identifiers, paths, query/payload values, IP values, filenames, and error strings are not dimensions.

Approval-integrity note: `PettyCashRequest.currentProposedAmountPhp` and `approvalProposalVersion` provide typed current amount/version storage for a normalized petty-cash approval chain; `approvedAmountPhp` remains the distinct terminal amount. Approval-time amount changes are blocked in both routing modes pending confirmed Finance/Operations policy, and the source workspace exposes no request-approval amount override. The immutable intent writer and proposal-version compare-and-set remain pending, so normalized routing stays disabled. Payment-request draft creation locks referenced `ApInvoice` rows in deterministic ID order and validates exact supplier, location, currency, line scope, line/header totals, invoice-total snapshot, outstanding-capacity snapshot, and fixed-precision live capacity. Payment approval remains explicitly blocked in canonical mode until the still-open `PAYMENT_READY`, match, exception, status, outstanding-amount, and active-request policy matrix is confirmed; no AP settlement or bank effect occurs.

---

## 9. Relationship rules that prevent operational errors

1. A PO line may receive through multiple goods receipt lines; received quantity must not exceed ordered quantity unless an authorized over-receipt policy applies.
2. A goods receipt posts inventory only for accepted quantity.
3. A transfer can be dispatched only from a valid source location with sufficient available stock, unless a controlled negative-stock policy is explicitly enabled.
4. A transfer receipt must not exceed dispatched quantity without a discrepancy workflow.
5. A physical count line stores a system-quantity snapshot at count start; it must not recalculate the baseline while a count is open.
6. Wastage and stock adjustment documents post one or more inventory movements only after required approval.
7. Inventory movement posting and balance update happen inside the same database transaction.
8. A reversed movement references the original movement; original records remain intact.
9. An approval decision records the actual approver, delegation source if any, timestamp, decision, and remarks.
10. Transaction tables use optimistic locking/version checks so two users cannot silently overwrite each other’s changes.

---

## 10. Indexing and performance baseline

Create indexes for common operational filters:

```text
(tenant_id, company_id, status)
(tenant_id, location_id, status)
(tenant_id, created_at DESC)
(tenant_id, public_reference)
(tenant_id, item_id, inventory_location_id)
(tenant_id, document_type, document_id)
(tenant_id, user_id, status, due_at)
```

For inventory ledger:

```text
(tenant_id, company_id, inventory_location_id, item_id, occurred_at DESC)
```

For audit:

```text
(tenant_id, entity_type, entity_id, occurred_at DESC)
```

Use partitioning only when actual movement/audit volume warrants it. Do not optimize prematurely.

---

## 11. Migration and data-seeding rules

- Every schema change is a reviewed migration committed to source control.
- Seed development and staging with anonymized realistic restaurant data: companies, brands, locations, items, suppliers, PRs, POs, receipts, transfers, and stock counts.
- Production seed data is limited to approved master data import templates and tested migration procedures.
- Do not manually alter production data through database consoles except through documented emergency procedures with audit evidence.

---

## 12. Phase I minimum database acceptance criteria

1. A new tenant, company, brand, location, user, role, and scope assignment can be created without code changes.
2. A PR can progress through approval and become a PO with traceable document links.
3. Receiving accepted quantities produces ledger movements and updates stock balances atomically.
4. Transfers record source, destination, in-transit, and received states correctly.
5. Wastage, adjustment, and count variance postings create traceable ledger entries.
6. Every important record links to a complete audit timeline.
7. Report queries can filter by company, brand, location, department, supplier, item, date range, and status without reading unauthorized data.


---

## Projects & Implementation Tracker — Schema Boundary

Phase 1.5 adds a project domain module. It must be implemented as a separate Prisma/domain module with foreign-key integrity to tenant, company, user, department, location, attachments, and auditable actor records.

### Design constraints

- Use nullable scope foreign keys only where an entity may legitimately be company-wide; do not omit `company_id`.
- Use explicit join tables for project members and task assignees.
- Use a polymorphic reference service or constrained typed reference table for `project_record_links`. It must store record type, record ID, display-safe label snapshot, and link metadata while enforcing permission checks at read time.
- Do not use project task status to drive source-record state.
- A project attachment has one valid context: task-only, comment-only, requirement-only, or a task plus its matching task-bound requirement. Database checks reject parentless or comment-mixed rows, and database triggers reject task/requirement mismatch or later requirement-task drift.
- Add indexes for `company_id`, `project_id`, `status`, `due_at`, `assignee`, `is_blocked`, and activity timestamps.
- Use transaction boundaries for activity creation plus the corresponding state mutation.
