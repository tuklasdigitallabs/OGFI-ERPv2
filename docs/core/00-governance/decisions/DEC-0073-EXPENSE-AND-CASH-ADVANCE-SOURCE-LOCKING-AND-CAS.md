# DEC-0073 — Expense and Cash Advance Source Locking and CAS

## Metadata

- Decision ID: `DEC-0073`
- Title: Expense and Cash Advance Source Locking and CAS
- Status: `Confirmed and implemented — PostgreSQL execution and activation gates pending`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — normalized approval routing for Expense Request and Cash Advance Request
- Related decision brief: Parent-led approval-integrity checkpoint deliberation, 2026-07-23

## Decision

The next feature-disabled normalized-approval checkpoint will add exact source-row locking, source-version revalidation, and compare-and-swap mutation for the `ExpenseRequest` and `CashAdvanceRequest` canonical decision families. The control applies to approve, return, and reject actions, including intermediate approvals that do not yet produce a terminal source effect.

The transaction lock order is:

`actor/session → approval graph → exact source row → required dependent rows → guarded mutations`

The locked source snapshot is authoritative for tenant, company, approval-instance linkage, source status/version, applicable scope, prohibited-actor and segregation checks, evidence and budget validations, and source/audit values. Any source or material dependent change that invalidates the locked snapshot must fail the decision atomically. The normalized-routing flag remains disabled.

## Context

`DEC-0051` and `DEC-0052` require canonical decisions to re-lock and freshly validate the exact source record and expected source version inside the same transaction as the approval outcome. The shared canonical preflight locks and revalidates actor/session and approval-graph authority, but the Expense Request and Cash Advance Request family paths still need explicit proof that an exact source snapshot remains authoritative until every approval, source effect, audit, and permitted dependent mutation commits.

This gap affects intermediate decisions as well as terminal decisions. An intermediate approval can advance canonical authority while the source record changes concurrently, producing a workflow decision that was never valid for one coherent source version. A status-only mutation guard is also insufficient when a same-status material edit can occur. The bounded two-family checkpoint closes this integrity boundary without coupling it to unrelated notification work or attempting an unreviewable all-family rewrite while the feature remains disabled.

## Options considered

### Option A — selected: bounded Expense Request and Cash Advance Request source locks and CAS

- Summary: Lock the exact family source row after the actor/session and approval graph, validate its version and linkage, lock only required dependent rows in deterministic order, and use the locked snapshot plus a version-aware compare-and-swap for all canonical decisions.
- Benefits: Closes a concrete stale-source race for two money-related families; covers intermediate and terminal decisions; keeps one transaction and deterministic lock order; provides a reviewable pattern for later families; and remains reversible while normalized routing is disabled.
- Failure modes: A validation may still read an unlocked pre-transaction object; a same-status child mutation may not advance the parent version; a dependent row may be locked out of order; a guarded update may omit the expected version; or audit/source values may be derived from stale request input.
- Why selected or rejected: Selected because it is the smallest coherent checkpoint that materially improves approval integrity while retaining explicit PostgreSQL concurrency and rollback gates.

### Option B — rejected: notification-first implementation

- Summary: Complete remaining legacy procurement notification behavior before source locking.
- Benefits: Advances a visible remaining activation task and may improve operational awareness.
- Failure modes: Leaves money-related approval decisions able to act on an incoherent source snapshot and does not satisfy the source-locking requirement of `DEC-0051` and `DEC-0052`.
- Why selected or rejected: Rejected for this checkpoint because notification completeness cannot compensate for an open approval transaction-integrity boundary.

### Option C — rejected: tests-only prohibited-actor matrix

- Summary: Expand denial tests without changing the family source-locking implementation.
- Benefits: Improves segregation-of-duties coverage and can expose missing family-specific denials.
- Failure modes: Cannot prove or enforce exact source/version consistency and may leave the underlying stale-source race unchanged.
- Why selected or rejected: Rejected as the checkpoint implementation. Prohibited-actor coverage remains a required safeguard, not a substitute for source locking and CAS.

