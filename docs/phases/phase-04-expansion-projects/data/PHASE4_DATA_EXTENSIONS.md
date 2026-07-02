# Phase IV — Data Extensions

**Status:** Planned data-model framework

## Purpose

This document defines how Phase IV extends the core ERP data model without duplicating or weakening tenant, company, brand, location/project, user, approval, audit or attachment controls.

## Expected New Entity Groups

- `projects`
- `project_sites`
- `feasibility_models`
- `project_budgets`
- `project_budget_lines`
- `project_milestones`
- `project_documents`
- `permits`
- `opening_readiness_tasks`
- `post_opening_reviews`

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
