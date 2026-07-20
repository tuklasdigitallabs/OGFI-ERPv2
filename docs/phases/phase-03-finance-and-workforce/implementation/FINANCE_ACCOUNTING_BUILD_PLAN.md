# OGFI ERP — Finance & Accounting Build Plan

**Status:** Controlled implementation started for read-side finance foundation, controlled manual journal foundation, budget/commitment visibility, budget source-hook projection, expense-request control, AP/payment preparation, payment release control, and bank/cash reconciliation readiness; bank API integration, AP settlement mutation, expense payment handoff, period close, global budget hard-block enforcement, and official-books production use remain gated.
**Purpose:** Define the safest staged sequence for building an official accounting system of record without destabilizing existing procurement, inventory, projects, or working application code.

## 1. Build preconditions

Finance code may proceed only inside the approved controlled-implementation boundary. Mutating finance workflows, schema that stores official books, automatic posting, payment release, reconciliation mutation, and production finance use must still wait until all relevant gates are complete:

- Finance & Accounting Decision Council completed.
- Confirmed decision record for accounting system of record is present.
- Current repository compatibility review completed.
- Finance owner, accountant/controller, and implementation owner assigned.
- Open policy decisions are identified and categorized as build blocker, configurable baseline, or later release.
- Existing procurement, receiving, inventory, approval, audit, and project data boundaries are mapped.
- Backups, staging environment, migration rehearsal approach, and restore test plan are available.

Current approved implementation boundary:

- Finance authorization and role/scope policy integration may be implemented.
- Finance overview and subworkspace pages may show read-side guardrails and source-linked PO/receiving readiness.
- Finance permission catalog rows may be added for role configuration.
- Finance configuration setup may define fiscal years, accounting periods, account classes, chart of accounts, and disabled posting-rule templates for review.
- Manual journal draft, submit, approval, posting, and reversal foundation may be implemented with balance, open-period, idempotency, no-self-approval, immutability, audit, and reversal controls.
- Budget and commitment-control foundation may be implemented for approved budget records, lines, revisions, source-linked commitments, threshold classification, idempotent source-event commitment projection, and posted-journal actual visibility. It must remain warning-first until configurable enforcement, approval-instance integration, and real PR/PO/AP source-transition hook rollout pass UAT.
- Cash advance and liquidation foundation may be implemented for scoped request, movement, liquidation, and liquidation-line records with outstanding-balance visibility. It must remain non-posting until payment release handoff, journal posting, bank mutation, reconciliation ownership, recovery policy, approval-instance integration, and UAT are approved.
- Petty cash foundation may be implemented for scoped fund custody, request, liquidation, and ledger-marker records with balance and exception visibility. It must remain non-posting until payment release handoff, journal posting, bank mutation, reconciliation close/reopen, shortage/overage policy, approval-instance integration, and UAT are approved.
- Expense request foundation may be implemented for scoped operational expense intent, line details, evidence references, budget status visibility, and non-mutating source links. It must stop before AP/payment creation, settlement, bank release, or journal posting.
- Supplier invoice capture and AP three-way match foundation may be implemented with location scope, duplicate detection signals, PO/receiving links, accepted-quantity matching, variance holds, exception records, and audit.
- Payment request preparation may be implemented as an AP-invoice-linked approval record that stops before cash/bank release, journal posting, supplier settlement, or reconciliation.
- Payment release control may be implemented as an approved-payment-request-linked offline/manual release record with allocations, evidence references, idempotent execution attempts, and SoD checks. It must stop before bank API integration, AP settlement mutation, automated reconciliation, supplier-ledger settlement, or journal posting.
- Bank/cash reconciliation readiness may be implemented for bank account master data, branch deposit evidence, imported statement headers/lines, and source-linked reconciliation matches that stop before payment release, bank API integration, journal posting, supplier settlement, or period close.
- No automated source posting, budget hard blocking, bank API integration, period-close, supplier settlement, inventory, PO, receiving, AP invoice, or operational source-record mutation is authorized by this boundary.

## 2. Delivery principle

Build finance as a modular domain. Do not add finance rules directly into purchase, inventory, project, or UI components.

```text
Source domain
→ governed financial event
→ finance posting service
→ general ledger / subledger
→ reconciliation / close
→ reports
```

No release should introduce a broad “post to accounting” button without controlled source eligibility, mapping, idempotency, audit, authorization, period checks, and reversal behavior.

## 3. Safe workstreams

### Workstream A — Discovery and design

Deliverables:

- Actual code/data path map
- Finance source-event inventory
- Gap/conflict register
- Approved chart-of-accounts ownership model
- Finance decision council outcome
- Initial posting-rule catalogue
- Source-to-journal traceability matrix
- Opening-balance and cutover outline
- Threat model and fraud/control scenarios
- UAT and reconciliation test plan

