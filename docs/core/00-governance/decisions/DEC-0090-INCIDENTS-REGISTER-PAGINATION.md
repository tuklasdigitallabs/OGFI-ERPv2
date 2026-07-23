# DEC-0090 — Incidents Register Pagination

Status: Confirmed  
Date: 2026-07-24

The ordinary Incidents register uses a bounded server-owned 25-row page query. Count and page rows share the exact tenant/company/optional-brand/location and validated q/date/status/severity predicate, with deterministic incident-date, creation-time, and ID ordering. Dashboard aggregates and full authorized CSV export remain separate contracts.

Existing source-link authorization, evidence, owner/resolver controls, cancellation/correction/idempotency, audit, and source-record non-mutation behavior are preserved. Cancellation terminal-state metrics and detail messaging remain a separate required remediation.

Cancellation terminal-state metrics and detail messaging now exclude cancelled incidents from overdue work and show cancellation explicitly.

Cancelled list rows use neutral terminal-state styling.
