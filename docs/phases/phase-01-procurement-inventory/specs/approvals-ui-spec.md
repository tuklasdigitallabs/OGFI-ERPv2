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
