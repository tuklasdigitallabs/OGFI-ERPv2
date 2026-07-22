# DEC-0050 — Bounded Denial Audit and Role-Scoped Approval Work

## Metadata

- Decision ID: `DEC-0050`
- Title: Bounded Denial Audit and Role-Scoped Approval Work
- Status: `Confirmed`
- Date: 2026-07-22
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — SPF-006 audit integrity and approval fanout bounding
- Related decision brief: Parent-confirmed conclusion after independent Security, Business Analysis, and Architecture review

## Decision

Confirm three control changes as one SPF-006 integrity boundary:

1. Use a durable PostgreSQL `AuthorizationDenialBucket` to aggregate repeated authorization denials across bounded, server-derived dimensions. Each bucket maintains an exact atomic count, writes one immutable first-denial audit event, and writes one immutable final summary only when the final count is greater than one. The default window is configurable at 15 minutes and must validate within an inclusive 5-to-60-minute range. Initial implementation has no interim checkpoint events. A Hostinger systemd timer and lazy rollover on the next matching denial both finalize expired buckets through the same idempotent path.
2. Treat the active `ApprovalInstanceStep` as the single authoritative work item for a role-assigned approval step. The inbox resolves eligible users dynamically from live role, permission, effective-date, company/location or other applicable scope, and no-self-approval rules. Role-assigned activation creates zero per-user `Notification` rows and one step-activation audit event. Direct-user assignment creates at most one idempotent notification. Activation requires proof that at least one currently eligible, non-prohibited approver exists, but it does not lock or materialize the full eligible population.
3. Replace per-request password and MFA failure persistence with a hybrid bounded authentication design. Repeated `auth.login.failed` and `auth.mfa.challenge_failed` signals use bounded denial evidence; individually immutable events remain only for authoritative transitions such as MFA challenge lock, successful authentication, recovery-code consumption, session rotation, and revocation. A separate PostgreSQL throttle-window service atomically reserves attempts before expensive verification, uses only fixed global and keyed identifier/source shards plus resolved real tenant/account dimensions, and converts a reservation to success after verified authentication. Unknown tenant codes, identifiers, source addresses, and headers never become durable row keys. Exact per-source edge throttling depends on a reviewed Hostinger reverse proxy that overwrites forwarding headers and keeps the application port private.

Attacker-controlled target identifiers, request paths, query text, payload values, and error text must never become bucket-key dimensions. A failure to record or finalize denial audit state must never permit the denied operation. Actual workflow decision actions, including approve, return, and reject actions, remain individually auditable `AuditEvent` records and are not aggregated by the denial bucket; authorization-boundary denials follow the bounded bucket rule. Authentication lock and session-state transitions also remain individual events, but repeated password/MFA failures do not retain a second unbounded per-attempt audit stream.

The authentication portion of this decision is further constrained by the confirmed **Authentication corrective amendment — 2026-07-22** below. Where the original authentication wording is less specific, the amendment is authoritative; the bounded authorization-denial and role-scoped approval conclusions remain unchanged.

## Context

SPF-006 requires complete audit coverage without allowing repeated authorization probes to amplify immutable audit storage without bound. Writing one permanent event for every repeated denial preserves detail but lets an attacker select high-cardinality target IDs, paths, or malformed values and force unlimited audit growth. Sampling alone reduces volume but loses the exact number of attempts and weakens investigation evidence.

Role-assigned approval steps create a related but distinct amplification risk. Expanding every active role-scoped step into one notification per currently eligible user makes storage and write volume proportional to role population, becomes stale when roles, permissions, effective dates, scope, or employment status changes, and can expose work to users who are no longer eligible. A fixed or deterministic subset can hide work from the only user who is eligible when the action is taken.

The prior authentication throttle counted then inserted one `AuthLoginAttempt` per request. Parallel requests could pass the check together, and requests already over the threshold continued adding rows. Raw forwarding-header handling also lacked an executable trusted-proxy contract. Moving only duplicate `AuditEvent` writes into denial buckets would leave the larger mutable attempt store unbounded, so authentication needs a separate bounded operational counter in addition to immutable denial summaries.

The selected design keeps exact durable evidence at bounded cardinality and keeps role-scoped work attached to its authoritative approval step. It preserves server-enforced authorization at action time and does not introduce Redis, a queue, AWS, or a second workflow source of truth. PostgreSQL remains authoritative, and bounded finalization runs through the existing Hostinger/systemd operating model.

## Options considered

### Option A — selected: durable bounded denial bucket with exact counts

