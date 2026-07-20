# OGFI ERP — Modern SaaS UI Implementation Standard

**Status:** Approved visual and interaction baseline  
**Applies to:** Phase I and future modules  
**Design intent:** Modern SaaS interface with restaurant-grade multi-branch operational control.

---

## 1. Official UI position

OGFI ERP must look and behave like a polished Modern SaaS product:

- clean, bright, structured, and fast to scan;
- restrained blue accents rather than decorative color use;
- white cards on a soft neutral page background;
- balanced tables with clear status pills;
- role-aware dashboards and task queues;
- responsive desktop, tablet, and mobile patterns;
- visible operational context and audit accountability.

It must **not** become a generic consumer dashboard that hides important controls, nor a dense legacy accounting interface that overwhelms branch users.

---

## 1.1 Implementation completion gate

UI/UX readiness is a completion requirement, not a polish activity.

A client-facing workflow is not implemented if its primary workspace is still a long stack of cards, panels, inline forms, or unrelated sections. Schema, service, route, migration, and test coverage can prove a backend foundation, but they do not prove a usable SaaS workspace.

Before any operational or finance/workforce milestone is marked `Implemented`, the workspace must satisfy these gates unless the milestone is explicitly labeled backend-only:

- The primary view is list-first or task-queue-first, not card-stack-first.
- Multi-function workspaces use real route/subworkspace tabs or equivalent segmented navigation.
- The first viewport shows actionable records, exceptions, or a focused task queue, not only metrics or setup cards.
- Lists with more than 10 possible records have pagination, virtualized loading, or an approved incremental-load pattern.
- Record-specific actions are opened from one selected record in a drawer, detail page, or focused composer; repeated inline action forms are not allowed.
- Long transaction entry and multi-line entry use a drawer, sheet, stepper, or full-page task mode, not a cramped centered modal.
- Desktop, tablet, and mobile layouts remain readable, non-overlapping, and task-completable.
- Light and dark themes preserve readable contrast for text, chips, buttons, disabled controls, table headers, tabs, and posting context.

If these gates conflict with an existing implementation pattern, the gate wins. Existing code is not authority for repeating a weak workspace pattern.

---

## 2. Visual baseline

### 2.1 Default token direction

```css
:root {
  --space: 8px;

  --color-bg-canvas: #F4F6F9;
  --color-bg-surface: #FFFFFF;
  --color-bg-subtle: #F7F9FC;
  --color-border-default: #E4E8EF;
  --color-border-strong: #CBD5E1;

  --color-text-primary: #182230;
  --color-text-secondary: #758196;
  --color-text-muted: #98A2B3;

  --color-action-primary: #2F66C8;
  --color-action-primary-hover: #1F4FA7;
  --color-action-primary-soft: #EAF1FF;

  --color-status-success: #198754;
  --color-status-success-soft: #EAF7F0;
  --color-status-warning: #D88A13;
  --color-status-warning-soft: #FFF4E5;
  --color-status-danger: #D94841;
  --color-status-danger-soft: #FDECEC;
  --color-status-info: #2F66C8;
  --color-status-info-soft: #EAF1FF;
  --color-status-neutral: #667085;
  --color-status-neutral-soft: #F2F4F7;
}
```

The values above are OGFI defaults. The code must use semantic tokens so a future tenant may apply its own brand palette without rewriting components.

### 2.2 Core visual language

- Page background: soft blue-grey/neutral canvas.
- Content surfaces: white, with subtle border and restrained shadow.
- Radius: 8–12px for cards/forms; avoid exaggerated rounded shapes.
- Typography: Inter, system UI, or equivalent clear sans-serif.
- Primary blue: reserved for interactive emphasis, active navigation, primary actions, links, and informational states.
- Status: semantic color plus label; never color alone.
- Charts: support data reading with labels, tooltips, and non-color-only distinction.

---

## 3. App shell and information architecture

### 3.1 Desktop shell

```text
Persistent sidebar
+ compact top header
+ page title and subtitle / data freshness
+ global search
+ context switcher
+ notifications
+ user menu
+ scoped page content
```

### 3.2 Phase I navigation

```text
OVERVIEW
- Dashboard
- My Tasks
- Approvals

OPERATIONS
- Inventory
- Procurement
- Receiving
- Transfers
- Stock Counts
- Wastage & Adjustments

INSIGHTS
- Reports

ADMIN
- Suppliers
- Master Data
- Users & Roles
- Approval Settings
```

Do not show unreleased future modules to standard users. Future modules such as Recipes, Finance, HR, Production, and Projects should appear only after release and only for authorized roles.

### 3.3 Role-aware navigation

