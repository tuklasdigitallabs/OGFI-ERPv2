# Decision Record — Physical Count Foundation Before Variance Posting

## Metadata

- Decision ID: `DEC-0013`
- Title: Physical Count Foundation Before Variance Posting
- Status: `Confirmed`
- Date: 2026-06-29
- Decision owner: Operations + Warehouse + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Physical Inventory Counts

## Decision

Implement the Physical Count foundation before enabling count-variance stock posting.

This slice supports scheduling scoped count sessions, starting counts with immutable system quantity snapshots, blind count entry, submission for review, reviewer notes/recount request, cancellation with reason, variance visibility, and audit history.

It must not create `COUNT_VARIANCE_IN`, `COUNT_VARIANCE_OUT`, `ADJUSTMENT_IN`, or `ADJUSTMENT_OUT` movements, and it must not update inventory balances.

## Context

Physical counts are required in Phase I, but variance posting changes inventory and requires unresolved policy for materiality thresholds, approval routes, recount requirements, reversal, backdating, and segregation of duties. The count foundation still provides operational value by capturing controlled evidence and preserving cutoff snapshots for later approved variance posting.

## Options considered

### Option A — selected

- Summary: Build count schedule/start/entry/submit/review foundation without stock posting.
- Benefits: Advances Phase I count controls while preserving ledger immutability and avoiding invented variance policy.
- Failure modes: Users may assume reviewed variance corrected stock unless the UI is explicit.
- Why selected: It creates durable count evidence and variance visibility without irreversible stock effects.

### Option B — rejected for this slice

- Summary: Full count lifecycle including variance approval/posting.
- Why rejected: Requires materiality, approval, recount, reversal, backdating, and adjustment policy decisions.

### Option C — deferred

- Summary: Wastage foundation.
- Why deferred: Useful Phase I work, but wastage posting also depends on evidence and approval policy.

### Option D — deferred

- Summary: Manual stock adjustment foundation.
- Why deferred: Highest fraud and inventory-integrity risk if built before count evidence and approval policy.

## Hard-gate assessment

- No inventory movements are created by count schedule, start, save, submit, review, recount request, or cancellation.
- No inventory balances are updated by count actions.
- Count access is tenant/company/current-location scoped server-side.
- Blind count entry does not expose system snapshot quantities to ordinary counters.
- Count snapshots are captured at start and remain stable for variance review.
- Submitted count lines are locked from ordinary count entry.
- Important actions write audit events and preserve cancellation/review reasons.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement count foundation schema/services/UI/docs/tests | Parent implementation | Current slice | Complete |
| Decide count variance posting policy | Operations + Warehouse + Finance + IT | Before `COUNT_VARIANCE_*` posting | Complete for current release bridge — see `DEC-0026`; direct `COUNT_VARIANCE_*` movement posting remains deferred |
| Decide recount/materiality/reversal/backdate controls | Operations + Warehouse + Finance + IT | Before approval/posting UI | Partial — existing recount request state retained; materiality-specific routing, partial reversal, and backdating remain deferred |

## Evidence

- `docs/phases/phase-01-procurement-inventory/workflows/inventory-workflow.md`
- `docs/phases/phase-01-procurement-inventory/specs/stock-counts-ui-spec.md`
- `docs/phases/phase-01-procurement-inventory/workflows/wastage-stock-adjustment-workflow.md`
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md`
- Round 1 deliberation by Dalisay, Hiraya, Ligaya, and Lualhati.
- Stock count service and tests now cover start, entry, submit, review/recount, self-review block, cancellation limits, immutable variance snapshot, duplicate generated-adjustment prevention, and export detail.
- `DEC-0026` implements reviewed count variance through linked Stock Adjustment generation. Generated adjustments remain non-posting until they complete Stock Adjustment approval and separate posting.
