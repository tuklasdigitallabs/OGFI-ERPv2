# Purchasing Workflow — Phase I
**Document ID:** purchasing-workflow  
**Version:** 0.1  
**Date:** 25 June 2026  
**Applies to:** Purchase Requests, Supplier Quotations, Quotation Comparison, Purchase Orders, Emergency Purchases

---

## 1. Purpose

This workflow replaces paper, Excel, chat, and verbal purchasing requests with a controlled path from a branch, warehouse, Head Office, or project need through approval and Purchase Order issuance.

Phase I covers purchasing up to PO issuance and its connection to receiving. Invoice matching and payment execution are deferred to Phase III.

---

## 2. Scope

### In scope
- Standard, replenishment, and emergency Purchase Requests (PR)
- Supplier accreditation checks
- Supplier quotation / RFQ capture
- Quotation comparison and supplier-selection justification
- Purchase Order (PO) creation, approval, issue, amendment, cancellation, and close
- Configurable approval, delegation, reminders, escalation, attachments, comments, and audit trail
- PR-to-PO and PO-to-receiving traceability

### Out of scope
- Accounts payable and payment release
- General ledger / tax posting
- Automated demand forecasting and auto-replenishment
- Supplier portal
- Contract lifecycle management
- Full budget management; Phase I records a budget status and routes approval accordingly

---

## 3. Roles

| Role | Responsibility |
|---|---|
| Requesting Staff | Creates draft PRs and tracks own requests. |
| Branch Manager | Validates branch need, urgency, quantity, and purpose; approves assigned requests. |
| Department Head | Validates department requirement and approves within scope. |
| Purchasing Officer | Validates PR completeness, collects / records quotes, prepares comparison and PO. |
| Purchasing Manager | Reviews supplier, pricing, and PO terms. |
| Finance / Accounting | Reviews budget status, financial control, exceptions, and high-value requests. |
| General Manager / Executive | Approves high-value, unbudgeted, capital, or exceptional requests as configured. |
| Storekeeper / Warehouse User | May submit replenishment PRs and later receive deliveries. |
| Auditor | Read-only review of records and audit trail. |

A requester may not give final approval to their own request. The same person should not be the only preparer and approver of a related PO.

---

## 4. Core Rules

1. Every PR identifies company, requesting location, department, cost center, requester, required date, purpose, request type, and at least one line.
2. PR lines use an active item or an authorized free-text description with category and specification.
3. A PO uses an active, eligible supplier unless an approved exception exists.
4. Supplier, item, quantity, price, delivery location, and material terms become controlled after approval.
5. A material change after approval requires amendment and re-approval, not a silent edit.
6. Multiple quotes are collected where required by policy; a single-source purchase needs justification.
7. Lowest price is a signal, not an automatic decision. A non-lowest selection requires a documented reason.
8. Emergency purchase is a controlled exception for operational risk, not a planning shortcut.
9. Cancelled and superseded records remain visible with full history.
10. Every approval uses an approval-policy snapshot taken at submission.

---

## 5. Workflow Summary

```text
Need identified
  → Draft PR
  → Submit PR
  → Approval routing
  → Approved PR
  → RFQ / supplier quote capture
  → Quotation comparison and selection approval
  → Draft PO
  → PO approval routing
  → Issue PO
  → Supplier delivery
  → Receiving Report (separate workflow)
  → PO partially received / fully received / closed
```

---

## 6. Standard Purchase Request Workflow

### 6.1 Create draft PR

**Allowed users:** scoped Requesting Staff, Branch Managers, Department users, Storekeepers, authorized Purchasing users acting for an identified requester.

**Required header data**
- Requesting location
- Department
- Cost center
- Request type: standard, replenishment, emergency, capital, service, other
- Urgency: normal, urgent, emergency
- Required-by date
- Business purpose

**Required line data**
- Active item or permitted free-text description
- Quantity and UOM
- Target inventory location for stock items
- Specification / note where relevant
- Estimated cost when available or required by policy

**Validation**
- User scope must cover the location and department.
- Quantity must be positive; UOM must be valid for selected item.
- Required date cannot be earlier than request date unless a backdate exception is approved.
- Free text requires description, category, and business justification.
- Emergency request requires an emergency reason and immediate-authorizer field as configured.

