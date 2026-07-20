# Phase I and Phase 1.5 UAT Evidence Pack

**Status:** Execution pending  
**Created:** 30 June 2026  
**Release gate:** Conditional GO until this pack is executed, defects are dispositioned, and signoff is recorded.
**Deployment evidence checklist:** `PHASE1_PHASE1_5_DEPLOYMENT_ROLLBACK_EVIDENCE_CHECKLIST.md`
**Execution scripts:** `PHASE1_PHASE1_5_UAT_EXECUTION_SCRIPTS.md`
**Acceptance traceability:** `PHASE1_PHASE1_5_ACCEPTANCE_TRACEABILITY_MATRIX.md`
**Hypercare and defect runbook:** `PHASE1_PHASE1_5_PILOT_HYPERCARE_AND_DEFECT_RUNBOOK.md`

## 1. Purpose

This pack is the release evidence record for Phase I Core Operational Control and Phase 1.5 Projects & Implementation Tracker. It must be completed during staging or pilot UAT before go-live approval.

Do not use this document as proof that UAT has passed until every required scenario has an execution date, tester, evidence reference, result, defect disposition, and signoff.

Use `PHASE1_PHASE1_5_ACCEPTANCE_TRACEABILITY_MATRIX.md` to confirm each scenario has mapped automated support and to see which manual proof remains required. Automated tests do not replace the scenario evidence recorded in this pack.

## 2. Execution Summary

| Area                           | Status  | Evidence required before GO                                                               | Owner                      | Signoff |
| ------------------------------ | ------- | ----------------------------------------------------------------------------------------- | -------------------------- | ------- |
| Purchasing and approvals       | Pending | PR to approval to quote/PO proof, no-self-approval proof, audit screenshots/export        | QA Lead / Purchasing Owner | Pending |
| PO issue and receiving         | Pending | Issued PO, partial/full receiving, discrepancy evidence, reversal proof                   | QA Lead / Warehouse Owner  | Pending |
| Inventory ledger and balances  | Pending | Source-linked movement proof, balance reconciliation, frozen-count movement block proof   | QA Lead / Inventory Owner  | Pending |
| Transfers                      | Pending | Dispatch, partial receipt/dispute, receiver segregation, receipt reversal proof           | QA Lead / Warehouse Owner  | Pending |
| Counts, wastage, adjustments   | Pending | Count/recount, generated adjustment, approval/post/reversal, evidence policy proof        | QA Lead / Operations Owner | Pending |
| Dashboards, reports, exports   | Pending | Scope-filtered dashboard, source drilldown, export audit proof                            | QA Lead / Reporting Owner  | Pending |
| Project tracker                | Pending | Restricted visibility, task lifecycle, blockers, links, reports, no source mutation proof | QA Lead / Project Owner    | Pending |
| Security and scope             | Pending | Deep-link denial, branch/warehouse/project scope denial, role denial, privileged MFA, break-glass, and session revalidation evidence | Security Owner             | Pending |
| Training and release readiness | Pending | KB, training, release notes, known limits, support contacts                               | Enablement Owner           | Pending |
| Deployment and rollback        | Pending | Staging rehearsal, backup/restore, rollback drill, smoke test evidence                    | DevOps Owner               | Pending |

Deployment and rollback evidence must be captured in `PHASE1_PHASE1_5_DEPLOYMENT_ROLLBACK_EVIDENCE_CHECKLIST.md` before this evidence pack can receive final GO signoff.

Training attendance, known-limit acknowledgement, and role-based material coverage must be captured in `../08-knowledge-and-enablement/PHASE1_PHASE1_5_TRAINING_IMPACT_ASSESSMENT.md` before the training and release-readiness row can be signed off.

## 2.1 Pilot Scope Selection Criteria

Select the UAT pilot scope before any transaction scenario is executed. The pilot must be small enough for controlled retesting but complete enough to prove Phase I and Phase 1.5 source-of-truth controls.

