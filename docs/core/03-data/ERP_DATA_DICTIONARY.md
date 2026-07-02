# OGFI ERP — Data Dictionary
**Document ID:** ERP_DATA_DICTIONARY  
**Version:** 0.1  
**Status:** Phase I baseline  
**Date:** 25 June 2026  
**Applies to:** Platform Administration, Approvals, Purchasing, Receiving, Inventory, Transfers, Wastage, Adjustments, Audit, Notifications

---

## 1. Purpose

This document defines the Phase I data model for the OGFI ERP. It establishes the records, fields, identifiers, relationships, status values, validation rules, and data-ownership boundaries required to build a traceable multi-company, multi-brand, multi-branch restaurant ERP.

The system is built for OGFI first but must remain tenant-ready for other restaurant groups. Every record is isolated by tenant and company scope from day one.

---

## 2. Design Principles

1. Every operational record identifies its company and relevant brand, location, department, cost center, requester, and status.
2. Roles define what a user can do; scope assignments define where they can do it.
3. Submitted, approved, issued, received, posted, and closed records are never permanently deleted. They are cancelled, reversed, superseded, or deactivated.
4. Inventory is movement-driven. The immutable inventory ledger is the source of truth; on-hand balances are a reconcilable cache.
5. Material changes after approval require a controlled revision or re-approval.
6. Attachments support structured records but never replace required fields.
7. All timestamps are stored in UTC and displayed in the company or user time zone. OGFI default operating time zone: `Asia/Manila`.
8. Approval policies, thresholds, reasons, reminders, and escalations are configuration data, not hardcoded rules.

---

## 3. Shared Conventions

### 3.1 Technical fields

| Field | Type | Rule |
|---|---|---|
| `id` | UUID / ULID | Immutable primary key. |
| `tenant_id` | UUID / ULID | Future restaurant-client isolation boundary. |
| `company_id` | UUID / ULID | Required on company-owned master and transaction records. |
| `created_at`, `updated_at` | datetime UTC | System-generated timestamps. |
| `created_by_user_id`, `updated_by_user_id` | UUID | Actor identifiers. |
| `version` | integer | Optimistic concurrency control. |
| `is_active` | boolean | Master-data lifecycle control. |
| `status` | enum | Record-specific state. |

### 3.2 Human-readable document numbers

| Record | Default number pattern |
|---|---|
| Purchase Request | `PR-{YYYY}-{#####}` |
| RFQ / Supplier Quote | `RFQ-{YYYY}-{#####}` |
| Quotation Comparison | `QC-{YYYY}-{#####}` |
| Purchase Order | `PO-{YYYY}-{#####}` |
| Receiving Report | `RR-{YYYY}-{#####}` |
| Transfer Order | `TO-{YYYY}-{#####}` |
| Wastage Report | `WR-{YYYY}-{#####}` |
| Stock Adjustment | `SA-{YYYY}-{#####}` |
| Physical Count | `PC-{YYYY}-{#####}` |

Document prefixes, sequence rules, and annual reset behavior must be configurable by company.

### 3.3 Common lifecycle fields

| Field | Type | Notes |
|---|---|---|
| `submitted_at`, `submitted_by_user_id` | datetime / UUID | Set when first submitted. |
| `approved_at`, `approved_by_user_id` | datetime / UUID | Final approval. |
| `rejected_at`, `rejected_reason` | datetime / text | Reason required. |
| `cancelled_at`, `cancelled_reason` | datetime / text | Reason required. |
| `closed_at` | datetime | Final closure time. |

---

## 4. Organization and Scope Master Data

### 4.1 Tenant

| Field | Required | Notes |
|---|---:|---|
| `id` | Yes | Primary key. |
| `name` | Yes | Client / group name. |
| `legal_name` | No | Registered legal name when different. |
| `default_timezone` | Yes | IANA time zone. |
| `default_currency_code` | Yes | Default `PHP` for OGFI. |
| `status` | Yes | `active`, `suspended`, `inactive`. |

### 4.2 Company

| Field | Required | Notes |
|---|---:|---|
| `tenant_id`, `company_code` | Yes | Code unique per tenant. |
| `legal_name`, `display_name` | Yes | Legal and operational names. |
| `tax_id`, `registered_address` | No | Restricted visibility. |
| `default_timezone` | Yes | May inherit tenant default. |
| `status` | Yes | `active`, `inactive`. |

### 4.3 Brand

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `brand_code`, `brand_name` | Yes | Brand code unique per company. |
| `brand_type` | Yes | `restaurant`, `cafe`, `bar`, `commissary`, `other`. |
| `status` | Yes | `active`, `inactive`. |
| `notes` | No | Internal notes. |

### 4.4 Operational Location

One model supports branches, warehouse, Head Office, commissary, project sites, pop-ups, and sublocations.

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `location_code`, `location_name` | Yes | Code unique per company. |
| `brand_id` | No | Nullable for shared sites. |
| `location_type` | Yes | `branch`, `warehouse`, `commissary`, `head_office`, `project_site`, `pop_up`, `other`. |
| `parent_location_id` | No | Supports branch kitchen, bar, quarantine area, etc. |
| `mall_or_landlord`, `address` | No | Branch / project information. |
| `operating_timezone` | Yes | Defaults to company setting. |
| `is_inventory_location` | Yes | Controls stock posting eligibility. |
| `is_sales_location` | Yes | Future POS mapping flag. |
| `is_project_location` | Yes | Expansion project flag. |
| `assigned_warehouse_location_id` | No | Replenishment source. |
| `opening_date` | No | Branch detail. |
| `status` | Yes | `planned`, `active`, `temporarily_closed`, `inactive`, `closed`. |

