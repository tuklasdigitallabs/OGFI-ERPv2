# Work-in-progress VPS preview

This isolated preview is explicitly non-production. It exists only while the ERP
is under active development and receives no staging or production release
credit. It uses seeded demo identities behind a separate outer Nginx Basic Auth
gate. It must never receive real employee, supplier, financial, inventory, or
evidence data.

The Compose project owns separate PostgreSQL and evidence volumes, publishes no
host ports, and joins the existing `og-inventory_default` network only for the
`staging_erp_web` edge alias. It does not modify or replace `/opt/ogfi-erp`.

Before starting the web service, apply migrations and seed the isolated preview
database. The host environment file must contain only
`OGFI_PREVIEW_DATABASE_PASSWORD` and be mode `0600`. The shared Nginx edge must
use the exact `staging-erp.onegourmetph.com` hostname, TLS, and a separately
generated Basic Auth credential.

Remove this preview or convert it through the controlled release process before
real-user UAT. Demo sign-in, host builds, direct Compose activation, and local
quarantine-only evidence storage are prohibited for production.
