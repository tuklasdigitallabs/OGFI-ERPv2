# DEC-0264 — Immutable Recount Recovery Implementation Contract

## Metadata

- Decision ID: `DEC-0264`
- Title: Immutable recount recovery implementation contract
- Status: `Confirmed`
- Date: 2026-07-31
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I Inventory Control Pilot — Stock Counts,
  Stock Adjustments, approvals, and immutable inventory ledger
- Related decisions: `DEC-0023`, `DEC-0026`, `DEC-0060`, `DEC-0068`,
  `DEC-0098`, `DEC-0258`, `DEC-0260`, `DEC-0261`, `DEC-0262`
- Related decision brief: Parent-led `P4-RECOUNT-001` database/state contract

## Decision

Implement the complete `DEC-0098` recount and obsolete-variance recovery
boundary as one default-off Phase 4 slice. Attempt 2 and later are authoritative
`StockCountAttempt`/`StockCountAttemptLine` records and never overwrite attempt
1 compatibility evidence. The initial implementation always establishes a new
cutoff; cutoff retention remains unavailable until continuous-freeze proof is
separately implemented and verified.

A recount cannot be admitted while its linked Count Variance adjustment remains
postable. `DRAFT`, `SUBMITTED`, `RETURNED`, and `PENDING_APPROVAL` adjustments
must complete the ordinary controlled cancellation workflow first. An
`APPROVED` but unposted adjustment is voided for recount atomically with
successor-attempt creation. A `POSTED` adjustment must complete the durable
full-document reversal workflow first. Only after the applicable disposition is
terminal may the session point to the successor. No pre-disposition
`RECOUNT_REQUESTED` state is allowed.

This decision does not activate Count Variance generation/posting, recount My
Tasks, production configuration, or an operational pilot.

## Context

The attempt-1 model, dual-write/parity foundation, current-attempt pointer, and
exact attempt/adjustment lineage guards already exist. Count Variance remains
disabled because a later recount must preserve the reviewed attempt and must not
leave an obsolete approved adjustment, approval retry, notification, or posting
action capable of changing inventory. A recount-only implementation would add
new evidence but would not close that recovery hazard.

Existing writers also impose a concrete lock-order constraint. Adjustment post,
approval, cancellation, and reversal lock the Stock Adjustment header before
their inventory-location work, while Stock Count actions lock the inventory
location before the session and current attempt. Recount recovery must compose
these orders without introducing a location-to-adjustment inversion.

## Options considered

### Option A — selected: full default-off recovery boundary

- **Summary:** Deliver attempt-native recount plus the complete linked-adjustment
  disposition contract behind a default-off gate.
- **Benefits:** Preserves immutable attempt evidence, prevents obsolete variance
  posting, supplies an exact recovery path, and establishes one eventual
  activation candidate without a second lineage redesign.
- **Failure modes:** Lock-order inversion, partial void/successor mutation,
  duplicate successors, stale authority, approval/notification residue, blind
  count disclosure, or accidental Count Variance activation.
- **Why selected:** It is the only implementation option that passes inventory,
  audit, adjustment-recovery, transaction, and idempotency hard gates while
  advancing the urgent pilot dependency.

### Option B — rejected: recount-only implementation

- **Summary:** Create immutable successor attempts but defer obsolete-adjustment
  cancellation, void, reversal, and approval settlement.
- **Benefits:** Smaller immediate service and schema change.
- **Failure modes:** A successor could become current while a prior Count
  Variance adjustment or retry remained postable; the case and ledger authority
  could diverge.
- **Why rejected:** It fails the recovery and transaction-consistency hard
  gates. Blocking recount whenever any adjustment exists is safe but does not
  complete the confirmed `DEC-0098` recovery contract.

### Option C — retained fallback: defer recovery and keep Count Variance disabled

- **Summary:** Make no recount mutation available and retain the existing
  disabled Count Variance boundary.
- **Benefits:** Safest response whenever implementation or evidence is
  incomplete; no new inventory authority.
- **Failure modes:** Operational variances remain unresolved through the ERP and
  the Inventory Control Pilot cannot advance through this dependency.
- **Why not selected:** It does not meet the active pilot objective, but remains
  the mandatory runtime fallback until every activation gate passes.

## Decision scorecard

Option B is rejected before scoring because it fails recovery and transactional
consistency. Scores use the repository 1–5 weighted scorecard.

