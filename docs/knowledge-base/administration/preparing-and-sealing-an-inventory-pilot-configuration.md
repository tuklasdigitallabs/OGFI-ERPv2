# Preparing And Sealing An Inventory Pilot Configuration

**Audience / required role:** Authorized System Administrators and Super Administrators with the applicable pilot-configuration permission and exact Company `MANAGE` scope

**Applies to:** One selected Company and its bounded Inventory Control Pilot endpoints, high-risk items, named actors, and approval-route readiness

**Related phase/module:** Phase I / Setup Center / Opening Inventory
**Last verified against:** local Inventory Pilot Setup Center, configuration service controls, Opening Inventory cohort selector, controlled production-authenticated browser contract source, and `DEC-0273` (2026-08-06); trusted-CA browser execution and local/UAT exercise remain gated by the validation listed below

## Purpose

Prepare a company-scoped Inventory Control Pilot configuration as a mutable draft, have a different authorized administrator seal it as an immutable revision, and review the eight seal-time readiness snapshots. This configuration process records pilot membership and readiness evidence only. It does not activate a pilot, submit or approve a transaction, create opening inventory, post an inventory movement, change a balance, transfer custody, or create a financial entry.

## Before you begin

- Do not use this procedure until the local service, visible Setup Center workspace, permission tests, PostgreSQL seal tests, and responsive UAT gates have passed. Publication of this guide is not a production, staging/VPS, UAT, or GO authorization.
- The viewer needs `View inventory pilot configuration`; the editor needs `Draft inventory pilot configuration`; and the sealer needs `Seal inventory pilot configuration`. Every action also requires a current live assignment with exact Company `MANAGE` scope. A role name, draft membership, or readiness record does not grant access.
- Assign separate people for draft authorship and sealing. The draft creator or current editor cannot seal that draft.
- The sealer must complete fresh MFA when sealing. MFA, permission, active assignment, effective dates, tenant, company, exact Company `MANAGE` scope, and editor/sealer separation are rechecked during the seal transaction.
- Confirm the exact pilot locations and their endpoint capabilities: `TRANSFER_SOURCE`, `TRANSFER_DESTINATION`, `COUNT_LOCATION`, and `OPENING_STOCK_LOCATION`. A location may carry only the explicitly selected capabilities.
- Confirm the explicit high-risk Item IDs. Categories, names, tags, report groups, or filtered lists do not add or remove items from the pilot catalog.
- Identify five distinct named Opening actors: preparer, submitter, Operations reviewer, Accounting reviewer, and command requester. The deployment-controlled opening executor is not selected or granted through this draft.
- Review the approval-route and named-actor readiness for all eight supported families before asking another administrator to seal.
- Treat the single `PurchaseRequest` readiness result as certification of the standard, non-emergency `DEFAULT` route only. Its recorded resolver is `purchase_request_approval_rule_v1`. A valid `PR_EMERGENCY` route may coexist, but this setup check does not certify that emergency route and provides no emergency-scenario UAT credit.

## Navigation path

`Inventory → Opening Inventory → Setup Center`

Use the selected Company context. Do not use `All Companies`, `All Brands`, or `All Locations` to prepare or seal a company-specific configuration.

## Steps

