# OGFI ERP — Technical Stack Decision

**Status:** Approved Phase I baseline  
**Applies to:** Phase I and future modules unless superseded by an approved technical decision  
**Primary deployment:** Hostinger VPS via Docker Compose  
**Architecture style:** Modular monolith; background worker remains a future-approved capability outside the current no-queueing release scope

---

## 1. Decision summary

OGFI ERP will be built as a TypeScript modular monolith, initially deployed to the Hostinger VPS through Docker Compose.

The application will use a single Next.js web application for the Modern SaaS interface and Phase I API surface, a PostgreSQL transactional database, and provider-neutral attachment-storage and malware-scan interfaces. Under `DEC-0046`, the initial production implementation is a dedicated internal minimal storage broker and private ClamAV service on the same Hostinger VPS. The broker alone owns the absolute private evidence mount and versioned AES-256-GCM evidence key; web, Caddy, and ClamAV have no evidence mount. The platform must remain tenant-ready for future sale to other restaurant groups. Redis-backed workers are a future capability only and are not part of the current Phase I / Phase 1.5 no-queueing release scope.

```text
Browser: desktop / tablet / mobile
        │
        ▼
Caddy reverse proxy + HTTPS
        │
        ├── Next.js web application
        ├── PostgreSQL
        ├── internal evidence storage broker
        └── private ClamAV `INSTREAM` scanner
```

This is intentionally a modular monolith, not microservices. Purchasing, approval, receiving, transfer, and inventory posting need reliable, low-latency transactional behavior. Separate services will be considered only when a proven operational reason exists.

---

## 2. Approved stack

| Layer | Decision | Implementation notes |
|---|---|---|
| Language | TypeScript | Strict mode required across web, worker, scripts, and shared packages. |
| Runtime | Node.js active LTS at project initialization | Pin the selected runtime in `.nvmrc` or the project’s version manager. Do not use an unpinned floating runtime in production. |
| Workspace | `pnpm` workspaces | Monorepo for web app, worker, database package, UI package, infrastructure, and docs. |
| Web application | Next.js App Router | Self-hosted in a Docker container. Route handlers and a service layer provide the initial API surface. |
| UI | Tailwind CSS + internal reusable component library | Implements the approved Modern SaaS design tokens and component rules. Do not introduce a competing UI system. |
| Validation | Zod or equivalent shared schema validator | Validate every command at the server boundary and reuse schemas where practical. |
| Database | PostgreSQL | Authoritative transactional store for tenants, scope, workflow documents, approvals, ledger, and audit data. |
| ORM and migrations | Prisma ORM | Use controlled migrations; use explicit SQL only for reviewed high-risk/reporting operations. |
| Authentication | Provider-neutral application identity boundary with tenant-qualified local credentials, `@node-rs/argon2` Argon2id hashing, `otpauth` runtime TOTP, and opaque PostgreSQL-backed sessions under `DEC-0040`; keep the session contract Auth.js-compatible for optional later OIDC | ERP roles and scopes remain custom server-side authorization. Raw passwords, TOTP secrets, recovery codes, and session tokens are never stored or logged; `qrcode` renders the local authenticator enrollment URI only. |
| Authorization | Custom RBAC + scoped assignments | Role controls capability; assignments control tenant/company/brand/location/department/project reach. |
| Background jobs | Deferred Redis + BullMQ capability | Not included in the current Phase I / Phase 1.5 release. Current release uses in-app notifications and manual reminder scans without worker, scheduler, Redis, or queue-dependent acceptance criteria. |
| File storage and malware scanning | Provider-neutral `ObjectStorageAdapter` and `MalwareScanAdapter`; dedicated internal storage broker plus private ClamAV on the same Hostinger VPS under `DEC-0046` | Broker-exclusive absolute private bind mount and versioned AES-256-GCM key; application-proxied streaming; opaque immutable key/version; PostgreSQL authorization, idempotency, quota, quarantine, CAS, and audit; private `INSTREAM` scanning; bounded systemd reconciliation; independent encrypted backup and paired restore proof. Same-VPS storage is not WORM/Object Lock. |
| Reverse proxy | Caddy | TLS termination, domain routing, and proxying to internal containers. |
| Containers | Docker Compose | Separate services, volumes, internal networking, repeatable deployments. |
| Testing | Vitest + Playwright | Unit/integration testing plus end-to-end tests for critical Phase I workflows. |
| Observability | Structured application logs, health checks, error monitoring | Start with server logs and health endpoints; add an error-tracking provider before production go-live. |
| CI/CD | GitHub Actions + controlled SSH/Compose deployment | Build, test, and deploy only after staging validation. |

