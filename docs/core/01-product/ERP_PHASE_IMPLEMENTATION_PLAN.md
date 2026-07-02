# OGFI ERP — Phase Implementation Plan

**Document status:** Foundation / Working Baseline  
**Version:** 0.1  
**Primary implementation context:** One Gourmet Foods Inc. (OGFI)  
**Product direction:** Multi-brand, multi-branch F&B and restaurant operations ERP  
**Last updated:** June 25, 2026  
**Related document:** `ERP_PRODUCT_BRIEF.md`

---

## 1. Purpose

This document defines the recommended five-phase implementation roadmap for the OGFI ERP.

The roadmap is designed to solve the most urgent operational-control problems first: manual requests, informal approvals, fragmented purchasing records, inventory uncertainty, wastage visibility, and weak cross-branch reporting. It deliberately avoids trying to build a full enterprise platform in one release.

Each phase must be usable on its own, produce measurable operational value, and establish clean data and controls required by the next phase.

---

## 2. Delivery Principles

1. **Build operational control before advanced automation.** A reliable request, approval, receiving, and inventory trail is more valuable than sophisticated dashboards based on weak data.
2. **Design for OGFI, configure for future restaurant clients.** The data model supports multi-company and multi-brand use, but OGFI is the first live operating environment.
3. **Make policy configurable.** Approval thresholds, approvers, stock-count schedules, categories, checklist items, and project stages must be set in administration screens rather than hardcoded.
4. **Use incremental rollout.** Pilot workflows with selected users and locations before making them mandatory across all branches.
5. **Protect historical integrity.** Important records are cancelled, reversed, superseded, or archived—not permanently deleted.
6. **Mobile-first for branch work.** Frequent branch workflows must work on a phone or tablet with minimal typing.
7. **No phase goes live without operational ownership.** Every workflow needs a business owner, training guide, support route, and adoption standard.
8. **Apply the shared UI spacing token.** All interface layouts use one shared spacing token for gaps and padding to maintain consistent desktop and mobile layouts.

---

## 3. Roadmap at a Glance

| Phase | Focus | Primary Outcome |
|---|---|---|
| Phase I | Core control: foundation, approvals, purchasing, inventory | Controlled and traceable request-to-stock workflows |
| Phase 1.5 | Projects & Implementation Tracker | ERP-native task, implementation, and blocker coordination without weakening source-record controls |
| Phase II | Restaurant operations and food-cost control | Visibility over operational execution, variance, and food cost |
| Phase III | Finance, budget, and workforce operations | Tighter expense, payment, budget, staffing, and workforce control |
| Phase IV | Expansion projects and branch opening | Structured new-site execution from feasibility through post-opening review |
| Phase V | Integrations, intelligence, and productization | Scalable client-ready restaurant ERP platform |

---

## 4. Phase I — Core Control: Foundation, Purchasing, Inventory, and Approvals

### 4.1 Objective

Replace manual, paper-based, Excel-based, chat-based, and verbal workflows for requests, approvals, purchasing, receiving, transfers, and basic inventory control.

This is the foundational phase. It creates the master data, user access, approval rules, and audit trail that all later modules depend on.

### 4.2 Business problems addressed

- Purchase requests are difficult to track or follow up.
- Purchase orders are manually created, incomplete, or disconnected from delivery and receiving.
- Approvals are informal, delayed, or difficult to verify.
- Inventory movement between warehouse and branches is difficult to reconcile.
- Wastage and stock adjustments are inconsistently documented.
- Management cannot easily identify urgent requests, pending approvals, delayed receiving, or stock variances.

### 4.3 Included modules

#### A. Foundation and administration

- Tenant/company structure prepared for future multi-company use
- Company, brand, branch, operating location, warehouse, commissary, and project-site master data
- Department, cost center, and expense category master data
- User accounts, roles, permissions, and scope assignments
- Role-based and branch-based access control
- Approval matrix configuration
- Approval delegation configuration
- Notification, reminder, and escalation rules
- Attachment and document handling
- System activity log and audit trail

#### B. Supplier and purchasing control

- Supplier masterlist and supplier status
- Supplier categories and contact information
- Purchase Request (PR)
- PR approval workflow
- Supplier quotation capture
- Quotation comparison and supplier recommendation
- Purchase Order (PO)
- PO approval workflow where required
- Purchase-order versioning and controlled cancellation
- Emergency purchase workflow
- Supplier price history and last-purchase-price visibility

