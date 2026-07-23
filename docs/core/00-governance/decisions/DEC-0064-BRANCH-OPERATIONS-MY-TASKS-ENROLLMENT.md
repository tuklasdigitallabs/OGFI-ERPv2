# DEC-0064 — Branch Operations My Tasks Enrollment

## Metadata

- Decision ID: `DEC-0064`
- Title: Branch Operations My Tasks Enrollment
- Status: `Confirmed — implemented and independently verified`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Phase II Branch Operations / Shared My Tasks
- Related decision brief: Parent-confirmed Branch Operations enrollment conclusion, 2026-07-23; governed by `DEC-0063`

## Decision

Enroll Branch Operations in the server-owned `My Tasks` workspace with exactly two scoped action predicates:

1. A review task is eligible only when the checklist is `SUBMITTED` or `MANAGER_REVIEW`, the current user has `restaurant.branch_operations.review`, both `openedByUserId` and the latest `submittedByUserId` are provably non-null, and the current user is neither actor.
2. A correction task is eligible when the checklist is `RETURNED` and the current user has `restaurant.branch_operations.create`. This is explicitly role-pooled correction work within the user's authorized scope; it is not an individual assignment.

Do not enroll `REVIEWED` or `EXCEPTION_OPEN` final-close work until the self-action and final-signoff policy is confirmed. The adapter is read-only: it uses the same scoped predicate for exact count and paged rows, returns only the minimal task projection, and never grants destination authority or mutates queue/source state.

## Context

`DEC-0063` permits a source to join the cross-source `My Tasks` workspace only after its action-obligation grain, exact predicate, minimal projection, ordering tuple, and count/page parity are independently established. Branch checklists contain review-ready work, returned correction work, and later close work, but those actions do not share the same permissions or segregation risks.

Review must fail closed when opener or latest-submitter lineage is absent because the system cannot then prove that the reviewer is independent. Returned records have no dedicated assignee field; the confirmed operational contract therefore treats correction as pooled work for scoped users who can create and resubmit branch checklists. Final close remains semantically unresolved because a user may have participated in an earlier checklist action and the required independent sign-off boundary is not yet confirmed.

## Options considered

### Option A — selected: bounded review and role-pooled correction predicates

- Summary: Enroll only independent `SUBMITTED`/`MANAGER_REVIEW` review work and scoped `RETURNED` correction work, with distinct existing permissions and no close tasks.
- Benefits: Adds executable Branch Operations work without weakening scope authorization or self-review controls; excludes actor-lineage uncertainty; accurately represents returned correction as pooled rather than assigned work; and preserves the source module as the action authority.
- Failure modes: Count and page predicates can drift; null actor fields can enter the review queue; an opener or latest submitter can be offered self-review; users can misread pooled correction as personal assignment; a broad projection can disclose checklist details; or a destination can trust queue membership instead of reauthorizing.
- Why selected: It is the smallest predicate whose current action ownership, permission, scope, and segregation rules are confirmed.

### Option B — rejected: enroll every apparently actionable Branch Operations status

- Summary: Include review, returned correction, and `REVIEWED`/`EXCEPTION_OPEN` close work for any user with broad Branch Operations authority.
- Benefits: Produces broader source coverage and places more workflow actions in one queue.
- Failure modes: Conflates create, review, correct, and close authority; can expose self-review or self-sign-off work; treats records with incomplete actor lineage as safe; and prematurely establishes a final-close policy through queue behavior.
- Why selected or rejected: Rejected because final-signoff independence is unresolved and broad status/permission matching does not prove that an action is executable by the current actor.

### Option C / defer — rejected: defer all enrollment or require individual correction ownership

