# DEC-0244 — Normalized Approval Decision Surface Contract

## Metadata

- Decision ID: `DEC-0244`
- Title: Normalized Approval Decision Surface Contract
- Status: `Confirmed — local implementation complete; feature disabled; activation NO-GO`
- Date: 2026-07-27
- Decision owner: Shared Production Foundation / Approval Routing
- Decision Chair: Parent agent
- Related phase/module: Phase I shared Approval Inbox and normalized approval routing
- Related decisions: `DEC-0050`, `DEC-0051`, `DEC-0052`, `DEC-0074`, `DEC-0075`, `DEC-0076`
- Related decision brief: Parent-led normalized approval decision-surface versus backfill sequencing deliberation

## Decision

While `APPROVAL_ROUTING_V1_ENABLED=false`, establish one closed, server-owned
approval decision capability and availability contract for all 18 registered
document families. The same contract must control command parsing, service
dispatch/preflight, and UI action rendering. It contains exactly 18 `APPROVE`, 14
`RETURN`, and 18 `REJECT` capabilities. Normalized `PaymentRequest APPROVE` remains
a declared capability but is unavailable: the UI must visibly disable it with a
stable policy-hold explanation, and every direct server attempt must fail closed
with the matching stable policy-hold reason. `PaymentRequest RETURN` and `REJECT`
remain available.

The contract must expose a stable capability version and deterministic digest.
Any later mapping-bound backfill cursor must bind both the approval-routing
mapping version/digest and this capability version/digest. Backfill, drain,
cutover, flag activation, and production promotion are separate later
checkpoints. This decision grants no approval authority, resolves no finance
policy, changes no legacy source-workspace action, and authorizes no money,
inventory, settlement, journal, or other source effect.

## Closed capability and availability matrix

`Supported` means the family/action pair is part of the closed typed contract.
`Available` means the normalized decision service may proceed beyond the
availability guard, subject to all existing authorization, scope, status,
evidence, concurrency, and family-policy checks. It does not mean the feature is
activated or that an actor is authorized.

| Document family | Approve | Return | Reject | Normalized availability exception |
|---|---:|---:|---:|---|
| `PurchaseRequest` | Supported | Supported | Supported | None |
| `QuotationRecommendation` | Supported | Supported | Supported | None |
| `PurchaseOrder` | Supported | Supported | Supported | None |
| `PurchaseOrderBalanceClosure` | Supported | Supported | Supported | None |
| `PurchaseOrderAmendment` | Supported | Supported | Supported | None |
| `WastageReport` | Supported | Supported | Supported | None |
| `StockAdjustment` | Supported | Supported | Supported | None |
| `FinanceCloseRun` | Supported | Not supported | Supported | None |
| `BudgetRevision` | Supported | Not supported | Supported | None |
| `ExpenseRequest` | Supported | Supported | Supported | None |
| `CashAdvanceRequest` | Supported | Supported | Supported | None |
| `PettyCashRequest` | Supported | Supported | Supported | Amount changes remain prohibited; unchanged-proposal actions retain `DEC-0052` and `DEC-0076` safeguards |
| `PaymentRequest` | Supported | Supported | Supported | `APPROVE` unavailable on the unresolved payment-readiness policy hold; `RETURN` and `REJECT` available |
| `PaymentRelease` | Supported | Not supported | Supported | None |
| `EmployeeLeaveRequest` | Supported | Supported | Supported | None |
| `EmployeeOvertimeRecord` | Supported | Not supported | Supported | None |
| `WorkforceSchedule` | Supported | Supported | Supported | None |
| `AttendanceImportBatch` | Supported | Supported | Supported | None |
| **Exact totals** | **18** | **14** | **18** | **One unavailable supported action: `PaymentRequest APPROVE`** |

## Context

The normalized approval implementation already has a closed 18-family routing
registry and typed decision schemas, but capability knowledge can drift if the
parser, service branches, tests, and UI infer supported actions separately. That
drift can expose a button the server rejects, let a direct caller reach an action
the UI suppresses, or cause later backfill to classify records against a different
family/action contract from the runtime that consumes them.