### 4.5 Department and Cost Center

| Entity | Required fields | Notes |
|---|---|---|
| Department | `company_id`, `department_code`, `department_name`, `status` | Optional parent department and default cost center. |
| Cost Center | `company_id`, `cost_center_code`, `cost_center_name`, `cost_center_type`, `status` | May point to location and / or department. Types: `branch`, `department`, `warehouse`, `project`, `shared_service`, `other`. |

---

## 5. Identity, Roles, and Access Data

### 5.1 User

| Field | Required | Notes |
|---|---:|---|
| `tenant_id`, `full_name`, `email`, `default_company_id` | Yes | Email unique per tenant. |
| `employee_code`, `mobile_number`, `job_title` | No | Optional integration / display fields. |
| `default_location_id` | No | Default landing scope. |
| `account_status` | Yes | `invited`, `active`, `locked`, `suspended`, `inactive`. |
| `last_login_at`, `mfa_enabled` | No / Yes | Security data. |

### 5.2 Role, Permission, and Assignment

| Entity | Required fields | Notes |
|---|---|---|
| Role | `tenant_id`, `role_code`, `role_name`, `role_group`, `status` | Groups: executive, Head Office, branch, warehouse, project, audit, system. |
| Permission | `permission_key`, `module`, `action` | Examples: `purchase_request.submit`, `purchase_order.submit`, `purchase_order.approve`, `purchase_order.issue`, `purchase_order.close_remaining`. |
| User Role Assignment | `user_id`, `role_id`, `effective_from`, `effective_to`, `assignment_status` | Supports time-bound coverage. |
| User Scope Assignment | `user_id`, `scope_type`, `scope_id`, `access_level`, `effective_from`, `effective_to` | Scope types: tenant, company, brand, location, department, cost center, project. |

---

## 6. Supplier and Item Master Data

### 6.1 Supplier

Current Phase I scaffold implements the initial source-of-truth subset: `tenant_id`, `company_id`, `supplier_code`, `legal_name`, `trading_name`, `tax_identifier`, `status`, `payment_terms`, primary operational contact fields, supplier-item links, and reference price history. Accreditation, supplier type, documents, and eligibility exception controls remain required before supplier use in quotation comparison, purchase orders, and receiving.

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `supplier_code`, `legal_name`, `display_name` | Yes | Supplier code unique per company. |
| `supplier_type` | Yes | Food, beverage, packaging, non-food, equipment, service, construction, marketing, IT, other. |
| `tax_id`, `address`, contact fields | No | Restricted where appropriate. |
| `payment_terms_days`, `currency_code` | No / Yes | Default commercial terms. |
| `accreditation_status` | Yes | `draft`, `pending_review`, `approved`, `conditional`, `suspended`, `inactive`, `rejected`. |
| `accreditation_expiry_date` | No | Compliance alert field. |
| `preferred_supplier_flag` | Yes | Informational only; does not bypass controls. |

### 6.2 Item Category

Current Phase I scaffold implements company-scoped category creation with expiry, lot, and wastage-photo defaults. Hierarchy and controlled edits beyond creation are deferred until broader master-data governance screens are implemented.

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `category_code`, `category_name`, `inventory_class` | Yes | `food`, `beverage`, `packaging`, `supplies`, `smallwares`, `equipment`, `maintenance`, `other`. |
| `parent_category_id` | No | Category hierarchy. |
| `requires_expiry_tracking`, `requires_lot_tracking` | Yes | Default item behavior; item may override. |
| `default_wastage_requires_photo` | Yes | Control setting. |
| `status` | Yes | `active`, `inactive`. |

### 6.3 Unit of Measure

Current Phase I scaffold implements company-scoped UOM creation and item-level conversion creation. UOM usage in PR, PO, receiving, and inventory posting is not enabled until item validation is wired into those workflows.

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `uom_code`, `uom_name`, `uom_type`, `decimal_precision` | Yes | Example codes: KG, G, L, ML, PC, CASE. |
| `status` | Yes | `active`, `inactive`. |

### 6.4 Inventory Item

Current Phase I scaffold implements item creation with category, base/purchase/issue UOM references, tracking flags, receiving-inspection flag, supplier-item references, and audit history. Location settings, standard cost, barcodes, and transactional stock effects remain deferred.

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `item_code`, `item_name`, `item_category_id`, `item_type` | Yes | Code unique per company. |
| `base_uom_id` | Yes | Ledger and balance unit. |
| `purchase_uom_id`, `issue_uom_id` | No | Procurement and consumption convenience. |
| `track_inventory`, `track_expiry`, `track_lot` | Yes | Item control flags. |
| `requires_receiving_inspection` | Yes | Quality / receiving control. |
| `min_stock_level`, `max_stock_level`, `reorder_point` | No | Optional Phase I alerts. |
| `default_supplier_id`, `standard_cost` | No | Reference fields only. |
| `status` | Yes | `draft`, `active`, `inactive`, `discontinued`. |

