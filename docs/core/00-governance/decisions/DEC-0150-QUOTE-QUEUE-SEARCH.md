# DEC-0150 — Supplier Quote Queue Search

**Status:** Implemented checkpoint; broader filter/browser/database/hosted/UAT gates remain open
**Date:** 2026-07-25
**Decision Chair:** Parent agent
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

The approved Purchase Request quote queue adds a server-side search across Purchase Request reference, requester, and supplier code/name while retaining the selected location, approved-only status, pagination, and selected-request context. Search is a queue filter only; it does not grant quote, recommendation, PO, supplier, or inventory authority.

## Controls and validation

- Search predicates are composed inside the existing tenant/company/request-location/APPROVED scope before count or page reads.
- Query context is preserved through selected-request links and pagination, and no-results copy explains the active search.
- Quote comparison, evidence, recommendation approval, and Purchase Order creation remain separate controlled actions.
- Focused Quotes tests (15), typecheck, lint, and diff checks are required for this checkpoint. Full status/date/amount filter coverage, responsive browser, disposable PostgreSQL, hosted recovery, and UAT remain open.
