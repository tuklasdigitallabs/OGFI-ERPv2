# DEC-0248 — Single-Host Controlled Deployment Fence

## Metadata

- Decision ID: `DEC-0248`
- Title: Single-Host Controlled Deployment Fence
- Status: `Confirmed — amended after security challenge; partial source foundation only; production NO-GO`
- Date: 2026-07-27
- Decision owner: Shared Production Foundation / Hostinger deployment
- Decision Chair: Parent agent
- Related phase/module: Phase I shared production foundations; controlled PostgreSQL migration and release evidence
- Related decisions: `DEC-0038`, `DEC-0039`, `DEC-0246`, `DEC-0247`
- Related decision brief: Parent-led single-host controlled-deployment serialization deliberation and final Security challenge

## Decision

For the current single Hostinger VPS, one root-owned
`ogfi-release@<opaque-id>.service`, one service cgroup, and one fixed,
host-global, nonblocking fence must own the complete official release lifecycle:
request admission; immutable artifact verification and extraction; split runtime
identity probing; pre-migration snapshots; migrator-only controlled migration;
exact postflight; digest- and commit-SHA-bound Compose cutover; authoritative
served-SHA bounded smoke verification; and, when required, rollback under the
same fence.

The release service is the only hosted deployment authority. Standalone hosted
migration, direct wrapper execution, SSH-held release orchestration, and deploy-
user `sudo` into a separate migration service are prohibited. It consumes a
strict root-owned one-time request spool and prebuilt immutable artifacts; the
host performs no dependency installation or release build.

Credentials and operating identities remain distinct and least-privileged. The
migration subprocess sees only the migrator credential. Snapshot tooling sees
only its read-only snapshot credential. The runtime identity probe sees only the
runtime credential and application environment, and returns a bounded sanitized
result to the release controller. No subprocess receives a combined credential
set merely because it shares the release cgroup.

The service must maintain an fsync-safe phase journal containing the exact
predecessor, candidate, cutover, and verification state. On boot or service
start, recovery must acquire the same fence and resolve an incomplete journal
before traffic is restored or a new release is admitted. If recovery cannot
establish a safe predecessor or verified candidate, the system withdraws traffic
or remains in maintenance mode and emits a durable alert.

This remains single-host official-deployment serialization, not database
transactional atomicity and not protection against root or migrator compromise.
If any second host, remote runner, alternate lock namespace, shared credential,
or direct hosted execution path is introduced, a database session keeper with
liveness and recovery controls becomes mandatory before that topology is used.
No TTL lease or database row lock is selected for the current topology.

## Context

The migration-ledger audit and Prisma deployment use separate database
connections. A release-level boundary is therefore required to prevent official
deployment overlap and to bind snapshot, migration, cutover, verification, and
rollback evidence to one exact candidate.

The initially confirmed design used an SSH-held release-session lock while
starting a separate systemd migration unit through narrowly scoped `sudo`.
Implementation review and the final Security challenge found that split control
insufficient: SSH loss, cgroup separation, a gap between release-controller and
migration authority, and incomplete crash/reboot state could leave the release
outcome ambiguous. This amendment supersedes that design before production use.

The authoritative topology remains one VPS and one systemd control plane. A
single service/cgroup and fixed host fence can serialize the official path, but
only a durable phase journal and same-fence recovery can make interrupted cutover
state operationally recoverable. The host-only design cannot coordinate an
independent executor or contain a compromised root/migrator principal.

## Options considered

### Option A — selected: one fenced release service with durable recovery

- Summary: A root-owned `ogfi-release@<opaque-id>.service` owns admission through
  verified cutover or rollback under one cgroup and fixed fence, using isolated
  subprocess identities/credentials and an fsync-safe phase journal.
- Benefits: Removes the split-controller authority gap; binds exact artifact,
  database, cutover, served-SHA, smoke, and rollback evidence; fails closed on
  overlap; and gives boot/start recovery an authoritative predecessor/candidate
  state.
- Failure modes: An incomplete or non-durable journal can misclassify recovery;
  combined credentials can expand compromise impact; mutable artifacts or
  unbound Compose inputs can cut over the wrong release; an unverified smoke can
  test a predecessor; and root/migrator compromise remains outside containment.
