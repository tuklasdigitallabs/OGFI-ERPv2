# OGFI ERP — Phase II UI Specification: Food Safety and Compliance

**Status:** Implemented for food-safety queue, detail, create modal, review, return-for-correction, correction apply, close, export, dashboard source links, and review-reminder visibility
**Visual standard:** Modern SaaS UI with restaurant-grade operational control

## Screen Purpose

Provide a role-aware workspace for food-safety and compliance logs while
preserving company, brand, location, reporter/reviewer, status, exception
severity, corrective action, evidence, correction, export, and audit context.

## Implemented Screens or Views

1. List / queue view with search, business-date, log-type, status filters,
   export, status/exception counts, and permission-aware create action.
2. Detail view with source summary, structured readings, expected limits,
   result/severity, corrective action, evidence references, reviewer fields,
   correction history, and source context.
3. Create modal with business date, log type, title, structured readings,
   result/severity, corrective action, and evidence reference.
4. Review, return-for-correction, correction apply, and close action surfaces
   when the role and status permit them.
5. Dashboard/report links route to source records instead of replacing source
   review actions.

## Global UI Rules

- Use core Design Tokens, Component Library, Mobile Rules and UX State standards.
- Keep primary action labels explicit; avoid ambiguous universal actions.
- Show scope context in the header and preserve it across drill-downs.
- Use status pills with text, not color alone.
- Do not hide critical fields behind unnecessary tabs.
- Include empty, loading, error, permission-denied, rejected, cancelled and archived states.
- Use a single shared spacing token across page layout, cards, forms and table controls.

## Implemented Details

- Columns and cards show log number/title, date, log type, status, exception
  severity, evidence, reviewer, and opened-by context.
- Filters preserve `q`, business date, log type, and status in list/export
  flows.
- Create/review/correction/close actions use explicit labels and modal forms.
- Denied or unavailable actions are hidden by server-side permission and status
  checks.
- Export keeps the same filter contract as the queue.
- Dashboard and notification entries are visibility-only source links.

## Acceptance Criteria

The current controlled slice is complete when a permitted user can create a
food-safety log, review it, return it for correction, apply correction, close it,
filter/export it, and trace audit/correction context without inventory, wastage,
incident, finance, or approval-source mutation.

Future UI expansion for formal approval routes, terminal reopen, attachment
upload enforcement, automatic wastage/incident generation, escalation timers,
saved views, or additional mobile shortcuts requires a new approved backlog
item.
