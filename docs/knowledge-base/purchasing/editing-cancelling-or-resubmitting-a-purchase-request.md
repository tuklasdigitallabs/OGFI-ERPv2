# Editing, Cancelling, Or Resubmitting A Purchase Request

**Audience / required role:** Requesters and authorized users with scoped Purchase Request access  
**Applies to:** Current assigned company, brand, and location  
**Related phase/module:** Phase I / Purchase Requests  
**Last verified against:** implemented Purchase Request return, reopen, cancel, comments, audit, and approval controls

## Purpose

Use this article when a Purchase Request needs correction, cancellation, or resubmission after an approver returns it.

The current workflow does not allow direct editing of a submitted request. Corrections happen through a controlled return-for-revision path: the approver returns the request, the requester reopens it as draft, then submits it again after correction.

## Before You Start

- You must be the requester for requester-only actions such as reopening or cancelling the request.
- Your role must include Purchase Request submit access.
- The request must be in a status that allows the action.
- Review approver remarks before resubmitting a returned request.

## Navigation Path

`Purchase Requests -> View`

## Reopen And Resubmit A Returned Request

1. Open `Purchase Requests`.
2. Find the request with `RETURNED` status.
3. Select `View`.
4. Read the approval remarks and comments.
5. Select `Reopen as Draft`.
6. Correct the request details according to the returned remarks.
7. Select `Submit for Approval` when the request is ready again.

## Cancel A Draft Or Returned Request

1. Open the request detail page.
2. Confirm the request status is `DRAFT` or `RETURNED`.
3. Enter a cancellation reason.
4. Select `Cancel Purchase Request`.

## Expected Result

- Reopening a returned request moves it back to `DRAFT`.
- Resubmitting the draft moves it to `PENDING_APPROVAL` and creates a new approval path from the configured rule.
- Cancelling a draft or returned request moves it to `CANCELLED`.
- Reopen, resubmit, comments, and cancellation actions are written to audit history.

## Important Controls And Warnings

- Only `RETURNED` requests can be reopened as draft.
- Only `DRAFT` or `RETURNED` requests can be cancelled from the requester workflow.
- Cancellation requires a reason.
- The requester-only actions are blocked for users who did not create the request.
- A `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, or `CANCELLED` request cannot be cancelled from this requester action.
- Comments help preserve context but do not approve, reject, or cancel a request.

## What To Check

- The detail page shows the correct status before you act.
- Returned requests include approval remarks that explain what needs correction.
- Cancellation reason appears in the request history.
- The approval section updates after resubmission.

## Related Articles

- Creating a Purchase Request
- Reviewing and approving a Purchase Request
- Understanding statuses, audit history, and attachments
