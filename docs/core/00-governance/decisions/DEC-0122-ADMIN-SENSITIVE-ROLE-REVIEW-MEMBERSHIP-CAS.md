# DEC-0122 — Sensitive Role Review Membership CAS

## Metadata

- Decision ID: `DEC-0122`
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: Core Administration
- Decision Chair: Parent agent
- Related phase/module: Phase I — Users, Roles, and Administration

## Decision

Sensitive-role approval and rejection apply the same mutation-time target-user lock, active/effective selected-company membership revalidation, and pending-request compare-and-swap used by high-risk scope review.

## Context

Sensitive-role review already claimed requests by pending status, but target membership was checked outside the transaction. A concurrent scope revocation could therefore race a role grant. The authorization model requires target-user membership to remain valid at commit time for every controlled access mutation.

## Safeguards and evidence

- Lock the target `User` row before revalidation and request claim.
- Claim `SensitiveRoleRequest` only with `id + status=PENDING`; count must equal one.
- Preserve tenant/company, tenant-role permission, self-review, privileged-MFA, role-policy, audit, and session-invalidation checks.
- Focused Core Admin tests assert the transaction revalidation and CAS contract; disposable PostgreSQL revocation/concurrency tests remain required.
- Evidence: `apps/web/src/server/services/coreAdmin.ts`, `apps/web/src/server/services/coreAdmin.test.ts`, `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md`.
- GPT-5.6 fallback subagent review was used because Code Spark and GPT-5.4 were unavailable.
