# OGFI ERP — Phase II UI Specification: Branch Operations

**Status:** Existing checklist workflow, Reviews/Exceptions/Critical Exception Lines destinations, export, and reminder visibility implemented
**Visual standard:** Modern SaaS UI with restaurant-grade operational control

## Screen Purpose

Provide a role-aware workspace for opening/closing and branch-execution
checklists while preserving company, brand, location, requester/reviewer,
status, evidence, correction, export, and audit context.

## Implemented Screens or Views

1. List / queue view with search, business-date, shift, status filters, export,
   status counts, and permission-aware create action.
2. Detail view with source summary, structured checklist lines, status,
   evidence references, reviewer fields, correction history, and source context.
3. Create modal with business date, shift, checklist name, and structured
   checklist lines.
4. Review, return-for-correction, correction apply, and close action surfaces
   when the role and status permit them.
5. Dashboard/report links use the allowlisted `branch-checklist-reviews-v1`,
   `branch-checklist-exceptions-v1`, and
   `branch-checklist-critical-exceptions-v1` read-only destinations and route
   onward to source records instead of replacing source review actions.

## Global UI Rules

- Use core Design Tokens, Component Library, Mobile Rules and UX State standards.
- Keep primary action labels explicit; avoid ambiguous universal actions.
- Show scope context in the header and preserve it across drill-downs.
- Use status pills with text, not color alone.
- Do not hide critical fields behind unnecessary tabs.
- Include empty, loading, error, permission-denied, rejected, cancelled and archived states.
- Use a single shared spacing token across page layout, cards, forms and table controls.

## Implemented Details

- Columns and cards show checklist number/name, date, shift, status, exception
  count, evidence, reviewer, and opened-by context.
- Filters preserve `q`, business date, shift, and status in list/export flows.
- Create/review/correction/close actions use explicit labels and modal forms.
- Denied or unavailable actions are hidden by server-side permission and status
  checks.
- Export keeps the same filter contract as the queue.
- Dashboard profiles reuse the exact selected tenant, company, optional brand,
  and location predicates used by the dashboard source read. Raw status, shift,
  and business-date parameters cannot widen or redefine either population;
  bounded search may only narrow it.
- `branch-checklist-reviews-v1` contains all scoped `SUBMITTED` and
  `MANAGER_REVIEW` checklists. Its total is explicitly management oversight, not
  an actor-actionable task count.
- `branch-checklist-exceptions-v1` counts exception lines and separately reports
  affected checklist rows.
- `branch-checklist-critical-exceptions-v1` counts retained lines whose result is
  `EXCEPTION` and severity is `CRITICAL` across all checklist statuses. Its
  destination separately reports the exact critical-line total and affected
  checklist count; it is not an open-work or actor-actionable population.
- The dashboard suppresses standalone `Manager Review` and `Reviewed` signals.
  Manager Review is already included in the combined Reviews profile and is not
  accurately described as `waiting`; Reviewed is intermediate, excludes `CLOSED`,
  and has no confirmed period, owner, or close-policy reporting definition.
- Unknown or stale profile identifiers produce a visible invalid state instead
  of falling back to the ordinary register. Profile, search, page, and return
  context persist through record detail and back navigation.
- Dashboard and notification entries are visibility-only source links. Every
  detail action independently enforces current permission, scope, status, and
  actor eligibility.
- Profile mode uses server-owned pagination and bounded narrowing search, renders
  cards below the `lg` breakpoint, shows a selected-brand badge when a brand is
  selected, and labels reviewer attribution `Reviewed by`. It does not expose
  create or ordinary export controls.

## Acceptance Criteria

The current controlled slice is complete when a permitted user can create a
branch checklist, review it, return it for correction, apply correction, close
it, filter/export it, and trace audit/correction context without inventory,
finance, incident, maintenance, or approval-source mutation.

Future UI expansion for terminal reopen, formal attachment upload enforcement,
automatic incident generation, escalation timers, saved views, or additional
mobile shortcuts requires a new approved backlog item.
