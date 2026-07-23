# OGFI ERP — Phase II UI Specification: Food Cost Analysis

**Status:** Implemented for theoretical-vs-actual analysis, filterable source rows, health summaries, and CSV export
**Visual standard:** Modern SaaS UI with restaurant-grade operational control

## Screen Purpose

Provide a role-aware workspace for food-cost analysis while preserving company,
brand, location, business date, recipe/menu-price basis, actual-ledger evidence,
filter context, export audit, and source-record boundaries.

## Implemented Screens or Views

1. Analysis view with business-date, menu/sales search, sales status, actual
   evidence search, and movement-type filters.
2. Summary cards for visible filtered rows and full-date totals so users can
   distinguish current filter context from total operating context.
3. Food-cost health counts for within-target, above-target, missing-cost, and
   awaiting-actuals rows.
4. Sales/import rows tied to recipe costing and effective menu-price basis.
5. Actual-cost evidence rows derived from posted outbound inventory movements.
6. CSV export preserving the same filter contract and audited export activity.

## Global UI Rules

- Use core Design Tokens, Component Library, Mobile Rules and UX State standards.
- Keep primary action labels explicit; avoid ambiguous universal actions.
- Show scope context in the header and preserve it across drill-downs.
- Use status pills with text, not color alone.
- Do not hide critical fields behind unnecessary tabs.
- Include empty, loading, error, permission-denied, rejected, cancelled and archived states.
- Use a single shared spacing token across page layout, cards, forms and table controls.

## Implemented Details

- Business date uses strict `YYYY-MM-DD` parsing.
- Theoretical cost is derived from posted sales/import data and recipe costing.
- Actual cost uses posted outbound inventory movement evidence only.
- Missing recipe, price, supplier price, UOM conversion, or actual-ledger
  evidence is displayed as pending evidence rather than guessed.
- CSV export includes source/evidence fields and preserves filters.
- The analysis view does not create sales imports, allocate actual cost by
  assumption, approve prices, post inventory, or create finance records.
- The Operations Dashboard deliberately withholds Food Cost cards, KPIs,
  exception rows, and source-health claims while the `DEC-0062` business-date,
  missing-valuation, and status definitions remain open. Authorized users reach
  this source workspace through neutral navigation instead of a dashboard
  readiness claim.
- Restaurant Operations scans do not create new Food Cost exception reminders
  while those definitions remain open. Existing reminders remain historical
  records and are not automatically deleted, rewritten, read, or archived.

## Acceptance Criteria

The current controlled slice is complete when a permitted user can open food-cost
analysis for a business date, understand theoretical cost, actual ledger
evidence, missing evidence, food-cost health, filter context, and export results
without the analysis screen mutating recipes, POS/sales imports, inventory,
finance, or approvals.

Future UI expansion for POS write/import workflow, production/consumption
source records, menu-level actual allocation, recursive sub-recipe flattening,
or additional approval surfaces requires a new approved backlog item.
