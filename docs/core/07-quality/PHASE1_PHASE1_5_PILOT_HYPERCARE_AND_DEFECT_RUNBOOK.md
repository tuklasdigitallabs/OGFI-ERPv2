# Phase I And Phase 1.5 Pilot Hypercare And Defect Runbook

**Status:** Ready for pilot planning; execution evidence pending  
**Created:** 30 June 2026  
**Applies to:** Phase I Core Operational Control and Phase 1.5 Projects & Implementation Tracker

## Purpose

Use this runbook during UAT, staging rehearsal, pilot go-live, and hypercare. It defines how defects, support requests, rollback decisions, operational reviews, and user communications are recorded without replacing the UAT evidence pack or deployment checklist.

This runbook is not a GO approval. GO requires completed UAT evidence, deployment/rollback evidence, training acknowledgement, defect disposition, and named release signoff.

## 1. Required Pilot Roles

| Role             | Named owner | Backup  | Decision scope                                                            | Contact route | Confirmed | Evidence reference | Updated at |
| ---------------- | ----------- | ------- | ------------------------------------------------------------------------- | ------------- | --------- | ------------------ | ---------- |
| Product Owner    | Pending     | Pending | GO / NO-GO, pilot scope, business waiver approval                         | Pending       | Pending   | Pending            | Pending    |
| Release Manager  | Pending     | Pending | Release window, rollback coordination, communication cadence              | Pending       | Pending   | Pending            | Pending    |
| QA Lead          | Pending     | Pending | UAT execution, defect severity, retest evidence                           | Pending       | Pending   | Pending            | Pending    |
| DevOps Owner     | Pending     | Pending | Deployment, backup/restore, rollback execution, health checks             | Pending       | Pending   | Pending            | Pending    |
| Security Owner   | Pending     | Pending | Role/scope incidents, restricted project visibility, export/access denial | Pending       | Pending   | Pending            | Pending    |
| Operations Owner | Pending     | Pending | Branch/warehouse workflow acceptance and daily operational review         | Pending       | Pending   | Pending            | Pending    |
| Purchasing Owner | Pending     | Pending | PR, quote, PO, supplier issue, receiving variance acceptance              | Pending       | Pending   | Pending            | Pending    |
| Inventory Owner  | Pending     | Pending | Ledger, transfers, counts, wastage, adjustment acceptance                 | Pending       | Pending   | Pending            | Pending    |
| Project Owner    | Pending     | Pending | Phase 1.5 project tracker acceptance and source-record boundary           | Pending       | Pending   | Pending            | Pending    |

## 2. Defect Intake Rules

Every UAT, staging, pilot, or hypercare defect must include:

| Field               | Required content                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Defect ID           | Unique ID controlled by QA Lead or project tracker task number                                                         |
| Date/time reported  | User/company timezone plus UTC where available                                                                         |
| Reporter and role   | User name, role, company/brand/location/project context                                                                |
| Environment         | Local, CI, staging, pilot, production                                                                                  |
| Device/browser      | Desktop/tablet/mobile and browser/version where known                                                                  |
| Workflow/scenario   | UAT scenario ID or source workflow                                                                                     |
| Source record IDs   | PR, PO, receiving, transfer, count, wastage, adjustment, project/task, approval, audit, or export IDs where applicable |
| Expected result     | What the approved workflow says should happen                                                                          |
| Actual result       | What happened, including user-safe error code/message                                                                  |
| Evidence reference  | Screenshot, CSV, audit ID, log reference, or reproduction note                                                         |
| Severity            | Blocker, Critical, Major, or Minor from the test strategy                                                              |
| Data/control impact | Inventory, money, approval, authorization, audit, dashboard/report, tracker boundary, or training impact               |
| Workaround          | Safe workaround or `None`                                                                                              |
| Owner               | Person responsible for fix, retest, waiver, or deferral                                                                |
| Target disposition  | Fix, Waive, Defer, Duplicate, Cannot reproduce                                                                         |
| Retest evidence     | Retest date/time, actor, result, and evidence reference                                                                |

## 3. Severity And GO Impact

