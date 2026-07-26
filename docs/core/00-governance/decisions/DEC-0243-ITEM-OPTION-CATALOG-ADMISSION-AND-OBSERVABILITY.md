# DEC-0243 — Item option-catalog admission and observability

## Metadata

- Decision ID: `DEC-0243`
- Title: Protect the authenticated Item option catalog with layered bounded admission and isolated observability
- Status: `Confirmed — local implementation complete; hosted production evidence remains open`
- Date: 2026-07-27
- Decision owner: Phase I Master Data / Item option catalog
- Decision Chair: Parent agent
- Related phase/module: Phase I Master Data / Item Master option selectors and production edge
- Related decisions: `DEC-0140`, `DEC-0149`, `DEC-0187`, `DEC-0239`,
  `DEC-0240`, `DEC-0241`
- Related decision brief: Parent-led Item option-catalog lifecycle and production-readiness deliberation

## Decision

Protect authenticated `GET /api/items/option-catalog` with five coordinated
controls: client request-shaping parity across every consumer; route-specific
Caddy global-then-source rate limits; a bounded, non-queuing application in-flight
gate; exact-zone isolation for authentication metrics plus separate aggregate-only
option-catalog telemetry and health; and no database, Redis, per-user, or other
durable admission state.

Identity-aware limiting is deferred. Reconsider it only when hosted fairness
evidence shows the global/source design is inadequate, or when deployment
topology, role reach, or catalog-consumer expansion changes the risk. All numeric
limit, window, concurrency, timeout, alert, and retry values are staging candidates
only. Production completion requires hosted load, shared-NAT, restart, alert, and
rollback evidence. The route's existing direct authentication, tenant/company
scope authorization, `private, no-store` response policy, bounded validation, and
safe error projection remain mandatory and independent of admission controls.

## Context

The Item option catalog is a bounded read endpoint used by focused Item creation
and UOM-conversion workflows. Authentication and scoped service authorization
already protect direct requests, but an authenticated client can still produce
bursty overlapping searches, and a deliberately abusive or malfunctioning client
can consume database and application capacity. Browser cancellation alone does not
guarantee that work already admitted by the server stops.

The production edge already supports route-specific Caddy rate-limit zones and
Prometheus metrics for authentication controls. Extending those controls without a
decision would create two material risks: unbounded source-label telemetry could
leak or create high-cardinality data, and option-catalog zones could contaminate
the exact authentication health signal. A layered, stateless design is therefore
required before this endpoint can receive a production-completion claim.

This decision does not change Item eligibility, catalog contents, permissions,
tenant/company scope, paging semantics, selected-option retention, or any
inventory or financial workflow.

## Options considered

### Option A — selected: stateless layered admission with isolated telemetry

- Summary: align client debounce/cancellation/stale-response behavior across all
  consumers; run route-specific Caddy global admission before source admission;
  add an immediate, bounded application in-flight gate; isolate authentication
  metrics by an exact zone allowlist; and publish only aggregate option-catalog
  telemetry and health.
- Benefits: suppresses avoidable browser bursts, bounds both edge arrival rate and
  admitted application concurrency, limits dynamic source-zone allocation behind a
  global cap, preserves authentication-signal meaning, avoids a new stateful
  dependency, and remains operationally reversible.
- Failure modes: shared-NAT users can be unfairly throttled; proxy and application
  limits can be tuned inconsistently; a leaked permit can deadlock local capacity;
  retries can synchronize into another burst; per-process gates do not provide a
  cluster-wide ceiling; careless labels can expose source, tenant, user, query, or
  selected IDs; option zones can enter authentication health by broad matching.
- Why selected: it is the smallest design that bounds the request at the client,
  edge, and application layers while retaining the endpoint's existing server-side
  access controls and avoiding durable identity state.

### Option B — rejected for now: identity-aware distributed limiting

- Summary: key admission by authenticated user or tenant and coordinate counters
  through Redis, a database, or another shared state service.