Status: `draft`.

### 6.2 Submit PR

On submit, the system must:
1. Validate required data and attachments.
2. Determine or capture `budget_status`: `unknown`, `budgeted`, `unbudgeted`, `over_budget`.
3. Resolve approval policy using transaction type, amount estimate, location, department, category, urgency, budget status, and configured conditions.
4. Create Approval Instance and snapshot the rule.
5. Lock material content from casual edit.
6. Set status to `submitted` then `pending_approval`.
7. Notify the first approver and write audit events.

### 6.3 Approve, return, reject

| Action | Result |
|---|---|
| Approve | Advances to next step or final approval. |
| Return for revision | Returns to requester; remarks required; requester edits and resubmits. |
| Reject | Ends request; remarks required. |
| Delegate | Allowed only by registered time-bound authority. |
| Escalate | System-driven according to SLA; preserves original approval trail. |

Final approval changes PR to `approved` and creates visibility in the Purchasing queue.

### 6.4 Revise approved PR

Non-material notes can be updated by authorized roles and audited. Any material change must create a controlled revision or a new PR:
- quantity increase;
- item change or substitution;
- significant cost estimate change;
- location or department change;
- changed required date that affects fulfillment;
- changed budget status.

The original must remain visible and be linked to the revision.

### 6.5 Convert to sourcing

Purchasing can group compatible approved PR lines, split a line among suppliers if policy permits, or partially convert quantities. Each PR line must display requested, approved, converted / ordered, received, and remaining quantity.

---

## 7. Quotes and Supplier Selection

### 7.1 Quote capture

Purchasing records each RFQ / supplier quote with:
- source PR / lines;
- supplier;
- quoted items, quantity, UOM, price, tax / discount, freight / other charges;
- availability;
- lead time;
- payment terms;
- quotation validity;
- attachment.

Substitutions are identified explicitly. They cannot silently replace requested items.

### 7.2 Quotation comparison

Comparison must show:
- suppliers evaluated;
- price and evaluated total cost;
- availability and delivery lead time;
- payment terms where relevant;
- supplier accreditation status;
- selected supplier;
- selection reason;
- single-source justification where only one supplier was used.

The system may highlight lowest evaluated cost. If selected supplier is not lowest, `selection_reason` is mandatory. If only one quote exists, `single_source_justification` is mandatory.

### 7.3 Comparison approval

A comparison is routed for approval when configured, including by:
- amount;
- non-lowest selection;
- single source;
- unbudgeted status;
- new / conditional supplier;
- emergency or capital category;
- restricted category.

---

## 8. Purchase Order Workflow

### 8.1 Create draft PO

**Owner:** Purchasing Officer / Purchasing Manager.

PO source options:
- approved PR;
- approved quotation comparison;
- authorized direct purchase route;
- emergency purchase regularization.

**Required header data**
- Supplier
- Ordering and delivery locations
- Department and cost center
- PO date and currency
- At least one line
- Source PR / comparison where applicable

**Required line data**
- Item / description
- Ordered quantity and UOM
- Unit price, tax, discount, line total
- PR source where applicable

**Validation**
- Supplier active and eligible.
- Delivery location active and valid for company.
- Ordered quantity cannot exceed remaining approved PR quantity without approved exception.
- Values are calculated from lines.
- Material commercial terms are snapped onto the PO.

### 8.2 Submit and approve PO

Approval conditions can include PO total, budget status, supplier status, location, department, item category, capex classification, and price variance against last purchase price.

On final approval:
- status becomes `approved`;
- an approved PO output may be generated;
- terms become read-only except through amendment or cancellation;
- receiving location receives expected-delivery visibility.

### 8.3 Issue PO

**Allowed users:** authorized Purchasing roles.

On issue:
- status becomes `issued`;
- issuer, timestamp, and communication method are logged;
- supplier copy is generated or attached;
- expected delivery becomes visible to receiving location.

Optional supplier acknowledgement may set status to `acknowledged`.

### 8.4 Amend PO

Amendment is required for change to supplier, delivery location, quantity, unit price, tax, freight, expected delivery date, substitution, payment terms, or another material term.

