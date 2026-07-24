# DEC-0140 — Master Data Option Catalog Foundation

**Status:** Implemented backend foundation; visible tabs remain in progress  
**Date:** 2026-07-24  
**Decision Chair:** Parent agent  
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Add a shared server-side option-catalog contract for Item Master categories, UOMs, and items. Each request is Core Administration plus selected-company Manage authorized, validates the catalog kind/query/page/selected IDs, returns active scoped options with exact totals and `hasMore`, and includes explicitly selected IDs so edit forms do not lose their current value.

This is a backend foundation only. The `/items` page has not yet migrated every tab and composer to the catalog contract; conversion creation remains disabled until that migration is complete. No workspace completion claim is made.

## Required safeguards

- Tenant/company scope is applied before option reads.
- Active options are preferred; selected IDs are explicitly scoped and retained for edit context.
- Page size is bounded to 10–100 and ordering is deterministic.
- Tests cover the contract source invariants; disposable PostgreSQL isolation, query-plan/load evidence, and responsive browser execution remain open.
