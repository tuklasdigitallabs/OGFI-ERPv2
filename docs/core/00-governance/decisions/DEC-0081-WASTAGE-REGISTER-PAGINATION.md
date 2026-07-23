# DEC-0081 — Ordinary Wastage register pagination

**Status:** Confirmed for the bounded Phase I operational-list slice  
**Date:** 2026-07-24

The ordinary Wastage register uses a server-owned 25-row page query. Counts, rows, scope, and deterministic `createdAt DESC, id DESC` ordering are computed in the service and the page links preserve the current page. The dashboard exception profile remains a separate read-only contract and is not broadened by this change.

This is a read-only presentation change. It does not alter wastage approval, evidence, immutable posting, reversal, or audit behavior. Full production readiness still requires responsive browser, PostgreSQL volume/query-plan, build, and hosted deployment evidence.
