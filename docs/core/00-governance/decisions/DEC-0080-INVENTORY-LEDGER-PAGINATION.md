# DEC-0080 — Ordinary Inventory Ledger pagination

**Status:** Confirmed for the bounded Phase I operational-list slice  
**Date:** 2026-07-24

## Decision

The ordinary Inventory Ledger is server-paginated at 25 rows per page. Its count, page query, search, movement-type filter, and deterministic ordering are scoped by tenant, company, and the selected active location. The list orders by `occurredAt DESC, id DESC`, preserves filters in page links, and never loads the full ledger into the browser.

The exact reconciliation trace remains a separate service and route with its own stricter authorization and pagination contract. CSV export remains a separately authorized full filtered export and is not silently limited to the visible page.

## Safeguards

The change is read-only: it does not alter immutable movement posting, balances, source-document authority, or audit history. Trace selectors continue to fail closed through the dedicated trace service. Search and movement-type inputs are normalized by the existing server filter contract; client scope and raw predicates are not accepted.

## Evidence and open gates

The inventory service suite passes 24/24 and web typecheck passes. Full lint, production build, responsive browser evidence, representative PostgreSQL query-plan/volume evidence, and hosted deployment gates remain open.
