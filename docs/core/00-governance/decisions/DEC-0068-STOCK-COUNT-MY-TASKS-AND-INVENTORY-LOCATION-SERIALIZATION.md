# DEC-0068 — Stock Count My Tasks and Inventory-Location Serialization

## Metadata

- Decision ID: `DEC-0068`
- Title: Stock Count My Tasks and Inventory-Location Serialization
- Status: `Confirmed — production-gate verification pending`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared My Tasks / Phase I Stock Counts and Inventory Posting
- Related decision brief: Parent-confirmed Stock Count enrollment and inventory-location serialization conclusion, 2026-07-23; governed by `DEC-0063`, `DEC-0066`, and the Stock Count controls in `DEC-0013`, `DEC-0026`, and `DEC-0060`

## Decision

Enroll exactly one assigned, first-pass Stock Count task per eligible session: `Start stock count` for an assigned `DRAFT` session whose scheduled date has arrived, `Enter stock count` for an assigned `IN_PROGRESS` session with at least one uncounted snapshot line, or `Submit stock count` for an assigned `IN_PROGRESS` session with at least one snapshot line and no uncounted line. Each action requires its source permission, uses fixed `HIGH` priority with no due date, and is mutually exclusive. Future-scheduled drafts, zero-line sessions, `RECOUNT_REQUESTED`, `SUBMITTED`, `REVIEWED`, `CANCELLED`, review/recount, cancellation, and variance work are excluded.

Serialize inventory posting and Stock Count freeze transitions on a shared, transaction-bound lock of the complete affected `InventoryLocation` set. The set must be deduplicated, sorted by inventory-location UUID, scoped to the current tenant and company, locked with `FOR UPDATE`, and presented as a validated lock token to every nested inventory posting operation.

## Context

Stock Count work could not safely enter the shared queue by broad visibility or status alone. Entry and submission are assigned-counter actions, scheduled counts must not open early, a zero-line session is not executable, recount has different lifecycle semantics, and blind-count facts must remain unavailable to unauthorized or conflicted actors. Queue presence also cannot substitute for source reauthorization.

The same checkpoint exposed a cross-workflow race between movement posting and count freeze activation. A count could otherwise snapshot balances while receiving, transfer, wastage, adjustment, reversal, or direct movement posting changed the same inventory location. Locking only the source document, only an inventory balance row, or one transfer side at a time cannot establish one order across all affected locations. A common inventory-location serialization boundary is therefore a prerequisite for trustworthy count snapshots and movement-freeze enforcement.

## Options considered

### Option A — selected: assigned first-pass tasks plus shared inventory-location serialization

- Summary: Enroll only the three mutually exclusive assigned actions and require every inventory posting path and count freeze transition to use the shared, complete inventory-location lock set.
- Benefits: Queue membership matches executable source authority; future, recount, review, variance, cancellation, and invalid zero-line work remain out of the queue; blind facts remain protected; counts and postings serialize on the same durable row identity; multi-location work uses one deterministic order; and transaction rollback prevents partial snapshots or ledger effects.
- Failure modes: Count/page predicate drift; overlapping entry and submit tasks; early scheduled start; assignment checks present only in the UI; blind-data leakage through detail, activity, or export; incomplete review lineage; omitting one location from a transfer or reversal lock set; expanding a lock set after mutation starts; or a posting path bypassing the lock token.
- Why selected: It is the only considered option that passes assignment, confidentiality, ledger-integrity, transactional-consistency, and deadlock-ordering hard gates without inventing a new task state or schema.

### Option B — rejected: role-pooled or all-visible Stock Count tasks

- Summary: Enroll any visible session when the actor has a relevant Stock Count permission, regardless of assignment.
- Benefits: Produces a larger operational queue and could allow opportunistic branch coverage.
- Failure modes: Treats visibility as authority, exposes work the destination must reject, weakens accountability for blind entry, and permits UI/server assignment drift.
- Why selected or rejected: Rejected because first-pass entry and submission are assigned-counter obligations. Reassignment or pooled counting requires a separately confirmed workflow.

### Option C — rejected: include recount, review, cancellation, and variance actions

- Summary: Represent every visible Stock Count action as a separate shared task.
- Benefits: Appears to centralize more of the lifecycle.
- Failure modes: Recount is not a first-pass entry state; review requires protected-fact and segregation checks; cancellation is an exception path; variance work belongs to the reviewed adjustment bridge; and multiple rows could represent one source obligation.
- Why selected or rejected: Rejected. These actions have distinct authority, confidentiality, and lifecycle predicates and are not confirmed by this decision as shared task obligations.

