# DEC-0261 — Inventory Pilot Relational Classifier, Activation, and Submission Intents

## Metadata

- Decision ID: `DEC-0261`
- Title: Inventory Pilot Relational Classifier, Activation, and Submission Intents
- Status: `Confirmed`
- Date: 2026-07-30
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I Inventory Control Pilot configuration,
  `InventoryTransfer`, `StockCountAttemptReview`, normalized approvals, and
  source-state integrity
- Related decisions: `DEC-0010`, `DEC-0011`, `DEC-0012`, `DEC-0013`,
  `DEC-0023`, `DEC-0036`, `DEC-0041`, `DEC-0049`, `DEC-0098`, `DEC-0099`,
  `DEC-0222`, `DEC-0225`, `DEC-0258`, `DEC-0259`, `DEC-0260`
- Related decision brief: Parent-led decision on the server-authoritative pilot
  classifier, activation authority, source revisioning, and approval-submission
  replay contract

## Decision

Implement the operational Inventory Pilot boundary as immutable, sealed,
normalized `InventoryPilotConfigurationRevision` data with exact endpoint and
item membership, canonical JSON, and a cryptographic digest. Maintain separate
`InventoryTransfer` and `StockCountAttemptReview` activation states backed by
append-only activation events and compare-and-swap generations; when both
families are active, they must reference the same sealed configuration revision.

Add versions to `InventoryTransfer`, `StockCountAttempt`, and
`StockCountSession`, convert every material writer to compare-and-swap those
versions, and create a separate append-only typed submission-intent relation for
each family. Each intent pins the applicable source and session versions and
hashes, configuration revision and digest, activation event and generation,
idempotency key and request hash, submitter, and resulting `ApprovalInstance`.
The existing unique pending approval graph together with the typed intent is the
authoritative pending lookup; do not add a mutable active-approval pointer to the
source in this slice.

## Context

`DEC-0260` requires normalized approval for every transfer admitted to the
bounded pilot and attempt-grained ordinary count review. Its first blocking
prerequisite is a server-owned, fail-closed classifier for the exact endpoints
and SKU cohort. The synthetic manifest in `DEC-0259` proves only a local test
shape and cannot be read as operational authority.

The current data model has no operational pilot-configuration relation, no
family-specific activation authority, and no source version on
`InventoryTransfer`, `StockCountAttempt`, or `StockCountSession`. A generic
setting, environment switch, client label, or mutable list cannot prove exact
`InventoryLocation`/`Location` lineage, preserve a reviewed cohort revision, or
bind a submission to the configuration and activation decision effective at the
time of admission. An untyped retry key also cannot distinguish an exact replay
from a conflicting submission after source, session, lines, configuration, or
activation state changes.

The owner confirmed this design after independent Architecture, Database, and
Security analysis and a targeted challenge round. Code Spark and GPT-5.4-mini
were unavailable; the owner explicitly authorized the closest available GPT-5.6
specialist fallback. That fallback did not relax independence, the implementation
lock, database and authorization hard gates, or the required evidence.

## Confirmed data and authority contract

### Sealed configuration revisions

1. `InventoryPilotConfigurationRevision` is tenant- and company-scoped. A
   revision used for classification is `SEALED`; the revision, its canonical
   representation, digest, and normalized memberships are immutable.
2. Endpoint membership carries an explicit closed capability:
   `TRANSFER_SOURCE`, `TRANSFER_DESTINATION`, or `COUNT_LOCATION`. Each endpoint
   membership references both the exact `InventoryLocation` and its parent
   `Location`, and the database must prove that both belong to the same tenant
   and company and that the inventory location belongs to that exact location.
3. Item membership references the exact `Item` within the same tenant and
   company. A transaction is admitted only when all applicable endpoint and item
   memberships resolve unambiguously in the effective sealed revision.
4. Canonical JSON is derived deterministically from the normalized revision and
   membership data. Its cryptographic digest is stored and independently
   recomputed at admission. Missing, duplicate, conflicting, cross-scope, or
   digest-divergent data fails closed.
