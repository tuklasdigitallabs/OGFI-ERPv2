# DEC-0179 — Core Administration Active-Tab Projection

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision Chair:** Parent implementation agent

## Decision

Core Administration now uses an allowlisted active-tab read profile. Users,
Roles, Organization, Approval Rules, and Audit load only the selected register
and the option catalogs required by that register. Compatibility callers that do
not provide a profile retain the `users` default. The page uses compact
URL-backed workspace tabs and explicitly states that inactive sections are not
loaded in the current view.

## Controls

- Core Administration permission, tenant-wide role authority, and selected-company
  Manage scope are checked before any profile query.
- Create and mutation actions remain server-authoritative and unchanged.
- Inactive sections do not display derived counts as if they were loaded; the
  previous card-heavy shell was replaced with the shared tab primitive.
- Audit continues through the bounded, redacted keyset page service only when
  Audit is selected.

## Deliberation and gates

Architecture and Product independently recommended this slice after the
Readiness work, with staged implementation to keep the service profile and shell
coherent. The requested Spark/GPT-5.4 models were unavailable; the closest
permitted GPT-5.6 fallbacks were used and recorded. Focused Core Admin tests,
TypeScript, lint, production build, and diff checks pass. PostgreSQL no-query/
query-plan, responsive browser, hosted recovery, and UAT evidence remain open.
