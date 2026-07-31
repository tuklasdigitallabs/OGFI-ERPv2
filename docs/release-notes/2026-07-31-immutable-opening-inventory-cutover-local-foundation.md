# OGFI ERP Release Note — Immutable Opening Inventory Cutover Local Foundation

**Release date:** July 31, 2026
**Audience:** Inventory Pilot owners, Branch Managers, Warehouse and Storekeeper staff, Operations and Accounting reviewers, System Administrators, UAT coordinators, and release owners
**Affected locations / roles:** None in UAT, staging, VPS, or production. Local, default-off implementation only.

## What changed

- The local build includes a dedicated `Inventory → Opening Inventory` workspace: a server-paged location-batch queue, a focused preparation task, and a detail view with Summary, Immutable Lines, Evidence, Approvals, and Activity tabs. It is separate from Stock Adjustments.
- A prepared batch is bound to a reviewed `OPENING` count attempt, complete selected-item coverage including recorded zero quantities, controlled evidence, and valuation facts. Positive counted quantities require a unit cost. Zero-count source lines prove coverage but are omitted from opening movements and derived balance rows.
- Preparation supports a temporary browser-session draft scoped to the exact user, cohort, and count attempt. It retains valuation and evidence selections across evidence pages until successful preparation; it is not an immutable record or a substitute for the server checks that create a batch.
- A location batch follows ordered Operations then Accounting approval. Submission now rechecks the submitter’s authority for the exact location before admitting only the dedicated Opening Inventory Cutover approval route. These approvals are independent and non-posting; source-custody actors and the requester cannot approve the controlled cutover.
- The local command path separates a requester from the executor and requires fresh MFA for Freeze, Stage, Activate, and pre-release recovery requests. Freeze applies the pilot-wide fence; Stage validates/reconciles only; cohort-wide activation is the only step that posts opening movements and derived balances. A request creates an immutable command, and its pending, claimed, retrying, completed, or safe failure outcome is shown in the server-paged Activity tab; duplicate unresolved requests are blocked.
- Cohort-shared evidence and cohort-wide authority activity are shown only to a viewer with current exact view scope for every cohort location. A user can still view their authorized location batch when the shared information is restricted.
- The queue does not disclose draft cohorts outside the user’s exact active location scope. An unavailable or out-of-scope detail link gives a generic message and a safe return to the queue rather than confirming another location’s record.
- Queue and Activity pagination are server-paged; navigation controls meet the shared touch-target baseline. Safe command guidance tells the user to resolve a prerequisite, refresh stale information, complete fresh MFA, or contact the release owner without exposing internal details.
- Before release, controlled logical supersession/replacement preserves the unreleased batch history and creates no inventory reversal. After release, a verified correction must use a separately approved delta Stock Adjustment; the opening batch is never edited or deleted.

## What you need to do

- Do not use this local foundation for live stock, staging/VPS activation, UAT activation, or production activation.
- Do not use an ordinary `OPENING_BALANCE` or other Stock Adjustment as an opening-stock cutover substitute, and never edit a balance directly.
- Use the pilot training material only with designated local test data and the assigned role/scope. Escalate missing scope, approval, evidence, valuation, reconciliation, command, or release controls to the pilot release owner.

## Important notes

- This is not a deployment announcement, staging authorization, production release, UAT authorization, or GO decision.
- All release gates remain blocking: real sealed cohort, named operational roster and independent approvers/executor, recovery rehearsal, browser UAT, evidence pack, release-board authorization, deployment/rollback controls, and production-readiness validation.
- Visibility of the workspace or a permission does not grant a valid action. Server-side status, scope, policy, segregation, version, MFA, and command checks continue to apply.
- This local foundation still has production blockers, including the remaining raw runtime ordinary-inventory-movement hardening, a real sealed cohort and named independent roster, recovery rehearsal, browser UAT, evidence pack, release-board authorization, and deployment/rollback validation.
- Audit history is authoritative for preparation, evidence/valuation, approval, command, executor outcome, reconciliation, and release. Direct changes to balances are prohibited.

## Local verification checkpoint

- The disposable PostgreSQL opening-cutover suite passed `12/12` after all `146` migrations were applied.
- The focused merged UI/service verification passed `42/42`.
- The authorization-surface manifest suite passed `21/21`.
- Web typechecking passed with a 4 GB Node heap setting.
- Full procurement/inventory authorization, lint, full suite, production build, and authenticated browser UAT remain pending. These passing focused checks do not change the production `NO-GO` posture.

## Learn more

- [Using The Opening Inventory Cutover Pilot](../knowledge-base/warehouse-inventory/using-the-opening-inventory-cutover-pilot.md)
- [Opening Inventory Cutover Pilot Training](../training/opening-inventory-cutover-pilot-training.md)
- [Understanding The Inventory Control Pilot](../knowledge-base/getting-started/understanding-the-inventory-control-pilot.md)

## Support

Use the approved pilot support and defect route. Include the cohort reference, location, batch status, action or command attempted, and evidence reference. Do not include passwords, MFA codes, or confidential attachment contents.
