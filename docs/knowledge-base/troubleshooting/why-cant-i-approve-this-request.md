# Why Can't I Approve This Request?

**Audience / required role:** Approvers, managers, operations, finance, and support administrators  
**Applies to:** Purchase Requests, Purchase Orders, quotation recommendations, wastage reports, stock adjustments, and other approval-backed records  
**Related phase/module:** Phase I / Approval Controls  
**Last verified against:** implemented Approval Inbox, multi-step routing, live authority revalidation, assignment, scope, self-approval, outcome notifications, required remarks, and concurrent decision controls

## Purpose

Use this article when an approval button is missing, an approval action fails, or a user cannot find an expected approval in `Approval Inbox`.

Approval access is more specific than module access. A user must have the right permission, be assigned to the current approval step, have approval scope for the record location, and pass segregation-of-duties checks.

## Before You Start

- Sign in with your own account and select the company and location where the record belongs.
- Have the record reference and any user-safe error message available.
- Do not use another person's account or ask an administrator to bypass the configured route.

## Navigation Path

`Approval Inbox -> Pending decisions -> Review`

## Common Reasons

- The record is not in a pending approval status.
- The approval is assigned to another user or role.
- The user has view access but not approval permission.
- The user does not have approval-level scope for the record location.
- The user is the requester, creator, preparer, reporter, or another blocked actor for that transaction.
- The approval was already approved, returned, rejected, cancelled, posted, or reversed.
- Return or reject remarks are missing or too short.
- The record no longer matches the expected approval document status.
- Your role, permission, location scope, session, or current-step assignment changed after you opened the review page.
- A different authorized action completed first. For example, another approver may already have decided the step, or an authorized user may have cancelled a pending Wastage Report.
- The next configured approval step currently has no eligible user with the required permission and approval scope, so the system cannot safely advance the route.

## Steps

1. Open `Approval Inbox`.
2. Confirm the record appears in `Pending decisions`.
3. Open `Review`.
4. Confirm the owner, location, current step, required date, item, quantity, amount, evidence, and policy flags.
5. Use the correct action: approve, return for revision, or reject.
6. Enter remarks when returning or rejecting.
7. If the action reports that it is no longer available, refresh `Approval Inbox` and reopen the current record. Do not keep submitting the decision from the old page.

## What An Administrator Should Check

1. Confirm the user's approval permission for the module.
2. Confirm the user's active role assignment matches the pending approval step.
3. Confirm the user has approval or manage scope for the record's company, brand, or location.
4. Confirm the user is not blocked by self-approval or segregation-of-duties rules.
5. Confirm the approval instance status is still pending.
6. Confirm the source record status still matches the approval workflow.
7. For a multi-step route, confirm the user is assigned to the current step—not an earlier or later step—and that an eligible approver exists for the next step.
8. If access was recently changed or revoked, ask the user to refresh and sign in again when required. Do not restore unnecessary access solely to make an old approval page work.
9. During the controlled normalized-routing rollout, confirm the deployment flag remains disabled until the administrator runbook reports an 18-document-type zero-gap backfill and inbox/action verification. Do not enable it to work around a missing approval.

## Important Controls And Warnings

- Do not approve from another user's account.
- Do not change a requester, creator, or preparer just to bypass self-approval.
- Do not bypass approval by directly editing the source record.
- Return and reject require remarks so the next user has an auditable instruction.
- An intermediate approval does not finalize the record. The source record remains pending approval, and the next eligible approver is notified.
- A notification is a convenience signal, not approval authority. For a role-scoped step, current eligibility is determined from the active step plus live role, permission, scope, effective-date, active-resource, and prohibited-actor checks; an eligible item may be available without a personal notification after the controlled rollout is enabled.
- Final approval, return, or rejection notifies the requester or responsible owner according to the source workflow.
- Purchase Requests, Purchase Orders, quotation recommendations, Wastage Reports, and Stock Adjustments use the same current-step authority and concurrent-decision safeguards in the implemented approval flow.
- A Wastage Report cancellation cannot overwrite a concurrent approval decision. If another authorized action wins first, the later action is rejected and the latest record state must be reviewed.
- Approval alone may be non-posting. Wastage, stock adjustment, PO issue, receiving, transfer dispatch, and inventory posting remain separate controlled actions where applicable.

## Expected Result

- A still-valid assigned approver can complete the current decision once.
- If more approval steps remain, the record stays pending and the next eligible approver receives the task notification.
- If the route ends through final approval, return, or rejection, the requester or responsible owner receives the outcome notification.
- A stale, reassigned, revoked, out-of-scope, duplicate, or losing concurrent action is denied without overwriting the accepted decision.

## What Happens Next

- If refreshing shows the approval under another user or role, that current assignee should continue the route.
- If no eligible next approver exists, an administrator must correct the configured assignment, permission, or scope before the current step can advance.
- If the record already has a final or cancelled status, review its audit history and outcome remarks rather than trying to submit another decision.

## Related Articles

- Reviewing and approving a Purchase Request
- Editing, cancelling, or resubmitting a Purchase Request
- Why can't I see my branch, warehouse, or request?
- Understanding statuses, audit history, and attachments
