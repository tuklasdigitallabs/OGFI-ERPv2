# DEC-0262 — Submitted Stock-Count Cancellation Guard

## Metadata

- Decision ID: `DEC-0262`
- Title: Submitted Stock-Count Cancellation Guard
- Status: `Confirmed`
- Date: 2026-07-31
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I Inventory Control Pilot, Stock Count Attempt
  Review, normalized approvals, and immutable count evidence
- Related decisions: `DEC-0013`, `DEC-0049`, `DEC-0098`, `DEC-0099`,
  `DEC-0258`, `DEC-0260`, `DEC-0261`
- Related decision brief: Parent-led decision on reconciling controlled
  submitted-count cancellation with the immutable attempt-history guard

## Decision

Permit exactly `SUBMITTED -> CANCELLED` for the current stock-count attempt
through the controlled stock-count cancellation transaction. Add the exception
through a new forward-only migration, preserve all submitted evidence, require a
cancellation timestamp, a nonblank reason, and an exact version increment of
one, and atomically cancel the parent session, current attempt, and pending
normalized approval graph without creating inventory movement.

All other mutations of submitted or terminal attempt evidence remain denied.
This decision does not activate the Inventory Pilot or authorize UAT or
production use.

## Context

The controlled cancellation service already permits a submitted stock-count
session to be cancelled when its exact current attempt and pending normalized
approval lineage are coherent. The historical database guard, however, allowed
only submitted review or recount transitions and treated the attempt-side
cancellation update as a prohibited mutation. That mismatch could roll back an
otherwise valid cancellation after its approval graph was terminated, leaving
the product contract and database contract inconsistent.

The owner confirmed the Database recommendation to preserve the supported
cancellation workflow with a narrow additive guard exception. The decision does
not weaken the general append-only rule: submitted quantities, count settings,
scope, lineage, evidence, submission facts, review facts, actors, and creation
facts remain immutable, and a cancelled attempt cannot be changed again.

The requested Code Spark and GPT-5.4-mini subagent models were unavailable. The
owner authorized the closest permitted GPT-5.6 Terra fallback for the independent
Database analysis; the fallback did not relax independence, the implementation
lock, inventory-integrity gates, or the required evidence.

## Options considered

### Option A — selected: narrow additive `SUBMITTED -> CANCELLED` guard exception

- **Summary:** Replace the guard function in a new forward-only migration so it
  accepts only the exact controlled cancellation delta while preserving the
  existing review/recount transitions and all other immutability enforcement.
- **Benefits:** Aligns service and database behavior; preserves the operational
  ability to withdraw a pending count review; retains submitted evidence and
  approval lineage; and avoids rewriting migration history.
- **Failure modes:** An incomplete field comparison could permit evidence drift;
  a missing version, reason, or timestamp predicate could permit an ambiguous
  terminal transition; or non-atomic service behavior could strand the approval
  graph or source aggregate.
- **Why selected:** With the safeguards below, this is the smallest option that
  passes workflow, audit, concurrency, recovery, and inventory-ledger hard gates.

### Option B — rejected: prohibit cancellation after submission

- **Summary:** Keep the historical guard unchanged and restrict cancellation to
  pre-submission stock counts.
- **Benefits:** Maintains the narrowest possible terminal-history guard.
- **Failure modes:** Strands a supported pending approval when an authorized
  operator must withdraw it, conflicts with the controlled service lifecycle,
  and would require a separate product, UI, and recovery-policy change.
- **Why rejected:** No confirmed policy removed submitted-count cancellation,
  and the database can safely enforce the controlled transition without making
  submitted evidence mutable.

### Option C — rejected: relax or bypass the attempt-history guard

- **Summary:** Disable the trigger, grant a privileged bypass, permit broad
  updates while status is submitted, or edit the historical migration.
- **Benefits:** Would make the immediate cancellation update easy to execute.
- **Failure modes:** Could rewrite count quantities, evidence, scope, lineage,
  or actor history; would weaken owner/replication-path protection; and would
  make deployed migration history diverge.
- **Why rejected:** It fails immutable-history, audit, migration-integrity, and
  least-privilege hard gates.

