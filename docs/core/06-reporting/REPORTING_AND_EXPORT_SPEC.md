# OGFI ERP — Reporting and Export Specification

**Status:** Phase I baseline  
**Purpose:** Define operational reports, dashboards, export controls, and report-level access for purchasing and inventory control.

---

## 1. Reporting principles

1. Reports are read models; transaction records and inventory ledger remain the source of truth.
2. Every report displays the active company, brand, location scope, date range, timezone, generated timestamp, and applied filters.
3. Scope permissions are enforced at query time. Export must never reveal data outside the user’s authorization.
4. Reports must support drill-down to underlying records where the user has permission.
5. Excel/CSV exports are standard for operational analysis; PDF is supported for formal, shareable summaries where needed.
6. Reports must distinguish `draft`, `submitted`, `approved`, `issued`, `received`, `cancelled`, `reversed`, and other meaningful states.

## 2. Phase I dashboards

### 2.1 Executive / management dashboard

- Pending approvals by age and value
- Open PO value and status
- Delivery due / overdue summary
- Low and critical stock by branch/location
- Stock counts due and overdue
- Wastage value by location/category
- Open stock variances and adjustments
- Supplier delivery/discrepancy indicators
- Branch/location operational risk list

### 2.2 Branch dashboard

- My approvals and tasks
- Deliveries expected today
- Low / critical stock
- Transfers awaiting dispatch or receipt
- Stock counts due
- Wastage and adjustment actions pending
- Open receiving discrepancies

### 2.3 Purchasing / warehouse dashboard

- PR and PO aging
- RFQ / quotation comparison queue
- Delivery schedule and overdue receiving
- Transfer queue
- Supplier exceptions
- Inventory criticality list by assigned scope

### 2.4 Current implementation note

The current Operations Dashboard is a selected-location, read-only Phase I dashboard. It displays generated-at freshness, active company/brand/location scope, permission-gated KPI cards, assigned approval queue items, and source-linked exceptions from purchase requests, purchase orders, receiving, transfers, stock counts, wastage, stock adjustments, and inventory ledger reconciliation. It reuses server-side scoped services and `listPendingApprovals()` for approval visibility. The DEC-0036 `reporting.dashboard.unreconciled_mode` policy is enforced for reconciliation-dependent dashboard values: `block` suppresses the ledger-variance card and exception rows and replaces them with a source-health warning, while `warn_and_link` and `show_only` keep the values visible with their configured trust posture. The dashboard does not provide all-location aggregation, project tracker metrics, attachment previews, stock posting, receiving, dispatch, approval, or other workflow mutation actions.

## 3. Required Phase I reports

| Report | Primary users | Core filters | Core columns / measures | Export |
|---|---|---|---|---|
| Purchase Request Register | Purchasing, Operations, Finance | Date, status, location, department, requester, urgency | PR no., requester, location, required date, status, approver, estimated total | XLSX, CSV, PDF summary |
| Purchase Request Aging | Purchasing, Management | Aging bucket, status, location | PR no., age, current step, current approver, value, urgency | XLSX, CSV |
| Purchase Order Status | Purchasing, Finance, Management | Date, supplier, location, status | PO no., supplier, ordered/received/outstanding value, expected date, status | XLSX, CSV, PDF |
| Open Delivery / Overdue Delivery | Purchasing, Warehouse, Branch Managers | Expected date, supplier, location | PO no., supplier, expected date, days overdue, receiving status | XLSX, CSV |
| Supplier Price History | Purchasing, Finance | Supplier, item, date range | Item, supplier, UOM, price, effective date, change % | XLSX, CSV |
| Supplier Delivery Performance | Purchasing, Management | Supplier, date, location | On-time %, complete %, discrepancies, rejected qty/value | XLSX, CSV, PDF summary |
| Inventory On-Hand | Warehouse, Branch, Operations | Location, category, item, status | Item, UOM, on hand, par, available status, inventory value, last movement | XLSX, CSV |
| Low / Critical Stock | Branch, Warehouse, Purchasing | Location, category, status | Item, on hand, par, shortage, suggested source/action | XLSX, CSV |
| Stock Movement Ledger | Warehouse, Finance, Auditor | Item, location, movement type, date | Movement no., date, item, qty in/out, source, destination, reference, balance after | XLSX, CSV |
| Transfer Status | Warehouse, Operations | Source, destination, status, date | Transfer no., source, destination, dispatch/receipt date, status, variance | XLSX, CSV |
| Stock Count Variance | Warehouse, Finance, Operations | Location, count date, category, status | Item, system qty, counted qty, variance qty/value, approver, reason | XLSX, CSV, PDF summary |
| Wastage Report | Operations, Finance, Branch Managers | Location, date, reason, category, policy flag, evidence status | Wastage no., item, qty, value, reason, evidence, status, policy flags, evidence required/satisfied, posting status | XLSX, CSV, PDF summary |
| Stock Adjustment Report | Finance, Auditor, Operations | Location, reason, date, status | Adjustment no., item, qty/value impact, reason, approver, evidence | XLSX, CSV |
| Approval Aging | Management, Process Owners | Module, approver, age, location | Record no., module, current approver, age, value, priority | XLSX, CSV |
| Audit Trail Export | Auditor, IT Admin, authorized management | Module, record, actor, date, action | Timestamp, actor, action, old/new state summary, record link | CSV, controlled XLSX |