- Why selected: It is the only current-host option that passes serialization,
  least privilege, exact-candidate attribution, crash/reboot recovery, and
  rollback hard gates.

### Option B — rejected after implementation review: SSH-held release lock plus separate migration service

- Summary: Hold the wider release lock in an SSH session and invoke a separately
  fenced migration unit through deploy-user `sudo`.
- Benefits: Reuses the staging SSH workflow and separates the migration command
  into a systemd unit.
- Failure modes: SSH/controller loss and separate cgroups can split lifecycle
  ownership; nested authority leaves standalone migration reachable; recovery
  lacks one durable release state; and the release fence does not inherently own
  migration cleanup, cutover, verification, or rollback.
- Why rejected: The final Security challenge found that it does not provide one
  fail-closed release authority or sufficient crash/reboot recovery. The earlier
  source implementation is not production-approved evidence and must be replaced,
  not activated.

### Option C — rejected for the current topology, mandatory when topology expands: database session keeper

- Summary: Retain a database advisory-lock session for the whole controlled
  release interval.
- Benefits: Coordinates multiple hosts, runners, namespaces, or direct wrapper
  paths sharing the database boundary.
- Failure modes: Requires durable connection/liveness handling and adds database
  availability coupling and recovery complexity.
- Why rejected: It is not required while one reviewed host service is the only
  executor. It becomes a hard prerequisite before that topology assumption
  changes.

### Option D — rejected: TTL lease or database row lock

- Summary: Serialize releases through an expiring lease or ordinary row lock.
- Benefits: Familiar coordination patterns.
- Failure modes: TTL expiry can overlap a slow or paused release; lease renewal
  introduces clock/liveness ambiguity; and a row lock alone does not own host
  artifact, traffic, process, or recovery state.
- Why rejected: Neither satisfies the complete current-host lifecycle or
  recovery boundary.

### Option E — rejected: no release-level serialization

- Summary: Rely on migration checks and operator procedure.
- Benefits: No added mechanism.
- Failure modes: Overlapping releases and ambiguous snapshot/cutover/rollback
  state make evidence and recovery unreliable.
- Why rejected: It fails deployment, recovery, and audit hard gates.

## Hard-gate assessment

- **Scope and authorization:** A root-owned one-time request spool admits only an
  opaque reviewed request. The root-owned service and immutable artifact define
  deployment authority; application identities receive no release authority.
- **Least privilege:** Migration, snapshot, and runtime-probe subprocesses use
  separate identities and credentials. Migration sees only migrator authority;
  snapshot sees only read-only snapshot authority; runtime probing sees only the
  runtime/application environment and returns sanitized output.
- **Audit and exact-candidate integrity:** The journal and evidence bind the
  predecessor, candidate commit SHA, artifact digest, Compose inputs/digests,
  database postflight, cutover, authoritative served SHA, bounded smoke, and
  rollback outcome.
- **Transactional consistency:** One service/cgroup and fixed fence prevent
  competing official release work, but do not make separate database connections
  atomic. Existing ledger, role, observer, migration, backup, and postflight
  controls remain mandatory.
- **Recovery:** Every phase transition is fsync-safe. Boot/start recovery acquires
  the same fence before traffic or admission. Ambiguity fails closed to withdrawn
  traffic or maintenance mode with a durable alert.
- **Phase scope:** No ERP workflow status, application-user permission, approval
  authority, inventory movement, financial posting, or user-facing behavior is
  changed.
- **Topology boundary:** A second host, remote runner, alternate namespace,
  shared credential, or direct execution path invalidates host-only sufficiency
  and requires the database session keeper before use.

The design passes the source-of-truth hard gates. Implementation and production
acceptance do not pass until the required source, installed-host, recovery, and
hosted evidence is complete.

## Scorecard reasoning

Option A is selected because it is the only current-host option that combines one
authority boundary, exact-candidate verification, least-privilege subprocesses,
and deterministic crash/reboot recovery. Option C remains the required successor
for a distributed executor topology. Options B, D, and E fail applicable hard
gates regardless of delivery convenience.

