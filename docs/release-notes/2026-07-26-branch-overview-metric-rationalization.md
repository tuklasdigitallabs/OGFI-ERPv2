# OGFI ERP Release Notes — Branch Overview metrics clarified

**Release date:** July 26, 2026

**Audience:** Branch Managers, Branch Supervisors, Operations Managers, and authorized support users

## What Changed

- Overview retains one `Critical exception lines` metric with an exact read-only Branch Operations profile. It includes retained checklist lines marked `EXCEPTION` with `CRITICAL` severity across every checklist status.
- The profile reports matching lines separately from affected checklists. It is not an unresolved-action count or personal task queue.
- Standalone Manager Review and Reviewed metrics are no longer shown. The combined `Checklist Reviews` profile remains available for all scoped `SUBMITTED` and `MANAGER REVIEW` checklists.
- The ordinary Branch Operations register uses checklist cards through tablet widths and labels reviewer information as `Reviewed by` without implying that an unreviewed checklist was reviewed.

## What You Need To Do

- Use `Critical exception lines` for retained critical-line oversight, `Checklist Reviews` for submitted/manager-review oversight, and `My Tasks` for enrolled work you may currently be able to perform.
- Use the Branch Operations workspace when you need the current status of other checklist records. A missing Overview metric does not mean the corresponding source status has zero records.

## Important Notes

- Opening either profile does not grant review, correction, or close authority. The source checklist rechecks current permission, scope, status, actor lineage, and segregation rules before showing an action.
- No source record, checklist status, permission, export, or workflow behavior changed, and this release does not introduce or imply a checklist close policy.
- This note does not declare the Branch Operations workspace, Overview, Workspace 1, or Phase I production-ready.

## Training Impact

No separate course is required. Brief Branch Managers, Supervisors, and Operations Managers on the difference between retained critical-line oversight, review-status oversight, and actionable `My Tasks` work.

## Learn More

- [Review Branch Checklist Dashboard Profiles](../knowledge-base/branch-operations/README.md)
- [Understanding the Dashboard, My Tasks, and Notifications](../knowledge-base/getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)

## Support

Report an unexpected profile population or reviewer label through the normal OGFI ERP support channel. Include the selected company, location, profile name, and checklist reference where available; do not include sensitive evidence or note contents.
