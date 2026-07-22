# OGFI ERP — Phase III Workflow: Payment Request

**Status:** Implemented structural validation foundation; payment-readiness policy and production activation remain gated

**Purpose:** Create payment requests supported by approved PO, receiving and invoice evidence.

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

## Current Invoice-Lock and Capacity Boundary

- Payment-request draft creation rejects duplicate invoice lines, locks referenced AP-invoice rows in deterministic ID order, and reloads them inside its transaction.
- Draft creation validates tenant/company invoice identity, request and line location scope, one supplier, PHP currency, positive line amounts, header/line totals, invoice snapshots, and available capacity against other non-releasing requests.
- The current flag-off legacy final approval does not repeat the complete locked capacity calculation. Normalized Payment Request approval therefore fails closed with `PAYMENT_REQUEST_APPROVAL_POLICY_UNCONFIRMED` while Finance and Accounts Payable confirm the eligibility matrix and exact database-decimal calculation.
- The Approval Inbox preserves the established legacy approval path only while `APPROVAL_ROUTING_V1_ENABLED=false`; this compatibility path is not evidence that final approval is production-ready.
- No current approval boundary defines `PAYMENT_READY`, settles an AP invoice, releases payment, mutates a bank balance, or posts a journal.

## Open Decisions

Finance and Accounts Payable must still confirm the exact invoice/request statuses, match/tolerance outcomes, exception ownership, outstanding-amount basis, and active-request inclusion/exclusion matrix that constitute payment readiness. Until confirmed, the structural capacity check is not approval eligibility or AP settlement. Use `../implementation/PHASE3_DECISION_REGISTER.md` and the core open-decisions register for the authorized conclusion; this workflow is not production-ready.
