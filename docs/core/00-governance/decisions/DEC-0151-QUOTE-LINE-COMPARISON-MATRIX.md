# DEC-0151 — Supplier Quote Line Comparison Matrix

**Status:** Implemented checkpoint; policy/evidence/browser/database/hosted/UAT gates remain open
**Date:** 2026-07-25
**Decision Chair:** Parent agent
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

The selected approved Purchase Request in the Quotes workspace now includes a line-aligned comparison matrix. Each requested line is shown against every recorded supplier quote, including quoted quantity/UOM, unit price, line total, availability, and lead time. Missing quote lines are explicit; the matrix is read-only and does not select a supplier or create a Purchase Order.

## Controls and validation

- The matrix uses the already scoped, server-loaded selected request and quote lines; it does not accept client-supplied supplier, request, or authorization scope.
- Commercial totals, evidence availability, accreditation snapshots, recommendation policy, and approval remain server-authoritative and continue to be shown in the existing detail cards/composer.
- Horizontal overflow is contained in a labeled comparison region for mobile; the card view remains available for readable narrow-screen detail.
- Focused Quotes tests (15), typecheck, lint, and diff checks pass. Substitution semantics, mandatory evidence policy, responsive browser, disposable PostgreSQL, hosted recovery, and UAT remain open.
