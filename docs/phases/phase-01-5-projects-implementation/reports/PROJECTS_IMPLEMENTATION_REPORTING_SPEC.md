# Projects & Implementation Reporting Specification

## Dashboard widgets

- My Tasks due today / overdue / blocked
- Projects at risk
- Milestones due soon
- Blocked tasks by blocker type
- Overdue tasks by owner and project
- Recent project activity
- Task completion trend (only when enough reliable data exists)

## Report constraints

All reports enforce project visibility and source-record authorization. A report may show that a linked record exists without revealing its confidential details if the user lacks permission.

## Export behavior

Exports include filter summary, generated-at timestamp, timezone, requesting user, and row count. Exports must log activity where configured.

Current implementation note: enabled CSV exports are Project Health at portfolio
grain, Project Task Register at task grain, a constrained Project Activity
Log at activity-event grain, and Linked Record Follow-up at project-link grain.
Project Health exports only
authorized project health fields and linked-record counts, never source-record
IDs, source-record types, operational values, attachments, blocker text, or task
assignee lists. Project Task Register exports authorized task metadata only:
project code/name, task key/title, status, priority, owner display name, due
date, due state, overdue days, completion timestamp, blocked flag, checklist
counts, comment count, attachment count, open blocker count, and earliest open
blocker next-review timestamp. Project Activity
Log exports project code/name, UTC/company-time occurrence, actor display name,
canonical event/entity labels, entity category, curated change summary, and
reason code only. It does not export UUIDs, task descriptions, raw reasons,
before/after JSON, metadata JSON, comment bodies, attachment IDs/object
keys/URLs, source-record IDs/types, blocker reasons, operational payloads, or
linked-record details. Linked Record Follow-up exports authorized project/task
or milestone context, link label/relation, and the existing safe source summary
only when the requesting user can view the source record. Restricted linked
records show only that a linked record exists; source UUIDs, raw payloads,
operational values, attachment locations, and unauthorized source details are
not exported. Export routes log denied, started, and completed audit events and
apply a per-user rate limit.
