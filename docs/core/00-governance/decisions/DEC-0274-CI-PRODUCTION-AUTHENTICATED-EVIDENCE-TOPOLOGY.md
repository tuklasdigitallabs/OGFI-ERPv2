# DEC-0274 — CI Production-Authenticated Evidence Topology

## Metadata

- Decision ID: `DEC-0274`
- Title: CI Production-Authenticated Evidence Topology
- Status: `Confirmed — source implementation complete; hosted exact-SHA evidence pending; production NO-GO`
- Date: 2026-08-06
- Decision owner: Shared Production Foundation / CI verification
- Decision Chair: Parent agent
- Related phase/module: Phase I shared production foundations — SPF-001 and SPF-009
- Related decisions: `DEC-0038`, `DEC-0040`, `DEC-0044`, `DEC-0248`, `DEC-0249`, `DEC-0250`, `DEC-0252`
- Related decision brief: Parent-confirmed Architecture, Security, DevOps, and QA challenge round for the production-authenticated browser harness on Docker Desktop and hosted Linux CI

## Decision

Replace only the CI implementation topology selected in `DEC-0252` with an
isolated shared-network-namespace harness. Nginx owns the namespace and is the
only service that publishes a host port, `127.0.0.1:3443`. Pinned Caddy and the
immutable candidate application join it with
`network_mode: service:nginx`; their loopback listeners at `3101` and `3102`
remain unpublished.

The disposable PostgreSQL service remains on a private, unpublished network.
Only the candidate application receives its runtime-only, nonce-bound database
credential. Neither proxy receives database or authentication secrets. The
browser must use genuine per-run Chromium CA trust and the lane must prove its
topology, trust, header, lifecycle, and teardown boundaries with positive and
negative probes.

This is a CI-only evidence design. Local execution is a preflight and receives
no release-gate credit. A hosted Linux CI pass for the exact candidate SHA is
still required. This decision does not change or supersede the shared-VPS Nginx
topology in `DEC-0250`.

The later private-database lifecycle deliberation selected its own **Option B**
inside this edge topology: a controlled lifecycle container shares the
PostgreSQL network namespace, receives the lifecycle-only administrator URL by
read-only file, publishes a nonce-bound runtime-role handoff and disposable
browser fixture, waits for an authenticated run-bound stop signal, and produces
a teardown receipt. It has no Docker socket. This nested Option B is distinct
from the edge-topology options below; the Nginx-owned edge remains edge Option A.

## Context

`DEC-0252` correctly required a separate exact-SHA, production-classified,
production-authenticated browser lane through Nginx and Caddy. Its original
implementation topology, however, placed the proxies in host networking and
started the application directly on a host loopback port. That topology is not
a sufficiently portable or isolated contract across Docker Desktop and hosted
Linux CI, and it leaves the lane dependent on host-network behavior instead of
one explicitly controlled namespace.

The replacement retains the security purpose and evidence classification of
`DEC-0252`: real password authentication, privileged TOTP MFA, secure cookies,
trusted-origin handling, revocation, server-side authorization, per-run TLS,
disposable data, and deterministic cleanup. It narrows listener publication,
separates database authority from the proxies, and makes direct-port and
wrong-trust negatives executable.

The parent confirmed this conclusion after an independent challenge round.
The requested Code Spark and GPT-5.4-mini subagent models were unavailable in
the active toolset, so GPT-5.6 specialist fallbacks were used. The model
fallback did not relax the deliberation protocol or any hard gate.

## Options considered

### Option A — selected: Nginx-owned shared network namespace

- Summary: Nginx alone publishes `127.0.0.1:3443`; Caddy and the immutable app
  share Nginx's namespace and bind only unpublished loopback ports `3101` and
  `3102`; PostgreSQL remains private and unpublished.
- Benefits: Gives Docker Desktop and hosted Linux the same explicit service
  topology, removes direct host publication of Caddy/app, preserves the
  required Nginx → Caddy → app chain, and supports deterministic negative
  probes.
- Failure modes: Namespace-sharing could accidentally broaden process or
  credential access; an unpublished service could still bind the wrong
  interface; proxy images could drift; teardown could leave network, TLS, or
  data material behind.
- Why selected: It is the smallest topology that is portable, preserves the
  reviewed proxy chain, and makes sole publication and direct-port denial
  verifiable without weakening TLS.

### Option B — rejected: retain host networking from DEC-0252

- Summary: Continue running Nginx and Caddy in host network mode and the app on
  a host loopback port.
- Benefits: Minimal change from the current source harness.
- Failure modes: Docker Desktop and hosted Linux differ in host-network
  behavior; direct listener boundaries are harder to isolate and attest; a
  host-bound app/Caddy port can become an unintended shortcut.
