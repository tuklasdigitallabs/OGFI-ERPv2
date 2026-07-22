# DEC-0052 — Approval Integrity Locking and Typed Financial Intent

## Metadata

- Decision ID: `DEC-0052`
- Title: Approval Integrity Locking and Typed Financial Intent
- Status: `Confirmed`
- Date: 2026-07-22
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — normalized approval routing and Phase III finance approval families
- Related decision brief: Parent-confirmed structural conclusion after independent Architecture, Database, Operations, and Security deliberation and targeted challenge

## Decision

The normalized approval architecture will enforce one pending approval instance per tenant/company/source document tuple in PostgreSQL, route Approval Inbox and source-workspace decisions through one typed transaction-bound canonical dispatcher, and persist multi-step petty-cash amount intent as typed current state plus immutable per-step history. Payment-request capacity validation will deterministically lock the relevant AP invoice rows and recompute exact `NUMERIC` capacity across active requests inside the decision transaction.

These structural choices do not resolve finance policy. This decision supersedes `DEC-0051` only for petty-cash reduced-amount behavior: an explicit amount differing from the current proposal is rejected in both legacy and canonical request approval, and the source workspace exposes no amount-change control, until authorized owners confirm reduction, increase/restoration, reason, and acknowledgment rules. Payment-request approval remains blocked until the exact `PAYMENT_READY`, match, exception, source-status, and active-request eligibility matrix is confirmed. No part of this decision represents AP settlement.

`APPROVAL_ROUTING_V1_ENABLED` remains `false` until the required migrations, all-family PostgreSQL behavioral matrix, policy confirmations, `DEC-0047` controlled-evidence proof, and final specialist reviews pass.

## Context

`DEC-0051` confirms typed family approval commands and atomic canonical/source effects, but executable integrity still depends on eliminating duplicate pending instances, preventing source and Inbox entry points from resolving different authority, durably carrying typed multi-step decision intent, and serializing payment capacity checks.

An application-only duplicate check can race and create two actionable pending approval instances for the same source. A dispatcher that reuses an identifier resolved outside the action transaction can act on a stale instance, stale step, changed source, or revoked actor. Opaque JSON can carry amount data without relational constraints or a clear audit history. An unlocked payment-capacity sum can admit concurrent requests against the same outstanding invoice amount. These failures affect financial authority, auditability, and exactly-once behavior and therefore require database and transaction-level controls.

The selected structure provides those controls without inventing the unresolved business rules. It deliberately keeps routing disabled until the schema and behavior are proven on the exact release candidate.

## Options considered

### Option A — selected: database uniqueness, canonical locked dispatch, typed intent history, and deterministic capacity locks

- Summary: Add a PostgreSQL partial unique index for pending source approval instances; converge all decision entry points on a typed dispatcher that locks and revalidates the full authority chain; use typed current petty-cash proposal/version state plus immutable typed per-step intent rows; and lock AP invoice rows before exact capacity recomputation.
- Benefits: Makes duplicate pending approval impossible at the database boundary; removes entry-point drift; preserves current intent and historical accountability; prevents float/rounding ambiguity; and serializes competing claims against invoice capacity.
- Failure modes: A migration can encounter pre-existing duplicates; inconsistent lock order can deadlock; a family can omit its typed adapter; policy-undefined rows can be treated as actionable; or a transaction can perform authoritative work outside the lock boundary.
- Why selected or rejected: Selected because it satisfies the approval, audit, atomicity, concurrency, and recovery gates while allowing unresolved finance policies to remain explicitly disabled.

### Option B — rejected: application-only duplicate preflight and optimistic concurrency

- Summary: Query for an existing pending instance before insert and rely on service checks or versions without a database uniqueness constraint or deterministic row locks.
- Benefits: Avoids a new partial index and minimizes schema work.
- Failure modes: Concurrent requests can both pass preflight; competing decisions or payment requests can validate the same stale capacity; retries can create divergent authority; and recovery becomes manual after an already-committed conflict.
- Why selected or rejected: Rejected because application preflight cannot close the database race and optimistic checks alone do not serialize shared invoice capacity.

