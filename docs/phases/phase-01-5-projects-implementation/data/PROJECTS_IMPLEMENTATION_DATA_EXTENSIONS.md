# Projects & Implementation Tracker — Data Extensions

## Data ownership

This document extends the core data dictionary for Phase 1.5. Project records are company-scoped and tenant-aware. They do not own the controlled lifecycle data of linked ERP source records.

## Core entities

### `project_templates`

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID/ULID | Yes | Primary key. |
| tenant_id | UUID/ULID | Yes | Tenant boundary. |
| company_id | UUID/ULID | Yes | Owning company. |
| code | String | Yes | Unique per company. |
| name | String | Yes | Template name. |
| project_type | Enum/String | Yes | Controlled category. |
| status | Draft/Published/Archived | Yes | Template lifecycle. |
| is_restricted_default | Boolean | Yes | Default visibility behavior. |
| config_json | JSON | Yes | Versioned default statuses, reminders, and allowed options. |
| created_by / updated_by | User ID | Yes | Audit actor. |

### `projects`

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID/ULID | Yes | Primary key. |
| tenant_id / company_id | UUID/ULID | Yes | Scope boundary. |
| template_id | UUID/ULID | No | Source template snapshot reference. |
| code | String | Yes | Human-readable project number. |
| name | String | Yes | Project title. |
| status | Enum | Yes | Draft, Active, On Hold, Completed, Cancelled, Archived. |
| project_type | String | Yes | Template/type classification. |
| brand_id / location_id / department_id / cost_center_id | UUID/ULID | No | Optional applicable scope. |
| sponsor_user_id / manager_user_id | User ID | Yes | Ownership. |
| is_restricted | Boolean | Yes | Project visibility control. |
| start_at / target_end_at / actual_end_at | Timestamp | No | Date tracking. |
| description | Text | No | Business context. |
| archived_at | Timestamp | No | Soft archive. |

### `project_members`

Stores project membership and project role. Unique on `(project_id, user_id)`.

### `project_tasks`

| Field | Type | Required | Notes |
|---|---|---:|---|
| id / project_id | UUID/ULID | Yes | Task identity/scope. |
| task_key | String | Yes | Human-readable key unique per project. |
| title | String | Yes | Task title. |
| description | Text | No | Context. |
| status_key | String | Yes | Project-configured status. |
| priority | Enum | Yes | Low, Normal, High, Critical. |
| owner_user_id | User ID | No | Accountable owner. |
| start_at / due_at / completed_at | Timestamp | No | Time tracking. |
| is_blocked | Boolean | Yes | Derived/validated with status. |
| completion_note | Text | No | Optional evidence note. |
| created_by / updated_by | User ID | Yes | Actor tracking. |
| archived_at | Timestamp | No | Soft archive. |

### Supporting entities

- `project_task_assignees`: multi-assignee table.
- `project_task_checklist_items`: ordered task checklist, completion actor/time.
- `project_attachments`: project-scoped links from a task/comment to shared `attachments` metadata. Stores tenant/company/project scope, exactly one parent, purpose, caption, archive actor/time/reason, and activity-backed lifecycle. It does not store file bytes, object keys, public URLs, or operational source-record payloads.
- `project_task_dependencies`: informational dependency links; Phase 1.5 does not calculate critical path.
- `project_milestones`: title, target date, status, owner, at-risk flag.
- `project_risks`: implemented advisory project risk lifecycle with severity, likelihood, impact, mitigation, owner, target date, resolution state, and activity history.
- `project_blockers`: reason, type, owner, severity, reported/resolved timestamps.
- `project_comments`: author, content, visibility, edit history policy.
- `project_record_links`: source_record_type, source_record_id, link_label, relation_type, created_by. Implemented source types are purchase request, purchase order, goods receipt, inventory transfer, supplier, inventory movement, inventory balance, approval instance, wastage report, and stock adjustment. No copied confidential source data.
- `project_activity_events`: append-oriented audit/activity event stream.

## Required constraints

- Every project-owned entity has `tenant_id` and `company_id` through direct fields or enforced parent relation/query scope.
- Restrict project/task records by project membership and scope during query, not only after retrieval.
- Project templates are company-scoped configuration records; publishing validates that active, completed, and cancelled outcomes are represented. Published template edits affect future projects only.
- Template application clones configured starter tasks, checklist items, and milestones into project-owned records during project creation. Cloned records are project tracker records only and do not create or mutate controlled ERP source records.
- A source-record link must not include confidential payload snapshots; resolve summaries through source authorization at read time.
- All status transitions create activity events in the same transaction as the state update.
- Project member add/remove actions use active/inactive status instead of hard delete and create project activity events.
- Checklist item creation/completion/reopen and task comments create project activity events in the same transaction as the task-supporting write.
- Project risk creation and status transitions create project activity events in the same transaction as the risk write and never mutate operational source records.
- Soft-deleted/archived records are excluded from normal views but preserved for audit and authorized reports.
