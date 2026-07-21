# Controlled evidence Hostinger production contract

This directory defines the production-only Docker Compose overlay for the temporary Hostinger VPS controlled-evidence design. It is an installation contract, not a deployment. The application, PostgreSQL, and encrypted evidence bytes currently share one VPS disk, so independently administered off-VPS backup and a tested migration path remain mandatory.

## Isolation boundary

- `web` receives only the broker URL and broker shared-auth secret. It has no evidence bind mount and no evidence encryption key.
- `evidence-broker` uses the same immutable application image as `web`, runs only the `evidence:broker` command, owns the evidence bind mount, and is the only service that receives the evidence encryption key.
- The broker command is held by an OS advisory `flock` on `.ogfi-evidence-broker.lock` in the evidence root. A second broker pointed at the same root fails closed, while the kernel releases the lock automatically after a crash or forced termination. The lock file may remain on disk and must not be treated as proof that a process still owns the lock.
- `clamd` receives streamed bytes over the internal `evidence_private` network. It has no host port, evidence mount, database credentials, application environment file, or broker secrets.
- `caddy` has no evidence access. PostgreSQL, MinIO, Redis, and the deferred worker are inactive in this overlay.

The selected ClamAV image must run `clamd` and a reliable `freshclam` update process against the named signature volume. The operator-provided health command must verify both daemon response and acceptable signature age. Threat, unsupported, timeout, stale-signature, size-limit, and indeterminate results stay quarantined; only an exact-version clean result may become available.

## Required operator decisions

No digest, host path, user ID, resource limit, secret path, or image-specific ClamAV path is defaulted. Before rendering the overlay, approve and supply:

- immutable digest references for `OGFI_WEB_IMAGE` and `CLAMAV_IMAGE`;
- an existing absolute `EVIDENCE_HOST_STORAGE_ROOT` outside all release directories, owned by the broker runtime UID/GID with mode `0700`;
- restricted absolute files for the broker versioned JSON keyring and shared secret;
- non-root broker and ClamAV UID:GID values supported by the selected images;
- CPU, memory, PID, tmpfs, log-size, log-count, signature-volume, signature-path, and health-command values;
- application evidence quota, filesystem reserve, disk/inode warning and critical thresholds, backup destination, retention, RPO/RTO, restore owner, and migration trigger.

Do not place the broker encryption key in `.env`. The shared secret is mounted into `web` and the broker as a Compose secret file. The backup process must preserve encrypted object bytes, exact-version/checksum metadata, PostgreSQL state, and separately recoverable key-version inventory.

The broker keyring secret is a restricted JSON file with an `activeKeyId` and a `keys` object. Each key value is exactly 32 random bytes encoded as base64. Retain approved previous key IDs until every referenced version has passed the governed retention and recovery process; never place real key material in configuration examples, logs, or evidence manifests.

## Validation and rendering

Validate the contract with the same non-secret environment values intended for the host:

```text
pnpm evidence:hostinger:validate
docker compose -f docker-compose.yml -f infra/hostinger/evidence/compose.production.yaml config
```

Review the rendered output before deployment. Only `web`, `caddy`, `evidence-broker`, and `clamd` may be active by default. Enabling any profile in production requires a separate reviewed change.

## Reconciliation and operational evidence

Install the templates under `infra/systemd/evidence/` only after the deployment values and service identities have been reviewed. The one-shot reconciliation command uses PostgreSQL advisory locking, row leases, bounded batches, retry/backoff, and auditable terminal manual-review state. Host `flock` is an additional overlap guard, not the correctness boundary.

Before release, prove clean and EICAR results, unavailable/stale signatures, daemon outage, timeout, archive limits, checksum tamper, duplicate/overlapping reconciliation, timer recovery after reboot, evidence persistence across image rollback, disk admission control, encrypted off-VPS backup, and clean-host database-plus-evidence restore.
