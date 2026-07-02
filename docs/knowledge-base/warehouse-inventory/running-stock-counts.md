# Running Stock Counts

**Audience / required role:** Storekeepers, warehouse staff, branch managers, or authorized inventory users with stock count access  
**Applies to:** Current assigned inventory location  
**Related phase/module:** Phase I / Physical Inventory Counts  
**Last verified against:** implemented stock count foundation and `DEC-0013`

## Purpose

Use this article to schedule, start, enter, submit, and review a physical stock count. Reviewed count variances do not directly adjust stock balances. When a count-generated adjustment is available, it still requires Stock Adjustment approval and a separate post action before inventory changes.

## Before you begin

- Your role must include the needed stock count permission, such as `inventory.stock_count.create`, `inventory.stock_count.enter`, or `inventory.stock_count.review`.
- Your ERP header location must match the inventory location being counted.
- Posted stock balances must exist before count lines can be generated from the current snapshot.

## Navigation path

`Inventory → Stock Counts`

## Steps

1. Open `Inventory`.
2. Select `Stock Counts`.
3. Schedule a count by choosing the inventory location, count type, scheduled date, and blind-count option.
4. Open the count and select `Start Count`.
5. Enter counted quantities for each snapshot line.
6. Save count entries.
7. Select `Submit for Review` when all lines are counted.
8. An authorized reviewer can mark the count reviewed or request a recount with notes.

## Expected result

- The count keeps a stable cutoff snapshot of system quantity by item, UOM, lot, and expiry.
- Blind counters enter actual quantities without needing to see system quantities.
- Submitted counts show variance for review.
- Reviewed counts remain evidence records and may support a linked Stock Adjustment where the workflow allows it.
- No balance update is posted directly from count review. Inventory changes only after the linked Stock Adjustment is approved and posted.

## Important controls and warnings

- Do not treat reviewed variance as corrected stock.
- Count variance correction must pass through the controlled Stock Adjustment workflow before it affects inventory.
- Cancelled counts remain visible with cancellation reason and audit history.
- Submitted counts cannot be edited through normal entry; request a recount instead.

## Related articles

- Viewing Stock Balances
- Viewing Inventory Movement History