## 4. Common report controls

All list reports should support:

- Date range with quick presets: today, yesterday, this week, month-to-date, prior month, custom.
- Company, brand, and location filters within user scope.
- Department, cost center, supplier, category, item, requester, and status where relevant.
- Search by document number, item code, item name, supplier, and user.
- Sort, saved views, column visibility, pagination, total rows, and subtotals where relevant.
- Export only filtered data, with export metadata included in the file.

## 5. Export rules

Current implementation note: `/reports` is a permission-gated report catalog over existing scoped source modules and CSV export routes. It exposes only reports backed by the user's module permissions and selected-location source pages; approval aging is view-only and audit export remains core-admin controlled. Each report card carries a DEC-0036 trust notice. Standard operational reports are labeled `Source-record scoped`; reports that depend on unvalidated imported sales/POS data carry stronger warning notices such as `POS/import trust-gated`. Scoped CSV export is available for Purchase Requests, Supplier Quotes, Purchase Orders, Receiving Reports, Stock Balances, Inventory Ledger, Transfers, Stock Counts, Wastage Reports, Stock Adjustments, Project Health, Project Task Register, Project Activity Log, Project Linked Record Follow-up, Admin Audit Events, the Core Admin Release Readiness Register, Phase 3 Finance Control Center snapshots, Phase 3 Bank & Cash snapshots, Phase 3 Period Close snapshots, and Phase 3 Workforce Operations snapshots. The shared CSV response helper prepends baseline export metadata with export filename and generated-at UTC timestamp for every CSV route. Operational and project CSV export routes enforce the DEC-0036 selected-scope requirement before export-start audit events are written, then write denied, started, completed, and failed export audit events; audit metadata includes active company, brand, location, report trust gate, scope-filter requirement, row count where applicable, and reason code where applicable. Purchase Order export includes supplier issue evidence with recorder name, fulfillment quantity/value summaries, delivery-aging fields for issued or partially received POs, configured report trust-gate metadata, preserved scope/filter metadata, and terminal subtype fields for approval rejection, pre-receiving cancellation, remaining-balance closure, or unknown legacy terminal records. Receiving Report export includes source PO status, expected delivery date, line-level accepted/rejected/damaged/short quantities, discrepancy reason/evidence reference, posted movement ID, and reversal actor/time for delivery schedule and correction reconciliation. Transfer export uses source/destination scope and surfaces partial/disputed lifecycle states, receipt-event line detail from authoritative transfer receipt records, and curated non-posting discrepancy settlement evidence from transfer audit events. Stock Count export includes session status, reviewer, generated adjustment reference, item/lot/expiry lines, counted quantity, and counted-by metadata; system quantity and variance quantity are exported only for users with count-review permission to preserve blind-count controls. Inventory exports use the same server-side permission and current-location scope checks as the source pages. Phase 3 Finance Control Center export uses the scoped finance dashboard read model only: metrics, PO source-chain readiness, journal queue summaries, AP invoice match status, payment request/release controls, bank/cash readiness rows, and finance guardrails. Phase 3 Bank & Cash export uses the scoped bank/cash read model only: bank account readiness, deposit evidence, imported statement-line status, unmatched line counts, reconciliation variance, evidence gaps, and trace summaries. Phase 3 Period Close export uses the scoped period-close read model only: close-run metrics, run state, checklist items, exceptions, readiness percentages, period status, and evidence references. These finance exports are not accounting ledgers, bank settlement files, payment confirmations, or official close packets. Phase 3 Workforce Operations export uses the scoped workforce dashboard read model only: metrics, employee/assignment rows, leave/overtime request status, schedules, attendance-import evidence, readiness records, and workforce policy notes. It preserves existing workforce redaction and does not compute payroll, create attendance-device authority, or expose document payloads. Release Readiness Register export requires Core Administration permission and includes readiness summaries, gate statuses, evidence references, verification status for UAT/deployment/enablement records, security evidence counters, and Release Board decisions for the selected company; it does not replace signed external evidence artifacts. Project Health export uses authorized project visibility and portfolio-health fields only: project identity, status, manager, target date, task counts, blocked/overdue counts, milestone summary, linked-record count, and health marker. Project Task Register export uses authorized project visibility and task metadata only: project code/name, task key/title, status, priority, owner display name, due date, due state, overdue days, completion timestamp, blocked flag, checklist counts, comment count, attachment count, open blocker count, and earliest open blocker next-review timestamp. Project Activity Log export uses authorized project visibility and redacted activity summaries only: project code/name, occurrence timestamps, actor display name, canonical event/entity labels, entity category, curated change summary, and reason code. Project Linked Record Follow-up export uses authorized project visibility and existing source-summary adapters; visible source records expose only safe summary fields, while restricted source records show only that a linked record exists. Project exports do not include source-record IDs, task descriptions, comment bodies, raw reasons, raw before/after payloads, attachment IDs/object keys/URLs, blocker reasons, task assignee lists, operational payloads, or linked-record payload snapshots. Admin Audit Events can be searched by action, entity, actor, request/correlation ID, and date range; the audit CSV export applies those same filters and requires core administration permission. In-app notifications now provide a scoped notification center for approval-assignment events plus bounded Phase 1.5 task assignment, reassignment, blocked-task, manually guarded due-soon/overdue reminder scan, elevated-risk, and at-risk milestone events. Richer per-report file-level filter metadata, automated reminder scheduling/cadence, email preferences, asynchronous export delivery without queueing, time-limited download links, and formal PDF summaries remain future hardening items.

