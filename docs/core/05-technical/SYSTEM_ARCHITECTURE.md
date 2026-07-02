# OGFI ERP — System Architecture

**Status:** Recommended implementation baseline  
**Scope:** Phase I, designed to support all future phases and multi-company productization

---

## 1. Architecture objective

Build OGFI ERP as a **secure, multi-company-ready, modular restaurant operations platform**. The first release serves One Gourmet Foods Inc. across brands, branches, Head Office, warehouse, commissary, and future project sites. The architecture must not assume a fixed number of brands, branches, warehouses, approval levels, item categories, or operational workflows.

The system must support controlled purchasing, receiving, inventory movements, transfers, physical counts, wastage, approvals, notifications, and audit trails before adding later-phase modules such as recipes, finance, HR, and expansion management.

---

## 2. Recommended baseline stack

This is the default recommendation. It should be treated as the project standard unless a later technical decision changes it deliberately.

| Layer | Recommended baseline | Why it fits OGFI ERP |
|---|---|---|
| Web application | Next.js + React + TypeScript | Modern SaaS UI, strong routing, server rendering where useful, good mobile responsiveness, one TypeScript codebase. |
| UI system | Tailwind CSS + reusable internal component library | Efficient implementation of tokens, cards, tables, status pills, responsive layouts, and tenant theming. |
| API application | Node.js + TypeScript modular backend, preferably NestJS or a clearly separated Next.js service layer | Supports workflow modules, validation, authorization, and long-lived business logic without turning UI code into backend logic. |
| Database | PostgreSQL | Mature transaction guarantees, relational integrity, reporting, JSON support for configurable rules, and safe inventory/audit operations. |
| Data access | Prisma or Drizzle ORM with explicit SQL for high-risk inventory/reporting queries | Type-safe access plus controlled migrations. |
| Cache / job queue | Deferred Redis + BullMQ or equivalent | Not included in the current Phase I / Phase 1.5 no-queueing release. Future approval is required before adding workers, queues, schedulers, or queue-dependent acceptance criteria. |
| Object storage | S3-compatible storage | Attachments, receiving photos, supplier documents, and future project files. |
| Authentication | Application-managed identity with secure sessions; optional OIDC/SAML-ready extension | Keeps client onboarding flexible and avoids tying the product to one identity provider. |
| Logging / monitoring | Structured logs, health checks, error monitoring, metrics | Required for release confidence and production support. |
| Deployment | Docker containers, GitHub Actions CI/CD, staging and production environments | Repeatable deployment and easier client scaling. |

### 2.1 Why a modular monolith first

Start as a **modular monolith**, not microservices. Phase I needs strict transaction integrity between purchasing, approvals, receiving, and inventory. Splitting services too early increases failure points, makes reporting harder, and slows delivery.

Modules stay separated in code and database ownership, but deploy as one application initially. Extract a service only when usage, independent scaling, or integration complexity clearly justifies it.

---

## 3. High-level architecture

```text
Users: desktop / tablet / mobile browser
        │
        ▼
Modern SaaS Web Application
- App shell, context switcher, dashboards, forms, tables, mobile task flows
        │
        ▼
Application API / Workflow Layer
- authentication, authorization, validation, approvals, document actions,
  purchasing, receiving, inventory, notifications, audit generation
        │
        ├──────────────► PostgreSQL
        │                - transactional data, approvals, balances, audit references
        │
        ├──────────────► Object Storage
        │                - receipts, delivery photos, supplier documents, evidence
        │
        └──────────────► External integrations, later
                         - POS, payroll, biometrics, accounting, email, SMS/WhatsApp
```

---

## 4. Application modules and ownership boundaries

Each module owns its core business logic and writes its own controlled records. Modules may read other modules through internal services or well-defined query interfaces, but should not duplicate source-of-truth data.

| Module | Owns | Must not do |
|---|---|---|
| Identity & Access | users, roles, scope assignments, sessions | hardcode role checks in page components |
| Organization | companies, brands, locations, warehouses, departments, cost centers | store location names as free text on transactions |
| Approval Engine | approval templates, steps, decisions, delegation, escalations | embed fixed approval chains inside transaction code |
| Supplier Management | suppliers, documents, qualification status | create inventory stock or payments |
| Purchasing | PRs, quotation comparisons, POs, supplier selection | directly modify stock balances |
| Receiving | receiving reports, discrepancies, accepted/rejected quantities | change PO quantities without an amendment process |
| Inventory | movements, lot/expiry where used, stock balances, counts, transfers, wastage, adjustments | overwrite stock without a ledger transaction |
| Notification Center | in-app notifications, manual reminder scans, future email delivery | decide underlying approval policy |
| Audit Service | immutable event trail and evidence references | allow event edits or deletions |
| Reporting | scoped read models and exports | become the source of truth for transactions |

---

## 5. Context and scope architecture