### 6.5 Item UOM Conversion

| Field | Required | Notes |
|---|---:|---|
| `item_id`, `from_uom_id`, `to_uom_id`, `conversion_factor` | Yes | `1 from_uom = factor × to_uom`. |
| `rounding_rule` | Yes | `none`, `up`, `down`, `nearest`. |
| `status` | Yes | `active`, `inactive`. |

### 6.6 Supplier Item Reference

Current Phase I scaffold implements active supplier-to-item purchase UOM links, optional supplier SKU/name, lead time, minimum order quantity, preferred rank, optional reference unit price, deactivation with reason, and audit history. It does not yet make these links eligible for quote comparison, purchase orders, receiving, or supplier exception approval.

| Field | Required | Notes |
|---|---:|---|
| `supplier_id`, `item_id`, `purchase_uom_id` | Yes | Supplier-item relationship. |
| `supplier_sku`, `supplier_item_name` | No | Supplier reference. |
| `currency_code`, `unit_price`, `effective_from`, `effective_to` | No | Historical reference price. |
| `lead_time_days`, `minimum_order_quantity` | No | Optional procurement data. |
| `status` | Yes | `active`, `inactive`. |

---

## 7. Approval Configuration Data

### 7.1 Approval Policy

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `policy_code`, `transaction_type`, `name`, `priority` | Yes | Lower priority number evaluated first. |
| `conditions_json` | Yes | Branch, amount, department, urgency, budget status, category, etc. |
| `effective_from`, `effective_to` | No | Policy lifespan. |
| `is_active` | Yes | Enable / disable. |

### 7.2 Approval Step Template

| Field | Required | Notes |
|---|---:|---|
| `approval_policy_id`, `sequence_no`, `approver_source`, `approver_reference` | Yes | Source can be role_scope, requester_manager, location_manager, department_head, named_user, rule expression. |
| `min_approvers_required` | Yes | Usually one. |
| `can_approve_in_parallel` | Yes | Optional. |
| `sla_hours`, `escalation_rule_json` | No | Reminder and escalation. |
| `delegation_allowed` | Yes | Default true for normal approvers. |

### 7.3 Approval Instance and Action

| Entity | Required fields | Notes |
|---|---|---|
| Approval Instance | `company_id`, `transaction_type`, `transaction_id`, `approval_policy_id`, `current_step_no`, `approval_status`, `snapshot_json` | Snapshot protects historical rule integrity. |
| Approval Action | `approval_instance_id`, `step_no`, `action`, `acted_by_user_id` | Actions: pending, approved, rejected, returned, skipped, escalated, expired. `remarks` required for reject / return. |

---

## 8. Purchasing Transaction Data

### 8.1 Purchase Request Header

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `pr_number`, `request_date`, `requested_by_user_id` | Yes | Required identity. |
| `requesting_department_id`, `requesting_location_id`, `cost_center_id` | Yes | Required scope. |
| `brand_id`, `project_id` | No | Nullable for shared / future project requests. |
| `request_type`, `urgency_level`, `purpose` | Yes | Standard, replenishment, emergency, capital, service, other. |
| `required_by_date`, `budget_status` | No / Yes | Budget status defaults `unknown`. |
| `emergency_reason`, `emergency_authorized_by_user_id` | Conditional | Required for emergency flow. |
| `status`, `approval_instance_id` | Yes / No | Status values below. |

**PR statuses:** `draft`, `submitted`, `returned`, `pending_approval`, `approved`, `partially_converted`, `converted`, `rejected`, `cancelled`, `closed`.

### 8.2 Purchase Request Line

| Field | Required | Notes |
|---|---:|---|
| `purchase_request_id`, `line_no` | Yes | Unique line number per request. |
| `item_id` or `free_text_description` | Yes | One is required. |
| `item_category_id` | Conditional | Required for free-text items. |
| `requested_quantity`, `uom_id` | Yes | Quantity > 0. |
| `estimated_unit_cost`, `estimated_total_cost` | No | Required where policy needs estimate. |
| `preferred_supplier_id`, `inventory_location_id` | No | Supplier and target stock location. |
| `reason_or_specification` | Conditional | Required for service / non-standard / free text. |
| `converted_quantity`, `line_status` | Yes | Conversion tracking. |

### 8.2.1 Purchase Request Comment

Current Phase I scaffold implements scoped Purchase Request comments with author, body, timestamp, and audit event creation. Comment deletion, attachments, mentions, notification fanout, and rich-text formatting remain deferred.

| Field | Required | Notes |
|---|---:|---|
| `purchase_request_id`, `tenant_id`, `company_id`, `author_user_id` | Yes | Enforced through the scoped PR read path. |
| `body`, `created_at` | Yes | Body is plain text and retained for audit context. |

### 8.3 Supplier Quote and Quotation Comparison