- Export requests are permission-controlled and audit-logged.
- Include report title, generated-by, generated-at, timezone, filters, and page/scope metadata in exports.
- Large exports should run as a background job and notify the requester when ready.
- Sensitive exports must be time-limited download links and should not be delivered through unprotected channels.
- PDF is for formal summaries, not a replacement for transaction-level Excel analysis.

## 6. Data freshness and reconciliation

- Operational reports read current committed transactional data.
- Inventory reports must state whether the balance is `as of now` or `as of end of selected date`.
- When asynchronous read models are introduced, display `Data refreshed at` and show a refresh/retry state.
- Report totals must reconcile to included rows and the authoritative transaction/ledger records.

## 7. Future reports outside Phase I

Sales, covers, labor cost, recipe cost, theoretical vs actual food cost, P&L, project capex, and HR reports are later-phase modules unless reliable integrated source data is available.


---

## Projects & Implementation Tracker — Reporting Addendum

### Phase 1.5 standard reports

| Report | Default audience | Core measures | Required filters |
|---|---|---|---|
| Project Health Summary | Sponsor, Project Manager | project status, completion, overdue count, blocked count, milestone risk | company, brand, location, department, template, owner, status |
| Task Register | Project Manager, Contributors | task owner, assignees, status, priority, due date, overdue age, linked record count | project, assignee, status, priority, due-date range, blocker state |
| Overdue and Blocked Work | Management, Project Manager | overdue tasks, blocker reason, age, owner, escalation status | company, project, owner, department, severity |
| Milestone Status | Sponsor, Project Manager | target date, completion state, at-risk flag, linked task progress | project, date range, owner, status |
| Project Activity Log | Project Administrator, Auditor | key changes, actor, timestamp, before/after summary | project, actor, event type, date range |
| Linked Record Follow-up | Project Manager | linked source-record type, current safe summary, unresolved task state | project, record type, task status, permission scope |

Reports must respect both project scope and source-record access. Exports should not leak confidential linked-record data.

Current implementation note: enabled Phase 1.5 exports are `Project Health` at portfolio grain, `Project Task Register` at task grain, `Project Activity Log` at redacted activity-event grain, and `Linked Record Follow-up` at project-link grain. They write export-denied, export-started, export-completed, and export-failed audit events with the same DEC-0036 report trust-gate metadata used by operational exports, and they apply a small per-user rate limit. Linked Record Follow-up rows are capped, project-visibility scoped, and redacted through the same source-record authorization adapters used by task detail links.
