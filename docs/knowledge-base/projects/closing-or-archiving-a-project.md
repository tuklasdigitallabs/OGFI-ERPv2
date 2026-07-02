# Closing Or Archiving A Project

**Audience / required role:** Project Managers and Project Administrators  
**Applies to:** Project lifecycle completion, cancellation, and archive  
**Related phase/module:** Phase 1.5 / Project Lifecycle  
**Last verified against:** implemented lifecycle transitions, reason requirements, active-task/open-blocker/open-risk closure gates, optimistic version checks, activity history, and audit events

## Purpose

Use this article when a project is ready to be completed, cancelled, or archived.

Closing a project records the coordination outcome only. It does not close linked Purchase Orders, approvals, receiving reports, transfers, inventory records, or finance records.

## Before You Start

- You must have project lifecycle management access.
- Active tasks must be completed or cancelled.
- Open blockers must be resolved or cancelled.
- Open, mitigating, or realized risks must be closed, accepted, mitigated, or otherwise resolved according to policy.
- Cancellation and archive require a reason.

## Navigation Path

`Projects`

## Steps

1. Open `Projects`.
2. Find the project in `Project Registry`.
3. Review task progress, blocked work, risks, milestones, members, and linked records.
4. For active projects, select `Complete` when work is done.
5. Select `Hold` or `Cancel` with reason when execution must pause or stop.
6. For completed or cancelled projects, select `Archive` with reason when the project should leave active views.
7. Review activity history after the transition.

## Supported Transitions

- `DRAFT` can move to `ACTIVE` or `CANCELLED`.
- `ACTIVE` can move to `ON_HOLD`, `COMPLETED`, or `CANCELLED`.
- `ON_HOLD` can move to `ACTIVE` or `CANCELLED`.
- `COMPLETED` can move to `ARCHIVED`.
- `CANCELLED` can move to `ARCHIVED`.

## Expected Result

- Valid lifecycle transition is recorded.
- Reason is stored for hold, cancel, or archive.
- Completion, cancellation, and archive are blocked when active tasks, open blockers, or open risks remain.
- Project activity and audit events preserve actor, timestamp, status change, and reason where applicable.

## Important Controls And Warnings

- Do not archive a project to hide unresolved work.
- Do not use project completion as proof that linked operational records are closed.
- Reopen after cancellation/completion and formal project gate approvals remain future policy decisions.
- If a lifecycle action fails, review active tasks, open blockers, open risks, permissions, and stale-version feedback.
- Restricting or unrestricting project visibility is not documented as a normal user-facing lifecycle action in this release.

## Related Articles

- Understanding Project Status, Milestones, and Risks
- Reviewing Overdue and Blocked Work
- Linking a Task to an ERP Record
