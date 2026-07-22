## Decision ID

`DEC-0061`

## Status

`Under Review`

## Decision question

What data and workflow model must preserve immutable stock-count recount evidence and safely recover linked variance adjustments before Count Variance activation can proceed?

## Why now

`DEC-0060` prohibits Count Variance activation until recount history is immutable. The current `RECOUNT_REQUESTED` flow reopens and overwrites the same session and line records, so the original physical count and review evidence cannot be reconstructed.

## Affected scope

- Phase: Phase I Inventory
- Modules: Stock Counts, Stock Adjustments, Inventory Ledger, Overview dashboard
- Users / roles: counters, count reviewers, stock-adjustment approvers and posters
- Records / data: `StockCountSession`, `StockCountLine`, generated `StockAdjustment` and `StockAdjustmentLine`, inventory movements and audit events
- Operational impact: each affected inventory location must preserve a safe freeze and auditable count-to-adjustment lineage across recounts.

## Verified current state

- `saveStockCountEntries` permits `RECOUNT_REQUESTED` and updates existing `StockCountLine` values in place.
- Review state is held on `StockCountSession`, so a later review overwrites the earlier reviewer context.
- The existing count-to-adjustment bridge links a generated adjustment to a session and its mutable lines, with one generated adjustment per session.
- `DEC-0026` deferred recount versioning; `DEC-0060` makes immutable recount history a prerequisite before variance activation.

## Constraints and hard gates

- Preserve tenant, company, inventory-location scope and server-side authorization.
- Preserve blind-count redaction and reviewer-only variance access under `DEC-0060`.
- Submitted/reviewed evidence and generated-adjustment lineage must be immutable and auditable.
- No duplicate ledger movement, direct balance mutation, or uncontrolled adjustment replacement.
- A posted adjustment requires the established full reversal path before corrective counting; partial recovery is not authorized by this decision.
- Recount creation, current-attempt selection, and adjustment generation must be transactional and idempotent.

## Options

### Option A — child count-attempt/version model

Keep the session as a stable count case; create a new immutable attempt and attempt lines for every recount, with attempt-level review and adjustment links.

### Option B — clone a new count session for every recount

Create a new top-level session for each recount and link the sessions as a chain.

### Option C — retain mutable session/lines and improve audit events

Keep the current records and store more snapshots in audit events.

### Option D — defer Count Variance activation

Do not change the workflow and leave the Count Variance profile inactive.

## Required source documents

- `AGENTS.md` §§ 4–5, 7, 9, and 13
- `docs/core/00-governance/decisions/DEC-0026-STOCK-COUNT-VARIANCE-ADJUSTMENT-BRIDGE.md`
- `docs/core/00-governance/decisions/DEC-0060-BLIND-COUNT-REDACTION-AND-COUNT-VARIANCE-DASHBOARD-ACCESS.md`
- `docs/core/03-data/ERP_DATA_DICTIONARY.md`
- Relevant Phase I inventory and stock-count workflow specifications

## Council and challenge roles

- First-round specialists: Database Engineering; QA / workflow integrity
- Challenge reviewers: unavailable in the current agent-thread pool; Decision Chair will retain the hard gates and require a separate implementation review before activation
- Decision Chair: Codex parent agent

## Decision deadline and owner

- Deadline: before any Count Variance workflow or dashboard activation
- Human owner: OGFI ERP Product Governance

## Output required

Confirmed decision record, migration-safe implementation plan, and acceptance evidence. No implementation or activation is authorized while this brief is under review.
