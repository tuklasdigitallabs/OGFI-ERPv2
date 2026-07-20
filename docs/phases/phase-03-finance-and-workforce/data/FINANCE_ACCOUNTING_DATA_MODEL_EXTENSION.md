# OGFI ERP — Finance & Accounting Data Model Extension

**Status:** Logical design specification
**Purpose:** Define the finance entities and invariants required for OGFI ERP to become an official accounting system of record.

This document is not authorization to create database tables or migrations. The active codebase and existing data model must be inspected before any physical schema design.

## 1. Reuse existing core entities

Finance must reuse—not duplicate—core concepts where present:

```text
tenant
company
brand
location
department
cost center
project
user
role/scope assignment
approval
attachment
controlled evidence attachment link
audit event
supplier
purchase request
purchase order
goods receipt
inventory movement
payment / cash advance / petty cash records
```

## 2. Logical entity groups

### 2.1 Accounting structure

| Entity                        | Purpose                                       | Key fields                                                                                            |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `fiscal_years`                | Defines fiscal calendar per company.          | company_id, code, start_date, end_date, status                                                        |
| `accounting_periods`          | Controlled monthly/period posting window.     | fiscal_year_id, period_number, start_date, end_date, status, soft_closed_at, locked_at                |
| `account_classes`             | Balance-sheet/P&L grouping.                   | code, name, normal_balance, statement_section                                                         |
| `chart_of_accounts`           | Posting accounts and hierarchy.               | company_id, code, name, account_class_id, parent_account_id nullable, posting_allowed, active_from/to |
| `accounting_dimension_rules`  | Required dimensions per account/posting rule. | account_id/rule_id, required_dimension, effective dates                                               |
| `financial_statement_layouts` | Configurable statement presentation.          | company_id, statement_type, line mapping/version                                                      |

### 2.2 General ledger