#### C. Receiving and inventory control

- Receiving Report / Goods Receipt
- Partial delivery, rejected delivery, and incomplete delivery recording
- Warehouse stock receiving
- Direct supplier receiving at branch
- Warehouse-to-branch transfers
- Branch-to-branch transfers
- Sender confirmation and receiver confirmation for transfers
- Basic location-based inventory ledger
- Physical stock count
- Count variance review
- Wastage, spoilage, return, staff meal, complimentary, R&D/test use, and controlled adjustment transactions
- Approval rules for high-risk stock movements

#### D. Core dashboards and reporting

- Pending approvals dashboard
- Request and PO tracker
- Delivery and receiving tracker
- Inventory movement report
- Transfer status report
- Wastage and adjustment report
- Stock count and variance report
- Supplier purchase history report
- Basic branch/warehouse operational dashboard
- Export to Excel and PDF for approved operational reports

### 4.4 Core Phase I workflows

#### Purchase-to-stock workflow

```text
Draft Purchase Request
→ Submit
→ Approval
→ Supplier Quotation / Comparison, when required
→ Purchase Order
→ Delivery
→ Receiving Report
→ Stock-In to Warehouse or Branch
→ Invoice / document attachment
→ Closed
```

#### Warehouse-to-branch transfer workflow

```text
Branch Transfer Request
→ Approval, when required
→ Warehouse Pick / Release
→ In Transit
→ Branch Receipt Confirmation
→ Inventory Updated at Both Locations
→ Closed
```

#### Wastage and adjustment workflow

```text
Wastage / Adjustment Draft
→ Reason, quantity, value, evidence
→ Submit
→ Manager / Operations / Finance approval based on rule
→ Inventory Movement Posted
→ Audit History Retained
→ Closed
```

### 4.5 Industry-standard defaults for Phase I

- All significant transactions carry company, brand where applicable, location, department, cost center, requester, date, status, and history.
- Purchase Orders reference approved Purchase Requests unless marked as emergency or authorized direct purchase.
- Emergency purchases require a reason, proof of urgency, receipt upload, and post-approval review.
- Receiving can be partial and must record accepted, rejected, and short-delivered quantities.
- Transfers require both dispatch and receipt confirmation.
- Stock adjustments and material wastage require a reason and approval.
- High-value, controlled, or frequently pilfered items can be flagged for tighter count and approval rules.
- Important transactions cannot be deleted after submission; they must be cancelled or reversed with reason.

### 4.6 Phase I exclusions

The following are intentionally excluded from the first phase unless needed for a pilot workflow:

- Full recipe and menu costing
- Theoretical versus actual food cost
- POS integration
- Full accounting general ledger
- Payroll computation
- Advanced budget management
- HR employee lifecycle management
- Expansion project module
- Automated reorder recommendations
- Advanced forecasting

### 4.7 Phase I dependencies

Before build and pilot, OGFI must provide or validate:

- Branch, warehouse, and department list
- Initial user list and role assignments
- Initial suppliers and supplier categories
- Initial inventory item list and unit-of-measure rules
- Existing purchase-request and purchase-order templates
- Existing stock-count sheet and wastage form
- Existing approval practices and known exceptions
- Which branch and warehouse will be used for pilot rollout

### 4.8 Phase I acceptance criteria

Phase I is ready for controlled rollout when:

1. Users can only access assigned scope and approved modules.
2. A branch can raise a PR, route it for approval, and track its status without chat follow-up.
3. Purchasing can convert approved PRs into POs with supplier, pricing, and delivery information.
4. Warehouse or branch users can receive goods, record discrepancies, and update stock by location.
5. Transfers show sender, receiver, in-transit status, and completion history.
6. Wastage and inventory adjustments require the required evidence and approval.
7. Every approval, rejection, cancellation, change, and override has an audit record.
8. Managers can see pending approvals, overdue items, open transfers, and recent wastage from dashboards.
9. Pilot users can complete frequent branch workflows on mobile or tablet.
10. Data can be exported for accounting, management review, and temporary parallel reconciliation.

### 4.9 Pilot and rollout recommendation

- Pilot with **one warehouse and one or two representative branches**.
- Use a mix of direct supplier deliveries and warehouse-to-branch transfers during the pilot.
- Run manual and ERP records in parallel for a defined verification period.
- Correct master-data issues and workflow gaps before rolling out to all seven existing branches.
- Do not move to Phase II until stock movements and approval adoption are stable.