- Menu groups may be hidden if user has no permission within the module.
- Users see only actions they are allowed to initiate.
- The same module can show different default views for branch manager, storekeeper, purchasing, finance, or executive users.
- Do not create a separate app per role. Use shared routes, contextual data, and permission-aware actions.

---

## 4. Mandatory contextual information

On all important transaction, inventory, approval, and dashboard screens, users must be able to identify immediately:

```text
Company
Brand, where relevant
Branch / Warehouse / Commissary / Project location
Department or Cost Center, where relevant
Requester / owner
Status
Current approver or next action
Date / required delivery date / reporting period
```

### 4.1 Context switcher

The global context switcher should support:

```text
Company → Brand → Location → Period
```

Rules:

- Available options are limited by user assignments.
- Changing scope refreshes page data and is visually clear.
- Transaction pages display the record’s fixed context; users cannot switch a transaction to another branch accidentally.
- `All Brands / All Locations` is allowed only for authorized dashboard/report views, not for stock posting or receiving.

---

## 5. Dashboard standard

### 5.1 Dashboard hierarchy

```text
1. Context and data freshness
2. Action queue
3. Role-specific KPI strip
4. Operational trend or status view
5. Drill-down records
```

### 5.2 Phase I dashboard KPIs

Do not lead Phase I with sales, food cost, labor cost, covers, or recipe metrics unless their underlying data sources are already live and trusted.

Use Phase I operational controls instead:

- Pending approvals by age
- Purchase Requests awaiting action
- Open POs
- Deliveries due / overdue
- Low-stock / critical-stock items
- Transfers awaiting dispatch or receipt
- Stock counts due
- Unresolved variances
- Wastage awaiting approval
- Supplier delivery discrepancies

### 5.3 Role defaults

| Role | Dashboard priority |
|---|---|
| Executive / GM | Company-wide risk, approvals, supplier/stock exceptions, branch comparison |
| Operations Manager | branch control gaps, counts due, wastage/variance, receiving/transfer exceptions |
| Purchasing | PR aging, quotation work, POs awaiting action, overdue deliveries, supplier changes |
| Warehouse | inbound deliveries, dispatches, receipt confirmations, low stock, count tasks |
| Branch Manager | deliveries, low stock, request/approval tasks, transfers, counts, wastage |
| Storekeeper | stock list, count tasks, receiving, transfers, expiry/wastage alerts |
| Finance | approved PO exposure, discrepancy value, audit exceptions, budget integration when released |

---

## 6. Data tables and lists

Operational modules are list-first by default. Cards support summaries, mobile row transformations, and short repeated previews; they are not the default desktop structure for large operational registers.

### 6.1 Desktop table design

Use balanced, readable data tables:

- clear column headings;
- row height that supports scanning, not excessive density;
- right-aligned currency, quantity, and percentage fields;
- status pills with text labels;
- primary item/record label plus compact secondary metadata;
- search, filters, saved views, sorting, column visibility, and export where permitted;
- row click opens a full detail view; quick actions are visible only where safe.
- server-side pagination or equivalent incremental loading when more than 10 records can exist.

### 6.2 Responsive transformation

```text
Desktop → balanced table
Tablet → fewer columns, row detail expansion
Mobile → cards with primary information first
```

Mobile cards must show at least:

- record/item name and reference;
- branch/location;
- status;
- critical quantity/value/date;
- next action or owner.

### 6.3 Inventory list baseline

Default columns:

```text
Item
Item Code
Category
Primary Supplier
Stock Location
On Hand
Par Level
Unit
Last Count Date
Expiry Risk
Status
Inventory Value
```

Roles may hide/show secondary columns; required operational fields remain visible.

---

## 7. Record detail standard

### 7.1 Record header

Every controlled record detail starts with:

```text
Record type + reference
Status pill
Scope: company / brand / location
Requester / owner
Key amount or quantity
Current approval / next action
Primary contextual action
More actions (permission-controlled)
```

### 7.2 Information layout

Keep business context visible in the first viewport. Do not hide the critical basics behind tabs.

Recommended section order:

1. record header;
2. essential facts and status;
3. line items / core business details;
4. approval timeline;
5. attachments and evidence;
6. audit trail;
7. related documents.

### 7.3 Primary actions by state

Use plain business language:

| Screen/state | Primary action |
|---|---|
| Purchase Request draft | Submit for Approval |
| Purchase Request pending | Approve / Reject / Return for Revision |
| Purchase Order approved | Send PO to Supplier |
| Delivery expected | Receive Delivery |
| Transfer ready | Dispatch Transfer |
| Transfer in transit | Confirm Receipt |
| Wastage draft | Submit Wastage |
| Stock count open | Save Count / Submit Count |

