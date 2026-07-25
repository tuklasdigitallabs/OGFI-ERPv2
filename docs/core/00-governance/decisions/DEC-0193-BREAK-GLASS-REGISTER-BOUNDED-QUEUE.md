# DEC-0193 — Break-Glass Register Bounded Queue

## Metadata

- Status: Confirmed
- Date: 2026-07-25
- Decision Chair: Parent agent
- Related phase/module: Phase I Administration / Break-Glass Access

## Decision

Use a tenant/company-authorized, server-paginated Break-Glass register with status, reason/evidence, target-user, and location filters. Replace repeated row modals with a selected-record TaskSheet containing mutually exclusive lifecycle actions. Target-user and location request catalogs are bounded; requesting is disabled when either catalog exceeds its safe preview cap.

## Hard-gate assessment

The service retains tenant/company predicates, server-side Core Administration and Manage authorization, privileged MFA, no-self approval/review, expiry and privilege-epoch invalidation, audit events, and transactional lifecycle claims. Target users must be active/effective members of the selected company or requested location. Inventory controls are unaffected. The change is schema-free and reversible.

## Safeguards and evidence

- Exact count, deterministic `createdAt DESC, id DESC`, clamped page state, and bounded page size prevent silent emergency-grant loss.
- Lifecycle transactions claim the expected status before assignment or terminal transition; expiry reconciliation claims ACTIVE rows before audit emission.
- Focused Break-Glass test, web TypeScript, lint, and production build pass.
- Disposable PostgreSQL authorization/query-plan, responsive browser, hosted recovery, and UAT evidence remain open.

## Rejected alternatives

- Keep `take: 50` and inline actions: rejected because pending or review-due grants can disappear and action repetition increases security error risk.
- Add an exhaustive target catalog: deferred; it requires a separate catalog-search contract and would expose an unbounded read.