---

## 5. Phase II — Restaurant Operations and Food-Cost Control

### 5.1 Objective

Connect inventory control to restaurant execution so management can monitor food cost, wastage, variance, branch compliance, maintenance, food safety, and daily operational issues.

### 5.2 Included modules

#### A. Recipe, menu, and food-cost management

- Ingredient-to-recipe mapping
- Recipe and sub-recipe management
- Recipe versioning and approval
- Yield, portion, and unit conversion support
- Menu item costing
- Target food-cost percentage configuration
- Ingredient price-impact alerts
- Theoretical usage based on sales input or eventual POS integration
- Actual versus theoretical food cost and variance reporting

#### B. Branch operations

- Opening checklist
- Closing checklist
- Daily manager logbook
- Incident reporting
- Customer complaint log
- Maintenance ticketing
- Equipment checklist and maintenance history
- Cleaning and sanitation checks
- Temperature and food safety logs
- Photo evidence and follow-up actions
- Corrective action workflow

#### C. Operational reporting

- Branch performance dashboard
- Inventory variance and wastage trend dashboard
- Theoretical versus actual consumption report
- Food-cost report by branch, brand, menu category, and date range
- Maintenance and incident aging report
- Checklist compliance report
- Customer complaint and resolution report

### 5.3 Core Phase II workflows

#### Recipe-costing workflow

```text
Ingredient Cost Update
→ Recipe Cost Recalculation
→ Menu Cost / Margin Impact Review
→ Review or Approval for Material Change
→ Historical Cost Retained
```

#### Branch incident workflow

```text
Report Incident
→ Assign Owner
→ Investigate / Add Evidence
→ Corrective Action
→ Manager Verification
→ Closed
```

### 5.4 Industry-standard defaults for Phase II

- Recipe changes are versioned; historical cost records are retained.
- High-risk food safety and equipment incidents trigger escalation rules.
- Branch checklists may require photos and time stamps for selected control points.
- Incidents cannot be closed by the same person who reported a serious control failure unless an authorized verifier approves it.
- Food-cost alerts should distinguish expected price-driven increases from operational variance or abnormal usage.

### 5.5 Phase II exclusions

- Full general ledger and statutory accounting
- Payroll calculation
- Detailed staff scheduling engine
- Full expansion project management
- External client/tenant management
- Advanced AI forecasting

### 5.6 Phase II dependencies

- Stable inventory ledger from Phase I
- Reliable master item data and units of measure
- Initial recipes, sub-recipes, yields, and menu master data
- A process to provide sales data manually or through integration
- Agreed list of branch operational checklists and compliance forms
- Defined incident categories and response owners

### 5.7 Phase II acceptance criteria

1. Approved recipes produce transparent and traceable item costs.
2. Management can identify material food-cost changes and explain their driver.
3. Branches can complete operational checklists from mobile devices.
4. Incidents, maintenance issues, and customer complaints have assigned owners and status tracking.
5. Wastage, stock variance, and operational issues can be reviewed together at branch level.
6. Management can compare operational-control compliance across branches.

---

## 6. Phase III — Finance, Budget, and Workforce Operations

### 6.1 Objective

Extend operational controls into branch and Head Office expense management, payment processes, budget accountability, employee movement, workforce planning, and core HR operations.

### 6.2 Included modules

#### A. Finance and budget control

- Budget setup by company, brand, branch, department, project, and period
- Budget versus actual reporting
- Expense request workflow
- Petty cash request, release, liquidation, and replenishment
- Cash advances and liquidation
- Payment request workflow
- Invoice, PO, receiving, and payment-document matching
- Basic accounts-payable tracker
- Branch expense reporting
- Fixed-asset register for selected equipment and capital assets

#### B. Workforce operations

- Employee masterlist
- Position, department, and home-branch assignment
- Temporary assignment and branch transfer history
- Leave request
- Overtime request
- Schedule and manpower planning
- Attendance import or integration-ready interface
- Manpower requisition
- Training records and compliance requirements
- Employee document-expiry alerts
- Controlled access to sensitive employee information

### 6.3 Core Phase III workflows

#### Budget-to-payment workflow

```text
Budget Allocation
→ Expense / Purchase Request
→ Approval and Budget Check
→ PO / Delivery / Invoice Matching, where applicable
→ Payment Request
→ Payment Status Update
→ Budget Actualization
```