- Summary: Atomically aggregate repeated denials into a PostgreSQL bucket keyed only by bounded server-derived dimensions and a fixed window. Emit one immutable first event and, when count is greater than one, one immutable final summary containing the exact completed-window count.
- Benefits: Preserves exact attempt volume and immutable start/end evidence while bounding event growth independently of attacker-selected target cardinality. Timer plus lazy rollover avoids relying on a single scheduler execution.
- Failure modes: An unsafe dimension can restore unbounded cardinality; timer/lazy races can duplicate or omit final summaries; an incorrect atomic update can lose attempts; configuration outside safe bounds can increase noise or delay visibility; or audit persistence failure can accidentally affect authorization flow.
- Why selected or rejected: Selected because it provides exact, durable evidence with a server-controlled storage bound and fits the approved PostgreSQL and Hostinger systemd architecture.

### Option B — selected: authoritative role-assigned step with dynamic eligibility

- Summary: Keep one active `ApprovalInstanceStep` as the role-scoped work item, resolve inbox visibility from live eligibility, create no per-user role-assignment notifications, and allow at most one idempotent notification for a direct-user assignment.
- Benefits: Avoids population-sized fanout, reflects live authority and scope, preserves no-self-approval, and keeps one authoritative workflow state instead of copying work into recipient rows.
- Failure modes: An inefficient inbox query can become expensive; cached or incomplete eligibility can expose or hide work; a step can become temporarily unactionable after activation; or two eligible users can race to act on the same step.
- Why selected or rejected: Selected because role eligibility is dynamic authority, not a durable recipient list. A live authoritative step preserves correctness while bounding activation writes.

### Option C — rejected: one immutable audit event for every denial

- Summary: Record every denied attempt as an individual `AuditEvent`.
- Benefits: Simple event semantics and maximum per-request detail.
- Failure modes: Repeated enumeration can create unbounded permanent storage and indexing load, especially when attacker-controlled values increase event cardinality.
- Why selected or rejected: Rejected as the primary denial-audit design because it fails the bounded-amplification requirement.

### Option D — rejected: denial sampling alone

- Summary: Persist only selected denial attempts according to a rate or sampling rule.
- Benefits: Low write volume and simple storage budgeting.
- Failure modes: Loses exact attempt counts, makes attack reconstruction probabilistic, and can omit the event investigators need.
- Why selected or rejected: Rejected because sampling alone does not preserve exact durable evidence.

### Option E — rejected: deterministic role-recipient subset

- Summary: Select a stable limited subset of eligible users and create notifications only for them.
- Benefits: Bounds fanout while retaining recipient notifications.
- Failure modes: The subset becomes stale as authority changes and can exclude every user who is eligible or available at action time.
- Why selected or rejected: Rejected because it converts dynamic authorization into a stale assignment snapshot.

### Option F — rejected: runtime hard ceiling as the primary mechanism

- Summary: Continue per-user fanout or per-denial events until a configured runtime ceiling is reached, then stop writing.
- Benefits: Limits a single operation and may be easy to add around existing loops.
- Failure modes: Work or evidence disappears after the ceiling, behavior depends on population/order, and repeated operations can still amplify storage across calls.
- Why selected or rejected: Rejected as the primary mechanism. Defensive query and batch bounds remain appropriate safeguards but cannot replace the authoritative-step and bounded-bucket designs.

### Option G — rejected: defer both controls

- Summary: Keep current denial-event and approval-recipient behavior and leave SPF-006 open.
- Benefits: No immediate schema, workflow, query, or timer changes.
- Failure modes: Known audit-storage and approval-fanout amplification risks remain unresolved and production readiness cannot be established.
- Why selected or rejected: Rejected as the implementation choice. It remains the mandatory release posture if the selected controls or their evidence are incomplete.

### Option H — selected: bounded authentication denial plus throttle windows

- Summary: Aggregate repeated password/MFA denial evidence, reserve attempts atomically in bounded PostgreSQL windows before verification, retain only fixed shard keys for unresolved input, and use tenant/account dimensions only after resolving real records.
- Benefits: Bounds both immutable audit growth and mutable throttle rows, prevents count-then-write races, limits expensive password verification under pressure, and preserves individual lock/session lifecycle evidence.
- Failure modes: Fixed shards can cause collateral throttling; a forged forwarding header can defeat source pressure control; a crashed successful request can leave a conservative failure reservation; and cleanup or key rotation can corrupt active counters if not coordinated.
- Why selected or rejected: Selected because audit aggregation alone does not bound `AuthLoginAttempt` growth. PostgreSQL remains authoritative, while the Hostinger proxy supplies exact per-source edge limiting and overwrites client forwarding headers.

## Hard-gate assessment

