# DEC-0260 — Inventory Pilot Transfer and Count Approval Semantics

## Metadata

- Decision ID: `DEC-0260`
- Title: Inventory Pilot Transfer and Count Approval Semantics
- Status: `Confirmed`
- Date: 2026-07-30
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I Inventory Control Pilot transfers, stock counts,
  normalized approvals, authorization, and inventory controls
- Related decisions: `DEC-0010`, `DEC-0011`, `DEC-0012`, `DEC-0013`,
  `DEC-0019`, `DEC-0023`, `DEC-0036`, `DEC-0041`, `DEC-0049`, `DEC-0098`,
  `DEC-0099`, `DEC-0222`, `DEC-0225`, `DEC-0258`, `DEC-0259`
- Related decision brief: Parent-led decision on normalized approval semantics for
  Inventory Pilot transfers and ordinary physical-count review

## Decision

Every transfer that touches the bounded Inventory Pilot endpoints and SKU cohort
must use normalized approval. There is no direct-authorized or policy-skip branch
in the pilot: a missing route, ineligible approver, or unresolved server-owned
pilot-scope classification fails closed. A future hybrid or no-approval path
requires a separate owner-confirmed, versioned server policy and an immutable
no-approval intent record.

Use the exact persisted approval family/document key `InventoryTransfer` for a
transfer and `StockCountAttemptReview` for ordinary physical-count review.
Ordinary review is attempt-grained: its source relation and `documentId` are
`StockCountAttempt.id`, while the user interface continues to surface the parent
`StockCountSession`. `StockCountVarianceAdjustment` remains a separate later
correction family and cannot substitute for ordinary count review.

## Context

The current transfer workflow changes `DRAFT` directly to `REQUESTED`, and the
current count workflow changes `IN_PROGRESS` to `SUBMITTED` before a separate
manager review changes it to `REVIEWED`. Neither path creates a normalized
approval instance. That gap conflicts with the Inventory Pilot requirement that
every admitted transfer and count resolve an approval route, preserve
segregation of duties, and produce exact approval evidence.

The decision also had to resolve the count source grain. The session is the
operator-facing container, but recount integrity depends on immutable attempts
and an unambiguous `currentAttemptId`. Attaching approval to the session would
allow a later attempt to replace the reviewed evidence unless every decision
were additionally pinned to an attempt. The selected attempt-grained document
key makes the approval evidence exact while retaining the session as the visible
workflow surface.

The owner confirmed the conclusion after independent GPT-5.6 Workflow,
Architecture, and Security positions and a targeted challenge round. Code Spark
and GPT-5.4-mini were unavailable; the owner explicitly authorized the closest
available fallback. The fallback did not change council roles, the evidence
standard, implementation lock, scorecard, or hard gates.

## Confirmed workflow contract

### Inventory transfer

1. The normalized approval family and document key are exactly
   `InventoryTransfer`; `documentId` identifies the immutable transfer source
   record.
2. Submitting a `DRAFT`, or a `RETURNED` transfer that passes the lineage-safe
   resubmission checks, must atomically create a new immutable approval graph and
   move the transfer to `PENDING_APPROVAL`.
3. Final approval must atomically complete the approval graph and move the
   transfer to `REQUESTED`. Only `REQUESTED` is dispatchable through the existing
   controlled dispatch workflow.
4. Return-for-revision terminates the current approval cycle as returned and
   moves the source to `RETURNED`. Resubmission creates a new cycle without
   altering or deleting the prior cycle or actions.
5. Rejection terminates the current graph as rejected and leaves the transfer
   non-dispatchable. Cancellation before dispatch cancels any active approval
   graph and leaves the source non-dispatchable. Return, rejection, and
   cancellation create no inventory movement and preserve source, graph, action,
   reason, actor, and timestamp history.
6. A dispatched transfer is outside this pre-dispatch cancellation contract; it
   continues to require receipt, dispute, return-transfer, or reversal handling
   under the existing transfer decisions.

### Ordinary stock-count review

