# DEC-0085 — Ordinary Stock Adjustments register pagination

**Status:** Confirmed  
**Date:** 2026-07-24

The ordinary Stock Adjustments register uses a server-owned 25-row page query, scoped counts, and deterministic `createdAt DESC, id DESC` ordering. The Adjustment Exceptions dashboard profile remains a separate read-only contract.

This read-only change preserves reason/evidence, approval, posting, reversal, immutable-ledger, and audit controls. Production build, responsive browser, PostgreSQL volume/query-plan, and hosted recovery gates remain open.
