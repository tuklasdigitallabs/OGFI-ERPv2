# DEC-0082 — My Tasks registered-source cursor version

**Status:** Confirmed  
**Date:** 2026-07-24

## Decision

The signed My Tasks cursor scope hash includes an explicit registered-source contract version. The current value is `my-tasks-registry-v5`. It must be bumped whenever an enrolled adapter’s eligibility predicate, source enrollment, ordering semantics, task projection, or queue filter contract changes.

## Rationale and controls

Source names alone do not identify a queue contract: a predicate or ordering change can otherwise leave a valid 15-minute cursor traversing a different dataset and skip or duplicate work. Version binding invalidates such cursors safely while retaining existing user, tenant/company/location, permission, and source-name bindings. The cursor authorizes no source action; each destination continues to reauthorize independently.

Focused My Tasks tests assert the active version and existing scope/tamper rejection. Browser, PostgreSQL, and hosted production evidence remain separate gates.
