# Branch Expansion Calendar & Timeline UI Specification

## Views

- Month/week calendar
- Agenda list
- Milestone view
- Later timeline/Gantt view

## Calendar requirements

- Clear distinction between all-day/date-only and scheduled events.
- Filters: project, brand, proposed location, workstream, assigned user, contractor/supplier reference, status, milestone category, date range.
- Event cards show project, workstream, owner, status, milestone/type, dependency/impact indicator where applicable.
- Clicking event opens source project/work item, not a separate duplicate record.
- Date changes show validation/error feedback for dependencies or insufficient permission.

## Timeline requirements for later release

- Derived from authoritative tasks/milestones/dependencies.
- Show baseline vs current date only where those fields are approved.
- Clearly label schedule-risk logic as an indicator, not guaranteed critical-path analysis.
- No hidden data mutation from dragging timeline bars; updates must follow the same authorization/audit rules as work-item date changes.