- Benefits: can improve fairness behind shared NAT and can enforce a cluster-wide
  identity quota.
- Failure modes: creates a new stateful availability and privacy boundary; adds
  identity-cardinality and eviction concerns; may turn limiter failure into catalog
  failure; expands migration, secret, backup, monitoring, and rollback obligations;
  and can incorrectly equate identity with authorization or business scope.
- Why rejected: there is no hosted evidence yet that warrants this operational
  cost. It is a reconsideration path, not an approved dormant implementation.

### Option C — rejected: proxy-only rate limiting

- Summary: use only global and source Caddy zones.
- Benefits: simple application code and centralized edge configuration.
- Failure modes: requests admitted within the rate window can still overlap beyond
  safe application/database concurrency; proxy controls do not replace direct-route
  authorization; application instances have no final overload boundary.
- Why rejected: arrival-rate control alone does not bound concurrent server work.

### Option D — rejected: application gate only

- Summary: rely only on an in-process concurrency ceiling.
- Benefits: no edge-zone configuration and low implementation complexity.
- Failure modes: abusive traffic reaches the application, consumes connection and
  runtime capacity, receives no source-aware shaping, and can cause repeated
  immediate rejection while consuming edge-to-app resources.
- Why rejected: it omits the lower-cost edge admission layer and global-before-
  source protection.

### Option E — rejected: defer all admission and rely on browser cancellation

- Summary: retain the current route and client behavior without production
  admission or telemetry changes.
- Benefits: no configuration or runtime work.
- Failure modes: crafted clients bypass browser shaping; cancelled fetches can
  leave admitted server work; overload and unfairness cannot be measured or
  bounded credibly.
- Why rejected: it cannot satisfy the production availability and observability
  gate for this authenticated shared route.

Independent Product, Architecture, Security, Operations, and QA perspectives were
considered under the deliberation protocol. Requested Spark and exact GPT-5.4
specialist models were unavailable; the council used the closest permitted GPT-5.6
specialist fallback. This execution fallback did not broaden scope, replace the
Decision Chair, or relax any hard gate.

## Hard-gate assessment

- Tenant/company/brand/location isolation: admission keys do not grant access or
  alter scope. The route authenticates and validates bounded input first; the Item
  service enforces tenant/company and selected-scope authorization before acquiring
  an application permit. Unauthenticated, malformed, and denied traffic therefore
  cannot consume the protected catalog-work capacity.
- Server authorization: Caddy admission and client shaping are defense-in-depth;
  neither replaces direct-route authentication, permission, or scope checks.
- Approval segregation: not applicable; this endpoint is read-only and does not
  approve money or controlled stock actions.
- Inventory and audit integrity: the option catalog performs no inventory posting,
  balance mutation, or controlled lifecycle write. Admission rejection must not
  create such effects.
- Transactional consistency/idempotency: the endpoint is read-only. Permit acquire
  and release must be exception-safe, with no queue and no permit leak.
- Phase scope: the decision is limited to the Phase I Item option catalog and its
  operational edge/telemetry. It adds no generic API gateway or identity platform.
- Recovery and rollback: client shaping, route zones, application gate, and option
  telemetry are independently removable. Rollback must retain authentication,
  authorization, safe errors, bounded inputs, and no-store behavior.
- Privacy and observability: authentication health consumes an exact authentication-
  zone allowlist only. Option telemetry is aggregate-only and carries no source IP,
  user, tenant, company, query, selected ID, session, or other identity label.

All applicable hard gates pass at decision-design level. Production readiness
does not pass until the required hosted evidence succeeds.

## Required safeguards

- Apply equivalent debounce, cancellation, latest-request-wins/stale-response
  suppression, minimum-query behavior where the existing contract requires it,
  and bounded page-size behavior to every current and future browser consumer.
  Client shaping is usability/load reduction, not a security boundary.
