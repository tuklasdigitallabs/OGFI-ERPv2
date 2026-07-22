# DEC-0051 — Canonical Approval Decision Parity and Atomic Source Effects

## Metadata

- Decision ID: `DEC-0051`
- Title: Canonical Approval Decision Parity and Atomic Source Effects
- Status: `Confirmed`
- Date: 2026-07-22
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — normalized approval routing and Phase III finance/workforce source workflows
- Related decision brief: Parent-confirmed conclusion after independent Architecture, Operations, and Security deliberation
- Supersession note: `DEC-0052` supersedes this record's petty-cash reduced-amount behavior and safeguard. Until Finance and Operations confirm the amount-change policy, both legacy and canonical request approval must reject an explicit amount that differs from the current proposal.

## Decision

Normalized approval decisions must use strict typed commands for each document family, composed from shared transaction-bound approval primitives. Canonical approval routing is the sole decision authority while `APPROVAL_ROUTING_V1_ENABLED=true`; a source record's terminal approval effect occurs only on the final approval step and must commit atomically with the canonical step/instance outcome, source audit, and any required idempotent domain effects.

The family contracts additionally require the following behavior:

- Petty-cash request approval follows the later `DEC-0052` policy hold: no explicit amount change is accepted in either routing mode until authorized policy exists. Typed proposal/intent storage remains the target mechanism after that confirmation.
- Expense-request final approval persists the supplied supplemental evidence reference and creates the required budget commitments idempotently in the same transaction.
- Payment-request final approval freshly validates every linked AP invoice's eligibility, scope, supplier coherence, outstanding amount, and match/readiness state before approving the request.
- Budget revisions preserve the distinct `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED` commitment-fit stage. Submission creates the approval instance with its steps `WAITING`; `start_review` atomically moves the source to `UNDER_REVIEW`, activates the first step, records activation audit, and creates the permitted notification.

An `evidenceReference` is supplemental source context recorded with the decision and audit. It is not a verified attachment and must not be represented as satisfying the unresolved controlled-evidence qualification or explicit attachment-selection policy.

The feature flag remains off until behavioral PostgreSQL parity gates pass. This decision confirms the target architecture and behavior; it does not declare the implementation complete or authorize production activation.

## Context

The normalized Approval Inbox and canonical action engine establish live role, permission, scope, prohibited-actor, and no-self-approval authority. Existing source workspaces, however, also contain document-family decision handlers with business inputs and terminal effects that cannot be safely reduced to an untyped generic approve/return/reject bridge.

A generic bridge that locates a pending instance and dispatches only an approval ID, remarks, and action can lose family-specific intent such as a petty-cash amount reduction or expense evidence. It can also close the canonical approval before the source mutation or its commitments are durable, leaving the approval instance and source record inconsistent after a failure. Conversely, allowing each source handler to keep deciding independently preserves two approval authorities and permits action paths to bypass normalized routing.

Budget revisions expose a further semantic mismatch: `SUBMITTED` means the revision awaits a distinct Finance commitment-fit review, while canonical step activation normally makes an approval immediately actionable. Activating the first step on submission would collapse `SUBMITTED` and `UNDER_REVIEW`, contradict the source lifecycle and expose an approval before the review stage begins.

The selected design gives each family an explicit command contract while keeping authorization, step advancement, terminal cleanup, audit cardinality, and transaction ordering in shared primitives. Family code supplies validation and source effects; it does not become a second decision authority.

## Options considered

### Option A — selected: strict typed family commands over shared transaction-bound primitives

- Summary: Define explicit commands and handlers for each approval family. Execute live canonical authority checks, step transition, final-step source effect, audit, and required domain writes on one supplied transaction client.
- Benefits: Preserves family-specific inputs and invariants without duplicating routing authority; makes missing fields compile/test-visible; prevents approval/source split-brain; supports exact idempotency and per-family behavioral tests.
- Failure modes: A family adapter may omit a required validation or effect; a shared primitive may expose an unsafe extension point; a non-final step may accidentally mutate the source; or a handler may escape the supplied transaction.
- Why selected or rejected: Selected because it preserves one approval authority while retaining the operational semantics that differ across petty cash, expenses, payments, budgets, workforce, procurement, and inventory families.

