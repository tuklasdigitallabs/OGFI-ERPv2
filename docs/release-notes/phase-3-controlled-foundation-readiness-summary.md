# OGFI ERP Release Notes — Phase 3 Controlled Foundation Readiness Summary

**Release date:** Pending UAT execution and owner signoff  
**Audience:** Finance users, branch cash custodians, approvers, workforce managers, administrators, auditors, and implementation leads  
**Affected locations / roles:** Users with scoped finance, budget, bank/cash, payment, workforce, approval, reporting, export, or Release Readiness access

## What changed

- Finance Control Center now provides controlled-foundation visibility for General Ledger, Accounts Payable, Bank & Cash, Budget Control, Payment Requests, Payment Release, Cash Advances, Petty Cash, Expense Requests, and Period Close readiness.
- Manual journal workflows support draft, submit, approval, posting, and reversal controls for scoped PHP accounting periods, with balanced-line validation, no-self-approval, idempotency, audit history, and open-period checks.
- AP invoice workflows support supplier invoice capture, three-way match evaluation, variance holds, duplicate-risk checks, supplier credit-note registration, payment-request preparation, approval routing, and aging/supplier-ledger preview.
- Payment request and payment release foundations support controlled approval and offline release evidence tracking, but do not settle AP balances, call bank APIs, or post official journals.
- Bank & Cash readiness supports branch cash deposit declarations, bank statement intake, reconciliation-readiness rows, unmatched/variance issue labels, scoped exports, and close-exception visibility.
- Budget Control supports budget lifecycle actions, warning-first commitment projections, allocation visibility on supported source lines, and threshold policy visibility. Hard-block rollout remains gated by UAT.
- Cash Advance and Petty Cash workflows support request, approval, custody, issue/liquidation/readiness markers, reason/evidence references, and audit controls without bank, AP settlement, or official journal mutation.
- Workforce Operations now supports employee records, effective-dated assignments, leave, overtime, schedules, attendance import review, privacy redaction, approval inbox integration, report previews, issue labels, and scoped exports.
- Release Readiness now includes explicit UAT gates for `Phase 3 finance controlled foundation`, `Phase 3 workforce controlled foundation`, and `Phase 3 deferred blocker review`.
- Repeatable Phase 3 evidence commands now report controlled-foundation wiring and exact UAT workflow-area coverage: `pnpm release:phase3-status` and `pnpm release:phase3-uat-status`.
- Knowledge-base and training content is available for Phase 3 finance/workforce controlled-foundation review.

## What you need to do

- Use `Admin > Release Readiness > UAT evidence` to record verified Phase 3 UAT proof under the correct workflow-area dropdown value.
- Run finance UAT using manual journal, AP invoice, supplier credit, payment request/release, bank/cash, budget, expense, cash advance, petty cash, period close, and export scenarios.
- Run workforce UAT using employee, assignment, leave, overtime, schedule, attendance import, training/compliance readiness, and export scenarios.
- Review the deferred blocker register with finance, operations, workforce, IT/security, and release owners before representing Phase 3 as production release-ready.
- Use issue labels in Bank & Cash and Workforce previews to focus review on evidence gaps, unmatched statement lines, reconciliation variance, schedule coverage gaps, attendance exceptions, and duplicate rows.
- Run `pnpm release:phase3-uat-status` after exporting the Release Readiness register so missing Phase 3 finance, workforce, or deferred-blocker evidence is visible before GO / NO-GO review.
- Use controlled evidence uploads on supported records, wait for `Available` before download, and keep separate evidence references accurate where the workflow still requests them.

## Important notes

- This release note describes a controlled foundation for demo, UAT, and controlled operational review. It is not production go-live approval.
- Phase 3 does not make the ERP the official accounting book of record until finance owners complete production UAT, close deferred blockers or approve mitigations, and sign off release readiness.
- Payment release control does not settle AP, reduce supplier balances, post journals, mutate bank balances, or call bank APIs.
- Cash advance payment handoff for employee/custodian advances remains blocked by `P3-BLOCK-001 / III-009` until a safe payee/payment architecture is approved.
- Controlled binary upload, fail-closed safety states, authorized download, archive preservation, retention metadata, and legal-hold placement are implemented in the current build. `P3-BLOCK-002` remains open for hosted activation evidence, UAT, and owner signoff; this is not production go-live approval.
- Budget hard blocks, supplier credit application, AP settlement, production bank/cash close exception resolution, full workforce transfer routing, and document retention remain deferred production blockers until UAT resolves or formally waives them.

## Learn more

- `docs/phases/phase-03-finance-and-workforce/quality/PHASE3_UAT_SCENARIOS.md`
- `docs/core/07-quality/PHASE3_DEFERRED_GO_LIVE_BLOCKERS_FOR_UAT.md`
- `docs/knowledge-base/finance/README.md`
- `docs/knowledge-base/troubleshooting/how-to-attach-supporting-documents-or-photo-evidence.md`
- `docs/training/phase-3-finance-workforce-controlled-foundation-quick-start.md`

## Support

Raise Phase 3 UAT defects, blocker-review outcomes, permission gaps, training gaps, or release concerns through the ERP implementation owner and the Release Readiness evidence register.
