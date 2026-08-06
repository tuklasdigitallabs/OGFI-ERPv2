# OGFI ERP Release Note — Bounded Inventory Control UAT Approval Worklist

**Release date:** August 6, 2026

**Audience:** Purchasing and inventory approvers, Operations Managers, General Managers, UAT coordinators, System Administrators, and release owners
**Availability:** Local implementation only; formal UAT, staging/VPS, and production remain NO-GO

## What changed

- The local Approvals workspace can present a partial, server-owned worklist for exactly seven Inventory Control UAT families: Purchase Requests, Quotation Recommendations, Purchase Orders, Inventory Transfers, Stock Count Attempt Reviews, Wastage Reports, and Stock Adjustments.
- A selected record shows its complete material review facts, current routing assignment, required permission, scope, timing, risks, lines, values, and evidence context appropriate to the family.
- The browser receives a signed reviewed-state token that expires after 15 minutes and is bound to the current user, session, Company, approval step, routing assignment, source revision, and complete review digest.
- Supported families expose only their allowed `Approve`, `Return`, and `Reject` outcomes. Stock Count Attempt Review is approve-only.
- A changed or expired review disables all decisions and requires `Reload current review`; typed remarks and supplemental evidence reference are preserved for comparison and safe retry.
- Action time rechecks live permission, assignment, scope, segregation of duties, current step, source state, and required MFA. Successful decisions return to the worklist with success feedback.
- Concurrent changes to protected comments or evidence cannot silently pass under an earlier review. The conflicting operation is resolved safely and the decision must reload/retry against current facts.

## Operational effect

This worklist records only the decision and the family-specific source-state effect permitted by the existing workflow. It does not itself receive goods, dispatch or receive a transfer, post wastage, post a Stock Adjustment, correct a count variance, create an inventory movement, update a balance, create a payment, or post a journal entry.

## What users need to know

- Treat the visible list as currently eligible work for the bounded seven-family scope, not as every approval in OGFI ERP.
- Review all displayed facts before deciding. `Return` and `Reject` require remarks.
- Complete MFA when prompted for a sensitive inventory decision.
- If the review is stale, use `Reload current review` and compare the new facts before trying again.
- Do not look for a legacy bypass when the worklist is unavailable. No partial rows or totals are shown when queue integrity cannot be proven.

## Release limits and remaining evidence

- Global normalized approval routing remains disabled. This change does not activate the global Approval Inbox or admit finance, workforce, projects, or any unlisted family.
- Formal UAT remains blocked until trusted-TLS responsive browser evidence is recorded for desktop, tablet, and mobile. Seven-family acceptance passes 7/7 and Purchase Request/Quotation Recommendation review-writer concurrency passes 5/5 in disposable PostgreSQL, with verified teardown.
- Production and staging/VPS activation require separate release authorization after all applicable security, recovery, deployment, and UAT gates pass.
- Requested Code Spark and GPT-5.4-mini subagent models were unavailable for this documentation handoff. The closest permitted GPT-5.6 writer fallback was used without relaxing the documentation or release gates.

## Learn more

- [Reviewing Bounded Inventory Control UAT Approvals](../knowledge-base/approvals/reviewing-bounded-inventory-control-uat-approvals.md)
- [Approvals knowledge base](../knowledge-base/approvals/README.md)
- [OGFI ERP Glossary](../knowledge-base/GLOSSARY.md)

## Support

Record stale-review, missing-action, scope, permission, assignment, MFA, queue-unavailable, unexpected source-state, or unexpected inventory-effect issues in the controlled UAT evidence pack. Do not bypass a denied action or continue formal UAT until the release owner clears the remaining evidence gates.