1. Open `Opening Inventory`, select `Setup Center`, and confirm the selected Company. Use the `Revision queue` to review existing drafts and sealed revisions before starting another draft.
2. Select `Create configuration draft`, enter the `Draft purpose`, and submit `Create configuration draft`. If the change follows an earlier sealed revision, open that revision and select `Create successor draft`; never edit the sealed revision.
3. On `Endpoints`, add each pilot inventory location and select its exact endpoint capabilities: `Transfer source`, `Transfer destination`, `Count location`, and/or `Opening-stock location`. Enter the `Endpoint change reason`, then select `Save endpoint selections`. Do not infer capabilities from the location type.
4. On `Items`, select the explicit high-risk items and review the selected Item IDs. Enter the `Catalog change reason`, then select `Save item selections`. Remove any unintended item before seal review. A category or search result is not pilot membership.
5. On `Named users`, select five distinct eligible people for `Opening preparer`, `Opening submitter`, `Operations reviewer`, `Accounting reviewer`, and `Command requester`. Enter the `Named-user change reason`, then select `Save named users`. Do not select the deployment executor.
6. On `Routes`, bind one eligible candidate approval rule for each displayed family. For `PurchaseRequest`, select the standard, non-emergency `DEFAULT` rule resolved through `purchase_request_approval_rule_v1`; do not select `PR_EMERGENCY` for this readiness record. Enter the `Route-binding change reason`, then select `Save route bindings`. These bindings are readiness inputs; they do not create or change approval authority.
7. Open `Readiness` and select `Validate readiness`. Confirm that the workspace evaluates exactly these eight families: `PurchaseRequest`, `QuotationRecommendation`, `PurchaseOrder`, `InventoryTransfer`, `StockCountAttemptReview`, `WastageReport`, `StockAdjustment`, and `OpeningInventoryCutover`.
8. Review every `Blocked` result. Correct the displayed issue in the authoritative source record, update the draft input when required, and run `Validate readiness` again. Do not treat `Ready at cutoff` as a permanent grant.
9. Give the draft review details to the separate sealer. Draft changes are audited and protected against overwriting a newer version.
10. As the separate authorized sealer, verify the Endpoints, Items, Named users, Routes, all eight `Ready at cutoff` results, predecessor, and Activity. Complete fresh MFA, select `Seal configuration revision`, enter the `Seal reason`, and submit `Seal immutable revision`.
11. Review the resulting `Sealed revision` number, `Immutable SHA-256 digest`, lineage, seal time, sealer, memberships, eight readiness snapshots, and `Activity`. If anything is wrong, stop and select `Create successor draft`; do not attempt to reopen or edit the sealed revision.

## Expected result

One atomic seal transaction creates either the complete immutable company revision—including its exact endpoint, item, participant, and eight readiness records—and a verified digest, or no sealed revision at all. The source draft becomes terminal after a successful seal. The sealed content, memberships, readiness snapshots, revision identity, and digest cannot be changed.

The seal has no activation, approval, opening-stock, posting, ledger, balance, custody, or financial effect.

## Important controls and warnings

- **Readiness evidence is not authority.** Each snapshot records what was reviewed at the seal-time cutoff. Every later visibility, submission, review, approval, command, activation, and posting action rechecks current live permission, scope, segregation, MFA, source state, and routing.
- **Standard Purchase Request coverage only.** `PurchaseRequest` readiness proves the non-emergency `DEFAULT` route selected by resolver `purchase_request_approval_rule_v1`. A coexisting valid `PR_EMERGENCY` route is not a blocker, but it remains uncertified and earns no emergency UAT credit.
- **Separate author and sealer.** The person recorded as the draft creator or current editor cannot seal that draft. Do not work around this control by sharing accounts or changing evidence labels.
- **Exact company boundary.** Dedicated permissions are additive to exact Company `MANAGE`; neither one replaces the other.
- **Explicit membership only.** Only the selected location-capability rows and exact Item IDs enter the sealed pilot configuration.
- **Immutable audit trail.** Draft edits, abandonment, seal attempts, outcomes, sealed revision identity, and digest remain auditable. An invalid or conflicting seal must not leave a partial revision.
- **Forward-only correction.** A sealed revision is never reopened. Create a successor draft and seal a higher revision.
- **Cohort pinning.** Only the latest eligible sealed revision may be offered to a newly created Opening Inventory cohort through the separately authorized selection path. Existing cohorts and other admitted records remain pinned to their original revision and digest; a successor does not migrate or rewrite them.
- **No release effect.** Sealing does not select a runtime configuration, activate any family, submit an approval, request an opening command, or post inventory or finance.

## What happens next

After a successful seal, authorized reviewers may inspect the immutable revision and its point-in-time readiness evidence. A separate, authorized runtime path determines whether the latest sealed revision is eligible for a new Opening Inventory cohort. All local implementation, database, security, responsive UI, and UAT gates must pass before users are told to exercise this workflow. Production use still requires its own release authorization.

## Related articles

- [Using The Opening Inventory Cutover Pilot](../warehouse-inventory/using-the-opening-inventory-cutover-pilot.md)
- [Managing User Access And Controlled Scopes](./managing-user-access-and-controlled-scopes.md)
- [Managing Privileged MFA Evidence](./managing-privileged-mfa-evidence.md)
- [Managing Release Readiness Gates](./managing-release-readiness-gates.md)
- [OGFI ERP Glossary](../GLOSSARY.md)
