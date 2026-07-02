# OGFI ERP — Finance & Accounting Product Specification

**Status:** Planning specification
**Build authorization:** Documentation is ready for review. No code, schema, migration, or production-finance work is authorized until a Finance & Accounting Decision Council, accountant/finance-owner review, and implementation approval are complete.

## 1. Product objective

Build the finance domain that makes OGFI ERP the official accounting system of record while preserving restaurant and branch operational controls.

The module must allow OGFI to trace every material financial consequence from its source event through approval, posting, reconciliation, close, and reporting.

```text
Operational source
→ controlled approval / evidence
→ accounting posting eligibility
→ journal entry
→ subledger / reconciliation
→ period close
→ financial statement and audit trail
```

## 2. Confirmed scope

### In scope

- Chart of Accounts and account classes
- Fiscal years and accounting periods
- Double-entry General Ledger
- Journal entries, journals, templates, reversals, and controlled manual journals
- Accounting dimensions: company, brand, location, department, cost center, project, source document, supplier/customer where applicable
- Budget and commitment control
- Accounts Payable: supplier invoices, PO/receiving/invoice match, credits, disputes, payment requests, payments, AP aging
- Accounts Receivable where relevant: corporate accounts, catering, delivery-platform receivables, reimbursements, recoveries, and customer billing
- Cash, bank, petty cash, advances, liquidation, branch deposits, and bank reconciliation
- Branch sales reconciliation when POS data is integrated or imported
- Fixed assets and depreciation
- Project/capex accounting and project cost control
- Landed-cost allocation in PHP
- Inter-branch, warehouse, commissary, and head-office allocation rules
- Payroll journal import or controlled payroll posting integration
- Finance exception center
- Financial statements, operational finance reports, exports, and audit reports
- Accounting period close, lock, reopen, and close checklist
- Tax and statutory-report support as configurable, adviser-validated capabilities

### Explicitly out of scope now

- Multi-currency transactions
- Exchange-rate tables
- FX revaluation
- Foreign-exchange gains or losses
- Automatic tax/statutory filing without adviser validation
- Uncontrolled spreadsheet import that directly posts journals
- Public financial portals
- External contractor finance access
- AI-generated journal entries that can post without human authorization

## 3. Product principles

1. **One ledger, traceable sources.** The general ledger is the financial truth; every posting identifies its source or authorized manual justification.
2. **Double entry always.** Each posted journal balances debits and credits in PHP.
3. **Posted is immutable.** Correct through reversals and replacement entries, never through destructive edit/delete.
4. **Source workflow remains controlled.** Procurement, receiving, inventory, projects, cash, and sales maintain their own source-record controls.
5. **No duplicate posting.** Retries, browser refreshes, concurrent actions, and job replay must not create duplicate journals.
6. **Scope and segregation matter.** Users see and act only inside authorized company/brand/location/department/project scope; no self-approval for controlled finance actions.
7. **Policy is configurable.** Approval routes, close calendars, account mappings, tax codes, expense classifications, exception thresholds, and required evidence are configuration—not hardcoded UI logic.
8. **Reporting reconciles.** Statement, subledger, budget, and operational reports reconcile to governed records.
9. **PHP only for this release.** Use PHP fixed-precision money. A `currency_code` field may be retained as a fixed `PHP` value where it avoids later destructive migration, but no FX feature or UI is exposed.

## 4. Finance module map

```text
Finance & Accounting
├── Finance Overview
├── Finance Exception Center
├── Chart of Accounts
├── Fiscal Years & Accounting Periods
├── General Ledger
│   ├── Journal Entries
│   ├── Journal Templates
│   ├── Posting Rules
│   ├── Reversals
│   └── Manual Journal Review
├── Budget & Commitment Control
├── Accounts Payable
│   ├── Supplier Invoices
│   ├── Three-Way Match
│   ├── Invoice Disputes & Credit Notes
│   ├── Payment Requests
│   ├── Payment Batches
│   └── AP Aging
├── Accounts Receivable
│   ├── Customers / Corporate Accounts
│   ├── Customer Invoices
│   ├── Collections
│   └── AR Aging
├── Cash & Bank
│   ├── Bank Accounts
│   ├── Bank Statements
│   ├── Bank Reconciliation
│   ├── Branch Deposits
│   ├── Petty Cash
│   └── Cash Advances / Liquidation
├── Assets & Capex
├── Project Finance
├── Allocations & Recurring Charges
├── Tax & Compliance Support
├── Financial Close
└── Financial Reports
```

