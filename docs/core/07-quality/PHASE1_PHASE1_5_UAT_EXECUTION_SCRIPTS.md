# Phase I And Phase 1.5 UAT Execution Scripts

**Status:** Script pack; execution pending  
**Created:** 30 June 2026  
**Evidence record:** `PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md`

## How To Use This Script Pack

For each scenario:

1. Confirm tester, role, location, browser/device, and test data.
2. Execute the steps in staging or pilot UAT.
3. Capture screenshots, exported CSVs, audit records, source-record IDs, or evidence references.
4. Update the Scenario Execution Register in the evidence pack with tester, environment, browser/device, evidence reference, result, defect/waiver, and signoff.
5. Record result, defect ID, waiver, or retest result in the matching scenario row and defect/waiver registers.
6. Do not mark a scenario `Pass` if source-record status, permission denial, audit, or ledger behavior cannot be proven.

## Phase I Scripts

### P1-SETUP — Pilot Master-Data Readiness

1. Run `pnpm release:pilot-readiness-preflight` to confirm the local shell has the required database URL and PostgreSQL client tooling. A WARN result is setup evidence only; it does not replace the DB-backed readiness check.
2. Run `DATABASE_URL=<pilot-or-staging-url> pnpm release:pilot-readiness` and attach the generated `release-evidence/pilot-readiness/` artifact to the UAT evidence pack. For release rehearsal or final GO / NO-GO, rerun with `DATABASE_URL=<pilot-or-staging-url> PILOT_REQUIRE_RELEASE_GATES_READY=true pnpm release:pilot-readiness` so the artifact also proves accepted release readiness gates.
3. Confirm active pilot company, brand, branch, warehouse, inventory locations, department/cost center, and project scope.
4. Confirm requester, approver, purchasing, receiver, warehouse, inventory, project, reporting, and administrator test users have expected role and scope assignments.
5. Confirm active approval policies route PR, quotation recommendation, PO, transfer/count review, wastage, and adjustment actions to the intended users.
6. Confirm suppliers, supplier-item links, item codes, categories, base UOMs, conversions, lot/expiry/evidence settings, and opening test inventory are loaded.
7. Confirm sample records and export permissions exist for permitted and denied dashboard/report/export tests.
8. Capture setup screenshots/exports, record IDs, readiness-check output, and any data exceptions before running transaction UAT.

### P1-UAT-001 — PR To Approval To PO

1. Sign in as branch requester and select pilot branch.
2. Create a Purchase Request with item, quantity, required date, urgency, purpose, and justification.
3. Submit for approval.
4. Sign in as assigned approver and approve from `Approval Inbox`.
5. Sign in as purchasing user and create or verify downstream quote/PO lineage where available.
6. Capture PR status history, approval instance, PO/source lineage, and audit events.

### P1-UAT-002 — Returned PR Revision

1. Submit a Purchase Request as requester.
2. Return it for revision as assigned approver with remarks.
3. Reopen as draft as requester.
4. Correct and resubmit.
5. Approve as assigned approver.
6. Capture return remarks, reopen audit, resubmission audit, and final approval state.

### P1-UAT-003 — Quote Recommendation Control

1. Use an approved Purchase Request.
2. Record supplier quotations where permitted.
3. Submit supplier recommendation with single-source or non-lowest justification when applicable.
4. Approve or reject recommendation as assigned approver.
5. Capture quote rows, selected recommendation, justification, approval, and audit.

### P1-UAT-004 — PO Approval And Supplier Issue

1. Open a draft PO generated from approved source lineage.
2. Submit PO for approval.
3. Approve as assigned approver.
4. Record supplier issue/send method and evidence reference.
5. For an issued PO with no receiving activity, request a bounded amendment for quantity, unit price, line note, or expected delivery date with supplier notice evidence or explanation.
6. Verify receiving is blocked while the PO is `AMENDMENT_PENDING`.
7. Approve the amendment as an authorized approver who did not request it, then confirm the PO returns to an issuable/receivable state.
8. Repeat with a returned or rejected amendment where safe and confirm the original PO terms are restored.
9. Capture PO status, supplier issue evidence, source lineage, amendment before/after snapshot, approval instance, receiving block, restoration behavior, and audit history.