| Entity                    | Purpose                                                                   | Key fields                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ledger_journals`         | Immutable journal header once posted.                                     | public_reference, company_id, journal_type, source_document_type/id, source_event_key, accounting_period_id, status, dates, reversal links |
| `ledger_journal_lines`    | Debit/credit entries.                                                     | journal_id, line_number, account_id, debit_amount_php, credit_amount_php, dimensions, source_line reference                                |
| `posting_rules`           | Effective-dated automatic posting configuration.                          | code, version, source_type/event, eligibility, mapping configuration, status, effective dates                                              |
| `posting_attempts`        | Controlled operational record of posting request/result.                  | source_event_key, status, failure_code, journal_id nullable, retry_count, correlation_id                                                   |
| `manual_journal_requests` | Authorization layer for manual journals if separated from journal header. | journal_id/draft reference, reason, approvals, evidence state                                                                              |
| `journal_reversals`       | Explicit correction chain if not modeled only by header links.            | original_journal_id, reversal_journal_id, reason, approved_by                                                                              |

### 2.3 Payables and payments

| Entity                                                                        | Purpose                                                                                                                                                                     | Key fields                                                                                                              |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `supplier_invoices`                                                           | Supplier liability document.                                                                                                                                                | supplier_id, supplier_invoice_number, invoice_date, due_date, amounts, status, duplicate_risk, dimensions               |
| `supplier_invoice_lines`                                                      | Invoice detail and source matching.                                                                                                                                         | supplier_invoice_id, PO/receipt references, item/service, qty, price, tax, amounts                                      |
| `invoice_match_results`                                                       | Match outcome per invoice/line.                                                                                                                                             | invoice_id/line_id, PO/receipt refs, outcome, tolerance, variance, reviewer                                             |
| `invoice_disputes`                                                            | Hold/dispute case.                                                                                                                                                          | invoice_id, reason, amount, owner, status, resolution                                                                   |
| `supplier_credit_notes`                                                       | Supplier credits/refunds. Current foundation supports draft capture, pending application-review submission, cancellation, and reporting only; it does not apply settlement. | supplier_id, original_invoice_id, reference, supplier_credit_note_number, credit_date, amount, reason, evidence, status |
| `expense_requests` / `expense_request_lines` / `expense_request_source_links` | Operational expense request source records.                                                                                                                                 | company/location scope, requester, budget status, evidence, line amounts, non-mutating source lineage                   |
| `payment_requests`                                                            | Approval request for payable release.                                                                                                                                       | supplier_invoice_id/payee, amount, due date, method, status, approval route                                             |
| `payment_batches`                                                             | Controlled payment grouping.                                                                                                                                                | company_id, bank_account_id, scheduled_date, status, prepared/released by                                               |
| `payments`                                                                    | Payment execution/settlement record.                                                                                                                                        | batch_id nullable, payee, amount, method, reference, status, released/settled dates                                     |
| `payment_allocations`                                                         | Settlement against invoice/credit.                                                                                                                                          | payment_id, invoice_id/credit_id, amount                                                                                |

### 2.4 Cash and bank

| Entity                                                                                                                                | Purpose                                                                                                                                                                                                                                  | Key fields                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bank_accounts`                                                                                                                       | Authorized company bank account.                                                                                                                                                                                                         | company_id, ledger_account_id, bank name, masked account identifier, active_from/to                                                                                        |
| `bank_statements`                                                                                                                     | Statement header.                                                                                                                                                                                                                        | bank_account_id, statement_date range, source/import reference, status                                                                                                     |
| `bank_statement_lines`                                                                                                                | Imported/recorded bank events.                                                                                                                                                                                                           | statement_id, transaction_date, value_date, amount, description, bank_reference, status                                                                                    |
| `bank_reconciliations`                                                                                                                | Reconciliation header/close.                                                                                                                                                                                                             | bank_account_id, accounting_period_id, status, prepared/reviewed/closed metadata                                                                                           |
| `bank_reconciliation_matches`                                                                                                         | Links bank line to payment/deposit/journal.                                                                                                                                                                                              | reconciliation_id, statement_line_id, source type/id, matched_amount, status                                                                                               |
| `branch_deposits`                                                                                                                     | Cash-to-bank evidence.                                                                                                                                                                                                                   | company/location, deposit date, amount, deposit slip attachment, status                                                                                                    |
| `cash_over_short_cases`                                                                                                               | Variance investigation.                                                                                                                                                                                                                  | location, business date, amount, reason, owner, status                                                                                                                     |
| `petty_cash_funds` / `petty_cash_requests` / `petty_cash_ledger_entries` / `petty_cash_liquidations` / `petty_cash_liquidation_lines` | Control branch petty-cash custody, replenishment/disbursement requests, liquidation evidence, and movement markers.                                                                                                                      | company/location scope, custodian, PHP-only balances, request lifecycle, liquidation cycle, receipt lines, immutable source event keys                                     |
| `cash_advance_requests` / `cash_advance_movements` / `cash_advance_liquidations` / `cash_advance_liquidation_lines`                   | Control cash advance requests, offline release markers, liquidation evidence, and outstanding balances.                                                                                                                                  | company/location scope, requester/beneficiary, PHP-only amounts, status, due date, evidence reference, liquidation lines, immutable movement references                    |
| `finance_payees` / `non_supplier_disbursement_requests`                                                                               | Draft handoff surface for non-supplier cash advances and approved petty-cash requests without reusing supplier AP payment requests.                                                                                                      | company/location scope, payee type/user link, source type, nullable cash-advance or petty-cash source id, source event key, draft amount, evidence, audit actors           |
| `finance_close_runs` / `finance_close_checklist_items` / `finance_close_exceptions` / `finance_close_attempts`                        | Track accounting-period close readiness, soft-close completion, and approved sensitive lock/reopen actions without mutating AP, payment releases, bank-reconciliation source records, or journals.                                       | company/accounting-period scope, checklist status, evidence reference, blocker severity/state, idempotent attempt key, pending sensitive approval snapshot                 |
| `controlled_evidence_attachments`                                                                                                     | Generic source-record link from attachment metadata to controlled Phase 3 records. Current implementation supports private local binary upload/download, checksum capture/verification, permissioned retrieval, source-link archive, and audit events without source-record mutation. Production scanning or scan-waiver signoff, retention/recovery proof, storage-provider signoff, and UAT remain release gates. | tenant/company, source type, source record id, optional source line id, source key, attachment id, purpose, caption, required action, status, creator/archive audit fields |

### 2.5 Budget, assets, projects, AR, and allocations

