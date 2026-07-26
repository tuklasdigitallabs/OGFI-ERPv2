# OGFI ERP Release Notes — Food Safety Overview metrics clarified

**Release date:** July 26, 2026

**Audience:** Branch Managers, Branch Supervisors, Food Safety staff, Operations Managers, and authorized support users

## What Changed

- Overview adds `Critical exception readings`, linked to the exact read-only `food-safety-critical-exceptions-v1` profile.
- The profile contains retained readings with `EXCEPTION` result and `CRITICAL` severity across every Food Safety log status. It reports the reading total separately from affected logs.
- The existing all-exception `Food Safety Exceptions` profile remains available, as does the combined `Food Safety Reviews` profile for scoped `SUBMITTED` and `EXCEPTION REVIEW` logs.
- Standalone Exception Review and Reviewed metrics are no longer shown on Overview.

## What You Need To Do

- Use `Food Safety Exceptions` for all retained exception-reading oversight, `Critical exception readings` for the severity-specific subset, and `Food Safety Reviews` for submitted/exception-review oversight.
- Use `My Tasks` for enrolled work you may currently be able to perform and the ordinary Food Safety workspace for current source-record statuses.
- Do not interpret a missing standalone metric as zero matching logs.

## Important Notes

- Critical exception readings is a live all-status source inquiry, not a historical snapshot, unresolved-action count, compliance result, or personal task queue.
- Opening a source log does not grant review, correction, or closure authority. Current permission, scope, status, actor lineage, and segregation rules are rechecked before any action is offered.
- No source record, status, permission, export, or workflow behavior changed.
- This note does not declare Food Safety, Overview, Workspace 1, or Phase I production-ready.

## Training Impact

No separate course is required. Brief Food Safety, branch-management, and operations users on the difference between all exception readings, retained critical readings, review-status oversight, and actionable `My Tasks` work.

## Learn More

- [Review Food Safety Dashboard Profiles](../knowledge-base/food-safety/README.md)
- [Understanding the Dashboard, My Tasks, and Notifications](../knowledge-base/getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)

## Support

Report an unexpected profile count or population through the normal OGFI ERP support channel. Include the selected company, location, profile name, and log reference where available; do not include sensitive reading, evidence, or corrective-action contents.
