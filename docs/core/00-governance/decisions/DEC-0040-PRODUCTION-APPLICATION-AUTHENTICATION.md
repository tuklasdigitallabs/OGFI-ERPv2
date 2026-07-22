# DEC-0040 — Production Application Authentication

## Metadata

- Decision ID: `DEC-0040`
- Title: Production Application Authentication
- Status: `Confirmed`
- Date: 2026-07-21
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — SPF-003 production authentication and session control
- Related decision brief: Parent-confirmed SPF-003 decision after independent Security, Architecture, and Operations review

## Decision

Use **application-managed, tenant-qualified username/password authentication**, **runtime TOTP enforcement for privileged users and privileged actions**, and **opaque, PostgreSQL-backed, server-revocable sessions** for the production baseline. A future OIDC integration may be added as another verified sign-in method linked to the same ERP user and authorization model; it does not replace ERP-side tenancy, scope, session-revocation, MFA, or audit controls.

Email-only demo authentication is prohibited outside explicitly isolated development and test environments. Production and production-like environments must fail closed if demo authentication is enabled or if the production authentication prerequisites are incomplete.

## Context

The current demo sign-in path identifies a seeded user by email and issues locally interpreted session evidence. That is useful for isolated development and automated tests, but it does not provide a production password verifier, a real runtime second factor, durable server-side session lifecycle, or immediate revocation of every active session.

OGFI ERP requires tenant-safe identity resolution and prompt authority removal across a multi-company, multi-brand, multi-location system. Privileged role/scope changes, deactivation, break-glass activity, and sensitive financial or inventory actions cannot depend on a browser-held assertion or an evidence-only MFA register. The production baseline must work without requiring an enterprise identity provider while leaving a controlled path to add OIDC for customers that later require it.

The independent Security, Architecture, and Operations reviews unanimously recommended the selected option. This agreement is supporting evidence, not a vote: the Decision Chair separately confirmed that the option passes the applicable hard gates. The requested Code Spark and GPT-5.4 review models were unavailable in the active agent environment, so the closest permitted specialist agents were used; that execution fallback did not relax review scope or any hard gate.

## Options considered

### Option A — selected: application-managed credentials, runtime TOTP, and database sessions

- Summary: Resolve the login identity by tenant plus normalized username, verify a modern password hash, require runtime TOTP for privileged users and fresh TOTP step-up for configured privileged actions, and issue a high-entropy opaque session whose authoritative state is stored in PostgreSQL and can be revoked immediately.
- Benefits: Works for the initial self-hosted production deployment, avoids dependency on a customer identity provider, prevents global-username ambiguity across tenants, supports server-authoritative revocation and audit, and preserves an additive path to enterprise federation.
- Failure modes: Tenant enumeration, weak credential provisioning or recovery, brute-force and credential-stuffing attacks, TOTP seed or recovery-factor compromise, replay within an accepted TOTP window, stolen session cookies, fixation, stale privileges, excessive session lifetime, database/session-store outage, or an OIDC addition that accidentally creates a second ERP identity or bypasses local authorization.
- Why selected or rejected: Selected because it fits the approved modular-monolith and PostgreSQL baseline and can satisfy tenancy, runtime MFA, revocation, audit, recovery, and deployment-control gates without making an external provider a production prerequisite.

### Option B — rejected for the baseline: require OIDC as the only production sign-in method

- Summary: Delegate primary authentication and MFA to a selected OIDC provider from the first production release.
- Benefits: Can centralize customer identity lifecycle, conditional access, and enterprise SSO when a supported provider and operating model are available.
- Failure modes: Provider selection and tenant onboarding become release blockers; provider outage or configuration drift can lock out operations; subject/email mapping can merge or duplicate users; external logout may not revoke ERP sessions; and provider claims may be mistaken for ERP role or scope authority.
- Why selected or rejected: Rejected as the mandatory baseline because no production identity provider and operating contract are confirmed. OIDC remains an additive future method only after a separate reviewed integration preserves the controls in this record.

