# Managing Expansion Projects And Opening Readiness

**Audience / required role:** Expansion managers, project managers, operations leads, construction coordinators, administrators, and executives with project access  
**Applies to:** Expansion Dashboard, Opening Playbooks, Site Pipeline, Feasibility, Capex & Procurement, Lifecycle Gates, Permits & Documents, Construction Board, Opening Readiness, Punch List, Post-Opening Review, and Expansion Portfolio export  
**Last verified against:** implemented Phase 4 shared-project workspaces, report rollups, scoped CSV export, evidence-required closure, and source-record boundary controls

Use Expansion when the company is planning, building, preparing, or handing over a new restaurant branch, renovation, relocation, kitchen upgrade, warehouse/commissary project, or mall compliance project.

Expansion uses the shared project engine. It coordinates project work, milestones, tasks, readiness checks, permits, construction progress, and punch-list closure. It does not approve Purchase Orders, release payments, receive inventory, create branch master records, hire employees, post journals, or operate a contractor portal.

## Where To Go

| Workspace | Use it for |
|---|---|
| Expansion Dashboard | Portfolio view, schedule risk, source links, report rollups, and CSV export. |
| Opening Playbooks | Create and publish reusable branch-opening templates that seed future Expansion projects with starter tasks, milestones, checklist items, and reminder defaults. |
| Site Pipeline | Create or review expansion projects and proposed sites. |
| Feasibility | Track sales, rent, capex, ROI, payback, NPV, IRR, and executive decision assumptions. |
| Capex & Procurement | Track project packages, estimated budget, source-reference amounts, awards, procurement follow-up, and evidence without changing Finance or Procurement records. |
| Lifecycle Gates | Seed and update standard branch-opening gates and evidence. |
| Permits & Documents | Track permit, lease, mall, inspection, certification, and compliance requirements. |
| Construction Board | Track fit-out workstreams, progress, blockers, evidence, and handover status. |
| Opening Readiness | Track pre-opening checklist items across operations, HR, IT, inventory, finance/cash, permits, marketing, equipment, and compliance. |
| Punch List | Track defects, snags, inspection findings, rectification items, handover exceptions, and closure evidence. |
| Post-Opening Review | Track 30/60/90-day stabilization against sales, food cost, labor cost, guest count, issues, and owner signoff evidence. |

## How The Workflow Fits Together

1. Create or publish an Opening Playbook if this project should start from a standard branch-opening workplan.
2. Create or open the expansion project from Site Pipeline.
3. Select a published playbook in the Template field when creating the site project, when applicable.
4. Confirm the project scope, brand, site/location, sponsor, manager, target opening date, and visibility.
5. Add feasibility assumptions for sales, rent, capex, ROI, payback, NPV, IRR, and executive review.
6. Add capex/procurement package trackers for budget references, BOQ packages, awards, supplier follow-up, and evidence.
7. Seed lifecycle gates for the project.
8. Add permit, lease, mall, inspection, and document requirements.
9. Add construction tasks by workstream and record progress with evidence references.
10. Add opening-readiness tasks and checklist lines.
11. Add punch-list items when inspection, handover, or readiness defects are found.
12. Add post-opening reviews after launch for 30/60/90-day stabilization.
13. Close items only when the required evidence or reason is recorded.
14. Use Expansion Dashboard and CSV export to review portfolio status without changing source records.

## Opening Playbooks

Use **Expansion > Opening Playbooks** to create and maintain the reusable branch-opening workplan before creating a site project.

An Opening Playbook is a project template for future Expansion projects. Published playbooks appear in the **Template** field on **Site Pipeline > Create Site Project**. Selecting one seeds the new project with starter tasks, milestones, checklist items, and reminder defaults.

Open a playbook from the library to review or configure:

- Overview, status flow, defaults, and source.
- Task/workstream defaults, owner role, priority, starting status, checklist lines, and start/due offsets.
- Milestones and target offsets from the opening date.
- Flattened checklist lines for readiness review.
- Evidence and signoff expectations derived from required checklist lines.
- Reminder defaults for due-soon and overdue notifications.

Draft playbooks are editable. Published or archived playbooks are read-only for future-project consistency. To change a published playbook, open it and use **Create Draft Revision**. The new draft copies its tasks, milestones, checklist lines, evidence rules, signoff rules, and reminder defaults; edit and publish the revision when it is ready. Existing projects remain attached to the version they started with.

Changing a playbook affects future projects only. It does not rewrite active project tasks, approve capex, issue purchase orders, release payments, create branch records, post inventory, or change Finance, Procurement, Workforce, or Admin source records.

## Project Evidence And Signoffs

When a project is created from a published Opening Playbook, its evidence and signoff defaults are copied into the project as separate readiness requirements. Open the project from **Site Pipeline** and use **Evidence & Signoffs** to see the owner, reviewer, evidence type, status, and action for each one.

