# DEC-0103 — Supplier Quote Create Idempotency

## Metadata

- Decision ID: `DEC-0103`
- Title: Tenant/company-scoped supplier quote create retry safety
- Status: Confirmed for implementation; live database and concurrency evidence remain open
- Date: 2026-07-24
- Decision owner: Procurement / Quotations workstream
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Quotations

## Decision

Supplier quote creation uses a client-generated key and a canonical SHA-256 request hash. A unique `(tenantId, companyId, idempotencyKey)` database index prevents duplicate creation; an exact retry by the same actor and scoped payload returns the original quote without a second audit event. A changed payload, actor, or scope under an existing key fails closed without revealing the existing quote identifier.

## Options considered

- UI-only duplicate suppression — rejected because retries and concurrent submissions must be controlled server-side.
- Business-field uniqueness — rejected because legitimate supplier quotes can share references and details.
- Deterministic server-generated key — rejected because it cannot distinguish intentional repeated quotes from transport retries.

## Hard-gate assessment

- Tenant/company scope is part of the unique key and every lookup is scoped server-side.
- Actor, request location, supplier, header values, and normalized line values are included in the hash.
- The quote header, lines, and first-create audit event are posted in one transaction.
- A targeted unique-constraint race fallback replays only the idempotency conflict; unrelated database errors are rethrown.
- No quote submission creates a Purchase Order or inventory movement.

## Implementation and documentation impact

- Code / architecture: canonical `supplier-quote-v1` hash, transactional raw insert for migration-compatible clients, safe conflict feedback, and hidden UI key rotation when the Purchase Request changes.
- Data / schema: nullable `idempotencyKey` and `idempotencyRequestHash` on `SupplierQuotation`, with a tenant/company unique index that permits legacy nulls.
- Knowledge base / training: explain that an unchanged network retry is safe and changed details require a new task.
- Tests / UAT: focused source checks are required now; disposable PostgreSQL exact-retry, changed-payload, cross-scope, and concurrent-race tests remain release gates.

## Evidence

Independent idempotency review recommended the scoped key, canonical hash, transaction boundary, exact conflict behavior, and targeted unique-race recovery. Requested Code Spark/GPT-5.4 identifiers were unavailable; the closest permitted fallback specialist was used without relaxing hard gates.