1. The normalized approval family and document key are exactly
   `StockCountAttemptReview`. Its source relation and `documentId` are
   `StockCountAttempt.id`; the selected parent `StockCountSession` remains the
   operator-facing screen and navigation context.
2. Submission must atomically designate the submitted attempt as the session's
   current attempt, set the attempt and compatibility session states to
   `SUBMITTED`, and create the immutable approval graph. A partial graph or state
   transition is forbidden.
3. Final approval must atomically prove that
   `StockCountSession.currentAttemptId` still equals the approval `documentId`,
   complete the graph, and set both the attempt and session to `REVIEWED`. A
   mismatch or concurrent attempt change fails closed.
4. Ordinary review creates no inventory movement or Stock Adjustment. Any later
   variance correction uses the distinct `StockCountVarianceAdjustment` family,
   with its own approval and posting controls.
5. `RETURN` and `REJECT` actions are hidden in the count-review UI and rejected
   by the server until a separate lineage-safe recount and recovery contract is
   confirmed and implemented.
6. A controlled cancellation or escalation path may be added only with separate
   owner authorization. It must preserve all count evidence, cancel the pending
   graph, safely release the applicable freeze, and mandate a replacement count;
   it must not relabel or overwrite the cancelled attempt.

## Eligibility and segregation contract

- Add a dedicated transfer-approval permission. Transfer approval must not be
  inferred from request, dispatch, receipt, broad inventory, or UI access.
- Approval steps resolve only configured named users or roles that are eligible
  at action time within the same tenant and company and the exact applicable
  location scope. A transfer step must enforce its configured source and/or
  destination scope; a generic company role is insufficient when the step calls
  for endpoint authority.
- The transfer requester cannot approve their own transfer. An approver for a
  transfer cannot dispatch or receive that transfer.
- The count creator, assigned counter, and every user who entered a line on any
  attempt in the reviewed session are prohibited reviewers.
- The ordinary-count reviewer identity remains a prohibited actor on the later
  correction approval and posting path. A new role assignment or later workflow
  step must not erase this historical separation requirement.
- Eligibility, scope, no-self, prohibited-actor, current-source, and current-step
  checks are enforced on the server inside the same controlled transaction or
  locked decision boundary as the approval action. UI visibility never grants
  authority.

## Options considered

### Option A — selected: normalized approval for every admitted transfer and ordinary count

- **Summary:** Require normalized `InventoryTransfer` approval for every transfer
  touching the pilot boundary and attempt-grained `StockCountAttemptReview` for
  every ordinary count review.
- **Benefits:** Produces one auditable approval model, closes direct-transition
  bypasses, makes count evidence immutable and exact, and supports explicit
  no-self, endpoint-scope, and prohibited-actor controls.
- **Failure modes:** Incorrect pilot classification could bypass or over-apply
  approval; source and graph state could split under concurrency; a session could
  change attempts during review; an approver could later dispatch, receive, or
  post a correction; or legacy records could be silently captured by activation.
- **Why selected:** With the safeguards and activation gates in this record, it
  is the only current option that satisfies the pilot approval, audit,
  authorization, and count-lineage hard gates.

### Option B — rejected now: hybrid policy-required approval

- **Summary:** Require approval only when a configurable transfer or count rule
  classifies the record as controlled, allowing other records to proceed without
  a normalized graph.
- **Benefits:** Could reduce approval workload and support a later mature risk-
  based operating policy.
- **Failure modes:** An absent, stale, client-derived, or mis-scoped rule could
  silently become authorization; a no-route result could be mistaken for a
  policy exemption; and there would be no immutable evidence that the bypass was
  intentional under the effective policy version.
- **Why rejected now:** The bounded pilot has no confirmed versioned
  no-approval-intent model. Hybrid behavior may be reconsidered only through a
  separate owner-confirmed decision and server-enforced versioned policy.

### Option C — rejected: keep direct transfer authorization and manager-only count review

- **Summary:** Preserve the existing direct `DRAFT` to `REQUESTED` transfer path
  and permission-gated `SUBMITTED` to `REVIEWED` count action.
