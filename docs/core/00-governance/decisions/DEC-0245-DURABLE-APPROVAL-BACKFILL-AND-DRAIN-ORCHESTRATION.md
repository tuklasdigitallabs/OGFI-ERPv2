# DEC-0245 — Durable Approval Backfill and Drain Orchestration

## Metadata

- Decision ID: `DEC-0245`
- Title: Durable Approval Backfill and Drain Orchestration
- Status: `Confirmed — executor source/schema implemented; intentionally non-operational; feature disabled`
- Date: 2026-07-27
- Decision owner: Shared Production Foundation / Approval Routing
- Decision Chair: Parent agent
- Related phase/module: Phase I normalized approval-routing backfill, drain, and cutover preparation
- Related decisions: `DEC-0050`, `DEC-0051`, `DEC-0052`, `DEC-0075`, `DEC-0244`
- Related decision brief: Parent-led durable approval backfill orchestration deliberation

## Decision

Select Option B: authoritative `APPLY` and drain work must use one durable
PostgreSQL orchestration boundary per tenant and company, comprising a run,
checkpoint, and lease. The run is immutably bound to the routing schema version,
routing mapping version and hash, `DEC-0244` capability version and hash, and
release identity. Database time governs lease validity; every acquisition or
takeover advances a monotonic fencing value that all page writes must match.

Each invocation processes at most one bounded page in a `Serializable`
transaction. Routing mutations and their immutable audits, durable known-blocker
facts, immutable batch evidence, and the next checkpoint commit atomically.
Known deterministic blockers are recorded durably and idempotently. An unknown
error or retryable database/infrastructure failure aborts the whole page and does
not advance the checkpoint. `DRY_RUN` is truly read-only and creates or changes no
run, lease, checkpoint, routing, audit, blocker, batch, or certification record.

The orchestration contract distinguishes `CONTINUE`, `BLOCKED`, `RETRYABLE`,
`INCOMPATIBLE`, `BARRIER_REQUIRED`, and `STOPPED`. `DRAIN_CLEAN` is reserved for a
future certified state and the current implementation cannot emit it. Callers
must not collapse these outcomes into a boolean success or generic failure.
Append-only batch and blocker history preserves what was evaluated under which
immutable contract. A mandatory from-zero reconciliation is required before any
clean certification.

Neither `DRAIN_CLEAN` nor activation is currently available. They remain blocked
until a separately implemented company-scoped v0-producer barrier, all-18-family
writer proof, the required final clean passes and certification, Payment Request
policy resolution, and every external gate retained by `DEC-0244` are accepted.
`APPROVAL_ROUTING_V1_ENABLED` remains false. Rollback means stop execution, keep
the flag false, and forward-repair; never downgrade or delete committed v1 routing
facts, approval audits, batches, blockers, or certification evidence.

A post-implementation authority review selected its separate Option D: the
executor must run only through a dedicated, non-login-member maintenance role
using a root-controlled credential and immutable operator, change-authorization,
and exact-release authority evidence. The ordinary web runtime has zero table or
column privileges on Run, Batch, and Blocker. The maintenance role and authority
records are not implemented, so the executor is intentionally **NON-OPERATIONAL**:
no dry run, start, resume, apply, or stop is authorized. Environment strings such
as `operatorIdentity` and `authorizationReference`, and the deployed `GITHUB_SHA`,
are request bindings only; they do not authenticate an operator or grant change
or release authority.

## Outcome semantics

