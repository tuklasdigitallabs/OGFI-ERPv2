# DEC-0221 — Authentication Deferred-Surface Static Contract

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision chair:** Parent agent  
**Review method:** Parent-led Architecture and Product challenge round under `SUBAGENT_DELIBERATION_PROTOCOL.md`; requested Code Spark/GPT-5.4 models were unavailable, so the closest permitted GPT-5.6 fallback was used.

## Decision

Keep `/admin/authentication` explicitly limited to the Recovery section until the separately scoped Activation and Delivery work is authorized and its production gates pass. Add a static page contract that asserts the deferred action panels and labels are not rendered.

## Rationale and controls

The route already states that account readiness and activation delivery are separate follow-up sections. The unused `ActivationPanel` and `DeliveryRetryPanel` components are not part of the current route contract. The assertion prevents an accidental import or visible action from implying that deferred activation or delivery retry is available. It adds no runtime authority, schema, mutation, or navigation behavior.

## Evidence and remaining gates

- Authentication page contract: 2/2.
- Disposable PostgreSQL lifecycle safety: 15/15. The actual database-backed gate cannot start because `DISPOSABLE_DATABASE_ADMIN_URL` is unset and Docker is unavailable.
- `pnpm test:e2e` reaches the same fail-closed preflight and does not execute a browser case; no browser pass is claimed.
- Web lint, typecheck, and `git diff --check`: pass.
- Disposable PostgreSQL, responsive authenticated browser, hosted recovery/deployment, production-authenticated E2E, and UAT remain open.

No glossary, knowledge-base, workflow, or release-note update is required because the user-facing behavior is unchanged.
