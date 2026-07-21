# OGFI ERP — Roles and Permissions

**Document Type:** Access Control and Permission Design  
**System:** OGFI ERP — Multi-Brand, Multi-Branch Restaurant Operations Platform  
**Applies To:** Phase I foundation and forward-compatible permissions for all future phases  
**Status:** Working Baseline  
**Last Updated:** July 21, 2026

---

## 1. Purpose

This document defines the standard roles, scope rules, permission actions, access boundaries, and control principles for the OGFI ERP.

It is designed for a multi-brand, multi-branch F&B company with centralized Head Office functions, a main warehouse, possible commissary operations, and future expansion projects.

The objective is to ensure that users can complete their work quickly while preventing unauthorized access, hidden approvals, uncontrolled stock movements, improper financial actions, and loss of accountability.

---

## 2. Core Access Principles

### 2.1 Role defines capability; assignment defines scope

Every user has one or more roles. A role defines **what the user can do**. A scope assignment defines **where and for whom the user can do it**.

Examples:

- A Branch Manager can create and approve branch-level records only for assigned branches.
- An Operations Manager can review operational data for all assigned brands and branches.
- A Purchasing Officer can process procurement records across all assigned sourcing scopes.
- An Executive can see all company-wide data, but approval authority can still be configured separately.

### 2.2 Least privilege by default

Users receive the minimum access needed to perform their role. Elevated permissions are assigned only when justified by function and scope.

### 2.3 Segregation of duties

The ERP should prevent a single user from completing a high-risk end-to-end transaction without an independent control.

Examples:

- A requester should not approve their own request.
- A purchase order creator should not be the sole approver of the same PO.
- A sender should not confirm receipt of their own transfer.
- A person who records a stock adjustment should not be the only approver of that adjustment.
- A user who manages supplier records should not be able to release supplier payments without finance approval.

### 2.4 Scope-based visibility

Data access may be scoped by one or more of the following:

- Company
- Brand
- Branch
- Warehouse
- Commissary / central kitchen
- Department
- Cost center
- Project
- Transaction type
- Assigned team or direct reports

### 2.5 No destructive deletion for controlled records

Important records must be cancelled, voided, reversed, archived, or deactivated — never permanently deleted by ordinary users.

### 2.6 Auditability by default

The system must log material actions including create, edit, submit, approve, reject, cancel, reopen, receive, transfer, adjust, export, role change, and configuration change.

---

## 3. Permission Action Vocabulary

The ERP should use a consistent permission action set across modules.

| Action | Meaning |
|---|---|
| View | Open and read records within the user’s scope. |
| View Confidential | View sensitive data such as cost, margin, salary, payment, or company-wide figures. |
| Create | Start a new draft record. |
| Edit Draft | Change an unsubmitted record created by the user or assigned team. |
| Edit Submitted | Modify a submitted record only through an approved amendment or return-for-revision path. |
| Submit | Send a draft into the approval or operational workflow. |
| Approve | Approve when assigned by the approval engine. |
| Reject | Reject when assigned by the approval engine. |
| Return for Revision | Send a transaction back to the requester with comments. |
| Cancel | Cancel a valid record before final completion, subject to policy. |
| Reopen | Reopen a closed or rejected record where permitted. |
| Receive | Confirm delivery or receipt of stock, goods, or services. |
| Issue / Transfer | Dispatch stock from one approved location to another. |
| Confirm Transfer | Confirm stock received at destination. |
| Count | Enter physical inventory count results. |
| Adjust | Create a stock adjustment request; not necessarily approve it. |
| Verify | Verify completion, variance, evidence, or operational closure. |
| Export | Export permitted data to Excel, CSV, or PDF. |
| Configure | Manage settings, templates, master data, or workflow rules. |
| Administer | Manage users, roles, scopes, security, and system-level configuration. |

Current Phase I scaffold permission keys for the PO foundation:

