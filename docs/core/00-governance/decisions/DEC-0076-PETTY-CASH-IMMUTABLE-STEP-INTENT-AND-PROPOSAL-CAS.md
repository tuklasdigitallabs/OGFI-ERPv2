# DEC-0076 — Petty Cash Immutable Step Intent and Proposal CAS

## Metadata

- Decision ID: `DEC-0076`
- Title: Petty Cash Immutable Step Intent and Proposal CAS
- Status: `Confirmed and implemented specifications — PostgreSQL execution and activation gates pending`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — normalized Petty Cash Request approval routing
- Related decision brief: Parent-led Petty Cash intent and source-consistency deliberation, 2026-07-23

## Decision

Every normalized Petty Cash Request current-step `APPROVE`, `RETURN`, or `REJECT` action will atomically append exactly one immutable `PettyCashApprovalStepIntent`, retain the current proposal amount unchanged, and advance `approvalProposalVersion` through an exact compare-and-swap. A terminal action clears `currentProposedAmountPhp` but retains the incremented proposal version; skipped or cancelled steps do not create intent rows.

The shared canonical preflight will gain a bounded `FULL_GRAPH` lock mode used only by Petty Cash. That mode locks the parent approval instance, then every approval step in `(stepOrder, id)` order, and then the exact Petty Cash Request source row, without a second-pass re-lock. The existing default preflight behavior remains unchanged for every other family. `APPROVAL_ROUTING_V1_ENABLED` remains `false`; this decision authorizes no migration and no amount-change authority.

## Context

The existing schema already provides typed Petty Cash proposal state and append-only per-step intent storage, but normalized Petty Cash decisions do not yet have a confirmed transaction contract for writing one intent for every acted step. Approve-only history would omit equally material return and reject decisions. Conversely, creating intent for skipped or cancelled steps would falsely attribute an actor decision where none occurred.

Petty Cash must also prevent two current-step decisions from consuming the same proposal version, prevent a retry from creating a second history row, and prevent a graph transition from being recorded against an incoherent source snapshot. The central preflight currently owns shared authority and graph revalidation. Expanding full-graph locking as the universal default would alter every normalized family and increase lock duration and deadlock surface without evidence that those families require that stronger mode. A Petty-only bounded mode closes the intent/source boundary while leaving the established shared default intact.

Finance and Operations have not granted approvers authority to change a Petty Cash amount. The recorded `beforeAmountPhp` and `effectiveAmountPhp` must therefore be identical for this checkpoint. The typed intent is an immutable audit fact about the action and proposal version, not an authorization to reserve, disburse, settle, post, or otherwise move funds.

## Options considered

### Option A — selected: one immutable intent for every acted current step with bounded full-graph locking and proposal CAS

- Summary: For each normalized Petty Cash `APPROVE`, `RETURN`, or `REJECT`, use Petty-only `FULL_GRAPH` preflight, lock the exact source, append one deterministic immutable step intent, and advance the unchanged proposal through exact version compare-and-swap in the same transaction.
- Benefits: Produces complete acted-step history; distinguishes real decisions from skipped/cancelled steps; makes concurrent decisions and retries converge on one authoritative result; retains a monotonic proposal version after terminal clearing; and limits stronger graph locking to the family that requires it.
- Failure modes: A caller may omit the full-graph mode; step rows may be locked out of order; the intent key/hash may vary for equivalent input; a retry may conflict after partial mutation; terminal clearing may reset the version; or a decision may inadvertently mutate a fund, ledger, payment, bank, or journal record.
- Why selected or rejected: Selected because it is the narrowest complete contract that preserves immutable audit history, exact source/version consistency, deterministic locking, and feature-disabled reversibility without granting new financial authority.

### Option B — rejected: record intent only for approve actions

- Summary: Persist an immutable step intent only when the current approver chooses `APPROVE`; return and reject would retain only canonical decision/audit records.
- Benefits: Requires fewer intent writes and resembles an amount-proposal history focused only on forward progression.
- Failure modes: Leaves return and reject without the typed per-step proposal/version fact; makes the history incomplete for acted steps; and creates action-dependent audit semantics for the same current-step authority boundary.
- Why selected or rejected: Rejected because every current-step decision consumes and advances the authoritative proposal version. Return and reject are real actor decisions and require the same immutable typed evidence as approve.

### Option C — rejected: defer Petty Cash intent until amount-change policy or broader approval activation

- Summary: Leave Petty Cash normalized approve/return/reject blocked until Finance confirms amount-change authority or all normalized families are ready for activation.
- Benefits: Avoids implementing the unchanged-amount case before a possible future amount-change policy.
- Failure modes: Leaves the already-provisioned typed history and proposal version without an executable decision contract; delays a required integrity control for reasons unrelated to unchanged-amount decisions; and risks later coupling policy, implementation, and activation into one broad change.
- Why selected or rejected: Rejected because immutable unchanged-amount intent and exact proposal CAS are necessary regardless of whether a future, separately confirmed policy ever permits amount changes.