### Option C — rejected: separate Inbox and source decision handlers

- Summary: Keep distinct entry-point services and attempt to synchronize their outcomes or share only selected helpers.
- Benefits: Preserves current call shapes and reduces immediate adapter work.
- Failure modes: The two paths can lock different records, apply different source validation, observe different actor authority, produce inconsistent audits, or mutate one side without the other.
- Why selected or rejected: Rejected because canonical approval must have one decision authority and one transaction boundary, regardless of where the action originates.

### Option D — rejected: generic JSON for intermediate financial intent

- Summary: Store changing petty-cash amount proposals or decision context in generic approval metadata.
- Benefits: Flexible payload shape and no dedicated typed relation.
- Failure modes: Weak constraints, ambiguous versions, difficult relational validation, silent shape drift, poor queryability, and an unclear distinction between current authority and historical evidence.
- Why selected or rejected: Rejected because opaque JSON cannot serve as authoritative money state or substitute for typed, constrained, auditable fields.

### Option E — rejected as architecture, retained as release posture: defer the controls and keep routing disabled

- Summary: Make no structural change and continue using the legacy path with the feature flag off.
- Benefits: Avoids exposing incomplete normalized routing and remains a safe short-term fallback.
- Failure modes: Does not resolve duplicate-instance, split-dispatch, intent-history, or payment-capacity integrity risks and prolongs dual-path maintenance.
- Why selected or rejected: Rejected as the target architecture. Retaining the disabled flag is mandatory until Option A is migrated, verified, and approved.

## Hard-gate assessment

- **Tenant and organizational scope:** The pending-instance key includes tenant and company together with document type and document ID. The dispatcher re-locks and revalidates that exact source tuple; no client identifier may widen or substitute scope.
- **Server-enforced authorization:** Actor identity, current membership/assignment, permission, scope, prohibited-actor rules, no-self-approval, and active-step eligibility are revalidated inside the action transaction. Inbox visibility and source-page access remain non-authoritative.
- **Approval segregation:** The canonical dispatcher retains `DEC-0050` and `DEC-0051` segregation controls and cannot accept a source-side shortcut around them.
- **Audit integrity:** Duplicate reconciliation is manual and audited, never destructive. Petty-cash intent history is immutable and one row per approval step; decisions, current proposal/version, source effect, audit, and permitted notification commit atomically.
- **Transaction consistency and idempotency:** The approval instance, current step, exact source, live authority, and applicable financial rows are locked and revalidated in one transaction. The database uniqueness constraint is the final duplicate guard.
- **Phase scope:** This decision hardens existing normalized approval and Phase III finance foundations. It does not add payment execution, AP settlement, bank mutation, journal posting, or an inferred finance policy.
- **Recovery and rollback:** Migration preflight fails closed on duplicates and requires audited reconciliation before retry. The flag remains off during migration and verification; rollback must preserve approval, intent, source, and audit history and must not auto-delete conflicts.

## Required safeguards

- Add a PostgreSQL partial unique index enforcing at most one `PENDING` `ApprovalInstance` for each `(tenant_id, company_id, document_type, document_id)` tuple. Application preflight may improve diagnostics but is not the integrity boundary.
- Make migration preflight enumerate and fail closed on any duplicate pending tuple. Resolve each conflict through an authorized, documented, auditable reconciliation; never auto-delete, silently merge, or rewrite approval history.
- Use one typed canonical dispatcher for Approval Inbox and source-workspace actions. Unsupported document families or missing family payloads fail closed.
- Inside the same action transaction, lock and revalidate the exact tenant/company/document tuple, pending approval instance, current active step, source row/version/state, and live actor authority before any mutation.
- Define and test one deterministic lock order. All participating family adapters must use the supplied transaction client and must not open an independent transaction or defer authoritative effects until after commit.
- Persist petty-cash current proposal and version in typed fields bound to the active approval instance. Persist exactly one immutable typed intent row for each acted approval step, with the actor, step, proposal/version, decision context, and timestamps required for audit.
- Atomically update the petty-cash current proposal/version, immutable step intent, canonical decision, source state/effect, audit, and permitted notification. Concurrent or retried actions must yield one authoritative outcome and no duplicate intent row.
- Do not interpret the petty-cash structure as permission to change an amount. Until Finance and Operations confirm the policy, no explicit amount differing from the current proposal may be accepted in either routing mode.
- For payment capacity, acquire deterministic locks on all applicable AP invoice rows before validation. Reload source state and recompute with database-exact `NUMERIC` arithmetic across the policy-approved set of active competing requests; do not use binary floating-point or a stale cached total.
- Do not approve a payment request until Finance confirms the exact `PAYMENT_READY`, match/tolerance, exception ownership, invoice/request status, outstanding-amount, and active-request inclusion/exclusion matrix. Capacity validation is a reservation/eligibility control only and is not AP settlement.
- Keep `APPROVAL_ROUTING_V1_ENABLED=false` until the reviewed migrations, exact-release all-family PostgreSQL matrix, petty-cash and payment policy confirmations, `DEC-0047` controlled-evidence qualification and transaction proof, and Database/Security/QA/Release acceptance all pass.

