# Running Stock Counts

**Audience / required role:** Storekeepers, warehouse staff, branch managers, or authorized inventory users with stock count access  
**Applies to:** Current assigned inventory location  
**Related phase/module:** Phase I / Physical Inventory Counts  
**Last verified against:** implemented stock count foundation, `DEC-0013`, and `DEC-0060`

## Purpose

Use this article to schedule, start, enter, submit, and review a physical stock count. During the current recount-foundation rollout, those first-pass actions are recorded in both the existing count record and its immutable attempt-1 history; this is internal lineage and does not change the user steps. Reviewed count variances do not directly adjust stock balances. When a count-generated adjustment is available, it still requires Stock Adjustment approval and a separate post action before inventory changes.

If a count cannot be opened because its attempt history is unavailable, contact an administrator; do not retry by creating a second count or editing submitted evidence. The recovery workflow is not yet enabled.

If a detail or export action reports that count history is unavailable or inconsistent, stop and contact an administrator. The system intentionally does not export a potentially divergent count until its immutable attempt and legacy line history reconcile.

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
8. An authorized reviewer can mark the count reviewed or request a recount with notes.

## Expected result

- The count keeps a stable cutoff snapshot of system quantity by item, UOM, lot, and expiry.
- Blind counters enter actual quantities without access to system quantities, calculated variance, reviewer notes, or variance-disclosing audit details.
- Only an authorized count reviewer within the current assigned scope can view variance information for review.
- Reviewed counts remain evidence records and may support a linked Stock Adjustment where the workflow allows it.
- No balance update is posted directly from count review. Inventory changes only after the linked Stock Adjustment is approved and posted.

## Important controls and warnings

- Do not treat reviewed variance as corrected stock.
- Count variance correction must pass through the controlled Stock Adjustment workflow before it affects inventory.
- Cancelled counts remain visible with cancellation reason and audit history.
- Submitted counts cannot be edited through normal entry; request a recount instead.
- Access to a count or dashboard does not authorize review, approval, adjustment posting, or inventory movement. The source workflow checks that authority again.
- Recount history and variance activation remain controlled release work. Do not use a reviewer view as evidence that stock has been corrected.

## Related articles

- Viewing Stock Balances
- Viewing Inventory Movement History