### Lock-mode alternative — rejected: make full-graph locking the shared default

- Summary: Change every canonical family to lock the parent instance and all steps on every preflight.
- Benefits: Establishes one stronger lock shape across normalized routing.
- Failure modes: Broadens lock duration, contention, regression risk, and deadlock surface across families that have not been deliberated or proven to need it; changes established default behavior outside this checkpoint.
- Why selected or rejected: Rejected after targeted Database challenge. A Petty-only bounded `FULL_GRAPH` mode satisfies the step-intent consistency requirement without imposing an unreviewed all-family blast radius.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** The exact Petty Cash source, approval instance, every locked step, acting user, and intent lineage must agree on tenant and company. Existing applicable fund/location scope remains enforced from the locked source; request payloads are not scope authority.
- **Server-enforced authorization:** The canonical transaction-time preflight remains authoritative for the live actor/session, permission, scope, current-step eligibility, and prohibited-actor controls. Petty Cash requests `FULL_GRAPH`; no UI or source-page shortcut may write an intent.
- **Approval segregation:** Existing no-self-approval and prohibited-actor rules remain mandatory for approve, return, and reject. No intent is created for an unauthorized action, skipped step, cancellation, or system transition.
- **Audit integrity:** Exactly one append-only intent identifies each acted approval step and binds the actor, step, proposal versions, action, normalized reason, and supplemental decision context. A failed action leaves the source, proposal state, graph, intent history, audit, and notifications unchanged.
- **Transactional consistency and idempotency:** The parent instance, all steps, exact Petty source, intent append, exact proposal-version CAS, canonical decision, audit, and permitted notification share one transaction. The exact current proposal version is consumed once; a concurrent or retried loser fails closed without partial effects or duplicate intent.
- **Phase scope:** This checkpoint hardens feature-disabled normalized Petty Cash approval history only. It does not authorize amount changes, payment execution, bank mutation, journal posting, fund mutation, ledger posting, disbursement, settlement, or activation.
- **Recovery and rollback:** No schema migration, backfill, or historical rewrite is authorized. The routing flag stays false. Code can be reverted before activation; any failed transaction rolls back its intent, version, decision, audit, notification, and source changes together. Append-only committed history must never be deleted as rollback.

## Required safeguards

- Add an explicit shared-preflight `FULL_GRAPH` mode whose caller must opt in. Petty Cash uses it; the default behavior and lock shape of every other family remain unchanged.
- In `FULL_GRAPH`, acquire the parent `ApprovalInstance` lock, then lock all of its `ApprovalInstanceStep` rows in deterministic `(stepOrder, id)` order, then lock the exact tenant/company/document-linked `PettyCashRequest`. Do not perform a second pass that re-locks the parent or step rows.
- Revalidate the pending instance, exact current step, source linkage, source status, proposal state, live authority, scope, segregation, and prohibited actors from transaction-bound locked state before any mutation.
- Persist exactly one `PettyCashApprovalStepIntent` for every current-step `APPROVE`, `RETURN`, or `REJECT`. Never create an intent for a skipped step, cancelled step, cancellation action, non-current step, failed action, or unauthorized action.
- Keep `beforeAmountPhp` and `effectiveAmountPhp` equal to the locked `currentProposedAmountPhp`. Reject any explicit or inferred amount change. This record grants no amount authority.
- Increment `approvalProposalVersion` exactly once through a compare-and-swap matching the locked source identity, actionable status, approval-instance linkage, current proposal amount, and exact prior proposal version. Treat a zero-row update as a stale-source conflict and roll back the whole decision.
- For intermediate actions, retain the unchanged current proposal and its incremented version. For terminal approve, return, or reject, clear `currentProposedAmountPhp` while retaining the incremented `approvalProposalVersion`; do not reset or reuse a prior version.
- Derive the intent idempotency key and SHA-256 payload hash on the server from stable typed context. Canonicalize every amount to exactly six decimal places and bind the normalized action, normalized reason, and supplemental decision context. Equivalent inputs must produce the same key/hash; a different payload for an already-acted step must fail closed rather than overwrite history.
- Append the intent once and rely on the existing one-step/one-order/idempotency uniqueness plus append-only database controls as final guards. Do not catch a uniqueness or lineage conflict and continue the decision.
- Commit the intent, proposal CAS, canonical step outcome, source terminal/intermediate state, audit, and permitted notification atomically. No path may write the intent before authority succeeds or defer it until after the decision commits.
- Assert that this checkpoint creates no Payment Request, bank-account, journal, Petty Cash Fund, Petty Cash Ledger, disbursement, settlement, or other financial effect.
- Keep `APPROVAL_ROUTING_V1_ENABLED=false`. Passing source-level tests alone does not authorize PostgreSQL behavioral acceptance, activation, or production promotion.