- The assigned owner submits the requirement.
- The assigned independent reviewer accepts it or returns it with a reason.
- Document and photo requirements use the controlled evidence attachment action.
- Note requirements record the confirmation and accountable person in the project requirement.
- Source-record requirements accept the normal document number shown in the source module, such as a PR, PO, receipt, transfer, wastage, or adjustment reference. The ERP checks that you are authorized to view the source record before linking it and stores the actual source record behind the link.
- A requirement does not approve, receive, post, pay, or otherwise change the linked source record.

## Rollup Logic

Expansion reports are source-linked summaries. The dashboard and export use these formulas:

| Rollup | Formula / logic |
|---|---|
| Task completion percent | Completed active project tasks divided by active project tasks, rounded to nearest whole percent. |
| Schedule risk | A project is `AT_RISK` when it has blocked tasks or high/critical open risks. It is `WATCH` when overdue tasks exist. |
| Feasibility exceptions | Feasibility reviews that are overdue, blocked, or missing evidence. |
| Capex/procurement exceptions | Items missing evidence plus items where the higher of committed or actual source-reference amount is greater than the budget estimate. |
| Lifecycle gate exceptions | At-risk gates plus missing/not-created gates. |
| Permit/document exceptions | Overdue permit/document items plus items missing evidence. |
| Construction exceptions | Blocked construction tasks plus overdue construction tasks. |
| Construction average progress | Average progress percent across construction tasks for the project. |
| Opening-readiness completion | Completed checklist lines divided by total checklist lines. |
| Opening-readiness exceptions | Blocked readiness items plus overdue readiness items. |
| Punch-list exceptions | Critical open punch items plus overdue punch items. |
| Post-opening sales variance | `(actual sales - target sales) / target sales`, shown as a percent when a target exists. |
| Post-opening exceptions | Missing evidence, overdue or blocked reviews, sales variance below `-5%`, actual food cost above target, actual labor cost above target, or stabilization score below `80%`. |
| Average stabilization score | Average stabilization score across active post-opening reviews. |
| Report health | `CLEAR` when exceptions are zero, `WATCH` when exceptions exist, and `AT_RISK` when exceptions are three or more. |

## Evidence Rules

- Lifecycle gates require evidence or a decision reason before controlled status changes.
- Capex/procurement items require source evidence before completion.
- Permit/document items require evidence before completion.
- Construction tasks require progress, inspection, or handover evidence before completion.
- Opening-readiness items require readiness evidence before completion.
- Punch-list items require rectification, inspection, or handover evidence before completion.
- High and critical punch-list items require an independent active project-member reviewer in addition to the accountable owner. The owner or creator cannot close the item; the named reviewer closes it after it is submitted for review.
- Post-opening reviews require review-pack, operating report, or owner signoff evidence before completion.

Evidence may be a reference to a signed checklist, inspection record, photo set, approved document, handover note, or approved evidence repository item. Binary upload/download is only available where the controlled attachment service is enabled.

## Source-Record Boundary

Expansion may link to or summarize ERP records, but the source module remains in control:

- Purchasing controls PRs, quotes, and POs.
- Receiving and Inventory control stock receipts, ledger movements, transfers, counts, adjustments, and wastage.
- Finance controls budgets, AP, cash, payments, journals, and period close.
- Workforce controls employees, assignments, attendance, leave, schedules, and workforce readiness.
- Admin controls company, brand, location, role, scope, policy, and release-readiness records.

Completing an Expansion task does not approve a PO, receive stock, release payment, create a branch, post a journal, hire an employee, or close an operational source record.

## Exporting The Expansion Portfolio

Use **Expansion Dashboard > Export CSV** when you need a portfolio evidence pack.

The CSV includes:

- Report metadata and selected scope.
- Project status, brand, site, target opening date, and schedule state.
- Task, risk, blocked, overdue, punch-list, and linked-source counts.
- Open capex/procurement items and capex/procurement exceptions.
- Lifecycle gate counts.
- Permit/document exceptions.
- Construction progress and exceptions.
- Opening-readiness completion and exceptions.
- Punch-list exceptions.
- Post-opening open reviews and exceptions.
- A source-boundary column reminding reviewers that the export is read-only coordination evidence.

Exports follow the same project visibility and selected operating scope as the screen. If a user cannot view a project, it should not appear in their export.

## Common Issues

| Issue | What to check |
|---|---|
| Project is missing | Confirm project membership, scope assignment, restricted visibility, and archived/cancelled status. |
| Create button is unavailable | Confirm the user has project mutation access for the selected project scope. |
| Item cannot be completed | Provide required evidence and complete required checklist lines where applicable. |
| Punch item cannot close | Enter rectification, inspection, or handover evidence. High and critical items must also be reviewed and closed by their assigned independent reviewer. |
| Export is denied | Confirm project access and export permission. |
| Linked record is redacted | Confirm source-record permission in the originating module. |

## Related Articles

- Understanding Projects, Tasks, and Your Access
- Linking a Task to an ERP Record
- Marking a Task Blocked and Requesting Help
- Reviewing Overdue and Blocked Work
- How to Export a Report
- Why Can't I See This Project or Linked Record?