| Criterion | Weight | A: one fenced service | B: split SSH/service | C: DB keeper | D: TTL/row lock | E: no fence |
|---|---:|---:|---:|---:|---:|---:|
| Operational correctness and control | 30% | 5 | 2 | 5 | 2 | 1 |
| Business value | 20% | 5 | 3 | 3 | 2 | 1 |
| User adoption and branch usability | 15% | 3 | 2 | 3 | 2 | 1 |
| Delivery effort and risk | 15% | 3 | 4 | 2 | 2 | 5 |
| Maintainability and scalability | 10% | 4 | 2 | 5 | 2 | 1 |
| Operating cost | 5% | 4 | 4 | 3 | 3 | 5 |
| Reversibility | 5% | 4 | 2 | 3 | 2 | 1 |
| **Weighted total** | **100%** | **4.2** | **2.7** | **3.6** | **2.1** | **1.7** |

Option C's score does not authorize delaying it after the topology trigger; that
trigger is a hard gate rather than a scorecard preference.

## Required safeguards

- Accept only root-created, one-time request-spool entries with an opaque,
  non-reusable request identity. Reject missing, duplicate, reused, mutable,
  malformed, or unapproved requests before release work.
- Start only the root-owned `ogfi-release@<opaque-id>.service`. Do not permit
  standalone hosted migration, direct controlled-wrapper execution, SSH-held
  lifecycle orchestration, or deploy-user `sudo` to a migration unit.
- Acquire one constant host-global nonblocking fence before request consumption
  and hold it until verified success, completed rollback, or durable fail-closed
  recovery state. A competing request must not begin work.
- Consume a prebuilt immutable artifact bound to its approved full commit SHA and
  cryptographic digest. Reverify before extraction. Perform no dependency install,
  build, code generation, or mutable source assembly on the host.
- Bind rendered Compose inputs and image/artifact digests to the same approved
  candidate before cutover. Verify the authoritative served SHA after cutover;
  smoke results are invalid if that SHA is absent or differs.
- Use distinct least-privilege subprocess identities and credential delivery.
  Prevent environment inheritance from combining migrator, snapshot, runtime,
  application, owner, or administrator secrets. Sanitize runtime-probe output.
- Retain the controlled migration wrapper's migration-ledger preflight, exact
  role/observer checks, Prisma advisory locking, exact-current postflight, and
  append-only contract. The release fence waives none of these gates.
- Persist predecessor, candidate, artifact, snapshot, migration, postflight,
  cutover, served-SHA, smoke, rollback, and alert transitions in an fsync-safe
  phase journal before advancing to the next externally visible phase.
- On boot/start, acquire the same fence and recover any incomplete journal before
  traffic or a new request. If safety cannot be proved, withdraw traffic or retain
  maintenance mode and emit a durable externally deliverable alert.
- Treat every topology-triggering executor, namespace, or credential change as a
  release blocker until the database session keeper is implemented and rehearsed.

## Required tests and acceptance evidence

1. Prove only one opaque request is consumed once and concurrent/replayed requests
   fail closed before artifact or database work.
2. Prove one service/cgroup and fence cover admission through verified cutover or
   rollback, including child cleanup on timeout, stop, crash, and forced kill.
3. Prove the host rejects mutable, wrong-SHA, wrong-digest, rebuilt, or host-
   installed artifacts and digest/SHA-mismatched Compose inputs.
4. Prove migration sees only the migrator credential, snapshot sees only its
   read-only credential, runtime probe sees only runtime/application inputs, and
   sanitized probe output contains no secret or connection material.
5. Prove exact migration preflight/postflight, backup/snapshot preservation,
   role/observer checks, append-only guards, and idempotent controlled recovery on
   the hosted candidate.
6. Prove cutover verifies the authoritative served SHA before accepting bounded
   smoke and that predecessor responses cannot satisfy candidate verification.
7. Fault-inject termination or reboot at every journal phase. On restart, prove
   same-fence recovery selects the recorded predecessor or candidate, prevents
   new admission, and either restores verified traffic or remains in maintenance
   with a durable alert.
