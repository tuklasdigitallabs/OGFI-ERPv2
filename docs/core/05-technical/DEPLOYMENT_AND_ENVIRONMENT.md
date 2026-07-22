# OGFI ERP — Deployment, Environments, and DevOps Plan

**Status:** Recommended Phase I baseline  
**Purpose:** Provide repeatable development, testing, release, recovery, and support processes.

---

## 1. Environment model

Use separate environments from the beginning.

| Environment | Purpose                                          | Data rules                                             |
| ----------- | ------------------------------------------------ | ------------------------------------------------------ |
| Local       | Individual developer work and feature validation | Synthetic seeded data only                             |
| Development | Shared integration environment                   | Synthetic or anonymized data; unstable allowed         |
| Staging     | Release-candidate validation and UAT             | Production-like configuration; approved test data only |
| Production  | Live OGFI operations                             | Real data; controlled access; audited deployments      |

Do not use production as a test environment.

---

## 2. Local development baseline

Local setup should run with Docker Compose or an equivalent reproducible container setup.

Required local services:

```text
web application / API process
PostgreSQL
local evidence broker/storage adapter or mocked adapter
mail catcher / mocked mail provider
```

Redis and worker services are future-approved capabilities only. They are not required for the current Phase I / Phase 1.5 no-queueing release.

The default Compose runtime must not start Redis or worker services for the current no-queueing release. Future worker/Redis services must be isolated behind an explicit profile or separate deployment configuration and require an approved technical decision before activation.

Required commands should be documented in the repository:

```text
pnpm dev
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm db:migrate
pnpm db:seed
pnpm docker:up
pnpm docker:down
```

Use a `.env.example` file with safe placeholder values. Never commit real credentials.

---

## 3. Recommended deployment topology

### Phase I recommended production setup

```text
Internet
  │
  ▼
Reverse proxy / load balancer with TLS
  │
  ├── Web/API container(s)
  ├── PostgreSQL (managed preferred)
  ├── internal evidence storage broker
  └── private ClamAV scanner
```

Future approved releases may add private worker and Redis services, but they are outside the current no-queueing release topology.

Production profiles must expose only the reverse proxy public ports. PostgreSQL, object storage administration, and any future Redis/worker ports must remain private to the host or container network. Local-development port bindings may use `127.0.0.1` only.

Production authentication must set `AUTH_MODE=local` and `AUTH_TRUSTED_PROXY_MODE=caddy_single_hop`, use unique 32-byte-or-stronger `AUTH_SECRET` material, use a separate 32-byte-or-stronger `AUTH_THROTTLE_HMAC_KEY`, provide a valid 32-byte base64 `APP_ENCRYPTION_KEY` plus positive `APP_ENCRYPTION_KEY_VERSION`, and configure SMTP with `SMTP_SECURITY=implicit` or `starttls`; plaintext and TLS downgrade are rejected. Server instrumentation rejects production-like startup when proxy trust, throttle, demo mode, auth/encryption values, HTTPS `APP_URL`, or activation delivery configuration is invalid. Caddy must remove inbound `Forwarded`, `X-Real-IP`, and `X-Forwarded-For`, then set one `X-Forwarded-For` value from the direct peer before the application applies source-based authentication throttling. The hosted web service has no published host port; the local-only binding remains loopback. This is a single-hop contract: adding a CDN or another proxy requires separate review rather than accepting a forwarded chain. Provision the first administrator once with `pnpm --filter @ogfi/database auth:bootstrap`. The target must already hold active `core.administer` authority and company scope; an authorization reference is mandatory; the bearer URL is written only to a new restricted absolute-path file; and a tenant bootstrap marker permanently prevents repeat, alternate-user, or recovery use. Treat that file as a sealed dual-custody handoff exception and remove it after use. All subsequent activation and recovery links are sent directly to the target account email and are never exposed to an administrator.

