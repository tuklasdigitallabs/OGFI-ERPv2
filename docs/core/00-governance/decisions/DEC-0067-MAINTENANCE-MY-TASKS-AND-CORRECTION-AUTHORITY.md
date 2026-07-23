# DEC-0067 — Maintenance My Tasks Enrollment and Correction Authority

## Metadata

- Decision ID: `DEC-0067`
- Title: Maintenance My Tasks Enrollment and Correction Authority
- Status: `Confirmed — implementation and independent verification required`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared My Tasks / Phase II Maintenance
- Related decision brief: Parent-confirmed Maintenance enrollment and authorization conclusion, 2026-07-23; governed by `DEC-0063` and the v2 ordering contract in `DEC-0066`

## Decision

Enroll Maintenance as one role-pooled `Complete maintenance ticket` obligation per eligible ticket. Eligibility requires `restaurant.maintenance.complete`, exact tenant/company/location scope, exact brand scope including `brandId = null`, status `OPEN`, `IN_PROGRESS`, or `PENDING_VENDOR`, and `completedAt = null`. `CRITICAL` and `HIGH` tickets additionally require a known reporter different from the actor; `MEDIUM` and `LOW` tickets may be completed by their reporter. `ownerUserId` is context only and grants no authority.

Use the ticket's native `priority`, `targetDueAt`, and `createdAt` in the shared v2 task-order contract. Exclude cancellation, correction, vendor-specific task semantics, and terminal tickets. Correction remains a source-detail action and must require `restaurant.maintenance.correct`; `restaurant.maintenance.create` must not authorize correction.

## Context

The shared `My Tasks` registry needs a source-owned Maintenance predicate that identifies work the current user can actually perform without turning ticket ownership, broad visibility, or a visible UI action into authority. Maintenance also exposed three authorization gaps that had to be treated as hard blockers before enrollment: nullable-brand reads and linked-record checks widened scope by omitting the brand predicate, high-risk complete/cancel paths did not fail closed when reporter lineage was missing, and detail correction used the create permission despite the documented distinct correction permission.

Maintenance has native priority and target due date fields compatible with the stable v2 order confirmed in `DEC-0066`. Completion is the only confirmed pooled obligation. Cancellation represents an exception or duplicate terminal route, correction has no correction-needed source state, and vendor involvement does not establish a separate executable task semantic.

## Options considered

### Option A — selected: completion-only pooled enrollment with exact scope and corrected source authority

- Summary: Enroll eligible completion work through four bounded priority streams; preserve the v2 priority/due/age order; enforce exact nullable-brand scope, risk-tiered reporter independence, and the distinct correction permission in the source workflow.
- Benefits: Queue membership matches executable source authority; native urgency is preserved; count/page parity can use one closed predicate; missing high-risk lineage fails closed; and correction authority remains segregated from ticket creation.
- Failure modes: Predicate drift between count and priority streams; null-brand widening; exposing high-risk tasks with missing or self reporter lineage; mistaking ownership for assignment; trusting stale queue rows; or leaving UI visibility broader than server authority.
- Why selected: It is the smallest enrollment that passes scope, authorization, segregation, bounded-read, and source-of-truth hard gates.

### Option B — rejected: enroll all visible Maintenance actions

- Summary: Create separate completion, cancellation, correction, and vendor-related tasks for any visible active ticket.
- Benefits: Appears to expose more of the Maintenance workflow in one queue.
- Failure modes: Duplicates one source obligation, invents vendor-task semantics, exposes correction without a source state that makes it currently required, and risks authorizing actions by visibility rather than the action's permission and actor controls.
- Why selected or rejected: Rejected because visibility is not authority and the additional actions are not confirmed role-pooled obligations.

### Option C — rejected: owner-assigned completion tasks

- Summary: Enroll only tickets whose `ownerUserId` matches the current actor.
- Benefits: Produces an individually assigned-looking queue and can reduce the number of visible tasks.
- Failure modes: Ownership does not grant `restaurant.maintenance.complete`, can hide legitimate pooled branch work, and cannot replace exact scope, state, lineage, and permission checks.
- Why selected or rejected: Rejected because owner identity is operational context, not an authorization boundary.

### Option D / defer — rejected: delay Maintenance until correction or vendor task states exist