### Option C — rejected: managed authentication service or passwordless-only baseline

- Summary: Use a third-party hosted authentication service, magic links, or another passwordless mechanism as the initial required path.
- Benefits: Could reduce local credential implementation and provide packaged authentication features.
- Failure modes: Introduces an unapproved provider and dependency, delivery channel and account-recovery risks, tenant-mapping ambiguity, portability and operating-cost concerns, and the possibility that provider sessions or claims bypass ERP revocation and authorization.
- Why selected or rejected: Rejected because it introduces a new unapproved production dependency without eliminating ERP-side identity, scope, session, and audit responsibilities.

### Option D — rejected: retain email-only demo authentication or defer production authentication

- Summary: Continue selecting a user by email and rely on the current demo session mechanism while postponing the production identity stack.
- Benefits: Lowest immediate implementation effort and convenient seeded demonstrations.
- Failure modes: Account impersonation without a secret, tenant ambiguity or enumeration, no runtime MFA, weak revocation, accidental production exposure, and no credible authentication evidence for privileged or controlled actions.
- Why selected or rejected: Rejected because it fails the server-enforced authentication, tenant-isolation, audit, and recovery gates. It is permitted only in isolated development/test with explicit enablement and non-production data.

## Hard-gate assessment

- **Tenant isolation:** Authentication must resolve a normalized username only inside an explicit, server-resolved tenant context. Error behavior must not reveal whether a tenant or username exists. A session must be bound to one user and tenant; company, brand, location, department, and project access continues to be resolved server-side from current assignments.
- **Server-enforced authorization:** Successful authentication proves identity, not authority. Every protected request must load authoritative session state and current ERP role/scope data or a safely invalidated version thereof. TOTP, OIDC claims, cookies, and UI visibility never grant ERP permissions by themselves.
- **Privilege and segregation controls:** Privileged users must complete runtime TOTP as configured, and configured privileged actions require a fresh server-verified TOTP step-up. MFA evidence records alone do not satisfy the runtime challenge. Authentication must not permit self-approval, self-grant, or other segregation-of-duties bypasses.
- **Revocation and stale authority:** Deactivation, password reset, credential compromise, sensitive role/scope change, break-glass change, and administrator revocation must be able to invalidate affected PostgreSQL sessions promptly. A stale cookie must not remain authoritative after its session is revoked or its privilege version no longer matches.
- **Auditability:** Credential, TOTP, session, and OIDC lifecycle events must emit tenant-qualified, user-safe audit evidence without recording passwords, raw session tokens, TOTP secrets, recovery factors, or unnecessary personal data.
- **Transactional consistency:** Session rotation and privilege-changing workflows must not leave two unintended authoritative states. Credential, MFA, and identity-link changes require reviewed transaction boundaries, uniqueness constraints, and concurrency handling.
- **Phase and architecture fit:** The option uses the approved Next.js/service-layer, PostgreSQL, Prisma, and Auth.js-compatible session direction. It does not introduce another authorization model or make future OIDC part of the current baseline.
- **Recovery and rollback:** Credential enrollment, TOTP activation, session rollout, and demo-auth retirement must be staged and reversible at the application layer without deleting user, role, scope, or audit history. Rollback must never restore email-only authentication in production.

## Required safeguards

