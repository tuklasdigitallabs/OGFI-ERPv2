# OGFI ERP — Technical Decision Log

**Status:** Baseline decisions adopted for planning
**Purpose:** Record decisions that shape the platform, while clearly separating confirmed choices from later configuration decisions.

---

## 1. Confirmed product and operating decisions

| ID | Decision | Status | Rationale |
|---|---|---|---|
| TD-001 | Build first for One Gourmet Foods Inc., but make the platform multi-company/tenant-ready. | Confirmed | OGFI is the first customer; future sale to other restaurants is intended. |
| TD-002 | Organization hierarchy is Company → Brand → Branch/Location. | Confirmed | Brands are open-ended and any brand may be added. |
| TD-003 | Head Office, Main Warehouse, Commissary/Central Kitchen, and Project Sites are company-level location types and are not forced under a brand. | Confirmed | These may serve multiple brands and branches. |
| TD-004 | Branch users see only assigned branch/location data; management sees scope-based consolidated data. | Confirmed | Required for operational control and privacy. |
| TD-005 | Some functions are centralized through Head Office/Main Warehouse. | Confirmed | Warehouse-first replenishment must be supported. |
| TD-006 | Approval rules must be configurable inside the ERP. | Confirmed | Managers/approvers, thresholds, and policies may change. |
| TD-007 | The first release focuses on purchasing, inventory, approvals, receiving, transfers, counts, wastage, and audit controls. | Confirmed | These address current manual/paper/Excel/chat workflows first. |
| TD-008 | UI direction is Modern SaaS: clean, polished, role-aware, responsive, restrained blue accents, cards, balanced tables, and status pills. | Confirmed | Matches approved visual reference. |
| TD-009 | UI must preserve restaurant-grade controls: scope, status, approval, next action, audit, and evidence visibility. | Confirmed | Modern look must not weaken operational accountability. |
| TD-010 | Inventory cannot be directly edited; stock changes must be ledger-based and traceable. | Industry-standard baseline | Needed for correct inventory and audit control. |
| TD-019 | OGFI ERP is the official accounting system of record. | Confirmed by `DEC-0006` | Finance/accounting implementation remains gated by Phase III decision council, finance-owner review, and build approval. |
| TD-020 | Use one shared Work Management Engine with specialized Branch Expansion & Construction and Marketing Operations modules. | Confirmed by `DEC-0007` | Implementation remains gated by Work Management Decision Council and explicit build approval. |

---

## 2. Recommended technology decisions

| ID | Decision | Status | Notes |
|---|---|---|---|
| TD-011 | Use TypeScript end to end. | Recommended baseline | Reduces contract drift between UI and backend. |
| TD-012 | Use PostgreSQL as transactional system of record. | Recommended baseline | Fits relational workflows, inventory, approvals, and reporting. |
| TD-013 | Use modular monolith architecture first. | Recommended baseline | Faster and safer for Phase I workflow integrity than early microservices. |
| TD-014 | Use Dockerized environments and CI/CD via GitHub Actions. | Recommended baseline | Repeatable development/deployment and aligns with GitHub workflow. |
| TD-015 | Use Redis-backed job queue for reminders, escalations, exports, and notifications. | Deferred future baseline | Not included in the current Phase I / Phase 1.5 no-queueing release scope. Current release uses in-app notifications and manual reminder scans; Redis/BullMQ requires a separate approved technical decision before activation. |
| TD-016 | Use S3-compatible object storage for attachments. | Recommended baseline | Avoids server-local upload risk and supports future scaling. |
| TD-017 | Use semantic design tokens and tenant-configurable theme overrides. | Recommended baseline | Preserves OGFI visual standard while supporting productization. |

---

## 3. Deliberately configurable decisions

These should not be hardcoded:

- approval thresholds;
- approval chain assignments;
- emergency purchase conditions;
- stock count frequency;
- wastage reasons and evidence requirements;
- item categories and UOMs;
- par levels and replenishment thresholds;
- supplier accreditation requirements;
- required attachments;
- notification channels and escalation timing;
- whether a workflow requires quotation comparison;
- negative-stock exception policy;
- tenant visual theme;
- branch/warehouse/project scope assignment.

---

## 4. Deferred decisions that must be resolved before their phase

| Topic | Target phase | Why deferred |
|---|---|---|
| POS integration vendor/API | Phase II/V | Depends on final POS systems and available integration access. |
| Recipe, menu, and theoretical food cost calculation rules | Phase II | Requires standardized recipes, menu mapping, and trusted sales data. |
| Finance/accounting implementation details | Phase III | Accounting system-of-record direction is confirmed by `DEC-0006`; build still depends on chart-of-account design, posting rules, period-close controls, reconciliation ownership, tax/statutory validation, cutover, and implementation approval. |
| Payroll and attendance integrations | Phase III | Depends on biometric/payroll provider and HR policies. |
| Work Management Engine implementation details | Phase 1.5 / II / IV | Shared-engine direction is confirmed by `DEC-0007`; build still depends on status templates, scope/membership rules, calendar semantics, concurrency, dependencies, notifications, attachment retention, and implementation approval. |
| Expansion project templates and construction document requirements | Phase IV | Needs gate evidence, opening-date risk, restricted visibility, financial-link, punch-list, and handover standards. |
| Marketing Operations workflow and calendar rules | Phase II | Needs campaign/promotion/new-item status templates, approval routes, branch/date scope, asset controls, and calendar conflict policy. |
| Billing/licensing/client onboarding for external ERP customers | Phase V | Productization workflow follows proven OGFI implementation. |
| MFA enforcement model | Before broad production rollout | Security requirement; exact method can be selected closer to launch. |
| Production hosting provider | Before staging deployment | Depends on cost, support capacity, data residency, and operational preference. |

---

## 5. Change-control rule

Any decision that changes tenant isolation, role/scope access, approval behavior, inventory posting, audit retention, data schema, or production deployment must be added to this log with:

- decision date;
- owner;
- reason;
- affected modules;
- migration/rollback impact;
- documentation updates required.


---

## TD-018 — Projects & Implementation Tracker Is a Linked Coordination Layer

**Status:** Confirmed

**Decision:** Implement the Projects & Implementation Tracker as an ERP-native, tenant/company-scoped coordination module delivered after Phase I stabilization. It owns project and task coordination data, but it does not own or mutate the workflow state of linked Purchase Requests, Purchase Orders, receiving, transfers, approvals, inventory records, or future Expansion records.

**Reason:** OGFI needs Trello-like implementation visibility while preserving the ERP’s existing source-of-truth controls for money, inventory, approvals, supplier commitments, and audit trails.

**Consequences:** Project tasks link to source records via permission-checked references; task completion cannot approve a PO, receive stock, close an inventory count, or change a financial state. Future Phase IV Expansion Projects will reuse this tracker as a shared execution layer rather than create a separate task system.


## TDL-006 — Agent Working Style and Token Efficiency

**Status:** Confirmed

**Decision:** Use targeted context reading, minimal-change implementation, quiet scoped shell/tool output, concise completion reporting, medium reasoning by default, and fresh-session guidance for stale context.

**Constraint:** These efficiency measures must never bypass ERP business controls, inventory integrity, security, approvals, audit history, testing, documentation maintenance, or material decision governance.

**Implementation:** Root `AGENTS.md`; governance mirror at `AGENT_WORKING_STYLE_AND_TOKEN_EFFICIENCY_STANDARD.md`.
