# Using The Opening Inventory Cutover Pilot

**Audience / required role:** Authorized opening-inventory preparers, submitters, Operations reviewers, Accounting reviewers, activation or recovery requesters, and scoped viewers
**Applies to:** The exact company and inventory locations in a sealed Inventory Control Pilot configuration; local, default-off implementation only
**Related phase/module:** Phase I / Inventory / Opening Inventory Cutover
**Last verified against:** local opening-inventory workspace and service controls; `DEC-0263` (2026-07-31)

## Purpose

Use the dedicated Opening Inventory workspace to prepare, review, reconcile, and—only after an authorized release decision—request activation of an opening-stock cohort. The isolated executor, rather than the workspace user, creates any eligible immutable inventory-ledger movements. This is not a Stock Adjustment or a direct stock-balance edit.

## Before you begin

- This workflow is implemented locally and remains default-off. It is not enabled for UAT, staging, VPS deployment, production, or operational activation.
- Use your own active account with the required opening-inventory permission and the assigned company and location scope. Visibility of the workspace does not grant an action.
- Confirm that the selected location, sealed pilot configuration, reviewed `OPENING` stock-count attempt, and selected items are the intended ones.
- A new cohort may use only the latest sealed revision that passes the separate eligibility checks. A successor revision does not change an existing cohort: older cohorts remain pinned to their original revision and digest.
- Prepare a complete count for every selected item at each included location. A recorded zero quantity is still required evidence of count coverage, although it is omitted from the opening movements and derived balance rows.
- Have at least one clean, available controlled-evidence attachment and the valuation lines ready. Positive counted quantities require a unit cost; an explicit zero line uses zero cost.
- Confirm that separate eligible Operations and Accounting reviewers are available for every location batch. The requester and source-count custody actors cannot approve the cutover.
- Do not schedule a real activation until the named operational roster, recovery rehearsal, browser UAT, release gates, and Release Board authorization are complete.

## Navigation path

`Inventory → Opening Inventory`

The `Opening Inventory` navigation item appears only when you have the scoped view permission. The queue is limited to the active authorized location. Search, status filtering, and pagination are performed by the server; use them to find a batch without relying on a browser-only list. Draft cohorts outside your exact current location scope are not listed or disclosed.

## Steps

1. Verify the company, location, and scope shown in the queue header. Opening cohorts are company-level and are not brand-bound. Open `Inventory → Opening Inventory`.
2. Find an existing location batch with server-side search, status filters, and page controls, or—if you have preparation permission—select `Create opening cohort`, choose the latest eligible sealed pilot configuration offered by the server, and enter the effective cutover time. This creates a `DRAFT` cohort pinned to that revision and digest only; it does not freeze, post, or change stock.
3. Select the focused `Prepare Opening Inventory` task. Add clean controlled cohort evidence, select the reviewed `OPENING` count attempt, and enter the valuation unit cost for every positive-count line.
4. Use search or `Show incomplete lines` to resolve all positive-count lines without a cost. A zero-count source line is retained as coverage evidence and uses zero cost; it will not produce an opening movement or balance row.
5. Select evidence as needed across the evidence pages. Your selections and valuation entries are retained only in a browser-session draft for that exact user, cohort, and count attempt. They are cleared after a successful preparation and are not a substitute for submitting the immutable batch.
6. Select `Prepare immutable location batch`. The server rechecks complete coverage, controlled evidence, valuation, scope, and version before it creates immutable facts. Open the resulting location batch from the queue.
7. An authorized preparer selects `Seal prepared cohort` only after every required location batch is ready. An authorized submitter then selects `Submit for Operations & Accounting`. The server first rechecks the submitter’s authority for that exact location, then admits only the Opening Inventory Cutover approval route. The location batch becomes `PENDING APPROVAL`; approval does not post inventory.
8. Operations reviews first and Accounting reviews second from the approval workflow. Both reviews must be completed by eligible independent users before the batch can become `APPROVED`.
9. On the location-batch detail page, use the displayed current action only: request cohort freeze, request location staging validation, then request cohort activation after the cohort reaches `STAGED`. Fresh MFA, permission, live scope, segregation, record version, and status are checked by the server.
10. A request creates an immutable command; it does not itself perform the action. Check the `Activity` tab for the command lifecycle, completion time, or safe failure code. Do not submit a second request while the matching command is pending, claimed, or retrying.

