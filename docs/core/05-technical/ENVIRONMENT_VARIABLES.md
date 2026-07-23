# OGFI ERP — Environment Variables

**Purpose:** Define environment configuration keys without storing secrets in the repository.

---

## 1. Rules

- `.env` files are never committed.
- `.env.example` includes keys and safe placeholders only.
- Production values are stored only on approved deployment infrastructure or a secret manager.
- Browser-exposed variables use the `NEXT_PUBLIC_` prefix only when they contain no secret or privileged configuration.
- Rotate secrets after any suspected exposure.

Tracked placeholder templates:

| Template                  | Purpose                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `.env.example`            | Local development placeholders only                                                     |
| `.env.staging.example`    | Staging-only domain, database, storage, smoke, backup, and monitoring placeholders      |
| `.env.production.example` | Production-only domain, database, storage, backup, and required monitoring placeholders |

Real `.env`, `.env.staging`, `.env.production`, secret files, backups, and attachment exports must never be committed.

---

## 2. Required application variables

| Variable               |                                Required | Notes                                                                                                        |
| ---------------------- | --------------------------------------: | ------------------------------------------------------------------------------------------------------------ |
| `APP_ENV`              |                                     Yes | `development`, `staging`, or `production`.                                                                   |
| `APP_URL`              |                                     Yes | Canonical URL for the active environment.                                                                    |
| `APP_DEFAULT_TIMEZONE` |                                     Yes | Initial value: `Asia/Manila`; database timestamps remain UTC.                                                |
| `DATABASE_URL`         |                                     Yes | PostgreSQL application connection.                                                                           |
| `DIRECT_DATABASE_URL`  |                                     Yes | Direct PostgreSQL connection for migrations/admin work if pooling is introduced later.                       |
| `REDIS_URL`            | Future approved worker/queue scope only | Internal Redis queue/cache connection; not required for the current Phase I / Phase 1.5 no-queueing release. |
| `DASHBOARD_SOURCE_DEADLINE_MS` | Optional dashboard resilience tuning | Per-source user-visible wait bound in milliseconds, integer `1..3000`; default `2500`. This is a technical deadline derived from the four-second dashboard target, not a business freshness SLA, and it does not cancel already-running database work. |
| `DASHBOARD_SOURCE_MAX_IN_FLIGHT` | Optional dashboard resilience tuning | Process-wide admission ceiling for concurrently executing dashboard source reads, integer `1..64`; default `32`. A source retains its slot until the underlying work actually settles, even after the response deadline, so repeated requests cannot grow abandoned source work without bound. |
| `AUTH_SECRET`          |                                     Yes | Long random secret for session/auth configuration.                                                           |
| `APP_ENCRYPTION_KEY`   |                                     Yes | 32-byte base64 key or approved equivalent for field encryption where required.                               |
| `APP_ENCRYPTION_KEY_VERSION` |                              Yes | Positive version of the current field-encryption key; current default `1`.                                   |
| `APP_ENCRYPTION_PREVIOUS_KEY` | During a reviewed key rotation only | Immediately previous 32-byte base64 key retained only until protected values are re-encrypted.                |
| `APP_ENCRYPTION_PREVIOUS_KEY_VERSION` | During a reviewed key rotation only | Version paired with the previous key; it must differ from the current version.                         |
| `AUTH_MODE`            |                                     Yes | `local` in production; `demo` is allowed only in isolated development/test.                                  |
| `AUTH_TRUSTED_PROXY_MODE` |                                  Yes | `caddy_single_hop` in hosted staging/production; local development uses `untrusted` and never trusts client-supplied forwarding headers. |
| `AUTH_SESSION_IDLE_MINUTES` |                              Yes | Inactivity expiry for database-backed sessions; current default `30`.                                        |
| `AUTH_SESSION_ABSOLUTE_HOURS` |                            Yes | Maximum database-session lifetime; current default `12`.                                                     |
| `AUTH_MFA_STEP_UP_MINUTES` |                                Yes | Maximum age of runtime MFA assurance for guarded sensitive actions; current default `15`.                    |
| `AUTH_MFA_CHALLENGE_MINUTES` |                                Yes | Short lifetime for an incomplete MFA challenge; current default `10`.                                        |
| `AUTH_MFA_CHALLENGE_LIMIT` |                                  Yes | Failed MFA or recovery-code attempts allowed before challenge lock; current default `5`.                     |
| `AUTH_THROTTLE_HMAC_KEY` |                                  Yes | Distinct secret of at least 32 bytes used only for bounded authentication-throttle keys; never reuse `AUTH_SECRET`. |
| `AUTH_THROTTLE_KEY_VERSION` |                               Yes | Positive throttle-key version; rotate only after active windows for the current version expire.              |
| `AUTH_THROTTLE_WINDOW_MINUTES` |                            Yes | UTC-aligned failure reservation window, bounded to `1..60`; current default `15`.                             |
| `AUTH_THROTTLE_RETENTION_DAYS` |                            Yes | Bounded throttle-window retention, `1..365`; current default `30`.                                            |
| `AUTH_THROTTLE_IDENTIFIER_SHARDS` |                         Yes | Fixed identifier-shard cardinality, `16..1024`; current default `64`.                                         |
| `AUTH_THROTTLE_SOURCE_SHARDS` |                             Yes | Fixed trusted-source shard cardinality, `16..1024`; current default `64`.                                     |
| `AUTH_THROTTLE_PREVIOUS_HMAC_KEY` | Reviewed key rotation only | Immediately previous throttle HMAC key; configure only as a pair with its previous version and remove after the database-recorded overlap expires. |
| `AUTH_THROTTLE_PREVIOUS_KEY_VERSION` | Reviewed key rotation only | Version paired with the previous throttle key; it must differ from the active version. |
| `AUTH_ARGON2_MAX_CONCURRENCY` |                                 Yes | Non-queuing Argon2 work capacity, integer `1..4`; production requires Hostinger load calibration. |
| `APPROVAL_ROUTING_V1_ENABLED` | Controlled approval cutover | Keep `false` until the 18-document-type backfill, zero-gap readiness, normalized inbox/action matrix, smoke comparison, and rollback rehearsal pass. |
| `AUTH_HEALTH_METRICS_TOKEN` | Hosted authentication monitoring | Distinct secret of at least 32 bytes shared only by the web metrics route and root-controlled health job environment. |
| `CADDY_METRICS_URL` | Hosted authentication monitoring | Fixed private web-to-Caddy metrics URL `http://caddy:2020/metrics`; public URLs and credentials are prohibited. |
| `AUTH_RUNTIME_METRICS_URL` | Hosted authentication monitoring | Fixed host-loopback URL `http://127.0.0.1:2021/api/internal/authentication-metrics`. |
| `AUTH_THROTTLE_HEALTH_GRACE_MINUTES` | Hosted authentication monitoring | Cleanup grace, integer `1..1440`; staging candidate `10`. |
| `AUTH_THROTTLE_HEALTH_DENIED_THRESHOLD` | Hosted authentication monitoring | Aggregate denied-count alert threshold; must be calibrated and explicitly set for production. |
| `AUTH_THROTTLE_HEALTH_PRESSURE_PERMILLE` | Hosted authentication monitoring | Global/shard pressure threshold, integer `1..1000`; staging candidate `900`. |
| `AUTH_THROTTLE_HEALTH_ARGON2_REJECTED_THRESHOLD` | Hosted authentication monitoring | Aggregate non-queuing Argon2 rejection threshold; production value requires load evidence. |
| `AUTH_THROTTLE_HEALTH_ARGON2_DURATION_MS` | Hosted authentication monitoring | Maximum Argon2 duration alert threshold; production value requires load evidence. |
| `AUTH_THROTTLE_HEALTH_CADDY_REJECTED_THRESHOLD` | Hosted authentication monitoring | Aggregate Caddy rejection-delta threshold; production value requires NAT/hostile-load evidence. |
| `AUTH_BOOTSTRAP_TENANT_CODE` | First-admin ceremony only | Tenant login code for the approved initial administrator. Remove after the one-time bootstrap succeeds. |
| `AUTH_BOOTSTRAP_USER_EMAIL` | First-admin ceremony only | Existing active user with `core.administer` and active company scope; bootstrap refuses any other target. |
| `AUTH_BOOTSTRAP_AUTHORIZATION_REFERENCE` | First-admin ceremony only | Approved security/change reference recorded in the immutable bootstrap and audit records. |
| `AUTH_BOOTSTRAP_OUTPUT_FILE` | First-admin ceremony only | Absolute path to a new restricted file for the bearer URL; the URL is never printed to stdout. |
| `AUTH_ENCRYPTION_ROTATION_BATCH_SIZE` | During reviewed rotation only | Resumable MFA re-encryption batch size, clamped to `1..500`; current default `100`. |
| `EVIDENCE_STORAGE_PROVIDER` | Hosted evidence only | Must be `hostinger-local` in hosted staging/production; `local-private` is limited to local development/test. |
| `EVIDENCE_BROKER_URL` | Hosted evidence only | Must resolve to the private Compose service URL `http://evidence-broker:3010`; public/external broker URLs fail closed. |
| `EVIDENCE_BROKER_SHARED_SECRET_FILE` | Hosted evidence only | In-container path to the mounted broker-auth secret; never store the secret value in an environment file. |
| `EVIDENCE_DEFAULT_COMPANY_QUOTA_BYTES` | Hosted evidence only | Reviewed per-company byte quota. Blank placeholders are activation blockers. |
| `EVIDENCE_BROKER_MINIMUM_FREE_BYTES` | Hosted evidence only | Reserved filesystem bytes below which the broker rejects new writes. |
| `EVIDENCE_BROKER_MINIMUM_FREE_PERCENT` | Hosted evidence only | Reserved filesystem percentage below which the broker rejects new writes. |
| `EVIDENCE_BROKER_MINIMUM_FREE_INODE_PERCENT` | Hosted evidence only | Reserved inode percentage below which the broker rejects new writes. |
| `SMTP_HOST`            |                                     Yes | Approved provider host used for direct activation and recovery delivery.                                     |
| `SMTP_PORT`            |                                     Yes | Provider port; port `465` uses implicit TLS.                                                                 |
| `SMTP_USERNAME`        |                                     Yes | Provider credential.                                                                                         |
| `SMTP_PASSWORD`        |                                     Yes | Provider credential.                                                                                         |
| `SMTP_FROM`            |                                     Yes | Approved sender address.                                                                                     |
| `SMTP_SECURITY`        |                                     Yes | `implicit` for TLS on port 465 or `starttls` to require STARTTLS with certificate validation; plaintext is forbidden. |
| `ERROR_MONITORING_DSN` |                       Before production | Error monitoring configuration.                                                                              |
| `LOG_LEVEL`            |                                     Yes | Default `info`; never use debug in production without review.                                                |

