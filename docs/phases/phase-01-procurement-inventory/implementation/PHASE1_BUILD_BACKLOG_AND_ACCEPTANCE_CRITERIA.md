# Phase I Build Backlog and Acceptance Criteria
**Document ID:** PHASE1_BUILD_BACKLOG_AND_ACCEPTANCE_CRITERIA  
**Version:** 0.1  
**Date:** 25 June 2026  
**Applies to:** OGFI ERP Phase I

---

## 1. Purpose

This document converts the Phase I roadmap into a testable delivery baseline. It defines the minimum build sequence, business capabilities, acceptance criteria, non-functional requirements, migration readiness, UAT scenarios, and pilot release gates.

Phase I is complete only when OGFI can run controlled purchasing and inventory workflows in the ERP without depending on paper, chat, verbal approvals, or disconnected spreadsheets for the same transactions.

---

## 2. Phase I Goal

> Establish a secure, multi-brand, multi-branch restaurant operations foundation that controls requests, approvals, purchasing, receiving, inventory movements, transfers, counts, wastage, stock adjustments, notifications, and audit history.

---

## 3. In-Scope Modules

1. Platform Administration and Organization Setup
2. User, Role, Permission, and Scope Access
3. Approval Engine
4. Supplier Master Data
5. Item, Category, UOM, and Conversion Master Data
6. Purchase Requests
7. Supplier Quotes and Quotation Comparison
8. Purchase Orders
9. Receiving Reports
10. Inventory Ledger and Balance Views
11. Inventory Transfers
12. Physical Inventory Counts
13. Wastage and Stock Adjustments
14. Notifications, Attachments, Comments, Audit Logs
15. Basic Operational Dashboards and Exports

---

## 4. Explicit Exclusions

Do not delay Phase I for:
- Recipe, menu, or theoretical food-cost calculation
- POS integration
- Accounts-payable payment execution
- Full budget management
- Payroll and statutory deductions
- Employee scheduling
- Expansion project management
- Supplier portal
- Automated replenishment forecast
- Full general ledger accounting
- Multi-client billing and white-label onboarding

Architecture must not block these future modules.

---

## 5. Delivery Sequence

### Release 1 — Foundation
- Tenant, company, brand, location, department, and cost-center setup
- Users, roles, permissions, and scopes
- Audit-log framework
- Attachment storage and access control
- Notification service
- Approval policy configuration and approval inbox
- Suppliers, categories, UOMs, items, and conversions

### Release 2 — Purchase-to-Order
- PR create, submit, return, reject, approve
- Reminders, delegation, and escalation
- Supplier quote capture and comparison
- PO create and approval foundation
- PO issue/send, amendment, and cancellation controls
- Purchasing dashboards and exports

### Release 3 — Receive-to-Stock
- Receiving Report against issued PO
- Partial receipt, rejection, discrepancy evidence
- Immutable inventory ledger and balance inquiry
- PO fulfillment updates

### Release 4 — Transfer and Count Controls
- Transfer request, source dispatch, destination receipt
- Transfer discrepancy handling
- Full, cycle, spot, and high-value counts
- Variance approval and posting

### Release 5 — Wastage, Adjustment, and Hardening
- Wastage report and approval
- Stock adjustment, reversal, and backdate control
- Exception dashboard
- End-to-end UAT, migration rehearsal, security review, pilot release

---

## 6. Epic Acceptance Criteria

## Pending Controlled Evidence Upload Slice

**Status:** Pending controlled implementation; current workflows may capture evidence references, but binary file upload is not yet the production evidence system.

Build a shared Evidence Attachment service before treating uploaded files as release-ready evidence for Phase I workflows. The slice should cover:

- private file storage strategy for local/demo use, with a later production object-storage path;
- evidence metadata tables with tenant, company, brand/location where applicable, source entity type, source entity ID, category, filename, MIME type, file size, checksum, uploaded-by, status, and timestamps;
- allowlisted file types for photos, PDFs, documents, and CSV/XLSX only where the workflow needs them;
- per-file and per-record size limits;
- server-side authorization before upload, view, download, archive, or supersede;
- audit events for upload, view/download, archive, supersede, denied access, and validation failure;
- no hard delete for evidence used by controlled records;
- configurable required-evidence policy by workflow, reason code, threshold, and exception type;
- reusable upload/list/download/archive UI for transaction detail pages;
- UAT proof for happy path, invalid file type, oversized file, unauthorized download, archive/supersede reason, and audit trail.