- **Tenant and scope isolation:** Bucket dimensions and approval inbox results are derived from the authenticated server context and applicable tenant/company/location/project or workflow scope. Client-supplied target/path/error values do not control aggregation or visibility.
- **Server-enforced authorization:** Inbox visibility is not authority to act. The action service revalidates live role, permission, effective dates, scope, step state, and no-self-approval before changing workflow state.
- **Approval segregation:** A role-assigned step cannot activate unless at least one eligible non-prohibited approver exists. The requester or other prohibited actor is excluded both from activation eligibility and action-time authority.
- **Audit integrity:** First-denial and final-summary records are immutable `AuditEvent` rows. Actual approval workflow actions continue to create individual immutable audit events.
- **Bounded amplification:** Bucket cardinality depends only on reviewed server-derived dimensions and the validated time window. Role activation creates a constant number of workflow/audit rows rather than one notification per eligible user.
- **Transactional consistency and idempotency:** Denial increments are atomic and exact. Timer and lazy rollover share one idempotent finalization rule. Direct-user notification creation is idempotent, and approval-step action remains compare-and-set against the active authoritative step.
- **Fail-closed behavior:** Any denial-recording error leaves the business operation denied. Any eligibility or activation uncertainty prevents step activation or action rather than widening authority.
- **Recovery and deployment:** Schema and timer changes require reviewed migration, backup, forward-fix, idempotent replay, and hosted evidence. No queue, AWS service, or alternate source of truth is introduced.

## Required safeguards

### Denial aggregation

- Define a closed allowlist of low-cardinality, server-derived bucket dimensions. Review every dimension for a fixed operational bound. Never include attacker-controlled target IDs, record references, URL paths, query strings, payload values, filenames, raw IP values, error messages, stack traces, or database error text in the bucket key.
- Validate the configured aggregation window as an integer from 5 through 60 minutes. Use 15 minutes as the default. Invalid or missing hosted configuration fails readiness rather than silently selecting an unsafe value.
- Atomically create or increment the active bucket so concurrent denials produce an exact count. Bucket creation and exactly one immutable first-denial event commit together; concurrent increments do not create another first event.
- Finalize an expired bucket exactly once. Write no final summary for count `1`; for count greater than `1`, write one immutable final summary with the exact completed-window count and safe server-derived context.
- Use the same finalization transaction and idempotency condition for the Hostinger systemd timer and lazy rollover. Timer failure must not prevent a later matching denial from finalizing the expired bucket.
- Do not emit interim checkpoint audit events in the initial implementation. Adding them later requires a new material review of storage bounds and operational value.
- Keep denial recording outside the authorization decision's allow path. If bucket persistence or audit insertion fails, return the original user-safe denial, record an operational failure without unsafe request data where possible, and never execute the denied action.
- Bound timer work by reviewed batch size and execution time, use PostgreSQL coordination to prevent duplicate workers, and alert on overdue unfinalized buckets without introducing a queue.

### Role-scoped approval work

- Keep the active `ApprovalInstanceStep` as the only authoritative role-assigned work item. `Notification` is not an approval assignment or authorization source.
- At activation, resolve current eligibility using the step's assigned role/permission, effective dates, applicable scope, active user/assignment state, and no-self-approval/prohibited-actor rules. Abort activation when no eligible non-prohibited approver exists.
- Do not acquire a full population lock or persist a recipient snapshot for a role-assigned step. Activation creates zero per-user notifications and one immutable step-activation audit event.
- Resolve the dynamic inbox with server-side tenant/scope filters and bounded pagination. Revalidate the complete eligibility rules when the user acts; never rely only on a prior inbox result or notification.
- Use compare-and-set or equivalent locking so only one valid action advances or terminates an active step. A losing concurrent actor receives a user-safe stale/conflict result and does not create a second workflow outcome.
- For direct-user assignment, create no more than one notification using a stable idempotency key. The direct assignee still requires live action-time permission, scope, effective assignment, step state, and no-self-approval validation.
- Preserve one individual immutable audit event for activation and each actual workflow decision action according to the existing audit contract. Do not aggregate actual workflow decisions into denial buckets; authorization-boundary denials use the bounded denial rule.

### Authentication throttling

- Reserve attempt capacity atomically before Argon2 or MFA verification. Sort and lock all applicable window dimensions consistently; database uncertainty fails authentication closed.
- Bound durable row cardinality to fixed global, identifier-shard, and source-shard rows plus tenant/account rows derived only from real server-resolved records. Raw tenant codes, usernames, addresses, headers, session tokens, codes, and passwords never become keys or metadata.
- Keep exact request, failure-reservation, success, and denied counters. Successful authentication converts one reservation to success; an interrupted request remains conservatively failed until its window expires.
- Keep one immutable event for successful state transitions and the compare-and-set MFA lock transition. Repeated password and MFA failures use bounded denial evidence without permanent per-attempt dual writes.
- Require production and staging to declare the reviewed single-hop Hostinger proxy mode. The proxy must remove inbound forwarding headers, set one direct-client address, and keep the web process off public host ports. Adding Cloudflare or another proxy requires a new trusted-hop review.
- Treat fixed source shards as database pressure containment, not exact per-IP limiting. Exact per-source throttling remains an inseparable Hostinger edge control; shard pressure and overdue cleanup require monitoring.
- Purge only expired operational throttle windows under the approved retention policy after required summaries and transition evidence are durable. Never purge immutable audit or session-transition evidence through the throttle cleanup path.

