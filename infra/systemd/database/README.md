# Database migration and role-verification units

These are installation templates, not deployment automation. They do not decide whether PostgreSQL on the Hostinger VPS is a host service or a dedicated production container. Adapt only the private connection endpoint and reviewed filesystem paths; do not weaken the role boundary.

`ogfi-db-migrate@.service` is now a compatibility tombstone with
`RefuseManualStart=yes` and `/usr/bin/false`. Do not grant a deployment identity
`sudo`, direct controlled-wrapper access, or any standalone migration path. The
amended `DEC-0248` requires a future root-owned `ogfi-release@<opaque-id>` service
to own request admission, the fixed fence, credential-isolated migration,
cutover, served-SHA smoke, rollback, and crash/reboot recovery in one cgroup.

The non-secret role contract remains:

```text
APP_ENV=production
OGFI_DATABASE_NAME=ogfi_erp_production
OGFI_DATABASE_OWNER_ROLE=ogfi_prod_owner
OGFI_DATABASE_MIGRATOR_ROLE=ogfi_prod_migrator
OGFI_DATABASE_RUNTIME_ROLE=ogfi_prod_runtime
OGFI_APPLICATION_ENV_FILE=/srv/ogfi/config/production.env
```

`infra/systemd/tmpfiles.d/ogfi-deploy.conf` defines only future orchestrator
directories: an untrusted upload quarantine, a root-only admitted spool and
journal/state boundary, a root-owned fixed lock inode, and a separately readable
evidence directory. Creating those paths does not authorize or enable release
execution. The admission helper, service, fsync-safe journal, boot recovery,
credential-isolated probes, and external alert path remain pending.

The controlled migration library now loads only the migrator credential plus
non-secret role names. It has no default process runner and cannot execute from
its CLI; a future trusted runner may construct a child environment containing
only `DATABASE_URL` plus locale metadata. The library cannot read the runtime
credential, application environment, credential directory, or unrelated
application secrets. The full
runtime/application identity and append-only verification remains a separate
trusted verifier contract and must be installed outside the candidate execution
boundary before the future orchestrator may be enabled.

`ogfi-db-role-verify.service` and `.timer` are compatibility tombstones too.
The former design loaded both database credentials and ran code from the mutable
`current` release tree, so it must not be installed or enabled. Its replacement
must be root-installed outside candidate trees and split credentials and probes.

After the DEC-0248 orchestrator and credential ceremonies are implemented and
approved, first-use and restore recovery will require a separately authorized
cluster administrator to run `infra/hostinger/postgres/bootstrap-roles.sql`
against a positively identified target. It is not an authorized release command
today. The future procedure must keep traffic stopped until reconciliation proves
the role graph, ownership, ACLs, and complete append-only contract.

`release-staging-deploy.sh` and `release-staging-rollback.sh` intentionally exit
`78` without host mutation until the amended orchestrator is implemented and
accepted. Production remains **NO-GO** until that source exists and installed-
host contention, request replay, credential isolation, immutable image/SHA,
phase fault/reboot recovery, backup/restore, cutover, served-SHA smoke, rollback,
and external alert evidence pass for the exact candidate.

`ogfi-authorization-denial-finalize.service` and its timer run the `DEC-0050` bounded finalizer as `ogfi-runtime` with the runtime-only application environment. The job uses the same compare-and-set service path as lazy rollover, takes a non-blocking host lock, processes at most 100 buckets per transaction by default, stops within a configurable maximum of 55 seconds, opens no port, and receives no owner, migrator, or administrator credential. Install or enable the timer only after the additive bucket migration and application service have passed disposable concurrency, rollover, and recovery rehearsal.

`ogfi-authorization-denial-health.service` performs a bounded indexed lookup for an unfinalized bucket whose window ended more than the configured grace period ago. Its timer runs independently of the finalizer and exits nonzero with one structured `CRITICAL` JSON record when work is overdue, configuration is invalid, or the query fails. Both denial services route systemd failures to `ogfi-authorization-denial-health-alert@.service`, which writes a structured critical signal to the local journal. This is only the host-local signal contract: production installation must connect the journal/unit-failure signal to the approved external alert destination and prove delivery, acknowledgement, and escalation during hosted rehearsal. No external alert transport is selected by these templates.

