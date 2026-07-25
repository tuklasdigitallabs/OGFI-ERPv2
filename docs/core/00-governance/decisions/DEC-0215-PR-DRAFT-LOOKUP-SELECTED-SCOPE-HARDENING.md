# DEC-0215 — Purchase Request draft lookup selected-scope hardening

Date: 2026-07-25  
Status: Accepted  
Decision chair: Parent agent  
Deliberators: independent product and architecture reviews (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Purchase Request draft lookups retain the existing bounded, searchable item/UOM/budget contract. Selected budget-line retention uses the same active-budget, selected-location, and selected-brand predicates as the page query. A browser-supplied selected ID from another location or brand is not returned, even when it would later fail draft creation validation.

The obsolete unbounded `listPurchaseRequestDraftOptions` path is removed because the editor uses the server-owned lookup endpoint. Draft creation remains the authoritative transactional revalidation boundary; budget classification remains optional through `Finance to classify`.

## Required verification

Purchase Request focused tests, web typecheck, lint, production build, and diff hygiene must pass. Disposable PostgreSQL foreign-location/brand lookup isolation and no-mutation evidence, responsive browser/mobile, hosted recovery, and UAT remain open gates.
