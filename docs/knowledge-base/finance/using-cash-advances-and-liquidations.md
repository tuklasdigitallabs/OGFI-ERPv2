# Using Cash Advances And Liquidations

**Audience / required role:** Finance users, authorized requesters, approvers, and liquidation reviewers with scoped cash-advance access  
**Applies to:** Current company, brand, location, department, requester, beneficiary, and custodian scope  
**Related phase/module:** Phase 3 / Cash Advances  
**Last verified against:** implemented cash-advance request, approval, offline issue marker, liquidation, closure, reversal, evidence metadata, report preview, and non-posting controls

## Purpose

Use Cash Advances to control advances issued to employees or branch custodians, track outstanding exposure, collect liquidation details, and preserve audit evidence. The current workflow is a controlled foundation. It does not create supplier AP payments, payment releases, bank movements, official journals, or supplier settlement.

## Prerequisites

- Your role must include the cash-advance permission needed for the action you want to perform.
- Your ERP header must show the correct company, brand, and location.
- An approval route must exist before a submitted advance can be approved.
- Evidence references or evidence metadata links must be prepared for issue, liquidation, reversal, or closure actions when required.
- Employee/custodian payment handoff remains deferred by `III-009` / `P3-BLOCK-001`. Do not route employee or custodian advances through supplier-only AP payment requests.

## Navigation Path

`Finance` → `Cash Advances`

## Steps

1. Open `Finance` → `Cash Advances`.
2. Review the guardrail banner. It confirms the workspace stops before payment, bank, AP settlement, and journal posting.
3. Find the advance in `Cash Advance Actions` or the report preview.
4. Check the payee, status, requested amount, issued amount, liquidated amount, outstanding amount, due date, and evidence state.
5. For a draft or returned advance, submit it for approval when the request is complete.
6. As an approver, approve, return, or reject only advances assigned to your role and scope. You cannot approve your own controlled money request.
7. For an approved advance, record the offline issue marker with amount, reference, reason, and evidence reference.
8. Submit liquidation lines after the advance has been issued. Enter each receipt or liquidation line separately with amount and evidence support.
9. As a liquidation reviewer, approve, return, reject, cancel, mark closure ready, reverse, or close only when the status allows the action.
10. Where the controlled-evidence panel is available, upload supporting documents and wait for `Available` before downloading them. Keep any separately required evidence reference accurate.
11. Use the report preview or export to review outstanding exposure and evidence readiness.

## Expected Result

- The advance shows the correct status, payee, location, requested amount, issued amount, liquidated amount, and outstanding balance.
- Approval actions create approval and audit history.
- Offline issue and liquidation actions create cash-advance movement markers only.
- Liquidation approval updates cash-advance exposure and liquidation status.
- Closure and reversal actions preserve history and require reason/evidence where configured.
- Linked expense or payment records remain trace references only.

## Important Controls And Warnings

- Cash advances are scoped by company, brand, location, requester, beneficiary, and custodian context.
- Users cannot act outside assigned scope.
- Requesters cannot approve their own controlled money request.
- Supported cash-advance and liquidation records now accept controlled binary evidence in the current build. Files remain unavailable until safety checks pass; hosted production activation and owner signoff remain gated.
- Current cash-advance actions do not create payment releases, supplier AP requests, bank reconciliation entries, official journals, or supplier-ledger settlement.
- Employee and custodian payment handoff is waiting for the open `III-009` architecture decision. Treating employees as suppliers only to reuse AP payment requests is not approved.
- Reversals and voids preserve audit history. Do not ask an administrator to delete records to “clean up” mistakes.

## Related Records Or Next Action

- Use approval inbox records to review submitted advances.
- Use controlled evidence for receipts, issue proof, liquidation packs, or closure support where the panel is available.
- Use finance reports or exports for outstanding exposure review.
- Use Release Readiness UAT evidence when proving Phase 3 controlled-foundation scenarios.

## Related Articles

- Managing Release Readiness Gates
- How to export a report
- Understanding statuses, audit history, and attachments
- Why can't I approve this request?