Application rollback after real identities are activated must retain the additive authentication tables and return to the last secure authentication build or maintenance mode. Never roll production back to demo email-only authentication. Back up and restore the versioned encryption keys under the approved secret-management process because encrypted TOTP authenticators cannot be recovered without a matching current or immediately previous key. During rotation, deploy the new current key/version with the prior key/version, re-encrypt protected values, verify MFA, then remove the prior key.

Run `pnpm --filter @ogfi/database auth:rotate-encryption` during an approved key rotation. The command rejects unsupported or identical keys, re-encrypts previous-version MFA rows in auditable bounded transactions, and is resumable after interruption. Do not remove the previous key until the command reports `complete: true`, `remainingPrevious: 0`, MFA smoke tests pass, and the reviewed backup/restore evidence includes both versions. The SPF-003 migration itself uses a five-second lock timeout and five-minute statement timeout so populated-table index/backfill contention fails and rolls back instead of waiting indefinitely.

Authentication throttle-key rotation is separately database fenced. Deploy the new current HMAC key with an explicitly bounded previous key and expiry, run the key-rotation readiness check through the reviewed maintenance tooling, then change the database-authoritative generation. Do not remove the previous key until its expiry has passed, no valid reservation can reference it, the runtime probe passes, and aggregate health remains within the calibrated thresholds. Pause admission through the database control before an emergency key withdrawal; application-only environment changes are not an approved bypass.

### 3.1 Hosting guidance

- Application containers may run on a VPS or cloud container service.
- Prefer a managed PostgreSQL provider for production if budget and policy allow. Database reliability and backup discipline matter more than saving a small hosting cost.
- Use broker-managed evidence storage rather than a web-mounted uploads directory.
- Keep app, database, backup, and object-storage credentials separate.
- Keep staging separate from production, even if both begin on the same provider.
- Run application containers as non-root users with least container privilege where supported.

### 3.2 Controlled evidence same-VPS deployment contract

`DEC-0046` supersedes the external AWS design in `DEC-0045`. The initial controlled-evidence deployment uses a dedicated internal minimal storage broker and private ClamAV service on the same Hostinger VPS. Only the broker may mount the validated absolute evidence path or receive the versioned AES-256-GCM evidence key. The web application, Caddy, ClamAV, and unrelated services must have no evidence mount. The broker and ClamAV expose no public port.

The application re-authorizes each action against the source record and proxies bounded upload/download streams. The broker generates opaque non-repeating keys and immutable versions, rejects traversal/link/overwrite behavior, encrypts each object with a unique AES-256-GCM nonce and authenticated metadata, and returns identity/checksum metadata for PostgreSQL recording. Do not buffer full evidence files in web-process memory or browser-facing temporary files.

PostgreSQL remains authoritative for tenant/company/source scope, idempotency, quota reservations and consumption, quarantine and scan state, exact key/version/checksum, leases/retries, compare-and-set availability, retention/legal hold, and audit. Only a conclusive ClamAV `CLEAN` result for that exact immutable version and an accepted signature-freshness state may become available. Threat, error, timeout, truncated stream, version/checksum mismatch, stale signature, or indeterminate results remain quarantined.

ClamAV receives file bytes privately through `INSTREAM` and has no evidence mount. Pin the approved image/digest and resource limits; bound stream size and scan timeout; update signatures through an explicitly bounded service; monitor signature age, update failure, health, resource use, scan latency, and backlog. A one-shot, overlap-safe systemd timer reconciles pending scans through PostgreSQL leases/advisory locking, capped batches, retry/backoff, maximum attempts, and terminal quarantine. Keep its timeout below its interval and alert on failed, late, or missing runs. Do not use detached post-response work, Redis, BullMQ, a queue, or an always-running worker for this release.

