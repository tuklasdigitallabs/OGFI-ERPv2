# OGFI ERP — Module Map

**Document status:** Foundation / Working Baseline  
**Version:** 0.1  
**Primary implementation context:** One Gourmet Foods Inc. (OGFI)  
**Product direction:** Multi-brand, multi-branch F&B and restaurant operations ERP  
**Last updated:** June 25, 2026  
**Related documents:** `ERP_PRODUCT_BRIEF.md`, `ERP_PHASE_IMPLEMENTATION_PLAN.md`

---

## 1. Purpose

This module map defines the functional boundaries of the OGFI ERP. It identifies what each module owns, the records it is responsible for, who uses it, how it connects to other modules, and the phase in which it is introduced.

The goal is to prevent duplicated data, unclear ownership, and fragmented workflows. Each important business record must have one clear source of truth.

This is an operational ERP for multi-brand, multi-branch restaurants. It is designed for One Gourmet Foods Inc. first, but its structure must remain configurable for future restaurant clients.

---

## 2. Core Design Rules

1. **One source of truth per record.** Supplier, item, purchase order, inventory movement, employee, budget, and project records must each have a single owning module.
2. **Company and operating scope are mandatory.** Material records carry a company, relevant brand, operating location or project, department, and cost center where applicable.
3. **Roles control actions; assignments control scope.** A role determines what a user can do. Company, brand, branch, warehouse, department, and project assignments determine where it can be done.
4. **No destructive deletion of important records.** Business transactions are cancelled, reversed, superseded, or archived with a reason and audit trail.
5. **Approvals are reusable platform capability.** Individual modules define what needs approval. The Approval Engine decides the route, delegation, escalation, and action history.
6. **Inventory is movement-based.** Stock balances are derived from controlled movements, never from manually overwritten balances alone.
7. **Modules integrate through approved records.** For example, an approved Purchase Request may create a Purchase Order; a posted Receiving Report creates inventory movements.
8. **Mobile is required for high-frequency branch work.** Requests, receiving confirmation, transfers, stock counts, wastage, checklists, incidents, and approvals must be usable on phone or tablet.
9. **Shared UI spacing token.** All layouts use one shared spacing token for gaps and padding to maintain consistent desktop and mobile layouts.
10. **Configurability over hardcoding.** Approval thresholds, categories, checklists, notification rules, and project stages must be administratively configurable.

---

## 3. Operating Model and Module Domains

```text
Platform / Tenant
  └── Company
       ├── Brand
       │    └── Branch
       ├── Head Office
       ├── Central Warehouse
       ├── Commissary / Central Kitchen
       ├── Project Site
       └── Shared Services
```

### 3.1 Operating locations supported

- Restaurant branch
- Head Office
- Central warehouse
- Commissary / central kitchen
- Project site
- Pop-up, kiosk, event, or temporary location
- Future client-defined location type

### 3.2 Primary functional domains

| Domain | Purpose | Core Modules | Primary Phases |
|---|---|---|---|
| Platform governance | Configuration, security, access, traceability | Administration, Roles & Permissions, Approval Engine, Notifications, Audit | I–V |
| Supply and stock control | Buy, receive, move, count, and control stock | Supplier, Purchasing, Receiving, Inventory, Transfers, Wastage | I |
| Restaurant execution | Operate branches and control food cost | Branch Operations, Recipe & Food Cost, Maintenance, Quality Logs | II |
| Financial and people control | Control budget, spend, payment flow, and workforce operations | Budget & Expenses, Payment Requests, Workforce Operations | III |
| Growth execution | Open new branches under control | Expansion Projects, Opening Readiness | IV |
| Scale and automation | Connect systems and commercialize the product | Integrations, Advanced Analytics, Multi-Tenant Administration | V |

---

## 4. Module Summary

| ID | Module | Primary Owner | Main Users | Phase |
|---|---|---|---|---|
| M01 | Platform Administration | IT / System Admin | Admins, authorized management | I |
| M02 | Organization & Operating Locations | IT / System Admin | Admins, Finance, Operations | I |
| M03 | Users, Roles & Permissions | IT / System Admin | Admins, department heads | I |
| M04 | Approval Engine | System Admin / Management | All requesters and approvers | I |
| M05 | Notifications & Work Queue | Platform | All users | I |
| M06 | Audit Trail & Document Control | Platform / Auditor | Auditors, managers, admins | I |
| M07 | Supplier Management | Purchasing | Purchasing, Finance | I |
| M08 | Item, Category & Unit Master Data | Purchasing / Warehouse | Purchasing, Warehouse, Finance | I |
| M09 | Purchasing | Purchasing | Branches, Purchasing, Finance | I |
| M10 | Receiving | Warehouse / Branch Storekeeper | Warehouse, Storekeeper, Purchasing | I |
| M11 | Inventory Ledger & Stock Control | Warehouse / Operations | Storekeepers, Warehouse, Operations | I |
| M12 | Stock Transfers | Warehouse / Operations | Warehouse, Branch Storekeepers | I |
| M13 | Wastage, Returns & Stock Adjustments | Operations / Warehouse | Branch Managers, Storekeepers, Finance | I |
| M14 | Core Dashboards & Operational Reports | Management / Department Owners | Managers, executives, auditors | I |
| M15 | Recipe, Sub-Recipe & Menu Costing | Operations / R&D / Finance | R&D, Ops, Purchasing, Finance | II |
| M16 | Branch Operations Workspace | Operations | Branch Managers, Supervisors | II |
| M17 | Maintenance & Facilities | Operations / Engineering | Branches, Maintenance, Projects | II |
| M18 | Food Safety, Quality & Compliance Logs | Operations / QA | Branches, QA, Operations | II |
| M19 | Budget & Expense Control | Finance | Finance, managers, requesters | III |
| M20 | Payment Requests & AP Control | Finance / Accounting | Finance, Accounting, approvers | III |
| M21 | Workforce Operations | HR / Operations | HR, branch managers, employees | III |
| M22 | Expansion Project Management | Business Development / Projects | Project team, management | IV |
| M23 | Branch Opening Readiness & Handover | Project / Operations | Projects, HR, IT, Marketing, Ops | IV |
| M24 | Integrations Hub | IT / Platform | Admins, system integrations | V |
| M25 | Advanced Analytics & Forecasting | Management / Finance / Operations | Executives, department heads | V |
| M26 | Multi-Tenant Product Administration | Platform Owner | Platform administrators | V |

---

# 5. Module Definitions

## M01 — Platform Administration

**Purpose:** Maintain global application settings and the system configuration required by all modules.

**Primary owner:** IT / System Administrator  
**Primary users:** System Administrators, authorized management  
**Phase:** I

### Owns

