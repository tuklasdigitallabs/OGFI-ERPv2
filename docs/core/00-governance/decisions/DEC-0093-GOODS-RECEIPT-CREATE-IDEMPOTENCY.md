# DEC-0093 — Goods Receipt Create Idempotency

## Metadata

- Decision ID: `DEC-0093`
- Title: Goods Receipt create idempotency
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: Receiving / Inventory workstream
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Receiving and Inventory
- Related decision brief: Parent-agent Goods Receipt create-idempotency council review (confirmed 2026-07-24)

## Decision

Add nullable `GoodsReceipt.idempotencyKey` and `GoodsReceipt.idempotencyRequestHash` fields, with a tenant/company/key unique constraint. New API and form callers must submit a bounded idempotency key. The canonical request hash binds the actor, selected receiving location, purchase order, request headers, and normalized submitted line fields. A same-key/same-hash retry may replay only after live permission and scope checks and exact original actor, location, and purchase-order binding; any changed payload, actor, location, purchase order, or foreign scope returns a stable conflict without exposing a receipt ID. The key is retained for the life of the receipt and is never emitted raw in logs or audit records.

## Context

Goods Receipt creation performs a controlled receiving transaction and may create audit, purchase-order, and inventory effects. Network retries, browser resubmission, or client timeouts can otherwise create duplicate receipts or produce ambiguous outcomes. Public-reference sequencing (`DEC-0092`) prevents duplicate references but does not identify or safely replay a repeated create request. Idempotency must therefore be durable, scope-bound, and checked against current authorization rather than treated as a client-only convenience.

## Options considered

### Option A — Durable key and canonical request hash on `GoodsReceipt` (selected)

- Summary: Store a bounded nullable key and 64-character canonical request hash on the receipt; enforce tenant/company/key uniqueness and perform live authorization plus exact binding checks before replay.
- Benefits: Additive schema change, one authoritative receipt lookup, safe retry semantics, no second idempotency store, and preserved history after completion or reversal.
- Failure modes: A malformed or reused key can produce a conflict; canonicalization drift can reject a retry; a key leaked through diagnostics could disclose request correlation.
- Why selected: It gives durable deduplication in the same transaction as receipt creation while preserving tenant/company isolation and avoiding an API-only cache.

### Option B — No durable create idempotency; rely on reference uniqueness or client retries

- Summary: Keep `DEC-0092` reference sequencing as the only duplicate defense.
- Benefits: No additional fields or request contract.
- Failure modes: A retry can create a second valid receipt with a different reference, duplicate inventory effects, and an unrecoverable ambiguity for the caller.
- Why rejected: Reference uniqueness is not request deduplication and does not satisfy receiving/inventory idempotency controls.

### Option C — Separate idempotency-request table or expiring cache (rejected)

- Summary: Store request keys and responses in a separate table or bounded cache, then map the result to the receipt.
- Benefits: Can support multiple endpoints and richer response replay metadata.
- Failure modes: Two transactional sources can diverge; retention/cleanup can reopen duplicate windows; cross-table authorization and tenant binding become easier to get wrong; a cache outage changes write semantics.
- Why rejected: It adds unnecessary transaction and lifecycle complexity for this endpoint. A later shared idempotency service would require a separate confirmed decision.

## Hard-gate assessment

- **Tenant/company and location scope:** The unique key is tenant/company scoped; replay requires current scope authorization and exact original receiving-location binding. Foreign-scope attempts fail closed without a receipt identifier.
- **Authorization and segregation:** A retry never bypasses current permission checks or receiving status rules; the original actor is part of the binding and a different actor receives a conflict.
- **Inventory and transaction integrity:** Key reservation, receipt creation, audit, PO effects, and any inventory posting remain in the existing transaction boundary. Idempotency does not permit a second movement posting.
- **Audit/history:** The key remains on the receipt indefinitely for reconciliation, while raw keys are excluded from logs and audit payloads. Conflicts are stable, user-safe outcomes.
- **Phase scope:** This is limited to Phase I Goods Receipt creation and does not introduce a generic automation or cross-module idempotency service.

## Required safeguards

