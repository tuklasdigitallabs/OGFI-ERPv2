# DEC-0141 — Master Data Supplier Registry Pagination

**Status:** Implemented checkpoint; Workspace 3 remains in progress  
**Date:** 2026-07-24  
**Decision Chair:** Parent agent  
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

The company-scoped Supplier Register now uses validated server-side search, lifecycle and accreditation filters, deterministic ordering, bounded 25-row pages, exact matching totals, and selected-company Manage authorization. Supplier catalog detail retains its separate scoped paginated workspace.

The register remains a controlled checkpoint: repeated inline supplier actions and supplier option-catalog bounds still require UX and database/browser review before Workspace 3 completion.

## Safeguards

- Tenant/company scope is applied before count or row reads.
- Search and status values are allowlisted; page size is bounded to 10–100.
- Item-link previews remain capped summaries and do not replace the catalog source of truth.
- Web typecheck, lint, focused supplier tests, and diff checks pass; disposable PostgreSQL, query-plan/load, responsive browser, hosted recovery, and UAT gates remain open.
