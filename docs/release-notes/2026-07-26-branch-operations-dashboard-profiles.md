# OGFI ERP Release Notes — Branch Operations dashboard profiles

**Release date:** July 26, 2026

**Audience:** Branch Managers, Branch Supervisors, and Operations Managers
**Affected locations / roles:** Users with Branch Operations view access in the selected company and location

## What Changed

- `Checklist Exceptions` now opens a read-only, selected-scope Branch Operations profile. The card counts exception lines, and the destination also shows how many checklists are affected.
- `Checklist Reviews` now opens a read-only profile of all scoped checklists in `SUBMITTED` or `MANAGER REVIEW`; it is not a personal task list.
- Both profiles allow Search to narrow results without accepting raw status, shift, or business-date values that would redefine the list.
- Unsupported or retired profile links fail visibly, and checklist detail retains the return path to the profile.

## What You Need To Do

- No action is required. Use the two Overview cards when you need branch-checklist oversight, and use `My Tasks` for enrolled work you may be able to act on.

## Important Notes

- These profiles do not grant review, correction, or closure authority. Checklist detail rechecks current permission, selected scope, status, actor lineage, and segregation rules.
- The profile change does not post inventory, approve stock adjustments, or change Incident or Maintenance records.
- This note describes confirmed behavior only; it does not declare the wider Branch Operations workspace or release production-ready.

## Learn More

- [Review Branch Checklist Dashboard Profiles](../knowledge-base/branch-operations/README.md)
- [Understanding The Dashboard, My Tasks, And Notifications](../knowledge-base/getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)

## Support

Report an unexpected profile population through the normal OGFI ERP support channel and include the selected company, location, card name, search text, and checklist reference where available.
