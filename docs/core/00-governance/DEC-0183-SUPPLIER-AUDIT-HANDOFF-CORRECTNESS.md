# DEC-0183 — Supplier Audit Handoff Correctness

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision Chair:** Parent implementation agent

## Decision

Supplier Audit now hands off to the real Core Administration route with an
exact `entityId` filter: `/admin?tab=audit&entityType=Supplier&entityId=...`.
The shared redacted/keyset audit service applies the entity ID as an ANDed,
UUID-validated predicate. The filter is included in cursor hashing, pagination,
CSV export, and event-detail return context.

## Controls

- Existing Core Administration permission, tenant-role authority, selected
  company Manage scope, tenant/company predicates, and redaction remain
  authoritative.
- A selected supplier ID is navigation context only; the Admin Audit service
  revalidates authorization and scope before querying. Invalid or foreign IDs
  cannot broaden the result set.
- No supplier, procurement, inventory, or audit write semantics change.

## Deliberation and gates

Architecture and Product independently identified the broken `/admin/audit`
destination and missing exact entity filter. The requested Spark/GPT-5.4
models were unavailable; the closest permitted GPT-5.6 fallbacks were used and
recorded. Core Admin and Supplier focused tests, TypeScript, lint, production
build, and diff checks pass. PostgreSQL authorization/query-plan, responsive
browser, hosted recovery, and UAT evidence remain open.