Current Phase I scaffold implements approved-Purchase-Request quote capture with `quotation_request`, `supplier_quotation`, and `supplier_quotation_line` records scoped by tenant/company and selected location context. It records supplier, quote reference/date, currency from company configuration, quantity, UOM, unit price, line total, availability, lead time, terms, notes, and audit reason. It also highlights the lowest recorded cost and supports scoped quote CSV export. Formal supplier recommendation is recorded through `quotation_recommendation`, which stores the selected supplier quote, evaluated-total snapshot, quote count, selection reason, conditional non-lowest justification, conditional single-source justification, status, version, and evaluation snapshot. Recommendation submission creates a configurable approval instance for supplier-selection approval before PO conversion. Quote attachments, supplier eligibility exceptions, and configurable RFQ thresholds remain deferred.

| Entity | Required fields | Notes |
|---|---|---|
| Supplier Quote | `company_id`, `rfq_number`, `supplier_id`, `request_date`, `currency_code`, `status` | Captures quote reference, validity, lead time, terms, charges, attachment. |
| Supplier Quote Line | `supplier_quotation_id`, `line_no`, `quoted_quantity`, `uom_id`, `unit_price`, `line_total_amount`, `availability_status` | Supports substitutes explicitly. |
| Quotation Recommendation | `tenant_id`, `company_id`, `quotation_request_id`, `selected_supplier_quotation_id`, `prepared_by_user_id`, `status`, `currency_code`, `selected_evaluated_total`, `lowest_evaluated_total`, `quote_count`, `is_lowest_evaluated_cost`, `selection_reason`, `evaluation_snapshot`, `version` | Selection reason is always required. Non-lowest justification is required when the selected quote is not the lowest evaluated cost. Single-source justification is required when only one quote exists. |

### 8.4 Purchase Order Header

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `po_number`, `supplier_id` | Yes | Supplier must be active / eligible. |
| `ordering_location_id`, `delivery_location_id`, `department_id`, `cost_center_id` | Yes | Operational and financial scope. |
| `purchase_request_id`, `quotation_comparison_id` | No | Required according to process policy. |
| `brand_id`, `project_id` | No | Future-ready scope. |
| `po_date`, `currency_code`, `grand_total_amount`, `status` | Yes | Monetary values are calculated. |
| `expected_delivery_date`, `payment_terms_days`, `terms_and_conditions` | No | Commercial data. |
| `approval_instance_id`, `supplier_acknowledged_at` | No | Workflow / acknowledgement. |

**PO statuses:** `draft`, `pending_approval`, `approved`, `issued`, `acknowledged`, `partially_received`, `fully_received`, `closed`, `cancelled`, `superseded`.

Current Phase I scaffold implements the controlled PO foundation through `purchase_order`, `purchase_order_line`, approval instance, and audit records. A draft PO can be created only from an approved quotation recommendation and stores PR, quotation request, recommendation, selected supplier quote, active supplier, delivery location, department/cost center, line snapshots, totals, source snapshot, creator, and audit event. Implemented workflow statuses are `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ISSUED`, `AMENDMENT_PENDING`, receiving-driven `PARTIALLY_RECEIVED` / `FULLY_RECEIVED`, `CANCELLED`, and `CLOSED`; returned POs move back to `DRAFT`. Supplier issue/send moves an approved PO to `ISSUED` and records issuer, timestamp, controlled method (`Email`, `Printed copy`, `Supplier portal`, or `Manual handoff`), recipient/reference, and remarks in audit metadata. The PO list, CSV export, and supplier copy derive latest issue/re-send evidence, including recorder name, from audit history and export ordered, received, closed/cancelled, and open quantity/value summaries so `FULLY_RECEIVED` and `CLOSED` remain operationally distinct. Approved, issued, received, and closed POs expose a scoped printable supplier copy without creating inventory movement or receipt records; draft, pending, and cancelled POs do not expose the supplier-copy route. Operational cancellation is implemented only before receiving: scoped `DRAFT`, `APPROVED`, and `ISSUED` POs can be cancelled with reason when no Receiving Report exists and no line has received quantity. Cancellation sets each PO line's `cancelled_quantity` to the remaining ordered quantity, writes an audit event, and creates no inventory movement or balance update. Bounded amendment is implemented only before receiving: an `ISSUED` PO with no Receiving Report, no received quantity, no pending closure, and no pending amendment may request approval-backed same-line quantity, unit price, line note, and expected delivery date changes. The request stores before/proposed snapshots, requires reason plus supplier notice reference or unavailable explanation, moves the PO to `AMENDMENT_PENDING`, blocks receiving, and writes audit history. Approval applies the proposal and returns the PO to `ISSUED`; return or rejection restores `ISSUED` without line mutation. Remaining-balance closure is implemented for `PARTIALLY_RECEIVED` POs only: it requires approval, a reason, supplier notice reference or unavailable explanation, no draft Receiving Report, and no duplicate pending closure. Approval sets remaining line quantities to `cancelled_quantity` and moves the PO to `CLOSED` without changing received quantities or creating inventory movement. Full post-receiving PO amendment and supplier/location/line-add/delete/substitution/payment-term amendment remain deferred controlled transitions.

### 8.4.0 Purchase Order Amendment