---

## 3. Development-only variables

| Variable              | Notes                                     |
| --------------------- | ----------------------------------------- |
| `MINIO_ROOT_USER`     | Local/test object storage administrator.  |
| `MINIO_ROOT_PASSWORD` | Local/test object storage administrator.  |
| `MAIL_CAPTURE_URL`    | Local email capture service when used.    |
| `SEED_MODE`           | Controls idempotent synthetic data setup. |

The complete Hostinger broker, ClamAV, encryption-key-file, resource-limit,
reconciliation, and upload-control variable set is maintained in
`.env.staging.example`, `.env.production.example`, and
`infra/hostinger/evidence/README.md`. Staging and production must use distinct
`COMPOSE_PROJECT_NAME`, paths, secrets, keys, databases, and signature volumes.
There are no required AWS, S3, GuardDuty, KMS, or EventBridge variables in the
current deployment. Those providers may be considered only under a future
approved migration decision.

---

## 4. Prohibited variables and practices

- Do not place production passwords in `NEXT_PUBLIC_*` variables.
- Do not use one shared `.env` for local, staging, and production.
- Do not share credentials through chat logs, commits, screenshots, or document attachments.
- Do not put a database host reachable from the public internet in a client bundle.
- Do not enable `caddy_single_hop` while the web application port is publicly reachable or while another unreviewed proxy can append client-controlled forwarding values. Caddy must remove inbound `Forwarded`, `X-Real-IP`, and `X-Forwarded-For`, then set exactly one `X-Forwarded-For` value from its direct peer.