### Option B — rejected: one generic source-workspace bridge using action, remarks, and approval ID

- Summary: Resolve the pending approval instance and call a generic canonical action without a typed family payload.
- Benefits: Small adapter surface and quick removal of obvious direct-decision bypasses.
- Failure modes: Type-erases reduced amounts, evidence, version expectations, and family-specific validations; encourages nested or separate transactions; and can silently apply legacy defaults that differ from the user's decision intent.
- Why selected or rejected: Rejected as the parity architecture. It may be useful only as temporary feature-disabled scaffolding and cannot satisfy the behavioral gate.

### Option C — rejected: keep source-family handlers as independent decision authorities

- Summary: Let each source workspace approve, return, or reject its record and separately synchronize the normalized approval instance.
- Benefits: Reuses existing handlers and preserves their current parameters.
- Failure modes: Creates dual authority, permits canonical routing bypass, can duplicate audit/actions, weakens live eligibility and no-self-approval enforcement, and allows source/approval divergence under concurrency or failure.
- Why selected or rejected: Rejected because canonical routing must be the sole decision authority when enabled.

### Option D — rejected: close canonical approval first, then apply source effects afterward

- Summary: Commit the approval outcome and perform source mutation, commitments, evidence persistence, and notifications in a later transaction or best-effort follow-up.
- Benefits: Simplifies the shared action transaction and isolates family code.
- Failure modes: A crash or validation failure can leave an approved instance attached to an unapproved source; retries can duplicate commitments or notifications; users can observe contradictory status; and recovery requires unsafe reconstruction.
- Why selected or rejected: Rejected because final approval and its authoritative source effect are one business transaction.

### Option E — rejected as an end state: retain legacy decisions and defer canonical parity

- Summary: Keep `APPROVAL_ROUTING_V1_ENABLED=false` and continue legacy source decisions indefinitely.
- Benefits: Avoids immediate migration risk and preserves current behavior during development.
- Failure modes: Leaves two implementations to maintain, blocks normalized-routing activation, and postpones executable assurance for known source-workspace bypasses.
- Why selected or rejected: Rejected as the target architecture. Keeping the flag off remains the mandatory release posture until the selected design passes all gates.

## Hard-gate assessment

- **Tenant and organizational scope:** The canonical action and family handler use the authenticated tenant/company context and revalidate applicable brand/location/source scope inside the transaction. Client-supplied IDs never widen scope.
- **Server-enforced authorization:** Inbox visibility, notification receipt, or source-page access is not authority. The action transaction revalidates the live actor, permission, assignment/effective dates, current step, and source state.
- **Approval segregation:** No-self-approval and prohibited-actor rules run through canonical authority on every step and again where a family has a stricter monetary or source-specific segregation rule.
- **Audit integrity:** Each decision produces the canonical immutable action audit and the required source/domain audit in the same transaction. Supplemental evidence is labeled accurately and is not promoted to verified attachment evidence.
- **Transaction consistency and idempotency:** Non-final approval advances only the canonical workflow. Final approval atomically commits the workflow outcome, source effect, terminal future-step cleanup, notifications, and idempotent commitments or equivalent family effects.
- **Phase scope:** The decision aligns existing approval families. It does not add payment execution, bank mutation, AP settlement, journal posting, inventory posting, or a new evidence policy.
- **Recovery and rollback:** The feature flag remains disabled until parity evidence passes. Rollback disables canonical decisions without deleting or rewriting approval, source, commitment, notification, evidence, or audit history; any post-activation rollback requires compatibility review for already-normalized records.

## Required safeguards

