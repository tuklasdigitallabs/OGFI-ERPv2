# OGFI ERP — Phase III Workflow: Budget Management

**Status:** Planned detailed-specification framework  
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
