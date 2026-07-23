# Understanding Stock Adjustments

**Audience / required role:** Branch managers, warehouse managers, inventory custodians, operations, finance, and authorized inventory users with scoped Stock Adjustment access  
**Applies to:** Current assigned inventory location  
**Related phase/module:** Phase I / Stock Adjustments  
**Last verified against:** implemented Stock Adjustment approval, posting, and reversal controls, `DEC-0019` and `DEC-0023`

## Purpose

Use Stock Adjustments to request a controlled correction when the recorded stock balance is known to be wrong and the correction does not belong to a receiving, transfer, wastage, or stock-count entry workflow.

A Stock Adjustment is not a direct stock edit. Approval is non-posting. Inventory changes only after an authorized user selects `Post Adjustment`, which creates linked inventory ledger movements.

## Before You Start

- Your role must include the needed Stock Adjustment permission for the location.
- The ERP header location must match the inventory location being corrected.
- The item must be active and inventory-tracked.
- You need a reason code, reason description, quantity impact, and evidence reference where policy requires it.
- Use the source workflow when the issue is supplier shortage, rejected delivery, transfer discrepancy, wastage, or a stock-count review.

## Navigation Path

`Inventory -> Adjustments`

The ordinary register is server-paginated for the selected authorized location; use its page controls to move through adjustment requests without loading the full history into the browser.

## When To Use It

Use a Stock Adjustment for:

- Verified missing stock that should increase the balance.
- Verified overstated stock that should decrease the balance.
- A controlled correction backed by reason, evidence, and review.
- A count-generated variance adjustment when a reviewed count creates a linked adjustment record.

Do not use it to hide wastage, supplier shortage, transfer loss, unapproved backdating, opening balance setup, or finance/accounting corrections.

## Steps

1. Open `Inventory`.
2. Select `Adjustments`.
3. Choose the inventory location.
4. Select the item and adjustment type: `INCREASE` or `DECREASE`.
5. Enter the quantity impact.
6. Enter the reason code, reason description, and evidence reference.
7. Create the adjustment.
8. Open the adjustment detail page.
9. Select `Submit for Approval`.
10. Assigned approvers review, approve, return, or reject the request from the approval workflow.
11. After approval, an authorized inventory poster selects `Post Adjustment`.

## Expected Result

- Submitted adjustments enter the approval workflow.
- Approval does not change stock.
- Posting creates one source-linked `ADJUSTMENT_IN` or `ADJUSTMENT_OUT` movement per line.
- Inventory balances update only through the inventory ledger service.
- Posted adjustments show posted movement references.
- If a posted adjustment is wrong, authorized users reverse the full posted adjustment with a reason instead of editing the posted record.

## Important Controls And Warnings

- `INCREASE` and `DECREASE` are the active manual adjustment types in this release.
- Opening balance, backdating, reclassification, and partial reversal are not released Stock Adjustment actions.
- Count-generated variance adjustments still require Stock Adjustment approval and a separate post action before inventory changes.
- Posted adjustments cannot be edited.
- Reversal creates linked `REVERSAL` inventory movements and preserves the original adjustment history.
- Users cannot rely on page visibility alone for authority; scope and permission checks are enforced by the service layer.

## What To Check

- The adjustment shows the correct company, location, item, quantity, reason, evidence reference, and status.
- The approval history shows who approved, returned, or rejected the request.
- Inventory Ledger shows no adjustment movement until the adjustment is posted.
- Posted or reversed adjustments show the linked movement references.

## Related Articles

- Viewing current stock balances
- Viewing inventory movement history
- Running stock counts
- Logging wastage
