# DEC-0075 — Canonical Prohibited-Actor and Revocation Evidence

## Metadata

- Decision ID: `DEC-0075`
- Title: Canonical Prohibited-Actor and Revocation Evidence
- Status: `Confirmed and implemented specifications — PostgreSQL execution and behavioral acceptance pending`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — normalized approval routing authorization evidence
- Related decision brief: Parent-led canonical authorization-evidence deliberation, 2026-07-23

## Decision

The next feature-disabled normalized-approval checkpoint will combine two complementary PostgreSQL evidence sets:

1. An exhaustive metadata-driven prohibited-actor matrix generated from the canonical capability registry for exactly 17 preflight-executable approve, 14 return, and 18 reject commands: 49 cases total. Only `PaymentRequest` approve is excluded because its unresolved policy guard fails closed before prohibited-actor preflight.
2. A compact deterministic forced-barrier matrix through the canonical Purchase Request path for acting `User`, real `AuthSession`, live permission/role authority, scope authority, and next-recipient authority.

For each prohibited-actor case, the actor must first be demonstrably live, permissioned, assigned, scoped, current-step eligible, and free of any prior persisted prohibition. The test then persists the exact active-step prohibited-actor row and proves that normalized preflight rejects the decision as `APPROVAL_AUTHORITY_STALE`, with the source, approval graph, audit, notifications, and collateral domain state unchanged. This is an otherwise-eligible metadata-prohibited actor test; it does not require the actor to be broadly unrelated to every source role when that is not the family's preflight contract.

The forced barriers will exercise both legal serializations where feasible: revocation commits before the canonical authority read, so the action fails without mutation; or the action holds the relevant authority fence first, so the revocation waits and applies only after the coherent decision commits. Barrier detection must be query-aware. Tests may not depend on sleeps, timing guesses, or production hooks. `APPROVAL_ROUTING_V1_ENABLED` remains `false`, and no migration is authorized.

## Context

The normalized approval engine already centralizes current-step authority and supports family-specific prohibited-actor metadata, but activation requires executable evidence that every preflight-executable family/capability fails closed when the otherwise-qualified actor is explicitly prohibited. Representative self-approval or requester cases do not prove registry-wide metadata enforcement, and an actor who is already unauthorized or already prohibited for another reason does not prove the newly persisted metadata control.

Petty Cash approve without an amount change, Petty Cash return/reject, and Payment Request return/reject can reach normalized authority preflight and therefore belong in this negative authorization matrix. Their inclusion does not resolve positive Petty Cash intent writing, source locking, proposal-version/amount policy, or Payment Request approval policy. Payment Request approve remains the sole exclusion because it intentionally fails closed on policy before the prohibited-actor boundary.

Authorization also changes concurrently. A static matrix cannot prove that a real session, permission/role assignment, scope assignment, or next-step recipient remains valid at the transaction boundary. Conversely, forcing the same concurrency race through every family would duplicate a shared-preflight property at high cost and create a brittle suite. The selected checkpoint combines exhaustive family/capability metadata coverage with a compact canonical barrier matrix at the shared Purchase Request seam.

## Options considered

### Option A — selected: exhaustive capability matrix plus compact canonical revocation barriers

- Summary: Generate all 49 preflight-executable prohibited-actor cases from canonical capabilities and pair them with focused Purchase Request barriers for actor, session, permission/role, scope, and next-recipient revocation.
- Benefits: Proves every executable family/action honors persisted prohibited metadata while testing shared concurrent authorization fencing once at the canonical seam; avoids redundant all-family races; preserves explicit policy TODOs; and produces bounded, deterministic evidence.
- Failure modes: A fixture actor may be unauthorized before prohibition; snapshot coverage may omit collateral state; a barrier may detect unrelated blocking; a privilege change may not advance the production-equivalent epoch; or a shared-path test may miss a specialized adapter that bypasses preflight.
- Why selected or rejected: Selected because it gives exhaustive policy-metadata breadth and focused concurrency depth without weakening the common authorization boundary or expanding into unbounded race duplication.

### Option B — rejected: prohibited-actor matrix only

