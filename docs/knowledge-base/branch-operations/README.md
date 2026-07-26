# Review Branch Checklist Dashboard Profiles

**Who can do this:** Users authorized to view Branch Operations in the selected company and location, including applicable Branch Managers, Branch Supervisors, and Operations Managers

**Purpose:** Open the exception, critical exception-line, or review population shown on the Operations Dashboard without changing its server-controlled membership
**Last verified against:** Implemented `Checklist Exceptions`, `Critical exception lines`, and `Checklist Reviews` dashboard profiles

## Prerequisites

- Select the company, brand where applicable, and branch location you intend to review.
- You must have Branch Operations view access for that scope.
- Use `My Tasks` instead when you need currently enrolled work you may be able to act on. `Checklist Reviews` is not a personal task queue.

## Navigation Path

`Operations Dashboard` → `Checklist Exceptions`, `Critical exception lines`, or `Checklist Reviews`

## Steps

1. Confirm the selected company and location on the Operations Dashboard.
2. Select `Checklist Exceptions` to open checklists with one or more retained exception lines in that scope. Its metric counts all exception lines and the destination separately states the number of affected checklists.
3. Select `Critical exception lines` to open checklists with one or more retained lines marked `EXCEPTION` with `CRITICAL` severity in that scope. Lines remain in this read-only profile across checklist statuses. The metric is the number of matching lines, while the destination states both the line count and the number of affected checklists.
4. Select `Checklist Reviews` to open every scoped checklist currently in `SUBMITTED` or `MANAGER REVIEW`. This view is for oversight and is not limited to records assigned to you.
5. Use Search to narrow the profile by checklist, actor, line, evidence, or note text. Clear Search to restore the complete profile population.
6. Open a checklist to inspect its current details. Use the preserved return link to go back to the same dashboard profile, search, and page.
7. Exit the dashboard view when you need the normal Branch Operations workspace and its ordinary filters.

## Expected Result

- The page identifies the active dashboard profile, selected company, selected brand when applicable, and location.
- `Checklist Exceptions` reports all exception lines separately from affected checklists.
- `Critical exception lines` reports matching critical lines separately from affected checklists. It is not a count of unresolved actions or personal tasks.
- `Checklist Reviews` contains all scoped `SUBMITTED` and `MANAGER REVIEW` checklists, including records that are not personal tasks.
- The ordinary Branch Operations register uses checklist cards through tablet widths and identifies its reviewer field as `Reviewed by`; the value reflects the recorded reviewer state rather than implying a review occurred.
- Search can narrow the results, but raw status, shift, or business-date values cannot widen or redefine the profile.
- An unsupported or retired dashboard link shows `Dashboard view unavailable` instead of silently opening a different population.

## Controls And Warnings

- All three profiles are read-only oversight views. Opening one does not review, correct, close, approve, or otherwise change a checklist.
- The dashboard link preserves the selected scope; it does not grant access to another company, brand, or location.
- Opening a checklist rechecks your current permission, scope, record status, actor lineage, and applicable segregation rules before showing any action.
- The exception-line count and affected-checklist count measure different things. One checklist may contain several exception lines.
- A retained critical exception line may belong to a checklist in any status. Its presence does not mean a new action is currently available, and the absence of a standalone Manager Review or Reviewed metric does not mean there are no checklists in those statuses. Use the Branch Operations workspace for current source-record statuses.
- Overview does not show separate `Manager Review` or `Reviewed` metrics. Use the combined `Checklist Reviews` profile for submitted and manager-review oversight; no close policy is implied by that profile.
- Branch checklist records do not post inventory, approve stock adjustments, or replace Incident or Maintenance source records.
- Availability of these profiles does not by itself mean the wider workspace or release is production-ready.

## What Happens Next

If a checklist needs action, use only the controls available on its detail page. The source record determines whether your current role, scope, and the checklist's current status allow review, correction, or closure. Return to the profile to continue the oversight list.

## Related Articles

- [Understanding The Dashboard, My Tasks, And Notifications](../getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)
- Why can't I see my branch, warehouse, or request?
- Why can't I approve this request?