### Option D — rejected: combine source locking with unrelated notification changes

- Summary: Implement the two-family transaction controls and legacy procurement notification changes in one checkpoint.
- Benefits: Could reduce the number of delivery commits.
- Failure modes: Couples independent failure domains, broadens review and rollback, obscures approval-integrity evidence, and makes regression attribution less reliable.
- Why selected or rejected: Rejected because the source-consistency control should remain independently reviewable and reversible.

### Option E — rejected: convert every working approval family at once

- Summary: Add exact source locking and CAS across all currently normalized approval families in one implementation pass.
- Benefits: Could reach broader structural uniformity sooner.
- Failure modes: Produces a wide, high-risk change across families with different source and dependent-row invariants; increases deadlock and regression risk; and makes PostgreSQL race evidence difficult to isolate.
- Why selected or rejected: Rejected for this checkpoint. The confirmed two-family pattern may be extended only after its lock order, rollback, and concurrency behavior are proven.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** The locked source must match the authenticated tenant and company, the canonical approval document tuple, and every applicable organizational scope. Neither request payloads nor an earlier read may substitute for the locked source.
- **Server-enforced authorization:** Live actor/session and approval-graph authority are locked and revalidated before the source. Source-specific scope and prohibited-actor rules are then evaluated from the locked source inside the transaction.
- **Approval segregation:** No-self-approval and every family-specific prohibited-actor rule apply to intermediate and terminal decisions. Advancing a non-final step is still an exercise of approval authority and receives no weaker control.
- **Audit integrity:** Canonical and source audit values must be derived from the locked source and commit with the decision. A failed source/version guard must leave no approval advance, source change, dependent effect, audit, or notification.
- **Transactional consistency and idempotency:** The source lock, required dependent locks, validations, canonical decision, source/version CAS, source effects, audit, and permitted notification share one transaction. Concurrent decisions or edits must yield one coherent winner and a safe loser.
- **Phase scope:** This checkpoint hardens two existing normalized approval families. It does not activate routing, change approval policy, qualify evidence under `DEC-0047`, define expense commitment lifecycle policy, or add payment execution.
- **Recovery and rollback:** No migration is expected. The normalized-routing flag remains false, so the code path can be reverted without rewriting business data. Any partially applied transaction must roll back completely.

## Required safeguards

- Follow the deterministic lock order `actor/session → approval graph → exact source row → required dependent rows → guarded mutations`. Where multiple rows exist within one tier, acquire them in a stable documented order.
- Lock the exact `ExpenseRequest` or `CashAdvanceRequest` row identified by the canonical approval document tuple. Revalidate tenant, company, document type/id, approval-instance linkage, current status, and expected version after the lock is held.
- Use the locked source as the sole input to evidence, budget, scope, prohibited-actor, segregation, source-effect, and audit decisions. Do not retain an authoritative pre-transaction or pre-lock family source object.
- Apply the control to intermediate approve actions and every return or reject action, not only final approval. No canonical step may advance from a stale source version.
- Guard each material source mutation with the expected locked version and status, increment the source version exactly once where the model requires it, and fail closed when the compare-and-swap affects no row.
- Lock required dependent rows only after the source and in deterministic order. Expense commitment or evidence validation must not rely on a dependent collection that can change outside the transaction boundary.
- Treat a material child-row mutation that does not also advance or otherwise invalidate the parent source version as a **blocking invariant failure**. Do not claim this checkpoint complete until every child value used for approval authority or source effects is locked and validated directly, or its mutation reliably advances the parent version.
- Preserve the existing feature-disabled posture: `APPROVAL_ROUTING_V1_ENABLED=false`. This decision does not authorize normalized-routing activation.
- Add PostgreSQL barrier tests that force a source or relevant dependent mutation to race with approve, return, and reject. Assert one coherent winner, a safe loser, full atomic rollback, no duplicate decision/audit/notification/effect, and no partially advanced approval graph.
- Include otherwise-authorized prohibited-actor and live-revocation cases for both families. Verify that denial leaves the source, approval graph, dependents, audit, and notifications unchanged.
- Require focused unit/integration coverage, disposable-PostgreSQL execution, typecheck, lint, and independent Architecture, Database/Security, and QA review before this checkpoint is called production-ready.