- Summary: Add all 49 metadata-denial cases without forced concurrent revocation barriers.
- Benefits: Provides broad family/action coverage with a relatively compact generated suite.
- Failure modes: Does not prove live authority is fenced against concurrent actor, session, assignment, scope, or next-recipient changes.
- Why selected or rejected: Rejected because static breadth alone cannot close the transaction-time authorization evidence gap.

### Option C — rejected: all-family forced revocation races

- Summary: Repeat acting-user, session, permission/role, scope, and next-recipient barriers across every approval family and action.
- Benefits: Maximizes family-specific concurrency permutations.
- Failure modes: Produces a very large, slow, fragile matrix for behavior owned by central preflight; increases fixture and deadlock complexity; and can obscure real adapter exceptions within repetitive evidence.
- Why selected or rejected: Rejected because centralization plus the exhaustive all-family prohibited matrix and a compact canonical barrier set is the proportionate evidence boundary. A specialized smoke case is added only if implementation inspection shows an adapter seam still needs proof.

### Option D — rejected: defer authorization evidence until policy TODOs are resolved

- Summary: Wait for positive Petty Cash and Payment Request approval policy confirmation before expanding prohibited-actor and revocation evidence.
- Benefits: Could eventually run one fully complete capability matrix.
- Failure modes: Delays evidence for 49 commands that already reach authority preflight and leaves known transaction-time authorization gates open for unrelated positive-action policy reasons.
- Why selected or rejected: Rejected because only Payment Request approve must remain excluded; negative authority evidence for Petty Cash and Payment Request return/reject can proceed without resolving their positive policies.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** Every otherwise-authorized fixture is bound to the exact tenant/company and required source scope. Scope revocation is exercised at the authoritative assignment boundary, and all denial snapshots must include cross-scope collateral relevant to the family.
- **Server-enforced authorization:** Denial must come from normalized transaction-time preflight as `APPROVAL_AUTHORITY_STALE`, not UI hiding, fixture ineligibility, or a family source-state error. Persisted prohibited metadata and live authority are read through the production path.
- **Approval segregation:** The selected actor satisfies the family's baseline current-step eligibility before the new prohibited row is inserted, and no prior step prohibition exists. The expected denial is therefore attributable to the persisted metadata prohibition rather than missing permission, assignment, scope, or pre-existing prohibition. Separate source-role/self-approval tests retain their own assertions.
- **Audit integrity:** Every denied case preserves the approval graph, source, audit, notification, and collateral snapshots exactly. Failed authorization creates no decision, activation, source, notification, commitment, ledger, or other domain effect.
- **Transactional consistency and idempotency:** Forced barriers prove one legal serialization. A committed revocation fences a later action; an action that owns the relevant lock may commit coherently before the revocation. No action may validate across a mixed authority state.
- **Phase scope:** The checkpoint adds negative authorization evidence for existing normalized approval commands. It does not enable routing, resolve positive Petty Cash intent/source-lock/amount policy or Payment Request approval policy, change roles or permissions, or add new approval behavior.
- **Recovery and rollback:** No migration or business-data rewrite is authorized. Tests create disposable fixtures only. The implementation remains code-reversible while normalized routing is disabled.

## Required safeguards

