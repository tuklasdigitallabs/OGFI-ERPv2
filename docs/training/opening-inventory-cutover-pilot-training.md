# Training Module — Opening Inventory Cutover Pilot

**Audience:** Assigned opening-inventory preparers and submitters, Operations and Accounting reviewers, activation/recovery requesters, System Administrators, UAT coordinators, and pilot release owners
**Duration:** 75 minutes
**Prerequisites:** Assigned local pilot scope and sample accounts; a sealed pilot configuration; reviewed `OPENING` count attempt(s); controlled evidence; valuation lines; separate Operations and Accounting reviewers; read access to the UAT evidence pack
**Related knowledge-base articles:** [Using The Opening Inventory Cutover Pilot](../knowledge-base/warehouse-inventory/using-the-opening-inventory-cutover-pilot.md); [Running Stock Counts](../knowledge-base/warehouse-inventory/running-stock-counts.md); [Understanding Stock Adjustments](../knowledge-base/warehouse-inventory/understanding-stock-adjustments.md)

## Training status

Local, default-off pilot training only. This module does not authorize staging/VPS use, production use, stock activation, or a release GO decision.

## Learning objectives

By the end of this module, participants can:

- Explain why an opening cutover is not a Stock Adjustment or a direct balance edit.
- Confirm the company and location scope, sealed configuration, reviewed count, complete selected-item coverage, zero lines, controlled evidence, and valuation before sealing.
- Demonstrate the separate Operations then Accounting approval path and explain why source-custody actors cannot approve.
- Explain the inventory impact of Freeze, Stage, and Activate.
- Use the queue, focused preparation task, and server-paged detail tabs without treating a browser draft or command request as a posted action.
- Identify the approved pre-release supersession and post-release delta-adjustment correction paths.
- Stop and escalate instead of attempting an unsafe live activation or data correction.

## Demonstration flow

1. Sign in with a sample scoped viewer and open `Inventory → Opening Inventory`. Use the server-side search, status filters, and page controls. Confirm that the queue shows only the authorized location, does not disclose draft cohorts at an adjacent location, and that visibility does not provide prepare, approval, activation, or recovery authority.
2. Switch to the assigned preparer. Create a draft cohort from the sealed pilot configuration and effective cutover time. Point out that the cohort is company-level rather than brand-bound and that draft creation has no stock impact.
3. Open the focused preparation task. Add controlled cohort evidence, choose the reviewed `OPENING` count attempt, and prepare a location batch. Use `Show incomplete lines` to identify every positive-count line missing a valuation unit cost.
4. Demonstrate that the preparation draft is retained only in the same browser session for the exact user, cohort, and count attempt. Select evidence on more than one server-paged evidence page, then explain that this temporary draft is cleared only after successful preparation.
5. Verify all selected-item source lines, including a recorded zero quantity. Explain that a zero line proves coverage but is omitted from the resulting opening movements and derived balance rows.
6. Show the source count, evidence digest, valuation digest, cutover digest, current location, and detail tabs. Seal only after all required location batches are prepared.
7. Switch to the submitter and submit the batch. Explain that the server rechecks the submitter’s exact-location authority before admitting only the Opening Inventory Cutover approval route. The batch becomes `PENDING APPROVAL` and still has no inventory movement or usable balance.
8. Switch to an eligible Operations reviewer, then an eligible Accounting reviewer. Demonstrate the ordered independent review and inspect the approval/audit history after final approval.
9. With an eligible command requester and fresh MFA in a designated local test scenario, demonstrate the requested order: cohort freeze, location staging, then cohort activation. Explain that the request creates an immutable command and the separate executor, not the requester or page, consumes eligible commands.
10. Open the `Activity` tab. Show lifecycle feedback and explain that a pending, claimed, or retrying matching command must not be submitted again. If a command fails, record the safe failure code and follow the next controlled action or escalate.
11. Open the `Evidence` and `Activity` tabs with a viewer whose live scope does not cover every cohort location. Confirm that the local batch remains visible while cohort-shared evidence and authority activity are restricted. Do not attempt to bypass this with another user’s account.
12. Use an unavailable or out-of-scope batch detail link. Confirm that the user sees only a generic unavailable message and `Back to queue`, with no indication that another location’s batch exists.
13. At each state, explain the effect: Freeze applies the cutover fence; Stage validates and reconciles only; Activate atomically posts eligible locations to the ledger.
14. Demonstrate the approved recovery explanation without using real records: before release, immutable logical supersession/replacement preserves history and posts no reversal; after release, a separately approved delta Stock Adjustment is the forward-only correction route.
15. Review the Admin Audit workspace and the inventory ledger. Emphasize that direct balance edits and an ordinary opening-balance adjustment are prohibited.

