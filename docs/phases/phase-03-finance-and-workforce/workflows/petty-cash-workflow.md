# OGFI ERP — Phase III Workflow: Petty Cash

**Status:** Implemented structural foundation; amount-change policy and production activation remain gated

**Purpose:** Control petty cash release, liquidation, replenishment and reconciliation.

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

## Approval-Amount Integrity Foundation (Feature-Disabled)

- Submission initializes a typed current approval amount from the requested amount and starts its proposal version at `1` for a complete normalized approval chain.
- The database now provides an immutable typed approval-step-intent relation with exact step/instance/request lineage, amount and version bounds, scoped uniqueness, and always-enabled mutation guards. The application writer and proposal-version compare-and-set are not implemented yet, so no runtime claim is made that every acted step records this intent.
- The current approval amount is distinct from the terminal approved amount. The former carries the active chain's proposal; the latter is written only when the final approval completes.
- When final approval omits an amount, it preserves the current approval amount rather than restoring the original request amount. Return, rejection, or cancellation clears the active proposal without rewriting immutable step intent.
- Approval-time amount changes are blocked in both legacy and canonical modes. The source workspace exposes no request-approval amount override. Finance and Operations must first confirm whether approvers may reduce, increase, restore, or leave the amount unchanged, together with bounds, reason, and acknowledgment requirements.
- The target transaction boundary is approval action, current proposal/version, immutable step intent, terminal source effect, audit, and permitted notification in one canonical transaction. That runtime writer is pending, and normalized routing stays disabled until its documented release gates pass.

## Open Decisions

The intermediate amount-change policy remains open. Use `../implementation/PHASE3_DECISION_REGISTER.md` and the core open-decisions register to record the authorized conclusion before enabling that behavior. The implemented structure does not make this workflow production-ready.