- Why rejected: It does not provide a sufficiently portable, fail-closed
  evidence topology for the required exact-SHA CI gate.

### Option C — rejected: ordinary bridge networking with separately published ports

- Summary: Give each service its own network namespace and publish Nginx,
  Caddy, or app ports for runner access.
- Benefits: Conventional Compose service discovery and simpler individual
  health checks.
- Failure modes: Additional host publications create bypass paths; direct app
  or Caddy access can be mistaken for full-edge evidence; more port mappings
  increase drift between local and CI execution.
- Why rejected: It weakens the sole-entrypoint proof and requires more
  compensating controls than the selected namespace design.

### Option D — rejected: collapse or bypass one proxy

- Summary: Test the app directly or use only Nginx or Caddy.
- Benefits: Lower orchestration cost.
- Failure modes: Does not exercise the reviewed two-hop trusted-header and
  origin boundary; can produce a green browser result for a materially
  different runtime path.
- Why rejected: It is not acceptable evidence under `DEC-0044` and `DEC-0252`.

### Nested private-database lifecycle decision — Option B selected

- Summary: Run PostgreSQL on an internal unpublished network and run a
  separately built, immutable lifecycle container with
  `network_mode: service:postgres`. The lifecycle container performs the
  controlled disposable-database setup and teardown without a Docker socket,
  hands only the nonce-bound runtime database role to the application, creates
  the disposable browser fixture, and accepts only an authenticated stop signal
  bound to the live evidence run.
- Alternatives considered: Host-owned database administration or a privileged
  Docker-socket sidecar would have broadened runner/container authority;
  application-owned administrator credentials would have crossed the runtime
  least-authority boundary. Neither is admitted by the implemented contract.
- Failure modes: Administrator or fixture material could leak through the
  handoff or artifacts; a stale/tampered stop signal could trigger teardown; a
  lifecycle failure could be mistaken for successful cleanup; or container,
  network, exchange, trust, and secret material could survive the job.
- Safeguards: The lifecycle image is immutable and bound to the candidate run;
  the service is read-only, drops all capabilities, runs as the hosted runner's
  numeric UID/GID, mounts only the run-owned exchange and read-only admin-URL
  file, and has no Docker socket. The handoff uses restrictive POSIX ownership
  and modes, an ordered state machine, immutable identity/nonce/container/network
  attestations, an authenticated stop signal, a verified teardown receipt, and
  retained-artifact secret scanning. CI also removes and verifies the database
  and lifecycle containers, private network, exchange, database secret root,
  and per-run Chromium trust before artifact upload is admitted.

## Hard-gate assessment

- **Tenant/company/scope isolation:** The database is run-unique, disposable,
  private, and unpublished. Browser identities and data remain limited to that
  database, and server-enforced denial/no-mutation checks remain mandatory.
- **Server-enforced authorization and authentication:** The candidate uses
  normal password, TOTP MFA, session, revocation, origin, and authorization
  paths. No demo-auth or browser-held authority is introduced.
- **Candidate integrity:** The application is one immutable candidate image;
  Nginx and Caddy are separately pinned immutable images. Evidence must bind
  all three image identities and the test result to the exact candidate SHA.
- **TLS boundary:** The browser trusts only the generated per-run CA through a
  genuine Chromium trust mechanism. TLS verification bypasses are forbidden.
- **Proxy/header boundary:** Only Nginx is host-published. Nginx and Caddy strip
  and replace untrusted forwarding headers according to the existing reviewed
  chain; spoofed-header probes must fail to alter the trusted request identity.
- **Secret isolation:** Only the application receives the nonce-bound database
  credential and application/authentication secrets. Proxies receive only the
  minimum configuration and Nginx's per-run server certificate/private key;
  neither receives database or authentication secrets.
- **Inventory/money integrity:** The lane must retain the existing permitted
  and denied workflow assertions with no unauthorized or duplicate mutation.
  This topology creates no operational approval, inventory, or release
  authority.
- **Recovery/rollback boundary:** Failed lifecycle or cleanup evidence fails the
  lane. This harness does not replace hosted backup, restore, rollback,
  deployment, monitoring, hypercare, or UAT controls.

## Required safeguards

1. Nginx is the only service with a `ports` publication, exactly
   `127.0.0.1:3443`; Caddy and the app use
   `network_mode: service:nginx` and listen only on shared-namespace loopback
   ports `3101` and `3102`.
2. Use separate digest-pinned Nginx and Caddy images and one immutable
   exact-candidate application image. Containers run read-only where supported,
   with `no-new-privileges`, dropped capabilities, bounded temporary filesystems,
   and only explicitly justified capability additions.
3. Keep PostgreSQL on a private, unpublished network. Generate a runtime-only,
   run-unique, nonce-bound database credential and inject it only into the app.
   Do not place database URLs, database passwords, application secrets, auth
   secrets, MFA seeds, or session material in either proxy.
