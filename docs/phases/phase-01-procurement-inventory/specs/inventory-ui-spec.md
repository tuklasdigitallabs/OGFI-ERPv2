# OGFI ERP — Inventory UI Specification

**Phase:** I  
**Modules:** Receiving, Inventory Ledger, Stock Balances, Transfers, Physical Count, Wastage, Stock Adjustments  
**Primary users:** Storekeepers, Warehouse teams, Branch Managers, Inventory Controllers, Operations Managers, Finance reviewers

---

## 1. Purpose

This specification defines the Phase I inventory screens that establish traceable stock movement across warehouse, commissary, branches, and project locations.

The interface must make the following immediately visible:

- item and UOM;
- source and destination location;
- available/on-hand balance where permitted;
- transaction status;
- quantity expected, dispatched, received, counted, or adjusted;
- variance and reason;
- owner and approver;
- related purchasing or transfer document;
- audit history.

---

## 2. Navigation and screen inventory

### Inventory navigation

1. Inventory Dashboard
2. Stock Balances
3. Inventory Ledger
4. Receiving
5. Transfers
6. Physical Counts
7. Wastage
8. Stock Adjustments
9. Item Master shortcut, permission controlled
10. Ledger Variance Reconciliation, permission and dashboard-profile controlled

### Phase I screens

| Screen ID | Screen | Purpose |
|---|---|---|
| INV-01 | Inventory Dashboard | Action queue, exceptions, count and transfer priorities |
| INV-02 | Stock Balance List | Available / on-hand by location and item |
| INV-03 | Inventory Ledger | Full traceable movement history |
| INV-04 | Receiving Queue | Expected and in-progress deliveries |
| INV-05 | Receiving Detail | Confirm received quantities and discrepancies |
| INV-06 | Transfer List | Track transfer lifecycle |
| INV-07 | Transfer Detail | Create, dispatch, receive, and resolve variance |
| INV-08 | Physical Count List | Manage count periods and assignments |
| INV-09 | Count Entry | Enter and submit actual counts |
| INV-10 | Wastage List | Track wastage records and approvals |
| INV-11 | Wastage Detail | Submit, review, approve, and post wastage |
| INV-12 | Stock Adjustment List | Track controlled adjustments |
| INV-13 | Stock Adjustment Detail | Review and approve adjustment request |
| INV-14 | Ledger Variance Reconciliation | Read-only comparison of cached balances with immutable ledger totals |

---

## 3. INV-01 Inventory Dashboard

### Required sections

1. Context bar
2. Urgent action queue
3. KPI cards
4. Transfer status
5. Count task status
6. Variance / wastage exceptions
7. Recent stock movements

### Primary actions

- Receive Delivery
- Create Transfer
- Start Count
- Submit Wastage
- Review Exceptions

### Action queue priority

1. Receiving discrepancy pending resolution
2. Transfer awaiting receipt confirmation
3. Count variance pending approval
4. High-value wastage pending review
5. Negative inventory / posting exception
6. Overdue count task

---

## 4. INV-02 Stock Balance List

### List columns

- Item code
- Item name
- Category
- Location
- UOM
- On-hand quantity
- Available quantity, where applicable
- Last movement date
- Reorder status, if enabled
- Expiry / lot indicator, where enabled

### Filters

- Company
- Brand
- Location type
- Branch / warehouse / commissary / project site
- Item category
- Item
- Stock status
- Expiry window, when enabled

### Rules

- Users see only authorized locations.
- Values must be based on posted stock movements, not manual display fields.
- Clicking a balance opens the filtered inventory ledger.
- Stock Balances uses server-side pagination with a bounded 10-row page, deterministic tie-breaking, query-aware counts, and URL-backed `All`, `Positive stock`, and `Expiring soon` filters. CSV export is a separate full-result operation for the current authorized location and search.

---

## 5. INV-03 Inventory Ledger

### Purpose

The ledger is the source-of-truth movement view. No manual edit action is allowed from the ledger.

### Columns

- Movement timestamp
- Item
- Location
- Movement type
- Reference document
- In quantity
- Out quantity
- Running balance
- UOM
- Performed by
- Posted by / status

### Rules

- Every movement must link to its originating record.
- Cancelled or reversed movements remain visible as part of the audit trail.
- Users can filter but cannot alter posted movement history.

### Ledger Variance diagnostic profile

- `/inventory/reconciliation?dashboard=ledger-variance-v1` requires both `inventory.balance.view` and `inventory.ledger.view` for the selected company and location.
- One database snapshot compares each active inventory-location, item, and normalized lot/expiry key found in either the balance cache or ledger. Only six-decimal non-zero differences appear.
- Search may narrow by item, inventory-location name, or lot; it cannot change scope, membership, ordering, or the 25-row server page contract.
- Each row provides an exact, independently authorized ledger trace. Exact traces require both reconciliation permissions, use deterministic 50-row server pages with an exact total, and identify keys that are no longer a current non-zero variance while preserving historical movement context. The profile and its CSV are diagnostic only and expose no balance edit, adjustment, posting, approval, or reversal action.
- A blocking dashboard trust mode hides the numeric KPI, not the warned raw diagnostic comparison needed by authorized investigators.

