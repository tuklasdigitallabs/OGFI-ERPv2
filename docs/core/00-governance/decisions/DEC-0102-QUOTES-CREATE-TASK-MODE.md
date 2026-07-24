# DEC-0102 — Supplier Quote Create Task Mode

## Metadata

- Decision ID: `DEC-0102`
- Title: Dedicated Supplier Quote capture task mode
- Status: Confirmed for implementation; workspace completion remains open
- Date: 2026-07-24
- Decision owner: Procurement / Quotations workstream
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Quotations

## Decision

Expose supplier-quote capture at `/quotes/new` as a dedicated, deep-linkable task mode and remove the repeated register-level capture sheet trigger. Reuse the existing `createSupplierQuote` service, schemas, tenant/company/location authorization, approved-Purchase-Request eligibility, and audit behavior. This is a presentation-boundary improvement only: it does not create a Purchase Order, submit a recommendation, alter quote policy, or make the Quotes workspace complete.

## Rationale and alternatives

The existing editor is already a focused multi-line workspace, but the register embeds its trigger alongside repeated quote cards and recommendation forms. A dedicated route gives quote capture clear scope, navigation, empty/configuration states, and mobile task context without duplicating write logic. Keeping the existing sheet was acceptable for the current editor but leaves the register's repeated-action information architecture unresolved; a new comparison authority or direct database write was rejected.

## Hard gates and follow-up

- Server authorization, approved-PR scope, supplier/UOM eligibility, validation, audit, and retry behavior remain owned by the existing service.
- The route explicitly states quote capture does not commit a PO and handles no approved requests or missing supplier/UOM configuration truthfully.
- Quotes workspace completion remains blocked by bounded queue pagination/search, selected-record comparison detail, per-line commercial/evidence fields, create idempotency, and recommendation-time policy revalidation.
- Required verification is focused route/service coverage, typecheck/lint, responsive browser evidence, PostgreSQL authorization/query-plan evidence, and hosted gates.

## Documentation impact

The implementation plan and Quotes UI specification must record the route and its draft/capture-only boundary. User guidance should link to `Record Supplier Quote` as a focused task while continuing to explain that recommendation and Purchase Order issuance are separate controlled actions. No glossary term changes are required.

## Deliberation evidence

Independent UX/data review recommended a conditional implementation of the focused capture boundary while keeping the full Quotes workspace open. Requested Code Spark/GPT-5.4 identifiers were unavailable; the closest permitted fallback specialist was used without relaxing hard gates.
