# DEC-0139 — Master Data Conversion Scope Fence

**Status:** Implemented checkpoint  
**Date:** 2026-07-24  
**Decision Chair:** Parent agent  
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Item UOM conversion reads and updates must prove that the item, source UOM, and target UOM all belong to the active tenant and selected company. Updates additionally require all three related master records to remain active. Duplicate detection uses the same scoped relationship predicates, preventing malformed cross-company conversion rows from becoming an existence oracle.

The conversion entity remains normalized through its existing item/UOM relations; no schema migration is introduced. Conversion creation remains visibly disabled in the current Item Master page until a bounded option catalog is implemented.

## Safeguards and validation

- Distinct UOM and positive conversion-factor validation remains server-authoritative.
- Cross-company or cross-tenant item/UOM relationships return the same not-found/duplicate-safe errors.
- Audit events remain inside the conversion mutation transaction.
- Web typecheck, lint, and diff checks pass; disposable PostgreSQL isolation and browser evidence remain required.
