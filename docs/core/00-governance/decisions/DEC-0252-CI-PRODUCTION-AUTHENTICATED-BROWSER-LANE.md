# DEC-0252 — CI Production-Authenticated Browser Lane

## Metadata

- Decision ID: `DEC-0252`
- Title: CI Production-Authenticated Browser Lane
- Status: `Confirmed — implementation and exact-SHA evidence pending`
- Date: 2026-07-29
- Decision owner: Shared Production Foundation / CI verification
- Decision Chair: Parent agent
- Related phase/module: Phase I shared production foundations — SPF-001 and SPF-009
- Related decisions: `DEC-0038`, `DEC-0040`, `DEC-0044`, `DEC-0248`, `DEC-0249`, `DEC-0250`
- Related decision brief: Parent-confirmed Security, Architecture, DevOps, and QA deliberation on production-authenticated browser evidence

## Decision

Implement a separate exact-SHA, CI-only browser lane that runs the built
application under `next start` in production classification through loopback
Nginx → reviewed/pinned Caddy → application. It creates disposable local
identities at runtime: a branch user and a privileged user that completes
runtime TOTP MFA.

The browser trusts only that run's narrowly scoped test certificate/CA and
must not use `ignoreHTTPSErrors`. This is production-authenticated E2E evidence
for SPF-001 and SPF-009 only. It does not close hosted deployment, backup /
restore, rollback, recovery, monitoring, hypercare, or final UAT.

## Context

`DEC-0044` separated database-backed authorization and development-fixture
browser evidence from the production-authenticated browser requirement. That
requirement remains open because CI must exercise normal password
authentication, privileged MFA, secure cookies, trusted-origin handling,
revocation, and server authorization without a production demo bypass or a
connection to staging/production data.

The selected lane supplies that executable evidence without changing the
production host topology or giving CI hosted-deployment authority. Each run
owns disposable database data, credentials, MFA and TLS material, processes,
and artifacts, then destroys them with sanitized retained evidence.

The council used the closest available GPT-5.6 specialist fallback because
requested Code Spark and GPT-5.4 models were unavailable. This did not relax
any hard gate.

## Options considered

### Option A — selected: isolated exact-SHA production-authenticated CI lane

- Summary: Build the candidate once; start it with production `next start`
  behind run-local loopback Nginx and reviewed/pinned Caddy; generate local
  password/MFA identities; and execute focused desktop/mobile browser checks
  through a run-local trusted certificate chain.
- Benefits: Tests production authentication, MFA, cookie, origin, proxy, and
  authorization paths while keeping data and credentials disposable and binding
  evidence to one exact candidate SHA.
- Failure modes: Broad CA trust, topology drift, secret leakage, incomplete
  teardown, or weak assertions could create misleading evidence.
- Why selected: It tests the required path while preserving CI isolation and
  the separately controlled hosted-release boundary.

### Option B — rejected: production demo authentication or direct app port

- Summary: Reuse demo identities or send the browser directly to the app.
- Benefits: Lower fixture and proxy setup effort.
- Failure modes: Skips real password/MFA, secure-cookie, origin, or proxy
  behavior and can normalize a forbidden production-authentication bypass.
- Why rejected: It violates `DEC-0040` and `DEC-0044`; it is not
  production-authenticated or topology-representative evidence.

### Option C — rejected: staging/shared hosted database or edge

- Summary: Run browser automation against a shared host, data set, or public
  certificate instead of disposable CI infrastructure.
- Benefits: Produces public-host observations with less local harness work.
- Failure modes: Couples tests to mutable hosted state, exposes test identities
  or credentials, may affect other users, and conflates CI with hosted-release
  acceptance.
- Why rejected: It fails isolation, repeatability, evidence classification, and
  least-authority controls. Hosted rehearsal remains separately governed.

### Option D — rejected: development-fixture E2E as the sole browser gate

- Summary: Rely on development-mode checks and database tests.
- Benefits: No new production-mode harness.
- Failure modes: Cannot prove production password/MFA, TLS, secure-cookie,
  origin, proxy, revocation, or runtime integration.
- Why rejected: `DEC-0044` explicitly retains this as an SPF-001/SPF-009
  release blocker.

## Hard-gate assessment

- **Exact candidate/evidence integrity:** Build, processes, report, and
  artifacts identify the same immutable candidate SHA.
- **Authentication/authorization:** Use normal server-side credential, TOTP,
  session, revocation, origin, and authorization paths. No demo-auth,
  browser-held authority, or direct application-port shortcut.
- **Tenant/company/scope isolation:** Identities/data exist only in a
  disposable run-local database. Include an authenticated server-enforced
  authorization denial with no controlled action or mutation.
- **TLS/proxy boundary:** Nginx and Caddy are loopback-only in the reviewed
  two-hop configuration. Browser trust is limited to the run-local certificate;
  certificate verification cannot be disabled.
- **Recovery boundary:** Failure blocks SPF-001/SPF-009 evidence acceptance and
  retains sanitized diagnostics. This lane neither exercises nor substitutes
  DEC-0248/DEC-0250 hosted release, rollback, or recovery.

## Required safeguards

1. Use a distinct CI job and label artifacts `ci-production-authenticated-e2e`
   with candidate SHA, run ID, execution mode, result, and safe references.
2. Build once and run the artifact with `NODE_ENV=production` and `next start`;
   prohibit demo authentication and any production test bypass.
