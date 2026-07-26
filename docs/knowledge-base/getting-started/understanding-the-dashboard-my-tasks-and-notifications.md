# Understanding The Dashboard, My Tasks, And Notifications

**Audience / required role:** All operational users, managers, approvers, and project users  
**Applies to:** Operations Dashboard, My Tasks, My Work, Approval Inbox, and Notifications
**Related phase/module:** Phase I and Phase 1.5 / Operational Visibility  
**Last verified against:** implemented action-first Operations Dashboard with per-source observation status, initial controlled My Tasks queue, closed Open Purchase Orders, Open Purchase Requests, Transfer Follow-up, Receiving Follow-up, Checklist Exceptions, Checklist Reviews, Food Safety Exceptions, Food Safety Reviews, Incident drilldowns, and Maintenance drilldowns; feature-disabled Approval Inbox; project My Work; and scoped in-app notifications

## Purpose

Use this article to understand where to look for pending work, operational exceptions, approvals, and project task reminders.

Dashboard cards and notifications provide visibility. They do not replace the detailed source records and do not perform controlled actions by themselves.

## Main Areas

| Area | Use it for |
|---|---|
| `Operations Dashboard` | Read-only Phase I visibility from scoped source records. |
| `My Tasks` | The paginated operational action queue currently enrolled for your selected scope. It opens the source record; it does not perform the action itself. It is not yet a complete cross-module filtered task list. |
| `Approval Inbox` | Assigned approval decisions after normalized routing is activated. It currently shows an unavailable state and no queue. |
| `My Work` | Assigned project tracker work, task status, blockers, and due dates. |
| `Notifications` | Scoped in-app alerts for approval assignments, due/overdue approval reminders, project work, risks, milestones, and project deadline reminders. |

## Steps

1. Confirm your active location in the header.
2. Open `Operations Dashboard` and review `Today’s work` first. It lists the highest-priority assigned approvals and operational exceptions visible in your selected scope.
3. Read `Dashboard assembled` for the time this dashboard response was put together. Expand `Dashboard source status` to see whether each source the server authorized and attempted was available, and when that attempt was checked. These times are displayed in `Asia/Manila`.
4. If `Dashboard source status` reports a partial response, open each unavailable source with `Open source` before deciding that no work or exception exists. A missing summary is not a zero result.
5. Open `My Tasks` when you need the current paginated operational action queue. It presently includes your own draft Purchase Request submission, eligible draft Purchase Order submission or approved PO supplier-send actions, Transfer, Wastage, Stock Adjustment, draft Receiving Report posting, assigned first-pass Stock Count start, entry, or submission, eligible Branch Operations or Food Safety review and returned-record correction, eligible Incident resolution, and eligible Maintenance completion.
6. Read the location, owner, timing, severity, status, and next-action labels before opening a source record.
7. Select `Open` or `Open approvals` to continue in the relevant controlled workspace. The `Open POs`, `Open PRs`, `Transfer Follow-up`, `Receiving Follow-up`, `Checklist Exceptions`, `Checklist Reviews`, `Food Safety Exceptions`, and `Food Safety Reviews` cards open closed source-list views for the selected scope.
8. Use `Checklist Exceptions` to inspect affected branch checklists. Its card value counts exception lines; the destination reports that value separately from the number of affected checklists.
9. Use `Checklist Reviews` to inspect all scoped checklists in `SUBMITTED` or `MANAGER REVIEW`. This is an oversight view, not a list of work personally assigned to you.
10. Use `Food Safety Exceptions` to inspect affected logs. Its card value counts exception readings across scoped history; the destination reports that value separately from the number of affected logs.
11. Use `Food Safety Reviews` to inspect all scoped logs in `SUBMITTED` or `EXCEPTION REVIEW`. This is an oversight view, not a list of work personally assigned to you.
12. Use `Open Incidents`, `Critical incidents`, `Incident review`, or `Incident overdue` to inspect its fixed read-only Incident population. These are overlapping oversight lenses, not totals to add together.
13. Use `Maintenance Follow-up`, `Critical maintenance`, `Pending vendor`, or `Maintenance overdue` to inspect its fixed read-only Maintenance population. These are overlapping oversight lenses, not totals to add together.
14. Open `Approval Inbox` to check availability. If it is unavailable, it exposes no queue or actions; do not infer that there are no pending approvals.
15. Open `My Work` for project tasks assigned to you.
16. Open `Notifications` to review unread or actionable alerts.
17. If you are an approver, use `Scan Approvals` to create current-user reminders for eligible due or overdue approvals. While Approval Inbox is unavailable, this scan is only a partial reminder mechanism: its links cannot open an approval action and it does not provide a complete queue.
18. If you are an authorized project manager, use `Scan Reminders` to create in-app reminders for due or overdue project tasks.
19. Mark notifications read or archive them after handling the related source record.

