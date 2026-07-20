# DEC-0036 — Industry-Standard Configurable Pilot Defaults

- **Status:** Confirmed product and control decision
- **Date:** 2026-07-07
- **Decision owner:** OGFI ERP Product Governance
- **Decision Chair:** Codex parent agent
- **Related phase/module:** Cross-phase policy defaults for pilot, UAT, and configurable baseline setup
- **Related decision brief:** User confirmation to resolve current open decisions using recommended F&B industry-standard practice, then revise after actual testing findings

## Decision

OGFI ERP will resolve the current open policy decisions by using conservative F&B/restaurant industry-standard defaults as configurable pilot policy. These defaults may be seeded, displayed, tested, and enforced where controls require enforcement, but they must remain configurable and revisable after UAT and pilot findings.

The selected baseline is a combined:

- **Control-first operational policy** for procurement, inventory, suppliers, stock counts, evidence, and emergency exceptions.
- **Privilege guardrail security policy** for sensitive roles, broad scopes, sessions, MFA, retention, audit, and backups.
- **Source-of-truth and trust-gated reporting policy** for dashboards, exports, POS/import data, cancellation subtype reporting, and food-cost analytics.
- **Release readiness governance pack** for UAT ownership, go/no-go authority, backup/restore evidence, training signoff, and post-finding revision.

## Context

The project had several intentionally open decisions so development could proceed with configurable defaults rather than permanent hardcoded business policy. The user confirmed that the defaults should be resolved now using best-practice industry standards, with the expectation that real testing findings may update them later.

## Confirmed Defaults

### Procurement And Purchasing

- Financial approval bands default to `<= PHP 10,000`, `PHP 10,001-50,000`, `PHP 50,001-200,000`, and `> PHP 200,000`.
- Approval routes are configured by company, brand, location, department/cost center, transaction type, amount band, urgency, and budget state.
- Direct branch buying is not a normal path. It is allowed only through an emergency purchase workflow or explicit configured exception.
- Emergency purchases require reason, evidence, receiving proof where applicable, post-review, and a configurable cap/SLA.
- RFQ or quotation comparison is required above a configurable amount or for non-contracted suppliers.
- Blocked suppliers are hard-stopped. Non-approved suppliers require a controlled emergency override and post-review.
- Supplier accreditation defaults to `PENDING_REVIEW`, `APPROVED`, `SUSPENDED`, and `BLOCKED` states with reason, evidence, review date, and audit history.

### Inventory, Counts, Lot/Expiry, Wastage, And Adjustments

- Low-stock replenishment checks assigned warehouse availability before external purchase.
- If warehouse stock is available, the default path is a transfer request. If warehouse stock is unavailable, the default path is a purchase request.
- High-risk and perishable inventory count cadence defaults to weekly. General inventory count cadence defaults to monthly. Both are configurable by item/category/location.
- Lot and expiry tracking are required by default for regulated, perishable, high-risk, batch-sensitive, and food-safety-critical items. The requirement is configurable by item/category.
- Inventory stock changes remain ledger-driven. Balances must reconcile to posted immutable inventory movements.
- Opening balances are handled through controlled opening-balance adjustments with cutover date, evidence, approval, reconciliation, and lock/signoff.
- Backdated wastage, backdated adjustments, period-closed corrections, reclassification, and valuation/GL impacts require explicit permission, reason, evidence, audit, and period policy.
- Wastage and adjustment reversals use equal opposite movements, reason, audit, and separate permission; high-value reversals require escalation.

### Security, Roles, Scope, And Sessions

