# Receiving and Transfer Workflow — Phase I
**Document ID:** receiving-transfer-workflow  
**Version:** 0.1  
**Date:** 25 June 2026  
**Applies to:** Supplier Receiving, Direct Branch Delivery, Delivery Discrepancies, Warehouse-to-Branch Transfers, Branch-to-Branch Transfers, Returns

---

## 1. Purpose

This workflow controls how goods are received, inspected, posted, dispatched, transferred, and acknowledged between suppliers, Head Office warehouse, commissary, branches, and project sites. It eliminates undocumented deliveries, unresolved shortages, and poorly tracked inventory handoffs.

Receiving is the bridge from purchasing to inventory. Transfers are two-party inventory events: a source dispatches and a destination independently confirms receipt.

---

## 2. Scope

### In scope
- Receiving against approved and issued POs
- Direct supplier delivery to branch or warehouse
- Partial receipt, rejection, damage, quality, short-delivery, wrong-item, expiry, and price discrepancy capture
- Receiving Report and stock posting
- Warehouse-to-branch, branch-to-branch, commissary-to-branch, and return-to-warehouse transfers
- Dispatch and destination receipt confirmation
- Transfer discrepancy, dispute, and overdue handling
- Attachments, photos, alerts, and audit records

### Out of scope
- Supplier invoice matching and payment release
- Full laboratory / quality-control workflow
- Fleet planning and route optimization
- Supplier portal acknowledgement
- Advanced in-transit accounting
- Commissary production transformation

---

## 3. Roles

| Role | Responsibility |
|---|---|
| Storekeeper / Receiver | Receives deliveries, checks quantity / condition, records accepted and rejected stock. |
| Branch Manager | Reviews material receiving and transfer discrepancies. |
| Warehouse Staff | Picks, prepares, and dispatches warehouse stock. |
| Warehouse Manager | Oversees dispatch and warehouse discrepancies. |
| Purchasing Officer | Monitors PO fulfillment and supplier performance. |
| Finance / Accounting | Reviews value impact and material exceptions. |
| Operations Manager | Resolves branch operational / transfer disputes. |
| Auditor | Read-only review. |

A source sender cannot confirm receipt for destination. A receiver cannot edit a posted receipt; corrections use reversal authority.

---

## 4. Receiving Workflow

```text
Approved and issued PO
  → Expected delivery visible to receiving location
  → Supplier arrives
  → Receiver checks PO and delivery documents
  → Create Receiving Report
  → Inspect item, quantity, condition, lot, expiry
  → Accept / partially reject / reject line
  → Flag discrepancy
  → Post receipt
  → Accepted quantity stocks in
  → PO becomes partially or fully received
```

### 4.1 Prepare for delivery

After PO issue, receiving location sees expected date, supplier, items, quantities, and PO reference. Receiving users may view PO but cannot alter ordered terms. Missed delivery dates alert Purchasing and the receiving location.

### 4.2 Create Receiving Report

**Allowed users:** Storekeeper, warehouse staff, branch inventory custodian, authorized manager.

**Required header data**
- Receiving location
- Actual receipt time
- Supplier and PO, unless authorized direct / emergency route
- Receiver
- Supplier delivery receipt number when available
- Delivery receipt / invoice / photo attachment when required

**Required line data**
- Item
- Ordered quantity snapshot where linked to PO
- Received, accepted, and rejected quantity
- UOM
- Condition status
- Lot and expiry, when controlled
- Discrepancy details where relevant

### 4.3 Inspect each delivery line

Check as applicable:
- item identity and specification;
- quantity;
- package condition;
- visible damage;
- expiry / freshness;
- temperature / quality requirement;
- lot / batch;
- delivery document match;
- price variance visibility where permission and policy require.

### 4.4 Accept, partial reject, reject

| Outcome | Inventory effect | Required action |
|---|---|---|
| Accepted | Accepted quantity stocks in on post. | Record accepted qty and required lot / expiry. |
| Partial reject | Only accepted portion stocks in. | Record rejected qty, reason, evidence when required. |
| Rejected | No stock movement. | Record reason and proof; notify Purchasing. |

Discrepancy types: short, over, damaged, quality, wrong item, expired / poor shelf life, price, missing document, missing lot / expiry, other.

### 4.5 Post Receiving Report

Before post, system verifies all line outcomes, mandatory lot / expiry, discrepancy reasons, required attachments, inspection completion, user scope, and approval where policy requires.

On post:
1. Create receipt movements only for accepted quantity.
2. Update inventory balance cache.
3. Update PO received quantities.
4. Change PO to partially received or fully received where relevant.
5. Mark RR `posted` or `posted_with_discrepancy`.
6. Notify Purchasing and other configured stakeholders.
7. Write audit events.

### 4.6 Reverse posted receipt

A posted receipt cannot be edited. If a material error is found:
1. Authorized user starts reversal with reason.
2. System writes linked opposite `REVERSAL` stock movements for accepted quantities only.
3. PO received quantities are restored and fulfillment status is recalculated.
4. Original RR becomes `reversed` and keeps its original discrepancy evidence.
5. A corrected new RR can be posted.
6. Finance, Purchasing, and audit visibility follows policy.

Implemented Phase I reversal controls under `DEC-0024`: full-document reversal only; partial line reversal, return-to-supplier, supplier credit, finance effects, closed-period reversal, and reopening closed POs remain future controlled decisions.

---

## 5. Direct Supplier Delivery to Branch

Direct branch delivery uses the same Receiving Report flow with the branch as receiving location.

Additional rules:
- Receiver must be assigned to the branch.
- PO delivery location must match branch unless a controlled change exists.
- Branch does not make payment / invoice-approval decisions.
- Delivery proof is required according to policy.
- Shortage, quality, and expiry problems are escalated to Purchasing promptly.

