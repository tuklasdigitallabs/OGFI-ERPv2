# OGFI ERP — Phase II Workflow: Branch Opening and Closing

**Status:** Implemented for branch checklist create, review, return-for-correction, correction apply, close, filter, export, dashboard, and notification-reminder visibility
**Purpose:** Manage required operational checks, sign-off, exceptions and evidence.

## Business Outcome

Define a controlled, role-aware, auditable workflow that follows OGFI core scope, approvals, audit, notification, security and Modern SaaS design standards.

## Primary Roles

- Requester / operational user
- Responsible manager or department owner
- Required approver(s)
- Finance / compliance / quality reviewer where applicable
- Administrator or auditor with read-only oversight

## Current Implementation Boundary

The current Phase II implementation manages branch opening and closing through
controlled branch operational checklist records. It supports:

- scoped checklist creation by authorized branch users;
- structured checklist lines with result, severity, notes, and evidence reference;
- business-date, shift, status, and search filtering;
- manager review from submitted records, with self-review blocked;
- return-for-correction with reason and optional evidence reference;
- correction apply from returned records, with before/after audit history and a
  `RETURNED` to `SUBMITTED` transition for re-review;
- controlled close from reviewed or exception-open records with required reason;
- CSV export preserving list filters;
- dashboard and notification visibility for review-ready records without
  performing review from the dashboard.

Branch checklist actions write audit events and `OperationalStatusTransition`
rows with actor, scope, source entity, from/to status, reason/evidence where
applicable, and idempotency key. The workflow does not post inventory, create
incidents, approve adjustments, replace maintenance records, or create finance
changes.

## Current Lifecycle

```text
Submitted → Manager Review → Closed
               ↘ Returned → Submitted
```

## Implemented Workflow Sections

1. Trigger and eligibility: authorized branch-operation users create scoped
   checklists for the selected location and business date.
2. Required fields and evidence: checklist name, business date, shift, and
   structured lines are required; evidence references are captured per line.
3. Scope: company, brand when configured, and location are enforced in services.
4. Review authority: `restaurant.branch_operations.review` reviews/closes;
   `restaurant.branch_operations.correct` returns for correction.
5. Exception path: exceptions remain in the checklist source record until a
   permitted reviewer closes or returns them.
6. Notification events: review-ready reminders are source-linked and do not
   mutate the checklist.
7. Data and audit records: checklist rows, line rows, audit events,
   correction records, and status-transition rows.
8. Downstream impact: no automatic inventory, finance, incident, or maintenance
   mutation.
9. Desktop/tablet/mobile actions: list, detail, create modal, review, return,
   correction apply, close, and export.
   The shared `My Tasks` queue may surface independent review work and pooled
   returned-checklist correction work, but the source detail reauthorizes every
   action. Final close is not enrolled until its self-action policy is confirmed.
10. Reports and UAT scenarios: covered by the Phase II UAT scenarios and
    Restaurant Ops export/report specs.

## Non-Negotiable Controls

- No user may act outside assigned scope.
- Important actions require a timestamped audit event.
- Approval, financial, compliance or inventory-impacting actions must not be silently overwritten.
- Free-text comments do not replace structured fields, reason codes or evidence where those are required.
- Core document and security rules override this framework if a conflict exists.

## Open Decisions

Future expansion such as additional branch-opening approvals, escalation timers,
attachment upload enforcement, terminal reopen, automatic incident generation,
or workforce/POS integrations must be recorded in
`../implementation/PHASE2_DECISION_REGISTER.md` before implementation.
