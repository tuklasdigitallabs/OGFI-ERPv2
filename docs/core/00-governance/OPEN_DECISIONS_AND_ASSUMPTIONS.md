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

## 3. Open Phase I policy decisions

| ID | Topic | Baseline default for build | Decision needed from | Risk if wrong | Target before |
|---|---|---|---|---|---|
| OD-01 | Financial approval thresholds | Seed editable ranges: ≤₱10k, ₱10,001–₱50k, ₱50,001–₱200k, >₱200k | Executive + Finance | Incorrect approval exposure | UAT |
| OD-02 | Budget enforcement | Flag over-budget; do not block when authorized exception exists | Finance | Requests may bypass budget intent | Phase III configuration, seed now |
| OD-03 | Direct branch buying | Allowed only by emergency workflow or explicit policy | Operations + Purchasing | Uncontrolled supplier buying | UAT |
| OD-04 | RFQ / quotation requirement | Required above configurable value or for non-contracted supplier | Purchasing + Finance | Overly slow or weak buying control | UAT |
| OD-05 | Stock count cadence | High-risk/perishable: weekly; all inventory: monthly; configurable by item/location | Operations + Warehouse | Variance not found early | Pilot |
| OD-06 | Lot/expiry requirement | Required for regulated/perishable/high-risk items; configurable by item | Operations + QA/Food Safety | Waste and traceability gaps | Master-data setup |
| OD-07 | Wastage photo threshold | Resolved for Phase I by `DEC-0021`; evidence is configurable by reason, value, and repeat-loss policy | Operations + Finance | Weak evidence for loss | UAT |
| OD-08 | Adjustment approval | Resolved for manual stock adjustments by `DEC-0023`; opening-balance and backdated policy remain separate go-live decisions | Finance + Operations | Inventory manipulation risk | UAT |
| OD-09 | Branch-to-branch transfers | Resolved for Phase I dispatch/receipt and receipt-event exceptions by `DEC-0011`, `DEC-0012`, and `DEC-0025`; advanced return/replacement/finance treatment remains deferred | Operations + Warehouse | Duplicate/missing stock | UAT |
| OD-10 | Emergency purchase cap | Allow emergency request with mandatory reason, receipt, and post-review | Executive + Purchasing | Abuse of emergency path | UAT |
| OD-11 | Notification channels | `DEC-0022` implements scoped in-app notifications and manual approval-reminder scans; email, chat/SMS, schedulers, and queues remain deferred | Management + IT | Alert fatigue or missed urgent work | Pilot |
| OD-12 | User identity/login | Username/password + MFA for privileged roles initially; SSO later if desired | IT + Management | Security/admin burden | Technical build |
| OD-13 | POS integration | Deferred; Phase I uses operational procurement/inventory metrics | Operations + IT | Misleading sales/food-cost dashboard if assumed present | Phase II planning |
| OD-14 | Finance/accounting implementation policy | `DEC-0006` confirms OGFI ERP as the accounting system of record; implementation remains deferred pending Finance & Accounting Decision Council, finance-owner review, chart-of-accounts ownership, posting rules, period-close policy, reconciliation ownership, tax/statutory validation, cutover/opening balances, and go-live controls | Finance + IT + Executive | Accounting build could weaken controls, create duplicate postings, or produce unreconciled financial statements if implemented before policy decisions | Phase III planning |
| OD-15 | Supplier portal | Deferred; manage suppliers internally in Phase I | Purchasing | Manual supplier communication remains | Phase V planning |
| OD-16 | User role assignment mutation sequencing | Resolved for a constrained non-sensitive role path by `DEC-0002`; sensitive/admin/approver grants remain blocked pending policy | Management + IT | Incorrect authority grants, self-escalation, or approval-control bypass | Before sensitive role administration |

## 4. System assumptions to implement as configuration

- Document numbering prefixes and annual sequence reset.
- Approval templates by company, brand, location, department, transaction type, amount, budget state, and urgency.
- Reason codes for emergency purchase, delivery discrepancy, wastage, adjustment, return, cancellation, rejection, and backdating.
- Status labels and colors are consistent but configurable only by controlled administration.
- Default approval reminder intervals: 24 hours due-soon and overdue buckets for manual in-app scans; email/chat/SMS escalation remains deferred unless approved without queueing.
- Default currency: PHP. Support currency code storage for future tenants.
- Default time zone: Asia/Manila. Store timestamps in UTC.
- Default attachment retention: retain for the transaction retention period; exact legal retention to be confirmed by Finance/Legal.

## 5. Decisions required before production go-live

