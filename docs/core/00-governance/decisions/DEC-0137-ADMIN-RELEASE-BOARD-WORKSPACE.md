# DEC-0137 — Administration Release Board workspace

**Date:** 2026-07-24  
**Status:** Implemented controlled workspace slice; external readiness remains open

The Release Board now has a separate `/admin/readiness/release-board` workspace
with a latest-decision summary, current readiness blocker counts, full audited
decision composer, selected read-only decision detail, searchable decision
history, and server pagination. Every read and write requires Core Admin plus
selected-company Manage scope. Decision creation remains append-only and does
not mutate gate status; existing readiness gate checks remain authoritative.

The existing Readiness `GO / NO-GO` category remains a bounded register and links
to this workspace. Malformed or foreign selected IDs show generic unavailable
behavior. Date-range filters, bounded workspace export, richer audit/activity
history, responsive browser evidence, disposable PostgreSQL query-plan/isolation
evidence, hosted recovery, and UAT execution remain follow-up gates.

Focused release-readiness tests, web typecheck, lint, and diff checks pass. The
requested Spark/GPT-5.4 models were unavailable; GPT-5.6 fallback review was
used under the deliberation protocol.
