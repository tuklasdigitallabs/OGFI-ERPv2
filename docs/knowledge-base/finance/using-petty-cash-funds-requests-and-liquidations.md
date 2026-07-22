# Using Petty Cash Funds, Requests, And Liquidations

**Who can do this:** Users with the applicable Petty Cash view, create, submit, approve, replenish, liquidate, or liquidation-review permission and access to the selected company and location  
**Applies to:** Petty Cash funds and records in the user's authorized company and location scope  
**Related phase/module:** Phase 3 / Finance / Petty Cash  
**Last verified against:** Current Petty Cash page and service behavior on 2026-07-22

## Purpose

Use the Petty Cash workspace to view custody funds, create replenishment or disbursement requests, record approved offline cash movements, submit receipt-based liquidations, review variances, and preserve audit history.

This workspace is a controlled, non-posting foundation. It does not release a payment, change a bank account, settle Accounts Payable, post an official journal, reconcile a bank statement, or close an accounting period.

## Prerequisites

- Select the correct company and work only within a location assigned to you.
- You need `finance.petty_cash.view` to open the workspace. Actions require their matching `finance.petty_cash.create`, `finance.petty_cash.submit`, `finance.petty_cash.approve`, `finance.petty_cash.replenish`, `finance.petty_cash.liquidate`, or `finance.petty_cash.review_liquidation` permission. A draft non-supplier disbursement handoff separately requires `finance.disbursement.create`.
- A request can be created only against an active Petty Cash fund in your authorized location.
- A submitted request needs a configured Petty Cash approval route with at least one eligible approver.
- Prepare the required reason, evidence reference, receipt reference, or uploaded supporting file for the action you are performing.
- A user cannot approve their own Petty Cash request or liquidation. The user who approved a request also cannot record its offline cash movement.

## Navigation Path

`Finance` → `Petty Cash`

The workspace contains `Funds`, `Requests`, `Liquidations`, `New entry`, `Reports`, and `Controls` tabs.

## Set Up And Review A Fund

1. Open `Finance` → `Petty Cash` → `New entry`.
2. Select `Set Up Fund`.
3. Enter a unique fund code and fund name.
4. Select an authorized location and an active custodian assigned to that location.
5. Enter the opening balance, target balance, and low-balance alert. The alert cannot exceed the target balance.
6. Enter the required external evidence reference and optional notes.
7. Select `Create Petty Cash Fund`.
8. Open `Funds` to review the fund's custodian, location, balance, open requests, open liquidations, and supporting evidence.

### Expected Result

The system creates a company- and location-scoped fund in `DRAFT` status and records an audit event. If the opening balance is greater than zero, it also creates an opening custody-ledger marker. This marker does not create a payment, bank movement, or journal entry.

### Control Warning

The current Petty Cash page does not provide a fund-activation action. A newly created `DRAFT` fund cannot be selected for requests or liquidations until the product team completes or authorizes that activation path. Do not describe fund setup as operational activation.

## Create And Submit A Petty Cash Request

1. Open `Finance` → `Petty Cash` → `New entry`.
2. Select `Create Petty Cash Request`.
3. Select an active fund in your authorized location.
4. Choose `Disbursement` or `Replenishment`.
5. Enter a positive requested amount, purpose, and justification.
6. Add the optional due date and external evidence reference. Evidence is required before submission, even if it was not entered when the draft was created.
7. Select `Create Draft Petty Cash Request`.
8. Open `Requests`, locate the request, and select `Manage Actions`.
9. Select `Submit` when the request is complete.

### Expected Result

The request begins in `DRAFT`. A valid submission changes it to `AWAITING APPROVAL`, links the configured approval route, preserves the requested amount as the current approval amount, and records audit history. The first eligible approver may receive an in-app approval notification according to the configured route.

### Approval Controls And Warnings

- The request-approval form intentionally has no amount-override field. Approving a request carries its current approval amount unchanged.
- An explicit approval amount that differs from the current amount is blocked in both the current source-workspace route and the feature-disabled normalized route. Finance and Operations have not approved rules for reducing, increasing, or restoring a request amount.
- Request approval does not move cash. A separate authorized user records the offline movement after final approval.
- `Return` and `Reject` require a reason. `Cancel` also requires a reason and follows the applicable approval-control path for the request's current status.
- Normalized Approval Inbox routing is not production-active. Its immutable per-step amount-intent writer and proposal-version compare-and-set control remain pending, so no user guidance should claim that intermediate approval amount intent is currently recorded.

## Record Or Reverse An Approved Offline Cash Movement

1. Open `Requests` and find an `APPROVED` request.
2. Select `Manage Actions`.
3. Enter the cash movement amount, reason, required external evidence reference, and movement reference.
4. Select `Record Cash Movement`.
5. If the recorded movement must be corrected, an authorized reviewer can use `Void Movement` with a reason and evidence.
6. When the fulfilled request is complete, an authorized reviewer can use `Close` with a reason.

