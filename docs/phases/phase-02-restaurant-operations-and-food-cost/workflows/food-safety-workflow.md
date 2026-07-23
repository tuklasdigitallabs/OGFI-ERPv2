# OGFI ERP — Phase II Workflow: Food Safety and Compliance

**Status:** Implemented for food-safety log create, review, return-for-correction, correction apply, close, filter, export, dashboard, and notification-reminder visibility
**Purpose:** Capture temperature, sanitation, checklists, non-conformance and corrective action records.

## Business Outcome

Define a controlled, role-aware, auditable workflow that follows OGFI core scope, approvals, audit, notification, security and Modern SaaS design standards.

## Primary Roles

- Requester / operational user
- Responsible manager or department owner
- Required approver(s)
- Finance / compliance / quality reviewer where applicable
- Administrator or auditor with read-only oversight

## Current Implementation Boundary

The current Phase II implementation supports controlled food-safety logs for
temperature, sanitation, and exception tracking. It includes:

- scoped food-safety log creation by authorized branch users;
- structured readings with station, measured value, expected range, result,
  severity, corrective action, and evidence reference;
- business-date, log-type, status, and search filtering;
- review from submitted or exception-review records, with self-review blocked;
- exception records remaining as source compliance records rather than
  automatically creating inventory, wastage, incident, or finance changes;
- return-for-correction with reason and optional evidence reference;
- correction apply from returned records, with before/after audit history and a
  `RETURNED` to `SUBMITTED` transition for re-review;
- controlled close from reviewed or exception-open records with required reason;
- CSV export preserving list filters;
- dashboard and notification visibility for review-ready food-safety records
  without performing review from the dashboard.

Food-safety actions write audit events and `OperationalStatusTransition` rows
with actor, scope, source entity, from/to status, reason/evidence where
applicable, and idempotency key. The workflow does not post wastage, adjust
stock, create incidents, approve records, or create finance changes.

## Current Lifecycle

```text
Submitted → Exception Review / Reviewed → Closed
                    ↘ Returned → Submitted
```

## Implemented Workflow Sections

1. Trigger and eligibility: authorized food-safety users create scoped logs for
   the selected location and business date.
2. Required fields and evidence: log type, title, business date, and structured
   readings are required; evidence references are captured per reading.
3. Scope: company, brand when configured, and location are enforced in services.
4. Review authority: `restaurant.food_safety.review` reviews/closes;
   `restaurant.food_safety.correct` returns for correction.
5. Exception path: exception logs stay in the food-safety source module until
   permitted review or correction action.
6. Notification events: review-ready reminders are source-linked and do not
   mutate food-safety records.
7. Data and audit records: log rows, reading rows, audit events, correction
   records, and status-transition rows.
8. Downstream impact: no automatic inventory, wastage, incident, approval, or
   finance mutation.
9. Desktop/tablet/mobile actions: list, detail, create modal, review, return,
   correction apply, close, and export.
   The shared `My Tasks` queue may surface independent review and pooled
   returned-log correction work, but the source detail reauthorizes every
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

Future expansion such as formal approval routes, escalation timers, attachment
upload enforcement, terminal reopen, automatic wastage/incident creation, or
regulatory integrations must be recorded in
`../implementation/PHASE2_DECISION_REGISTER.md` before implementation.
