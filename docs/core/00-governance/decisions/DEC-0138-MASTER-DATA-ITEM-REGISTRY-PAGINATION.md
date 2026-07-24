# DEC-0138 — Master Data Item Registry Pagination

**Status:** Implemented checkpoint; Workspace 3 remains in progress  
**Date:** 2026-07-24  
**Decision Chair:** Parent agent  
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Bound the company-scoped Item Master registry with server-side search, status filtering, deterministic ordering, a 25-row page size, and a shared pagination control. The service now authorizes Core Administration plus selected-company management before reading the registry and returns exact item totals and active-item counts for the KPI strip.

The Categories, UOMs, and Conversions surfaces remain explicitly in progress and are not represented as complete by this checkpoint. Conversion creation is visibly disabled until a bounded option catalog can include all valid active items; a follow-up option-catalog decision is required before claiming the full Master Data workspace production-ready.

## Hard gates and safeguards

- Tenant/company predicates remain in every item query.
- Status and search filters are validated by a shared Zod contract.
- Ordering is deterministic (`status`, `itemName`, `id`); page size is bounded to 10–100.
- No item mutation, inventory posting, or historical record deletion is introduced.
- Production readiness still requires browser verification, disposable PostgreSQL query/authorization evidence, and hosted recovery gates.

## Validation

Web typecheck and lint pass. Database-backed and authenticated browser evidence remain pending; therefore this is a bounded implementation checkpoint, not Workspace 3 completion.
