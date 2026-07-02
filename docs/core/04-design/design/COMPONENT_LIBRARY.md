# OGFI ERP — Component Library

**Document status:** Phase I baseline  
**Purpose:** Establish reusable components and behavior so business rules and visual patterns do not drift between modules.

---

## 1. Component principles

- Reuse before creating a new component.
- Components must represent clear business semantics, not only visual shapes.
- The same status, permission, amount, attachment, and audit behavior must look and behave consistently across modules.
- Components must support desktop, tablet, and mobile variations.

---

## 2. Application shell

### 2.1 App shell

Contains:

- global navigation;
- company/brand/branch context;
- notification center;
- user menu;
- page content region;
- responsive navigation behavior.

### 2.2 Context switcher

Used for Company, Brand, Branch/Location, Warehouse, and date period.

Rules:

- Options are filtered by user assignment.
- Switching context updates all context-aware widgets.
- The active scope is always visible.
- Users cannot accidentally view a record outside their authorized scope.

---

## 3. Core record components

### 3.1 Record header

Required for every major transaction record.

Shows:

- record type;
- record ID;
- status;
- branch/location;
- owner/requester;
- amount/total where relevant;
- primary action;
- more-actions menu controlled by permission.

### 3.2 Status chip

Single source component for all workflow statuses. Uses approved status taxonomy only.

### 3.3 Approval timeline

Shows:

- current approval step;
- prior approvals/rejections;
- assigned approver;
- timestamps;
- delegation;
- remarks;
- escalation state.

### 3.4 Audit timeline

Shows immutable record events:

- created;
- changed;
- submitted;
- approved/rejected;
- attachment added;
- cancellation/reversal;
- system-generated business events.

---

## 4. Form components

### 4.1 Form section

Reusable bordered or grouped form block with title, optional description, and validation summary.

### 4.2 Smart item selector

Supports:

- item code/name search;
- category filter;
- recently used items;
- item UOM;
- stock availability where permitted;
- controlled selection of active items only.

### 4.3 Amount input

Handles:

- currency format;
- decimal precision;
- validation for negative values;
- line total calculation;
- read-only behavior when derived from system data.

### 4.4 Attachment uploader

Supports:

- image, PDF, spreadsheet, and document uploads;
- camera capture on mobile;
- required attachment validation;
- upload progress;
- version / replacement behavior where necessary;
- permissions for download and deletion.

### 4.5 Reason capture

Required for high-risk actions. Includes reason category and remarks. May require attachment depending on policy.

---

## 5. Data-display components

### 5.1 Standard filter bar

Contains search plus relevant filters with an active-filter count.

Required baseline filters for transaction lists:

- branch/location;
- status;
- date range;
- requester/owner;
- department;
- record type where relevant.

### 5.2 Operational table

Capabilities:

- configurable visible columns;
- stable sorting;
- server-side pagination;
- saved filters where appropriate;
- export, only when permitted;
- row actions based on permission;
- clear empty/loading/error states.

### 5.3 Mobile record card

Alternative to a dense table on narrow screens. Must include the data necessary to decide whether to open the record.

### 5.4 KPI card

Displays a single operational metric with scope, period, value, trend where meaningful, severity, and drill-down.

---

## 6. Action components

### 6.1 Primary action bar

Used on long records/forms. Keeps the main permissible action visible.

### 6.2 Approval action panel

Supports Approve, Reject, Return for Revision, Delegate where permitted.

Rules:

- reject and return actions require remarks;
- approve may require remarks for exceptions;
- decision clearly confirms resulting status and next owner;
- user sees business impact before final confirmation.

### 6.3 Bulk action toolbar

Allowed only on controlled list states and only for permissions that support it. Examples: export, assign reviewer, archive draft. Never allow uncontrolled bulk posting or deletion.

---

## 7. Inventory components

### 7.1 Stock balance summary

Shows current available, on-hand, reserved/in-transit where applicable, UOM, and last movement date.

### 7.2 Transfer confirmation panel

Shows source, destination, dispatched quantity, received quantity, variance, recipient, and confirmation state.

### 7.3 Count entry grid

Supports count sheets by item, blind count where configured, expected versus actual visibility based on role, reason capture, and review submission.

### 7.4 Wastage entry row

Shows item, quantity, UOM, cost estimate, reason, photo/evidence state, and required approver.

---

## 8. Feedback components

### 8.1 Toasts

Use for confirmed, non-critical outcomes. Do not rely on toast alone for important submission confirmation.

### 8.2 Inline alerts

Use for field-level or record-level issues that require user action.

### 8.3 Empty states

Explain why no data appears and offer the appropriate next action when users have permission.

### 8.4 Error states

Must explain impact and recovery. Include Retry when appropriate.

---

## 9. Component quality gates

A component is not ready for shared use until it has:

- responsive behavior;
- loading, empty, error, disabled, and permission-limited states;
- keyboard support where relevant;
- accessible labels;
- test coverage for its critical business behavior;
- documented examples in the component catalog.