- Maintain a closed registry of approval document families and their typed approve, return, and reject commands. Unsupported or incomplete family mappings fail closed.
- Accept the active transaction client in shared canonical primitives and family-effect handlers. Do not open an independent transaction, call a public service that opens one, or defer authoritative work until after commit.
- Re-lock and freshly validate the approval instance, active step, source record, actor authority, applicable scope, prohibited actors, and expected source version/state before mutation.
- Apply source approval effects only when the action completes the final active step. Intermediate approvals may persist only explicitly defined approval-chain decision context; they must not mark the source approved or create final commitments.
- Terminate or otherwise make non-actionable all future steps on terminal approve, return, or reject according to the canonical invariant. Enforce exactly-once outcomes under competing actors and retries.
- Keep command payloads server-validated and family-specific. Do not place opaque unvalidated business payloads in generic JSON metadata as a substitute for typed inputs and constraints.
- For petty-cash requests, apply `DEC-0052`: reject an explicit amount that differs from the current proposal in both routing modes and expose no request-approval amount-change control. After Finance and Operations confirm the policy, a later reviewed change must validate and preserve any authorized proposal without silently restoring the original requested amount.
- For expense requests, persist the supplemental evidence reference supplied by the decision, perform over-budget reason/evidence checks, and upsert budget commitments using stable source event keys in the final transaction. Retrying or racing the final action must not create or inflate commitments.
- For payment requests, reload all lines and AP invoices at final action time. Reject stale, cross-scope, cross-supplier, duplicate, ineligible, insufficient-outstanding, or match/readiness-incoherent sources before any approval outcome commits.
- For budget revisions, create all normalized steps as `WAITING` on submission. `start_review` alone may atomically change the revision to `UNDER_REVIEW`, activate exactly the first step, write its activation audit, and create no more than the permitted role/direct-user notification behavior under `DEC-0050`.
- Treat free-text or legacy `evidenceReference` values as supplemental references only. Do not label them `VERIFIED`, `DURABLE`, `CLEAN`, or `AVAILABLE`, and do not use them to satisfy a high-risk attachment gate while `DEC-0047` remains open.
- Keep `APPROVAL_ROUTING_V1_ENABLED=false` until the exact-release PostgreSQL suite proves all registered families, typed payload preservation, intermediate/final behavior, source/version conflicts, live revocation/scope denial, no-self-approval, transaction rollback, audit cardinality, notification cardinality, idempotency, and concurrent exactly-once outcomes.

## Implementation and documentation impact

- Code / architecture: Replace generic decision dispatch as the parity mechanism with typed family commands and shared transaction-bound canonical primitives. Family adapters own validation and domain effects only; canonical routing owns authority and outcome sequencing.
- Data / schema: No schema change is confirmed by this record. If preserving intermediate family intent requires a new durable typed field or relation, it requires a reviewed migration, rollback analysis, and data-dictionary update; opaque metadata is not an assumed substitute.
- Workflow / permissions: Canonical routing becomes the sole decision path only when the flag is enabled. Budget-revision review remains a separate pre-approval activation stage. Existing family permissions and stricter segregation rules remain applicable.
- UI / mobile: Source-workspace actions and the Approval Inbox must submit the same typed command semantics and show whether an action advances another approval step or produces the final source outcome. Evidence UI must not imply attachment verification from a text reference.
- Reporting: Approval/source status reporting must remain coherent after each committed action. No new financial report or accounting result is authorized.
- Knowledge base / training: Dunong must assess approval guidance after the implemented UI and behavioral parity are verified, especially multi-step outcomes, budget-revision `Start Review`, the current petty-cash amount-change hold, and supplemental-versus-verified evidence wording.
- Tests / UAT: Require an executable PostgreSQL matrix for every registered family and action, with focused petty-cash amount, expense commitment/evidence, payment invoice eligibility, and budget-revision activation cases plus rollback, retry, concurrency, scope, revocation, SoD, audit, and notification assertions.

## Open policy gaps preserved by this decision

