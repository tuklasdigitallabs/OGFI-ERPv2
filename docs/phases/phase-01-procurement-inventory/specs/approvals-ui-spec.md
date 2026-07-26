# OGFI ERP — Approvals UI Specification

**Phase:** I  
**Primary users:** Assigned approvers, delegated approvers, managers, Finance, Executive, requesters  
**Purpose:** Let authorized users approve, reject, return, delegate, and monitor controlled transactions without losing record context.

---

## 1. Screen inventory

| ID | Screen | Purpose |
|---|---|---|
| APP-01 | Approvals Inbox | Queue of records requiring current user action |
| APP-02 | Approval Detail Panel / Record View | Decision in context of source record |
| APP-03 | Approval History | Full route, decisions, delegation, escalation, timestamps |
| APP-04 | Delegation Settings | Temporary delegation of eligible approval authority |
| APP-05 | Approval Aging | Managers/administrators monitor overdue actions |

## 2. Approvals Inbox

### Required columns / card fields

- Record type and number
- Title / supplier / key item context
- Company, brand, location
- Requester and department
- Amount/value where applicable
- Budget flag where applicable
- Age and required date
- Current approval step / priority
- Status
- Quick action only where sufficient context is safely visible

### Filters

- Record type/module
- Company/brand/location within scope
- Priority
- Age bucket
- Amount range
- Urgency
- Delegated to me / assigned to me
- Status

## 3. Detail decision experience

Approval actions must happen on the source record or a context-rich panel—not a blind one-line approval modal.

Always show:

- Document summary and transaction context
- Total amount/quantity and operational/financial impact
- Relevant attachments
- Prior steps and comments
- Current step and next route where permitted
- Audit summary
- Any policy warning: unbudgeted, emergency, discrepancy, high-value, blocked supplier, variance

For approval types without an approval-owned discussion writer, the detail surface must state that comments are read-only there and direct users to the authoritative source workspace. Empty audit history must have an explicit empty state rather than an unexplained blank panel.

### Primary actions

- Approve
- Return for revision
- Reject
- Request changes (where workflow allows)
- Delegate (not retroactively)

Reject, return, and request changes require a comment. Approval may require comment for exception states based on policy.

The normalized decision surface derives its visible and accepted actions from one
server-owned capability contract. It must not maintain a separate client action
matrix. The closed contract contains 18 approval families with exactly 18
Approve, 14 Return, and 18 Reject capabilities. A supported action may still be
temporarily unavailable: while the Payment Request approval-readiness policy is
unconfirmed, normalized `PaymentRequest` Approve is visibly disabled with the
stable policy-hold explanation and fails closed on direct server attempts;
Return and Reject remain available. This does not activate normalized routing.

The decision composer must preserve entered remarks and supplemental evidence
after correctable server errors, prevent duplicate submission while a decision is
pending, expose the pending state accessibly, and use controls at least 44px high.
Only families explicitly permitted by the server contract may accept
supplemental decision evidence; authoritative source-evidence requirements remain
enforced by the source workflow.

If live eligibility changes between inbox hydration and detail rendering, the inbox must show a user-safe stale-authority message and allow refresh; it must not expose a generic server error or imply that the decision remains available.

## 4. Approval history

Display timeline entries with:

- Step name and policy/template
- Assigned approver / delegated approver
- Action, comment, timestamp
- Escalation/reminder events
- Status changes and revision cycle

Do not allow edit/delete of completed approval events.

## 5. Delegation

- Delegation is temporary, effective-dated, scoped, and auditable.
- Original approver, delegate, modules/transaction types, company/location scope, start/end time must be shown.
- Delegation may not exceed the original approver’s permissions.
- Prohibit delegation to a requester where segregation-of-duties rule would be violated.
- Show delegated badge in inbox and record history.

## 6. Responsive behavior

- Mobile inbox uses cards; shows record, value, location, priority, age, and action status.
- Approval/detail action bar stays visible at bottom when reviewing long records.
- Confirm destructive/irreversible actions with clear consequence and comment field.

## 7. Acceptance criteria

- User cannot act on approval outside assigned role/scope.
- User cannot approve own request when policy prohibits it.
- Decision writes status, comment, audit event, next step, and notification atomically.
- Returned/rejected records clearly tell requester what to do next.
- Overdue/delegated states are distinguishable in inbox and history.

## 8. Current implementation boundary

`DEC-0244` implements the shared capability/version/digest contract and the
feature-disabled decision composer. `DEC-0245` adds the source foundation for a
mapping-, capability-, release-, tenant-, and company-bound durable backfill with
read-only assessment, fenced START/RESUME/STOP operations, and append-only
batch/blocker evidence. It does not change any visible Approval action.
`APPROVAL_ROUTING_V1_ENABLED` remains false.

The executor is intentionally non-operational. The normal web runtime has zero
privileges on its Run, Batch, and Blocker relations. No assessment or mutation may
run until a separate dedicated maintenance role, root-controlled credential, and
immutable operator/change/exact-release authority boundary is implemented and
accepted. Operator identity, authorization-reference, and release-SHA environment
values bind evidence only; they do not grant authority.

The current orchestration can stop only at `BARRIER_REQUIRED`; it cannot emit
`DRAIN_CLEAN`. Production activation still requires disposable and hosted
PostgreSQL authorization/concurrency/no-write/recovery evidence, a separately
implemented company producer barrier honored by all 18 source writers, final
clean passes and from-zero reconciliation, durable certification, authenticated
desktop/tablet/mobile verification, UAT, and an explicit activation decision.
While disabled, the public Approval Inbox fails closed rather than exposing a
legacy or parallel approval queue.