Current Phase I implementation supports a bounded controlled amendment for issued Purchase Orders with no Receiving Report and no received quantity. The bounded amendment may change existing line quantities, unit prices, line notes, and expected delivery date only. It requires reason, supplier notice evidence or unavailable explanation, approval through `PurchaseOrderAmendment`, and audit history. While approval is pending, the PO status is `AMENDMENT_PENDING` and receiving is blocked. Approval applies the stored proposal and returns the PO to `ISSUED`; return or rejection restores `ISSUED` without mutating PO lines. Supplier, delivery location, line add/delete, substitution, payment terms, freight, tax policy changes, and any post-receiving amendment remain deferred controlled transitions.

```text
Approved / Issued PO
  → Draft amendment
  → Change reason
  → Re-run approval policy
  → Approved amended version
  → Re-issue
  → Original retained as superseded / versioned
```

### 8.5 Cancel or close PO

Cancellation requires reason, confirmation of outstanding unrecorded receipt, and approval when configured. Already received quantities cannot be cancelled. Remaining quantities can be cancelled.

Close PO when all quantities are received, remaining quantities are formally cancelled, or controlled closure reason is approved.

---

## 9. Emergency Purchase

### Valid emergency examples
- Critical stockout likely to stop service.
- Food-safety replacement.
- Emergency equipment / utility repair.
- Supplier failure requiring immediate alternative source.
- Immediate mall or government compliance need.

### Required controls
- Emergency reason and business impact.
- Manager / authorized approver authorization.
- Proof of purchase and receipts uploaded after purchase.
- Post-purchase Purchasing and Finance review.
- Supplier, price, and quantity exception explanation.
- Emergency flag in reports.

```text
Emergency identified
  → Emergency authorization
  → Purchase completed
  → Proof uploaded
  → Post-purchase review
  → PO / receiving / inventory record regularized
```

---

## 10. Exceptions

| Exception | Required control |
|---|---|
| Single supplier source | Written justification and policy route. |
| Non-lowest quote selected | Selection rationale and comparison evidence. |
| Supplier not approved | Block or authorized exception route. |
| Price above last purchase | Variance flag, purchaser comment, approval when threshold met. |
| Free-text item | Category, specification, business justification, later master-data review. |
| Urgent request | Urgency field; emergency route only for true operational emergency. |
| PO change after issue | Amendment, re-approval, new version. |
| Partial supplier delivery | Recorded in Receiving; PO remains partially received. |
| Approver unavailable | Registered delegation / escalation only. |

---

## 11. Notification Defaults

| Trigger | Recipient | Timing |
|---|---|---|
| PR submitted | First approver | Immediate |
| PR approved / returned / rejected | Requester and Purchasing as relevant | Immediate |
| Pending approval | Current approver | 24-hour reminder |
| Overdue approval | Current approver + escalation target | 72-hour escalation |
| PO approved | Purchasing owner | Immediate |
| PO issued | Receiving location | Immediate |
| Delivery overdue | Purchasing + receiving location | Daily after due date |
| Emergency purchase filed | Purchasing + Finance | Immediate |

All timings are configurable.

---

## 12. Audit Requirements

Log every material field change and action: create, submit, return, approve, reject, quote selected, supplier exception, PO issue, amendment, cancellation, close, and export where policy requires. Preserve approval-policy snapshot, approver identity, delegation, reason, timestamp, attachments, and document version lineage.

---

## 13. Phase I Acceptance Criteria

1. Scoped branch users can submit PRs only for assigned locations.
2. The system blocks self-approval and routes approval according to configured policy.
3. Approvers can approve, return, or reject on the transaction page.
4. Purchasing can capture multiple quotes and compare supplier choice.
5. Single-source and non-lowest selection require documented reason.
6. PO creation uses approved PR / quote data without retyping core fields.
7. Material PO changes require amendment and re-approval.
8. Issued POs show ordered, received, cancelled, and remaining quantities.
9. Emergency purchases remain visible in exception reporting and receive post-review.
10. All material actions create audit records with actor, time, and reason where required.
11. Lists filter and export by company, brand, location, department, requester, supplier, status, date, amount, and approval stage.
12. PR and approval flows are usable on tablet and mobile layouts.
