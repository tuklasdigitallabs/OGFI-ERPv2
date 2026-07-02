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
| `AUTH_SECRET`          |                                     Yes | Long random secret for session/auth configuration.                                                           |
| `APP_ENCRYPTION_KEY`   |                                     Yes | 32-byte base64 key or approved equivalent for field encryption where required.                               |
| `S3_ENDPOINT`          |                                     Yes | S3-compatible endpoint.                                                                                      |
| `S3_REGION`            |                                     Yes | Region/provider value.                                                                                       |
| `S3_BUCKET`            |                                     Yes | Environment-specific bucket.                                                                                 |
| `S3_ACCESS_KEY_ID`     |                                     Yes | Object-storage credential.                                                                                   |
| `S3_SECRET_ACCESS_KEY` |                                     Yes | Object-storage secret.                                                                                       |
| `SMTP_HOST`            |                   Before email delivery | Email provider host.                                                                                         |
| `SMTP_PORT`            |                   Before email delivery | Provider port.                                                                                               |
| `SMTP_USERNAME`        |                   Before email delivery | Provider credential.                                                                                         |
| `SMTP_PASSWORD`        |                   Before email delivery | Provider credential.                                                                                         |
| `SMTP_FROM`            |                   Before email delivery | Approved sender address.                                                                                     |
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

---

## 4. Prohibited variables and practices

- Do not place production passwords in `NEXT_PUBLIC_*` variables.
- Do not use one shared `.env` for local, staging, and production.
- Do not share credentials through chat logs, commits, screenshots, or document attachments.
- Do not put a database host reachable from the public internet in a client bundle.