| Permission key | Meaning |
|---|---|
| `core.tenant_role_administer` | Administer the tenant-owned role catalog and tenant-global role assignments. Required for role overview/details, role creation, direct grants/deactivation, sensitive-role request/review, role-permission updates, and onboarding when `initialRoleId` is supplied. For target-user actions, the target must also be an active/effective member of the operator's selected company. This permission does not make a role assignment company-bound or grant access to company business records. |
| `purchasing.purchase_order.view` | View scoped Purchase Orders and their PR/quote lineage. |
| `purchasing.purchase_order.create` | Create a draft Purchase Order from an approved quotation recommendation. This does not grant submit, approval, issue/send, amendment, receiving, or inventory posting authority. |
| `purchasing.purchase_order.submit` | Submit a scoped draft Purchase Order into the configured approval flow. This does not grant approval, issue/send, receiving, or inventory posting authority. |
| `purchasing.purchase_order.approve` | Approve, return, or reject a scoped pending Purchase Order assigned through the approval workflow. Self-approval and out-of-scope approval remain prohibited. |
| `purchasing.purchase_order.issue` | Record supplier issue/send or re-send for an approved or issued PO. This does not grant approval, receiving, or inventory posting authority. |
| `purchasing.purchase_order.cancel` | Cancel a scoped draft, approved, or issued PO before any Receiving Report exists. Reason is required, issued PO supplier notice evidence is required or must be explained, and no inventory posting authority is granted. |
| `purchasing.purchase_order.close_remaining` | Request approval-backed closure of remaining undelivered quantities on a scoped partially received Purchase Order. This does not grant approval, receiving, or inventory posting authority. |
| `purchasing.purchase_order.amend` | Request approval-backed bounded amendment of a scoped issued PO before receiving starts. This covers same-line quantity, unit price, line note, and expected delivery date changes only; it does not grant approval, receiving, inventory posting, supplier/location substitution, or post-receiving amendment authority. |
| `inventory.balance.view` | View posted inventory balance-cache rows for the user's current authorized location. This is read-only and does not grant receiving, transfer, count, wastage, or adjustment authority. |
| `inventory.ledger.view` | View source-linked inventory movements for the user's current authorized location. This is read-only and does not grant stock posting authority. |
| `inventory.transfer.view` | View scoped transfer requests where the user's current authorized location is the source or destination. |
| `inventory.transfer.create` | Create a non-posting transfer request into the user's current authorized destination location. This does not grant dispatch, receipt, or stock-posting authority. |
| `inventory.transfer.submit` | Submit a scoped draft transfer request for operational review. This does not create `TRANSFER_OUT` or `TRANSFER_IN` movements. |
| `inventory.transfer.cancel` | Cancel a scoped draft or requested transfer request with reason while preserving audit history. |
| `inventory.transfer.dispatch` | Dispatch a requested transfer from the user's current authorized source location, creating immutable `TRANSFER_OUT` movements. This does not grant destination receipt authority. |

Phase II recipe and menu-costing permission boundary:

