# Evidence reconciliation timer

These files are installation templates, not an automatic deployment. Copy them to `/etc/systemd/system/` only during a reviewed production deployment, verify the dedicated rootless runtime user and `WorkingDirectory`, run `systemd-analyze verify`, then enable the timer.

The service starts a disposable one-shot `web` image from the Hostinger production overlay and invokes the future `pnpm evidence:scan:reconcile` command. The web image has only the private broker URL and shared-auth secret; it never mounts evidence or receives the broker encryption key. The command must use PostgreSQL advisory locking, row leases, bounded batches, retry/backoff, and auditable terminal manual-review state. Host `flock` is an additional overlap guard only.

The unit has a 45-second timeout and runs every 60 seconds. Do not enable it until hosted measurements show the configured bounded batch completes below that timeout. Alert when the unit fails, times out, misses two intervals, or reports pending-age/max-attempt thresholds.

Production prerequisites:

- the parent package command exists and exits nonzero on systemic failure;
- `evidence-broker` and `clamd` are healthy before the timer is enabled;
- Docker is rootless under the dedicated runtime account; rootful Docker-group membership is not approved by this template;
- logs contain no filenames, object paths, document content, shared secrets, encryption material, or decrypted bytes;
- daemon outage, stale signatures, overlapping timer, expired lease, retry exhaustion, reboot recovery, and manual retry are proven in production-like staging.

## Paired evidence recovery templates

`ogfi-evidence-recovery-stage@.service` is a manual, source-host staging
template. It streams one exported PostgreSQL snapshot through `age`, streams the
encrypted evidence directory through `tar | age`, and encrypts the exact object
inventory without writing a plaintext database dump, evidence archive, or
inventory. The staged receipt is written last and binds the exported PostgreSQL
snapshot time, WAL LSN and snapshot hash; all ciphertext hashes and byte sizes;
evidence object count and bytes; and the key-ID inventory hash. It contains no
broker key material.

The staging unit requires these protected files:

- `/etc/ogfi/secrets/recovery-database-url`: PostgreSQL URL readable only by
  systemd credential loading;
- `/etc/ogfi/evidence-recovery/age-recipient`: the approved recovery recipient
  (public recipient only; the identity/private key must not be on the source
  host);
- `/etc/ogfi/evidence-recovery/<capture>.env`: `EVIDENCE_RECOVERY_STAGE_ROOT`,
  `EVIDENCE_RECOVERY_EVIDENCE_ROOT`, `EVIDENCE_RECOVERY_SOURCE_HOST_ID`, and
  `EVIDENCE_RECOVERY_SOURCE_FAILURE_DOMAIN`;
- `/run/ogfi/evidence-write-freeze.confirmed`: a transient operator-owned
  sentinel created only after evidence intake and key rotation are frozen for
  the capture window, and removed immediately after the unit finishes.

The unit paths are intentionally fixed to `/srv/ogfi/evidence` and
`/var/lib/ogfi/recovery-staging` for least-privilege systemd path controls. If
the reviewed Hostinger layout differs, install a reviewed drop-in that changes
both the environment values and `ReadOnlyPaths` / `ReadWritePaths`. Give
the host `ogfi-evidence` account the same numeric UID:GID configured for the
broker container so it can read the mode-0700 evidence root without weakening
that mode. Give it no access to the broker keyring. Install `age`, PostgreSQL
client tools, and GNU tar from reviewed OS packages, then run
`systemd-analyze verify` before use.

Example manual capture:

```text
systemctl start ogfi-evidence-recovery-stage@2026-07-21.service
```

The result is always `STAGED`. A same-host or same-disk directory is never a
recoverable backup. Transfer the closed set to the approved independent failure
domain without decrypting it. Do not append to or replace its encrypted
components.

`ogfi-evidence-recovery-verify@.service` runs against a full read-back copy at
the independent destination. Its protected environment file supplies
`EVIDENCE_RECOVERY_SET_DIR` and
`EVIDENCE_RECOVERY_DESTINATION_ATTESTATION_FILE`. Start from
`destination-attestation.example.json`; leave `independentFailureDomain` false
until provider/account-owner evidence proves the destination is independently
administered and outside the VPS/disk failure domain. The verifier recalculates
every ciphertext hash and writes `commit-receipt.json` last. That receipt binds
the destination identity and read-back evidence, but its state is deliberately
`TRANSFERRED_UNVERIFIED`.

Neither template can report `RECOVERABLE` or `RESTORE_PROVEN`. Production
activation remains blocked until all of the following are approved and attached
to the release record:

- independent destination entitlement, location, encryption, retention,
  restore granularity, administration, and failure-domain proof;
- separately wrapped and dual-custody escrowed broker keyring recovery proof;
- an isolated restore of the matching PostgreSQL dump and evidence archive;
- reconciliation showing every durable database key/version/checksum exists in
  the restored broker store and can be decrypted with the escrowed key set;
- measured RPO/RTO and a Release Board-approved restore result.

No recovery timer is supplied. Automatically claiming a write freeze or copying
to an unselected same-disk destination would create false backup evidence. Add a
schedule only after the independent destination, transfer mechanism, freeze or
consistent-delta procedure, alerting, retention, and restore rehearsal have been
approved.
