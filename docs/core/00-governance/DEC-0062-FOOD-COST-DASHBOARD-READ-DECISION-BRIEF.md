## Decision ID

`DEC-0062`

## Status

`Open`

## Decision question

How should Overview obtain a bounded, server-authorized Food Cost summary without changing the established sales-import, recipe-cost, actual-consumption, or trust-gate semantics?

## Why now

The existing Food Cost dashboard read loads all sales-import lines, recipe-cost summaries, import batches, and relevant inventory movements before deriving management metrics and exceptions. Overview must not use that unbounded analytical workspace read, but a partial replacement could misstate cost, variance, or data trust.

## Affected scope

- Phase: Overview / reporting-read hardening; Restaurant Operations food-cost analytics remains its source workspace
- Modules: Overview, Recipes & Costing, Restaurant Sales Imports, Inventory Ledger
- Users / roles: authorized recipe/costing users and authorized dashboard viewers
- Records / data: posted sales imports and lines, recipe cost summaries, inventory movements, inventory location, dashboard trust context

## Verified current state

- `getFoodCostAnalysisDashboard` derives net sales, theoretical cost, target status, actual consumption, variance, row exceptions, and source status from full scoped analytical reads.
- Overview consumes its totals, row statuses, actual-cost state, import-batch count, and exception rows.
- Branch Operations, Food Safety, Incidents, and Maintenance now have separate bounded dashboard reads without changing their source workspace reads.

## Constraints and hard gates

- Preserve tenant, company, brand, and selected-location scope at the service boundary.
- Do not represent unavailable or incomplete sales/ledger evidence as zero, final, or trusted data.
- Preserve inventory-ledger immutability; this is a read-only projection.
- Preserve recipe/cost authorization and direct source-workspace reauthorization.
- Any aggregate must reproduce the current approved reporting definition or leave the source unavailable with a safe explanation.

## Options

### Option A

Build a dedicated server-owned Food Cost dashboard projection with a bounded exception candidate set and parity tests against the analytical workspace.

### Option B

Reuse the analytical workspace read and cap rows after materializing it.

### Option C

Remove Food Cost from Overview until a later reporting milestone.

## Required source documents

- `AGENTS.md` §§ 4–7 and 13
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- `docs/core/00-governance/DECISION_SCORECARD.md`
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md`
- Relevant Restaurant Operations, inventory-ledger, reporting, and dashboard specifications

## Council and challenge roles

- First-round specialists: Reporting/BI, architecture/data integrity, QA/workflow
- Challenge reviewer: security/authorization as required
- Decision Chair: Codex parent agent

## Decision deadline and owner

- Deadline: before replacing the Overview Food Cost source read
- Human owner: OGFI ERP Product Governance

## Output required

Confirmed decision record and implementation plan. No replacement projection is authorized while this decision is under review.

## Review outcome and blockers

The independent reporting review recommends a dedicated bounded projection only after the authoritative Food Cost definitions below are reconciled. Reusing or capping the existing analytical read is rejected because it remains unbounded; removing the source from Overview is the safe fallback while the definitions are open.

1. The no-date `Latest Posted` path currently combines all posted sales dates with ledger evidence for only the latest date. Confirm and implement one date-selection rule that applies consistently to sales, posted batches, and ledger evidence.
2. A ledger movement without total or unit cost can contribute zero rather than an explicitly incomplete valuation. Confirm and implement a pending/unavailable valuation result; no trusted zero may be inferred.
3. `AWAITING_ACTUALS` currently represents a missing target in some rows rather than actual-ledger availability. Reconcile the status name and definition with the reporting specification before using it as a dashboard health count.

Until all three controls are confirmed and covered by source-level parity tests, the existing analytical source remains authoritative and Overview must not claim a bounded Food Cost result is equivalent.