The remaining Payment Request approval policy is deliberately unresolved.
Treating all syntactically supported actions as currently available would make
`PaymentRequest APPROVE` appear usable even though the canonical server must reject
it. Removing it from the capability registry would hide an intentional contract
and make later policy activation look like an unrelated mapping expansion.
Separate `supported` and `available` facts keep that boundary truthful.

The deliberation also exposed a sequencing dependency. Architecture initially
recommended backfill first so the surface could be exercised against populated
normalized records. QA recommended the decision surface first so parser, service,
rendering, disabled-state, and duplicate-submit behavior could be specified and
tested consistently. Challenge found a blocker in each isolated approach: a
surface without mapped records cannot complete behavioral acceptance, but a
resumable backfill cannot safely bind its cursor to an approval contract without a
stable version and digest. The Decision Chair selected the capability contract
first because it creates the compatibility input required by the next
mapping-bound backfill checkpoint. It does not claim surface or backfill
acceptance is complete.

## Options considered

### Option A — selected: capability and availability contract before backfill

- Summary: Define one closed server-owned matrix, distinguish support from current
  availability, bind parser/service/rendering to it, and add a stable
  version/digest before designing the mapping-bound backfill cursor.
- Benefits: Prevents capability drift; gives unavailable actions a truthful
  fail-closed representation; supplies the stable backfill compatibility input;
  and permits focused contract, accessibility, and duplicate-submit testing while
  routing remains disabled.
- Failure modes: Consumers may retain local action lists; the digest may omit an
  availability or reason change; UI disabling may be mistaken for authority; or a
  feature-disabled checkpoint may be misreported as activation readiness.
- Why selected: Backfill must be bound to the same versioned capability contract
  that will parse, execute, and render its mapped records.

### Option B — rejected as this checkpoint: backfill and drain first

- Summary: Populate or reconcile normalized Approval Instances before stabilizing
  the decision-surface contract.
- Benefits: Provides real mapped records for end-to-end surface testing.
- Failure modes: A cursor can resume under changed family/action availability;
  rows can be classified against different runtime capability knowledge; restart
  evidence cannot prove which contract applied; and policy-held actions can be
  surfaced inconsistently.
- Why rejected: Backfill remains the next required checkpoint, but it must consume
  and persist stable mapping and capability identities created here.

### Option C — rejected: combine surface, backfill, drain, and cutover

- Summary: Deliver the capability contract, UI actions, historical mapping,
  drain, and readiness decision together.
- Benefits: Could produce one broad end-to-end candidate.
- Failure modes: Couples a reversible source contract to populated-data mutation;
  obscures the source of failures; expands rollback scope; and pressures reviewers
  to accept partial evidence across multiple hard gates.
- Why rejected: Separate checkpoints create a reviewable compatibility boundary
  and prevent this implementation from silently authorizing data movement or
  activation.

### Option D — rejected: retain separate parser, service, and UI action lists

- Summary: Keep independently maintained capability knowledge and address
  mismatches through tests or local conditionals.
- Benefits: Minimal structural change.
- Failure modes: Tests can mirror rather than detect drift; unsupported actions
  may render; direct calls may bypass UI availability; stable backfill binding is
  unavailable; and policy holds become scattered presentation logic.
- Why rejected: One closed server-owned contract is required for fail-closed
  parity and durable compatibility binding.

## Hard-gate assessment

- **Tenant and organizational scope:** Capability discovery contains no record
  data and grants no scope. Each decision must still revalidate authenticated
  tenant/company and applicable location or source scope in the transaction.
- **Server-enforced authorization:** Rendering is not authority. The service must
  resolve the same contract entry and then apply live permission, assignment,
  effective-date, current-step, prohibited-actor, no-self-approval, and
  family-specific checks. Unknown and unavailable actions fail closed.