## Expected Result

- The dashboard shows the selected scope, the response's `Dashboard assembled` time, and per-source status, followed by `Today’s work` and then KPI/supporting cards.
- `Dashboard assembled` and each source's `Checked` time describe this response's observation in `Asia/Manila`; they do not say when the underlying records last changed.
- `Source data as of` appears only when that source supplies a documented, source-native as-of time. Its absence does not mean the source was unavailable.
- A partial dashboard withholds affected totals or labels shown items as coming from available sources. It does not turn an unavailable source summary into zero.
- Today’s work shows a bounded highest-priority view and states how many approvals and exceptions are currently shown. Open the source workspace for the authoritative record and complete list.
- My Tasks paginates the currently enrolled operational actions. It explicitly shows when an enrolled source is temporarily unavailable and withholds the total instead of treating that source as having no work.
- Branch Operations review tasks exclude a checklist you opened or most recently submitted. Returned-checklist correction is pooled branch work for authorized creators in the selected scope; it is not a personal assignment. Final checklist close is not currently enrolled in My Tasks.
- Food Safety review tasks exclude logs you recorded and logs whose recorder cannot be verified. Returned-log correction is pooled work for authorized creators in the selected scope. Final Food Safety close is not currently enrolled in My Tasks.
- Incident resolution is role-pooled for authorized resolvers. High- and critical-severity incidents require a known reporter and an independent resolver; low- and medium-severity incidents follow the current scoped resolver policy. Cancellation and ordinary incident-detail correction are not separate My Tasks items.
- Maintenance completion is role-pooled for authorized maintainers. Critical- and high-priority tickets require a known reporter and an independent maintainer; medium- and low-priority tickets follow the current scoped completion policy. Cancellation and ticket correction are not separate My Tasks items. Ticket correction requires the dedicated Maintenance correction permission.
- Stock Count work is personal to the assigned counter on the immutable current attempt. My Tasks shows one next action for an eligible first-pass count: start it on or after its scheduled operating date, enter its incomplete snapshot, or submit it after every snapshot line is counted. A stale session assignment or status is not enough to create a task. Recount, review, cancellation, empty snapshots, and variance-adjustment work are not enrolled. Starting a freeze-enabled count blocks inventory posting at that inventory location until the count leaves its active freeze state.
- My Tasks orders critical before high, medium, and low priority. Within one priority, dated work appears by earliest due date before undated work, then by age. Due-state wording such as overdue or due today uses the company operating day; it does not change the signed page cursor's stable absolute-date order.
- Dashboard cards show source-record counts and exceptions for your selected scope.
- `Open POs` opens a paginated list of the same open PO lifecycle used by that dashboard count. Its CSV export uses that same list; use `Clear dashboard filter` to return to normal Purchase Order filtering.
- `Open PRs` opens a paginated list of the same open PR lifecycle used by that dashboard count: Draft, Pending Approval, Approved, and Returned. Its CSV export uses that same list; use `Clear dashboard filter` to return to normal Purchase Request filtering.
- `Transfer Follow-up` opens a paginated list of requested, dispatched, partially received, and disputed transfers where your selected location is either endpoint. Its CSV export uses that same list. The drilldown is read-only: use the controlled transfer record for any permitted dispatch, receipt, settlement, or reversal action.
- `Receiving Follow-up` opens a searchable, paginated list of unposted drafts, posting receipts, active recorded discrepancies, and discrepancy-bearing reversals in progress at the selected receiving location. A row is labeled `Unposted draft`, `Posting in progress`, `Discrepancy recorded`, or `Reversal in progress`. The list and its CSV export share the same fixed population. It is a monitoring and navigation view, not a discrepancy-resolution queue; posting and reversal remain independently authorized actions on Receiving Report detail.
- `Checklist Exceptions` opens a read-only Branch Operations profile containing checklists with exception lines in the selected scope. The dashboard card counts exception lines; the destination states both the exception-line total and affected-checklist total.
- `Checklist Reviews` opens a read-only Branch Operations profile containing all scoped `SUBMITTED` and `MANAGER REVIEW` checklists. It is not filtered to the current user's personal tasks.
- Both Branch Operations profiles preserve their selected scope and membership while allowing Search to narrow the list. Raw status, shift, or business-date values cannot widen them. An invalid or retired profile fails visibly, and checklist detail preserves the return path to the profile.
- `Food Safety Exceptions` opens a read-only profile of logs with exception readings in the selected scope. The dashboard card counts exception readings across scoped history; the destination states both the reading total and affected-log total. The count does not say those readings are currently open or unresolved.
- `Food Safety Reviews` opens a read-only profile containing all scoped `SUBMITTED` and `EXCEPTION REVIEW` logs. It is not filtered to the current user's personal tasks.
- Both Food Safety profiles preserve their selected scope and membership while allowing Search to narrow the list. Raw status, log type, or business-date values cannot widen them; create and export controls remain hidden. An invalid or retired profile fails visibly, and log detail preserves the return path to the profile.
- The four Incident profiles are read-only, selected-scope lenses that may overlap. Open includes `OPEN`, `IN_PROGRESS`, and `PENDING_REVIEW`; Critical includes every critical incident across all statuses, including resolved and cancelled history; Incident Review includes all scoped `PENDING_REVIEW` incidents and is not a personal task queue; Overdue applies its saved due-date cutoff to current records.
- Incident profile Search is bounded to 120 characters and can only narrow the fixed population. Raw status, severity, or incident-date values cannot redefine it. Create and export are unavailable, unsupported profile context fails visibly, and Incident detail and actions preserve a safe return to the same profile.
- An Incident overdue link is not a historical snapshot. The due-date cutoff stays fixed in the saved link, while current status, resolution, cancellation, and corrected due dates determine the rows now. An older link offers a route to the current overdue cutoff.
- The four Maintenance profiles are read-only, selected-scope lenses that may overlap. Follow-up includes `OPEN`, `IN_PROGRESS`, and `PENDING_VENDOR`; Critical includes every critical-priority ticket across all statuses, including completed and cancelled history; Pending Vendor includes all scoped `PENDING_VENDOR` tickets and is not a personal assignment queue; Overdue includes active tickets whose target due date is before its saved cutoff and whose completion date is empty.
- Maintenance profile Search is bounded to 120 characters and only searches visible ticket fields within the fixed population. Raw status, priority, requested-date, or other values cannot redefine it. Create and export are unavailable, unsupported profile context fails visibly, and ticket detail and actions preserve a safe return to the same profile.
- A Maintenance overdue link is not a historical snapshot. The due-date cutoff stays fixed in the saved link, while current status, completion, cancellation, and corrected target dates determine the rows now. Cancelled tickets are excluded; an older link offers a route to the current overdue cutoff.
- After normalized routing is activated, Approval Inbox shows records assigned to you or your active approval role. It currently shows an unavailable state instead of a queue.
- My Work shows project tasks according to project visibility and assignment.
- Notifications show scoped alerts and links to the related work where available.
- Notification history follows the company and location currently selected in the header. Changing company or location does not expose or allow read/archive changes to alerts from another scope, and revoked scope access removes that history from the current view.
- Manual reminder scans show scanned/reminder counts and create notifications only for records the user is already authorized to see.
- Food Cost is intentionally not summarized on Overview while its business-date, missing-valuation, and status definitions are under review. If authorized, open `Food Cost Analysis` from its neutral source-workspace link and verify the selected date and evidence there.