| Selection area | Minimum criterion | Evidence to attach | Owner |
| -------------- | ----------------- | ------------------ | ----- |
| Company and brand | One configured company and one active brand with the pilot branch assigned | Scope matrix or admin screenshot | Product Owner / Operations Owner |
| Branch location | One active restaurant branch with requester, receiver, approver, and manager coverage | Location record and assigned users | Operations Owner |
| Warehouse location | One active warehouse or central stock location that can dispatch to the pilot branch | Warehouse record, inventory location, and transfer route | Inventory Owner |
| Inventory data | Items cover fresh produce, meat/protein, dry goods, packaging, UOM conversion, lot/expiry where configured, and at least one inactive/control sample | Item/category/UOM export or screenshots | Inventory Owner |
| Supplier data | At least one verified supplier with supplier-item links and reference price/lead-time data | Supplier register export or screenshots | Purchasing Owner |
| Starting stock | Known balances exist for transfer, count, wastage, and adjustment scenarios and reconcile to ledger/balance views | Balance export and ledger screenshot | Warehouse / Inventory Owner |
| Approval routes | PR, quotation, PO, wastage, stock adjustment, count review, and project decisions resolve to named approvers, with no-self-approval covered | Approval route export or screenshots | Controls Owner |
| Users and denial controls | Each operational role has a named test user, and at least one user intentionally lacks branch, warehouse, export, approval, and restricted-project access | User-role-scope matrix | Security Owner |
| Project tracker | One normal project and one restricted project include members, tasks, blockers, milestones, risks, and safe links to operational records | Project setup screenshots | Project Owner |
| Mobile coverage | Branch and warehouse critical paths are exercised on a phone-sized viewport or mobile device for request, approval, receipt, wastage/count evidence, and blocked/denied states | Device/browser capture list | QA Lead |

The pilot scope must not use `All Brands` or `All Locations` for posting, receiving, stock movement, wastage, adjustment, or project source-record mutation tests. Broad scope views may be used only for authorized dashboard/report evidence.

## 3. Scenario Execution Register

Use this register as the UAT coordinator's execution view. Each row must have a real tester, execution date/time, environment, device/browser, evidence reference, result, defect or waiver status, and owner signoff before final GO review.

| ID          | Area                 | Scenario                                                             | Tester / role | Environment | Device / browser | Execution date/time | Result  | Evidence reference | Defect / waiver | Owner signoff |
| ----------- | -------------------- | -------------------------------------------------------------------- | ------------- | ----------- | ---------------- | ------------------- | ------- | ------------------ | --------------- | ------------- |
| P1-SETUP    | Setup                | Pilot master-data and scope readiness                                | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-001  | Purchasing           | PR to approval to PO                                                 | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-002  | Purchasing           | Returned PR revision                                                 | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-003  | Purchasing           | Quote recommendation control                                         | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-004  | Purchasing           | PO approval, issue, supplier evidence, and bounded amendment         | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-005  | Receiving            | Partial receiving with discrepancy                                   | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-006  | Receiving            | Full receiving                                                       | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-007  | Receiving            | Receiving reversal                                                   | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-008  | Transfers            | Transfer request, dispatch, and receipt                              | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-009  | Transfers            | Partial/disputed transfer receipt, settlement, and reversal          | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-010  | Counts               | Stock count and freeze control                                       | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-011  | Counts               | Count-generated adjustment                                           | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-012  | Wastage              | Wastage submit, approve, post, and reverse                           | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-013  | Adjustments          | Stock adjustment submit, approve, post, and reverse                  | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-014  | Security             | Unauthorized branch, warehouse, approval, export, and project denial | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P1-UAT-015  | Dashboards / reports | Dashboard drilldown and scoped export audit                          | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P15-UAT-001 | Projects             | Scoped project from template                                         | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P15-UAT-002 | Projects             | Restricted visibility denial                                         | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P15-UAT-003 | Projects             | Project members audit                                                | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P15-UAT-004 | Tasks                | Task lifecycle                                                       | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P15-UAT-005 | Tasks                | Blocked task and blocker resolution                                  | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P15-UAT-006 | Tasks                | Task reopen and cancel                                               | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P15-UAT-007 | Calendar             | Milestones and Work Calendar                                         | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P15-UAT-008 | Risks                | Project risks                                                        | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P15-UAT-009 | Links                | Source-record links and redaction                                    | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P15-UAT-010 | Boundary             | Tracker action does not mutate source records                        | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P15-UAT-011 | Reports              | Project reports and exports                                          | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |
| P15-UAT-012 | Notifications        | Approval and project notifications with manual reminder scans         | Pending       | Pending     | Pending          | Pending             | Pending | Pending            | Pending         | Pending       |

