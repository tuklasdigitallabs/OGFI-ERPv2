# DEC-0152 — Administration Permission Access Bounded Detail

**Status:** Implemented checkpoint; database/browser/hosted/UAT gates remain open
**Date:** 2026-07-25
**Decision Chair:** Parent agent
**Specialist fallback:** GPT-5.6 (requested Code Spark/GPT-5.4 models were unavailable)

## Decision

Permission Access detail now reads a bounded, URL-searchable page of tenant-global roles granting one permission. Each role returns an exact assignment count and at most five current-company active-user previews. Effective previews require active user/assignment/role dates and current-company COMPANY or LOCATION scope; future, expired, inactive, and foreign-company scopes are excluded. The permission remains read-only and viewing it does not grant authority to mutate roles.

## Controls and validation

- Existing `coreAdminister`, `tenantRoleAdminister`, and selected-company Manage guards execute before permission, role, assignment, or scope reads.
- Permission visibility remains tenant-global by documented role semantics; the selected-company boundary controls management access and effective-user preview scope.
- Role ordering, page bounds, exact totals, query filtering, and selected-company scope predicates are server-owned; no client slicing or unbounded nested assignment hydration remains.
- Focused Core Admin tests (30), typecheck, lint, and diff checks pass. Disposable PostgreSQL authorization/count/query-plan evidence, responsive browser, hosted recovery, and UAT remain open.
