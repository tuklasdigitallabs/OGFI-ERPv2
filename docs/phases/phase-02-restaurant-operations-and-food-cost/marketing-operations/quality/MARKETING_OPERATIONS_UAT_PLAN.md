# Marketing Operations — UAT Plan

## UAT scenarios

1. Create campaign with brand, applicable branches, owner, assignees, start/end dates, and required status.
2. Verify users outside applicable scope cannot access campaign assets/comments/work items.
3. Create campaign tasks and use Kanban states; verify audit and My Work behavior.
4. Create promotion with explicit branches, date range, mechanics reference, and approvals.
5. Attempt to mark promotion Live without configured approvals/readiness; verify block/error.
6. Create date-only promotion calendar range; verify date display remains correct.
7. Create marketing calendar entries for campaign, creative due date, launch, branch opening, mall event, and holiday planning.
8. Filter calendar by brand, branch, user, campaign, status, channel, and date range.
9. Create new-item launch with linked readiness tasks; verify it cannot claim source R&D/POS/operations completion without authorized link/evidence.
10. Change campaign/promotion dates or branch scope; verify activity, reason, and re-approval behavior where configured.
11. Archive/cancel campaign; verify history/assets/comments are retained according to permissions.
12. Test concurrent board/date edits; verify stale changes do not silently overwrite.

## Release gates

- Calendar and board views honor permissions and branch scope.
- Promotion go-live safeguards pass.
- User assignment and ownership are unambiguous and auditable.
- Cross-functional links do not mutate controlled source records.
- No unresolved critical defect in permissions, calendar dates, approval/readiness, or activity history.
