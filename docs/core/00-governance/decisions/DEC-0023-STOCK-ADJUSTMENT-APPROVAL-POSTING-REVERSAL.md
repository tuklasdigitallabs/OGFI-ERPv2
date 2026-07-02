# Decision Record — Stock Adjustment Approval, Posting, and Reversal

## Metadata

- Decision ID: `DEC-0023`
- Title: Stock Adjustment Approval, Posting, and Reversal
- Status: `Confirmed`
- Date: 2026-06-30
- Decision owner: Operations + Warehouse + Finance + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Stock Adjustment and Inventory Controls
- Related decision brief: Controlled manual stock adjustment completion after `DEC-0019`

## Decision

Implement a bounded Stock Adjustment approval, separate posting, and full-document reversal slice for existing manual `INCREASE` and `DECREASE` adjustments only.

Approval is non-posting. Posting is a separate authorized action after final approval and creates immutable `ADJUSTMENT_IN` or `ADJUSTMENT_OUT` inventory movements through the inventory ledger service. Reversal creates linked `REVERSAL` movements and never edits or deletes original movements.

## Context

`DEC-0019` intentionally limited Stock Adjustment to non-posting foundation records. Phase I now needs a controlled correction path that can change stock while preserving branch/warehouse scope, approval segregation, immutable movement history, and auditability. Wastage already proves the local pattern of approval first, separate posting, and full-document reversal.

## Options considered

### Option A — selected

- Summary: Extend manual `INCREASE` and `DECREASE` stock adjustments with approval, separate posting, and full-document reversal.
- Benefits: Completes the narrow stock correction control while reusing existing approval and inventory-ledger patterns.
- Failure modes: Users may misuse adjustments for wastage, receiving shortage, transfer loss, opening balance, or count variance if labels and controls are unclear.
- Why selected: It is the smallest controlled option that satisfies Phase I stock-adjustment needs without widening into unresolved cutover, counting, backdating, valuation, or accounting policy.

### Option B — rejected

- Summary: Auto-post Stock Adjustment when the final approver approves.
- Benefits: Fewer user actions.
- Failure modes: Couples approval authority with stock mutation, makes approval retries risky, and differs from the established Wastage control pattern.
- Why rejected: Posting should remain an explicit stock-control action with final inventory validation.

### Option C — rejected

- Summary: Include opening balance, count variance posting, reclassification, backdating, and finance valuation in the same slice.
- Benefits: Broader inventory correction capability.
- Failure modes: Mixes material cutover, counting, period-control, and accounting policies into a high-risk release.
- Why rejected: These remain separate material decisions.

### Option D — rejected

- Summary: Correct posted adjustments by editing, deleting, or cancelling posted movements.
- Benefits: Superficially simpler correction path.
- Failure modes: Violates immutable ledger and audit-history controls.
- Why rejected: Corrections must use source-linked reversal movements.

## Hard-gate assessment

- Tenant, company, and current-location scope remain enforced server-side.
- Requester self-approval is blocked.
- Posting is impossible before final approval.
- Inventory balances change only through immutable `InventoryMovement` posting.
- Posting and reversal use deterministic source event keys and line-level movement links.
- Posted/reversed adjustments are terminal for direct edit/cancel/repost.
- Existing records are preserved; migration creates no movements and changes no balances.
- Opening balance, count variance, backdating, reclassification, valuation, GL posting, and queueing remain out of scope.

## Required safeguards

- Add only nullable posting/reversal metadata to existing adjustment records.
- Route new submission into `PENDING_APPROVAL`; preserve legacy `SUBMITTED` records as readable non-posting records.
- Require `StockAdjustment` approval rule configuration before submission.
- Add explicit post and reverse permissions.
- Verify original movement tenant, company, source document, line, item, and location before reversal.
- Block duplicate posting/reversal through status claims, posted movement links, and inventory movement source event uniqueness.
- Keep all actions audited with reason, status transition, and movement IDs where applicable.

## Implementation and documentation impact

- Code / architecture: Add Stock Adjustment approval handling, post action, and full-document reversal action.
- Data / schema: Add posted/reversed metadata and user relations on `StockAdjustment`.
- Workflow / permissions: Add `inventory.stock_adjustment.approve`, `inventory.stock_adjustment.post`, and `inventory.stock_adjustment.reverse`.
- UI / mobile: Detail page shows approval, post, reverse, terminal status, and audit history actions clearly.
- Reporting: Adjustment exports/detail distinguish approved, posted, and reversed records; only posted records affect stock.
- Knowledge base / training: Add guidance before release.
- Tests / UAT: Cover submit/approve/post/reverse happy paths, self-approval block, negative stock block, duplicate prevention, and scope denial.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Decide count-variance posting and generated adjustments | Operations + Warehouse + Finance | Before physical-count completion | Deferred |
| Decide opening balance cutover workflow | Finance + Warehouse + IT | Before pilot opening stock load | Deferred |
| Decide backdated adjustment policy | Finance + Operations | Before period-control release | Deferred |
| Add user-facing adjustment guidance | Dunong | Before release notes | Complete — see `docs/knowledge-base/warehouse-inventory/understanding-stock-adjustments.md` |

## Evidence

- `docs/core/00-governance/decisions/DEC-0019-STOCK-ADJUSTMENT-FOUNDATION-BEFORE-POSTING.md`
- `docs/phases/phase-01-procurement-inventory/workflows/wastage-stock-adjustment-workflow.md`
- `docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md`
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md`
- Existing Wastage approval, posting, and reversal service pattern.
- First-round deliberation by Dalisay, Hiraya, Ligaya, and Lualhati.
- User-facing stock adjustment guidance explains non-posting approval, separate posting, reversal, reason/evidence controls, and current exclusions.

## Supersession

This decision supersedes only the `DEC-0019` deferral for manual `INCREASE` and `DECREASE` Stock Adjustment approval, posting, and full-document reversal. All other `DEC-0019` deferrals remain active.
