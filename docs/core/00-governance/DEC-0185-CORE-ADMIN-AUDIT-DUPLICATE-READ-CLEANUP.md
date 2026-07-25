# DEC-0185 — Core Administration Duplicate Audit Read Cleanup

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision Chair:** Parent implementation agent

## Decision

`getCoreAdminOverview` no longer issues an unused `AuditEvent.findMany` when
Audit is selected. The visible Audit workspace uses the authoritative bounded
keyset page service exactly once; the compatibility `recentAuditEvents` field
remains an empty projection.

## Controls and gates

Authorization, redaction, cursor, export, detail, and tenant/company predicates
remain in the existing Audit service. Core Admin focused tests, TypeScript,
lint, production build, and diff checks pass; PostgreSQL no-query/query-plan,
responsive browser, hosted recovery, and UAT evidence remain open.