## Implementation and documentation impact

- Code / architecture: Converge Inbox and source actions on one typed canonical dispatcher and one supplied transaction boundary. Establish a documented deterministic lock order and remove independent decision authority from entry-point adapters before activation.
- Data / schema: A reviewed migration is required for the partial unique index and typed petty-cash current proposal/version and immutable per-step intent storage. Migration preflight, rollback considerations, constraints, and data-dictionary changes are required; this decision record does not implement them.
- Workflow / permissions: No new permission or amount-change authority is granted. All existing canonical live-authority, scope, no-self-approval, and prohibited-actor controls continue to apply.
- UI / mobile: No UI behavior is authorized by this record. Future petty-cash approval UI must not expose amount-change controls until policy is confirmed, and payment UI must not imply readiness, reservation, settlement, or release before the corresponding state is proven.
- Reporting: Future reporting may distinguish the current typed proposal from immutable per-step intent history, but no new financial metric or settlement status is confirmed here.
- Knowledge base / training: Dunong must assess role-based approval guidance only after the finance policies, implemented labels, and verified behavior are confirmed. No user-facing article should describe intermediate amount changes or payment readiness yet.
- Tests / UAT: Require populated-migration duplicate preflight, uniqueness race, canonical entry-point parity, lock-order/deadlock, stale source/version, live revocation, scope, no-self-approval, retry, rollback, audit/notification cardinality, petty-cash intent history, exact `NUMERIC` payment capacity, and concurrent payment-request coverage on PostgreSQL for every registered family.

### Budget Revision normalized-routing checkpoint — 2026-07-22

The confirmed order is now implemented for the normalized **Budget Revision** lifecycle only:

`sorted authority Users → acting AuthSession when present → exact pending ApprovalInstance → all ApprovalInstanceSteps by (stepOrder, id) → exact BudgetRevision source row → guarded mutations, audit, and permitted notification`.

`start_review` locks the acting commitment reviewer and the preselected deterministic first-step eligibility anchor, then revalidates that exact anchor at the original eligibility time. It changes only a coherent `SUBMITTED + all WAITING` graph to `UNDER_REVIEW + first PENDING`. Cancellation has an explicit Budget-only pre-review mode that atomically terminates the genuine all-`WAITING` graph. Approval, rejection, review activation, and cancellation fence stale requests with the source status plus `updatedAt`; this is a bounded stale-action token, not a numeric-version substitute. The invariant relies on Budget Revision having no same-status material mutation or transition back to `SUBMITTED`.

Fresh disposable PostgreSQL evidence applies all 126 migrations and passes 22/22 cancellation/lifecycle cases, including a flag-off Budget start-review/cancellation regression, both start orders for cancellation versus start-review and cancellation versus a first-step approval, exact-anchor revocation while lock-blocked, source-only stale-snapshot rollback, post-advance Start Review retry, atomic rollback, and no duplicate audit. Terminal final-step decision-versus-cancellation races remain an activation gate. This is a feature-disabled implementation checkpoint only. It does not enable normalized routing, resolve the remaining family/policy gates, or authorize production promotion.

