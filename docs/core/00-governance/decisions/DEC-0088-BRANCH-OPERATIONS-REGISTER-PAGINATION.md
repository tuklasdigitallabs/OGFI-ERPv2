# DEC-0088 — Branch Operations Register Pagination

Status: Confirmed  
Date: 2026-07-24

The ordinary Branch Operations register uses a server-owned, bounded 25-row page query. Counts and rows share the exact tenant/company/optional-brand/location and q/date/shift/status predicate. Search covers checklist, actor, line, evidence, and notes fields; ordering is deterministic by business date, creation time, and record ID. The dashboard aggregate and full authorized export remain separate contracts.

The change preserves direct detail reauthorization, review/return/correction/close controls, audit history, and the Phase II boundary that checklist records do not mutate inventory or finance records. Responsive browser, disposable PostgreSQL, hosted, and production-build evidence remain open.