- Require an explicit tenant identifier or an equally unambiguous server-owned tenant-routing context plus a normalized username. Enforce uniqueness for the normalized username within the tenant, not as an accidental global identity rule.
- Hash passwords with Argon2id or an approved equivalent using reviewed parameters and per-password salts. Never store or log plaintext passwords, raw reset credentials, TOTP seeds, recovery factors, or session tokens.
- Protect login, password reset/recovery, TOTP enrollment/verification, and session endpoints against brute force and enumeration with uniform user-safe responses, server-side throttling, auditable security events, and alerting thresholds.
- Encrypt TOTP secrets at rest using a production secret/key-management mechanism separate from the database; limit decryption to the authentication service path. Enrollment must require a verified challenge before activation, and replay within the accepted timestep must be prevented for privileged action confirmation.
- Define the privileged-user and privileged-action catalog from authoritative permissions and security policy. Require a fresh runtime TOTP challenge for configured sensitive actions; an enrollment attestation or previously stored evidence is not a challenge substitute.
- Generate high-entropy opaque session tokens. Store only a non-reversible token verifier/digest in PostgreSQL where practicable; set cookies `Secure`, `HttpOnly`, and an appropriate `SameSite` value, and rotate the session identifier after sign-in, MFA completion, privilege changes, and other security-sensitive transitions.
- Store server-authoritative session lifecycle metadata, including tenant/user binding, issued and activity times, absolute/inactivity expiry, revocation state/reason/time, and privilege version or equivalent stale-authority check. Do not place authoritative permission/scope lists in the cookie.
- Revoke sessions on user deactivation, password or MFA reset, credential compromise, sensitive role/scope changes, and controlled administrator action. Revoke or rotate all pre-authentication and partially authenticated session state when authentication fails or completes.
- Fail closed when PostgreSQL session state cannot be validated. Health checks and monitoring must distinguish authentication/session-store failure without exposing identity details.
- Enforce CSRF protection on browser mutations, safe redirect handling, cache controls on authentication responses, trusted-proxy/TLS configuration, secret rotation procedures, and sanitized structured logging.
- Isolate demo authentication behind explicit development/test configuration. Production builds, startup checks, deployment verification, and CI policy tests must reject demo authentication in production or production-like environments.
- Add future OIDC only through a reviewed identity-link model using stable issuer plus subject identifiers and verified tenant association. OIDC must create the same revocable local session, apply runtime step-up where required, and continue to resolve all ERP authorization server-side. Email alone must not link accounts.
- Provide a controlled, audited break-glass and recovery process that does not bypass tenant isolation, time limits, separate review, runtime MFA expectations, or post-use session revocation.

## Implementation and documentation impact

- Code / architecture: Replace the production demo-session path with credential verification, TOTP enrollment/challenge/step-up services, opaque server-side session creation/rotation/revocation, and environment fail-closed guards. Keep authentication entry points separate from ERP authorization services.
- Current implementation integrity note (2026-07-22): authentication mutations use the canonical row-lock order `User` then `AuthSession` then `MfaAuthenticator`; recovery and enrollment paths follow the same order when those records are involved. Operator throttle-control transitions retry at most three times, and only for the reviewed transient PostgreSQL/Prisma conditions `P2034`, `P2028`, SQLSTATE `40001`, or SQLSTATE `40P01`. The application-level `AUTH_THROTTLE_CONTROL_GENERATION_CONFLICT` compare-and-set result is never retried. This bounded handling does not replace hosted load, starvation, or recovery evidence.
- Data / schema: Add tenant-qualified credential identity, password-verifier metadata, protected TOTP enrollment state, session records, revocation/rotation lineage as needed, and future external-identity links. Apply tenant-scoped uniqueness, expiry/revocation indexes, foreign keys, and non-destructive migration rules. Update the data dictionary with the confirmed business fields.
- Workflow / permissions: Map privileged-user and privileged-action enforcement to authoritative permission/security configuration. Preserve existing no-self-approval, role/scope, privilege-epoch, invalidation, and break-glass controls.
- UI / mobile: Replace demo identity selection with tenant/username/password sign-in and focused TOTP enrollment/challenge/recovery states. Provide clear expired, revoked, locked/rate-limited, invalid-credential, required-step-up, and unavailable-service states without account enumeration.
- Reporting: Add security-operational reporting or monitored metrics for failed authentication, lock/rate-limit events, TOTP enrollment and recovery, active/revoked sessions, privileged challenges, and suspected compromise, with tenant-safe access and retention.
- Knowledge base / training: Dunong handoff is required before production rollout for sign-in, TOTP enrollment and recovery, session management, privileged step-up, support escalation, and the future OIDC experience when implemented.
- Tests / UAT: Add unit, integration, security, concurrency, migration, deployment-policy, desktop, tablet, and mobile tests covering the safeguards and acceptance cases below.