5. A sealed revision is never edited or reopened. Reverting configuration
   contents requires a new, higher revision that explicitly reproduces the
   desired contents; an older revision cannot be reactivated.

### Family activation

1. `InventoryTransfer` and `StockCountAttemptReview` have separate current
   activation-state rows and separate append-only activation events. State
   transitions use compare-and-swap generation numbers and retain the event that
   established the current state.
2. The state/event reference structure must be acyclic. An activation event may
   reference its sealed configuration revision and prior generation, while the
   current state points to the accepted event; no circular foreign-key or
   mutable-event dependency is allowed.
3. If both families are active for a tenant/company, both current states must
   reference the same configuration revision and digest. A partial family
   switch to a different revision fails before authority changes.
4. Separate default-off environment kill switches may deny admission for either
   family. They are negative controls only: an enabled variable cannot activate
   a family, choose a revision, supply membership, or replace database authority.
   Missing or disabled database activation always fails closed regardless of the
   environment.
5. No activation row, event, real cohort membership, approval authority, or
   operational pilot data may be created until the owner confirms the actual
   warehouse, branches, SKUs, users, approvers, and routes and all migration,
   authorization, database, browser, recovery, and UAT gates pass.

### Source versions and typed submission intents

1. Add monotonically increasing versions to `InventoryTransfer`,
   `StockCountAttempt`, and `StockCountSession`. Every material writer—not only
   approval submission—must use the expected version in its compare-and-swap
   predicate and increment it exactly once on success.
2. Use separate append-only typed submission-intent relations for
   `InventoryTransfer` and `StockCountAttemptReview`. An intent cannot be reused
   across families or sources.
3. A transfer intent pins the transfer identity, source version, canonical source
   hash, configuration revision and digest, activation event and generation,
   idempotency key, canonical request hash, submitter, and resulting
   `ApprovalInstance`.
4. A count-review intent additionally pins the exact `StockCountAttempt`, parent
   `StockCountSession`, attempt version, session version, current-attempt
   relationship, canonical attempt/session/line evidence hash, and the same
   configuration, activation, request, submitter, and approval bindings.
5. The intent has an exact tenant/company-scoped foreign key to its source record
   and exact scoped links to its configuration, activation evidence, submitter,
   and `ApprovalInstance`. The pinned source version is evidence, not a foreign
   key to the source's mutable current version.
6. The source does not gain an `activeApprovalInstanceId` pointer in this slice.
   The authoritative active lookup is the existing database-enforced unique
   pending graph for the family/source plus the matching typed intent.
7. An exact retry with the same scoped idempotency key and identical canonical
   request hash returns the original intent and approval result, including after
   a later terminal decision. Reuse with a different source, version, source
   hash, session state, configuration, activation generation, submitter, or
   request hash is a conflict and performs no mutation. A returned transfer may
   start its next immutable cycle only with a fresh key and a newly evaluated
   source/activation binding.

## Options considered

### Option A — selected: immutable relational revisions, event-backed activation, and typed intents

- **Summary:** Normalize the pilot cohort into sealed revision and membership
  relations, activate each approval family through CAS state plus immutable
  events, version every material source writer, and bind submission through a
  family-specific append-only intent.
- **Benefits:** Provides database-enforced scope lineage, deterministic and
  reviewable cohort evidence, exact activation history, reliable replay and
  conflict handling, and an auditable link from source state through
  classification to the approval graph.
- **Failure modes:** Partial revision construction, mutable memberships, digest
  drift, cyclic state/event links, mismatched active family revisions, a writer
  that omits source CAS, or an intent that is not unique and immutable could
  admit stale or ambiguous work.
- **Why selected:** With the safeguards below, it is the only option that passes
  the scope, authorization, audit, atomicity, idempotency, and recovery hard
  gates for the connected pilot.

### Option B — rejected: generic policy settings or JSON-only operational configuration

- **Summary:** Store endpoint, SKU, and activation values in
  `CompanyPolicySetting` or another mutable JSON/settings structure.
- **Benefits:** Smaller apparent schema change and potentially simpler generic
  administration.