The following must be confirmed before production enforcement, even if development begins with configurable defaults:

1. Approval thresholds and authorized approvers.
2. Emergency-purchase ceiling and post-approval deadline.
3. Mandatory attachment/evidence requirements by transaction type and value.
4. Which inventory categories require lot/expiry tracking.
5. Count frequency by location and category.
6. Opening inventory cutover date and valuation method.
7. Supplier accreditation rules and blocked-supplier policy.
8. Data retention, privacy, and backup ownership.
9. UAT signatories and authority to approve production go-live.

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

## Phase 1.5 — Projects & Implementation Tracker Open Decisions

The following are defaults or pending configuration decisions. Do not hardcode them:

1. Default task status templates by project type (ERP rollout, renovation, marketing, training, compliance, etc.).
2. Which project templates may be created by Project Managers versus Project Administrators.
3. Default overdue reminder timing and escalation grace period.
4. Whether task dependencies are informational only in Phase 1.5 or can block status transition.
5. Which project types require formal project gates and who may sign them off.
6. Default restricted-project categories and attachment retention rules.
7. Whether project tasks may be assigned to multiple people by default or only a primary owner plus collaborators.
8. Required evidence for task completion by project template.
9. Maximum attachment size and permitted file types for project evidence.
10. Whether calendar view is required at first release or follows immediately after board/list stability.
11. Which shared Work Management Engine status templates are allowed by default, and who may edit or publish them.
12. Whether project, campaign, or restricted-container membership can grant access beyond normal location/department scope.
13. Whether dependencies remain informational in the first shared-engine release or can block status transitions.
14. How date-only calendar events, scheduled datetime events, and user/company timezone display should behave across board, list, calendar, and reports.
15. Concurrency/versioning strategy for drag/drop, reorder, reassignment, due-date, dependency, and status updates.

Current implementation note: task detail supports a bounded reassignment path using active project membership, expected task version, reason-required guards for high-friction work, activity history, and scoped in-app notification. This does not resolve the broader drag/drop, reorder, dependency, due-date, and bulk reassignment concurrency policy.

## Phase II — Marketing Operations Open Decisions

Marketing Operations planning is included as documentation only. Before any implementation work, OGFI must confirm:

1. Campaign, promotion, new-item launch, and creative-work status templates.
2. Promotion approval routes by brand, branch scope, date range, offer type, and operational risk.
3. Who may mark a campaign, promotion, or new-item launch as Scheduled, Live, Completed, or Cancelled.
4. Required readiness evidence before a promotion or launch can go live.
5. Calendar conflict rules for overlapping campaigns, mall events, holidays, branch openings, and promotions.
6. Marketing asset access, retention, approval, and branch visibility rules.
7. Reporting metrics, post-campaign review ownership, and source systems for performance data.

## Phase IV — Branch Expansion & Construction Open Decisions

Branch Expansion & Construction planning is included as documentation only. Before any implementation work, OGFI must confirm:

1. Expansion project types, lifecycle phases, and required gate evidence.
2. Target opening date change authority, reason requirements, and risk thresholds.
3. Workstream templates for permits, construction, procurement, finance/capex, IT, HR, training, marketing, and operations readiness.
4. Restricted project visibility and confidential attachment handling.
5. Contractor/supplier reference rules and whether any external collaboration remains out of scope.
6. Capex, PO, invoice, payment, and budget link display rules that preserve finance/procurement source controls.
7. Punch-list, defect, blocker, and readiness closure authority.

## Phase III — Finance & Accounting Open Decisions

The finance/accounting add-on is included as planning documentation only. Before any implementation work, OGFI must confirm:

1. Chart of Accounts ownership, approval, versioning, and maintenance rules.
2. Fiscal calendar, accounting period open/soft-close/lock/reopen policy, and authorized reopen approvers.
3. Source-to-journal posting rules for procurement, receiving, supplier invoices, payments, inventory, cash, projects, payroll imports, and future POS/sales feeds.
4. Manual journal eligibility, evidence requirements, review/approval segregation, and reversal policy.
5. Accounts Payable three-way-match tolerances, invoice exception ownership, duplicate-invoice controls, and payment-release segregation.
6. Bank, petty-cash, branch-deposit, advance, and liquidation reconciliation ownership.
7. Inventory valuation method, landed-cost allocation policy, and cutover/opening-balance approach.
8. Tax/VAT/statutory reporting scope and adviser-validation requirements before production use.
9. Finance roles, confidential report access, and scope rules across company, brand, location, department, cost center, and project dimensions.
