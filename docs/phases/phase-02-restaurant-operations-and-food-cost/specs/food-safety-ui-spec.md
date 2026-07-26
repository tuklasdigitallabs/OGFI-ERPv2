# OGFI ERP — Phase II UI Specification: Food Safety and Compliance

**Status:** Implemented for food-safety queue, detail, create modal, review, return-for-correction, correction apply, close, export, versioned dashboard destinations, and review-reminder visibility
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
5. Dashboard links use the allowlisted `food-safety-reviews-v1`,
   `food-safety-exceptions-v1`, and `food-safety-critical-exceptions-v1`
   read-only destinations and route onward to source records instead of replacing
   source review actions.

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
- Dashboard profiles use the exact session tenant, selected company, optional
  selected brand, and selected location predicates. Raw log type, status, and
  business-date parameters cannot widen or redefine either population; a
  normalized maximum-120-character search may only narrow it.
- `food-safety-reviews-v1` contains the complete scoped `SUBMITTED` plus
  `EXCEPTION_REVIEW` oversight population without implying actor-actionable work.
- `food-safety-exceptions-v1` contains logs with `exceptionCount > 0` in every
  status. The card's summed exception readings and the destination's affected-log
  total remain distinct.
- `food-safety-critical-exceptions-v1` contains retained readings with
  `result = EXCEPTION` and `severity = CRITICAL` in every log status. It labels
  the primary metric `Critical exception readings` and separately shows affected
  logs; it does not imply current actionability.
- Parent logs and child readings use exact relation-safe tenant, selected-company,
  optional-brand, and selected-location predicates wherever reading membership,
  projection, or search is evaluated. Bounded normalized search and server-owned
  pagination may only narrow a profile; raw type, status, business date, and scope
  cannot redefine it.
- Unknown, duplicate, empty, stale, or invalid critical-profile parameters show a
  visible invalid state. Create and ordinary export are hidden in that profile
  mode. Detail and back navigation retain only canonical profile/search/page
  context.
- Dashboard and notification entries are visibility-only source links. Every
  detail action independently enforces current permission, scope, status, actor,
  and workflow-policy eligibility.
- The critical profile suppresses standalone `Exception Review` and `Reviewed`
  dashboard signals. The retained Reviews profile is the combined
  `SUBMITTED` + `EXCEPTION_REVIEW` oversight population; all-severity Exceptions
  remains unchanged.
- The existing Phase II workflow policy catalog/live-service discrepancy remains
  open; profile labels and controls must not imply that it has been resolved.

## Acceptance Criteria

The current controlled slice is complete when a permitted user can create a
food-safety log, review it, return it for correction, apply correction, close it,
filter/export it, and trace audit/correction context without inventory, wastage,
incident, finance, or approval-source mutation.

Future UI expansion for formal approval routes, terminal reopen, attachment
upload enforcement, automatic wastage/incident generation, escalation timers,
saved views, or additional mobile shortcuts requires a new approved backlog
item.
