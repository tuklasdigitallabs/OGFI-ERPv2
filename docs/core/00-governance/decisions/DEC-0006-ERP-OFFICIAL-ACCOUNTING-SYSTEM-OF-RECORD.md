# DEC-0006 — OGFI ERP Is the Official Accounting System of Record

**Status:** Confirmed
**Decision owner:** OGFI Executive / Finance Leadership
**Affected phase:** Phase III — Finance & Workforce, with accounting foundations preserved in earlier phases
**Effective scope:** OGFI ERP, beginning with OGFI as the first tenant

## Decision

OGFI ERP will become the official accounting system of record for OGFI.

The ERP will hold the controlled accounting records used to produce the general ledger, trial balance, accounts payable and receivable subledgers, cash and bank reconciliation, financial statements, branch/brand reporting, period-close evidence, and related audit trail.

Other systems may supply operational data or integrate with the ERP. They must not become an untracked alternative source of final accounting balances.

## Confirmed boundaries

- Accounting follows a double-entry general ledger model.
- PHP is the operating and reporting currency.
- Multi-currency, exchange rates, foreign-currency revaluation, and FX gain/loss are out of scope.
- Posted journal entries are immutable. Corrections use authorized reversals and replacement entries.
- Accounting periods support controlled open, soft-close, locked, and reopened states.
- Financial transactions preserve source-document links, audit history, attachments where required, approval evidence, and scope dimensions.
- Finance does not bypass procurement, receiving, inventory, payment, project, or approval controls.
- A project task, comment, or attachment cannot create, approve, post, reverse, or settle an accounting transaction.
- Final statutory, tax, and audit configuration requires validation by OGFI finance leadership and appropriate professional advisers before live use.

## Why this decision was made

OGFI needs one traceable financial record from operational event through approval, receiving, invoice, payment, journal entry, reconciliation, and financial reporting. Keeping the accounting system outside the operational ERP would preserve duplicate encoding, fragmented evidence, delayed reconciliation, and weak branch/project cost visibility.

## Required architectural consequences

1. Finance must have an immutable journal and journal-line model.
2. All financial posting sources need controlled idempotency and transaction boundaries.
3. Period close, lock, reopen, reversal, manual journal, and reconciliation controls must be designed before live posting.
4. Procurement, inventory, projects, and later POS/payroll integrations must expose governed source events rather than bypass the finance domain.
5. All finance reports must reconcile to the general ledger and applicable subledger.
6. Earlier-phase entities must retain future accounting dimensions and source references where relevant without prematurely hardcoding accounting policy.

## Rejected alternative

**Alternative:** Use the ERP only for operational finance workflow and export final entries to another accounting system.

**Reason rejected:** This would retain two sources of truth, extra reconciliation work, fragmented audit evidence, and delayed branch/project profitability visibility.

## Safeguards

- No direct database updates to posted financial records.
- No hard delete of controlled financial records.
- No unapproved changes to account mapping, period status, or posting rules.
- Separate creation, review, approval, release, posting, and reconciliation duties where applicable.
- Run end-to-end reconciliation and period-close UAT before production finance go-live.
- Maintain an operational fallback plan and tested restore process before live posting.
- Keep tax and statutory-report rules configurable and professionally validated.

## Follow-up documents

- `FINANCE_ACCOUNTING_PRODUCT_SPEC.md`
- Finance data-model extension
- General-ledger, posting/reversal, period-close, AP, and bank/cash workflows
- Finance build plan, UAT plan, reporting specification, and posting-rule template
