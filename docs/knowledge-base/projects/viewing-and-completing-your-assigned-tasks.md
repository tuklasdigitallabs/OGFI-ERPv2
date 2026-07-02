# Viewing And Completing Your Assigned Tasks

**Audience / required role:** Project contributors, task owners, project managers, and authorized viewers  
**Applies to:** My Work and Work Boards  
**Related phase/module:** Phase 1.5 / Project Tasks  
**Last verified against:** implemented My Work, Work Boards, task transitions, checklist completion gate, actor/timestamp completion, blocker handling, and optimistic version feedback

## Purpose

Use this article to find your assigned work, update task status, and complete tasks when work is actually done.

Task completion records the project work outcome only. It does not complete or mutate linked ERP source records.

## Before You Start

- You must have project access.
- The task must be visible to you through assignment, ownership, membership, or project scope.
- Required checklist items must be complete before task completion.

## Navigation Path

`My Work`

Related view:

`Work Boards`

## Steps

1. Open `My Work`.
2. Review assigned tasks, due dates, priority, checklist count, comments, blockers, and linked records.
3. Open the task detail when you need full context.
4. Select `Start` to move eligible work to `IN_PROGRESS`.
5. Complete required checklist items.
6. Add comments or evidence metadata when needed.
7. Select `Complete` when the task outcome is done.
8. If completed work must resume, reopen with a reason where permitted.

## Task Statuses

Project templates define which task statuses are enabled. The implemented status set includes `BACKLOG`, `PLANNED`, `IN_PROGRESS`, `WAITING_FOR_APPROVAL`, `BLOCKED`, `FOR_REVIEW`, `COMPLETED`, and `CANCELLED`.

## Expected Result

- Started tasks move to `IN_PROGRESS`.
- Completed tasks record completed-by and completed-at.
- Required checklist items block completion until finished.
- Reopened completed tasks require a reason and activity history preserves the change.
- Reopening from `COMPLETED` or `CANCELLED` requires a reason when permitted.

## Important Controls And Warnings

- Do not complete a task to indicate a PR, PO, receiving, inventory, finance, or approval record is complete.
- Use the linked source record for controlled ERP actions.
- Stale task versions may be rejected if another user updated the task first.
- Cancelled tasks cannot be edited through ordinary task actions.
- Tasks cannot move to a status that is not enabled for the project template/configuration.

## Related Articles

- Marking a Task Blocked and Requesting Help
- Adding Comments, Checklists, and Evidence
- Linking a Task to an ERP Record
