# DEC-0216 — Purchase Request draft editor multi-line lookup continuity

Date: 2026-07-25  
Status: Accepted  
Decision chair: Parent agent  
Deliberators: independent product and architecture reviews (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 models were unavailable)

## Decision

The Purchase Request draft editor keeps bounded lookup behavior while caching selected item, UOM, and budget options by ID. Switching among draft lines therefore preserves visible selected values even when the active search page changes. The cache contains only options returned by the current authorized lookup or selected by the user; it is not a catalog preload and cannot authorize draft creation.

Draft creation continues to revalidate every item, UOM, budget, company, brand, and location value server-side before writes.

## Required verification

Purchase Request focused tests, web typecheck, lint, production build, and diff hygiene must pass. Responsive browser/mobile, disposable PostgreSQL scope/no-mutation, hosted recovery, and UAT evidence remain open gates.