Same-VPS filesystem storage is not WORM or Object Lock and does not protect against host root compromise or same-disk loss. Retention and legal hold are application-enforced and separately authorized/audited. Provider-managed or otherwise independently administered encrypted backup must be recoverable outside the VPS/disk failure domain. Before activation, confirm Hostinger daily-backup entitlement, destination/location, encryption, retention, restore granularity, and independence; then prove an isolated paired restore that reconciles PostgreSQL metadata to the same evidence key/version/checksum within approved RPO/RTO.

Production activation requires hosted staging evidence for:

- actual VPS CPU, memory, disk layout, utilization, reserved headroom, evidence quota, upload limit, request-rate limit, disk high-water stop, and concurrent quota/high-water behavior;
- broker-only mount and key access; denial of web/Caddy/ClamAV mount access; non-root/least-privilege runtime; path/link/overwrite denial; streaming interruption; encryption round-trip, nonce/AAD integrity, key rotation, missing-key failure, and audited dual-control recovery;
- clean, threat, error, timeout, stale-signature, truncated-stream, checksum/version mismatch, duplicate/concurrent result, broker outage, and ClamAV outage behavior;
- timer overlap/restart/retry/terminal handling, pending age, signature freshness, scan latency, quota/capacity, disk, backup age/failure, and key-version monitoring;
- approved retention/legal-hold policy and authority, approved database/evidence RPO/RTO, independently recoverable encrypted backup, and a paired isolated restore.

Application rollback after controlled-evidence schema activation must use the last schema-compatible build or maintenance mode. Do not restore a predecessor that cannot enforce the required scope, immutable version, encryption, quarantine, quota, or retention fields while uploads remain enabled. Rehearse forward-fix/maintenance mode and verify that quarantined and available versions remain unchanged.

Review external object storage only when capacity, multi-host deployment, stronger RPO/RTO, legal WORM, or tenant scale becomes a material requirement. Migration must copy evidence, verify every key/version/checksum and authorization mapping, stage read cutover with rollback, and retire the VPS copy only after successful proof and approved retention handling.

---

## 4. CI/CD pipeline

Use GitHub as the canonical source repository and GitHub Actions (or equivalent) for automated checks.

### 4.1 Pull request pipeline

Every pull request should run:

1. dependency install;
2. tracked secret review;
3. release helper self-test;
4. lint;
5. typecheck;
6. unit tests;
7. API/service tests;
8. database migration validation;
9. build;
10. selected end-to-end workflow tests;
11. dependency/security scan where configured.

### 4.2 Staging release pipeline

Use the manual `Staging Release Rehearsal` GitHub Actions workflow for release candidates. It must:

1. install dependencies from the lockfile;
2. run tracked secret review and release helper self-test;
3. generate the database client;
4. capture a pre-migration data snapshot;
5. run migrations against the workflow database;
6. capture a post-migration data snapshot and snapshot delta report;
7. run a PostgreSQL backup and isolated restore check;
8. run lint, typecheck, production build, service tests, access-control tests, and Playwright e2e;
9. render default and future-worker Compose configs;
10. generate the release candidate summary and a release evidence manifest with SHA-256 checksums for collected artifacts;
11. upload a release evidence artifact containing release version, run ID, commit SHA, timestamp, release helper self-test evidence, evidence manifest, rendered Compose configs, data snapshots, delta report, and backup/restore proof.

If staging SSH secrets are configured and `deploy_to_staging` is explicitly selected, the guarded deploy step may run `pnpm release:staging:deploy`. The script refuses to deploy unless `CONFIRM_STAGING_DEPLOY=yes` and the staging host, user, app directory, and release version are provided.

After a guarded staging deploy, run:

```text
SMOKE_BASE_URL=https://staging-erp.<approved-domain> pnpm release:smoke
```

The smoke command writes timestamped evidence under `release-evidence/smoke/` and verifies `/health`, `/readiness`, `/api/health`, `/api/readiness`, sign-in reachability, and protected-route redirect behavior.