Priority Phase I integration points:

1. Emergency Purchase Requests
2. Supplier quotation evidence and supplier communications
3. Receiving discrepancy photos/documents
4. Wastage reports
5. Stock adjustments and opening balances
6. Stock counts and variance support documents
7. PO issue/re-send and closure evidence

Until this slice is implemented, evidence fields remain references to external proof, not ERP-managed uploaded files.

### Epic A — Organization and Access Foundation

**Acceptance criteria**
- Company → Brand → Location hierarchy is supported.
- Branch, warehouse, Head Office, commissary, project site, and pop-up are supported location types.
- User visibility is constrained by role and scope, both server-side and in the UI.
- A user can hold multiple roles and scopes with effective dates.
- Deactivating master data blocks new use but retains history.
- Permission and scope changes are audited.
- Direct URL / API access to another branch is denied, not merely hidden.

### Epic B — Approval Engine

**Implemented foundation subset**
- Implemented Phase I approval-backed workflows create scoped in-app assignment notifications for the first actionable step.
- An intermediate approval does not finalize the source document: the source remains `PENDING_APPROVAL`, while the current step is completed, the next step is atomically activated, current recipient eligibility is revalidated, and only eligible next-step approvers are notified.
- A final approve, return, or reject decision atomically records the terminal workflow state and notifies the requester or responsible owner. Stable source-event keys protect retried notification writes from duplication.
- Scheduled reminder/escalation delivery, external channels, preferences, and broader non-approval fanout remain deferred and are not required to complete the current transaction.

**Acceptance criteria**
- Approval rules can evaluate transaction type, amount, branch, department, category, urgency, and budget status.
- Selected policy is deterministic and snapshotted at submission.
- Self-approval is blocked.
- Reject and return require remarks.
- Delegation retains original and delegate approver identities.
- Reminder and escalation timing is configurable.
- Material re-submission produces new or superseded approval instance, never silent alteration.

### Epic C — Master Data

**Acceptance criteria**
- Supplier, item, category, UOM, and conversion codes are unique within correct company scope.
- Inactive suppliers / items cannot be used for new routine transactions.
- UOM conversions validate before use.
- Base UOM cannot be casually changed after transaction use.
- Category defaults for expiry, lot, and evidence can be overridden at item level.
- Material master-data edits are audited.

### Epic D — Purchase Requests

**Acceptance criteria**
- PR requires location, department, cost center, purpose, required date, request type, and at least one line.
- PR line validates item / authorized free text, quantity, UOM, and target location.
- Branch user cannot create PR for unassigned branch.
- Approved PR tracks remaining convertible quantity.
- Status follows controlled transitions.
- Lists filter and export required business fields.
- Attachments and comments follow scope controls.

### Epic E — Supplier Quote and Comparison

**Acceptance criteria**
- Multiple supplier quotes can be recorded for approved PR lines.
- Quote stores supplier, UOM, price, availability, lead time, terms, and document attachment.
- Comparison highlights lowest evaluated cost without forcing it.
- Single-source and non-lowest selection require reason.
- Conditional / suspended supplier use blocks or follows explicit exception approval.

### Epic F — Purchase Orders

**Implemented foundation subset**
- Draft PO creation is available from an approved quotation recommendation only.
- Draft PO records preserve PR, quotation request, recommendation, selected supplier quote, supplier, delivery location, line snapshots, totals, creator, and audit event.
- Draft POs can be submitted to the configured PO approval workflow, approved, returned to draft, or rejected to cancelled with audit history.
- Approved POs can be issued/sent to the supplier with method, recipient/reference, remarks, and audit history.
- Draft, approved, and issued POs can be cancelled before any Receiving Report exists or received quantity is posted. Cancellation requires reason, requires supplier notice evidence or explanation for issued POs, clears open line quantities through `cancelledQty`, and creates no inventory movement.
- Approval-backed partial remaining-balance closure is implemented for partially received POs. Bounded pre-receiving amendment is implemented for issued POs with no receiving activity: quantity, unit price, line note, and expected delivery date changes require supplier notice evidence/explanation, approval, audit history, and temporarily block receiving through `AMENDMENT_PENDING`. Full post-receiving amendment and supplier/location/line-add/delete/substitution/payment-term amendment remain deferred controlled transitions.

