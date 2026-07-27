# DEC-0247 — Approval V1 Producer Barrier and Closed Writer Perimeter

## Metadata

- Decision ID: `DEC-0247`
- Title: Approval V1 Producer Barrier and Closed Writer Perimeter
- Status: `Confirmed — dormant implementation permitted; production activation and certification execution blocked`
- Date: 2026-07-27
- Decision owner: Shared Production Foundation / Approval Routing
- Decision Chair: Parent agent
- Related phase/module: Phase I normalized approval-routing producer integrity and cutover preparation
- Related decisions: `DEC-0049`, `DEC-0050`, `DEC-0051`, `DEC-0052`, `DEC-0075`, `DEC-0244`, `DEC-0245`, `DEC-0246`
- Related decision brief: Parent-led approval-routing producer-barrier deliberation

## Decision

Select the combined Option B+C architecture. Option B supplies company-scoped,
append-only barrier generations; an automatic database shared transaction lock
for every registered-family approval-graph creation and source transition; the
same-key exclusive lock for activation and the final scan under PostgreSQL `READ
COMMITTED`; deferred complete-v1 and exact-provenance validation; and semantic
execution proof for all 18 registered producers.

Option C is mandatory before production activation. It establishes an exclusive
approval-graph writer and authenticity perimeter: runtime roles receive zero base
approval-graph or routing-provenance DML, and every permitted mutation uses a
typed closed capability that derives or validates a canonical registered-family
descriptor. Direct runtime graph DML and caller-selected generic descriptors are
prohibited.

The barrier may be implemented and tested dormant while
`APPROVAL_ROUTING_V1_ENABLED=false`. Its only positive result is
`V1_PRODUCER_BARRIER_READY`. `DEC-0246` human authority remains required before
production activation or certification execution. This decision does not permit
`DRAIN_CLEAN`, does not enable normalized routing, and does not authorize a
maintenance run.

## Context

The closed approval-routing registry has 18 production writers. Each current
writer creates approval steps at routing schema version 0, completes its exact
version-1 routing context, and commits the complete version-1 graph with its
source effects in one source transaction. Family-specific eligibility and
activation timing remains authoritative: normalized Budget Revision submission
intentionally leaves all steps waiting and defers first-step eligibility and
activation until commitment-fit review. These transaction shapes avoid a
committed partial graph through the reviewed service paths.

It does not protect the final backfill drain. The database still permits direct
runtime approval-graph DML and has no serialization boundary between a producer
transaction and a final zero-v0 scan. A producer can therefore begin before a
scan, remain invisible to the scan under MVCC, and commit after an unsupported
clean conclusion. A service factory alone also cannot authenticate future,
missed, job, seed, migration, or direct-SQL writers.

The required production boundary must preserve live source transactions, close
the late-commit window, prove exact family semantics rather than mere v1 shape,
contain writer authority at the database boundary, remain tenant/company scoped,
and retain an auditable rollback and recovery path. It must not convert technical
readiness into maintenance authority or feature activation.

## Options considered

### Option A — rejected: service-only lock and producer factory

- Summary: Route application producers through one service factory that acquires
  a lock and constructs version-1 routing.
- Benefits: Small implementation surface, clear application ergonomics, and easy
  unit-level producer inventory checks.
- Failure modes: Direct SQL, an overlooked job or writer, a future code path, or a
  migration can bypass the factory. The database cannot prove that the final scan
  excluded an unregistered producer.
- Why rejected: Application convention is not an authenticity or serialization
  boundary. It fails the direct-DML, complete-writer-inventory, and trustworthy
  final-scan hard gates. A factory may exist only as a convenience over the
  selected database-enforced boundary.

### Option B — selected as the barrier, insufficient alone for activation

- Summary: Add company-scoped append-only barrier generations, automatic shared
  producer locks, exclusive activation/final-scan locking, deferred complete-v1
  and exact-provenance validation, and all-18 semantic producer proofs.
- Benefits: Closes the MVCC late-commit race, supports company-by-company rollout,
  preserves the current transactional v0-to-v1 construction shape, and creates
  durable evidence bound to one exact generation, mapping, capability, and
  release.
- Failure modes: A direct writer can still bypass application lock acquisition;
  incorrect lock keys or ordering can permit a race or deadlock; shape-only
  validation can accept a semantically wrong descriptor; mutable provenance can
  make old proof appear current; and a barrier-ready result can be mislabeled as
  clean activation authority.
- Why selected: Its database-automatic lock and deferred validator provide the
  minimum concurrency and completeness barrier, but it passes the production
  writer-authenticity gate only when combined with Option C.

### Option C — selected and mandatory: closed typed producer capabilities

- Summary: Remove base approval-graph and routing-provenance DML from runtime
  roles. Permit mutations only through a closed, typed, versioned capability set
  for the 18 registered families. Each capability derives or validates the exact
  canonical descriptor and participates automatically in the Option B barrier.
- Benefits: Makes writer identity and family semantics enforceable at the database
  boundary; prevents arbitrary direct graph construction; fails closed when the
  registry, capability, mapping, release, or provenance differs; and gives final
  certification a closed producer population.
- Failure modes: Capability and service contracts can drift; an over-broad routine
  can become a generic privileged mutation API; ownership, grants, search path, or
  default privileges can reopen direct DML; and a capability rollout across all
  families can interrupt submissions if compatibility is not staged.
- Why selected: It is required to make the barrier exhaustive and authentic. The
  added implementation and migration cost is justified because B alone cannot
  prove that every committed graph used the registered producer contract.

### Option D — rejected: global v1-only constraint

