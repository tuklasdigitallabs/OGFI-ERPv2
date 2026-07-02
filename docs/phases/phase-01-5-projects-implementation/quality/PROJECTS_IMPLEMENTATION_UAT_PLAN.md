# Projects & Implementation Tracker — UAT Plan

Execution evidence and release signoff must be recorded in `docs/core/07-quality/PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md`. This plan defines scenarios; it is not itself proof that UAT passed.

## UAT participants

- Project Manager
- Branch Manager / Contributor
- Operations Manager
- Purchasing or Finance stakeholder
- System Administrator
- Security/QA reviewer

## Core scenarios

1. Create a scoped project from template.
2. Apply template without affecting template or another project after editing the new project.
3. Add contributors, viewers, and restricted-project members.
4. Create, assign, prioritize, and complete tasks with comments and evidence.
5. Mark task blocked; verify reason, notifications, and escalation.
6. Link task to PO/PR/transfer; verify no mutation and no unauthorized data exposure.
7. Verify desktop board/list/calendar and mobile My Tasks/task detail.
8. Verify overdue task calculation in Asia/Manila default timezone and test with user timezone rendering.
9. Verify archive/cancel/reopen produces activity history.
10. Verify export and report permissions.

## Exit criteria

- No critical authorization or data-leak defects.
- No task action can mutate a linked controlled record.
- Project lifecycle and task activity are auditable.
- Mobile completion flow usable by branch participants.
- Training/knowledge-base gaps recorded and release owner signs off.
