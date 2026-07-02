# Project Board UI Specification

## Desktop behavior

- Header: project title, status, scope chips, members, health summary, actions.
- Columns: project-configured task statuses; board may be horizontal-scrollable.
- Card: title, priority, due-date state, owner/assignee avatars/initials, checklist progress, blocker label, linked-record indicator.
- Drag-and-drop uses the same controlled task transition as keyboard/menu status change.
- Column action menu supports task creation only when user has permission.

## Accessibility

All cards can be opened, moved through status controls, and reordered without drag-and-drop. Do not rely on color alone for urgency.

## Mobile

Do not require board interaction. Use filtered task list with status selector and task detail actions.