- Summary: Prohibit every version-0 approval step globally.
- Benefits: A simple visible end-state invariant and no final v0 population.
- Failure modes: It rejects the current valid v0-to-complete-v1 transaction shape,
  forces an all-company cutover, increases global blast radius, and provides no
  exact family mapping, capability provenance, or writer authenticity by itself.
- Why rejected: It is incompatible with incremental company rollout and the
  reviewed producer transaction shape. It substitutes a global shape rule for
  the required semantic and authority perimeter.

## Hard-gate assessment

- **Tenant/company isolation:** Every generation and advisory-lock identity is
  bound to one exact tenant and company. A producer, activation transaction,
  final scan, descriptor, proof, and readiness result must share that scope.
  Different companies must not block one another.
- **Server-enforced authorization:** Runtime identities have no base approval-
  graph or routing-provenance DML. Only reviewed typed capabilities can mutate the
  graph, and they validate the executing role and exact registered family. The
  barrier, feature flag, release identity, or possession of a request ID is not
  authority.
- **Approval segregation:** Canonical descriptors retain required permission,
  scope, assignment exclusivity, prohibited actors, and no-self-approval rules.
  Producer capability never approves, returns, rejects, delegates, posts, or
  settles a source record.
- **Inventory, money, and audit integrity:** The perimeter changes routing
  construction authority only. It cannot create an approval outcome, inventory
  movement, financial posting, settlement, or source effect outside the source
  transaction. Routing and activation audits remain immutable.
- **Transactional consistency and idempotency:** Producer lock, source
  revalidation, graph construction, complete-v1 validation, eligible-actor proof,
  source transition, and audit commit atomically. A failed validation rolls back
  the source and graph. Existing one-pending-document uniqueness remains required;
  concurrent retries must return stable outcomes rather than raw database errors.
- **Phase scope:** The decision covers only normalized routing for the closed 18
  families and its production barrier. It adds no new workflow status, approval
  policy, user action, queue, or future module.
- **Recovery and rollback:** Generations and proof evidence are append-only.
  Rollback keeps the routing flag false, stops certification, revokes capability
  execution where necessary, preserves committed v1 facts and evidence, and uses
  compatible forward repair. It never downgrades v1 rows or rewrites a failed
  generation as successful.

The architecture passes these gates conditionally. Production execution remains
blocked until the exact implementation, database permissions, all-18 proofs,
deployment and recovery evidence, and `DEC-0246` human authority pass review.

## Required safeguards

### Barrier generations, lock identity, and MVCC

- Persist company-scoped barrier generations as append-only facts bound
  immutably to tenant, company, generation, routing schema, exact mapping version
  and hash, exact capability version and hash, and release identity. Never update
  a failed or superseded generation into a successful one.
- Derive one canonical advisory-lock key from the exact tenant/company scope and a
  versioned namespace. Producers and certifiers must use the identical database
  derivation; application-computed lookalike keys are prohibited.
- The database automatically acquires a shared transaction lock before any typed
  capability creates or changes a registered-family approval graph or performs
  its controlled source transition. The lock lasts until commit or rollback.
- Activation and the final scan acquire the same key exclusively. Use one
  documented global order: barrier generation and tenant/company advisory lock
  before source row, approval instance, approval steps, and eligibility-
  dependency locks. No path may acquire these resources in the reverse order.
- Under `READ COMMITTED`, exclusive acquisition proves all earlier shared producer
  transactions committed or rolled back. The final scan must execute only after
  exclusive acquisition, so its statement snapshot observes those commits. New
  same-company producers wait on the exclusive lock and cannot commit behind that
  scan. Hold the exclusive lock through the final evidence and readiness-result
  commit; do not release it between scan and result.
- Bound lock and statement waits, emit safe retryable reason codes, measure wait,
  timeout, and deadlock rates, and stop without a readiness result if the exclusive
  window cannot complete within its approved operational bound.

### Closed writer and provenance perimeter

