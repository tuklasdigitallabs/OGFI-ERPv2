# OGFI ERP Release Notes — Overview approval unavailable state

**Release date:** July 26, 2026

**Audience:** Approvers, managers, Operations, Purchasing, Finance, and administrators

**Affected locations / roles:** Users with approval access while normalized approval routing remains disabled

## What Changed

- Overview now shows a truthful non-actionable state when both the approval preview and Approval Inbox queue are unavailable.
- Misleading `Open approvals`, `Open Approval Inbox`, and generic approval-source links are not shown in that unavailable state.
- The message explains that pending approval work may still exist. If available to the user’s role, `Scan Approvals` in Notifications can create current-user reminders only for that user’s eligible due or overdue work; it is not a complete queue and its approval links remain unavailable until controlled Inbox activation.

## What You Need To Do

- Do not interpret the unavailable state or an empty reminder scan as confirmation that no approval work is pending.
- Follow the workflow owner’s release guidance until the Approval Inbox is activated.

## Important Notes

- This correction does not enable normalized routing, create a legacy queue, send role-member step-ready notifications, or change who may approve.
- Approval permissions, live role and scope checks, self-approval restrictions, and source-workflow controls remain unchanged.
- This note does not declare Overview, Approval Inbox, Workspace 1, or Phase I production-ready.

## Learn More

- [Understanding The Dashboard, My Tasks, And Notifications](../knowledge-base/getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)
- [Why Can't I Approve This Request?](../knowledge-base/troubleshooting/why-cant-i-approve-this-request.md)

## Support

Report an unexpected approval state through the normal OGFI ERP support channel and include the selected company, location, record reference when known, and the exact unavailable message shown.