### P1-UAT-005 — Partial Receiving With Discrepancy

1. Open an issued or partially received PO.
2. Create a Receiving Report with accepted, rejected, damaged, short, and outstanding quantities.
3. Enter discrepancy reason and evidence reference.
4. Post receiving.
5. Capture receipt lines, PO outstanding quantities, discrepancy evidence, and ledger movement for accepted quantity only.

### P1-UAT-006 — Full Receiving

1. Open an issued PO with remaining quantity.
2. Receive all remaining accepted quantities.
3. Post receiving.
4. Capture receipt status, PO fully received status, receipt movement, and audit event.

### P1-UAT-007 — Receiving Reversal

1. Open a posted Receiving Report.
2. Reverse the full receipt with reason as authorized reverser.
3. Verify linked reversal movement and restored PO quantities/status.
4. Attempt unauthorized reversal where applicable.
5. Capture reversal reason, linked movement, restored PO state, and denial proof.

### P1-UAT-008 — Transfer Request, Dispatch, Receipt

1. Create and submit transfer request from destination location.
2. Switch to source location and dispatch as authorized dispatcher.
3. Switch to destination location and receive as authorized receiver.
4. Repeat as a branch-to-branch transfer where pilot scope includes two authorized branches.
5. Capture transfer status history, source `TRANSFER_OUT`, destination `TRANSFER_IN`, sender/receiver identity, transfer type, and audit.

### P1-UAT-009 — Partial / Disputed Transfer Receipt

1. Dispatch a transfer from source location.
2. Receive only part of the dispatched quantity or record rejected/damaged/short quantity.
3. Enter discrepancy reason/evidence reference.
4. Verify only accepted quantity posts destination stock.
5. Settle the discrepancy as an authorized user with settlement reason/evidence and confirm the action is non-posting.
6. Reverse receipt event where UAT scope includes it.
7. Capture receipt-event lines, discrepancy evidence, accepted-only ledger effect, settlement audit/export evidence, no settlement ledger movement, and reversal movement if tested.

### P1-UAT-010 — Stock Count And Freeze Control

1. Schedule and start a blind stock count.
2. Enter counts and submit for review.
3. Attempt ordinary inventory movement posting during active frozen count where configured.
4. Review or request recount as different authorized reviewer.
5. Capture blind-count proof, movement-post block, self-review denial, review/recount audit.

### P1-UAT-011 — Count-Generated Adjustment

1. Review a submitted count with variance.
2. Generate the linked Stock Adjustment.
3. Attempt duplicate generation.
4. Verify no direct count movement was posted.
5. Capture generated adjustment link, duplicate prevention, and ledger absence until Stock Adjustment posting.

### P1-UAT-012 — Wastage Submit, Approve, Post, Reverse

1. Create wastage report with reason, quantity, value, and evidence reference where required.
2. Submit for approval.
3. Approve as assigned approver who is not the reporter.
4. Post as authorized poster.
5. Reverse with reason as authorized reverser.
6. Capture evidence policy, approval, `WASTAGE_OUT`, linked `REVERSAL`, and audit.

### P1-UAT-013 — Stock Adjustment Submit, Approve, Post, Reverse

1. Create manual `INCREASE` or `DECREASE` Stock Adjustment with reason and evidence reference.
2. Submit for approval.
3. Approve as assigned approver.
4. Post as authorized poster.
5. Reverse full posted adjustment with reason.
6. Capture non-posting approval, `ADJUSTMENT_IN` or `ADJUSTMENT_OUT`, linked `REVERSAL`, and audit.

### P1-UAT-014 — Unauthorized Scope Denial

1. Sign in as branch user.
2. Attempt direct links to another branch PR, PO, receiving, inventory, transfer, count, wastage, and adjustment.
3. Attempt approval and report/export links outside the user's assigned permission/scope.
4. Repeat for warehouse and project scope where applicable.
5. Open one permitted record for the same user to prove the denial is scope/permission based, not a broken route.
6. Capture denied or redirected access without sensitive details leaking, plus denial audit/feedback where implemented.

