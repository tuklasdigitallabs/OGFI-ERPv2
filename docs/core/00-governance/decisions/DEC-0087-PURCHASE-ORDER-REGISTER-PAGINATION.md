# DEC-0087 — Ordinary Purchase Orders register pagination

**Status:** Confirmed  
**Date:** 2026-07-24

The ordinary Purchase Orders register uses the existing server-owned filter contract with 25-row pagination, exact selected-scope counts, and deterministic `createdAt DESC, id DESC` ordering. The Open PO dashboard profile remains a separate read-only contract.

The change is read-only and preserves supplier-send, approval, receiving, outstanding-quantity, cancellation, audit, and source authorization controls. Production build, responsive browser, PostgreSQL volume/query-plan, and hosted recovery gates remain open.
