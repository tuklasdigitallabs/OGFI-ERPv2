# OGFI ERP — Purchasing UI Specification

**Phase:** I  
**Modules:** Purchase Requests, Quotations, Purchase Orders, Supplier Management  
**Primary users:** Branch Managers, Requesters, Purchasing Officers, Purchasing Managers, Finance reviewers, approvers

---

## 1. Purpose

This specification defines the Phase I purchasing screens that turn informal branch requests, chat approvals, and manually tracked POs into a controlled workflow.

The UI must make the next action obvious and keep the following visible at all times:

- Company / Brand / Branch or request location;
- requester and department;
- request status and current approver;
- requested date and urgency;
- budget status where available;
- total value;
- full approval/audit history.

---

## 2. Navigation and screen inventory

### Purchasing navigation

1. Purchasing Dashboard
2. Purchase Requests
3. Quotations / Comparison
4. Purchase Orders
5. Suppliers
6. Receiving Queue shortcut
7. Reports / Exports, permission controlled

### Phase I screens

| Screen ID | Screen | Purpose |
|---|---|---|
| PUR-01 | Purchasing Dashboard | Action queue and KPIs |
| PUR-02 | Purchase Request List | Search/filter/manage PRs |
| PUR-03 | Create Purchase Request | Draft and submit PR |
| PUR-04 | Purchase Request Detail | Review, approve, revise, convert workflow |
| PUR-05 | Quotation Comparison List | Track RFQ/comparison status |
| PUR-06 | Quotation Comparison Detail | Compare suppliers and select recommendation |
| PUR-07 | Purchase Order List | Track PO lifecycle |
| PUR-08 | Purchase Order Detail | Create, approve, send, amend, cancel PO |
| PUR-09 | Supplier List | Supplier directory and status |
| PUR-10 | Supplier Detail | Supplier profile, documents, price/transaction context |

---

## 3. PUR-01 Purchasing Dashboard

### Default scope

- Purchasing users: assigned companies/brands/branches.
- Branch users: their branch requests and related PO status.

### Required sections

1. Context bar
2. Pending action queue
3. KPI cards
4. Overdue deliveries list
5. PR aging list
6. PO status list
7. Supplier or price-change alerts where enabled

### Main actions

- Create Purchase Request
- Review pending approvals
- Open quotation comparison
- Create / review PO based on permission

---

## 4. PUR-02 Purchase Request List

### List columns

- PR number
- Request date
- Required date
- Company / Brand / Branch
- Department
- Requester
- Urgency
- Status
- Current approver / next action
- Estimated total
- Last updated

### Filters

- Company
- Brand
- Branch/location
- Department
- Status
- Date range
- Required date range
- Urgency
- Requester
- Supplier category / item category where relevant
- Budgeted / unbudgeted, when available

### Row actions

Permission-based only:

- View
- Edit Draft
- Submit
- Cancel Draft
- Approve / Reject
- Create quotation comparison
- Convert to PO where policy permits

---

## 5. PUR-03 Create Purchase Request

### Form structure

#### Section A — Request context

- Company (derived or selected within scope)
- Brand (derived when branch selected)
- Branch / location
- Department
- Cost center
- Request type: routine / urgent / emergency
- Required delivery date and time window
- Purpose / business justification

#### Section B — Requested items

Line-item fields:

- Item code / item name
- Category
- UOM
- Requested quantity
- Last price / estimated unit cost where available
- Estimated line total
- Preferred supplier, optional
- Notes / specification

#### Section C — Supplier and supporting information

- Suggested supplier, optional
- Quotation attachments, optional or required by policy
- Reference document / previous PO, optional
- Delivery instructions

#### Section D — Review

- Estimated total
- Budget check result where available
- Required approvals
- Missing information summary

### Rules

- Users can save as draft.
- Submit is disabled until required fields are valid.
- Emergency requests require urgency reason and supporting evidence when policy requires it.
- The system must prevent users from requesting inactive items or suppliers.
- The user sees the resulting workflow before submitting.

---

## 6. PUR-04 Purchase Request Detail

### Header

Show:

- PR number
- Status
- Urgency
- Company / Brand / Branch
- Department / cost center
- requester
- total estimate
- required date
- current approver
- primary action

### Tabs / sections

1. Overview
2. Items
3. Quotations / Supplier Comparison
4. Approval Timeline
5. Attachments
6. Audit Trail

### Approval panel

An assigned approver can:

- Approve
- Return for Revision
- Reject
- Delegate where permitted

Rejection and return require remarks. The detail screen must state who receives the record next after each action.

### Conversion behavior

Once approved, available actions depend on policy:

