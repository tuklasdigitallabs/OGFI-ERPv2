# Phase I And Phase 1.5 Training Impact Assessment

**Status:** Ready for UAT training use; go-live training signoff pending  
**Created:** 30 June 2026  
**Applies to:** Phase I Core Operational Control and Phase 1.5 Projects & Implementation Tracker

## Purpose

This assessment confirms the user-facing enablement materials needed before UAT and pilot go-live. It does not replace formal UAT execution, deployment readiness, or release signoff.

## Audience Impact

| Audience                      | Training impact                                                                                                                                    | Required material                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Branch managers               | Must understand branch context, Purchase Requests, approvals, transfer receipt, wastage, dashboards, and notifications.                            | `docs/training/phase-i-branch-manager-quick-start.md`                                              |
| Warehouse / storekeeper users | Must understand inventory location context, transfer dispatch/receipt, stock counts, wastage, adjustments, ledger impact, and evidence references. | `docs/training/phase-i-warehouse-storekeeper-quick-start.md`                                       |
| Purchasing users              | Must understand PR follow-up, quotation/PO lineage, PO statuses, supplier issue/send, receiving variance visibility, and exports.                  | `docs/training/phase-i-purchasing-quick-start.md`                                                  |
| Administrators                | Must understand role, permission, scope, approval assignment, audit review, evidence-reference support, and export controls.                       | `docs/training/phase-i-administrator-setup-guide.md`                                               |
| Project users                 | Must understand project/task coordination, blockers, milestones, comments, notifications, reports, and safe source-record links.                   | `docs/training/phase-1-5-project-tracker-quick-start.md`; `docs/knowledge-base/projects/README.md` |

## Knowledge-Base Coverage

- Phase I KB backlog has no unchecked items as of this assessment.
- Getting-started articles cover sign-in/location, dashboard/tasks/notifications, statuses, audit history, and evidence boundaries.
- Purchasing articles cover PR create/reopen/cancel/approval, low-stock route decision, PO statuses, and receiving variance.
- Warehouse/inventory articles cover stock balances, ledger, transfers, counts, wastage, and stock adjustments.
- Troubleshooting articles cover missing scope, missing approval ability, evidence references, and exports.
- Phase 1.5 project articles cover project access, templates, tasks, blockers, comments/checklists/evidence metadata, source-record links, milestones, risks, blocked/overdue review, close/archive, and visibility troubleshooting.

## Known Training Limits

- Training must state that UAT is still execution-pending until evidence pack signoff is complete.
- Training must point pilot users to the defect intake and support route recorded in `../07-quality/PHASE1_PHASE1_5_PILOT_HYPERCARE_AND_DEFECT_RUNBOOK.md`.
- Binary upload/download should not be taught as generally available for every Phase I operational workflow.
- Queueing, automated email delivery, and automated scheduler behavior must not be promised.
- Project tracker training must emphasize that tasks link to source records but do not mutate operational records.
- Deferred workflows must be called out: full PO amendment after issue, backdated correction, partial receiving-line reversal, transfer dispatch reversal, automated replacement/finance settlement, and formal PDF summaries. Transfer discrepancy closure is available only as a non-posting audited settlement action.

## Readiness Checklist

- [x] Branch manager quick-start created.
- [x] Warehouse/storekeeper quick-start created.
- [x] Purchasing quick-start created.
- [x] Administrator setup guide created.
- [x] Phase I knowledge-base backlog cleared.
- [x] Release readiness summary created.
- [x] Phase 1.5 project tracker knowledge-base articles created.
- [x] Phase 1.5 project tracker quick-start created.
- [ ] UAT scripts executed with tester/date/evidence/result.
- [ ] Pilot training session scheduled and attendance recorded.
- [ ] UAT defects dispositioned.
- [ ] Deployment, rollback, backup/restore evidence attached.
- [ ] Pilot support contacts, defect intake route, daily triage cadence, and rollback decision owner confirmed.
- [ ] Final release owner signs GO / NO-GO decision.

## Training Execution Evidence

Use this table during UAT or pilot preparation. Do not mark training complete until attendance, material coverage, known-limit acknowledgement, and follow-up owners are recorded.

| Audience                      | Session date/time | Trainer | Attendees / roles | Material covered                                                                                             | Known limits acknowledged | Open questions / follow-up owner | Evidence reference | Signoff by | Signoff date |
| ----------------------------- | ----------------- | ------- | ----------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------- | -------------------------------- | ------------------ | ---------- | ------------ |
| Branch managers               | Pending           | Pending | Pending           | Branch manager quick-start; dashboard/tasks/notifications; PR/approval/transfer receipt/wastage flows        | Pending                   | Pending                          | Pending            | Pending    | Pending      |
| Warehouse / storekeeper users | Pending           | Pending | Pending           | Warehouse/storekeeper quick-start; receiving, transfers, counts, wastage, adjustments, ledger controls       | Pending                   | Pending                          | Pending            | Pending    | Pending      |
| Purchasing users              | Pending           | Pending | Pending           | Purchasing quick-start; quote/PO lineage, supplier issue/send, receiving variance, exports                   | Pending                   | Pending                          | Pending            | Pending    | Pending      |
| Administrators                | Pending           | Pending | Pending           | Administrator setup guide; users, roles, scopes, approvals, audit, export controls                           | Pending                   | Pending                          | Pending            | Pending    | Pending      |
| Project users                 | Pending           | Pending | Pending           | Project tracker quick-start; tasks, blockers, milestones, source links, reports, redaction, tracker boundary | Pending                   | Pending                          | Pending            | Pending    | Pending      |

## Known-Limit Acknowledgement Checklist

Before GO, pilot users and release owners must acknowledge:

- UAT and deployment evidence remain required before release signoff.
- Project tasks coordinate work only and do not mutate PR, PO, receiving, transfer, inventory, approval, finance, wastage, or adjustment records.
- Binary upload/download is not a general release promise unless the approved shared attachment service is enabled.
- Automated job queues, background schedulers, and email delivery are not in Phase I or Phase 1.5 scope.
- Deferred controlled transitions remain deferred unless separately approved and implemented: full post-receiving PO amendment, backdated correction, partial receiving-line reversal, transfer dispatch reversal, automated replacement/finance settlement, advanced Gantt calculations, external contractor portals, public links, and custom automation builders.
