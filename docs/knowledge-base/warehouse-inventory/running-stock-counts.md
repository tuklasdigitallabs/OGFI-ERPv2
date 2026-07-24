# Running Stock Counts

**Audience / required role:** Storekeepers, warehouse staff, branch managers, or authorized inventory users with stock count access  
**Applies to:** Current assigned inventory location  
**Related phase/module:** Phase I / Physical Inventory Counts  
**Last verified against:** implemented stock count foundation, `DEC-0013`, and `DEC-0060`

## Purpose

Use this article to schedule, start, enter, submit, and review a physical stock count. During the current recount-foundation rollout, those first-pass actions are recorded in both the existing count record and its immutable attempt-1 history; this is internal lineage and does not change the user steps. When adjustment context is shown to an authorized reviewer, it follows the selected current attempt; an older recount adjustment is not presented as current. Reviewed count variances do not directly adjust stock balances. Count Variance adjustment generation is currently disabled while immutable recovery and adjustment-lineage gates are completed.

If a count cannot be opened because its attempt history is unavailable, contact an administrator; do not retry by creating a second count or editing submitted evidence. The recovery workflow is not yet enabled.

If a detail, list, or export action reports that count history is unavailable or inconsistent, stop and contact an administrator. The system intentionally does not expose a potentially divergent count until its immutable attempt and legacy header/lifecycle and line history reconcile.

The dashboard does not currently publish a Count Variance card or exception task. Count Variance remains inactive until the documented recovery and production-readiness gates are complete.

## Before you begin

- Your role must include the needed stock count permission, such as `inventory.stock_count.create`, `inventory.stock_count.enter`, or `inventory.stock_count.review`.
- Your ERP header location must match the inventory location being counted.
- Posted stock balances must exist before count lines can be generated from the current snapshot.

## Navigation path

`Inventory → Stock Counts`

## Steps

1. Open `Inventory`.
2. Select `Stock Counts`.
   The register is server-paginated for the selected authorized location; use its page controls to move through count sessions without loading the full history into the browser.
3. Schedule a count by choosing the inventory location, count type, scheduled date, and blind-count option.
4. Open the count and select `Start Count`.
5. Enter counted quantities for each snapshot line.
6. Save count entries.
7. Select `Submit for Review` when all lines are counted.
8. An authorized reviewer can mark the count reviewed with notes. Recount recovery is temporarily unavailable while immutable attempt safeguards are completed; the detail form explains this state.

## Expected result

- The count keeps a stable cutoff snapshot of system quantity by item, UOM, lot, and expiry.
- Blind counters enter actual quantities without access to system quantities, calculated variance, reviewer notes, or variance-disclosing audit details.
- Only an authorized count reviewer within the current assigned scope can view variance information for review.
- Reviewed counts remain evidence records. They do not generate a linked Stock Adjustment in the current release.
- No balance update is posted directly from count review. Inventory changes only after the linked Stock Adjustment is approved and posted.

## Important controls and warnings

- Do not treat reviewed variance as corrected stock.
- Count Variance correction is not enabled. Do not attempt to create a replacement adjustment outside the documented recovery release.
- Cancelled counts remain visible with cancellation reason and audit history.
- Submitted counts cannot be edited through normal entry. Recount recovery is not currently available; do not attempt to overwrite the submitted evidence.
- Access to a count or dashboard does not authorize review, approval, adjustment posting, or inventory movement. The source workflow checks that authority again.
- Recount history and variance activation remain controlled release work. Do not use a reviewer view as evidence that stock has been corrected.

## Related articles

- Viewing Stock Balances
- Viewing Inventory Movement History
