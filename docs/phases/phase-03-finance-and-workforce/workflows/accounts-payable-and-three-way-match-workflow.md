# OGFI ERP — Finance Workflow: Accounts Payable and Three-Way Match

**Status:** Detailed planning specification
**Purpose:** Control supplier obligations from invoice capture through matching, approval, payment, settlement, and AP reporting.

## 1. Outcome

Pay suppliers only for valid, supported obligations while preserving the source chain from procurement and receiving through invoice, payment, ledger, and bank reconciliation.

## 2. Scope

- Supplier invoice capture
- PO / receiving / invoice matching
- Match exceptions
- Invoice holds and disputes
- Credit notes and debit notes
- Payment request and approval
- Payment preparation/release
- AP settlement and aging
- Supplier statement reconciliation
- Source-to-journal traceability

## 3. Standard flow

```text
Approved PO
→ Goods Receipt / service acceptance
→ Supplier Invoice
→ Three-Way Match
→ Exception resolution or approval
→ AP liability posting
→ Payment Request
→ Payment approval
→ Payment release
→ AP settlement / cash-bank posting
→ Bank reconciliation
```

For authorized non-PO invoices, the system must require a defined exception path, supporting evidence, configured approval, and audit trail.

## 4. Invoice fields

```text
supplier_id
supplier_invoice_number
invoice_date
received_date
due_date
payment_terms
company_id
brand/location/department/cost_center/project dimensions as relevant
PO reference(s) nullable only by approved exception
goods receipt / service acceptance reference(s)
line descriptions, quantities, prices, taxes, total
attachment(s)
status
hold/dispute reason
duplicate-detection result
```

## 5. Three-way match

Compare:

```text
Purchase Order
↔ Goods Receipt / Service Acceptance
↔ Supplier Invoice
```

Review separately:

- Quantity
- Price
- Tax
- Freight/charges
- Item/service identity
- Supplier
- Scope/dimensions
- Duplicate invoice number
- Previously paid/credited amount
- Tolerance rule

Tolerance is configurable by company, supplier class, category, transaction type, and amount. A tolerance is not permission to hide a mismatch.

## 6. Match outcomes

```text
MATCHED
MATCHED_WITHIN_TOLERANCE
EXCEPTION_REQUIRES_REVIEW
ON_HOLD
DISPUTED
APPROVED_EXCEPTION
REJECTED
CANCELLED
```

A payment cannot proceed from an exception state unless authorized exception approval explicitly permits it.

## 7. Payment control

Separate the following where policy requires:

```text
Invoice entry
≠ match review
≠ payment request preparation
≠ payment approval
≠ payment release
≠ bank reconciliation approval
```

Payment lifecycle:

```text
Draft → Submitted → Approved / Returned / Rejected
→ Scheduled → Released → Settled / Failed / Reversed / Cancelled
```

Payment release must create controlled accounting consequences and must not be treated as complete until bank/cash settlement rules are satisfied.

## 8. Duplicate and fraud controls

Flag or block:

- Same supplier + invoice number
- Same supplier + amount + date proximity
- Same supporting document attached to multiple invoices
- Supplier bank-detail change before payment
- Invoice without required PO/receipt evidence
- Split invoices near approval threshold
- Unusual manual override of match exception
- Repeated emergency/non-PO invoices
- Payment amount exceeding approved invoice balance
- Duplicate payment attempt

## 9. Credit notes, returns, and disputes

- Credit notes link to the original supplier invoice and, where relevant, receiving discrepancy/return.
- Disputed invoice amount remains on hold or a separately controlled liability state according to policy.
- A credit note or recovery must not silently reduce the original invoice without a traceable accounting entry.
- Supplier statement reconciliation identifies missing invoices, credits, payments, and disputed balances.

## 10. Reports

- AP aging
- Supplier ledger
- Invoice register
- Match exception queue
- Payment schedule
- Payment release register
- Credit-note register
- Supplier statement reconciliation
- Invoice-to-PO-to-receipt trace report
- Duplicate invoice/payment risk report