- Company-level configuration
- Global system settings
- Numbering-series rules
- Document templates
- Notification defaults
- Attachment storage policies
- Status and workflow configuration where not owned by a specific module
- Feature flags for phased rollout

### Key records

- Platform settings
- Company settings
- Document numbering rules
- Notification templates
- Feature flags
- Attachment policy settings

### Core functions

- Configure document number formats such as PR, PO, GRN, TRF, WC, and EXP
- Turn modules or feature flags on/off for controlled rollout
- Define default timezone, currency, fiscal year, and date format per company
- Maintain global reference lists shared by several modules
- Control data retention and archival settings

### Inputs

- Company structure from M02
- User administration rules from M03

### Outputs / integrations

- Provides numbering, configuration, and enforcement settings to all modules

### Dependencies

- Foundational; no business transaction module should be released without it.

### Boundary

This module does **not** own business master data such as suppliers, items, employees, or projects. It governs the framework in which those records operate.

---

## M02 — Organization & Operating Locations

**Purpose:** Represent the commercial and physical operating structure of OGFI and future clients.

**Primary owner:** IT / System Administrator, with Finance and Operations validation  
**Primary users:** Admins, Finance, Operations, Management  
**Phase:** I

### Owns

- Company
- Brand
- Branch
- Head Office
- Warehouse
- Commissary / central kitchen
- Project site
- Department
- Cost center
- Operating location attributes

### Key records

- Company profile
- Brand profile
- Operating location
- Department
- Cost center
- Branch-to-warehouse linkage
- Brand-to-location linkage

### Core functions

- Create and maintain unlimited brands and branches
- Support company-level shared locations that are not tied to a single brand
- Assign default warehouse and commissary to each branch where needed
- Activate, deactivate, or archive locations without removing historical records
- Define operating hours, location type, code, address, management assignment, and effective dates

### Inputs

- Organization decisions

### Outputs / integrations

- Provides scope to purchasing, inventory, expenses, operations, workforce, projects, reports, and permissions

### Dependencies

- Required before roles, suppliers, items, transactions, budgets, or projects can be configured.

### Boundary

This module defines **where** work occurs. It does not hold user permissions, stock balances, budget values, or project plans.

---

## M03 — Users, Roles & Permissions

**Purpose:** Control who can access the ERP, what they can do, and the organization scope in which they can do it.

**Primary owner:** IT / System Administrator  
**Primary users:** Admins, department heads, HR for employee linkage  
**Phase:** I

### Owns

- User accounts
- Roles
- Permission sets
- User-to-role assignments
- Scope assignments by company, brand, operating location, department, warehouse, and project
- Temporary access and delegated authority settings

### Key records

- User profile
- Role
- Permission rule
- Scope assignment
- Temporary access grant
- Deactivation record

### Core functions

- Apply least-privilege access by default
- Allow one user to hold several roles or scopes
- Allow management access across all authorized locations
- Restrict branch users to assigned branches by default
- Separate operational data access from confidential financial or HR access
- Support read, create, edit, submit, approve, reject, cancel, receive, post, export, administer, and audit capabilities

### Inputs

- Organization and location records from M02
- Employee links from M21 when workforce module is live

### Outputs / integrations

- Enforces access across all modules
- Feeds approver eligibility to M04
- Feeds audit actor information to M06

### Dependencies

- Required before live transactions.

### Boundary

Roles state **what** a user may do. Scope assignments state **where** the user may do it. The Approval Engine decides whether that user is the approver for a particular transaction.

---

## M04 — Approval Engine

**Purpose:** Route approval-required transactions through configurable, auditable decision paths.

**Primary owner:** Management / System Administrator  
**Primary users:** Requesters, approvers, department heads, Finance, executives  
**Phase:** I

### Owns

- Approval matrix rules
- Approval routes
- Approval steps
- Delegation rules
- Escalation rules
- Approval action history
- Reminder schedules

### Key records

- Approval policy
- Approval route
- Step / condition
- Delegation assignment
- Escalation rule
- Approval action

### Core functions

- Resolve routes based on transaction type, amount, company, brand, location, department, budget status, category, project, and urgency
- Support sequential, parallel, conditional, and optional approval steps
- Support temporary delegated approvers with effective dates
- Send reminders and escalate overdue actions
- Require comments for rejection, return, cancellation, or selected overrides
- Preserve full decision history even after route changes

### Inputs

- Transaction details from business modules
- Roles and scope eligibility from M03
- Budget data from M19 when applicable

### Outputs / integrations

- Returns approved, rejected, returned, pending, overdue, or cancelled decision state to source module
- Feeds M05 notifications and M06 audit history

### Dependencies

- Required by purchasing, stock adjustments, expenses, workforce requests, projects, and other controlled workflows.

### Boundary

The Approval Engine does not own the Purchase Request, PO, payment request, or wastage record. It only owns the approval process associated with those records.

---

## M05 — Notifications & Work Queue

**Purpose:** Show each user the work requiring their action and deliver controlled reminders and escalations.

**Primary owner:** Platform  
**Primary users:** All users  
**Phase:** I

### Owns

- In-app notifications
- User work queue
- Reminder events
- Escalation notifications
- Read / unread state

### Key records

- Notification
- Task / action item
- Reminder event
- Delivery status

### Core functions

- Present pending approvals, assigned tasks, rejected records, returned records, overdue actions, and status changes
- Group work by urgency, due date, module, location, and transaction type
- Support in-app notifications first; email or external channels can be added later
- Link users directly to the applicable record and next action

### Inputs

- Events from M04 and all business modules

### Outputs / integrations

- Alerts users and management dashboards

### Dependencies

- Works with all workflow modules.

### Boundary

Notifications do not change a transaction’s business state. They only communicate that action is required or that an event occurred.

---

## M06 — Audit Trail & Document Control

**Purpose:** Preserve trustworthy history, evidence, and accountability for material actions and documents.

**Primary owner:** Platform / Auditor  
**Primary users:** Auditors, management, Finance, admins  
**Phase:** I

### Owns

- System audit events
- Record activity history
- Attachments and attachment metadata
- Document retention status
- Evidence access controls

### Key records

- Audit event
- Attachment
- Document version
- Evidence requirement

### Core functions

- Log create, edit, submit, approve, reject, receive, post, cancel, reverse, export, permission change, and status transition events
- Capture actor, timestamp, old value, new value, reason, and relevant source record
- Maintain protected attachment history and version metadata
- Allow authorized users to review record history in context
- Support export logs and audit reports

### Inputs

- Events from all modules

### Outputs / integrations

- Provides record-level audit history and compliance reporting

### Dependencies

- Foundational; all material modules must write to it.

### Boundary

