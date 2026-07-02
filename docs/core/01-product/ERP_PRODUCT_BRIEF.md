# OGFI ERP — Product Brief

**Document status:** Foundation / Working Baseline  
**Version:** 0.1  
**Primary implementation context:** One Gourmet Foods Inc. (OGFI)  
**Product direction:** Multi-brand, multi-branch F&B and restaurant operations ERP  
**Last updated:** June 25, 2026  

---

## 1. Product Summary

OGFI ERP is a multi-brand, multi-branch enterprise resource planning platform designed for restaurant and food-and-beverage operations. It will replace fragmented workflows currently handled through paper forms, Excel files, chat groups, verbal requests, and disconnected approval processes.

The platform is being built for **One Gourmet Foods Inc.** first, including its restaurant brands, branches, Head Office, central warehouse, commissary or central kitchen, and expansion projects. Its architecture must be sufficiently configurable and tenant-ready so that, once proven in OGFI, it can be offered to other restaurant groups without rebuilding the core platform.

The ERP will centralize operational requests, approvals, purchasing, supplier records, inventory, wastage, expense control, branch operations, workforce workflows, and expansion projects in one auditable system.

---

## 2. Product Vision

Create a practical restaurant ERP where branch teams can complete daily work quickly, Head Office can control money and inventory confidently, and management can see real operational issues before they become financial losses.

The system must make the next action clear for first-time staff, minimize unnecessary clicks and typing, and work reliably on desktop and mobile devices used in restaurant operations.

---

## 3. Product Objectives

### 3.1 Primary objectives

1. Replace informal, manual, and untraceable workflows with structured digital processes.
2. Establish real-time visibility over requests, purchase orders, approvals, inventory, wastage, and expenses.
3. Apply consistent controls across all brands and branches while allowing authorized exceptions.
4. Ensure every significant transaction has an owner, scope, status, approver, and audit history.
5. Support centralized Head Office functions alongside branch-level operations.
6. Provide management with consolidated reporting across brands, branches, warehouses, commissaries, and projects.
7. Create a scalable product foundation that can later support other restaurant companies.

### 3.2 Non-objectives for the initial core

The initial core will not attempt to replace every external system immediately. In particular, advanced accounting general ledger, full payroll computation, point-of-sale replacement, and advanced forecasting may be integrated or expanded in later phases rather than delaying the operational-control foundation.

---

## 4. Business Problems to Solve

The current operating environment relies heavily on paper, Excel, chat groups, verbal instructions, and manual follow-ups. This creates delays, weak accountability, incomplete records, inconsistent approvals, and limited visibility across branches.

The ERP must directly address:

- Untracked or delayed requests and purchase orders
- Informal or inconsistent approval flows
- Manual inventory tallies and weak variance visibility
- Incomplete wastage documentation and approval
- Delayed finance, inventory, and operational reports
- Supplier price inconsistency and weak quotation comparison
- Unclear ownership of branch and project actions
- Difficulty consolidating information from multiple branches
- Limited ability to identify high-risk spending, stock issues, and delayed projects early

---

## 5. Target Operating Model

### 5.1 Organizational hierarchy

The core hierarchy is:

```text
Platform / Tenant
  └── Company
       ├── Brand
       │    └── Branch
       ├── Head Office
       ├── Central Warehouse
       ├── Commissary / Central Kitchen
       └── Expansion Projects
```

For OGFI, the active implementation is initially limited to one company, but the data model must support multiple companies or tenants in the future.

### 5.2 Location and operating-unit model

The platform must support the following operating units:

- Restaurant branches
- Head Office
- Central warehouse
- Commissary / central kitchen
- Project sites
- Pop-up stores, kiosks, or temporary sites in future phases

Head Office, warehouses, commissaries, and project sites are company-level operating locations. They may serve multiple brands and must not be forced under a single brand.

### 5.3 Core transaction context

Every material transaction must carry, where applicable:

- Company
- Brand
- Branch, warehouse, commissary, Head Office, or project site
- Department
- Cost center
- Requester or responsible owner
- Transaction date
- Status
- Approval route and action history
- Attachments or evidence where required
- Created, updated, and closed timestamps

