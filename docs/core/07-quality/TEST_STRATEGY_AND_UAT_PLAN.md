# OGFI ERP — Test Strategy and UAT Plan

**Status:** Phase I quality baseline  
**Purpose:** Prove that the ERP controls are correct in real restaurant operations before go-live.

**Release evidence pack:** `PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md` is the required execution and signoff record for Phase I and Phase 1.5. `PHASE1_PHASE1_5_ACCEPTANCE_TRACEABILITY_MATRIX.md` maps each acceptance workflow to current automated evidence and remaining manual UAT proof. `PHASE1_PHASE1_5_DEPLOYMENT_ROLLBACK_EVIDENCE_CHECKLIST.md` records deployment, rollback, backup/restore, and smoke-test evidence. `PHASE1_PHASE1_5_PILOT_HYPERCARE_AND_DEFECT_RUNBOOK.md` defines defect intake, triage, daily hypercare, and release decision procedures. `PHASE1_PHASE1_5_DEFERRED_GO_LIVE_BLOCKERS_FOR_UAT.md` parks release/go-live blockers that do not prevent demos or continued implementation but must be reviewed during actual user UAT before production approval. This plan defines what to test; the evidence pack records whether UAT actually passed.

---

## 1. Quality objectives

Phase I is successful only when it is both usable and controlled:

- The correct users can complete their work quickly.
- Unauthorized users cannot access or approve records outside their scope.
- Purchasing and inventory workflow states cannot be bypassed.
- Inventory ledger and balance data remain correct under normal retries and concurrent activity.
- Notifications, audit logs, reports, exports, attachments, and mobile use work as specified.
- Client-facing workspaces follow the approved Modern SaaS layout standard: list-first/task-first pages, real tabs for multi-function workspaces, pagination beyond 10 records, selected-record detail/action drawers, readable light/dark contrast, and no long stacked-card operational pages.

## 2. Test layers

| Layer                     | Purpose                                                                                            | Owner                   |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------- |
| Unit tests                | Validate business rules and utility functions                                                      | Developers              |
| Integration tests         | Validate API, database, in-app notification/manual scan behavior, storage, and module interactions | Developers / QA         |
| API contract tests        | Validate auth, scopes, validation, idempotency, statuses                                           | Developers / QA         |
| End-to-end tests          | Validate core user workflows in browser/mobile emulation                                           | QA                      |
| Security/permission tests | Validate least privilege, approval segregation, tenant/scope isolation                             | QA + Security/Tech Lead |
| Data migration tests      | Validate template imports, duplicates, reconciliation, opening stock                               | Data owners + QA        |
| Performance tests         | Validate common load/search/submit/report behavior                                                 | Tech Lead / QA          |
| Visual readiness tests    | Validate layout, navigation, spacing, contrast, pagination, action hierarchy, no-overlap behavior, and no stacked-card operational workspaces | Product / UI / QA       |
| UAT                       | Validate real business procedures and acceptance                                                   | Process owners          |
| Pilot/hypercare           | Validate real operating environment with controlled locations                                      | Operations + Support    |

## 3. Required automated-test focus

Automate high-risk deterministic rules first:

- Scope filtering and authorization.
- User cannot approve own financial/inventory request where segregation is required.
- Approval route generation and delegation effective dates.
- Status transition validation.
- Document number uniqueness.
- Idempotent receive/post behavior.
- Inventory movement posting and balance reconciliation.
- Transfer dispatch/receipt rules.
- Wastage/adjustment approval requirements.
- Mandatory reason/attachment/evidence rules.
- Audit event creation.
- In-app notification generation and manual reminder scan behavior.

## 4. Critical Phase I end-to-end scenarios

### 4.1 Purchasing

1. Branch creates Purchase Request with required location, items, date, reason, and attachments.
2. Correct approver is assigned based on policy and scope.
3. Approver approves, rejects, or returns for revision with required comment.
4. Purchasing creates quotation comparison where required.
5. Approved selection produces a Purchase Order only through allowed workflow.
6. PO is sent/issued only after required approval.
7. Cancellation/amendment preserves history and triggers re-approval where material.

### 4.2 Warehouse-first replenishment

1. Branch sees low stock and chooses `Request Stock`.
2. System checks configured main warehouse availability.
3. Available warehouse stock routes to Transfer Request, not external PO.
4. Unavailable warehouse stock routes to Purchase Request.
5. All actions retain branch/location context.

### 4.3 Receiving

1. Receiver can receive full, partial, rejected, and damaged quantities.
2. Accepted quantities post inventory once only.
3. Partial receipt keeps PO outstanding correctly.
4. Discrepancy sends correct notifications and retains evidence.
5. Lot/expiry-required items cannot be received without required data.

### 4.4 Transfers

1. Source location dispatches approved transfer; source stock reduces once.
2. Destination receives transfer; destination stock increases once.
3. Destination cannot receive more than dispatched without discrepancy process.
4. Overdue transfer appears in task, in-app notification, and reporting follow-up lists.
5. Cancel/reverse rules maintain ledger integrity.

### 4.5 Stock counts, wastage, adjustments

