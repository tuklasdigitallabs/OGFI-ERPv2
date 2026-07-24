# DEC-0148 — Purchase Request Bounded Draft Lookups

**Status:** Implemented checkpoint; pagination/mobile/browser/database gates remain open  
**Date:** 2026-07-24  
**Decision Chair:** Parent agent  
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Purchase Request draft entry uses an authenticated server lookup endpoint for catalog items, item-valid UOMs, and active budget lines. Each lookup is tenant/company/location scoped, queryable, deterministically ordered, exactly counted, and bounded to a validated page size. Selected IDs are retained in search results so an existing line does not silently lose its label or valid UOM context.

## Controls and validation

- Permission and authorized-location checks run before lookup reads.
- Catalog UOM results are restricted to the selected item's base, purchase, issue, and configured conversion endpoints; create-time relationship validation remains authoritative under DEC-0147.
- When a result exceeds the safe page, the editor discloses the overflow and requires a narrower search before submission; no silent truncation authorizes a draft.
- Emergency free-text entry remains available under the existing emergency controls.
- Focused Purchase Request tests, typecheck, lint, and diff checks are required for this checkpoint. Authenticated responsive-browser, disposable-PostgreSQL authorization/query evidence, hosted recovery, and UAT remain open.
