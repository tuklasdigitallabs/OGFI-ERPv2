# DEC-0209 — Core Administration Users effective-role preview

Date: 2026-07-25  
Status: Accepted  
Decision chair: Parent agent  
Deliberators: independent product and architecture reviews (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 models were unavailable)

## Decision

The Core Administration Users registry shows a bounded, read-only preview of current effective roles. A role is eligible only when its assignment is active and effective at one captured request timestamp, the role is active, and the role is tenant-local or global. The nested preview is capped at eight names with a visible `8+ roles` indicator. Inactive users never present those roles as current access.

The registry no longer hydrates scope assignments. Full scope review remains on the selected-user User Access detail, where company and location authority is checked by the server.

The service clamps a stale requested page to the current last page and preserves deterministic user ordering. The preview is descriptive only; it does not grant, revoke, or replace authorization.

## Rationale and safeguards

- Effective-date and role-status predicates prevent future, ended, inactive, or foreign-tenant roles from appearing as current.
- Explicit nested selection and `take: 9` keep per-user hydration bounded while allowing truthful eight-plus disclosure.
- Scope IDs are not copied into a tenant-level registry without validating their owning company or location.
- Existing tenant and company authorization guards, User Access detail, audit history, and server-side permission checks remain authoritative.

## Required verification

Core Administration contract tests and web typecheck must pass. Disposable PostgreSQL tenant isolation, high-cardinality query-plan, responsive browser/mobile, hosted recovery/deployment, and UAT evidence remain open gates.
