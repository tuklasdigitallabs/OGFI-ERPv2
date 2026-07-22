# Understanding The Dashboard, My Tasks, And Notifications

**Audience / required role:** All operational users, managers, approvers, and project users  
**Applies to:** Operations Dashboard, My Work, Approval Inbox, and Notifications  
**Related phase/module:** Phase I and Phase 1.5 / Operational Visibility  
**Last verified against:** implemented action-first Operations Dashboard checkpoint, Approval Inbox, project My Work, and scoped in-app notifications

## Purpose

Use this article to understand where to look for pending work, operational exceptions, approvals, and project task reminders.

Dashboard cards and notifications provide visibility. They do not replace the detailed source records and do not perform controlled actions by themselves.

## Main Areas

| Area | Use it for |
|---|---|
| `Operations Dashboard` | Read-only Phase I visibility from scoped source records. |
| `Approval Inbox` | Assigned approval decisions for controlled records. |
| `My Work` | Assigned project tracker work, task status, blockers, and due dates. |
| `Notifications` | Scoped in-app alerts for approval assignments, due/overdue approval reminders, project work, risks, milestones, and project deadline reminders. |

## Steps

1. Confirm your active location in the header.
2. Open `Operations Dashboard` and review `Today’s work` first. It lists the highest-priority assigned approvals and operational exceptions visible in your selected scope.
3. Read the location, owner, timing, severity, status, and next-action labels before opening a source record.
4. Select `Open` or `Open approvals` to continue in the relevant controlled workspace.
5. Open `Approval Inbox` to review assigned approval decisions.
6. Open `My Work` for project tasks assigned to you.
7. Open `Notifications` to review unread or actionable alerts.
8. If you are an approver, use `Scan Approvals` to create in-app reminders for due or overdue approvals in your assigned approval queue.
9. If you are an authorized project manager, use `Scan Reminders` to create in-app reminders for due or overdue project tasks.
10. Mark notifications read or archive them after handling the related source record.

## Expected Result

- The dashboard shows selected scope and freshness, followed by `Today’s work` and then KPI/supporting cards.
- Today’s work shows a bounded highest-priority view and states how many approvals and exceptions are currently shown. Open the source workspace for the authoritative record and complete list.
- Dashboard cards show source-record counts and exceptions for your selected scope.
- Approval Inbox shows records assigned to you or your active approval role.
- My Work shows project tasks according to project visibility and assignment.
- Notifications show scoped alerts and links to the related work where available.
- Manual reminder scans show scanned/reminder counts and create notifications only for records the user is already authorized to see.

## Important Controls And Warnings

- Dashboard cards are read-only and do not approve, post, receive, dispatch, or reverse records.
- `Today’s work` is a prioritized read-only view. Opening an item does not bypass the source record’s permission, status, or segregation-of-duties checks.
- Notifications are reminders or alerts; the source record remains the controlling record.
- `Scan Approvals` and `Scan Reminders` are manual in-app reminder tools. They do not approve, reject, post, receive, close, reverse, or escalate authority.
- Project tasks may link to ERP records, but completing a task does not approve a PR/PO, receive stock, post inventory, or change finance records.
- If a card or notification is missing, check location, permission, scope, and filters.

## Related Articles

- Why can't I see my branch, warehouse, or request?
- Why can't I approve this request?
- How to export a report