---

## 6. Primary Users and Access Principles

### 6.1 User groups

The system must support standard restaurant and Head Office roles, including:

**Executive and leadership**
- CEO / Executive
- General Manager
- Operations Manager
- Accounting Manager
- Finance Manager

**Head Office functional teams**
- Purchasing Manager and Purchasing Officer
- Warehouse Manager and Warehouse Staff
- HR / Admin Manager and HR Officer
- Marketing Manager and Marketing Staff
- Training Manager
- Business Development Manager
- IT Administrator
- Project Manager
- Auditor

**Branch teams**
- Restaurant Manager
- Assistant Restaurant Manager
- Restaurant Supervisor
- FOH Supervisor
- BOH Supervisor
- Storekeeper / Inventory Custodian
- Restaurant Accountant
- Cashier
- Kitchen Staff
- Service Crew

### 6.2 Access principles

1. **Roles define what a user can do.**
2. **Assignments define where a user can do it.**
3. Branch users can see only the branches assigned to them.
4. Management has consolidated visibility based on their role and scope assignment.
5. A user may be assigned to multiple branches, brands, departments, warehouses, or projects.
6. Sensitive financial, payroll, supplier, and HR information must be restricted by permission.
7. Audit and administrative access must be read-only or highly controlled by default.

### 6.3 Default visibility standard

| User type | Default scope |
|---|---|
| CEO / Executive | All company, brand, branch, warehouse, project, and consolidated reporting data |
| General Manager | All OGFI operational data, subject to permissions |
| Operations Manager | Assigned brands and branches |
| Accounting / Finance Manager | Finance and accounting data across assigned branches |
| Purchasing team | Supplier, quotation, PR, PO, and receiving data across assigned scope |
| Department Head | Their department within assigned scope |
| Branch Manager | Assigned branch only |
| Branch Supervisor | Assigned branch operational workflows only |
| Storekeeper | Assigned branch or warehouse inventory only |
| Project Manager | Assigned expansion projects only |
| Auditor | Read-only records and audit trail access |
| Staff requester | Their own requests and authorized operational tasks only |

---

## 7. Product Principles

1. **Operational clarity over complexity.** Every screen must make the next action obvious.
2. **Branch-first usability.** Frequent branch workflows must be mobile-usable and fast.
3. **Centralized control with local execution.** Branches execute; Head Office governs and consolidates.
4. **No invisible decisions.** Significant actions, approvals, changes, cancellations, and overrides must be auditable.
5. **Configuration over hardcoding.** Policies, thresholds, forms, stages, and approvers should be editable without code changes.
6. **Single source of truth.** The ERP becomes the canonical record for approved operational transactions.
7. **Controlled exceptions.** Emergency and exceptional cases are allowed, but require reason, evidence, and review.
8. **Progressive rollout.** Build the operational-control foundation first; expand integrations and advanced modules later.
9. **Multi-tenant ready.** Use company or tenant scoping from the first version, even though OGFI is the initial customer.
10. **Uniform layout behavior.** UI must apply a single shared spacing token for gaps and padding to keep forms, dashboards, and mobile screens consistent.

---

## 8. Core Product Modules

### 8.1 Foundation and administration

- Company, brand, branch, location, department, and cost-center setup
- User accounts, roles, permissions, and scope assignments
- Approval matrix and delegation management
- Reference data and master-data controls
- Notification and escalation rules
- Audit logs and activity history
- Attachment and document management

### 8.2 Request and approval management

A shared approval engine that supports all important transaction types, including purchase requests, expenses, stock adjustments, wastage, payments, HR requests, budgets, projects, and supplier onboarding.

Core workflow state:

```text
Draft → Submitted → In Review → Approved / Rejected → Cancelled / Closed / Reversed
```

### 8.3 Purchasing and supplier management

- Supplier master records and accreditation status
- Purchase requisitions
- Approval workflow
- Supplier quotations and comparison
- Purchase orders
- Delivery tracking
- Receiving visibility
- Price history and price-change alerts
- Supplier performance tracking
- Emergency purchase workflow