---

## 6. Transfer Workflow

```text
Destination need identified
  → Draft Transfer Order
  → Submit / approve if required
  → Source prepares and allocates
  → Source dispatch confirms actual quantity
  → Source stock decreases
  → Destination receives and confirms actual quantity
  → Destination stock increases
  → Transfer closes or moves to dispute resolution
```

### 6.1 Create Transfer Order

**Allowed users:** Branch Manager, Storekeeper, Warehouse user, authorized Operations / Purchasing roles.

Required:
- Source location
- Destination location
- Transfer type
- Reason / purpose
- Requester
- Item quantities and UOM
- Required-by date, where applicable

Supported types: warehouse-to-branch, branch-to-branch, commissary-to-branch, return-to-warehouse, other internal transfer.

Validations:
- Source and destination must be different active inventory locations within company.
- Requester must be scoped to destination or have cross-location authority.
- Quantities must be positive.
- Items must be active, inventory-tracked, and have required lot / expiry data.
- Approval policy resolves based on transfer type, value, locations, and category.

### 6.2 Approval and preparation

After final approval, source location receives notice. Source user:
1. checks availability;
2. allocates stock;
3. records approved / prepared quantity;
4. selects lot / expiry where required;
5. records partial availability / short supply visibly.

Source cannot silently substitute item or quantity. Material change must be visible to destination and re-approved where policy requires.

### 6.3 Dispatch

Required dispatch fields:
- Dispatch date/time
- Dispatching user
- Actual dispatched quantity per line
- Lot / expiry where required
- Packing list, photo, or transport reference where configured

On dispatch:
1. Validate source stock availability.
2. Create negative `transfer_out` movements at source.
3. Set status to `dispatched`.
4. Notify destination.
5. Store correlation ID for later `transfer_in` movement.

Phase I rule: source stock reduces on dispatch. Destination stock increases only on receipt. Transfer remains visible as in transit between the two actions.

### 6.4 Destination receipt

Destination receiver records:
- received and accepted quantity;
- discrepancy reason for mismatch;
- damage / condition evidence;
- actual receipt date/time.

On receipt:
1. Create a transfer receipt event and line-level receipt records.
2. Create positive `transfer_in` movements for accepted quantities only.
3. Update destination balance.
4. Update line-level received quantity and status.
5. Mark transfer `received`, `partially_received`, or `disputed`.
6. Close when all lines resolve.

Implemented Phase I note under `DEC-0025`: destination receipt is event-backed. Partial receipt and discrepancy capture are supported; rejected, damaged, and short/discrepant quantities are recorded without increasing destination stock. Posted receipt events can be reversed only as full events by an authorized user who is neither the dispatcher nor original receiver; correction is performed by posting a replacement receipt event. Final discrepancy settlement is implemented as a non-posting, permissioned, audited closure action that moves a disputed transfer to `DISCREPANCY_SETTLED` with reason, evidence reference, settlement type, and segregation checks. Dispatch reversal, automated replacement transfers, returns, wastage/adjustment linkage, and finance effects remain future controlled decisions.

### 6.5 Transfer discrepancy

Discrepancy occurs when received differs from dispatched, goods are damaged, wrong item appears, lot / expiry is absent or mismatched, or transfer is overdue.

Required handling:
- Record discrepancy and evidence.
- Notify source manager, destination manager, Warehouse / Operations and Finance as configured.
- Do not silently erase shortages.
- Resolve through accepted short receipt, replacement transfer, return, approved adjustment, or investigation closure.
- Preserve all source, dispatch, and receipt quantities.

---

## 7. Returns

### Return to warehouse

Use a standard transfer with `transfer_type=return_to_warehouse`. Branch dispatches; warehouse independently receives. Reason is mandatory, such as excess stock, closure, damage, or phase-out.

### Return to supplier

Capture as authorized supplier return / stock-out, preferably linked to original receipt or PO. Record supplier, reason, quantity, evidence, approval, and `return_to_supplier` movement.

---

## 8. Alerts and SLAs

| Trigger | Recipient | Default |
|---|---|---|
| PO issued | Receiving location | Immediate |
| Delivery overdue | Purchasing + receiving location | Daily after due date |
| Receipt discrepancy | Purchasing + location manager; Finance as configured | Immediate |
| Transfer approved | Source location | Immediate |
| Transfer dispatched | Destination location | Immediate |
| Transfer receipt overdue | Source and destination managers | Reminder after 24h; escalation after 72h |
| Transfer dispute | Source, destination, Operations / Warehouse, Finance as needed | Immediate |
| Receipt reversed | Purchasing, Finance, affected manager | Immediate |

---

## 9. Audit Requirements

Audit all expected versus actual quantities, dispatch and receipt users, line condition, lot / expiry, evidence files, discrepancy events, approval actions, cancellation, reversal, overdue alerts, and final resolution.

---

## 10. Phase I Acceptance Criteria

1. Receiver creates a Receiving Report from issued PO without retyping core order data.
2. Accepted quantity creates inventory movement and updates PO fulfillment.
3. Rejected quantity does not create stock and requires reason / evidence as configured.
4. Partial receipt leaves remaining PO quantity open.
5. Posted receipt cannot be edited; authorized reversal is available.
6. Transfer requires distinct active source and destination inventory locations.
7. Dispatch decreases source stock only after actual dispatch confirmation.
8. Destination receipt increases destination stock only after independent destination confirmation.
9. System tracks and routes short, damaged, wrong-item, expiry, and overdue transfer issues.
10. Paired transfer movements share source-document and correlation linkage.
11. Lists filter / export by location, supplier, PO, transfer status, date, item, receiver, dispatcher, discrepancy, and value.
12. Receiving and transfer steps work on branch tablet / mobile layouts.