| Entity | Key Fields | Notes |
| --- | --- | --- |
| Purchase Order Amendment | `tenant_id`, `company_id`, `purchase_order_id`, `requested_by_user_id`, `approved_by_user_id`, `status`, `reason`, `supplier_notice_reference`, `supplier_notice_unavailable_reason`, `before_snapshot`, `proposed_snapshot`, `requested_at`, `approved_at`, `rejected_at`, `applied_at` | Statuses: `PENDING_APPROVAL`, `APPROVED`, `RETURNED`, `REJECTED`. Used only for bounded issued/unreceived PO amendment. |

### 8.4.1 Purchase Order Balance Closure

| Data Object | Required Fields | Notes |
|---|---|---|
| Purchase Order Balance Closure | `tenant_id`, `company_id`, `purchase_order_id`, `requested_by_user_id`, `status`, `reason`, `line_snapshot`, `total_closed_quantity`, `total_closed_value`, `requested_at` | Statuses: `PENDING_APPROVAL`, `APPROVED`, `RETURNED`, `REJECTED`, `CANCELLED`. |
| Supplier Notice Evidence | `supplier_notice_reference` or `supplier_notice_unavailable_reason` | One is required before submitting closure for approval. |
| Approval Outcome | `approved_by_user_id`, `approved_at`, `rejected_at`, `rejection_reason` | Return or reject closes the closure request but does not mutate the PO. |

`DEC-0020` confirms approval-backed remaining-balance closure. The closure record snapshots outstanding line quantities and value at request and approval time. The PO remains the supplier commitment source of truth, while Receiving Reports and inventory ledger records remain the source of truth for delivered and stocked quantities.

### 8.5 Purchase Order Line

| Field | Required | Notes |
|---|---:|---|
| `purchase_order_id`, `line_no`, `description`, `ordered_quantity`, `uom_id`, `unit_price` | Yes | Snapshot at order time. |
| `item_id`, `source_pr_line_id` | No | Required for inventory item / traceability use cases. |
| `discount_amount`, `tax_amount`, `line_total_amount` | Yes | Calculated values. |
| `received_quantity`, `cancelled_quantity`, `line_status` | Yes | Fulfillment tracking. |

---

## 9. Receiving and Inventory Data

### 9.1 Receiving Report Header

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `rr_number`, `receiving_location_id`, `received_by_user_id`, `received_at`, `status` | Yes | Core receipt data. |
| `purchase_order_id`, `supplier_id` | Conditional | Required unless authorized direct / emergency route. |
| `supplier_delivery_receipt_number`, `supplier_invoice_number` | No | External references. |
| `discrepancy_flag`, `discrepancy_summary` | Yes / Conditional | Summary required if discrepancy exists. |
| `inspection_required`, `inspection_completed_by_user_id` | Yes / No | Inspection workflow. |
| `attachment_id`, `remarks` | No | Proof / notes. |

**RR statuses:** `draft`, `in_inspection`, `posted`, `posted_with_discrepancy`, `rejected`, `cancelled`, `reversed`.

Current Phase I scaffold implements Receiving Report capture, posting, and full-document reversal from issued or partially received Purchase Orders. Draft receipts preserve PO, supplier, receiving location, receiver, external delivery reference, line snapshots, accepted/rejected/damaged/short quantities, discrepancy reason and evidence reference for discrepancy lines, destination inventory location, and audit history. Posting creates immutable `RECEIPT_IN` inventory movements only for accepted quantities, updates the balance cache, increments PO line received quantity, and moves the PO to `PARTIALLY_RECEIVED` or `FULLY_RECEIVED`. Reversal requires permission and reason, writes linked `REVERSAL` movements, restores PO received quantities/status, and keeps the original receipt and discrepancy history visible. Binary attachment upload, notification fanout, partial line reversal, and advanced inspection approvals remain deferred controlled transitions.

### 9.2 Receiving Report Line

| Field | Required | Notes |
|---|---:|---|
| `receiving_report_id`, `line_no`, `item_id`, `received_quantity`, `accepted_quantity`, `rejected_quantity`, `uom_id` | Yes | Accepted ≤ received. |
| `purchase_order_line_id`, `ordered_quantity`, `unit_cost` | No | PO lineage / receipt cost. |
| `lot_number`, `expiry_date` | Conditional | Required per item control. |
| `condition_status` | Yes | accepted, partial_reject, rejected, pending_inspection. |
| `discrepancy_type`, `discrepancy_reason` | Conditional | Required if mismatch. |
| `inventory_destination_location_id` | Yes | Final stock location. |

### 9.3 Inventory Movement Ledger

Posted movement records are immutable.

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `movement_datetime`, `movement_type`, `source_document_type`, `source_document_id`, `item_id`, `location_id` | Yes | Source traceability. |
| `related_location_id` | No | Counterparty for transfer. |
| `quantity_delta_base_uom`, `base_uom_id` | Yes | Positive = stock-in; negative = stock-out. |

