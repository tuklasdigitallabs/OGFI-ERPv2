# Phase 4 Expansion Projects Quick Start

**Audience:** Expansion managers, project managers, operations leads, construction coordinators, executives, administrators, and UAT reviewers  
**Prerequisites:** Project access, scoped company/brand/location access, project mutation access where participants will create or update records, and source-record permissions for any linked ERP records being reviewed  
**Related knowledge-base articles:** Managing Expansion Projects and Opening Readiness; Understanding Projects, Tasks, and Your Access; Linking a Task to an ERP Record; Marking a Task Blocked and Requesting Help; How to Export a Report

## Learning Objective

After this session, users should be able to manage a branch-opening project from site pipeline through feasibility, capex/procurement coordination, lifecycle gates, permits/documents, construction work, opening readiness, punch-list closure, post-opening stabilization review, and portfolio reporting without treating Expansion as the source of truth for finance, purchasing, inventory, workforce, branch master data, or contractor portals.

## Required Access And Test Data

- One expansion project manager who can create or update scoped expansion projects.
- One read-only reviewer or executive.
- One project with brand, target site, target opening date, sponsor, and manager.
- At least one feasibility review, capex/procurement package, lifecycle gate, permit/document item, construction task, opening-readiness checklist item, punch-list item, and post-opening review.
- At least one overdue or blocked item for exception review.
- At least one linked ERP source record for source-boundary discussion.

## Demonstration Flow

1. Open `Expansion > Expansion Dashboard`.
2. Review the source-boundary notice and explain that Expansion coordinates work only.
3. Review report rollups and identify which source workspace owns each exception.
4. Export the Expansion Portfolio CSV and confirm report metadata, scope, and source-boundary columns.
5. Open `Site Pipeline` and create or review an expansion project.
6. Open `Feasibility`, create a business-case review, and record sales, rent, capex, ROI, payback, NPV, IRR, assumptions, and evidence.
7. Open `Capex & Procurement`, create a package tracker, record budget estimate, committed/actual source-reference amounts, source reference, and evidence.
8. Open `Lifecycle Gates`, seed gates if needed, then record a gate status update with evidence or reason.
9. Open `Permits & Documents`, create a permit/document requirement, and move it toward completion with evidence.
10. Open `Construction Board`, create a workstream task, record progress, and review blocked/overdue behavior.
11. Open `Opening Readiness`, create a checklist-backed readiness item, complete checklist lines, and attempt completion with evidence.
12. Open `Punch List`, create a defect or snag, then complete it only after closure evidence is entered.
13. Open `Post-Opening Review`, create a 30/60/90-day review, record target/actual sales, food cost, labor cost, guest count, issues, stabilization score, source reference, and evidence.

## Practice Exercise

Each participant should:

1. Find an assigned or visible expansion project.
2. Add or update one capex/procurement, lifecycle, permit, construction, readiness, or punch-list item based on their role.
3. Mark one item blocked with a reason, then resolve or move it forward.
4. Try to complete a construction, readiness, or punch-list item without evidence and confirm the user-safe validation.
5. Export or review the Expansion Portfolio report where permitted.
6. Explain which source module would actually approve a PO, release a payment, receive inventory, create a branch, or hire an employee.

## Computation Checks

Use the dashboard and export to verify:

- Task completion percent equals completed active tasks divided by active tasks.
- Schedule risk changes when a project has blocked tasks, high/critical risks, or overdue work.
- Feasibility exceptions increase when a review is overdue, blocked, or missing evidence.
- Capex/procurement exceptions increase when evidence is missing or when the higher of committed or actual source-reference amount is greater than the budget estimate.
- Permit/document exceptions increase when an item is overdue or missing evidence.
- Construction exceptions increase when construction tasks are blocked or overdue.
- Opening-readiness completion equals completed checklist lines divided by total checklist lines.
- Punch-list exceptions increase for critical or overdue punch items.
- Post-opening sales variance equals actual sales minus target sales divided by target sales.
- Post-opening exceptions increase when evidence is missing, a review is blocked/overdue, sales variance is below `-5%`, actual food or labor cost is above target, or stabilization score is below `80%`.
- Report health is `CLEAR` with no exceptions, `WATCH` with one or more exceptions, and `AT_RISK` when exceptions are three or more.

## Common Errors And Recovery

| Issue | What to check |
|---|---|
| Project does not appear | Confirm membership, scope, restricted visibility, and archive/cancel status. |
| Create or update action is unavailable | Confirm project mutation access and selected operating scope. |
| Completion fails | Enter required evidence and complete required checklist lines where applicable. |
| Export is denied | Confirm project access and report/export permission. |
| User expects a PO, payment, stock, branch, or HR record to change | Redirect them to the proper source module; Expansion does not mutate those records. |

## Completion Check

- Participant can navigate every Expansion workspace.
- Participant can describe the source-record boundary without prompting.
- Participant can explain and verify at least three dashboard/export calculations.
- Participant can create or update an item according to role and scope.
- Participant can identify a denied, evidence-required, or read-only state.
- Participant understands that final release still requires client UAT validation and owner signoff.

## Release Limits To Communicate

- Expansion is a project coordination layer over the shared project engine.
- Expansion links and exports are read-only evidence for source records outside project tasks.
- Advanced contractor portals, public links, custom automation builders, and direct financial or inventory posting are not part of this Phase 4 release.
- Binary evidence upload/download depends on the approved controlled attachment service and remains separate from evidence-reference fields.