## Migration and rollback

- Introduce credential, TOTP, and session schema through reviewed additive migrations with rollback considerations and data-dictionary updates. Do not destructively transform or delete existing `User`, assignment, invalidation, or audit records.
- Inventory every intended production user by tenant, normalize and collision-check usernames, and require controlled credential provisioning or activation. Demo email identity is not a password and must not be migrated as authentication proof.
- Require privileged users to complete verified TOTP enrollment before privileged production access. Establish and test the approved recovery/break-glass path before enforcement begins.
- Deploy environment guards and the new session validator before enabling production authentication; revoke demo/pre-cutover sessions at cutover and verify that stale cookies fail.
- Use a staged enablement plan with tested support access and rollback checkpoints. If the new path fails, roll back the application only to a compatible version while retaining additive data and audit history, revoke affected sessions, correct forward where possible, and use the controlled break-glass procedure for necessary recovery.
- Never roll back by enabling email-only demo authentication in production, weakening tenant qualification, disabling runtime TOTP for privileged use, or accepting browser-held authority. A schema reversal that could discard credential, session, or audit evidence requires a separate approved recovery decision.

## Required safeguards and tests

- Prove identical usernames in different tenants authenticate only within their intended tenant and that cross-tenant credentials, sessions, user IDs, reset artifacts, and OIDC links are denied.
- Prove username/tenant enumeration resistance and throttling across valid, invalid, disabled, and unknown accounts.
- Verify correct and incorrect password handling, approved password-hash parameters, reset/recovery invalidation, and no secret leakage in logs, errors, traces, analytics, or database fixtures.
- Verify TOTP enrollment activation, clock-window behavior, replay rejection for privileged action confirmation, missing/invalid/revoked factor denial, recovery, and fresh step-up enforcement for every configured privileged action.
- Verify session entropy, cookie attributes, fixation prevention, rotation, inactivity and absolute expiry, logout, administrator revocation, deactivation, password/MFA reset, privilege-change invalidation, concurrent revocation, and fail-closed database outage behavior.
- Verify that authentication never bypasses service-layer role, company, brand, location, department, project, segregation-of-duties, inventory, or audit controls.
- Verify production and production-like builds/startup reject demo authentication and that demo fixtures cannot authenticate against production data.
- Run migration rehearsal from representative existing users and sessions; prove username collision handling, non-destructive preservation of users/assignments/audit, revocation of pre-cutover sessions, idempotent migration, and a compatible rollback/forward-fix path.
- Verify future OIDC contract tests, when introduced, for issuer/subject uniqueness, tenant binding, account-link takeover resistance, local-session revocation, logout semantics, and runtime TOTP/step-up policy.
- Complete role-based UAT for ordinary users, privileged users, tenant administrators, support/recovery operators, and mobile users, including denied, expired, revoked, recovery, and service-unavailable states.

## Open operational policy items

These items do not reopen the architecture choice, but the accountable owners must confirm them before production enablement. Until confirmed, implementation must use conservative configurable defaults and release readiness must identify any unresolved blocker or accepted residual risk.

