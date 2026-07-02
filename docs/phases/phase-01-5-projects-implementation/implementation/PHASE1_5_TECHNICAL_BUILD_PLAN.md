# Phase 1.5 — Projects & Implementation Technical Build Plan

## Architecture

Implement the module in the modular monolith using separate domain services for projects, tasks, templates, risks/blockers, milestones, links, and activity. Reuse the platform’s authorization, attachment, notification, auditing, and export mechanisms. Do not add queueing or background-job infrastructure in Phase 1.5.

## API/service boundaries

- `ProjectService`: implemented project lifecycle transitions, closure/cancellation/archive gates, member add/remove controls, scopes, health.
- `ProjectTemplateService`: implemented draft/create with duplicate-code guard, publish validation, archive, registry UI with sanitized action feedback, first-template creation access from explicit configure permission, separate template navigation/default-route access that does not widen project/task board access, published-template project creation snapshots, bounded notification reminder defaults, and starter task/checklist/milestone cloning from versioned template config.
- `ProjectTaskService`: implemented foundation for template/config-aware task state transitions, optimistic version checks, create-time assignment and bounded task reassignment, assignees, checklist item create/complete/reopen, required-checklist completion gates, comments, task attachment metadata links, blockers with optional next-review dates, automatic blocker close when blocked tasks resume/complete/cancel, manual blocker resolution/cancellation notes with activity history, completion/reopen/cancel, authorized mobile task detail reads, and server-derived overdue state.
- `ProjectMilestoneService`: implemented foundation for milestone creation/status changes with optimistic version checks, permission-aware Work Calendar mutation affordances, and derived calendar reads.
- `ProjectRiskService`: implemented first advisory risk lifecycle with project authorization, risk-specific permissions, optimistic version checks, activity history, and no operational source-record mutation.
- `ProjectLinkService`: implemented first slice for task-level PR, PO, goods receipt, transfer, and supplier references with safe summaries.
- `ProjectActivityService`: append activity entries transactionally with state changes.
- `ProjectReportService`: implemented portfolio-health, narrow task-register, redacted activity-log, and linked-record follow-up CSV exports using authorized project/task/activity/link data, audit events, source-summary redaction, and a per-user rate limit.
- `ProjectNotificationService`: implemented scoped in-app slices for assignment, reassignment, blocked tasks, due-soon/overdue task reminders, high/critical risks, and at-risk milestones using the existing notification foundation, deterministic idempotency keys, server-derived recipients, and no queueing infrastructure.
- `ActionFeedbackService`: project tracker service errors now have explicit user-safe feedback mappings with regression coverage so UAT users receive actionable messages instead of generic failures.

## Engineering rules

- All project reads/writes must use tenant/company/scope authorization before data access.
- Use optimistic concurrency/versioning or transition guards for task status changes when concurrent edits are possible.
- Create activity events inside the same transaction as the relevant state update.
- Never store unfiltered source-record details in project link records.
- Drag-and-drop board updates call the same status-transition service as other UI controls.

## Migration order

1. Template/project/member/activity foundation tables. Implemented by `DEC-0027` as the first guarded slice; project lifecycle transitions, closure/cancellation/archive gates for active tasks/open blockers/open risks, project member add/remove controls, manage-members permission, lifecycle activity/audit history, project template draft/create, publish validation, archive, registry UI, published-template project creation snapshots, and starter task/checklist/milestone cloning are implemented. Reopen-after-closure policy and formal closure approval gates remain deferred.
2. Task, task-assignee, checklist, comment, attachment metadata link, and blocker tables. Implemented by `DEC-0028` as the second guarded slice; Work Boards, My Work, and task detail now expose optional blocker next-review dates backed by `ProjectBlocker.nextReviewAt`, and blocked-task resume/complete/cancel transitions close open blocker rows with project activity evidence. Task detail supports bounded reassignment to active project members with expected-version checks, reason-required guards for high-friction work, activity history, and scoped in-app notification. Task detail also supports manual open-blocker resolution or cancellation with required resolution notes and project activity evidence, without changing task status or linked ERP source records. Full drag/drop, dependency, reorder, advanced reassignment policy, accepted-risk closure semantics, and escalation workflow remain deferred under the broader concurrency/notification decisions. My Work exposes task checklist, comment, task detail/completion, and attachment metadata link actions backed by project activity events. Attachment metadata relinking is restricted to attachments already actively linked within the same authorized project to prevent cross-project UUID reuse. Binary upload/download, signed URL delivery, object-key exposure, and public file access remain deferred to the shared attachment service.
3. Milestone table and derived Work Calendar over authorized project/task/milestone dates. Implemented by `DEC-0029`; milestone status transitions now carry optimistic version checks, sanitized stale-update feedback, read-only UI states when the selected project cannot be mutated, and navigation visibility aligned to project-access permissions.
4. Task dependencies, richer activity/report projections, and risk escalation policies. Task status transitions now use optimistic version checks; first advisory project risk lifecycle is implemented by `DEC-0032`.
5. Source-record link table and first authorized safe-summary adapters. Implemented by `DEC-0030`.
6. Read-only project health dashboard over authorized project/task/milestone/link/activity records. Implemented as a project registry/dashboard slice.
7. Additional adapters for inventory ledger movements, inventory balances, approvals, wastage, and adjustments. Implemented by `DEC-0031` plus the inventory-balance adapter hardening slice; project links remain read-only summaries and do not mutate operational records.
8. Report/export projections. Project Health CSV, Project Task Register CSV, constrained Project Activity Log CSV, and Linked Record Follow-up CSV are implemented as narrow projections; task-register rows include server-derived overdue state, activity rows use curated summaries instead of raw payloads, and linked-record rows use existing source-summary adapters with restricted-source redaction.
9. Notification events/indexes and reports without queueing infrastructure. Create-time project task assignment, bounded reassignment, blocked-task, manually guarded task due-soon/overdue reminder scan, elevated-risk, and at-risk milestone in-app notifications are implemented with scoped recipients, project-config reminder defaults, minimal payloads, deterministic idempotency keys, and activity trace. Automated scheduler wiring, email, user preferences, and escalation cadence remain deferred.

## Release controls

No release until restricted-project isolation, source-record link privacy, audit activity, and no-mutation source-record tests pass. Mobile task completion and overdue logic have first authorized implementation slices and still need UAT on target branch devices.
