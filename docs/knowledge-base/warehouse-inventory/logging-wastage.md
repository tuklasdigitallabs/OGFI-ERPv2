# Logging Wastage

**Audience / required role:** Branch, warehouse, and inventory users with scoped Wastage access  
**Related phase/module:** Phase I / Wastage  
**Last verified against:** implemented Wastage Report and Reason Codes behavior; `DEC-0015`, `DEC-0016`, `DEC-0017`, `DEC-0018`, and `DEC-0268`

## Purpose

Record spoiled, expired, damaged, consumed, or otherwise lost stock with the
correct reason and evidence reference. The selected reason code must match both
the wastage type and the inventory class of every item on the report.

## Before you begin

- You must be working in the correct company, brand, and location context.
- The current location must have an active inventory location.
- The item must be active and inventory-tracked.
- Lot or expiry details are required when the item is configured to track them.
- If the item category requires photo evidence by default, enter an evidence reference.
- Select the wastage type and item before expecting an eligible reason code. An
  unmapped, inactive, or otherwise incompatible code is unavailable for new
  entry; contact an authorized administrator rather than choosing a different
  code to bypass the control.

## Navigation path

`Wastage → Create Wastage Report`

## Current Limits

- Submitting a Wastage Report sends it to the approval inbox.
- Approving or reviewing a Wastage Report does not create a `WASTAGE_OUT` movement.
- Posting an approved Wastage Report creates `WASTAGE_OUT` movement rows and updates stock balances.
- Reversing a posted Wastage Report creates linked `REVERSAL` movement rows and restores stock through the ledger.
- Manual stock adjustments are handled through the separate controlled Stock Adjustment workflow. Backdating remains unavailable in this release.

## Steps

1. Open `Wastage`. The ordinary register is server-paginated and shows the current authorized location’s reports; use the page controls to move through the full register without loading all reports into the browser.
2. Select the inventory location and item.
3. Enter the wasted quantity and estimated unit cost.
4. Select the wastage type.
5. Select a reason code from the available list, then enter the evidence reference.
   The list is limited to active company-scoped codes that match the selected
   wastage type and every selected item class. If it displays `No configured
   reason for this type and item class`, stop and ask an authorized administrator
   to review the reason-code configuration.
6. Add lot number, expiry date, or notes when applicable.
7. Create the draft report.
8. Open the report and submit it for approval.

After normalized routing is activated, assigned approvers can approve, return, or reject the report from `Approval Inbox`. While the Inbox is unavailable, it exposes no complete queue or approval actions. `Scan Approvals` may create a current-user reminder for an eligible due or overdue report, but its approval link remains unavailable and the scan is not a complete report list. Follow the workflow owner for release guidance and do not interpret silence as zero pending reports. Eligible reports can be cancelled with reason before final approval. The cancel action rechecks the locked report status, so if approval wins while cancellation is waiting, cancellation is rejected and the approved report remains authoritative.
Authorized inventory posters can post an approved report from the report detail page. Posted reports cannot be corrected by editing. Authorized reversal users can reverse a posted report with a reason, then create a corrected replacement report when needed.

The action shows `Posting Wastage…` or `Reversing Wastage…` while it is processing and prevents duplicate submission.

Before either stock-affecting action commits, the server locks the report and inventory location and rechecks the live user/session, current permission, exact location scope, and privileged MFA evidence. The matching authority rows are held transactionally so a permission or scope revocation cannot slip between the check and the ledger write. A stale-session, scope, or MFA denial is a control response; refresh the report and do not bypass it.

## Expected result

- The Wastage Report shows the correct location, item, quantity, reason, evidence reference, and estimated value.
- Creating the report saves a draft. Submitting it sends it to the applicable
  approval process; it does not reduce inventory.
- Audit history records create, submit, approve, return, reject, review, or cancellation actions.
- Inventory Ledger shows wastage only after the approved report is posted.

## Important controls and warnings

- Branch and warehouse users can work only in their assigned company and location scope.
- A reason code is valid only when its configured wastage event/type and item
  inventory class both match the report. The server checks this again when the
  record is created or submitted; a stale selection is rejected.
- Approval and evidence policies are unchanged by reason-code applicability.
  Approval alone does not post stock, and no user may approve their own report
  when segregation rules apply.
- A posted report cannot be edited. Use the authorized reversal action with a
  reason, then create a corrected replacement report when necessary.

## What happens next

The report follows the configured approval route. After final approval, an
authorized poster may use `Post Wastage`; this creates the immutable
`WASTAGE_OUT` ledger movement and reduces the selected inventory location's
balance. A reversal creates linked `REVERSAL` movements and retains the original
report and audit history.

## Related Articles

- Viewing current stock balances
- Viewing inventory movement history
- Running stock counts
- Configuring Wastage Reason Codes