| Criterion | Weight | Option A | Option B | Option C |
|---|---:|---:|---:|---:|
| Operational correctness and control | 30% | 5 | Hard-gate reject | 5 |
| Business value | 20% | 5 | Hard-gate reject | 1 |
| User adoption and branch usability | 15% | 4 | Hard-gate reject | 1 |
| Delivery effort and risk | 15% | 3 | Hard-gate reject | 5 |
| Maintainability and scalability | 10% | 5 | Hard-gate reject | 3 |
| Operating cost | 5% | 4 | Hard-gate reject | 2 |
| Reversibility | 5% | 5 | Hard-gate reject | 5 |
| **Weighted total** | **100%** | **4.50 / 5** | **Not scored** | **3.25 / 5** |

## Hard-gate assessment

- **Scope isolation:** Case, source/successor attempts, adjustment, approval,
  evidence, and inventory location retain exact tenant/company/location lineage.
  Scope is checked before locks and rechecked from locked authoritative rows.
- **Server authorization:** Recount recovery requires a dedicated permission,
  live assignment/scope verification, privileged MFA, reason, configured
  evidence, and a scoped idempotency key/request digest. UI visibility grants no
  authority.
- **Segregation:** Provisional fail-closed actor validators exclude the source
  session/attempt creator, assigned counter, attempt-line counters, linked
  adjustment requester, and recorded adjustment approvers from recovery. The
  exact poster-versus-approver rule remains an **OPEN activation blocker** and
  may not be relaxed or inferred during implementation.
- **Immutable ledger/audit:** Prior attempts and lines are never edited. An
  unposted void creates no movement. A posted adjustment uses only the existing
  full-document reversal with exact source-movement lineage. Transition,
  disposition, actor, reason, evidence, and replay facts are durable and
  auditable.
- **Transaction/idempotency:** Approved-unposted void, approval settlement,
  successor creation, transition evidence, and current-attempt switch succeed
  or roll back together. Same-key/same-digest replay is stable; changed payload
  or actor conflicts fail closed. Only one successor may leave a source attempt.
- **Phase discipline:** Attempt-native recount/recovery remains default-off.
  Count Variance generation/posting and recount My Tasks remain disabled.
- **Recovery/migration:** The migration is additive and forward-only. Attempt-1
  and legacy evidence remain unchanged; attempt 2+ never writes legacy count
  lines. Feature-off is the rollback posture until migration, authorization,
  concurrency, browser, recovery, and UAT evidence pass.

## Exact state and transaction contract

1. The source attempt must be the locked current attempt, `REVIEWED`, exact
   scope, and without an existing successor transition.
2. A successor uses the same session, tenant, company, inventory location,
   blind-count rule, and `attemptNumber = source.attemptNumber + 1`.
3. The successor begins `DRAFT`; the stable session becomes
   `RECOUNT_REQUESTED` and points to it only after adjustment disposition is
   terminal. There is no earlier `RECOUNT_REQUESTED` mutation.
4. Recount start separately acquires the canonical inventory-location lock,
   takes a new database cutoff, creates a fresh attempt-native balance snapshot,
   and moves the successor/session to `IN_PROGRESS` atomically. Version 1 does
   not retain an earlier cutoff.
5. `DRAFT`, `SUBMITTED`, `RETURNED`, or `PENDING_APPROVAL` linked adjustments are
   rejected with guidance to complete normal cancellation first.
6. `APPROVED` unposted recovery locks and proves every adjustment line has no
   posted movement, then atomically marks the adjustment void-for-recount,
   terminally settles remaining approval/posting authority, creates the
   successor/transition, and switches the current pointer.
7. `POSTED` linked adjustments are rejected until the existing durable full
   reversal is complete. A verified `REVERSED` adjustment may then support
   successor creation; reversal is not nested inside recount admission.
8. Terminal cancelled/voided/reversed disposition is revalidated after locks.
   `POSTING`, partial lineage, multiple linked adjustments, or ambiguous graph
   state fails retryably or closed without a successor.

### Canonical lock order

For approved-unposted void plus successor admission:

1. preflight exact permission/scope/MFA inputs without target locks;
2. shared Stock Adjustment approval-producer barrier;
3. linked `StockAdjustment` header `FOR UPDATE`;
4. `InventoryLocation` and parent `Location` scope rows `FOR SHARE`;
5. adjustment lines in `lineNumber, id` order;
6. applicable Approval Instance and steps in deterministic order;
7. canonical inventory-location `FOR UPDATE` lock;
8. `StockCountSession FOR UPDATE`;
9. exact current source attempt, then its lines in `lineNumber, id` order;
10. locked-row permission/scope/MFA/version/disposition recheck, followed by
    compare-and-set mutation and append-only evidence.

Normal cancellation and posted reversal remain separate durable commands using
their established lock order. Recount admission must not invoke reversal inside
its transaction. A future Count Variance writer may not activate while it still
uses a location/count-before-existing-adjustment order that could invert this
contract.

## Required safeguards and tests

