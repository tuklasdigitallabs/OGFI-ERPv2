# DEC-0281 — Trusted Server-Resolved Login Tenant

## Metadata

- Decision ID: `DEC-0281`
- Title: Trusted Server-Resolved Login Tenant
- Status: `Confirmed`
- Implementation state: `Implemented and verified for the current server-configured single-organization deployment`
- Date: 2026-08-11
- Decision owner: OGFI ERP Product Owner
- Decision Chair: Parent agent
- Related phase/module: Shared authentication and tenant routing
- Related decisions: `DEC-0040`, `DEC-0041`, `DEC-0044`
- Related decision brief: Human-confirmed removal of the organization-code field for current OGFI single-organization deployments

## Decision

Current OGFI single-organization deployments will remove organization-code entry
from the anonymous sign-in form. The server will resolve the exact active
`Tenant.loginCode` from trusted deployment configuration using
`AUTH_LOGIN_TENANT_CODE`; a future multi-organization deployment may instead use
an explicitly reviewed, trusted host-to-tenant routing context.

The anonymous login boundary must not list database tenants, offer a public
organization dropdown, or discover a tenant from an email address. Email remains
tenant-qualified identity data and may validly occur in more than one tenant.

## Context

Requiring every OGFI user to type an organization code adds friction when the
served application address already represents one organization. Replacing that
field with a database-populated dropdown would disclose tenant names or codes at
an anonymous boundary. Looking up the tenant from email would be ambiguous where
the same normalized email exists in multiple tenants and could enable account or
tenant discovery.

The change is therefore a routing change, not a change to the identity model.
Authentication must still qualify the normalized email and password check by one
server-resolved tenant before issuing a tenant-bound session.

## Options considered

### Option A — selected: trusted server-resolved tenant

- **Summary:** Resolve one tenant code from `AUTH_LOGIN_TENANT_CODE` for the
  current deployment; permit a future reviewed exact-host mapping without trusting
  browser input or forwarded host data by default.
- **Benefits:** Removes unnecessary input, exposes no tenant catalog, preserves
  tenant-qualified authentication, and behaves deterministically when emails are
  duplicated across tenants.
- **Failure modes:** Missing or stale configuration can prevent login; an unsafe
  host-header implementation could select the wrong tenant; configuration drift
  could route valid credentials to another tenant.
- **Why selected:** It is the smallest reversible change that improves the current
  single-organization login while preserving the authentication hard gates.

### Option B — rejected: public dropdown of database tenants

- **Summary:** Query current tenants and show their names or login codes before
  authentication.
- **Benefits:** Users can select among organizations without remembering a code.
- **Failure modes:** Enumerates customers and tenant status, expands the anonymous
  data surface, leaks organization metadata, and does not establish that the user
  belongs to the selected tenant.
- **Why rejected:** Anonymous tenant enumeration is unnecessary for the confirmed
  deployment model and violates non-disclosure expectations.

### Option C — rejected: infer tenant from email

- **Summary:** Search all tenants for the submitted normalized email and use the
  matching tenant automatically.
- **Benefits:** Requires only email and password from the user.
- **Failure modes:** The same email may exist across tenants; arbitrary-first or
  multi-match handling can authenticate against the wrong tenant, leak account
  existence, or produce distinguishable responses.
- **Why rejected:** Email is not globally unique and must not become a tenant
  discovery key.

### Option D — fallback only: restore explicit organization-code entry

- **Summary:** Keep the existing tenant-qualified login and require the user to
  provide the organization code.
- **Benefits:** Supports multiple tenants on one unpartitioned login address and
  provides a safe rollback for routing configuration failure.
- **Failure modes:** Adds user friction and exposes whether validation/error copy
  accidentally distinguishes tenant, email, or password failures.
- **Why rejected:** Not selected for the current single-organization experience,
  but it remains the permitted application rollback. A public dropdown or
  email-based discovery is not a permitted rollback.

## Hard-gate assessment