### Option D — rejected: source-document or balance-only locking

- Summary: Retain per-workflow source locks, or lock only the inventory-balance rows touched by each movement.
- Benefits: Smaller localized changes and potentially narrower locks.
- Failure modes: Stock Count and posting paths do not share one source document; absent balance rows cannot be locked; transfer sides can be acquired in opposite orders; snapshot reads can race a posting; and reversals can touch locations not covered by the initial single-row lock.
- Why selected or rejected: Rejected because it cannot serialize all inventory effects against count freeze transitions.

### Option E / defer — rejected: postpone serialization and rely on optimistic checks

- Summary: Ship queue enrollment and detect concurrent changes after snapshot or posting work.
- Benefits: Avoids changing existing transaction lock contracts immediately.
- Failure modes: A snapshot can be internally inconsistent, movement freeze can begin after a posting has passed its check, and compensating logic would be needed for partially created lines or ledger effects.
- Why selected or rejected: Rejected because inventory and count integrity are hard gates, not post-release optimizations.

## Hard-gate assessment

- **Tenant, company, and location isolation:** Task predicates retain the source Stock Count scope, including the current operational location through `InventoryLocation`. Lock acquisition proves every requested inventory-location row belongs to the session tenant and company and rejects an empty, missing, extra, or out-of-scope result.
- **Server-enforced authorization and assignment:** Start and entry require `inventory.stock_count.enter`; submit requires `inventory.stock_count.submit`. Source commands reauthorize exact scope, state, permission, and `assignedToUserId = actor`. UI visibility mirrors, but never grants, those controls.
- **Segregation and blind-count confidentiality:** Protected system quantity, variance, reviewer identity/notes, adjustment linkage, and variance-disclosing audit activity are redacted according to actor, permission, state, blind-count, and complete-lineage rules. The detail UI limits entered quantities, notes, and counter facts to the assigned counter or an authorized reviewer. Review fails closed for zero, incomplete, un-attributed, or self-counted lineage and preserves creator/counter versus reviewer segregation.
- **Immutable inventory ledger:** The task adapter is read-only. Posting continues through the immutable movement ledger; the shared lock is required before nested posting can mutate balances or append movements.
- **Transactional consistency and idempotency:** Count transitions and all movement posting/reversal paths acquire the applicable inventory-location lock inside the same database transaction as state, balance, movement, and audit changes. Existing source-event idempotency remains authoritative; the lock does not replace it.
- **Phase scope and recovery:** This decision is confined to Phase I Stock Counts, inventory posting serialization, and shared task enrollment. It adds no schema, automation, recount redesign, or variance posting shortcut. Transaction failure rolls back all writes and releases locks; the queue adapter is removable without changing source records.

## Lock order and recovery contract

1. Resolve the complete affected inventory-location ID set before inventory mutation. Include both transfer sides and every original/related location required by reversal movements.
2. Deduplicate the set and sort UUIDs ascending. Acquire all requested `InventoryLocation` rows in one tenant/company-scoped `SELECT ... ORDER BY id ASC FOR UPDATE` statement. Never acquire the same set in caller order.
3. A workflow may hold its pre-existing source-aggregate locks before reaching the inventory boundary. After the inventory-location set is locked, do not expand or reacquire it; nested posting receives the transaction-bound branded token and may use only locations proven by that token.
4. Stock Count start, entry save, submit, review/recount decision, cancellation, and variance-adjustment generation acquire the inventory-location row before the Stock Count row. This makes freeze activation/deactivation and posting checks observe one serialized location state.
5. Re-read or lock authoritative source state and revalidate status, assignment, lineage, freeze, quantities, and idempotency after waiting for locks and before mutation. A stale caller must fail without mutation.
6. On validation error, serialization conflict, deadlock victim selection, or any write failure, allow the database transaction to roll back and release every lock. Do not retain snapshot lines, state changes, balances, movements, or audit events from a failed transaction. Retry only through the source command's safe idempotent or guarded semantics; do not blindly replay a non-idempotent action.
7. Rollback of this release requires coordinated reversion of callers and the branded posting signature in one deploy. No database downgrade or data backfill is required, but reverting only the shared lock helper while leaving updated callers, or vice versa, is unsupported.

## Required safeguards