| Entity                                          | Purpose                                                                                                            | Key fields                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `budgets` / `budget_lines`                      | Extend existing finance framework.                                                                                 | dimensions, account/category, period, original/revised/reserved values; actuals remain derived from posted financial records                         |
| `budget_revisions` / `budget_commitments`       | Track approved changes and approved obligations.                                                                   | source document/event, budget line, amount, status, snapshots, actor metadata                                                                        |
| PR/PO/AP source-line budget allocations         | Carries stable budget allocation dimensions on controlled source documents before source hooks create commitments. | nullable `budget_line_id` on PR lines, PO lines, and AP invoice lines; allocation may be direct or inherited; hard-block rollout remains pending UAT |
| `fixed_assets`                                  | Asset register.                                                                                                    | asset class, acquisition, cost, location, custodian, useful life, status                                                                             |
| `asset_depreciation_runs`                       | Controlled periodic depreciation.                                                                                  | asset_id, period, amount, journal_id, status                                                                                                         |
| `project_financial_controls`                    | Project budget/commitment/actual link.                                                                             | project_id, cost category, budget/actual/commitment values                                                                                           |
| `customers`, `customer_invoices`, `collections` | AR only when scope approved.                                                                                       | customer, terms, invoices, allocations, aging                                                                                                        |
| `allocation_rules` / `allocation_runs`          | HO/warehouse/commissary/shared-cost allocation.                                                                    | basis, recipients, effective dates, journal links                                                                                                    |
| `landed_cost_documents` / `allocations`         | PHP-only landed cost allocation.                                                                                   | source charges, allocation basis, item/asset target, journal refs                                                                                    |

## 3. Required shared fields

For controlled finance entities, include as applicable:

```text
id
public_reference
tenant_id
company_id
brand_id nullable
location_id nullable
department_id nullable
cost_center_id nullable
project_id nullable
status
version
created_by_user_id
created_at
updated_by_user_id nullable
updated_at nullable
currency_code = PHP where stored
attachment/evidence references
controlled evidence attachment source links where binary metadata exists
approval references
audit correlation id
```

## 4. Financial dimension rules

- Company is required on all journal headers and finance transaction headers.
- Brand, location, department, cost center, and project are required according to account/posting-rule configuration—not merely optional UI fields.
- A dimension must belong to the same tenant/company as the journal.
- Dimensions on a journal line preserve source attribution required for branch, brand, project, and departmental reporting.
- Financial reporting must use governed dimensions, not parsed descriptions or free-text labels.

## 5. Data invariants

1. One posted journal must balance debit = credit in PHP.
2. A posted journal cannot be updated or deleted.
3. A source event cannot create more than one active financial consequence of the same type.
4. A journal line cannot use an inactive/non-posting account.
5. Journal scope/dimensions cannot cross tenant/company boundaries.
6. Financial records are cancelled, reversed, closed, or archived—not hard-deleted.
7. Period status controls posting eligibility.
8. Payment allocations cannot exceed payment/invoice/credit available balances.
9. Reconciliation matches cannot exceed bank statement line amount unless policy supports an explicit split/aggregate match.
10. Opening balances must be separately identified, approved, reconciled, and locked after cutover.
11. Money uses integer minor units or fixed precision; never binary floating point.
12. `currency_code` remains `PHP`; no FX calculation/feature is introduced.

## 6. Indexing and constraints to evaluate in physical design

Potential uniqueness constraints (verify against active repository conventions):

- `(company_id, fiscal_year_code)`
- `(fiscal_year_id, period_number)`
- `(company_id, account_code)`
- `(company_id, journal_public_reference)`
- `(company_id, source_document_type, source_document_id, source_event_key, posting_consequence_type)`
- `(supplier_id, supplier_invoice_number)` with controlled duplicate/credit exceptions
- `(bank_account_id, bank_reference, transaction_date, amount)` where safe for duplicate detection
- `(company_id, payment_reference)` where reference exists

Potential indexes:

- journal period/date/account/dimension filters
- supplier invoice due-date/status
- payment status/scheduled date
- bank reconciliation status
- exception owner/status/age
- project/cost-center/branch reporting dimensions

## 7. Migration and cutover constraints

Before any physical schema or production migration:

1. Inventory existing finance-related tables and fields.
2. Map current records to proposed canonical entities; do not duplicate the same business record in parallel tables without a deliberate transition plan.
3. Decide opening-balance date and historical transaction approach.
4. Reconcile opening balances by account and subledger.
5. Create a staged migration rehearsal with counts, totals, exceptions, rollback plan, and approval.
6. Do not alter existing production finance/operational records in place without verified backup and rollback.
7. Preserve original external/source references for audit.
8. Add data-dictionary updates for every new business field.