- **Tenant isolation:** The authentication query remains constrained by one exact
  active `Tenant.loginCode`; the resulting session remains bound to that tenant.
  No cross-tenant or arbitrary-first fallback is permitted.
- **Server-enforced boundary:** Only trusted server configuration or a separately
  reviewed trusted host mapping may select the tenant. Client fields, query
  parameters, cookies, and untrusted `Host`/forwarded headers cannot override it.
- **Non-enumeration:** Anonymous users receive no tenant list, tenant lookup API,
  or response that reveals whether a tenant, email, or credential exists.
- **Authorization and segregation:** Successful authentication proves identity
  only. Existing live role/scope authorization, privileged MFA, session
  revocation, and segregation-of-duties controls remain unchanged.
- **Audit and secret handling:** Authentication evidence remains tenant-qualified
  and user-safe. Tenant routing configuration must not cause passwords, session
  tokens, or unnecessary identifiers to be logged.
- **Recovery:** `Tenant.loginCode` and the tenant-qualified authentication contract
  remain intact, allowing the explicit organization-code form to be restored
  without data migration if server routing must be rolled back.

## Required safeguards

- `AUTH_LOGIN_TENANT_CODE` must resolve exactly one active tenant. Missing,
  unknown, inactive, or invalid configuration fails closed and must not fall back
  to the first tenant, the only database row, an email search, or a browser value.
- Production and production-like startup/readiness checks must detect absent or
  invalid login-tenant configuration before the sign-in path is declared ready.
- Any future host-based routing requires a separate reviewed exact-host allowlist,
  trusted-proxy boundary, canonical host handling, and rejection of unknown or
  spoofed host/forwarded-host values. It must not dynamically expose the tenant
  catalog.
- Password authentication, throttling, denial audit, MFA continuation, and session
  creation must all use the same resolved tenant context throughout the request.
- Invalid tenant configuration and invalid tenant/email/password combinations
  must use generic user-safe responses with no account- or tenant-existence
  disclosure. Operational diagnostics belong only in protected logs/monitoring.
- Configuration changes require controlled deployment ownership, secret/config
  review, rollback instructions, and a post-deploy authentication smoke test for
  the intended tenant plus a negative cross-tenant test.

## Implementation and documentation impact

- **Code / architecture:** One server-owned login-tenant resolver passes its
  result into the existing tenant-qualified password authentication service.
  The browser-supplied organization code is removed from the current sign-in action
  contract and rendered form.
- **Data / schema:** No schema or migration change. `Tenant.loginCode` remains the
  canonical routing identifier and email uniqueness remains tenant-scoped.
- **Workflow / permissions:** No permission, role, MFA, session, or recovery-policy
  change.
- **UI / mobile:** The anonymous form shows the server-resolved organization as
  read-only context, email and password, plus existing MFA continuation where
  required. It does not show an editable tenant field or tenant dropdown and must
  not suggest that email determines organization membership.
- **Reporting:** No business-report change. Protected operational monitoring must
  identify invalid deployment routing without exposing it through anonymous UI.
- **Knowledge base / training:** Dunong updated sign-in, local-account recovery,
  session reauthentication, and glossary guidance for the verified behavior,
  including deployment-level tenant-routing escalation. Affected users are no
  longer instructed to enter an organization code.
- **Tests / UAT:** Automated coverage verifies resolver context and authentication
  regressions. The deployment smoke verifies the rendered organization context and
  absence of an editable tenant input; the continuing regression contract covers
  resolver configuration, non-enumeration, tenant isolation,
  duplicate-email behavior, throttling/audit consistency, MFA/session tenant
  binding, responsive sign-in UI, deployment readiness, and rollback.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the fail-closed `AUTH_LOGIN_TENANT_CODE` resolver and remove browser tenant input. | Engineering | Before release | Complete 2026-08-11 |
