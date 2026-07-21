# Reviewing And Approving A Purchase Request

**Audience / required role:** Assigned approvers, managers, operations, finance, and authorized users with scoped approval access  
**Applies to:** Assigned approval queue and authorized company/location scope  
**Related phase/module:** Phase I / Purchase Request Approvals  
**Last verified against:** implemented Approval Inbox, multi-step Purchase Request approval, return, reject, assignment, live authority, notification, self-approval, scope, and audit controls

## Purpose

Use this article to review a submitted Purchase Request and decide whether to approve it, return it for revision, or reject it.

Approval actions must be made from the approval workflow with enough request context. A Purchase Request approval does not create a Purchase Order, receive stock, or update inventory.

## Before You Start

- Your role must include Purchase Request approval access.
- The current approval step must be assigned to you or to one of your active approval roles.
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
6. Confirm that the request still appears in your `Pending decisions` list and that the current step shown on the review page is the step you opened.
7. Choose one decision:
   - Select `Approve Purchase Request` when the request is valid.
   - Select `Return for Revision` when the requester should correct or clarify the request.
   - Select `Reject Purchase Request` when the request should not proceed.
8. Enter remarks when returning or rejecting. Add approval remarks when useful.

## Expected Result

- If another configured approval step remains, approving completes only your step. The Purchase Request stays `PENDING_APPROVAL`, the next step becomes current, and the next eligible approver receives an in-app notification.
- If your step is the final configured step, approving moves the Purchase Request from `PENDING_APPROVAL` to `APPROVED` and notifies the requester.
- Returning moves the request to `RETURNED` so the requester can reopen it as draft, correct it, and resubmit.
- Rejecting moves the request to `REJECTED`.
- A return or rejection closes the pending approval route and notifies the requester.
- Audit history records the actor, timestamp, decision, approval instance, and remarks where applicable.

## Important Controls And Warnings

- Approval permissions are not blanket approval authority. The approval engine assignment and scope checks still apply.
- The server checks your current account status, session, permission, assignment, and approval scope again when it processes the decision. If your access or assignment changed after you opened the page, the action can be denied; refresh `Approval Inbox` instead of retrying from an old page.
- Self-approval is blocked server-side.
- Out-of-scope approval is blocked even if a link is opened directly.
- Return and reject remarks are required so the requester has an auditable next step.
- Approval does not select a supplier, issue a PO, or create inventory movement.
- Comments are separate from approval decisions and do not replace a decision.

## What To Check

- The approval detail page shows the correct request number, owner, location, required date, item, quantity, and justification.
- The requester is not you.
- After an intermediate approval, the request still shows `PENDING_APPROVAL` and the next approval step is current.
- After the final approval, the Purchase Request detail page shows `APPROVED`.
- Returned or rejected requests show remarks for the requester.
- Audit history contains the decision event.

## What Happens Next

- After an intermediate approval, the next eligible approver continues the configured route from `Approval Inbox`.
- After final approval, the request becomes available to the authorized Purchasing workflow. Approval does not create a Purchase Order automatically.
- After a return, the requester corrects the request and resubmits it.
- After a rejection, the approval route ends and the requester can review the decision and remarks.

## Related Articles

- Creating a Purchase Request
- Editing, cancelling, or resubmitting a Purchase Request
- Understanding Purchase Order statuses
- Why cannot I approve this request?