## Implementation and documentation impact

- Code / architecture: Extend canonical preflight with an opt-in `FULL_GRAPH` lock mode while preserving the existing default. The normalized Petty Cash family will consume the locked full graph and exact source in one transaction and append deterministic immutable intent before guarded decision completion. No second independent transaction or graph re-lock is permitted.
- Data / schema: No migration, backfill, constraint change, or data rewrite. Existing `currentProposedAmountPhp`, `approvalProposalVersion`, `PettyCashApprovalStepIntent`, lineage constraints, uniqueness, and append-only database controls are used as designed.
- Workflow / permissions: Every acted current-step approve, return, and reject receives one immutable intent. Skipped and cancelled steps receive none. Existing permissions, scopes, segregation rules, statuses, approval routes, and thresholds do not change.
- UI / mobile: No visible action, amount editor, label, status, or navigation change is authorized. Normalized routing remains disabled.
- Reporting: No new report, balance, liability, settlement, or financial metric. Intent rows remain controlled audit history, not a ledger.
- Knowledge base / training: No user-facing update is expected while the flag remains false and no approved visible behavior changes. Dunong must reassess only if implementation changes visible action availability, errors, labels, or workflow behavior.
- Tests / UAT: Add focused and disposable-PostgreSQL coverage for all three actions, intermediate and terminal steps, deterministic ordering, exact proposal-version CAS, stale/conflicting retries, hash/key determinism and conflict, append-only cardinality, skipped/cancelled absence, atomic rollback, authorization denials, notification/audit cardinality, and bounded no-financial-effect snapshots.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement opt-in `FULL_GRAPH` canonical preflight without changing the default family behavior | Backend Engineering + Architecture | Before Petty Cash checkpoint acceptance | Implemented behind disabled routing flag |
| Implement immutable approve/return/reject step intent and exact proposal-version CAS from the locked Petty source | Backend Engineering + Database Engineering | Before Petty Cash checkpoint acceptance | Implemented behind disabled routing flag |
| Add deterministic key/hash canonicalization and fail-closed append conflict handling | Backend Engineering + Security | Before Petty Cash checkpoint acceptance | Implemented behind disabled routing flag |
| Prove lock ordering, legal race outcomes, rollback, exactly-once history, skipped/cancelled absence, and bounded no-financial-effect state on disposable PostgreSQL | Database Engineering + QA | Before behavioral acceptance | 15 specifications implemented; PostgreSQL execution pending |
| Complete independent Architecture, Database/Security, QA, and enablement-impact review | Decision Chair + specialist reviewers | After implementation and executable evidence | Complete for feature-disabled source checkpoint; PostgreSQL/activation acceptance remains pending |
| Keep routing disabled until this and every other normalized-routing production gate pass on the exact candidate | Release Management | Before activation | Pending / activation NO-GO |

## Implemented checkpoint — 2026-07-23