Current Phase I scaffold implements the quantity-only inventory ledger foundation through inventory locations, immutable inventory movement records, and a balance cache keyed by inventory location, item, and normalized lot/expiry key. It stores source document lineage and idempotency keys and currently posts receiving, receiving-reversal, transfer dispatch, transfer receipt, transfer-receipt reversal, wastage, wastage-reversal, stock-adjustment, count-generated stock-adjustment, and stock-adjustment-reversal movements through controlled workflow services. Inventory movement posting is blocked for an inventory location while an active stock count with movement freeze is in progress, submitted, or in recount for that same location. It does not implement authoritative valuation, GL posting, opening-balance cutover, direct `COUNT_VARIANCE_*` posting, dispatch reversal workflows, or partial receipt-line reversal workflows yet.
| `unit_cost_base_uom`, `value_delta` | No | Cost reference. |
| `lot_number`, `expiry_date` | Conditional | Per item control. |
| `posted_by_user_id`, `posting_status` | Yes | Posted / reversed. |
| `reversal_of_movement_id`, `remarks` | No | Correction traceability. |

**Movement types:** `receipt`, `transfer_out`, `transfer_in`, `wastage`, `adjustment_in`, `adjustment_out`, `count_variance`, `return_to_supplier`, `return_from_branch`, `opening_balance`, `reversal`.

### 9.4 Inventory Balance Cache

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `item_id`, `location_id`, `on_hand_quantity_base_uom`, `available_quantity_base_uom` | Yes | Cache must reconcile to ledger. |
| `lot_number`, `expiry_date` | Conditional | Part of identity where tracked. |
| `reserved_quantity_base_uom` | Yes | Defaults to zero in Phase I. |
| `last_movement_at`, `last_reconciled_at`, `status` | Yes / No / Yes | Status: active, quarantined, expired, inactive. |

### 9.5 Transfer Order and Line

| Entity | Required fields | Notes |
|---|---|---|
| Transfer Header | `tenant_id`, `company_id`, `public_reference`, `source_location_id`, `destination_location_id`, `requested_by_user_id`, `dispatched_by_user_id`, `received_by_user_id`, `transfer_type`, `purpose`, `required_by_date`, `status`, `submitted_at`, `dispatched_at`, `received_at` | Source and destination must differ. Current implementation supports request submission, source dispatch, and event-backed destination receipt. |
| Transfer Line | `inventory_transfer_id`, `line_no`, `source_inventory_location_id`, `destination_inventory_location_id`, `item_id`, `requested_quantity`, `approved_quantity`, `prepared_quantity`, `dispatched_quantity`, `received_quantity`, `rejected_quantity`, `damaged_quantity`, `discrepancy_quantity`, `uom_id` | Dispatch increments `dispatched_quantity` and posts `TRANSFER_OUT`. Receipt events increment accepted `received_quantity` and post `TRANSFER_IN`; rejected, damaged, and discrepancy quantities are rollups that do not post destination stock. A disputed transfer can be closed through non-posting discrepancy settlement with audit metadata; original movement quantities remain unchanged. |
| Transfer Receipt | `inventory_transfer_id`, `received_by_user_id`, `status`, `received_at`, `posted_at`, `reversed_by_user_id`, `reversed_at`, `reversal_reason`, `discrepancy_flag`, `discrepancy_summary` | Durable receipt event for exact or partial destination receipt. Posted receipt events can be reversed only as full events. |
| Transfer Receipt Line | `transfer_receipt_id`, `inventory_transfer_line_id`, `line_no`, `dispatched_quantity_snapshot`, `accepted_quantity`, `rejected_quantity`, `damaged_quantity`, `discrepancy_quantity`, `outstanding_quantity`, `posted_movement_id` | Accepted quantity links to a deterministic `TRANSFER_IN` movement. Discrepancy reason is required when rejected, damaged, or short/discrepant quantity is recorded. |

**Implemented transfer statuses:** `DRAFT`, `REQUESTED`, `DISPATCHED`, `PARTIALLY_RECEIVED`, `DISPUTED`, `RECEIVED`, `CLOSED`, `CANCELLED`.

**Future transfer statuses:** `pending_approval`, `approved`, `preparing`, `rejected`.

### 9.6 Physical Count and Count Line

| Entity | Required fields | Notes |
|---|---|---|
| Count Session | `tenant_id`, `company_id`, `public_reference`, `inventory_location_id`, `count_type`, `scheduled_date`, `cutoff_at`, `blind_count`, `freeze_movements`, `created_by_user_id`, `assigned_to_user_id`, `status` | Type: full, cycle, spot, high_value, opening. Current implementation is non-posting. |
| Count Line | `count_session_id`, `line_no`, `item_id`, `uom_id`, `lot_key`, `system_quantity_base_uom`, `counted_quantity_base_uom`, `variance_quantity_base_uom`, `counted_by_user_id`, `counted_at` | Variance is calculated from the cutoff snapshot. Reviewed non-zero variance lines can generate one linked `COUNT_VARIANCE` Stock Adjustment. |

**Implemented count statuses:** `DRAFT`, `IN_PROGRESS`, `SUBMITTED`, `RECOUNT_REQUESTED`, `REVIEWED`, `CANCELLED`.

**Future count statuses:** `APPROVED`, `POSTED`, `REJECTED`.

### 9.7 Wastage and Stock Adjustment