| Outcome | Meaning | Checkpoint/effect rule |
|---|---|---|
| `CONTINUE` | The bounded page committed coherently and more candidate work may remain. | Routing/audits, known blockers, batch evidence, and checkpoint commit together. A later explicit invocation continues. |
| `BLOCKED` | Known durable blockers prevent a clean drain even though their observation was handled coherently. | Blocker evidence is idempotent and append-only; no claim of clean readiness is allowed. |
| `RETRYABLE` | A recognized transient database, serialization, lease, or infrastructure condition prevented the page from committing. | The whole page rolls back and the checkpoint does not advance. A later bounded invocation may retry after the cause is addressed. |
| `INCOMPATIBLE` | Contract binding, release identity, schema, cursor, or fencing state does not match the authoritative run. | Fail before routing mutation or checkpoint advance; require an explicit compatible recovery or new governed run. |
| `BARRIER_REQUIRED` | The durable reconciliation passes are clean under the bound source contract, but the company-scoped producer barrier and final certification do not yet exist. | Preserve the run and evidence; do not resume, certify, or activate from this outcome. The next implementation checkpoint is the producer barrier. |
| `STOPPED` | An explicit scoped operator stop fenced the run and released its lease. | Preserve all prior routing, audit, batch, blocker, and run evidence. A stopped run is terminal and a later governed run must use a new identity. |
| `DRAIN_CLEAN` | A future certified state proving the protected company has no remaining v0 or inconsistent target under the bound contract. | Unavailable until every clean-certification prerequisite in this decision passes. It is not itself permission to enable the feature flag. |

These are orchestration outcomes, not approval-document statuses and not business
policy. A known data blocker is not a retryable infrastructure failure; an unknown
exception must not be mislabeled as a durable blocker merely to keep scanning.

## Context

The existing approval-routing backfill can scan bounded records and either inspect
or apply routing descriptors, but process-local progress is insufficient for a
production drain. A restart, overlapping operator invocation, deployment change,
or stale worker can otherwise repeat or skip work without a durable statement of
which mapping, capability contract, and release performed it. A cursor alone also
cannot prove that no legacy v0 producer created new work behind the cursor.

`DEC-0244` established the closed 18-family decision capability contract and its
stable version/hash specifically so later backfill can bind to the runtime that
will consume mapped records. The backfill must also bind the routing schema and
mapping identities and exact release. Continuing after any of those identities
changes would combine evidence from incompatible implementations.

The operation must tolerate an expected known blocker without losing successful
work in the same bounded page, while refusing to convert unknown failures into
progress. Durable idempotent blocker evidence makes remediation reviewable.
Atomic batch/checkpoint evidence makes a committed cursor trustworthy. A
database-time lease with monotonic fencing ensures that an expired worker cannot
commit after a replacement has taken over.

Even a completed forward scan is not a drain certificate. Without a protected
producer boundary, a v0 writer can insert or mutate a record behind the cursor.
The selected contract therefore requires a future company-scoped v0-producer
barrier, proof across all 18 source writers, and a from-zero reconciliation before
clean certification. Payment Request policy and the broader `DEC-0244` gates also
remain independent blockers to clean/activation claims.

## Options considered

### Option A — rejected: signed stateless continuation token

- Summary: Return a signed token containing cursor and contract identity; each
  caller presents the token to process the next page without durable run state.
- Benefits: No orchestration tables, simple horizontal execution, and explicit
  tamper detection when signing and verification are correct.
- Failure modes: Concurrent operators can validly reuse the same token; a stale
  holder has no database fence; signing-key rotation and release changes complicate
  resumption; operator loss discards authoritative progress context; and immutable
  takeover, batch, blocker, and certification evidence is incomplete.
- Why rejected: Architecture initially preferred this smaller design, but challenge
  showed it could not provide the hosted takeover and evidence guarantees required
  for controlled populated-data mutation. Architecture accepted Option B once
  database-time lease and fencing safeguards were included.

### Option B — selected: durable PostgreSQL run, checkpoint, and fenced lease

- Summary: Persist one tenant/company orchestration boundary with immutable
  contract binding, database-time lease, monotonic fencing, bounded Serializable
  page transactions, and append-only batch/blocker evidence.
- Benefits: Serializes authoritative operators, survives process and deployment
  restart, supports safe takeover, makes exact progress and blockers auditable,
  binds evidence to the consuming contracts/release, and fails closed on drift.