- Validate key presence for new API/form callers and enforce a documented bounded length/character contract before any privileged lookup.
- Compute the hash from a canonical, versioned representation of actor, selected receiving location, purchase order, request headers, and normalized submitted line fields; do not hash raw JSON ordering or untrusted display text.
- On key collision, lock/read the existing receipt and re-run live permission, tenant/company/location scope, actor, PO, and hash checks before replaying. Never return the receipt ID for a mismatch or foreign-scope attempt.
- Treat changed payload, actor, location, PO, or scope as a stable idempotency conflict; do not overwrite the original hash or key.
- Keep key and hash writes atomic with receipt/audit/PO/inventory work. Preserve the key through cancellation, reversal, and archival paths.
- Do not include the raw key in application logs, audit descriptions, metrics, traces, error details, or client-facing conflict text; use a redacted/derived correlation value if operational diagnostics require one.
- Add tests for first success, same-request replay, concurrent same-key requests, changed payload, changed actor, changed location, changed PO, foreign tenant/company scope, malformed/oversized keys, rollback, and no-duplicate inventory movement.

## Implementation and documentation impact

- **Code / architecture:** Goods Receipt create service and route/form contracts must require and validate the key for new callers, compute the canonical hash, and implement the collision/replay/conflict path. Existing `DEC-0092` reference allocation remains separate.
- **Data / schema:** Add nullable `GoodsReceipt.idempotencyKey` (`VARCHAR(200)`) and `idempotencyRequestHash` (`CHAR(64)`), plus a unique `(tenantId, companyId, idempotencyKey)` index. Nullable storage preserves legacy rows and staged rollout compatibility; new callers remain required at the boundary.
- **Workflow / permissions:** No lifecycle or approval authority changes. Replay is subject to the same live receiving authorization and scope checks as a new create.
- **UI / mobile:** Receiving create forms and any mobile-capable caller must generate and submit a bounded key and present a safe retry/conflict message without exposing the key or receipt ID on mismatch.
- **Reporting:** No report semantics change; the fields are operational reconciliation metadata and must not be displayed as business identifiers by default.
- **Knowledge base / training:** Dunong should assess the retry/conflict behavior and add user guidance only after the API/form behavior is released and labels are confirmed.
- **Tests / UAT:** Execute unit/route, transactional, authorization/scope, concurrency, rollback, and disposable-PostgreSQL tests; verify exact-once inventory and PO effects and safe conflict responses.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement and review create-route key validation, canonical hashing, and replay/conflict handling | Receiving / Inventory engineering | Before Goods Receipt idempotency release | Implemented; focused tests pass |
| Run disposable-PostgreSQL concurrency, rollback, scope, and exact-once movement evidence | Database + QA | Before activation/UAT sign-off | Local disposable lifecycle passed migration, seed repeatability, receiving serialization/idempotency, and authority/closure races; hosted/UAT evidence remains pending |
| Update Goods Receipt data dictionary and receiving/API specifications for the new fields and contract | Documentation steward + Receiving owner | With implementation merge | Implemented |
| Assess end-user retry/conflict guidance and release-note impact | Dunong | Before user-facing release | Implemented in receiving KB, glossary, and changelog; release gate remains open |

## Evidence

- `AGENTS.md` §§ 4–5 and § 9: tenant/company/location scope, immutable inventory ledger, transactional posting, idempotency, audit, and validation controls.
- `docs/core/00-governance/decisions/DEC-0092-GOODS-RECEIPT-REFERENCE-SEQUENCE.md`: reference sequencing is transactional but explicitly does not deduplicate repeated create requests.
- `packages/database/prisma/schema.prisma`: additive Goods Receipt idempotency fields and tenant/company/key uniqueness definition.
- `packages/database/prisma/migrations/20260724130000_goods_receipt_create_idempotency/migration.sql`: additive nullable columns and unique index.
- Parent-agent independent council review and confirmation on 2026-07-24. Requested Spark/GPT-5.4 reviewer identifiers were unavailable; the closest permitted GPT-5.6 fallback was used without relaxing hard gates.

## Supersession

Not superseded. This decision complements, and does not replace, `DEC-0092`.