This module records evidence and history. It does not decide business policy or approve transactions.

---

## M07 — Supplier Management

**Purpose:** Maintain approved supplier records, commercial details, documentation, and supplier performance context.

**Primary owner:** Purchasing  
**Primary users:** Purchasing, Finance, authorized management  
**Phase:** I

### Owns

- Supplier master records
- Supplier contacts
- Supplier categories
- Accreditation / approval status
- Payment terms and lead times
- Supplier documents
- Supplier performance summary

### Key records

- Supplier
- Supplier contact
- Supplier category assignment
- Accreditation record
- Supplier document
- Supplier status
- Supplier scorecard

### Core functions

- Create, approve, suspend, deactivate, and archive suppliers
- Track supplier tax, bank, contractual, and compliance documents where applicable
- Capture category coverage, delivery lead time, payment terms, and standard operating locations
- Show last purchase price, price trends, delivery performance, and rejection history
- Block or warn against purchasing from unapproved or suspended suppliers based on policy

### Inputs

- Purchasing and Finance controls
- Receiving and PO history

### Outputs / integrations

- Supplier choices to M09 Purchasing
- Supplier performance and price history to M14 reports
- Supplier invoices and terms to M20 Payment Requests

### Dependencies

- M01–M06; used by M09 onward.

### Boundary

Supplier Management owns the supplier profile, not individual quotations, POs, deliveries, or invoices.

---

## M08 — Item, Category & Unit Master Data

**Purpose:** Maintain the controlled catalogue of goods, materials, services, and measurement rules used across purchasing, inventory, recipes, and expenses.

**Primary owner:** Purchasing / Warehouse, with Finance and Operations governance  
**Primary users:** Purchasing, Warehouse, Operations, Finance  
**Phase:** I

### Owns

- Item master
- Item categories
- Units of measure
- Unit conversions
- Storage and handling attributes
- Inventory control flags
- Reorder and par-level references
- Costing method configuration

### Key records

- Item
- Service item
- Category
- Unit of measure
- Conversion rule
- Storage rule
- Item-location setting
- Item supplier reference

### Core functions

- Support food ingredients, packaging, cleaning supplies, smallwares, maintenance items, IT items, equipment, and service purchases
- Define purchase, receiving, stock, transfer, and consumption units
- Maintain controlled unit conversions such as carton → pack → piece or kilogram → gram
- Flag inventory-controlled, expiry-sensitive, batch-tracked, high-value, non-stock, and capitalizable items
- Assign default categories, locations, and approved suppliers

### Inputs

- Purchasing / warehouse governance decisions

### Outputs / integrations

- Used by M09 Purchasing, M10 Receiving, M11 Inventory, M15 Recipes, M19 Expenses, and M22 Projects

### Dependencies

- M01–M02; required before purchasing and inventory transactions.

### Boundary

The item master defines what an item is. It does not contain live stock balances, received quantities, or recipe quantities.

---

## M09 — Purchasing

**Purpose:** Control the request-to-purchase process for stock, non-stock goods, services, equipment, and project requirements.

**Primary owner:** Purchasing  
**Primary users:** Branch requesters, managers, Purchasing, Finance, executives  
**Phase:** I

### Owns

- Purchase Requests (PR)
- Supplier quotations
- Quotation comparisons
- Purchase Orders (PO)
- PO amendments, cancellation, and closure
- Emergency purchase records
- Purchase status tracking

### Key records

- Purchase Request
- PR line item
- Supplier quotation
- Quotation comparison
- Purchase Order
- PO line item
- Emergency purchase request
- Purchase cancellation / amendment request

### Core workflow

```text
Draft PR
→ Submitted PR
→ Approval Engine review
→ Approved PR
→ Supplier quotation / comparison, when required
→ PO creation
→ PO approval, when required
→ Issued PO
→ Receiving
→ PO partially received / fully received / closed
```

### Core functions

- Capture requester, company, brand, location/project, department, cost center, needed date, purpose, category, and item/service lines
- Route requests according to approval policy
- Support consolidated purchasing from multiple approved requests where permitted
- Capture several supplier quotations and compare price, lead time, payment terms, and recommendation
- Maintain PO versioning and prevent uncontrolled post-approval edits
- Support emergency purchases with mandatory urgency reason and post-approval controls
- Track ordered, received, outstanding, cancelled, and returned quantities

### Inputs

- M02 scope, M03 permissions, M04 approvals, M07 suppliers, M08 items
- M19 budget validation in Phase III
- M22 project scope for project purchases in Phase IV

### Outputs / integrations

- Approved POs to M10 Receiving
- Purchase commitments to M19 Budget and M20 Payment Requests
- Supplier and price history to M07 and M14
- Purchase data to M11 inventory via M10

### Dependencies

- M01–M08.

### Boundary

Purchasing owns request, sourcing, comparison, and order commitment. It does **not** post stock; stock is posted only through M10 Receiving or other authorized M11 movements.

---

## M10 — Receiving

**Purpose:** Confirm what was actually delivered or received, identify exceptions, and create the authorized entry point for purchased inventory.

**Primary owner:** Warehouse / Branch Storekeeper  
**Primary users:** Warehouse staff, branch storekeepers, Purchasing, Operations  
**Phase:** I

### Owns

- Receiving Reports / Goods Receipt Notes
- Delivery confirmation
- Rejected, partial, damaged, and incomplete delivery records
- Receiving evidence
- PO receipt status

### Key records

- Receiving Report (GRN)
- Receipt line
- Delivery exception
- Rejection reason
- Damage record
- Receiving attachment / photo

### Core workflow

```text
Issued PO
→ Delivery arrives
→ Quantity / quality check
→ Receiving Report
→ Accepted, partial, rejected, or damaged lines recorded
→ Inventory movement posted for accepted stock
→ PO status updated
```

### Core functions

- Receive against a PO, with policies for approved over-receipt and under-receipt
- Record delivery receipt number, supplier delivery date, receiver, item condition, quantity, unit, lot/batch, and expiry where applicable
- Handle partial delivery, damage, short delivery, rejected goods, and supplier return events
- Require photos or attachments for selected exceptions
- Keep PO outstanding balance visible to Purchasing

### Inputs

- Issued PO from M09
- Item attributes from M08
- Authorization and exception policy from M04

### Outputs / integrations

- Posts accepted stock into M11 Inventory Ledger
- Updates M09 PO fulfilment status
- Feeds M07 supplier performance
- Supports M20 invoice matching in Phase III

### Dependencies

- M08 and M09; M11 must be available for inventory-controlled items.

### Boundary

Receiving confirms delivery. It does not approve vendor payment, modify PO commercial terms, or edit stock balance directly.

---

## M11 — Inventory Ledger & Stock Control

