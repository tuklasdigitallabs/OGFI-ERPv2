# DEC-0078 — Initial Procurement Source Serialization

## Metadata

- Decision ID: `DEC-0078`
- Title: Serialize initial procurement approval submissions and balance-closure requests
- Status: `Confirmed and implemented — PostgreSQL execution and activation gates pending`
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

- Execute the authored PostgreSQL concurrent one-winner cases for Purchase Request, Quotation Recommendation, and Balance Closure together with the existing Purchase Order and Amendment cases.
- Keep notification failure rollback and retry/cardinality coverage.
- Treat normalized routing and production promotion as NO-GO until disposable PostgreSQL evidence passes and source serialization is accepted.

## Implementation and documentation impact

- Code: `purchaseRequests.ts`, `quotes.ts`, and `purchaseOrders.ts`.
- Data/schema: no migration; existing Purchase Request/Quotation Recommendation versions remain authoritative.
- Workflow/permissions: no policy change; status claim occurs before approval graph creation.
- Knowledge base/glossary: direct-user and role-scoped notification behavior clarified; race gate documented.
- Tests/UAT: focused unit/source-contract coverage plus five-path PostgreSQL parity and source-serialization specifications. The three new race specifications are authored but unexecuted and are not production evidence.

## Evidence

- DEC-0050 parity implementation and 67 focused local tests.
- Independent QA and Security reviews: GO only for dormant/source-control checkpoint; NO-GO for production until the three authored races execute and are accepted.
- `CURRENT_PENDING_IMPLEMENTATION_PLAN.md` DEC-0050 checkpoint.

## Implemented checkpoint reconciliation — 2026-07-26

- All five initial procurement paths use the shared direct-user step-ready
  notification contract. Direct-user first steps create at most one deterministic
  personal notification; role-scoped first steps create zero personal notifications.
- Purchase Request and Quotation Recommendation use the confirmed transactional
  source compare-and-set, and Purchase Order Balance Closure uses the confirmed
  authoritative Purchase Order row lock and pending-child recheck. Purchase Order
  submission and Purchase Order Amendment retain their existing compare-and-set
  controls.
- Exactly three additional PostgreSQL one-winner specifications are authored for
  Purchase Request, Quotation Recommendation, and Purchase Order Balance Closure.
  They require one successful submission, one rejected loser, one approval instance,
  one direct-user readiness notification or zero role-scoped personal notifications,
  and no duplicate source, audit, or child effects. The loser must report the exact
  family conflict (`INVALID_STATUS_TRANSITION`,
  `QUOTATION_RECOMMENDATION_ALREADY_SUBMITTED`, or
  `PURCHASE_ORDER_CLOSURE_ALREADY_PENDING`) rather than an unrelated database,
  timeout, or connection failure.
  They remain unexecuted because `DISPOSABLE_DATABASE_ADMIN_URL` is unavailable and
  therefore provide no production behavioral evidence.
- The active approval step remains the role-scoped source of truth, but the public
  Approval Inbox is deliberately unavailable while
  `APPROVAL_ROUTING_V1_ENABLED=false`. No personal role-member fanout and no parallel
  flag-off Inbox are authorized. The existing manual approval-reminder scan can
  surface eligible due or overdue work to the current user, but it is not a complete
  actionable queue and its approval links remain unavailable. Complete role-scoped
  discovery therefore depends on the normalized Inbox passing its activation gates.
- Normalized routing, Workspace 1 completion, and production promotion remain
  **NO-GO** pending execution and acceptance of the authored PostgreSQL matrix,
  visible role-scoped Inbox activation, exact-candidate authorization/E2E, and hosted
  release/recovery evidence.
- Parent-led reconciliation confirmed this bounded follow-up. Requested Code Spark
  and exact GPT-5.4 models were unavailable, so the closest permitted GPT-5.6
  documentation fallback was used without relaxing any gate.
- Current source-control evidence passes 48/48 focused approval-routing tests, web
  lint and typecheck, E2E typecheck, the production build, secret review, and the
  full non-database web suite with 1,389 passed, 305 skipped, and one existing TODO.
  The initial-notification file discovers 20 PostgreSQL cases and skips all 20
  without the guarded database; the exact disposable command fails closed with
  `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`.
- Final independent Security/QA and Product/enablement re-reviews found no remaining
  Critical, High, or Medium issue after exact loser-error assertions and the partial
  flag-off reminder-scan documentation correction. Both return GO only for this
  source-control checkpoint and NO-GO for activation.
