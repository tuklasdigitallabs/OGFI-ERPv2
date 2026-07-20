# Phase III — Data Extensions

**Status:** Partially implemented. Finance configuration, journals, AP/payment foundations, bank/cash readiness, period-close readiness, budget/commitment visibility, expense request foundation, cash advance/liquidation foundation, petty cash foundation, workforce registry/readiness foundations, scheduling/manpower coverage foundation, and attendance-import evidence foundation are implemented. Production workflow actions, approval-instance integration, reporting hardening, and UAT remain pending.

## Purpose

This document defines how Phase III extends the core ERP data model without duplicating or weakening tenant, company, brand, location/project, user, approval, audit or attachment controls.

## Expected New Entity Groups

- `budgets`
- `budget_lines`
- `budget_revisions`
- `budget_commitments`
- `expense_requests`
- `expense_request_lines`
- `expense_request_source_links`
- `petty_cash_funds`
- `petty_cash_requests`
- `petty_cash_ledger_entries`
- `petty_cash_liquidations`
- `petty_cash_liquidation_lines`
- `cash_advance_requests`
- `cash_advance_movements`
- `cash_advance_liquidations`
- `cash_advance_liquidation_lines`
- `finance_close_runs`
- `finance_close_checklist_items`
- `finance_close_exceptions`
- `finance_close_attempts`
- `payment_requests`
- `employees`
- `employee_assignments`
- `workforce_schedules`
- `workforce_schedule_lines`
- `attendance_import_batches`
- `attendance_import_lines`

## Mandatory Data Rules

- Reuse core identifiers and scope fields where applicable.
- Use effective dating for changing policies, assignments, prices, schedules, recipes or permissions.
- Record creator, updater, status, timestamps and audit events.
- Use explicit status machines; do not depend on free-text status values.
- Preserve historical values when a revision changes a financial, recipe, legal, project or workforce record.
- Add a migration plan before introducing required data fields to production.

## To Finalize Before Build

- Field-level dictionary additions
- Entity relationships and cardinality
- Required indexes and performance expectations
- Retention and confidential-data classifications
- Migration, seed and reporting impact
