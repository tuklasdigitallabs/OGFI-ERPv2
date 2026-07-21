# DEC-0046 — Controlled Evidence on the Hostinger VPS

## Metadata

- Decision ID: `DEC-0046`
- Title: Controlled Evidence on the Hostinger VPS
- Status: `Confirmed`
- Date: 2026-07-21
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — SPF-005 controlled evidence uploads
- Related decision brief: Parent-confirmed same-VPS evidence architecture following user confirmation, specialist council review, and targeted challenge

## Decision

Controlled evidence will use a dedicated internal minimal storage broker on the same Hostinger VPS as the initial OGFI ERP deployment. Only the broker owns the absolute private evidence bind mount and the versioned AES-256-GCM evidence-encryption key; the web application, Caddy, and ClamAV have no evidence mount. The application proxies upload bytes as a stream to the broker, which issues an opaque immutable storage key and version. PostgreSQL remains authoritative for source-record authorization, idempotency, tenant/company quota, quarantine state, compare-and-set availability transitions, and audit history.

The broker submits private byte streams to ClamAV through `INSTREAM`. A bounded systemd timer reconciles pending scans and signature freshness without a post-response promise, Redis, or a queue. Only a `CLEAN` result for the exact immutable key/version may become available. Same-VPS storage is explicitly not WORM or Object Lock: application retention and legal-hold controls must be paired with provider-managed or otherwise independently recoverable encrypted backup and demonstrated restore proof before activation.

## Context

`DEC-0045` selected AWS S3 and GuardDuty, but the authorized deployment direction is now to keep the initial evidence service on the existing Hostinger VPS while preserving strict process and privilege separation. Controlled evidence can contain invoices, delivery records, supplier documents, workforce records, photos, and approval support. It must remain private, encrypted, malware-gated, scoped to its source record, auditable, recoverable, and resistant to duplicate or stale transitions.

The same-VPS choice reduces external service complexity but deliberately accepts a shared host and storage failure domain. Root or host compromise can reach the broker, encryption material, database, and backups mounted or reachable from that host; same-disk loss can destroy both application data and local evidence. Filesystem permissions, encryption, application retention, and container separation reduce ordinary exposure but do not create hardware isolation, legal immutability, or WORM semantics. Production readiness therefore remains blocked until the named capacity, custody, backup, recovery, retention, scanning, and hosted-restore gates are approved and proven.

## Options considered

### Option A — selected: dedicated same-VPS storage broker and private ClamAV

- Summary: Run a minimal internal storage broker with exclusive access to an absolute private evidence bind mount and versioned AES-256-GCM evidence key; stream uploads through the application and scans through private ClamAV `INSTREAM`; keep lifecycle authority in PostgreSQL; reconcile with a bounded systemd timer.
- Benefits: Uses the confirmed Hostinger deployment, minimizes external provider dependencies and credentials, prevents web/Caddy/ClamAV filesystem access, keeps file identity immutable, and preserves a provider-neutral migration seam.
- Failure modes: Host root compromise can defeat service isolation; host or disk loss can remove both database and evidence; key loss makes evidence unrecoverable; disk, memory, or CPU exhaustion can affect the ERP; stale ClamAV signatures can make scan results unacceptable; a broker or timer fault can strand evidence in quarantine; and filesystem storage cannot enforce legal WORM retention.
- Why selected or rejected: Selected for the initial controlled rollout because it satisfies the applicable gates only when all required isolation, quota, encryption, scan, backup, restore, retention, and monitoring safeguards below are implemented and evidenced. It is not production-ready merely because the design is confirmed.

### Option B — rejected for the initial rollout: AWS S3 and GuardDuty

- Summary: Use private versioned S3 storage, KMS, GuardDuty scanning, event callbacks, and independent replication as described by `DEC-0045`.
- Benefits: Stronger managed-storage, independent-failure-domain, versioning, retention, and malware-scanning capabilities.
- Failure modes: Additional account, identity, cost, residency, callback, and operational dependencies; activation remained blocked on unresolved external configuration and ownership.
- Why selected or rejected: Rejected as the current implementation because the authorized deployment direction is the same Hostinger VPS. It remains a possible future migration target, but no AWS-specific behavior is current policy.

