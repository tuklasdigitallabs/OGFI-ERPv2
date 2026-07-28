# OGFI ERP Release Notes — Incident dashboard profiles

**Release date:** July 26, 2026

**Audience:** Branch Managers, Branch Supervisors, Operations Managers, compliance or quality reviewers, and other users with Incident view access

**Affected locations / roles:** Users with Incident view access in the exact selected company, brand context, and location

## What Changed

- Four Overview links now open fixed, read-only Incident profiles: `Open Incidents`, `Critical incidents`, `Incident review`, and `Incident overdue`.
- Open contains incidents in `OPEN`, `IN_PROGRESS`, or `PENDING_REVIEW`. Critical includes critical-severity records across every status, including resolved and cancelled history. Incident Review includes all scoped `PENDING_REVIEW` records and is not a personal task list.
- Overdue uses the operating-date cutoff captured by its link. The cutoff stays fixed, while current status, resolution, cancellation, and corrected due dates determine the rows whenever the link is opened; it is not a historical snapshot.
- Search can narrow a profile without accepting raw status, severity, or incident-date values that would redefine it. Create and CSV export controls remain unavailable in profile mode.
- Incident detail and permitted actions preserve the safe return path to the same profile, search, page, and applicable cutoff. Related source links appear only when the user has the corresponding source-module permission.

## What You Need To Do

- No action is required. Use Overview profiles for Incident oversight, the ordinary Incident workspace for normal filters and permitted export or creation, and `My Tasks` for enrolled Incident resolution work you may be authorized to perform.
- Do not add the four card totals together because one Incident can appear in several profiles.
- When opening an older overdue link, use `Open current overdue view` if you need the current operating-day cutoff.

## Important Notes

- A dashboard profile does not grant create, correction, resolution, cancellation, assignment, or related-source access. Incident detail and every action independently recheck current permission, exact scope, record status, actor lineage, and segregation controls.
- A saved overdue cutoff does not freeze record history. Later resolution, cancellation, or due-date correction can change which rows appear.
- Incident actions preserve audit history and do not approve, post, receive, move inventory, create a financial entry, or alter a linked source record.
- Authenticated Chromium and mobile acceptance verifies the Incident register remains scoped and readable, including responsive action, location, and due-context presentation. This is browser evidence for the register and read-only profile only, not a declaration of end-to-end Incident release readiness.
- This note describes the confirmed dashboard-profile checkpoint only; it does not declare the wider Incident workspace or release production-ready.

## Learn More

- [Review Incident Records And Dashboard Profiles](../knowledge-base/incidents/README.md)
- [Understanding The Dashboard, My Tasks, And Notifications](../knowledge-base/getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)

## Support

Report an unexpected profile population through the normal OGFI ERP support channel and include the selected company, brand context, location, card name, search text, overdue cutoff when applicable, and Incident reference where available.