**Acceptance criteria**
- PO carries PR and quote lineage.
- PO validates supplier, delivery location, quantity, price, and totals.
- Configured PO approvals apply before issue/send.
- Issued PO is immutable except controlled amendment or cancellation.
- PO status updates from receiving outcome.
- Pre-receiving cancellation is server-authorized, audited, excludes POs with active receiving records, and does not change inventory balances.
- Lists filter/export by supplier, location, status, expected date, amount, and approver.

### Epic G — Receiving

**Implemented foundation subset**
- Receiving starts only after PO issue/send (`ISSUED` PO).
- Quantity-only inventory ledger and balance-cache foundation is available and supports posted receiving, receiving reversal, transfer dispatch/receipt, wastage posting/reversal, and stock adjustment posting/reversal.
- Receiving Report draft capture and posting from issued or partially received POs are implemented.
- Posting creates immutable receipt movements for accepted quantities, updates balance cache, increments PO line received quantities, and updates PO fulfillment status.
- Read-only Stock Balances inquiry displays posted balance-cache rows for the current authorized location.
- Read-only Inventory Ledger inquiry displays recent source-linked movements for the current authorized location.
- Receipt reversal and discrepancy evidence-reference enforcement are implemented. Binary attachment upload, broader non-approval notification fanout, scheduled or external delivery, partial line reversal, and advanced inspection approvals remain deferred controlled transitions. The bounded in-app approval notification behavior is defined under Epic B.

**Acceptance criteria**
- Receiver creates RR from issued PO without retyping core data.
- RR records ordered, received, accepted, rejected, UOM, lot/expiry, and discrepancy data.
- Only accepted quantity stocks in.
- Posted receipt cannot be edited; authorized full-document reversal writes linked `REVERSAL` movements, restores PO received quantity/status, and preserves original discrepancy reason/evidence reference.
- PO quantities and status update automatically.
- Receipt posting creates source-linked immutable stock movements.

### Epic H — Inventory Ledger

**Acceptance criteria**
- Every stock event creates a source-linked ledger movement.
- Item/location balance reconciles to ledger.
- Movement history shows source, actor, date, quantity, base UOM, location, and reason.
- Negative stock is blocked by default.
- Lot/expiry-tracked items maintain those identifiers.
- Initial Stock Balances inquiry is available by current authorized location with item, code, storage, and lot search.
- Initial Inventory Ledger inquiry is available by current authorized location with item, lot, source, and movement-type search.
- Broader export and exception reporting by branch, item, category, lot/expiry, movement type, and exception remain future reporting work.

### Epic I — Transfers

**Implemented foundation subset**
- Transfer header and line records capture source location, destination location, requester, purpose, requested quantity, prepared/dispatched/received/discrepancy quantity rollups, and receipt-event line history.
- Transfer list/detail/create supports `DRAFT`, `REQUESTED`, `DISPATCHED`, `PARTIALLY_RECEIVED`, `DISPUTED`, `RECEIVED`, `CLOSED`, and `CANCELLED` states.
- Transfer request submission and cancellation are audited and non-destructive.
- Transfer dispatch from the authorized source location posts deterministic `TRANSFER_OUT` movements, updates source balances through the ledger service, and records audit in one transaction.
- Exact or partial destination receipt from the authorized destination location creates receipt-event records, posts deterministic `TRANSFER_IN` movements for accepted quantities only, updates destination balances through the ledger service, blocks the dispatcher from receiving the same transfer, and records audit in one transaction.
- Transfer receipt discrepancies require reason and evidence reference; rejected, damaged, and short/discrepant quantities do not increase destination stock.
- Final discrepancy settlement is implemented as a non-posting, permissioned, audited closure action for disputed transfers. Alerts, dispatch reversal, replacement-transfer automation, adjustment/wastage linkage, and finance effects remain future controlled transitions. Transfer export includes receipt-event line detail for partial/disputed receipt reporting.

**Acceptance criteria**
- Transfer has distinct source and destination.
- Dispatch reduces source only after actual confirmation by a source-scoped user.
- Receipt increases destination only after exact destination confirmation by a destination-scoped user who did not dispatch the same transfer.
- Receipt increases destination only after independent confirmation.
- Requested, approved, dispatched, received, and discrepancy quantities are preserved.
- Overdue and disputed transfers alert responsible users.
- Source and destination movements share correlation linkage.