If a batch detail link is unavailable or outside your current authorized scope, the workspace shows a generic unavailable message and a `Back to queue` action. It does not reveal whether a batch exists at another location.

## Expected result

- A draft or sealed cohort has no inventory impact.
- Operations and Accounting approvals are separate, location-scoped, and non-posting.
- Freeze prevents conflicting pilot inventory activity while the cutover is controlled.
- Staging records reconciliation only. It does not create stock.
- A successful authorized cohort activation posts all eligible location batches atomically to the immutable inventory ledger. Zero-count source lines are omitted from the resulting opening movements and derived balance rows.
- The detail `Activity` tab shows server-paged location activity and command lifecycle. Cohort-wide activity is shown only when the viewer currently has exact view scope for every cohort location.

## Important controls and warnings

- Do not use `Inventory → Adjustments` or an `OPENING_BALANCE` adjustment as an opening-stock cutover substitute.
- Do not edit inventory balances directly. Balances are derived from posted immutable inventory movements.
- A stock-count line, evidence file, valuation, scope, or approval cannot be changed in place after the relevant immutable step. Follow the controlled recovery path instead.
- A higher sealed pilot configuration revision can be eligible for a new cohort only. It does not migrate, rewrite, or repin an existing cohort.
- Before release, an authorized requester can request pre-release supersession only for a reconciled unreleased location batch. The old batch remains as reversed history and a successor cohort is created. No inventory reversal is posted because staging never created stock.
- After release, do not edit, delete, or reverse the opening batch. Correct a verified error only through a separately approved delta Stock Adjustment, with the required reason, evidence, approval, posting, and audit history.
- Every command is re-authorized by the server, uses the current record version, and requires the dedicated permission. A disabled action or absent action means it is not currently valid for your scope, role, status, or policy.
- Being able to view the batch, company, or another location does not authorize submission. If submission is denied, confirm your current submit permission and exact-location assignment with the system administrator; do not retry using another account or a different approval workflow.
- Cohort-shared evidence and cohort-wide activity are intentionally restricted unless you have live view scope for every location in that cohort. Your authorized location batch can remain visible even when the shared register is not.
- If the shared evidence register shows **Evidence temporarily unavailable**, retry the page or return to the queue and contact support if it persists. This is different from a scope restriction and from a valid empty register; the workspace deliberately hides filenames, checksums, counts, and register links until the evidence manifest can be safely resolved.
- If a command is pending, claimed, or retrying, wait for the executor outcome in `Activity`; do not create duplicate requests. If it fails, use the safe, actionable guidance shown by the workspace: complete the missing controlled prerequisite, refresh the batch if it changed, confirm your assigned scope and fresh MFA, or contact the release owner. Do not infer internal configuration or another location’s status from a denied or unavailable action.
- Queue and activity page controls are server-paged and sized for practical touch use. Use `Previous` and `Next` rather than expecting more activity to load automatically in the browser.
- This article is pilot training material, not a GO decision. Do not use the local implementation for live stock, staging/VPS activation, or production until the named release owners authorize it.

## What happens next

The pilot release owner coordinates the evidence pack, recovery rehearsal, UAT result, and named release decision. If the activation is not authorized, keep the cohort as controlled local evidence and continue using the approved operational workflow. If an error, safe command failure, or unexpected movement is found, stop the affected action and report the cohort reference, location, batch status, command lifecycle/status, and evidence reference to the system administrator and release owner; do not attempt a direct data correction.

## Related articles

- [Preparing And Sealing An Inventory Pilot Configuration](../administration/preparing-and-sealing-an-inventory-pilot-configuration.md)
- [Understanding The Inventory Control Pilot](../getting-started/understanding-the-inventory-control-pilot.md)
- [Running Stock Counts](running-stock-counts.md)
- [Understanding Stock Adjustments](understanding-stock-adjustments.md)
- [Viewing Inventory Movement History](viewing-inventory-ledger.md)
- [Viewing Current Stock Balances](viewing-stock-balances.md)
- [Why Can't I Approve This Request?](../troubleshooting/why-cant-i-approve-this-request.md)
