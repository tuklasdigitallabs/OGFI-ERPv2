# DEC-0078 — Initial Procurement Source Serialization

## Metadata

- Decision ID: `DEC-0078`
- Title: Serialize initial procurement approval submissions and balance-closure requests
- Status: `Confirmed`
- Date: 2026-07-24
- Decision owner: OGFI ERP product/engineering
- Decision Chair: Parent agent
- Related phase/module: Phase I procurement approvals; SPF-006
- Related decision brief: DEC-0050 initial notification parity checkpoint

## Decision

Use an in-transaction status compare-and-set on Purchase Request and Quotation Recommendation before creating approval instances. Serialize Purchase Order balance-closure requests by locking the tenant/company-scoped Purchase Order row before rechecking pending closures and creating the closure approval child. Any failed claim is rejected and the transaction rolls back, preserving exactly-once source/approval/notification effects.

## Context

The five initial procurement notification paths were aligned to direct-user versus role-scoped semantics, but three source workflows could still race: two submissions could both observe `DRAFT`, or two balance closures could both observe no pending closure, then create duplicate approval instances and notifications.

## Options considered

### Option A — selected: source CAS plus authoritative row lock

- Summary: claim `DRAFT` source rows with a scoped `updateMany` status CAS; lock the Purchase Order row with `FOR UPDATE` before the closure pending-child check.
- Benefits: no schema migration, transactional rollback, explicit one-winner behavior, preserves existing source status/version semantics.
- Failure modes: requires PostgreSQL behavior for the raw row lock and executable race coverage.
- Why selected: closes the identified race with the smallest reversible change while retaining server-side scope and approval controls.

### Option B — rejected: application pre-read and pending-child query only

- Summary: retain current non-locking reads and rely on transaction boundaries.
- Failure modes: concurrent requests can both pass the predicate and create duplicate approval/source children.
- Why rejected: fails exactly-once and production-readiness gates.

### Option C — rejected for this slice: new pending-unique schema constraints

- Summary: add partial uniqueness constraints for pending approvals/closures.
- Benefits: strong database invariant.
- Why rejected: requires a broader migration and status-lifecycle design; not necessary once source CAS/row lock is applied, but may be revisited if future workflows need a durable cross-service invariant.

## Hard-gate assessment

- Tenant/company/location predicates remain on source claims and the Purchase Order lock.
- Existing server-side permission, scope, prohibited-actor, and no-self-approval checks remain unchanged.
- Approval, audit, source transition, and notification writes remain in one transaction and roll back together.
- No inventory balance or ledger behavior changes; no records are hard-deleted.
- The change remains inside Phase I and has a deterministic fallback error for a lost claim.

## Required safeguards

- Add and execute PostgreSQL concurrent one-winner cases for Purchase Request, Quotation Recommendation, and Balance Closure, plus existing Purchase Order and Amendment cases.
- Keep notification failure rollback and retry/cardinality coverage.
- Treat normalized routing and production promotion as NO-GO until disposable PostgreSQL evidence passes and source serialization is accepted.

## Implementation and documentation impact

- Code: `purchaseRequests.ts`, `quotes.ts`, and `purchaseOrders.ts`.
- Data/schema: no migration; existing Purchase Request/Quotation Recommendation versions remain authoritative.
- Workflow/permissions: no policy change; status claim occurs before approval graph creation.
- Knowledge base/glossary: direct-user and role-scoped notification behavior clarified; race gate documented.
- Tests/UAT: focused unit/source-contract coverage plus authored PostgreSQL matrix.

## Evidence

- DEC-0050 parity implementation and 67 focused local tests.
- Independent QA and Security reviews: GO only for dormant/source-control checkpoint; NO-GO for production until three races are covered.
- `CURRENT_PENDING_IMPLEMENTATION_PLAN.md` DEC-0050 checkpoint.