- Petty Cash alone requests the new opt-in `FULL_GRAPH` canonical preflight. The transaction reuses the already locked approval lifecycle graph, deterministically locks the current step's scope-group and scope-target metadata, locks the exact actionable Petty Cash Request together with its active fund/location source context, and reconciles that locked source against the step scope before mutation. Other families retain the existing `ACTIONABLE_PAIR` default.
- Normalized current-step approve, return, and reject append exactly one immutable typed intent from the locked source. The server canonicalizes all three amount values to six decimal places, trims reason and supplemental evidence context, binds the typed action and lineage in one stable JSON payload, derives its SHA-256 hash and versioned idempotency key, and fails closed on database lineage, uniqueness, or append conflicts. The effective amount always equals the current proposal; the implementation grants no amount-change authority.
- The same transaction performs an exact Decimal compare-and-swap over request identity, tenant/company, fund, actionable status, approval-instance linkage, requested amount, current proposal, and proposal version. Intermediate approval preserves the proposal and increments the version. Terminal approve, return, or reject clears the proposal while retaining the incremented version; only an acted current step receives an intent. The Petty-specific terminal skip consumes the already locked graph and does not re-lock it, so skipped steps remain intent-free.
- Intent, proposal CAS, approval graph, source transition, audit metadata, and permitted notification commit or roll back together. Approve, return, and reject all enforce the authoritative evidence gate from the locked source; approval uses its exact proposal amount. Bounded collateral assertions require no Payment Request, bank-account, official journal, Petty Cash Fund, Petty Cash Ledger, disbursement, settlement, budget, inventory, purchasing, or receiving side effect.
- Fifteen disposable-PostgreSQL specifications cover two-step approve, return/reject with skipped-step absence, cancelled-request absence, deterministic hash/key, conflict rollback, evidence denial, source scope mismatch, source-first and decision-first proposal/CAS ordering, competing decisions, unchanged amount, rollback, audit/notification cardinality, and no unintended financial effects. They are authored and discovered but **not executed** locally: the exact database command fails only with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`. They are implementation specifications, not behavioral or production evidence.
- Focused local execution passes 70 tests with 159 PostgreSQL cases skipped and one unrelated existing TODO. The complete non-database candidate passes 1,244 web tests with 261 skipped and one TODO across 118 passed and eight skipped files, 27 database-package tests with 18 skipped, and one worker test. Lint, root typecheck, isolated-output production build, and `git diff --check` pass.
- Architecture's initial implementation review reported three High findings; the implementation was corrected for transaction-bound scope/source reconciliation, all-action authoritative-evidence enforcement, and exact locked-source Decimal/CAS handling. Final Architecture, Data, QA, and Security reviews report no remaining Critical/High finding and GO only for this feature-disabled source checkpoint. PostgreSQL behavioral acceptance and normalized-routing activation remain **NO-GO**.
- Dunong found no visible knowledge-base, glossary, release-note, or training behavior change while the flag remains false. Existing Petty Cash guidance already describes the writer as pending and must be corrected by Dunong to avoid understating the implemented feature-disabled foundation; Mithi does not own that user-facing edit.

## Evidence

- The Decision Chair confirmed Option A on 2026-07-23 after independent first-round Architecture, Database, and Operations analysis reached consensus and a targeted Database challenge tested the proposed lock-mode boundary. The challenge rejected universal full-graph defaulting because of its cross-family blast radius and accepted the bounded Petty-only mode with deterministic ordering and no second-pass re-lock.
- Requested GPT-5.3 Codex Spark and `gpt-5.4` specialist models were unavailable in the active toolset. The closest permitted GPT-5.6 specialist fallback was used for the deliberation. The fallback did not relax the decision protocol or any hard gate.
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` requires server-enforced scope and authorization, segregation, immutable audit history, transactional consistency, idempotency, and an appropriate rollback path.
- `docs/core/00-governance/decisions/DEC-0051-CANONICAL-APPROVAL-DECISION-PARITY-AND-ATOMIC-SOURCE-EFFECTS.md` requires canonical decisions and permitted source effects to share one transaction and preserves typed Petty Cash amount intent without inferring financial authority.
- `docs/core/00-governance/decisions/DEC-0052-APPROVAL-INTEGRITY-LOCKING-AND-TYPED-FINANCIAL-INTENT.md` confirms typed current proposal/version state, one immutable intent per acted approval step, transaction-bound source/authority locking, unchanged-amount policy, and feature-disabled activation posture.
- `packages/database/prisma/schema.prisma` defines the existing typed Petty Cash proposal fields and immutable `PettyCashApprovalStepIntent` model with step, instance/order, and idempotency uniqueness.
- `packages/database/prisma/migrations/20260722210000_approval_integrity_petty_cash_intents/migration.sql` defines existing proposal-state, intent-lineage, uniqueness, and append-only database controls. This decision requires no new migration.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` keeps normalized routing disabled while Petty Cash intent/source consistency, PostgreSQL concurrency, policy, authorization, deployment, recovery, and release gates remain open.
- `apps/web/src/server/services/approvalRouting.ts` implements the Petty-only `FULL_GRAPH` preflight, scope-metadata/source locks, and transaction-bound source-scope reconciliation while preserving the shared default.
- `apps/web/src/server/services/approvals.ts` implements stable intent hashing/keying, append-only intent creation, exact proposal CAS, terminal version retention, locked-graph step skipping, and atomic approve/return/reject integration.
- `apps/web/src/server/services/approvalsPettyCashIntent.test.ts` covers deterministic canonical payload, six-decimal amount binding, normalized optional context, and action-sensitive hashes without PostgreSQL.
- `apps/web/tests/approvalDecisionParity.integration.test.ts` contains the 15 disposable-PostgreSQL intent, scope, race, rollback, cardinality, and no-financial-effect specifications. Local execution remains pending because the required disposable-database administrator URL is unavailable.
- The implemented source checkpoint does not constitute PostgreSQL behavioral evidence or authorize activation. Exact-candidate disposable-PostgreSQL execution and the wider normalized-routing/release gates remain pending and NO-GO.

## Supersession

This decision is not superseded. It refines the Petty Cash step-intent and source-consistency implementation required by `DEC-0051` and `DEC-0052`; it does not replace their all-family approval, policy, concurrency, cutover, or activation gates. A later decision that changes Petty Cash amount authority, intent cardinality, proposal-version semantics, lock mode/order, terminal clearing, or normalized-routing activation posture must explicitly amend or supersede this record.
