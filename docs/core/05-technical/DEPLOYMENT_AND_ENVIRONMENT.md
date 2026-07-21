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
S3-compatible local object storage or mocked adapter
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
  └── S3-compatible object storage
```

Future approved releases may add private worker and Redis services, but they are outside the current no-queueing release topology.

Production profiles must expose only the reverse proxy public ports. PostgreSQL, object storage administration, and any future Redis/worker ports must remain private to the host or container network. Local-development port bindings may use `127.0.0.1` only.

Production authentication must set `AUTH_MODE=local`, use unique 32-byte-or-stronger `AUTH_SECRET` material, provide a valid 32-byte base64 `APP_ENCRYPTION_KEY` plus positive `APP_ENCRYPTION_KEY_VERSION`, and configure SMTP with `SMTP_SECURITY=implicit` or `starttls`; plaintext and TLS downgrade are rejected. Server instrumentation rejects production startup when demo mode, auth/encryption values, HTTPS `APP_URL`, or activation delivery configuration is invalid. The reverse proxy must overwrite `X-Forwarded-For` with the direct client address before the application applies source-based login throttling. Provision the first administrator once with `pnpm --filter @ogfi/database auth:bootstrap`. The target must already hold active `core.administer` authority and company scope; an authorization reference is mandatory; the bearer URL is written only to a new restricted absolute-path file; and a tenant bootstrap marker permanently prevents repeat, alternate-user, or recovery use. Treat that file as a sealed dual-custody handoff exception and remove it after use. All subsequent activation and recovery links are sent directly to the target account email and are never exposed to an administrator.

Application rollback after real identities are activated must retain the additive authentication tables and return to the last secure authentication build or maintenance mode. Never roll production back to demo email-only authentication. Back up and restore the versioned encryption keys under the approved secret-management process because encrypted TOTP authenticators cannot be recovered without a matching current or immediately previous key. During rotation, deploy the new current key/version with the prior key/version, re-encrypt protected values, verify MFA, then remove the prior key.

Run `pnpm --filter @ogfi/database auth:rotate-encryption` during an approved key rotation. The command rejects unsupported or identical keys, re-encrypts previous-version MFA rows in auditable bounded transactions, and is resumable after interruption. Do not remove the previous key until the command reports `complete: true`, `remainingPrevious: 0`, MFA smoke tests pass, and the reviewed backup/restore evidence includes both versions. The SPF-003 migration itself uses a five-second lock timeout and five-minute statement timeout so populated-table index/backfill contention fails and rolls back instead of waiting indefinitely.

### 3.1 Hosting guidance

- Application containers may run on a VPS or cloud container service.
- Prefer a managed PostgreSQL provider for production if budget and policy allow. Database reliability and backup discipline matter more than saving a small hosting cost.
- Use object storage rather than server-local uploads.
- Keep app, database, backup, and object-storage credentials separate.
- Keep staging separate from production, even if both begin on the same provider.
- Run application containers as non-root users with least container privilege where supported.

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

---

## 6. Backup and recovery baseline

### 6.1 Minimum backup policy

| Asset                      | Baseline                                                                   |
| -------------------------- | -------------------------------------------------------------------------- |
| PostgreSQL                 | automated daily full backup + point-in-time recovery where available       |
| Object storage attachments | versioning and lifecycle policy; periodic backup/replication               |
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