- Sensitive roles use a sensitivity catalog and cannot be granted casually through ordinary role assignment.
- Sensitive/admin/approver role grants require reason, audit, no self-assignment, and dual approval by default.
- High-risk scopes include company-wide, all-brand, Head Office, main warehouse, commissary, and any cross-location management scope. These require reason, audit, no self-grant, and dual approval by default.
- Role/scope/deactivation changes immediately revoke or rotate active sessions for the affected user. The user must re-authenticate before the next sensitive action.
- MFA is mandatory by default for privileged roles and privileged actions.
- Break-glass access requires expiry, reason, audit, and post-review.
- Audit events are append-only and must capture actor, target, scope, action, before/after safe summary where applicable, reason, source request ID, and decision reference where applicable.
- Data retention uses a tenant/company retention matrix. Audit/security/financial-control records use longer retention; operational working records use configured retention; PII is minimized and redacted from logs/exports where not needed.
- Backups default to daily encrypted database backup, offsite copy, checksum verification, and quarterly isolated restore rehearsal. Pre-release backup and restore evidence are mandatory before production go-live.

### Reporting, Dashboards, Exports, And Integrations

- Dashboards and reports read from authoritative source records, statuses, audit events, and ledger entries. They must not mutate source records.
- Dashboards are role-specific by default for executive/GM, operations, purchasing, warehouse, branch manager, storekeeper, finance, and admin users.
- Reports and exports preserve scope, filters, and user permissions.
- CSV is the baseline export format. XLSX/PDF may be enabled only where explicitly configured or required by a document/report.
- Every export started, completed, denied, or failed event must write audit history.
- PO cancellation reporting uses a derived cancellation subtype, not status alone. Default subtypes are `approval_rejected`, `pre_receiving_cancellation`, `remaining_balance_closure`, and `unknown_unclassified`.
- Restaurant Operations reporting defaults include food cost by branch/menu, theoretical versus actual cost, recipe cost change impact, open incidents, maintenance SLA/downtime, and food-safety compliance exceptions.
- POS/imported sales data is trust-gated. Only posted and validated import batches feed food-cost KPIs. Untrusted, stale, duplicate, partial, or malformed imports show data-quality warnings and must not drive authoritative decisions.
- Date filters use strict `YYYY-MM-DD` validation and the configured company/user display timezone.

### Work Management, Projects, And Shared Coordination

- Project/task status templates are configurable by project type.
- Dependencies are informational by default for the first release unless explicitly configured as blocking for a template.
- Tasks have one accountable owner by default and may have collaborators.
- Restricted projects require explicit membership or configured restricted scope.
- Task completion evidence is configurable by project template.
- Calendar is included where available, but mobile remains task-completion-first rather than drag/drop-first.
- Drag/drop, reorder, reassignment, dependency, due-date, and bulk status changes require version/concurrency protection and audit.

### Restaurant Operations

- `DEC-0035` remains the source decision for recipe versions, menu-price decisions, operational corrections, and intermediate status semantics.
- Restaurant Operations defaults use controlled workflow actions, reason/evidence where required, source-record immutability, audit history, and role-scoped visibility.
- Marketing Operations planning uses the shared Work Management Engine. Campaigns, promotions, item launches, and creative boards use configurable status templates, approval routes, readiness evidence, calendar conflict rules, asset visibility, retention, and post-campaign review ownership.

### Finance, Accounting, Expansion, And Later Phases

- Finance/accounting defaults follow source-of-truth accounting direction from `DEC-0006`, but production finance behavior remains gated by finance-owner/accountant validation and UAT evidence.
- Chart of Accounts ownership, fiscal calendar, period close/reopen, posting rules, manual journal eligibility, AP matching tolerances, bank/cash reconciliation, inventory valuation, landed cost, tax/statutory reporting, and opening balances use conservative configurable defaults pending finance validation.
- Branch Expansion & Construction uses the shared Work Management Engine with configurable lifecycle gates, target-opening-date change authority, restricted visibility, financial-link display, contractor references, punch-list closure, and handover rules.
- Future integrations/productization use reliable-source-data gates, owner approval, migration evidence, and go-live/UAT signoff before production use.

### Release Readiness And UAT

