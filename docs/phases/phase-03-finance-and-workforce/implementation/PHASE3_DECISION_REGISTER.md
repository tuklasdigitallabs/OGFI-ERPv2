# Phase III — Decision Register

**Status:** Configurable baseline confirmed for planning and UAT

Record only decisions required to make this phase build-ready. Do not treat configurable defaults as hardcoded permanent policy.

| ID | Decision Needed | Default / Starting Assumption | Owner | Status | Decision Date |
|---|---|---|---|---|---|
| III-001 | Final scope and release boundary | Build the listed planned scope with conservative finance controls; defer non-essential features until validated | Product / Executive | Confirmed baseline by `DEC-0036` | 2026-07-07 |
| III-002 | Detailed approval matrix additions | Reuse core configurable approval engine with finance-specific segregation, evidence, amount/risk bands, and confidential-scope controls | Finance / Operations / HR / Projects as applicable | Confirmed baseline by `DEC-0036` | 2026-07-07 |
| III-003 | Reporting and dashboard priorities | Use role-specific dashboards and exportable source-record reports with confidential access controls | Management | Confirmed baseline by `DEC-0036` | 2026-07-07 |
| III-004 | Integration and migration needs | Integrate only reliable, reconciled source data; migrated opening balances require approval, reconciliation, and lock/signoff | IT / Data Owner | Confirmed baseline by `DEC-0036` | 2026-07-07 |
| III-005 | Go-live and UAT owners | Use Release Board signoff plus finance-owner/accountant validation, statutory/tax review where applicable, and UAT evidence | Executive / Project Lead | Confirmed baseline by `DEC-0036` | 2026-07-07 |
| III-006 | Finance/accounting system-of-record direction | `DEC-0006` confirms OGFI ERP as the official accounting system of record | Executive / Finance | Confirmed | |
| III-007 | Finance/accounting implementation controls | Conservative configurable defaults are confirmed by `DEC-0036`; production finance behavior still requires finance-owner/accountant validation, posting rules, period controls, reconciliation ownership, cutover/opening balances, tax/statutory validation, UAT evidence, and go-live controls | Finance / IT / Executive | Confirmed baseline by `DEC-0036`; production validation required | 2026-07-07 |
| III-008 | Workforce assignment and transfer implementation boundary | Implement scoped assignment maintenance as a controlled non-payroll foundation with reason/evidence and audit; keep full transfer request approval routing as pending UAT/policy work | HR / Operations | Confirmed foundation boundary; full transfer approval workflow pending | 2026-07-08 |
| III-009 | Employee/custodian cash-advance payee and payment handoff architecture | Use a generic payee registry plus controlled source-linked non-supplier disbursement request. Do not reuse supplier-only AP payment requests for employee or custodian advances. The implemented foundation creates draft disbursement handoffs only; payment release, settlement, bank mutation, journal posting, and production signoff remain gated by `P3-BLOCK-001`. See `PHASE3_PAYEE_PAYMENT_HANDOFF_DECISION_BRIEF.md`. | Finance / HR / Operations / IT | Foundation implemented by user-approved best-practice direction; production release/settlement still deferred for UAT | 2026-07-08 |