**Purpose:** Maintain the authoritative location-based record of stock quantities, values, movements, counts, and variances.

**Primary owner:** Warehouse / Operations  
**Primary users:** Warehouse Managers, Storekeepers, Branch Managers, Operations, Finance  
**Phase:** I

### Owns

- Inventory ledger
- Inventory balance by item and location
- Stock count sessions
- Count results and variance calculations
- Item-location controls
- Inventory valuation records

### Key records

- Inventory movement
- Stock balance snapshot
- Stock count session
- Count line
- Variance record
- Inventory valuation entry
- Item-location setting

### Core functions

- Maintain stock by company, location, item, unit, and where enabled, lot/batch/expiry
- Derive stock balance from posted movements: receiving, transfers, return, wastage, count adjustment, production issue, and other controlled activity
- Support stock count planning, blind count options, recounts, variance review, and approval before adjustment
- Track available, in-transit, quarantined, damaged, and reserved stock where needed
- Provide movement history and location-level inventory reports

### Inputs

- M10 receiving
- M12 transfers
- M13 wastage, returns, adjustments
- M15 recipe / production consumption in Phase II

### Outputs / integrations

- Stock availability to M09 Purchasing and M16 Branch Operations
- Stock valuation and variance to M14 dashboards and M19/M20 finance workflows
- Theoretical vs actual usage to M15 in Phase II

### Dependencies

- M08 item master, M10 receiving, M06 audit trail.

### Boundary

M11 owns the inventory ledger and balances. It does not own supplier documents, purchase order approval, or wastage justification.

---

## M12 — Stock Transfers

**Purpose:** Control inventory movement between warehouses, commissaries, branches, and eligible locations.

**Primary owner:** Warehouse / Operations  
**Primary users:** Warehouse staff, branch storekeepers, Operations  
**Phase:** I

### Owns

- Transfer request
- Transfer order
- Dispatch confirmation
- In-transit status
- Receiving confirmation
- Transfer discrepancy record

### Key records

- Transfer Request
- Transfer Order
- Dispatch note
- Transfer receipt
- Transfer discrepancy

### Core workflow

```text
Transfer request / replenishment trigger
→ Approval, when required
→ Transfer order
→ Sender dispatch confirmation
→ Stock moves to in-transit
→ Receiver confirms receipt
→ Stock posts to destination location
→ Discrepancy resolution, if any
```

### Core functions

- Support warehouse-to-branch, commissary-to-branch, branch-to-branch, and warehouse-to-project transfers
- Preserve sender, receiver, source, destination, in-transit, and final receipt history
- Require both dispatch and receipt confirmation for controlled transfers
- Record shortages, damages, and rejected transfer quantities
- Prevent duplicate receipt and unauthorized destination changes

### Inputs

- Item and inventory availability from M08/M11
- Approvals from M04 where policy requires

### Outputs / integrations

- Posts inventory movements to M11
- Feeds transfer status to M14
- Supports branch replenishment and future automated suggestions in M25

### Dependencies

- M11 inventory ledger.

### Boundary

Transfers move existing company stock. They do not create supplier obligations or replace receiving from a third-party supplier.

---

## M13 — Wastage, Returns & Stock Adjustments

**Purpose:** Record and control non-routine stock reductions, supplier returns, spoilage, employee meals, complimentary use, test use, and inventory corrections.

**Primary owner:** Operations / Warehouse, with Finance oversight  
**Primary users:** Branch Managers, Storekeepers, Warehouse, Operations, Finance  
**Phase:** I

### Owns

- Wastage declarations
- Spoilage records
- Return-to-supplier records
- Staff meal and complimentary consumption records
- Test kitchen / R&D stock use
- Stock adjustment requests
- Adjustment approval and posting status

### Key records

- Wastage record
- Reason category
- Evidence attachment
- Stock adjustment request
- Return-to-supplier record
- Consumption exception record

### Core workflow

```text
Record exception
→ Attach reason/evidence where required
→ Approval review based on value, category, and location
→ Approved posting
→ Inventory movement and financial impact recorded
→ Trend reporting and investigation follow-up
```

### Core functions

- Require reason, item, quantity, unit, location, date, value estimate, and responsible person
- Require evidence such as photo or incident reference for defined categories or thresholds
- Separate operational wastage from count variance and supplier return
- Allow controlled adjustments only after required approval
- Flag recurring wastage patterns by item, branch, shift, and category

### Inputs

- Item and stock data from M08/M11
- Approval policies from M04
- Incident and food safety references from M16/M18 in Phase II

### Outputs / integrations

- Posts inventory movements to M11
- Feeds reports in M14
- Feeds actual food cost analysis in M15
- Feeds budget and financial reporting in M19

### Dependencies

- M11 inventory, M04 approvals, M06 audit.

### Boundary

This module owns justification and control of the exception. M11 owns the resulting inventory movement and balance.

---

## M14 — Core Dashboards & Operational Reports

**Purpose:** Give management and operational users timely visibility of work, exceptions, and performance from approved source data.

**Primary owner:** Management and respective department owners  
**Primary users:** Executives, General Manager, Operations, Finance, Purchasing, Warehouse, Branch Managers, Auditors  
**Phase:** I

### Owns

- Dashboard configuration
- Report definitions
- Saved filters and authorized report exports
- KPI presentation rules

### Key records

- Dashboard definition
- Report definition
- Saved view
- Export event

### Core functions

- Filter by company, brand, branch, warehouse, department, cost center, project, requester, status, supplier, item category, and date
- Show pending approvals, PR/PO status, receiving delays, stock movements, transfer status, wastage, adjustment activity, count variance, and supplier purchase history
- Support branch-level and management consolidated views according to permissions
- Export approved reports to Excel and PDF where relevant
- Link report lines to the source transaction and audit history

### Inputs

- Read-only, governed data from all source modules

### Outputs / integrations

- Management decision support
- Phase II–V expanded KPI and forecasting layers

### Dependencies

- Source modules must be live and data quality accepted.

### Boundary

Reports do not own or modify business data. Source modules remain the system of record.

---

## M15 — Recipe, Sub-Recipe & Menu Costing

**Purpose:** Maintain standardized recipes and convert inventory costs into menu-item cost, food-cost, and margin analysis.

**Primary owner:** Operations / R&D, with Finance validation  
**Primary users:** R&D, Operations, Purchasing, Finance, brand management  
**Phase:** II

### Owns

- Recipe and sub-recipe master
- Recipe versions
- Portion yield and conversion assumptions
- Menu-item cost calculation
- Theoretical consumption model
- Food-cost target configuration

### Key records

- Recipe
- Sub-recipe
- Recipe ingredient line
- Recipe version
- Yield profile
- Menu item cost record
- Theoretical consumption run

