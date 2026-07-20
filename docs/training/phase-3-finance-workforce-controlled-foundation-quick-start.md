# Phase 3 Finance And Workforce Controlled Foundation Quick Start

**Audience:** Finance users, branch cash custodians, workforce managers, approvers, administrators, auditors, and UAT testers  
**Duration:** 90 to 120 minutes for walkthrough; longer when running full UAT evidence capture  
**Prerequisites:** Scoped Phase 3 role permissions, assigned company/brand/location scope, demo or UAT source records, and Release Readiness access for evidence recording  
**Related knowledge-base articles:** Finance And Workforce Controls; Using Cash Advances And Liquidations; Reviewing Bank And Cash Readiness; Reviewing Workforce Readiness

## Learning objectives

By the end of this module, participants can:

- Explain which Phase 3 workflows are controlled foundations and which production blockers remain deferred.
- Navigate Finance Control Center, Bank & Cash, Budget Control, Cash Advances, Petty Cash, Period Close, and Workforce Operations.
- Create or review source-linked finance and workforce records without expecting AP settlement, bank mutation, payroll computation, or official journal posting unless that exact workflow supports it.
- Use approval inbox actions while respecting scope, role, and no-self-approval controls.
- Record UAT evidence in Release Readiness using the correct Phase 3 workflow-area values.
- Identify issue labels, evidence gaps, deferred blockers, and readiness items that must be reviewed before go-live.

## Demonstration flow

1. Open the Finance Control Center and identify the current company, brand, location, user role, and available subworkspaces.
2. Review Manual Journal, Accounts Payable, Payment Request, Payment Release, Budget Control, Bank & Cash, Cash Advances, Petty Cash, and Period Close cards or lists.
3. Create or open a controlled finance record, then submit it for approval where the workflow supports approval.
4. Log in as a different approver and verify the record appears in the approval inbox only when scope and permission allow it.
5. Approve, return, reject, cancel, reverse, or reopen one test record where the scenario allows, then verify audit history.
6. Open Bank & Cash and review issue labels for evidence gaps, unmatched statement lines, and reconciliation variance.
7. Open Workforce Operations and review employee, assignment, leave, overtime, schedule, attendance, training/compliance, report preview, and export areas.
8. Submit and approve one workforce request using separate requester and approver accounts.
9. Review workforce issue labels for schedule coverage gaps, attendance exceptions, duplicate rows, or clean rows.
10. Open `Admin > Release Readiness > UAT evidence` and record verified evidence under:
   - `Phase 3 finance controlled foundation`
   - `Phase 3 workforce controlled foundation`
   - `Phase 3 deferred blocker review`

## Practice exercise

Each participant should complete the exercises that match their role:

- Finance user: create or review one manual journal, AP invoice, payment request, bank/cash readiness row, budget line, cash advance, petty cash movement, or period-close item.
- Branch cash custodian: declare a branch cash deposit with evidence reference and confirm it appears in Bank & Cash readiness.
- Approver: approve or return one assigned finance or workforce decision and confirm self-approval is blocked.
- Workforce manager: create or update an employee, assignment, leave, overtime, schedule, or attendance-import review record.
- Auditor or administrator: export a scoped finance or workforce snapshot and verify the export keeps scope and redaction rules.
- UAT lead: record evidence in Release Readiness and confirm the Phase 3 readiness gates show missing, verified, or pending coverage accurately.

## Common errors and recovery

| Issue | Correct action |
| --- | --- |
| Approval is missing from inbox | Confirm the record was submitted, the approver is not the requester, and the approver has matching role and location scope. |
| A finance row shows an issue label | Open the source detail or report preview and resolve the evidence, match, variance, or close-readiness item in the proper workflow. |
| A workforce row shows a coverage or attendance issue | Review the schedule line, attendance import batch, exception list, or duplicate row before recording UAT pass evidence. |
| Evidence cannot be uploaded as a binary file | Use the configured evidence reference or metadata-link behavior. Binary upload/download is deferred until the attachment-service blocker is resolved or waived. |
| Payment release does not reduce AP or bank balances | This is expected in the controlled foundation. Settlement, bank API, supplier-ledger reduction, and official journal posting are deferred. |
| Cash advance cannot create a supplier-style payment request | This is expected until the employee/custodian payee handoff decision is approved. |
| Budget warning does not hard-block the source record | This is expected unless a specific hard-block rollout has been approved and proven by UAT. |
| UAT gate remains incomplete | Record verified `PASS`, `RETEST_PASS`, or approved disposition evidence under the required Phase 3 workflow-area dropdown value. |

## Completion check

- Participant can state the current Phase 3 boundary: controlled foundation first, production go-live later.
- Participant can find finance and workforce records within their authorized scope.
- Participant can complete one approval workflow with a separate approver.
- Participant can explain why payment release, AP settlement, bank mutation, payroll computation, and official journal posting do not happen silently.
- Participant can identify at least one deferred blocker and the UAT evidence needed to close or waive it.
- Participant can record Release Readiness evidence using the correct Phase 3 workflow area.

## Release limits to communicate

- Phase 3 controlled foundation supports review, UAT, approval routing, reporting, exports, audit, and readiness visibility.
- It does not complete production finance/accounting go-live by itself.
- Deferred blockers must be completed or formally waived with mitigation before production release representation.
- User-facing documentation explains implemented behavior only and does not replace finance, HR, legal, IT/security, or release-owner signoff.