## 4. Phase I Scenario Matrix

### Pre-UAT Setup Gate — Pilot Master Data And Scope Readiness

Complete this gate before executing transaction UAT. If this gate fails, stop and fix setup data before treating workflow failures as product defects.

| Gate item                      | Required evidence                                                                                                                                                   | Result  | Evidence reference | Signoff owner                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------ | -------------------------------- |
| Pilot scope selected           | Limited company, brand, pilot branch, pilot warehouse, inventory locations, and project scope identified                                                            | Pending | Pending            | Product Owner / Operations Owner |
| Test users ready               | Requester, approver, purchasing, receiver, dispatcher, inventory reviewer, project manager, contributor, restricted user, auditor, and administrator users assigned | Pending | Pending            | Security / Controls Owner        |
| Role and scope matrix verified | Each test user has expected company/brand/location/warehouse/project scope, and at least one denial-control user lacks scope                                        | Pending | Pending            | Security / Controls Owner        |
| Approval routes active         | PR, quotation recommendation, PO, wastage, stock adjustment, transfer/count review, and project decision routes resolve to expected approvers                       | Pending | Pending            | QA Lead / Process Owners         |
| Master data loaded             | Suppliers, supplier-item links, items, categories, UOMs, conversions, lot/expiry/evidence settings, and active/inactive control samples exist                       | Pending | Pending            | Purchasing / Inventory Owner     |
| Opening stock ready            | Known starting balances for transfer, receiving, count, wastage, and adjustment scripts reconcile to the ledger/balance view                                        | Pending | Pending            | Warehouse / Inventory Owner      |
| Reporting/export data ready    | Source records, report permissions, export permissions, and denied-export users are ready for dashboard/report/export UAT                                           | Pending | Pending            | Reporting Owner / Security Owner |
| Project tracker setup ready    | Published project template, scoped project, restricted project, members, tasks, blockers, milestones, risks, safe source links, and redaction test user exist       | Pending | Pending            | Project Owner                    |

Run `DATABASE_URL=<pilot-or-staging-url> pnpm release:pilot-readiness` before transaction UAT and attach the generated `release-evidence/pilot-readiness/` artifact to this gate. The script is read-only and checks minimum pilot setup counts for organization scope, users, role/scope assignments, approval routes, supplier/item/UOM data, opening stock records, and project tracker setup. Passing setup output supports this gate but does not replace manual owner signoff, named user review, or screenshot/record-ID evidence.

Before release rehearsal, final review, or GO / NO-GO, rerun the same DB-backed check as `DATABASE_URL=<pilot-or-staging-url> PILOT_REQUIRE_RELEASE_GATES_READY=true pnpm release:pilot-readiness`. The strict artifact must show `requireReleaseGatesReady=true` and `DEC-0036 strict release gate status` so reviewers can prove required ERP readiness gates are accepted with evidence and decision notes.

