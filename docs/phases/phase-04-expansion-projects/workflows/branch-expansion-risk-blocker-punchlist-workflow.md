# Branch Expansion Risk, Blocker, Issue, and Punch List Workflow

## Definitions

- **Risk:** Potential future event with probability/impact and mitigation.
- **Blocker:** Current impediment preventing progress.
- **Issue:** Active problem requiring ownership and resolution.
- **Punch list / defect:** Incomplete, defective, or nonconforming construction/readiness item requiring inspection and closure evidence.

## Required fields

- Project and workstream
- Category/type
- Title and description
- Severity / impact
- Owner and responsible party
- Date raised
- Target resolution date
- Schedule, budget, compliance, opening-date, or readiness impact
- Status
- Evidence attachments/comments
- Escalation owner where applicable

## Workflow

1. Authorized user records risk, blocker, issue, or defect.
2. System assigns/validates owner and scope.
3. User records impact and supporting evidence.
4. System links the item to affected task, milestone, permit, contractor, or workstream where applicable.
5. Owner updates mitigation/resolution progress.
6. Review/inspection evidence is attached when closure requires it.
7. Authorized reviewer closes, reopens, or escalates the item.
8. System preserves full activity history.

## Guardrails

- Blocked work item status requires an associated blocker detail or equivalent mandatory fields.
- Closed defect/punch-list items require closure evidence and reviewer if configured.
- Financial impact is a controlled link/estimate; it does not create an accounting transaction.
- Repeated unresolved high-severity items must remain visible in dashboard/exception reporting.
