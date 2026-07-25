# DEC-0180 — Item Master Active-Tab Projection

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision Chair:** Parent implementation agent

## Decision

The Item Master workspace uses an allowlisted URL-backed active-tab read
profile. Items load the item register, counts, and catalogs required by item
controls. Categories, UOMs, and conversions load only their selected register
and counts; inactive registers, selected records, and unrelated catalogs are
not hydrated. The page uses the shared compact `WorkspaceTabs` primitive and
discloses that inactive registers are not loaded in the current view.

## Controls

- Core Administration and selected-company management authorization remains
  server-enforced before profile queries.
- Tenant/company predicates, pagination, filters, and deterministic ordering
  remain in the existing read services; tab state is navigation state only.
- Selected IDs are bounded display context and never grant authority.
- Item, category, UOM, and conversion mutation services remain authoritative;
  no inventory, approval, or audit semantics change.

## Deliberation and gates

Architecture and Product independently recommended this slice. The requested
Spark/GPT-5.4 models were unavailable; the closest permitted GPT-5.6 fallbacks
were used and recorded. Focused Item Master tests, TypeScript, lint,
production build, and diff checks pass. PostgreSQL no-query/query-plan,
responsive browser, hosted recovery, and UAT evidence remain open; Master Data
and Phase I are not complete.
