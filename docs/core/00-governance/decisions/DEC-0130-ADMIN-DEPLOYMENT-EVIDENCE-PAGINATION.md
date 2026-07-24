# DEC-0130 — Administration Deployment Evidence Pagination

## Decision

Deployment evidence uses a selected-company, server-owned page/detail contract with bounded search, type/status/environment filters, exact totals, deterministic `performedAt`, `createdAt`, `id` ordering, and selected-record review actions. Deployment readiness summaries use scoped aggregates and never derive gate readiness from the current page.

## Dependency semantics

The migration/backup/restore gate requires verified MIGRATION, BACKUP, RESTORE_REHEARSAL, ROLLBACK_PLAN, and SMOKE_TEST evidence. Monitoring/hypercare requires verified MONITORING_HYPERCARE. Recorded, rejected, or unverified evidence never satisfies a deployment gate.

## Safeguards and limitations

Tenant/company management authorization applies before reads and mutations; selected review retains creator self-review protection, `RECORDED` compare-and-set, reason capture, and immutable audit. Export, deployment date-range bounds, activity/audit detail, responsive browser, database, hosted recovery, and remaining Readiness surfaces are separate follow-ups.

## Model note

Architecture and product deliberation independently selected this bounded deployment register slice. GPT-5.3-Codex-Spark and GPT-5.4 were unavailable; GPT-5.6 fallback specialists were used and reconciled by the Decision Chair.
