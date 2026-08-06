# DEC-0265 — Receiving and Transfer Custody Fence

## Metadata

- Decision ID: `DEC-0265`
- Title: Receiving and transfer custody-fence implementation slice
- Status: `Confirmed`
- Date: 2026-07-31
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I Inventory Control Pilot — Receiving and
  warehouse-to-location Transfers
- Related decisions: `DEC-0011`, `DEC-0012`, `DEC-0024`, `DEC-0025`,
  `DEC-0093`, `DEC-0258`
- Related decision brief: Parent-led Phase 5 receiving/transfer custody-fence
  deliberation

## Decision

Deliver one bounded custody-fence slice: (1) show explicit pending-submit
feedback on the Receiving detail `Post Receipt` and `Reverse Receipt` actions;
(2) enforce transfer-dispatch transaction-time live authority, privileged MFA,
source-location scope, and authoritative line-endpoint validation before any
stock-affecting dispatch mutation; and (3) only after that fence exists, add
authenticated disposable-PostgreSQL browser scenarios for supplier
receive-to-reverse and transfer discrepancy capture.

The receiving pending state is interface feedback only. Server-side
idempotency, locking, authorization, MFA, and transactional posting remain the
authoritative controls. This decision introduces no approval family, cohort
activation, schema-policy change, deployment, release activation, origin push,
or settlement-finality rule.

Transfer discrepancy settlement finality and reopening after later receipt
reversal remain **OPEN** and must not be represented as a terminal custody
outcome, browser/UAT completion, or pilot-production readiness.

## Context

Supplier receiving and warehouse transfers are stock-custody workflows. Their
browser behavior must not receive end-to-end custody credit while a
stock-affecting dispatch can proceed using stale or revoked authority, stale
privileged MFA, an invalid source scope, or a transfer line whose inventory
location no longer matches the authoritative transfer header. Independently,
users need unambiguous feedback that a receipt post or reversal is in progress
without treating browser pending state as an exact-once safeguard.

Existing Phase I rules retain immutable inventory movements, accepted-only
receipt posting, full-document correction reversals, and a non-posting
discrepancy-settlement path. The policy for whether that settlement is final,
or whether a later receipt-event reversal can reopen it, has not been confirmed.

## Options considered

### Option A — selected: bounded custody fence before browser credit

- **Summary:** Add the focused receiving pending feedback, dispatch
  transaction-time authorization/MFA/endpoint fence, then authenticated
  disposable-PostgreSQL browser evidence for the two specified scenarios.
- **Benefits:** Removes the identified dispatch custody gap before claiming
  browser credit, preserves authoritative server controls, and produces
  narrowly scoped evidence for supplier correction and transfer exception
  capture.
- **Failure modes:** Stale authority could be checked only before locks;
  endpoint drift could allow the wrong source inventory location to be
  dispatched; duplicate browser submissions could be mistaken for exact-once
  protection; or discrepancy evidence could be overstated as settlement
  finality.
- **Why selected:** It is the smallest confirmed slice that passes the custody,
  authorization, inventory-integrity, and evidence-truthfulness gates without
  deciding the unresolved settlement policy.

### Option B — rejected: browser scenarios before the dispatch fence

- **Summary:** Add the supplier and transfer browser coverage first and defer
  dispatch live-authority/MFA/endpoint revalidation.
- **Benefits:** Faster apparent UI-test progress.
- **Failure modes:** A green browser scenario could conceal a stock-affecting
  dispatch by a revoked, out-of-scope, or stale-MFA actor, or through endpoint
  mismatch.
- **Why rejected:** The independent security challenge identified the dispatch
  fence as a blocking prerequisite for end-to-end custody credit.

### Option C — rejected: treat discrepancy settlement as final custody closure

- **Summary:** Include settlement terminality and later-reversal reopening in
  this slice.
- **Benefits:** Could present a complete exception outcome to users.
- **Failure modes:** Invents actor, reason, evidence, notification, audit, and
  status semantics before Operations, Inventory Control, and Security confirm
  them; could misstate inventory custody without a correction contract.
- **Why rejected:** Settlement finality/reopen semantics are unresolved policy,
  not an implementation gap that this record may silently decide.

### Option D — retained fallback: defer the slice

- **Summary:** Keep current behavior and claim no new browser custody evidence.
- **Benefits:** Introduces no new stock-affecting execution path.
- **Failure modes:** Leaves the dispatch-fence prerequisite unresolved and
  prevents the planned bounded browser evidence from advancing.
- **Why not selected:** The parent confirmed the bounded implementation slice;
  deferral remains the required fallback if its hard gates or test evidence do
  not pass.

## Hard-gate assessment

- **Tenant, company, and location isolation:** Dispatch must lock and
  revalidate the authoritative transfer, source inventory location, and each
  line endpoint; the endpoint must still match the transfer header before
  mutation.
- **Server-enforced authorization:** After inventory-location, transfer-header,
  and line locks, dispatch must revalidate the live actor, privilege epoch or
  session, permission, source-location scope, and privileged MFA. UI state,
  pre-lock checks, or an earlier browser session cannot grant authority.
- **Inventory and audit integrity:** All checks occur before `TRANSFER_OUT`,
  transfer-line roll-up, transfer status, or dispatch audit mutation. Receipt
  and reversal remain ledger-backed controlled actions; discrepancy capture
  must not create unapproved inventory, finance, adjustment, wastage, or
  replacement-transfer effects.