- Summary: Keep Branch Operations entirely outside `My Tasks`, or show returned corrections only to a presumed opener, submitter, or assignee.
- Benefits: Avoids immediate adapter work and can appear more individually targeted.
- Failure modes: Deferring all enrollment withholds already-confirmed review and correction work; inferring ownership invents an assignment rule that the source record does not contain; binding correction to a prior actor can leave pooled branch work undiscoverable.
- Why selected or rejected: Rejected for the confirmed predicates. The existing source workflow supports scoped role-pooled correction through create permission, while final close alone remains deferred.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** The adapter must apply the current authorized tenant, company, optional selected brand, and selected location scope. Enrollment never widens branch access.
- **Server-enforced authorization:** Source permission and scope checks are enforced in the server service/data-access path. Queue visibility and navigation are not authorization grants.
- **Approval segregation and no self-action:** Review candidates require non-null opener and latest-submitter actors and exclude the current actor from both roles. Missing lineage fails closed. Final close is excluded pending a confirmed self-action/final-signoff policy.
- **Immutable inventory ledger and audit trail:** Queue reads and navigation produce no source, audit, inventory, finance, incident, or maintenance mutation. Source actions retain their existing controlled audit and transition behavior.
- **Transactional consistency and idempotency:** The adapter performs no posting or workflow transition. Destination review, return, correction, or future close actions retain their own concurrency, idempotency, and transaction controls.
- **Phase scope and recovery:** The enrollment is limited to the existing Phase II Branch Operations source and the shared `My Tasks` read model. It can be withdrawn from the closed source registry without altering source records.

## Required safeguards

- Define one authoritative scoped action predicate and reuse it unchanged for exact `totalCount` and seek-paginated rows. Tests must fail if count/page membership diverges.
- Review membership must be exactly `status IN (SUBMITTED, MANAGER_REVIEW)`, current `restaurant.branch_operations.review` permission, non-null `openedByUserId`, non-null latest `submittedByUserId`, and current actor unequal to both actor IDs.
- Treat `submittedByUserId` as the latest submitter after correction/resubmission. A stale or missing submitter value must never be substituted, inferred from audit display data, or allowed into review membership.
- Correction membership must be exactly `status = RETURNED` with current `restaurant.branch_operations.create` permission under the same authorized scope. Label it as correction/resubmission work and do not imply individual assignment.
- Keep `REVIEWED` and `EXCEPTION_OPEN` out of the adapter until a separate confirmed decision defines final-close authority, prohibited actors, and sign-off independence.
- Select only the minimal task fields needed for identity, status, ordering, label, scope context, and destination link. Do not load or return checklist lines, evidence, review notes, audit history, or mutation inputs.
- Preserve the `DEC-0063` cursor, ordering, source-availability, and exact-total contracts. Queue reads must not update claimed, seen, assigned, or workflow state.
- Reauthorize the record and requested action at the Branch Operations destination using the current session, scope, permission, status, and actor lineage. A stale queue item must resolve to a safe changed, denied, or missing state.
- Keep the UI permissions distinct: review/sign-off uses `restaurant.branch_operations.review`; applying a `RETURNED` correction uses `restaurant.branch_operations.create`; the separate **Return for correction** control must require `restaurant.branch_operations.correct`. Queue enrollment must not cause any control to appear under the wrong permission.
- Test authorized and unauthorized scope, each eligible and excluded status, null opener, null submitter, opener self-review, latest-submitter self-review after resubmission, users with only one relevant permission, pooled correction visibility, deterministic count/page parity, stale status, minimal response shape, destination reauthorization, and absence of queue/source mutation.

## Implementation and documentation impact

