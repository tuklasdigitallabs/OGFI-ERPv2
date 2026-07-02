# Work Management Shared Engine — Data Model Extension

## Design stance

This is a logical data-design extension, not a directive to change the active schema. Implementation must reconcile with current repository conventions and use approved migrations only.

## Core entities

| Entity | Key purpose | Required integrity expectations |
|---|---|---|
| WorkContainer | Common parent for project, campaign, rollout, or program | Company-scoped; type-specific extension owns specialty fields. |
| BoardTemplate | Reusable workflow/board definition | Controlled configuration; no unapproved global mutations. |
| BoardColumn / WorkflowState | Ordered visible state for a template | Semantic category retained for reporting and controls. |
| WorkItem | Shared task/action record | Company scoped; one accountable owner; audited state transitions. |
| WorkAssignment | User roles on a work item | Unique constraints prevent duplicate identical role assignments. |
| ChecklistItem | Verifiable completion step | Required/optional state and completion actor/time. |
| WorkDependency | Predecessor/successor relationship | Prevent self-dependency and circular paths. |
| WorkComment | Collaboration entry | Author, timestamps, visibility/scope, immutable audit relationship. |
| WorkAttachment | Attached file metadata/reference | Authorized access, retention, scan/status metadata if supported. |
| WorkActivityEvent | Immutable event stream | Records actor, action, before/after summary, time, correlation id. |
| WorkLink | Reference to controlled ERP object | Type/id/authorized summary; does not create cross-module mutation rights. |
| Milestone | Material date/gate | Container-scoped, date rules, owner, evidence/approval link where required. |
| RiskBlocker | Risk/blocker/issue record | Severity, owner, status, due date, impact dimension. |
| CalendarEvent | Derived or explicit calendar event | Distinguishes date-only and timezone-aware entries. |
| NotificationDelivery | Notification/outbox result | Idempotent delivery key and recipient authorization. |

## Required fields / dimensions

Every container and work item must carry:

- Company
- Type
- Status/state
- Creator and timestamps
- Audit/version control field
- Applicable brand, location, department, cost center, project/campaign fields where required
- Restricted visibility flag and membership relationship where enabled

## Invariants

- A work item has one and only one accountable owner once active, unless an approved template permits a pre-assignment draft state.
- Posted/controlled ERP records are only linked, never mutated through the work-management engine.
- Material records are not hard-deleted.
- Activity events are append-only.
- Work dependency graph must not be cyclic.
- Board ordering changes must use a stable ordering strategy and concurrency control.
- Date-only values must not be serialized as UTC midnight in a way that shifts displayed calendar date.
- All queries filter by server-authorized scope.

## Performance and migration notes

- Index common filters: company, container, state, assigned user, accountable owner, due date, archived flag, updated timestamp.
- Build pagination for activity/comments/attachments.
- Avoid fan-out notifications inside request transactions without an outbox/idempotency strategy.
- Backfill or migration must preserve existing project/task identities and historical activity if such data already exists.