| Entity | Required fields | Notes |
|---|---|---|
| Wastage Header | `company_id`, `wr_number`, `location_id`, `department_id`, `reported_by_user_id`, `reported_at`, `wastage_type`, `reason_code`, `status` | Estimated value and photo requirements recorded. |
| Wastage Line | `wastage_report_id`, `line_no`, `item_id`, `inventory_location_id`, `quantity`, `uom_id`, `quantity_base_uom` | Lot / expiry and photo required per policy. |
| Operational Reason Code | `tenant_id`, `company_id`, `workflow`, `code`, `label`, `applies_to`, `requires_evidence`, `status`, `sort_order` | Configured dropdown source for Wastage, Stock Adjustment, and future exception classifications. |
| Adjustment Header | `company_id`, `sa_number`, `location_id`, `requested_by_user_id`, `adjustment_date`, `adjustment_type`, `reason_code`, `reason_description`, `status`, `source_document_type`, `source_document_id`, `source_stock_count_session_id`, `posted_by_user_id`, `reversed_by_user_id`, `posted_at`, `reversed_at`, `reversal_reason` | `DEC-0023` implements manual increase/decrease approval, separate posting, and full-document reversal. `DEC-0026` adds count-generated `COUNT_VARIANCE` adjustments. Opening balance cutover is implemented through controlled `OPENING_BALANCE` adjustments. Reclassification and backdating remain future controlled releases. |
| Adjustment Line | `stock_adjustment_id`, `line_no`, `item_id`, `adjustment_quantity_base_uom`, `posted_movement_id` | Stores requested quantity impact, system snapshot where available, value context where available, lot / expiry, and posted movement lineage when approved adjustment is posted. |

**Wastage statuses:** `draft`, `submitted`, `pending_approval`, `approved`, `posted`, `rejected`, `cancelled`, `reversed`.

**Stock Adjustment statuses:** `DRAFT`, `SUBMITTED`, `PENDING_APPROVAL`, `APPROVED`, transient `POSTING`, `POSTED`, transient `REVERSING`, `REVERSED`, `RETURNED`, `REJECTED`, `CANCELLED`.

Current Phase I scaffold implements Wastage Reports through `wastage_report`, `wastage_line`, `wastage_policy`, `operational_reason_code`, approval instances, inventory movements, and audit records. Implemented wastage statuses are `DRAFT`, `SUBMITTED` for legacy review-only records, `PENDING_APPROVAL`, `APPROVED`, transient `POSTING`, `POSTED`, transient `REVERSING`, `REVERSED`, `REVIEWED`, `RETURNED`, `REJECTED`, and `CANCELLED`. Wastage records are scoped to the current authorized inventory location, require item, positive quantity, an active configured reason code, evidence reference where item-category or configured policy rules require it, lot/expiry where tracked, estimated unit/total cost, evaluated policy flags, policy snapshot, and audit history. Submitting wastage creates an approval instance; approving wastage creates no movement; posting approved wastage creates source-linked `WASTAGE_OUT` movements and updates balances through the inventory ledger service. Reversing posted wastage creates linked `REVERSAL` movements and restores stock through the same ledger service. Backdating remains a future controlled transition.

`DEC-0019` confirmed the original non-posting Stock Adjustment foundation. `DEC-0023` adds approval-enabled posting for manual `INCREASE` and `DECREASE` adjustments. `DEC-0026` allows a reviewed Stock Count Session to generate one linked `COUNT_VARIANCE` adjustment from non-zero variance lines. Manual adjustment creation now requires an active configured reason code plus a narrative `reason_description`. Submitting creates a `StockAdjustment` approval instance; approving creates no movement; posting approved adjustments creates source-linked `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, or opening-balance movements and updates balances only through the inventory ledger service; reversing posted adjustments creates linked `REVERSAL` movements. Direct `COUNT_VARIANCE_*` posting, reclassification, backdating, finance/accounting entries, and partial reversal require separate confirmed decisions and implementation.

---

## 10. Cross-Cutting Records

### 10.1 Attachment

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `owner_type`, `owner_id`, `file_name`, `storage_key`, `mime_type`, `file_size_bytes`, `document_type`, `uploaded_by_user_id`, `uploaded_at` | Yes | Owner is the related record. |
| `verification_status`, `checksum`, `is_sensitive` | Yes / No / Yes | Document types include quote, receipt, DR, invoice, photo, contract, other. |

### 10.2 Comment / Activity Note

| Field | Required | Notes |
|---|---:|---|
| `company_id`, `owner_type`, `owner_id`, `comment_text`, `visibility`, `created_by_user_id`, `created_at` | Yes | Visibility: internal, approvers_only, finance_only, system. |

### 10.3 Audit Log

| Field | Required | Notes |
|---|---:|---|
| `tenant_id`, `company_id`, `entity_type`, `entity_id`, `action`, `actor_type`, `occurred_at` | Yes | Actor can be user, system, integration. |
| `actor_user_id`, `before_json`, `after_json`, `reason`, `ip_address`, `user_agent`, `correlation_id` | No | Redact sensitive fields by policy. |

### 10.4 Notification

| Field | Required | Notes |
|---|---:|---|
| `tenant_id`, `recipient_user_id`, `notification_type`, `title`, `body`, `channel`, `entity_type`, `source_event_key`, `status`, `generated_at` | Yes | Current implementation uses in-app notification records only. |
| `company_id`, `location_id`, `entity_id`, `priority`, `deep_link`, `recipient_basis`, `read_at`, `archived_at`, `metadata` | No | `source_event_key` plus recipient prevents duplicate alerts for retried source events. |

Current implementation note: The first notification foundation slice creates scoped in-app approval notifications for Purchase Request submission, quotation recommendation submission, Purchase Order submission, and Purchase Order remaining-balance closure requests. Notification read/archive state does not complete, approve, post, or otherwise mutate the source workflow. Email, escalation, preferences, and broader event fanout remain future hardening items.

---

## 11. Key Relationships

```text
Tenant
  └─ Company
      ├─ Brand
      ├─ Operational Location (branch / warehouse / commissary / project)
      ├─ Department and Cost Center
      ├─ User → Role Assignment + Scope Assignment
      ├─ Supplier → Supplier Item Reference
      ├─ Item Category → Inventory Item → Item UOM Conversion
      ├─ Purchase Request → PR Lines
      │      └─ Supplier Quotes → Quotation Comparison
      │              └─ Purchase Order → PO Lines
      │                      └─ Receiving Report → Receipt Lines
      │                              └─ Inventory Movement Ledger → Balance Cache
      ├─ Transfer Order → Transfer Lines → paired stock movements
      ├─ Wastage / Adjustment → Lines → stock movements
      ├─ Count Session → Count Lines → count-variance movements
      └─ Approval Policies → Approval Instances → Actions
