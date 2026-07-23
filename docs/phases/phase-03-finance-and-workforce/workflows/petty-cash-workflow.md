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
- The feature-disabled normalized writer now records exactly one immutable typed approval-step intent for every acted current-step approve, return, or reject. It binds exact step/instance/request lineage, the actor/action, unchanged six-decimal amount snapshots, consecutive proposal versions, normalized reason and supplemental context, and a stable server-derived hash/idempotency key. PostgreSQL retains scoped uniqueness, lineage validation, and always-enabled append-only mutation guards. Skipped, cancelled, failed, and unauthorized steps record no intent.
- The current approval amount is distinct from the terminal approved amount. The former carries the active chain's proposal; the latter is written only when the final approval completes.
- Every normalized decision performs an exact locked-source Decimal compare-and-swap over the proposal amount/version. Intermediate approval preserves the unchanged proposal and increments the version. Terminal approve, return, or reject clears the active proposal while retaining the incremented version; final approval writes that unchanged proposal as the approved amount. Cancellation clears through its existing path and creates no acted-step intent.
- Approval-time amount changes are blocked in both legacy and canonical modes. The source workspace exposes no request-approval amount override. Finance and Operations must first confirm whether approvers may reduce, increase, restore, or leave the amount unchanged, together with bounds, reason, and acknowledgment requirements.
- Petty Cash alone opts into bounded full-graph canonical preflight: the transaction locks and reuses the approval parent/ordered steps, locks current-step scope metadata and the exact active fund/location-backed source, reconciles source scope, and skips future terminal steps without a second graph re-lock. Intent, proposal CAS, approval/source effect, audit, and permitted notification commit or roll back together and create no payment, bank, journal, fund, ledger, disbursement, or settlement effect.
- Fifteen disposable-PostgreSQL behavioral specifications are implemented but locally unexecuted because the required administrator URL is unavailable. Normalized routing stays disabled, and PostgreSQL behavioral acceptance and production activation remain NO-GO until the exact-candidate database and wider release gates pass.

## Open Decisions

The intermediate amount-change policy remains open. Use `../implementation/PHASE3_DECISION_REGISTER.md` and the core open-decisions register to record the authorized conclusion before enabling that behavior. The implemented structure does not make this workflow production-ready.