- **Failure modes:** Cannot directly enforce exact relational lineage or closed
  capability values; settings can be partially updated; a digest may cover
  client-shaped data rather than authoritative rows; and activation may become
  an ambiguous setting instead of an accountable event.
- **Why rejected:** It fails the relational-integrity and activation-evidence
  requirements established by `DEC-0258` through `DEC-0260`.

### Option C — rejected: environment-only activation and classifier

- **Summary:** Put pilot locations, SKUs, family enablement, or revision values
  in environment variables and classify in application code.
- **Benefits:** Fast disable and no operational configuration migration.
- **Failure modes:** Deployment configuration would become positive authority,
  changes would lack normalized lineage and durable actor/event evidence, and
  multi-instance drift could classify the same transaction differently.
- **Why rejected:** Environment values may serve only as default-off kill
  switches. They cannot grant server authority or satisfy audit and recovery
  hard gates.

### Option D — rejected: source pointer to a mutable active approval

- **Summary:** Add `activeApprovalInstanceId` to each source and use it as the
  primary pending and retry mechanism.
- **Benefits:** Direct lookup from a source row.
- **Failure modes:** Creates dual authority with the normalized approval graph,
  requires complex pointer/terminal synchronization, and can strand or overwrite
  historical approval identity under races or recovery.
- **Why rejected:** Existing unique pending-graph enforcement plus an immutable
  typed intent gives an exact lookup without introducing a second mutable source
  of truth. A pointer can be reconsidered only if measured query or integrity
  evidence later proves it necessary.

### Option E — rejected as target: keep the runtime classifier and family activation deferred

- **Summary:** Retain the synthetic manifest only and leave both approval
  families disabled indefinitely.
- **Benefits:** Avoids migration and activation risk.
- **Failure modes:** Cannot admit transfer or ordinary count-review work to the
  controlled pilot and leaves the blocking `DEC-0260` prerequisite unresolved.
- **Why rejected:** Deferral remains the safe current operating state, but it
  does not satisfy the confirmed pilot implementation objective.

## Hard-gate assessment

- **Tenant/company/location/item isolation:** Exact scoped foreign keys and
  database constraints bind configuration, endpoint, inventory location,
  location, item, activation, source, submitter, and approval evidence. Mixed,
  missing, ambiguous, or cross-scope data fails closed.
- **Server authorization:** Only the active sealed database revision plus live
  family state can admit work. UI labels, requests, synthetic fixtures, and
  environment variables confer no authority.
- **Approval segregation:** This classifier and intent preserve, rather than
  replace, the named eligibility and prohibited-actor controls in `DEC-0260`.
- **Immutable ledger and audit:** Classification and approval submission create
  no inventory movement or balance mutation. Revisions, memberships, activation
  events, and intents preserve history and are never destructively rewritten.
- **Transaction consistency and idempotency:** Admission locks or CAS-checks the
  source, session where applicable, activation generation, and pending graph;
  exact replay returns the prior result and conflicting reuse changes nothing.
- **Phase scope:** The schema is limited to the two Phase I Inventory Pilot
  approval families and their exact boundary. It does not activate deferred
  workspaces or create a general feature-flag system.
- **Recovery and rollback:** Schema changes are additive and activation is
  default-off. Before first live admission, deactivation is the operational
  rollback. After admission, append-only evidence and source/approval histories
  are settled forward; sealed revisions and events are never deleted or edited.

The implementation lock for this design is cleared, but the Inventory Pilot and
Phase I remain **NO-GO**. This record confirms architecture; it does not create
schema, real configuration, activation, approval authority, inventory data, UAT
credit, or release authority.

## Local implementation evidence — July 31, 2026

The production runtime role is read-only on pilot configuration revisions,
endpoint/item memberships, activation events, and current activation state. It
may read and append only the two typed submission-intent relations. The pure
JSON canonicalizer remains runtime-callable for intent validation; the
revision-reading canonicalizer does not. Disposable tests construct exact
synthetic configuration through a token-gated local Unix-socket broker holding
the marked database's migrator connection, never through runtime DML.