- Summary: Exclude Maintenance entirely until every visible action has an explicit task state.
- Benefits: Avoids mixed source behavior and future task-registry changes.
- Failure modes: Withholds a currently executable completion obligation even though its permission, state, risk, priority, and due-date semantics are already confirmed.
- Why selected or rejected: Rejected. Completion can be enrolled independently without inventing correction, cancellation, or vendor obligations.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** Count, page streams, dashboard/detail/history reads, and linked Incident visibility must use exact current tenant, company, location, and nullable-brand scope. Null selected brand means `brandId = null`, never omitted brand filtering.
- **Server-enforced authorization:** The adapter requires `restaurant.maintenance.complete`. The Maintenance destination reauthorizes permission, exact scope, state, completion status, and actor eligibility. Queue presence, ownership, and UI visibility do not grant authority.
- **Segregation and self-action:** `CRITICAL`/`HIGH` completion and cancellation fail closed when reporter lineage is null and deny reporter self-action. `MEDIUM`/`LOW` self-completion remains the confirmed routine-risk exception. Correction requires `restaurant.maintenance.correct`, not create authority.
- **Immutable ledger and audit trail:** The adapter is read-only and does not mutate Maintenance, linked Incident, inventory, money, approval, or audit state. Destination actions retain their source-owned audit and guarded transition behavior.
- **Transactional consistency and idempotency:** Queue reads create no posting effect. Completion/cancellation remain destination commands with their existing guarded mutation and idempotency controls.
- **Phase scope and recovery:** This decision changes only shared task enrollment and existing Maintenance authorization parity. The source adapter can be removed from the closed registry without changing ticket records; no new vendor workflow or task state is authorized.

## Required safeguards

- Reuse the shared v2 ordering exactly: native priority rank, due-null rank, absolute `targetDueAt`, `createdAt`, source rank, and ticket ID.
- Define one authoritative base predicate for count and all four priority page streams. A stream may add only its priority and continuation predicate.
- Bound reads to one stream per `CRITICAL`, `HIGH`, `MEDIUM`, and `LOW` priority, each limited to requested size plus one; merge and trim only under the shared v2 comparator.
- Keep the projection minimal: ticket ID, ticket number, status, priority, target due date, creation time, action label, and destination identity. Do not expose narrative, evidence, reporter, owner, asset, linked Incident detail, or mutation inputs.
- Require exact tenant/company/location and nullable-brand scope, active completion states, null `completedAt`, completion permission, and the risk-tiered reporter predicate. Never filter or authorize by owner.
- Exclude cancellation, correction, vendor-specific variants, `COMPLETED`, `CANCELLED`, and all other terminal work from `My Tasks`.
- Reauthorize completion at the Maintenance destination. Stale, missing, denied, terminal, moved-scope, already-completed, or actor-prohibited tickets must fail without mutation.
- Apply exact nullable-brand scope to Maintenance dashboard, detail, history, and linked Incident access. Do not conditionally omit the brand predicate.
- Make direct `CRITICAL`/`HIGH` complete and cancel commands fail closed for null reporter lineage and reporter self-action, and render their UI controls under the same rules.
- Require `restaurant.maintenance.correct` in authorization entry, policy, database-seeded workflow policy, service, and UI. A create-only user must not correct; an otherwise eligible correct-permission user must not be blocked merely for lacking create permission.
- Test count/page parity, four bounded streams, minimal projection, native priority/due ordering and continuation, exact null-brand scope, active and incomplete state, high-risk null/self reporter exclusion, routine-risk self-completion, owner non-authority, excluded actions/states, stale destination reauthorization, direct complete/cancel hardening, correction-permission parity, UI parity, and non-mutation.

## Implementation and documentation impact