### 8.4 Inventory, warehouse, and commissary control

- Location-based stock records
- Stock receiving
- Warehouse-to-branch transfers
- Branch-to-branch transfers
- Commissary production and transfer flows
- Wastage, spoilage, returns, staff meal, complimentary, and R&D usage
- Physical counts and variance review
- Controlled stock adjustments
- Batch, expiry, and FEFO support where relevant

### 8.5 Recipe, menu, and food-cost management

- Ingredient and packaging item linkage
- Recipes and sub-recipes
- Recipe version history
- Yield and portion standards
- Cost-per-serving calculation
- Food-cost percentage and gross-margin visibility
- Theoretical versus actual consumption and variance reporting
- Menu item price and cost impact analysis

### 8.6 Branch operations

- Opening and closing checklists
- Daily sales and shift summaries
- Inventory alerts and count tasks
- Wastage and incident reporting
- Maintenance requests
- Food safety, sanitation, temperature, and equipment logs
- Customer complaint and corrective-action tracking
- Branch manager logbook

### 8.7 Expense, budget, and payment controls

- Budget setup by company, branch, department, project, and category
- Expense requests and reimbursements
- Petty cash release, liquidation, and replenishment
- Payment requests
- Budget-versus-actual reporting
- Document attachment and receipt verification
- Purchase order, receiving report, invoice, and payment request matching

### 8.8 Workforce and operational HR

- Employee masterlist
- Branch, department, position, and transfer history
- Scheduling and manpower planning
- Attendance import or integration readiness
- Leave, overtime, and schedule change requests
- Training and certification records
- Disciplinary-action records
- Employee document expiry alerts
- Manpower requisitions

### 8.9 Expansion project management

- Site pipeline and site evaluation
- Feasibility and approval workspace
- Lease, legal, permit, and mall-requirement tracking
- Capex budgets and change orders
- Construction, procurement, and milestone tracking
- Project risk and issue logs
- Opening-readiness checklist
- Branch handover and post-opening review

---

## 9. Standard Approval Framework

### 9.1 Approval engine requirements

The approval engine must be configurable by:

- Transaction type
- Company, brand, branch, department, or project
- Amount or financial threshold
- Budgeted versus unbudgeted classification
- Expense or inventory category
- Supplier status
- Request urgency
- Project stage
- Role and named approver assignment

### 9.2 Default approval route

```text
Requester
→ Immediate Manager
→ Department Head
→ Finance / Accounting
→ General Manager or Executive, where required
```

### 9.3 Default approval patterns

| Transaction type | Default route |
|---|---|
| Routine branch request | Branch Manager |
| Purchase / expense request | Branch Manager → Department Head |
| Budgeted purchase | Department Head → Finance |
| Unbudgeted purchase | Department Head → Finance → General Manager |
| High-value purchase | Department Head → Finance → General Manager → Executive |
| Capex / equipment / renovation | Finance → General Manager → Executive |
| New supplier | Purchasing → Finance → Management |
| Stock adjustment | Branch Manager → Operations / Finance |
| Major wastage | Branch Manager → Operations → Finance |
| Payment request | Requester → Department Head → Finance → Authorized Signatory |
| Project budget revision | Project Owner → Finance → General Manager → Executive |

### 9.4 Delegation and escalation

- Approvers may delegate authority for a defined effective period.
- The ERP must retain the original approver, delegated approver, dates, and action history.
- Default reminders: 24 hours and 48 hours after pending approval.
- Default escalation: approver’s manager after 72 hours.
- Overdue approvals must appear on dashboards and can trigger in-app and email alerts.

### 9.5 Controlled actions

The following actions require reason, audit trail, and/or approval based on configuration:

- Cancellation of a purchase request or purchase order
- Supplier change after approval
- Price override
- Stock adjustment or count override
- Wastage declaration
- Backdated transaction
- Expense above budget
- Expense without complete receipt
- Payment request cancellation
- Employee transfer
- Payroll adjustment
- Recipe revision
- Menu-price change
- Budget revision
- Project scope change
- Construction change order
- Permit-status override
- User-permission change