The guarded staging deploy artifact must include the smoke evidence, any remote deploy data snapshots, and `release-evidence/manifests/` generated after those files are collected.

Rollback uses the manual `Staging Rollback Rehearsal` workflow or `pnpm release:staging:rollback` with an approved `ROLLBACK_RELEASE_VERSION` and `CONFIRM_STAGING_ROLLBACK=yes`. Post-rollback smoke evidence must be attached before final release approval.

The staging rollback artifact must include `release-evidence/staging-rollback/` and `release-evidence/manifests/` generated after rollback summary and post-rollback smoke evidence are collected.

Use `pnpm release:rollback-summary` when rollback evidence is collected manually outside the workflow so the summary contains the same required fields and pass marker checked by GO/NO-GO.

Before transaction UAT, run:

```text
DATABASE_URL=<pilot-or-staging-database> pnpm release:pilot-readiness
```

The pilot readiness command writes read-only setup evidence under `release-evidence/pilot-readiness/`. Passing output supports setup readiness only; it does not replace named owner signoff or UAT evidence.

Before final GO/NO-GO review, initialize the release evidence folder, collect the workflow artifacts, and run:

```text
RELEASE_EVIDENCE_ROOT=<collected-release-evidence> pnpm release:evidence:init
```

Regenerate the evidence manifest after copying workflow artifacts or signed documents:

```text
RELEASE_EVIDENCE_ROOT=<collected-release-evidence> \
RELEASE_VERSION=<release-candidate> \
GITHUB_RUN_ID=<workflow-run-id> \
GITHUB_SHA=<commit-sha> \
pnpm release:summary

RELEASE_EVIDENCE_ROOT=<collected-release-evidence> pnpm release:evidence:manifest
```

```text
RELEASE_EVIDENCE_ROOT=<collected-release-evidence> pnpm release:go-no-go
```

Use `docs/core/07-quality/PHASE1_PHASE1_5_RELEASE_EVIDENCE_COLLECTION_GUIDE.md` for the required evidence folder layout and artifact destinations. Use `RELEASE_UAT_EVIDENCE_FILE`, `RELEASE_DEPLOYMENT_EVIDENCE_FILE`, and `RELEASE_TRAINING_EVIDENCE_FILE` when the signed evidence documents are collected copies rather than the repository templates. The GO/NO-GO command summarizes missing evidence, unresolved placeholders, and missing success markers inside generated evidence files. It is advisory and must not replace named release-owner signoff.

### 4.3 Production release pipeline

Production deployment requires:

- approved release/PR;
- validated staging UAT evidence;
- backup confirmation for database before migration;
- migration review;
- planned rollout window when changes affect inventory or approvals;
- smoke-test checklist;
- rollback plan.

---

## 5. Database migration and rollback policy

- Migrations are code-reviewed and committed to source control.
- Avoid destructive migrations in one step. Use expand → migrate data → switch reads/writes → contract later.
- Back up database before production migrations.
- Application must remain compatible with both old and new schema during rolling release when practical.
- Never roll back an applied migration blindly if it would destroy live transactional data. Prefer forward-fix migrations.

### 5.1 Hosted PostgreSQL role boundary

Staging and production use three distinct PostgreSQL roles: a non-login object owner, a login migrator that may `SET ROLE` only to that owner, and a login runtime role with no memberships or schema/database creation rights. The application receives only `DATABASE_URL` for `ogfi_stg_runtime` or `ogfi_prod_runtime`. Owner, administrator, `DIRECT_DATABASE_URL`, and migrator credentials are prohibited from the application environment.

On Hostinger, keep the migrator and runtime URLs in separate root-owned mode-`0400` files and keep the non-secret role contract separate from the application environment. Run `pnpm db:migrate:controlled`, or the reviewed `ogfi-db-migrate@<release>.service`, for hosted migrations. The wrapper positively identifies the environment and database, verifies distinct credentials and effective roles, runs Prisma migration deployment with a scrubbed child environment, reconciles ownership/grants, and runs `pnpm db:append-only:contract`. Direct hosted `pnpm db:migrate:deploy` is not an approved release operation.