### Option C — rejected: direct web access to an evidence volume

- Summary: Mount the evidence directory into the Next.js/web container and let application code read and write files directly.
- Benefits: Fewer processes and a shorter local code path.
- Failure modes: A web compromise gains direct access to evidence bytes; storage and HTTP concerns become inseparable; retention and audit controls are easier to bypass; and migration is harder.
- Why selected or rejected: Rejected because the web process must not own or mount the evidence store.

### Option D — rejected: asynchronous queue or post-response scan work

- Summary: Acknowledge upload before durable handoff and rely on in-process post-response work, Redis, or a queue for scan completion.
- Benefits: Could shorten request latency or support later horizontal scaling.
- Failure modes: Post-response work can be lost on restart; Redis/queue operations expand the current release scope; retries can duplicate transitions without database authority.
- Why selected or rejected: Rejected for this release. Uploads are streamed durably to the broker, while a bounded systemd timer and PostgreSQL state provide recovery without an always-running queue.

### Option E — rejected: defer private file evidence

- Summary: Retain only structured notes and approved external references.
- Benefits: Avoids immediate storage and scanning operations.
- Failure modes: Workflows that require a private artifact cannot meet their evidence policy.
- Why selected or rejected: Rejected because controlled private uploads remain part of the approved hybrid evidence model.

## Hard-gate assessment

- **Tenant and organizational isolation:** PostgreSQL metadata and source-record authorization govern every upload, view, download, archive, retention, and recovery action. Opaque storage keys and filesystem paths are not authorization boundaries.
- **Server-enforced authorization:** Clients never receive filesystem paths, mount access, broker credentials, arbitrary object identifiers, or ClamAV access. The application re-authorizes against the linked source record before streaming upload or download.
- **Approval segregation:** Evidence availability cannot approve, post, pay, receive, or otherwise alter a controlled workflow. No evidence operation bypasses no-self-approval or scope rules.
- **Audit and evidence integrity:** The server issues an opaque non-repeating key and immutable version; PostgreSQL records checksum, size, scan state/version, availability state, actor, scope, source record, and lifecycle events. Normal users cannot overwrite or hard-delete evidence.
- **Transaction consistency and idempotency:** PostgreSQL owns idempotency, quota reservation, quarantine, leases, retry state, and compare-and-set transitions. Only a clean result tied to the exact key/version/checksum may release the record once.
- **Phase scope:** The design adds no document-management suite, public file sharing, Redis, queue, or general automation system.
- **Recovery and rollback:** Provider-managed or otherwise independent encrypted backup and a paired database/evidence restore rehearsal are activation gates. Application rollback uses a schema-compatible build or maintenance mode and must not expose quarantined files.

## Required safeguards

