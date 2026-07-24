# DEC-0132 — Administration Security Readiness Projection

## Decision

Security Readiness remains a derived control center, not a second mutation workspace. Its resolver now requires selected-company management scope and projects only the identity, active scope, sensitive-permission code, MFA status, invalidation status, and break-glass status fields needed for the counters and explicitly labeled attention sample.

## Hard gates and limitations

Local runtime mode uses the latest runtime authenticator; provider mode uses the latest privileged enrollment. Security gate transitions remain server-blocked by the resolver’s exact counters. The current projection is an intermediate hardening checkpoint: a SQL aggregate/EXPLAIN-backed bounded resolver, paginated attention detail, source freshness/as-of metadata, and authoritative destination links remain required before Security Readiness is complete.

## Model note

Architecture and product deliberation rejected retaining the full permission graph and unbounded security rows. GPT-5.3-Codex-Spark and GPT-5.4 were unavailable; GPT-5.6 fallback specialists were used and reconciled by the Decision Chair.
