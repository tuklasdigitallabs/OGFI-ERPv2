# DEC-0089 — Food Safety Register Pagination

Status: Confirmed  
Date: 2026-07-24

The ordinary Food Safety register uses a bounded server-owned 25-row page query. Count and page rows share the tenant/company/optional-brand/location and validated q/date/type/status predicate, with deterministic business-date, creation-time, and ID ordering. Dashboard aggregates and full authorized CSV export remain separate contracts.

The change preserves direct source reauthorization, review/correction/close controls, evidence and audit history, and the boundary that food-safety records do not post inventory or replace incident records. Export predicate parity, responsive browser, disposable PostgreSQL, hosted, and production-build evidence remain open.

The detail summary uses a direct scoped lookup and no longer loads the full register population.

The register projection carries reading counts only; reading fields are loaded on the focused detail route.
