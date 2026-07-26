# OGFI ERP Release Notes — My Tasks partial-source reliability

**Release date:** July 26, 2026

**Audience:** Operational users, managers, approvers, and administrators

**Affected locations / roles:** Users with access to the My Tasks workspace

## What Changed

- My Tasks now returns work from available enrolled sources when another enrolled source is slow, unavailable, or at its safe processing limit.
- A partial page names the unavailable source, withholds the overall total, and does not offer a continuation link that could skip recovered work.
- If a partial page has no available rows, it shows `No actions shown from available sources` instead of the complete-page all-clear state.

## What You Need To Do

- Do not treat a partial empty page as confirmation that no work is waiting.
- Reload My Tasks from page one after the unavailable source recovers.
- Open each task's source record to complete the action; the source workflow rechecks your current permission, scope, status, and segregation rules.

## Important Notes

- This change does not add task sources, alter task eligibility or ordering, grant action authority, or replace Approval Inbox or project My Work.
- The response bound is a technical availability control, not a freshness or service-level promise.
- Hosted load, database cancellation/timeout tuning, alerting, recovery, responsive browser, and UAT evidence remain required before Workspace 1 can be declared production-ready.

## Learn More

- [Understanding The Dashboard, My Tasks, And Notifications](../knowledge-base/getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)

## Support

Report repeated unavailable-source warnings through the normal OGFI ERP support channel and include the selected company, location, unavailable source name, and time shown. Do not include sensitive record contents.
