# DEC-0112 — Administration Organization Locations Pagination Decision Brief

## Decision question

What is the next bounded Administration implementation after the Role Library registry?

## Why now

The Organization Scope tab still renders all selected-company locations, brands, and departments from eager overview reads without URL-backed filters or pagination. The workspace audit and pending plan require server-backed operational list behavior. Audit pagination is a separate contract because its date semantics, totals, and export parity need independent evidence.

## Candidate decision

Implement the Locations registry first: selected-company server-owned query/status filters, bounded page/page-size, exact count/page parity, deterministic `name ASC, id ASC` ordering, explicit empty state, and responsive list/detail links. Preserve existing create and detail actions; do not broaden tenant-wide organization visibility.

## Alternatives

- Audit pagination first: valuable, but its current scope/filter/export boundary is already implemented and needs a distinct date/count/export decision.
- Paginate all organization and audit surfaces together: rejected as too broad and likely to mix distinct scope predicates and projections.
- Defer: rejected because the current locations list is a known unbounded visible read.

## Hard constraints

- Preserve `core.tenant_role_administer` plus selected-company `MANAGE` authorization and no-query denial.
- Locations are filtered by `tenantId` and selected `companyId`; no `All Companies` mode is added.
- Count and page predicates must be identical; page bounds are 10–100 with a bounded page number.
- Create, edit, deactivation, and detail authorization remain existing server-side controls; this slice adds no mutation authority.
- Do not use unbounded selectors or client-side slicing to imply pagination.

## Required evidence

Focused service/page tests for authorization, company isolation, bounds, deterministic order, filters, count/page parity, empty state, and detail links; then lint, typecheck, full regression, authorization manifest, production build, `git diff --check`, responsive browser, disposable PostgreSQL, and hosted gates as applicable.

## Model note

Code Spark and GPT-5.4 were unavailable; the closest permitted GPT-5.6 fallback is used and recorded without relaxing any hard gate.