A fresh disposable PostgreSQL 17 run applied the exact 143-migration ledger
with digest
`acc56e462e8c0fecd7f56a52a5e32cc3d84a38ea0c650b6de9c43b721dead13f`.
It verified exact function hashes, owner/invoker properties, fixed search paths,
runtime/PUBLIC ACLs, trigger attachment/event semantics and always-enabled
state; passed 17 append-only guard cases; and passed all 24 transfer/count
workflow, concurrency, authorization, immutable-evidence, custody, activation
rollover, and injected rollback cases. Cross-tenant/company and
adjacent-location identifiers failed closed with zero adjacent mutation.

This closes the local PostgreSQL acceptance gate for the default-off
`InventoryTransfer` and `StockCountAttemptReview` implementation slice. It does
not create a real revision, activation, cohort, route, stock movement, UAT
credit, deployment authorization, or GO decision. Production-authenticated
responsive browser, recovery, real-cohort, and human-UAT gates remain open.

## Required safeguards

1. Use additive, forward-only migrations with preflight checks, exact scoped
   foreign keys, closed capability/family/status constraints, and reviewed
   rollback/deactivation procedures.
2. Database-enforce immutability of sealed revisions, their endpoint and item
   memberships, activation events, and typed intents, including owner and
   replication-role execution paths where the approved database pattern
   requires `ENABLE ALWAYS` guards.
3. Database-enforce exact `InventoryLocation` to parent `Location` and
   tenant/company lineage; application validation alone is insufficient.
4. Produce canonical JSON and the digest only from one shared deterministic
   implementation, independently recompute them at activation and admission, and
   reject extra, missing, reordered-with-different-meaning, or divergent data.
5. Enforce monotonically increasing revision numbers. An activation transition
   that changes its referenced revision may select only a higher sealed revision;
   deactivation retains its prior provenance. Reverting content requires a new
   higher revision.
6. Serialize activation changes with CAS generation and exact event/state
   linkage. Prove the link structure is acyclic and that concurrent or partial
   cross-family activation cannot leave both active on different revisions.
7. Keep environment kill switches default-off and denial-only. Test that no
   environment combination can activate a family without valid database state.
8. Inventory every material writer for all three versioned source models. Direct
   update, legacy service, route, action, job, fixture, and test paths must not
   bypass expected-version CAS.
9. Create the source transition, typed intent, immutable approval graph, audit
   evidence, and source-version increment in one controlled transaction. Injected
   failure must roll back every part.
10. Enforce exact idempotency replay and conflict behavior at the database and
    service boundaries, including concurrent same-key and different-key submits,
    stale source/session versions, line changes, activation changes, and graph
    creation races.
11. Do not insert real revisions, memberships, activation state/events, or
    operational intents until exact owner values and roster are confirmed and
    the database, authorization, concurrency, browser, recovery, and UAT gates
    pass.

## Required verification evidence

- Fresh and populated-predecessor PostgreSQL migration, constraint, redeploy,
  drift, rollback/deactivation, and isolated-restore evidence.
- Positive and adversarial relation tests for wrong tenant/company, mismatched
  `InventoryLocation`/`Location`, wrong capability, missing or extra endpoint,
  mixed or unknown item, duplicate membership, unsealed revision, digest drift,
  older-revision reactivation, and cross-family active-revision mismatch.
- Append-only and immutability probes for sealed revisions, memberships,
  activation events, and intents under normal runtime, owner, and applicable
  replication-role paths.
- CAS and concurrency evidence for revision sealing, activation generation,
  every material source writer, simultaneous submit, source/session mutation,
  count current-attempt change, and pending-graph creation.
- Exact replay/conflict tests covering the full pinned intent contract and proof
  that a failed or conflicting request leaves source, activation, approval,
  audit, ledger, and balance state unchanged.
- Authorization tests proving synthetic configuration, browser state,
  environment values, guessed IDs, broad company roles, and adjacent scope do not
  classify or activate a transaction.
- Proof that classifier and submission activity creates no inventory movement,
  balance, opening stock, transfer dispatch/receipt, count correction, wastage,
  or adjustment posting.
