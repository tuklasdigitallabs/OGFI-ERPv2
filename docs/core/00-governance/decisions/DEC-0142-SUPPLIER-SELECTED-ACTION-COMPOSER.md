# DEC-0142 — Supplier Selected Action Composer

**Status:** Implemented checkpoint; Master Data remains in progress  
**Date:** 2026-07-24  
**Decision Chair:** Parent agent  
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Supplier accreditation and deactivation actions now open in the selected supplier catalog workspace instead of repeating full forms in every registry row. The selected supplier is carried by the URL, and the action composer preserves the current search, lifecycle/accreditation filters, selected company, and catalog context. Server actions remain authoritative for scope, status, reason, audit, and non-destructive lifecycle behavior.

Supplier-item link deactivation remains in the selected catalog detail. This checkpoint does not complete Master Data: item/category/UOM/conversion action composers and external readiness evidence remain open.

## Safeguards and validation

- A selected supplier detail is loaded through the existing company-scoped catalog query.
- The composer is shown only for an active selected supplier; inactive rows disclose retained history.
- Browser deep-link and denied/cross-company cases remain required before production acceptance.
- Focused supplier tests, typecheck, lint, and diff checks pass.
