# DEC-0079 — Receiving register filter contract

**Status:** Confirmed for the bounded Phase I implementation slice  
**Date:** 2026-07-24

## Decision

The ordinary Receiving register uses one server-owned filter contract for page results, tab counts, and CSV export:

- `q` matches GRN, Purchase Order reference, and supplier legal/trading name, capped at 120 characters.
- `status` accepts only the six implemented lifecycle values: `DRAFT`, `POSTING`, `POSTED`, `POSTED_WITH_DISCREPANCY`, `REVERSING`, and `REVERSED`.
- `receivedFrom` is an inclusive local calendar-day lower bound and `receivedTo` is an inclusive local calendar-day upper bound, converted to UTC using the initial operational default `Asia/Manila` timezone.
- Contradictory tab and status predicates are combined with `AND`; invalid values and inverted ranges are rejected.
- Counts are query-aware and preserve the active status/date scope. The legacy Posted tab intentionally means `status != DRAFT` in this slice for backward compatibility.

## Scope and safeguards

The contract is read-only and does not change receipt workflow transitions, inventory posting, authorization, or audit semantics. Item, receiver, and value selectors remain deferred until a separately reviewed option-loading and query-plan slice. Company, tenant, and receiving-location predicates remain mandatory in every query and export.

## Evidence

Focused Receiving coverage is 20/20 and web typecheck is green. Full suite, production build, responsive browser evidence, PostgreSQL query-plan/volume evidence, and hosted production gates remain open.