| ID         | Workflow                                                                                                 | Roles                                   | Required proof                                                                                                                                                           | Result  | Defect / waiver |
| ---------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --------------- |
| P1-UAT-001 | Branch creates PR, submits approval, approver approves, purchasing creates PO                            | Branch Manager, Approver, Purchasing    | PR status history, approval instance, PO lineage, audit events                                                                                                           | Pending | Pending         |
| P1-UAT-002 | PR returned, corrected, resubmitted, and approved                                                        | Branch Manager, Approver                | Returned reason, revision, resubmission audit, new actionable approval state                                                                                             | Pending | Pending         |
| P1-UAT-003 | Quote comparison with single-source or non-lowest justification                                          | Purchasing, Approver                    | Quote rows, recommendation reason, approval/audit evidence                                                                                                               | Pending | Pending         |
| P1-UAT-004 | PO approval, issue/send, bounded pre-receiving amendment, supplier evidence, and immutable supplier copy | Purchasing, Approver                    | PO approval, issue method/reference, amendment request/approval, `AMENDMENT_PENDING` receiving block, supplier copy availability rules                                   | Pending | Pending         |
| P1-UAT-005 | Partial supplier receiving with accepted, rejected, damaged, short, outstanding quantities               | Receiver, Warehouse Manager             | Receiving lines, discrepancy reason/evidence, PO outstanding quantities, ledger entries only for accepted quantity                                                       | Pending | Pending         |
| P1-UAT-006 | Full supplier receiving and PO full-received status                                                      | Receiver                                | Posted receipt, balance movement, PO status update, audit event                                                                                                          | Pending | Pending         |
| P1-UAT-007 | Receiving reversal                                                                                       | Receiver, Authorized Reverser           | Reversal reason, linked reversal movement, restored PO quantities/status, self-reversal denial where applicable                                                          | Pending | Pending         |
| P1-UAT-008 | Transfer request, source dispatch, destination receipt                                                   | Requester, Dispatcher, Receiver         | Transfer status history, source movement, destination movement, receiver differs from dispatcher, warehouse-to-branch and branch-to-branch coverage where in pilot scope | Pending | Pending         |
| P1-UAT-009 | Partial/disputed transfer receipt, settlement, and reversal                                              | Dispatcher, Receiver, Warehouse Manager | Receipt-event lines, discrepancy evidence, accepted-only destination stock, non-posting discrepancy settlement audit, reversal movement                                  | Pending | Pending         |
| P1-UAT-010 | Stock count with blind entry, variance review, and frozen-count movement block                           | Counter, Reviewer, Inventory Owner      | Blind count proof, self-review denial, movement-post block during active freeze, review audit                                                                            | Pending | Pending         |
| P1-UAT-011 | Reviewed stock count generates one count-variance stock adjustment                                       | Reviewer, Inventory Owner               | Generated adjustment link, duplicate-generation prevention, no direct count movement                                                                                     | Pending | Pending         |
| P1-UAT-012 | Wastage submit, approve, post, reverse                                                                   | Storekeeper, Approver, Poster           | Evidence policy, no self-review, posted movement, reversal movement                                                                                                      | Pending | Pending         |
| P1-UAT-013 | Manual stock adjustment submit, approve, post, reverse                                                   | Inventory Custodian, Approver, Poster   | Reason/evidence, approval, separate post, reversal, ledger reconciliation                                                                                                | Pending | Pending         |
| P1-UAT-014 | Unauthorized branch/warehouse access denial                                                              | Branch User, Warehouse User, Auditor    | Direct URL/API denial evidence for PR, PO, receiving, inventory, transfer, count, wastage, adjustment                                                                    | Pending | Pending         |
| P1-UAT-015 | Dashboard and report exports preserve scope and audit export activity                                    | Manager, Auditor                        | Dashboard scoped cards, report filters, export audit events, denied export proof                                                                                         | Pending | Pending         |

## 5. Phase 1.5 Scenario Matrix

