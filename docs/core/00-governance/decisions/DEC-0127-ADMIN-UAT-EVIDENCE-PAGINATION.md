# DEC-0127 — Administration UAT Evidence Pagination

## Decision

Add a selected-company, server-owned UAT evidence page contract with bounded search, type/result/status/workflow/environment filters, exact totals, deterministic ordering, and stale-page clamping. UAT evidence reads require Core Administration plus selected-company management scope because the visible register exposes controlled release evidence and its verify/reject actions.

## Safeguards and limitations

Tenant/company predicates are applied to both count and rows; evidence verification remains a separate audited mutation. The current readiness summary and export still use their legacy full-register paths and therefore remain an explicit follow-up for bounded aggregate/detail parity. No GO/NO-GO status is inferred from a page result.

## Model and evidence

Architecture and product deliberation independently recommended UAT first because it feeds the largest set of readiness gates. GPT-5.3-Codex-Spark and GPT-5.4 were unavailable; GPT-5.6 fallback subagents were used and reconciled by the Decision Chair.
