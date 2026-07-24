# DEC-0149 — Master Data Conversion Create Composer

**Status:** Implemented checkpoint; browser/database/query-plan/hosted/UAT gates remain open
**Date:** 2026-07-25
**Decision Chair:** Parent agent
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Replace the capped conversion-create modal selectors with a focused client composer that uses the existing server-authorized Item Master option-catalog contract for item, source UOM, and target UOM lookup. Each selector has bounded pages, search, selected-ID retention, loading/error/empty feedback, and mobile-safe controls. The existing conversion mutation remains the authority for active scope, distinct UOM, positive factor, duplicate, reason, audit, and no-inventory-mutation rules.

## Controls and validation

- The lookup route authenticates through the session and delegates to `listItemMasterOptionCatalog`, which enforces Core Administration plus selected-company Manage scope before any read.
- Lookup options are tenant/company scoped and selected IDs are never trusted to widen scope; create-time validation remains authoritative.
- No conversion is created, updated, or posted to inventory by the lookup composer.
- Focused Item Master tests, typecheck, lint, and diff checks are required for this checkpoint. Disposable PostgreSQL isolation/query-plan, responsive browser, hosted recovery, and UAT remain open.
