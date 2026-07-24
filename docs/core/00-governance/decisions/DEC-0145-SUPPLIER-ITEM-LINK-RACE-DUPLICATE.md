# DEC-0145 — Supplier-Item Link Duplicate Race

**Status:** Implemented checkpoint; selector migration remains open  
**Date:** 2026-07-24  
**Decision Chair:** Parent agent  
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Supplier-item link creation maps a database unique-key race on `(supplierId, itemId, purchaseUomId)` to the existing stable `DUPLICATE_SUPPLIER_ITEM_LINK` error. The preflight duplicate read remains useful for immediate feedback, but the transactional create is authoritative under concurrency.

## Safeguards and validation

- Tenant/company, active-record, permission, and management-scope checks remain before the transaction.
- The transaction still creates the optional price history and immutable audit event atomically.
- Focused supplier service tests, typecheck, lint, and diff checks are required for this checkpoint.
- The global supplier-item composer still requires a bounded searchable selector migration before it can be considered complete.
