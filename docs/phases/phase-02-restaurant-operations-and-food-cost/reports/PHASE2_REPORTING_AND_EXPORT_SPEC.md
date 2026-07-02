# Phase II — Reporting and Export Specification

**Status:** Planned reporting framework

## Required Report Families

- Food Cost by Branch and Menu Item
- Theoretical vs Actual Variance
- Recipe Cost Change Impact
- Open Incidents and Corrective Actions
- Maintenance SLA and Downtime
- Food Safety Compliance Exception Report

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
