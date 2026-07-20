# OGFI ERP — Open Decisions and Assumptions

**Status:** Active decision register
**Applies to:** Phase I and later phases
**Purpose:** Record policies that are intentionally configurable or temporarily set to an industry-standard default. No item in this document may be silently hardcoded as permanent business policy.

---

## 1. Decision management rules

- A **confirmed decision** is approved by OGFI and may be implemented as the current operating policy.
- A **baseline default** may be implemented as configurable seed data, not fixed code.
- An **open decision** needs business confirmation before production enforcement if it has material financial, legal, or operational impact.
- A **technical assumption** may guide implementation but must be reversible when operational policy changes.
- Every resolved item must be moved to the appropriate canonical document and logged in the decision log.

## 2. Confirmed foundation decisions

| Topic | Confirmed decision |
|---|---|
| Product scope | Build for OGFI first; architect for future restaurant clients. |
| Organization hierarchy | Tenant → Company → Brand → Location. |
| Location model | Support branches, Head Office, central warehouse, commissary, project sites, and future temporary sites. |
| Brand management | Brands are open/configurable; no fixed brand list in code. |
| Data visibility | Branch users see assigned locations only; management sees assigned consolidated scope. |
| Centralization | Main Head Office and warehouse support branch operations. |
| Inventory replenishment | Check main warehouse availability before external purchase. |
| Main business issues | Replace paper, Excel, chats, verbal approvals, manual tallying, and fragmented reporting. |
| Approval architecture | Manager/role assignment and thresholds are managed in the ERP. |
| UI | Modern SaaS visual system with restaurant-grade operational controls. |
| Evidence | Audit trail and attachments are required on important actions. |

## 3. Phase I configurable policy defaults

`DEC-0036` confirms these as configurable industry-standard defaults for pilot and UAT. They may be revised after actual testing findings, but should not remain open blockers unless a UAT finding or owner decision explicitly reopens them.

| ID | Topic | Confirmed configurable default | Owner for future revision | Reopen trigger | Baseline status |
|---|---|---|---|---|---|
| OD-01 | Financial approval thresholds | Seed editable ranges: `<= PHP 10,000`, `PHP 10,001-50,000`, `PHP 50,001-200,000`, `> PHP 200,000` | Executive + Finance | UAT shows approval exposure or excessive delay | Confirmed by `DEC-0036` |
| OD-02 | Budget enforcement | Flag over-budget; allow authorized exception with reason, approver, audit, and report visibility | Finance | Finance UAT requires hard blocking for specific budgets | Confirmed by `DEC-0036` |
| OD-03 | Direct branch buying | Block as a normal path; allow only emergency workflow or explicit policy exception with evidence and post-review | Operations + Purchasing | Branch pilot shows service-risk handling is too slow | Confirmed by `DEC-0036` |
| OD-04 | RFQ / quotation requirement | Required above configured value or for non-contracted suppliers | Purchasing + Finance | Supplier/category pilot requires different threshold | Confirmed by `DEC-0036` |
| OD-05 | Stock count cadence | High-risk/perishable weekly; all other inventory monthly; configurable by item/category/location | Operations + Warehouse | Variance trend or workload proves cadence mismatch | Confirmed by `DEC-0036` |
| OD-06 | Lot/expiry requirement | Required for regulated, perishable, high-risk, batch-sensitive, and food-safety-critical items; configurable by item/category | Operations + QA/Food Safety | Master-data/UAT identifies exempt or additional categories | Confirmed by `DEC-0036` |
| OD-07 | Wastage photo threshold | Evidence is configurable by reason, value, repeat-loss policy, and high-risk category per `DEC-0021` and `DEC-0036` | Operations + Finance | UAT shows weak evidence or excessive branch burden | Confirmed by `DEC-0021` / `DEC-0036` |
| OD-08 | Adjustment approval | Manual stock adjustments follow `DEC-0023`; opening-balance and backdated policies use `DEC-0036` controlled defaults | Finance + Operations | UAT shows opening-balance or period-control mismatch | Confirmed by `DEC-0023` / `DEC-0036` |
| OD-09 | Branch-to-branch transfers | Dispatch/receipt and receipt-event exceptions follow `DEC-0011`, `DEC-0012`, and `DEC-0025`; replacement/finance treatment remains a later controlled release | Operations + Warehouse | UAT shows duplicate/missing stock or dispute handling gap | Confirmed by prior transfer decisions |
| OD-10 | Emergency purchase cap | Allow emergency request with mandatory reason, supplier/receipt evidence, receiving proof where applicable, post-review, and configurable cap/SLA | Executive + Purchasing | Emergency path abuse or too many service-impact stockouts | Confirmed by `DEC-0036` |
| OD-11 | Notification channels | Scoped in-app notifications and manual approval-reminder scans per `DEC-0022`; email/chat/SMS/schedulers/queues remain deferred unless separately approved | Management + IT | Pilot shows missed urgent work or alert fatigue | Confirmed by `DEC-0022` |
| OD-12 | User identity/login | Username/password with MFA required for privileged roles/actions; SSO later if desired; break-glass requires expiry, reason, audit, and post-review | IT + Management | Privileged-user UAT or IT policy requires SSO/MFA provider change | Confirmed by `DEC-0036` |
| OD-13 | POS integration | Deferred for purchasing/inventory source records; Restaurant Operations sales/import data is trust-gated and warning-gated until validated per `DEC-0036` | Operations + IT | Imported sales data is stale, duplicated, partial, or unreliable | Confirmed by `DEC-0036` |
| OD-14 | Finance/accounting implementation policy | `DEC-0006` confirms system-of-record direction; `DEC-0036` confirms conservative configurable defaults, with finance-owner/accountant validation and UAT evidence required before production finance use | Finance + IT + Executive | Finance UAT, statutory review, or reconciliation evidence fails | Confirmed by `DEC-0006` / `DEC-0036` |
| OD-15 | Supplier portal | Deferred; manage suppliers internally in the current release, with supplier communications/evidence logged internally | Purchasing | Supplier collaboration becomes a production requirement | Confirmed by `DEC-0036` |
| OD-16 | User role assignment mutation sequencing | Non-sensitive role path follows `DEC-0002`; sensitive/admin/approver grants require role sensitivity catalog, no self-grant, reason, audit, dual approval, and session revocation | Management + IT | Security UAT or owner policy changes sensitivity taxonomy | Confirmed by `DEC-0036` |