- Current implementation may grant read/export permissions for recipe costing and food-cost analysis, controlled recipe draft/revision/archive permissions, controlled recipe-version workflow permissions, and controlled menu-price decision permissions.
- Broad ingredient add/remove editing and bulk maintenance permissions remain staged until their implementation slice is explicitly approved.
- Recipe workflow permissions must be separate from confidential costing view/export permissions, and cost-impacting approvals must enforce no self-approval.
| `inventory.transfer.receive` | Receive a dispatched transfer into the user's current authorized destination location, creating immutable `TRANSFER_IN` movements. This does not grant source dispatch authority. |
| `inventory.transfer.discrepancy.settle` | Settle a disputed transfer at the authorized destination location with reason and evidence reference. This is a non-posting audit closure and does not grant dispatch, receipt, reversal, adjustment, wastage, or finance authority. |
| `inventory.stock_count.view` | View scoped physical count sessions for the user's current authorized location. This is read-only and does not grant count entry, review, or variance posting authority. |
| `inventory.stock_count.create` | Schedule scoped physical count sessions and define count type, blind-count flag, and cutoff/freeze intent. This does not post stock variance. |
| `inventory.stock_count.enter` | Start a scoped count, snapshot current balance rows, and enter blind counted quantities. This does not expose system quantity unless review permission is also granted. |
| `inventory.stock_count.submit` | Submit a counted session for review, locking ordinary count entry. This does not approve or post variance. |
| `inventory.stock_count.review` | Review submitted count variances and mark reviewed or request recount. This does not post `COUNT_VARIANCE_*` movements or create a stock adjustment by itself. |
| `inventory.stock_count.cancel` | Cancel an unreviewed count session with reason while preserving audit history. |
| `inventory.wastage.view` | View scoped wastage reports for the user's current authorized inventory location. This is read-only and does not grant approval or stock posting authority. |
| `inventory.wastage.create` | Create scoped draft wastage reports with item, quantity, reason, evidence reference, lot/expiry context, and estimated value. This does not post `WASTAGE_OUT` movements. |
| `inventory.wastage.submit` | Submit scoped draft or returned wastage reports into the approval engine. This creates an approval instance but does not post stock. |
| `inventory.wastage.approve` | Approve, return, or reject assigned Wastage Report approvals. Approval is non-posting and blocks self-approval. |
| `inventory.wastage.post` | Post approved Wastage Reports for the user's authorized location. This creates immutable `WASTAGE_OUT` movements and updates balances through the inventory ledger service. |
| `inventory.wastage.reverse` | Reverse posted Wastage Reports for the user's authorized location with reason. This creates linked `REVERSAL` movements and preserves the original wastage history. |
| `inventory.wastage.review` | Review, return, or reject legacy submitted wastage reports. This is a non-posting review path and blocks self-review. |
| `inventory.wastage.cancel` | Cancel scoped draft, submitted, pending-approval, or returned wastage reports with reason while preserving audit history. |
| `inventory.receiving.view` | View scoped Receiving Reports for the user's current authorized receiving location. |
| `inventory.receiving.create` | Create draft Receiving Reports from issued or partially received Purchase Orders for the user's current authorized receiving location. |
| `inventory.receiving.post` | Post draft Receiving Reports, creating immutable receipt movements for accepted quantities. |
| `inventory.receiving.reverse` | Reverse a posted Receiving Report as a full-document correction. Requires scoped access, reason, linked reversal movements, and PO received-quantity restoration. |
| `restaurant.recipe.view` | View scoped recipe versions, ingredient lines, menu-price basis, and food-cost analysis without mutating recipes or menu prices. |
| `restaurant.recipe.manage` | Create controlled draft recipes and revision drafts before submission. This does not publish or mutate historical published recipe versions. |
| `restaurant.recipe.submit` | Submit draft recipe versions into controlled review workflow. |
| `restaurant.recipe.review` | Review submitted recipe versions and return or reject them with required reason. |
| `restaurant.recipe.approve` | Approve cost-impacting recipe versions before publication. This blocks self-approval where approval is required. |
| `restaurant.recipe.publish` | Publish approved recipe versions as the effective costing basis with reason, evidence, audit, and concurrency controls. |
| `restaurant.recipe.archive` | Archive recipes through controlled soft archive without hard deletion and without mutating menu prices, inventory, sales, or finance records. |
| `restaurant.menu_cost.view` | View scoped menu item cost, margin, and theoretical-vs-actual food-cost analysis. |
| `restaurant.menu_price.decide` | Review, approve, apply, reject, or cancel controlled menu-price decision records. This creates effective-dated menu-price records only through approved workflow. |
| `restaurant.branch_operations.view` | View scoped branch opening, closing, midshift checklist records, sign-off status, and exceptions. |
| `restaurant.branch_operations.create` | Create scoped branch checklist source records with structured lines, results, severity, evidence, and audit history. This does not review checklists or mutate inventory, incidents, maintenance, approvals, or finance records. |
| `restaurant.branch_operations.review` | Review scoped submitted or manager-review branch checklists. This does not create or close incidents, maintenance tickets, inventory movements, approvals, or finance records. |
| `restaurant.branch_operations.correct` | Request or approve controlled corrections to submitted branch checklist records with reason, evidence where required, and audit history. |
| `restaurant.food_safety.view` | View scoped food-safety logs, readings, compliance exceptions, corrective actions, and evidence references. |
| `restaurant.food_safety.create` | Record scoped food-safety source logs with structured readings, result, severity, corrective action, evidence, and audit history. This does not create incidents, post wastage, change stock, or review logs. |
| `restaurant.food_safety.review` | Review scoped submitted or exception-review food-safety logs. This does not create incidents, post wastage, change stock, or close compliance actions automatically. |
| `restaurant.food_safety.correct` | Request or approve controlled corrections to submitted food-safety logs with reason, evidence where required, and audit history. |
| `restaurant.incident.view` | View scoped operational incidents, owners, severity, due dates, corrective actions, source references, and evidence. |
| `restaurant.incident.create` | Log scoped operational incidents with category, severity, summary, owner context, corrective action, due date, and evidence reference. This does not resolve incidents, post inventory, approve exceptions, or create maintenance tickets automatically. |
| `restaurant.incident.resolve` | Resolve scoped operational incidents with resolution date, corrective action, and evidence. This does not reverse inventory, close food-safety logs, complete maintenance tickets, or bypass source-record controls. |
| `restaurant.incident.correct` | Request or approve controlled corrections to operational incident records with reason, evidence where required, and audit history. |
| `restaurant.maintenance.view` | View scoped maintenance tickets, asset area, priority, downtime, target due date, completion status, and evidence. |
| `restaurant.maintenance.create` | Create scoped equipment or facility maintenance tickets with asset, priority, description, downtime estimate, due date, corrective action, and evidence reference. This does not resolve incidents or post stock impact automatically. |
| `restaurant.maintenance.complete` | Complete scoped maintenance tickets with completion date, downtime, corrective action, and evidence. This does not resolve linked incidents or mutate source operational records automatically. |
| `restaurant.maintenance.correct` | Request or approve controlled corrections to maintenance ticket records with reason, evidence where required, and audit history. |

