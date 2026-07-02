# Projects & Implementation Workflow

## Purpose

Define the lifecycle of a project from template selection to archive.

## Preconditions

- Project creator has Project Manager or Project Administrator permission in the selected company scope.
- Required brand/location/department context is available where the template requires it.

## Workflow

1. **Create draft project**
   - Select company and project type/template.
   - Enter project name, description, sponsor, Project Manager, and required scope.
   - Choose restricted visibility if applicable.
2. **Apply template**
   - System creates default board statuses, task groups, milestones, default checklists, roles, and notification defaults.
   - Template values are copied into project-specific configuration so later template edits do not silently rewrite active projects.
3. **Configure members and dates**
   - Add Project Manager, contributors, viewers, and sponsors.
   - Set project start/target dates and initial milestone dates.
4. **Activate project**
   - Project becomes Active once minimum required fields and members are set.
   - Activity event records activation.
5. **Execute and monitor**
   - Contributors update tasks, comments, evidence, risks, blockers, and milestones.
   - Project Manager reviews health, overdue work, blocked tasks, and escalation notices.
6. **Close project**
   - Project Manager requests closure when required work is complete/cancelled and blockers/risk actions are resolved or accepted.
   - If configured, project gate approval is completed through named approvers.
   - Project is marked Completed or Cancelled and later Archived according to policy.

## Statuses

Draft, Active, On Hold, Completed, Cancelled, Archived.

## Exceptions

- A project cannot be archived while active tasks remain unless an authorized closure process records an exception.
- Restricting or unrestricting a project requires elevated permission, a reason, and activity logging.
- Project closure does not close linked Purchase Orders, approvals, or inventory records.

## Current Implementation Note

The implemented lifecycle slice supports Draft to Active, Active to On Hold,
On Hold to Active, Active to Completed, Active/On Hold to Cancelled, and
Completed/Cancelled to Archived through service-layer transitions. Hold, cancel,
and archive require a reason. Completion, cancellation, and archive are blocked while active
tasks, open blockers, or open/mitigating/realized risks remain. Transitions use
optimistic version checks, write project activity and audit events, and do not
mutate linked ERP source records. Reopen after cancellation/completion and formal
project gate approvals remain future policy decisions.
