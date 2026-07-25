# DEC-0187 — Authorization manifest lookup-route classification

## Decision

Classify the protected read-only lookup routes for Item Master and procurement
composers as high-risk route handlers with service-enforced authorization. The
Item Master option catalog is tenant/company scoped and is guarded by the live
Core Administration permission plus selected-company Manage scope. Responses
remain bounded and `private, no-store`; invalid input returns a stable 400 and
authorization or lookup failures remain non-disclosing.

The Admin audit export uses the shared export error contract for malformed UUID
filters (`REPORT_EXPORT_ENTITY_ID_INVALID`) rather than constructing a manual
response in the route.

The generated authorization surface baseline is refreshed so newly exported
lookup services and these route handlers are represented rather than silently
drifting.

## Evidence and open gates

The generated manifest now passes its 20/20 structural tests, and the admin
platform integration case invokes the four previously unbound readers under
live permission revocation. The PostgreSQL execution gate remains open because
`DISPOSABLE_DATABASE_ADMIN_URL` is not configured in this environment. The
existing route-matrix test also does not execute `app/api/**`; dedicated API
authorization/isolation/no-mutation evidence remains required before the
authorization gate can pass.

A dedicated lookup-route integration case now covers the three protected lookup
APIs for live permission denial, malformed Item Master input, stable error
contracts, and no audit mutation. It still requires the disposable PostgreSQL
runner before it is release evidence.