| Severity | Definition                                                                                                                                       | GO impact                                   | Required action                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------- |
| Blocker  | Data loss, authorization breach, duplicate stock posting, inventory/money source-record corruption, or inability to complete a critical workflow | NO-GO                                       | Fix and retest, or stop release. No routine waiver.                    |
| Critical | Material control, financial, reporting, workflow, backup/restore, or rollback failure without a safe workaround                                  | NO-GO unless formally waived                | Product Owner and Technical Owner approval with mitigation and expiry. |
| Major    | Important function impaired; safe but costly workaround exists                                                                                   | Conditional GO only with owner and due date | Fix before pilot where practical, otherwise approve mitigation.        |
| Minor    | Cosmetic, copy, or non-critical usability issue                                                                                                  | Does not block GO by itself                 | Track for planned fix.                                                 |

Waivers must not bypass tenant/company/brand/location/project scope isolation, approval segregation, immutable inventory ledger, audit trail, source-record boundary, backup/restore proof, or rollback authority.

## 4. Triage Cadence

| Meeting                  | Frequency                                                            | Required attendees                                                    | Required output                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| UAT execution standup    | Daily during active UAT                                              | QA Lead, Product Owner, workflow owners, implementation lead          | Scenarios executed, defects opened/closed, blockers, next test owners                                                              |
| Pilot operational review | Daily during pilot hypercare                                         | Operations, Purchasing, Inventory, Project Owner, QA Lead             | Open approvals, PO/receiving discrepancies, transfers not received, count variance, wastage/adjustment follow-up, project blockers |
| Security/access review   | Daily during first pilot week, then as agreed                        | Security Owner, QA Lead, Release Manager                              | Role/scope incidents, denied URL checks, export denials, restricted project visibility checks                                      |
| Release decision review  | Before deploy, after smoke, and when blocker/critical defect appears | Product Owner, Release Manager, QA Lead, DevOps Owner, Security Owner | GO / CONDITIONAL GO / HOLD / ROLLBACK / FORWARD-FIX decision                                                                       |

## 5. Daily Hypercare Checklist

| Area                       | Daily check                                                                                               | Evidence reference | Owner                        | Result  | Updated at |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------- | ------- | ---------- |
| Approvals                  | Open, overdue, returned, rejected, and no-self-approval exception review                                  | Pending            | QA Lead / Process Owner      | Pending | Pending    |
| Purchasing                 | Open PRs, quote recommendations, PO issue status, PO amendment pending status                             | Pending            | Purchasing Owner             | Pending | Pending    |
| Receiving                  | Partial/full receiving, discrepancy reasons/evidence, accepted-only stock posting                         | Pending            | Warehouse Owner              | Pending | Pending    |
| Transfers                  | Requests pending dispatch, in-transit transfers, partial/disputed receipts, settlement/reversal follow-up | Pending            | Warehouse / Inventory Owner  | Pending | Pending    |
| Inventory                  | Ledger/balance reconciliation, negative/unexpected balances, frozen count movement block                  | Pending            | Inventory Owner              | Pending | Pending    |
| Counts/wastage/adjustments | Count variance, generated adjustments, approval/post/reversal follow-up                                   | Pending            | Operations / Inventory Owner | Pending | Pending    |
| Dashboards/reports/exports | Dashboard source drilldowns, scoped exports, export audit completion/denial                               | Pending            | Reporting Owner              | Pending | Pending    |
| Project tracker            | Blocked/overdue tasks, milestones, risks, restricted project visibility, linked-record redaction          | Pending            | Project Owner                | Pending | Pending    |
| Notifications              | In-app notification delivery and manual reminder scan outcome where in scope                              | Pending            | QA Lead / Project Owner      | Pending | Pending    |
| Health/readiness           | `/health`, `/readiness`, error logs, backup job evidence where applicable                                 | Pending            | DevOps Owner                 | Pending | Pending    |

## 6. User Confusion, Rush, Or Temporary Disruption SOP

Use this path when a pilot user is blocked, denied, rushed during operations, or unsure which record controls the workflow. This SOP is for triage only; it must not bypass approval, source-record, audit, inventory-ledger, or scope controls.

1. Confirm the user's company, brand, location, warehouse, department, project, role, and active header context.
2. Capture the screen, source record ID, action attempted, time, device/browser, and exact user-safe error or missing-state message.
3. Check whether the expected action belongs in the source module, not in dashboard, report, notification, or project tracker views.
4. If the issue is access-related, route to the Security Owner for role/scope review; do not ask another user to perform the action unless policy permits reassignment.
5. If the issue affects stock, receiving, transfer, wastage, adjustment, count, or approval state, stop the workflow and create a defect or support record before any correction.
6. If a safe workaround exists, record the workaround, owner, expiry, and retest evidence in the defect register.
7. If users revert to chat or paper to keep operations moving, record the external action as a temporary support note and reconcile it back to the ERP source record before signoff.

