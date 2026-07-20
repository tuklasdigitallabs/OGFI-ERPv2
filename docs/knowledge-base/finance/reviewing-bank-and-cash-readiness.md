# Reviewing Bank And Cash Readiness

**Audience / required role:** Finance users, branch cash-deposit users, reconciliation reviewers, and managers with scoped finance access  
**Applies to:** Current company, brand, location, bank account, branch cash deposit, bank statement, and reconciliation scope  
**Related phase/module:** Phase 3 / Bank & Cash  
**Last verified against:** implemented branch cash deposit declaration, bank/cash read model, reconciliation readiness report preview, CSV export, evidence metadata, and non-posting controls

## Purpose

Use Bank & Cash to review deposit evidence, imported statement lines, reconciliation batches, and account readiness issues. The current workflow is a controlled foundation. It helps users see what needs follow-up before close or UAT signoff, but it does not post bank transactions, settle AP, create journals, or call a bank API.

## Prerequisites

- Your role must include Bank & Cash or finance reconciliation view access.
- Your ERP header must show the correct company, brand, and location.
- Bank accounts must be configured for the selected scope.
- Branch cash deposit declarations, statement lines, or reconciliation batches must exist before the preview shows activity.
- Evidence references or evidence metadata links should be prepared for deposit and reconciliation support.

## Navigation Path

`Finance` → `Bank & Cash`

## Steps

1. Open `Finance` → `Bank & Cash`.
2. Read the workspace guardrail. The workspace is for reconciliation readiness and does not post bank, payment, AP, or journal entries.
3. If you are a branch cash-deposit user, use `Declare Branch Cash Deposit` to record submitted cash deposit evidence against an active scoped PHP bank account.
4. In `Bank & Cash Report Preview`, review each bank account row.
5. Check `Readiness`.
6. Review the issue list under the readiness badge. Possible issues include deposit evidence gaps, unmatched statement lines, and reconciliation variance.
7. Review deposit count and deposit value.
8. Review statement-line count and unmatched count.
9. Review reconciliation batch count and variance.
10. Open or export the detailed rows when a reviewer needs the evidence pack.
11. Add evidence metadata links where allowed, but keep the actual binary evidence in the approved evidence repository until production upload/download controls are implemented.

## Expected Result

- `READY` means the account has activity and no readiness issue is currently flagged by the preview.
- `NEEDS REVIEW` means one or more issue categories require follow-up.
- `NO ACTIVITY` means no deposit, statement, or reconciliation activity exists for the account in the current view.
- CSV exports include the same readiness state and issue summary for audit/review.
- Export activity is logged.

## Important Controls And Warnings

- Bank & Cash rows are scoped by company, brand, location, and bank account permissions.
- The readiness issue list is a review aid, not an automatic correction.
- Declaring a branch cash deposit records intake/evidence only. It does not update bank balances.
- Reconciliation readiness does not release payments, settle supplier AP, create official journal entries, close an accounting period, or mutate source records.
- Evidence metadata links do not upload binary files yet. Production binary upload, download, scanning, retention, and download audit remain deferred by `P3-BLOCK-002`.
- Production close exception signoff and broader reconciliation UAT remain tracked by `P3-BLOCK-006`.

## Related Records Or Next Action

- Follow up missing deposit evidence with the branch depositor or finance reviewer.
- Follow up unmatched statement lines in the reconciliation workflow.
- Use Period Close readiness when bank/cash exceptions affect close review.
- Use Release Readiness UAT evidence when proving Phase 3 bank/cash scenarios.

## Related Articles

- Using Cash Advances And Liquidations
- Managing Release Readiness Gates
- How to export a report
- Understanding statuses, audit history, and attachments