---

## 10. Standard Operating Workflows

### 10.1 Purchase-to-payment

```text
Purchase Request
→ Approval
→ Supplier Quotation / Comparison
→ Purchase Order
→ Delivery
→ Receiving Report
→ Invoice / Delivery Receipt Matching
→ Payment Request
→ Payment Status
```

### 10.2 Emergency purchase

```text
Emergency Purchase Request
→ Branch Manager Approval
→ Purchase
→ Receipt / Proof Upload
→ Post-Approval and Finance Review
```

### 10.3 Inventory control

```text
Purchase Order
→ Receiving
→ Warehouse / Branch Stock-In
→ Transfer / Usage / Wastage / Return
→ Physical Count
→ Variance Review
→ Approved Adjustment
```

### 10.4 Issue and corrective-action management

```text
Reported
→ Assigned
→ In Progress
→ Resolved
→ Verified
→ Closed
```

### 10.5 Expansion project lifecycle

```text
Lead
→ Site Evaluation
→ Feasibility
→ Negotiation
→ Approval
→ Design
→ Procurement
→ Construction
→ Pre-Opening
→ Opening
→ Post-Opening Review
```

---

## 11. Expansion Project Requirements

Each expansion project must function as a structured project workspace for future branches and major renovations.

### 11.1 Core project records

- Company and brand
- Proposed branch or project name
- Mall, landlord, and site information
- Project owner and cross-functional owners
- Target opening date
- Site size, layout, and operating assumptions
- Project status and readiness score
- Capex budget and actual spend
- Key documents and approvals
- Risks, blockers, decisions, and change orders

### 11.2 Required project categories

- Site acquisition
- Lease and legal
- Design and fit-out
- Construction
- Kitchen equipment
- Furniture and fixtures
- Signage
- IT and POS
- Kitchen smallwares
- Hiring
- Training
- Pre-opening inventory
- Marketing launch
- Permits and licenses
- Mall requirements

### 11.3 Ready-to-open standard

A project cannot be marked **Ready to Open** until required readiness items are complete or formally waived by an authorized manager. The checklist must include operational, staffing, procurement, equipment, IT, permits, marketing, and inventory readiness.

---

## 12. Dashboards and Reporting

### 12.1 Executive dashboard

- Consolidated performance by brand and branch
- Pending and overdue approvals
- Budget versus actual performance
- Food cost, inventory variance, and wastage alerts
- Stockout and supplier-price alerts
- Open operational incidents and maintenance issues
- Workforce and manpower risk indicators
- Expansion project status, milestones, blockers, and budget utilization

### 12.2 Branch manager dashboard

- Pending approvals and assigned actions
- Incoming deliveries and receiving tasks
- Stock alerts and count requirements
- Wastage and variance alerts
- Open maintenance and incident tickets
- Staffing gaps and pending HR actions
- Daily checklists and operational logs
- Daily sales and branch performance summary, when data is available

### 12.3 Expansion dashboard

- Project stage and owner
- Target opening date and schedule health
- Budget utilization and change-order impact
- Permit, procurement, and construction status
- Opening-readiness score
- Critical risks and blockers

### 12.4 Reporting requirements

Reports must be filterable and exportable by, at minimum:

- Company
- Brand
- Branch / location / project
- Department
- Date range
- Status
- Requester / approver / owner
- Supplier
- Expense or inventory category

Export to Excel and PDF should be available for operational and management reports.

---

## 13. Data and Integration Direction

### 13.1 Master data domains

The ERP must maintain controlled master data for:

- Companies and tenants
- Brands
- Branches and locations
- Departments and cost centers
- Users, employees, roles, permissions, and assignments
- Suppliers and supplier categories
- Inventory items, units of measure, conversions, and categories
- Recipes, sub-recipes, and menu items
- Budget categories and expense types
- Approval routes and thresholds
- Projects, milestones, checklists, and document types

### 13.2 Integration posture

The core platform should be integration-ready for:

- Point-of-sale systems
- Accounting systems
- Payroll and attendance systems
- Biometric or timekeeping devices
- Email and notification services
- Document storage
- Supplier or logistics portals