## Implementation and documentation impact

- Code / architecture: Add family-specific exact source-lock and revalidation helpers or equivalent transaction-bound primitives for Expense Request and Cash Advance Request. Canonical family decisions must consume only locked snapshots and version-aware guarded mutations.
- Data / schema: No migration is expected. If implementation discovers that a material child mutation cannot be fenced by current source/dependent locks or parent versioning, stop and deliberate the required schema or mutation-boundary change rather than silently weakening CAS.
- Workflow / permissions: No role, approval threshold, route, status semantic, amount authority, or evidence policy changes. Existing live scope, no-self-approval, and prohibited-actor controls are enforced more strongly at decision time.
- UI / mobile: No visible action or label change is authorized. The routing flag remains disabled.
- Reporting: No report or metric change.
- Knowledge base / training: No Dunong update is required unless implementation changes user-visible errors, action availability, or workflow behavior. The feature-disabled integrity hardening alone does not create end-user guidance.
- Tests / UAT: Add forced PostgreSQL concurrency, CAS conflict, intermediate-action, prohibited-actor, revocation, rollback, and audit/effect cardinality evidence for both families.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement exact source locking, locked-snapshot validation, and source-version CAS for both families and all canonical decision actions | Backend Engineering + Architecture | Before the next normalized-approval checkpoint | Implemented behind disabled routing flag |
| Audit child/dependent mutation paths and prove the parent-version invariant or lock each material child directly | Backend Engineering + Database Engineering | Before implementation completion | Expense approval-material lines are locked and snapshot-validated; broader family/cutover audit remains an activation gate |
| Add forced PostgreSQL edit-versus-decision barriers, prohibited-actor, live-revocation, atomic rollback, and exactly-once assertions | QA + Database Engineering + Security | Before checkpoint acceptance | Source/edit ordering, source/linkage, Expense-line drift/scope, prohibited-actor, evidence, rollback, and cardinality specifications implemented; local PostgreSQL execution and live-revocation breadth pending |
| Complete independent Architecture, Database/Security, and QA review | Decision Chair + specialist reviewers | After implementation and executable evidence | Independent implementation challenge/re-review GO for commit as a feature-disabled checkpoint; activation remains NO-GO |
| Assess knowledge-base and training impact if visible behavior changes | Dunong | After implementation verification | Conditional handoff |
| Extend the confirmed pattern to other normalized families only through a separately reviewed, evidence-backed checkpoint | Product Governance + Engineering | After this two-family pattern passes | Deferred |

## Implemented checkpoint — 2026-07-23