| ID          | Workflow                                                                    | Roles                                              | Required proof                                                                                    | Result  | Defect / waiver |
| ----------- | --------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------- | --------------- |
| P15-UAT-001 | Create scoped project from published template                               | Project Manager, System Administrator              | Template snapshot, starter tasks/checklists/milestones, activity history                          | Pending | Pending         |
| P15-UAT-002 | Restricted project visibility denial                                        | Project Manager, Non-member, Security Reviewer     | List/search/deep-link denial; unauthorized users cannot discover project/task/link detail         | Pending | Pending         |
| P15-UAT-003 | Add/remove project members with audit                                       | Project Manager                                    | Member role change, self-remove block, activity event                                             | Pending | Pending         |
| P15-UAT-004 | Task create, assign, checklist, comments, completion                        | Project Manager, Contributor                       | Accountable owner, required checklist gate, completed-by/time, activity history                   | Pending | Pending         |
| P15-UAT-005 | Blocked task with blocker reason and manual resolution/cancellation         | Contributor, Project Manager                       | Blocker reason/severity/owner, notifications, resolution note, task status boundary               | Pending | Pending         |
| P15-UAT-006 | Task reopen/cancel rules                                                    | Contributor, Project Manager                       | Required reason, permission denial, stale-version handling                                        | Pending | Pending         |
| P15-UAT-007 | Milestones and Work Calendar                                                | Project Manager, Read-only Project User            | Calendar scope, read-only mutation suppression, stale-version feedback                            | Pending | Pending         |
| P15-UAT-008 | Project risks                                                               | Risk Owner, Project Manager                        | Mitigation target date, resolution note, risk permissions, activity history                       | Pending | Pending         |
| P15-UAT-009 | Link task to PR/PO/receiving/transfer/supplier/inventory/wastage/adjustment | Contributor, Source-record Viewer, Restricted User | Safe summary when authorized; redacted linked-record indicator when unauthorized                  | Pending | Pending         |
| P15-UAT-010 | Tracker action does not mutate operational source records                   | Project Manager, Source Module Owner               | Completing/blocking/cancelling task leaves PR/PO/receiving/inventory/approval status unchanged    | Pending | Pending         |
| P15-UAT-011 | Project reports and exports                                                 | Project Manager, Restricted User                   | Project Health, Task Register, Activity Log, Linked Record Follow-up with scope and redaction     | Pending | Pending         |
| P15-UAT-012 | Notifications and reminders without queueing dependency                     | Approver, Project Manager, Contributor             | Approval due/overdue scan, assignment, reassignment, blocker, project due-soon/overdue manual scan, elevated risk, at-risk milestone | Pending | Pending         |

## 6. Known Release Exceptions / Deferred Scenarios

| Item                                                                                                       | Status                                         | Release treatment                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full post-receiving PO amendment and supplier/location/line-add/delete/substitution/payment-term amendment | Deferred controlled transition                 | Bounded issued/unreceived PO amendment is implemented and must be tested in P1-UAT-004. Do not mark broader amendment as UAT pass for Phase I. Release only with documented limitation and approved waiver if required by pilot scope. |
| Backdated operational correction                                                                           | Deferred controlled transition                 | Do not mark as UAT pass. Use same-day controlled reversal/adjustment behavior only.                                                                                                                                                    |
| Partial receiving-line reversal                                                                            | Deferred controlled transition                 | Full-document reversal is the implemented correction path.                                                                                                                                                                             |
| Transfer dispatch reversal / automated replacement or finance settlement                                   | Deferred controlled transition                 | Use implemented non-posting discrepancy settlement for closure evidence; use approved follow-up workflow outside automatic dispatch reversal, replacement automation, or finance settlement.                                           |
| Binary upload/download for project attachments                                                             | Deferred shared attachment service             | Project tracker links existing metadata only; do not claim file delivery readiness.                                                                                                                                                    |
| Automated notification scheduler / email / queueing                                                        | Deferred and out of Phase I/1.5 queueing scope | Use in-app notifications and manual reminder scan where implemented.                                                                                                                                                                   |

## 7. Defect Log

| Defect ID | Scenario | Severity | Description | Source record / evidence | Owner | Target disposition  | Status | Retest evidence | Waiver ID |
| --------- | -------- | -------- | ----------- | ------------------------ | ----- | ------------------- | ------ | --------------- | --------- |
| TBD       | TBD      | TBD      | TBD         | TBD                      | TBD   | Fix / Waive / Defer | Open   | TBD             | TBD       |

