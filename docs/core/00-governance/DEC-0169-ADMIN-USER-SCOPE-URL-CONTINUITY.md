# DEC-0169 — Administration User Access scope URL continuity

Status: Accepted for implementation
Date: July 25, 2026

## Decision

The User Access Scopes section uses one canonical URL builder for search, type filtering, bounded pagination, selected-scope controls, and deactivation return paths. Every generated link retains `section=scopes` plus the active query, type, page, and optional `scopeActionId`, so actions do not silently fall back to Overview or lose the selected register context.

## Controls

- URL state is navigation context only; the bounded scope read and `deactivateUserScopeAssignment` mutation remain authoritative for tenant/company membership, self-protection, reason, concurrency, and audit.
- Selected scope controls are derived only from the current bounded page. Missing or stale selections remain unavailable and disclose that the register must be refreshed.
- No role, request, or audit state is added to scope links.

## Evidence and remaining gates

Core Admin focused tests, web TypeScript, lint, production build, and diff checks are required for this slice. PostgreSQL authorization/query-plan, responsive browser, hosted recovery, and UAT evidence remain open; Administration and Phase I are not complete.
