# DEC-0119 — Administration User Request History Pagination

**Status:** ACCEPTED — July 24, 2026  
**Decision Chair:** Parent implementation agent  
**Fallback model note:** GPT-5.6 fallback specialists were used because Code Spark and GPT-5.4 were unavailable in the active toolset.

## Decision

Replace the silent 20-row caps on a user’s Controlled Scope Requests and Controlled Role Requests with two separate server-owned page contracts. Each uses bounded page 1–10,000 and page size 10–100 (default 25), an allowlisted lifecycle status filter, exact totals, and deterministic `createdAt DESC, id DESC` ordering.

Both registries retain the existing target-user, tenant, selected-company, and Core Administration authorization boundary before any count or row query. Scope and role requests remain separate source-of-truth approval artifacts; list visibility does not grant approval authority, and existing approve/reject services continue their live actor, MFA, segregation-of-duties, status, and CAS checks.

The current review context remains visible in each row for this slice (requested scope/role, requester/reviewer, status, timestamps, reason/evidence reference, and role permission labels). No raw attachment payload, audit payload, session secret, or mutation is loaded by the list. A future detail/redaction decision may further narrow free-text/reference display after an approved replacement surface exists.

## Safeguards and tests

- No-query denial and non-enumerating target/company isolation remain mandatory.
- Count/page predicates are identical, filters are server-owned and bounded, and pages disclose `shown of total`.
- Pagination controls preserve the selected status filter and contextual review actions; no list-side mutation is introduced.