#### Employee movement workflow

```text
Employee Assignment Request
→ Manager / HR Approval
→ Effective Date
→ Branch / Department Assignment Updated
→ History Retained
```

### 6.4 Industry-standard defaults for Phase III

- Expenses must include an owner, branch or project, department, category, and supporting evidence.
- Above-budget requests may proceed only through an elevated approval route.
- Petty cash must retain release, liquidation, receipt, and replenishment history.
- Branch managers see only operational employee records required for staffing; confidential compensation and disciplinary details remain restricted.
- Employee transfers have effective dates, source and destination assignments, and history.

### 6.5 Phase III exclusions

- Full payroll calculation and statutory filing automation unless separately scoped
- Full accounting general ledger replacement unless separately scoped
- Full recruitment applicant-tracking system
- Expansion project lifecycle management beyond financial linkage
- External client billing and subscription management

### 6.6 Phase III dependencies

- Stable purchasing and receiving data from Phase I
- Defined budget structure and expense categories
- Existing petty cash, payment request, and liquidation policy samples
- Employee masterlist and organizational chart
- HR confidentiality and access rules
- Attendance source and export/import format, if integration is not yet available

### 6.7 Phase III acceptance criteria

1. Budget owners can see committed and actual spending by scope.
2. Expenses and payments are traceable to supporting documents and prior transactions.
3. Finance can identify unmatched PO, receiving, invoice, and payment records.
4. Petty cash is reconcilable per custodian and branch.
5. Employee assignments, transfers, leave, overtime, and manpower requests are trackable with approval history.
6. Sensitive HR and finance records are protected by role and scope.

---

## 7. Phase IV — Expansion Projects and Branch Opening

### 7.1 Objective

Manage the expansion lifecycle from prospective site through feasibility, approvals, construction, opening readiness, handover, and post-opening review.

### 7.2 Included modules

#### A. Expansion project pipeline

- Project lead and site pipeline
- Brand and concept assignment
- Site profile, mall/landlord information, and target opening date
- Stage-based project board
- Project owners, functional owners, and external contacts
- Project document repository

#### B. Feasibility and approval

- Site-evaluation forms
- Sales, rent, capex, manpower, and operating-cost assumptions
- Break-even, payback, ROI, NPV, and IRR workspace or linked calculations
- Feasibility approval package
- Executive decision and decision history

#### C. Construction, procurement, and readiness

- Capex budget and actual tracking
- Construction milestones
- Contractor quotation and procurement tracking
- Change orders
- Risk and issue log
- Lease, mall document, permit, insurance, and compliance tracker
- Opening-readiness checklist
- Hiring, training, IT, POS, equipment, inventory, permits, and marketing readiness
- Branch handover record

#### D. Post-opening review

- 30-, 60-, and 90-day review template
- Opening cost reconciliation
- Forecast versus actual performance review
- Lessons learned and corrective actions

### 7.3 Core Phase IV workflow

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

### 7.4 Industry-standard defaults for Phase IV

- No project can advance to the next stage without required approvals or documented waiver.
- Project costs must be categorized separately from ongoing branch operating expenses.
- Critical path milestones must have owners, planned dates, actual dates, and blockers.
- Delays that threaten target opening date trigger escalation.
- “Ready to Open” requires all mandatory readiness controls to be complete or formally waived by authorized management.

### 7.5 Phase IV dependencies

- Company, brand, project, cost-center, purchasing, and budget structure from earlier phases
- Standard site-evaluation and feasibility templates
- Project budget categories
- Permit and compliance checklist
- Opening-readiness checklist agreed by Operations, HR, IT, Purchasing, Finance, and Marketing

### 7.6 Phase IV acceptance criteria

1. Leadership can see every planned expansion project, stage, budget status, timeline, and blocker in one dashboard.
2. Feasibility assumptions and approval decisions are retained with documents and history.
3. Project spend can be separated from operating spend.
4. Construction, permits, procurement, and readiness tasks have named owners and due dates.
5. The ERP can demonstrate whether a branch is genuinely ready to open.
6. Post-opening performance can be compared with approved feasibility assumptions.

---

## 8. Phase V — Integrations, Advanced Intelligence, and Productization

### 8.1 Objective

Turn the proven OGFI ERP into a scalable, configurable restaurant-platform product with strong integrations, advanced reporting, forecasting, tenant management, and client onboarding capability.