Severity must follow `TEST_STRATEGY_AND_UAT_PLAN.md`: blocker and critical defects block GO unless fixed and retested or formally waived by authorized management with mitigation.

### Waiver And Deferral Register

| Waiver ID | Scenario / defect | Severity | Reason for waiver or deferral | Mitigation | Business owner approval | Technical owner approval | Expiry / revisit trigger | Status  |
| --------- | ----------------- | -------- | ----------------------------- | ---------- | ----------------------- | ------------------------ | ------------------------ | ------- |
| TBD       | TBD               | TBD      | TBD                           | TBD        | Pending                 | Pending                  | TBD                      | Pending |

Waivers must not be used to bypass tenant/company/location/project authorization, inventory ledger integrity, approval segregation, auditability, or source-record boundary controls.

## 8. Focused Evidence Capture Sheets

Use these sheets for scenarios that require multiple screenshots, record IDs, CSV files, and audit references. Do not mark the scenario as passed until every required line is completed or formally waived.

### P1-UAT-015 — Dashboard, Reports, Drilldown, And Export Scope

| Evidence item                 | Required capture                                                                                                                                                                                                                        | Result  | Evidence reference | Notes                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| Scoped dashboard cards        | Screenshot showing selected company/brand/location and dashboard cards for pending approvals, open PR/PO, receiving variance, transfer follow-up, count variance, wastage/adjustment exceptions, or ledger variance where records exist | Pending | Pending            | Dashboard must remain read-only and source-linked.                                                      |
| Source drilldown              | Open at least three dashboard card links and capture the resulting source list or source record                                                                                                                                         | Pending | Pending            | Drilldown must respect the same user scope and permissions.                                             |
| Permitted report catalog      | Screenshot of reports available to the test role                                                                                                                                                                                        | Pending | Pending            | Hidden reports alone are not proof of authorization; include a successful permitted report open/export. |
| Permitted CSV export          | CSV file or export artifact plus export parameters and scope filters                                                                                                                                                                    | Pending | Pending            | Scope filters must match the selected company/location/project context.                                 |
| Export audit start/completion | Audit record IDs or screenshots showing export started and completed events                                                                                                                                                             | Pending | Pending            | Include actor, timestamp, report/export type, and scope.                                                |
| Denied export proof           | Attempt a report/export without permission and capture user-safe denial plus denial audit event where applicable                                                                                                                        | Pending | Pending            | Denial must not leak another branch, warehouse, or project record detail.                               |
| Source-record boundary        | Before/after confirmation that dashboard/report/export actions did not change PR, PO, receiving, transfer, inventory, approval, wastage, adjustment, or project source status                                                           | Pending | Pending            | Visibility only; no operational mutation.                                                               |

### P15-UAT-011 — Project Reports, Exports, Workload, Activity, And Redaction

| Evidence item             | Required capture                                                                                                                             | Result  | Evidence reference | Notes                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| Project Health            | Open Project Health as an authorized project user and capture scoped project status/health indicators                                        | Pending | Pending            | Must respect company, project membership, and restricted project visibility.                        |
| Task Register             | Open or export Task Register with owner, status, deadline, blocker, and priority context                                                     | Pending | Pending            | Task export must not include operational source-record payload snapshots.                           |
| Activity Log              | Open or export project activity with task, member, milestone, blocker, risk, comment, attachment metadata, and link activity where available | Pending | Pending            | Activity must show actor/time and remain project-scoped.                                            |
| Linked Record Follow-up   | Open or export linked-record follow-up as a source-authorized project user                                                                   | Pending | Pending            | Safe summaries may be shown only when source-record access is allowed.                              |
| Redacted linked record    | Repeat linked-record follow-up as a project user without source-record permission                                                            | Pending | Pending            | User should see only a limited linked-record indicator, not PO/receiving/inventory payload details. |
| Restricted project denial | Attempt report/export access for a restricted project as a non-member                                                                        | Pending | Pending            | Unauthorized users must not discover restricted project details through reports or exports.         |
| Tracker boundary          | Complete, block, cancel, or update a task linked to a source record, then capture unchanged source-record status before/after                | Pending | Pending            | Tracker reports coordinate work only; they never mutate operational source records.                 |

