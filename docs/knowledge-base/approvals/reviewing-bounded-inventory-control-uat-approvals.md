# Reviewing Bounded Inventory Control UAT Approvals

**Who can do this:** An approver who is currently assigned to the active approval step and still has the required permission, company/location scope, segregation-of-duties eligibility, and—where required—current MFA assurance

**Audience:** Purchasing approvers, Operations Managers, General Managers, authorized inventory approvers, and UAT coordinators

**Availability:** Implemented locally for controlled testing; not yet admitted to UAT, staging/VPS, or production
**Last verified against:** local bounded-worklist implementation and `DEC-0270` reviewed-state controls (August 6, 2026)

## Purpose

Review one complete, current approval snapshot and record an allowed decision without activating the global Approval Inbox. This partial Inventory Control UAT worklist covers only:

1. Purchase Requests
2. Quotation Recommendations
3. Purchase Orders
4. Inventory Transfers
5. Stock Count Attempt Reviews
6. Wastage Reports
7. Stock Adjustments

It is not a report of every pending approval in OGFI ERP.

## Prerequisites

- Use only a local environment that a UAT/release owner has configured for the bounded Inventory Control worklist. Do not use this guide as authority to enable a feature flag.
- Sign in with your own named account. Shared accounts are not permitted.
- Select the correct Company and operational scope.
- Confirm that your active role assignment carries the permission required by the displayed approval step.
- Complete MFA when the ERP requires fresh assurance for a sensitive inventory decision.
- Review the source record and supporting evidence. A notification, role name, or visible row does not by itself authorize a decision.
- Do not begin formal UAT until trusted-TLS desktop/tablet/mobile browser evidence has passed. Seven-family database acceptance passes 7/7 and Purchase Request/Quotation Recommendation review-writer concurrency passes 5/5, but the current build remains NO-GO for formal UAT.

## Navigation path

`Approvals → Inventory Control UAT Approval Worklist`

The page must identify itself as a partial seven-family UAT worklist. If it shows `Approval Inbox unavailable`, do not look for a legacy bypass or assume that no approvals are pending.

## Steps

1. Open `Approvals` and confirm the heading `Inventory Control UAT Approval Worklist`.
2. Review `Inbox` or `Due soon`. Counts are scoped operational projections for your currently eligible work; they are not global approval-ledger totals.
3. Select the required record. Confirm its family, public reference, status, owner, Company, Brand where applicable, Location, current step, current approver, required permission, activation time, approval due time, and source dates.
4. Review every displayed material fact before deciding. Depending on the family, this includes complete lines and UOMs, amounts, supplier quotations and comparison terms, source/destination, quantities and costs, reason and evidence information, or stock-count attempt, blind-count, freeze, counter, cutoff, revision, and recount-lineage facts.
5. Review warning or risk flags. Do not continue if the displayed Company, Location, source facts, assignment, evidence, or route is not the record you intended to decide.
6. Enter `Decision remarks`. Remarks are required for `Return` and `Reject`; they are optional for `Approve` unless another displayed policy requires them.
7. If the composer shows `Supplemental decision evidence reference`, add it only as decision-support context. It does not replace, upload, or verify evidence on the source record.
8. Select one available outcome:
   - `Approve`, `Return`, or `Reject` for a family whose current workflow permits that outcome.
   - `Approve` only for a Stock Count Attempt Review. Use the authoritative count/recount workflow for any correction or follow-up; do not treat approval as a stock correction.
9. Wait for the success feedback and return to the worklist. Confirm that the decided item no longer appears as your active step or has moved to the next authorized approver as applicable.

## Expected result

The ERP records one authorized decision against the exact current approval step and shows success feedback. Approval may advance the approval route or apply only the family-specific final source-state effect already defined for that workflow.

The approval worklist itself does not create an unintended inventory movement, change a stock balance, transfer custody, receive goods, post wastage, post a stock adjustment, create a payment, or create a journal entry. Inventory changes still require their separately authorized posting actions.

## Controls and warnings

- **Fifteen-minute reviewed state:** Opening the detail creates a signed reviewed-state token valid for 15 minutes. It is bound to your tenant, Company, user, live session, approval, active step, routing assignment, required permission, source revision, and complete review snapshot. It is not an extension of your MFA window.
- **Live authorization is rechecked:** The ERP rechecks your live account, session, permission, assignment, scope, segregation-of-duties eligibility, current step, and required MFA when you submit. Page visibility is not authority.
- **Stale review fails closed:** If the source, lines, evidence, route, step, assignment, or reviewed state changes—or the 15-minute token expires—the decision is not applied. All decision buttons are disabled and `Reload current review` is shown. Your typed remarks and supplemental evidence reference remain on the page so you can compare and retry safely after reloading.
- **Concurrent comments or evidence:** If a comment or evidence change races a pending decision, the ERP does not silently approve the earlier view. One operation completes safely and the conflicting decision must reload/retry against the new review state. Do not repeatedly click a pending action.
- **Segregation of duties:** Self-approval and family-specific prohibited-actor rules remain enforced. Another eligible approver must act when you are prohibited.
- **Stock Count review is approve-only:** Approval marks the admitted review outcome; it does not create a variance adjustment or inventory movement. Corrections remain separate controlled workflows.
- **No partial queue:** If the server cannot prove every eligible source projection needed for the bounded queue, it shows the worklist as unavailable and displays no partial rows or totals.
- **Audit history:** The decision and verified reviewed-state evidence are recorded in the controlled audit transaction. The opaque review token is not stored. Audit access remains subject to its own permission and scope.
- **No global-routing claim:** Finance, workforce, projects, deferred approval families, and the global normalized Approval Inbox remain outside this procedure.

## What happens next

- An intermediate `Approve` activates the next eligible approval step; the source remains pending until its final required approval.
- A final `Approve` applies only the documented source-state effect for that family. Any inventory posting remains a separate authorized action.
- `Return` sends a supported record back for correction under its family workflow.
- `Reject` records the supported terminal rejection outcome while preserving audit history.
- A stale or denied attempt makes no approval, inventory, balance, custody, commitment, notification, or source-state change beyond safe denial handling. Reload and review the current record, or ask an administrator to resolve a permission, scope, assignment, MFA, routing, or source-data problem.

## Related articles

- [Approvals knowledge base](./README.md)
- [Why Can't I Approve This Request?](../troubleshooting/why-cant-i-approve-this-request.md)
- [Understanding Statuses, Audit History, And Attachments](../getting-started/understanding-statuses-audit-history-and-attachments.md)
- [Managing Privileged MFA Evidence](../administration/managing-privileged-mfa-evidence.md)
- [OGFI ERP Glossary](../GLOSSARY.md)
