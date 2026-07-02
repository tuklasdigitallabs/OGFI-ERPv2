# DEC-0033 — Project Task Register Export

## Status

Accepted

## Context

The Phase 1.5 implementation plan requires project dashboard/report views for active projects, overdue tasks, blocked tasks, milestone status, owner workload, project activity, and linked-record follow-up. Earlier reporting notes deferred task-grain exports until privacy and source-record boundaries were confirmed.

## Decision

Enable a narrow `Project Task Register` CSV export for authorized project-report users. The export is task-grain and metadata-only. It may include project code/name, task key/title, task status, priority, owner display name, due date, completion timestamp, blocked flag, checklist counts, comment count, attachment count, and open blocker count.

It must not export project/task UUIDs, task descriptions, comment bodies, attachment IDs, object keys, URLs, source-record IDs/types, blocker reasons, operational payloads, or linked-record details.

## Controls

- Use existing project export permission checks and per-user export throttling.
- Query only tasks under `listAuthorizedProjectAccess`.
- Log denied, started, and completed audit events with report ID `project-task-register`.
- Preserve source-of-truth boundaries: the report reads project/task metadata only and does not mutate projects, tasks, source records, approvals, inventory, purchasing, or attachments.
- Keep binary upload/download, object-key exposure, and secure file delivery out of this slice.

## Consequences

The earlier deferred reporting note is superseded only for this narrow task-register export. Linked-record follow-up, task activity-log exports, attachment download delivery, and richer workload analytics remain deferred.

## Implementation Evidence

- `apps/web/src/server/services/projectReports.ts` exposes `projectTaskRegisterExportHeaders` and `buildProjectTaskRegisterExportRows`.
- `apps/web/src/app/(app)/projects/tasks/export/route.ts` serves `project-task-register.csv` through the shared CSV response helper.
- `apps/web/src/server/services/reports.test.ts` verifies the task-register header contract remains metadata-only and excludes project/task UUIDs, task descriptions, comment bodies, attachment IDs/object keys, source-record IDs/types, blocker reasons, and assignee-list payloads.
- `apps/web/src/server/services/projectDashboard.test.ts` verifies the project export routes are wired and project reporting does not import operational mutation services.
