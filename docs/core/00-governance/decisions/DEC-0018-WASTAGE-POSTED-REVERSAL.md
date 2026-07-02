# Decision Record — Wastage Posted Reversal

## Metadata

- Decision ID: `DEC-0018`
- Title: Wastage Posted Reversal
- Status: `Confirmed`
- Date: 2026-06-29
- Decision owner: Operations + Warehouse + Finance + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Wastage and Inventory Controls

## Decision

Implement full-document reversal for posted Wastage Reports.

An authorized user may reverse a `POSTED` Wastage Report with a required reason. Reversal creates one positive `REVERSAL` inventory movement for each original `WASTAGE_OUT` movement, links each reversal movement to its original movement through `reversalOfMovementId`, marks the report `REVERSED`, records reversed-by and reversed-at metadata, and writes audit history.

`REVERSED` is terminal. Posted and reversed reports are not edited, cancelled, reposted, or deleted. If the original wastage was partially wrong, users must reverse the posted report and create a corrected replacement Wastage Report.

## Options considered

### Option A — selected

- Summary: Full-document `Reverse Posted Wastage` action.
- Benefits: Preserves immutable ledger history, keeps wastage separate from stock adjustments, and provides a controlled correction path for posted wastage.
- Failure modes: Reversal could be misused to hide real wastage if role, reason, and reporting controls are weak.
- Why selected: It matches the documented reversal workflow and closes the correction gap introduced by posting.

### Option B — rejected

- Summary: Correct posted wastage using a separate stock adjustment with an audit link.
- Why rejected: It weakens source-document traceability and blurs wastage correction with generic inventory correction.

### Option C — rejected

- Summary: Edit or cancel a posted Wastage Report.
- Why rejected: Posted inventory records are immutable and must be corrected by reversal, not mutation.

### Option D — rejected

- Summary: Defer reversal.
- Why rejected: Posted wastage needs a safe correction path before pilot or production use.

## Hard-gate assessment

- Reversal requires `inventory.wastage.reverse`.
- Reversal is tenant/company/current-location scoped server-side.
- Only `POSTED` reports can reverse.
- Every line must have an original posted `WASTAGE_OUT` movement.
- Each reversal movement references the original movement through `reversalOfMovementId`.
- A partial unique index prevents more than one `REVERSAL` movement per original movement.
- Reversal runs in one transaction with report status update and audit.
- No direct balance writes are used.
- Migration creates no reversal movements and does not change existing posted records.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Decide reversal approval thresholds and high-value escalation | Operations + Finance + IT | Before advanced reversal governance | Open |
| Decide backdated/closed-period reversal policy | Finance + IT | Before period-close controls | Open |
| Add replacement-report linking if corrected reposting becomes common | Operations + IT | After pilot feedback | Open |

## Evidence

- `docs/phases/phase-01-procurement-inventory/workflows/wastage-stock-adjustment-workflow.md`
- `docs/core/00-governance/decisions/DEC-0017-WASTAGE-SEPARATE-POSTING-ACTION.md`
- Round 1 deliberation by Dalisay, Hiraya, Ligaya, and Lualhati.