## 7. Adoption And Support Metrics

Track these during UAT and the first pilot hypercare week. Metrics are evidence targets for owner review; they do not replace scenario proof.

| Metric | Definition | Evidence source | Review owner |
| ------ | ---------- | --------------- | ------------ |
| Role completion rate | Percentage of pilot users who completed their assigned quick-start and scenario practice | Training attendance and completion checks | Enablement Owner |
| Repeat denial rate | Repeated denied actions by the same role/scope pattern after training | Defect/support log and audit evidence | Security Owner |
| First-response time | Time from defect/support intake to acknowledgement with owner and next update | Defect register timestamps | QA Lead |
| Triage resolution time | Time from intake to fix, waiver, deferral, duplicate, or cannot-reproduce disposition | Defect register | QA Lead / Release Manager |
| Reopened blockers | Blocker or critical defects reopened after retest | Defect register and retest evidence | Product Owner |
| Source-record drift incidents | Any workflow where external notes, chat, or paper diverged from ERP source records | Reconciliation notes and audit/source record IDs | Operations Owner |
| Mobile workflow completion | Branch and warehouse mobile scenario completion without layout overlap or blocked critical action | Mobile screenshots or recordings | QA Lead / Operations Owner |

## 8. Rollback / Hold / Forward-Fix Decision Path

1. QA Lead or DevOps Owner declares a release risk with defect ID and evidence.
2. Release Manager opens a decision review with Product Owner, QA Lead, DevOps Owner, Security Owner, and affected workflow owner.
3. Security, authorization, inventory-ledger, backup/restore, rollback, or source-record corruption failures default to HOLD or ROLLBACK unless fixed and retested.
4. Product Owner may approve CONDITIONAL GO only when the workaround does not bypass controls and the defect has owner, mitigation, expiry, and communication plan.
5. Release Manager records final decision in the UAT evidence pack and deployment checklist.

| Decision       | When allowed                                                                             | Required evidence                                                    |
| -------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| GO             | All required gates pass and signoffs are recorded                                        | UAT pack, deployment checklist, training assessment, defect register |
| CONDITIONAL GO | No unmitigated blocker/critical defect; approved major/minor items have owners and dates | Waiver/deferral row, mitigation, user communication                  |
| HOLD           | Evidence incomplete or defect requires fix before release                                | Defect ID, owner, retest plan                                        |
| ROLLBACK       | Deployed release causes critical operational risk or failed smoke/health/readiness       | Rollback release version, command/log evidence, post-rollback smoke  |
| FORWARD-FIX    | Rollback is riskier than a contained corrective patch                                    | Product/technical approval, backup state, fix plan, retest proof     |

## 9. Communication Templates

### UAT / Pilot Defect Acknowledgement

```text
Defect received: <Defect ID>
Workflow: <Scenario/source record>
Severity: <Severity>
Owner: <Owner>
Next update: <Date/time>
Temporary workaround: <Approved workaround or None>
```

### Release Hold

```text
Release status: HOLD
Reason: <Defect/evidence summary>
Affected users/locations: <Scope>
Next decision review: <Date/time>
Action owner: <Owner>
```

### Conditional GO

```text
Release status: CONDITIONAL GO
Approved conditions: <Waiver/deferral IDs>
Mitigations: <Controls/workarounds>
Expiry/revisit trigger: <Date/event>
Decision owner: <Product Owner / Release Manager>
```

### Rollback

```text
Release status: ROLLBACK
Rollback release version: <Version>
Reason: <Defect/evidence summary>
Expected user impact: <Impact>
Verification required: <Smoke/readiness checks>
Next update: <Date/time>
```

## 10. Final Hypercare Exit Criteria

Pilot hypercare may close only when:

- no open blocker or critical defect remains without approved mitigation;
- daily operational and security reviews are complete for the agreed support window;
- backup/restore and rollback evidence remains valid for the deployed release;
- pilot users have acknowledged known limits and support route;
- dashboard/report/export/audit monitoring has no unresolved control issue;
- Product Owner, Release Manager, QA Lead, Security Owner, and Operations Owner sign off.