- Derive the prohibited-actor cases from the canonical capability registry and assert the exact preflight-executable cardinality: 17 approve, 14 return, and 18 reject, totaling 49.
- Exclude only `PaymentRequest` approve because its confirmed policy hold rejects before prohibited-actor preflight. Include Petty Cash no-amount approve and Petty Cash/Payment return/reject as negative authority tests without treating them as positive policy parity.
- Before inserting prohibition, prove the chosen actor has an active user, a real active session where the action path requires it, the exact live permission/role assignment, the required scope, current-step eligibility, and no existing active-step prohibited row.
- Persist the exact active-step prohibited-actor record through the production data shape. Execute the canonical decision and require `APPROVAL_AUTHORITY_STALE` from normalized preflight.
- Capture and compare a family-appropriate no-write snapshot containing the source, approval instance and steps, audit events, notifications, and collateral domain records that the decision could create or mutate. A denial passes only when all are unchanged.
- Build 12 compact forced-revocation specifications covering acting `User`, real `AuthSession`, permission authority, production role-assignment and scope-assignment commands, direct next-recipient authority, a representative Expense Request specialized-adapter smoke, and representative decision-first actor/recipient/session outcomes. Use the actual service and transaction path; do not replace session persistence with a mock-only identity.
- Exercise both legal serialization outcomes where the production lock boundary makes both meaningful. If only one ordering is feasible for a specific authority record, document why and prove that ordering without inventing a second unsupported contract.
- Use query-aware blocking observation that identifies the intended `User`, `AuthSession`, or `ApprovalInstance` statement and verifies the blocker/blocked PID relationship. Do not accept any blocked backend as evidence of the target fence.
- Tie permission-removal evidence compositionally to the registered production `updateRolePermissions` privileged-MFA concurrency gate. For actual production role/scope commands, advance and assert the affected user's `privilegeEpoch`, persisted assignment state, session invalidation, and command audit as applicable.
- Use explicit bounded transaction and observation deadlines. Do not use sleeps, arbitrary delays, test-only production hooks, or timing luck to coordinate races.
- Retain one representative Expense Request specialized-adapter smoke to prove it reaches the same canonical `User` revocation fence. Do not add repetitive all-family forced races.
- Keep `APPROVAL_ROUTING_V1_ENABLED=false`. Passing this checkpoint does not authorize activation or production promotion.

## Implementation and documentation impact

- Code / architecture: No production behavior change is expected unless the evidence exposes a bypass or missing authorization fence. Test helpers may gain closed metadata-driven fixture and query-aware barrier utilities.
- Data / schema: No migration, backfill, seed-policy change, or historical rewrite.
- Workflow / permissions: No role, permission, scope, prohibited-actor policy, route, threshold, or action semantic changes.
- UI / mobile: No visible action, state, label, or navigation change.
- Reporting: No report or metric change.
- Knowledge base / training: No user-facing update is expected because this is feature-disabled authorization evidence with no approved behavior change. Reassess only if implementation changes visible denial behavior.
- Tests / UAT: Add the exact 49-case prohibited matrix, full no-write snapshots, 12 forced-revocation specifications, production-equivalent privilege fencing, and the bounded Expense specialized seam smoke.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Generate and assert the exact 49 preflight-executable prohibited-actor cases from canonical capabilities | QA + Backend Engineering | Before checkpoint acceptance | Implemented specification; PostgreSQL execution pending |
| Prove otherwise-eligible metadata-prohibited actors and full no-write snapshots for every generated case | QA + Security | Before checkpoint acceptance | Implemented specification; PostgreSQL execution pending |
| Implement query-aware barriers for User, real AuthSession, permission/role, scope, next-recipient, and ApprovalInstance/PID linkage | Database Engineering + Security + QA | Before checkpoint acceptance | 12 specifications implemented; PostgreSQL execution pending |
| Verify production-equivalent permission composition, `privilegeEpoch` fencing, production role/scope commands, and feasible legal serializations | Architecture + Database Engineering | Before checkpoint acceptance | Implemented specification; PostgreSQL execution pending |
| Prove the specialized adapter seam through Expense Request | Architecture + QA | After static/all-family inspection | Implemented specification; PostgreSQL execution pending |
| Complete independent Architecture, Security, and QA review | Decision Chair + specialist reviewers | After executable evidence | Complete for the feature-disabled source checkpoint; PostgreSQL behavioral acceptance remains pending |

## Implemented checkpoint — 2026-07-23

