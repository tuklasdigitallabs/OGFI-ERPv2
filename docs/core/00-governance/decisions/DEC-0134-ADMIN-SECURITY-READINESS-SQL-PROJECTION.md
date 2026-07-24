# DEC-0134 — Administration Security Readiness SQL projection

**Date:** 2026-07-24  
**Status:** Implemented bounded projection/detail slice; external evidence remains open

## Decision

Security Readiness counters now come from one parameterized PostgreSQL query
using a materialized, tenant/company-scoped CTE snapshot. Active company scope,
active location scope, active role assignments, sensitive permission membership,
latest privileged enrollment, latest runtime authenticator, provider invalidation,
break-glass, recovery, and controlled-access counts are evaluated in that
snapshot. The query returns only counters, an explicit `LIVE_SNAPSHOT` source
status, an application UTC timestamp, and at most three deterministic attention
sample identities. It never hydrates the tenant-wide permission graph or MFA
secrets into application memory.

The selected attention identity is a separate management-authorized, UUID-validated,
company-scoped read-only query. It exposes only display identity, scoped location
labels, allowlisted sensitive permission codes, current MFA status/source, local
identity presence, and pending provider-invalidation presence. Malformed, foreign,
inactive, out-of-scope, or non-privileged identities return the same unavailable
result. No mutation, secret, authenticator identifier, raw assignment, or
cross-company oracle is exposed.

## Safeguards

- Core Administration and selected-company Manage authorization is enforced before
  both summary and detail queries.
- Scope predicates revalidate active assignment windows, active company locations,
  tenant/company ownership, and active role membership in SQL.
- Latest MFA records use deterministic `createdAt DESC, id DESC` ordering.
- Empty privileged populations return strict-MFA readiness rather than NULL.
- Attention samples are capped at three and ordered by display name then UUID.
- The existing gate blockers and external provider/vault proof requirements remain
  unchanged.

## Evidence and limitations

Focused release-readiness tests, web typecheck, lint, and diff checks cover the
source contract and visible state. Disposable PostgreSQL tenant/company isolation,
latest-status parity, concurrent snapshot consistency, and `EXPLAIN (ANALYZE,
BUFFERS)` at representative volume still require environment execution before
the security gate or Workspace 1 can be called production-ready. The separate
authoritative User Detail/session-control workflows remain the mutation surfaces.

The requested GPT-5.3-Codex-Spark and GPT-5.4 models were unavailable; GPT-5.6
fallback architecture, security, and QA reviewers were used under the deliberation
protocol.