- Run a dedicated minimal storage broker on a private host/container network. Give only that broker read/write access to a validated absolute evidence bind mount. The web application, Caddy, ClamAV, and unrelated services must have no evidence mount, including read-only mounts.
- Run the broker as a non-root user with the smallest practical filesystem permissions, read-only container root filesystem where supported, dropped Linux capabilities, no public port, bounded request/body/time limits, and authenticated service-to-service requests. Root or host administrators remain a disclosed residual trust boundary.
- Generate opaque, non-repeating, server-issued storage keys and immutable versions. Never derive a path from tenant input, original filename, MIME type, or source-record identifier. Reject traversal, symlink, device, hard-link, overwrite, stale-version, and cross-environment access.
- Encrypt every stored evidence object with AES-256-GCM using a unique nonce and authenticated metadata. Keep a positive key version with each object. The broker alone receives current and approved previous key material. Define dual-custody key ownership, secure backup, recovery rehearsal, rotation, loss response, and retirement rules before activation; never log or place keys in evidence backups without an independently protected wrapping/custody process.
- Proxy uploads through the application as bounded streams to the broker; do not buffer full evidence files in browser-facing process memory or write browser-facing temporary files. Enforce configured size, detected type/signature, checksum, request rate, per-tenant/company quota, host high-water stop threshold, and reserved free-space threshold before and during intake.
- Keep every upload quarantined by default. The broker sends bytes privately to ClamAV using `INSTREAM`; ClamAV receives no evidence mount and exposes no public port. Only a conclusive `CLEAN` result for the exact immutable key/version and accepted signature-freshness state may transition to available. Threat, error, timeout, truncated stream, unsupported result, stale signatures, version mismatch, checksum mismatch, or indeterminate state remains unavailable.
- Update ClamAV signatures through an explicitly bounded service and monitor signature age, update failures, scanner health, scan latency, timeouts, resource use, and quarantined backlog. Pin the approved ClamAV image/digest and CPU/memory limits before hosted staging.
- Use a bounded, overlap-safe systemd timer to claim and reconcile pending scans through PostgreSQL leases/advisory locking, capped batches, retry/backoff, maximum attempts, and terminal quarantine. The timer must finish within its interval, return nonzero on systemic failure, and alert on failed, late, or missing runs. Do not rely on detached or post-response work; do not add Redis or a queue for this release.
- Store source authorization, idempotency key, quota reservation/consumption, key/version/checksum, quarantine and scan state, lease/retry fields, retention/legal-hold state, and audit events in PostgreSQL. Use compare-and-set so duplicate, concurrent, late, or stale scan outcomes cannot release or double-count evidence.
- Treat filesystem retention as application enforcement, not immutability. Same-VPS storage is not WORM, Object Lock, or protection from root. Legal-hold and retention actions require separate authority, audit, and denial of normal-user deletion; any legal requirement for enforced WORM is an external-storage migration trigger.
- Configure provider-managed or otherwise independently administered and independently recoverable encrypted backup outside the evidence host/disk failure domain. Confirm Hostinger daily-backup entitlement, destination/location, encryption, retention, restore granularity, and independence. Pair evidence and PostgreSQL recovery by immutable key/version/checksum and prove an isolated restore within approved RPO/RTO before activation.
- Audit upload intent, quota reservation, broker acceptance, scan attempt/result, availability/denial, download, archive/removal, retention/legal-hold change, key rotation, backup, restore, and administrative policy change without logging file bytes, filenames where sensitive, encryption material, bearer credentials, or document contents.
- Fail closed when broker isolation, mount path/ownership, encryption configuration, key version, PostgreSQL authority, ClamAV health/signature freshness, capacity thresholds, timer readiness, retention configuration, or required backup/recovery proof is missing.

## Implementation and documentation impact