Avoid ambiguous labels such as `Order`, `Continue`, or universal `+` where the action could differ by role or state.

---

## 8. Warehouse-first replenishment UX

The system must not route a low-stock alert directly to an external purchase order.

Correct user-facing flow:

```text
Low stock / required item
→ Check main warehouse availability

Warehouse available
→ Create Transfer Request
→ Dispatch from warehouse
→ Branch receives transfer
→ Stock updated

Warehouse unavailable
→ Create Purchase Request
→ Approval
→ Quotation comparison when required
→ Purchase Order
→ Supplier delivery
→ Receiving
→ Stock updated
```

The UI can offer a clear `Request Stock` action. The backend determines whether it becomes a transfer or purchase workflow based on availability and rules.

---

## 9. Mobile and tablet operational standard

### 9.1 Primary mobile workflows

- submit Purchase Request;
- review/approve/reject assigned document;
- receive delivery;
- dispatch/receive transfer;
- start and submit stock count;
- log wastage with photo evidence;
- scan barcode or QR where supported;
- review low-stock and urgent tasks.

### 9.2 Mobile rules

- minimum 44 × 44px interactive touch targets;
- one primary action per decision point;
- bottom-fixed action bar for approval, receiving, count, and submission actions where helpful;
- camera/photo upload designed for real-world evidence capture;
- use full-screen flows instead of deep modal stacks;
- preserve filters and user context when returning to a list;
- keep status, branch/location, owner, and next action above the fold.

### 9.3 Context-aware floating action button

Avoid an unlabeled universal `+` action.

Use a visible, screen-specific action:

| Screen | Mobile primary action |
|---|---|
| Dashboard | Create Purchase Request |
| Inventory | Start Stock Count / Scan Item |
| Receiving | Receive Delivery |
| Transfers | Create Transfer or Confirm Receipt |
| Wastage | Log Wastage |
| Approvals | Review Next Approval |

---

## 10. States and feedback

Every workflow screen must define and implement:

- loading;
- empty;
- no access;
- error;
- offline/retry state where applicable;
- draft;
- submitted/pending;
- approved;
- rejected/returned;
- cancelled;
- completed/posted;
- partial/discrepancy state where relevant.

Error text must use operational language. Example:

```text
Cannot dispatch transfer: Main Warehouse has 12 kg available, but this transfer requests 20 kg.
```

Not:

```text
Inventory operation failed.
```

---

## 11. Accessibility and visual quality

- Do not rely on color alone for status.
- Maintain accessible contrast.
- Ensure keyboard navigation and visible focus on desktop.
- Use legible font sizes; do not sacrifice readability for compactness.
- Never use decorative shadows, gradients, or animations that reduce clarity.
- Keep animations subtle and purposeful: loading feedback, state transition acknowledgement, drawer/sheet movement.
- The wireframe-style handwritten annotations are for design exploration only and do not belong in production UI.

---

## 12. UI acceptance checklist

A screen passes this standard when a first-time user can answer:

1. What is this screen or record?
2. Which company/brand/branch/warehouse/project is it for?
3. What is the current status?
4. Who owns the next action?
5. What can I do now?
6. What is the money, stock, or approval impact?
7. Where is the audit history/evidence?

And when the UI remains usable on the actual device used by the target role.


---

## Projects & Implementation Tracker — Modern SaaS UI Addendum

### Desktop views

- **Project overview:** health, progress, milestones, overdue tasks, blockers, recent activity, members, and linked-record summaries.
- **Board view:** Trello-like configurable columns with compact cards. Drag-and-drop is progressive enhancement; accessible status controls must always be available.
- **List view:** filterable and exportable task table for managers and coordination work.
- **Calendar view:** due dates and milestones. It does not become a resource-scheduling tool in Phase 1.5.
- **My Tasks:** default operational view for contributors; prioritize Today, overdue, blocked, and review-required work.

### Card and task-detail requirements

Every task card must show at least title, status, owner/assignee indicator, due-date state, priority, and blocker marker. Task detail must show project context, current status, assignees, description, checklist, linked records, comments, attachments, activity history, and next action.

### Mobile rules

On mobile, use task list and task detail as the primary interaction. Board drag-and-drop is optional and must not be required to change status. Provide clear labeled actions: `Start`, `Mark blocked`, `Request review`, `Complete`, `Add comment`, and `Upload evidence` according to permissions and state.

### Accessibility and status

Do not communicate task urgency using color alone. Use labels such as `Overdue`, `Due today`, `Blocked`, `Waiting for approval`, and `Completed`. Ensure all board, filter, and status controls work with keyboard and screen-reader interaction on desktop.