The role SQL under `infra/hostinger/postgres/` is packaging-neutral: it does not decide whether PostgreSQL is a Hostinger host service or a separately approved private container. Before first deployment, a cluster administrator runs the bootstrap and provisions SCRAM passwords out of band. After every restore, the administrator reruns bootstrap ownership and exact-membership adoption, then the migrator reconciles default/table/column/routine privileges and runs the append-only contract before application traffic resumes. Unexpected schemas or objects, unsafe ownership/default ACLs, or any unapproved callable `SECURITY DEFINER` routine are a release **NO-GO**.

### 5.2 Normalized approval-routing activation

Keep `APPROVAL_ROUTING_V1_ENABLED=false` through migration, backfill, and evidence collection. Activation is allowed only for the exact reviewed release after all of the following pass against a populated restored candidate:

1. run the controlled migration and `pnpm --filter @ogfi/web test:approval-routing:database:execute`;
2. run the bounded backfill in dry-run mode with `pnpm approval-routing:backfill`, resolve every unsupported document type, missing subject, ambiguous route, prohibited/self approver, and scope blocker, then apply it idempotently with `pnpm approval-routing:backfill -- --apply`;
3. prove the executable 18-document-type route, detail, and action matrix, including direct and role assignment, `ANY`/`ALL` permissions, effective-date and scope revocation, no-self-approval, due-soon ordering, page/count agreement, and concurrent action behavior;
4. pass authenticated production-mode browser smoke tests with a role-eligible user who has no notification row, and confirm notifications remain advisory rather than authoritative;
5. record the before/after counts, unresolved-blocker count of zero, exact release SHA, approver, and rollback owner before setting the flag to `true`.

Rollback is the configuration-only return to `APPROVAL_ROUTING_V1_ENABLED=false` followed by the legacy-inbox smoke test. Do not delete routing snapshots, backfill results, approval steps, notifications, or audit history. A data repair or migration rollback requires a separate reviewed forward-fix plan.

---

## 6. Backup and recovery baseline

### 6.1 Minimum backup policy

| Asset                      | Baseline                                                                   |
| -------------------------- | -------------------------------------------------------------------------- |
| PostgreSQL                 | automated daily full backup + point-in-time recovery where available       |
| Controlled evidence        | provider-managed or independently administered encrypted backup outside the VPS/disk failure domain; paired key/version/checksum restore proof |
| Application configuration  | version-controlled non-secret config; secure secret manager backup process |
| Audit data                 | included in database backup and retained with transaction records          |

### 6.2 Recovery testing

A backup that has never been restored is not a proven backup.

At least quarterly, restore a production-like backup into a secure non-production environment and verify:

- database opens;
- core documents can be queried;
- inventory ledger/balances reconcile at a sample level;
- attachments are accessible only with correct authorization;
- critical reports run.
- restored objects are owned by the reviewed non-login owner and runtime remains unable to mutate append-only history.

The repository provides helper commands for evidence capture:

```text
pnpm db:backup
pnpm db:restore-check
pnpm release:data-snapshot
pnpm release:data-snapshot:compare
pnpm release:data-snapshot:compare-latest
```

`pnpm db:backup` requires `DATABASE_URL` and PostgreSQL client tool `pg_dump`; it writes a custom-format PostgreSQL dump under `BACKUP_DIR` with a checksum when available. `pnpm db:restore-check` requires `RESTORE_DATABASE_URL`, `BACKUP_FILE`, `pg_restore`, and `psql`; the restore URL must point to an isolated non-production database unless an emergency restore is explicitly authorized outside the normal release rehearsal path. If PostgreSQL client tools are installed but not on `PATH`, set `PG_DUMP_BIN`, `PG_RESTORE_BIN`, or `PSQL_BIN` to the full executable path before running the helper commands.