- Default final UAT signoff requires QA Lead, Product Owner, Security/Controls Owner, Warehouse/Inventory Owner, Release Manager, and Enablement Owner.
- Pilot go-live uses a Release Board model with Product Owner chair, QA Lead, Release Manager, Security Owner, Operations Owner, and Warehouse/Inventory Owner.
- Gate states are `GO`, `CONDITIONAL GO`, `HOLD`, `ROLLBACK`, and `FORWARD_FIX`.
- Any blocker defect blocks go-live.
- A critical defect blocks go-live unless formally waived with mitigation, expiry, owner, and retest plan.
- Rollback/fallback is mandatory for authorization leakage, unauthorized access, duplicate/incorrect stock posting, migration corruption, or failed restore evidence.
- Training signoff requires role-based attendance, known-limit acknowledgement, support route confirmation, trainer, date, and evidence reference.
- Repeated UAT findings can update these defaults through a new decision record or an update to this record.

## Options Considered

### Option A — selected: control-first configurable industry defaults

- **Summary:** Use conservative restaurant/F&B defaults as configurable policy and enforce non-negotiable controls.
- **Benefits:** Allows implementation and UAT to proceed with realistic policy, while preserving reversibility after pilot findings.
- **Failure modes:** Defaults may not match final OGFI preferences; over-control can slow branch users if not tuned.
- **Why selected:** Best satisfies operational control, user safety, audit, inventory integrity, and iterative pilot learning.

### Option B — rejected: keep all open until exact business confirmation

- **Summary:** Continue leaving decisions open and avoid resolving defaults.
- **Benefits:** Avoids assumptions.
- **Failure modes:** Prevents realistic UAT, leaves users guessing, and blocks validation of workflows that require policy values.
- **Why rejected:** The user explicitly asked to proceed with best-practice defaults and revise after testing.

### Option C — rejected: hardcode defaults as permanent policy

- **Summary:** Treat industry defaults as fixed business rules.
- **Benefits:** Simpler implementation and less configuration complexity.
- **Failure modes:** Incorrect policy becomes difficult to change; risks tenant/productization inflexibility.
- **Why rejected:** Conflicts with project rule that policy values must be configurable.

## Hard-Gate Assessment

- Tenant, company, brand, location, department, requester, approver, and project scope are preserved.
- Authorization remains server-enforced and cannot rely on UI hiding.
- No self-approval is allowed for money, inventory, sensitive role/scope grants, or controlled closure/reversal workflows.
- Inventory remains ledger-driven and auditable.
- Important records are cancelled, reversed, corrected, superseded, or archived rather than hard-deleted.
- Posting and workflow transitions require transactionality, idempotency where retryable, and audit.
- Reporting reads source records and never replaces operational source-of-truth modules.
- Defaults are configurable and reversible through future decision updates.

## Required Safeguards

- Store defaults as configuration, seed data, or controlled policy records rather than permanent code constants.
- Keep hard controls hard: scope isolation, server authorization, no self-approval, audit, and ledger immutability.
- Add tests for denial paths, scope boundaries, stale sessions, sensitive grants, stock posting idempotency, export scope, and data-quality warnings.
- Tag UAT evidence with policy/default version so findings can be traced to the decision baseline.
- Revisit defaults after pilot with actual UAT findings before production rollout beyond the pilot scope.

## Implementation And Documentation Impact

- **Code / architecture:** Configurable policy registry, release gates, and report trust gates may be implemented against these defaults.
- **Data / schema:** Prefer additive policy/configuration records. No historical rewrite is authorized by this decision.
- **Workflow / permissions:** Sensitive grants, high-risk scopes, emergency purchases, stock corrections, and finance/accounting actions require configured approval/evidence.
- **UI / mobile:** Show clear policy-derived requirements, formula/logic explanations, warnings, and denial states.
- **Reporting:** Add derived cancellation subtype, export audit, scope parity, and POS/import trust-state warnings.
- **Knowledge base / training:** Explain defaults, formulas, reason/evidence requirements, and known pilot limits in user-facing guidance.
- **Tests / UAT:** UAT scripts must verify happy path, denied path, invalid state, audit, evidence, reversal/rollback where applicable, and policy update path.