- **Benefits:** Lowest immediate delivery effort and least source-state change.
- **Failure modes:** Does not produce normalized approval evidence, cannot prove
  exact route/step eligibility, leaves inconsistent inbox and audit behavior, and
  fails the Inventory Pilot approval acceptance boundary.
- **Why rejected:** It fails the server authorization, segregation, audit, and
  pilot-scope hard gates.

### Option D — rejected: use `StockCountVarianceAdjustment` as ordinary review

- **Summary:** Treat the later variance-correction family as the approval for the
  count itself.
- **Benefits:** Reuses an existing catalog family.
- **Failure modes:** Collapses evidence review and ledger correction into one
  authority, can imply posting from ordinary review, and obscures which attempt
  was accepted before a correction was proposed.
- **Why rejected:** Ordinary count review and variance correction are distinct
  controlled decisions with different source records, actors, and inventory
  effects.

### Option E — rejected as the target: defer both approval families

- **Summary:** Retain both current direct workflows and keep normalized routing
  disabled indefinitely.
- **Benefits:** Avoids migration and activation risk now.
- **Failure modes:** Blocks the connected Inventory Pilot and leaves the known
  approval gap unresolved.
- **Why rejected:** Deferral is safer than an incomplete activation but does not
  meet the confirmed pilot objective. The feature flags remain off only until
  all implementation gates below pass.

## Decision scorecard

Options C and D fail hard gates and were not eligible for weighted selection.
Option E is the safe temporary state but does not satisfy the pilot objective.
The council compared the two implementable policy designs on a 1–5 scale.

| Criterion | Weight | Option A: normalize all | Option B: hybrid |
|---|---:|---:|---:|
| Operational correctness and control | 30% | 5 | 2 |
| Business value | 20% | 5 | 3 |
| User adoption and branch usability | 15% | 3 | 4 |
| Delivery effort and risk | 15% | 3 | 2 |
| Maintainability and scalability | 10% | 4 | 3 |
| Operating cost | 5% | 3 | 4 |
| Reversibility | 5% | 4 | 2 |
| **Weighted total** | **100%** | **4.30** | **2.70** |

The score does not override hard gates. Option B's lower approval workload cannot
compensate for the missing immutable, version-bound no-approval authority.

## Hard-gate assessment

- **Tenant/company/location/SKU isolation:** Approval admission and action must
  prove the same tenant and company, required source/destination location scope,
  and server-owned pilot endpoint/SKU membership. Missing, ambiguous, or stale
  classification fails closed.
- **Server authorization:** Dedicated permission, named/role eligibility,
  effective scope, current step, and source eligibility are checked server-side;
  client classification and hidden controls are not authority.
- **Segregation of duties:** No-self approval, transfer approver versus
  dispatcher/receiver separation, count-entry versus reviewer separation, and
  reviewer versus correction approval/posting separation are mandatory.
- **Immutable ledger and audit:** Approval creates no stock movement. Graphs,
  attempts, actions, reasons, actors, and terminal outcomes are retained. Only
  existing dispatch/receipt and separately approved correction/posting paths may
  affect inventory.
- **Atomicity and idempotency:** Submission, graph creation, final approval, and
  source transitions are atomic, idempotent, and protected by compare-and-swap
  and locking appropriate to the source and active graph.
- **Phase scope:** Both families are required by the bounded Phase I Inventory
  Control Pilot and add no future module or Finance transaction workflow.
- **Recovery and rollback:** Both families use default-off flags and additive,
  forward migration. Activation requires zero legacy in-flight records in the
  affected boundary; disabling before live admission is the safe rollback. After
  admission, records are settled through preserved workflow history rather than
  schema rollback or destructive deletion.

## Required safeguards and activation gates

1. Implement a server-owned, fail-closed classifier for the exact pilot
   company, endpoints, and SKU cohort before either approval family can activate.
   Presentation labels, manifest membership in the browser, and UI routing never
   authorize or exempt a transaction.
2. Use separate default-off family flags. Missing configuration, route,
   eligibility, scope, current step, or pilot classification must reject the
   action without changing the source or graph.