## Authentication corrective amendment — 2026-07-22

### Amendment status and confirmed design

- Status: `Confirmed`
- Confirmation date: 2026-07-22
- Scope: Corrective refinement of the DEC-0050 authentication throttle, successful-authentication transaction, key lifecycle, application pressure control, and Hostinger edge-control design. It does not alter the confirmed authorization-denial aggregation or role-scoped approval design.

The authentication reservation is a random UUID accompanied by a canonical, domain-separated HMAC token. The token binds the reservation UUID to its authentication attempt, exact sorted throttle dimensions and database row identities, resolved tenant/account where applicable, PostgreSQL-derived window and expiry, key version and fingerprint, and control-state generation. The reservation and token are server-internal secrets: they must never be returned to a client or written to logs, audit metadata, diagnostics, metrics, or error messages.

The required immutable successful-authentication `AuditEvent` uses the reservation UUID as its event ID and is the sole durable consumption marker. Conversion of the reserved counters to success, session creation or rotation, MFA challenge replay protection or recovery-code consumption, the success audit event, and `lastLogin` changes commit in one database transaction. That transaction re-locks the credential and session authority before accepting the result. A session cookie is issued only after the transaction commits; rollback must leave no partial authentication success or consumed reservation.

A singleton database control row is authoritative for throttle-key and policy state. It stores the active and previous generation, version, and fingerprint; a digest of the effective throttle policy; PostgreSQL-derived `activeFrom` and `previousAcceptUntil` timestamps; and an `ACTIVE` or emergency `PAUSED` state. Every reservation transaction locks this row `FOR SHARE`. Operator-only rotation locks it `FOR UPDATE` and uses compare-and-set generation semantics. The runtime may read but cannot rotate this state. Environment configuration contains only the bounded active and previous key material. A routine `DRAINING` outage is not part of the lifecycle: the previous key remains acceptable only through the recorded overlap. Old binaries, unknown generations, key/fingerprint mismatches, missing bounded key material, or a `PAUSED` control row fail authentication closed.

MFA completion and replacement-session creation derive the source fingerprint from the current trusted request, not from the source stored when primary authentication began. The same current-source rule applies to success auditing and new or rotated session metadata.

Sign-in and account activation share a non-queuing application-level Argon2 semaphore. Its configured capacity must be an integer from 1 through 4; the initial staging candidate is `2` with exactly one web process. A request that cannot immediately acquire capacity is rejected with a stable user-safe response and does not wait in an in-process work queue. Caddy concurrency shedding is coarse defense in depth and is not a substitute for this application bound.

Exact source and global request limits are provided by a repository-owned custom Caddy image, not by stock Caddy alone. The build must pin the Caddy core/runtime and builder images by digest and pin the full reviewed rate-limit module commit. It must produce reviewable SBOM, provenance, vulnerability-scan, and signature evidence. Global limits execute before dynamic source limits; trusted sources use direct client addresses with IPv4 `/32` and IPv6 `/64` treatment. Authentication request bodies are capped at 64 KiB, and the web process remains private behind the single Hostinger proxy hop. Numeric edge ceilings remain configurable candidates and are not production-certified until Hostinger shared-NAT and load testing proves they do not block legitimate branch traffic or permit unsafe verification pressure.

No AWS service, Redis instance, second reverse proxy, alternate durable store, or queue is introduced. PostgreSQL, the single Hostinger Caddy hop, the single web process, and the repository-owned Hostinger systemd operating model remain the deployment boundary.

Throttle monitoring uses only bounded aggregate metrics and safe reason codes. It must cover denied velocity, global and account pressure, shard occupancy, semaphore rejection, key-state mismatch or pause, cleanup lag, and edge rejection without exporting raw identifiers, addresses, reservation values, tokens, credentials, headers, or internal errors. Tested external alert delivery remains a production-activation gate; local journal entries alone are insufficient.

### Amendment alternatives considered

#### AuthSession-only reservation marker — rejected

- Summary: Store the reservation UUID only on the resulting session and treat the session row as consumption evidence.
- Benefits: Avoids a separate immutable success event identity.
- Failure modes: Successful authentications that do not create a new session shape, session cleanup, session replacement, or partial transaction behavior can make consumption ambiguous; the session is not the immutable audit authority.
- Why rejected: The immutable successful-authentication `AuditEvent` must be the single durable consumption marker. Session state remains part of the same transaction but is not the source of truth for reservation consumption.

