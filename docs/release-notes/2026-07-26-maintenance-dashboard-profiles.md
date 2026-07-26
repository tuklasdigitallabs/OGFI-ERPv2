# OGFI ERP Release Notes — Maintenance dashboard profiles

**Release date:** July 26, 2026

**Audience:** Branch Managers, Branch Supervisors, Operations Managers, facilities or maintenance reviewers, and other users with Maintenance view access

**Affected locations / roles:** Users with Maintenance view access in the exact selected company, brand context, and location

## What Changed

- Four Overview links now open fixed, read-only Maintenance profiles: `Maintenance Follow-up`, `Critical maintenance`, `Pending vendor`, and `Maintenance overdue`.
- Follow-up contains tickets in `OPEN`, `IN_PROGRESS`, or `PENDING_VENDOR`. Critical includes critical-priority tickets across every status, including completed and cancelled history. Pending Vendor includes all scoped `PENDING_VENDOR` tickets and is not a personal or vendor assignment queue.
- Overdue contains active tickets due before the operating-date cutoff captured by its link. The cutoff stays fixed, while current status, completion, cancellation, and corrected target dates determine the rows whenever the link is opened; it is not a historical snapshot.
- Search can narrow a profile by ticket number, title, category, asset name or area, or displayed reporter or owner name without accepting raw status, priority, requested-date, or other values that would redefine it. Hidden narrative, corrective action, evidence, and source identifiers are not searched. Create and CSV export controls remain unavailable in profile mode.
- Maintenance detail and permitted actions preserve the safe return path to the same profile, search, page, and applicable cutoff. A source Incident link appears only when the user has current Incident module access and the exact linked record passes the source scope check; the Incident destination rechecks access.

## What You Need To Do

- No action is required. Use Overview profiles for Maintenance oversight, the ordinary Maintenance workspace for normal filters and permitted export or creation, and `My Tasks` for enrolled ticket-completion work you may be authorized to perform.
- Do not add the four card totals together because one ticket can appear in several profiles.
- When opening an older overdue link, use `Open current overdue view` if you need the current operating-day cutoff.

## Important Notes

- A dashboard profile does not grant create, correction, completion, cancellation, assignment, vendor, or Incident authority. Ticket detail and every action independently recheck current permission, exact scope, record status, reporter lineage, and segregation controls.
- A saved overdue cutoff does not freeze ticket history. Later completion, cancellation, or target-date correction can change which rows appear. Cancelled tickets are not active overdue work and cannot be corrected or reopened in the current workspace; report a mistaken cancellation through the normal support or governance channel.
- Maintenance actions preserve audit history and do not approve purchasing, post or move inventory, create a financial entry, or resolve a linked Incident.
- This note describes the confirmed dashboard-profile checkpoint only; it does not declare the wider Maintenance workspace or release production-ready.

## Learn More

- [Review Maintenance Tickets And Dashboard Profiles](../knowledge-base/maintenance/README.md)
- [Understanding The Dashboard, My Tasks, And Notifications](../knowledge-base/getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)

## Support

Report an unexpected profile population through the normal OGFI ERP support channel and include the selected company, brand context, location, card name, search text, overdue cutoff when applicable, and Maintenance ticket number where available.