Phase III finance permission boundary:

- Current implementation grants read-side finance visibility and guarded subworkspace access only.
- Finance permissions do not grant automatic journal posting, payment release, bank reconciliation mutation, accounting period lock, supplier settlement, PO/receiving mutation, inventory mutation, or official-books production authority unless the corresponding controlled workflow is implemented, tested, and approved.
- Finance reads authoritative source records from procurement and receiving. The source workflow remains the source of truth.
- Payment preparation, payment approval, payment release, journal review, and period close must remain separately permissioned and auditable.

| Permission key | Meaning |
|---|---|
| `finance.view` | View the guarded Finance Control Center and source-linked finance readiness summaries. This does not grant confidential posting, payment, reconciliation, or period-close authority. |
| `finance.configure` | Configure finance controls when implemented. This is sensitive and does not by itself post journals or release payments. |
| `finance.ledger.view` | View the guarded General Ledger workspace and future journal records. Current guarded implementation does not create, post, reverse, or edit journals. |
| `finance.payables.view` | View Accounts Payable source chains, supplier invoice readiness, and PO/receiving match context. This does not capture invoices, approve payments, or change PO/receiving status. |
| `finance.supplier_credit.create` | Record draft supplier credit notes against original AP invoices. This does not apply credits, reduce invoice balances, settle AP, release cash, or post journals. |
| `finance.supplier_credit.submit` | Submit draft supplier credit notes for application review. This moves the credit into a pending-application state only; it does not reduce AP balances, settle suppliers, release cash, or post journals. |
| `finance.supplier_credit.cancel` | Cancel draft or pending-application supplier credit notes with reason and audit history. This does not mutate the original AP invoice or settlement records. |
| `finance.payment_request.create` | Prepare controlled payment requests when implemented. This does not approve or release payment. |
| `finance.payment_request.approve` | Approve controlled payment requests when assigned and permitted by segregation rules. This does not release payment. |
| `finance.payment.release` | Release approved payments when implemented with configured cash/bank controls. This must not be granted to users who can approve their own payment request. |
| `finance.cash_deposit.create` | Declare branch cash deposit evidence for finance review. This does not match statements, reconcile bank/cash, mutate bank balances, settle payments, or post journals. |
| `finance.reconciliation.view` | View bank/cash reconciliation workspace and exception context. This does not import statements, match, clear, or mutate reconciliation records. |
| `finance.reconciliation.match` | Match controlled cash/bank source records to imported statement lines. Current guarded implementation supports source-linked payment-release matching only; it does not call bank APIs, settle AP, mutate bank balances, or post journals. |
| `finance.period_close.manage` | Manage accounting period close readiness, close-packet completion, and sensitive lock/reopen approval actions. Hard lock and reopen actions require approval-instance routing and remain auditable. |

---

## 4. Standard Scope Levels

| Scope Level | Typical Use |
|---|---|
| Platform | Reserved for future multi-company SaaS administration. Not part of ordinary OGFI access. |
| Company | Company-wide access across all brands, branches, warehouses, and projects. |
| Brand | Access to one or more assigned brands. |
| Branch | Access limited to named restaurant branches. |
| Warehouse / Commissary | Access limited to assigned stock locations. |
| Department | Access to department-owned workflows and data. |
| Project | Access limited to assigned expansion projects. |
| Own Records | Access only to records created by the user or assigned to them. |

A user may hold multiple scope assignments at the same time.

---

## 5. Standard Roles

### 5.1 Executive and Management Roles

| Role | Primary Purpose | Default Scope |
|---|---|---|
| CEO / Executive | Strategic oversight, final approvals, consolidated management reporting | Company |
| General Manager | Cross-functional operational control and management approvals | Company or assigned brands |
| Operations Manager | Branch operational performance, inventory control, incidents, compliance | Assigned brands / branches |
| Accounting Manager | Financial control, payment review, budget monitoring, reporting | Company |
| Finance Officer | Finance processing, expense and payment workflow support | Assigned company / departments |
| Purchasing Manager | Procurement governance, supplier control, PO quality and purchasing performance | Company or assigned brands |
| Purchasing Officer | Process PRs, quotations, POs, supplier coordination | Assigned purchasing scope |
| Warehouse Manager | Warehouse operations, stock transfer oversight, inventory control | Assigned warehouses / branches |
| Project Manager | Expansion project delivery, timelines, readiness and issue tracking | Assigned projects |
| Department Head | Department workflow ownership and departmental approvals | Assigned department / scope |

