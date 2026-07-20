# Phase II — Data Extensions

**Status:** Core Phase II data extensions implemented for the current approved slice

## Purpose

This document defines how Phase II extends the core ERP data model without duplicating or weakening tenant, company, brand, location/project, user, approval, audit or attachment controls.

## Implemented Entity Groups

- `recipe_versions`
- `recipe_lines`
- `menu_items`
- `menu_prices`
- `menu_price_decisions`
- `recipe_version_transitions`
- `restaurant_sales_import_batches`
- `restaurant_sales_import_lines`
- `branch_operational_checklists`
- `branch_operational_checklist_lines`
- `food_safety_logs`
- `food_safety_readings`
- `operational_incidents`
- `maintenance_tickets`
- `operational_correction_records`
- `operational_status_transitions`

## Mandatory Data Rules

- Reuse core identifiers and scope fields where applicable.
- Use effective dating for changing policies, assignments, prices, schedules, recipes or permissions.
- Record creator, updater, status, timestamps and audit events.
- Use explicit status machines; do not depend on free-text status values.
- Preserve historical values when a revision changes a financial, recipe, legal, project or workforce record.
- Add a migration plan before introducing required data fields to production.

## Remaining Data Decisions Before New Build Slices

- Full POS/sales import write workflow, source-system contract, duplicate handling, and rollback policy.
- Bulk recipe import/apply staging tables or equivalent controlled diff workflow, if approved.
- Recursive sub-recipe cost-flattening snapshot, graph depth, cycle, and recalculation policy, if approved.
- Marketing Operations data model extensions remain planning-only until campaign, promotion, and launch controls are approved.
