# OGFI ERP — Finance Workflow: Accounting Period Close

**Status:** Detailed planning specification
**Purpose:** Govern financial periods, close tasks, posting restrictions, reopen authority, and close evidence.

## 1. Objective

Prevent unauthorized or untraceable changes to completed financial periods while allowing controlled close adjustments and exceptional reopening.

## 2. Period states

```text
FUTURE
→ OPEN
→ SOFT_CLOSED
→ LOCKED
→ REOPENED (authorized exception only)
```

### State meanings

| Status | Meaning | Routine posting |
|---|---|---|
| FUTURE | Period exists but cannot receive normal transactions. | No |
| OPEN | Normal posting period. | Yes, within role/source rules |
| SOFT_CLOSED | Routine activity stopped; defined close adjustments may be allowed. | Restricted |
| LOCKED | Finalized operationally; no posting/reversal/editing. | No |
| REOPENED | Temporary authorized exception with reason and owner. | Only within approved scope |

## 3. Close checklist

At minimum, each closing period tracks:

- Branch sales/POS reconciliation complete or documented exception
- Cash counts and bank deposits reviewed
- Bank reconciliation complete or documented exception
- Supplier invoices and AP match exceptions reviewed
- Payment batches and outstanding payments reviewed
- Petty cash and cash advances reviewed
- Inventory cut-off, relevant valuations, wastage/adjustments, and reconciliation reviewed
- Accruals, prepayments, depreciation, allocations, and payroll postings completed where in scope
- Manual journals reviewed/approved
- Subledger-to-GL reconciliations completed
- Trial balance reviewed
- Finance Exception Center reviewed
- Management/finance sign-off captured
- Period lock performed and audited

Exact checklist items vary by release scope and are configuration-controlled.

## 4. Close workflow

```text
OPEN
→ close checklist prepared
→ exceptions assigned/resolved or formally carried
→ SOFT_CLOSED
→ final adjustment review
→ financial review/sign-off
→ LOCKED
```

Each checklist item has owner, due date, status, evidence, reviewer, completion timestamp, and exception reason.

## 5. Reopen workflow

A period reopen requires:

1. Specific accounting period and affected company scope.
2. Business reason and financial impact.
3. Requested transaction class or exact journal/source scope.
4. Authorized approver(s) under configurable policy.
5. Time-bounded reopen window.
6. Audit record and notification to responsible finance roles.
7. Required post-reopen reconciliation and re-lock confirmation.

```text
LOCKED
→ reopen request
→ approval
→ REOPENED within defined scope
→ authorized posting / reversal
→ reconciliation
→ re-lock
```

Reopen must not become a routine workaround for poor process discipline.

## 6. Restrictions

- A locked period blocks routine posting, cancellation that affects accounting, and journal reversal.
- A close cannot be finalized while critical reconciliation failures are unresolved unless finance leadership records an explicit, audited exception.
- System dates and user-selected dates cannot bypass period controls.
- Backdated documents must be governed by explicit eligibility and approval rules.
- Reporting must distinguish current-period activity from adjustments posted after a close/reopen event.

## 7. Audit evidence

Retain:

- Period state transitions
- Checklist results
- Review and approval records
- Exceptions carried forward
- Reopen requests and approvals
- Journal/source records created during reopen
- Reconciliation evidence
- User, timestamp, and reason for every material action

## 8. UAT minimums

- Posting allowed in OPEN period
- Routine posting blocked in SOFT_CLOSED/LOCKED period
- Authorized close adjustment behavior verified
- Reopen rejected for unauthorized user
- Reopen audit trail and re-lock workflow verified
- Reports and trial balance stable across close status
- Failed close checklist cannot be silently bypassed