```

---

## 12. Mandatory Integrity Rules

1. Every record is constrained by tenant, company, and user scope.
2. A location must be active and inventory-enabled before stock can post to it.
3. A PO cannot use an inactive or ineligible supplier without explicit exception approval.
4. A PO cannot exceed approved PR quantity without a documented approved change.
5. Accepted receipt quantity cannot exceed received quantity.
6. A posted receipt creates stock only for accepted quantity.
7. A transfer creates a negative source movement at dispatch and positive destination movement at receipt, sharing a correlation ID.
8. Inventory movement records cannot be edited after posting.
9. Lot and expiry-controlled items require those values at every relevant stock movement.
10. Wastage, adjustment, and count variance cannot post before the required approval is complete.
11. Rejection, return, cancellation, reversal, backdating, and exception actions require a reason.
12. Material audit logs are written in the same transaction as the business action.
13. Master data referenced by transactions can be deactivated but not deleted.
14. Numeric quantities and money use decimal values, never floating-point storage.
15. Status transitions must follow allowed workflow paths and cannot be jumped through direct editing.

---

## 13. Phase I Report Filters

All operational lists should support filters and export fields for, where relevant:

- Company, brand, location / branch / warehouse
- Department, cost center, project
- Document number and document type
- Requester / creator / approver / receiver
- Supplier, item, category, lot, expiry
- Status and approval status
- Created date, required date, delivery date, posted date
- Amount, estimated value, variance value, stock quantity
- Discrepancy and exception flags
- Last updated user and timestamp

---

## 14. Deferred Domains

The following are intentionally deferred but may use reference fields now:

- Recipes, sub-recipes, menus, theoretical food cost
- POS sales and consumption
- General ledger, payment execution, tax reporting
- Full HR and payroll data
- Expansion feasibility, lease, permits, construction, capex
- SaaS subscriptions, client billing, white-label configuration
- Forecasting and automated replenishment



---

## Projects & Implementation Tracker — Phase 1.5 Data Extension

The canonical detailed field definitions are in `docs/phases/phase-01-5-projects-implementation/data/PROJECTS_IMPLEMENTATION_DATA_EXTENSIONS.md`.

Implemented foundation entities:

- `project_templates`
- `projects`
- `project_members`
- `project_activity_events`
- `project_tasks`
- `project_task_assignees`
- `project_task_checklist_items`
- `project_comments`
- `project_attachments`
- `project_blockers`
- `project_risks`
- `project_milestones`
- `project_record_links`

Planned follow-on entities:

- `project_template_stages`
- `project_task_dependencies`

Every project-owned record includes tenant/company context, created/updated timestamps, actor metadata, and soft-delete/archive behavior where applicable. Task and project events must preserve history. Project links reference controlled source records but do not copy or own their financial, inventory, or approval state.

Current implementation note: the foundation migrations add project templates, projects, project members, project activity events, project tasks, active task assignees, checklist items, comments, project-scoped attachment metadata links, task blockers, project risks, milestone records, date-only planning fields for calendar-safe project/task dates, and project record links. Published project templates can be selected during project creation; the project stores the source template ID plus a project-specific template snapshot/configuration so later template edits do not silently change active projects, and starter tasks/checklists/milestones are cloned into project-owned records during project creation. Implemented record-link source types are purchase requests, purchase orders, goods receipts, inventory transfers, suppliers, inventory movements, inventory balances, approval instances, wastage reports, and stock adjustments. These links store only source type and source ID, with safe summaries resolved at read time through source-module authorization; inventory-balance summaries require stock-balance permission and selected-location scope. Project attachment links reference shared attachment metadata and expose filename/type/size only through authorized project/task reads; binary upload/download, object keys, public URLs, and file scanning remain deferred to the shared attachment service. Project risks are advisory coordination records with their own lifecycle and activity history; they do not mutate operational source records. Task dependencies and persisted calendar events remain deferred. Calendar behavior is derived from authorized project/task/milestone records, not stored as a separate source of truth.
