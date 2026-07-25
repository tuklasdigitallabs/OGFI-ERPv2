# DEC-0182 — Supplier Selected Workspace Tabs

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision Chair:** Parent implementation agent

## Decision

The selected Supplier workspace uses mutually exclusive URL-backed Overview,
Catalog, Accreditation, and Audit sections. Overview and Accreditation do not
load the paginated catalog. Catalog retains the bounded item-link register and
DEC-0181 action composer. Audit is an intentional read-only handoff to the
bounded, redacted Admin Audit workspace because a supplier-specific projection
is not yet approved; it is not presented as local event data.

## Controls

- Supplier reads and actions remain Core Administration plus selected-company
  Manage authorized, tenant/company scoped, and selected IDs are navigation
  state only.
- Existing supplier and item-link mutations retain reason, re-read/status,
  non-destructive, and audit controls; no procurement or inventory state is
  changed.
- URL filters, supplier page, catalog page/filter, and action context are
  preserved across tabs. The Catalog tab remains paginated and the Audit link
  does not expose raw event metadata.

## Deliberation and gates

Architecture and Product independently recommended this active-tab projection
to remediate the documented High Supplier workspace IA finding. The requested
Spark/GPT-5.4 models were unavailable; the closest permitted GPT-5.6 fallbacks
were used and recorded. Supplier focused tests, TypeScript, lint, production
build, and diff checks are required. PostgreSQL authorization/query-plan,
responsive browser, hosted recovery, and UAT remain open; Supplier Master Data
is not complete. A supplier-specific bounded Audit projection remains an open
follow-up.