- Match only authenticated `GET /api/items/option-catalog` at Caddy. Execute the
  static global zone before the dynamic source zone so the global bound limits
  source-ring allocation and work.
- Make every production route-limit value a required production configuration
  input. Defaults may support local/staging evaluation but must not silently choose
  production policy.
- Pin the Caddy rate-limit module/build behavior used in production and verify its
  exact rejection contract, including status and `Retry-After`, against the built
  artifact. The current client honors the verified header as a disabled cooldown
  and requires a manual retry, so it has no automated retry burst to jitter. Any
  future automated retry must use bounded jitter and must not create an immediate
  retry loop. Do not claim production
  behavior from documentation or a staging candidate alone.
- Add a process-local in-flight gate after session validation, bounded input
  validation, and server authorization, immediately before catalog database work.
  It must have a fixed positive bound, never queue, reject immediately with stable
  `OPTION_LOOKUP_RATE_LIMITED` plus bounded `Retry-After` when full, and release
  exactly once in a `finally`-equivalent path for success and service error.
- Document that an in-process gate is per application instance. Hosted load must
  evaluate the aggregate ceiling across the deployed replica/process topology.
- Preserve `private, no-store` on successes and safe failures. Never echo limiter
  keys, internal counts, thresholds, source identity, query text, selected IDs,
  stack traces, or database errors.
- Parse authentication rate-limit metrics by exact approved zone names, never by
  prefix, substring, or all-zone aggregation. Unknown and option-catalog zones must
  not affect authentication readiness or alerts.
- Publish option-catalog admission, saturation, rejection, error, and latency
  signals only as bounded aggregate metrics. Health may distinguish layer/reason
  from a fixed allowlist, but must not expose source, user, tenant, company, role,
  query, selected ID, or unbounded error labels.
- Test direct unauthenticated, denied-scope, malformed, valid scoped, stale client,
  edge-global-rejected, edge-source-rejected, application-saturated, service-error,
  and recovery paths. Confirm rejected requests do not reach expensive service
  work and permits return to baseline.
- Run hosted sustained-load and burst tests, shared-NAT fairness tests, application
  and Caddy restart tests, metric-isolation and alert-delivery tests, configuration-
  missing tests, and an exercised rollback before production completion.
- Reopen identity-aware admission only if shared-NAT or hosted fairness evidence
  fails, the route becomes broadly available to materially different roles or
  tenants, external/integration consumers are added, horizontal topology makes the
  per-process ceiling ineffective, or abuse evidence shows the selected keys are
  insufficient.

## Operational cost

- Runtime: two Caddy admission checks per matched request, bounded source-zone
  state, one process-local permit operation, and low-cardinality aggregate metrics.
- Operations: required production variables, pinned Caddy build verification,
  capacity tuning per replica topology, dashboards/alerts, hosted load and shared-
  NAT exercises, restart evidence, and rollback rehearsal.
- Support: operators must distinguish edge global rejection, edge source rejection,
  application saturation, and ordinary route/service unavailability without access
  to personal or source-identifying metric labels.
- Deferred cost: no Redis/database service, durable counter cleanup, identity-key
  migration, per-user policy administration, or distributed-limiter incident mode
  is accepted by this decision.

## Implementation and documentation impact

- Impacted modules: Item Create catalog state and consumers; Conversion Create
  composer; `GET /api/items/option-catalog`; Item option-catalog service call
  boundary; Caddy production route/configuration; authentication runtime-metric
  parser and health; separate option-catalog metrics/health; deployment evidence;
  focused integration, browser, configuration, and hosted operational tests.
- Code / architecture: add shared client shaping, route-specific proxy admission,
  a non-queuing per-process gate, exact authentication-zone filtering, and a
  separate low-cardinality option telemetry path. Do not add DB/Redis/per-user
  limiter state.
- Data / schema: no Prisma schema, migration, seed, catalog record, or durable
  counter change.
