# DEC-0114 — Core Administration Locations Registry Pagination

## Metadata

- Decision ID: `DEC-0114`
- Status: Confirmed
- Date: 2026-07-24
- Decision Chair: Parent implementation agent
- Scope: Phase I / Core Administration / Organization Scope / Locations

## Decision

Implement Locations as the next bounded Organization Scope subworkspace. Use a
server-owned selected-company registry with query, status, type, and optional brand
filters; exact count/page parity; deterministic `name ASC, id ASC` ordering; and bounded
URL-backed pages (default 25, maximum 100). Require `core.administer`,
`core.tenant_role_administer`, and active selected-company `MANAGE` before any count,
option, or row query. The immutable predicate is the signed-in tenant plus selected
company; no all-company mode is permitted.

Dependent create and onboarding selectors must use separate bounded active option
catalogs and disclose overflow. Paginated rows are never reused as an authorization or
selector catalog. Company, Brand, Department, and their detail/list contracts remain
separate follow-up slices; the Organization tab must not be called complete while those
surfaces remain unbounded or passive.

## Hard gates

- Explicit list projection only: ID, name, code, status, type, timezone, and safe brand label.
- Validate all filters/page inputs server-side; fail closed for forged or cross-company
  brand IDs without an existence oracle.
- Preserve direct location-detail authorization, create-location company/brand
  revalidation, no-query denial, and no mutation on denied reads.
- Prove responsive list states, exact count/page parity, deterministic ties, and
  disposable PostgreSQL authorization evidence before claiming the subworkspace ready.

## Deliberation and fallback

Independent Architecture and Security reviews agreed on Locations-first and rejected a
broad Organization contract because company, brand, department, and location semantics
have different scope and dependency boundaries. Code Spark and GPT-5.4 were unavailable;
GPT-5.6 fallback reviewers were used without relaxing hard gates.

## Reversibility

This is a read/query and UI contract with no schema migration or historical mutation.
Revert the registry and option-catalog changes independently of later Company, Brand, or
Department slices.
