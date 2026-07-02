# OGFI ERP — Finance Workflow: Bank and Cash Reconciliation

**Status:** Detailed planning specification
**Purpose:** Reconcile cash, bank, branch deposits, payment releases, and statement transactions to the official ledger.

## 1. Scope

- Bank account master data
- Cash and bank account mapping
- Branch deposit evidence
- Bank statement import/manual controlled entry
- Reconciliation matching
- Cash over/short and missing-deposit exceptions
- Payment settlement verification
- Reconciliation adjustments and approval
- Reconciliation report and period-close evidence

## 2. Branch cash-to-bank chain

```text
POS / sales settlement where available
→ physical cash count
→ branch manager review
→ deposit preparation
→ deposit slip / bank evidence
→ bank statement transaction
→ finance reconciliation
→ exception closure or approved adjustment
```

## 3. Reconciliation statuses

```text
UNMATCHED
MATCHED
PARTIALLY_MATCHED
EXCEPTION
ON_HOLD
ADJUSTMENT_PENDING
RECONCILED
CLOSED
```

## 4. Required controls

- Each bank account belongs to an authorized company and ledger account.
- Bank statement lines are immutable once imported/confirmed; corrections use documented adjustment/import correction workflow.
- A reconciliation line links to the journal/payment/deposit/source record that explains it.
- A user who prepares a reconciliation must not provide final approval where segregation is configured.
- Missing deposit, duplicate deposit, cash shortage, and unexplained bank charge require a structured exception and owner.
- Reconciliation adjustment is a controlled accounting event, not a free-text workaround.
- Statement date, value date, source, import reference, and attachment/evidence are retained.

## 5. Bank reconciliation workflow

```text
Open statement period
→ import or record statement lines
→ match known payments/deposits/journals
→ investigate unmatched/partial items
→ create approved adjustment only when justified
→ reviewer approval
→ reconciliation closed
→ close evidence retained
```

## 6. Cash controls

### Petty cash

```text
Fund setup
→ release / advance
→ expense evidence
→ liquidation
→ review
→ replenishment / return
→ reconciliation
```

### Cash advance

```text
Request
→ approval
→ release
→ use and evidence
→ liquidation
→ return / recovery / approved shortfall
→ accounting settlement
```

### Branch cash over/short

```text
Count or settlement variance
→ reason/evidence
→ branch review
→ finance review
→ approved disposition
→ accounting posting if required
```

No cash variance should be hidden by changing a cash count or editing a posted journal.

## 7. Bank-account change controls

Supplier bank-detail changes are high risk. Require:

- Authorized requester and verifier
- Effective date
- Supporting evidence
- Separate approval where configured
- Audit log
- Payment hold/review rule for recently changed details where policy requires

## 8. Reports and close evidence

- Bank reconciliation summary/detail
- Outstanding deposits
- Outstanding payments
- Unmatched statement lines
- Cash over/short report
- Petty-cash reconciliation
- Cash-advance aging
- Deposit exception report
- Reconciliation completion dashboard