- Code / architecture: Replace AWS-specific production adapters and callback assumptions with an internal `ObjectStorageAdapter`/`MalwareScanAdapter` implementation backed by the broker and ClamAV `INSTREAM`. Add streaming application-to-broker upload/download, exact key/version validation, signature-freshness checks, and bounded systemd reconciliation. No Redis or queue is authorized.
- Data / schema: Evidence metadata must support an opaque immutable key/version, encryption key version, checksum/size/type, source scope, idempotency, quota accounting, quarantine/scan/availability state, scan engine/signature metadata, retry/lease fields, retention/legal hold, and audit transitions. Any concrete schema change requires separate reviewed migration and data-dictionary work; this documentation task does not authorize those edits.
- Workflow / permissions: Evidence actions remain bound to current source-record authorization. Retention/legal-hold and recovery actions need separately assigned authority and audit. Evidence cannot mutate source workflow status.
- UI / mobile: Preserve upload progress, quarantined/scanning, available, threat/rejected, failed/indeterminate, quota/capacity denied, retry/support, archived, and legal-hold states without exposing paths, keys, versions, scanner internals, or encryption details.
- Reporting: Operations need quota and disk high-water usage, pending-scan age, signature freshness, scan outcomes, timer failures, backup age/failure, restore proof, retention exceptions, and key-version coverage without document contents.
- Knowledge base / training: Dunong must update role-based upload, scan-wait, rejection, capacity/quota, retry, archive/removal, legal-hold, download, and support guidance only after implementation and final policy values are accepted.
- Tests / UAT: Require scope-denial and non-enumeration tests; path/link/overwrite denial; stream interruption and size enforcement; encryption round-trip, nonce uniqueness, AAD tamper, version rotation, and missing-key failure; exact-version clean gating; every non-clean/stale-signature result; CAS/idempotency/concurrency; quota and disk-high-water races; timer overlap/restart; ClamAV and broker outage; mount isolation; production fail-closed configuration; backup pairing; and hosted isolated restore proof.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Confirm actual Hostinger VPS size, disk layout, current utilization, and reserved operating headroom | DevOps + Release Board | Before hosted staging activation | Open activation gate |
| Approve per-tenant/company evidence quota, upload-size/rate limits, disk high-water stop threshold, and exception handling | Product owner + Operations + Security | Before production UAT | Open activation gate |
| Approve evidence encryption-key custody, wrapping/backup, dual-control recovery, rotation, loss response, and retirement | Security + DevOps + Release Board | Before hosted staging activation | Open activation gate |
| Confirm Hostinger daily-backup entitlement, location, encryption, retention, restore granularity, and independence from the VPS/disk | Product owner + Hostinger account owner + DevOps | Before hosted staging activation | Open activation gate |
| Approve evidence and database RPO/RTO and the pairing/reconciliation procedure | Release Board + Operations + DevOps | Before production UAT | Open activation gate |
| Approve retention periods, legal-hold authority, disposition policy, and whether any record class legally requires WORM | Legal + Finance + Operations + Security | Before production UAT | Open activation gate |
| Pin the ClamAV image/digest, signature-update source/schedule/freshness ceiling, CPU/memory limits, scan timeout, and backlog alarms | Security + DevOps | Before hosted staging activation | Open activation gate |
| Implement and verify broker isolation, encryption, streaming, database state controls, private scanning, timer reconciliation, monitoring, and fail-closed readiness | Engineering + Database + Security + QA | SPF-005 implementation | Implemented in repository; independent migration review, hosted verification, and final acceptance pending |
| Capture hosted evidence for mount isolation, capacity controls, scan outcomes/failures, signature freshness, timer recovery, backup, and paired isolated restore | QA + Security + DevOps + Release Manager | Before SPF-005 production-ready closure | Pending |
| Reassess external object storage when a migration trigger is reached; use copy, checksum/version verification, authorization validation, staged read cutover, rollback window, and only then retire the VPS copy under approved retention | Architecture + Security + Database + DevOps + Release Board | Capacity, multi-host, stronger RPO/RTO, legal WORM, or tenant-scale trigger | Deferred trigger |
| Prepare user-facing upload and troubleshooting guidance from accepted implementation behavior | Dunong | After each accepted behavior slice; revise again when final policy values are approved | Complete for the implemented foundation; final policy-value revision remains pending |

## Evidence

- The user confirmed the same-Hostinger-VPS direction on 2026-07-21.
- The parent Decision Chair confirmed this decision after independent specialist council analysis and targeted challenge on 2026-07-21.
- The accepted safeguards retain the applicable hard gates for scope isolation, server authorization, audit integrity, idempotent compare-and-set release, fail-closed quarantine, recovery, and phase discipline.
- Repository evidence includes the broker/private-storage and ClamAV adapters, streamed upload/download routes, exact-version scan lifecycle, quota and upload-lease/rate controls, legal-hold service and retention register, bounded reconciliation, recovery create/stage/verify tools, Hostinger deployment overlay, and focused authorization/security tests. This implementation evidence does not satisfy the open hosted activation gates.
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md`
- `docs/core/05-technical/TECH_STACK_DECISION.md`
- `docs/core/05-technical/DEPLOYMENT_AND_ENVIRONMENT.md`
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` (`SPF-005`)

## Supersession

This decision supersedes `DEC-0045-CONTROLLED-EVIDENCE-OBJECT-STORAGE-AND-MALWARE-SCANNING.md` in full for the current production implementation. It also replaces AWS-specific production statements in `TD-016`, `TD-021`, `TECH_STACK_DECISION.md`, `DEPLOYMENT_AND_ENVIRONMENT.md`, and the SPF-005 plan. A future move to external object storage requires a new confirmed material decision once a capacity, multi-host deployment, stronger RPO/RTO, legal WORM, or tenant-scale trigger is reached; migration must follow copy, verification, controlled cutover, rollback, and retention-safe retirement rather than in-place path mutation.
