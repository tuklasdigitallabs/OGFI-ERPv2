# Phase III UAT Scenarios

**Status:** Controlled-foundation UAT pack

Use `PHASE3_CONTROLLED_FOUNDATION_ACCEPTANCE_MATRIX.md` as the scope source for foundation acceptance. Use `FINANCE_ACCOUNTING_UAT_PLAN.md` only for official-accounting production release scenarios. A foundation pass does not remove deferred go-live blockers unless the blocker is completed or formally waived with mitigation.

## Readiness Recording Rule

Record UAT proof in `Admin > Release Readiness > UAT evidence`.

Use these workflow-area dropdown values so readiness gates can verify coverage:

- `Phase 3 finance controlled foundation`
- `Phase 3 workforce controlled foundation`
- `Phase 3 deferred blocker review`

Phase 3 readiness gates require verified UAT evidence. Recorded but unverified evidence, failed results, and blocked results do not unlock the gate.

## Required UAT Coverage

- Happy-path transaction execution.
- Rejection, return-for-revision, cancellation, reversal, reopen, and waiver paths where applicable.
- Role, company, brand, location, department, and project access boundaries.
- Approval routing, no-self-approval, delegation, escalation, and overdue behavior.
- Evidence reference and metadata-link behavior. Binary upload/download is not production-ready until `P3-BLOCK-002` is completed or formally waived.
- Audit log completeness for create, submit, approve, reject, return, cancel, post, issue, liquidate, close, reopen, archive evidence, export, and permissioned setup actions.
- Export and reporting reconciliation.
- Desktop, tablet, and mobile execution where relevant.
- Duplicate-submission, network-retry, and concurrent-update protection.
- Explicit proof that controlled foundation workflows do not silently mutate AP settlement, payment settlement, bank balances, journals, payroll, attendance-device authority, or source ERP records outside their approved workflow.

## Scenario Format

Each scenario record must capture:

- Scenario ID and workflow area.
- Tester, role, user account, and location context.
- Device/browser and environment.
- Source records used before the action.
- Expected status transition and actual status transition.
- Evidence reference, screenshot pack, or test log reference.
- Audit event proof.
- Result: `PASS`, `FAIL`, `BLOCKED`, `WAIVED`, or `RETEST_PASS`.
- Defect or waiver reference when the result is not a clean pass.
- Owner signoff and date.

## Finance Controlled Foundation Scenarios

| ID | Workflow | Minimum UAT steps | Must prove | Readiness evidence |
| --- | --- | --- | --- | --- |
| P3-UAT-GL-001 | Manual journal | Create balanced draft, submit, approve by another user, post, reverse | Balanced-entry validation, open-period guard, no-self-approval, immutable posted journal, reversal link, audit | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` with workflow area `Phase 3 finance controlled foundation` |
| P3-UAT-AP-001 | AP invoice | Capture multi-line supplier invoice against PO/receiving evidence, submit for match, attempt duplicate | Multi-line validation, PHP-only, duplicate-risk control, match status, no PO/receiving/inventory mutation | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-AP-002 | Supplier credit | Record credit note, submit for application review, cancel one draft | Source AP invoice link, reason/evidence, audit, no AP settlement or supplier-ledger mutation | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-PAY-001 | Payment request/release | Prepare same-supplier multi-invoice request, approve, create offline release, approve release | Same-supplier guard, outstanding guard, release control, method evidence reference, no bank/API/AP settlement/journal mutation | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-BNK-001 | Bank/cash | Declare branch deposit, import statement, match allowed source, create unresolved exception | Scoped account, variance handling, exception state, audit, no bank API or journal posting | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-BUD-001 | Budget | Create budget, request revision, approve revision, allocate PR/PO/AP line, test over-budget warning | Scoped budget line, allocation inheritance, warning/override metadata, no hard-block rollout unless approved | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-EXP-001 | Expense request | Create, submit, approve, complete, hand off to AP draft, retry duplicate handoff | Budget visibility, evidence reference, source lineage, duplicate prevention, no payment/bank/journal mutation | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-CA-001 | Cash advance | Request, approve, issue offline, liquidate multi-line, close, reverse one movement where allowed | Employee/custodian exposure visibility, liquidation lines, reason/evidence, no payment/bank/journal mutation | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-PC-001 | Petty cash | Setup fund, request/approve/fulfill, liquidate multi-line, record shortage/overage, void/reverse | Fund custody, low-balance state, ledger markers, variance reason/evidence, no AP/payment/bank/journal mutation | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-PRD-001 | Period close | Recalculate readiness, resolve/waive checklist, complete soft close, hard-lock, route reopen | Checklist/blocker state, sensitive-action approval, audit, no AP/payment/bank/source mutation | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-RPT-001 | Finance reports/export | Export finance control center, bank/cash, readiness register, and checksum where available | Permission gates, scope filters, export audit, checksum where configured, read-only behavior | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |

## Workforce Controlled Foundation Scenarios

| ID | Workflow | Minimum UAT steps | Must prove | Readiness evidence |
| --- | --- | --- | --- | --- |
| P3-UAT-WF-001 | Employee records | Create employee, update confidential and non-confidential fields, view as restricted user | Scoped access, privacy redaction, audit, no ERP user provisioning | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` with workflow area `Phase 3 workforce controlled foundation` |
| P3-UAT-WF-002 | Assignments | Create active primary assignment, attempt conflicting primary assignment, end assignment | Location authorization, effective date guard, duplicate/conflict prevention, audit | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-WF-003 | Leave | Submit leave, approve/return/reject by approver, attempt self-approval | Approval instance, no-self-approval, status accuracy, no payroll/payment/journal mutation | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-WF-004 | Overtime | Submit overtime, approve/reject by approver, test invalid transition | Approval instance, no-self-approval, no payroll computation/export/payment mutation | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-WF-005 | Schedule | Submit schedule, approve/return/reject, publish with coverage-gap waiver where allowed | Approval instance, coverage warning/waiver, publish separation, no payroll/device mutation | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-WF-006 | Attendance import | Import/review attendance batch, route exception decision, approve/reject exception list | Exception approval, no-self-review, no payroll or attendance-device source-of-truth mutation | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-WF-007 | Training/compliance | Record training and compliance-document readiness reference | Evidence metadata, privacy visibility, retention blocker reference when binary document storage is needed | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |
| P3-UAT-WF-008 | Workforce export | Export workforce operations snapshot as manager and restricted user | Permission gates, privacy redaction, scope filters, export audit, read-only behavior | `SCENARIO_EXECUTION` and `ACCEPTANCE_MATRIX` |