3. Generate unique tenant-qualified branch credentials and unique privileged
   credentials plus a TOTP secret at runtime. Never retain passwords, tokens,
   seeds, recovery material, or private keys in source or artifacts.
4. Generate a per-run CA/certificate limited to the loopback test endpoint.
   Use supported browser CA trust, never `ignoreHTTPSErrors` or broad trust.
5. Bind Nginx, Caddy, and application listeners to loopback-only ephemeral
   ports. Require browser traffic through Nginx then reviewed/pinned Caddy; fail
   for topology drift or direct application-port use.
6. Use a run-unique disposable database. Prohibit staging, production, shared
   preview, and non-test URLs; migrate, seed, and tear down deterministically.
7. Cover desktop/mobile password sign-in; privileged runtime TOTP; secure-cookie
   behavior; rejected origin; invalid/expired/revoked session; server-side
   authorization denial without mutation; and one allowed protected read/action.
8. Redact secrets/identifiers before upload. Teardown revokes/deletes run-local
   identities, sessions, MFA records, processes, TLS material, temporary proxy
   configuration, and database data. Incomplete teardown fails the job.
9. CI receives no staging/production data, host SSH, live edge configuration,
   deployment fence, backup, or recovery authority.

## Required tests and acceptance evidence

1. A hosted CI run for the exact candidate SHA passes after the candidate build.
2. Its machine-readable report proves production classification, `next start`,
   loopback Nginx → pinned Caddy → application routing, candidate SHA,
   run-local database identity, and sanitized teardown result.
3. Desktop/mobile reports prove branch password sign-in and privileged runtime
   TOTP MFA.
4. Assertions prove expected secure-cookie properties, rejected untrusted/
   invalid origin, rejection of revoked/expired session material, and a
   server-enforced authorization denial with no controlled mutation.
5. Certificate-validation negatives prove no `ignoreHTTPSErrors` or broad trust;
   the run-local certificate succeeds only at the intended endpoint.
6. Artifact review confirms no secret, reusable identity material, session token,
   TOTP seed, private key, or raw database connection value was retained.
7. Failure leaves no reusable process, listener, credential, MFA record,
   certificate/private key, or database state; safe diagnostics remain.

## Implementation and documentation impact

- **Code / architecture:** Add CI-only provisioning, production launch,
  run-local TLS/proxy configuration, Playwright CA trust, focused specs, and
  cleanup. No production-auth bypass or hosted edge change is authorized.
- **Data / schema:** No business schema change; use auth/session/MFA schema only
  in the disposable database.
- **Workflow / permissions:** No product authority change. Seed deterministic
  roles/scopes for one allowed and one denied path.
- **UI / mobile:** Verify existing sign-in/MFA and responsive journeys; do not
  claim visible-workspace completeness.
- **Reporting:** Record SHA, run ID, conclusion, topology classification, safe
  artifact links, and cleanup result separately from deployment/recovery/UAT.
- **Knowledge base / training:** No user-visible behavior changes; no Dunong
  handoff is required.
- **Tests / UAT:** A pass supplies only this SPF-001/SPF-009 E2E evidence;
  formal UAT and all other gates remain independently required.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement harness, production launch, run-local TLS, and topology checks. | Engineering / DevOps | Before SPF-001/SPF-009 closure | Pending |
| Add branch-password, privileged-TOTP, cookie, origin, revocation, and denial desktop/mobile specs. | QA / Security / Engineering | Before first lane acceptance | Pending |
| Add secret-safe artifacts and deterministic teardown assertions. | DevOps / Security | Before required CI enablement | Pending |
| Capture/review a passing hosted exact-SHA sanitized evidence packet. | QA / Release Manager | Before SPF-001/SPF-009 acceptance | Pending |
| Complete hosted deployment, backup/restore, rollback, recovery, monitoring, hypercare, and UAT. | DevOps / Release / UAT | Before production GO | Pending; outside this decision |

## Evidence

- `docs/core/00-governance/DECISION_RECORD_TEMPLATE.md`
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- `docs/core/00-governance/decisions/DEC-0038-CI-PRODUCTION-BASELINE-GATE.md`
- `docs/core/00-governance/decisions/DEC-0040-PRODUCTION-APPLICATION-AUTHENTICATION.md`
- `docs/core/00-governance/decisions/DEC-0044-SPLIT-AUTHORIZATION-AND-PRODUCTION-AUTHENTICATED-E2E-GATES.md`
- `docs/core/00-governance/decisions/DEC-0248-SINGLE-HOST-CONTROLLED-DEPLOYMENT-FENCE.md`
- `docs/core/00-governance/decisions/DEC-0249-SERVED-IDENTITY-PROVENANCE-AND-PUBLIC-PROBE-CONTRACT.md`
- `docs/core/00-governance/decisions/DEC-0250-NGINX-SINGLE-HOP-SHARED-VPS-EDGE.md`
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` — SPF-001 and
  SPF-009 remain open pending this evidence and separate requirements.
- Parent-led Security, Architecture, DevOps, and QA deliberation, confirmed
  2026-07-29. Code Spark/GPT-5.4 was unavailable; permitted GPT-5.6 fallback
  was used without relaxing hard gates.

## Supersession

This implements the previously pending CI-harness direction in `DEC-0044`; it
does not supersede its split-gate boundary. It does not supersede or close
DEC-0248, DEC-0249, or DEC-0250 hosted deployment, public-edge,
served-identity, rollback, or recovery obligations.
