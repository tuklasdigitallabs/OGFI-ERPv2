# DEC-0150 — Supplier Quote Queue Search

**Status:** Implemented checkpoint; amount-policy/browser/database/hosted/UAT gates remain open
**Date:** 2026-07-25
**Decision Chair:** Parent agent
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

The approved Purchase Request quote queue adds server-side search across Purchase Request reference, requester, and supplier code/name plus required-date From/To filters while retaining the selected location, approved-only status, pagination, and selected-request context. Filters are queue predicates only; they do not grant quote, recommendation, PO, supplier, or inventory authority.

## Controls and validation

- Search predicates are composed inside the existing tenant/company/request-location/APPROVED scope before count or page reads.
- Query context is preserved through selected-request links and pagination, and no-results copy explains the active search.
- Quote comparison, evidence, recommendation approval, and Purchase Order creation remain separate controlled actions.
- Focused Quotes tests (15), typecheck, lint, and diff checks pass for this checkpoint. Amount filtering remains open pending the commercial-field/export policy; responsive browser, disposable PostgreSQL, hosted recovery, and UAT remain open.
