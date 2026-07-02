# OGFI ERP — Finance Workflow: General Ledger

**Status:** Detailed planning specification
**Purpose:** Govern the lifecycle of journals and journal lines that form OGFI ERP’s official accounting record.

## 1. Outcome

The General Ledger records balanced, traceable, immutable accounting entries in PHP. It supports automatic postings from governed source documents and controlled manual journals.

## 2. Roles

- System posting service
- Accountant / journal preparer
- Finance reviewer / controller
- Authorized approver
- Finance administrator
- Auditor (read-only)

## 3. Journal lifecycle

### Automatic posting lifecycle

```text
Eligible source event
→ Posting requested
→ Validation
→ Journal draft generated in transaction
→ Balance / period / authorization checks
→ Posted
→ Audit event and source link committed
```

### Manual journal lifecycle

```text
Draft
→ Submitted for Review
→ Returned / Rejected
→ Approved
→ Posted
→ Reversed (if correction is required)
```

A posted journal is never edited. A correction uses an approved reversal plus a new/replacement journal where needed.

## 4. Required checks before posting

1. Source event is valid, approved where required, and not cancelled.
2. Idempotency/source-event key has not already produced a posted journal.
3. Posting period is eligible.
4. Account codes are active and allow posting.
5. Required financial dimensions are present.
6. Debit and credit totals balance exactly in PHP.
7. Attachments/evidence are present where configured.
8. Actor/service has permission to post this class of transaction.
9. Related source status is compatible with posting.
10. The full operation can complete atomically.

## 5. Required journal fields

### Journal header

```text
id
public_reference
tenant_id
company_id
journal_type
source_document_type
source_document_id
source_event_key
posting_rule_id / version
accounting_period_id
journal_date
posting_date
status
description
reversal_of_journal_id nullable
replaced_by_journal_id nullable
created_by / created_at
posted_by / posted_at
approved_by / approved_at when required
audit correlation id
```

### Journal line

```text
id
journal_id
line_number
account_id
debit_amount_php
credit_amount_php
description
brand_id nullable
location_id nullable
department_id nullable
cost_center_id nullable
project_id nullable
supplier_id nullable
customer_id nullable
tax_code_id nullable
source_line_type / source_line_id nullable
```

## 6. Invariants

- At least two journal lines.
- Sum of debit amounts equals sum of credit amounts.
- Amount fields use fixed precision or integer centavos; never floating point.
- Exactly one side of a normal journal line is non-zero unless an approved exceptional template says otherwise.
- All line scope belongs to the journal company/tenant.
- A posted journal cannot be altered, deleted, or re-numbered.
- A source-event key can yield at most one active posted journal for one accounting consequence.
- Reversal journal lines mirror the original amounts/accounts/dimensions unless an approved correction process explicitly differs.

## 7. Exceptions

### Unbalanced journal

- Block posting.
- Retain draft/error state only.
- Record an audit/error event.
- Do not update the source record to posted.

### Closed or locked period

- Block routine posting.
- Route to authorized adjustment or reopen process.
- Preserve the failed attempt/audit evidence without exposing sensitive internals to non-finance users.

### Duplicate source posting

- Return the existing journal reference if the same source consequence was already posted.
- Do not create a second journal.
- Flag conflicting duplicate source data to the Finance Exception Center.

### Account mapping missing

- Do not post a suspense entry silently.
- Create a controlled posting exception with source reference, missing mapping, owner, and required resolution.

## 8. Reversal

A reversal must:

1. Identify the original posted journal.
2. Check the current period/reopen authority.
3. Create a new posted journal with mirrored debit/credit lines.
4. Link the original and reversal journals.
5. Record the reason, actor, approver where required, and evidence.
6. Trigger a replacement/correction workflow if the business event remains valid but was misclassified.

## 9. Audit and reporting

Each journal must display:

- Source document chain
- Journal header and lines
- Posting rule/version
- Approvals
- Reversal/replacement links
- Attachments and comments
- Audit activity
- Related reconciliation/close status where relevant

General Ledger detail, Trial Balance, and financial statements must derive from posted journals and approved adjustments only.