8. Prove rollback is admitted and completed under the same fence, preserves
   journal/evidence lineage, and cannot blindly reverse a destructive migration.
9. Prove backup, isolated restore, recovery timing, monitoring, alert delivery,
   acknowledgement, escalation, and exact-candidate operator evidence. Until all
   applicable checks pass, production is **NO-GO**.

## Implementation and documentation impact

- **Code / architecture:** Replace the split SSH release controller and standalone
  migration unit with one root-owned release service/cgroup, strict request spool,
  immutable prebuilt artifact flow, credential-isolated helpers, durable phase
  journal, same-fence recovery, cutover verification, and rollback.
- **Data / schema:** No business-schema change. The release journal is host
  operational state; migration history remains read-only to verification and is
  never rewritten by recovery.
- **Workflow / permissions:** Deployment authority moves to the root-owned release
  service. No application-user or ERP-role permission changes.
- **UI / mobile:** None.
- **Reporting:** Release evidence must bind the exact request, predecessor,
  candidate, artifact/Compose digests, postflight, served SHA, smoke, recovery,
  and rollback without exposing secrets.
- **Knowledge base / training:** No user-facing knowledge-base, glossary, release
  note, or training change is required while this remains an internal deployment
  control. Operator runbooks and recovery instructions are required before hosted
  rehearsal.
- **Tests / UAT:** Source contracts plus installed-host contention, isolation,
  fault-injection, reboot recovery, backup/restore, cutover, smoke, rollback, and
  alert evidence are production gates.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Complete and accept the single `ogfi-release@<opaque-id>` service, request spool, immutable artifact path, isolated helpers, phase journal, cutover, and rollback | DevOps / Security | Before hosted deployment rehearsal | Source controller template added 2026-07-28; acceptance pending |
| Author operator admission, maintenance, recovery, rollback, and durable-alert runbooks | DevOps / Release | Before installed-host rehearsal | Pending |
| Execute hosted contention, credential-isolation, phase fault/reboot, migration, backup/restore, cutover, served-SHA smoke, rollback, and alert evidence | DevOps / QA / Release | Before production promotion | Pending |
| Introduce database session keeper with liveness/recovery controls | Architecture / DevOps | Before any second host, remote runner, alternate namespace, shared credential, or direct hosted path | Blocked by topology trigger |
| Reassess production GO/NO-GO after required exact-candidate evidence | Security / QA / Release | After all gates are current | Pending |

## Evidence

- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- `docs/core/00-governance/DECISION_SCORECARD.md`
- `docs/core/00-governance/decisions/DEC-0039-MIGRATION-DATA-SAFETY-VERIFICATION-GATE.md`
- `docs/core/00-governance/decisions/DEC-0246-APPROVAL-BACKFILL-MAINTENANCE-AUTHORITY.md`
- `docs/core/00-governance/decisions/DEC-0247-APPROVAL-V1-PRODUCER-BARRIER-AND-CLOSED-WRITER-PERIMETER.md`
- Confirmed parent-led deployment-fence conclusion and final Security challenge,
  2026-07-27. The requested Code Spark and exact GPT-5.4 models were unavailable;
  the closest permitted GPT-5.6 specialists were used without relaxing hard
  gates.
- 2026-07-28 source-foundation checkpoint: a root-installable controller template
  adds hostile request admission from approval records held only in the
  root-owned `/var/spool/ogfi-release/approved` spool, not a deploy-writable
  incoming path; a fixed fence unit; an fsync journal; and maintenance-only
  recovery. It is not root-installed or hosted-tested and adds no migration,
  snapshot, cutover, served-SHA, smoke, or rollback helper. The
  strict status suite remains **NO-GO** with 31 blocking gates and 32 final-review
  blockers; no readiness conclusion changes.

## Supersession

This amended record supersedes its earlier 2026-07-27 SSH-held release-session
and separately invoked migration-service design before production use. It is not
superseded by another decision record. A later confirmed record is required
before changing the single-host topology boundary or the mandatory
database-session-keeper trigger.
