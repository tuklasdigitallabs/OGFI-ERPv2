# OGFI ERP — Approval Settings UI Specification

**Phase:** I  
**Primary users:** System Administrator, Finance/Process Owners, authorized Executive/Management  
**Purpose:** Configure approval templates, thresholds, routing conditions, delegation, reminders, and escalation without code changes.

---

## 1. Screen inventory

| ID | Screen | Purpose |
|---|---|---|
| APS-01 | Approval Policy List | View/search templates and effective status |
| APS-02 | Approval Policy Detail | Configure routing conditions and steps |
| APS-03 | Threshold Matrix | Manage value/condition bands by transaction type |
| APS-04 | Approver Assignment | Map roles/users by company/brand/location/department |
| APS-05 | Delegation Monitor | View active/expired delegation records |
| APS-06 | Reminder & Escalation Settings | Configure notification timing and recipient escalation |
| APS-07 | Test Route Simulator | Validate how a sample transaction will route before activation |
| APS-08 | Policy Change History | Review versions, approvals, effective dates, rollback/supersede action |

## 2. Approval policy structure

Each policy must show:

- Name, version, active status, effective date
- Transaction type/module
- Company, brand, location, department scope
- Conditions: amount band, budget state, supplier status, urgency, category, project or exception conditions
- Ordered approval steps
- Role/user assignment method
- Self-approval prevention rule
- Delegation eligibility
- Reminder/escalation schedule
- Required comments/attachments for actions

## 3. Route simulator

Inputs:

- Transaction type
- Company/brand/location
- Department/cost center
- Requester role/user
- Amount/value
- Budgeted/unbudgeted
- Urgency
- Supplier / category flags where relevant

Outputs:

- Matching policy/version
- Approval steps and assigned approvers
- Exception/warning conditions
- Reminder/escalation timeline
- Reasons no policy matched, if applicable

No transaction may be submitted without a valid policy match unless an authorized exception route exists.

## 4. Change control

- Approval templates are versioned; published policies cannot be silently edited retroactively.
- Material policy changes require an effective date and authorized policy approval.
- Existing in-flight documents retain their route unless explicit re-route policy applies.
- Show impact preview: active locations, transaction types, and users affected.

## 5. Security and audit

- Only authorized users can view/edit policy details.
- All changes log before/after state, actor, reason, approval, timestamp, and effective date.
- Do not expose permission details to ordinary branch users.

## 6. Acceptance criteria

- Non-technical administrator can configure standard threshold/role/location rules without code deployment.
- Simulator result matches actual submission route.
- Version history allows understanding why a historical record followed a particular route.
- Policy conflict/no-match is clearly detected and blocked or routed to approved exception handling.
