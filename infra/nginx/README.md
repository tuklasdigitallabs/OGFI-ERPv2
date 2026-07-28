# Shared-VPS Nginx edge contract

This is an installation template for a shared VPS. It adds one exact OGFI
hostname to Nginx and leaves existing sites and their server blocks untouched.
It is not a deployment script and must be rendered with the approved hostname,
certificate paths, Caddy loopback port, and public-address inventory before
installation.

Nginx is the host-level TLS edge because the VPS already serves other sites.
Only the OGFI `server_name` in `ogfi-shared-vps.conf.example` may be changed.
Do not add `default_server`, a wildcard hostname, a broad catch-all, or a
second public upstream. The upstream is the loopback-only Caddy publication
from `infra/hostinger/evidence/compose.production.yaml`.

Nginx overwrites `Forwarded`, `X-Real-IP`, and `X-Forwarded-For` with the
direct public client address. Caddy trusts only the exact Docker bridge CIDR
configured as `OGFI_EDGE_TRUSTED_PROXY_CIDR`, strips those inbound headers at
the application hop, and continues to enforce OGFI authentication and
rate-limit behavior. Do not use `private_ranges` or an unbounded forwarded
chain.

Install validation must include `nginx -t`, a reviewed `nginx -T` capture,
loopback-only port inspection, and an external HTTPS probe for every address
in the controlled public-address inventory. The probe must pass before release
smoke receives credit; a shared-host conflict or an unproven address is a
fail-closed release result.
