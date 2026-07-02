# OGFI ERP — Phase II UI Specification: Branch Operations

**Status:** Planned detailed-specification framework  
**Visual standard:** Modern SaaS UI with restaurant-grade operational control

## Screen Purpose

Provide a role-aware workspace for branch operations while preserving company, brand, location/project, department, requester, status, approval and audit context.

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
