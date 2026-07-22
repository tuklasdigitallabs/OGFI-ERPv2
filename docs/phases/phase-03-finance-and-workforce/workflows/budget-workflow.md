# OGFI ERP — Phase III Workflow: Budget Management

**Status:** Planned detailed-specification framework; feature-disabled Budget Revision lifecycle checkpoint implemented
**Purpose:** Create, approve, revise, allocate and monitor branch, department and project budgets.

## Business Outcome

Define a controlled, role-aware, auditable workflow that follows OGFI core scope, approvals, audit, notification, security and Modern SaaS design standards.

## Primary Roles

- Requester / operational user
- Responsible manager or department owner
- Required approver(s)
- Finance / compliance / quality reviewer where applicable
- Administrator or auditor with read-only oversight

## Standard Lifecycle

```text
Draft → Submitted → Under Review / Approved / Returned → In Progress → Completed / Closed
                          ↘ Rejected / Cancelled / Reversed where policy allows
```

## Implemented Budget Revision checkpoint (not enabled for users)

When normalized approval routing is enabled in a future reviewed release, a submitted Budget Revision begins with all approval steps waiting. A separate authorized commitment-fit review may atomically make only the first approved route step actionable and move the revision to `Under Review`. An authorized cancellation before that review cancels the revision and terminates the all-waiting approval route together; it does not leave a pending step behind.

The server rechecks live authority, scope, the exact route state, and the exact revision state before any action. A concurrent review, cancellation, or approval that has already changed the route causes a stale action to fail rather than overwrite it. These mechanics are behind `APPROVAL_ROUTING_V1_ENABLED=false`; they are not a current user-facing operating procedure or production approval authorization.

## Required Workflow Sections to Finalize

1. Trigger and eligibility
2. Required fields and attachments
3. Scope: company, brand, branch, warehouse, project and department
4. Approval route and delegated authority
5. Exception, rejection, cancellation and reversal paths
6. Notification and escalation events
7. Data and audit records created
8. Downstream inventory, financial, workforce, project or integration impact
9. Desktop, tablet and mobile actions
10. Reports and UAT scenarios

## Non-Negotiable Controls

- No user may act outside assigned scope.
- Important actions require a timestamped audit event.
- Approval, financial, compliance or inventory-impacting actions must not be silently overwritten.
- Free-text comments do not replace structured fields, reason codes or evidence where those are required.
- Core document and security rules override this framework if a conflict exists.

## Open Decisions

Use `../implementation/PHASE3_DECISION_REGISTER.md` to record phase-specific policy decisions before this workflow is marked build-ready.
