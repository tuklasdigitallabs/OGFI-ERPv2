# OGFI fenced release controller template

This directory is an auditable source input for the confirmed `DEC-0248`
controller. It is **not** a deployable application artifact and must never be
run from a candidate release tree, a deploy-writable path, or a CI checkout.

Before installation, a root-authorized operator must build a separately signed,
digest-pinned controller bundle and install it below a root-only immutable path
such as `/usr/libexec/ogfi-release/<controller-digest>/`. The `current` path in
`ogfi-release@.service` is a root-managed symlink to that verified controller
bundle; a normal release request cannot update it.

The unit is the sole future hosted release authority. It acquires the fixed
nonblocking `/run/ogfi-deploy/release-session.lock` fence before the controller
can consume a request, and holds the fence through its terminal journal state.
The reserved `recovery` instance invokes the same controller and fence after an
interruption. Do not install a second migration, rollback, SSH, workflow, or
direct-wrapper executor.

`incoming` is an untrusted deploy-group submission quarantine. The controller
accepts an incoming request only when its matching approval record is present in
the separate root-only `/var/spool/ogfi-release/approved` spool; the incoming
directory can never authorize its own request.

The source controller currently implements hostile-request admission bound to an
unexpired root approval of the exact canonical candidate, durable legal journal
transitions, and fail-closed maintenance recovery. `ogfi-release-recovery.service`
is a separate root-only boot/start recovery entrypoint that uses the same fixed
fence. It has no migration, snapshot, cutover, Compose, smoke, rollback, or
credential helper implementation, so an admitted request always ends in
maintenance-required state. This is intentional: hosted deployment remains
prohibited until those helpers, their isolated credential mounts, and
installed-host evidence are approved.

Install the accompanying tmpfiles template first. Keep the existing
`release-staging-*` and database migration tombstones disabled until the full
controller and its hosted rehearsal are accepted.
