# DEC-0189 — Supplier Catalog Category Option Paging

**Status:** ACCEPTED — reversible service/UI contract

## Decision

Supplier Catalog category options are loaded through a bounded, URL-backed
page scoped by tenant, company, and selected supplier. Options are ordered by
category name and ID, expose total/previous/next metadata, and support a
bounded refinement query. A selected category is retained only after the same
supplier-scope check, even when it is outside the current option page.

## Rationale and controls

The prior unbounded category query could make a large native select slow and
violated the workspace rule that growing operational lists must be bounded.
The implementation keeps authorization in `getSupplierCatalog`, does not add a
public route or schema, preserves item-link pagination independently, and
fails closed for foreign category IDs.

## Alternatives considered

An arbitrary `take: 100` cap was rejected because undiscoverable categories
would make the select appear complete. A new public lookup route was deferred
because it would add another authorization/manifest surface without a second
consumer. This additive service/UI contract is reversible and requires no
schema migration; a future PostgreSQL index is conditional on EXPLAIN evidence.

## Validation and follow-up

Typecheck and the existing web test suite are required for this slice. A
representative PostgreSQL high-cardinality plan check remains part of the open
production database gates; no speculative index is added.
