# OGFI ERP — Suppliers UI Specification

**Phase:** I  
**Primary users:** Purchasing, Finance, authorized Managers, System/Master Data Administrators  
**Purpose:** Maintain approved supplier records, qualification status, documents, contact details, and relevant transaction context.

---

## 1. Screen inventory

| ID | Screen | Purpose |
|---|---|---|
| SUP-01 | Supplier List | Search/filter approved, pending, conditional, blocked, inactive suppliers |
| SUP-02 | Create Supplier Request | Submit new supplier or update request |
| SUP-03 | Supplier Detail | View profile, status, documents, categories, contacts, related PR/PO history |
| SUP-04 | Supplier Review Queue | Approve/conditional/block supplier actions |
| SUP-05 | Supplier Price Context | View item-price history where available |

## 2. Supplier list

### Columns

- Supplier code/name
- Status
- Categories
- Primary contact
- Payment terms where permitted
- Document expiry indicator
- Last PO / activity date
- Delivery/discrepancy indicator where available

### Filters

- Status
- Category
- Company/brand/location scope where supplier availability differs
- Expiring documents
- Blocked/conditional
- Active/inactive

## 3. Supplier detail sections

1. Header: name, code, status, categories, owner, active state.
2. Company/legal information: controlled visibility.
3. Contacts and ordering details.
4. Documents and expiry dates.
5. Supplier qualification/review history.
6. Linked items and price history where maintained.
7. Recent PR/PO/receiving/discrepancy context.
8. Audit history.

## 4. Status behavior

| Status | Meaning | Transaction behavior |
|---|---|---|
| Prospective | Under initial setup | Cannot be selected for PO by default |
| Pending review | Awaiting approval/documents | Cannot be used unless exception policy applies |
| Approved | Eligible for use | Selectable within scope/category |
| Conditional | Eligible with restrictions | Show warning and enforce policy |
| Blocked | Not eligible | Block new PO selection unless authorized override |
| Inactive | Historical only | Not selectable for new transactions |

## 5. Required controls

- Duplicate check on supplier name, tax identifier where recorded, email/phone, and bank details where permitted.
- Supplier status changes require reason and audit event.
- Finance review is required for changes that affect legal, tax, bank, or payment data.
- Blocked supplier override must show warning, justification, approver, and audit history.

## 6. Responsive behavior

- Mobile supports lookup, viewing status/documents, and adding supplier request—not full heavy administration by default.
- Use section cards rather than wide tables on small screens.

## 7. Acceptance criteria

- Unapproved/blocked supplier behavior is enforced at PO selection.
- Supplier documents/expiry statuses are visible to authorized users.
- Supplier changes are auditable and scope aware.
