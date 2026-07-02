# OGFI ERP — Phase I Technical Build Plan

**Status:** Recommended build sequence  
**Objective:** Deliver controlled purchasing and inventory operations without compromising multi-tenant, security, or UI foundations.

---

## 1. Phase I delivery outcome

At the end of Phase I, OGFI should be able to replace key paper, Excel, chat, and verbal processes with an auditable system for:

```text
User / role / scope setup
→ master data
→ Purchase Request
→ approval workflow
→ quotation comparison where required
→ Purchase Order
→ goods receiving and discrepancy capture
→ inventory movement and balance update
→ transfer dispatch and receipt
→ stock count / variance control
→ wastage and adjustment control
→ dashboards, tasks, notifications, reports, audit trails
```

---

## 2. Release sequence

### Release 0 — Engineering foundation

**Goal:** Establish a safe platform before building business screens.

Deliver:

- repository structure;
- environment config and Docker Compose;
- CI pipeline;
- PostgreSQL migrations;
- authentication/session baseline;
- tenant/company/brand/location context;
- role, permission, scope assignment engine;
- audit event service;
- attachment service;
- design token/component foundation;
- app shell, sidebar, header, context switcher;
- seed dataset.

Exit criteria:

- branch-scoped test user cannot access another branch;
- a record can show scope/status/audit shell;
- UI follows Modern SaaS visual standard;
- automated checks run in CI.

---

### Release 1 — Master data and approval engine

**Goal:** Build the configuration foundation that all Phase I workflows need.

Deliver:

- company, brand, location, department, cost center;
- supplier master;
- item/category/UOM/conversion master;
- item-location stocking settings and par levels;
- approval rule templates and rule matching;
- approval instance, steps, tasks, delegation, reminder/escalation jobs;
- user/role/scope administration;
- dashboard/task shell.

Exit criteria:

- admin can configure a new branch, warehouse, supplier, item, and approval rule;
- a test document routes to correct approver based on scope/amount;
- approval decision is audited;
- unauthorized user cannot see configuration outside scope.

---

### Release 2 — Purchase Request and approval workflow

**Goal:** Replace informal requests and verbal approval tracking.

Deliver:

- PR list/create/edit/detail;
- line items, attachments, urgency, required date, requester/location/department;
- submit/approve/reject/return/cancel transitions;
- approval timeline and task inbox;
- low-stock `Request Stock` entry point;
- notification/reminder behavior;
- PR reporting/export.

Exit criteria:

- branch manager can submit a PR on desktop/mobile;
- correct approver is assigned;
- reject/return requires comment;
- duplicate submit retry does not create duplicate PR;
- dashboard shows pending approvals and aging.

---

### Release 3 — Quotation comparison and Purchase Orders

**Goal:** Control supplier choice and PO lifecycle.

Deliver:

- quotation requests and supplier quote capture;
- comparison screen;
- recommendation/selection controls;
- PO create/edit/submit/approve/send/amend/cancel;
- supplier documents/status;
- expected delivery tracking;
- PO list/dashboard/report;
- low-stock route decision: warehouse transfer versus PR/PO path.

Exit criteria:

- PO carries source PR, supplier, location, expected delivery, lines, total, approvals, and audit history;
- a PO cannot be sent before required approval;
- amendment creates traceable history;
- supplier/location scope is enforced.

---

### Release 4 — Receiving and stock ledger

**Goal:** Make supplier delivery acceptance update stock correctly.

Deliver:

- receiving queue and goods receipt detail;
- ordered/delivered/accepted/rejected/shortage quantity capture;
- delivery receipt, photo, lot, expiry handling where configured;
- receiving discrepancy workflow;
- inventory movement posting;
- stock balance view and ledger;
- low-stock/critical-stock status;
- no direct stock balance editing.

Exit criteria:

- accepted receipt quantity updates ledger and balance atomically;
- rejected/short quantity does not increase stock;
- partial receiving leaves PO open appropriately;
- duplicate posting retry does not duplicate movements;
- audit shows receiving and movement references.

---

### Release 5 — Transfers, stock count, wastage, and adjustments

**Goal:** Close the inventory-control loop between warehouse and branches.

Deliver:

- transfer request, approval, dispatch, receipt, variance resolution;
- branch/warehouse stock availability validation;
- physical count setup, mobile entry, review, variance posting;
- wastage report with reasons/evidence/approval/posting;
- controlled stock adjustments;
- count/wastage/variance dashboards;
- inventory and control reports.

Exit criteria:

- transfer source and destination records reconcile;
- branch cannot receive more than dispatched without discrepancy resolution;
- count retains snapshot and posts correct variance movement;
- wastage/adjustment requires required approval/evidence;
- role and branch restrictions work for all inventory actions.

---

### Release 6 — Pilot, hardening, and controlled rollout

**Goal:** Prove usability and controls before scaling to all locations.

Deliver:

- pilot at one branch plus Main Warehouse;
- training materials;
- data-import templates;
- operational support dashboard;
- feedback fixes;
- performance and security test results;
- launch runbook and incident process;
- phased rollout plan for remaining branches.

Pilot success checks:

- purchase requests no longer require chat/verbal follow-up for routine workflow;
- warehouse transfer and branch receipt records reconcile;
- receiving discrepancies are visible and actionable;
- stock count/wastage reporting is usable by actual branch personnel;
- managers can approve/reject without leaving the record;
- no critical access-control or duplicate-posting defects.

---

## 3. Critical implementation order within each release

Build in this order where possible:

```text
Database migration
→ domain service / validation
→ authorization
→ API contract
→ audit/event behavior
→ UI screen
→ tests
→ documentation/update acceptance criteria
```

Do not start with dashboard charts. Dashboards must read trusted transactional data after the underlying workflows exist.

---

## 4. Pilot data migration order

1. Tenant and OGFI company setup.
2. Brands, branches, warehouse, commissary, departments, cost centers.
3. Users, roles, and scope assignments.
4. UOMs, item categories, item master, conversions, item-location par levels.
5. Suppliers and supplier contacts/documents.
6. Opening inventory balances through a controlled opening-balance process.
7. Open purchase requests, open POs, and expected deliveries only if validated and necessary.
8. Training/test transactions before live cutover.

---

## 5. Phase I go-live gates

Do not launch broadly until all are true:

- [ ] pilot workflows pass acceptance criteria;
- [ ] roles and scopes tested with real user scenarios;
- [ ] opening balances validated;
- [ ] low-stock replenishment correctly routes through warehouse or PR path;
- [ ] receiving and transfers reconcile;
- [ ] audit trail visible for controlled actions;
- [ ] backup/restore checks completed;
- [ ] mobile branch tasks tested on actual target devices;
- [ ] support/escalation contacts established;
- [ ] training completed for pilot roles.