- Failure modes: A lease bug can permit stale writes or block takeover; a page can
  become too large for Serializable contention; incorrect error classification can
  advance past unknown faults; mutable history can erase evidence; or a forward
  scan can be mistaken for a clean drain without a producer barrier.
- Why selected: It passed the applicable hard gates and scored best for hosted
  takeover, auditability, recoverability, and data-integrity evidence. Its extra
  schema and operational cost are bounded and additive.

### Option C — rejected: automatic in-process loop until drain

- Summary: One command repeatedly processes pages and retries until it reports no
  remaining records.
- Benefits: Less operator interaction and potentially faster completion.
- Failure modes: Creates a long-running opaque job; can hold or repeatedly acquire
  resources without a review point; hides retry storms and partial evidence;
  complicates deployment shutdown and takeover; and can falsely conclude clean
  while v0 producers remain active.
- Why rejected: One bounded page per explicit invocation keeps runtime, rollback,
  evidence, and operator control reviewable. Automation may be reconsidered only
  after the same durable fences and stop conditions are proven.

### Initial orchestration Option D — rejected: defer durable orchestration and retain ad hoc backfill

- Summary: Keep normalized routing disabled and use the current process-local
  backfill only for development inspection.
- Benefits: No immediate migration or orchestration work.
- Failure modes: Leaves no production-safe takeover, resumability, contract
  binding, blocker history, or clean certification path and indefinitely blocks
  normalized routing readiness.
- Why rejected: Deferral does not resolve the required activation dependency. The
  feature flag nevertheless remains false until the selected design and every
  later gate pass.

## Deliberation conclusion

Initial Database, Security, and QA positions selected Option B. Architecture
initially selected Option A for its smaller state surface. Targeted challenge
showed that a signed stateless token could detect tampering but could not fence a
stale valid holder or provide authoritative hosted takeover and durable evidence.
Architecture accepted Option B with database-time lease validity and monotonic
fencing.

Database Engineering later shifted conditionally toward Option A to minimize
schema and lock complexity, but agreed that the company v0-producer barrier and a
durable clean certificate are mandatory regardless of cursor design. The Decision
Chair applied the hard gates and scorecard and confirmed Option B because safe
hosted takeover, exact contract binding, and durable review evidence outweighed
the additional additive schema. This was not a majority vote.

Requested Code Spark and exact GPT-5.4 models were unavailable. The closest
permitted GPT-5.6 specialist roles were used. Model fallback did not relax a hard
gate, authorize data mutation, or change the feature-disabled posture.

### Post-implementation authority lock — separate Option D selected

Independent Security and QA review found that granting orchestration relations to
the normal web runtime would make request-controlled environment strings act as a
surrogate authorization boundary. The Decision Chair therefore confirmed the
authority review's Option D: retain the source/schema checkpoint but revoke every
web-runtime table and column privilege on all three orchestration relations until
a separately reviewed dedicated maintenance executor exists. That role must not
be a member of the web-runtime or migrator roles, must receive its credential only
through a root-controlled execution path, and must validate immutable operator,
change-authorization, and exact-release authority records before opening a
database transaction. This authority slice remains pending; source code and
environment variables alone cannot unlock execution.

The authority review rejected reuse of the ordinary web runtime, a broadly
callable privileged routine, and reuse of the migrator or owner credential. Those
alternatives respectively expose high-impact maintenance mutation to the
application attack surface, create a privilege-escalation API, or collapse
deployment ownership into operational execution. Option D adds operational setup
and incident-recovery cost, and a lost root-controlled credential can delay a
needed stop; its safeguards are least-privilege table/column grants, no role
membership, root-controlled credential delivery, immutable authority records,
exact-scope and release validation before connection, and separately approved
recovery. It was selected because it is the only reviewed option that keeps web,
migration, ownership, and populated-data maintenance authority separated.