- Code / architecture: Add a closed Maintenance adapter to the shared `My Tasks` registry using four bounded priority streams and the existing v2 comparator. Harden Maintenance reads and destination authorization where required by the decision.
- Data / schema: No schema change or backfill is authorized. Existing ticket priority, `targetDueAt`, `createdAt`, reporter, owner, completion, status, and scope fields are used.
- Workflow / permissions: Completion continues to require `restaurant.maintenance.complete`. Correction authority is normalized to the documented `restaurant.maintenance.correct` permission across policy and implementation. Create permission no longer substitutes for correction permission.
- UI / mobile: `My Tasks` shows `Complete maintenance ticket`, priority, status, due presentation, and a link to the authoritative ticket detail. Maintenance detail action visibility must mirror the server's risk-tiered actor and correction-permission rules.
- Reporting: No report or export behavior changes.
- Knowledge base / training: **Dunong handoff required after implementation verification.** Explain pooled completion, native priority/due ordering, high-risk reporter independence, owner non-authority, source reauthorization, and the separation of create and correct permissions. Do not imply that cancellation, correction, or vendor work is enrolled.
- Tests / UAT: Focused service, policy, shared-queue, and UI tests must verify every safeguard; responsive browser and production-representative gates remain separate completion requirements.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement and verify the bounded Maintenance adapter and count/page parity | Engineering + QA | Before claiming adapter completion | In progress |
| Verify exact nullable-brand Maintenance reads and linked Incident access | Security + QA | Before UAT or completion claim | Remediation required by this decision |
| Verify fail-closed high-risk complete/cancel lineage and UI parity | Engineering + Security + QA | Before UAT or completion claim | Remediation required by this decision |
| Normalize correction authority to `restaurant.maintenance.correct` across policy, service, UI, and seeded policy | Engineering + Security + QA | Before UAT or completion claim | Remediation required by this decision |
| Assess knowledge-base, release-note, and training impact | Dunong | After independently verified implementation | Handoff required |

## Evidence

- Parent-confirmed conclusion, 2026-07-23: enroll only role-pooled Maintenance completion under exact scope, active/incomplete state, completion permission, and risk-tiered reporter rules; use native priority, target due date, and creation time; treat ownership as non-authoritative; exclude cancellation, correction, vendor semantics, and terminal work; and remediate exact-null scope, fail-closed high-risk lineage, and correction-permission parity before completion.
- Independent first-round workflow, security, and QA analyses converged on the selected predicate and identified the three authorization blockers recorded above. No policy disagreement remained for challenge.
- Requested Code Spark and exact GPT-5.4/GPT-5.4-mini models were unavailable in the active toolset. The Decision Chair used the closest permitted GPT-5.6 role specialists. Model availability did not relax a hard gate or implementation requirement.
- `docs/core/00-governance/DEC-0063-CROSS-SOURCE-DASHBOARD-QUEUE-PAGINATION-DECISION-BRIEF.md`: closed source registry, source-owned predicate, bounded seek pagination, minimal projection, exact count/page parity, destination reauthorization, and non-mutation requirements.
- `docs/core/00-governance/decisions/DEC-0066-INCIDENT-MY-TASKS-AND-V2-ORDERING.md`: shared v2 priority, due, age, source, and record ordering contract and risk-tiered source-enrollment precedent.
- `docs/core/00-governance/decisions/DEC-0037-PHASE2-RISK-TIERED-OPERATIONS-LIFECYCLE.md`: risk-tiered Phase II independent-review controls.
- `docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md`: distinct Maintenance create, complete, correct, and cancel permission boundaries.
- `docs/phases/phase-02-restaurant-operations-and-food-cost/workflows/maintenance-workflow.md`: Maintenance lifecycle, completion, correction, cancellation, evidence, and audit semantics.
- `apps/web/src/server/services/maintenance.ts`: ticket read/action scopes, risk-tiered actor controls, and planned task adapter.
- `apps/web/src/server/services/phase2WorkflowPolicy.ts` and `packages/database/src/phase2-workflow-policies.ts`: runtime and seeded correction-action permission policy requiring normalization.
- `apps/web/src/server/services/myTasks.ts` and `apps/web/src/server/services/dashboardTasks.ts`: closed source registry, signed v2 cursor, and shared ordering contract.
- `apps/web/src/app/(app)/maintenance/[id]/page.tsx`: destination action visibility requiring parity with source authorization.
- `AGENTS.md` sections 4, 6-9, and 13: exact scope, server authorization, visible-surface parity, audit integrity, validation, and decision hard gates.

## Supersession

This decision is not superseded. It adds Maintenance enrollment under the shared `DEC-0063` registry and `DEC-0066` v2 ordering; it does not change ticket status semantics or authorize new vendor workflows. Any future cancellation, correction, vendor, or owner-assigned task enrollment requires a new confirmed decision with an exact executable predicate and authority model.
