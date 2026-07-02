# DEC-0029 — Project Milestone and Calendar Foundation

## Status

Accepted for implementation.

## Context

Phase 1.5 requires milestone and calendar visibility for implementation work, but the tracker must remain a coordination layer. Calendar views must not become a duplicate source of truth, leak restricted project metadata, mutate operational records, or introduce queueing.

## Decision

Implement a narrow additive milestone/calendar foundation:

- Add project-owned milestones with tenant/company/project scope.
- Add date-only planning fields for project and task calendar views.
- Derive the Work Calendar from authorized project task due dates and milestone target dates.
- Do not persist a separate calendar-event table.
- Do not add Gantt, dependency scheduling, source-record links, reports, exports, or notification queues in this slice.

## Required Safeguards

- Calendar events are returned only for currently authorized projects.
- Restricted projects return no hidden placeholders, counts, titles, owner names, or metadata to unauthorized users.
- My Work and calendar reads must require current project access, not just stale owner/assignee relationships.
- Milestone create/status changes write `ProjectActivityEvent` in the same transaction.
- At-risk milestones require a reason.
- Cancelled milestones require actor/time/reason.
- Achieved milestones require actor/time.
- Date-only values are serialized as `YYYY-MM-DD`.
- Milestone/task/calendar actions must not mutate PR, PO, receiving, transfer, inventory, wastage, adjustment, supplier, finance, or approval records.

## Migration Notes

Use additive migration `20260701033000_project_milestone_calendar_foundation`.

- Adds `ProjectCalendarDateKind` and `ProjectMilestoneStatus`.
- Adds `Project.startDate`, `Project.targetEndDate`, `Project.actualEndDate`.
- Adds `ProjectTask.startDate`, `ProjectTask.dueDate`.
- Creates `ProjectMilestone`.
- Backfills date-only fields from existing timestamps using `Asia/Manila` calendar dates.
- Does not modify operational or inventory tables.

## Tests

Required before this slice is stable:

- Prisma schema validation and client generation.
- Web typecheck.
- Milestone reason/permission/date-only unit tests.
- Navigation test proving Work Calendar is live, not a preview.
- Broad non-DB regression suite.

## Open Follow-Ups

- Add milestone editing and stale-version date-change protection.
- Add task date-change activity events when date editing is exposed.
- Add source-record links and safe-summary adapters.
- Add project dashboard/report/export views after source-record privacy is implemented.
