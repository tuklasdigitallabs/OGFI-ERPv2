# Branch Expansion & Construction — Data Model Extension

## Design stance

Logical design only. It must be reconciled with the active schema and approved migration process before implementation.

## Specialized entities

| Entity | Purpose | Key constraints |
|---|---|---|
| ExpansionProject | Specialized work container for expansion/construction | Company + project type + sponsor/manager + lifecycle state. |
| ExpansionSite | Candidate/proposed/active site data | Scoped and confidential where required. |
| ExpansionWorkstream | Controlled category of project work | Linked to shared container and template. |
| PhaseGate | Required lifecycle approval/evidence checkpoint | Cannot show pass without evidence and configured authority. |
| PermitTrackerEntry | Permit/inspection requirement and deadlines | Date, authority, status, evidence, owner. |
| ContractorReference | Authorized link to supplier/contractor/master data | No duplicate vendor source of truth. |
| ProjectMilestone | Specialized milestone summary | Uses shared milestone/date/dependency behavior. |
| ProjectRiskIssue | Specialized risk/blocker/issue metadata | Uses shared risk/blocker records or extension. |
| PunchListItem | Construction defect/nonconformance tracker | Inspection/closure evidence and reviewer controls. |
| OpeningReadinessCheck | Readiness checklist record | Controlled completion/approval evidence. |
| ProjectRequirement | Project-scoped evidence or signoff requirement copied from a published playbook | Stores only the requirement, role owner/reviewer, controlled state, and references to existing project attachments or source-record links; never stores a confidential ERP payload. |
| ProjectFinancialReference | Link to budget, PR, PO, invoice, payment, capex source records | Reference-only/authorized summary; no financial mutation rights. |

## Required fields and relationships

- ExpansionProject extends or references WorkContainer; do not duplicate shared task/comment/attachment/activity entities.
- Project code must meet company uniqueness rules.
- Proposed location can be a future project site before a branch master record exists.
- A branch link is created/updated only through authorized branch-master workflow.
- All significant dates distinguish date-only vs scheduled datetime.
- Gate, permit, punch-list, readiness, and risk records are project scoped and auditable.

## Invariants

- Lifecycle phase cannot report as completed if required open gate(s) are incomplete unless an approved exception is recorded.
- Target opening date changes preserve baseline and change history where approved.
- Financial references cannot independently change budget, commitments, AP, payments, or accounting data.
- Project closure/archive preserves linked records, evidence, and audit history.
