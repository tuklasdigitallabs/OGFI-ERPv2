# Reviewing And Approving A Purchase Request

**Audience / required role:** Assigned approvers, managers, operations, finance, and authorized users with scoped approval access  
**Applies to:** Assigned approval queue and authorized company/location scope  
**Related phase/module:** Phase I / Purchase Request Approvals  
**Last verified against:** implemented Approval Inbox, Purchase Request approval, return, reject, self-approval, scope, and audit controls

## Purpose

Use this article to review a submitted Purchase Request and decide whether to approve it, return it for revision, or reject it.

Approval actions must be made from the approval workflow with enough request context. A Purchase Request approval does not create a Purchase Order, receive stock, or update inventory.

## Before You Start

- Your role must include Purchase Request approval access.
- The request must be assigned to you or to one of your active approval roles.
- You must have approval scope for the request location.
- You cannot approve your own Purchase Request.
- Return and reject decisions require remarks.

## Navigation Path

`Approval Inbox -> Review`

## Steps

1. Open `Approval Inbox`.
2. Review the `Pending decisions` list.
3. Select `Review` for the Purchase Request.
4. Confirm the requester, location, required date, quantity, UOM, line description, and justification.
5. Review comments, evidence indicators, policy flags, and audit history where shown.
6. Choose one decision:
   - Select `Approve Purchase Request` when the request is valid.
   - Select `Return for Revision` when the requester should correct or clarify the request.
   - Select `Reject Purchase Request` when the request should not proceed.
7. Enter remarks when returning or rejecting. Add approval remarks when useful.

## Expected Result

- Approving moves the Purchase Request from `PENDING_APPROVAL` to `APPROVED`.
- Returning moves the request to `RETURNED` so the requester can reopen it as draft, correct it, and resubmit.
- Rejecting moves the request to `REJECTED`.
- The approval instance and current approval step are closed with the decision.
- Audit history records the actor, timestamp, decision, approval instance, and remarks where applicable.

## Important Controls And Warnings

- Approval permissions are not blanket approval authority. The approval engine assignment and scope checks still apply.
- Self-approval is blocked server-side.
- Out-of-scope approval is blocked even if a link is opened directly.
- Return and reject remarks are required so the requester has an auditable next step.
- Approval does not select a supplier, issue a PO, or create inventory movement.
- Comments are separate from approval decisions and do not replace a decision.

## What To Check

- The approval detail page shows the correct request number, owner, location, required date, item, quantity, and justification.
- The requester is not you.
- The decision result appears on the Purchase Request detail page.
- Returned or rejected requests show remarks for the requester.
- Audit history contains the decision event.

## Related Articles

- Creating a Purchase Request
- Editing, cancelling, or resubmitting a Purchase Request
- Understanding Purchase Order statuses
- Why cannot I approve this request?