- **Approval segregation:** Existing prohibited-actor and no-self-approval rules
  remain mandatory. The matrix does not weaken `DEC-0075` evidence requirements.
- **Inventory, money, and audit integrity:** This checkpoint changes no source,
  inventory, or financial state. An unavailable denial creates no approval,
  source, notification, ledger, commitment, settlement, journal, or domain effect.
  Existing immutable audit rules remain applicable.
- **Transactional consistency and idempotency:** Actual decisions continue through
  canonical transaction-bound adapters and compare-and-set controls. UI pending
  protection does not replace server exactly-once and one-winner behavior.
- **Phase scope:** The contract covers only the existing 18 registered families.
  It adds no family, route, threshold, permission, source-workspace behavior, or
  future module.
- **Recovery and rollback:** The feature flag remains false. Backfill and drain
  require a separately reviewed restart, stop, rollback, and evidence plan and may
  not proceed under an unrecognized mapping or capability digest.

All applicable gates pass at decision-design level only. Behavioral, activation,
and production gates remain open.

## Required safeguards

- Store the 18-family matrix in one server-owned registry. Parser schemas, service
  dispatch/preflight, renderer view models, and tests must derive from or assert
  against it; no consumer may silently add a fallback action.
- Represent support and availability separately. An unavailable supported action
  must not be treated as unsupported, hidden without explanation, or accepted
  because it passed syntax validation.
- Preserve exactly 18 approve, 14 return, and 18 reject capabilities. Return is
  unsupported only for `FinanceCloseRun`, `BudgetRevision`, `PaymentRelease`, and
  `EmployeeOvertimeRecord`.
- Keep normalized `PaymentRequest APPROVE` visibly disabled and reject direct
  server invocation with one stable, user-safe policy-hold code/reason. Do not
  expose invoice eligibility, configuration, stack, or authorization details.
  Return and reject must not inherit the approve hold.
- Validate availability on the server after parsing and before any approval or
  source mutation. UI disabling is not the enforcement boundary.
- Give the contract an explicit stable version and deterministic SHA-256 digest
  over canonical, domain-separated content containing every family, supported
  action, action availability, and stable unavailability reason identifier.
  Object insertion order, presentation copy, and locale must not alter the digest.
- Treat any capability, availability, or reason-identifier change as a versioned
  contract change. Tests must reject missing, duplicate, unknown, or overridden
  entries and assert the exact version/digest fixture for the candidate.
- Require the next resumable backfill cursor/checkpoint to bind both routing
  mapping version/digest and capability version/digest. A mismatch, unknown
  version, incomplete identity, or changed digest must stop before further writes.
- Prevent duplicate UI submissions while an action is pending, while retaining
  server idempotency, locking, stale-state detection, and one-winner behavior for
  retries, multiple tabs, direct calls, and competing actors.
- Render controls with at least a 44px target, keyboard operability, visible focus,
  accessible name/state, and an accessible association between a disabled action
  and its reason. Disabled styling alone is insufficient.
- Keep `APPROVAL_ROUTING_V1_ENABLED=false`. Do not activate the normalized Inbox,
  change legacy source-workspace decisions, run backfill/drain, or claim UAT or
  production readiness under this record.

## Implementation and documentation impact

- Code / architecture: Introduce or refine one capability registry, stable
  version/digest, availability guard, and safe renderer projection. The canonical
  dispatcher and transaction-bound family adapters remain authoritative.
- Data / schema: No migration, populated-data write, backfill, drain, cursor, or
  historical rewrite is authorized. The next checkpoint owns the
  mapping-and-capability-bound cursor and recovery behavior.
- Workflow / permissions: No route, threshold, permission, segregation, status,
  or legacy source-workspace behavior changes. Payment Request approval remains
  held; return and reject remain available in the normalized contract.
- UI / mobile: Controlled implementation/verification surfaces derive actions from
  the server projection and provide pending/double-submit protection, 44px
  controls, keyboard/focus behavior, and the accessible Payment Request disabled
  reason. The production flag remains off.