## Open policy gaps preserved by this decision

1. **Petty-cash amount changes:** Finance and Operations must confirm whether a later approver may reduce, increase, restore, or leave unchanged the current proposal; the applicable bounds; required reason; whose acknowledgment or renewed consent is required; and which value is displayed at each step. The typed persistence structure records only behavior authorized by that future policy.
2. **Payment readiness and capacity population:** Finance and Accounts Payable must confirm the exact `PAYMENT_READY`, match/tolerance, exception-owner, invoice/request status, outstanding-amount, and active-request inclusion/exclusion matrix. Until confirmed, no capacity computation may be treated as approval eligibility or settlement.
3. **Expense commitment lifecycle and controlled evidence:** The unresolved `DEC-0051` expense commitment lifecycle and `DEC-0047` attachment qualification/selection rules remain open and continue to block affected production actions.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Design and review the partial unique-index and typed petty-cash intent migrations, including populated-data preflight and rollback | Database Engineering + Architecture | Before implementation merge | Pending |
| Perform authorized audited reconciliation if migration preflight finds duplicate pending tuples | Product Governance + Operations + Data owner | Before migration retry | Conditional; never automatic |
| Implement the single typed dispatcher, deterministic lock order, and transaction-bound family adapters | Backend Engineering + Architecture | Before normalized-routing activation review | In progress; Budget Revision normalized lifecycle checkpoint completed, remaining families pending |
| Confirm petty-cash later-step amount-change, reason, and acknowledgment policy | Finance + Operations | Before any intermediate amount-change behavior | Open policy |
| Confirm payment readiness, match/exception/status, outstanding-capacity, and active-request matrix | Finance + Accounts Payable | Before production payment-request approval | Open policy |
| Prove the all-family PostgreSQL behavioral matrix, including duplicate, lock, concurrency, intent, and exact-capacity cases | QA + Database Engineering + Security + Backend Engineering | Before flag enablement | Pending |
| Resolve and prove `DEC-0047` controlled-evidence policy for mapped finance actions | Finance + Security + Operations | Before affected production actions | Open policy |
| Complete Database, Security, QA, and Release review while the routing flag remains disabled | Release Manager + specialist reviewers | Before production activation | Pending |
| Prepare verified role-based guidance after policy and UI confirmation | Dunong | After production behavior is approved | Handoff required |

## Evidence

- The Decision Chair confirmed this structural conclusion on 2026-07-22 after independent Architecture, Database, Operations, and Security analysis and targeted challenge. Requested GPT-5.3 Codex Spark and `gpt-5.4` council models were unavailable; the closest available specialist roles were used. Model availability did not relax any hard gate or authorize implementation or activation.
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` requires independent material-decision review, parent confirmation, server authorization, approval segregation, audit completeness, atomic/idempotent transactions, phase discipline, and a rollback path.
- `docs/core/00-governance/DECISION_SCORECARD.md` makes operational correctness and control the highest-weight criterion and prohibits scoring from overriding approval, audit, tenancy, or transaction-integrity blockers.
- `docs/core/00-governance/decisions/DEC-0051-CANONICAL-APPROVAL-DECISION-PARITY-AND-ATOMIC-SOURCE-EFFECTS.md` confirms typed family commands, canonical decision authority, atomic final source effects, preserved petty-cash amount intent, fresh payment-source validation, and the disabled release posture.
- `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md` records the finance policies that remain unresolved and cannot be inferred from legacy behavior.
- The parent-provided debate conclusion records agreement on the PostgreSQL uniqueness boundary, manual audited duplicate reconciliation, transaction-time lock/revalidation set, typed petty-cash current/history model, deterministic invoice locks and exact arithmetic, and the activation gates. It is deliberation evidence, not proof that migration or behavioral gates have passed.

## Supersession

This decision is not superseded. It refines the structural implementation constraints of `DEC-0051` without resolving that record's open finance policies. A later decision that changes pending-instance uniqueness, canonical lock/dispatch authority, typed financial-intent storage, payment-capacity serialization, or the activation gates must explicitly supersede or amend this record.