- Runtime web, worker, reporting, and other application roles have zero effective
  `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, ownership, trigger, or grant authority
  on base approval-graph and routing-provenance relations. Review inherited roles,
  column privileges, views, routines, default privileges, and restore behavior.
- Expose only exact typed capabilities for the authoritative 18-family registry.
  No routine accepts caller-selected SQL, table, column, document family outside
  the registry, arbitrary scope graph, permission, prohibited-actor set, routing
  schema version, mapping identity, or provenance payload.
- A capability derives canonical routing facts from locked source and registered
  policy data or validates a typed descriptor against that canonical derivation.
  It writes immutable provenance identifying the exact family, mapping,
  capability, release, generation, and source transaction.
- Use controlled non-login ownership, fixed search paths, schema-qualified
  objects, exact signatures and grants, revoked `PUBLIC` execution, and executable
  post-migration and post-restore privilege verification. The perimeter must not
  become a generic privileged approval API.
- Database-deferred validation must reject commit unless every active
  `PENDING`/`WAITING` step is complete v1 and its exact permission, assignment,
  scope groups and targets, prohibited actors, due semantics, activation fields,
  and provenance match the canonical family descriptor. Structural v1 alone is
  insufficient.

### Source drift and eligible-actor races

- Lock the exact scoped source row before deriving the descriptor. Revalidate
  tenant, company, location or other scope, allowed source status, current
  approval link, approval-rule version, and expected concurrency token immediately
  before the controlled source transition. Use compare-and-swap for that
  transition and fail the entire transaction on drift.
- Retain the one-pending-approval database uniqueness rule and map concurrent
  duplicate submission to a stable idempotent or retry-safe domain result. A
  read-then-create precheck is not sufficient concurrency control.
- Derive prohibited actors from the locked source and acting identity. Never trust
  caller-supplied requester, creator, submitter, reviewer, or exclusion facts.
- Prove a first-step eligible actor after complete canonical routing is present.
  Role, permission, assignment, scope, and prohibited-actor dependencies used by
  that proof must either participate in the documented lock/serialization order
  or be revalidated under an equivalent database guard before commit. Concurrent
  revocation must cause rollback or leave the step governed by the existing
  fail-closed runtime eligibility check; it must never manufacture authority.
- Revalidate eligibility whenever a waiting step becomes pending. Certification
  proves producer integrity, not permanent future actor availability.

### Result, rollout, and recovery

- The implementation can produce only `V1_PRODUCER_BARRIER_READY`, bound to the
  exact generation and proof set. This means the producer barrier and writer
  perimeter passed; it is not `DRAIN_CLEAN`, maintenance authority, cutover
  approval, or permission to enable the feature flag.
- Keep `APPROVAL_ROUTING_V1_ENABLED=false` throughout dormant schema, capability,
  shadow, and proof deployment. Do not execute production activation or final
  certification until `DEC-0246` human issuer, key, revocation, STOP, and recovery
  authority is confirmed.
- Roll out additively: install append-only schema and dormant validators; verify
  privileges; bind all 18 typed capabilities; run isolated semantic proofs;
  observe lock behavior; then canary by authorized company only after the human
  authority gate. Do not use a global cutover.
- On failure, stop certification, keep or restore the flag to false, preserve the
  failed generation and evidence, prevent new capability activation where
  required, and forward-repair. Recovery must retain a compatible way to release
  or expire fenced operational state without granting base-table DML.

## Required tests and acceptance evidence

1. Discover production graph/source writers and compare them with the canonical
   registry, typed capability manifest, deferred validator, and proof manifest.
   Missing, extra, duplicate, or untyped writers fail the build and readiness
   check.
2. Execute all 18 real producer paths against PostgreSQL. Verify atomic source and
   graph commit, exact permission, assignment XOR, scope groups and targets,
   prohibited actors, due semantics, activation audit, provenance, first-step
   eligibility, and zero active v0 residue.
3. For each family, inject failures after graph creation, during descriptor
   completion, eligibility proof, source compare-and-swap, audit, and commit.
   Prove total rollback and no source/approval split brain.
4. Race a producer that acquires shared before the exclusive request, one that
   arrives while exclusive is held, and one after exclusive release. Prove the
   final `READ COMMITTED` scan observes all earlier commits and later producers
   cannot commit behind its readiness result.
5. Prove same-company serialization and different-company concurrency, canonical
   lock-key equality, deterministic lock ordering, bounded timeout, deadlock
   handling, transaction rollback, and safe retry outcomes.
6. Attempt direct base graph/provenance DML, caller-selected descriptor mutation,
   function substitution, search-path capture, inherited/default privilege use,
   trigger bypass, truncate, ownership change, and cross-family capability use
   from every runtime identity. All attempts must fail closed.
7. Supply wrong or stale tenant/company, source state, approval link, rule version,
   mapping/capability hash, release, generation, scope, permission, due fact,
   prohibited actor, and provenance. No invalid graph or source transition may
   commit.
8. Race duplicate submissions and source edits. Prove source-row lock and CAS
   behavior, exactly one pending instance and source link, stable idempotent or
   retry-safe results, and no raw uniqueness error exposure.
9. Race eligible-actor removal, permission revocation, role deactivation, scope
   removal, prohibited-actor changes, and next-step activation. Prove no user gains
   authority, invalid first-step activation rolls back or fails closed, and each
   later activation revalidates current eligibility.
10. Prove append-only generation history, immutable canonical hashes, one fenced
    readiness result, exact replay behavior, crash before and after final scan or
    result, stale worker rejection, and recovery without rewriting evidence.
11. Verify flag-false behavior: producers still commit complete v1 graphs through
    capabilities; normalized inbox/actions remain disabled; legacy decisions do
    not bypass the graph perimeter; and no barrier path emits `DRAIN_CLEAN`.
12. Rehearse additive migration, production-like load and lock duration, per-
    company canary, timeout and retry telemetry, application rollback, forward
    repair, backup/restore, privilege reconciliation, and emergency stop. Obtain
    independent Database, Security, QA, DevOps, and Release acceptance for the
    exact release.

## Implementation and documentation impact

- Code / architecture: Replace direct approval-graph construction with a closed
  typed capability boundary and automatic company barrier participation. Retain
  source-domain orchestration and the existing normalized decision contract.
- Data / schema: Add append-only barrier-generation and readiness evidence,
  canonical provenance, database lock-key derivation, deferred exact validators,
  typed capability routines, and least-privilege grants through reviewed additive
  migrations.
- Workflow / permissions: No approval route, threshold, status, user permission,
  or decision authority changes. `DEC-0246` remains the authority gate.
- UI / mobile: No navigation, action, label, or mobile behavior changes while the
  feature flag remains false. A bounded maintenance wait should be transparent.
- Reporting: Barrier generations and `V1_PRODUCER_BARRIER_READY` are internal
  operational evidence, not an end-user report or clean certificate.
- Knowledge base / training: No glossary, knowledge-base, training, or end-user
  release-note change is required for a transparent dormant barrier. If rollout
  introduces a user-visible maintenance/retry error or planned submission outage,
  Dunong must add troubleshooting and release-note guidance before exposure.
- Tests / UAT: Add the exact database, concurrency, authorization, provenance,
  all-18 semantic, flag-matrix, deployment, restore, and recovery evidence listed
  above. End-user UAT remains a separate activation prerequisite.

### Current dormant implementation checkpoint

The current implementation is a partial Option B foundation only. Additive
migration `20260727150000_approval_routing_producer_barrier_dormant` creates two
empty protected tables: DORMANT-only
`ApprovalRoutingProducerBarrierGeneration` and append-only
`ApprovalRoutingProducerProvenance`. The migration creates no generation,
provenance, readiness, result, activation, approval, audit, or source row. No
readiness/result/activation relation or routine exists.

All exact 18 production producer entry points now use an outer transaction wrapper
that acquires the company-scoped shared advisory transaction lock before invoking
the producer body. Six `ENABLE ALWAYS` triggers acquire the same shared lock for
registered-family mutations of `ApprovalInstance`, `ApprovalInstanceStep`,
`ApprovalInstanceStepScopeGroup`, `ApprovalInstanceStepScopeTarget`,
`ApprovalInstanceStepProhibitedActor`, and
`ApprovalRoutingProducerProvenance`. The evidence tables reject insert, update,
delete, and truncate through `ENABLE ALWAYS` schema guards, including for
owner/replication-role sessions. The dormant provenance lineage guard remains in
place for a later governed writer migration, but no actor can insert while this
checkpoint remains dormant.

This checkpoint does not implement source-table transition triggers, an active
deferred complete-v1 and exact-provenance validator, provenance writes, the
same-key exclusive activation/final-scan operation, or
`V1_PRODUCER_BARRIER_READY`. Its six deferred validator triggers use `WHEN
(false)` and are intentionally inert. Option C typed closed capabilities and zero
runtime base approval-graph/provenance DML are still pending. Executed local
evidence passes focused approval routing 74/74, exact 18-producer backend coverage
204/204, database-schema coverage 6/6, role/migration tooling 8/8, and the
authorization manifest 21/21. The full root suite passes 1,486 web tests with 313
skipped and one todo across 141 passing and 12 skipped files, 48 database tests
with 18 skipped, and one worker test. Root lint/typecheck, E2E typecheck, the
isolated production build, secret review, release-tool self-test, and Prisma
schema validation pass. Four PostgreSQL producer-barrier specifications are
authored but skipped; the disposable runner failed closed with
`DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`. PostgreSQL migration, contention, ACL,
hosted role/deployment, backup/restore, and recovery execution remain uncredited.

`APPROVAL_ROUTING_V1_ENABLED` remains false. `DEC-0246` human authority continues
to block production activation and certification execution. This checkpoint
cannot create a readiness result and cannot emit `DRAIN_CLEAN`.

### Current Option C C0 contract-only checkpoint

The Decision Chair approved only the immediate C0 discovery and drift-control
checkpoint. Independent challenge review treated any executable or positively
granted writer in C0 as a blocking scope and authority defect. Accordingly, C0
adds exactly 18 deeply frozen, non-executable dormant discovery contracts and a
complete inventory of current application-runtime and controlled-tooling approval-
graph mutation paths. The family partition is seven canonical families, ten
specialized families, and one Finance Close family. Contract version
`dec-0247-c0.dormant-discovery.3` is bound to SHA-256 digest
`9f8e115a0baef11fab2ce1ebd213251551216e7b1720b610b36de6cb25392c61`.

The regression guard uses TypeScript AST inspection for Prisma direct and nested
relation mutations, import/export/require/dynamic-import checks that keep the C0
modules transitively test-only, and comment-normalized raw-SQL scanning for the
six protected graph/provenance relations. Any new or changed runtime or tooling
writer must therefore fail the closed inventory until it is deliberately reviewed
and classified. The manifest records required future family-specific source,
scope, permission, routing, concurrency, stable-error, replay, and identity-
lifecycle design facts, but proposed capability signatures remain deliberately
unset and grant no authority.

C0 creates no database routine, migration, role, grant, graph or provenance write,
readiness result, certification operation, or activation path. It does not remove
the ordinary runtime role's current base approval-graph DML, so the actual Option
C database writer perimeter remains open and production activation remains
blocked. Focused C0 guard coverage passes 10/10, focused approval-routing coverage
passes 84/84, and root typecheck, lint, the isolated production build, secret
review, release-tool self-test, and diff hygiene pass.
The full root suite passes 1,496 web tests with 313 skipped and one todo across 142
passing and 12 skipped files, 48 database tests with 18 skipped, and one worker
test; the UI package has no test files and exits successfully. Independent final
Database, Security, and QA review
returned **GO only for this C0 source checkpoint, C0/H0/M0/L0**. Requested Code
Spark and exact GPT-5.4 reviewers were unavailable; the closest permitted GPT-5.6
specialist fallbacks were used without relaxing a gate. Enablement assessed no
knowledge-base, release-note, training, or glossary change because C0 is
non-executable and changes no user-visible behavior. `DEC-0246` human authority
remains locked and unchanged.

### Current Option C C1 private binary-observer SQL checkpoint

The implemented C1 private observer increment extends each of the exact 18
fixed-family discovery contracts with one approval-instance-bound binary shadow
observer. Every observer has the exact signature
`(p_tenant_id uuid, p_company_id uuid, p_approval_instance_id uuid)`. Tenant,
company, and Approval Instance identifiers are bindings, not authority. The
family is fixed by the routine, while document identity, source relation,
and parent lineage are derived from the bound Approval Instance and authoritative
source facts. No caller-supplied source identifier, source version, proposed
descriptor, policy input, or candidate payload is accepted.

Each design returns only non-authoritative `SHADOW_MATCH` or
`SHADOW_NO_MATCH`, with payload `NONE`. Absent, wrong-scope, wrong-family,
missing-source, ambiguous-source, lineage-mismatch, and all other mismatch cases
collapse to the same negative result. Purchase Order Balance Closure, Purchase
Order Amendment, and Payment Release use `POST_CHILD_ONLY` observation because
their child identity must already exist; the other 15 families use
`POST_SOURCE_ONLY`. These routines neither validate routing policy nor create a
second policy engine. They are private, ungranted, `SECURITY INVOKER`, `STABLE`,
non-leakproof, read-only SQL observers with `search_path=pg_catalog`,
public-qualified relations, no dynamic SQL, and no explicit advisory, row, or
table-lock statement; ordinary PostgreSQL MVCC read locks still apply.

Contract version `dec-0247-c1.private-binary-observer-sql.1` is bound to
SHA-256 digest
`982d32877fd2e71e87394c73b81b2955c6422f586baa14b7d40dbc939b385a0b`.
Migration `20260727160000_approval_routing_shadow_observers`, SHA-256
`bdc1a93e07df6989043c528ac25c4dab532517516e8f0bc9483128570fce9632`,
creates the private schema and exactly 18 routines but no grant, runtime import,
graph or provenance write, readiness fact, certification result, or activation
behavior.

A fresh disposable PostgreSQL 17 database applied all 138 migrations. The
shadow-only all-18 seed plus four producer-barrier cases pass 5/5 with nine
unselected backfill tests skipped; every observer passes a
positive call and null, random-ID, wrong-tenant, wrong-company, and wrong-family
negative calls. The ordinary runtime receives SQLSTATE `42501` for all 18.
Read-only execution and a rolled-back Finance Close lineage-corruption probe pass.
All 18 single-call `EXPLAIN ANALYZE/BUFFERS` probes complete, followed by
separate 25-call correlated checks per routine; the slowest single-call
disposable fixture is 35.690 ms. This is controlled
non-production volume, not a production performance claim. Static observer,
orchestration, and stock-lineage coverage passes 13/13; focused manifest/barrier
coverage passes 13/13; role tools pass 9/9; append-only guards pass 17/17; web and
database lint/typechecks pass.

Independent Database, Security, and QA reviews return **CONDITIONAL GO for this
exact private source checkpoint and fresh disposable rehearsal only**. The
post-review exact PostgreSQL rerun closes QA's temporary High evidence gate.
Remaining review findings are retained as non-disposable/consumption blockers:
audit amended predecessor checksums in every controlled database and forward-fix
any applied history; close unexpected incoming owner/migrator memberships; attest
the SQL language and normalized bodies of all 18 routines; execute the remaining
optional-present and child-lineage corruption matrix; and prove populated hosted
restore/performance behavior. No production deployment or activation approval is
granted.

The next deployment-gate increment closes the earlier source-checkpoint gaps for
controlled role containment, migration-ledger completeness, live observer
attestation, and branch breadth. The only permitted membership touching the
owner, migrator, or runtime is migrator-to-owner with `SET` true, `ADMIN` false,
and inherited owner privileges false; bootstrap and verification fail closed on
all other incoming, outgoing, option-drift, or nested paths. The controlled
migration wrapper first enforces the exact role graph before any Prisma DDL,
then performs a read-only repeatable-read comparison of every
filesystem migration name and SHA-256 checksum against `_prisma_migrations`
before deploy and requires an exact-current ledger after reconciliation. It
rejects unknown, duplicate, failed, rolled-back, logged, gapped, and legacy-hash
histories and never rewrites or resolves the ledger. An absent ledger passes only
on a zero-application-object database; an existing empty ledger fails. The live verifier now pins
the exact metadata and SHA-256 `prosrc` body of all 18 routines.

Fresh PostgreSQL 17 evidence passes all 15 adversarial role-graph cases and the
complete 31-case observer corruption matrix: ten optional-present branches,
18 child branches, and three post-child branches. Every case proves an initial
match, exactly one effective corruption and resulting no-match, transaction-local
rollback, restored match, and no durable controlled-table fingerprint delta.
Static observer coverage passes 5/5, role-tool coverage passes 20/20, and
append-only coverage remains 17/17. The slowest single-call disposable fixture
is 35.880 ms; no production-volume claim is made. Live ledger execution also
passes clean absent-ledger admission, exact-current parsing of all 138 rows,
checksum-drift rejection, exact restoration, and repeat verification.

This increment does not approve non-disposable deployment. The ledger preflight
and Prisma deploy use separate connections, leaving a non-atomic audit/deploy
interval until a deployment-wide lock/fence or separately accepted equivalent is
implemented. Populated hosted restore/performance proof is also absent, and the
separate broader authorization database suite retains observed failures with no
completion credit. Legacy-checksum databases require approved restore/rebuild,
not ledger mutation. Requested Code Spark and exact GPT-5.4 models were
unavailable, so the closest permitted GPT-5.6 specialists were used without
relaxing any hard gate.

C1 is not the complete Option C writer perimeter. Ordinary runtime base approval
graph DML remains, and no typed writer capability or positive grant exists. The
broader approval-routing suite remains deliberately outside this checkpoint and
NO-GO because the separately governed `DEC-0246` maintenance authority has not
been implemented. Before any non-disposable deployment, operators must audit
controlled migration history and checksums because this checkpoint corrects two
never-production-approved predecessor migrations discovered by PostgreSQL 17
rehearsal. The complete typed writer
perimeter, removal of runtime base graph/provenance DML, Option B completion,
`DEC-0246` human authority, certification, activation, Workspace 4, and Phase I
remain **NO-GO**.

### Current Option C C2 dormant closed-writer capability/drift contract checkpoint

C2 is a separate test-only declarative contract and does not mutate the C1
observer manifest or digest. `apps/web/tests/contracts/approvalProducerClosedCapabilityContract.ts`
binds exactly 18 producer families to their current service/function identity,
the singleton `producer.<family>` mutation inventory entry, required source and
lineage facts, lock/CAS/replay/error facts, and a deterministic future capability
name. Every entry remains `DISCOVERY_ONLY`, non-executable, non-runtime-callable,
ungranted, with `signature: null`, `runtimeBaseGraphDml: OPEN`, and no
readiness, certification, or activation result. The contract imports no runtime
consumer and creates no database object, role, grant, migration, or source
mutation.

Contract version `dec-0247-c2.dormant-closed-writer-contract.1` is bound to
inventory digest
`3f952a575bb24c781ada9cfecac5b2aefa90c49967df25ec9a80a5a0dd0a800d`. The digest
includes the C1 version, all 18 producer entries, all shared graph mutators,
tooling DML/DDL/probe inventories, and raw-SQL owner/body inventory. Static
coverage passes 14/14, including exact family/producer bijection, mutation shape,
deep-freeze, test-only import boundary, and C0 AST/raw-SQL drift guards.

C2 does not close the database writer perimeter. Ordinary runtime base graph DML,
all-18 typed capabilities, active semantic/provenance validation, disposable
PostgreSQL ACL/concurrency evidence, `DEC-0246` authority, deployment/recovery,
certification, and activation remain pending. `APPROVAL_ROUTING_V1_ENABLED`
remains false; C2 cannot produce `V1_PRODUCER_BARRIER_READY` or `DRAIN_CLEAN`.

### Current Option C C3 dormant typed-adapter shape checkpoint

C3 preparation adds only the test-only
`apps/web/tests/contracts/approvalProducerTypedAdapterContract.ts` shape for the
18 future family-specific writer adapters. Each entry requires source locking,
source compare-and-set, and replay/idempotency design, but remains
`DORMANT_UNAVAILABLE`, non-executable, non-runtime-callable, ungranted, and
descriptor-binding-only. No adapter is imported by runtime services, no generic
descriptor API or database routine exists, and no source, graph, audit,
notification, inventory, or approval behavior changes.

Contract version `dec-0247-c3.dormant-typed-adapter-shape.1` is bound to digest
`38244059fbcee62c36634bac91f7bb95d84f3c160b76b90405090c7b826fabde`. Focused
C0/C1/C2/C3 coverage passes 16/16. This is not an executable capability rollout
or ACL migration. Existing compatibility writers and runtime graph DML remain
open until all 18 adapters and every shared routing, decision, terminal,
cancellation, provenance, and tooling writer are migrated and proven. Source
lock/CAS/replay gaps, child identity design, PostgreSQL semantic/concurrency/ACL
and restore evidence, `DEC-0246` authority, deployment/recovery, certification,
and activation remain pending. `APPROVAL_ROUTING_V1_ENABLED` remains false.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement dormant Option B barrier generations, automatic locks, deferred exact validator, and readiness result | Database and backend owners | Before producer-barrier readiness review | In progress — empty DORMANT generation/provenance schema, all-18 outer shared-lock wrappers, and six graph/provenance shared-lock triggers authored; active validator, provenance writes, exclusive final scan, and readiness result pending |
| Move all 18 producers behind Option C typed closed capabilities and remove runtime base graph/provenance DML | Database, backend, and security owners | Before production activation | In progress — C0 pins the exact 18 dormant discovery contracts and closed mutation inventory; C1 implements the private, ungranted fixed-family binary observer SQL. Executable typed writer capabilities, positive grants, and removal of runtime base graph/provenance DML remain pending |
| Execute the complete all-18 semantic, race, privilege, deployment, and recovery test matrix | QA, Database, Security, DevOps, and Release | Exact release candidate | Pending |
| Confirm issuer, key custody, revocation, STOP, and recovery authority required by `DEC-0246` | Authorized human owner | Before production activation or certification execution | Blocked — human decision required |
| Assess Dunong handoff if a visible retry or maintenance state is introduced | Product and enablement owners | Before user exposure | Not required for dormant implementation |

## Evidence

- Repository-root `AGENTS.md` — authority, hard-gate, documentation, and
  deliberation requirements.
- `docs/core/00-governance/decisions/DEC-0244-NORMALIZED-APPROVAL-DECISION-SURFACE-CONTRACT.md`
  — closed 18-family normalized decision capability contract and activation gates.
- `docs/core/00-governance/decisions/DEC-0245-DURABLE-APPROVAL-BACKFILL-AND-DRAIN-ORCHESTRATION.md`
  — durable company-scoped reconciliation, barrier dependency, and prohibition on
  unsupported `DRAIN_CLEAN`.
- `docs/core/00-governance/decisions/DEC-0246-APPROVAL-BACKFILL-MAINTENANCE-AUTHORITY.md`
  — closed maintenance reference-monitor design and unresolved human authority.
- `apps/web/src/server/services/approvalRoutingRegistry.ts` — authoritative 18-
  family routing registry and canonical family inputs.
- `apps/web/src/server/services/approvalRouting.ts` — current v0-to-complete-v1
  configuration, eligibility, activation, and runtime-readiness behavior.
- `apps/web/src/server/services/approvalProducerCapabilityManifest.ts` and
  `approvalGraphMutationInventory.ts` — C0 non-executable family contracts,
  canonical/specialized/Finance Close partition, closed runtime/tooling mutation
  inventory, and C1 private fixed-family binary observer contracts.
- `apps/web/src/server/services/approvalProducerCapabilityManifest.test.ts` —
  C0/C1 digest, transitive test-only boundary, AST/raw-SQL drift, exact-inventory,
  observer-input, lifecycle, and no-payload regression gates.
- Production producer inventory and independent Database, Architecture, Security,
  QA, Product/Operations/Release, and Software Audit deliberation supplied to the
  Decision Chair on 2026-07-27.
- Requested Code Spark and exact GPT-5.4 subagent models were unavailable. The
  closest permitted GPT-5.6 specialist roles, including GPT-5.6 Mithi for
  documentation stewardship, were used. Model fallback did not relax a hard gate
  or authorize activation.

## Purchase Request source-lock prerequisite — July 27, 2026

The Purchase Request producer now locks the exact scoped source row inside the
shared-barrier transaction and derives submission routing facts from that
authoritative snapshot. Its DRAFT claim uses an exact source-version/status/
scope compare-and-set. This corrects the stale pre-read defect without
activating a typed capability; durable replay identity and adjacent
cancel/reopen/decision writer races remain rollout blockers.

The follow-up lifecycle prerequisite applies the same barrier and exact source
lock/version CAS to Purchase Request reopen and cancel, and reloads budget
linked lines inside the cancellation transaction. This prevents stale
submit-versus-cancel/reopen overwrites but does not close the perimeter:
approval decision writers, orphan pending-graph coherence, brand-target policy,
durable replay identity, and executable all-family adapters remain open.

Purchase Request approve, return, and reject now use the same barrier → source
row lock → approval graph order and include the locked source version in their
status/current-step CAS. This is a reversible source-integrity prerequisite;
disposable PostgreSQL race evidence, line/source snapshot proof, replay
identity, and the remaining family decision/terminal/cancellation writers are
still required before any executable capability or ACL cutover.

Quotation Recommendation submission now follows the same barrier-first order,
locks the recommendation → quotation request → Purchase Request lineage, and
re-reads the recommendation and active rule before its exact version/status/
lineage CAS. This closes the producer's stale upstream-lineage snapshot defect
without adding replay identity or activating the capability; recommendation
creation concurrency and approval decision-path migration remain separate gates.

Purchase Order submission now follows barrier → Purchase Order → recommendation
→ quotation request → Purchase Request lock order, revalidates the complete
lineage and supplier/location status, and claims DRAFT before graph creation
with a scoped status/linkage CAS. PurchaseOrder has no version field, so this
checkpoint adds no schema migration; replay identity, sibling PO lifecycle
writers, and disposable race evidence remain open.

Purchase Order balance-closure requests now use the locked parent facts for all
routing and audit/notification lineage and create the preallocated child before
its ApprovalInstance. This satisfies the POST_CHILD_ONLY identity order and
keeps child, graph, routing, audit, and notification writes atomic; replay,
composite child-parent scope integrity, and executable PostgreSQL evidence
remain open.

Purchase Order amendment requests now lock and re-read the scoped parent before
snapshotting, create the preallocated amendment child before graph work, and
claim the parent `ISSUED → AMENDMENT_PENDING` state before routing. Existing
stable conflict feedback remains `PURCHASE_ORDER_NOT_ISSUED_FOR_AMENDMENT`;
durable replay, brand invariants, sibling decision locks, and PostgreSQL race
evidence remain separate gates.

Wastage Report submission now follows the same barrier-first contract: it locks
the report through the authorized InventoryLocation→Location scope, reloads
lines and evaluates policy inside the transaction, requires a sealed active
rule, and claims DRAFT/RETURNED before creating approval graph rows. Focused
source validation passes 17/17 and web typecheck passes. PostgreSQL contention,
rollback, policy/rule drift, malformed-line integrity, notification, replay,
and sibling-writer evidence remain pending; the feature flag remains false and
this does not authorize activation or ACL migration.

Stock Adjustment submission now follows the same barrier-first contract: it
locks the adjustment through its tenant/company and InventoryLocation→Location
lineage, reloads the header and lines, requires a sealed active rule, and claims
the admitted draft/submitted/returned status before graph creation. Focused
coverage passes 18/18 and web typecheck passes. Durable replay, PostgreSQL race
and rollback evidence, sibling writer migration, and ACL/activation gates remain
open. Existing submit MFA action/permission semantics are recorded as a
separate sensitive-operation correction; this checkpoint does not activate the
capability.

Finance Close sensitive-action approval requests retain their locked and
rehydrated FinanceCloseRun source, now require a sealed active rule, and claim
the exact `CLOSED` plus expected-version pending-action snapshot before graph
creation. Focused coverage passes 10/10 with web typecheck/lint and diff checks
green. Readiness-child locking, finance MFA semantic alignment, PostgreSQL race
and rollback evidence, replay, sibling writers, and activation remain open.

Budget Revision submission now locks the revision, parent Budget, ordered
BudgetLine rows, and distinct header/line Location rows before rehydration and
sealed-rule selection, then claims DRAFT→SUBMITTED with the locked `updatedAt`
before graph creation. Existing SUBMITTED revisions fail closed because replay
intent/hash and typed budget-line lineage are absent. Focused Budget Control
coverage passes 6/6 with web typecheck/lint and diff checks green; PostgreSQL
lifecycle-race, rollback, scope, orphan-graph, and replay evidence remain
pending, and no capability or ACL activation is authorized.

Expense Request submission now locks the request through its active
tenant/company Location, rehydrates typed lines/source links, requires a sealed
rule, claims the admitted draft/revision state with scoped version/status/link
predicates before graph creation, and attaches the exact approval backlink with
a second CAS. Existing AWAITING_APPROVAL requests fail closed because durable
replay identity is absent. Focused coverage passes 4/4 with web typecheck/lint
and diff checks green; PostgreSQL race, lineage, evidence, rollback, sibling
writer, and activation evidence remain pending.

Cash Advance submission now locks the request through an active
tenant/company Location, requires a sealed rule, claims the admitted draft or
returned state before graph creation, and attaches the exact approval backlink
with a second CAS. The legacy approval path now prohibits both requester and
beneficiary self-approval. Focused coverage passes 10/10 with web typecheck
green. Optional linked-source lineage, evidence/payment handoff policy,
replay, PostgreSQL races/rollback, sibling writers, and activation remain open;
no payment, bank, journal, or settlement mutation is authorized.

Petty Cash submission now locks the request with its active PettyCashFund and
Location, requires a sealed rule, initializes the immutable requested-amount
proposal with expected-`updatedAt`/status/link CAS before graph creation, and
attaches the exact approval backlink with a second CAS. Existing awaiting rows
fail closed because replay and decision-intent proof are absent. Focused
coverage passes 11/11 with web typecheck green; fund/lineage, custodian-policy,
evidence/handoff, PostgreSQL race/rollback, sibling writer, and activation gates
remain open.

Payment Request submission now locks the request through active same-scope
Location, ordered PaymentRequestLine rows, and linked AP invoices under the
shared company barrier. It rehydrates locked facts, requires a sealed rule,
claims the admitted draft/returned state before graph creation, and attaches
the exact ApprovalInstance backlink with a second compare-and-set. Pending or
incoherent prior approval links fail closed. Focused finance coverage passes
30/30 with web typecheck and lint green; disposable PostgreSQL race, lineage,
rollback, and notification evidence remains unavailable. Normalized Payment
Request policy (DEC-0244), legacy decision-writer parity, durable replay,
Payment Release/AP settlement, and activation remain open; the routing flag
stays false.

Independent Architecture, Security, and QA review of Payment Release reached
consensus that the current graph-first producer is not safe to migrate as a
lock/CAS-only patch. The bounded design must lock the approved PaymentRequest,
ordered lines and AP invoices, BankAccount, and active exposure under the
company barrier; require a sealed rule; create the DRAFT release and
allocations before the graph; attach the exact graph by CAS; and define durable
canonical-payload replay/conflict semantics. Payment-readiness, controlled
evidence, document-number allocation, and AP/bank/journal settlement decisions
remain open. The Payment Release adapter therefore remains `ABSENT/PARTIAL`,
no production-readiness credit is claimed, and the routing flag stays false.

The dormant Employee Leave producer now locks the request, active employee, and
active location under the shared barrier, requires a sealed rule, rejects blind
submitted replay, and atomically binds the graph backlink after scoped source
CAS. Routing and legacy approval prohibit requester, creator, and linked
employee-user self-approval. Focused Workforce coverage passes 22/22 with web
typecheck/lint green; PostgreSQL race, rollback, replay, and lifecycle-writer
parity remain unexecuted/open. This is planned Phase III compatibility work,
not Phase I or production activation; the routing flag remains false.

The dormant Employee Overtime producer now applies the same locked source,
employee, and location contract, sealed-rule gate, scoped DRAFT/`updatedAt`
CAS, and exact graph backlink binding. Requester, creator, and linked employee
users are prohibited from approving the record. Focused Workforce coverage
passes 22/22 with web typecheck/lint green; PostgreSQL race, rollback, replay,
and lifecycle-writer parity remain unexecuted/open. This remains planned Phase
III compatibility work, not Phase I or production activation.

The dormant Workforce Schedule producer now locks the schedule, ordered
same-scope lines, and active Location under the shared barrier, requires a
sealed rule, validates line lineage, and binds the approval graph backlink with
scoped status/`updatedAt` CAS. Focused Workforce coverage passes 22/22 with web
typecheck/lint green; PostgreSQL contention, rollback, replay, and lifecycle
writer parity remain unexecuted/open. This remains planned Phase III
compatibility work, not Phase I or production activation.

Conditional Attendance Import review now locks the batch, ordered import lines,
and active Location, requires a sealed rule for approval-required outcomes, and
uses scoped source CAS in both the graph and graph-free branches. No payroll,
device, payment, journal, or schedule authority is introduced. Focused
Workforce coverage passes 22/22 with web typecheck/lint green; PostgreSQL race,
rollback, replay, and lifecycle-writer parity remain unexecuted/open. This is
planned Phase III compatibility work, not Phase I activation.

Independent Architecture, Security, and QA review selected Employee Leave as
the safest first typed-adapter pilot: one source plus Employee/Location lineage,
no money or inventory effect, and existing source-lock/CAS hardening. The
proposed family-specific adapter remains a C4 design/rehearsal gate only. No
executable routine, positive grant, base-DML revocation, or runtime call is
authorized until DEC-0246 human authority, disposable PostgreSQL semantic/ACL
evidence, exact replay/rollback proofs, and the complete all-18 plus
decision/terminal/cancellation/tooling perimeter are satisfied. C4 changes no
user-visible behavior; the routing flag remains false.

## Supersession

This record does not supersede `DEC-0244`, `DEC-0245`, or `DEC-0246`. It closes
the producer-barrier architecture decision required by those records while
preserving their separate decision-surface, orchestration, human-authority,
certification, and activation gates.