`ogfi-auth-throttle-cleanup.service` runs the bounded authentication-throttle retention worker with the runtime-only environment. Each reviewed transaction locks an ordered batch with `SKIP LOCKED`; it deletes only `AuthenticationThrottleWindow.retainUntil <= now` rows and legacy `AuthLoginAttempt` rows older than `AUTH_THROTTLE_RETENTION_DAYS`. The database `ENABLE ALWAYS` trigger rejects deletion of an active throttle window independently of the worker. Defaults are 250 rows per batch, 20 batches per data set, and 40 seconds per pass; the unit timeout is 55 seconds. Output is structured counts and timings only and must not contain bucket keys, account identifiers, tenant identifiers, or address hashes.

`ogfi-auth-throttle-health.service` checks cleanup lag, incompatible active keys, database-authoritative ACTIVE/PAUSED and key/policy generation consistency, previous-key overlap, bounded global/shard request and denial pressure, Argon2 saturation/rejection/duration, and aggregate Caddy rejections. The web container reads only Caddy's private aggregate metric at `CADDY_METRICS_URL=http://caddy:2020/metrics`; the host job reads the token-protected aggregate route at `AUTH_RUNTIME_METRICS_URL=http://127.0.0.1:2021/api/internal/authentication-metrics`. Store the same distinct `AUTH_HEALTH_METRICS_TOKEN` of at least 32 bytes in the root-controlled web and health-job environments without printing it or exposing port `2021` beyond loopback. Explicitly calibrate the five `AUTH_THROTTLE_HEALTH_*_THRESHOLD` values before production. Any finding or query/configuration failure emits bounded `CRITICAL` JSON and exits nonzero. Cleanup and health services and timers use `OnFailure=ogfi-auth-throttle-alert@%n.service`; the alert unit records only a host-local journal signal with `hosted_alert_delivery=PENDING`. External delivery, acknowledgement, escalation, and missed-timer proof remain required hosted evidence and are not implemented by these templates.

Throttle control changes are database-fenced operator actions, not environment-only flips. Stage the bounded active/previous key pair, run `pnpm auth-throttle:key-rotation-readiness` for a version only when retiring it completely, then invoke the controlled migrator command with an explicit `AUTH_THROTTLE_CONTROL_EXPECTED_GENERATION` and requested `ACTIVE` or emergency `PAUSED` state. Reservation transactions serialize with that control row; unsafe active/previous identity reuse, unexpired previous generations, and stale expected generations fail closed. Keep the previous key only until the database-recorded overlap expires. If any new-generation reservation exists, do not roll the control row backward—pause admission if necessary and rotate forward at the next reviewed boundary. Install and validate all five throttle units with `systemd-analyze verify`; enable only the cleanup and health timers after hosted token isolation and loopback publication checks pass.

`ogfi-item-option-catalog-health.service` checks the bounded aggregate signals for
the Item option-catalog edge zones and application admission gate. The web
container reads only Caddy's private aggregate metric at
`CADDY_METRICS_URL=http://caddy:2020/metrics`; the host job reads the independently
bearer-protected aggregate route at
`ITEM_OPTION_CATALOG_RUNTIME_METRICS_URL=http://127.0.0.1:2021/api/internal/item-option-catalog-metrics`.
Use the same distinct `AUTH_HEALTH_METRICS_TOKEN` in the root-controlled web and
health-job environments. Explicitly calibrate every
`ITEM_OPTION_CATALOG_HEALTH_*` threshold, `ITEM_OPTION_CATALOG_MAX_IN_FLIGHT`, and
edge window/limit before production. The metrics and journal records are bounded
aggregates: they must not contain source addresses, users, tenants, companies,
queries, selected IDs, or sessions. The health unit and timer route failures to
`ogfi-item-option-catalog-alert@.service`, which is only a host-local journal
signal with `hosted_alert_delivery=PENDING`. Production remains incomplete until
hosted sustained/burst load, shared-NAT fairness, Caddy/application restart,
external alert delivery/acknowledgement/escalation, missed-timer detection, and
rollback are exercised. Validate all three units with `systemd-analyze verify` and
enable only the timer after token isolation and loopback-only port `2021`
publication have been proved.
