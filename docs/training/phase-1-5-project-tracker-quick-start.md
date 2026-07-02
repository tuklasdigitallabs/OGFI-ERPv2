# Phase 1.5 Project Tracker Quick Start

**Audience:** Project sponsors, project managers, contributors, viewers, and administrators with project access  
**Prerequisites:** Project tracker access, assigned project scope or membership, and any source-record permissions needed to view linked ERP records  
**Related knowledge-base articles:** Understanding Projects, Tasks, and Your Access; Creating a Project from a Template; Viewing and Completing Your Assigned Tasks; Marking a Task Blocked and Requesting Help; Linking a Task to an ERP Record; Reviewing Overdue and Blocked Work; Why Can't I See This Project or Linked Record?

## Learning Objective

After this session, users should be able to open their scoped projects, review assigned work, update task status, record blockers, review milestones and risks, use project reports, and understand that project tasks coordinate work without changing ERP source records.

## Required Access And Test Data

- One project manager or administrator who can create or open a scoped project.
- One contributor assigned to at least one task.
- One restricted project and one non-member user for visibility-denial practice.
- At least one linked ERP source record, such as a Purchase Request, Purchase Order, receiving record, transfer, supplier, inventory record, wastage report, adjustment, or approval.
- At least one project task with checklist items, comments, due date, priority, and blocker test data.

## Demonstration Flow

1. Open `Projects` and confirm only authorized projects are visible.
2. Create or open a project from a published template.
3. Review project scope, members, tasks, milestones, risks, and activity.
4. Open `Work Boards`, move a task through the allowed status flow, and confirm status changes appear in activity.
5. Open `My Work` and complete an assigned task after required checklist items are done.
6. Mark a task blocked with reason, severity, owner, and next action.
7. Resolve or cancel the blocker with a note.
8. Add a comment and evidence metadata link where available.
9. Link a task to an ERP source record and compare authorized summary vs redacted view.
10. Open Project Health, Task Register, Activity Log, Linked Record Follow-up, and Work Calendar views where permitted.

## Practice Exercise

Each participant should:

1. Open a project they are allowed to see.
2. Find an assigned task in `My Work`.
3. Add a comment.
4. Complete a required checklist item.
5. Mark the task blocked, then resolve or cancel the blocker.
6. Link or review a linked ERP source record according to their permission.
7. Export or open a project report where permitted.
8. Attempt a restricted project or source-record link they should not access and confirm the denial or redaction is user-safe.

## Common Errors And Recovery

| Issue | What to check |
|---|---|
| Project is missing | Confirm company, location, project scope, membership, restricted visibility, and archive/cancel status. |
| Linked record is redacted | Confirm the user has source-record permission in addition to project access. |
| Task cannot be completed | Complete required checklist items and confirm the task status is enabled for the project configuration. |
| Task cannot be reopened or cancelled | Confirm permission and provide the required reason. |
| Blocked status is rejected | Enter blocker reason, severity, owner, and next action. |
| Export is denied | Confirm project visibility and export permission. |

## Completion Check

- User can explain the difference between a project task and an ERP source record.
- User can find assigned work, add comments/checklist updates, and complete allowed task transitions.
- User can record and resolve or cancel a blocker with a note.
- User can identify when a linked source record is redacted because source permission is missing.
- User understands that completing, blocking, cancelling, or approving project work does not approve PRs/POs, receive stock, post inventory, close POs, or change approval states.

## Release Limits To Communicate

- The tracker is a coordination layer only.
- Restricted projects require explicit access and must not be used to bypass source-record permissions.
- Binary project attachment upload/download is not a general Phase 1.5 release promise unless separately enabled by the approved attachment service.
- Automated queueing, scheduler, and email delivery are not included in this release; use in-app notifications and manual reminder scans where implemented.
- Advanced Gantt calculations, external contractor portals, public links, and custom automation builders are outside Phase 1.5.