### Epic J — Counts

**Implemented foundation subset**
- Physical count sessions can be scheduled for the user's current authorized inventory location.
- Starting a count snapshots current balance rows with system quantity, UOM, lot, and expiry context.
- Blind count entry captures counted quantities and calculates variance for review without exposing system quantity to non-review users.
- Submitted counts can be reviewed by a different authorized reviewer; mutable recount requests are disabled until the immutable attempt recovery contract is implemented. The count creator and users who entered count lines cannot self-review.
- Count actions are audited and do not create inventory movements or update stock balances.
- Count export includes line-level item, lot/expiry, counted quantity, reviewer, and generated-adjustment context; system quantity and variance fields remain reviewer-only to preserve blind-count controls.
- Reviewed count variances are intended to generate one linked `COUNT_VARIANCE` Stock Adjustment from non-zero variance lines after the immutable recount recovery and lineage gates close; the generation action is currently disabled. Approval, posting, and reversal then follow the controlled Stock Adjustment workflow. Direct count-variance movement posting, materiality thresholds, evidence enforcement, and backdate controls remain future controlled transitions.

**Acceptance criteria**
- Count captures location, count type, cutoff / freeze approach, counters, and scope.
- Blind count is available by default.
- System calculates quantity variance for review; value variance remains future costing/reporting work.
- Material variance requires reason and approval, with stock-count self-review blocked before a linked adjustment is generated.
- Recount preserves original evidence.
- Reviewed count variances are intended to generate one linked `COUNT_VARIANCE` Stock Adjustment from non-zero variance lines after the immutable recount recovery and lineage gates close; generation is currently disabled. The generated adjustment must be approved and separately posted before source-linked stock movements are created.

### Epic K — Wastage and Adjustment

**Implemented foundation subset**
- Wastage Reports can be created for the user's current authorized inventory location with item, positive quantity, reason code, evidence reference, lot/expiry context, and estimated value.
- Wastage Reports can be submitted into the approval engine, approved/returned/rejected, legacy reviewed, posted after approval, reversed after posting, cancelled before posting, viewed, audited, and exported.
- Wastage approval is non-posting; the separate Post Wastage action creates `WASTAGE_OUT` movements and updates inventory balances through the inventory ledger service.
- Backdating, configurable evidence thresholds, opening balances, direct `COUNT_VARIANCE_*` posting, and stock-adjustment reclassification remain deferred controlled transitions.
- Manual Stock Adjustments can be submitted into the approval engine, approved/returned/rejected, posted after approval, reversed after posting, cancelled before approval completion, viewed, audited, and exported.
- Stock Adjustment approval is non-posting; the separate Post Adjustment action creates `ADJUSTMENT_IN` or `ADJUSTMENT_OUT` movements and updates inventory balances through the inventory ledger service.

**Acceptance criteria**
- Wastage captures type, reason, item, quantity, location, evidence, and value.
- Report cannot post before required approval.
- Adjustment requires type, reason, evidence, quantity, and value impact.
- Manual adjustments are distinguishable from count-derived corrections.
- Posted records use reversal, not direct edit.
- Backdated correction is controlled and reportable.

### Epic L — Dashboard, Export, and Audit

**Current implementation**
- Operations Dashboard is backed by authoritative Phase I services for the selected location, including approval inbox, PR/PO workload, amendment-pending PO visibility, receiving variance, transfer follow-up, count variance, wastage/adjustment exception source links, and inventory ledger reconciliation variance source links.
- Dashboard is read-only and links to source records or source lists; it does not approve, receive, dispatch, post, reverse, or replace detailed module records.
- Reports page is backed by a permission-gated catalog of implemented source pages and scoped CSV export routes, including PRs, quotes, POs, receiving, stock balances, ledger, transfers, counts, wastage, stock adjustments, approval inbox view, and admin audit export.
- All-location aggregation, role-specific executive dashboards, and Phase 1.5 project metrics remain future hardening until explicit scope expansion and project visibility controls are implemented.

