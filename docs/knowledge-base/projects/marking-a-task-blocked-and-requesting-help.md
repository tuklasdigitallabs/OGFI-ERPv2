# Marking A Task Blocked And Requesting Help

**Audience / required role:** Project contributors, task owners, project managers, and sponsors  
**Applies to:** Project task blocker workflow  
**Related phase/module:** Phase 1.5 / Blockers and Notifications  
**Last verified against:** implemented task blocked status, blocker reason requirement, next review date, blocker manual resolution/cancellation, notifications, and activity history

## Purpose

Use this article when a task cannot continue because a decision, approval, delivery, access, supplier, technical, resource, or external dependency is blocking progress.

## Before You Start

- You must have permission to update the task.
- The task must not be completed or cancelled.
- You need a clear blocker reason.

## Navigation Path

`My Work`

Related view:

`Work Boards`

## Steps

1. Open `My Work` or `Work Boards`.
2. Find the affected task.
3. Select `Block`.
4. Enter the blocker reason.
5. Add the next review date when known.
6. Save the blocked status.
7. Add a comment with supporting context when useful.
8. Project Manager resolves or cancels the blocker when work can continue or the blocker no longer applies.

## Expected Result

- The task moves to `BLOCKED`.
- The blocker reason is recorded.
- A blocker record is created with severity, owner, reporter, and next-review date where provided.
- Blocker count and next review date appear on task cards where available.
- Project activity and notifications preserve the blocker event.
- Moving the task away from `BLOCKED` resolves or cancels open blockers according to the next task status.

## Important Controls And Warnings

- Blocking a task does not block or hold a linked PR, PO, receiving report, transfer, approval, or inventory record.
- If the blocker is a source-record issue, update the source record through its proper workflow.
- Do not use vague blocker reasons such as `waiting` without an owner or next action.
- Resolving a blocker does not automatically complete the task.
- Manual blocker resolution or cancellation requires a resolution note where the action is available.

## Related Articles

- Viewing and Completing Your Assigned Tasks
- Reviewing Overdue and Blocked Work
- Linking a Task to an ERP Record
