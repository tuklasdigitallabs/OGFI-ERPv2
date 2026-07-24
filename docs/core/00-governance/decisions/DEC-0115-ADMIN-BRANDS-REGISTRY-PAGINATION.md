# DEC-0115 — Core Administration Brands Registry Pagination

## Metadata

- Decision ID: `DEC-0115`
- Status: Confirmed
- Date: 2026-07-24
- Decision Chair: Parent implementation agent
- Scope: Phase I / Core Administration / Organization Scope / Brands

## Decision

Implement Brands as the next Organization Scope registry after Locations. Use a
server-owned selected-company list with bounded name/code and status filters, exact
count/page parity, deterministic `name ASC, id ASC` ordering, and URL-backed pages
(default 25, maximum 100). Require `core.administer`, `core.tenant_role_administer`, and
active selected-company `MANAGE` before count, rows, or option queries. The immutable
predicate is the signed-in tenant plus selected company.

Keep Company as a single read-only selected-company identity summary. Use a separate
active selected-company Brand option catalog for location creation; paginated rows are
not selector authority. Departments remain a separate deferred contract because their
budget, cost-center, and workforce dependency counts require distinct least-data and
lifecycle rules.

## Hard gates

- Brand rows expose only ID, name, code, status, and selected-company context; no
  locations, assignments, finance, workforce, or legal/tax relations.
- Validate filters and page bounds server-side; direct detail routes and mutations retain
  tenant/company predicates and fail closed for foreign IDs.
- Prove no-query denial, count/page parity, deterministic ties, selector overflow, and
  responsive visible states before claiming Brands or Organization complete.

## Deliberation

Independent Architecture and Security reviews agreed on Brands-first. They identified the
documented Company → Brand → Location dependency and rejected Departments-first or a
combined Company/Brand/Department registry because the projections and authority
semantics differ. Code Spark and GPT-5.4 were unavailable; GPT-5.6 fallback reviewers
were used without relaxing hard gates.

## Reversibility

This is a read/query and UI contract with no schema migration or historical mutation.
Departments and Company summary behavior remain independently reversible and reviewable.