## Deferred Blocker Review Scenarios

| ID | Blocker area | Minimum UAT review | Required disposition evidence |
| --- | --- | --- | --- |
| P3-UAT-BLK-001 | Cash advance payee/payment handoff | Review whether employee/custodian advances need separate payee architecture before payment handoff | `DEFECT_DISPOSITION` and `DEFAULT_REVISION_REGISTER` with workflow area `Phase 3 deferred blocker review` |
| P3-UAT-BLK-002 | Binary evidence upload/download | Review storage provider, retention, malware scanning, retrieval authorization, download audit, and recovery process | `DEFECT_DISPOSITION` and `DEFAULT_REVISION_REGISTER` |
| P3-UAT-BLK-003 | Budget source hooks and hard blocks | Review source-transition hooks, backfill, warning versus hard-block policy, and override approval | `DEFECT_DISPOSITION` and `DEFAULT_REVISION_REGISTER` |
| P3-UAT-BLK-004 | Supplier credits/AP settlement | Review credit application, reversal path, supplier reconciliation, and accounting treatment | `DEFECT_DISPOSITION` and `DEFAULT_REVISION_REGISTER` |
| P3-UAT-BLK-005 | Payment release settlement | Review payment method evidence, settlement policy, AP closeout, reversal/recovery, and bank-to-ledger proof | `DEFECT_DISPOSITION` and `DEFAULT_REVISION_REGISTER` |
| P3-UAT-BLK-006 | Bank/cash close exceptions | Review unmatched, partially matched, waived, resolved, reopened, and relocked close scenarios | `DEFECT_DISPOSITION` and `DEFAULT_REVISION_REGISTER` |
| P3-UAT-BLK-007 | Workforce transfer and document retention | Review transfer lifecycle, source/destination approval, effective-date conflict handling, and document retention/access rules | `DEFECT_DISPOSITION` and `DEFAULT_REVISION_REGISTER` |

## Required Sign-Off Roles

- Business owner for the phase.
- Finance or accounting owner for finance-impact workflows.
- Operations or branch representative for operational workflows.
- HR or workforce owner for employee/workforce workflows.
- IT/security owner for access, evidence, and deployment controls.
- QA lead or product owner for UAT result disposition.
- Executive sponsor or delegated release authority for GO/NO-GO.

## Exit Rule

Critical defects must be resolved. High-severity defects require an approved workaround and explicit release acceptance. No unresolved defect may compromise data integrity, company/brand/location/project scope, approvals, inventory, payment, legal documents, employee privacy, audit trails, or rollback/reversal controls.

Phase 3 can be marked controlled-foundation UAT-ready only when the Release Readiness UAT evidence register has verified records for finance foundation coverage, workforce foundation coverage, and deferred blocker review. Phase 3 cannot be represented as production release-ready while any linked deferred blocker remains unresolved or unwaived.
