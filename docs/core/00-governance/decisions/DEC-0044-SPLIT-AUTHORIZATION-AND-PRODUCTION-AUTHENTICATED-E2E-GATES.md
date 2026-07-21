# DEC-0044 — Split Authorization and Production-Authenticated E2E Gates

## Metadata

- Decision ID: `DEC-0044`
- Title: Split Authorization and Production-Authenticated E2E Gates
- Status: `Confirmed`
- Date: 2026-07-21
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — SPF-001, SPF-004, and SPF-009
- Related decision brief: Parent-confirmed SPF-004 E2E execution-mode decision after material release and security evaluation

## Decision

SPF-004 may close when one exact release-candidate SHA passes the production build, database-backed authorization gates, authorization-manifest checks, and desktop/mobile browser E2E using isolated development-mode fixtures. Authenticated browser E2E against `next start` in production mode remains a mandatory SPF-001 and SPF-009 production-release blocker until the test environment provides ephemeral local-auth password/MFA fixtures and a loopback HTTPS proxy.

Production demo-authentication bypass is prohibited. No test or release workaround may weaken production authentication mode, trusted-origin validation, secure-cookie requirements, session validation, or the fail-closed controls confirmed by `DEC-0040`.

## Context

`DEC-0038` originally required desktop/mobile E2E to run against the built production artifact. After `DEC-0040` introduced the production authentication baseline, the existing browser suite could no longer authenticate safely in production mode: it uses explicit development/test demo identities, while production correctly rejects demo authentication. A production-mode browser run also requires HTTPS for the secure session cookie and trusted-origin controls.

Using a production demo bypass would make the test pass by disabling the exact security behavior the production gate must verify. Blocking SPF-004 on that unavailable authentication fixture would also combine two distinct questions: whether protected ERP surfaces enforce live authorization boundaries, and whether the production authentication/runtime deployment path works end to end.

The confirmed split preserves both controls. SPF-004 remains evidence-based through exact-SHA production compilation, database-backed boundary tests, manifest coverage, and fixture-driven desktop/mobile workflows. SPF-001 and SPF-009 retain the stronger production-mode browser obligation and therefore prevent production release until real local authentication, MFA, HTTPS, origin, cookie, and session behavior are exercised together.

## Options considered

### Option A — selected: split the authorization and production-authenticated browser gates

- Summary: Allow SPF-004 to close from an exact-SHA production build, complete database authorization evidence, manifest verification, and isolated development-mode fixture E2E; retain production-mode authenticated `next start` E2E as an SPF-001/SPF-009 blocker.
- Benefits: Preserves executable authorization and responsive-workflow evidence without weakening production authentication, makes ownership of the remaining environment work explicit, and prevents an authentication-infrastructure dependency from obscuring the SPF-004 authorization result.
- Failure modes: Development-mode E2E could be misrepresented as production-runtime proof; evidence could come from different SHAs; fixture mode could accidentally use non-isolated data; or SPF-004 closure could be misread as production release approval.
- Why selected or rejected: Selected because it preserves all applicable security gates while separating independently verifiable release concerns. The required labeling, exact-SHA binding, isolation, and remaining SPF-001/SPF-009 blockers control the identified failure modes.

### Option B — rejected: enable demo authentication in production-mode E2E

- Summary: Add a production test switch or other bypass so the existing demo identities can sign in to `next start`.
- Benefits: Reuses the current browser fixtures and can make the production-mode run start quickly.
- Failure modes: The test no longer proves production authentication; a bypass can escape into staging or production; secure-cookie, origin, session, password, and MFA defects can be hidden; and `DEC-0040` is violated.
- Why selected or rejected: Rejected because it fails the server-enforced authentication and recovery hard gates. Production demo authentication must continue to fail closed.

### Option C — rejected for SPF-004: block authorization closure until production-authenticated E2E exists

- Summary: Keep SPF-004 open until ephemeral local-auth fixtures and loopback HTTPS allow the complete browser suite to use `next start` in production mode.
- Benefits: Produces one combined browser signal for authorization, authentication, and production runtime.
- Failure modes: Conflates distinct controls, delays acceptance of otherwise complete database authorization evidence, and makes authorization closure depend on deployment-fixture work without increasing the depth of the database boundary checks.
- Why selected or rejected: Rejected as an SPF-004 requirement. The production-authenticated browser run remains mandatory under SPF-001 and SPF-009, so the release cannot bypass it.

### Option D — rejected: remove authenticated browser E2E from the release baseline

- Summary: Rely on production build, unit/integration, and database authorization tests only.
- Benefits: Simplifies CI and avoids authentication fixture and HTTPS setup.
- Failure modes: Production sign-in, MFA, cookies, origin handling, navigation, responsive behavior, and cross-layer integration can fail without executable browser evidence.
- Why selected or rejected: Rejected because it would weaken the production release baseline. Desktop/mobile production-authenticated E2E remains required.

## Hard-gate assessment

- **Tenant and organizational isolation:** SPF-004 database suites continue to require paired allowed/denied cases across applicable tenant, company, brand, location, department, and project boundaries on an isolated database.
- **Server-enforced authorization:** Fixture browser E2E supplements but does not replace database/service/route/evidence authorization gates. Production-authenticated E2E must use the normal server-side authentication and authorization paths.
- **Authentication integrity:** Production mode continues to reject demo authentication. The future production-mode suite must exercise tenant-qualified local credentials, runtime MFA where required, opaque revocable sessions, secure cookies, and trusted origins.
- **Segregation, audit, and transaction controls:** Existing SPF-004 database cases for no-self-action, denial without mutation, audit behavior, concurrency, and live revocation remain mandatory.
- **Exact candidate:** The production build, authorization gates, manifest, and development-mode browser evidence used to close SPF-004 must identify the same release-candidate SHA. Production-authenticated E2E must later identify the exact candidate proposed for production release.
- **Phase scope:** The split changes release-evidence ownership only. It does not change application permissions, authentication policy, business workflow, or source-record authority.
- **Recovery and enforcement:** A missing or failed production-authenticated browser run blocks SPF-001/SPF-009 and production release. It may not be waived by enabling a demo bypass or relaxing cookie/origin/session controls.