1. Count assignment is scoped to correct location and items.
2. Count variance requires review/approval according to policy.
3. Wastage has item, quantity, reason, value, evidence where required, and approval route.
4. Adjustment cannot post without allowed reason/approval.
5. Ledger, on-hand balance, report, and audit record reconcile.

### 4.6 Security and data isolation

1. Branch user cannot view another branch’s stock, PRs, POs, or attachments.
2. Warehouse user cannot approve a request without role permission.
3. User cannot approve own request when prohibited.
4. Auditor is read-only and cannot mutate records.
5. Tenant/company context is never bypassed by manipulating URL/API identifiers.

## 5. UAT participants

| Area                         | UAT participant(s)                                   |
| ---------------------------- | ---------------------------------------------------- |
| Executive controls           | CEO / Executive or delegate                          |
| Operations / branch workflow | General Manager, Operations Manager, Branch Manager  |
| Purchasing                   | Purchasing Manager, Purchasing Officer               |
| Warehouse / inventory        | Warehouse Manager, Storekeeper / Inventory Custodian |
| Finance controls             | Accounting Manager / Finance representative          |
| System setup/access          | IT Administrator / System Administrator              |
| Audit/control review         | Auditor or management-appointed reviewer             |

## 6. UAT execution method

1. Use realistic but controlled test data for at least one branch and main warehouse.
2. Assign scripted scenarios and expected results by role.
3. Record pass/fail, screenshots/evidence, defects, owner, severity, workaround, and retest result.
4. Run desktop, tablet, and mobile validation for applicable operations.
5. Do not sign off based only on demo success; complete the scenario set.

### 6.1 Visual readiness method

Before client UAT, each client-facing workspace in scope must pass a visual readiness review:

1. Confirm the primary workspace is list-first, task-queue-first, or workbench-first, not a long stack of cards.
2. Confirm multi-function routes use real tabs, subroutes, or segmented navigation.
3. Confirm all lists that can exceed 10 records have pagination or an approved incremental-load pattern.
4. Confirm row-level workflow actions do not repeat large inline forms; use a selected-record drawer, detail route, or focused action composer.
5. Confirm multi-line and evidence-heavy entry uses a drawer, sheet, stepper, or full-page task mode.
6. Capture light and dark screenshots for text contrast, button hierarchy, status pills, disabled states, posting context, and table headers.
7. Check 1366px desktop, wider desktop, tablet, and mobile for overlap, clipping, horizontal-scroll dependency, and text wrapping.
8. Record remaining High/Critical visual findings as UAT blockers unless the Product Owner explicitly accepts a temporary demo-only limitation.

## 7. Defect severity

| Severity | Definition                                                                                  | Go-live impact                                    |
| -------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Blocker  | Data loss, authorization breach, duplicate stock posting, cannot complete critical workflow | No go-live                                        |
| Critical | Material control, financial, reporting, or workflow failure without safe workaround         | No go-live unless formally waived with mitigation |
| Major    | Important function impaired; workaround exists but is costly/risky                          | Fix or formally accept before pilot               |
| Minor    | Cosmetic, copy, or non-critical usability issue                                             | Track for planned fix                             |

## 8. Go-live exit criteria

Phase I pilot may go live only when:

- All blocker and critical defects are resolved or formally waived by authorized management with documented mitigation.
- The Phase I and Phase 1.5 UAT evidence pack is complete, including pass/fail results, evidence references, defect disposition, and named signoff.
- Core workflows pass UAT for each participating role.
- Scope and permission tests pass.
- Opening master data and inventory reconciliation are approved.
- Backup/restore and deployment rollback checks are completed.
- Notifications and audit logs are verified.
- Visual readiness checks pass for all client-facing workspaces in scope, including no long stacked-card operational pages and no unpaginated operational lists above 10 records.
- Training, support contacts, and hypercare plan are ready.
- Named process owners sign off.

## 9. Post-go-live hypercare validation

For the pilot period, review daily:

- Open / overdue approvals
- PO and receiving discrepancies
- Transfers not received
- Inventory negative or unexpected balance alerts
- Wastage and adjustment follow-up list
- Failed in-app notification or manual reminder scan checks
- Role/access incidents
- Export/report reconciliation issues

---

## Projects & Implementation Tracker — Phase 1.5 Quality Addendum

### Mandatory UAT scenarios

- Create a company-scoped project from a controlled template.
- Create a restricted project and confirm non-members cannot discover it through lists, search, deep links, attachments, or notifications.
- Assign a task, complete a checklist, link evidence metadata where available, add a comment, and confirm the activity timeline is complete.
- Mark a task blocked and verify blocker reason, owner notification, Project Manager notification, and escalation behavior.
- Link a task to a Purchase Order and verify the source record is read-only from the tracker.
- Confirm a project user without PO permission cannot see PO amount, private attachment, or supplier detail through the linked record.
- Verify mobile task completion and comment/upload flow.
- Verify overdue logic, timezone behavior, and date filtering.
- Confirm task completion does not approve, receive, transfer, or close any controlled ERP record.
- Verify soft-delete/archive behavior preserves activity and audit history.
