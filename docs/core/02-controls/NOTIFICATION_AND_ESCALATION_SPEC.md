# OGFI ERP — Notification and Escalation Specification

**Status:** Phase I baseline  
**Purpose:** Ensure requests and operational exceptions are acted on without creating alert fatigue.

---

## 1. Principles

- In-app notification is mandatory for all actionable workflow events.
- Email is used for material, overdue, cross-location, or high-risk events; it is not a substitute for the in-app task queue.
- Notifications are scope-aware. A user receives only events they are authorized to see.
- A notification must link to the relevant record and clearly state the next action.
- Read status does not equal completion. Workflow status remains the source of truth.
- Reminder and escalation rules are configurable by transaction type and policy.

## 2. Notification priority

| Priority | Use cases | Delivery |
|---|---|---|
| Critical | Expired/blocked operational item, severe receiving discrepancy, approval breach requiring executive action | In-app immediately + email; optional future SMS/WhatsApp |
| High | Approval overdue, critical stock, transfer receipt overdue, high-value wastage/adjustment | In-app immediately + email digest/escalation |
| Normal | New task, submitted PR, PO approved, delivery scheduled | In-app; optional email preference |
| Informational | Record update, completed action, report ready | In-app center; optional digest |

## 3. Standard trigger matrix

| Event | Primary recipients | Priority | Required content | Escalation |
|---|---|---|---|---|
| Purchase Request submitted | Current approver | Normal | PR number, requester, location, value, required date, next action | Reminder if unacted |
| PR returned/rejected | Requester + manager | Normal / High if urgent | Reason, requested revision, deadline | None unless resubmitted overdue |
| PR approved / route complete | Purchasing queue owner | Normal | PR context, items, required date | Queue aging |
| PO pending approval | Current approver | Normal | PO number, supplier, value, branch/warehouse | Reminder/escalation |
| PO sent / approved | Requester + receiving location | Informational | Supplier, expected delivery date, items | Delivery due alert |
| Delivery due today | Receiving location user + purchaser | Normal | PO/RR context, expected window | Overdue after cutoff |
| Receiving discrepancy | Purchasing, receiving user, branch/warehouse manager | High | PO/RR, item, expected vs accepted, reason, evidence | Escalate unresolved discrepancy |
| Transfer submitted | Source location dispatch role | Normal | Source, destination, items, required date | Reminder if not dispatched |
| Transfer dispatched | Destination receiving role | Normal | Transfer number, items, dispatch date | Escalate if not received on due date |
| Transfer receipt overdue | Destination manager + source manager + Operations | High | Transfer context, days overdue | Escalate to Operations Manager |
| Critical or low stock | Location storekeeper/manager + purchasing/warehouse as configured | High / Normal | Item, location, on-hand, par, suggested action | Daily digest / critical immediate alert |
| Stock count due | Assigned counter / manager | Normal | Location, count schedule, due date | Overdue escalation |
| Count variance pending review | Manager/approver | High | Count number, value/quantity variance, action | Reminder/escalation |
| Wastage submitted | Manager/approver | Normal / High | Item, qty, value, reason, evidence | Escalate high-value or overdue |
| Stock adjustment submitted | Manager/approver | High | Item, impact, reason, evidence | Escalate high-value or overdue |
| Approval delegated | Delegate + original approver | Informational | Effective date, scope, assigned tasks | Expiry reminder |
| System/report export ready | Requester | Informational | Report title, scope, expiry | None |

## 4. Approval reminders and escalation default

Unless a policy overrides it:

```text
At submission: notify current approver
After 24 hours: first in-app reminder
After 48 hours: second in-app reminder + email where enabled
After 72 hours: escalate to approver's manager / configured escalation role
After escalation: show overdue label in dashboard and My Tasks until action
```

For urgent requests, the template may use shorter periods. No escalation may auto-approve a financial or inventory-control transaction unless an explicit policy is approved.

## 5. Delivery, transfer, and count aging