### Core functions

- Link menu items to ingredients and sub-recipes
- Maintain recipe versions without overwriting historical costing
- Support raw-to-cooked yield, trimming loss, portioning, and unit conversions
- Calculate cost per serving, gross margin, and food-cost percentage
- Compare theoretical consumption from POS sales against actual inventory usage
- Flag variance by branch, item, menu item, and date range

### Inputs

- Item costs and movements from M08/M11
- POS sales through M24 in Phase V or controlled import earlier

### Outputs / integrations

- Food cost and variance to M14/M25
- Menu launch and promotion planning to M16 and M22

### Dependencies

- M08 item master and M11 inventory; POS integration or data import for full theoretical analysis.

### Boundary

Recipes own expected consumption. Inventory owns actual movements and balances. POS owns sales transactions.

---

## M16 — Branch Operations Workspace

**Purpose:** Give branch teams a practical daily workspace for required operating activities, issues, checks, and manager follow-up.

**Primary owner:** Operations  
**Primary users:** Restaurant Managers, Supervisors, branch staff, Operations Managers  
**Phase:** II

### Owns

- Opening and closing checklists
- Daily manager logbook
- Operational incident records
- Customer complaint records
- Branch action items
- Operational task templates

### Key records

- Checklist template
- Checklist completion
- Daily log entry
- Incident record
- Customer complaint
- Action item
- Corrective action plan

### Core functions

- Provide branch-specific daily checklist templates
- Track opening, closing, cash, equipment, staffing, and operational readiness checks
- Record incidents such as service failure, customer complaint, outage, cash variance, safety issue, and supplier issue
- Assign corrective actions with due dates, ownership, and verification
- Allow photo evidence and mobile completion
- Surface unresolved issues on branch and management dashboards

### Inputs

- M02 locations, M03 access, M04 approval for defined exceptions
- M17 maintenance and M18 quality issue links

### Outputs / integrations

- Links to M13 for stock-related incidents and wastage
- Links to M17 maintenance tickets
- Links to M18 food safety non-conformance
- Feeds M14 dashboards

### Dependencies

- M01–M06; inventory modules available for stock-linked issues.

### Boundary

The Branch Operations Workspace records execution and incidents. It does not replace HR records, maintenance work orders, inventory posting, or finance approvals.

---

## M17 — Maintenance & Facilities

**Purpose:** Track equipment faults, preventive maintenance, repair requests, vendors, downtime, and resolution accountability.

**Primary owner:** Operations / Engineering / Maintenance  
**Primary users:** Branch Managers, Maintenance staff, Operations, Projects  
**Phase:** II

### Owns

- Asset and equipment register where operationally required
- Maintenance request / ticket
- Preventive maintenance schedule
- Work order
- Downtime record
- Repair history

### Key records

- Equipment asset
- Maintenance ticket
- Work order
- Preventive maintenance plan
- Downtime event
- Repair completion record

### Core functions

- Log branch equipment issues with severity, photo, location, and affected operation
- Route tickets to maintenance staff or supplier/contractor
- Track acknowledgement, in-progress work, resolution, verification, and closure
- Schedule preventive maintenance and recurring checks
- Report recurring failures, downtime, and repair costs

### Inputs

- Branch issue reports from M16
- Purchased equipment and vendors from M09/M07
- Project handover assets from M23

### Outputs / integrations

- Feeds M19 expense and budget controls
- Feeds M14 and M25 reliability dashboards

### Dependencies

- M16, M07, M09; asset-level controls may be expanded later.

### Boundary

Maintenance controls technical repair work. It does not process vendor payment, general purchasing, or construction project management.

---

## M18 — Food Safety, Quality & Compliance Logs

**Purpose:** Capture restaurant quality, hygiene, food safety, and required compliance checks in a controlled format.

**Primary owner:** Operations / QA  
**Primary users:** Branch teams, QA, Operations Managers  
**Phase:** II

### Owns

- Temperature logs
- Cleaning and sanitation logs
- Quality inspection records
- Food safety non-conformance records
- Corrective action plans
- Compliance checklist templates

### Key records

- Temperature log
- Cleaning log
- Inspection record
- Non-conformance
- Corrective action
- Compliance checklist

### Core functions

- Maintain configurable daily, shift, weekly, and monthly checklists
- Capture threshold readings, exceptions, photos, and corrective action
- Escalate missed or failed checks
- Link non-conformance to affected items, equipment, batch, branch, incident, or wastage where applicable
- Provide compliance status dashboard by branch and date

### Inputs

- Branch and item information from M02/M08
- Equipment links from M17
- Operational issue references from M16

### Outputs / integrations

- May generate M13 wastage where stock must be discarded
- Feeds management compliance reports and future audit workflows

### Dependencies

- M16 and M17; M13 integration for stock disposal.

### Boundary

This module records compliance control and evidence. It does not own HR disciplinary actions or inventory balances.

---

## M19 — Budget & Expense Control

**Purpose:** Control operating and project spend against approved budgets and expense policies.

**Primary owner:** Finance / Accounting  
**Primary users:** Finance, department managers, branch managers, project owners  
**Phase:** III

### Owns

- Budget plans and revisions
- Expense requests
- Petty cash requests and liquidations
- Cash advances
- Expense categories and allocation rules
- Budget-versus-actual calculations

### Key records

- Budget plan
- Budget line
- Budget revision
- Expense request
- Cash advance
- Petty cash fund
- Liquidation record
- Expense allocation

### Core functions

- Maintain budget by company, brand, branch, department, cost center, expense category, project, and period
- Validate budget availability during purchase and expense workflows
- Flag budgeted versus unbudgeted spend
- Support operating expense requests, petty cash, cash advance, receipt capture, liquidation, and replenishment
- Require approval and evidence based on expense policy
- Track committed, actual, remaining, and over-budget values

### Inputs

- Purchase commitments from M09
- Receiving and actual consumption context from M10/M11/M13
- Project budgets from M22

### Outputs / integrations

- Budget validation to M04 and M09
- Payment readiness to M20
- Budget dashboards to M14/M25

### Dependencies

- M02 organization, M04 approvals, M09 purchasing, M20 payment lifecycle.

### Boundary

This module owns budget and expense control. It does not replace the accounting ledger or bank reconciliation unless expanded through integrations.

---

## M20 — Payment Requests & AP Control

**Purpose:** Manage payment readiness, document matching, approval, and status tracking for supplier and expense obligations.

**Primary owner:** Finance / Accounting  
**Primary users:** Finance, Accounting, managers, authorized signatories  
**Phase:** III

### Owns

