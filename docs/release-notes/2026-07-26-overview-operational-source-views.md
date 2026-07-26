# OGFI ERP Release Notes — Overview operational source views clarified

**Release date:** July 26, 2026

**Audience:** Branch Managers, Branch Supervisors, Storekeepers, Warehouse staff, Purchasing staff, Finance and Accounting users, Operations Managers, General Managers, and authorized support users

## What Changed

- Overview's existing `reports` destination is now labeled `Source views` and presents `Operational source views`; this is a navigation clarification, not a new reporting module.
- Destinations are separated into `Exact operational views` and `Source workspaces`.
- An `Exact scoped view` opens a versioned, read-only source population that preserves the selected operating scope. A `Source workspace` opens the ordinary authorized module without implying an exact report population.
- Operational destinations are enrolled only from dashboard sources authorized and attempted for the user's current role and selected scope; Food Cost Analysis uses its separate access check. A copied destination link still requires a new access check.
- Where shown, `Dashboard source available` or `Dashboard source unavailable` describes the dashboard's attempt to read that source for the current response. `Unavailable` does not mean zero matching records.

## What You Need To Do

- Use `Overview` → `Source views` to choose an authorized destination.
- Select `Open exact view` when you need the named fixed operational population. Select `Open source workspace` when you need the ordinary module and its current records.
- If a tile says `Dashboard source unavailable`, open the destination for a new authorized read before concluding that no records or exceptions exist.

## Important Notes

- The destination directory does not grant create, approval, posting, receiving, dispatch, reversal, export, or other workflow authority.
- No source record, status, inventory movement, financial value, approval, notification, or audit history is changed by opening a destination.
- A destination absent from `Source views` may be outside the user's current role or selected scope; absence is not a zero-result statement and must not reveal unauthorized sources.
- This note does not declare Overview, Workspace 1, or Phase I production-ready.

## Training Impact

Provide a short role-based briefing on the difference between an exact scoped view and a source workspace, and on `Dashboard source unavailable` versus a successfully loaded zero-result view. No separate course is required.

## Learn More

- [Understanding the Dashboard, My Tasks, and Notifications](../knowledge-base/getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)
- [OGFI ERP Glossary](../knowledge-base/GLOSSARY.md)

## Support

Report an unexpected missing destination, scope, or source-availability label through the normal OGFI ERP support channel. Include the selected company, location, destination name, and time observed; do not include sensitive record contents.