---

## 6. INV-04 and INV-05 Receiving

### Receiving Queue

Columns:

- Expected delivery date
- Supplier
- PO number
- Delivery location
- Receiving status
- Number of items
- Discrepancy flag
- Receiver / owner

### Receiving Detail

#### Header

- Receiving report number
- Related PO
- Supplier
- delivery location
- status
- receiver
- expected versus received summary

#### Line-item fields

- Item
- PO quantity
- Previously received quantity
- Remaining quantity
- Current received quantity
- Accepted quantity
- Rejected quantity
- Reason for rejection/discrepancy
- Lot / expiry fields where enabled
- Evidence attachment

### Rules

- Partial receiving is supported.
- Receiving quantity cannot exceed remaining PO quantity without authorized exception.
- Discrepancies create a visible resolution task.
- Final posting updates stock only after the required review/status conditions are met.

---

## 7. INV-06 and INV-07 Transfers

### Transfer List

Columns:

- Transfer number
- Source location
- Destination location
- Request date
- Dispatch date
- Status
- Item count
- Total transfer value where authorized
- Sender
- Receiver
- Variance flag

### Transfer Detail

#### Create transfer

- Source location
- Destination location
- Requested/dispatch date
- purpose
- item lines
- source available balance
- requested quantity
- dispatch quantity
- receiving instructions

#### Dispatch confirmation

- actual dispatched quantity
- dispatch timestamp
- sender
- evidence / delivery note attachment

#### Receipt confirmation

- actual received quantity
- receiver
- receipt timestamp
- variance reason
- evidence attachment

### Rules

- Source and destination must be different active locations.
- The system prevents dispatch beyond permitted available balance unless an exception route exists.
- Stock leaves source on the configured dispatch posting event and remains in transit until receipt, where transit handling is enabled.
- Receiving variance requires reason and follows configured approval rules.

---

## 8. INV-08 and INV-09 Physical Counts

### Physical Count List

Columns:

- Count period / count ID
- Location
- Count type
- Assigned counter(s)
- Status
- Start/end time
- variance status
- reviewer

### Count Entry

Show:

- count location;
- count date/time;
- assigned counter;
- count status;
- item;
- UOM;
- count quantity;
- blind-count expected quantity visibility based on role;
- notes/evidence where needed.

### Rules

- Count sessions should support pause/resume when allowed.
- Expected quantity may be hidden from counters in blind-count mode.
- Submitted count cannot be edited without authorized reopening.
- Variance review requires a clear comparison of expected, actual, value impact, and explanation.
- Reviewed non-zero variance lines are intended to generate one linked `COUNT_VARIANCE` Stock Adjustment after the recovery and lineage gates close; the generation action is currently disabled and the count page itself does not post inventory movements.

---

## 9. INV-10 and INV-11 Wastage

### Wastage List

Columns:

- Wastage number
- Date/time
- Location
- Item
- Quantity
- UOM
- Estimated value
- Reason
- Status
- Submitted by
- Approver

### Wastage Detail / Entry

Fields:

- Location
- Date/time
- Item
- Quantity
- UOM
- Wastage reason
- Description
- Estimated cost
- photo / evidence
- related event or incident, optional
- approver route

### Rules

- Wastage cannot post inventory reduction until required approval is complete, unless an approved emergency policy applies.
- High-value, unusual, or repeated wastage should be flagged automatically.
- Entry must retain evidence and reason history.

---

## 10. INV-12 and INV-13 Stock Adjustments

### Adjustment List

Columns:

- Adjustment number
- Location
- Item count
- Adjustment type
- value impact
- reason
- status
- requester
- approver

### Adjustment Detail

Fields:

- location;
- item lines;
- current system quantity;
- requested adjustment quantity;
- adjustment direction;
- reason category;
- explanation;
- evidence;
- linked count or incident;
- approval timeline.

### Rules

- Direct adjustment from the stock balance screen is prohibited.
- Every adjustment must link to a reason and audit evidence.
- Approved adjustment posts a new ledger movement rather than editing historical balance records.

---

## 11. Mobile-specific requirements

Inventory mobile screens must support:

- item lookup by code/name/category;
- camera capture for delivery/wastage evidence;
- fast line-item quantity entry;
- clear source/destination display;
- durable unsaved-work behavior during poor connection;
- visible confirmation that stock movement was posted or remains pending.

---

## 12. Acceptance checks

The inventory UI is ready for Phase I only if staff can receive a PO delivery, record a discrepancy, dispatch and receive transfers, count stock, submit wastage, request a stock adjustment, and trace every posted change through the immutable inventory ledger.