- Workflow / permissions: no permission or scope change. Existing route/service
  checks remain authoritative and execute for direct requests.
- UI / mobile: current selectors retain their bounded catalog and selected-value
  semantics. Rejection/retry states must remain usable and truthful at desktop,
  tablet, and mobile sizes; no new workflow is introduced.
- Reporting: no business report or export. Operational telemetry is aggregate-only
  and must not be presented as user activity or audit evidence.
- Knowledge base / training: Dunong must assess whether transient catalog overload
  and retry guidance warrants a troubleshooting or release-note update before
  release. No new business-policy training is required.
- Tests / UAT: focused route, client, limiter, metric-isolation, configuration, and
  browser tests plus hosted load/shared-NAT/restart/alert/rollback evidence are
  required. Numeric staging candidates cannot be promoted by local unit tests alone.

## Implementation sequence

1. Establish shared client-shaping behavior and parity tests for every option-
   catalog consumer without changing the server contract.
2. Add the bounded application gate, stable safe rejection behavior, exception-safe
   release, and direct-route regression tests.
3. Add the route-specific Caddy global-then-source zones, required production
   variables, pinned module/build contract, and verified `Retry-After` behavior.
4. Restrict authentication metrics/health to exact authentication zones; add a
   separate aggregate-only option-catalog telemetry and health path with bounded
   labels and isolation tests.
5. Deploy staging candidates and run hosted burst/sustained load, shared-NAT,
   restart, alert, configuration-failure, and rollback exercises across the actual
   process/replica topology.
6. Promote numeric values and claim production completion only after evidence is
   reviewed. Otherwise tune candidates or roll back the affected admission layer
   while preserving the direct route controls.

## Migration, rollback, and reversibility

- Migration: configuration and application deployment only; there is no database
  migration or durable admission-state backfill. Production must fail validation or
  remain undeployed when required route-limit configuration is missing.
- Rollback: restore the last verified Caddy and application artifacts and remove
  their corresponding candidate configuration/alerts in a controlled deployment.
  Do not bypass the proxy wholesale, expose internal metrics, or revert the route's
  authentication, authorization, bounded validation, safe errors, or no-store
  headers. Drain/restart behavior must be exercised because in-process permits and
  proxy windows are intentionally ephemeral.
- Client shaping reversibility: **High** — shared client timing/cancellation behavior
  can be reverted independently; selected-value and bounded paging tests protect
  the user contract.
- Caddy route-limit reversibility: **High** — configuration/build rollback is
  isolated from business data, subject to verified artifact and rollback evidence.
- Application gate reversibility: **High** — process-local and stateless; rollback
  changes capacity protection but migrates no data.
- Metric/health isolation reversibility: **Medium** — code/config rollback is
  technically simple, but alert continuity and authentication-signal contamination
  require coordinated dashboard and alert verification.
- Future identity-aware limiting reversibility: **Low to Medium if later adopted** —
  distributed identity state and policy would add migration and operational
  coupling; this cost is a reason for the current deferral.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement client-shaping parity, authorization-before-admission, non-queuing application gate, and direct-route regression coverage | Frontend / Backend / QA | Current Item lifecycle checkpoint | Implemented locally |
| Add Caddy global-then-source route zones, public internal-route denial, required production inputs, and pinned `Retry-After` contract evidence | DevOps / QA | Before hosted load evidence | Implemented locally; built-artifact/hosted evidence open |
| Isolate exact authentication zones and add exact-schema aggregate-only option telemetry/health | Backend / DevOps / Security | Before alert evidence | Implemented locally; hosted alert evidence open |
| Execute hosted load, shared-NAT, restart, alert, configuration-failure, and rollback tests | DevOps / QA / Release | Before production completion | Open |
| Review evidence and approve or retune numeric production values | Decision Chair / Operations / Security | After hosted evidence | Open |
| Reconsider identity-aware limiting only when a recorded trigger occurs | Architecture / Security / Product | Fairness failure or topology/role/consumer expansion | Deferred |
| Assess user-facing troubleshooting and release-note impact | Dunong | Before release | Complete |

