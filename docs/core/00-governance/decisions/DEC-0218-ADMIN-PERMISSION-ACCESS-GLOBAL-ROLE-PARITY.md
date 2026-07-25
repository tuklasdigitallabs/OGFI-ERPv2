# DEC-0218 — Permission Access global-role provenance parity

Date: 2026-07-25  
Status: Accepted  
Decision chair: Parent agent  
Deliberators: independent product and architecture reviews (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Permission Access includes both tenant-local and tenant-global granting roles for a tenant/global permission. The service applies the same tenant/global role predicate to granting-role rows and current-company active/effective user previews, while preserving selected-company scope, current-tenant user ownership, deterministic ordering, exact totals, five-user previews, and read-only authority. Each row labels its provenance as `Global role` or `Tenant role`.

Malformed permission IDs fail closed before database reads. Query, page, and page-size inputs are bounded in the service, and stale pages clamp to the filtered total. Global roles remain provenance-only in this route; no mutation link or tenant-owned Role Detail authority is implied.

## Required verification

Core Administration focused tests, web typecheck, lint, production build, and diff hygiene must pass. Disposable PostgreSQL tenant/global/foreign-role isolation, effective-date and selected-company preview fixtures, query-plan evidence, responsive browser/mobile, hosted recovery, and UAT remain open gates.