1. **Multi-step petty-cash reduction authority:** Finance/Operations must confirm whether a later approver may further reduce, restore, or otherwise change an earlier reduced amount; which value is shown as the authoritative proposed/final amount at each step; and what reason or renewed consent is required.
2. **Expense commitment lifecycle:** Finance must confirm when an approved expense commitment is consumed or released after AP handoff, payment, completion, cancellation, return, rejection, or reversal, including idempotent event ownership and reconciliation behavior.
3. **Payment status and match coherence:** Finance must confirm the exact AP-invoice statuses, match outcomes/tolerances, exception owners, and outstanding-amount rules that make an invoice eligible or ineligible at final payment-request approval.
4. **Attachment selection and qualification:** `DEC-0047` remains open for the exact artifact/purpose/count/value matrix, explicit attachment selection, outage handling, and transaction-time validation of an active clean/durable object version. Supplemental text is not a substitute.

These gaps must not be silently resolved in code. Where they affect the exact family action, the flag remains off or the affected production action remains blocked until the authorized owner confirms the policy and executable tests cover it.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the typed family-command registry and transaction-bound canonical primitives without a second approval authority | Backend Engineering + Architecture | Before normalized-routing activation review | Pending verification |
| Prove all registered document families against the exact-release PostgreSQL behavioral parity matrix | QA + Backend Engineering + Database Engineering + Security | Before flag enablement | Pending |
| Confirm multi-step petty-cash reduced-amount authority and reason/consent rules | Finance + Operations | Before multi-step petty-cash production approval | Open policy |
| Confirm expense commitment consumption/release and reversal lifecycle | Finance + Accounting | Before production expense-to-AP/payment lifecycle | Open policy |
| Confirm payment-request AP status, match/tolerance, exception, and outstanding-amount eligibility matrix | Finance + Accounts Payable | Before production payment approval | Open policy |
| Resolve `DEC-0047` attachment qualification and explicit-selection policy | Finance + Security + Operations | Before mapped high-risk finance actions become production-ready | Open policy |
| Retain the disabled flag and capture rollback comparison, migration/readiness, and final Security/QA/Release acceptance | Release Manager + Security + QA | Before production activation | Pending |
| Prepare role-based user guidance from verified implemented behavior | Dunong | After UI parity and policy confirmation | Handoff required |

## Evidence

- The Decision Chair confirmed the conclusion on 2026-07-22 after independent Architecture, Operations, and Security deliberation. Requested GPT-5.3 Codex Spark and `gpt-5.4` council models were unavailable; the chair used the closest available specialist fallbacks and retained the same hard-gate protocol. Model availability did not relax any gate or authorize activation.
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` requires one parent-owned decision, server authorization, approval segregation, audit completeness, atomic/idempotent transactions, phase discipline, and a rollback path.
- `docs/core/00-governance/DECISION_SCORECARD.md` gives operational correctness and control the highest weight and prohibits a score from overriding approval, audit, tenancy, or transaction-integrity blockers.
- `docs/core/00-governance/decisions/DEC-0050-BOUNDED-DENIAL-AUDIT-AND-ROLE-SCOPED-APPROVAL-WORK.md` makes the active normalized step authoritative, requires live action-time eligibility and compare-and-set outcomes, and keeps activation gated.
- `docs/core/03-data/ERP_DATA_DICTIONARY.md` defines normalized routing, budget-revision review states, expense commitments, petty-cash approved amounts, payment-request AP-invoice lines, and the non-posting Phase III boundaries.
- `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md` records the unresolved controlled-evidence qualification and Phase III finance policies that implementation must not invent.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` records that normalized routing remains behind `APPROVAL_ROUTING_V1_ENABLED=false` and that source-workspace parity and all-family action evidence remain activation blockers.
- Current implementation references reviewed for the decision include `apps/web/src/server/services/approvals.ts`, `approvalDecisionMode.ts`, `sourceApprovalDecisionBridge.ts`, `pettyCash.ts`, `expenseRequests.ts`, `finance.ts`, and `budgetControl.ts`, plus their focused tests. These references are implementation evidence, not proof that the confirmed parity gates have passed.

## Supersession

This decision is not superseded. A later decision that changes canonical decision authority, family command contracts, final-step atomicity, budget-revision activation semantics, or evidence qualification must explicitly supersede or amend this record.
