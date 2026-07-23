# OGFI ERP — Phase II Workflow: Maintenance Management

**Status:** Controlled maintenance create, correction, complete, cancel, dashboard, detail, history, and export slice implemented
**Purpose:** Report, triage, assign, repair and close equipment and facility issues.

## Business Outcome

Define a controlled, role-aware, auditable workflow that follows OGFI core scope, approvals, audit, notification, security and Modern SaaS design standards. The current implementation supports scoped maintenance ticket creation, read-only source incident links, same-location asset history, non-terminal detail correction with `OperationalCorrectionRecord`, completion, cancellation, dashboard counts, notifications, and CSV export.

## Primary Roles

- Requester / operational user
- Responsible manager or department owner
- Required approver(s)
- Finance / compliance / quality reviewer where applicable
- Administrator or auditor with read-only oversight

## Standard Lifecycle

```text
Open → In Progress / Pending Vendor → Completed
                               ↘ Cancelled
```

Non-terminal detail correction keeps the current status and records correction reason, optional evidence reference, before/after audit data, and a same-status transition row. Completed and cancelled tickets are terminal for direct correction in the current slice.

## Implemented Workflow Sections

1. Trigger and eligibility for scoped maintenance ticket creation
2. Required fields, due-date validation, downtime, corrective action, and evidence reference
3. Scope: tenant, company, brand where applicable, and location
4. Permissioned create, correct, complete, and cancel actions
5. Cancellation path with reason and terminal-status guard
6. Notification and dashboard visibility for open, critical, and overdue tickets
7. Audit events, `OperationalStatusTransition`, and `OperationalCorrectionRecord` for correction actions
8. No downstream purchasing, inventory, incident, finance, or approval mutation
9. Desktop detail/list actions with source-incident navigation and same-asset history
10. Reports and UAT scenarios for create, correct, complete, cancel, filter, history, and export
11. Role-pooled `My Tasks` completion for active tickets, ordered by native priority, target due date, and age

## Non-Negotiable Controls

- No user may act outside assigned scope.
- Brand scope is exact, including company-level records whose brand is null.
- Critical- and high-priority completion or cancellation requires a known reporter and a different acting user. Medium- and low-priority tickets follow the current direct-completion policy.
- Ticket correction requires `restaurant.maintenance.correct`; create authority does not grant correction authority.
- Important actions require a timestamped audit event.
- Approval, financial, compliance or inventory-impacting actions must not be silently overwritten.
- Free-text comments do not replace structured fields, reason codes or evidence where those are required.
- Core document and security rules override this framework if a conflict exists.

## Open Decisions

Use `../implementation/PHASE2_DECISION_REGISTER.md` for future expansion such as assignment workflow, terminal reopen, source-incident correction after creation, escalation routes, vendor workflows, or approval-backed maintenance closure.
