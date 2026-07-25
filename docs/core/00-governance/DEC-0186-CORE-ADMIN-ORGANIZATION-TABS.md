# DEC-0186 — Core Administration Organization Scope Tabs

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision Chair:** Parent implementation agent

## Decision

Organization Scope now uses URL-backed nested sections for Companies / Summary,
Brands, Departments, and Locations. Only the selected registry is rendered and
its corresponding bounded page read is loaded. Existing selected-company and
tenant authorization, filters, pagination, option catalogs, and create services
remain unchanged.

## Controls

- Core Administration, tenant-role authority, and selected-company Manage scope
  are checked before any organization read.
- Company, brand, department, and location records retain their tenant/company
  predicates and deterministic pagination. Location creation receives only the
  bounded active brand catalog when Locations is selected.
- Nested tab and filter URLs preserve the selected organization section; no
  organization mutation or schema behavior changes.

## Deliberation and gates

Product identified the remaining dense multi-register Organization surface as a
High IA blocker; Architecture noted the shared Administration gate remains
required after this additive correction. The requested Spark/GPT-5.4 models were
unavailable; the closest permitted GPT-5.6 fallbacks were used and recorded.
Core Admin focused tests, TypeScript, lint, production build, and diff checks
pass. PostgreSQL no-query/query-plan, responsive browser, hosted recovery, and
UAT evidence remain open.