## Hard-gate assessment

- **Tenant/company isolation:** A run is scoped to exactly one tenant and company.
  Selection, routing mutations, blockers, batches, checkpoint, and certification
  must use that immutable scope. A cross-scope row is a durable known blocker or
  an incompatible condition according to the closed classifier; it is never
  adopted into the run.
- **Server authorization and operator control:** Only the approved privileged
  maintenance entry point may inspect, acquire, renew, mutate, or stop a run.
  The web runtime has zero access to Run, Batch, and Blocker. The future executor
  must prove immutable operator, change, exact-scope, and release authority before
  any database work. Environment values, a token, run ID, request ID, lease ID,
  authorization reference, or release SHA are bindings and never authority.
- **Approval segregation:** Backfill reconstructs routing facts; it does not act on
  a decision step, grant approval authority, or bypass no-self-approval and
  prohibited-actor rules. Eligible-actor and all-18 writer evidence remain gates.
- **Inventory, money, and audit integrity:** Backfill creates no approval outcome,
  payment, settlement, journal, commitment, inventory movement, or source status
  effect. Routing changes and immutable audit evidence commit together. Historical
  v1 facts and audits are never downgraded or deleted.
- **Transactional consistency and idempotency:** Each page is bounded and
  `Serializable`. Current fence/lease validation, routing/audit writes, known
  blocker facts, batch evidence, and checkpoint share one transaction. Stable
  identities make replay idempotent. Unknown or retryable failures roll back the
  whole page.
- **Phase scope:** The orchestration is limited to existing normalized approval
  routing for the closed 18 families. It adds no workflow action, threshold,
  source-family behavior, queue platform, Redis dependency, or new module.
- **Recovery and rollback:** Stop the runner, keep the routing flag false, preserve
  evidence, and forward-repair. Once the maintenance authority gate exists, the
  implemented `STOP` operation requires exact
  tenant/company/run and stored-contract binding, acquires or takes over only an
  available or expired database-time lease with a higher fence, appends an audit,
  marks the run terminal `STOPPED`, and clears the lease atomically. It cannot
  pre-empt another owner's unexpired lease. Incompatible contract/release state
  fails closed. Destructive downgrade or deletion of committed v1 routing/audit
  history is prohibited.

The selected authority design preserves the hard gates, but its executable role,
credential, and immutable authority records do not yet exist. Therefore the
executor, database evidence, drain certification, activation, and production
gates remain open.

## Required safeguards

### Durable contract and lease

- Keep Run, Batch, and Blocker inaccessible to the ordinary web runtime. Before
  any `DRY_RUN`, `START`, `RESUME`, `APPLY`, or `STOP`, implement and independently
  review the dedicated non-member maintenance role, root-controlled credential
  delivery, and immutable operator/change/release authority validation. Do not
  treat `operatorIdentity`, `authorizationReference`, `GITHUB_SHA`, or possession
  of the maintenance credential as sufficient authority by themselves.

- Permit only one authoritative run/checkpoint/lease boundary for a tenant/company
  at a time. Retain completed or stopped run history rather than overwriting it.
- Bind the run immutably to tenant, company, routing schema version, routing
  mapping version/hash, `DEC-0244` capability version/hash, and exact release
  identity. Reject missing, changed, unknown, or partially matching bindings as
  `INCOMPATIBLE` before mutation.
- Use PostgreSQL time for acquired, renewed, expired, and takeover comparisons.
  Application-host clocks cannot decide lease ownership.
- Advance a monotonic fencing value on every new acquisition or expired-lease
  takeover. Every renewal and page transaction must compare the exact run, owner,
  fence, and unexpired database-time lease. A stale holder must be unable to
  commit even if it resumes after a replacement acquired the lease.
- Keep lease duration, renewal timing, page size, and page time bounds explicit,
  validated, and operationally configurable; do not infer production values from
  development defaults.
