# DEC-0144 — Approval Inbox Feature-Disabled State

**Status:** Implemented checkpoint; normalized routing remains NO-GO  
**Date:** 2026-07-24  
**Decision Chair:** Parent agent  
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

When normalized approval routing is disabled, `/approvals` no longer calls the legacy unbounded approval list or presents a false zero-work inbox. It renders an explicit unavailable state explaining that no approval action is available until normalized routing cutover and its PostgreSQL, authorization, concurrency, hosted, and UAT gates are accepted. Direct approval detail routes retain their existing server-authoritative behavior for controlled source links.

## Safeguards and validation

- The flag is checked before any approval list query.
- If the normalized flag is enabled before runtime backfill readiness is complete, the known `APPROVAL_ROUTING_BACKFILL_REQUIRED` readiness failure renders the same unavailable state; unrelated database or authorization faults still fail through the normal user-safe boundary.
- No legacy list query, client-side slicing, count, or passive approval tab is used while disabled.
- Normalized routing behavior remains paginated and unchanged when enabled.
- Focused approval tests (42), typecheck, lint, and diff checks pass; activation remains NO-GO.