### Option D — rejected: cancel only the session or approval graph

- **Summary:** Leave the attempt as `SUBMITTED` while cancelling another part of
  the aggregate.
- **Benefits:** Avoids changing the attempt guard.
- **Failure modes:** Produces contradictory session, attempt, and approval
  states; makes current-attempt evidence ambiguous; and complicates recovery and
  reporting.
- **Why rejected:** The parent session, current attempt, and pending graph must
  settle as one coherent terminal aggregate.

## Hard-gate assessment

- **Tenant/company/location isolation:** The controlled service retains its
  exact scoped source and current-attempt predicates. The trigger exception
  cannot change tenant, company, inventory location, session, or attempt
  identity.
- **Server authorization:** The transition remains available only through the
  permission-checked cancellation service; the database exception grants no new
  user role or UI authority.
- **Approval segregation:** Cancellation terminates only the exact pending
  `StockCountAttemptReview` graph bound by the immutable typed submission intent.
  It does not approve, return, or reject the count.
- **Immutable ledger and audit:** No inventory movement or balance update is
  created. Submitted count evidence and all non-cancellation terminal facts
  remain immutable; cancellation writes its reason, timestamp, actor audit, and
  graph identity.
- **Transaction consistency and idempotency:** The graph, session, attempt, and
  audit event change in one database transaction. Exact source locks and version
  compare-and-swap predicates serialize cancellation against a terminal review;
  one succeeds and the other fails without partial state.
- **Phase scope:** The exception applies only to the existing Phase I stock-count
  attempt lifecycle. It does not enable variance posting, opening stock, or any
  deferred workflow.
- **Recovery and rollback:** The migration is additive and forward-only. An
  injected late failure must roll back graph, session, attempt, and audit changes
  together; recovery settles forward without deleting history.

The implementation lock for this exact guard correction is cleared. The
Inventory Pilot and Phase I remain **NO-GO** pending all remaining database,
authorization, browser, recovery, operational-cohort, UAT, and release gates.

## Required safeguards

1. Deliver the guard correction only through a new migration; never edit,
   disable, or remove the historical append-only migration or trigger.
2. Accept only an old `SUBMITTED` status and new `CANCELLED` status where the
   prior cancellation fields are null, the new timestamp is present, the
   trimmed reason is nonblank, and `version = old version + 1`.
3. Compare every identity, scope, count-setting, submission, review, evidence,
   actor, and creation field and reject the transition if any changes.
4. Keep the trigger invoker-rights with a fixed `pg_catalog` search path and no
   runtime or `PUBLIC` execution authority outside the reviewed trigger path.
5. Lock and validate the exact session, current attempt, typed submission intent,
   and pending graph before mutation. Reject missing, duplicate, stale, or
   mismatched lineage.
6. Cancel the pending graph, session, and current attempt and write the audit
   event in one transaction. Any failure must restore their complete prior
   state.
7. Prove cancellation-versus-approval serialization, late-failure rollback,
   direct evidence-tampering denial before and after cancellation, version
   increments, graph/source coherence, and zero inventory movement.
8. Keep real pilot configuration and activation default-off until the remaining
   release gates and named operational roster are confirmed.

## Implementation and documentation impact

- **Code / architecture:** The existing controlled cancellation transaction is
  retained. No new public route, producer, or positive activation authority is
  introduced.
- **Data / schema:** A forward-only migration replaces
  `guard_stock_count_attempt_history()` with the exact submitted-cancellation
  exception. No table, column, or historical record is removed.
- **Workflow / permissions:** Authorized cancellation may settle an admitted,
  pending submitted count. Existing cancellation permission, exact location
  scope, typed intent, and approval-lineage checks remain required.
- **UI / mobile:** No new visible action or label is introduced by this record;
  the existing cancellation action retains its reason requirement.
- **Reporting:** Session, current attempt, pending graph, and audit history must
  report one coherent cancellation without treating it as a count variance or
  inventory movement.
- **Knowledge base / training:** Dunong should clarify the already-visible
  submitted-count cancellation behavior before shadow UAT; this architecture
  must not be described as operationally active yet.