## Required safeguards

- Keep `PRODUCTION_DEMO_AUTH_FORBIDDEN` and every production startup/configuration guard fail closed.
- Label Playwright evidence with its execution mode. Development fixture E2E must never be described as production-mode, production-authenticated, or deployment evidence.
- Run fixture E2E only against isolated non-production data with explicit development/test configuration. Do not point the fixture runner at staging or production databases.
- Bind the SPF-004 production build, database authorization attestations, manifest output, and desktop/mobile fixture E2E to one exact commit SHA and retain the hosted evidence.
- Do not weaken HTTPS/trusted-origin checks, `Secure`/`HttpOnly`/`SameSite` cookie behavior, runtime password/MFA verification, session revocation, or current-scope authorization to accommodate automation.
- Build production-mode fixtures with unique ephemeral tenant-qualified usernames, runtime-generated passwords and password verifiers, and runtime-generated TOTP secrets or recovery material. Do not commit reusable credentials, session tokens, TOTP seeds, or recovery codes.
- Run the production-mode suite through a loopback HTTPS proxy to the production `next start` process so browser origin and secure-cookie behavior remain representative. Test setup and teardown must be deterministic, isolated, auditable, and secret-safe.
- Require desktop and mobile coverage for sign-in and the release-critical authenticated journeys, including invalid credentials, required MFA, expired/revoked sessions, secure-cookie/origin rejection, and authorization denial after authentication.
- Keep SPF-001 and SPF-009 open until the production-authenticated exact-SHA evidence is accepted along with their other branch-protection, deployment, restore, rollback, smoke, monitoring, and hypercare requirements.

## Implementation and documentation impact

- Code / architecture: No production application bypass is authorized. CI/test infrastructure must eventually add ephemeral local-auth fixture provisioning and a loopback HTTPS proxy for production-mode `next start` E2E.
- Data / schema: No business schema change. Production-mode test identities and factors must be ephemeral and isolated; teardown must not delete or alter non-test records.
- Workflow / permissions: No permission or business-workflow change. SPF-004 authorization evidence remains database-backed and server-enforced.
- UI / mobile: Development-mode desktop/mobile fixture E2E remains an SPF-004 workflow signal. Production-mode desktop/mobile authenticated journeys remain required before production release.
- Reporting: Release evidence must state the SHA, database/run identifiers, execution mode, result, and artifact reference without exposing fixture secrets.
- Knowledge base / training: No Dunong handoff is required because this decision changes internal verification ownership only and does not change user-facing behavior.
- Tests / UAT: SPF-004 may use development-mode fixture E2E as specified. SPF-001/SPF-009 require production-mode authenticated E2E; neither automated suite replaces applicable formal UAT.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Capture exact-SHA production-build, authorization, manifest, and development-fixture desktop/mobile E2E evidence for SPF-004 | Engineering + QA + Security | Before SPF-004 closure | In progress |
| Provision ephemeral password and MFA fixtures without committed secrets | Engineering + Security + QA | Before SPF-001/SPF-009 closure | Pending |
| Add loopback HTTPS proxy execution for authenticated `next start` desktop/mobile E2E | DevOps + QA | Before SPF-001/SPF-009 closure | Pending |
| Verify production mode still rejects demo auth and enforces origin, cookie, session, MFA, and live authorization controls | Security + QA | Before production release | Pending |
| Capture hosted exact-SHA production-authenticated E2E artifacts and accept them in the release packet | Release Manager | Before production release | Pending |

## Evidence

- Parent Decision Chair confirmed the split-gate conclusion on 2026-07-21 after material decision evaluation; the confirmation expressly rejected a production demo bypass and any weakening of production authentication, origin, or cookie validation.
- `docs/core/00-governance/decisions/DEC-0038-CI-PRODUCTION-BASELINE-GATE.md` — exact-SHA production build, hosted evidence, browser coverage, and branch-protection baseline.
- `docs/core/00-governance/decisions/DEC-0040-PRODUCTION-APPLICATION-AUTHENTICATION.md` — production demo-auth prohibition, tenant-qualified local credentials, runtime MFA, revocable sessions, secure cookies, and same-origin controls.
- `docs/core/00-governance/decisions/DEC-0041-RISK-BASED-EXECUTABLE-AUTHORIZATION-MATRIX.md` — SPF-004 manifest, database boundary, fixture, denial, mutation, and exact-SHA requirements.
- `apps/web/playwright.config.ts` — isolated development-mode desktop/mobile fixture runner.
- `.github/workflows/ci.yml` — exact-SHA production build, database authorization, E2E, manifest, and evidence workflow.
- `apps/web/src/server/services/authentication.ts` — fail-closed production authentication-mode and session controls.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` (`SPF-001`, `SPF-004`, and `SPF-009`).

## Supersession

This decision partially supersedes `DEC-0038` only for the claim that production-artifact browser E2E is required to close SPF-004. All other `DEC-0038` controls remain effective, and production-mode authenticated `next start` E2E remains mandatory for SPF-001, SPF-009, and production release.