- Keep the three task predicates exact and mutually exclusive:
  - assigned `DRAFT`, scheduled date null or reached, and enter permission → `Start stock count`;
  - assigned `IN_PROGRESS`, at least one snapshot line with null counted quantity, and enter permission → `Enter stock count`;
  - assigned `IN_PROGRESS`, at least one snapshot line, no null counted quantity, and submit permission → `Submit stock count`.
- Use one authoritative predicate set for total count and page reads. Bound each eligible action stream to requested size plus one, merge under the shared comparator, and return one task per session.
- Use fixed `HIGH` priority, null due date, `createdAt`, source rank, and Stock Count ID under the signed v2 cursor contract. Do not infer a due date from `scheduledDate`.
- Project only task identity, public reference, status, action label, creation time, and destination identity. Never expose count lines, quantities, variance, notes, people, review facts, or adjustment linkage in `My Tasks`.
- Reauthorize every destination action. Future-scheduled, unassigned/differently assigned, zero-line, already advanced, recount, submitted, reviewed, cancelled, moved-scope, or unauthorized sessions must fail without mutation.
- Keep server and UI assignment/state parity for start, entry, and submit. Explain read-only assignment, future schedule, incomplete entry, and zero-snapshot conditions on the detail surface.
- Redact the blind/protected fields defined by `DEC-0060` before response serialization, export construction, activity rendering, or shared response reuse. Limit entered quantities, notes, and counter facts on the detail UI to the assigned counter or an authorized reviewer. Review visibility and mutation must fail closed unless all snapshot lines have counted quantity, counter identity, and count timestamp and the reviewer is segregated from creator and all counters.
- Reject start when no current inventory balances exist. Any error while snapshotting must roll back the state transition and all created lines; an `IN_PROGRESS` zero-line session is never a queue task and cannot submit.
- Require the shared lock for direct movement posting; receiving post/reversal; transfer dispatch, receipt, and receipt reversal; wastage post/reversal; stock-adjustment post/reversal; and all Stock Count freeze transitions.
- Require nested posting to receive the branded token from the same transaction and prove every primary and related inventory-location ID is in its tenant/company-scoped lock set.
- Test task permission/assignment/state predicates, scheduled-date boundary, zero-line exclusion, mutual exclusivity, count/page parity, bounded minimal reads, stable cursor continuation, destination/UI parity, blind redaction, fail-closed lineage and self-review, snapshot rollback, lock scope/order/token validation, complete posting-path coverage, stale-state concurrency, and non-mutation.

## Implementation and documentation impact

- Code / architecture: Add `STOCK_COUNT` to the closed task registry and a source-owned bounded adapter. Introduce a shared inventory-location posting lock helper and transaction-bound branded token used by direct and nested posting. Stock Count transitions use the same serialization boundary.
- Data / schema: No schema change, migration, or backfill is authorized. `InventoryLocation` is the existing durable serialization row.
- Workflow / permissions: First-pass entry remains assigned-only. Start/entry and submit retain their distinct permissions. Recount, review, cancellation, and variance-generation authority remain source-only and unchanged by queue enrollment.
- UI / mobile: `My Tasks` links the applicable Start, Enter, or Submit obligation to authoritative Stock Count detail with fixed priority and no due date. Detail controls and explanatory read-only states mirror server assignment, schedule, line-completion, and protected-read rules.
- Reporting: No new report or export is authorized. Existing Stock Count exports must apply the same protected-fact redaction.
- Knowledge base / training: **Dunong handoff required after implementation verification.** Explain assigned first-pass task eligibility, schedule opening, entry-versus-submit handoff, excluded recount/review/cancellation/variance work, zero-line recovery, and movement-freeze messaging without documenting the internal lock implementation as a user action.
- Tests / UAT: Focused unit/service/surface tests are implementation evidence. Disposable PostgreSQL contention tests, responsive authenticated browser verification, and hosted deployment/recovery evidence remain mandatory before a production-ready claim.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Complete focused adapter, authorization, redaction, lineage, rollback, and serialization tests | Engineering + QA + Security | Before checkpoint commit | Implemented in current worktree; final validation pending |
| Run real PostgreSQL concurrent count-versus-posting and multi-location lock-order scenarios | Database + QA | Before Workspace 1 production-ready claim | Pending disposable-database gate |
| Verify Start, Enter, Submit, read-only assignment, future schedule, blind redaction, zero-line, and freeze states at desktop, tablet, and mobile widths | Frontend + QA | Before Workspace 1 production-ready claim | Pending browser gate |
| Validate hosted migration/deploy, rollback compatibility, logs, contention behavior, and recovery controls | DevOps + Release | Before production release | Pending hosted gate |
| Update user-facing help, release-note impact, and training assessment | Dunong | After independent implementation verification | Handoff required |