### P1-UAT-015 — Dashboard And Export Scope

1. Open Operations Dashboard in pilot branch.
2. Drill down from at least three cards to source records.
3. Export one permitted operational CSV.
4. Attempt denied export as unauthorized user where safe.
5. Capture scoped cards, source drilldown, export metadata, export audit started/completed, and denied export audit.

## Phase 1.5 Scripts

### P15-UAT-001 — Scoped Project From Template

1. Create project from published template.
2. Confirm scope, members, starter tasks, checklists, milestones, and activity history.
3. Capture template snapshot and project activity.

### P15-UAT-002 — Restricted Visibility Denial

1. Create restricted project.
2. Sign in as non-member without project access.
3. Attempt list/search/deep-link access to the project, project task, linked record summary, project report, export route, and attachment metadata where available.
4. Sign in as an authorized project member and open the same project as a control sample.
5. Capture denial without project/task/link discovery for the non-member, and capture successful scoped access for the authorized member.

### P15-UAT-003 — Project Members Audit

1. Add project member.
2. Change member role or remove member where permitted.
3. Attempt blocked self-remove or unauthorized member change where applicable.
4. Capture member activity history and denial.

### P15-UAT-004 — Task Lifecycle

1. Create task with owner, assignee, due date, priority, and checklist.
2. Add comment and complete required checklist.
3. Complete task.
4. Capture completed-by, completed-at, checklist gate, comment count, and activity.

### P15-UAT-005 — Blocked Task

1. Mark task blocked with reason, severity, owner, and next action.
2. Verify notification and board/list status.
3. Resolve or cancel blocker manually with note.
4. Capture blocker history, notification, and status boundary.

### P15-UAT-006 — Task Reopen / Cancel

1. Complete a task.
2. Reopen with required reason as authorized user.
3. Cancel a task with required reason as authorized user.
4. Attempt unauthorized or stale-version transition where applicable.
5. Capture reason, permission denial, stale feedback, and activity.

### P15-UAT-007 — Milestones And Work Calendar

1. Create or update milestone.
2. Open Work Calendar as manager and read-only user.
3. Attempt read-only mutation.
4. Capture calendar scope, suppression of unauthorized mutation, and stale-version feedback where applicable.

### P15-UAT-008 — Project Risks

1. Create risk with severity, owner, mitigation, and target date.
2. Update risk.
3. Resolve risk with note.
4. Capture permission checks, optimistic version behavior, and activity history.

### P15-UAT-009 — Source Record Links

1. Link task to allowed source record type such as PR, PO, receiving, transfer, supplier, inventory, wastage, or adjustment.
2. View as source-authorized user.
3. View as project-authorized but source-unauthorized user.
4. Capture safe summary for authorized user and redacted linked-record indicator for unauthorized user.

### P15-UAT-010 — Tracker Does Not Mutate Source

1. Link task to operational record.
2. Complete, block, cancel, or approve project task/workflow as applicable.
3. Reopen operational source record.
4. Verify source status, approval state, receiving state, inventory state, and finance state are unchanged.
5. Capture before/after source status and project activity.

### P15-UAT-011 — Project Reports And Exports

1. Open Project Health, Task Register, Activity Log, and Linked Record Follow-up exports where permitted.
2. Repeat as restricted user.
3. Capture project visibility, redaction behavior, CSV metadata, and denied export behavior.

### P15-UAT-012 — Notifications And Manual Reminder Scans

1. Trigger an approval that is due soon or overdue for the test approver.
2. Run `Scan Approvals` as the authorized approver and capture scanned count, generated reminder count, in-app notification, source approval link, and scan audit evidence.
3. Trigger assignment, reassignment, blocker, elevated risk, and milestone notifications.
4. Run manual project deadline reminder scan as authorized project manager.
5. Capture recipient, approval/project/task/milestone/risk IDs, in-app notification, activity event, scan parameters, generated/skipped counts, and idempotency evidence where available.
6. Attempt reminder scan or notification visibility as an unauthorized approval/project user where safe.
7. Open notification-driven approval, task detail, or My Work view on mobile/tablet where UAT devices are available.
8. Confirm no queueing, automated scheduler, or email dependency is required.
