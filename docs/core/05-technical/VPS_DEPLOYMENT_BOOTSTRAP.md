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
        │
        └── Docker internal network
              ├── web
              ├── postgres
              └── object storage
```

Rules:

- PostgreSQL must not expose `5432` to the public internet.
- Redis is not required for the current Phase I / Phase 1.5 no-queueing scope. If a future approved release adds Redis, it must not expose `6379` to the public internet.
- Object storage must use private credentials and should not expose an admin console publicly without a reviewed access plan.
- Worker services are not required for the current Phase I / Phase 1.5 no-queueing scope. If a future approved release adds a worker, it is never public.
- Default Compose startup must exclude Redis and worker services for the current release. Use only an explicit future-worker profile after a separate approved technical decision.
- Production deployments must expose only the reverse proxy public ports. PostgreSQL and object-storage administrative ports must stay private to the host/container network or localhost-bound maintenance access.
- Health endpoints must be protected or provide only safe status output.

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

1. CI checks pass on the release candidate.
2. Build image or pull the approved Git commit on the VPS.
3. Run database migration using the approved migration command.
4. Start or update services with Docker Compose.
5. Run health checks.
6. Perform smoke tests:
   - login;
   - role/scope access;
   - context selection;
   - PR submission;
   - approval action;
   - audit event creation;
   - report/export access;
   - attachment upload/download as allowed.
7. Watch logs and error monitoring after deployment.
8. Record release version, migration version, deployer, timestamp, and any rollback plan.

---

## 6. Backup and recovery minimums

Before production go-live, implement and test:

- Daily PostgreSQL logical backups.
- Off-VPS encrypted backup copy.
- Attachment/object-storage backup or replication strategy.
- Retention schedule approved by management.
- Restore test into an isolated environment.
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
