# Understanding The Dashboard, My Tasks, And Notifications

**Audience / required role:** All operational users, managers, approvers, and project users  
**Applies to:** Operations Dashboard, My Tasks, My Work, Approval Inbox, and Notifications
**Related phase/module:** Phase I and Phase 1.5 / Operational Visibility  
**Last verified against:** implemented action-first Operations Dashboard checkpoint, initial controlled My Tasks queue, closed Open Purchase Orders, Open Purchase Requests, and Transfer Follow-up drilldowns, Approval Inbox, project My Work, and scoped in-app notifications

## Purpose

Use this article to understand where to look for pending work, operational exceptions, approvals, and project task reminders.

Dashboard cards and notifications provide visibility. They do not replace the detailed source records and do not perform controlled actions by themselves.

## Main Areas

| Area | Use it for |
|---|---|
| `Operations Dashboard` | Read-only Phase I visibility from scoped source records. |
| `My Tasks` | The paginated operational action queue currently enrolled for your selected scope. It opens the source record; it does not perform the action itself. |
| `Approval Inbox` | Assigned approval decisions for controlled records. |
| `My Work` | Assigned project tracker work, task status, blockers, and due dates. |
| `Notifications` | Scoped in-app alerts for approval assignments, due/overdue approval reminders, project work, risks, milestones, and project deadline reminders. |

## Steps

1. Confirm your active location in the header.
2. Open `Operations Dashboard` and review `Today’s work` first. It lists the highest-priority assigned approvals and operational exceptions visible in your selected scope.
3. Open `My Tasks` when you need the current paginated operational action queue. It presently includes your own draft Purchase Request submission, eligible draft Purchase Order submission or approved PO supplier-send actions, Transfer, Wastage, Stock Adjustment, draft Receiving Report posting, eligible Branch Operations or Food Safety review and returned-record correction, and eligible Incident resolution.
4. Read the location, owner, timing, severity, status, and next-action labels before opening a source record.
5. Select `Open` or `Open approvals` to continue in the relevant controlled workspace. The `Open POs`, `Open PRs`, and `Transfer Follow-up` cards open their selected location's closed source-list views.
5. Open `Approval Inbox` to review assigned approval decisions.
6. Open `My Work` for project tasks assigned to you.
7. Open `Notifications` to review unread or actionable alerts.
8. If you are an approver, use `Scan Approvals` to create in-app reminders for due or overdue approvals in your assigned approval queue.
9. If you are an authorized project manager, use `Scan Reminders` to create in-app reminders for due or overdue project tasks.
10. Mark notifications read or archive them after handling the related source record.

## Expected Result

- The dashboard shows selected scope and freshness, followed by `Today’s work` and then KPI/supporting cards.
- Today’s work shows a bounded highest-priority view and states how many approvals and exceptions are currently shown. Open the source workspace for the authoritative record and complete list.
- My Tasks paginates the currently enrolled operational actions. It explicitly shows when an enrolled source is temporarily unavailable and withholds the total instead of treating that source as having no work.
- Branch Operations review tasks exclude a checklist you opened or most recently submitted. Returned-checklist correction is pooled branch work for authorized creators in the selected scope; it is not a personal assignment. Final checklist close is not currently enrolled in My Tasks.
- Food Safety review tasks exclude logs you recorded and logs whose recorder cannot be verified. Returned-log correction is pooled work for authorized creators in the selected scope. Final Food Safety close is not currently enrolled in My Tasks.
- Incident resolution is role-pooled for authorized resolvers. High- and critical-severity incidents require a known reporter and an independent resolver; low- and medium-severity incidents follow the current scoped resolver policy. Cancellation and ordinary incident-detail correction are not separate My Tasks items.
- My Tasks orders critical before high, medium, and low priority. Within one priority, dated work appears by earliest due date before undated work, then by age. Due-state wording such as overdue or due today uses the company operating day; it does not change the signed page cursor's stable absolute-date order.
- Dashboard cards show source-record counts and exceptions for your selected scope.
- `Open POs` opens a paginated list of the same open PO lifecycle used by that dashboard count. Its CSV export uses that same list; use `Clear dashboard filter` to return to normal Purchase Order filtering.
- `Open PRs` opens a paginated list of the same open PR lifecycle used by that dashboard count: Draft, Pending Approval, Approved, and Returned. Its CSV export uses that same list; use `Clear dashboard filter` to return to normal Purchase Request filtering.
- `Transfer Follow-up` opens a paginated list of requested, dispatched, partially received, and disputed transfers where your selected location is either endpoint. Its CSV export uses that same list. The drilldown is read-only: use the controlled transfer record for any permitted dispatch, receipt, settlement, or reversal action.
- Approval Inbox shows records assigned to you or your active approval role.
- My Work shows project tasks according to project visibility and assignment.
- Notifications show scoped alerts and links to the related work where available.
- Manual reminder scans show scanned/reminder counts and create notifications only for records the user is already authorized to see.

## Important Controls And Warnings

- Dashboard cards are read-only and do not approve, post, receive, dispatch, or reverse records.
- A dashboard drilldown narrows an already authorized source list. It does not grant access to a PO, PR, or transfer; alter the selected scope; or permit changing the dashboard filter through the URL.
- `Today’s work` is a prioritized read-only view. Opening an item does not bypass the source record’s permission, status, or segregation-of-duties checks.
- `My Tasks` is not a replacement for Approval Inbox or project `My Work`, and it does not yet include every operational source. Its signed page cursor only continues the current queue page; it does not grant access or action authority.
- If a task page expires or no longer matches your user, scope, permissions, or the current source registry, My Tasks restarts at page one and explains the reset. It never weakens cursor validation to preserve an old page.
- A role-pooled My Tasks item means your role may perform the displayed action in the selected scope. Another authorized user may complete it first, so the source record always rechecks its current status and your authority when opened.
- A Purchase Request draft may only be submitted by its recorded requester. The system does not treat location read access as authority to submit another person’s request; submission on behalf requires a separate approved delegation workflow.
- When the dashboard says the approval preview is unavailable, open `Approval Inbox` to see and act on controlled approval work. This is not a zero-approval result and does not change who can approve a record.
- Notifications are reminders or alerts; the source record remains the controlling record.
- `Scan Approvals` and `Scan Reminders` are manual in-app reminder tools. They do not approve, reject, post, receive, close, reverse, or escalate authority.
- Project tasks may link to ERP records, but completing a task does not approve a PR/PO, receive stock, post inventory, or change finance records.
- If a card or notification is missing, check location, permission, scope, and filters.

## Related Articles

- Why can't I see my branch, warehouse, or request?
- Why can't I approve this request?
- How to export a report