## Evidence

- Parent-confirmed conclusion, 2026-07-23: assigned-only first-pass `DRAFT` Start and `IN_PROGRESS` Entry/Submit; exact mutually exclusive predicates; fixed `HIGH`/no due; exclusion of future scheduled, zero-line, recount, review, cancellation, reviewed/variance, and terminal work; and shared inventory-location serialization for posting and freeze transitions.
- Independent workflow, architecture, security, and QA deliberation converged on the selected enrollment and lock boundary. Required prerequisites were assignment parity, actor/state-aware blind redaction, fail-closed review lineage, transactional zero-line rollback, and complete deterministic inventory-location locking.
- Requested Code Spark and exact GPT-5.4/GPT-5.4-mini models were unavailable in the active toolset. The Decision Chair used the closest permitted GPT-5.6 role specialists. This fallback did not relax any hard gate, safeguard, or evidence requirement.
- `docs/core/00-governance/DEC-0063-CROSS-SOURCE-DASHBOARD-QUEUE-PAGINATION-DECISION-BRIEF.md`: closed registry, source-owned predicates, bounded seek pagination, minimal projection, count/page parity, destination reauthorization, and non-mutation.
- `docs/core/00-governance/decisions/DEC-0066-INCIDENT-MY-TASKS-AND-V2-ORDERING.md`: signed v2 priority, due, age, source, and record ordering contract.
- `docs/core/00-governance/decisions/DEC-0013-PHYSICAL-COUNT-FOUNDATION-BEFORE-VARIANCE-POSTING.md`, `DEC-0026-STOCK-COUNT-VARIANCE-ADJUSTMENT-BRIDGE.md`, and `DEC-0060-BLIND-COUNT-REDACTION-AND-COUNT-VARIANCE-DASHBOARD-ACCESS.md`: Stock Count lifecycle, reviewed variance bridge, confidentiality, and segregation controls.
- `apps/web/src/server/services/stockCounts.ts`: task predicates and bounded adapter; assignment, schedule, state, lineage, snapshot, transition, and inventory-location locking controls.
- `apps/web/src/server/services/inventory.ts`: canonical tenant/company-scoped multi-location `FOR UPDATE` helper, transaction-bound lock token, movement freeze check, and nested posting enforcement.
- `apps/web/src/server/services/receiving.ts`, `transfers.ts`, `wastage.ts`, and `stockAdjustments.ts`: posting and reversal callers that acquire the complete lock set and pass the token to nested ledger posting.
- `apps/web/src/app/(app)/counts/[id]/page.tsx`: assigned actor, schedule, line state, protected-read, freeze messaging, and source-action UI parity.
- `apps/web/src/server/services/stockCounts.test.ts`, `inventory.test.ts`, `receivingSerialization.test.ts`, and `apps/web/src/app/(app)/counts/[id]/page.test.ts`: focused predicate, redaction, lineage, rollback, lock-contract, posting-coverage, and visible-surface tests present in the implementation checkpoint; their final run evidence belongs in the implementation plan/checkpoint report.
- `AGENTS.md` sections 4-9 and 13: exact scope, server authorization, immutable ledger, transaction/locking, visible-surface parity, validation, and decision hard gates.

## Pending production-readiness evidence

This record confirms the design and records the current implementation prerequisites; it does not prove Workspace 1 or Stock Counts production-ready. The following evidence remains outside this decision record and must stay open in `CURRENT_PENDING_IMPLEMENTATION_PLAN.md` until executed successfully:

- disposable PostgreSQL contention tests covering count start/freeze against every posting family, opposite-direction multi-location transfers, reversals, lock waiting, stale state, and rollback;
- authenticated browser verification of all affected desktop, tablet, and mobile states, including denied and stale destination behavior;
- hosted deployment, migration compatibility, rollback, observability, backup/recovery, and contention monitoring gates.

## Supersession

This decision is not superseded. It adds Stock Count first-pass enrollment under `DEC-0063` and the `DEC-0066` v2 order, and strengthens the transaction boundary supporting `DEC-0013`, `DEC-0026`, and `DEC-0060`. Any future pooled counting, reassignment flow, recount task, review/variance task enrollment, scheduled-date prioritization, or different inventory serialization identity requires a new confirmed decision that explicitly supersedes or amends this record.