4. Generate a unique CA and leaf certificate for every run. Install trust into
   the Chromium execution context with the supported CA mechanism; do not set
   `ignoreHTTPSErrors`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, or equivalent bypasses.
5. Prove the intended endpoint succeeds with the run CA and fails with an
   unrelated CA. Do not infer Chromium trust from a Node.js HTTPS probe.
6. Prove Caddy/app direct ports are unavailable from the host and browser, and
   that no undeclared host publication exists.
7. Probe spoofed `Forwarded`, `X-Real-IP`, and `X-Forwarded-*` input and verify
   the proxy chain strips/replaces it without granting a trusted origin,
   identity, scope, or authorization result.
8. Verify startup order, health, immutable image identities, candidate SHA,
   production classification, and the exact Nginx → Caddy → app route before
   starting Playwright.
9. On success, failure, cancellation, or timeout, remove containers, shared
   namespace, private network, disposable database/data, runtime credential,
   sessions/MFA fixtures, CA/private key, and temporary configuration. An
   incomplete teardown fails the job.
10. Retain only sanitized evidence: candidate SHA, pinned proxy/app digests,
    run ID, topology/probe conclusions, browser result, and teardown result.
    Secret scanning of retained artifacts is mandatory.
11. Treat Docker Desktop execution as preflight only. SPF-001/SPF-009 credit
    requires the same contract to pass in hosted Linux CI for the exact SHA.

## Implementation and documentation impact

- **Code / architecture:** Replace the CI harness's host-network/process launch
  with the Nginx-owned namespace and immutable app service. Add private database
  networking, runtime-only app credential injection, lifecycle orchestration,
  and required probes. The shared-VPS deployment topology is unchanged.
- **Data / schema:** No business schema change. All database state and auth/MFA
  fixtures remain disposable.
- **Workflow / permissions:** No product permission, approval, or workflow
  change. Existing allowed/denied production-authenticated cases remain
  authoritative.
- **UI / mobile:** No product UI change. Desktop and mobile browser evidence
  remains required.
- **Reporting:** Add machine-readable topology, image, trust-negative,
  direct-port, header, lifecycle, teardown, and artifact-secret-scan results.
- **Knowledge base / training:** No user-visible behavior change; no Dunong
  handoff is required.
- **Tests / UAT:** Update source contracts and execute local preflight, then run
  the same exact-SHA lane in hosted Linux CI. Formal human UAT remains separate.

## Implementation status and evidence boundary

The source implementation now reflects edge Option A plus the nested
private-database lifecycle Option B:

- `.github/workflows/ci.yml` defines a hosted `ubuntu-latest` matrix with
  `production` and `bounded-uat` lanes, immutable candidate/Caddy/lifecycle
  image admission, per-run NSS/Chromium trust, private database startup,
  pre/post-browser secret scans, verified cleanup, and artifact upload only
  after teardown succeeds.
- `infra/ci/production-authenticated-e2e/compose.yaml` gives Nginx the sole
  `127.0.0.1:3443` publication while Caddy and the app share its namespace;
  `compose.database-lifecycle.yaml` keeps PostgreSQL unpublished on an internal
  network and gives the no-Docker-socket lifecycle service only its bounded
  exchange/admin-file mounts.
- The lifecycle/exchange/handoff scripts enforce run, nonce, candidate image,
  lifecycle image, database image/container/network, state-transition,
  runtime-role-only handoff, authenticated-stop, teardown-receipt, and
  artifact-secret boundaries.

The exact Linux source-contract run passed **14/14** on 2026-08-06. A fresh
native Windows run enumerated the same 14 tests with **4 passed / 10 skipped**;
the skips are intentional because native Windows/NTFS cannot prove the required
POSIX ownership and `0700`/`0600` lifecycle contract. A repository under
`/mnt/c` is likewise unsupported for lifecycle proof. The E2E TypeScript project
also passed, and the current worktree completed the optimized Docker web build,
including compilation, lint, TypeScript validation, route generation, static
generation, and final non-root runtime-image assembly. Neither result is browser
or hosted exact-SHA evidence, and no local run receives release credit.

The post-remediation independent Architecture and Security re-reviews both rate
the source implementation **GO**. They separately keep hosted release evidence
**NO-GO** until the exact reviewed SHA completes both hosted Linux lanes with
clean retained evidence and verified teardown. Security records one
non-blocking defense-in-depth follow-up: attest PostgreSQL PID 1 `CapEff=0`
after privilege drop in a future hardening pass.

The remaining hosted evidence matrix is exact and mandatory:

1. Run both CI lanes, `production` and `bounded-uat`, on hosted Linux for the
   exact candidate SHA.
