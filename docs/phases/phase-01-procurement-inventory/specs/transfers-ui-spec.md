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
- The receipt task sheet owns an independent scroll region; its persistent header keeps the transfer reference and source/destination visible, and its sticky footer keeps `Post Receipt` reachable on narrow screens.
- Receipt quantity, discrepancy, evidence, and submission controls use at least 44px touch targets. Quantity fields use a two-column mobile grid and expand on larger screens without horizontal overflow.

## 8. Acceptance criteria

- Source and destination stock never both increase or both decrease for the same confirmed transfer.
- Dispatch/receipt are idempotent.
- Receipt retry identity binds the actor, destination, transfer lines, quantities, notes, and discrepancy details; exact completed retries replay, while changed or in-progress reuse fails with a safe conflict state. Receipt reversal follows the same authoritative location/header/line lock order and transaction-time MFA boundary.
- Receipt quantities are explicit inputs. Missing or blank line quantities are treated as zero; the server never infers acceptance of an omitted line.
- `Receive Transfer` is a workspace-sized task sheet rather than a short modal: it keeps source/destination context visible while the receiver enters multi-line quantities, discrepancy reasons, and evidence references. Submission prevents accidental duplicate clicks while the server action is pending.
- When no dispatched quantity remains receivable, the detail page shows an intentional no-receivable-lines state instead of opening a form that cannot post.
- Receipt failures distinguish scope changes, a retry key bound to different details, and an already-running retry. The user is told to refresh/start a new attempt or wait for the existing result; generic blind-retry guidance is not used for these states.
- Accepted receipt quantity links to immutable `TRANSFER_IN`; rejected, damaged, and short/discrepant receipt quantities do not post destination stock.
- Overdue transfers appear in dashboards, notifications, and transfer report.
- Both sender and receiver identity/timestamp are retained.
