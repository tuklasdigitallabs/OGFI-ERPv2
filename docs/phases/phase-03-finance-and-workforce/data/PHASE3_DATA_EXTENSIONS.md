# Phase III — Data Extensions

**Status:** Planned data-model framework

## Purpose

This document defines how Phase III extends the core ERP data model without duplicating or weakening tenant, company, brand, location/project, user, approval, audit or attachment controls.

## Expected New Entity Groups

- `budgets`
- `budget_lines`
- `expense_requests`
- `petty_cash_funds`
- `cash_advances`
- `liquidations`
- `payment_requests`
- `employees`
- `employee_assignments`
- `schedules`
- `attendance_imports`

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