- Reporting: No report, export, metric definition, or financial result changes.
- Knowledge base / training: No user-facing update is appropriate while disabled.
  Dunong must assess Approval Inbox guidance after UI, policy, backfill/drain, and
  activation behavior are approved and verified.
- Tests / UAT: Add exact matrix/cardinality, version/digest,
  parser/service/render parity, unsupported/unavailable direct-call, Payment
  Request return/reject, no-mutation, pending, duplicate-submit, accessibility,
  and responsive-browser coverage. Existing database authorization, concurrency,
  source-effect, notification, and audit matrices remain required.

## Open external and production gates

1. The separately reviewed mapping-bound backfill, resumable cursor,
   populated-data preflight, restart, drain, reconciliation, rollback, and cutover
   checkpoint.
2. Executed exact-candidate disposable-PostgreSQL all-family parity, isolation,
   prohibited-actor, live acting/next-actor revocation, concurrent decision,
   rollback, source-effect, notification, and audit-cardinality evidence. Authored
   or skipped tests are not evidence; the required environment has previously
   failed closed with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`.
3. Finance and Accounts Payable confirmation of Payment Request readiness,
   match/tolerance, exception ownership, source status, outstanding capacity, and
   active-request inclusion/exclusion policy.
4. Remaining Petty Cash amount-change, Expense commitment lifecycle, and
   controlled-evidence qualification/selection policies where they affect
   production actions.
5. Production-volume query-plan and bounded-page evidence, authenticated
   desktop/tablet/mobile browser proof, role-based UAT, hosted deployment and
   backup/restore/recovery rehearsal, production-authenticated E2E, and final
   Security, QA, DevOps, and Release acceptance.
6. An explicit activation decision for `APPROVAL_ROUTING_V1_ENABLED=true`, with
   exact-release rollback and compatibility evidence. Until then, normalized
   routing and the Approval Inbox remain feature disabled and production NO-GO.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement registry, version/digest, consumer parity, and Payment Request policy-hold availability | Backend + Frontend Engineering | Before capability-surface review | Complete locally behind disabled flag |
| Verify cardinalities, digest fixture, direct-call no-mutation, return/reject preservation, duplicate-submit, 44px, keyboard, focus, and accessible reason | QA + Security + Accessibility review | Before checkpoint acceptance | Local source/contract review complete; browser and PostgreSQL execution remain open |
| Design and deliberate the mapping-and-capability-bound backfill cursor, drain, restart, reconciliation, and rollback | Architecture + Database Engineering + QA + Security | Next approval-routing checkpoint | Pending; separate decision/checkpoint |
| Resolve Payment Request production approval eligibility policy | Finance + Accounts Payable + Product Governance | Before making normalized approve available | Open policy |
| Execute PostgreSQL, responsive browser, hosted recovery, UAT, and release gates | QA + Security + DevOps + Release Management | Before activation or production promotion | Pending / activation NO-GO |
| Assess and prepare role-based Approval Inbox guidance | Dunong | After policy, backfill/drain, UI, and activation approval | Handoff deferred |

## Evidence

- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` requires independent
  review and the applicable authorization, segregation, audit, transaction, scope,
  and recovery hard gates.
- `docs/core/00-governance/DECISION_SCORECARD.md` gives operational correctness and
  control the highest weight and prohibits scoring from overriding hard blockers.
- `docs/core/00-governance/decisions/DEC-0051-CANONICAL-APPROVAL-DECISION-PARITY-AND-ATOMIC-SOURCE-EFFECTS.md`
  confirms typed family commands, one decision authority, atomic source effects,
  and the disabled activation posture.
- `docs/core/00-governance/decisions/DEC-0052-APPROVAL-INTEGRITY-LOCKING-AND-TYPED-FINANCIAL-INTENT.md`
  confirms the single typed dispatcher, transaction locking, unresolved Payment
  Request policy, and feature-disabled posture.