## 5. Core source-document chain

The system should expose a navigable chain where applicable:

```text
Purchase Request
→ Purchase Order
→ Goods Receipt / Receiving Discrepancy
→ Supplier Invoice
→ Match Exception or Approval
→ Payment Request
→ Payment
→ Journal Entry
→ Bank Reconciliation
→ Period Close
```

Other examples:

```text
Branch Sales / POS Import
→ Cashier Count / Settlement
→ Branch Deposit
→ Bank Statement
→ Reconciliation
→ Journal Entry
```

```text
Project Budget
→ Project Purchase Request / PO
→ Supplier Invoice / Payment
→ Project Cost
→ Capex / Asset Recognition where applicable
```

The finance module shows the chain; it does not silently modify the underlying source document outside its approved transition rules.

## 6. Primary user roles

| Role | Core responsibility | Must not do alone |
|---|---|---|
| Finance Administrator | Finance configuration, controlled master-data administration | Approve own sensitive configuration change where policy requires dual control |
| AP Processor | Invoice capture, matching, payment preparation | Release own payment |
| Finance Reviewer / Controller | Review journals, mismatches, reconciliations, close evidence | Review own unreviewed manual journal where segregation is configured |
| Treasurer / Cash Custodian | Bank, cash, payment release, petty-cash custody | Approve own release or reconciliation without separate review |
| Branch Cashier / Branch Manager | Cash count, deposit evidence, daily sales close | Final finance reconciliation |
| Accountant | Journal preparation, close, account review | Approve own high-risk journals when policy requires another reviewer |
| Approver | Approve within configured authority | Approve own request or payment |
| Auditor | Read-only audit/reconciliation access | Post, approve, or alter records |
| Executive | Consolidated review and high-value approval | Bypass ledger/audit controls |

Exact roles and authority thresholds remain configuration decisions.

## 7. Finance release slices

### Finance A — Accounting-control foundation

- Finance master data: account types, chart of accounts, dimensions, fiscal years, period states
- Budget and commitments
- Supplier invoice capture and AP subledger foundation
- Three-way matching and match exceptions
- Payment request, approval, and payment-release controls
- Petty cash, cash advances, liquidation, and branch deposit evidence
- Finance Exception Center
- Posting-rule design and controlled accounting-event framework
- Audit, attachments, notifications, and role/scope enforcement

### Finance B — General Ledger and close

- Double-entry journal engine
- Auto-posting from approved Finance A events
- Manual journal workflow and review
- Reversal workflow
- Accounting period close / lock / reopen
- Bank reconciliation
- AP aging, trial balance, general ledger, and initial financial statement reports
- Branch and brand dimension reporting
- Finance UAT for accounting integrity and close

### Finance C — Broader accounting depth

- Accounts Receivable
- Branch sales/POS reconciliation
- Fixed assets and depreciation
- Project/capex accounting
- Cost allocation: warehouse, commissary, HO, shared services
- Payroll journal integration
- Landed-cost allocation
- Tax and statutory-report support
- Cash-flow planning and advanced management reporting

No release slice is considered production-ready for official books until the finance controls for that slice are tested, reconciled, and formally approved.

## 8. Accounting-control requirements

### 8.1 Journal integrity

- Each posted journal has at least two lines.
- Total debit equals total credit in PHP.
- Posted journals and lines cannot be updated or deleted.
- Journal source, posting rule version, posting timestamp, actor/system actor, period, and audit trail are retained.
- A journal may be reversed only by an authorized reversal process.
- A manual journal carries business justification, supporting evidence, authorized approver(s), and review state as configured.
- A superseding journal links to the reversal/replacement chain.

### 8.2 Period control

Allowed period statuses:

```text
FUTURE → OPEN → SOFT_CLOSED → LOCKED
                     ↘ REOPENED (authorized, time-bounded)
```

- Posting to `OPEN` is allowed according to role and source rule.
- `SOFT_CLOSED` blocks routine posting but permits configured close adjustments.
- `LOCKED` blocks posting, reversal, and editing except for a controlled reopen action.
- Reopening requires reason, approval, exact period scope, audit evidence, and post-reopen review.

### 8.3 Posting and idempotency