| Policy item | Required owner | Due / trigger | Status |
|---|---|---|---|
| Username format, case normalization, reserved names, rename/reuse rules, and tenant-routing/user-discovery support procedure | Product + IT + Security | Before credential migration | Open |
| Password length/quality, compromise screening, change/reset, initial activation, and support-assisted recovery policy | Security + IT | Before production credential provisioning | Open |
| TOTP issuer label, accepted clock window, device replacement, recovery factors/codes, lost-device handling, and administrative reset approvals | Security + IT | Before privileged enrollment | Open |
| Exact privileged-user permission catalog, privileged-action catalog, and step-up freshness/retry window | Security + Product owners | Before runtime TOTP enforcement | Open |
| Session inactivity timeout, absolute lifetime, concurrency/device limits, remembered-device prohibition or allowance, and user-visible session termination | Security + Operations | Before production session enablement | Open |
| Authentication throttling thresholds, monitoring alerts, incident response, audit/security-event retention, and database session cleanup schedule | Security + Operations | Before production readiness approval | Open |
| Credential/TOTP encryption-key custody, rotation, backup/restore, disaster recovery, and break-glass custody | IT + Security | Before production secrets are created | Open |
| Future OIDC provider selection, tenant federation ownership, account-linking/provisioning/deprovisioning, assurance mapping, and provider/local-MFA interaction | IT + Security + Product Governance | Before any OIDC pilot | Deferred |

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the tenant-qualified credential, runtime TOTP, and PostgreSQL session foundation behind fail-closed environment controls | Engineering | SPF-003 implementation | Complete 2026-07-21 |
| Add reviewed schema migration, rollback notes, and data-dictionary entries | Database Engineering + Mithi | With implementation | Complete; approved for rehearsal 2026-07-21 |
| Confirm the open operational policy items and expose only approved configurable values | Security + IT + Product/Operations owners | Before production enablement | Pending |
| Execute security review, migration rehearsal, automated tests, responsive UAT, and production-like deployment verification | Security + QA + DevOps + Release | Before SPF-003 closure | Pending |
| Prepare role-based user help and training for sign-in, TOTP, recovery, sessions, and support escalation | Dunong | Before production rollout | Knowledge-base complete; role-based training/UAT handoff pending |
| Deliberate and record the OIDC integration contract if a provider is proposed | Decision Chair + Security + Architecture | Before OIDC implementation | Deferred |

## Evidence

- Parent Decision Chair confirmed the selected production authentication architecture on 2026-07-21 after unanimous independent Security, Architecture, and Operations review.
- The review used the closest permitted specialist agents because the requested Code Spark and GPT-5.4 models were unavailable in the active agent environment. Reviewers independently supported tenant-qualified credentials, runtime—not evidence-only—TOTP, opaque revocable PostgreSQL sessions, production prohibition of demo email-only authentication, and additive future OIDC.
- `docs/core/05-technical/SYSTEM_ARCHITECTURE.md` — application-managed identity with secure sessions and optional OIDC/SAML-ready extension; server-side scope architecture.
- `docs/core/05-technical/TECH_STACK_DECISION.md` — Auth.js-compatible server sessions, PostgreSQL, strong password hashing, and custom ERP authorization.
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md` — password hashing, secure cookies, rotation, rate limiting, configurable expiry, prompt revocation, privileged MFA, invalidation, and authentication audit requirements.
- `docs/core/00-governance/NON_FUNCTIONAL_REQUIREMENTS.md` — modern password hashing, configurable session timeout, and sensitive-action reauthentication.
- `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md` (`OD-12`) and `docs/core/00-governance/decisions/DEC-0036-INDUSTRY-STANDARD-CONFIGURABLE-PILOT-DEFAULTS.md` — username/password baseline, privileged MFA, audited break-glass, and future SSO direction.
- Current demo-auth implementation references: `apps/web/src/server/services/context.ts`, `apps/web/src/app/(auth)/sign-in/page.tsx`, and `apps/web/src/app/(auth)/sign-out/route.ts`.

## Supersession

This decision is not superseded. A later decision may add OIDC or replace the primary authentication mechanism only if it explicitly supersedes this record and preserves tenant-safe identity mapping, ERP-side authorization, runtime privileged MFA, server-revocable sessions, auditability, migration, and recovery controls.
