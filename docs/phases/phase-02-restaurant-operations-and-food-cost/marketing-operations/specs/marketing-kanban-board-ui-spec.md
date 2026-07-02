# Marketing Kanban Board UI Specification

## Boards

### Campaign / Promotion / Launch board

Default semantic stages:

- Idea Intake
- Briefing
- Planning
- For Approval
- In Production
- Ready for Launch
- Scheduled
- Live
- Monitoring
- Post-Campaign Review
- Completed / Cancelled

### Creative production board

- Brief Received
- Concepting
- For Review
- Revision Required
- Approved
- For Production
- Released
- Archived

State labels are template-configurable; reporting retains semantic categories.

## Card requirements

- Title and type
- Brand/branch scope chip
- Accountable owner and visible assignee indicator
- Due date/date range
- Status/approval/readiness indicator
- Priority/blocker indicator
- Checklist progress
- Attachment/comment/activity indicators
- Linked campaign/promotion/new-item tag where relevant

## Interaction controls

- Drag/drop requires authorization and server transition validation.
- Use stale-update protection; do not silently lose a concurrent change.
- Moving to `Live` must enforce configured promotion/campaign readiness checks.
- Mobile should prioritize list/task detail/quick actions, not only drag-and-drop.
