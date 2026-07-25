# DEC-0220 — Exact-Candidate Authorization Baseline Drift Correction

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision chair:** Parent agent  
**Review method:** Independent Architecture and Product review under `SUBAGENT_DELIBERATION_PROTOCOL.md`; requested Code Spark/GPT-5.4 models were unavailable, so the closest permitted GPT-5.6 fallback was used.

## Decision

Regenerate `scripts/authorization-surface-baseline.json` from the current source manifest after the removed `listPurchaseRequestDraftOptions` service was detected as stale. The correction removes only that obsolete service entry and does not add a route, permission, authority, or runtime behavior.

## Rationale and controls

The authorization manifest is fail-closed. Leaving a removed service declared caused the exact-candidate manifest test to reject the release evidence. Regeneration restores source-to-baseline parity while preserving the requirement that newly discovered or changed protected surfaces fail the manifest gate. The removed lookup path remains absent from `purchaseRequests.ts` and its test contract.

## Evidence and remaining gates

- Authorization manifest: 20/20 tests pass.
- Focused Administration/Overview/My Tasks regression: 93/93 tests pass.
- Full non-database web suite: 1,334 tests pass across 123 files (301 skipped, one TODO).
- Web lint, typecheck, production build, and `git diff --check` pass.
- Disposable PostgreSQL authorization/no-query/isolation/query-plan/concurrency, responsive authenticated browser, hosted recovery/deployment, production-authenticated E2E, and UAT remain open.

No glossary, knowledge-base, workflow, or release-note update is required because this is an internal release-evidence correction with no user-facing behavior change. Authentication activation and delivery remain explicitly deferred follow-up sections under DEC-0197.