### 5.2 Branch and Operational Roles

| Role | Primary Purpose | Default Scope |
|---|---|---|
| Branch Manager | Full branch operational control, first-level approvals, issue resolution | Assigned branch(es) |
| Assistant Restaurant Manager | Branch support, controlled operational approvals and follow-up | Assigned branch(es) |
| Restaurant Supervisor | Daily branch operations, checklist completion, incident and request initiation | Assigned branch(es) |
| FOH Supervisor | Front-of-house operational tasks and incidents | Assigned branch(es) |
| BOH Supervisor | Kitchen operational tasks, consumption issues, waste declarations | Assigned branch(es) |
| Storekeeper / Inventory Custodian | Receiving, storage, transfer, stock counts, inventory records | Assigned branch / warehouse |
| Restaurant Accountant | Branch expense documentation, cash-related records, finance support | Assigned branch(es) |
| Cashier | Limited operational and cash-related input only | Assigned branch |
| Kitchen Staff | Controlled task submissions such as wastage or requisition requests | Assigned branch |
| Service Crew | Limited own-request and operational checklist access | Assigned branch |

### 5.3 Control and System Roles

| Role | Primary Purpose | Default Scope |
|---|---|---|
| IT Administrator | User administration, support, configuration support, security administration | Company; no default financial approval authority |
| Auditor | Read-only inspection of records, audit trails, and compliance evidence | Assigned company / brand / branch scope |
| System Administrator | Restricted technical administration for production operations | Platform or company; no business approval authority by default |

---

## 6. Role Separation Rules

The following defaults should be enforced unless a formally approved exception is configured:

1. Requesters cannot approve their own request.
2. A user cannot be both the only sender and only receiver of the same stock transfer.
3. A user cannot approve their own stock adjustment.
4. A user cannot be the sole creator and final approver of a purchase order.
5. A user cannot approve their own PO remaining-balance closure request; the PO creator, PR requester, and quote preparer are also blocked from approving that closure.
6. A user cannot both maintain a supplier’s banking/payment data and approve its payment.
7. IT Administrators cannot access confidential finance or HR data unless explicitly granted a temporary, logged support role.
8. Auditors are read-only and cannot approve, amend, or close operational transactions.
9. Emergency purchase workflows require post-transaction review by an independent approver.

---

## 7. Phase I Module Permission Matrix

Phase I covers the platform foundation, approvals, supplier master data, purchasing, receiving, inventory, transfers, wastage, physical counts, dashboards, notifications, and audit logs.

### 7.1 Legend

- **V** = View
- **C** = Create
- **E** = Edit Draft / permitted edit
- **S** = Submit
- **A** = Approve / reject when assigned by workflow
- **R** = Receive / confirm
- **T** = Transfer / issue
- **K** = Count / verify inventory
- **X** = Export
- **M** = Manage / configure
- **—** = No default access

### 7.2 Core Administration and Master Data

| Role | Users & Role Assignments | Branch / Brand / Department Setup | Supplier Master | Item Master / UOM / Categories | Approval Matrix | Audit Log |
|---|---:|---:|---:|---:|---:|---:|
| CEO / Executive | V | V | V | V | V | V/X |
| General Manager | V | V | V | V | V | V/X |
| Operations Manager | — | V | V | V | — | V/X |
| Accounting Manager | — | V | V | V | V | V/X |
| Purchasing Manager | — | V | C/E/M | V | — | V/X |
| Purchasing Officer | — | V | C/E | V | — | V |
| Warehouse Manager | — | V | V | C/E | — | V |
| Branch Manager | — | V (assigned branch only) | V | V | — | V (assigned branch only) |
| Storekeeper | — | V (assigned location only) | V | V | — | V (assigned location only) |
| IT Administrator | C/E/M | C/E/M | — | — | C/E/M | V/X |
| Auditor | V | V | V | V | V | V/X |

**Control note:** Supplier banking/payment details, confidential cost fields, and approval matrix configuration must be separately permissioned under `View Confidential` and `Configure` privileges.

### 7.3 Purchase Requests and Purchase Orders

