# Running Stock Counts

**Audience / required role:** Storekeepers, warehouse staff, branch managers, or authorized inventory users with stock count access  
**Applies to:** Current assigned inventory location  
**Related phase/module:** Phase I / Physical Inventory Counts  
**Last verified against:** implemented stock count foundation, `DEC-0013`, `DEC-0060`, `DEC-0260`, and `DEC-0261`

## Purpose

Use this article to schedule, start, enter, and review a physical stock count. During the current recount-foundation rollout, those first-pass actions are recorded in both the existing count record and its immutable attempt-1 history; the detail screen labels the current immutable attempt number. When adjustment context is shown to an authorized reviewer, it follows the selected current attempt; an older recount adjustment is not presented as current. Reviewed count variances do not directly adjust stock balances. Count Variance adjustment generation is currently disabled while immutable recovery and adjustment-lineage gates are completed.

If a count cannot be opened because its attempt history is unavailable, contact an administrator; do not retry by creating a second count or editing submitted evidence. A protected recount request is currently unavailable: its controlled-evidence policy/adapter, exact approval cohort, MFA, segregation, and UAT gates are not active. Never use a free-text evidence reference as a substitute.

If a detail, list, or export action reports that count history is unavailable or inconsistent, stop and contact an administrator. The system intentionally does not expose a potentially divergent count until its immutable attempt and legacy header/lifecycle and line history reconcile.

The dashboard does not currently publish a Count Variance card or exception task. Count Variance remains inactive until the documented recovery and production-readiness gates are complete.

The conditional pilot count-review route is implemented locally but disabled by default. It is not currently a production, UAT, or deployment availability claim. Until an authorized release activates the route for an exact pilot cohort, submitted counts continue to use the existing review behavior.

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
8. Under the current default-off behavior, an authorized reviewer can mark the count reviewed with notes. Recount recovery is temporarily unavailable while immutable attempt safeguards are completed; the detail form explains this state.

If a future authorized release has activated the pilot count-review route and the server admits this count to that exact cohort, `Submit for Review` places the current count attempt in Approval Inbox review instead. That route is approve-only: the direct count-page review action is unavailable for the admitted count, and return or rejection is not an alternative path.

## Expected result

- The count keeps a stable cutoff snapshot of system quantity by item, UOM, lot, and expiry.
- Blind counters enter actual quantities without access to system quantities, calculated variance, reviewer notes, or variance-disclosing audit details.
- Only an authorized count reviewer within the current assigned scope can view variance information for review.
- For a count admitted to the activated pilot route, the Approval Inbox approval is independent of the count creator, assigned counter, and anyone who entered a count line. Final approval marks the current attempt and session `REVIEWED`.
- Reviewed counts remain evidence records. They do not generate a linked Stock Adjustment in the current release.
- No balance update is posted directly from count review. Inventory changes only after the linked Stock Adjustment is approved and posted.

## Important controls and warnings

- Do not treat reviewed variance as corrected stock.
- Count Variance correction is not enabled. Do not attempt to create a replacement adjustment outside the documented recovery release.
- Cancelled counts remain visible with cancellation reason and audit history.
- Submitted counts cannot be edited through normal entry. Recount recovery is not currently available; do not attempt to overwrite the submitted evidence.
- An admitted pilot count has no Approval Inbox return or rejection option. Its direct count-page review is not an alternate route. If cancellation is authorized before review completes, it closes the pending approval route while preserving count and approval history; it does not overwrite or relabel the attempt.
- A controlled cancellation of a submitted admitted count records the cancellation time and required reason on the immutable current attempt and cancels the matching session and pending approval together. Count quantities, evidence, cutoff, scope, and actor history cannot be changed during or after that cancellation.
- Approval or cancellation of a count does not post inventory, change a balance, or create a Stock Adjustment. A later variance correction remains a separate controlled workflow.
- A release emergency disable can deny new pilot admissions. It cannot downgrade an already admitted count to an uncontrolled direct-review path or remove its approval controls.
- Access to a count or dashboard does not authorize review, approval, adjustment posting, or inventory movement. The source workflow checks that authority again.
- Recount history is append-only and reviewer-only; a successor never overwrites the reviewed attempt. Recount recovery and variance activation remain controlled release work. Do not use a reviewer view as evidence that stock has been corrected. If recovery is unavailable, preserve the count record and escalate through the approved supervisor/incident process rather than changing stock outside the ERP workflow.

## Related articles

- Viewing Stock Balances
- Viewing Inventory Movement History
