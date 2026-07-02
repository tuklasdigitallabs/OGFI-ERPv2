# Logging Wastage

**Audience / required role:** Branch, warehouse, and inventory users with scoped Wastage access  
**Related phase/module:** Phase I / Wastage  
**Last verified against:** implemented Wastage Report posting and reversal foundation, `DEC-0015`, `DEC-0016`, `DEC-0017`, and `DEC-0018`

Use this article to record spoiled, expired, damaged, consumed, or otherwise lost stock with reason and evidence references.

## Before You Start

- You must be working in the correct company, brand, and location context.
- The current location must have an active inventory location.
- The item must be active and inventory-tracked.
- Lot or expiry details are required when the item is configured to track them.
- If the item category requires photo evidence by default, enter an evidence reference.

## Current Limits

- Submitting a Wastage Report sends it to the approval inbox.
- Approving or reviewing a Wastage Report does not create a `WASTAGE_OUT` movement.
- Posting an approved Wastage Report creates `WASTAGE_OUT` movement rows and updates stock balances.
- Reversing a posted Wastage Report creates linked `REVERSAL` movement rows and restores stock through the ledger.
- Manual stock adjustments are handled through the separate controlled Stock Adjustment workflow. Backdating remains unavailable in this release.

## Steps

1. Open `Wastage`.
2. Select the inventory location and item.
3. Enter the wasted quantity and estimated unit cost.
4. Select the wastage type.
5. Enter the reason code and evidence reference.
6. Add lot number, expiry date, or notes when applicable.
7. Create the draft report.
8. Open the report and submit it for approval.

Assigned approvers can approve, return, or reject the report from `Approval Inbox`. Eligible reports can be cancelled with reason before final approval.
Authorized inventory posters can post an approved report from the report detail page. Posted reports cannot be corrected by editing. Authorized reversal users can reverse a posted report with a reason, then create a corrected replacement report when needed.

## What To Check

- The Wastage Report shows the correct location, item, quantity, reason, evidence reference, and estimated value.
- Audit history records create, submit, approve, return, reject, review, or cancellation actions.
- Inventory Ledger shows wastage only after the approved report is posted.

## Related Articles

- Viewing current stock balances
- Viewing inventory movement history
- Running stock counts