| Role | Purchase Request | Quote Comparison | Purchase Order | Emergency Purchase | PO Cancellation / Amendment |
|---|---|---|---|---|---|
| CEO / Executive | V/A/X | V/A/X | V/A/X | V/A/X | V/A |
| General Manager | V/A/X | V/A/X | V/A/X | V/A/X | V/A |
| Operations Manager | V/C/E/S/A/X | V | V/A/X | V/C/E/S/A/X | V/A |
| Accounting Manager | V/A/X | V/A/X | V/A/X | V/A/X | V/A |
| Finance Officer | V/A/X | V | V | V/A/X | V |
| Purchasing Manager | V/C/E/S/A/X | C/E/S/A/X | C/E/S/A/X | V | C/E/S/A |
| Purchasing Officer | V/C/E/S | C/E/S | C/E/S | V | C/E/S (before final approval) |
| Warehouse Manager | V/C/E/S | V | V | V/C/E/S | V |
| Branch Manager | V/C/E/S/A | V | V | V/C/E/S/A | Request cancellation only; workflow approval required |
| Assistant Restaurant Manager | V/C/E/S | V | V | V/C/E/S | Request cancellation only |
| Supervisor / Storekeeper | V/C/E/S | V | V | V/C/E/S | Request cancellation only |
| Restaurant Accountant | V/C/E/S | V | V | V/C/E/S | Request cancellation only |
| Staff Requester | V/C/E/S (own records) | — | V (related records only) | V/C/E/S (own records) | Cancel own draft only |
| Auditor | V/X | V/X | V/X | V/X | V |

**Workflow note:** Approval permissions are not blanket access. The approval engine determines who can approve a specific record at a given step.

### 7.4 Receiving, Inventory, and Transfers

| Role | Receiving Report | Inventory Ledger | Stock Transfer Request | Issue / Dispatch | Receive / Confirm | Physical Count | Stock Adjustment | Wastage / Spoilage |
|---|---|---|---|---|---|---|---|---|
| CEO / Executive | V/A/X | V/X | V/A/X | — | — | V | V/A | V/A/X |
| General Manager | V/A/X | V/X | V/A/X | — | — | V | V/A | V/A/X |
| Operations Manager | V/A/X | V/X | V/C/E/S/A/X | — | — | V/A | V/C/E/S/A | V/C/E/S/A |
| Accounting Manager | V/A/X | V/X | V/A/X | — | — | V/A | V/A | V/A/X |
| Purchasing Manager | V/X | V | V | — | — | V | V | V |
| Purchasing Officer | V | V | V | — | — | — | — | — |
| Warehouse Manager | V/C/E/S/A/X | V/C/E/S/X | V/C/E/S/A/X | T | R | C/E/S/K | C/E/S | V/C/E/S |
| Storekeeper / Inventory Custodian | V/C/E/S | V/C/E/S | V/C/E/S | T | R | C/E/S/K | C/E/S | V/C/E/S |
| Branch Manager | V/A/X | V/X | V/C/E/S/A | T (where assigned) | R | C/E/S/K | C/E/S/A | V/C/E/S/A |
| Assistant Restaurant Manager | V | V | V/C/E/S | T (where assigned) | R | C/E/S/K | C/E/S | V/C/E/S |
| Supervisor | V | V | V/C/E/S | — | R | C/E/S/K | C/E/S | V/C/E/S |
| Restaurant Accountant | V | V | V | — | — | V | V | V |
| Kitchen Staff | — | V (limited stock view) | C/S (approved requisition types only) | — | — | C/S (assigned count sheets only) | — | C/E/S (own branch only) |
| Service Crew | — | — | C/S (approved requisition types only) | — | — | — | — | C/E/S (own branch only) |
| Auditor | V/X | V/X | V/X | V | V | V/X | V/X | V/X |

**Control note:** The current scaffold implements read-only `inventory.balance.view` and `inventory.ledger.view`, receiving permissions for issued PO receiving and full-document receipt reversal, transfer request/dispatch/partial-discrepancy receipt permissions plus full receipt-event reversal permission, stock count review plus count-to-adjustment generation, Wastage Report approval permissions, separate wastage posting/reversal permissions, and separate Stock Adjustment approve/post/reverse permissions. Count-generated variance adjustments still require Stock Adjustment approval and separate posting before inventory changes. A transfer must have separate sender and receiver confirmation unless a formal exception workflow is approved.

### 7.5 Dashboards, Notifications, Attachments, and Reports

