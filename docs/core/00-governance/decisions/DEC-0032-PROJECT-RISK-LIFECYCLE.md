# DEC-0032 - Project Risk Lifecycle

## Status

Accepted for first implementation slice.

## Context

Phase 1.5 requires project risks in addition to task blockers. Risks must help
Project Managers and Sponsors coordinate implementation issues without turning
the tracker into the source of truth for purchasing, receiving, inventory,
approval, or financial records.

## Decision

Implement `ProjectRisk` as a project-scoped advisory record with lifecycle
states:

- `OPEN`
- `MITIGATING`
- `MITIGATED`
- `ACCEPTED`
- `REALIZED`
- `CLOSED`
- `CANCELLED`

Risks store title, description, category, likelihood, impact, derived severity,
owner, optional task/milestone context, target mitigation date, mitigation plan,
resolution notes, evidence reference text, version, archive marker, and actor
metadata.

## Required Safeguards

- Risk reads use existing authorized project visibility.
- Risk writes require risk-specific permission plus project mutation access.
- Terminal and accepted states require reason/resolution text.
- High and critical risks require target mitigation date on create.
- Every create and status transition writes `ProjectActivityEvent`.
- Risk transitions must not import or call operational mutation services.
- Direct source-record links from risks remain deferred; use `ProjectRecordLink`
  only after a separate source-link authorization decision.

## Deferred

- Notification fanout/escalation thresholds.
- Project-closure guard for unresolved risks.
- Source-record risk linking.
- Risk archive/restore UI.
- Full task-grain reporting over risks.
