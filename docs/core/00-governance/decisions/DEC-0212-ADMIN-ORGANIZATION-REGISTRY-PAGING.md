# DEC-0212 — Organization Scope registry paging and projections

Date: 2026-07-25  
Status: Accepted  
Decision chair: Parent agent  
Deliberators: independent product and architecture reviews (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 models were unavailable)

## Decision

The selected-company Brand, Department, and Location registries clamp stale requested pages to the current last page and retain deterministic name/ID ordering, exact total and active counts, bounded URL filters, and selected-company predicates. Location and Brand rows use explicit narrow company/brand projections; Department retains its approved database-derived budget, budget-line, and cost-center counts with explicit company projection.

These registers remain read/write administration surfaces under existing tenant and selected-company Manage authorization. No cross-company rows or new authority are introduced.

## Required verification

Core Administration contract tests, web typecheck, lint, production build, and diff hygiene must pass. Disposable PostgreSQL selected-company/query-plan, responsive browser/mobile, hosted recovery/deployment, and UAT evidence remain open gates.
