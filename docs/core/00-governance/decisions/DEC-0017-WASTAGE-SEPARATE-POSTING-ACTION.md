# Decision Record — Wastage Separate Posting Action

## Metadata

- Decision ID: `DEC-0017`
- Title: Wastage Separate Posting Action
- Status: `Confirmed`
- Date: 2026-06-29
- Decision owner: Operations + Warehouse + Finance + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Wastage and Inventory Controls

## Decision

Add a separate authorized `Post Wastage` action after approval. Final approval makes a Wastage Report eligible for inventory posting; it does not automatically create stock movement.

Only `APPROVED` Wastage Reports may be posted. Posting creates one immutable `WASTAGE_OUT` movement per wastage line, links each line to its movement, updates the inventory balance through the inventory posting service, marks the report `POSTED`, records the poster and UTC posting time, and writes an audit event.

Legacy `REVIEWED` reports remain non-posting. `POSTED` reports cannot be edited, cancelled, or reposted; correction requires a future reversal workflow.

## Options considered

### Option A — selected

- Summary: Separate authorized `Post Wastage` action after approval.
- Benefits: Keeps approval and stock mutation distinct, allows stock/lot revalidation at posting time, supports explicit posting permission, and uses the existing idempotent inventory movement service.
- Failure modes: Approved reports may remain unposted if users miss the second action.
- Why selected: It satisfies the documented post-after-approval workflow without turning approvers into implicit inventory posters.

### Option B — rejected

- Summary: Auto-post `WASTAGE_OUT` on final approval.
- Why rejected: It couples approval with stock mutation, surprises users after `DEC-0016`, and makes approval retries/failures harder to recover.

### Option C — rejected

- Summary: Defer posting.
- Why rejected: It leaves approved wastage disconnected from stock balances and weakens Phase I inventory accuracy.

### Option D — deferred

- Summary: Posting plus reversal, backdating, and evidence-threshold policy in one slice.
- Why deferred: Reversal/backdating/evidence thresholds are material policy decisions and should follow the bounded posting path.

## Hard-gate assessment

- Posting requires `inventory.wastage.post`.
- Posting is server-side tenant/company/current-location scoped.
- Only `APPROVED` reports can post; `REVIEWED`, `PENDING_APPROVAL`, `RETURNED`, `REJECTED`, `CANCELLED`, and already `POSTED` reports cannot post.
- Posting runs in a transaction and uses deterministic inventory movement source event keys.
- Each posted line links to one immutable `InventoryMovement`.
- Inventory balance is changed only through the inventory movement posting service.
- Negative stock is blocked by the inventory balance guard.
- Migration creates no inventory movements and does not backfill posted state.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement controlled reversal for posted wastage | Warehouse + Finance + IT | Before production correction workflow | Complete - see `DEC-0018` |
| Decide backdated wastage policy and closed-period controls | Operations + Finance + IT | Before backdated posting | Open |
| Decide configurable evidence thresholds and repeat-loss escalation | Operations + Finance | Before advanced wastage routing | Confirmed in `DEC-0021` |
| Decide stock adjustment foundation separately from wastage | Operations + Finance + IT | Before stock adjustment records | Complete - see `DEC-0019` and `DEC-0023` |

## Evidence

- `docs/phases/phase-01-procurement-inventory/workflows/wastage-stock-adjustment-workflow.md`
- `docs/core/00-governance/decisions/DEC-0016-WASTAGE-APPROVAL-BEFORE-POSTING.md`
- Round 1 deliberation by Dalisay, Hiraya, Ligaya, and Lualhati.
- `DEC-0018` posted wastage reversal and `DEC-0023` stock adjustment posting/reversal decisions.