- Payment Request
- Invoice / bill capture
- Three-way or document matching status
- Payment approval status
- Payment release status
- Accounts-payable tracking reference

### Key records

- Supplier invoice
- Payment Request
- Match record
- Payment approval
- Payment status
- Payment reference

### Core functions

- Capture supplier invoices and branch/project expense documents
- Match PO, receiving report, invoice, and payment request when applicable
- Flag price/quantity discrepancies and missing documents
- Route payment approvals according to policy and amount
- Track prepared, pending approval, approved, scheduled, released, paid, held, and cancelled status
- Support export or integration to accounting/banking systems later

### Inputs

- M09 PO, M10 Receiving, M19 budget/expense, M07 supplier data

### Outputs / integrations

- Accounts payable tracking, Finance dashboards, accounting integrations through M24

### Dependencies

- M09, M10, M19, M04.

### Boundary

This module manages payment control and readiness. It does not replace the general ledger, statutory accounting, or bank system.

---

## M21 — Workforce Operations

**Purpose:** Manage operational employee information, branch assignment, schedule-related requests, workforce movements, and compliance reminders without prematurely replacing a complete payroll platform.

**Primary owner:** HR / Admin, with Operations participation  
**Primary users:** HR, Branch Managers, employees, Operations Managers  
**Phase:** III

### Owns

- Employee master operational profile
- Position, department, and home branch assignment
- Employee transfer history
- Leave and overtime requests
- Schedule and manpower plan
- Training records
- Document expiry alerts
- Manpower requisitions

### Key records

- Employee profile
- Position assignment
- Branch assignment
- Employee transfer
- Leave request
- Overtime request
- Schedule plan
- Training record
- Document compliance record
- Manpower requisition

### Core functions

- Maintain employee effective-dated assignment to brand, branch, department, and position
- Support temporary cross-branch deployment with approvals
- Capture operational leave, overtime, and schedule-change requests
- Support manpower requisitions and staffing gaps by branch
- Track training attendance, certifications, and document expiry
- Restrict compensation and sensitive HR information by role

### Inputs

- Organization, roles, and approvals from M02–M04
- Attendance imports/integrations later through M24

### Outputs / integrations

- Staffing information to M16 operations dashboard and M23 opening readiness
- Workforce reports to M14/M25

### Dependencies

- M02, M03, M04, M05.

### Boundary

This module supports operational workforce control. Full payroll computation, statutory deductions, and HRIS recruitment may be separate expansion modules or integrations.

---

## M22 — Expansion Project Management

**Purpose:** Manage new branch, renovation, relocation, and major capital projects from opportunity through post-opening review.

**Primary owner:** Business Development / Expansion / Project Management  
**Primary users:** Project Managers, Business Development, Finance, Operations, HR, Marketing, IT, executives  
**Phase:** IV

### Owns

- Expansion project record
- Stage / pipeline status
- Site evaluation
- Feasibility assumptions
- Capex budget
- Project schedule and milestones
- Project risk and issue log
- Change order / scope change control
- Project documents

### Key records

- Project
- Site evaluation
- Feasibility case
- Capex budget
- Milestone
- Risk
- Issue
- Change order
- Project document
- Project vendor / contract reference

### Standard lifecycle

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

### Core functions

- Track site details, landlord/mall contacts, area, rent, commercial assumptions, timelines, and decision history
- Capture feasibility values such as sales forecast, capex, rent-to-sales, payback, ROI, NPV, IRR, and break-even assumptions where configured
- Maintain project budget by category, committed cost, actual cost, change order, and contingency
- Track permits, lease documents, construction milestones, procurement, risks, blockers, and owners
- Escalate delayed critical-path milestones and budget overruns

### Inputs

- M02 locations/project site, M04 approvals, M07 suppliers, M09 purchasing, M19 budgets, M20 payment status

### Outputs / integrations

- Project dashboards to M14/M25
- Opening readiness to M23
- Asset and branch setup handover to M02/M17/M21

### Dependencies

- Phase I purchase, approval, supplier, document, and audit foundation; Phase III budget/payment controls.

### Boundary

M22 owns the project plan and project governance. It does not replace branch operational workflows after the branch has opened.

---

## M23 — Branch Opening Readiness & Handover

**Purpose:** Ensure a new or renovated branch is operationally ready before opening and that responsibilities are formally handed from project team to operations.

**Primary owner:** Project Management / Operations  
**Primary users:** Project team, Operations, HR, IT, Purchasing, Marketing, Finance, branch management  
**Phase:** IV

### Owns

- Opening-readiness template
- Readiness tasks
- Waiver / exception approvals
- Handover checklist
- Go / no-go status
- Post-opening review schedule

### Key records

- Readiness checklist
- Readiness task
- Readiness evidence
- Waiver
- Handover record
- Opening decision
- 30/60/90-day review

### Core functions

- Configure readiness categories: lease/permits, construction, equipment, IT/POS, hiring, training, opening inventory, menu setup, marketing, utilities, safety, finance, and mall requirements
- Assign accountable owner, due date, required evidence, completion criteria, and escalation level for each task
- Prevent “Ready to Open” status unless mandatory items are complete or formally waived
- Record executive opening approval and branch handover to Operations
- Schedule post-opening reviews and compare actual performance against feasibility assumptions

### Inputs

- Project records from M22
- Workforce readiness from M21
- Procurement / inventory readiness from M09–M13
- Maintenance assets from M17

### Outputs / integrations

- Creates operational handover records for M02 and M16
- Feeds post-opening dashboards to M14/M25

### Dependencies

- M22, M21, purchasing/inventory, budget, and approval foundation.

### Boundary

This module owns readiness and handover. It does not replace the project’s detailed schedule or the branch’s daily operations after handover.

---

## M24 — Integrations Hub

**Purpose:** Provide controlled, monitored connections between the ERP and external systems.

**Primary owner:** IT / Platform  
**Primary users:** Admins, system owners, authorized technical users  
**Phase:** V

### Owns

- Integration configuration
- API credentials / secure connection references
- Import/export mappings
- Sync jobs
- Error logs and retry queues
- Data reconciliation status

### Key records

- Integration connection
- Mapping configuration
- Sync job
- Import batch
- Error log
- Reconciliation record

### Target integrations

- POS sales data
- Accounting software
- Attendance / biometric system
- Banking and payment status feeds where viable
- Email / notification systems
- Supplier portals
- Business intelligence tools

### Core functions

- Authenticate and monitor external connections
- Map external identifiers to ERP master data
- Validate, queue, retry, and reconcile imported/exported records
- Keep integration failures visible and auditable
- Prevent external sync from bypassing ERP approval and audit controls

### Inputs

- External systems and ERP master/transaction records

### Outputs / integrations