## Practice exercise

Use only designated local test data. In a two-location sample cohort, have the preparer identify the required count, evidence, valuation, and zero-line inputs for each location. Have the learner retain an evidence selection across an evidence page change, then submit only after all positive-count costs are complete. Have independent sample users trace the Operations and Accounting reviews. Each learner must state what prevents activation before all batches are reconciled, what an unresolved command prevents, and the single executor action that can create opening movements.

Do not execute an activation unless the facilitator has provided an approved local test scenario and the named owner is present. The correct response to an incomplete cohort, missing evidence, missing valuation, wrong scope, failed command, or unexpected balance is to stop and escalate—not to modify a balance, retry with another user's account, or create an ordinary adjustment.

## Common errors and recovery

- **Using an ordinary Stock Adjustment for opening stock:** Stop. Use the dedicated opening-inventory cohort workflow; Stock Adjustments are not a cutover substitute.
- **Treating a zero count as a missing line:** Record the explicit zero line. It proves selected-item coverage but does not create stock when activated.
- **Assuming the browser draft is a saved cutover:** It is temporary and scoped to one user, cohort, and count attempt. Prepare the batch successfully before treating its facts as immutable.
- **Expecting approval or staging to change stock:** Neither posts inventory. Only authorized cohort activation posts the opening movements.
- **Submission is denied despite seeing the batch:** Viewing is not submission authority. Confirm the exact-location assignment and opening-inventory submit permission; do not use another account or an adjacent approval workflow.
- **Submitting the same command again:** Stop. Review the command lifecycle in `Activity`; an unresolved matching request is already pending, claimed, or retrying.
- **Expecting to view all cohort evidence or activity from one location:** Cohort-shared information needs live view scope for every cohort location. Request the right scope rather than using another person’s account.
- **Trying to approve your own preparation or count:** Stop. The service enforces requester and source-custody segregation; arrange an eligible independent reviewer.
- **Discovering a pre-release error:** Request controlled logical supersession/replacement where available. Do not edit the unreleased batch or post a reversal.
- **Discovering a post-release error:** Preserve the opening batch and use the separately approved delta Stock Adjustment process. Do not delete, edit, or directly change a balance.
- **Seeing a disabled, absent, or denied command:** Confirm scope, current status, fresh MFA, policy readiness, and release authorization. Do not bypass the control.
- **Opening a detail link that is unavailable:** Use `Back to queue`, confirm the selected company/location context, and ask the system administrator for the appropriate scope if access is expected. The message deliberately does not confirm whether another location has a batch.
- **Seeing a safe command error:** Follow the actionable guidance shown by the workspace: resolve a listed prerequisite, refresh stale information, complete fresh MFA, or contact the release owner. Do not attempt to derive internal policy or another location’s state from the message.

## Completion check

- Participant can explain the no-stock-impact states (`DRAFT`, seal, approval, Freeze, and Stage) and the activation-only ledger effect.
- Participant can identify the required evidence, valuation, complete count coverage, explicit zero-line, scope, and independent-review controls.
- Participant can navigate the server-paged queue/detail tabs, distinguish the local temporary preparation draft from immutable facts, and interpret command lifecycle feedback.
- Participant can state the pre-release and post-release recovery paths without proposing an edit, direct balance change, or ordinary opening-balance adjustment.
- Participant can state that the feature is locally implemented and default-off, with no current VPS/staging/production activation or GO authorization.
- Participant can explain why adjacent-location drafts and unavailable batch details must not be disclosed, and can return safely to the queue.
