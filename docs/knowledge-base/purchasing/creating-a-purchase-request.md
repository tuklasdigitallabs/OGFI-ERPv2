# Creating A Purchase Request

**Audience / required role:** Branch, warehouse, or purchasing users with scoped Purchase Request access  
**Applies to:** Current assigned company, brand, and location  
**Related phase/module:** Phase I / Purchase Requests  
**Last verified against:** implemented Purchase Request draft, submit, return, cancel, comments, audit, and approval controls

## Purpose

Use a Purchase Request when your location needs goods or services that must go through approval before purchasing. A Purchase Request starts the controlled purchasing workflow; it is not a Purchase Order and does not commit to a supplier.

Low stock must not automatically create a PO. If warehouse stock is available, use the transfer workflow first. Use a Purchase Request when external purchasing is needed or policy requires a formal request.

## Before You Start

- Your role must include Purchase Request create access for the current location.
- Your ERP header must show the correct company, brand, and location.
- Know the required date, urgency, justification, requested quantity, UOM, purpose, and item or line description.
- Use an active catalog item when one exists. Free-text lines require a UOM code.
- An approval rule must be configured before a draft can be submitted.

## Navigation Path

`Purchase Requests`

## Steps

1. Open `Purchase Requests`.
2. In `Create Draft PR`, enter the required date.
3. Enter the urgency.
4. Enter the business justification.
5. Enter the line description.
6. Select a catalog item when available, or leave it as a free-text line.
7. Enter the requested quantity.
8. Select a catalog unit or enter a free-text UOM.
9. Enter the line purpose.
10. Select `Create Draft Purchase Request`.
11. Open the draft detail page.
12. Review the location, requester, item, quantity, required date, justification, and next action.
13. Select `Submit for Approval`.

## Expected Result

- The request is created in `DRAFT` status first.
- Submitting the draft moves it to `PENDING_APPROVAL`.
- The system creates an approval instance using the configured Purchase Request approval rule.
- Assigned approvers receive approval notifications.
- Audit history records creation, submission, comments, cancellation, and later approval actions.

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
- An approved Purchase Request still does not receive stock or update inventory. Supplier quotation, PO, receiving, and inventory posting remain separate controlled workflows.
- Comments are operational discussion records and do not replace approval decisions or source documents.

## What To Check

- The detail page shows the correct company, brand, location, requester, required date, status, and next action.
- The item, quantity, UOM, purpose, and justification are correct before submission.
- Approval actions and remarks appear in the approval section after reviewers act.
- Audit history includes the expected events.

## Related Articles

- Reviewing and approving a Purchase Request
- Understanding Purchase Order statuses
- Requesting stock when a branch item is low
- Understanding statuses, audit history, and attachments
