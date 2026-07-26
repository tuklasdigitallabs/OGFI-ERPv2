# Review Incident Records And Dashboard Profiles

**Who can do this:** Users with Incident view access for the company, brand context, and location currently selected in the ERP. Correction, resolution, and cancellation remain separate permissions checked on the Incident detail page.

## Purpose

Use the ordinary Incident workspace to find and review incident records, or open one of the four read-only Incident profiles from the Operations Dashboard for a fixed oversight question.

The profiles may overlap. Do not add their totals together:

| Dashboard profile | Records included |
|---|---|
| `Open Incidents` | Incidents currently `OPEN`, `IN_PROGRESS`, or `PENDING_REVIEW`. |
| `Critical incidents` | Every critical-severity incident in the selected scope, including resolved and cancelled history. |
| `Incident review` | Every incident currently `PENDING_REVIEW`. This is an oversight view, not a personal or assigned task queue. |
| `Incident overdue` | Incidents due before the date captured in the dashboard link, with no resolution date and a status other than `CANCELLED`, evaluated from current records. |

## Prerequisites

- Select the intended company and location in the application header.
- Keep the selected brand context unchanged. A company-level location without a brand remains a distinct scope; a dashboard link cannot substitute another brand or location.
- Make sure your role has Incident view access for that exact selected scope.

## Navigation Path

- Ordinary workspace: `Incidents`
- Dashboard profiles: `Overview` → `Open Incidents`, `Critical incidents`, `Incident review`, or `Incident overdue`

## Steps

1. Confirm the selected company, brand context, and location in the header.
2. Open `Incidents` for the ordinary workspace, or select an Incident card on `Overview` for its read-only profile.
3. In a dashboard profile, read the profile name and scope notice before reviewing the rows. An overdue profile also shows its due-date cutoff.
4. Use Search to narrow the profile. Search is limited to 120 characters and cannot widen or redefine the profile population.
5. Move between pages as needed. The profile, search, page, and overdue cutoff remain in the return path.
6. Select `Open Incident` to review a record. Use `Back to Incidents` after reviewing it to return to the same profile context.
7. Review the read-only `Activity` section for the Incident's system-recorded audit history. It cannot be edited or deleted from this workspace.
8. If an independently authorized correction, resolution, or cancellation action is available on Incident detail, complete it there. Resolution requires its displayed resolution date, corrective action, and evidence reference; correction requires a correction reason and accepts an optional evidence reference; cancellation requires its displayed reason. A successful or rejected action returns to the same Incident detail and preserves the safe profile return path.
9. Use `Exit dashboard view` when you deliberately want the ordinary Incident workspace with its normal filters, create control, and permitted CSV export.

## Expected Result

- The ordinary Incident workspace remains a server-paginated register. Its search, incident date, status, and severity filters remain selected while paging, and permitted users can use its create or CSV export controls.
- A dashboard profile shows only records in its fixed definition and exact selected scope. Search can only reduce that result.
- The Critical profile retains critical incidents across every status, including resolved and cancelled records.
- The Pending Review profile shows scoped oversight and does not claim that a record is assigned to you or that you can act on it.
- The overdue profile uses the cutoff saved in its link. Status, resolution, cancellation, and corrected due dates reflect the records now; the result is not a historical snapshot of how those records looked on the cutoff date.
- Opening a record and returning preserves the canonical profile context without carrying arbitrary scope or filter values.

## Controls And Warnings

- Dashboard profiles are read-only list views. They do not grant authority to create, correct, resolve, cancel, assign, approve, post, or change another source record.
- Create and CSV export are unavailable in profile mode. A direct attempt to export a dashboard profile is rejected; exit the profile and use the ordinary authorized Incident export when appropriate.
- Raw status, severity, and incident-date URL values cannot redefine a profile. Invalid, duplicated, unsupported, or retired profile context fails visibly before the Incident list is loaded. Overdue also rejects a missing, invalid, duplicated, or future cutoff, while the other profiles reject a cutoff they do not use.
- The overdue cutoff is a saved due-date comparison date. It is not a historical reporting date. An older saved link can produce a different result later because a record may be resolved, cancelled, or corrected after the link was created. Use `Open current overdue view` when it is offered to evaluate the current operating-day cutoff.
- Profile totals can overlap. For example, a critical pending-review incident can appear in Open, Critical, Pending Review, and Overdue at the same time.
- Incident detail rechecks your current permission, exact scope, record status, actor lineage, and segregation controls before showing or accepting an action. A copied dashboard or detail link is not an access token.
- A related source record is clickable only when your current permissions include access to that source module. `Source unavailable in current access` does not disclose or grant the missing source access. The destination rechecks access again when opened.
- Incident correction, resolution, and cancellation preserve audit history. They do not approve, post, receive, move inventory, create a financial entry, or change the status of a linked checklist, Food Safety log, Maintenance ticket, or other source record.

## What Happens Next

The Incident remains the authoritative record for its current status, due date, resolution, cancellation, and audit history. Dashboard counts and profiles update from current scoped records. Use `My Tasks` only for enrolled Incident resolution work that your current role and scope may perform; Pending Review is not automatically a My Tasks assignment.

## Related Articles

- [Understanding The Dashboard, My Tasks, And Notifications](../getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)
- [Review Branch Checklist Dashboard Profiles](../branch-operations/README.md)
- [Review Food Safety Dashboard Profiles](../food-safety/README.md)