Phase 1 integrations should be selected based on immediate operational value and data availability. The ERP must not depend on a large integration program before delivering core request, approval, purchasing, and inventory control.

---

## 14. Security, Audit, and Data-Control Requirements

1. No important business transaction may be permanently deleted by ordinary users.
2. Cancellation, reversal, and correction must preserve original history.
3. Significant actions must record user, timestamp, action, prior state, new state, and remarks where required.
4. Attachments, receipts, photos, quotations, and supporting evidence must be retained with the related transaction.
5. Users may access only data within their authorized company, brand, branch, department, location, or project scope.
6. User-permission changes must be restricted and audited.
7. Sensitive finance, supplier, salary, and HR information must use granular permissions.
8. High-risk exceptions must have a reason and, where configured, a higher-level approval.
9. The system must support active/inactive status rather than destructive removal for master records.
10. Retention rules should be configurable by document and record type.

---

## 15. UX and Mobile Rules

### 15.1 General UX requirements

- First-time staff must be able to identify the next action without needing procedural memory.
- Branch, date, department, requester, priority, and status must be visible immediately on operational records.
- Managers must be able to approve or reject without leaving the relevant transaction page.
- Users must be able to filter, search, and export operational data.
- Empty, loading, error, rejected, and completed states must be designed deliberately.
- Important actions must show clear confirmation and audit context.

### 15.2 Mobile requirements

- Branch workflows must be usable on mobile and tablet devices.
- Forms must minimize typing through defaults, dropdowns, templates, saved selections, and barcode or camera capabilities where appropriate.
- Photo evidence, receipt uploads, and checklist completion must be fast on mobile.
- Mobile screens must prioritize one primary action per view.

### 15.3 Layout requirement

All UI layouts must use a single shared spacing token for consistent gaps and padding. This prevents crowded screens, uneven visual rhythm, and overlapping interface elements across desktop and mobile.

---

## 16. Fixed Principles vs Configurable Policies

### 16.1 Fixed platform principles

The following are foundational and should remain consistent:

- Every important record has an owner, scope, status, and audit history.
- Users act only within their authorized scope.
- Material approvals are timestamped and traceable.
- Inventory movements always have a source, destination, reason, and responsible user.
- Important records are cancelled or reversed rather than deleted.
- Budget and actual spending are traceable to a branch, department, or project.
- High-risk actions require evidence, remarks, or additional approval as configured.
- Branch workflows remain mobile-usable.

### 16.2 Configurable policies

The following must be configurable without code changes:

- Approval amounts, levels, and named approvers
- Role permissions and scope assignments
- Department names and reporting structures
- Branch, warehouse, commissary, and project-location setup
- Supplier-accreditation requirements
- Purchase categories and quotation requirements
- Wastage reasons and attachment requirements
- Inventory count frequency and variance tolerances
- Budget categories and budget-control rules
- Project stages, milestones, checklists, and readiness rules
- Notification channels, reminder timing, and escalation timing
- Food-cost targets and KPI thresholds
- Required document and attachment types

---

## 17. Phased Delivery Roadmap

### Phase 0 — Product foundation

- Company, brand, branch, location, department, and cost-center master data
- User, role, permission, and assignment model
- Audit logs and attachment framework
- Shared notification and approval engine
- Core dashboard shell

### Phase 1 — Immediate operational control

- Purchase requests and approvals
- Supplier master data and supplier quotation comparison
- Purchase orders
- Receiving records
- Basic inventory movements and transfers
- Wastage and stock adjustments
- Branch operational requests and task visibility

### Phase 2 — Finance and food-cost controls

- Budget and expense requests
- Petty cash and payment requests
- Purchase-to-payment matching
- Recipe, menu, and cost management
- Inventory variance and food-cost reporting

### Phase 3 — Workforce and branch operating depth

- Employee assignments and transfers
- Schedules, leave, overtime, and manpower requests
- Daily checklists, incidents, maintenance, food-safety and sanitation logs
- Training and certification tracking

### Phase 4 — Expansion projects and enterprise reporting