Every request operates inside an explicit scope.

```text
Tenant
  └── Company
       ├── Brand
       ├── Location
       │    ├── Branch
       │    ├── Warehouse
       │    ├── Commissary / Central Kitchen
       │    ├── Head Office
       │    └── Project Site
       ├── Department
       ├── Cost Center
       └── Project
```

### 5.1 Scope rules

- All tenant-owned records include `tenant_id`.
- All company-owned operational records include `company_id`.
- Transactional records include `location_id` whenever goods, branch activity, receiving, counting, wastage, or delivery location is involved.
- `brand_id`, `department_id`, `cost_center_id`, and `project_id` are required where the business process requires them and are nullable only when logically not applicable.
- API authorization filters records by scope at the data-access layer. The browser must never be relied on to hide unauthorized records.
- A user may have multiple role assignments and multiple scopes; permissions are additive only where explicitly allowed.

---

## 6. Modern SaaS UI architecture

The UI must implement the approved visual direction without sacrificing transaction clarity.

### 6.1 Application shell

Desktop:

```text
Persistent sidebar
+ top header with global search, notifications, user menu
+ context switcher: Company / Brand / Location / Period
+ responsive content surface
```

Tablet/mobile:

```text
Compact header
+ task-first navigation
+ context visible at record level
+ bottom or drawer navigation for high-frequency modules
+ fixed action bar for critical workflow steps
```

### 6.2 Required UI primitives

- application shell and scoped context switcher;
- role-aware sidebar;
- dashboard KPI card;
- action queue item;
- balanced data table with filters, saved views, export, and status pills;
- responsive card-list variant for mobile;
- record header with status, scope, owner, total, and next action;
- approval timeline;
- audit timeline;
- attachment uploader/viewer;
- confirmation and reason modal for controlled actions;
- loading, empty, denied, error, rejected, and success states.

---

## 7. Transaction integrity patterns

### 7.1 Commands versus queries

- **Commands** create or change controlled records. They require validation, authorization, audit logging, and idempotency where retried.
- **Queries** retrieve scoped data. They must apply tenant/company/scope filters, pagination, and explicit field selection.

### 7.2 Document state machine

Every controlled business document uses explicit status transitions.

```text
Draft → Submitted → Pending Approval → Approved / Rejected / Returned
Approved → Open / In Progress → Partially Completed → Completed / Closed
Draft or Submitted → Cancelled
Posted transaction → Reversal only, never silent editing
```

### 7.3 Inventory rule

A stock balance is a derived value. A balance changes only when an inventory movement is successfully posted inside a database transaction.

```text
Receiving accepted quantity → inventory movement IN
Transfer dispatch → movement OUT from source + IN TRANSIT
Transfer receipt → movement IN to destination
Wastage approval/posting → movement OUT with wastage reason
Stock adjustment approval/posting → controlled +/- movement
Physical count closure → variance movement with count reference
```

---

## 8. Post-Commit Side Effects And Future Asynchronous Work

Current Phase I / Phase 1.5 behavior uses controlled service-layer actions, audit events, persisted in-app notifications, and manual reminder scans. It does not require Redis, BullMQ, workers, schedulers, or queue-dependent acceptance criteria.

Examples in the current release:

- notification records after a PR is submitted;
- in-app notification records after PO approval;
- manual project reminder scans for due-soon and overdue work;
- scoped export activity audit events;
- source-linked dashboard/report visibility.

Future approved releases may add an outbox, worker, or durable queue for email, long-running exports, malware scans, scheduled low-stock/expiry evaluation, or integrations. Those additions require a separate technical decision and must not change the rule that the workflow record is committed first and side-effect failure must not roll back a valid approval, receiving, or inventory transaction.

---

## 9. Integration architecture

Phase I should be integration-ready but not blocked by integrations.

### Phase I integrations

- Email provider for notification delivery.
- Optional file storage provider.
- Optional barcode scanner via browser/device capability.

### Later integrations

- POS sales data.
- Accounting platform.
- Biometric or attendance provider.
- SMS/WhatsApp channel.
- Supplier portal or EDI.
- Bank/payment workflows.

All integrations should use adapter interfaces. No core module should depend directly on a vendor SDK throughout its codebase.

---

## 10. Architecture acceptance criteria

The Phase I architecture is acceptable when:

1. A user can only query or transact inside assigned scope.
2. Approval routes can be changed through data/configuration without code deployment.
3. A posted inventory movement cannot be edited directly; corrections create traceable reversing or compensating entries.
4. Receiving and transfer actions are transactional and cannot leave balances partially updated.
5. Every controlled action produces an audit event.
6. Attachments are stored outside the database and linked securely to records.
7. Background reminder failure does not corrupt business transactions.
8. The application can run reproducibly in local, staging, and production environments.
9. The frontend applies the approved Modern SaaS visual and responsive standards from the Design Specification Pack.
