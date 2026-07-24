# DEC-0113 — Core Administration Audit Redaction and Bounded Pagination

## Metadata

- Decision ID: `DEC-0113`
- Status: Confirmed
- Date: 2026-07-24
- Decision Chair: Parent implementation agent
- Scope: Phase I / Core Administration / Audit Trail registry, detail, and export

## Decision

Implement the Audit Trail as one server-owned, read-only slice combining an allowlisted
detail projection, recursive sensitive-value redaction, deterministic keyset pagination,
and export parity. The shared resolver must enforce tenant-role authority and selected-
company `MANAGE` before any audit query or export-start write. Organization pagination is
deferred until this slice is complete and independently gated.

Use `occurredAt DESC, id DESC` ordering, a default page size of 25 and maximum of 100,
bounded/validated filters, and one tenant/company/null-company predicate for count, page,
detail eligibility, and export. Never mutate immutable audit JSON. Raw before/after/
metadata, actor email, IP, credentials, tokens, evidence storage references, and other
policy-sensitive values are not default UI or CSV output. Export must disclose applied
filters, row count, and any explicit volume/async outcome; it may not silently present a
500-row cap as a complete export.

## Hard gates and evidence

- Preserve tenant isolation, tenant-role authority, selected-company scope, append-only
  audit history, and non-enumerating direct-route denial.
- Add tests for no-query denial, cross-company/tenant isolation, recursive redaction,
  unchanged stored JSON, cursor ties/stale cursors, count/page/export parity, >500 rows,
  bounded filters/date ranges, CSV escaping, and denied export side effects.
- Review representative query plans before any index migration. No schema migration is
  authorized by this decision.

## Deliberation

Independent Architecture and Security reviews (2026-07-24) both recommended audit first.
They identified the current raw detail projection and silent `take: 500` list/export cap
as higher confidentiality and evidence-integrity risks than the selected-company-scoped
Organization Scope lists. Code Spark and GPT-5.4 were unavailable; GPT-5.6 fallback
reviewers were used without relaxing any hard gate.

## Reversibility and follow-up

Projection, URL cursor, and UI changes are reversible. Historical audit rows must not be
rewritten. Organization Locations pagination requires a separate reviewed contract after
this slice's redaction, export, and production-readiness evidence is complete.

## Implementation evidence

The source checkpoint now provides the shared resolver, bounded keyset page contract,
filter-bound cursors, recursive output redaction, direct export preflight, and visible
first/next-page controls. Focused Core Admin tests pass 18/18, report tests pass 11/11,
the full web regression passes 1,294 tests with 301 skipped and one TODO, authorization
manifest coverage passes 20/20, and the isolated production build passes. Responsive
browser, disposable PostgreSQL query/no-mutation, export-volume, and hosted recovery
gates remain open; this decision does not declare Audit Trail or Workspace 2 complete.