3. Activate only when there are zero legacy in-flight transfers or count reviews
   in the affected pilot boundary. Historical terminal records remain historical
   and are not reinterpreted; existing `REQUESTED`, `SUBMITTED`, or `REVIEWED`
   records are not silently enrolled or backfilled into a live graph.
4. Use additive, forward-only schema and catalog changes with reviewed migration,
   rollback considerations, data-dictionary updates, and no destructive enum or
   history rewrite.
5. Enforce a single active approval cycle per source revision/attempt, stable
   idempotency keys for submission and approval actions, compare-and-swap source
   transitions, and explicit row/advisory locking where required to serialize
   graph creation, attempt selection, approval, cancellation, dispatch, and
   replacement-count recovery.
6. Revalidate approval-rule version, named/role eligibility, live permission,
   tenant/company/location scope, prohibited actors, source revision/status, and
   current attempt at action time. Revocation or drift fails closed.
7. Preserve complete audit evidence for allowed and denied submission, approval,
   return/reject/cancel where supported, stale conflict, duplicate retry, scope
   denial, and feature-disabled outcomes without exposing sensitive details.
8. Do not expose ordinary-count Return or Reject actions until their separate
   lineage-safe contract is confirmed. Any future cancellation/escalation must
   preserve evidence, cancel the graph, release the freeze safely, and require a
   replacement count.
9. Do not allow final count review to post a movement or adjustment. Prove that
   `StockCountVarianceAdjustment` remains distinct and that duplicate correction
   creation/posting is blocked.
10. Do not grant pilot or readiness credit until exact-candidate unit,
    disposable-PostgreSQL, authorization, concurrency, idempotency, migration,
    production-build, responsive browser, and signed UAT evidence passes.

## Required verification evidence

- Exact family/document keys, graph versions, source IDs, status transitions,
  audit events, and one-active-cycle constraints.
- Submission and final-approval atomic rollback under injected failure.
- Concurrent submit, approve, cancel, dispatch, recount/current-attempt change,
  correction creation, and retry races, including compare-and-swap and lock
  behavior.
- Direct service/action/API denial for wrong tenant, company, source location,
  destination location, SKU cohort, permission, named/role eligibility, current
  step, self-approval, and prohibited actors.
- Proof that missing route, missing classifier data, disabled flag, revoked
  authority, stale graph, and stale source revision fail closed with zero source,
  graph, ledger, balance, or audit-corrupting partial mutation.
- Proof that transfer approval creates no movement, count review creates no
  movement or adjustment, dispatch remains unavailable before `REQUESTED`, and
  count approval fails when `currentAttemptId` differs from `documentId`.
- Additive migration rehearsal, no legacy in-flight activation proof, forward
  rollback/disable procedure, exact-candidate production build, and desktop,
  tablet/mobile browser workflows including loading, denied, stale, duplicate,
  disabled-with-reason, and success states.
- Role-based UAT by requester/counter, approver/reviewer, dispatcher, receiver,
  inventory controller, Security/Controls, and release owners before operational
  pilot activation.

## Implementation and documentation impact

- **Code / architecture:** Add the two exact normalized approval families,
  producers, action-time authorization, source-state orchestration, idempotency,
  compare-and-swap/locking, and server-owned pilot classifier. Keep route handlers
  and UI actions delegated to controlled domain services.
- **Data / schema:** Add only reviewed additive structures or statuses required
  for immutable approval cycles and source linkage. Update the data dictionary
  and migration register when business fields or constraints change.
- **Workflow / permissions:** Add a dedicated transfer-approval permission and
  the confirmed state, eligibility, endpoint-scope, no-self, prohibited-actor,
  and cancellation rules. Update the approval matrix, roles/permissions, transfer
  workflow, stock-count workflow, and audit/security specifications during
  implementation.
- **UI / mobile:** Provide useful pending-approval and returned/rejected/disabled
  states for transfers. Surface attempt-grained count approval through the parent
  session, hide unsupported Return/Reject actions, explain disabled reasons, and
  preserve responsive task-focused review.