- Exact-candidate lint, typecheck, production build, authorization-manifest,
  production-authenticated desktop/mobile, role-based UAT, and release/recovery
  evidence before either family is enabled for operational use.

## Implementation and documentation impact

- **Code / architecture:** Add one server-owned relational classifier and shared
  canonicalization/digest boundary; family activation services; source CAS; and
  separate transfer/count typed submission producers. Keep application and UI
  callers behind controlled domain services.
- **Data / schema:** Add the revision, endpoint membership, item membership,
  family state, append-only event, and two typed-intent relations; add source
  versions and exact scoped keys/constraints. Update the data dictionary and
  migration safety register with implementation.
- **Workflow / permissions:** This decision creates no user grant and does not
  alter `DEC-0260` eligibility. Activation authority and operational cohort
  administration require explicit server permissions and owner-confirmed roster
  during implementation; environment access is not that authority.
- **UI / mobile:** No new visible behavior is authorized by this record alone.
  When implemented, disabled, stale, conflict, and configuration/activation
  denial states must be useful without exposing internal identifiers or scope
  details.
- **Reporting:** Future readiness and audit reporting must identify exact
  configuration revision/digest, family activation event/generation, source
  version, intent, and approval graph without treating them as stock movement.
- **Knowledge base / training:** Dunong assessment is required when the active
  classifier or approval-submission behavior becomes visible. No user-facing
  article or release note should describe this architecture as active before
  implementation and verification.
- **Tests / UAT:** Every safeguard and evidence family above is blocking. Schema
  presence or unit-only tests do not authorize real cohort data or activation.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement and independently review the additive classifier, activation, source-version, and typed-intent migration. | Engineering / Database / Security | Current local-only approval-runtime slice | Complete locally; fresh exact 143-migration and adversarial PostgreSQL evidence passes |
| Convert and inventory every material writer for the three versioned source models. | Engineering / Correctness / QA | Before submission producers can activate | Complete locally; transfer and current count aggregate writers use exact version CAS and increment once |
| Implement exact server classification, family activation, typed submission, replay/conflict, and no-movement contracts. | Engineering / Architecture / Security | Before either family flag can activate | Complete locally default-off; exact PostgreSQL workflow acceptance passes |
| Implement terminal source/graph coherence, custody separation, and count approve-only enforcement. | Engineering / Security / QA | Before either family flag can activate | Complete locally default-off; concurrency, rollback, and no-movement acceptance passes |
| Update approval, permission, workflow, security/audit, data, UI-state, and migration documents from implemented behavior. | Mithi / implementation owners | With implementation | Completed for default-off local behavior; reassess before activation |
| Produce the required database, concurrency, authorization, browser, UAT, and recovery evidence. | QA / Security / Release / operational owners | Before real configuration or activation | Database/concurrency/authorization complete locally; browser, UAT, and recovery remain blocking |
| Confirm the real endpoint/SKU cohort, named roster, approvers, and approval routes. | Product Owner / Operations / Security | Before any real revision or activation event | Blocking |
| Assess and publish role-based help, release notes, and training updates after visible behavior is implemented. | Dunong / process owners | Before shadow UAT | Default-off local guidance published; reassess before activation |

## Evidence

- [`AGENTS.md`](../../../../AGENTS.md) — Phase I scope, server authorization,
  inventory integrity, configurable policy, transaction, migration,
  documentation, and deliberation requirements.
- [`SUBAGENT_DELIBERATION_PROTOCOL.md`](../SUBAGENT_DELIBERATION_PROTOCOL.md) —
  independent analysis, challenge, hard gates, confirmation, and recordkeeping.
- [`DECISION_SCORECARD.md`](../DECISION_SCORECARD.md) — hard-gate-first option
  comparison; the rejected generic-setting, environment-authority, mutable-
  pointer, and indefinite-deferral options could not satisfy the combined scope,
  integrity, audit, and implementation objective.
- [`DEC-0258`](DEC-0258-INVENTORY-CONTROL-PILOT-RELEASE-SCOPE.md) — bounded
  connected pilot cohort and activation gates.
