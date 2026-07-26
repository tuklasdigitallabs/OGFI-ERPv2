# DEC-0246 — Approval Backfill Maintenance Authority

## Metadata

- Decision ID: `DEC-0246`
- Title: Approval Backfill Maintenance Authority
- Status: `Confirmed — implementation pending; executor remains non-operational`
- Date: 2026-07-27
- Decision owner: Shared Production Foundation / Approval Routing
- Decision Chair: Parent agent
- Related phase/module: Phase I normalized approval-routing maintenance and cutover preparation
- Related decisions: `DEC-0049`, `DEC-0244`, `DEC-0245`
- Related decision brief: Parent-led approval-backfill maintenance-authority deliberation

## Decision

Select Option C-minimal: a closed PostgreSQL reference-monitor façade between a
dedicated maintenance login and all approval-routing source and orchestration
relations. The maintenance login receives no base-table `SELECT`, `INSERT`,
`UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, ownership, or role
membership. It receives only exact `EXECUTE` on reviewed, versioned routines.

TypeScript retains bounded paging and the orchestration state machine. The
launcher presents a signed, content-addressed envelope that references a pre-
issued immutable database authority record; the envelope is a binding and not
authority by itself. The database façade validates that authority using database time, exposes only
the exact scoped projection and locking required for one operation, validates the
canonical 18-family descriptor contract, and performs atomic page-apply and STOP
mutations. It is not a general SQL, JSON mutation, table-selection, or workflow
API.

`DRY_RUN` remains genuinely read-only. It requires pre-issued immutable database
authority validated with database time, but it does not consume replay state or
write a database receipt. Its root-owned `O_EXCL` receipt is local operational
evidence only: it is not durable database evidence, mutation authority, a clean
certificate, or activation approval.

This decision grants no current execution authority. The issuer, signing-key
custody, revocation process, and emergency STOP/recovery authority require human
confirmation. `APPROVAL_ROUTING_V1_ENABLED` remains false, the existing executor
remains non-operational, and the system cannot emit `DRAIN_CLEAN`.

## Context

`DEC-0245` established durable tenant/company runs, fenced leases, bounded
Serializable pages, append-only batches and blocker observations, and exact STOP
evidence. Independent review then correctly removed all ordinary web-runtime
access to those relations. A production executor now needs a maintenance
authority boundary that does not turn a database credential, launcher signature,
environment value, request ID, authorization reference, or release SHA into
authority.

The boundary must also remain practical on the approved modular-monolith and
Hostinger systemd deployment. Moving the entire state machine into privileged
PL/pgSQL would duplicate TypeScript orchestration and increase migration risk.
Conversely, direct base-table grants would permit a stolen maintenance credential
to bypass the launcher and issue arbitrary SQL. The confirmed design therefore
uses a small database capability surface as the reference monitor while retaining
application-owned sequencing.

## Options considered

### Option A — rejected: direct grants plus signed launcher

- Summary: Grant the maintenance login direct source/orchestration table access
  and rely on a signed, content-addressed root launcher to constrain execution.
- Benefits: Smallest implementation, simplest TypeScript integration, and fewest
  database routines.
- Failure modes: A stolen or reused credential bypasses the launcher; environment
  bindings can be presented as false authority; direct SQL can exceed scope,
  forge progress, alter evidence, or bypass the intended operation; and database
  denial cannot be proven independently of the host.
- Why rejected: It fails the server-side authorization, least-privilege, audit,
  and recovery hard gates. Launcher integrity is necessary but is not a database
  reference monitor.

### Option B — rejected: dedicated role with direct tables, signed envelope, and guards

- Summary: Use a dedicated `NOSUPERUSER` maintenance login, a signed authority
  envelope and immutable authority record, transaction-local binding, and
  role-aware guards, while retaining direct base-table reads or DML.
- Benefits: Stronger identity and replay controls than Option A, with relatively
  small application changes.
- Failure modes: Any unguarded table, column, statement shape, or future migration
  becomes a bypass; broad reads expose more tenant/company data than one operation
  needs; and duplicated semantic checks can drift between triggers and TypeScript.
- Why rejected: Plain B does not contain read authority or eliminate the direct-
  SQL bypass surface. It cannot pass the scope and authorization hard gates merely
  by adding a signed envelope.

### Option B+ — not distinct after hard gates: converges on C-minimal

- Summary: Add authority-aware read minimization, short-lived credential controls,
  and operation-specific database semantic guards to Option B.
- Benefits: Reduces credential lifetime, data exposure, and direct mutation risk.
- Failure modes: If it retains base-table access, one missed grant or guard remains
  a bypass. If it removes that access and exposes only typed routines/projections,
  it is operationally the selected reference-monitor façade.
- Why not selected separately: Once B+ satisfies read containment and semantic
  enforcement, its database boundary converges on C-minimal. Credential-lifetime
  controls remain useful defense in depth but cannot replace the façade.

### Option C-minimal — selected: closed database reference-monitor façade

- Summary: Give the maintenance login no base-table access and exact `EXECUTE`
  only on a small, typed, versioned routine set that validates immutable authority,
  produces minimal scoped projections/locks, validates canonical descriptors, and
  performs atomic page and STOP effects.
- Benefits: Contains credential compromise, keeps authority enforcement inside the
  database boundary, preserves one transaction, retains the TypeScript state
  machine, avoids a full stored-procedure rewrite, and permits executable denial
  and restore verification.
- Failure modes: The façade can grow into a second orchestration engine; privileged
  routine ownership/search-path/ACL errors can become escalation paths; routine
  and TypeScript contract versions can drift; per-record calls can exceed page
  bounds; and a rollback can strand STOP if recovery compatibility is not retained.
- Why selected: It is the only option that passed every applicable hard gate
  without relocating the full orchestration. Its additional schema and operational
  cost is justified by the reduced authorization and recovery blast radius.

## Scorecard rationale

Options A and plain B failed hard gates and were not eligible to win through a
weighted total. B+ becomes C-minimal when it closes those failures. Among eligible
designs, C-minimal ranks highest for the scorecard's 30% operational-correctness
criterion because it places scope, authority, atomicity, and evidence enforcement
at the database boundary. It preserves business value without changing end-user
workflow; user-adoption impact is neutral because this is an internal maintenance
control. It has greater delivery effort than direct grants, but materially better
maintainability, credential containment, and reversibility than a full privileged
database state machine. Operating cost is bounded to an explicit one-shot
maintenance process and authority lifecycle.

This conclusion was not a majority vote and no score overrode a security,
authorization, tenancy, transaction, audit, or recovery blocker.

## Hard-gate assessment

- **Tenant/company isolation:** Every authority record and routine call is bound to
  one exact tenant and company. Read projections, source locks, run, batch,
  blocker, audit, and receipt effects must share that scope. No broad tenant or
  company scan is authorized.
- **Server-enforced authorization:** The database validates the immutable authority
  record, maintenance role, operation, scope, run, request, release, expiry, and
  replay state. Host arguments, environment values, signed launcher possession,
  and transaction-local settings are bindings only.
- **Approval segregation:** The façade reconstructs routing facts only. It cannot
  approve, return, reject, delegate, post, settle, or change source status, money,
  or inventory. Existing prohibited-actor and no-self-approval rules remain.
- **Audit and immutable history:** Page routing/audits/batch/checkpoint and fenced
  STOP/audit effects remain atomic. Append-only evidence cannot be updated,
  deleted, truncated, or forged through the maintenance login.
- **Transaction consistency and idempotency:** One pinned database transaction
  binds authority, source locks, canonical descriptor validation, page effects,
  receipt, and checkpoint. Exact replay returns the existing authorized outcome;
  changed payload, scope, release, or operation fails closed.
- **Phase scope:** This is limited to the closed 18-family normalized approval-
  routing maintenance path. It adds no end-user action, workflow, queue, finance,
  inventory, or future-phase module.
- **Recovery and rollback:** STOP remains an exact privileged capability with its
  own authority. Application rollback retains compatible recovery access or blocks
  deployment. Revoking maintenance execution, keeping the feature flag false, and
  forward repair preserve all committed evidence.

The design passes hard gates conditionally. Implementation, human authority
policy, executable PostgreSQL proof, hosted deployment/recovery evidence, and
activation remain open.

## Required safeguards

### Role, ownership, and routine surface

- Create a dedicated login with `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`,
  `NOREPLICATION`, `NOBYPASSRLS`, and no memberships. It must not own schemas,
  relations, routines, policies, or types.
- Retain zero base-table and column privileges. Grant only exact routine EXECUTE;
  revoke PUBLIC and every unrelated role. Do not grant generic schema creation or
  default routine execution.
- Use a non-login, non-superuser routine owner, fixed `search_path`, schema-
  qualified objects, typed parameters and results, and no caller-selected SQL,
  table, column, predicate, function, or mutation shape.
- Keep the façade small and versioned. It may expose exact authority-scoped source
  projection/locking, generic canonical descriptor validation, atomic page apply,
  replay/readback, and atomic STOP. It must not absorb page sequencing or the
  complete state machine.
- Any internal source projection must be security-barrier and/or RLS constrained
  as appropriate, expose only the minimum fields, and remain reachable by the
  maintenance login only through the authorized routine; it is not a substitute
  for the zero-base-table privilege rule.
- Bind and verify routine bodies, owner, language, security mode, configuration,
  ACLs, policies, triggers, and expected signature after migration and restore.

### Authority issuance and validation

- Persist an immutable, content-addressed authority record issued outside the
  maintenance role. Validate its signature/digest, issuer state, exact database
  and environment, operation, tenant, company, run/request identity where
  applicable, routing/mapping/capability contract, exact release, issuance and
  expiry, revocation, and replay policy using PostgreSQL time.
- The issuer cannot execute maintenance. The executor cannot issue, amend, revoke,
  extend, or delete authority. Human owners must confirm issuer eligibility,
  signing-key custody/rotation/recovery, revocation authority, and emergency STOP
  and recovery authority before implementation activation.
- Transaction-local values may select a pre-issued authority record but cannot
  create authority. Every routine independently verifies the exact maintenance
  role and bound record before reading, locking, or mutating.
- Mutating authority is claimed or consumed atomically with its permitted effect.
  Exact replay may return an existing receipt only under the recorded policy.
  Authority for one operation, request, scope, or release cannot authorize another.

### DRY_RUN

- Require pre-issued read authority for one exact tenant/company and exact release.
  Validate it with database time before every scoped read.
- Execute through a read-only transaction. Do not claim or consume authority and
  do not write run, batch, blocker, routing, audit, sequence, or certificate state.
- Create the host receipt with root-owned exclusive creation. Bind it to the
  authority digest, exact release, scope, cursor/result digest, timestamp, and
  exit outcome without secrets or source content.
- Label the receipt local and non-authoritative. Host loss, duplicate receipt, or
  absence cannot change database truth, grant APPLY, or support `DRAIN_CLEAN`.

### Deployment and recovery

- Use a root-controlled one-shot systemd unit, an unprivileged OS service account,
  systemd credential delivery rather than command-line or environment-file
  secrets, a pinned content-addressed release, bounded runtime, restrictive
  filesystem access, and database-only network access where supported.
- Verify exact migration state, database identity, routine version/digest,
  authority record, feature flag false, and release binding before connection.
- Keep credentials and authority independently rotatable. Password rotation must
  include termination of stale sessions because rotation alone does not end them.
- Preserve a compatible STOP/recovery façade across application rollback. A
  release that removes required recovery capability is deployment-incompatible.
- Reconcile roles, owners, routine ACLs/bodies, policies, triggers, authority state,
  and expired/consumed records after restore before maintenance or application
  traffic resumes.
- Record safe structured host logs and reconcile them to immutable database
  receipts. Logs and local receipts are observational and never authority.
- Rollback revokes or expires further execution, keeps
  `APPROVAL_ROUTING_V1_ENABLED=false`, preserves schema and evidence, and uses a
  reviewed forward repair. It never deletes v1 routing, audits, batches, blockers,
  or authority history.

## Required tests and acceptance evidence

- Prove the web, migrator, owner, issuer, and maintenance roles cannot assume one
  another and that the maintenance login has zero effective base-table/column
  privilege through tables, views, inheritance, routines, defaults, or memberships.
- Attempt direct SELECT/DML, grant, ownership, trigger disable, truncate, function
  substitution, search-path capture, dynamic input, and transaction-local binding
  forgery under the maintenance credential; every attempt must fail closed.
- Prove wrong, missing, expired, revoked, cross-database, cross-environment, cross-
  tenant/company, cross-operation, cross-run/request, cross-release, changed-
  contract, and replayed authority fails before any unauthorized read, lock, or
  mutation.
- Prove scoped projections reveal only the minimum authorized columns/rows and that
  descriptor validation covers all 18 registered families without accepting a
  generic mutation payload.
- Prove one pinned transaction and connection atomically bind authority, locks,
  routing/audits, blocker/batch evidence, terminal counts, receipt, and checkpoint;
  inject failure at every boundary and prove total rollback.
- Prove first acquisition, renewal, contention, expired takeover, stale fence,
  same-request replay, changed-request conflict, STOP audit linkage, and concurrent
  one-winner behavior with deterministic barriers.
- Prove DRY_RUN performs zero database writes, does not consume authority, handles
  receipt collision safely, and never treats its local receipt as certification.
- Verify routine version negotiation and reject TypeScript/database semantic drift.
  Execute worst-case bounded pages at production-like volume and measure time,
  locks, plans, and routine round trips.
- Rehearse signed-release deployment, credential and signing-key rotation,
  revocation, stale-session termination, authority-service outage, emergency STOP,
  application rollback, forward repair, backup/restore, role reconciliation, and
  loss of local DRY_RUN receipts.
- Independently review Security, Database, QA, DevOps, and Release evidence. No
  implementation test may be credited merely because a routine exists or an
  integration specification is skipped.

## Conditional activation

Implementation may begin only after the open human authority policy is confirmed.
The maintenance executor may become operational only after every safeguard and
PostgreSQL/hosted/recovery test above passes for the exact release. Normalized
approval routing remains separately disabled until `DEC-0244`, `DEC-0245`, Payment
Request policy, producer-barrier, final reconciliation, certification, browser,
UAT, recovery, and explicit cutover gates pass. The façade cannot enable the flag
or emit `DRAIN_CLEAN`.

## Implementation and documentation impact

- Code / architecture: Add a small versioned database reference-monitor façade and
  bind the existing TypeScript state machine to it; remove no existing guard.
- Data / schema: Add immutable authority records, exact supporting constraints,
  narrow projections/policies where required, routines, ACLs, and recovery/version
  metadata through reviewed additive migrations.
- Workflow / permissions: Add maintenance execution authority only after human
  issuer/key/revocation/recovery policy confirmation. No approval decision or
  source-workflow authority changes.
- UI / mobile: No end-user surface or mobile behavior changes.
- Reporting: Database receipts and local DRY_RUN receipts support bounded
  operational evidence only; they are not approval, finance, inventory, or clean-
  certification reports.
- Knowledge base / training: No end-user change while the executor and normalized
  routing remain disabled. Administrator/operator guidance is deferred until the
  authority lifecycle and operational ownership are implemented and approved.
- Tests / UAT: Requires the complete adversarial, concurrency, deployment,
  recovery, restore, and exact-release evidence above before operational use.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Confirm authority issuer eligibility, signing-key custody/rotation/recovery, revocation authority, and emergency STOP/recovery authority | Authorized human owners + Security + Release | Before authority schema or executor activation | Open in `OPEN_DECISIONS_AND_ASSUMPTIONS.md` |
| Design the minimal typed façade and prove it does not become a second state machine | Architecture + Database + Backend + Security | After human policy confirmation | Pending |
| Implement additive authority schema, routines, exact ACLs, projections/policies, version negotiation, and role reconciliation | Database + Backend + DevOps | After reviewed design | Pending |
| Implement root-controlled one-shot launcher, credential delivery, release pinning, receipts, rotation, and recovery interlocks | DevOps + Security + Release | Before any execution | Pending |
| Execute disposable PostgreSQL, hosted, restore, performance, concurrency, failure-injection, and adversarial denial matrices | QA + Database + Security + DevOps + Release | Before operational acceptance | Pending |
| Reassess administrator/operator enablement | Dunong | After authority lifecycle and operational ownership are approved | Deferred |

## Evidence

- `DEC-0245` supplies the durable run, checkpoint, lease, page, evidence, STOP, and
  intentionally non-operational baseline that this decision must preserve.
- Hostinger reconciliation and role verification currently enforce zero ordinary
  web-runtime access to Run, Batch, and Blocker, demonstrating the correct
  fail-closed posture before this façade exists.
- Independent first-round Security, Database, and DevOps/operability review rejected
  direct-grant authority. Targeted challenge found C-minimal operationally feasible
  only with a small typed surface, exact authority validation, pinned transactions,
  version negotiation, stable STOP/recovery, and executable deployment/restore
  evidence.
- The Decision Chair applied the hard gates before the scorecard and confirmed
  C-minimal. Requested Code Spark and exact GPT-5.4 models were unavailable; the
  closest permitted inherited GPT-5.6 specialist fallbacks were used without
  relaxing any gate or granting implementation authority.

## Supersession

This decision does not supersede `DEC-0245`; it closes that decision's maintenance-
authority architecture dependency while leaving implementation and human policy
open. A later decision that grants base-table access, changes authority issuance or
replay, relocates the state machine, broadens routine semantics, changes DRY_RUN
evidence, weakens exact scope/release binding, or changes STOP/recovery authority
must explicitly amend or supersede this record.
