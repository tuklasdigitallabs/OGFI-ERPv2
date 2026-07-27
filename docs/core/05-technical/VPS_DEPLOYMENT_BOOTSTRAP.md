# OGFI ERP — Hostinger VPS Deployment Bootstrap

**Status:** Deployment baseline  
**Scope:** Staging first, then production after acceptance testing

---

## 1. Deployment principle

The Hostinger VPS is the target runtime environment, not the main development environment.

Use this progression:

```text
Local development
→ GitHub branch / pull request
→ Staging deployment
→ UAT and acceptance
→ Production deployment
```

Never test unfinished code directly in production.

---

## 2. Required host setup

Before application deployment:

1. Use a supported long-term-support Linux image.
2. Create a non-root deployment user with SSH key access.
3. Confirm console/recovery access before disabling password authentication.
4. Install Docker Engine and the Docker Compose plugin.
5. Configure a firewall to expose only SSH from trusted sources and HTTP/HTTPS publicly.
6. Keep PostgreSQL, object storage/admin ports, internal health ports, and any future approved worker/Redis ports private.
7. Set up a dedicated deployment directory outside the user home directory if local policy requires it.
8. Create separate environment files, Compose project names, volumes, and domains for staging and production.

---

## 3. Required service boundaries

```text
Public internet
  │
  └── Caddy: 80/443 only
        ├── Docker internal network: web and controlled evidence services
        └── Private PostgreSQL endpoint: host service or separately approved container
```

Rules:

- PostgreSQL must not expose `5432` to the public internet.
- Redis is not required for the current Phase I / Phase 1.5 no-queueing scope. If a future approved release adds Redis, it must not expose `6379` to the public internet.
- Object storage must use private credentials and should not expose an admin console publicly without a reviewed access plan.
- Worker services are not required for the current Phase I / Phase 1.5 no-queueing scope. If a future approved release adds a worker, it is never public.
- Default Compose startup must exclude Redis and worker services for the current release. Use only an explicit future-worker profile after a separate approved technical decision.
- Production deployments must expose only the reverse proxy public ports. PostgreSQL and object-storage administrative ports must stay private to the host/container network or localhost-bound maintenance access.
- Health endpoints must be protected or provide only safe status output.
- Hosted staging and production set `AUTH_TRUSTED_PROXY_MODE=caddy_single_hop`. Caddy removes inbound `Forwarded`, `X-Real-IP`, and `X-Forwarded-For` and supplies exactly one direct-peer `X-Forwarded-For` value. The web container publishes no host port. Do not add a CDN, second proxy hop, or public web port without revisiting this trust contract.

---

## 4. Domain plan

Create separate DNS records and Caddy site entries:

```text
staging-erp.<approved-domain>
erp.<approved-domain>
```

Do not point both environments to the same database, attachment bucket/prefix, environment file, or future approved Redis instance.

---

## 5. Deployment procedure

Hosted deployment, migration, cutover, and rollback are currently **unavailable**
and production is **NO-GO**. The legacy deploy and rollback commands, workflow
jobs, standalone migration unit, direct controlled-migration CLI, and combined-
credential database verifier are fail-closed tombstones. Do not use them as a
release procedure or evidence route.

The next approved procedure must be implemented by the amended `DEC-0248`
root-owned release service and must pass its immutable-artifact, split-
credential, fixed-fence, durable-journal/recovery, exact cutover, smoke,
rollback, backup/restore, and alert-delivery gates before this section can carry
executable operator steps.

### 5.1 PostgreSQL role bootstrap and verification

Install the templates under `infra/systemd/database/` and follow their README. Keep `/etc/ogfi/database/role-contract.env` non-secret, store the migrator/runtime URLs as separate root-owned mode-`0400` files, and keep the application environment root-owned with the runtime `DATABASE_URL` only. The app environment must contain no `DIRECT_DATABASE_URL`, admin/owner credential, migrator credential, or migrator username.

The role bootstrap and reconciliation SQL remain source contracts for the future
release service; they are not a currently approved hosted execution path. The
legacy `ogfi-db-role-verify.service` and timer are disabled because they executed
candidate-controlled code while loading both migrator and runtime credentials.
A future verifier must be root-installed outside the candidate tree, split the
migrator and runtime probes, and prove alert delivery and missed-run handling.

This control does not select PostgreSQL packaging. The database remains on a private Hostinger endpoint whether the approved design is a host service or a dedicated container. Production remains **NO-GO** until that packaging decision, credential custody, restore reconciliation evidence, and exact-release role-contract evidence are approved.

### 5.2 Authentication monitoring and approval-routing cutover

Install the authentication-throttle and authorization-denial health, cleanup, finalization, and alert units from `infra/systemd/database/`. Their environment and bearer-token files must be root-owned mode `0400`; metrics and health endpoints bind only to loopback/private networking. Prove timer overlap protection, restart recovery, missed-run detection, alert delivery, acknowledgement, and escalation before production activation. Calibrate Argon2, edge-rate, database-pressure, and alert thresholds under staged hostile load; the blank production thresholds intentionally fail closed.

Keep `APPROVAL_ROUTING_V1_ENABLED=false` until the controlled migration, approval-routing database suite, dry-run and idempotent apply backfill, zero-blocker report, executable 18-document-type matrix, and authenticated production-mode role-scoped browser smoke test pass for the exact release. Record cutover evidence and an accountable rollback owner, then enable the flag and repeat approval-inbox/action smoke checks. Roll back by disabling the flag; preserve every routing snapshot, approval step, notification, and audit record.

The DEC-0247 producer-barrier migration is currently dormant only. After migration
and after restore, reconcile and verify zero PUBLIC/runtime table or column
privileges on the empty DORMANT generation and protected provenance tables;
attest the shared-lock routine, all six `ENABLE ALWAYS` graph/provenance lock
triggers, and the `ENABLE ALWAYS` owner/replication-resistant insert denials on
both evidence tables; confirm all 18 producer wrappers enter the shared lock
first; and confirm both tables remain empty. The dormant deferred validator placeholders must remain
inert. Do not seed evidence, execute certification, or report
`V1_PRODUCER_BARRIER_READY` or `DRAIN_CLEAN`. Source-transition guards, active
validation and provenance writes, exclusive final-scan locking, Option C, exact
PostgreSQL/hosted/recovery proof, and `DEC-0246` human authority remain mandatory
before activation.

---

## 6. Backup and recovery minimums

Before production go-live, implement and test:

- Daily PostgreSQL logical backups.
- Off-VPS encrypted backup copy.
- Attachment/object-storage backup or replication strategy.
- Retention schedule approved by management.
- Restore test into an isolated environment.
- Post-restore owner/grant reconciliation and `pnpm db:append-only:contract` evidence before traffic resumes.
- Written recovery owner and emergency contact path.

A backup that has never been restored is not a verified recovery plan.

Use `pnpm db:backup` and `pnpm db:restore-check` to produce repeatable PostgreSQL backup and isolated restore-test evidence where the deployment environment has PostgreSQL client tools available (`pg_dump`, `pg_restore`, and `psql`). Store the backup artifact reference, checksum, restore target, restore command output, timing, and approver in the deployment evidence checklist.

---

## 7. Production go-live gate

Do not go live until all of these are true:

- Staging UAT is signed off.
- Critical security controls are active.
- Database and storage backups are proven by restore test.
- Role/scope and approval segregation tests pass.
- Inventory ledger integrity tests pass.
- Domain, TLS, email sender, and alert recipients are confirmed.
- Rollback procedure is documented and the responsible person is available.