- The canonical capability-derived matrix now asserts 49 commands: 17 approve, 14 return, and 18 reject. Only `PaymentRequest` approve is excluded because its unresolved policy guard rejects before normalized prohibited-actor preflight. Petty Cash no-amount approve, Petty Cash return/reject, and Payment Request return/reject are included solely as negative authority tests; no positive Petty Cash intent/source-lock/amount or Payment approval policy is inferred.
- Each generated case establishes baseline actor eligibility and absence of an existing active-step prohibition, persists and snapshots the step prohibition, expects `APPROVAL_AUTHORITY_STALE`, proves that setup row remains unchanged, and compares the approval/source/audit/notification and family collateral snapshots for no decision-side write.
- The separate revocation file contains 12 deterministic specifications for acting User state/epoch, two real AuthSession changes, compositional permission removal tied to the registered production `updateRolePermissions` privileged-MFA concurrency gate, actual production role and scope deactivation commands with epoch/session/audit assertions, direct next-recipient loss, an Expense Request specialized-adapter smoke, and decision-first actor, recipient, and AuthSession outcomes.
- Query-aware observers identify the intended `User`, `AuthSession`, or `ApprovalInstance` lock query and verify blocking through PostgreSQL PID linkage. Decision-first cases use an `ApprovalInstance` barrier to prove exact committed decision/activation/audit/notification outcomes before actor, recipient, or session revocation. The specifications use bounded deadlines and no sleeps or production test hooks.
- Local focused execution passes 60 tests, skips 156 PostgreSQL cases, and retains two existing policy TODOs. The full non-database candidate passes 1,234 web tests with 246 skipped and two TODOs, 27 database-package tests with 18 skipped, and one worker test; focused lint, root typecheck, production build, and `git diff --check` pass. Both exact disposable commands (`test:approval-routing:database` and the compositional `test:authorization-admin-platform`) fail only with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`; the new cases are therefore implemented specifications, not behavioral or production evidence.
- Final Architecture, Security, and QA re-reviews report no Critical or High finding and GO only for this feature-disabled source checkpoint. PostgreSQL behavioral acceptance and activation remain NO-GO until both registered database suites pass on the same exact candidate. `APPROVAL_ROUTING_V1_ENABLED` remains `false`.
- Dunong confirmed that no glossary, knowledge-base, training, or user-facing release-note update is warranted: this checkpoint changes test specifications only, visible behavior and policy are unchanged, and existing enablement already covers stale/revoked authority. No new knowledge-base gap was found.

## Evidence

- The Decision Chair confirmed this conclusion on 2026-07-23 after independent architecture, security, correctness, and test-gap analysis. The independent positions agreed, so no targeted challenge round was required. Requested GPT-5.3 Codex Spark and `gpt-5.4` models were unavailable; the closest permitted GPT-5.6 specialist roles were used. Model fallback did not relax any hard gate.
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` requires live server-enforced authorization, segregation, audit completeness, atomicity, and credible blocker handling for approval decisions.
- `docs/core/00-governance/decisions/DEC-0050-BOUNDED-DENIAL-AUDIT-AND-ROLE-SCOPED-APPROVAL-WORK.md` establishes live normalized approval eligibility, prohibited-actor enforcement, and fail-closed decision authority.
- `docs/core/00-governance/decisions/DEC-0051-CANONICAL-APPROVAL-DECISION-PARITY-AND-ATOMIC-SOURCE-EFFECTS.md` requires all registered family actions to revalidate live authority and leave no partial source or domain effect on denial.
- `docs/core/00-governance/decisions/DEC-0052-APPROVAL-INTEGRITY-LOCKING-AND-TYPED-FINANCIAL-INTENT.md` confirms transaction-time actor/session/source authority and deterministic lock ordering as activation controls.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` records all-family prohibited-actor breadth and forced acting/next-actor revocation races as remaining normalized-routing activation gates.
- `apps/web/tests/approvalDecisionParity.integration.test.ts` implements the corrected 49-command metadata-prohibition matrix and full collateral no-write assertions.
- `apps/web/tests/approvalDecisionRevocationPg.integration.test.ts` implements the 12 query-aware revocation/serialization specifications, real session and production role/scope command evidence, permission-gate composition, Expense specialized smoke, and ApprovalInstance/PID-linked decision-first barriers.

## Supersession

This decision is not superseded. It defines a bounded authorization-evidence checkpoint under `DEC-0050` through `DEC-0052`; it does not replace their source-locking, family parity, policy, cutover, or activation gates. A later decision that changes executable capability scope, prohibited-actor semantics, authority fencing, barrier strategy, or normalized-routing activation posture must explicitly amend or supersede this record.
