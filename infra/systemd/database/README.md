# Database migration and role-verification units

These are installation templates, not deployment automation. They do not decide whether PostgreSQL on the Hostinger VPS is a host service or a dedicated production container. Adapt only the private connection endpoint and reviewed filesystem paths; do not weaken the role boundary.

Install `ogfi-db-migrate@.service` only after creating the dedicated `ogfi-deploy` account, release directories, root-owned credentials, and `/etc/ogfi/database/role-contract.env`. A production example is:

```text
APP_ENV=production
OGFI_DATABASE_NAME=ogfi_erp_production
OGFI_DATABASE_OWNER_ROLE=ogfi_prod_owner
OGFI_DATABASE_MIGRATOR_ROLE=ogfi_prod_migrator
OGFI_DATABASE_RUNTIME_ROLE=ogfi_prod_runtime
OGFI_APPLICATION_ENV_FILE=/srv/ogfi/config/production.env
```

The role-contract environment file contains no URLs or passwords. Store the migrator and runtime URLs as separate root-owned mode-`0400` files under `/etc/ogfi/secrets/`. Keep the application environment root-owned, mode `0640` or stricter, and accessible only to its reviewed runtime group. It contains the runtime URL only; it must not contain `DIRECT_DATABASE_URL`, a migration URL/file variable, an owner/admin secret, or the migrator username. Every controlled migration and scheduled verification fail closed unless that application file still resolves to the reviewed runtime identity. The migration unit receives both credentials only long enough to compare identities, migrate through `session_user=migrator/current_user=owner`, reconcile grants, and verify both effective sessions.

Before first use or after a `--no-owner --no-privileges` restore, a cluster administrator runs `infra/hostinger/postgres/bootstrap-roles.sql` against the exact target. This adopts supported legacy/restored public objects into the non-login owner and resets the role graph to the single reviewed migrator → owner edge. Provision passwords separately, verify a fresh migrator connection assumes the owner through the database-specific role default, and keep application traffic stopped until reconciliation proves schema/object ownership, default privileges, routine/column ACLs, and the complete append-only contract.

Validate installed units with `systemd-analyze verify`. A limited sudo policy may allow the deployment account to start only `ogfi-db-migrate@<validated-release>.service`; it must not grant a shell, arbitrary unit control, credential reads, or database-administrator access. Alert on any migration/verification failure, a missed daily verification, owner/grant drift, or credential-identity collision.

Production remains **NO-GO** until the PostgreSQL packaging/private-network decision, credential custodians, RPO/RTO and backup retention, restore rehearsal, and hosted exact-SHA evidence are approved.