- Feeds M15 food-cost analysis, M20 finance status, M21 attendance, and M25 analytics

### Dependencies

- Stable master data and source workflows from earlier phases.

### Boundary

This module transports and reconciles data. It does not become the system of record for POS, banking, accounting, or biometric data unless explicitly designed later.

---

## M25 — Advanced Analytics & Forecasting

**Purpose:** Convert trusted operating data into predictive insights, exception alerts, demand planning, and executive decision support.

**Primary owner:** Management / Finance / Operations  
**Primary users:** Executives, General Manager, Finance, Operations, Purchasing, Business Development  
**Phase:** V

### Owns

- Advanced KPI definitions
- Forecast models and assumptions
- Replenishment recommendations
- Demand planning scenarios
- Advanced exception rules
- Executive analytics views

### Key records

- Forecast configuration
- Forecast run
- Replenishment recommendation
- Scenario plan
- Alert rule

### Core functions

- Forecast demand using sales, seasonality, events, branch patterns, and historical consumption where data quality allows
- Recommend replenishment based on par levels, lead times, availability, and forecast demand
- Identify price trends, recurring wastage, projected stockouts, budget risk, and low-performing branches
- Present executive dashboards across brands, branches, projects, and departments
- Support controlled export to BI tools when needed

### Inputs

- Clean source data from M09–M24

### Outputs / integrations

- Recommendations to purchasing, inventory, operations, Finance, and expansion planning

### Dependencies

- Data quality and integration maturity must be demonstrated before forecasting is relied upon.

### Boundary

Recommendations must remain reviewable by authorized users. This module should not automatically create financial commitments or stock movements without a controlled workflow.

---

## M26 — Multi-Tenant Product Administration

**Purpose:** Prepare the ERP for sale and configuration by other restaurant companies while maintaining strict data isolation.

**Primary owner:** Platform Owner / Super Admin  
**Primary users:** Platform administrators only  
**Phase:** V

### Owns

- Tenant/company provisioning
- Tenant-level configuration templates
- Module subscription / entitlement controls
- Branding and white-label settings
- Tenant isolation policies
- Client onboarding and offboarding process

### Key records

- Tenant profile
- Subscription / entitlement
- Configuration template
- Branding profile
- Tenant administrator
- Provisioning checklist

### Core functions

- Create a separate company/tenant environment with isolated records, users, attachments, and configuration
- Apply restaurant workflow templates while allowing client-level policy configuration
- Manage enabled modules, storage limits, user limits, and subscription state where commercialized
- Support safe client onboarding, migration, backup, and offboarding procedures

### Inputs

- Stable configurable modules and permissions from all earlier phases

### Outputs / integrations

- Supports product delivery to restaurant clients

### Dependencies

- Architecture must enforce tenant isolation from the beginning, even though this full administration module arrives in Phase V.

### Boundary

This module governs platform clients. It must never grant one tenant visibility into another tenant’s records.

---

# 6. Cross-Module Workflow Map

## 6.1 Purchase-to-stock-to-payment

```text
M08 Item Master + M07 Supplier
        ↓
M09 Purchase Request / Quotation / Purchase Order
        ↓
M04 Approval Engine
        ↓
M10 Receiving Report
        ↓
M11 Inventory Ledger
        ↓
M19 Budget / Expense Actualization
        ↓
M20 Invoice Matching & Payment Request
        ↓
M24 Accounting / Bank Integration (Phase V)
```

## 6.2 Warehouse-to-branch replenishment

```text
M11 Stock Availability or M25 Recommendation
        ↓
M12 Transfer Request / Transfer Order
        ↓
M04 Approval Engine, where configured
        ↓
Sender Dispatch Confirmation
        ↓
In-Transit Stock
        ↓
Receiver Confirmation
        ↓
M11 Source and Destination Ledger Posting
```

## 6.3 Inventory exceptions

```text
M13 Wastage / Return / Adjustment Record
        ↓
M04 Approval Engine, where configured
        ↓
M11 Inventory Ledger Posting
        ↓
M14 Variance and Wastage Reporting
        ↓
M15 Actual Food Cost Analysis (Phase II)
        ↓
M19 Financial Impact (Phase III)
```

## 6.4 Branch incident to corrective action

```text
M16 Branch Incident / Complaint / Checklist Failure
        ↓
Assigned Action Item
        ├── M17 Maintenance Ticket, if equipment-related
        ├── M18 Quality / Food Safety Non-Conformance, if compliance-related
        └── M13 Wastage, if stock requires disposal
        ↓
Verification and Closure
        ↓
M14 Dashboard / Management Review
```

## 6.5 Expansion project to branch handover

```text
M22 Project Pipeline / Feasibility / Budget / Milestones
        ↓
M09 Purchasing + M19 Budget + M20 Payment Controls
        ↓
M23 Opening Readiness
        ├── M21 Hiring / Training
        ├── M17 Equipment / Maintenance Handover
        ├── M11 Opening Inventory
        └── M16 Operational Readiness
        ↓
Opening Approval
        ↓
Branch activated in M02
        ↓
30 / 60 / 90-day review
```

---

# 7. Ownership Boundaries That Must Not Be Blurred

| Business Need | System of Record | Not Owned By |
|---|---|---|
| User access | M03 Users, Roles & Permissions | Individual module settings alone |
| Approval route and action history | M04 Approval Engine | PR, PO, expense, or project module |
| Supplier profile and approval status | M07 Supplier Management | Purchase Order |
| Item definition, UOM, conversions | M08 Item Master | Inventory transaction |
| Purchase request, quotation, PO | M09 Purchasing | Receiving or Inventory |
| Confirmation of delivered quantities | M10 Receiving | Purchase Order |
| Stock balance and ledger | M11 Inventory | Wastage or Transfer record |
| Transfer lifecycle | M12 Stock Transfers | Generic inventory adjustment |
| Wastage justification and exception policy | M13 Wastage & Adjustments | Inventory count session |
| Operational checklists and incidents | M16 Branch Operations | Maintenance or HR |
| Equipment repair work | M17 Maintenance | Purchasing or Project plan |
| Food safety compliance evidence | M18 Quality & Compliance | Wastage / incident alone |
| Budget availability and expense actualization | M19 Budget & Expense | Purchase Request |
| Invoice/payment readiness | M20 Payment Requests | Purchase Order |
| Employee deployment and workforce requests | M21 Workforce Operations | User access module |
| Project lifecycle and capex tracking | M22 Expansion Projects | Branch Operations |
| Opening readiness and handover | M23 Branch Opening Readiness | Project timeline alone |
| API imports/sync reliability | M24 Integrations Hub | Source module |
| Predictive analytics and recommendations | M25 Advanced Analytics | Transaction modules |
| Client / tenant isolation and provisioning | M26 Multi-Tenant Administration | Company configuration alone |