- Store lease and standalone run/evidence times as `TIMESTAMPTZ(3)` and evaluate
  leases with PostgreSQL `clock_timestamp()` under an explicit UTC session. Keep
  the cursor timestamp aligned with the source `ApprovalInstance.createdAt`
  `TIMESTAMP(3)` so the direct pending keyset index remains usable.

### Bounded page and evidence transaction

- Process no more than one bounded deterministic page per invocation. Ordering
  and cursor fields must be stable, total, tenant/company scoped, and compatible
  with inserts and retries. Do not use an unbounded auto-loop.
- Run authoritative page work at PostgreSQL `Serializable` isolation. Treat a
  serialization failure as `RETRYABLE`; do not record a batch or advance the
  checkpoint for the rolled-back attempt.
- In one transaction, revalidate lease/fence/contract, lock and evaluate page
  candidates, write permitted v1 routing plus immutable audit, append idempotent
  known-blocker and batch facts, and advance the checkpoint. Partial commit is
  forbidden.
- Maintain a closed known-blocker code set. A stable identity must make an exact
  retry create no duplicate blocker or audit fact. Preserve blocker observation
  and later remediation/resolution as append-only history; never erase or rewrite
  the original fact.
- Unknown exceptions and retryable database/infrastructure errors abort the page.
  They must not be coerced to a known blocker, counted as a committed batch, or
  advance the checkpoint.
- Keep batch and blocker evidence append-only and bound to run, batch, scope,
  contract versions/hashes, release identity, cursor interval, fence, database
  timestamps, counts, and safe error/blocker identifiers. Do not store secrets,
  raw database errors, or unnecessary confidential source content.
- Preserve the terminal-candidate count in each batch, receipt, replay result, and
  cumulative run. Database checks require each batch's scanned count to equal
  applied plus already-current plus terminal plus blocker counts.
- Enforce START shape in the database: exact existing tenant/company scope;
  `ACTIVE`, fence 1, pass 1, next batch 1; zero counters; no cursor, receipt, or
  terminal evidence; one valid bounded lease; and equal created/started/updated
  timestamps. A status change requires the matching committed batch or the exact
  same-transaction STOP audit.
- Enforce STOP as one fenced transaction. Its audit must be newly inserted in that
  transaction, match tenant/company/run, event type, request, before/after status,
  lease owner, fence, release binding, and stopped timestamp. The run then becomes
  terminal `STOPPED`, links that audit, and clears its lease. Existing terminal
  evidence is immutable.

### Dry run, drain, and certification

- `DRY_RUN` must be a genuinely read-only code path. It may use a read-only
  transaction and return an ephemeral assessment, but it must not acquire/renew a
  durable lease or insert/update/delete routing, audit, run, checkpoint, batch,
  blocker, or certificate state. Rollback after attempted writes is not sufficient
  proof of a read-only design.
- Require an exact tenant and company for `DRY_RUN`; broad all-tenant or
  all-company inspection is prohibited. Durable operations require exact
  tenant/company/run/request/lease/contract bindings. APPLY and STOP fail closed
  with a stable incompatible reason while normalized routing is enabled.
- Project recognized validation, incompatibility, contention, and retryable
  database failures through bounded machine-safe reason codes. Do not return raw
  database messages or stack details as operator outcomes; unknown failures abort
  without a committed batch or checkpoint.
- Keep outcome states distinct and machine-readable. `BLOCKED` is not
  `RETRYABLE`; `INCOMPATIBLE` is not a new-run shortcut; `CONTINUE` is not clean;
  `BARRIER_REQUIRED` is not clean or resumable; `STOPPED` is terminal; and
  `DRAIN_CLEAN` is not activation.
- Implement a separate company-scoped v0-producer barrier before clean drain can
  be evaluated. Prove that all 18 source-family writers honor it under concurrency
  and cannot create or regress a v0 routing record behind the checkpoint.