No production code or migration during this workstream without separate approval.

### Workstream B — Finance foundation

Build only after Workstream A approval, except for the currently approved read-side foundation slice described above:

- Finance authorization and role/scope policy integration
- Chart of accounts and account classes
- Fiscal years and accounting periods
- Finance dimensions and validation
- Journal draft/posted/reversal model
- Posting-attempt/idempotency model
- Audit event and attachment integration
- Controlled configuration for posting rules
- Test harness for balancing, period, and authorization rules

Gate: no source-domain integration yet until the GL foundation is independently tested.

### Workstream C — Accounts Payable and controlled postings

- Supplier invoice capture — backend foundation implemented for controlled invoice headers/lines.
- PO/receipt/invoice matching — backend foundation implemented against PO line and accepted receiving quantity basis.
- Invoice exceptions/holds/credits — holds and exception records implemented; supplier credits remain pending.
- Payment request preparation — backend foundation implemented for AP-invoice-linked request/submit/approve/reject/cancel controls.
- Payment release control — foundation implemented for offline/manual evidence and idempotent execution-attempt records; production release workflow, bank integration, AP settlement, and GL posting remain pending.
- AP subledger
- Financial events for invoice liability and payment settlement
- Duplicate invoice/payment safeguards
- AP aging and supplier ledger
- Reconciliation tests to GL

Gate: no live payment release until roles, approval, posting, reversal, and audit tests pass.

### Workstream D — Cash, bank, close, and core reports

- Bank accounts and statement intake — foundation implemented for PHP-only account setup and imported statement visibility.
- Deposit evidence and branch cash exceptions — foundation implemented for branch deposit declarations and evidence-linked reconciliation readiness.
- Bank reconciliation — foundation implemented for source-linked statement/deposit matches; close approval, release impact, and exception resolution remain pending.
- Finance exception center — readiness foundation implemented through close exceptions linked to accounting periods and close runs; production resolution/waiver approvals remain pending.
- Period close checklist and state transitions — readiness foundation implemented through close runs, checklist items, exceptions, and idempotent attempts; production period status transitions, reopen, and re-lock remain pending.
- Trial balance, general ledger, AP reports, initial P&L/balance-sheet layouts
- Close/reopen/re-lock UAT

### Workstream E — Extended accounting

- AR and collections
- POS/branch sales reconciliation
- Fixed assets/depreciation
- Project/capex accounting
- Landed-cost allocation
- Shared-cost allocations
- Payroll journal integration
- Tax/compliance support and adviser validation

## 4. Mandatory implementation controls

Every finance work item must state:

- Source document/event
- Business owner
- Accounting owner
- Roles and segregation requirements
- Accounting dimensions
- Posting trigger
- Posting rule/version
- Idempotency strategy
- Transaction boundary
- Failure/retry behavior
- Period behavior
- Reversal/correction behavior
- Audit/attachment behavior
- Reports/reconciliation impact
- Tests and UAT evidence
- Migration/cutover impact

## 5. Explicit non-goals for first implementation increments

Do not begin with:

- Full tax automation
- Multi-currency or FX
- Complex consolidation
- AI-posted journals
- Uncontrolled Excel journal import
- Bank API integration
- Full payroll engine
- Workforce wage, statutory deduction, attendance-device source-of-truth, or payroll export logic
- Broad financial dashboards before reconciliation works
- Retrofitting all historical activity without an approved cutover plan

## 6. Approval gates

| Gate | Required approval |
|---|---|
| Documentation compatibility | User / project owner |
| Finance design decision council | Product + Finance leadership |
| Logical data model | Architect + database + finance owner |
| Schema/migration plan | User + technical owner + finance owner |
| First auto-posting rule | Finance owner + controller + QA/security review |
| Payment release workflow | Finance leadership + security + QA |
| Period-close workflow | Controller/accountant + QA |
| Production finance pilot | Executive + finance owner + release manager |
| Official books go-live | Executive + finance owner + accountant/adviser sign-off |

## 7. First safe coding milestone

Only after approval:

> A finance administrator can configure a chart-of-accounts sandbox and an OPEN accounting period; an authorized accountant can prepare a balanced manual journal draft; a separate reviewer can approve it; the system posts one immutable journal with audit history; the journal can be reversed through an authorized flow; no production operational records are changed.

This milestone validates the ledger core before procurement, inventory, payments, or bank integration creates real financial consequences.

## 8. Definition of done for each finance increment

- Scope agreed and documented
- Role/scope/segregation tests pass
- Ledger invariants pass
- Duplicate/retry/concurrency tests pass where relevant
- Reversal and error paths pass
- Reports reconcile
- Migration/cutover effects understood
- Documentation and knowledge-base items updated
- Deployment/rollback/restore plan approved where production data is affected
