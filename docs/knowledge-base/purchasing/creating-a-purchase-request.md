# Creating A Purchase Request

**Audience / required role:** Branch, warehouse, or purchasing users with scoped Purchase Request access  
**Applies to:** Current assigned company, brand, and location  
**Related phase/module:** Phase I / Purchase Requests  
**Last verified against:** implemented Purchase Request draft, submit, return, cancel, emergency post-review, comments, audit, and approval controls

## Purpose

Use a Purchase Request when your location needs goods or services that must go through approval before purchasing. A Purchase Request starts the controlled purchasing workflow; it is not a Purchase Order and does not commit to a supplier.

Low stock must not automatically create a PO. If warehouse stock is available, use the transfer workflow first. Use a Purchase Request when external purchasing is needed or policy requires a formal request.

## Before You Start

- Your role must include Purchase Request create access for the current location.
- Your ERP header must show the correct company, brand, and location.
- Know the required date, urgency, justification, requested quantity, UOM, estimated unit cost, purpose, and item or line description.
- If the urgency is emergency, prepare the emergency reason, evidence reference such as an incident number/photo/approval note, and estimated amount. Emergency requests must have a positive estimate and must stay within the configured emergency cap.
- Use an active catalog item when one exists. Free-text lines require a UOM code.
- An approval rule must be configured before a draft can be submitted.
- Current recommended approval bands are shown in the workspace from Admin Settings: standard approval from PHP 10,000, high-value review from PHP 50,000, executive review from PHP 200,000, and 3 quotes from PHP 50,000 when quotation comparison is required. These values are policy context; assigned approval rules and scope still control the actual approval route.

## Navigation Path

`Purchase Requests`

## Steps

1. Open `Purchase Requests`.
2. In `Create Draft PR`, enter the required date.
3. Enter the urgency.
4. For emergency urgency, enter the emergency reason and evidence reference.
5. Enter the business justification.
6. Enter the line description.
7. Select a catalog item when available, or leave it as a free-text line.
8. Enter the requested quantity.
9. Enter the estimated unit cost when available. This is required for emergency requests because the system checks the configured emergency cap.
10. Select a catalog unit or enter a free-text UOM.
11. Enter the line purpose.
12. Select `Create Draft Purchase Request`.
13. Open the draft detail page.
14. Review the location, requester, item, quantity, required date, estimated value, justification, emergency support when applicable, and next action.
15. Select `Submit for Approval`.

## Expected Result

- The request is created in `DRAFT` status first.
- Submitting the draft moves it to `PENDING_APPROVAL`.
- The system creates an approval instance using the configured Purchase Request approval rule.
- Emergency requests show SLA status, captured support details, and estimated request value on the request and approval views.
- After an emergency request reaches an approved, rejected, or cancelled outcome, an authorized reviewer can complete the emergency post-review with an outcome, reason, and evidence reference.
- A direct-user assignee may receive one in-app approval notification. For a role-scoped first step, no personal notification is created; eligible approvers find the request in the live Approval Inbox. A notification is a convenience signal, not approval authority.
- Audit history records creation, submission, comments, cancellation, emergency post-review, and later approval actions.

## Status Guide

| Status | Meaning | Available requester action |
|---|---|---|
| `DRAFT` | The request has been saved but not submitted. | Submit for approval or cancel with reason. |
| `PENDING_APPROVAL` | The request is waiting for the assigned approval step. | Wait for approval action; add scoped comments when needed. |
| `APPROVED` | The request has passed approval and can move to quotation or purchasing steps handled by authorized users. | Review status and follow operational instructions. |
| `RETURNED` | An approver sent the request back for revision. | Reopen as draft, correct details, and resubmit. |
| `REJECTED` | The request was denied through the approval workflow. | Create a new request only if there is a valid corrected need. |
| `CANCELLED` | The requester cancelled a draft or returned request with a reason. | No further action on that request. |

## Important Controls And Warnings

- Purchase Requests are scoped by company, brand, and request location.
- Users can only act on requests within their authorized scope.
- A requester cannot approve their own request.
- Returned requests must be reopened as draft before resubmission.
- Draft or returned requests can be cancelled only by the requester, with a required reason.
- Emergency requests require an emergency reason, evidence reference, and positive estimated amount before the draft is created.
- Emergency requests above the configured emergency cap are blocked from the emergency path and must use the normal Purchase Request route.
- Emergency post-review is available only to authorized reviewers after the emergency request reaches an approved, rejected, or cancelled outcome. The requester cannot complete their own post-review.
- Emergency post-review records evidence and accountability only; it does not approve a PO, receive stock, post inventory, or replace the source Purchase Request status.
- An approved Purchase Request still does not receive stock or update inventory. Supplier quotation, PO, receiving, and inventory posting remain separate controlled workflows.
- Comments are operational discussion records and do not replace approval decisions or source documents.

## What To Check

- The detail page shows the correct company, brand, location, requester, required date, status, and next action.
- The item, quantity, UOM, estimate, purpose, and justification are correct before submission.
- For emergency requests, the reason and evidence reference are visible and match the operational support record.
- For completed emergency post-reviews, the detail page shows the review outcome, reason, evidence reference, and audit event.
- Approval actions and remarks appear in the approval section after reviewers act.
- Audit history includes the expected events.

## Related Articles

- Reviewing and approving a Purchase Request
- Understanding Purchase Order statuses
- Requesting stock when a branch item is low
- Understanding statuses, audit history, and attachments
