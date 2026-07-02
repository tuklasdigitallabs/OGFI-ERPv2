# DEC-0007 — Shared Work Management Engine with Specialized Branch Expansion and Marketing Modules

- **Status:** Confirmed product decision; implementation requires a separate approved architecture/design council.
- **Date:** 2026-06-29
- **Owner:** OGFI ERP Product Governance

## Decision

OGFI ERP will use one shared **Work Management Engine** for common work-tracking capabilities and expose separate specialized modules for:

1. **Branch Expansion & Construction**
2. **Marketing Operations**

The shared engine is the common source of truth for work items, assignments, roles on a work item, checklists, comments, attachments, activity history, notifications, reminders, blockers, calendar events, board state, templates, and archival behavior.

Branch Expansion & Construction and Marketing Operations will each own their specialized business objects, lifecycle rules, dashboards, reports, templates, and navigation. They will not own duplicate task, comment, attachment, activity, or notification subsystems.

## Rationale

Both domains need task assignment and Kanban tracking, but their operating controls differ materially:

- Branch Expansion requires phase gates, site details, capex, permits, contractors, construction, punch lists, opening readiness, handover, and target-opening-date risk.
- Marketing requires campaign calendars, promotions, new-item launches, creative approvals, branch rollouts, channel planning, asset readiness, and post-campaign review.

One generic board would hide critical domain controls. Two separate engines would duplicate data, create inconsistent permissions, fragment user work, and make reporting unreliable.

## Required operating model

- Every work item has one accountable owner.
- A work item may have multiple assignees, reviewers, approvers, and watchers.
- A task can link to a controlled ERP record but cannot execute or bypass its workflow.
- Branch Expansion supports Board, List, Calendar, Milestone, Dashboard, and future Timeline/Gantt views.
- Marketing supports Calendar, Campaign, Promotion, New Item, Kanban, List, and reporting views.
- Users see only records within their authority and membership scope.
- Material work records are archived or soft-deleted; actions remain auditable.

## Consequences

### Positive

- Common task behavior and user experience across ERP modules.
- Unified My Work, reminders, assignment, notifications, attachments, and activity history.
- Specialized workspaces without database or workflow duplication.
- Easier future integration with finance, procurement, inventory, operations, HR, and reporting.

### Constraints

- The shared engine must be designed before specialized modules become production features.
- Common data model and authorization decisions are high-risk and require the decision council.
- Specialty modules must not customize the shared engine in ways that fork common behavior without governance approval.

## Explicit non-goals for the initial implementation

- Public project links
- External contractor portals
- Full resource-capacity optimization
- Automated critical-path computation
- Unlimited end-user workflow builders
- Automatic financial posting, payment release, approval, receiving, or inventory actions from task status changes
- Unapproved external calendar synchronization

## Open decisions

- Initial allowed status templates and who may edit them.
- Whether project membership can grant access beyond the user’s normal location/department scope.
- Attachment size, file types, retention, and virus-scanning policy.
- Notification channels, reminder cadence, and escalation policy.
- Detailed implementation ordering relative to Phase I and existing Phase 1.5 project tracking work.