- **Reporting:** Pending, overdue, terminal, cancelled, and exception reporting
  must distinguish family, source, current cycle, and attempt without implying an
  inventory posting.
- **Knowledge base / training:** Dunong handoff is required when implementation
  makes the new transfer submission/approval statuses, dedicated approval action,
  or attempt-grained count review visible. This decision record alone does not
  authorize user-facing instructions or release notes.
- **Tests / UAT:** All evidence listed above is blocking. Source-only tests or a
  browser happy path cannot independently activate either family.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement and independently review the server-enforced pilot endpoint/SKU classifier. | Product / Architecture / Security / Engineering | Before either family flag can activate | Blocking |
| Add the exact families, dedicated transfer-approval permission, workflow orchestration, source states, locks, idempotency, and audit contracts. | Engineering / Database / Security | Current local-only approval-runtime slice | Pending |
| Update affected workflow, approval, permission, security/audit, data, UI, and UAT specifications from implemented behavior. | Mithi / implementation owners | With implementation | Pending |
| Produce the exact database, authorization, concurrency, migration, build, browser, and UAT evidence in this record. | QA / Security / Release / operational owners | Before shadow or operational activation | Blocking |
| Assess and publish affected role-based help, release summary, and training content. | Dunong / process owners | After visible behavior is implemented and verified | Pending handoff |
| Reconsider a hybrid/no-approval route only through versioned server policy and immutable no-approval intent. | Product / Operations / Security / Decision Chair | Only if owner requests future policy change | Deferred |

## Evidence

- [`AGENTS.md`](../../../../AGENTS.md) — Phase I scope, server authorization,
  configurable approvals, segregation, immutable ledger, transaction, testing,
  documentation, and deliberation requirements.
- [`SUBAGENT_DELIBERATION_PROTOCOL.md`](../SUBAGENT_DELIBERATION_PROTOCOL.md) —
  independent analysis, challenge round, hard gates, confirmation, and model-
  fallback rules.
- [`DECISION_SCORECARD.md`](../DECISION_SCORECARD.md) — hard-gate-first weighted
  option assessment.
- [`DECISION_RECORD_TEMPLATE.md`](../DECISION_RECORD_TEMPLATE.md) — confirmed
  decision-record structure.
- [`OPEN_DECISIONS_AND_ASSUMPTIONS.md`](../OPEN_DECISIONS_AND_ASSUMPTIONS.md) —
  item 20 decision question and confirmed resolution pointer.
- [`ERP_APPROVAL_MATRIX.md`](../../02-controls/ERP_APPROVAL_MATRIX.md) — transfer,
  physical-count, variance, cancellation, and Phase I approval baselines.
- [`DEC-0258`](DEC-0258-INVENTORY-CONTROL-PILOT-RELEASE-SCOPE.md) — bounded
  connected pilot boundary and production activation gates.
- [`DEC-0259`](DEC-0259-INVENTORY-PILOT-SYNTHETIC-CONFIGURATION-BASELINE.md) —
  synthetic-only baseline, unresolved family boundary, server-enforced SKU-scope
  blocker, and no operational authority.
- [`CURRENT_PENDING_IMPLEMENTATION_PLAN.md`](../../07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md) —
  local-only directive, dependency order, recorded model fallback, and Inventory
  Pilot NO-GO status.
- Parent decision brief; independent GPT-5.6 Workflow, Architecture, and Security
  positions; targeted challenge round; and parent-confirmed conclusion on
  2026-07-30. Code Spark and GPT-5.4-mini were unavailable, and the owner
  explicitly authorized the closest available fallback without relaxing the
  protocol or hard gates.

## Supersession

This record resolves open item 20 and supplements `DEC-0258` and `DEC-0259`. It
does not supersede the transfer custody, count foundation, adjustment, approval-
engine, audit, or release decisions listed above. A future hybrid/no-approval
policy or lineage-safe ordinary-count return/reject behavior requires a separate
confirmed decision record.
