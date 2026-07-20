# Phase III — Reporting and Export Specification

**Status:** Planned reporting framework

## Required Report Families

- Budget vs Actual
- Expense Aging and Exceptions
- Petty Cash Reconciliation
- Payment Request Status
- Manpower Plan vs Actual
- Leave and Overtime Approval Aging

## Standard Requirements

Every report must define:

- Target roles and location/project scope
- Default period and permitted filters
- Required columns, totals, groupings and drill-downs
- Export format: CSV, XLSX and/or PDF where justified
- Source record and reconciliation rules
- Treatment of cancelled, reversed, pending and draft records
- Permission controls and confidential-data restrictions

## Build Gate

No dashboard or report may invent a calculation that conflicts with transaction records, approved inventory valuation, approved budget model, recipe version, project budget or payroll/attendance source of truth.

## Implemented Export Coverage

- Central Finance CSV export currently includes Finance Control Center metrics plus scoped PO source-chain, journal, AP invoice, payment request, payment release, bank/cash, reconciliation, budget line, budget commitment, expense request, cash advance, and petty cash fund rows.
- Budget, expense request, cash advance, and petty cash sections are included only when the exporting user has the relevant subworkspace view permission.
- The export is read-only: it does not post journals, release payments, settle AP, reconcile bank/cash, mutate budget source records, change petty-cash custody, or alter cash-advance exposure.
