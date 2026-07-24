# DEC-0147 — Purchase Request Catalog UOM Relationship Guard

**Status:** Implemented checkpoint; bounded draft lookups remain open  
**Date:** 2026-07-24  
**Decision Chair:** Parent agent  
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

When a Purchase Request line supplies both a catalog item and catalog UOM, the server accepts the UOM only when it is the item's base, purchase, issue, or configured conversion endpoint. Emergency free-text lines retain their documented free-text UOM path.

## Controls and validation

- Item, UOM, and conversion reads remain tenant/company/status scoped after create permission and authorized-location checks.
- The relationship is revalidated at create time; client selectors or stale lookup results cannot authorize an invalid pair.
- Invalid pairs return stable `PR_LINE_UOM_INVALID_FOR_ITEM` feedback without creating the draft, approval, audit, or notification effects.
- Focused Purchase Request tests (12), typecheck, and lint pass. Bounded searchable item/UOM and budget-line lookup migration remains the next visible PR-entry slice.