### Expected Result

- A replenishment increases the fund's internal custody balance; a disbursement decreases it.
- The recorded amount cannot exceed the approved request amount, and a disbursement cannot make the fund balance negative.
- The request becomes `FULFILLED OFFLINE` and receives a custody-ledger marker and audit event.
- A void preserves the original marker, adds a reversal marker, restores the custody balance, and changes the request to `VOIDED`.

### Control Warning

These are internal custody records for an offline movement. They do not release a payment, mutate a bank balance, settle Accounts Payable, or post an official journal. `Create Draft Disbursement` creates only a draft non-supplier disbursement handoff; it does not release funds or change the Petty Cash ledger.

## Submit A Liquidation

1. Open `Finance` → `Petty Cash` → `Liquidations`.
2. Select `Submit Liquidation`.
3. Select an active fund and enter the cycle start and cycle end dates.
4. Enter the spend date and category. The cycle end cannot be earlier than the cycle start.
5. Optionally select a supplier and enter the required external evidence reference.
6. Enter at least one liquidation line with a description and positive amount. The page supports up to five lines; blank optional rows are ignored.
7. Enter tax and receipt references where applicable.
8. Select `Submit Petty Cash Liquidation`.

### Expected Result

The system creates the liquidation directly in `SUBMITTED` status, calculates the claimed amount from its lines, and records its evidence reference and audit history. At least one line is required, and every line must be covered by its own receipt/evidence reference or the liquidation-level evidence reference.

## Review, Close, Or Reverse A Liquidation

1. Open `Liquidations` and locate a `SUBMITTED` or `UNDER REVIEW` liquidation.
2. Review its fund, claimed amount, receipt lines, evidence, and scope.
3. Select `Manage Actions`.
4. To approve, enter the approved liquidation amount or leave it blank to use the claimed amount. The approved amount cannot exceed the claim.
5. If there is a shortage or overage, select only one variance type, enter its amount, and provide the required reason and evidence reference.
6. Select `Approve`, `Return`, or `Reject`. Return and rejection require a reason.
7. An approved liquidation can be `Closed` with a reason and evidence after its settlement marker exists.
8. An approved or closed liquidation can be `Reversed` with a reason and evidence. Reversal preserves the original settlement marker and adds an audit-linked reversal marker.

### Expected Result

Approval stores the liquidation's approved amount separately from the request's approval amount and records any shortage or overage. It creates a zero-direction liquidation settlement marker without changing the fund balance. Closing or reversing preserves the decision and audit history.

### Control Warning

The `Approved amount` shown in liquidation review applies only to the liquidation claim. It is not the blocked request-approval amount override and does not authorize a payment, bank movement, AP settlement, or official journal.

## Evidence And Audit Controls

- `External evidence reference` is text context such as a voucher or receipt number. It is not automatically verified evidence.
- Where `Add Fund Evidence`, `Add Request Evidence`, or `Add Liquidation Evidence` is available, uploaded files remain subject to controlled-evidence access and safety checks.
- Controlled finance evidence qualification and the action-to-evidence sufficiency rules are not yet approved for production. A text reference or uploaded file must not be represented as satisfying a high-risk finance gate until that policy and its release evidence are complete.
- Fund setup, request creation and decisions, custody movements, liquidation decisions, closure, reversal, and evidence actions preserve timestamped audit history. Corrections use return, cancellation, void, or reversal actions; records are not hard-deleted.

## What Happens Next

- A returned request can currently be resubmitted, but the Petty Cash page does not expose an edit action for changing its request fields. A returned liquidation likewise has no in-place correction and resubmission action on the current page. These visible correction paths remain release gaps; do not instruct users to recreate or duplicate a controlled record as a workaround.
- Approved requests still require a separate authorized offline custody movement or draft disbursement handoff.
- Approved liquidations can be closed after review or reversed through the controlled correction path.
- Reports show fund balances, open requests, open liquidations, evidence readiness, and exception cues. They do not represent official books or bank reconciliation.
- Production activation of normalized routing, immutable step-intent writing, proposal-version compare-and-set, controlled finance evidence qualification, and related payment, bank, and journal effects remains pending.

## Related Articles

- [Using Cash Advances And Liquidations](./using-cash-advances-and-liquidations.md)
- [Reviewing Bank And Cash Readiness](./reviewing-bank-and-cash-readiness.md)
- [Understanding Statuses, Audit History, And Attachments](../getting-started/understanding-statuses-audit-history-and-attachments.md)
- [Why Can't I Approve This Request?](../troubleshooting/why-cant-i-approve-this-request.md)
- [How To Attach Supporting Documents Or Photo Evidence](../troubleshooting/how-to-attach-supporting-documents-or-photo-evidence.md)