2. In each lane, run both Playwright projects:
   `production-auth-desktop` (Desktop Chrome) and
   `production-auth-mobile` (Pixel 7), using the three admitted specifications:
   the base production-authentication contract, Inventory Pilot Setup Center,
   and the bounded Approval Worklist. Lane/project-specific skips remain only
   where the specifications explicitly constrain a destructive scenario to the
   admitted bounded-UAT desktop run.
3. Retain passing topology, CA-trust/wrong-CA, direct-port, spoofed-header,
   authentication/MFA, authorization/no-mutation, lifecycle, teardown, and
   artifact-secret-scan evidence bound to that SHA for both lanes.

No hosted run, browser result, or uploaded hosted evidence is claimed here.
Hosted deployment/cutover, served-SHA confirmation, backup/restore and
same-fence rollback/recovery rehearsal, monitoring/hypercare, completed named
pilot cohort, formal UAT, signed security/enablement evidence, and owner release
authorization remain separate blockers. SPF-001, SPF-009, the Inventory Control
Pilot, and Phase I therefore remain **NO-GO**.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the Nginx-owned namespace, immutable app service, private database network, runtime credential boundary, and nested Option B lifecycle container. | Engineering / DevOps | Before the next production-authenticated browser run | Source implemented; hosted execution pending |
| Add direct-port, wrong-CA, header-spoofing, lifecycle, teardown, and artifact-secret probes. | Security / QA / DevOps | Before accepting lane evidence | Source implemented; hosted execution pending |
| Run source contracts, E2E type validation, and optimized application build locally without assigning release credit. | Engineering / QA | After source implementation is green | Complete: Linux contracts 14/14, E2E TypeScript pass, optimized Docker web build pass; no browser/release credit |
| Run and retain sanitized passing evidence on hosted Linux CI for the exact candidate SHA. | QA / Release Manager | Before SPF-001/SPF-009 acceptance | Pending |
| Complete hosted deployment, recovery, formal UAT, enablement, and owner signoff separately. | Release / UAT / Operations | Before production GO | Pending; outside this decision |

## Evidence

- `docs/core/00-governance/DECISION_RECORD_TEMPLATE.md`
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- `docs/core/00-governance/DECISION_SCORECARD.md`
- `docs/core/00-governance/decisions/DEC-0044-SPLIT-AUTHORIZATION-AND-PRODUCTION-AUTHENTICATED-E2E-GATES.md`
- `docs/core/00-governance/decisions/DEC-0250-NGINX-SINGLE-HOP-SHARED-VPS-EDGE.md`
- `docs/core/00-governance/decisions/DEC-0252-CI-PRODUCTION-AUTHENTICATED-BROWSER-LANE.md`
- `.github/workflows/ci.yml` — hosted Linux two-lane orchestration, immutable
  image admission, private lifecycle, trust, scans, teardown, and gated upload.
- `infra/ci/production-authenticated-e2e/compose.yaml` — implemented edge
  Option A shared namespace and sole Nginx publication.
- `infra/ci/production-authenticated-e2e/compose.database-lifecycle.yaml` and
  `Dockerfile.database-lifecycle` — implemented nested Option B private
  PostgreSQL lifecycle without Docker-socket access.
- `scripts/production-auth-e2e-private-db-exchange.mjs`,
  `scripts/production-auth-e2e-private-db-handoff.mjs`, and
  `scripts/production-auth-e2e-private-db-lifecycle.mjs` — run-bound handoff,
  hold, authenticated stop, teardown, and receipt contracts.
- `scripts/production-auth-e2e-runner.mjs`,
  `scripts/production-authenticated-e2e-proxy-contract.test.mjs`,
  `scripts/production-auth-e2e-private-db-lifecycle.test.mjs`, and
  `scripts/production-auth-e2e-artifact-secret-scan.test.mjs` — source
  admission/probe/lifecycle/secret-scan evidence; exact Linux run passed 14/14.
- `infra/ci/production-authenticated-e2e/README.md` — CI ownership and explicit
  native Windows/NTFS and `/mnt/c` support boundary.
- Parent-led Architecture, Security, DevOps, and QA challenge round confirmed
  2026-08-06. Code Spark and GPT-5.4-mini were unavailable; permitted GPT-5.6
  specialist fallbacks were used without relaxing hard gates.

## Supersession

This decision supersedes only the CI implementation topology in `DEC-0252`,
including its selection of host networking and host-loopback Caddy/application
listeners. It preserves `DEC-0252`'s exact-SHA, production-authenticated,
two-proxy, disposable-data, real-TLS, evidence-classification, and separate-gate
requirements.

It does not supersede, amend, or authorize the `DEC-0250` shared-VPS Nginx
topology, any public/staging deployment, or any `DEC-0248` release/recovery
action.