### 8.2 Included modules and capabilities

#### A. Integrations

- POS sales integration
- Accounting platform integration
- Biometric or attendance integration
- Bank/payment integration where appropriate
- Email, SMS, WhatsApp, and in-app notification integration
- Supplier portal or supplier document exchange where practical
- API and import/export framework

#### B. Intelligence and advanced reporting

- Advanced executive dashboards
- Multi-period trend analysis
- Demand forecasting
- Reorder suggestions
- Supplier price trend analytics
- Menu and branch profitability analysis
- Exception and anomaly alerts
- Forecast versus actual tracking

#### C. Productization and tenant administration

- Multi-company tenant management
- Client onboarding workflow
- Configurable brand themes and client settings
- Template library for roles, approvals, checklists, categories, and project stages
- Subscription and licensing controls
- Tenant isolation, security monitoring, backup, and recovery controls
- White-label / client branding options, if commercially required

### 8.3 Industry-standard defaults for Phase V

- Every integration must use documented ownership, error handling, retry rules, and reconciliation reports.
- Client data must be logically isolated by tenant/company.
- Analytics should explain the driver behind an alert where possible, not just present a red flag.
- Recommendations must remain reviewable by authorized users; automation must not silently create high-impact transactions.

### 8.4 Phase V dependencies

- Stable, adopted workflows from Phases I–IV
- Clean master data and consistent identifiers
- Defined integration contracts with external vendors
- Security architecture appropriate for external clients
- Clear commercial model for product licensing and support

### 8.5 Phase V acceptance criteria

1. POS, accounting, or attendance data can flow into the ERP with reconciliation visibility.
2. Management can use consolidated reporting and alerts across companies, brands, and branches.
3. A second restaurant client could be onboarded without changing OGFI data or code structure.
4. Tenant data remains isolated and auditable.
5. Configuration templates reduce onboarding effort for future clients.

---

## 9. Cross-Phase Core Standards

The following standards apply across every phase.

### 9.1 Audit and record retention

- Audit history captures creation, modification, approval, rejection, cancellation, reversal, delegation, and permission-sensitive actions.
- Audit history includes user, timestamp, action, affected record, and meaningful before/after context where appropriate.
- Submitted and approved transactions cannot be silently overwritten.
- Deleted records are avoided for material workflows; cancellation and reversal are used instead.

### 9.2 Status design

Every significant workflow should use clear, consistent statuses. Standard examples:

```text
Draft → Submitted → In Review → Approved / Rejected → Completed / Closed
```

Where relevant:

```text
Cancelled → Reversed → Superseded → Archived
```

### 9.3 Notifications and escalation

Default notification policy:

- In-app notification on assignment, submission, approval, rejection, comment, and overdue action.
- First reminder after 24 hours for pending approval or assigned task.
- Second reminder after 48 hours.
- Escalation after 72 hours to the approver’s or task owner’s manager, subject to configurable policy.
- Emergency workflows use shorter, configurable escalation windows.

### 9.4 Mobile usability

Frequent branch actions must be practical on mobile/tablet:

- Submit request
- Approve/reject request
- Receive stock
- Confirm transfer
- Count inventory
- Report wastage
- Complete checklist
- Report incident
- Upload evidence
- View urgent notifications

### 9.5 Data governance

- Master data changes require appropriate permission and, for high-impact fields, review or approval.
- Company, branch, item, supplier, unit, category, recipe, and cost-center identifiers must be stable and unique.
- Inactive records remain historically reportable.
- Import templates and validations must be provided for initial and ongoing bulk maintenance.

---

## 10. Phase Gate Rules

A phase should not be expanded merely because features are desired. It should pass the following gate before the next phase becomes the main implementation priority.

| Gate | Required condition |
|---|---|
| Adoption | Target users can complete their primary workflow without parallel chat or paper as the official record |
| Data quality | Core master data is sufficiently complete and duplicate/invalid records are controlled |
| Control | Required approvals, status history, and audit log are working |
| Reconciliation | Operational totals can be checked against the current manual or finance process during transition |
| Support | SOP, user guide, role owner, and issue-resolution path exist |
| Reporting | Management can access the minimum dashboard and exports needed to supervise the workflow |
| Mobile readiness | Branch-critical workflows are usable on supported mobile/tablet devices |

---

## 11. Recommended Initial Build Sequence Within Phase I

