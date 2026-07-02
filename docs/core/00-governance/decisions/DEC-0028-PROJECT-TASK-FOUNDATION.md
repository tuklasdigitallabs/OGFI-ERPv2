# DEC-0028 — Project Task Foundation Slice

## Status

Accepted for implementation.

## Context

Phase 1.5 requires real project tasks, owners, deadlines, blockers, comments, checklist state, board/list views, and activity history without making the tracker the source of truth for procurement, inventory, approvals, accounting, or other controlled ERP records.

Subagent deliberation recommended a narrow second slice after `DEC-0027`: implement task-state integrity and scoped board/My Work surfaces first, then add milestones, source-record links, reports, and notification behavior only after task access controls are verified.

## Decision

Implement the following additive Phase 1.5 task foundation:

- `ProjectTask`
- `ProjectTaskAssignee`
- `ProjectTaskChecklistItem`
- `ProjectComment`
- `ProjectBlocker`
- project-scoped board and assigned My Work views
- server-side task creation and status transition service
- activity events written in the same transaction as task creation/status changes

Defer the following to later slices:

- milestones and calendar semantics
- task dependencies and full risk lifecycle
- source-record links and safe source-summary adapters
- project reports and exports
- attachment access rules
- notification escalation

## Required Safeguards

- All task reads and writes use tenant/company/project authorization.
- Restricted project visibility remains controlled by explicit membership, project scope, or project manager permission with company manage scope.
- Viewer project members cannot mutate tasks.
- Blocked tasks require a blocker reason and activity history.
- Completed tasks record completed-by and completed-at.
- Cancelled and reopened tasks require reasons.
- Task status buttons and future drag/drop board actions must call the same server transition service.
- Task completion, blocking, cancellation, or approval must not mutate PR, PO, receiving, transfer, inventory, wastage, adjustment, supplier, finance, or approval source records.

## Migration Notes

Use additive migration `20260701023000_project_task_foundation`. The migration creates enums, task-owned tables, indexes, FKs, and database checks for blocked/completed/cancelled/reopen field integrity. Existing project and operational records are preserved.

## Tests

Required before considering this slice stable:

- Prisma schema validation and client generation.
- Typecheck for the web app.
- Unit tests for task transition invariants and project task mutation access.
- Test proving the task service does not import operational mutation services.
- Navigation/preview tests proving My Work and Work Boards are real routes, not previews.

## Open Follow-Ups

- Add milestone models, calendar views, and overdue logic.
- Add source-record link table and safe-summary adapters.
- Add task comments/checklist mutation UI beyond the initial data model.
- Add project dashboard/report/export views after source-record privacy is implemented.
