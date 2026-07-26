# Review Maintenance Tickets And Dashboard Profiles

**Who can do this:** Users with Maintenance view access for the company, brand context, and location currently selected in the ERP. Creation, correction, completion, and cancellation remain separate permissions and controls checked by the Maintenance workspace.

## Purpose

Use the ordinary Maintenance workspace to find and review equipment or facility tickets, or open one of the four read-only Maintenance profiles from the Operations Dashboard for a fixed oversight question.

The profiles may overlap. Do not add their totals together:

| Dashboard profile | Records included |
|---|---|
| `Maintenance Follow-up` | Tickets currently `OPEN`, `IN_PROGRESS`, or `PENDING_VENDOR`. |
| `Critical maintenance` | Every critical-priority ticket in the selected scope, including completed and cancelled history. |
| `Pending vendor` | Every ticket currently `PENDING_VENDOR`. This is an oversight view, not a personal assignment queue. |
| `Maintenance overdue` | Active tickets in `OPEN`, `IN_PROGRESS`, or `PENDING_VENDOR` whose target due date is before the date captured in the dashboard link and which have no completion date, evaluated from current records. |

## Prerequisites

- Select the intended company and location in the application header.
- Keep the intended brand context selected. A company-level location without a brand remains a distinct scope; a dashboard link cannot substitute another brand or location.
- Make sure your role has Maintenance view access for that exact selected scope.

## Navigation Path

- Ordinary workspace: `Maintenance`
- Dashboard profiles: `Overview` → `Maintenance Follow-up`, `Critical maintenance`, `Pending vendor`, or `Maintenance overdue`

## Steps

1. Confirm the selected company, brand context, and location in the header.
2. Open `Maintenance` for the ordinary workspace, or select a Maintenance card on `Overview` for its read-only profile.
3. In a dashboard profile, read the profile name and scope notice before reviewing the rows. An overdue profile also shows its due-date cutoff.
4. Use Search to narrow the profile by ticket number, title, category, asset name or area, or the displayed reporter or owner name. Search is limited to 120 characters and cannot widen or redefine the profile population.
5. Move between pages as needed. The profile, search, page, and overdue cutoff remain in the return path.
6. Select `Open Maintenance Ticket` to review a record. Use the preserved Maintenance return link after reviewing it to return to the same profile context.
7. Review the ticket's read-only Activity section. This system-recorded audit history cannot be edited or deleted from the workspace.
8. If an independently authorized correction, completion, or cancellation action is available on ticket detail, complete it there. A successful or rejected action preserves the safe profile return path.
9. When a ticket is linked to an Incident, the ticket identifies that source relationship. The Incident link is available only when your current permissions allow access to the Incident module and the exact linked record; the Incident destination checks access again.
10. Use `Exit dashboard view` when you deliberately want the ordinary Maintenance workspace with its normal filters, create control, and permitted CSV export.

## Expected Result

- The ordinary Maintenance workspace remains a server-paginated register. Its search, requested-date, status, and priority filters remain selected while paging, and permitted users can use its create or CSV export controls.
- A dashboard profile shows only records in its fixed definition and exact selected scope. Search can only reduce that result.
- The Critical profile retains critical tickets across every status, including completed and cancelled records.
- Pending Vendor shows scoped oversight and does not claim that a vendor, owner, or current user is personally assigned to the ticket.
- The overdue profile includes active tickets only and uses the cutoff saved in its link. Current status, completion, cancellation, and corrected target due dates determine the rows now; the result is not a historical snapshot of how the tickets looked on the cutoff date.
- Opening a ticket and returning preserves the canonical profile context without carrying arbitrary scope or filter values.

## Controls And Warnings

- Dashboard profiles are read-only list views. They do not grant authority to create, correct, complete, cancel, assign, approve, post, or change an Incident or another source record.
- Create and CSV export are unavailable in profile mode. A direct attempt to export a dashboard profile is rejected; exit the profile and use the ordinary authorized Maintenance export when appropriate.
- Search only examines ticket number, title, category, asset name or area, and displayed reporter or owner name in the profile. It does not search hidden ticket narrative, corrective action, evidence, or source identifiers. Raw status, priority, requested-date, or other URL values cannot redefine a profile. Invalid, duplicated, unsupported, or retired profile context fails visibly before the ticket list is loaded. Overdue also rejects a missing, invalid, duplicated, or future cutoff, while the other profiles reject a cutoff they do not use.
- The overdue cutoff is a saved target-due-date comparison date, not a historical reporting date. An older saved link can produce a different result later because a ticket may be completed, cancelled, or corrected after the link was created. Use `Open current overdue view` when it is offered to evaluate the current operating-day cutoff.
- A cancelled ticket is excluded from Overdue. The current workspace does not correct or reopen cancelled tickets. If a ticket was cancelled by mistake, report it through the normal support or governance channel; the dashboard profile cannot reverse cancellation, and no reopen policy is defined here.
- Profile totals can overlap. For example, a critical ticket pending vendor and past its target date can appear in Follow-up, Critical, Pending Vendor, and Overdue at the same time.
- Ticket detail rechecks your current permission, exact scope, record status, reporter lineage, and segregation controls before showing or accepting an action. A copied dashboard or detail link is not an access token.
- A source Incident link appears only when your current permissions allow Incident module access and the exact linked record passes the source scope check. An unavailable or hidden link does not disclose or grant Incident access. Opening the link rechecks the Incident's scope and access rules.
- Maintenance correction, completion, and cancellation preserve audit history. They do not approve purchasing, post or move inventory, create a financial entry, or resolve a linked Incident.

## What Happens Next

The Maintenance ticket remains the authoritative record for its status, priority, target date, completion, cancellation, and audit history. Dashboard counts and profiles update from current scoped records. Use `My Tasks` only for enrolled Maintenance completion work that your current role and scope may perform; Pending Vendor is not automatically a personal task or a vendor assignment.

## Related Articles

- [Understanding The Dashboard, My Tasks, And Notifications](../getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)
- [Review Incident Records And Dashboard Profiles](../incidents/README.md)
- [Review Branch Checklist Dashboard Profiles](../branch-operations/README.md)
