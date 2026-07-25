# DEC-0222 — Stock Count Attempt-Authoritative Read Mapper Checkpoint

**Status:** Accepted source-control checkpoint; runtime disabled  
**Date:** 2026-07-25  
**Decision chair:** Parent agent  
**Review method:** Parent-led Architecture/Product deliberation under `SUBAGENT_DELIBERATION_PROTOCOL.md`; requested Code Spark/GPT-5.4 models were unavailable, so the closest permitted GPT-5.6 fallback was used.

## Decision

Prepare an attempt-authoritative line selector for Stock Count detail and CSV reads, guarded by `STOCK_COUNT_ATTEMPT_READ_V1_ENABLED = false`. When enabled in a future reviewed release, it selects only the validated current attempt after the existing header/line parity check; a missing attempt projection fails closed with `STOCK_COUNT_ATTEMPT_LINE_PARITY_FAILED` and never falls back to mutable compatibility lines.

## Scope and safeguards

This checkpoint adds no schema, migration, Count Variance/recount action, posting, approval, inventory, or default-read authority. With the flag disabled, the existing legacy compatibility projection remains unchanged and attempt lines are not hydrated. The enabled path is additive preparation only and must retain existing tenant/company/location authorization, actor/state redaction, deterministic line ordering, and prior-attempt adjustment lineage.

## Required acceptance gates before enabling

- Disposable PostgreSQL migration/backfill/trigger, current-attempt and line parity, cross-scope/no-query, redaction, query-plan, and contention evidence.
- Responsive desktop/tablet/mobile browser evidence, hosted deployment/recovery, production-authenticated E2E, and UAT.
- Stock Count focused tests, typecheck, lint, production build, authorization manifest, and diff checks.

Current local evidence: focused Stock Count tests pass 28/28; web lint and typecheck pass. Runtime remains disabled and Count Variance remains inactive.

No glossary, knowledge-base, workflow, or release-note update is required because the runtime flag is disabled and user-facing behavior is unchanged.