- After the producer barrier is active, perform the prescribed final clean passes
  and a mandatory deterministic reconciliation from cursor zero under the same
  immutable contract and release. Reconcile totals and every targeted record,
  current v1 descriptor/audit, unresolved blocker, and exclusion; a forward-scan
  end alone cannot certify clean.
- Make clean certification durable and append-only, tied to the barrier evidence,
  all-18 writer proof, final passes, from-zero reconciliation, zero unresolved
  targets/blockers, immutable contract, release, scope, and database timestamps.
  Until that implementation and evidence exist, the state machine cannot emit
  `DRAIN_CLEAN`.
- Keep `APPROVAL_ROUTING_V1_ENABLED=false`. Even a future valid `DRAIN_CLEAN`
  certificate does not enable the flag automatically; activation requires its own
  explicit review and all `DEC-0244` gates.

## Required tests and acceptance evidence

- Add migration tests proving the orchestration schema is additive, empty on
  install, creates no run/checkpoint/lease/batch/blocker/certificate data, performs
  no routing backfill, preserves populated approval data, and has reviewed
  rollback/forward-fix behavior.
- Prove unique tenant/company active-run ownership and exact immutable binding for
  schema, mapping version/hash, capability version/hash, and release identity.
- Use deterministic concurrency barriers—not sleeps—to prove first acquisition,
  renewal, non-expired conflict, expired takeover, monotonic fence advance, stale
  holder rejection before commit, and two contenders with one authoritative
  winner under database time.
- Prove one bounded `Serializable` page commits routing, exact audit cardinality,
  idempotent known blockers, one append-only batch, and checkpoint together; inject
  failures at each write boundary and prove total rollback/no checkpoint advance.
- Prove exact replay, retry after serialization/deadlock/connection failure,
  unknown-error rollback, stable blocker deduplication, blocker remediation
  history, restart, deployment/release mismatch, mapping/capability mismatch, and
  safe operator takeover.
- Enforce database-observed read-only `DRY_RUN`: zero durable writes and zero
  sequence/row effects across every orchestration, routing, audit, blocker, batch,
  and certification relation, including known blockers and injected failures.
- Assert all current machine outcomes and the reserved `DRAIN_CLEAN` projection
  without leaking database errors or treating a retryable, blocked, incompatible,
  barrier-required, or stopped result as clean.
- Prove all 18 legacy/current source writers against the future company-scoped
  producer barrier, including writer-versus-final-pass races and attempts to create
  or regress v0 work behind the checkpoint.
- Prove final clean passes and from-zero reconciliation detect late inserts,
  cursor gaps, changed descriptors, missing/duplicate audits, unresolved blockers,
  scope drift, contract/release drift, and any v0 record. Certify only an exact
  clean result; never infer it from counters or an end cursor.
- Verify stop/flag-false/forward-repair rollback, backup/restore of orchestration
  and approval evidence, restart with expired lease, and preservation of all
  committed v1 routing/audit/batch/blocker history.

## Implementation and documentation impact

- Code / architecture: The source checkpoint replaces authoritative process-local
  `APPLY` progress with durable PostgreSQL run/checkpoint/lease orchestration,
  one bounded page per invocation, stable reason codes, explicit START/RESUME/STOP
  operations, and explicit outcome projection. `DRY_RUN` uses a read-only
  transaction and its continuation is non-authoritative assessment state. A
  future producer barrier and certification path are separate implementation
  gates. The executor is not callable operationally because its dedicated
  maintenance authority boundary is not implemented and the web runtime has zero
  orchestration-table privileges.
- Data / schema: Add only the minimum orchestration relations, constraints,
  indexes, and append-only protections required for run/checkpoint/lease, batch,
  blocker, and future certification evidence. The migration is additive and
  backfill-free: it creates empty schema only and performs no populated-data scan,
  routing mutation, audit synthesis, or default run creation.