| Role | Dashboard | Notifications | Attachments | Export | Audit Trail |
|---|---:|---:|---:|---:|---:|
| CEO / Executive | Consolidated | All critical and assigned | V | X | V/X |
| General Manager | Consolidated | Assigned and escalated | V | X | V/X |
| Operations Manager | Operational portfolio | Operational and approval alerts | C/V | X | V/X |
| Accounting Manager | Finance portfolio | Financial and approval alerts | C/V | X | V/X |
| Purchasing Manager / Officer | Procurement portfolio | Procurement alerts | C/V | X (as permitted) | V |
| Warehouse Manager / Storekeeper | Inventory portfolio | Inventory alerts | C/V | X (as permitted) | V |
| Branch Manager | Assigned branch | Branch and approval alerts | C/V | X (assigned branch) | V |
| Supervisor / Branch Staff | Assigned tasks | Own and assigned tasks | C/V | — | V (own records only) |
| IT Administrator | System health / admin | Security and system alerts | V (support only if authorized) | Limited | V/X |
| Auditor | Audit reporting | Audit-assigned alerts | V | X | V/X |

---

## 8. Confidential Data Controls

The following information should require separate confidential access permissions in addition to ordinary module access:

- Company-wide financial statements
- Budget amounts and budget variance
- Supplier contract pricing and negotiated terms
- Supplier banking and payment information
- Product margin and recipe cost details
- Employee compensation and payroll information
- Disciplinary records and sensitive HR files
- Legal documents and lease terms
- Project feasibility models, NPV, IRR, and capex assumptions
- Security and system configuration logs

Branch users should not receive confidential access by default.

---

## 9. Role Assignment Rules

### 9.1 Multiple roles

Users may have multiple roles where operationally required. Permissions should be additive, but scope must still be enforced.

Example:

- A Branch Manager may also be assigned as a temporary Storekeeper during a staffing shortage.
- A Purchasing Manager may be an approval delegate for the General Manager for a defined period.

### 9.2 Temporary access

Temporary role or scope access must have:

- Start date
- End date
- Request reason
- Approver
- Audit log entry

Expired temporary access must be automatically removed.

### 9.3 Role changes

Role changes should be controlled by an authorized administrator. Current implementation separates ordinary quick assignment from controlled sensitive role grants:

- `UserRoleAssignment` remains tenant-global; it does not carry company, brand, location, or department scope;
- every direct role-administration surface requires `core.tenant_role_administer`; `core.administer` or company `MANAGE` alone is insufficient;
- the seeded `CONFIGURED_ADMIN` and `CONFIGURED_SUPER_USER` roles receive `core.tenant_role_administer` by default;
- role overview/details, role creation, direct grants/deactivation, sensitive-role request/review, role-permission updates, and onboarding with `initialRoleId` all use this tenant-level guard;
- a target user must be active and have a currently effective `COMPANY` assignment for the selected company or a currently effective `LOCATION` assignment to an active location in that company before a grant, deactivation, sensitive request, or review may proceed;
- selected-company membership limits the eligible target population but does not scope the resulting role assignment; company-bound assignments are deferred under `DEC-0043`;
- onboarding with `initialRoleId` must establish selected-company membership in the same transaction rather than create a role-only user;
- quick role assignment is limited to roles whose current live permission set contains no sensitive capability; an allowlisted role code never overrides that live sensitivity check;
- admin, approver, system, and sensitive-permission roles use a `SensitiveRoleRequest`;
- a role with an active, effective assignee cannot be promoted by adding a sensitive permission; direct grants and role-permission changes serialize on the role so they cannot race around this safeguard;
- role permissions cannot change while a sensitive-role request for that role is pending, and approval reloads the active role and its current permission set under the same role lock so the granted authority and audit evidence match what was approved;
- controlled role requests require reason and evidence reference;
- the requester and target user cannot approve or reject the request;
- local production approval requires recent session-bound runtime MFA and creates the `UserRoleAssignment` transactionally; external-provider modes may additionally retain verified provider evidence;
- an authorized administrator may deactivate an active ordinary or sensitive role with a reason; the direct-assignment eligibility check does not block revocation, and the action remains subject to tenant-role authority, selected-company target eligibility, no-self-mutation, active-approval-route safety, audit, privilege-epoch update, and session invalidation;
- approval writes audit history linked to `DEC-0036` and `DEC-0040`, increments the target user's privilege epoch, and revokes active application sessions so stale authority cannot survive;
- external identity-provider invalidation follow-up is tracked only when an external provider is configured.

Account activation and recovery remain Core Administration actions within company `MANAGE` scope. Initial activation may be issued for a user who has no local identity. Recovery for an existing identity requires one administrator to record the reason and identity-verification evidence and a different MFA-assured administrator to approve or reject it. The target user, requester, and reviewer separation rules are enforced by the service; recovery cannot grant roles or scopes.

High-risk changes include:

- Executive access
- Finance approval authority
- Supplier maintenance access
- Inventory adjustment approval, posting, and reversal access
- User administration access
- System administration access

---

## 10. Approval Authority vs Module Permission