- Create quotation comparison
- Create PO
- Link to existing PO
- Cancel approved PR with authorized reason

---

## 7. PUR-05 and PUR-06 Quotation Comparison

Current implementation uses a master-detail Quotes workspace: the approved-request queue is server-paginated, and one selected request owns the supplier comparison and recommendation composer. Quote capture persists server-calculated tax, discount, freight, other-charge, subtotal, and supplier-accreditation snapshot fields in company currency. The surface does not imply PO commitment. Binary quote attachment controls remain deferred until the controlled-evidence requirement matrix is confirmed.

### Purpose

Provide a controlled comparison when multiple supplier quotations are required.

### Comparison fields

- Supplier
- Quote reference
- Item
- Quoted quantity
- UOM
- Unit price
- Discounts
- Freight / additional cost
- Lead time
- Payment terms
- Validity date
- Total landed value where available
- Recommendation
- Reason for selection

### Rules

- Comparison must preserve source quote attachments.
- A supplier that is not selected requires a reason when policy requires it.
- If the chosen supplier is not the lowest evaluated price, require a documented justification.
- An approved comparison can create or update a PO only within approved quantities and scope unless a formal revision is made.

---

## 8. PUR-07 and PUR-08 Purchase Orders

### PO list columns

- PO number
- Supplier
- Branch / delivery location
- PO date
- Required delivery date
- Total
- Status
- Related PR
- Receiving progress
- Buyer / owner

### PO detail sections

1. Header and status
2. Supplier and delivery details
3. Items and totals
4. Commercial terms
5. Related PR / quotation comparison
6. Approval Timeline
7. Receiving Progress
8. Balance Closure History
9. Attachments
10. Audit Trail

### PO actions

Permission/policy based:

- Save Draft
- Submit for Approval
- Approve / Return / Reject
- Send / mark issued
- View / print supplier copy
- Amend through revision
- Cancel with reason
- Request Remaining Balance Closure
- View receiving status

Current implementation note: PO detail displays supplier/delivery details, item lines, totals, commercial terms from the selected quote/supplier records, source lineage, approval timeline, receiving progress, supplier issue history, balance closure history, attachment-status messaging, and audit history. Formal attachment upload/enforcement and amendment revisions remain future controlled workflows.

Implemented issue/send note: supplier issue and re-send evidence uses controlled methods only: `Email`, `Printed copy`, `Supplier portal`, and `Manual handoff`.

Implemented supplier-copy note: supplier copy is available only for `APPROVED`, `ISSUED`, `PARTIALLY_RECEIVED`, `FULLY_RECEIVED`, and `CLOSED` POs. It is blocked server-side for draft, pending, and cancelled POs. When supplier issue/re-send evidence exists, the copy shows method, recipient/reference, recorded timestamp, and recorder.

Implemented closure note: users with `purchasing.purchase_order.close_remaining` can request remaining-balance closure only for `PARTIALLY_RECEIVED` POs with outstanding quantity, no non-posted Receiving Report, and no pending closure request. The request requires a reason plus supplier notice reference or unavailable explanation. Approval moves the PO to `CLOSED`, cancels only outstanding quantities, and creates no inventory movements.

Implemented reporting note: PO list, PO detail, and CSV export include delivery-aging visibility for issued or partially received POs. PO list and CSV export also include latest supplier issue evidence, including the user who recorded it, plus ordered, received, closed/cancelled, and open quantity/value summaries for lifecycle reporting.

### Key controls

- Approved PO values may not be silently edited.
- Amendments create a revision history.
- PO cannot be marked fully received without receiving evidence.
- PO may be partially received and must show remaining balance.

---

## 9. Supplier screens

### Supplier List

Columns:

- Supplier code
- Supplier name
- Category
- Approval status
- Active/inactive
- Primary contact
- Payment terms
- Document expiry warning
- Last transaction date

### Supplier Detail

Sections:

1. Supplier profile
2. Contacts
3. Categories and approved items
4. Compliance documents
5. Payment and delivery terms
6. Transaction history
7. Price history where available
8. Audit Trail

---

## 10. Edge states

Every purchasing screen must include:

- no records for current filters;
- no permission;
- expired quotation;
- PR returned for revision;
- PO with partial receiving;
- PO overdue;
- supplier inactive or expired document;
- failed attachment upload;
- concurrent update warning;
- loading and retry states.

---

## 11. Acceptance checks

The purchasing UI is ready for Phase I only if a branch user can create and submit a PR; an approver can approve/reject/return it; purchasing can compare suppliers and create an approved PO; and users can trace the record from PR through PO and receiving status without using offline chat or manual status follow-up.