Phase I should still be delivered in controlled increments rather than as one large launch.

### Phase I-A — Foundation

- Company/brand/branch/location setup
- Departments, cost centers, categories
- User accounts, roles, assignments
- Audit log, notifications, attachments
- Approval engine and basic dashboard shell

### Phase I-B — Requests and approvals

- Purchase Requests
- Approval routes, delegation, reminders, and escalation
- PR tracker, pending-approval view, comments, attachments

### Phase I-C — Purchasing and receiving

- Supplier masterlist
- Quotations and comparison
- Purchase Orders
- Receiving Report and delivery discrepancy handling

### Phase I-D — Inventory movement and control

- Stock ledger by location
- Warehouse-to-branch and branch-to-branch transfers
- Stock count, wastage, adjustment, and variance review
- Inventory and wastage reports

### Phase I-E — Pilot hardening and rollout

- Pilot reconciliation
- Usability fixes
- Permission review
- Data clean-up
- Training materials and SOPs
- Rollout to remaining branches

---

## 12. Required Documentation Per Phase

Before development begins for a module, maintain the following documents in the repository:

```text
/docs
  ERP_PRODUCT_BRIEF.md
  ERP_PHASE_IMPLEMENTATION_PLAN.md
  ERP_ROLES_AND_PERMISSIONS.md
  ERP_APPROVAL_MATRIX.md
  ERP_MODULE_MAP.md
  ERP_DATA_DICTIONARY.md
  ERP_DESIGN_DECISIONS.md

/design
  COMPONENT_LIBRARY.md
  DASHBOARD_RULES.md
  MOBILE_RULES.md
  DESIGN_TOKENS.md

/specs
  purchasing-workflow.md
  inventory-workflow.md
  branch-operations-workflow.md
  finance-workflow.md
  hr-workflow.md
  expansion-project-workflow.md
```

Minimum required before a module is built:

1. Workflow specification
2. Roles and permission matrix
3. Data fields and validation rules
4. Approval rules and exceptions
5. Status definitions
6. Dashboard/reporting requirements
7. Empty, loading, error, rejected, and permission-denied states
8. Mobile acceptance criteria
9. Audit events and evidence requirements
10. Test scenarios and UAT criteria

---

## 13. Next Working Decision

The next discussion and design activity should focus on **Phase I only**.

Recommended order:

1. Confirm Phase I modules and exclusions.
2. Define the Purchase Request → Purchase Order → Receiving workflow in detail.
3. Define inventory locations, units of measure, transfers, stock count, wastage, and adjustment rules.
4. Create the Phase I roles and permissions matrix.
5. Create the Phase I configurable approval matrix.
6. Define Phase I dashboards, exports, and notifications.
7. Produce the Phase I data dictionary and module-by-module specifications.

---

## 14. Success Definition

The ERP roadmap is successful when OGFI can operate multiple brands and branches from a trusted, auditable platform where branch activity is easy to execute, Head Office controls money and inventory effectively, management sees risks early, and future restaurant clients can be onboarded through configuration rather than a rebuild.


---

## 4.5 Phase 1.5 — Projects & Implementation Tracker

### Objective

Provide a shared, controlled project and task workspace immediately after Phase I is stable. The module addresses implementation coordination that is currently handled through chat groups, spreadsheets, verbal follow-up, and disconnected task boards.

### Included MVP

- Project and project-template setup
- Project membership, project scope, and restricted-project access
- Board and list views using configurable statuses
- Task cards with owner, assignees, priority, dates, checklists, comments, attachments, and activity history
- Milestones, risks, blockers, and blocker reasons
- Related-record links to Phase I documents and future controlled records
- My Tasks, overdue, blocked, and project overview dashboards
- Notifications and escalation rules for assigned, overdue, blocked, and review-required work
- Mobile task completion, comments, photo/upload evidence, and status changes
- Basic project, task, milestone, and blocker reporting/export

### Explicit exclusions

- Advanced Gantt dependency calculations
- Capacity or resource optimization
- External contractor access, client portals, or public project links
- Project budgets inside task cards
- Generic chat replacement
- Unlimited per-user board customization
- Unapproved automation rules

### Exit criteria

Phase 1.5 is complete when an authorized user can create a scoped project from a controlled template, assign work, track overdue or blocked tasks, link work to Phase I records without mutating them, use the workflow on mobile, and produce auditable project status reporting.