## 4. System assumptions to implement as configuration

- Document numbering prefixes and annual sequence reset.
- Approval templates by company, brand, location, department, transaction type, amount, budget state, and urgency.
- Reason codes for emergency purchase, delivery discrepancy, wastage, adjustment, return, cancellation, rejection, and backdating.
- Status labels and colors are consistent but configurable only by controlled administration.
- Default approval reminder intervals: 24 hours due-soon and overdue buckets for manual in-app scans; email/chat/SMS escalation remains deferred unless approved without queueing.
- Default currency: PHP. Support currency code storage for future tenants.
- Default time zone: Asia/Manila. Store timestamps in UTC.
- Default attachment retention: retain for the transaction retention period; exact legal retention to be confirmed by Finance/Legal.

## 5. Configuration values required before production go-live

The baseline policy is confirmed by `DEC-0036`. The exact configured values below must still be verified before production enforcement:

1. Approval thresholds and authorized approvers.
2. Emergency-purchase ceiling and post-approval deadline.
3. Mandatory attachment/evidence requirements by transaction type and value.
4. Which inventory categories require lot/expiry tracking.
5. Count frequency by location and category.
6. Opening inventory cutover date and valuation method. The default approach is controlled opening-balance adjustments with cutover date, evidence, approval, reconciliation, and lock/signoff.
7. Supplier accreditation rules and blocked-supplier policy.
8. Data retention, privacy, and backup ownership.
9. UAT signatories and authority to approve production go-live. The default Release Board model is confirmed by `DEC-0036`.

## 6. Change request format

Every policy change request should include:

- Requested change and business reason
- Affected company, brand, location, department, transaction type, and roles
- Financial/inventory/control impact
- Effective date and whether historical records are affected
- Required training or communication
- Required migration or configuration action
- Approver(s)


---

## Phase 1.5 — Projects & Implementation Tracker Configurable Defaults

The following defaults are confirmed by `DEC-0036` for pilot/UAT. Do not hardcode them; implement as configurable policy/template behavior:

1. Default task status templates by project type (ERP rollout, renovation, marketing, training, compliance, etc.).
2. Which project templates may be created by Project Managers versus Project Administrators.
3. Default overdue reminder timing and escalation grace period.
4. Task dependencies are informational by default; they may block status transition only when a template explicitly configures them as blocking.
5. Which project types require formal project gates and who may sign them off.
6. Default restricted-project categories and attachment retention rules.
7. Project tasks use one accountable owner by default and may include collaborators.
8. Required evidence for task completion by project template.
9. Maximum attachment size and permitted file types for project evidence.
10. Calendar view is included where available, but mobile remains task-completion-first rather than drag/drop-first.
11. Which shared Work Management Engine status templates are allowed by default, and who may edit or publish them.
12. Whether project, campaign, or restricted-container membership can grant access beyond normal location/department scope.
13. How date-only calendar events, scheduled datetime events, and user/company timezone display should behave across board, list, calendar, and reports.
14. Concurrency/versioning strategy for drag/drop, reorder, reassignment, due-date, dependency, and status updates.