- `docs/core/00-governance/decisions/DEC-0075-CANONICAL-PROHIBITED-ACTOR-AND-REVOCATION-EVIDENCE.md`
  records the closed 18-family breadth, four absent Return capabilities, and
  Payment Request approve as the sole policy-held preflight exclusion while
  return/reject remain in scope.
- `docs/core/00-governance/decisions/DEC-0076-PETTY-CASH-IMMUTABLE-STEP-INTENT-AND-PROPOSAL-CAS.md`
  confirms unchanged-proposal Petty Cash decisions without amount-change authority.
- `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md` preserves finance
  policies that must not be inferred from legacy behavior.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` records normalized
  routing as disabled and lists remaining database, browser, hosted, UAT, cutover,
  and production gates.
- `apps/web/src/server/services/approvalRoutingRegistry.ts` is the current closed
  18-family policy source and establishes mapping version/digest precedent.
- `apps/web/src/server/services/approvalDecisionCommands.ts` and its tests evidence
  the current 18/14/18 parser capability matrix made authoritative here.
- The parent-provided debate conclusion records QA's surface-first recommendation,
  Architecture's initial backfill-first recommendation, both challenge blockers,
  and the Decision Chair's capability-first selection because backfill must bind
  to its stable digest. Requested Code Spark and exact GPT-5.4 were unavailable;
  the closest permitted GPT-5.6 fallbacks were used without relaxing any gate or
  authorizing backfill, activation, or promotion.
- Local implementation provides capability version `1` and deterministic SHA-256
  digest `9059b8b0ef752d340b2f2d757f7298f7f66a07ea3a70db053421c534ae52e608`.
  Parser, normalized service preflight, and renderer consume that contract. The
  public detail route and its Server Action both fail closed while the flag is
  disabled, so deep links cannot bypass the disabled Inbox and legacy
  source-workspace actions remain unchanged.
- Local validation passes the 64/64 approval-routing contract suite, 20/20
  authorization-manifest suite, repository typecheck and lint, the production web
  build, release-tool self-test, secret review, and the full non-database
  repository suite: 1,475 web tests, 34 database-package tests, and one worker
  test. The disposable approval-routing PostgreSQL command
  fails closed with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`; no database credit
  is claimed.
- Independent Security and QA correction reviews returned GO for committing this
  feature-disabled source checkpoint with no remaining Critical, High, or Medium
  finding. Both keep activation at NO-GO pending backfill/drain, Payment policy,
  PostgreSQL, authenticated browser, hosted recovery, UAT, and explicit cutover
  acceptance.

### Decision-contract integrity hardening — July 27, 2026

The server-owned decision matrix is now deeply frozen at runtime, including its
family arrays and canonical decision-kind list. `getApprovalDecisionSurfaceContract`
and `assertNormalizedApprovalDecisionAvailable` reject non-string or malformed
family/decision inputs with the stable `APPROVAL_DECISION_REQUIRED` error before
contract lookup. The exact 18-family matrix remains unchanged: all families
support Approve and Reject, while Return is absent only for Finance Close,
Budget Revision, Payment Release, and Employee Overtime. Payment Request Approve
remains supported-but-unavailable under
`PAYMENT_REQUEST_APPROVAL_POLICY_UNCONFIRMED`; Return and Reject remain available.

Focused decision-contract coverage passes 6/6, repository lint and typecheck pass,
and the existing feature-disabled/legacy Payment behavior remains unchanged.
This hardening changes no approval authority, workflow status, database write, or
feature-flag posture; PostgreSQL, browser, hosted recovery, UAT, and activation
gates remain as documented above.

## Supersession

This decision is not superseded. It refines the decision-surface and sequencing
contract under `DEC-0051`, `DEC-0052`, and `DEC-0075`; it does not replace their
family parity, finance-policy, authorization, source-effect, concurrency,
backfill/cutover, or activation gates. A later decision that changes the closed
matrix, availability semantics, stable reason identity, digest binding, Payment
Request policy hold, or activation posture must amend or supersede this record.
