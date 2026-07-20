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
5. Owner updates mitigation/resolution progress. A high or critical item identifies an escalation owner and initial evidence reference when it is raised.
6. The owner or contributor submits rectification to `For review`; a punch-list item cannot skip from planning, active work, or blocked directly to closed.
7. Closure records an inspection, rectification, turnover, warranty, or linked-record evidence reference. High and critical items require an independent reviewer: the closer cannot be the item creator or owner, and the project sponsor is the reviewer when one is assigned.
8. A reviewer can return an item from `For review` to active work only with a reason. A completed or cancelled item can be reopened to active work only with a reason; the original closure or cancellation remains in the activity history.
9. System preserves full activity history and prevents stale concurrent updates through the task version.

## Guardrails

- Blocked work item status requires an associated blocker detail or equivalent mandatory fields.
- Closed defect/punch-list items require closure evidence and reviewer if configured.
- The implemented pilot baseline uses `PLANNED → IN_PROGRESS ↔ BLOCKED → FOR_REVIEW → COMPLETED`; `WAITING_FOR_APPROVAL` is not used for punch-list records to avoid duplicate review semantics.
- High and critical items require an escalation owner and initial evidence reference. Formal named workstream reviewer configuration and file uploads remain release follow-ups; typed evidence references are auditable interim records, not uploaded evidence files.
- Financial impact is a controlled link/estimate; it does not create an accounting transaction.
- Repeated unresolved high-severity items must remain visible in dashboard/exception reporting.
