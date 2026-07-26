# OGFI ERP — Phase II UI Specification: Maintenance

**Status:** Implemented current slice
**Visual standard:** Modern SaaS UI with restaurant-grade operational control

## Screen Purpose

Provide a role-aware workspace for maintenance while preserving company, brand, location/project, department, requester, status, approval and audit context.

The current implementation provides scoped maintenance list, create modal, detail view, source-incident navigation, same-location asset history, non-terminal correction modal, complete/cancel modals, dashboard metrics, notifications, and CSV export. Correction is permissioned, reasoned, auditable, and backed by `OperationalCorrectionRecord`.

## Required Screens or Views

1. List / queue view with search, filters, saved views, export and permission-aware actions
2. Detail view with record summary, structured data, status, next action, timeline and attachments
3. Create and non-terminal correction flows with validation and required correction reason
4. Complete/cancel action surfaces when the role permits them
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

- List columns and filters for requested date, status, priority, and search text
- Create/correct/complete/cancel fields with date validation, downtime, corrective action, and evidence handling
- Role-based action visibility for create and complete permissions
- Audit, transition, and correction-record treatment in service commands
- Related source-incident navigation without resolving or mutating the source incident
- Same-location asset history on the detail view
- CSV export preserving filters
- Four read-only dashboard-profile destinations confirmed in `DEC-0229`: active Follow-up, all-status Critical history, Pending Vendor oversight, and captured-cutoff active Overdue
- Profile search is limited to 120 normalized characters and visible ticket metadata; raw register filters cannot redefine a profile, create/export are hidden, and direct profile export is rejected
- Profile navigation preserves canonical profile/search/page/applicable-cutoff context through detail and independently authorized actions
- Overdue displays its `asOf` due-date cutoff and explains that current status, completion, cancellation, and corrected target dates can change the rows; it is not a historical snapshot
- Profile rows omit source Incident ID, corrective-action narrative, evidence, downtime detail, and audit content. A source-Incident link is shown only on authorized detail and the target reauthorizes independently

Future UI expansion should define assignment workflow, terminal reopen, richer audit timeline, source-incident correction, vendor workflows, and mobile-specific shortcut behavior before implementation. Assignment/reassignment authority, vendor-state transitions, terminal-status/date recovery, and authoritative operating-timezone policy remain open and must not be inferred from profile labels.

## Acceptance Criteria

The UI is complete only when a first-time permitted user can identify the record, scope, status, next action, owner and material operational impact without leaving the record page.
