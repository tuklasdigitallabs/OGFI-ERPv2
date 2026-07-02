# Phase II — Data Extensions

**Status:** Planned data-model framework

## Purpose

This document defines how Phase II extends the core ERP data model without duplicating or weakening tenant, company, brand, location/project, user, approval, audit or attachment controls.

## Expected New Entity Groups

- `recipe_versions`
- `recipe_lines`
- `sub_recipes`
- `menu_items`
- `menu_prices`
- `operational_checklists`
- `incidents`
- `maintenance_tickets`
- `food_safety_logs`

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