Use `pnpm release:backup-summary` after backup creation when backup evidence is collected manually outside the staging workflow. The summary records the backup artifact path, byte size, checksum file status, environment, run metadata when available, timestamp, and GO/NO-GO pass marker without storing database credentials.

Use `pnpm release:restore-summary` after an isolated restore check when restore evidence is collected manually outside the staging workflow. The summary records the backup artifact, restore target name, environment, run metadata when available, timestamp, and GO/NO-GO pass marker without storing database credentials.

`pnpm release:data-snapshot` requires `DATABASE_URL` and PostgreSQL client tools. If `psql` is not on `PATH`, set `PSQL_BIN` to the full executable path. Use `RELEASE_DATA_SNAPSHOT_ALLOW_MISSING_TABLES=yes` only for pre-migration snapshots where the old schema may not contain all current release tables. Use `pnpm release:data-snapshot:compare-latest` for rehearsal folders with the standard pre/post file names, or `pnpm release:data-snapshot:compare` for explicit before/after files, to review row-count deltas before release approval. Missing, unmatched, negative, or otherwise disallowed deltas fail closed and cannot be bypassed through an environment-variable override; correct the migration or baseline and run a fresh exact-SHA rehearsal.

---

## 7. Monitoring and operational alerts

### 7.1 Health endpoints

Provide health/readiness endpoints for:

```text
application process
PostgreSQL connectivity
object storage connectivity
migration version
```

Future approved worker/Redis scope must add private worker and Redis health checks before activation.

Current release endpoints:

```text
GET /health       -> reverse proxy liveness check backed by /api/health
GET /readiness    -> reverse proxy readiness check backed by /api/readiness
GET /api/health   -> web liveness and safe configuration flags
GET /api/readiness -> database connectivity and required configuration check
```

`/api/readiness` must not expose secrets or raw database errors. Staging and production monitoring should alert on non-2xx readiness responses and repeated application errors.

### 7.2 Metrics to monitor

- API error rate and latency;
- login failures/rate limits;
- database connection saturation;
- disk/storage usage;
- attachment upload failures;
- manual reminder scan failures;
- approval notification failures;
- migration failures;
- inventory posting failure rate.

### 7.3 Incident severity

| Severity | Example                                                   | Response expectation                               |
| -------- | --------------------------------------------------------- | -------------------------------------------------- |
| Critical | Cannot post receiving or inventory; database unavailable  | immediate investigation and incident communication |
| High     | Approvals/notifications delayed; major module unavailable | urgent same-day response                           |
| Medium   | Export or non-critical dashboard degraded                 | planned fix, monitor impact                        |
| Low      | Minor visual issue or non-blocking enhancement            | backlog and scheduled fix                          |

---

## 8. Release and rollback checklist

Before a production release:

- [ ] Staging UAT completed for changed workflows.
- [ ] Core workflow regression tests pass.
- [ ] Permissions tested for branch, warehouse, purchasing, finance, and admin roles.
- [ ] Migration reviewed and backed up.
- [ ] Environment variables reviewed.
- [ ] Feature flags configured where used.
- [ ] Observability checks working.
- [ ] Rollback/forward-fix plan documented.

After release:

- [ ] Smoke-test login and scoped dashboard.
- [ ] Create/test a non-production-safe sample transaction where possible.
- [ ] Verify in-app notifications and manual reminder scan behavior where in scope.
- [ ] Verify audit logging.
- [ ] Monitor errors and performance.

---

## 9. Environment configuration rules

- Use secrets manager or environment-level secure variables for all credentials.
- Keep `.env.example` documented but non-sensitive.
- Validate required configuration on startup; fail fast when critical values are missing.
- Use distinct storage buckets/prefixes per environment.
- Use distinct databases per environment.
- Never point local development at production database or storage.
- Feature flags are configuration, not undocumented code branches.
