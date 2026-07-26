# OGFI ERP — Phase II Workflow: Incident Management

**Status:** Controlled incident create, correction, resolve, cancel, dashboard, detail, and export slice implemented
**Purpose:** Log, investigate, resolve and verify restaurant operational incidents.

## Business Outcome

Define a controlled, role-aware, auditable workflow that follows OGFI core scope, approvals, audit, notification, security and Modern SaaS design standards. The current implementation supports scoped incident creation, read-only source-record links, non-terminal detail correction with `OperationalCorrectionRecord`, resolution, cancellation, list/detail visibility, dashboard counts, notifications, and CSV export.

## Primary Roles

- Requester / operational user
- Responsible manager or department owner
- Required approver(s)
- Finance / compliance / quality reviewer where applicable
- Administrator or auditor with read-only oversight

## Standard Lifecycle

```text
Open → In Progress / Pending Review → Resolved
                                  ↘ Cancelled
```

Non-terminal detail correction keeps the current status and records correction reason, optional evidence reference, before/after audit data, and a same-status transition row. Resolved and cancelled incidents are terminal for direct correction in the current slice.

## Implemented Workflow Sections

1. Trigger and eligibility for scoped incident creation
2. Required fields, due-date validation, corrective action, and evidence reference
3. Scope: tenant, company, brand where applicable, and location
4. Permissioned create, correct, resolve, and cancel actions
5. Cancellation path with reason and terminal-status guard
6. Notification and dashboard visibility for open and critical incidents
7. Audit events, `OperationalStatusTransition`, and `OperationalCorrectionRecord` for correction actions
8. No downstream inventory, financial, maintenance, approval, or source-record mutation
9. Desktop detail/list actions with source-record navigation
10. Reports and UAT scenarios for create, correct, resolve, cancel, filter, and export

### Dashboard profile boundary

`DEC-0228` adds four read-only, incident-record dashboard destinations. Open contains
`OPEN`, `IN_PROGRESS`, and `PENDING_REVIEW`. Critical includes every `CRITICAL`
incident across all statuses as a retained severity-history lens. Pending Review is
the complete scoped `PENDING_REVIEW` oversight population and does not imply assigned
or actor-actionable work. Overdue uses a captured operating-date cutoff and includes
records with `dueAt` before that date, `resolvedAt` null, and status other than
`CANCELLED`.

All four profiles use exact session tenant, selected company, nullable selected
brand, and selected location scope. Their populations may overlap and must not be
added together. A bounded search may only narrow membership. Raw status, severity,
and incident-date inputs cannot redefine it; invalid profile or cutoff parameters
fail before data access. The overdue cutoff is stable for the opened link, but the
rows reflect current Incident records rather than a historical snapshot.

Profile mode grants no create, export, correction, resolve, cancel, or assignment
authority. Create and ordinary export are unavailable from the profile, and direct
profile-export requests fail. Detail and command paths independently reauthorize the
live actor, record, status, and exact scope while preserving only canonical return
context. Profile lists exclude narrative, corrective action, evidence, source-record
ID, and audit detail; those remain controlled by the source detail boundary.

## Non-Negotiable Controls

- No user may act outside assigned scope.
- Important actions require a timestamped audit event.
- Approval, financial, compliance or inventory-impacting actions must not be silently overwritten.
- Free-text comments do not replace structured fields, reason codes or evidence where those are required.
- Core document and security rules override this framework if a conflict exists.

The shared `My Tasks` queue may surface one role-pooled resolution obligation
per active incident. High- and critical-severity work requires known reporter
lineage and an independent resolver. Cancellation remains a destination
exception and detail correction remains outside the queue; every action is
reauthorized by the Incident source service.

## Open Decisions

Use `../implementation/PHASE2_DECISION_REGISTER.md` and the core open-decision
register for future expansion. Before an Incident production-readiness claim, owners
must reconcile the documented and implemented correction permission, define a
supported transition into `PENDING_REVIEW` if that state remains operative, define
assignment authority/commands before describing incidents as assigned, and confirm
or enforce the invariant between terminal status and `resolvedAt`. Terminal reopen,
source-link correction after creation, escalation routes, and approval-backed
incident closure also remain future decisions.