Current implementation note: task detail supports a bounded reassignment path using active project membership, expected task version, reason-required guards for high-friction work, activity history, and scoped in-app notification. `DEC-0036` confirms that broader drag/drop, reorder, dependency, due-date, and bulk reassignment actions require version/concurrency protection and audit before release.

## Restaurant Operations Decision Notes

`DEC-0035` confirms the F&B-standard control policy for recipe CRUD, menu-price decisions, operational corrections, and intermediate statuses. The current restaurant-operations implementation supports source-record creation plus controlled review, close, cancel, resolve, and complete actions where defined. Implementation must follow `DEC-0035` for:

1. Which branch checklist, food-safety, incident, and maintenance fields may be edited after initial creation.
2. Whether edits are allowed only before review, allowed through a correction workflow, or blocked after submission except by cancellation/replacement.
3. Required reason, evidence, versioning, and audit events for operational corrections.
4. Which roles may move restaurant-operation records into manager review, exception review, in-progress, pending-review, and pending-vendor states.
5. Whether intermediate statuses trigger notifications, dashboards, escalation timers, or export categories differently from submitted/open states.
6. Whether correction actions may change linked source records or must remain source-record metadata only.
7. How mobile branch workflows should present edit/correction actions without weakening supervisor review controls.

## Marketing Operations Configurable Defaults

Marketing Operations planning uses the shared Work Management Engine. `DEC-0036` confirms these as configurable defaults for implementation and UAT:

1. Campaign, promotion, new-item launch, and creative-work status templates.
2. Promotion approval routes by brand, branch scope, date range, offer type, and operational risk.
3. Who may mark a campaign, promotion, or new-item launch as Scheduled, Live, Completed, or Cancelled.
4. Required readiness evidence before a promotion or launch can go live.
5. Calendar conflict rules for overlapping campaigns, mall events, holidays, branch openings, and promotions.
6. Marketing asset access, retention, approval, and branch visibility rules.
7. Reporting metrics, post-campaign review ownership, and source systems for performance data.

## Branch Expansion & Construction Configurable Defaults

Branch Expansion & Construction uses the shared Work Management Engine. `DEC-0036` confirms these as configurable defaults for implementation and UAT:

1. Expansion project types, lifecycle phases, and required gate evidence.
2. Target opening date change authority, reason requirements, and risk thresholds.
3. Workstream templates for permits, construction, procurement, finance/capex, IT, HR, training, marketing, and operations readiness.
4. Restricted project visibility and confidential attachment handling.
5. Contractor/supplier reference rules and whether any external collaboration remains out of scope.
6. Capex, PO, invoice, payment, and budget link display rules that preserve finance/procurement source controls.
7. Punch-list, defect, blocker, and readiness closure authority.

## Finance & Accounting Configurable Defaults

`DEC-0006` confirms OGFI ERP as the accounting system of record. `DEC-0036` confirms these as conservative configurable defaults for finance/accounting implementation planning and UAT. Production finance behavior still requires finance-owner/accountant validation, statutory/tax review where applicable, and go-live evidence:

1. Chart of Accounts ownership, approval, versioning, and maintenance rules.
2. Fiscal calendar, accounting period open/soft-close/lock/reopen policy, and authorized reopen approvers.
3. Source-to-journal posting rules for procurement, receiving, supplier invoices, payments, inventory, cash, projects, payroll imports, and future POS/sales feeds.
4. Manual journal eligibility, evidence requirements, review/approval segregation, and reversal policy.
5. Accounts Payable three-way-match tolerances, invoice exception ownership, duplicate-invoice controls, and payment-release segregation.
6. Bank, petty-cash, branch-deposit, advance, and liquidation reconciliation ownership.
7. Inventory valuation method, landed-cost allocation policy, and cutover/opening-balance approach.
8. Tax/VAT/statutory reporting scope and adviser-validation requirements before production use.
9. Finance roles, confidential report access, and scope rules across company, brand, location, department, cost center, and project dimensions.
10. Employee/custodian cash-advance payee and payment handoff architecture. The current Phase 3 foundation must not reuse supplier-only AP payment requests for employee or custodian advances until `III-009` / `P3-BLOCK-001` is resolved by council or authorized owners.
