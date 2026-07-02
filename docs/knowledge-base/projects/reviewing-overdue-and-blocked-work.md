# Reviewing Overdue And Blocked Work

**Audience / required role:** Project managers, sponsors, contributors, and implementation leads  
**Applies to:** Project Health, Work Boards, My Work, Work Calendar, notifications, and reports  
**Related phase/module:** Phase 1.5 / Project Visibility and Reports  
**Last verified against:** implemented project dashboard, Work Boards, My Work due-state indicators, blocker counts, Work Calendar overdue events, notifications, and project CSV exports

## Purpose

Use this article to find work that needs attention: overdue tasks, blocked tasks, at-risk milestones, open risks, and linked-record follow-up.

## Navigation Paths

- `Projects`
- `Work Boards`
- `My Work`
- `Work Calendar`
- `Notifications`
- `Reports`

## Steps

1. Open `Projects`.
2. Review `Project Health` for blocked, overdue, linked-record, and milestone indicators.
3. Open `Work Boards` and select the project.
4. Review the `BLOCKED` column and task cards with overdue labels.
5. Open `My Work` to see your assigned overdue or blocked tasks.
6. Open `Work Calendar` to review overdue task dates and at-risk milestones.
7. Open `Notifications` for assigned work, blockers, risk, milestone, or reminder alerts.
8. Export project health, task register, activity, or linked-record follow-up CSVs where permitted.

## Expected Result

- Managers can identify who owns the task, when it is due, and why it is blocked.
- Contributors can open the task and update status, comments, checklist, or blocker information when permitted.
- Sponsors can see risk and milestone health without mutating source ERP records.
- Due-state and overdue labels use server-side date-only logic with the project default timezone of `Asia/Manila`.

## Important Controls And Warnings

- Dashboard and report views are visibility tools, not workflow mutations.
- Project reports do not replace source records.
- Restricted linked records remain redacted for users without source permission.
- Notifications do not approve, post, receive, or close operational records.
- Project CSV exports enforce project visibility and avoid exposing restricted linked-record payloads.

## Related Articles

- Marking a Task Blocked and Requesting Help
- Understanding Project Status, Milestones, and Risks
- How To Export A Report
