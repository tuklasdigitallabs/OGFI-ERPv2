# DEC-0128 — Administration UAT Aggregate Summary

## Decision

Readiness UAT gate summaries and UAT gate-transition checks use scoped aggregate queries for totals, verification status, required evidence types, unresolved results, and Phase 3 workflow-area coverage. They no longer hydrate the full UAT register for those decisions. The evidence export remains a separate full-register operation.

## Hard gates and limitations

Every aggregate query carries tenant and selected-company predicates and requires selected-company management scope. Verified evidence and passing-result semantics remain unchanged. The UAT list and selected detail are separate contracts; no page or filter result is treated as release readiness. Deployment, enablement, security, and GO/NO-GO registers remain separate follow-up slices.

## Evidence and model note

Architecture and product deliberation recommended aggregate parity before claiming the UAT workspace complete. GPT-5.3-Codex-Spark and GPT-5.4 were unavailable; GPT-5.6 fallback specialists were used and reconciled by the Decision Chair.