### P15-UAT-005 And P15-UAT-012 — Approval And Project Notifications With Manual Reminder Scans

| Evidence item                  | Required capture                                                                                                                                | Result  | Evidence reference | Notes                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------ | ---------------------------------------------------------------------- |
| Approval reminder scan         | Run `Scan Approvals` as an authorized approver and capture scanned/reminder counts, generated notification, source approval link, and scan audit | Pending | Pending            | Scan must only cover approvals already visible to the current approver. |
| Assignment notification        | Assign or reassign a task and capture recipient, project/task ID, in-app notification, and activity event                                       | Pending | Pending            | Notification must not leak source-record payload details.              |
| Blocker notification           | Mark a task blocked with reason/severity/owner/next action and capture project manager or owner notification                                    | Pending | Pending            | Blocker metadata must remain project-scoped.                           |
| Risk or milestone notification | Create elevated risk or at-risk milestone and capture generated in-app notification and activity event                                          | Pending | Pending            | Use only implemented in-app notifications.                             |
| Project due-soon reminder scan | Run the manual project reminder scan as an authorized user and capture scan parameters, generated notifications, and skipped terminal/unscheduled items | Pending | Pending            | No automated scheduler or queue is required.                           |
| Project overdue reminder scan  | Run or verify overdue project reminder behavior and capture frequency/idempotency proof where available                                        | Pending | Pending            | Repeated scans should not spam duplicate reminders in the same bucket. |
| Scope denial                   | Attempt approval/project reminder scan or notification visibility as an unauthorized user                                                       | Pending | Pending            | Denial must not reveal restricted approval, project, or task details.  |
| Mobile/tablet check            | Open notification-driven task detail or My Work view on mobile/tablet where UAT devices are available                                           | Pending | Pending            | Complements automated helper coverage with real-device evidence.       |

### P1-UAT-014 And P15-UAT-002 — Scope, Direct URL, And Restricted Visibility Denial

| Evidence item                    | Required capture                                                                                                                            | Result  | Evidence reference | Notes                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------ | -------------------------------------------------------------------------------------- |
| Branch cross-scope denial        | Attempt direct PR, PO, receiving, wastage, adjustment, count, inventory, and report URLs for another branch                                 | Pending | Pending            | Denial must be server-enforced, not just hidden navigation.                            |
| Warehouse cross-scope denial     | Attempt transfer, inventory balance, ledger, count, and receiving URLs outside assigned warehouse scope                                     | Pending | Pending            | No item quantity, supplier, or location detail should leak.                            |
| Approval visibility denial       | Attempt to open an approval instance not assigned or not visible to the test user                                                           | Pending | Pending            | Include user-safe denial and audit/feedback where implemented.                         |
| Export denial                    | Attempt operational and project exports without export permission                                                                           | Pending | Pending            | Include denial audit event where applicable.                                           |
| Restricted project non-discovery | As a non-member, attempt project list/search/deep-link access to a restricted project, task, linked record, report, and attachment metadata | Pending | Pending            | Restricted projects must not be discoverable through reports, links, or notifications. |
| Authorized control sample        | Repeat one permitted operational record and one permitted restricted-project record as an authorized user                                   | Pending | Pending            | Confirms the denial is scope/permission based, not a broken route.                     |

### Phase I Pilot Master-Data Readiness