## Follow-Up Actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Seed or configure pilot approval bands, count cadence, lot/expiry defaults, emergency cap/SLA, project blocker-reason policy, and supplier accreditation statuses | Product / Operations / Engineering | Before pilot UAT | Partially implemented through `CompanyPolicySetting` registry and `/admin/settings`; opening-balance stock adjustments consume the configured evidence policy, project blocked-task transitions consume the configured blocker-reason policy with matching Work Management UI hints, Purchase Order creation/submission/issue consumes the configured supplier-accreditation eligibility policy, Stock Count schedule/list surfaces consume the configured count-cadence policy, inventory posting plus stock adjustment/wastage draft validation consume the configured lot/expiry category policy, Purchase Request workspace/audit metadata consumes configured approval-band, quotation-threshold, minimum-quote, and emergency-cap values as policy context, and Quotation Recommendation creation enforces the configured quotation threshold/minimum quote count unless a documented shortfall or single-source justification is recorded. Supplier lifecycle and accreditation are now separated through additive `SupplierAccreditationStatus` schema/migration, seeded pilot suppliers are `APPROVED`, newly created suppliers start `PENDING_REVIEW`, and admin accreditation changes are reasoned/audited. Emergency Purchase Requests now require reason/evidence reference and positive line estimates at draft creation, enforce the configured emergency cap, derive SLA status from urgency/required date, surface emergency SLA/support/value details on PR list/detail and approval inbox, prefer explicitly configured emergency PR approval rules, record route/fallback metadata in submit audit/notifications, seed a demo emergency PR route, and support audit-backed emergency post-review with outcome, reason, evidence, no self-review, and no source-record mutation. Pilot UAT evidence remains pending |
| Define exact privileged-role taxonomy and high-risk-scope taxonomy in the permission configuration UI/docs | Security / Product / Engineering | Before sensitive role administration | Partially implemented: Core Admin now blocks direct service-layer assignment and deactivation of system/sensitive roles, including initial role assignment during user creation, while preserving direct non-sensitive role setup. Admin, approver, system, and sensitive-permission role grants now use a controlled `SensitiveRoleRequest` artifact with reason, evidence reference, pending/approved/rejected history, privileged MFA guard, no self-approval by requester or target user, audit events linked to DEC-0036, transactional role assignment creation, and target-user privilege epoch refresh. Core Admin also blocks quick direct assignment/deactivation of high-risk location scopes such as warehouse, commissary, central kitchen, head office, project/temporary sites, and `MANAGE` access; the user detail UI only offers low-risk direct location scopes and shows high-risk labels. High-risk and Manage-level location grants now use a controlled `HighRiskScopeRequest` artifact with reason, evidence reference, pending/approved/rejected history, no self-approval by requester or target user, audit events linked to DEC-0036, transactional assignment creation, and target-user privilege epoch refresh. Demo-auth session revalidation now stores a session-issued timestamp, touches the target user privilege epoch on successful role/scope mutations, and rejects stale sessions until sign-in. Privilege epoch changes now also create provider-neutral `AuthSessionInvalidation` records with `PENDING_PROVIDER` status for production IdP follow-up, visible under `Admin > Session Invalidation`, with provider completion evidence captured by audit and separate-admin self-completion blocking. Actual external auth-provider session termination remains pending until provider integration |
| Confirm MFA provider/enrollment path, break-glass process, retention, and continuity controls | IT / Security | Before privileged production use | Partially implemented through required `/admin/readiness` security gates for privileged MFA enrollment, break-glass controls, sensitive-action session revalidation, controlled access request clearance, and backup/restore evidence. ERP break-glass execution register is implemented at `/admin/break-glass` with request, separate approval, temporary location-scope activation, 24-hour maximum expiry, revoke/auto-expire, post-review, evidence, no self-request/self-approval/self-review, audit events, and target-user privilege epoch refresh. ERP-side privileged MFA evidence register is implemented at `/admin/mfa` for sensitive-permission users with provider/evidence attestation, separate verification, revocation, no self-attestation/self-verification, audit events, and explicit evidence-only wording. Admin Settings now exposes DEC-0036 security/continuity defaults for privileged MFA enforcement mode, the retention matrix, and backup/restore policy. The evidence-backed guard covers sensitive role-permission changes, high-risk scope requests/reviews, break-glass request/approval/revocation/post-review actions, and selected operational posting/reversal actions for receiving, stock adjustments, wastage, and transfer receipts. Modes are `warn_and_audit`, `enforce_admin_security`, and `enforce_all_sensitive`. Release Readiness security gates now show live MFA/session/break-glass/controlled-access counters and block `READY` when the matching live evidence still has unresolved gaps, including pending sensitive role or high-risk scope requests; accepted residual risk must be recorded as `CONDITIONAL_GO` or `WAIVED` with evidence and a decision note. Deployment readiness now includes a `DeploymentEvidenceRecord` register for migration, backup, restore rehearsal, rollback plan, smoke-test, and monitoring/hypercare evidence; deployment gates block `READY` until the matching records are verified by someone other than the recorder. Enablement readiness now includes an `EnablementEvidenceRecord` register for role-based training signoff, known-limit acknowledgement, support-route confirmation, KB review, release-note review, and training-impact assessment; enablement gates block `READY` until the matching records are verified. GO / NO-GO readiness now includes a `ReleaseBoardDecision` register for `GO`, `CONDITIONAL_GO`, `HOLD`, `ROLLBACK`, and `FORWARD_FIX`; the final gate blocks `READY` unless the latest board decision is `GO`. Actual external MFA provider/runtime sign-in enforcement, identity-provider/vault evidence, backup execution, restore execution, and artifact storage remain pending before production privileged use |
| Add export/report data-quality trust indicators and derived PO cancellation subtype | Product / BI / Engineering | Before report UAT | Implemented for current report surfaces: overview dashboard and reports hub read the configured reporting trust-gate mode; every report catalog card carries a DEC-0036 trust notice, standard reports are labeled `Source-record scoped`, and Food Cost Analysis is flagged with a stronger POS/import trust-state warning. Operational/project CSV exports log denied/started/completed/failed attempts with scoped trust metadata where applicable; Purchase Order CSV export preserves trust/scope/filter metadata and includes derived terminal subtype fields |
| Record UAT findings and revise defaults where evidence shows mismatch | QA / Product / Owners | After each UAT cycle | Capability implemented through `ReleaseReadinessGate`, `UatEvidenceRecord`, and `/admin/readiness`: UAT scenario execution, defect disposition, policy trace, signed acceptance matrix, and default revision register gates are available; UAT ready/conditional/waived status requires evidence reference plus owner/finding/default-revision decision note; UAT gates now consume verified UAT evidence records and block `READY` while required evidence is missing or verified results still contain unresolved failed/blocked outcomes; updates require Core Admin plus company Manage scope and write audit history. Actual pilot UAT execution evidence and any real post-UAT default changes remain pending until testing is performed |

## Evidence

- User confirmation on 2026-07-07 to resolve current open decisions using recommended industry standards and revise after actual testing findings.
- Council review by Dalisay, Luningning, Mutya, and Tala.
- `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md`
- `docs/phases/phase-02-restaurant-operations-and-food-cost/implementation/PHASE2_DECISION_REGISTER.md`
- `docs/phases/phase-03-finance-and-workforce/implementation/PHASE3_DECISION_REGISTER.md`
- `docs/phases/phase-04-expansion-projects/implementation/PHASE4_DECISION_REGISTER.md`
- `docs/phases/phase-05-integrations-and-productization/implementation/PHASE5_DECISION_REGISTER.md`
- `docs/core/00-governance/decisions/DEC-0035-PHASE2-FNB-WORKFLOW-CONTROL-POLICY.md`

## Supersession

This decision does not supersede previous controls. It resolves previously open default-policy questions as configurable baseline policy until UAT findings or executive/owner decisions revise them.
