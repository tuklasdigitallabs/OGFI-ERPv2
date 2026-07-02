# Task Detail UI Specification

## Required content

- Project breadcrumb and scope
- Task title, status, priority, owner, assignees, dates
- Description and checklist
- Blocker/risk state
- Linked ERP records with permission-checked summaries
- Attachments and comments
- Activity/audit timeline
- Contextual primary action based on task state and permission

## Action rules

- `Mark blocked` opens required-reason form.
- `Complete` records user/time and may require completion note/evidence by template.
- `Request review` requires reviewer selection where applicable.
- `Reopen` and `Cancel` require reason and authorized permission.
- Linked record actions deep-link to source module only if user has source permission.