- Expansion project workspace
- Feasibility, capex, permits, construction, and opening-readiness tracking
- Executive reporting and consolidated branch analytics
- Integration expansion with POS, accounting, payroll, and timekeeping systems

### Phase 5 — Productization for external restaurant clients

- Tenant onboarding and data-isolation controls
- Client-specific configurations and templates
- Branding and domain configuration
- Subscription, licensing, support, and product-administration capabilities

---

## 18. Initial Success Measures

The first rollout should be judged by measurable control improvements, not by the number of screens created.

Initial success indicators:

- Material requests are submitted and tracked in the ERP rather than chat or paper.
- Purchase orders are linked to approved requests and suppliers.
- Pending and overdue approvals are visible without manual follow-up.
- Inventory transfers, stock adjustments, and wastage are recorded with accountability.
- Finance can retrieve request, receiving, and supporting-document history in one place.
- Branch managers can identify assigned tasks and urgent issues from a single workspace.
- Management can compare branch-level operational risks without manually consolidating Excel files.
- Expansion projects have visible owners, dates, budgets, blockers, and opening-readiness status.

---

## 19. Product Positioning Statement

> OGFI ERP is a multi-brand, multi-branch restaurant operations platform that centralizes requests, approvals, purchasing, inventory, food-cost control, expenses, branch operations, workforce workflows, and expansion projects into one auditable system.
>
> It is built for practical branch execution, disciplined Head Office control, and scalable restaurant growth.

---

## 20. Next Documentation Dependencies

This product brief is the foundation for the following documents:

1. `ERP_ROLES_AND_PERMISSIONS.md`
2. `ERP_APPROVAL_MATRIX.md`
3. `ERP_MODULE_MAP.md`
4. `ERP_DATA_DICTIONARY.md`
5. `ERP_DESIGN_DECISIONS.md`
6. `/design/COMPONENT_LIBRARY.md`
7. `/design/DASHBOARD_RULES.md`
8. `/design/MOBILE_RULES.md`
9. `/design/DESIGN_TOKENS.md`
10. `/specs/purchasing-workflow.md`
11. `/specs/inventory-workflow.md`
12. `/specs/hr-workflow.md`
13. `/specs/finance-workflow.md`
14. `/specs/branch-operations-workflow.md`



---

## 18. Projects & Implementation Tracker — Phase 1.5 Addition

### 18.1 Purpose

The ERP includes a shared **Projects & Implementation Tracker** directly after Phase I stabilization. It provides a Trello-like, ERP-native way to coordinate work without creating a separate disconnected task-management system.

It is intended for:

- ERP rollout and system implementation work
- Operational improvement projects
- Renovations and fit-out work
- IT implementation and equipment rollout
- Marketing campaigns and launch coordination
- Training rollout
- Audit corrective actions
- Compliance and permit initiatives
- Supplier onboarding
- Maintenance projects
- Future branch-opening coordination

### 18.2 Product boundary

The tracker coordinates people, due dates, checklists, blockers, comments, attachments, and implementation progress. It does **not** replace financial, inventory, approval, procurement, or source-record controls.

A task may link to a Purchase Request, Purchase Order, Receiving Report, Transfer, Supplier, Wastage record, approval request, branch, warehouse, or future Expansion Project. The linked record remains the source of truth for its controlled workflow and data impact.

### 18.3 Core experience

Each project contains a board, list, calendar, and project overview. The task model supports owners, assignees, priority, due dates, checklists, attachments, comments, dependencies, milestones, risks, and linked ERP records. Role-aware dashboards surface assigned work, overdue work, blocked work, and approval-dependent tasks.

### 18.4 Mobile principle

Mobile users focus on My Tasks, Today, Overdue, Blocked, task detail, quick comments, evidence upload, and marking work complete. The system must not require staff to manage a large drag-and-drop board on mobile.

### 18.5 Phase boundary

Phase 1.5 includes a controlled MVP. Full project scheduling, capacity planning, external collaborator portals, automated workflow builders, and advanced Gantt dependencies remain out of scope until a later approved phase.