---

# 8. Phase Ownership and Release Boundaries

## Phase I — Minimum operational-control release

Must include M01 through M14, but with M14 limited to source-data dashboards and reports.

**Go-live goal:** A branch or warehouse can submit and approve a request, issue a PO, receive goods, transfer stock, count stock, report wastage, and provide a traceable audit trail.

**Explicitly excluded:** Recipes, daily branch checklists, budgets, payment processing, HR workflows, projects, POS integration, forecasting, and multi-tenant administration screens.

## Phase II — Restaurant execution release

Adds M15 through M18.

**Go-live goal:** Management can connect branch execution, food cost, operational issues, equipment, and compliance controls to inventory data.

## Phase III — Finance and workforce control release

Adds M19 through M21.

**Go-live goal:** Finance can control operating spend and payment readiness while HR and Operations can manage employee assignment and workforce workflows.

## Phase IV — Expansion release

Adds M22 and M23.

**Go-live goal:** OGFI can manage a new branch from site opportunity to readiness, handover, and post-opening review.

## Phase V — Scale and commercial product release

Adds M24 through M26.

**Go-live goal:** Integrations, advanced analysis, and client-ready multi-tenant administration are reliable enough to support productization.

---

# 9. Standard Status Patterns

To keep modules consistent, use these status patterns unless a module requires a documented exception.

| Record Type | Suggested Standard Statuses |
|---|---|
| Requests | Draft → Submitted → Pending Approval → Returned → Approved / Rejected → Cancelled / Closed |
| Purchase Orders | Draft → Pending Approval → Approved → Issued → Partially Received → Fully Received → Closed / Cancelled |
| Receiving | Draft → Confirmed → Posted → Reversed / Cancelled where authorized |
| Transfers | Draft → Pending Approval → Approved → Dispatched → In Transit → Received → Discrepancy Review → Closed / Cancelled |
| Stock Counts | Planned → In Progress → Submitted → Variance Review → Approved → Posted → Closed |
| Wastage / adjustments | Draft → Submitted → Pending Approval → Approved → Posted → Closed / Rejected / Cancelled |
| Maintenance | Reported → Assigned → In Progress → Resolved → Verified → Closed |
| Projects | Lead → Evaluation → Feasibility → Approved → Active → Pre-Opening → Opened → Post-Opening Review → Closed / On Hold / Cancelled |
| Readiness tasks | Not Started → In Progress → Blocked → Complete → Waived |

---

# 10. Core Data Relationships

```text
Company
 ├── Brands
 ├── Operating Locations
 ├── Departments / Cost Centers
 ├── Users and Scope Assignments
 ├── Suppliers
 ├── Items / Units / Categories
 ├── Purchase Requests → Purchase Orders → Receiving → Inventory Movements
 ├── Transfers / Counts / Wastage / Returns → Inventory Movements
 ├── Recipes → Ingredients → Theoretical Usage / Food Cost
 ├── Budgets → Expenses / Commitments / Payments
 ├── Employees → Assignments / Workforce Requests
 └── Projects → Feasibility / Budget / Milestones / Readiness / Handover
```

---

# 11. Module-Level Success Indicators

| Module Group | Initial Success Measure |
|---|---|
| Administration & permissions | Users only access authorized locations and actions; no critical access exceptions remain unresolved |
| Approval engine | Approvals are traceable, delegated appropriately, and overdue actions are visible |
| Purchasing | PR and PO status can be located immediately; PO issuance is tied to approved requests |
| Receiving & inventory | Every accepted delivery and transfer changes stock through a controlled ledger entry |
| Wastage & adjustments | Material stock exceptions carry reason, value, approval, and evidence where required |
| Dashboards | Management can identify pending approvals, outstanding POs, transfer delays, and count variance without manual consolidation |
| Recipes & branch operations | Actual-versus-theoretical food cost and branch operational issues are visible by branch |
| Finance & workforce | Budget use, payment readiness, employee deployment, and manpower gaps are controlled in one workflow |
| Expansion | Opening readiness and project spend are visible before the target opening date is missed |
| Productization | Each future client is isolated and configurable without code changes to core workflows |

---

# 12. Implementation Notes

1. **Do not build every module as a separate silo.** Shared context fields, audit logging, approval capability, attachments, and notifications must be designed as reusable platform services.
2. **Do not make inventory editable as a number field.** All balance changes need a transaction source, movement type, reference, actor, timestamp, and approval context if applicable.
3. **Do not let dashboards create shadow data.** Dashboards must read from source modules; fixes happen in the source workflow.
4. **Do not hardcode OGFI’s current organization.** Brands, branches, departments, cost centers, roles, categories, and approval thresholds are configuration.
5. **Do not delay Phase I for Phase II–V integrations.** Create clean integration boundaries but release core operational control first.
6. **Use shared identifiers and a standard reference format.** Every record needs a stable ID plus human-readable document number.
7. **Maintain an end-to-end audit view.** A manager should be able to open a PR and see its approval route, PO, receiving, related inventory movement, attachments, and downstream payment status when available.

---

## Next Documents

The recommended next documentation sequence is:

1. `ERP_ROLES_AND_PERMISSIONS.md`
2. `ERP_APPROVAL_MATRIX.md`
3. `ERP_DATA_DICTIONARY.md`
4. `specs/purchasing-workflow.md`
5. `specs/inventory-workflow.md`
6. `specs/branch-operations-workflow.md`



---

## Projects & Implementation Module — Phase 1.5

### Purpose

A shared, ERP-native coordination module for implementation work across branches, Head Office, warehouses, departments, and future expansion sites. It tracks ownership, timing, dependencies, blockers, evidence, and progress without creating parallel financial or inventory records.

### Module owns

- Projects and project templates
- Project members and project visibility rules
- Project statuses, task board configuration, milestones, risks, and blockers
- Task cards, task checklists, assignees, due dates, comments, attachments, and task activity
- Project/task-to-ERP record links
- Project implementation dashboards and reports

### Module does not own

- Purchase Request, Purchase Order, receiving, payment, approval, inventory, or supplier lifecycle state
- Inventory movements or balances
- Budget commitments or actual financial postings
- Expansion feasibility, lease, capex, and construction controls that belong to the specialized Phase IV Expansion module

### Dependencies

- Organization, location, user, role, and scope model
- Attachment and audit services
- Notifications and background escalation worker
- Phase I source-record link resolution and permission checks
- Shared Modern SaaS UI components

### Key integration rule

A Project Task may link to a controlled ERP record through a reference relation. The tracker displays that record’s current summary state, but no project task action may directly update the linked record.