Post-implementation security/QA challenge amended the application ordering without
changing the selected layered architecture: authorization now precedes the
process-local permit, while the permit still precedes catalog database queries.
The same challenge required public `/api/internal/*` denial, production detection
through either `APP_ENV` or `NODE_ENV`, exact health payload keys, and bounded
metrics streaming. These safeguards are part of the confirmed decision.

## Evidence

- `apps/web/src/app/api/items/option-catalog/route.ts` currently authenticates the
  direct route, delegates scoped catalog access to the Item service, bounds/validates
  inputs, returns safe error codes, and applies `Cache-Control: private, no-store`
  to successful results. These controls are retained, not replaced.
- `apps/web/src/components/itemCreateCatalogState.ts` and
  `apps/web/src/components/ConversionCreateComposer.tsx` are current browser
  consumers and establish the client-parity scope.
- `apps/web/tests/authorizationRoutes.integration.test.ts` contains direct-route
  denial and safe-error evidence for the Item option catalog; the selected design
  requires this coverage to remain and expand across admission outcomes.
- `infra/caddy/Caddyfile.example`, `infra/caddy/Dockerfile`, and
  `infra/hostinger/evidence/compose.production.yaml` establish the existing
  route-specific rate-limit module, production configuration, and metrics patterns
  that the option route must extend without contaminating authentication zones.
- `apps/web/src/server/services/authenticationRuntimeMetrics.ts` and its tests are
  the authentication metric/health boundary that must move to exact-zone isolation.
- The parent-confirmed deliberation selected layered stateless admission, deferred
  identity-aware state until evidence triggers reconsideration, classified numeric
  values as staging candidates, and required hosted load, shared-NAT, restart,
  alert, and rollback evidence before production completion.
- Closest permitted GPT-5.6 specialists were used because Spark and the requested
  exact GPT-5.4 specialist model were unavailable. Their analysis is advisory
  evidence; the parent Decision Chair confirmed the conclusion.
- Local verification passes the 44/44 focused application, route, admission,
  metrics, and health checks; the 1/1 focused rendered Conversion selector
  structure check; 10/10 edge/operations contracts; the 20/20 authorization
  manifest; 516/516 authorization boundary coverage; web typecheck and lint; the
  production build; and the full non-database web suite (1,466 passed, 305
  skipped, 1 todo across 138 passing and 11 skipped files). Independent Security
  review returned GO with no Critical, High, or Medium finding. Independent QA
  returned CONDITIONAL GO for the bounded local/source checkpoint because
  authenticated responsive-browser interaction and UAT remain uncredited.
- The database-backed authorization runner correctly fails closed when
  `DISPOSABLE_DATABASE_ADMIN_URL` is absent. Disposable PostgreSQL authorization,
  query-plan, and concurrency evidence therefore remains open with the hosted and
  user-acceptance gates listed above; this decision record does not close Workspace
  3 or Phase I.

## Confidence

- Decision-design confidence: **High**. The layered controls are bounded,
  stateless, independently reversible, and preserve the existing security boundary.
- Production-threshold confidence: **Low until hosted evidence**. No numeric value
  is approved for production by this record alone.
- Shared-NAT fairness confidence: **Medium pending hosted testing**. Source limiting
  is acceptable as a staging candidate, not proof that identity-aware limiting will
  never be needed.

## Supersession

This decision strengthens the bounded Item option-catalog foundation in
`DEC-0140` and the consumers established by later Item Master decisions. It does
not supersede their catalog, selected-option, lifecycle, permission, or scope
semantics. If future evidence justifies identity-aware distributed limiting, a new
confirmed decision must define its privacy, availability, data, migration, and
rollback contract and explicitly supersede the relevant admission sections here.
