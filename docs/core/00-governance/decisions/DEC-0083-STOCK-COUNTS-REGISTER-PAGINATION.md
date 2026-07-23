# DEC-0083 — Ordinary Stock Counts register pagination

**Status:** Confirmed  
**Date:** 2026-07-24

The ordinary Stock Counts register uses a server-owned 25-row page query, scoped counts, and deterministic `createdAt DESC, id DESC` ordering. Existing blind-count and reviewer-derived fact redaction is applied to every returned row through the shared mapper. CSV export remains a separate authorized full report.

This read-only change does not activate Count Variance, alter count snapshots, post adjustments, or change review authority. Responsive browser, PostgreSQL volume/query-plan, production build, and hosted deployment gates remain open.
