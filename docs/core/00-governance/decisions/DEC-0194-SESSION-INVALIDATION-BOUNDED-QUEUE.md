# DEC-0194 — Session Invalidation Bounded Queue

## Metadata

- Status: Confirmed
- Date: 2026-07-25
- Decision Chair: Parent agent
- Related phase/module: Phase I Administration / Authentication

## Decision

Use a server-owned 25-row Session Invalidation queue with exact counts, allowlisted status, bounded text search, inclusive UTC creation-date filters, deterministic ordering, and stale-page clamping. Open one authorized record in a TaskSheet; only a pending provider record exposes the completion form.

## Controls

The shared predicate preserves tenant isolation and selected-company visibility. Tenant-role administrators may additionally see tenant-wide (`companyId IS NULL`) records. All rows use explicit data-minimizing projections and truthful scope labels. Completion retains independent Core Administration plus selected-company Manage authorization, pending-only CAS, no-self completion, provider evidence, and transactional audit.

## Alternatives

- Keeping `take: 100` was rejected because pending provider evidence could remain undiscoverable while release readiness requires it resolved.
- A cursor-only queue was deferred because exact totals and page navigation are required by the current workspace; keyset paging can follow query-plan evidence.
- A full detail route was deferred; the short completion action fits a selected TaskSheet.

## Evidence and remaining gates

Focused auth-invalidation test, TypeScript, lint, and production build pass. PostgreSQL isolation/query-plan, responsive browser, hosted recovery, and UAT evidence remain open.

