# DEC-0084 — Ordinary Transfers register pagination

**Status:** Confirmed  
**Date:** 2026-07-24

The ordinary Transfers register uses a server-owned 25-row page query. Each visible tab has a server predicate and exact selected-scope count; rows use deterministic `createdAt DESC, id DESC` ordering. The Transfer Follow-up dashboard profile remains a separate read-only contract.

The change is read-only and preserves transfer authorization, dispatch/receipt segregation, inventory idempotency, and source-record actions. Production build, responsive browser, PostgreSQL volume/query-plan, and hosted recovery gates remain open.
