# OGFI ERP — Phase V UI Specification: Tenant Administration

**Status:** Planned detailed-specification framework  
**Visual standard:** Modern SaaS UI with restaurant-grade operational control

## Screen Purpose

Provide a role-aware workspace for tenant administration while preserving company, brand, location/project, department, requester, status, approval and audit context.

## Required Screens or Views

1. List / queue view with search, filters, saved views, export and permission-aware actions
2. Detail view with record summary, structured data, status, next action, timeline and attachments
3. Create / edit flow with validation, autosave or draft behavior where appropriate
4. Approval, review or exception action surface when the role permits it
5. Responsive mobile view for field, branch, warehouse or manager actions when relevant

## Global UI Rules

- Use core Design Tokens, Component Library, Mobile Rules and UX State standards.
- Keep primary action labels explicit; avoid ambiguous universal actions.
- Show scope context in the header and preserve it across drill-downs.
- Use status pills with text, not color alone.
- Do not hide critical fields behind unnecessary tabs.
- Include empty, loading, error, permission-denied, rejected, cancelled and archived states.
- Use a single shared spacing token across page layout, cards, forms and table controls.

## Required Details Before Build

- Exact columns and filters
- Form fields and conditional validation
- Role-based actions and visibility
- Approval panel and audit timeline treatment
- Mobile priority tasks and touch target requirements
- Related-record navigation and export behavior
- Accessibility and keyboard behavior

## Acceptance Criteria

The UI is complete only when a first-time permitted user can identify the record, scope, status, next action, owner and material operational impact without leaving the record page.

### Organization Scope — Company Context assigned access

Company Context is a read-only selected-company drilldown. Its Company Access panel is an assignment-grain register of active, currently effective company assignments for active users in the current tenant. It reports exact request-time totals, supports URL-backed 10–100 row pages and bounded name/email search, renders assignment timestamps in the company timezone, and exposes explicit empty and filtered-empty states. Brands and Locations are summary counts with a handoff to the bounded Organization Scope registries; Approval Rules remain in their authoritative registry and are not silently hydrated here.

### Approval Rule detail registers

Approval Rule detail is read-only. Approval Steps and Related Audit Activity are independent server-paginated registers with exact totals, 10–100 row bounds, deterministic ordering, explicit empty states, and responsive pagination. Step assignee labels are current-page projections and may state that a referenced role or user is inactive or unavailable; they do not grant approval authority. Audit activity is limited to the selected company and renders timestamps in the rule company timezone.

### Audit Event detail

Audit Event detail is read-only and tenant/scope authorized. Actor and company fields use allowlisted projections; sensitive nested keys remain redacted. Before/after/metadata panels have explicit depth, node, and byte budgets, contained scrolling, and a visible notice when the projection is truncated. The immutable stored event is never changed by viewing it, and timestamps use the event company timezone.

### Organization Scope — Location Context assigned access

The selected-company Location Context detail is a read-only, server-authorized view. Its Assigned Access panel is an assignment-grain register: it shows active, currently effective location assignments for active users in the current tenant, with active/effective tenant or global role names as a bounded preview. The panel reports an exact request-time assignment total and uses URL-backed pages of 10–100 rows, deterministic `userId ASC, assignmentId ASC` ordering, stale-page clamping, truthful empty state, and shared responsive pagination controls. It does not grant, edit, or revoke access; those actions remain in the User Access workspace.