- Source documents expose one controlled financial posting eligibility state.
- Posting uses a durable idempotency key or equivalent source-event uniqueness constraint.
- The source event, journal, journal lines, posting-status update, and audit event are committed atomically.
- Failed posting cannot leave a half-posted source record.
- A retry must return the existing result or a controlled failed state—not create duplicate entries.
- Background processing uses stable source identifiers and retry-safe behavior.

### 8.4 Segregation of duties

Examples of separate duties:

```text
Supplier setup      ≠ supplier approval
Invoice capture     ≠ payment release
Payment preparation ≠ payment release
Cash custody        ≠ final reconciliation approval
Journal preparation ≠ high-risk journal approval
Period close prep   ≠ period-lock approval
```

The exact workflow is configurable, but the system must not permit an untraceable bypass.

## 9. Key workflow boundaries

### Procurement and receiving

- Purchase Request / PO creates a budget or commitment consequence only when configured and approved.
- Goods receipt provides inventory/expense recognition evidence; it does not automatically settle a supplier liability without a valid invoice or configured accrual process.
- Supplier invoice is matched against PO and receiving evidence.
- Approved payment changes cash/bank status only through controlled release and accounting posting.
- Receiving discrepancies, returns, supplier credits, and invoice disputes are represented explicitly.

### Inventory

- Inventory remains movement-ledger driven.
- Finance may receive an accounting event from a finalized inventory transaction, but it must not mutate stock balances.
- Inventory valuation method, landed-cost treatment, write-off mapping, and period cutover rules must be decided before finance production use.
- Any inventory valuation adjustment must retain source reason, approval, reversal path, and audit trail.

### Projects

- Project task completion does not create accounting entries by itself.
- Project financial impact comes from approved source records such as purchase, invoice, payment, asset/capex recognition, allocation, or authorized manual journal.
- Project budget, commitment, actual cost, change order, and contingency reporting must share the same financial dimensions.

### Cash and branch sales

- Branch cash count, deposit evidence, and POS settlement are operational evidence.
- Finance reconciliation determines the financial exception or posting outcome.
- Missing deposits, cash over/short, duplicate settlement, and unsupported adjustments route to exception handling.

## 10. Finance Exception Center

The Finance Exception Center must be actionable, filterable, assignable, and auditable.

Initial exception types:

- Unbalanced or failed posting
- Duplicate supplier invoice risk
- Duplicate payment risk
- PO/receiving/invoice mismatch
- Missing mandatory attachment
- Invoice without valid source evidence
- Payment pending beyond due date
- Payment awaiting approval/release
- Unliquidated cash advance
- Petty-cash shortage/overage
- Missing branch deposit
- Unreconciled bank transaction
- Period-close task overdue
- Manual journal awaiting review
- Posting attempted in closed/locked period
- Budget exception / authorized override
- Project capex or commitment threshold breach
- Supplier credit pending application

## 11. Open policy decisions before build

These must be recorded as `OPEN` until confirmed:

1. Fiscal-year start/end and close calendar.
2. Chart-of-accounts ownership, coding convention, account classes, and reporting layout.
3. Inventory valuation method and cutover approach.
4. Which events post automatically versus require accounting review.
5. Approval thresholds for payments, manual journals, period reopen, budget overrides, asset disposals, write-offs, and supplier bank-detail changes.
6. Required matching tolerance by quantity, price, freight, tax, and service invoices.
7. Whether payment release requires one or two authorized signatories per bank/account/value band.
8. Bank statement import method and reconciliation cadence.
9. Branch sales/POS source, settlement rules, and variance thresholds.
10. Cash-advance liquidation deadline, recovery policy, and evidence standards.
11. Tax code ownership and statutory-report requirements.
12. Fixed-asset capitalization thresholds, useful lives, and depreciation policy.
13. Accounts-receivable scope and credit policy.
14. Retention period and legal/audit requirements for source evidence.
15. Opening-balance cutover date, opening-balance approval, reconciliation, and locked historical period approach.
16. Payroll integration source, approval, and posting cadence.

## 12. Acceptance criteria for a finance production slice

A production finance slice is not ready unless:

1. Relevant journals balance and are immutable once posted.
2. Source-to-journal traceability works end-to-end.
3. Duplicate-posting and failed-posting tests pass.
4. Relevant subledger reconciles to the GL.
5. Period status prevents unauthorized posting.
6. Reversal and replacement paths preserve history.
7. Role/scope/segregation negative tests pass.
8. Reports reconcile to the ledger and source records.
9. Finance owners sign off on actual business scenarios.
10. Backup, restore, and operational fallback are verified for the release scope.
