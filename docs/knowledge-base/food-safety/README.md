# Review Food Safety Dashboard Profiles

**Who can do this:** Users authorized to view Food Safety in the selected company and location, including applicable Branch Managers, Branch Supervisors, Food Safety staff, and Operations Managers

**Purpose:** Inspect the Food Safety exception-reading or review population shown on the Operations Dashboard without changing its server-controlled membership

**Last verified against:** Implemented `Food Safety Exceptions`, `Critical exception readings`, and `Food Safety Reviews` dashboard profiles

## Prerequisites

- Select the company, brand where applicable, and branch location you intend to inspect.
- You must have Food Safety view access for that scope.
- Use `My Tasks` when you need currently enrolled work you may be able to act on. `Food Safety Reviews` is an oversight population, not a personal assignment list.

## Navigation Path

`Operations Dashboard` → `Food Safety Exceptions`, `Critical exception readings`, or `Food Safety Reviews`

## Steps

1. Confirm the selected company and location on the Operations Dashboard.
2. Select `Food Safety Exceptions` to open logs containing exception readings in the selected scope. The card value is the number of exception readings across scoped history; the destination separately displays that reading count and the number of affected logs.
3. Select `Critical exception readings` to open `food-safety-critical-exceptions-v1`. It contains retained readings whose result is `EXCEPTION` and severity is `CRITICAL` across every log status. The destination reports the matching-reading total separately from the number of affected logs.
4. Select `Food Safety Reviews` to open every scoped log currently in `SUBMITTED` or `EXCEPTION REVIEW`. This view is not limited to records assigned to you.
5. Use Search to narrow the active profile. Clear Search to restore its complete server-defined population.
6. Open a log to inspect its current readings, corrective-action context, evidence references, and activity where available.
7. Use the preserved return link to go back to the same dashboard profile, search, and page.
8. Exit the dashboard view when you need the ordinary Food Safety workspace and its normal filters or authorized controls.

## Expected Result

- The page identifies the active profile and selected company and location.
- `Food Safety Exceptions` reports exception readings separately from affected logs.
- `Critical exception readings` reports retained `EXCEPTION` plus `CRITICAL` readings separately from affected logs. It is an all-status severity lens, not an unresolved-action, compliance, or personal-task count.
- `Food Safety Reviews` contains all scoped `SUBMITTED` and `EXCEPTION REVIEW` logs, including records that are not personal tasks.
- Search can narrow the results, but raw status, log type, or business-date values cannot widen or redefine the profile.
- Record and export controls are hidden while a dashboard profile is active.
- An unsupported or retired dashboard link shows a visible unavailable state instead of silently opening a different population.

## Controls And Warnings

- All three profiles are read-only oversight views. Opening a profile or source log does not grant review, correction, or closure authority.
- Log detail rechecks your current permission, scope, log status, actor lineage, and applicable segregation rules before offering any action.
- The dashboard link preserves the selected scope; it does not grant access to another company, brand, or location.
- Exception readings are historical source-record facts included by the profile contract. Do not assume that the count means the readings are currently open or unresolved.
- The critical profile is a live inquiry over retained readings in current source records, not a frozen historical snapshot of the value previously seen on Overview. A retained critical reading may belong to a log in any status and does not prove that an action remains available.
- One log may contain several exception readings, so the card value can be higher than the affected-log count.
- Do not add the all-exception and critical-reading totals together; critical readings are already part of the all-exception population.
- Overview does not show separate `Exception Review` or `Reviewed` metrics. Their absence does not mean those statuses have zero logs. Use the combined `Food Safety Reviews` profile for `SUBMITTED` and `EXCEPTION REVIEW` oversight and the ordinary Food Safety workspace for current source-record statuses.
- Food Safety logs do not create Incident records, post Wastage or inventory movements, or change stock.
- Availability of these profiles does not by itself mean the wider Food Safety workspace or release is production-ready.

## What Happens Next

If a log needs action, use only the controls available on its detail page. The source record determines whether your current role, selected scope, and the log's current status allow an action. Return to the profile to continue the oversight list.

## Full Workspace And Activity

- The ordinary Food Safety log register is paginated on the server. Search, business date, log type, and status filters remain selected while moving between pages.
- Dashboard summaries and the authorized CSV export are separate views from the ordinary register and from the three read-only dashboard profiles.
- Open a compliance log to review its read-only Activity section. Activity is immutable audit history for the log and cannot be edited or deleted from the workspace.

## Related Articles

- [Understanding The Dashboard, My Tasks, And Notifications](../getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)
- Why can't I see my branch, warehouse, or request?
- Why can't I approve this request?
