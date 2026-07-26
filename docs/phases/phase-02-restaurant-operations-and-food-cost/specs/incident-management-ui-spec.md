# OGFI ERP — Phase II UI Specification: Incident Management

**Status:** Implemented current slice
**Visual standard:** Modern SaaS UI with restaurant-grade operational control

## Screen Purpose

Provide a role-aware workspace for incident management while preserving company, brand, location/project, department, requester, status, approval and audit context.

The current implementation provides scoped incident list, create modal, detail view, source-record navigation, non-terminal correction modal, resolve/cancel modals, dashboard metrics, notifications, and CSV export. Correction is permissioned, reasoned, auditable, and backed by `OperationalCorrectionRecord`.

## Required Screens or Views

1. List / queue view with search, filters, saved views, export and permission-aware actions
2. Detail view with record summary, structured data, status, next action, timeline and attachments
3. Create and non-terminal correction flows with validation and required correction reason
4. Resolve/cancel action surfaces when the role permits them
5. Responsive mobile view for field, branch, warehouse or manager actions when relevant

## Global UI Rules

- Use core Design Tokens, Component Library, Mobile Rules and UX State standards.
- Keep primary action labels explicit; avoid ambiguous universal actions.
- Show scope context in the header and preserve it across drill-downs.
- Use status pills with text, not color alone.
- Do not hide critical fields behind unnecessary tabs.
- Include empty, loading, error, permission-denied, rejected, cancelled and archived states.
- Use a single shared spacing token across page layout, cards, forms and table controls.

## Implemented Details

- List columns and filters for incident date, status, severity, and search text
- Create/correct/resolve/cancel fields with date validation and evidence handling
- Role-based action visibility for create and resolve permissions
- Audit, transition, and correction-record treatment in service commands
- Related source-record navigation without mutating the source record
- CSV export preserving filters

### Dashboard-profile mode

- The read-only `incident-open-v1`, `incident-critical-v1`,
  `incident-pending-review-v1`, and `incident-overdue-v1` destinations are visibly
  labeled as dashboard-derived Incident views. Critical includes every status and is
  a historical severity lens; Pending Review is oversight, not assigned work.
- Profile mode is server-paginated and accepts only a normalized search of no more
  than 120 characters as an additional narrowing condition. It ignores raw status,
  severity, and incident-date filters, hides create and ordinary export, and displays
  a controlled error for invalid or stale profile context.
- Overdue requires exactly one valid non-future `asOf=YYYY-MM-DD`. Its notice states
  the due-date cutoff and explains that incident status, resolution, cancellation,
  and corrected due dates reflect current records; the view is not a historical
  snapshot. Other profiles reject `asOf`.
- Profile rows expose only the identity, scope, status, severity, due/resolution,
  reporter, and owner context needed for triage. Narrative, corrective action,
  evidence, source-record ID, and audit history remain on independently authorized
  source detail.
- Detail, Back, Correct, Resolve, and Cancel navigation preserves canonical profile,
  bounded search, page, and applicable cutoff context. Visibility of a profile row
  grants no action authority; each action reauthorizes the current user and record.

Future UI expansion should define assignment workflow, terminal reopen, richer audit timeline, source-link correction, and mobile-specific shortcut behavior before implementation. The current assignment wording must not imply a working assignment command, and `PENDING_REVIEW` must not imply an implemented entry action until those contracts are confirmed.

## Acceptance Criteria

The UI is complete only when a first-time permitted user can identify the record, scope, status, next action, owner and material operational impact without leaving the record page.