| Add deployment configuration/readiness checks and rollback instructions. | DevOps / Release | Before production-like deployment | Complete for the current deployment 2026-08-11 |
| Execute positive intended-tenant and negative duplicate-email/cross-tenant authentication evidence. | QA / Security | Before release | Complete in focused automated verification 2026-08-11 |
| Update affected sign-in help and troubleshooting content. | Dunong | After UI behavior is verified, before user exposure | Complete 2026-08-11 |

## Required tests

- Prove a valid user signs in only within the tenant named by
  `AUTH_LOGIN_TENANT_CODE`, including password, MFA continuation, and final session
  tenant binding.
- Create the same normalized email in two tenants and prove the configured tenant's
  credential is the only eligible credential; the other tenant's password must not
  authenticate or influence selection.
- Prove missing, blank, malformed, unknown, and inactive configured tenant codes
  fail closed without a database-first or email-derived fallback.
- Prove the anonymous page and routes cannot list tenants or reveal tenant/account
  existence through content, status, timing classification, throttling, or errors.
- Prove client-submitted tenant fields, query parameters, cookies, `Host`, and
  forwarded-host values cannot override configured resolution. If host routing is
  later implemented, replace the host cases with exact allowlist and trusted-proxy
  positive/negative tests.
- Prove existing password throttling, denial audit, privileged MFA, session
  rotation/revocation, and server-side authorization regressions remain green.
- Verify desktop and mobile sign-in states and the permitted explicit-code rollback
  against a compatible application version without changing tenant data.

## Rollback

If trusted tenant resolution is misconfigured or unavailable, restore the prior
explicit organization-code form and server action in a compatible application
release, retain tenant-qualified credential checks, and invalidate incomplete
pre-authentication state as appropriate. Do not modify or delete tenant, identity,
credential, session, assignment, or audit records. Do not roll back to a public
tenant dropdown, email-only tenant discovery, arbitrary-first tenant selection, or
weaker tenant/session qualification.

## Evidence

- Authorized human confirmation supplied to the parent agent on 2026-08-11:
  remove organization-code entry and resolve the current deployment's tenant from
  trusted server context.
- [`DEC-0040-PRODUCTION-APPLICATION-AUTHENTICATION.md`](DEC-0040-PRODUCTION-APPLICATION-AUTHENTICATION.md)
  — tenant-qualified credential authentication, non-enumeration, MFA, revocable
  sessions, and recovery requirements.
- [`DEC-0041-RISK-BASED-EXECUTABLE-AUTHORIZATION-MATRIX.md`](DEC-0041-RISK-BASED-EXECUTABLE-AUTHORIZATION-MATRIX.md)
  — executable tenant and authorization boundary evidence.
- [`DEC-0044-SPLIT-AUTHORIZATION-AND-PRODUCTION-AUTHENTICATED-E2E-GATES.md`](DEC-0044-SPLIT-AUTHORIZATION-AND-PRODUCTION-AUTHENTICATED-E2E-GATES.md)
  — production-authenticated browser evidence expectations.
- Current implementation references reviewed for impact:
  `apps/web/src/app/(auth)/sign-in/page.tsx`,
  `apps/web/src/server/services/authentication.ts`, and
  `apps/web/tests/authenticationDatabase.integration.test.ts`.
- Implementation verification reported by the parent agent on 2026-08-11:
  focused authentication/context tests passed `36/36`; targeted ESLint and the
  full web typecheck passed; the full production image built successfully; and the
  deployed sign-in returned HTTP `200`, rendered the read-only organization
  `One Gourmet Restaurant Group`, and contained no `tenantCode` input.
- Dunong completed the affected user-facing knowledge-base updates on 2026-08-11:
  signing in and selecting a location, activating and recovering local accounts,
  session invalidation and reauthentication, and the glossary.

## Supersession

This record narrows DEC-0040's permitted explicit tenant identifier for current
single-organization deployments to an equally unambiguous server-owned routing
context. It does not supersede tenant-qualified credentials, tenant-bound sessions,
non-enumeration, runtime MFA, revocation, or ERP-side authorization. A public
multi-tenant discovery experience or host-based routing implementation requires a
separate confirmed decision or explicit amendment preserving these controls.
