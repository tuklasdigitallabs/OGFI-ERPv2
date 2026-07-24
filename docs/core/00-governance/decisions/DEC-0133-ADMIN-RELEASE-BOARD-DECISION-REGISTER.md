# DEC-0133 — Administration Release Board decision register

**Date:** 2026-07-24  
**Status:** Implemented bounded register slice; full Release Board workspace remains open  
**Decision chair:** Parent implementation agent

## Decision

The Administration Readiness `GO / NO-GO` category uses a selected-company,
server-authorized, append-only decision register with bounded search, outcome
filtering, exact totals, deterministic ordering, stale-page clamping, and a
selected-record read-only detail panel. The list orders by `decidedAt`, then
`createdAt`, then `id`, all descending. Malformed or foreign identifiers return a
generic unavailable state and never disclose another company’s decision.

Existing audited decision creation remains the only write path. Decisions cannot
be edited or hard-deleted. A `GO` decision still requires the readiness summary
to be allowed to proceed; readiness gate transitions continue to require the
latest matching board outcome for `READY`, `CONDITIONAL_GO`, and `WAIVED` states.
The register does not mutate gate status or replace the existing audit trail.

## Alternatives considered

- Keep the unbounded company decision query: rejected because it fails the
  operational list-bound and exact-count requirements.
- Add row-level mutation controls: rejected because the decision register is an
  append-only audit record and correction must be a new decision.
- Build a separate full Release Board workspace in this slice: deferred until
  the composer, date filters, bounded export, audit/activity detail, and external
  release-evidence gates are designed and verified together.

## Safeguards and evidence

- Management authorization is enforced in the service for list and detail reads.
- Every query is tenant/company scoped; detail uses UUID validation and a scoped
  lookup with generic unavailable behavior.
- Pagination is server-owned with exact matching totals and stable ordering.
- Focused release-readiness tests, web typecheck, web lint, and `git diff --check`
  are required for this checkpoint.

## Open limitations

The separate full-page Release Board workspace and decision composer remain
pending, as do bounded date filters/export, richer audit/activity detail,
responsive browser proof, disposable-PostgreSQL authorization/query-plan
evidence, hosted deployment/recovery evidence, and UAT execution. The current
security projection also still needs SQL-side aggregate proof and bounded
attention detail under DEC-0132.

The requested GPT-5.3-Codex-Spark and GPT-5.4 subagent models were unavailable;
GPT-5.6 fallback reviewers were used under the repository deliberation protocol.
