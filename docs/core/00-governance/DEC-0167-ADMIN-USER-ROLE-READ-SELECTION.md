# DEC-0167 — Administration User Access role-read selection

Status: Accepted for implementation
Date: July 25, 2026

## Decision

The User Access detail service loads assigned-role rows, role counts, and effective-permission projections only for Overview and Roles. Role assignment identifiers remain loaded for Roles and role Requests because the assignable-role catalog must exclude already assigned roles. Scope Requests, Audit, and other non-role sections receive an explicit empty role projection and the page renders unavailable role and permission KPI markers rather than implying a loaded count.

## Controls

- Role and permission reads remain tenant-scoped and server-authorized.
- Role mutation services and self-protection controls are unchanged.
- Catalog reads remain section-aware: role Requests may load role identifiers/catalog data, but not the full assigned-role/effective-permission surface.
- Omitted section options preserve compatibility for existing callers.

## Evidence and remaining gates

Core Admin focused tests, web TypeScript, lint, production build, and diff checks are required for this slice. PostgreSQL query-count/isolation and query-plan evidence, responsive browser validation, hosted recovery validation, and UAT remain open; Administration and Phase I are not complete.