| Evidence item                          | Required capture                                                                                                                             | Result  | Evidence reference | Notes                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------ | --------------------------------------------------------------------------------------------- |
| Pilot company/brand/location hierarchy | Active pilot company, brand, branch, warehouse, and inventory locations with expected IDs/names                                              | Pending | Pending            | Locations must match the UAT scope and cannot rely on `All Locations` for posting workflows.  |
| Pilot users and scopes                 | Requester, approver, purchasing, receiver, warehouse, inventory, project, reporting, and administrator users with role/scope assignments     | Pending | Pending            | Include no-self-approval coverage where applicable.                                           |
| Approval policies                      | Active PR, quotation recommendation, PO, wastage, adjustment, transfer/count reviewer policies and approver routing samples                  | Pending | Pending            | Policy snapshot behavior is tested automatically but pilot routes need business confirmation. |
| Supplier master data                   | Active suppliers, supplier-item links, reference prices, blocked/suspended supplier sample if in scope, and duplicate-control proof          | Pending | Pending            | Supplier data must support quote/PO UAT without manual spreadsheet substitution.              |
| Item/UOM/catalog data                  | Active item codes, categories, base UOMs, conversions, lot/expiry/evidence settings, and branch/warehouse stockable items                    | Pending | Pending            | Confirm UOM conversions before PR, receiving, transfer, count, wastage, and adjustment UAT.   |
| Opening test inventory                 | Known starting balances or seeded stock for pilot warehouse/branch items used in receiving, transfer, count, wastage, and adjustment scripts | Pending | Pending            | Must reconcile to ledger/balance expectations before workflow testing.                        |
| Reporting/export scopes                | Report/export permissions and sample source records available for permitted and denied export tests                                          | Pending | Pending            | Needed for P1-UAT-015 and P15-UAT-011.                                                        |

Attach the setup `pnpm release:pilot-readiness` output here as the baseline data-readiness artifact, then add the manual screenshots, exports, record IDs, named users, and owner confirmations required above. Attach the strict `PILOT_REQUIRE_RELEASE_GATES_READY=true` output before final review so the evidence pack distinguishes setup readiness from release-gate acceptance.

## 9. Signoff

| Role                        | Name | Decision | Date | Notes |
| --------------------------- | ---- | -------- | ---- | ----- |
| Product Owner               | TBD  | Pending  | TBD  | TBD   |
| QA Lead                     | TBD  | Pending  | TBD  | TBD   |
| Operations Owner            | TBD  | Pending  | TBD  | TBD   |
| Purchasing Owner            | TBD  | Pending  | TBD  | TBD   |
| Warehouse / Inventory Owner | TBD  | Pending  | TBD  | TBD   |
| Security / Controls Owner   | TBD  | Pending  | TBD  | TBD   |
| Release Manager             | TBD  | Pending  | TBD  | TBD   |

### Final GO / NO-GO Decision

| Decision item                         | Required evidence                                                                                         | Result  | Evidence reference | Decision owner                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------- | ------------------ | -------------------------------- |
| UAT scenarios                         | Every required Phase I and Phase 1.5 scenario is `Pass` or has approved waiver/deferral                   | Pending | Pending            | QA Lead                          |
| Blocker/critical defects              | No open blocker or critical defect without approved mitigation                                            | Pending | Pending            | QA Lead / Product Owner          |
| Security and scope                    | Direct URL, export, branch, warehouse, approval, and restricted project denial proof attached             | Pending | Pending            | Security / Controls Owner        |
| Inventory and source-record integrity | Ledger, reversal, accepted-only posting, no duplicate posting, and tracker source-boundary proof attached | Pending | Pending            | Warehouse / Inventory Owner      |
| Deployment readiness                  | Migration, backup, restore, rollback, smoke, monitoring, and hypercare evidence attached                  | Pending | Pending            | Release Manager                  |
| Training and enablement               | Attendance, known-limit acknowledgement, support contacts, and role-based material coverage attached      | Pending | Pending            | Enablement Owner / Product Owner |
| Final decision                        | GO / CONDITIONAL GO / NO-GO recorded with date, owner, and conditions                                     | Pending | Pending            | Product Owner / Release Manager  |

## 10. GO / NO-GO Rule

Phase I and Phase 1.5 cannot be marked release-ready until:

- every required scenario above is `Pass` or has a formally approved waiver;
- every blocker/critical defect is closed or waived with mitigation;
- deployment rollback and backup/restore evidence is attached;
- training, knowledge-base, and release-note readiness are signed off;
- final release owner records a GO decision in this pack.
