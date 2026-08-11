# Phase II — Data Extensions

**Status:** Core Phase II data extensions and the default-off `DEC-0279` consumption foundation implemented locally; activation pending

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

## Implemented Default-Off Data Extension — `DEC-0279`

The manual servings and controlled inventory-consumption design is implemented by
the additive `20260811130000_restaurant_consumption_foundation` migration and the
following default-off records. Their presence supplies local implementation evidence,
not branch activation, UAT, or production authorization:

- effective-dated, tenant/company/location-scoped service-period configuration with
  company defaults, audited branch overrides, non-overlap enforcement, and one
  authoritative source mode;
- per-branch activation/readiness, exact inventory issue-location mapping with an
  approved branch default or item-specific override, and no `All Locations` or
  inferred-first-location posting path;
- branch-offered active/approved menu-item eligibility separated from recipe/UOM,
  inventory mapping, issue-location, lot, and stock posting readiness;
- immutable serving declarations, lines, source identity, business date/period,
  revision, correction, and supersession lineage;
- exclusive source/disposition ownership rules for paid, complimentary, staff
  meal, pre-preparation cancel, prepared discard, refund, remake, and count
  variance, while staff meals remain outside menu-serving declarations;
- complimentary reason, authorizer, controlled approval, and evidence lineage;
- configurable sentinel item/category/location count cohorts with reviewed
  recommendation evidence but no hardcoded or automatic enrollment;
- submitter, independent verifier, poster, permissions/scope/MFA evidence, state
  transitions, and append-only audit activity;
- effective published recipe, yield, sub-recipe, UOM conversion/rounding, and
  issue-location snapshots used by posting;
- deterministic FEFO lot/expiry allocations, stock-readiness result, count
  freeze/cutoff, and controlled late-post disposition;
- unique idempotency and source guards binding a declaration revision to its
  dedicated `CONSUMPTION_OUT` movements exactly once; and
- full-document reversal and corrected-replacement linkage without destructive
  mutation of serving facts or inventory history.

No schema may allow partial posting of a declaration, negative stock, direct
balance mutation, overlapping authoritative periods, encoder self-verification, or
the same physical depletion to be owned by Consumption, Wastage, Authorized
Consumption, and Count Variance more than once.

`DEC-0280` supersedes the exact-branch recipe-assignment target for activation.
The confirmed pending additive model requires effective-dated brand-default recipe
adoption, exact-branch `UNAVAILABLE`/`LOCATION_OVERRIDE` exceptions, explicit
Company-shared recipe adoption per brand, controlled successor-rollout lineage,
and immutable resolution evidence on verified serving lines. Resolution is
`UNAVAILABLE > LOCATION_OVERRIDE > BRAND_DEFAULT > blocked`; cross-brand,
unpublished, implicit shared-recipe, latest-version, and arbitrary-first fallback
must fail closed. Pending cost evidence remains separate from quantity readiness,
and publication/mapping actions create no inventory movement. Physical names and
migration/backfill design remain pending reviewed implementation.

## Remaining Data Decisions Before New Build Slices

- Full POS/sales import write workflow, source-system contract, duplicate handling, and rollback policy.
- Trusted POS/manual source precedence, qualification, and controlled replacement
  remain a future decision; the first interface must stay source-neutral.
- Bulk recipe import/apply staging tables or equivalent controlled diff workflow, if approved.
- Recursive sub-recipe cost-flattening snapshot, graph depth, cycle, and recalculation policy, if approved.
- Marketing Operations data model extensions remain planning-only until campaign, promotion, and launch controls are approved.
