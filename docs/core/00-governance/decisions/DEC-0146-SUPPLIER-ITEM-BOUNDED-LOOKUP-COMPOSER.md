# DEC-0146 — Supplier-Item Bounded Lookup Composer

**Status:** Implemented checkpoint; browser/database/hosted gates remain open  
**Date:** 2026-07-24  
**Decision Chair:** Parent agent  
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Supplier-item creation uses a selected-supplier composer. The supplier is fixed by the selected, company-scoped record; item and purchase-UOM choices come from separate server-owned active-only lookup pages with bounded search, deterministic ordering, exact totals, and next/previous navigation. The previous global unbounded selector is removed.

## Controls

- Lookup permission and selected-company management scope are checked before any option query.
- Inactive or foreign suppliers do not invoke the lookup. Create still revalidates active tenant/company supplier, item, and UOM records at the write boundary.
- Supplier register filters, catalog filters/page, lookup queries/pages, and selected item/UOM context are preserved in URLs and validated return paths; out-of-range lookup pages clamp to the last available page.
- Duplicate compound-key races map to the stable duplicate error; optional price history and audit creation remain transactional.
- Empty lookup results disable submission with an explanation. Responsive browser, disposable-PostgreSQL isolation/query-plan, hosted recovery, and UAT evidence remain required.

## Validation

Focused supplier tests (4), web typecheck, lint, and diff checks pass. The requested models were unavailable; GPT-5.6 specialist reviews were used and recorded.
