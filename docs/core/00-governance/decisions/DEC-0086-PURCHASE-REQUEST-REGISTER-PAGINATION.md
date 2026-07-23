# DEC-0086 — Ordinary Purchase Requests register pagination

**Status:** Confirmed  
**Date:** 2026-07-24

The ordinary Purchase Requests register uses the existing server-owned status/search filter contract with 25-row pagination, exact selected-scope counts, and deterministic `createdAt DESC, id DESC` ordering. The Open PR dashboard profile remains a separate read-only contract.

The change is read-only and preserves requester ownership, approval routing, evidence, cancellation, audit, and source authorization. Production build, responsive browser, PostgreSQL volume/query-plan, and hosted recovery gates remain open.