**Acceptance criteria**
- Dashboard respects user scope.
- Major operational lists export to CSV / Excel-compatible format.
- Audit logs are searchable by entity, actor, action, date, and correlation ID.
- Attachments remain access-controlled.
- Screens visibly show location, status, requester, date, current approver, and next action.

---

## 7. Non-Functional Requirements

### Security
- Authentication required for all non-public access.
- Server-side authorization on every read and write.
- Tenant / company scoping enforced in every query.
- No plaintext passwords or tokens.
- Sensitive documents require scope-based access checks.
- High-risk actions are audited.
- Validation blocks invalid quantity, amount, scope, or status change.
- Rate limits and logs exist for authentication and sensitive actions.

### Data integrity
- Posting is transactional: document status, ledger movement, balance cache, and audit event succeed or fail together.
- Optimistic locking or equivalent handles concurrent edits.
- Failed in-app notification or manual reminder scan does not undo posted operational transaction; follow-up is retryable without queueing dependency.
- Backup and restore procedure exists before pilot.
- Reconciliation check compares movement ledger with balance cache.

### UX and mobile
- Branch workflows work on tablet portrait and common mobile widths.
- Key context—company, branch, status, requester, date, approver, next action—is visible without excessive clicks.
- Empty, loading, error, rejected, returned, and permission-denied states are designed.
- Important actions confirm intent and require reason where applicable.
- Forms minimize repetitive typing.

### Observability
- Errors expose correlation IDs for support.
- Admin logs capture notification/manual scan failures and authorization-denied events where implemented.
- Audit and event data can be exported for investigation.

---

## 8. Migration Readiness

Before pilot:
1. Choose a limited initial company, warehouse, and one pilot branch.
2. Clean company, brands, locations, departments, cost centers, active users, suppliers, categories, UOMs, conversions, items, opening balances, and approval policies.
3. Assign a business data owner for each import domain.
4. Load staging environment first.
5. Validate duplicates, codes, status, UOM conversions, and required fields.
6. Rehearse opening-stock import and stock reconciliation.
7. Freeze or tightly control manual master-data changes during final cutover.
8. Preserve legacy files read-only for historical reference after cutover.

---

## 9. Minimum UAT Scenarios

1. Standard branch PR approved and converted to PO.
2. PR returned, corrected, and resubmitted.
3. Single-source purchase with justification.
4. PO amendment after issue.
5. Direct branch delivery with partial receipt and damage.
6. Full receipt and PO closure.
7. Warehouse-to-branch transfer with short receipt dispute.
8. Branch-to-branch transfer.
9. Full count with material variance and recount.
10. Wastage with photo and high-value escalation.
11. Manual stock adjustment with Finance approval.
12. Same-day correction through authorized reversal or adjustment; backdated correction remains a deferred controlled transition.
13. Delegated approver while primary approver is unavailable, where delegation is configured for the pilot route.
14. Unauthorized attempt to view another branch’s transaction.
15. Ledger-to-balance reconciliation check.

---

## 10. Pilot and Release Gates

Gate evidence must be recorded in `docs/core/07-quality/PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md`; this backlog defines acceptance criteria, but it is not a completed UAT record.

### Gate 1 — Build complete
- Critical epics implemented in test environment.
- Unit, integration, and permission tests cover critical paths.
- Security and scope tests pass.

### Gate 2 — UAT ready
- Master data loaded in staging.
- Test scripts complete.
- Critical defects resolved.
- Pilot-user guidance available.

### Gate 3 — Pilot go-live
- Pilot branch / warehouse roles assigned.
- Opening inventory reconciled.
- Approval matrix configured and proven.
- Support, backup, and rollback plan documented.

### Gate 4 — Scale rollout
- Pilot completes end-to-end PR, PO, receiving, transfer, count, wastage, and adjustment cycles.
- Inventory ledger reconciles to balance.
- No unresolved critical permission or posting defect.
- Users complete core tasks without persistent workaround.
- Management considers key reports reliable.

---

## 11. Definition of Done for Any Feature

A Phase I feature is done only when:
- functional acceptance criteria pass;
- role and scope controls are server-enforced;
- required audit events exist;
- validation, error, empty, loading, rejected, and returned states exist;
- desktop, tablet, and mobile views are checked;
- filters and exports are present where required;
- tests are added or updated;
- documentation is updated;
- QA finds no critical regression;
- business owner signs off in UAT.
