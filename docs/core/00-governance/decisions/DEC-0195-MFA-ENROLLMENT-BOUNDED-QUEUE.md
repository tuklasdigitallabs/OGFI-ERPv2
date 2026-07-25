# DEC-0195 — MFA Enrollment Bounded Queue

## Metadata

- Status: Confirmed
- Date: 2026-07-25
- Decision Chair: Parent agent
- Related phase/module: Phase I Administration / Privileged MFA evidence

## Decision

Use an effective-scope, server-paginated MFA evidence register with exact company totals, bounded user search, allowlisted status filters including `NOT_RECORDED`, deterministic user ordering, and a capped target-user catalog. Verify and revoke actions occur only in a selected-record TaskSheet.

## Controls

Privileged-user derivation requires active/effective selected-company company or location scope, active/effective role assignment, active role status, and tenant/global ownership for roles and permissions. Latest enrollment status is deterministic by `createdAt DESC, id DESC`; status counts are database-derived and independent of the current page. Explicit projections avoid full role/permission/enrollment hydration.

Evidence remains ERP-side only. Server mutations preserve no-self attestation/verification, privileged targeting, reason/evidence validation, transactional audit, and expected-status CAS.

## Rejected alternatives

- Full in-memory role/permission/enrollment hydration was rejected because future/expired assignments and large history could distort readiness and exhaust memory.
- Page-local KPI counts were rejected because strict MFA readiness depends on the complete selected-company privileged population.
- Reason Codes was deferred: DEC-0124 already provides its bounded register contract and its remaining modal cleanup is lower security risk.

## Evidence and remaining gates

Focused MFA test, TypeScript, lint, and production build pass. PostgreSQL effective-date/isolation/query-plan, responsive browser, hosted recovery, and UAT evidence remain open.