#### Per-attempt reservation rows — rejected

- Summary: Persist one durable reservation record for every authentication attempt.
- Benefits: Makes reservation lookup and state transitions explicit.
- Failure modes: Restores attacker-amplifiable row growth, adds cleanup and index pressure, and duplicates evidence already available through bounded counters and the immutable success event.
- Why rejected: It violates the bounded-storage objective. The random reservation UUID and authenticated token provide temporary proof without an unbounded reservation table.

#### Routine DRAINING state during rotation — rejected

- Summary: Stop or materially restrict authentication while the old key generation drains before activating the new generation.
- Benefits: Simplifies some overlap reasoning.
- Failure modes: Creates a routine authentication outage and couples operational availability to window drainage.
- Why rejected: Rotation instead uses one active and one time-bounded previous generation under a database fence. `PAUSED` is reserved for emergency fail-closed control, not routine rotation.

#### Stock-Caddy-only enforcement — rejected

- Summary: Use only stock Caddy request matching, header normalization, and coarse concurrency behavior.
- Benefits: Avoids a custom module and build provenance workload.
- Failure modes: Cannot prove the required exact per-source and global request-rate ceilings, leaving application Argon2 and database pressure insufficiently bounded.
- Why rejected: A pinned, repository-owned custom Caddy image is required for exact edge limits; stock controls remain useful only for body limits, trust normalization, and coarse shedding.

#### Second proxy or Redis-backed limiter — rejected

- Summary: Add another reverse-proxy tier or Redis to provide distributed exact throttling.
- Benefits: Provides familiar shared rate-limit primitives and supports later horizontal scale.
- Failure modes: Adds another failure domain, secret and backup surface, operating model, and source-of-truth dependency that is unnecessary for the confirmed one-process Hostinger deployment.
- Why rejected: The required control can be delivered within the existing single Hostinger proxy, application, and PostgreSQL boundary. A later topology change requires a new material decision.

#### Defer activation — mandatory fallback

- Summary: Keep the authentication correction disabled in production until all amendment evidence is complete.
- Benefits: Prevents promotion of an unproven security boundary.
- Failure modes: Delays production readiness and leaves the prior authentication implementation unsuitable for production activation.
- Why selected as fallback: Production activation is `NO-GO` whenever any required migration, concurrency, tamper, rollback, key-rotation, source, edge, load, restore, or external-alert evidence is missing or failing.

### Amendment hard-gate assessment

- **Tenant and account isolation:** Reservation proof binds the resolved tenant/account and exact database-backed dimensions. Unknown or attacker-selected tenant codes and identifiers remain only within reviewed fixed shards and never become durable keys or observable token fields.
- **Server-enforced authentication authority:** Credential, MFA, recovery, session, and control-row authority is re-read and locked within the success transaction. A prior verification result alone cannot create a session.
- **Immutable audit and single consumption:** The successful-authentication `AuditEvent` ID is the reservation UUID. Database uniqueness and append-only protection make replay conflict rather than consume the same reservation twice.
- **Transactional consistency and rollback:** Counter conversion, authoritative credential/session changes, MFA replay or recovery consumption, success audit, and `lastLogin` are atomic. Cookies are issued after commit only. Any uncertainty rolls back and fails closed.
- **Bounded amplification:** There is no per-attempt reservation table. Durable counters remain bounded by reviewed dimensions and windows; key material is bounded to active plus previous; Argon2 work is capped without queuing; edge limits bound exact source and global ingress.
- **Key integrity and recovery:** The singleton control row, shared/exclusive lock protocol, generation compare-and-set, database timestamps, bounded overlap, policy digest, operator-only rotation, and emergency pause prevent runtime key mutation and mixed-generation acceptance. Migration and restore rehearsals must prove recovery without weakening these fences.
- **Trusted source and deployment scope:** The current source comes from the single reviewed Hostinger proxy hop, which overwrites client forwarding headers and keeps the application private. IPv4 `/32` and IPv6 `/64` controls, body bounds, image provenance, and one-process staging topology must be evidenced before activation.
- **Safe observability:** Only bounded aggregates and safe reason codes leave the authentication boundary. Raw source identifiers, reservation/token material, credentials, internal errors, and attacker-controlled values are prohibited from logs, metrics, audit metadata, and alerts.
- **Phase and infrastructure discipline:** The amendment adds no AWS, Redis, queue, or second proxy. Any later horizontal scaling, CDN/proxy hop, or alternate limiter requires a new material decision and new trust/concurrency evidence.

### Amendment migration, rollback, and activation safeguards