- Workflow / permissions: No approval action, route, threshold, role, scope, or
  legacy source-workspace behavior changes. Privileged orchestration authority
  must remain explicit and server-enforced.
- UI / mobile: No end-user approval UI change is authorized. Any operator surface
  must distinguish the current machine outcomes and must not offer activation or
  clean claims while gates remain unavailable.
- Reporting: Batch, blocker, and certificate evidence may support bounded
  operational review; it does not create a financial, inventory, or approval
  outcome report.
- Knowledge base / training: No end-user material is required while the feature is
  disabled. Dunong must assess administrator/approver guidance only after the
  producer barrier, drain, activation, and operational ownership are approved.
- Tests / UAT: The concurrency, failure-injection, no-write dry-run, migration,
  all-18 writer, reconciliation, recovery, browser/operator, hosted, and release
  evidence above is mandatory before any readiness claim.

## Production and activation gates

The following remain open and cannot be inferred from local source completion:

1. A dedicated non-member maintenance database role, root-controlled credential
   path, immutable operator/change/exact-release authority records, and executable
   denial proof. Until this passes, no dry-run/apply/stop execution is authorized.
2. Reviewed additive/backfill-free migration, populated and empty disposable-
   PostgreSQL rehearsal, restricted-runtime privileges, append-only controls,
   constraints/indexes, query plans, and production-volume page behavior.
3. Executed exact-candidate lease, fence, takeover, Serializable conflict,
   idempotency, failure-injection, restart, restore, and no-write `DRY_RUN` tests.
4. Separately implemented company-scoped v0-producer barrier and executable proof
   that all 18 family writers honor it under concurrent production-like load.
5. Final prescribed clean passes, mandatory from-zero reconciliation, zero
   unresolved blocker/target proof, and durable clean certification under one
   immutable contract/release. Until then `DRAIN_CLEAN` is unavailable.
6. Finance and Accounts Payable resolution of the Payment Request approval policy
   hold, plus every PostgreSQL, authorization/revocation, responsive browser,
   hosted deployment/recovery, production-authenticated E2E, UAT, and final
   Security/QA/DevOps/Release gate retained by `DEC-0244`.
7. An explicit cutover decision. `DRAIN_CLEAN` never toggles
   `APPROVAL_ROUTING_V1_ENABLED`; the flag remains false until separately approved.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the minimal additive, backfill-free durable orchestration schema and append-only protections | Database + Backend Engineering | Before durable-run checkpoint review | Implemented in source; disposable PostgreSQL and hosted acceptance remain pending; no production backfill authorized |
| Implement bound run acquisition/takeover, database-time lease, monotonic fencing, one-page Serializable APPLY, and fenced STOP | Backend + Database Engineering | Before APPLY acceptance | Implemented in source but intentionally non-operational; exact-candidate database execution remains pending |
| Implement the Option D maintenance authority boundary and independently prove web-runtime denial | Security + Database + DevOps + Release | Before any executor invocation | Pending; web runtime currently has zero orchestration privileges |
| Prove migration, lease/fence races, atomic page evidence, read-only DRY_RUN, outcome semantics, restart, and forward-repair | QA + Database + Security | Before durable-run checkpoint acceptance | Pending executable PostgreSQL evidence |
| Deliberate and implement the company-scoped v0-producer barrier and all-18 writer proof | Architecture + Backend + Database + QA + Security | Before final drain passes | Pending separate checkpoint |
| Execute final clean passes and mandatory from-zero reconciliation; issue durable certification only on exact clean evidence | Release + QA + Database + Security | After producer barrier and writer proof | Pending; `DRAIN_CLEAN` unavailable |
| Resolve Payment Request approval policy and complete all DEC-0244 external gates | Finance + Accounts Payable + Product Governance + Release reviewers | Before activation | Open / activation NO-GO |
| Assess administrator and approver guidance | Dunong | After drain/cutover behavior and ownership are approved | Handoff deferred |