- **Tests / UAT:** Database guard, malicious-update, concurrency, rollback,
  authorization, and no-movement evidence are blocking. Local or disposable
  evidence does not replace production-authenticated browser UAT or release
  signoff.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Apply the exact additive submitted-cancellation guard migration. | Database Engineering | Current local-only pilot slice | Implemented locally |
| Verify malicious terminal/evidence updates remain denied and the controlled cancellation succeeds. | Database / QA / Security | Before pilot activation | Completed in the fresh local disposable exact-ledger gate |
| Verify cancel-versus-review concurrency, injected rollback, graph/source coherence, and zero movement. | QA / Security | Before pilot activation | Completed in the fresh local disposable exact-ledger gate; external release gates remain blocking |
| Update stock-count source-of-truth and enablement documentation. | Mithi / Dunong | Before shadow UAT | Completed for the default-off local behavior; reassess before activation |
| Confirm the real cohort, named users, recovery exercise, role-based UAT, and release approval. | Product Owner / Operations / Security / Release | Before any operational activation | Blocking |

## Evidence

- [`DEC-0098`](DEC-0098-RECOUNT-ATTEMPT-IMMUTABLE-RECOVERY.md) — immutable
  attempt lineage and terminal-history contract.
- [`DEC-0260`](DEC-0260-INVENTORY-PILOT-TRANSFER-AND-COUNT-APPROVAL-SEMANTICS.md) —
  attempt-grained normalized count review and exact terminal approval semantics.
- [`DEC-0261`](DEC-0261-INVENTORY-PILOT-RELATIONAL-CLASSIFIER-ACTIVATION-AND-SUBMISSION-INTENTS.md) —
  typed submission-intent, source-version, activation, and atomicity contract.
- [`20260731100000_stock_count_submitted_cancellation_guard/migration.sql`](../../../../packages/database/prisma/migrations/20260731100000_stock_count_submitted_cancellation_guard/migration.sql) —
  additive exact-transition guard with fixed search path and immutable-field
  comparisons.
- [`stockCounts.ts`](../../../../apps/web/src/server/services/stockCounts.ts) —
  controlled scoped cancellation, approval-lineage termination, source/attempt
  version compare-and-swap, and audit transaction.
- [`stockCountSubmittedCancellationGuardSchema.test.ts`](../../../../packages/database/src/stockCountSubmittedCancellationGuardSchema.test.ts) —
  structural guard regression coverage.
- [`inventoryPilotApprovalPgIntegrity.integration.test.ts`](../../../../apps/web/tests/inventoryPilotApprovalPgIntegrity.integration.test.ts) —
  executable direct-evidence tampering denial, controlled cancellation,
  post-cancellation/review immutability, and zero-movement coverage.
- [`inventoryPilotApprovalPgConcurrency.integration.test.ts`](../../../../apps/web/tests/inventoryPilotApprovalPgConcurrency.integration.test.ts) —
  cancel-versus-terminal-decision serialization and coherent terminal-state
  coverage.
- [`inventoryPilotApprovalPgRollback.integration.test.ts`](../../../../apps/web/tests/inventoryPilotApprovalPgRollback.integration.test.ts) —
  injected late-audit-failure rollback of graph, session, and attempt.
- [`run-disposable-postgres-tests.mjs`](../../../../scripts/run-disposable-postgres-tests.mjs) —
  direct runtime trigger-disable denial and replication-mode terminal-evidence
  mutation rejection in the marked disposable database.
- Parent decision brief and the independent owner-authorized GPT-5.6 Terra
  Database recommendation confirmed on 2026-07-31. Code Spark and GPT-5.4-mini
  were unavailable; using the closest permitted fallback did not waive any hard
  gate.

## Supersession

This record supplements `DEC-0098`, `DEC-0260`, and `DEC-0261`. It does not
supersede immutable attempt history, count-review segregation, typed approval
lineage, inventory-ledger, activation, or release-control decisions. Any further
mutable transition from `SUBMITTED`, `REVIEWED`, `RECOUNT_REQUESTED`,
`CANCELLED`, or `VOIDED_FOR_RECOUNT` requires a separate confirmed decision.