- [`DEC-0259`](DEC-0259-INVENTORY-PILOT-SYNTHETIC-CONFIGURATION-BASELINE.md) —
  synthetic-only baseline and prohibition on operational fallback.
- [`DEC-0260`](DEC-0260-INVENTORY-PILOT-TRANSFER-AND-COUNT-APPROVAL-SEMANTICS.md) —
  exact approval families, mandatory admitted-transfer approval,
  attempt-grained count review, segregation, and classifier prerequisite.
- [`schema.prisma`](../../../../packages/database/prisma/schema.prisma) — current
  `Location`, `InventoryLocation`, `Item`, `InventoryTransfer`,
  `StockCountAttempt`, `StockCountSession`, and `ApprovalInstance` relations; the
  three source models now carry the positive versions required by this decision,
  alongside the immutable pilot configuration, activation, and typed-intent
  relations. No real configuration or activation rows are seeded.
- [`CURRENT_PENDING_IMPLEMENTATION_PLAN.md`](../../07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md) —
  local-only implementation order, baseline evidence, model fallback, and
  continuing Inventory Pilot NO-GO status.
- Parent decision brief; independent owner-authorized GPT-5.6 Architecture,
  Database, and Security positions; targeted challenge round; and parent-
  confirmed conclusion on 2026-07-31. Code Spark and GPT-5.4-mini were
  unavailable, and the closest available fallback was used without relaxing the
  protocol or hard gates.

### Local implementation evidence — 2026-07-31

- Independent software review returned NO-GO before adapter work after finding
  an activation write-skew path and unresolved pgcrypto calls under hardened
  trigger search paths. The migration now takes a tenant/company-wide
  transaction advisory lock before the family lock and invokes
  `public.digest` explicitly; adapter implementation remained paused until both
  corrections were verified.
- A fresh isolated PostgreSQL 17 database applied the exact 143-migration
  ledger and passed all 24 transfer/count workflow, concurrency, authorization,
  immutable-evidence, activation-rollover, custody, and rollback cases plus 17
  append-only guard probes. The marked disposable database was removed
  afterward.
- Every existing material transfer writer (submit, dispatch, receive,
  discrepancy settlement, receipt reversal, cancel) and count aggregate writer
  (initial attempt link, start, entry save, submit, review, cancel, and legacy
  relink) now predicates on the locked version and increments the applicable
  aggregate exactly once.
- The two default-off atomic producers now bind admission to a sealed current
  configuration/activation, typed intent, source CAS, normalized graph, audit,
  and notification in one transaction. A flag-off active cohort is denied, not
  downgraded to a legacy producer. The submission surfaces provide idempotency
  keys and use the existing Approval Inbox routing.
- Local terminal adapters enforce the confirmed transfer approve/return/reject
  and count approve-only scope. Pending cancellation keeps source and graph
  terminal state coherent; historical approvers cannot dispatch or receive a
  transfer; exact replay works after terminal action; and returned transfer
  resubmission requires a fresh idempotency key and creates a fresh cycle.
- Focused schema/classifier/routing coverage passes **166/166**; the approval
  producer manifest passes **48/48**; the latest transfer/count source suite
  passes **137/137**; and web TypeScript checks pass. The final exact-ledger
  PostgreSQL workflow gate separately passes **24/24** producer, terminal,
  authorization, replay, cancellation, custody, concurrency, and rollback
  cases. Production-authenticated browser, recovery, real-cohort, and human-UAT
  evidence remains open.
- This evidence completes only a default-off local implementation slice. No
  real revision, activation, cohort, VPS/staging change, push, UAT credit, or
  release authority is authorized; the Inventory Pilot and Phase I remain
  **NO-GO**.

## Supersession

This record supplements `DEC-0258`, `DEC-0259`, and `DEC-0260` and clears the
implementation lock only for the architecture specified here. It does not
supersede the underlying approval, transfer custody, count lineage, adjustment,
audit, or release decisions. Any mutable configuration path, environment-based
positive authority, older-revision reactivation, cross-family revision split,
source active-approval pointer, or generic untyped intent requires a separate
confirmed decision.
