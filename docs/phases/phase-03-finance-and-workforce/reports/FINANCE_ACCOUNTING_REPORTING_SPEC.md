# OGFI ERP — Finance & Accounting Reporting Specification

**Status:** Planning specification
**Purpose:** Define the reports and reconciliation requirements for an official accounting system of record.

## 1. Reporting principles

- All official financial reports derive from posted general-ledger and controlled subledger records.
- Reports must show company, period, generated timestamp, filters, and report version/definition where relevant.
- Financial dimensions must be filterable only within authorized scope.
- A report must not combine operational estimates and posted accounting values without clearly labelling the difference.
- Exports preserve applied filters and report definitions.
- Every report has a data owner and reconciliation statement.

## 2. Core financial statements

| Report | Purpose | Reconciliation requirement |
|---|---|---|
| Trial Balance | Opening, movement, and ending balances by account | Debits = credits; agrees to GL |
| General Ledger Detail | Journal-line activity by account/dimension | Traces to posted journals |
| Balance Sheet | Assets, liabilities, equity | Agrees to account classes/GL |
| Income Statement / P&L | Revenue, costs, expenses by period | Agrees to account classes/GL |
| Cash Flow Statement | Cash movement classification | Agrees to cash/bank accounts and defined method |
| Branch P&L | Branch performance by governed dimensions | Totals reconcile to company P&L |
| Brand P&L | Brand performance by governed dimensions | Totals reconcile to company P&L |
| Department / Cost Center Report | Accountability view | Uses governed dimensions |

## 3. Subledger and operational finance reports

- AP aging
- AP invoice register
- Supplier ledger
- Payment schedule and release register
- PO / receipt / invoice matching report
- Match exception report
- Supplier credit-note report, currently register-only for drafted/cancelled/pending-application credits until settlement application is implemented
- AR aging and customer ledger when AR scope is released
- Cash advance and liquidation aging
- Petty cash fund and replenishment report
- Branch deposit report
- Bank reconciliation summary/detail
- Unmatched bank transaction report
- Budget vs actual vs commitment
- Project/capex budget, commitment, and actual report
- Fixed asset register and depreciation report when released
- Allocation run report when released
- Landed-cost allocation report when released

## 4. Finance Exception Center reports

| Exception | Required fields |
|---|---|
| Posting failure | source, failure reason, owner, age, retry state |
| Missing mapping | source, missing account/dimension/rule, owner |
| Duplicate invoice/payment risk | supplier/payee, candidate records, value, status |
| Match exception | PO, receipt, invoice, variance, tolerance, owner |
| Payment control exception | request, approval/release state, due date, owner |
| Cash/bank exception | deposit/statement/cash count, variance, owner |
| Period-close exception | period, checklist item, due date, owner |
| Manual journal review | journal, justification, approver, age |
| Budget/project threshold breach | dimensions, budget/commitment/actual, owner |

## 5. Mandatory report filters

Where applicable:

```text
Tenant
Company
Brand
Location
Department
Cost Center
Project
Account / account class
Supplier / customer
Document/source type
Status
Date / accounting period
Created by / owner / approver
```

## 6. Financial report auditability

Each official report/export must retain or display:

- Reporting period/date range
- Filter values
- Applied accounting status definition
- Generated timestamp
- Requesting user or report job where practical
- Version/effective date of statement layout or mapping
- Drill-down paths to journal/source detail, subject to permission

## 7. Reconciliation rules

- Trial Balance debit total equals credit total.
- AP aging total agrees to AP control-account balance after defined timing differences.
- AR aging total agrees to AR control-account balance once AR is released.
- Bank reconciliation adjusted book balance agrees to cash/bank GL balance.
- Budget actual amounts agree to applicable posted financial records; commitment remains clearly distinct from actual.
- Branch/brand/department/project rollups reconcile to company totals within the selected scope.
- Exception reports show whether the exception changes posting, cash, liability, or reporting state.

## 8. Initial dashboard priorities

### Finance overview

- Cash position and upcoming payments
- AP due/overdue
- Budget commitments and exceptions
- Open match exceptions
- Open bank/deposit exceptions
- Unliquidated advances
- Pending payment approvals/releases
- Period-close status
- Manual journal review queue

### Executive overview

- Company/brand/branch P&L
- Budget vs actual
- Cash position
- Payables due
- Capex/project cost status
- High-risk finance exceptions
- Period-close completion