- Normalized Expense Request and Cash Advance Request decisions re-lock the canonical approval lifecycle graph, lock the exact tenant/company source row, and re-read it before any intermediate or terminal decision mutation. They reject a missing source, non-actionable source, approval-link mismatch, or expected-version mismatch as `APPROVAL_SOURCE_CHANGED`.
- Expense Request additionally locks approval-material line rows in deterministic ID order and compares their identity, tenant/company ownership, and `updatedAt` snapshot before proceeding. A malformed cross-scope line or concurrent line drift fails the whole decision atomically. Cash Advance prohibited-actor revalidation includes both requester and beneficiary; Expense Request revalidates the requester restriction.
- Intermediate approval derives its audit identity from the locked source and retains the source row lock until the canonical step advance commits. Terminal Expense and Cash Advance approve/return/reject use status, source version, and approval-instance linkage in compare-and-swap mutation; they derive authoritative evidence, budget, source, and audit values from the locked snapshot. Supplemental decision text remains non-authoritative.
- PostgreSQL specifications cover both edit-first and decision-first ordering for approve, return, and reject; two-step Expense intermediate approval; source-link/document-tuple mismatch; Expense child-line drift and cross-scope rejection; otherwise-authorized prohibited actors; authoritative-evidence failure; atomic no-write rollback; and decision/audit/notification cardinality. These new PostgreSQL cases are **implemented but locally unexecuted** because `DISPOSABLE_DATABASE_ADMIN_URL` is unavailable. Their presence is not PostgreSQL production evidence.
- Local verification passes web lint, root typecheck, the isolated-output production build, 45 focused approval/Expense service tests in the final parent rerun, 59 approval-parity non-PostgreSQL tests with 78 PostgreSQL cases skipped and two existing policy TODOs, and the full non-database web suite with 1,233 passed, 168 skipped, and two TODOs across 117 passed and seven skipped files. The root suite also passes 27 database-package tests and one worker test; a broader worker-focused run passed 55/55. None of these results substitutes for the unexecuted PostgreSQL concurrency specifications.
- Independent Architecture and Database corrected re-reviews report no remaining Critical/High finding and return GO to commit this bounded feature-disabled checkpoint. Security's initial review identified the same two High issues; after correction its commit verdict was GO. All reviewers keep activation at NO-GO. Live acting-session/authority revocation barriers, all-family source-lock and decision parity, unresolved finance and controlled-evidence policy, cutover/drain evidence, exact-candidate authorization/E2E, hosted PostgreSQL, recovery, and release-acceptance gates remain open.
- Dunong assessed the checkpoint and found no knowledge-base, glossary, training, or user-facing release-note change necessary because the routing flag remains false and no visible behavior, policy, permission, action, status, label, or navigation changed.

## Evidence

- The Decision Chair confirmed this conclusion on 2026-07-23 after independent architecture, security, correctness, and test-gap analysis. The independent positions agreed, so no targeted deliberation challenge round was required. After implementation, independent challenge and re-review evaluated the concrete changes and returned GO only for the bounded feature-disabled source-control checkpoint. Requested GPT-5.3 Codex Spark and `gpt-5.4` models were unavailable; the closest permitted GPT-5.6 specialist roles were used. Model fallback did not relax any hard gate.
- `docs/core/00-governance/decisions/DEC-0051-CANONICAL-APPROVAL-DECISION-PARITY-AND-ATOMIC-SOURCE-EFFECTS.md` requires every canonical family action to re-lock and freshly validate its exact source/version and commit the workflow, source effect, audit, and required domain effects atomically.
- `docs/core/00-governance/decisions/DEC-0052-APPROVAL-INTEGRITY-LOCKING-AND-TYPED-FINANCIAL-INTENT.md` confirms the transaction-time authority chain, deterministic lock order, version-aware source validation, disabled routing posture, and PostgreSQL concurrency gates.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` identifies exact source-record/version locking inside canonical decisions as an outstanding normalized-routing activation requirement and keeps the flag disabled while policy and production gates remain open.
- `apps/web/src/server/services/approvals.ts` and `apps/web/src/server/services/expenseRequests.ts` implement the feature-disabled exact-source locks, Expense-line snapshot validation, locked-source authority, prohibited-actor checks, and version/linkage compare-and-swap behavior.
- `apps/web/tests/approvalDecisionParity.integration.test.ts` contains the forced PostgreSQL source/edit, source/linkage, child-line, prohibited-actor, evidence, rollback, and cardinality specifications. Local execution remains pending because the required disposable-database administrator URL is unavailable.

## Supersession

This decision is not superseded. It implements a bounded two-family checkpoint under the broader canonical approval and integrity requirements of `DEC-0051` and `DEC-0052`; it does not replace their all-family activation gates or resolve their open policies. A later decision that changes the lock order, source-version authority, family scope, child-version invariant, or normalized-routing activation posture must explicitly amend or supersede this record.
