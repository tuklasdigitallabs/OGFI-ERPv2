# Projects & Implementation Tracker — Product Specification

**Phase:** 1.5
**Status:** Build-ready baseline with configurable policies noted in Open Decisions

## 1. Problem

OGFI implementation work—branch improvements, renovations, IT rollouts, training, marketing activation, audit actions, and future openings—is often tracked through chats, Excel, calls, and informal follow-up. This makes ownership, blockers, evidence, and deadlines hard to see in one place.

## 2. Product goal

Give authorized users a modern SaaS project workspace that makes work, ownership, due dates, blockers, evidence, and next actions visible, while keeping purchasing, receiving, inventory, approvals, and financial records controlled in their existing ERP modules.

## 3. Users

- Project Sponsor: needs project health, risks, milestone status, and escalation visibility.
- Project Manager: creates/maintains projects, templates, members, tasks, milestones, risks, and closure.
- Contributor: works assigned tasks, updates progress, adds evidence, comments, and blockers.
- Viewer: sees approved project content read-only.
- Project Administrator: governs templates, restricted access, and cross-project reporting.

## 4. Scope

### Included

- Company-scoped project setup; optional brand, location, department, cost-center, or project-site context.
- Controlled project templates with configurable statuses, checklists, milestones, and notification defaults.
- Board, list, calendar, My Tasks, and project-overview views.
- Tasks: status, priority, owner, assignees, start/due dates, description, checklist, attachments, comments, links, activity.
- Risks and blockers with reasons, owners, severity, escalation, and resolution state.
- Milestones with target date, status, linked tasks, and at-risk indicator.
- Permission-checked links to ERP records.
- Basic reports and export.

### Excluded

- Automatic resource allocation or capacity planning.
- Critical-path calculation or advanced Gantt scheduling.
- Public boards, share links, client portals, external contractor accounts.
- Automated project budgets or task-driven purchasing/payment/inventory actions.
- Custom end-user automation builder.
- Replacement of the organization’s chat platform.

## 5. Success criteria

1. An authorized Project Manager can create a scoped project from a template in under 10 minutes.
2. Contributors can identify their next task, deadline, and blocker state on desktop and mobile.
3. Management can identify overdue, blocked, and at-risk work without reading chat threads.
4. Linked ERP records remain controlled and do not expose unauthorized data.
5. Project activity is traceable and auditable.

## 6. Default project types

- ERP / IT Implementation
- Operational Improvement
- Renovation / Fit-Out
- Maintenance Project
- Marketing Campaign
- Training Rollout
- Audit Corrective Action
- Compliance / Permit Work
- Supplier Onboarding
- Future Branch Opening / Expansion execution

## 7. Default task statuses

Backlog → Planned → In Progress → Waiting for Approval → Blocked → For Review → Completed → Cancelled

Templates may configure a subset, but any template must support clear active, waiting, blocked, completed, and cancelled outcomes.

## 8. Key controls

- `Blocked` requires a reason.
- `Completed` records actor and completion timestamp.
- `Cancelled` and `Reopened` actions preserve history and require authorized role/policy.
- Task links display only source-record data the current user is authorized to view.
- Completing a task never completes or approves a linked ERP record.
- Restricted projects need explicit membership or authorized project-admin scope.

## 9. Required user stories

### Project Manager

As a Project Manager, I need to create an ERP rollout project from a template, assign owners, set due dates, track blockers, and see linked implementation purchases so that the project can be controlled without chasing separate chat messages.

### Branch Contributor

As a Branch Manager, I need to see my tasks and complete them from a phone, including photo evidence and comments, so that I can support a rollout without using a desktop-only tool.

### Executive Sponsor

As a sponsor, I need a concise view of at-risk milestones, overdue work, blockers, and the responsible owners so that I can intervene early.

### Procurement or Finance Stakeholder

As a stakeholder, I need linked task context without granting a project user permission to alter or see confidential details of a controlled PO or payment-related record.