---

## 3. Application boundary

### 3.1 Web application (`apps/web`)

Owns:

- Modern SaaS application shell and responsive pages
- Authentication/session entry points
- API route handlers and server actions
- Domain-service invocation
- Scoped dashboards, tables, forms, attachment UI, and approval UI

Does not own:

- Direct unvalidated database writes from client components
- Background schedules or retry loops
- Separate duplicated business rules inside pages

### 3.2 Background worker (`apps/worker`) — deferred

The worker package is a future capability and is not required for the current Phase I / Phase 1.5 no-queueing release. It may own these concerns only after a separate approved technical decision activates worker/Redis scope:

- In-app/email notification delivery
- Approval reminders and escalation jobs
- Export and import processing
- Scheduled low-stock and expiry work
- Future integration syncs

### 3.3 Database package (`packages/database`)

Owns:

- Prisma schema and migration history
- Database client and shared query primitives
- Seed and test-data tools
- Transaction helpers for workflow and ledger posting

### 3.4 UI package (`packages/ui`, created when shared components justify it)

Owns:

- Design-token-based reusable primitives
- Table, status pill, form, activity timeline, drawer, modal, and layout patterns
- Accessibility and responsive behavior shared by the web application

Do not create the package merely as an empty abstraction. Start it once at least two areas share a stable component pattern.

---

## 4. Deployment topology

### 4.1 Local development

Local development happens in VS Code using Git, Docker Desktop or Docker Engine, and the monorepo.

- Web runs with development reload.
- PostgreSQL and local-private/MinIO-compatible storage may run in local containers. The local adapter is not a production fallback. Redis is optional and only needed when a future approved worker/queue scope is active.
- Use fake/test email delivery locally.
- Use synthetic seed data, never copied production data unless formally anonymized.

### 4.2 Staging

Create a separate staging deployment before production:

```text
staging-erp.<approved-domain>
```

Staging must have a separate database, evidence bind mount, evidence encryption key/version, broker identity, ClamAV instance or isolated scan boundary, credentials, and environment file from production. It may share a sufficiently sized VPS initially, but application services, mounts, secrets, and volumes must remain isolated. If a future approved release activates Redis, staging must also use a separate Redis namespace or instance.

### 4.3 Production

```text
erp.<approved-domain>
```

Production services are private except Caddy’s HTTPS entry points. PostgreSQL, the evidence broker, and ClamAV must not be exposed publicly. Evidence upload and download bytes are streamed through the authorized application path; clients never receive filesystem paths or broker/scanner access. If a future approved release activates Redis or workers, Redis and internal worker ports must also remain private.

---

## 5. Hostinger VPS baseline

The initial Hostinger VPS is appropriate for a controlled first rollout if it is secured, backed up, and not used as a test server for unfinished code.

Initial service layout:

```text
Caddy
├── ogfi-erp-web
├── postgres
├── evidence storage broker with exclusive private bind mount
├── private ClamAV scanner with no evidence mount
├── bounded systemd scan-reconciliation timer
└── backup process
```

Required practices:

- Ubuntu LTS image or equivalent supported server OS.
- Docker Engine and Docker Compose plugin installed.
- SSH key access only; disable password login after recovery access is confirmed.
- Firewall permits only SSH from trusted IPs plus HTTP/HTTPS.
- Database ports are private to the Docker network. Future approved Redis ports must also remain private.
- Production database and evidence backups run automatically and are provider-managed or copied to an independently recoverable encrypted destination outside the VPS/disk failure domain.
- Staging is separate from production at the environment, database, volume, and domain level.
- Never commit `.env` files, production credentials, private keys, backups, or attachment exports to Git.

---

## 6. Data, security, and operational decisions

- PostgreSQL stores structured business data, audit references, and attachment metadata; it does not store the attachment binaries.
- Production evidence uses server-issued opaque immutable keys/versions. The application proxies bounded streams to the broker, and only a `CLEAN` ClamAV result tied to the exact version and an accepted signature-freshness state may enter PostgreSQL clean/available state.
- PostgreSQL is authoritative for source-record authorization, idempotency, quota, quarantine, leases/retries, compare-and-set release, retention/legal hold, and audit. A bounded systemd timer reconciles pending scans; detached post-response work, Redis, and a queue are not used for this release.
- Evidence bytes are encrypted with AES-256-GCM under a versioned broker-only key. Same-VPS filesystem retention is application-enforced and is not WORM or Object Lock; independently recoverable encrypted backup and paired database/evidence restore proof are production gates.
- Root/host compromise and same-disk loss remain honest residual risks of the initial topology. External object storage is reconsidered when capacity, multi-host deployment, stronger RPO/RTO, legal WORM, or tenant scale requires a controlled copy-verify-cutover migration.
- All timestamps are stored in UTC. Operational display defaults to `Asia/Manila` for OGFI.
- Tenant isolation begins in Phase I: tenant/company/scope filtering must be implemented at the database access boundary.
- All controlled workflow actions use service-layer authorization, validation, transaction handling, audit logging, and idempotency protections where retries may occur.
- Inventory ledger posting is atomic and cannot be recreated by browser retries or future worker retries.
- Secrets are injected as environment variables or a future secret manager; they are never placed in source code or client bundles.
- Add health checks for web, database connectivity, and storage connectivity. Future approved worker/Redis scope must add worker and Redis health checks before activation.

---

## 7. Deferred decisions

These do not block Phase I scaffold, but must be finalized before production go-live:

1. Approved production domain and DNS management owner.
2. Email provider and sender domain for notification delivery.
3. Same-VPS evidence activation values under `DEC-0046`: actual VPS size/utilization and headroom; per-tenant/company quota, upload and disk high-water thresholds; encryption-key custody/recovery/rotation; Hostinger daily-backup entitlement, location, encryption, retention, restore granularity, and independence; evidence/database RPO/RTO; retention/legal-hold authority and policy; pinned ClamAV image/digest, resources, signature freshness, and scan limits; recovery procedures; and hosted paired restore proof.
4. Error-monitoring provider and alert recipients.
5. Exact VPS specification and whether staging will use a separate VPS before pilot rollout.
6. Backup destination, retention period, restore owner, and restore-test schedule.
7. Identity rollout: email/password only, Google/Microsoft sign-in, or enterprise SSO later.

---

## 8. Explicit non-decisions

The following are not approved merely because they are technically possible:

- Microservices
- Firebase as the primary transactional database
- Direct database access from browser code
- Direct external exposure of PostgreSQL or Redis
- A separate native mobile app in Phase I
- Multi-tenant billing/subscriptions in Phase I
- Hardcoded approval chains or threshold values

---

## 9. Review trigger

Review this decision when any of the following becomes true:

- Two or more restaurant companies use the production system.
- Background jobs or reporting exhaust the initial VPS capacity.
- POS/accounting/biometric integrations require independently scalable processing.
- Production availability, backups, or compliance needs exceed one-VPS operational safety.
- Evidence capacity, multi-host deployment, stronger RPO/RTO, legal WORM, or tenant scale triggers the external-storage migration review defined by `DEC-0046`.
- The web application needs independent API scaling or public partner APIs.