| Workflow | Default aging rule |
|---|---|
| Supplier delivery | Notify on expected date; overdue after configured receiving cutoff / next business day |
| Transfer dispatch | Reminder before required date; overdue after required date |
| Transfer receipt | Due on expected receipt date; high-priority after one business day overdue |
| Stock count | Reminder 24 hours before due; overdue at end of assigned operating day |
| Discrepancy resolution | High priority at creation; escalation if unresolved after 48 hours by default |

## 6. Notification content standard

Every actionable notification must include:

- Verb-based title: `Approve Purchase Request`, `Receive Transfer`, `Review Stock Variance`.
- Record number and brief context.
- Company / brand / location where relevant.
- Value, quantity, due date, or risk indicator when relevant.
- Current status and next action.
- Direct deep link.
- Timestamp and priority.

Avoid vague titles such as “You have an update.”

## 7. User experience requirements

- Notifications appear in a bell/notification center and My Tasks if action is required.
- Group repeated events by record only when the latest state is still understandable.
- Provide filters: unread, actionable, priority, module, location, date.
- Do not allow a user to mark a critical action complete only by dismissing the notification.
- Support read/unread, archive, and preference controls for non-critical informational notifications.
- Mobile notification deep links must open the relevant responsive record screen.

## 8. Configuration fields

Each notification policy should allow:

- Transaction/event type
- Priority
- Recipient roles and/or specific assignees
- Scope filters: company, brand, location, department
- Delivery channels
- Reminder intervals
- Escalation chain
- Business-hours behavior
- Optional digest inclusion
- Template title/body variables
- Enabled/disabled status

## 9. Audit and observability

Store notification events with record reference, recipient, channel, generated time, delivery status, read time, escalation level, and failure reason. Do not expose private notification content outside the recipient’s scope.


---

## Projects & Implementation Tracker — Notification Addendum

### Required events

| Event | Primary recipient | Default channel | Escalation rule |
|---|---|---|---|
| Task assigned | Assignee | In-app; optional email | Reminder if not acknowledged or started per project policy. |
| Task due soon | Assignee and task owner | In-app | Default reminder at configured lead time. |
| Task overdue | Assignee, task owner, Project Manager | In-app and email | Escalate to Project Sponsor after configured grace period. |
| Task marked blocked | Task owner and Project Manager | In-app and email | Escalate based on project severity and due-date risk. |
| Task returned for review | Assignee | In-app | No automatic escalation unless overdue. |
| Milestone at risk | Project Manager and Sponsor | In-app and email | Escalate when milestone date is likely to miss. |
| Linked controlled record changed | Task owner / Project Manager | In-app | Only if user has both project and source-record visibility. |

Notification rules are configurable by project template and severity. Notification delivery must never reveal confidential linked-record content to a user who lacks access to the source record.

Current implementation note: the notification slice reuses the scoped in-app
notification foundation without adding queues. Approval reminders are generated
only by a permissioned manual scan of the current user's server-authorized
approval queue. Project task due-soon/overdue reminders are generated by a
permissioned manual project reminder scan. These scans create in-app
notification visibility and audit/activity evidence only; they do not approve,
reject, post, receive, close, reverse, escalate authority, or mutate source
records.

Operational approval-submission fanout is implemented for Wastage Reports and
Stock Adjustments. These workflows create scoped in-app approval notifications
for the first active approval step using the same source audit event as the
idempotency key. The notification is an attention record only; the approval
instance and source workflow remain the controlling records.

Project notifications also emit idempotent notifications for blocked project
tasks, high/critical project risks, and at-risk milestones to server-derived
project manager, sponsor, owner, and active manager/sponsor/administrator
members. Notification bodies use project/task/risk metadata only and do not
include raw blocker reasons, risk descriptions, attachment details,
source-record IDs, object keys, or linked-record payloads. Receiving
status/exception fanout, transfer status/exception fanout, stock-count review
fanout beyond generated adjustment approval, automated scheduler runs, email
delivery, external channels, notification preferences, and configurable
escalation-chain automation remain future hardening items.
