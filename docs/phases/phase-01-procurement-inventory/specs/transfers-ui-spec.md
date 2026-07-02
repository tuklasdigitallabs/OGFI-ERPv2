# OGFI ERP — Transfers UI Specification

**Phase:** I  
**Primary users:** Warehouse team, branch storekeepers, Branch Managers, Operations, approvers  
**Purpose:** Move stock between approved locations with sender and receiver confirmation, location-aware inventory posting, and full traceability.

---

## 1. Screen inventory

| ID | Screen | Purpose |
|---|---|---|
| TRF-01 | Transfer List / Queue | Track requests, dispatches, receipts, overdue items |
| TRF-02 | Create Transfer Request | Request stock from warehouse or another authorized location |
| TRF-03 | Transfer Detail | Review source/destination, approval, quantities, dispatch/receipt progress |
| TRF-04 | Dispatch Transfer | Confirm outgoing items at source |
| TRF-05 | Receive Transfer | Confirm received items at destination and record discrepancies |

## 2. Transfer request routing

The normal low-stock route is:

```text
Low stock / manual need → Check main warehouse availability → Transfer Request when available
```

If stock is unavailable at authorized warehouse/source, workflow may create or recommend a Purchase Request according to policy. The UI must not label this as generic `Order`.

## 3. Required transfer fields

- Transfer number/status
- Source location and destination location
- Company/brand context
- Requester and request date
- Required dispatch/receipt date
- Item lines with requested, approved, dispatched, received, and discrepancy quantities
- Reason / related low-stock or PR reference
- Approval status
- Dispatch and receiver identities
- Attachments/evidence where needed

## 4. Dispatch behavior

- Source user can dispatch only from authorized location and available stock.
- Dispatch posts source inventory reduction once when policy/status allows.
- If short dispatch is allowed, record actual dispatched quantity and reason; notify destination.
- Generate dispatch reference and status `Dispatched`.
- Provide printable/shareable dispatch summary if needed.

## 5. Receive behavior

- Destination user receives against dispatched quantities.
- Cannot receive more than dispatched without approved discrepancy path.
- Receipt uses durable receipt events and posts destination inventory increase once for accepted quantity only.
- Partial receipt keeps transfer open and creates discrepancy/overdue monitoring as relevant.
- Damage/shortage requires reason/evidence when configured. Current implementation requires an evidence reference whenever a transfer receipt line has rejected, damaged, or short/discrepant quantity; binary photo/file upload remains a later attachment-service slice.
- Rejected, damaged, and short/discrepant quantities are visible on the transfer but do not increase destination stock.

## 6. Statuses

```text
Draft → Submitted → Pending Approval → Approved → Ready to Dispatch
→ Dispatched → Partially Received → Received / Closed
                  ↘ Discrepancy Open → Resolved
Cancelled / Reversed only through controlled actions
```

## 7. Mobile behavior

- Dispatch and receipt use item cards, scanning/search, large quantity fields, and camera evidence.
- Persistent bottom action: `Dispatch Transfer` or `Receive Transfer`.
- Show source/destination prominently to avoid wrong-location posting.

## 8. Acceptance criteria

- Source and destination stock never both increase or both decrease for the same confirmed transfer.
- Dispatch/receipt are idempotent.
- Accepted receipt quantity links to immutable `TRANSFER_IN`; rejected, damaged, and short/discrepant receipt quantities do not post destination stock.
- Overdue transfers appear in dashboards, notifications, and transfer report.
- Both sender and receiver identity/timestamp are retained.
