# DEC-0181 — Supplier Item-Link Action Composer

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision Chair:** Parent implementation agent

## Decision

The selected supplier catalog replaces repeated per-row item-link deactivation
modals with one URL-selected `TaskSheet` action composer. The selected link
context preserves supplier, catalog filters, and page; stale or foreign
selections are read-only and unavailable. A minimum five-character reason is
required.

## Controls

- The existing `deactivateSupplierItemLink` service remains authoritative for
  Core Administration permission, selected-company scope, tenant/company/link
  ownership, active-status re-read, non-destructive status change, and audit.
- The selected link ID and return path are navigation context only; they do not
  grant authority and the return path is restricted to `/suppliers`.
- No supplier, purchase-order, approval, or inventory state is changed beyond
  the existing audited link deactivation.

## Deliberation and gates

Architecture and Product independently recommended this focused remediation.
The requested Spark/GPT-5.4 models were unavailable; the closest permitted
GPT-5.6 fallbacks were used and recorded. Supplier focused tests, TypeScript,
lint, production build, and diff checks are required for acceptance.
PostgreSQL authorization/query-plan, responsive browser, hosted recovery, and
UAT evidence remain open; Supplier Master Data is not complete.
