# Work Management Shared Engine — Extension Specification

## Purpose

Provide the reusable coordination layer for projects, campaigns, tasks, calendars, boards, assignments, comments, attachments, reminders, and activity history across OGFI ERP without replacing controlled operational or financial source workflows.

## Scope

### In scope

- Workspace and project containers
- Board/list/status templates
- Work items and sub-items
- One accountable owner plus multiple assignees/reviewers/approvers/watchers
- Checklists, dependencies, comments, attachments, activity history
- Blockers, risks, due dates, milestones, reminders, and notifications
- Board, list, calendar, and My Work views
- Links to controlled ERP records
- Project/campaign membership and restricted visibility
- Archive/restore behavior

### Out of scope for the first implementation

- External collaborator portal
- Public sharing links
- Full Gantt calculation or automatic critical-path engine
- Automatic workload optimization
- Generic automation-builder UI
- Chat replacement
- Financial, inventory, procurement, approval, or accounting actions triggered by work-item completion

## Shared object model

```text
Workspace
  └─ Work Container (Project, Campaign, Program, Rollout)
       ├─ Board / Workflow
       ├─ Workstream
       ├─ Milestone
       ├─ Work Item
       │   ├─ Checklist
       │   ├─ Assignment
       │   ├─ Dependency
       │   ├─ Comment
       │   ├─ Attachment
       │   ├─ Linked ERP Record
       │   └─ Activity Event
       ├─ Risk / Blocker
       └─ Calendar Event
```

Specialized modules own additional entities but use the same work-item and collaboration model.

## Authorization and visibility

Every shared record must carry company scope. Where applicable it also carries brand, location, department, project, campaign, and membership scope.

Access is granted by the intersection of:

1. User role and permission
2. Organizational scope
3. Explicit container membership where required
4. Restricted-container membership where the item is confidential

UI hiding is not authorization. Every read and write action must be server-authorized.

## Work-item states

State names are template-configurable, but the engine must support these semantic categories:

- Draft / backlog
- Planned
- Active
- Waiting for approval
- Waiting for external party
- Blocked
- Review
- Completed
- Cancelled
- Archived

Rules:

- `Blocked` requires a blocker reason, responsible party, and date raised.
- Completion requires completion authority and must preserve checklist and evidence state.
- Cancellation requires a reason and does not delete history.
- Archive is not delete. Archived records remain searchable according to permission and retention policy.
- Transition rules are enforced by the server and recorded in activity history.

## Calendar and timeline rules

- Support date-only all-day items and timezone-aware scheduled items separately.
- Default operating timezone is Asia/Manila unless a later approved global policy changes it.
- Calendar views show authorized work only.
- Milestones may be represented as date-only or scheduled events.
- Timeline/Gantt is a later view over existing dates/dependencies, not a separate source of truth.

## Linked ERP records

A work item may reference a Purchase Request, PO, receiving record, transfer, invoice, payment request, supplier, branch, project budget, asset, campaign, promotion, new-item record, or controlled future record.

The link may show authorized summary/status information. It must not allow task status to mutate the linked record’s controlled state.

## Minimum quality requirements

- Optimistic-concurrency or equivalent stale-update protection for move/reorder/state updates.
- Idempotent activity/notification side effects.
- Attachment authorization and audit events.
- No hard-delete of material records.
- Consistent My Work results across specialized modules.
- Filter/export behavior respects the same scope model as list/board/calendar views.