1. Add new schema controls through additive migrations after migration `20260722160000`; do not rewrite that migration or earlier production history. The migration must add the singleton key/policy control state, database constraints for its singleton and lifecycle invariants, and the unique immutable-success consumption contract required by the reservation UUID.
2. Install or reconcile the control row through an operator-controlled, idempotent procedure. The runtime database role must not insert, update, rotate, pause, resume, or delete key-control state except for the minimum reviewed lock/read path required during authentication.
3. Canonical serialization and domain separation are a versioned cross-language contract. Tests must reject changed field order, duplicate or unsorted dimensions, substituted row identities, altered tenant/account, timestamp, expiry, key version/fingerprint, generation, policy digest, attempt kind, and any bit-level token tampering.
4. Concurrent success attempts using the same reservation UUID must yield exactly one committed success event and one authoritative session outcome. A loser fails safely without duplicated recovery consumption, MFA replay acceptance, session rotation, audit, or `lastLogin` mutation.
5. Rehearse rollback at every injected failure boundary in the success transaction. No cookie may be emitted and no partial counter, credential, session, recovery, audit, or login-time state may remain after rollback.
6. Rehearse active-to-previous rotation, overlap expiry, concurrent reservation and rotation locking, compare-and-set conflict, missing/incorrect environment keys, policy-digest change, old-binary behavior, emergency pause/resume, backup/restore, and forward-fix recovery on disposable PostgreSQL.
7. Prove that sign-in and activation cannot exceed the configured non-queuing Argon2 capacity and that MFA and replacement sessions use the current trusted source. Prove user-safe overload behavior and absence of raw identifiers or errors in all observability sinks.
8. Build and verify the custom Caddy image from pinned digests and the reviewed full module commit. Retain SBOM, provenance, vulnerability scan, signature verification, effective configuration, and route-order evidence. Test global-before-source limiting, IPv4 `/32`, IPv6 `/64`, spoofed forwarding headers, 64 KiB body rejection, direct-port isolation, restart behavior, and failure posture.
9. Validate numerical candidates on Hostinger under expected shared-branch NAT and hostile-load patterns before certifying them. The staging candidate values are configuration inputs, not a confirmed production policy.
10. Production activation remains `NO-GO` until independent Security, Database, DevOps, QA, and Release review accepts the exact-release concurrency, tamper, rollback, key-rotation, current-source, edge, load, restore, monitoring, and external-alert evidence. If evidence is incomplete or a safeguard cannot be maintained, keep the correction disabled and use activation deferral; do not weaken the control to meet a date.

### Amendment implementation and documentation impact

- Code / architecture: Add authenticated reservation proof, one atomic authentication-success transaction, current-source MFA/session handling, a non-queuing Argon2 semaphore, and a repository-owned custom Caddy build. Keep one web process for the evidenced topology.
- Data / schema: Add the singleton throttle-key/policy control row and the database-enforced immutable-success consumption contract through additive migrations after `20260722160000`. Do not add a per-attempt reservation table.
- Security / operations: Limit runtime access to read/lock only; make rotation operator-only; retain exactly two bounded key generations; add safe aggregate monitoring and tested external alerts; retain custom-image supply-chain evidence.
- Deployment: Hostinger remains the sole target. Do not add AWS, Redis, a second proxy, a queue, or another durable store. Any topology change reopens the material decision.
- User-facing behavior: Authentication overload, stale/tampered reservations, key mismatch, pause, database uncertainty, and transaction conflict fail closed with stable user-safe responses. No internal throttle dimensions or control state are exposed.
- Documentation: Update the technical stack/deployment, security/audit, migration register, data dictionary, pending implementation plan, glossary, and operator runbooks only as verified implementation lands. Dunong must assess whether user-facing sign-in troubleshooting or release guidance changes; internal key, limiter, and detection detail must not be exposed.
- Tests / release evidence: Add database concurrency and rollback tests, deterministic canonical/HMAC vectors, token tamper/replay tests, key lifecycle tests, current-source tests, Argon2 pressure tests, Caddy route/limit/trust tests, Hostinger NAT/load evidence, restore rehearsal, alert-delivery proof, and independent release acceptance.