A user may have permission to view or create a record without having authority to approve it.

Approval is determined by the approval engine using transaction-specific conditions, including:

- Transaction type
- Amount
- Branch / project / department
- Budget status
- Category
- Supplier status
- Emergency classification
- User delegation status
- Configured approval matrix

This prevents generic role access from accidentally granting approval power where it is not intended.

---

## 11. Delegation and Escalation Rules

### 11.1 Delegation

Approvers may delegate approval authority for a defined period. The system must record:

- Original approver
- Delegate approver
- Effective start and end dates
- Scope of delegated transactions
- Delegation reason
- Approver who authorized delegation

Delegation cannot be used to bypass segregation-of-duties controls.

### 11.2 Escalation

Default approval escalation:

- Reminder after 24 hours
- Follow-up reminder after 48 hours
- Escalation after 72 hours to the approver’s manager or configured alternate
- Dashboard visibility for overdue approvals
- Optional email and in-app alerts

Actual time limits should remain configurable per workflow and urgency level.

---

## 12. Phase I Role Configuration Baseline

For the first implementation, configure these roles first:

1. CEO / Executive
2. General Manager
3. Operations Manager
4. Accounting Manager
5. Finance Officer
6. Purchasing Manager
7. Purchasing Officer
8. Warehouse Manager
9. Storekeeper / Inventory Custodian
10. Branch Manager
11. Assistant Restaurant Manager
12. Restaurant Supervisor
13. Restaurant Accountant
14. Staff Requester
15. IT Administrator
16. Auditor

Additional detailed branch roles can be added as the workflows require them, without changing the core permission model.

---

## 13. Acceptance Criteria

This access-control design is considered ready for Phase I implementation when:

- [ ] A user can be assigned one or more roles.
- [ ] A user can be scoped by company, brand, branch, warehouse, department, and project.
- [ ] Branch users cannot access another branch unless explicitly assigned.
- [ ] Management users can view data within their defined portfolio scope.
- [ ] Approval authority is controlled by the approval engine, not only by role.
- [ ] Requesters cannot approve their own records.
- [ ] Transfer sender and receiver confirmations are separated.
- [ ] Sensitive financial, supplier, and HR data have separate confidential access controls.
- [ ] User, role, scope, and permission changes are audited.
- [ ] Temporary access automatically expires.
- [ ] Audit users remain read-only.
- [ ] Important records are not destructively deleted.

---

## 14. Future Enhancements

Later phases may add:

- Attribute-based access control for highly granular policies
- Shared-services approval centers
- Cross-company parent-group reporting permissions
- POS role mapping for sales and branch operations
- Supplier portal roles
- Franchisee / client administrator roles for productized deployments
- Regional manager hierarchy and delegated reporting structures
- Field-level masking for confidential data
- Compliance attestation and periodic access review workflows

---

## 15. Related Documents

- `ERP_PRODUCT_BRIEF.md`
- `ERP_PHASE_IMPLEMENTATION_PLAN.md`
- `ERP_MODULE_MAP.md`
- `ERP_APPROVAL_MATRIX.md`
- `ERP_DATA_DICTIONARY.md`
- `specs/purchasing-workflow.md`
- `specs/inventory-workflow.md`



---

## Projects & Implementation Tracker — Phase 1.5 Permission Addendum

### Standard project roles

| Project role | Typical assignment | Core access |
|---|---|---|
| Project Sponsor | Executive, GM, Department Head | View project health, approve gates where configured, view reports and risks. |
| Project Manager | Assigned project lead | Create and configure authorized projects/templates, manage members, tasks, risks, milestones, and project closure. |
| Project Contributor | Assigned employee | View assigned projects, create/update assigned tasks, complete checklist items, add comments/attachments, report blockers. |
| Project Viewer | Stakeholder, client-side internal observer | Read-only project visibility within explicit scope. |
| Project Administrator | Authorized Head Office administrator | Manage templates, project settings, restricted access, archival, and reporting across assigned scope. |

### Permission principles

- Project membership never grants authority over a linked Purchase Request, Purchase Order, inventory transaction, approval, or finance document.
- A task owner may change task status only within allowed project workflow states. Completion, cancellation, and reopening rules remain auditable.
- Restricted projects require explicit project membership or an authorized project-administrator scope; broad branch or department access is not sufficient.
- Only Project Managers or Project Administrators may edit project membership, board configuration, templates, milestones, and project closure settings.
- Project comments and attachments inherit the project’s visibility rule; do not expose sensitive attachments through a broad global search.
- Completion of a task does not automatically equal approval of a controlled ERP record.
