# DEC-0104 — Supplier Quote Comparison Workspace

## Metadata

- Decision ID: `DEC-0104`
- Title: Master-detail supplier quote comparison workspace
- Status: Confirmed for implementation; commercial/evidence capture remains a controlled follow-up
- Date: 2026-07-24
- Decision owner: Procurement / Quotations workstream
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Quotations

## Decision

Replace the vertically repeated Quotes register with a master-detail workspace. The left queue remains a server-paginated approved-Purchase-Request list; the selected request owns the comparison detail and one recommendation composer. The existing focused `/quotes/new` task remains the only quote-create entrypoint.

## Rationale and alternatives

- Selected: one selected-record comparison workspace. It directly remediates the `/quotes` High UI audit finding, keeps the active record and recommendation context together, and reduces repeated action forms while preserving service authorization.
- Rejected: incremental restyling of stacked cards because it preserves vertical sprawl and duplicate recommendation actions.
- Rejected: a separate detail route while leaving the register stacked because it improves only one surface and leaves the primary queue defect active.

## Hard-gate assessment

- Queue and detail data remain server-owned and tenant/company/location scoped through `listQuoteRequestsPage` and `quoteManage` authorization.
- Recommendation creation and submission continue through the existing approval services; the workspace cannot issue a PO, mutate a PR, or create inventory movement.
- The selected request visibly shows requester, required date, location context, quote status, recorded totals, line availability, lead time, terms, supplier accreditation, and recommendation state.
- Pagination, empty states, no-quotes states, and mobile stacked detail are explicit. Export remains separately authorized.
- Tax/discount/freight breakdowns and binary attachments are not invented: the UI labels them as unavailable until a controlled schema/evidence decision is implemented.

## Required safeguards and follow-up

- Add executable server tests for selected-record scope denial, recommendation duplicate/concurrency behavior, and no source-record or inventory side effects.
- Resolve the workflow/data-dictionary conflict on whether quote attachments are mandatory or optional before enabling attachment upload or declaring comparison readiness.
- Add persisted tax, discount, freight/other-charge, and landed-cost semantics only with a policy decision, Decimal calculations, recommendation revalidation, migration, export parity, and evidence tests.
- Run responsive browser, disposable PostgreSQL, production-build, and hosted release/recovery gates before workspace completion.

## Evidence

Independent deliberation recommended the master-detail option with the highest operational-control and maintainability score. It identified the attachment-policy conflict and unsupported commercial fields as blockers to claiming full comparison readiness. Requested Code Spark/GPT-5.4 models were unavailable; the closest permitted fallback specialist was used and hard gates were retained.
