# OGFI ERP — Phase II Workflow: Incident Management

**Status:** Controlled incident create, correction, resolve, cancel, dashboard, detail, and export slice implemented
**Purpose:** Log, assign, investigate, resolve and verify restaurant operational incidents.

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

Use `../implementation/PHASE2_DECISION_REGISTER.md` for future expansion such as assignment workflow, terminal reopen, source-link correction after creation, escalation routes, or approval-backed incident closure.