- Code / architecture: Add a Branch Operations source-owned task adapter to the closed `My Tasks` registry, using the confirmed predicate, existing global ordering/cursor contract, minimal projection, and source-local authorization.
- Data / schema: No schema change is authorized. Existing nullable actor fields are handled by fail-closed review eligibility; this record does not authorize a backfill or inference rule.
- Workflow / permissions: No new permission or action authority is created. Review, returned correction, and Return-for-correction retain their distinct existing permissions. Final close remains excluded.
- UI / mobile: Show focused labels such as `Review branch checklist` and `Correct and resubmit checklist`, disclose pooled correction semantics where needed, and open the authoritative detail screen. The destination must render each action control only under its correct permission and current eligibility.
- Reporting: No new report or export is authorized. The queue's exact count is permitted only under the shared predicate and `DEC-0063` source-availability contract.
- Knowledge base / training: **Dunong handoff required after verified implementation.** Explain the two enrolled task types, pooled returned-correction behavior, destination reauthorization, and the exclusion of final-close tasks without implying new permissions or assignments.
- Tests / UAT: Verify predicate and pagination parity, actor-lineage denial, role-pooled corrections, permission-specific UI controls, cross-scope denial, stale destinations, responsive queue/detail behavior, and no source mutation from queue reads.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement and verify the Branch Operations task adapter and closed-registry enrollment | Backend + Frontend Engineering | Before declaring Branch Operations enrolled | Complete — focused tests, typecheck, and lint pass |
| Verify scope, null-lineage, self-review, count/page parity, destination reauthorization, permission-specific controls, stale state, and non-mutation | QA + Security + Engineering | Before UAT | Independently accepted for this adapter slice; browser/database gates remain workspace-level |
| Resolve self-action and independent final-signoff policy for `REVIEWED` / `EXCEPTION_OPEN` close work through a separate material decision | Product Governance + Branch Operations Owner | Before enrolling final-close tasks | Open prerequisite |
| Assess user guidance and release-note impact | Dunong | After verified implementation | Complete — glossary and knowledge-base guidance updated; no separate training workflow added |

## Evidence

- Parent-confirmed conclusion, 2026-07-23: enroll independent `SUBMITTED`/`MANAGER_REVIEW` review tasks and role-pooled `RETURNED` correction tasks; require non-null opener/latest-submitter lineage and exclude both actors from review; defer `REVIEWED`/`EXCEPTION_OPEN` close work; preserve predicate parity, minimal projection, destination reauthorization, non-mutation, and permission-correct UI controls.
- Deliberation followed the required council protocol. The requested Code Spark model and the exact documented GPT-5.4/GPT-5.4-mini fallbacks were unavailable; the council therefore used the inherited GPT-5.6 model. The Decision Chair confirmed the conclusion after considering permission boundaries, self-action risk, pooled-work semantics, count/page drift, stale targets, and source-authority safeguards.
- `docs/core/00-governance/DEC-0063-CROSS-SOURCE-DASHBOARD-QUEUE-PAGINATION-DECISION-BRIEF.md`: closed source registry, source-owned predicate, minimal projection, exact count/page parity, cursor, degradation, and destination-reauthorization requirements.
- `docs/phases/phase-02-restaurant-operations-and-food-cost/workflows/branch-opening-closing-workflow.md`: current lifecycle, source permissions, correction path, audit behavior, non-mutation boundary, and exclusion of final close pending self-action policy.
- `docs/phases/phase-02-restaurant-operations-and-food-cost/reports/PHASE2_REPORTING_AND_EXPORT_SPEC.md`: implemented review, return/correction, and close semantics and source-linked dashboard behavior.
- `apps/web/src/server/services/branchOperations.ts`: authoritative scoped Branch Operations actions, review segregation checks, returned-correction action, and task-adapter implementation under verification.
- `apps/web/src/server/services/myTasks.ts`: closed registry and destination-link integration under verification.
- `apps/web/src/app/(app)/branch-operations/[id]/page.tsx`: permission-specific review, Return-for-correction, close, and returned-correction control visibility under verification.
- `packages/database/prisma/schema.prisma`: nullable opener and submitter actor fields on `BranchOperationalChecklist`.
- `AGENTS.md` §§ 4, 6–9, and 13: scope isolation, server authorization, no UI-only authority, workflow integrity, visible-surface verification, and material-decision hard gates.

## Supersession

This decision is not superseded. It authorizes only the two stated Branch Operations task predicates. A later decision may enroll final-close work only after confirming self-action and final-signoff policy and must preserve the scope, source-authority, parity, minimal-projection, destination-reauthorization, and non-mutation safeguards established here.