- Add exact-scope composite foreign keys or equivalent `ENABLE ALWAYS` guards
  for transition, source/successor attempt, session, adjustment, and location
  lineage; enforce unique source successor, unique successor target, and scoped
  idempotency identity.
- Enforce one open attempt per session and a commit-valid exact current-attempt
  pointer. New attempt lines cannot carry attempt-1 legacy-line identifiers.
- Keep transition/recovery evidence append-only and prohibit terminal attempt
  or line edits.
- Prove same-key replay, different-payload/actor conflict, and two-key races
  create exactly one successor.
- Prove approved void versus posting and approval-decision races: either posting
  wins and recount requires reversal, or void wins with zero movement and no
  remaining posting authority.
- Prove cancellation and reversal prerequisites, `POSTING` denial, exact-once
  reversal, and no partial or duplicate movement.
- Inject failures after approval settlement, void, transition insert, successor
  insert, pointer switch, and audit/notification work; every failure must roll
  back the complete admission.
- Prove movement-versus-recount-start ordering: a movement commits before and is
  included in the new snapshot, or waits and is denied after the freeze.
- Prove adjacent location, cross-company/tenant, revoked permission/scope,
  stale/absent MFA, missing evidence/reason, and prohibited-actor denial with
  zero source, graph, notification, audit, balance, movement, or successor
  mutation.
- Prove blind-count redaction for attempt 2+ across detail, activity, export,
  dashboard, and direct target reads.
- Run migration/redeploy, existing attempt-1 parity, trigger/ACL/role,
  disposable-PostgreSQL concurrency, Docker-isolated regression, responsive
  browser, recovery rehearsal, and signed UAT gates before activation.

## Implementation and documentation impact

- **Code / architecture:** Add a focused default-off recovery service and reuse
  transaction-bound cancellation/reversal primitives without creating a generic
  workflow bypass.
- **Data / schema:** Add immutable recovery-transition/idempotency lineage and
  the minimum void metadata/constraints required by the confirmed contract.
  Preserve all attempt-1 and adjustment approval history.
- **Workflow / permissions:** Add a dedicated recount-recovery permission and
  privileged MFA/reason/evidence boundary. Keep provisional strict actor denial;
  poster-versus-approver remains unresolved and blocks activation.
- **UI / mobile:** No surface is authorized by this decision checkpoint.
  Future work requires a focused recovery action with explicit prerequisite and
  disabled reasons; recount does not enter My Tasks in this slice.
- **Reporting:** Future reads must distinguish stable case, source attempt,
  current successor, voided adjustment, and reversed adjustment without double
  counting.
- **Knowledge base / training:** Dunong assessment is required only after the
  workflow and labels are implemented and verified. This decision alone does
  not announce availability.
- **Tests / UAT:** All safeguards above plus production-authenticated responsive
  browser evidence and human UAT are activation-blocking.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement additive recovery schema and exact database guards. | Database / Backend | Phase 4 local slice | Pending |
| Implement dedicated permission, MFA, evidence, idempotency, and atomic approved-void admission. | Backend / Security | After schema | Pending |
| Resolve poster-versus-approver segregation policy. | Product / Operations / Security | Before activation | **Open blocker** |
| Verify concurrency, rollback, authorization, redaction, and migration contracts. | QA / Security / Database | Before local slice completion | Required |
| Implement focused desktop/mobile recovery UI and Dunong enablement. | Frontend / Dunong | After backend verification | Pending |
| Execute recovery rehearsal, production-authenticated UAT, and Release Board review. | Release / Operations / QA | Before activation | Blocking |

## Evidence

- `DEC-0098` confirms additive immutable attempts and obsolete-variance recovery.
- The current schema/migrations provide attempt 1, current-attempt scope guards,
  immutable line history, and unique attempt-to-adjustment lineage.
- Current Stock Count services keep Count Variance disabled and use the
  inventory-location-before-session/attempt lock order.
- Current Stock Adjustment post, approval, cancellation, and reversal services
  lock the adjustment header before their inventory-location work; the challenge
  round used that actual order to select the contract above.
- Parent-led Database, Security, Workflow, QA, and challenge review confirmed
  `P4-RECOUNT-001` on 2026-07-31.
- Requested Code Spark and GPT-5.4-mini subagent models were unavailable;
  GPT-5.6 Terra was used as the closest permitted fallback without relaxing the
  deliberation protocol or hard gates.

## Supersession

This record implements the open state/transaction contract under `DEC-0098`.
It does not supersede `DEC-0098`, blind-count redaction, ordinary Stock
Adjustment cancellation/reversal, or inventory-location serialization. If any
required control is absent, Option C remains authoritative: recount recovery and
Count Variance stay disabled.