## Evidence

- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` requires independent
  material-decision review and the applicable scope, authorization, segregation,
  audit, transaction, phase, and recovery hard gates.
- `docs/core/00-governance/DECISION_SCORECARD.md` makes operational correctness and
  control the highest-weight criterion and cannot override a data-integrity,
  authorization, audit, transaction, or recovery blocker.
- `docs/core/00-governance/decisions/DEC-0051-CANONICAL-APPROVAL-DECISION-PARITY-AND-ATOMIC-SOURCE-EFFECTS.md`
  confirms canonical typed decisions, atomic routing/source effects, and disabled
  activation pending all-family behavioral evidence.
- `docs/core/00-governance/decisions/DEC-0052-APPROVAL-INTEGRITY-LOCKING-AND-TYPED-FINANCIAL-INTENT.md`
  confirms deterministic database locking, typed financial intent boundaries,
  unresolved Payment Request policy, and feature-disabled posture.
- `docs/core/00-governance/decisions/DEC-0244-NORMALIZED-APPROVAL-DECISION-SURFACE-CONTRACT.md`
  confirms the closed 18-family capability version/hash, requires later backfill
  binding, and preserves the external PostgreSQL, policy, browser, hosted, UAT,
  recovery, and activation gates.
- `apps/web/src/server/services/approvalRoutingBackfill.ts` and
  `apps/web/src/server/jobs/approvalRoutingBackfill.ts` implement the feature-
  disabled source checkpoint: true read-only dry run, durable bound START/RESUME,
  fenced STOP, one bounded Serializable APPLY page, append-only batch/blocker
  evidence, stable machine reason codes, and explicit operator exit outcomes.
  The web runtime is intentionally denied every orchestration-table privilege, so
  these files are not an operational executor. Source implementation and focused
  tests are not populated PostgreSQL, hosted,
  recovery, producer-barrier, certification, or production evidence.
- `apps/web/src/server/services/approvalRoutingRegistry.ts` and
  `apps/web/src/server/services/approvalDecisionCapabilities.ts` provide the
  routing mapping and `DEC-0244` capability contract identities to which an
  authoritative run must bind.
- The parent-provided debate conclusion records initial Database, Security, and QA
  support for Option B; Architecture's initial Option A; Architecture's acceptance
  of B after fencing challenge; Database's conditional shift toward A while
  retaining the producer-barrier/certificate gates; and the Decision Chair's
  hard-gate/scorecard selection of B for hosted takeover and evidence integrity.
  Requested Code Spark and exact GPT-5.4 models were unavailable; the closest
  permitted GPT-5.6 roles were used without relaxing any gate.
- Final independent Security, QA, and Database re-reviews each returned GO with
  C0/H0/M0 only for commit of the disabled, non-operational source/schema
  checkpoint. Focused Approval routing passes 72/72; the authorization manifest
  passes 21/21; database-package coverage passes 42 tests with 18 skipped; the
  worker test passes; and role-tool coverage passes 8/8. The full root suite passes
  1,484 web tests with 307 skipped and one todo across 140 passing and 11 skipped
  files. Root lint and typecheck, the isolated production build, secret review,
  and release-tool self-tests pass. Nine orchestration PostgreSQL specifications
  are authored but skipped. The disposable approval-routing runner was attempted
  and failed closed with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`, so no
  PostgreSQL execution credit is claimed. Production execution and activation
  remain NO-GO.

## Supersession

This decision is not superseded. It implements the durable backfill dependency
identified by `DEC-0244` without changing that decision's capability matrix,
Payment Request policy hold, source-workspace boundary, or activation posture. A
later decision that changes tenant/company run cardinality, immutable contract or
release binding, lease clock/fencing, page atomicity, blocker/error
classification, dry-run write posture, clean-certification prerequisites, or
rollback rules must explicitly amend or supersede this record.