### Amendment follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Add and independently review the post-`20260722160000` singleton control-state and immutable-success consumption migrations | Database Engineering + Security | Before local activation | Implemented and locally accepted; hosted migration/restore pending |
| Implement canonical domain-separated reservation HMAC proof and deterministic tamper/cross-generation tests | Backend Engineering + Security + QA | Before local activation | Complete locally |
| Refactor password, activation, MFA, recovery, session, audit, and `lastLogin` success paths into the confirmed atomic transaction with authority re-locking | Backend Engineering + Database Engineering | Before local activation | Complete locally |
| Implement operator-only key rotation with shared/exclusive locking, generation compare-and-set, bounded previous acceptance, and emergency pause/resume | Database Engineering + DevOps + Security | Before hosted rehearsal | Implemented; hosted operator rehearsal pending |
| Implement and pressure-test the shared non-queuing Argon2 semaphore for sign-in and activation | Backend Engineering + QA | Before hosted rehearsal | Implemented; Hostinger calibration pending |
| Build the pinned custom Caddy image and retain module, SBOM, provenance, scan, signature, hardening, trust, route-order, and body-limit evidence | DevOps + Security | Before hosted rehearsal | Image/config implemented; hosted supply-chain evidence pending |
| Validate configurable edge candidates under Hostinger shared-NAT and hostile-load conditions | DevOps + QA + Release Manager | Before production certification | Pending |
| Add bounded pressure monitoring and prove external alert delivery without raw identifiers or errors | DevOps + Security + QA | Before production certification | Monitoring implemented; external delivery/acknowledgement pending |
| Complete exact-release concurrency, tamper, rollback, rotation, source, edge, load, restore, and alert review | Security + Database Engineering + DevOps + QA + Release Manager | Before production promotion | Pending |
| Update affected source-of-truth and enablement documentation after implementation behavior is verified | Mithi + Dunong | After each verified implementation phase | Pending |

## Migration and rollback

1. Add `AuthorizationDenialBucket` through a reviewed PostgreSQL migration with tenant/scope columns, bounded server-derived dimension fields or key, window boundaries, exact count, first-event linkage, finalization state, and timestamps required by the confirmed behavior. Enforce one active bucket per reviewed dimension/window key with a database uniqueness constraint.
2. Preserve existing `AuditEvent`, `ApprovalInstanceStep`, and `Notification` history. Do not backfill synthetic denial counts, delete historical per-denial events, or rewrite existing approval recipients.
3. Deploy code that can atomically create/increment/finalize buckets and dynamically resolve role-assigned steps before enabling the systemd timer. Rehearse timer/lazy races, database failure, duplicate delivery, and rollback behavior on disposable PostgreSQL.
4. Install the bounded finalizer as a private Hostinger systemd service/timer with the runtime or a separately reviewed least-privilege database identity. Do not expose an HTTP callback, public port, queue credential, or administrative database credential.
5. Before activation, compare denial and approval audit behavior, notification counts, inbox visibility, action results, query plans, and cross-scope negatives against the predecessor. Stop on lost counts, duplicate summaries/actions, stale authority, unbounded dimensions, or unexpected recipient rows.

Before the new table contains production evidence, abandoning the change may restore the verified pre-migration backup. After bucketed denials exist, retain the table, immutable first/final audit events, and enough compatible finalization behavior to close open windows. Do not roll back by deleting buckets or audit events, recreating per-denial events from incomplete data, or materializing role recipients. Prefer a reviewed forward fix. Any application rollback must remain compatible with authoritative active steps, must not duplicate direct-user notifications, and must not turn an audit failure into an allowed action.

## Implementation and documentation impact

