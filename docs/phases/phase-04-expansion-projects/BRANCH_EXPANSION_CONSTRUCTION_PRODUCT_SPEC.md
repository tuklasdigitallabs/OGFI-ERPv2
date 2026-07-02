# Branch Expansion & Construction — Product Specification

## Purpose

Provide a specialized project-control workspace for branch openings, branch relocations, renovations, expansions, kitchen upgrades, warehouse/commissary projects, major equipment replacement, and mall/compliance projects.

It uses the shared Work Management Engine but adds project lifecycle, site, capex, permit, contractor, construction, opening-readiness, and handover controls.

## Scope

### In scope

- Project header and phase lifecycle
- Workstreams and specialized boards
- Project dashboard with schedule, risk, completion, and financial-link summaries
- Site/mall/branch context
- Permit and document tracker
- Contractor/supplier references
- Capex and procurement/payment reference links
- Calendar, milestones, and future timeline/Gantt view
- Risk register, blockers, issues, punch list/defects
- Opening readiness, handover, and post-opening stabilization checklist
- Assignment to named users and workstream ownership

### Out of scope for first release

- Construction accounting or payment release within the tracker
- Automated critical-path calculations
- Contractor external portal
- Public project documents
- Full BOQ authoring engine
- Automated permit filing
- Resource leveling
- Legal contract authoring

## Project header

| Field | Requirement |
|---|---|
| Project name and code | Required; unique within company policy. |
| Project type | Configurable controlled list. |
| Company / brand / proposed location | Required as applicable. |
| Project sponsor / project manager | Required for active projects. |
| Target opening date | Required for opening/relocation/expansion types unless formally exempted. |
| Project phase / status | Controlled lifecycle values. |
| Approved capex / committed / actual / remaining | Links to Finance; read-only or permission-controlled summary. |
| Overall completion / risk level / current blocker | Derived or controlled fields with audit evidence. |
| Restricted project flag | Enables membership-based visibility. |

## Default lifecycle and gate model

1. Opportunity / Site Evaluation
2. Business Case & Investment Approval
3. Lease, Legal & Permits
4. Design, BOQ & Technical Planning
5. Procurement & Contractor Award
6. Construction / Fit-Out
7. Pre-Opening Readiness
8. Opening & Handover
9. Post-Opening Stabilization
10. Closed / Archived

Project phases are not merely board columns. A phase transition may require gate evidence and approval.

## Required workstreams

- Site / Mall Coordination
- Legal / Lease / Permits
- Design & Construction
- Procurement
- Finance & Capex
- IT & Systems
- Kitchen Equipment
- Operations Readiness
- HR & Staffing
- Training
- Marketing & Opening Campaign
- Compliance & Safety

Workstreams are configurable, but templates must preserve relevant dependencies and phase gates.

## Views

- **Dashboard:** opening date, completion, workstream health, risks/blockers, capex summary links, upcoming milestones, late tasks, gate readiness.
- **Board:** task execution by workstream/status.
- **List:** filterable manager control view.
- **Calendar:** inspections, permits, deliveries, installs, training, soft opening, grand opening, deadlines.
- **Milestones:** gate-focused control view.
- **Timeline/Gantt:** later derived sequencing/dependency view.
- **Documents:** authorized site, permit, design, contract, photo, checklist evidence.
- **Risks / Blockers / Punch List:** control and escalation view.

## Critical controls

- Work completion cannot release a PO, approve payment, post a journal, receive inventory, or close a finance record.
- A blocked task requires reason, owner, expected resolution, and impact on opening date/budget/compliance.
- Phase gates require configured evidence/approval before reporting a phase as complete.
- Project financial data is sourced from Finance; Expansion displays authorized links and summaries rather than creating a parallel financial ledger.
- Target opening date changes require an authorized reason and activity history.
- Project archive preserves evidence and audit history.
