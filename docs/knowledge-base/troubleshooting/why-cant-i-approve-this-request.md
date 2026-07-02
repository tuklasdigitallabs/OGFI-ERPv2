# Why Can't I Approve This Request?

**Audience / required role:** Approvers, managers, operations, finance, and support administrators  
**Applies to:** Purchase Requests, Purchase Orders, quotation recommendations, wastage reports, stock adjustments, and other approval-backed records  
**Related phase/module:** Phase I / Approval Controls  
**Last verified against:** implemented Approval Inbox, assignment, scope, self-approval, required remarks, and status-transition controls

## Purpose

Use this article when an approval button is missing, an approval action fails, or a user cannot find an expected approval in `Approval Inbox`.

Approval access is more specific than module access. A user must have the right permission, be assigned to the current approval step, have approval scope for the record location, and pass segregation-of-duties checks.

## Common Reasons

- The record is not in a pending approval status.
- The approval is assigned to another user or role.
- The user has view access but not approval permission.
- The user does not have approval-level scope for the record location.
- The user is the requester, creator, preparer, reporter, or another blocked actor for that transaction.
- The approval was already approved, returned, rejected, cancelled, posted, or reversed.
- Return or reject remarks are missing or too short.
- The record no longer matches the expected approval document status.

## What The Approver Should Check

1. Open `Approval Inbox`.
2. Confirm the record appears in `Pending decisions`.
3. Open `Review`.
4. Confirm the owner, location, current step, required date, item, quantity, amount, evidence, and policy flags.
5. Use the correct action: approve, return for revision, or reject.
6. Enter remarks when returning or rejecting.

## What An Administrator Should Check

1. Confirm the user's approval permission for the module.
2. Confirm the user's active role assignment matches the pending approval step.
3. Confirm the user has approval or manage scope for the record's company, brand, or location.
4. Confirm the user is not blocked by self-approval or segregation-of-duties rules.
5. Confirm the approval instance status is still pending.
6. Confirm the source record status still matches the approval workflow.

## Important Controls And Warnings

- Do not approve from another user's account.
- Do not change a requester, creator, or preparer just to bypass self-approval.
- Do not bypass approval by directly editing the source record.
- Return and reject require remarks so the next user has an auditable instruction.
- Approval alone may be non-posting. Wastage, stock adjustment, PO issue, receiving, transfer dispatch, and inventory posting remain separate controlled actions where applicable.

## Related Articles

- Reviewing and approving a Purchase Request
- Editing, cancelling, or resubmitting a Purchase Request
- Why can't I see my branch, warehouse, or request?
- Understanding statuses, audit history, and attachments
