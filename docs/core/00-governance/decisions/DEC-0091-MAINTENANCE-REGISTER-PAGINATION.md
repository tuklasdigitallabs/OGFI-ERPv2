# DEC-0091 — Maintenance Register Pagination

Status: Confirmed  
Date: 2026-07-24

The ordinary Maintenance register uses a bounded server-owned 25-row page query. Count and page rows share the exact tenant/company/null-aware-brand/location and validated q/date/status/priority predicate, with deterministic requested-date, creation-time, and ID ordering. Dashboard aggregates and full authorized CSV export remain separate contracts.

Existing reporter-lineage, owner/completion/cancellation/correction, evidence, idempotency, audit, and incident-link behavior is preserved. Responsive browser, PostgreSQL, export-parity, hosted, and production-build evidence remain open.

Actor-name search resolves only tenant-scoped reporter/owner IDs; the empty register and no-match filter states remain distinct.

Completion date defaults use the operational timezone, and malformed requested-date filters use the existing stable validation code.
