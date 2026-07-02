# Work Management Shared Engine — UAT Plan

## Purpose

Validate shared work-management behavior before specialized Expansion or Marketing modules rely on it.

## Core UAT scenarios

1. Create a work container with valid company scope and authorized membership.
2. Create a draft work item; verify an accountable owner is required when activation rules require it.
3. Add multiple assignees, reviewer, approver, and watcher; verify distinct permissions and notifications.
4. Reassign accountable ownership; verify authorization, history, and notifications.
5. Move an item through allowed Kanban states; reject invalid transition.
6. Mark item blocked; verify required blocker fields and escalation behavior.
7. Mark item ready for review; verify required checklist/evidence validation.
8. Complete/reopen/cancel/archive; verify audit history, search behavior, and no hard deletion.
9. Add a controlled ERP link; verify it is view-only and cannot alter source record state.
10. Add an attachment/comment to a restricted container; verify unauthorized user cannot read it via direct URL/API.
11. Test Board/List/Calendar/My Work filters for company/brand/location/project scope.
12. Create date-only and scheduled events; verify display remains correct in Asia/Manila.
13. Two users update the same work item; verify stale/conflict handling does not silently overwrite.
14. Create dependency and verify circular dependency is rejected.
15. Trigger reminders/notifications; verify no duplicate delivery after retry.

## Release gates

- Permission and restricted-container tests pass.
- Activity history and archive behavior are auditable.
- Concurrent update behavior is safely handled.
- Calendar date handling is correct for date-only and scheduled items.
- Links to controlled ERP records cannot bypass source workflows.
- No critical unresolved defect in assignment, visibility, audit, attachment, or notification controls.