## Important Controls And Warnings

- Dashboard cards are read-only and do not approve, post, receive, dispatch, or reverse records.
- Dashboard source status is shown only for sources the server authorized and attempted for the selected scope. It does not reveal unauthorized sources or grant access to them.
- Do not interpret `Dashboard assembled`, `Checked`, or `Source data as of` as `fresh`, `stale`, within SLA, or outside SLA. The dashboard makes no such freshness or service-level claim.
- `Open source` leads to the authoritative source workspace. That workspace rechecks your current session, permission, scope, record status, and action authority; dashboard availability or a copied link is not an access token.
- A dashboard drilldown narrows an already authorized source list. It does not grant access to a PO, PR, transfer, or Receiving Report; alter the selected scope; or permit changing the dashboard filter through the URL.
- Branch Operations dashboard profiles do not grant review, correction, or closure authority. Checklist detail rechecks current permission, scope, status, actor lineage, and segregation rules before offering an action.
- Do not compare the `Checklist Exceptions` card value directly with the number of checklist rows: the card counts exception lines, and one checklist can contain more than one exception line.
- Food Safety dashboard profiles do not grant review, correction, or closure authority. Log detail rechecks current permission, scope, status, actor lineage, and segregation rules before offering an action.
- Do not compare the `Food Safety Exceptions` card value directly with the number of log rows: the card counts exception readings, and one log can contain more than one exception reading.
- Incident dashboard profiles do not grant create, correction, resolution, cancellation, assignment, or source-record authority. Incident detail and each command recheck the current permission, exact selected scope, record state, actor lineage, and segregation rules.
- Do not add Incident card totals together: the same record can belong to several profiles. Critical is an all-status severity-history lens, and Pending Review is oversight rather than assigned work.
- A related Incident source link is shown only when the user has the corresponding source-module permission, and the source destination reauthorizes access. A hidden or unavailable source link does not change the Incident record.
- Maintenance dashboard profiles do not grant create, correction, completion, cancellation, assignment, vendor, or Incident authority. Ticket detail and each command recheck the current permission, exact selected scope, record state, reporter lineage, and segregation rules.
- Do not add Maintenance card totals together: the same ticket can belong to several profiles. Critical is an all-status priority-history lens, and Pending Vendor is oversight rather than assigned work.
- A source Incident link appears only with current Incident module access and an exact linked-record scope match, and the Incident destination reauthorizes access. Completing a Maintenance ticket does not resolve the linked Incident.
- `Today’s work` is a prioritized read-only view. Opening an item does not bypass the source record’s permission, status, or segregation-of-duties checks.
- `My Tasks` is not a replacement for Approval Inbox or project `My Work`, and it does not yet include every operational source. Its signed page cursor only continues the current queue page; it does not grant access or action authority.
- My Tasks currently exposes enrolled-module, priority, source-qualified status, and native due buckets (`Overdue`, `Due today`, `Upcoming`, and `No due date`). Due buckets query only Incident and Maintenance native due fields; required dates, business dates, and creation dates are not substituted. Filters remain bound while paging. Arbitrary location and assigned-by filters are not exposed; do not infer those meanings from a task's creator, reporter, opener, or submitter.
- If a task page expires or no longer matches your user, scope, permissions, or the current source registry, My Tasks restarts at page one and explains the reset. It never weakens cursor validation to preserve an old page.
- If an enrolled source is temporarily unavailable, My Tasks withholds the total and does not offer a continuation link from that partial page. Reload page one after the source is available so no work is skipped.
- A role-pooled My Tasks item means your role may perform the displayed action in the selected scope. Another authorized user may complete it first, so the source record always rechecks its current status and your authority when opened.
- An assigned Stock Count task may be started, entered, or submitted only by its recorded counter. A future-scheduled count cannot be started early. Blind-count system quantities, variances, reviewer facts, adjustment links, and variance-bearing audit history stay hidden from the assigned counter, even when that user also holds review permission.
- A Purchase Request draft may only be submitted by its recorded requester. The system does not treat location read access as authority to submit another person’s request; submission on behalf requires a separate approved delegation workflow.
- When the dashboard says the approval preview is unavailable, do not infer a zero-approval result. `Approval Inbox` is also unavailable while normalized routing is disabled and exposes no complete queue or action path. `Scan Approvals` may create current-user reminders for eligible due or overdue work, but those links remain unavailable and the scan does not disclose every pending approval. Follow the workflow owner for release guidance; there is no hidden legacy action queue and the unavailable state does not change who can approve a record.
- Notifications are reminders or alerts; the source record remains the controlling record.
- Restaurant Operations scans do not create new Food Cost exception notifications while the Food Cost definitions are under review. An older Food Cost notification remains part of history; its stored value or status is not a current trusted instruction, so verify current evidence in Food Cost Analysis before acting.
- `Scan Approvals` and `Scan Reminders` are manual in-app reminder tools. They do not approve, reject, post, receive, close, reverse, or escalate authority.
- Project tasks may link to ERP records, but completing a task does not approve a PR/PO, receive stock, post inventory, or change finance records.
- If a card or notification is missing, check location, permission, scope, and filters.

## Related Articles

- [Review Branch Checklist Dashboard Profiles](../branch-operations/README.md)
- [Review Food Safety Dashboard Profiles](../food-safety/README.md)
- [Review Incident Records And Dashboard Profiles](../incidents/README.md)
- [Review Maintenance Tickets And Dashboard Profiles](../maintenance/README.md)
- Why can't I see my branch, warehouse, or request?
- Why can't I approve this request?
- How to export a report
