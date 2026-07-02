# Phase V — Reporting and Export Specification

**Status:** Planned reporting framework

## Required Report Families

- Integration Health and Error Queue
- POS Reconciliation Exceptions
- Tenant Activity and Usage
- Subscription and Entitlement Status
- Client Onboarding Readiness

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