- Code / architecture: Add a denial-bucket service and shared timer/lazy finalizer backed by PostgreSQL. Change role-assigned approval activation and inbox reads to use the authoritative active step and live eligibility. Do not add Redis, a queue, AWS, or another workflow store.
- Data / schema: Add `AuthorizationDenialBucket` with bounded dimensions, exact atomic count, window/finalization state, uniqueness, and audit linkage. Existing immutable audit events and approval steps remain authoritative history.
- Workflow / permissions: Role-assigned work is visible and actionable only through live role, permission, effective-date, scope, step-state, and no-self-approval checks. Direct-user notification remains a convenience signal, not authority.
- UI / mobile: Approval inboxes must present dynamically eligible active steps without implying that a notification is required. Stale or no-longer-eligible actions return a clear denied/conflict state. No new generic denial-detail UI is authorized.
- Reporting: Security/operations reporting may use finalized exact bucket counts and first/final timestamps. Reports must not expose unsafe raw attacker-controlled values or treat absence of a final summary at count `1` as missing evidence.
- Deployment: Add a bounded Hostinger systemd finalizer and monitoring. PostgreSQL remains the only durable store; there is no AWS or new queue dependency.
- Knowledge base / training: Dunong must assess approval-inbox guidance so role-assigned work is explained as live and notification-independent. Security/operator material must explain bounded denial summaries without exposing internal detection dimensions.
- Tests / UAT: Add concurrency, atomic count, dimension-cardinality, timer/lazy rollover, failure-deny, live eligibility, no-self-approval, scope, effective-date, revocation, notification-count, pagination, and action-race coverage. Hosted release evidence remains required.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Define and independently review the closed server-derived denial dimension allowlist and configuration schema | Security + Architecture + Database Engineering | Before migration approval | Complete locally |
| Implement and review the `AuthorizationDenialBucket` migration, atomic service, immutable first/final audit linkage, and failure-deny behavior | Database Engineering + Backend Engineering + Security | Before SPF-006 local checkpoint | Complete locally; hosted restore pending |
| Implement the shared timer/lazy finalizer, bounded batches, idempotency, monitoring, and Hostinger systemd units | Backend Engineering + Platform Engineering + DevOps | Before hosted rehearsal | Implemented; hosted execution/alerts pending |
| Convert role-assigned activation to zero per-user notifications and one authoritative active-step/audit record | Backend Engineering | Before SPF-006 local checkpoint | Implemented behind disabled cutover flag |
| Implement dynamic paginated inbox eligibility and action-time revalidation for role, permission, effective dates, scope, step state, and no-self-approval | Backend Engineering + Frontend Engineering + Security | Before SPF-006 local checkpoint | Implemented behind disabled cutover flag; 18-type executable matrix pending |
| Preserve at most one idempotent notification for direct-user assignment and prove it does not grant authority | Backend Engineering + QA | Before SPF-006 local checkpoint | Complete locally |
| Run disposable PostgreSQL concurrency, failure, cardinality, rollover, revocation, scope, no-self-approval, and notification-count tests | QA + Database Engineering + Security | Before hosted rehearsal | Core cases pass; full 18-type inbox matrix and hosted load pending |
| Replace per-attempt authentication storage with atomic bounded throttle windows, bounded login/MFA denial evidence, trusted Hostinger proxy handling, cleanup, and pressure monitoring | Security + Database Engineering + Backend Engineering + DevOps | Before SPF-006 local checkpoint | Complete locally; hosted activation pending |
| Capture exact-release hosted PostgreSQL/systemd evidence and final Security/QA/DevOps/Release acceptance | Release Manager + DevOps + Security + QA | Before production promotion | Pending |
| Update source specifications, schema/data dictionary, deployment guide, pending plan, glossary, knowledge base, and release notes after verified implementation | Mithi + Dunong | After implementation behavior is verified | Pending |

## Evidence

- The parent Decision Chair confirmed both selected controls on 2026-07-22 after reviewing independent recommendations from Luningning (Security), Dalisay (restaurant workflow and controls), and Hiraya (Architecture).
- The three independent reviewers reached consensus that exact durable bounded denial counts are preferable to unbounded per-denial events or sampling, and that the active approval step is preferable to per-user fanout or a deterministic recipient subset.
- Security required server-derived bounded dimensions, fail-closed authorization, immutable first/final evidence, no attacker-controlled bucket keys, live action-time eligibility, no-self-approval, and negative concurrency/scope coverage.
- Business Analysis required at least one eligible non-prohibited approver before activation, live visibility as assignments change, no loss of actual workflow-action audit events, and no design that silently hides work from eligible approvers.
- Architecture required PostgreSQL atomicity and uniqueness, one idempotent timer/lazy finalization path, authoritative `ApprovalInstanceStep`, bounded paginated inbox queries, compare-and-set workflow action, and no new queue or parallel source of truth.
- A follow-up independent Security review found that `auth.login.failed`, `auth.mfa.challenge_failed`, and `AuthLoginAttempt` remained attacker-amplifiable because throttled requests still inserted rows and count-then-write was raceable. The Decision Chair confirmed the hybrid bounded authentication design after a separate read-only caller audit reached the same blocker and Security compared five alternatives.
- On 2026-07-22, the Decision Chair confirmed the authentication corrective amendment after independent Architecture, Database, and Hostinger deployment analyses and targeted Security and DevOps challenge. The accepted synthesis requires an HMAC-authenticated ephemeral reservation, immutable success-event consumption, atomic authority re-locking, database-fenced key generations, current-source MFA/session attribution, an application Argon2 semaphore, exact limits through a pinned custom Caddy build, bounded safe monitoring, and evidence-gated Hostinger activation.
- The amendment review rejected an `AuthSession`-only marker, per-attempt reservation rows, routine `DRAINING` outages, stock-Caddy-only enforcement, a second proxy or Redis, and any production activation without the complete concurrency, tamper, rollback, rotation, source, edge, load, restore, and alert evidence package.
- `AGENTS.md` requires server-side scope authorization, no self-approval for money-related requests, immutable audit history, transactional consistency, configurable policy values, Hostinger deployment discipline, and no new job queue without an approved technical decision.
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` treats authorization, approval segregation, audit completeness, transactional consistency, and recoverability as hard gates.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` keeps SPF-006 open for bounded authorization-denial recording and approval-fanout controls.

## Supersession

This decision is not superseded. A later decision that changes denial-bucket dimensions, count/finalization semantics, window bounds, role-step authority, eligibility rules, notification limits, or the Hostinger/PostgreSQL execution model must explicitly supersede this record.