- **Transactional consistency and idempotency:** Receiving pending feedback
  cannot replace server-side request identity, locks, atomic mutation, or
  replay protection. A denied dispatch leaves no movement, roll-up, status, or
  audit success effect.
- **Phase discipline and recovery:** This does not add approval routing,
  settlement/reopen policy, operational activation, deployment, or a new
  recovery mechanism. Existing full-document receipt and receipt-event reversal
  contracts remain the only correction paths described by their decisions.

## Required safeguards and tests

- Revalidate the full dispatch authority/MFA/scope state from locked
  authoritative records immediately before dispatch mutation; map revocation,
  stale session/privilege epoch, stale MFA, permission, scope, and endpoint
  failures to safe denials.
- Prove a dispatch-revocation race on disposable PostgreSQL: a revocation that
  wins before the post-lock recheck prevents every `TRANSFER_OUT`, line/status
  roll-up, and success audit mutation.
- Prove source-location and line-endpoint mismatch, cross-tenant/company, and
  cross-location attempts fail closed with zero stock effect.
- Preserve the canonical transactional/idempotent transfer-dispatch behavior;
  prove concurrency cannot create duplicate `TRANSFER_OUT` movements.
- Keep `Post Receipt` and `Reverse Receipt` visibly pending/disabled while in
  flight, with explicit processing labels and accessible feedback; prove this
  feedback neither bypasses nor substitutes for server-side exact-once guards.
- Run authenticated disposable-PostgreSQL browser scenarios after the fence:
  supplier receive-to-reverse must prove accepted-only receipt movement and
  linked full-document reversal; transfer discrepancy capture must prove
  accepted-only destination movement, preserved discrepancy evidence, and no
  settlement-finality claim.
- Before any broader credit, retain production-authenticated browser, hosted
  recovery, signed human UAT, and release authorization gates. No deployment,
  activation, or origin push is authorized by this decision.

## Implementation and documentation impact

- **Code / architecture:** A focused dispatch service fence must execute under
  the existing transaction after the specified locks and before stock or audit
  mutation. Receiving uses the shared pending-action presentation pattern only.
- **Data / schema:** No new business entity, approval family, cohort, or
  settlement policy is authorized by this decision.
- **Workflow / permissions:** Dispatch authority remains live, source-scoped,
  privileged-MFA-gated, and server enforced. Receiving/reversal workflow and
  existing correction contracts remain unchanged.
- **UI / mobile:** Receiving actions expose in-flight processing feedback. The
  browser scenarios must exercise authenticated desktop/mobile-relevant action
  behavior, but do not announce general availability.
- **Reporting:** No reporting or final settlement status semantics change.
- **Knowledge base / training:** Dunong assessment is required only after the
  implemented UI labels and supported behavior are verified. User-facing
  material must not imply settlement finality or replace server controls with
  browser feedback.
- **Tests / UAT:** The required race, service, browser, recovery, and signed
  UAT evidence are gates; passing focused local coverage alone is not
  activation or release evidence.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement and verify the post-lock dispatch authority/MFA/endpoint fence. | Backend / Security | Before browser custody credit | Required |
| Add and execute the specified authenticated disposable-PostgreSQL browser scenarios. | QA / Frontend | After fence verification | Required |
| Resolve discrepancy-settlement finality and later-reversal reopening semantics. | Operations / Inventory Control / Security | Before treating settlement as terminal custody | **Open blocker** |
| Perform production-authenticated browser, hosted recovery, signed UAT, and release review. | QA / Release / Operations | Before activation | Blocking |
| Assess verified behavior for user-facing enablement. | Dunong | After implementation and verification | Pending handoff |

## Evidence

- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` — July 31,
  2026 Phase 5 receiving/transfer custody-fence checkpoint: selected slice,
  dispatch post-lock revalidation contract, focused local coverage, and open
  evidence gates.
- `docs/phases/phase-01-procurement-inventory/workflows/receiving-transfer-workflow.md`
  — accepted-only receiving/transfer posting, full-event correction, and the
  explicit open discrepancy-settlement finality/reopen policy.
- `DEC-0024` — full-document Goods Receipt reversal only.
- `DEC-0025` — event-backed transfer receipt, accepted-only destination stock,
  and non-posting discrepancy settlement.
- `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md` — settlement
  terminality/reversal-reopen policy remains open and cannot receive browser or
  pilot-readiness credit.
- Parent-led workflow/data-integrity deliberation and independent security
  challenge confirmed the dispatch fence as the custody-credit prerequisite on
  2026-07-31.
- Requested Code Spark and GPT-5.4-mini reviewers were unavailable; GPT-5.6
  Terra was used as the authorized fallback without relaxing the deliberation
  protocol or any hard gate.

## Supersession

This record supplements `DEC-0024` and `DEC-0025`; it does not supersede their
receiving or transfer-receipt/reversal contracts. It creates no decision on
discrepancy-settlement terminality, reopening, automated replacement,
return/wastage/adjustment, finance effects, or dispatch reversal. Until a later
confirmed decision closes those policies, Option D applies to those outcomes:
they remain unavailable and unclaimed.
