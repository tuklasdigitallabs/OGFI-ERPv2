# DEC-0065 — Food Safety My Tasks Enrollment

## Metadata

- Decision ID: `DEC-0065`
- Title: Food Safety My Tasks Enrollment
- Status: `Confirmed — implemented and independently verified`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Phase II Food Safety / Shared My Tasks
- Related decision brief: Parent-confirmed Food Safety enrollment conclusion, 2026-07-23; governed by `DEC-0063`

## Decision

Enroll Food Safety in the server-owned `My Tasks` workspace with exactly two scoped action predicates:

1. A review task is eligible only when the log is `SUBMITTED` or `EXCEPTION_REVIEW`, the current user has `restaurant.food_safety.review`, `recordedByUserId` is provably non-null, and the current user is not that recorder.
2. A correction task is eligible when the log is `RETURNED` and the current user has `restaurant.food_safety.create`. This is explicitly pooled correction work within the user's authorized scope; it is not an individual assignment.

Do not enroll `REVIEWED` or `EXCEPTION_OPEN` final-close work until the self-action and final-signoff policy is confirmed. The adapter is read-only: exact count and paged rows reuse the same tenant, company, optional-brand, location, and action predicate; the page adds only its continuation predicate. It returns only the minimal task projection and never grants destination authority or mutates queue or source state. The Food Safety destination must reauthorize every action.

## Context

`DEC-0063` permits a source to join the cross-source `My Tasks` workspace only after its action-obligation grain, exact predicate, minimal projection, ordering tuple, and count/page parity are established. Food Safety logs contain review-ready work, returned correction work, and later close work, but those actions do not share the same permissions or segregation risks.

Review and Return for correction must fail closed when recorder lineage is missing because the system cannot prove that the current actor is independent. Returned logs have no dedicated correction assignee; the confirmed operational contract therefore treats correction as pooled work for scoped users who can create and resubmit Food Safety logs. Final close remains excluded because the prohibited-actor and independent-signoff boundary is not yet confirmed.

## Options considered

### Option A — selected: independent review and pooled correction predicates

- Summary: Enroll only independent `SUBMITTED`/`EXCEPTION_REVIEW` review work and scoped `RETURNED` correction work, with their distinct existing permissions and no final-close tasks.
- Benefits: Adds executable Food Safety work without weakening scope authorization or self-action controls; rejects records with unprovable recorder lineage; accurately represents returned correction as pooled rather than assigned work; and preserves the Food Safety module as the action authority.
- Failure modes: Count and page predicates can drift; a null-recorder log or the recorder can be offered review or Return for correction; users can misread pooled correction as personal assignment; a broad projection can disclose readings or evidence; a Return control can be rendered under review permission; or a destination can trust queue membership instead of reauthorizing.
- Why selected: It is the smallest predicate whose action ownership, permission, scope, and segregation rules are confirmed.

### Option B — rejected: enroll all apparently actionable Food Safety statuses

- Summary: Include review, returned correction, and `REVIEWED`/`EXCEPTION_OPEN` close work for users with broad Food Safety authority.
- Benefits: Places more Food Safety work in one queue.
- Failure modes: Conflates create, review, return, correct, and close authority; can expose self-action or self-sign-off work; permits records with incomplete recorder lineage; and establishes an unconfirmed final-close policy through queue behavior.
- Why selected or rejected: Rejected because broad status and permission matching does not prove that the current actor may execute the action, and final-signoff independence remains unresolved.

### Option C / defer — rejected: defer enrollment or infer individual correction ownership

- Summary: Keep Food Safety entirely outside `My Tasks`, or show returned corrections only to a presumed recorder or assignee.
- Benefits: Avoids immediate adapter work and can appear more individually targeted.
- Failure modes: Deferring all enrollment withholds already-confirmed review and correction work; inferring an assignee invents a field and ownership policy the source record does not contain; binding correction to a previous recorder can make pooled location work undiscoverable.
- Why selected or rejected: Rejected for the confirmed predicates. The source workflow supports scoped pooled correction through create permission, while final close alone remains deferred.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** The adapter must apply the current authorized tenant, company, optional selected brand, and location predicate to both count and page reads. Enrollment never widens Food Safety access.
- **Server-enforced authorization:** Source permission and scope checks remain enforced in the service and data-access path. Queue visibility and navigation are not authorization grants.
- **Approval segregation and no self-action:** Review and Return for correction require a non-null recorder and exclude that actor. Missing recorder lineage fails closed. Final close is excluded pending a confirmed self-action and final-signoff policy.
- **Immutable inventory ledger and audit trail:** Queue reads and navigation produce no Food Safety, audit, inventory, wastage, incident, approval, or finance mutation. Source actions retain their controlled audit and transition behavior.
- **Transactional consistency and idempotency:** The adapter performs no posting or workflow transition. Destination review, return, correction, and future close actions retain their own concurrency, idempotency, and transaction controls.
- **Phase scope and recovery:** Enrollment is limited to the existing Phase II Food Safety source and shared `My Tasks` read model. It can be withdrawn from the closed source registry without altering source records.

## Required safeguards

- Define one authoritative scoped action predicate and reuse its complete base membership unchanged for exact `totalCount` and seek-paginated rows. The page may add only the continuation predicate. Tests must fail if count/page membership diverges.
- Review membership must be exactly `status IN (SUBMITTED, EXCEPTION_REVIEW)`, current `restaurant.food_safety.review` permission, non-null `recordedByUserId`, and current actor unequal to `recordedByUserId`.
- Correction membership must be exactly `status = RETURNED` with current `restaurant.food_safety.create` permission under the same authorized scope. Label it as correction/resubmission work and do not imply individual assignment.
- Keep `REVIEWED` and `EXCEPTION_OPEN` out of the adapter until a separate confirmed decision defines final-close authority, prohibited actors, and sign-off independence.
- Select only the minimal fields required for task identity, status, ordering, label, scope context, and destination link. Do not load or return readings, evidence, corrective-action details, review notes, correction history, audit history, or mutation inputs.
- Preserve the `DEC-0063` cursor, ordering, source-availability, and exact-total contracts. Queue reads must not update claimed, seen, assigned, or workflow state.
- Reauthorize the record and requested action at the Food Safety destination using the current session, scope, permission, status, and recorder lineage. A stale queue item must resolve to a safe changed, denied, or missing state.
- Keep UI permissions distinct: review uses `restaurant.food_safety.review`; correcting and resubmitting a `RETURNED` log uses `restaurant.food_safety.create`; the separate **Return for correction** control requires `restaurant.food_safety.correct`. Queue enrollment must not cause any control to appear under the wrong permission.
- Direct review and Return for correction must both fail closed when `recordedByUserId` is missing and must reject the recorder as actor, even if a stale or manipulated UI exposes the control.
- Test authorized and unauthorized scope, both reviewable statuses, returned correction, excluded close statuses, null recorder, recorder self-review, recorder self-return, users with only one relevant permission, pooled correction visibility, count/page parity, stale status, minimal response shape, destination reauthorization, permission-specific UI controls, and absence of queue/source mutation.

## Implementation and documentation impact

- Code / architecture: Add the Food Safety source-owned task adapter to the closed `My Tasks` registry using the confirmed predicate, shared ordering/cursor contract, minimal projection, and source-local authorization. Implementation remains pending independent verification.
- Data / schema: No schema change is authorized. Existing nullable `recordedByUserId` is handled by fail-closed review and return eligibility; this record does not authorize a backfill or inference rule.
- Workflow / permissions: No permission or action authority is created. Review, returned correction, and Return for correction retain their distinct existing permissions. Final close remains excluded.
- UI / mobile: Show focused labels such as `Review food-safety log` and `Correct and resubmit food-safety log`, disclose pooled correction semantics where needed, and open the authoritative detail screen. The destination must render each action control only under its correct permission and current eligibility.
- Reporting: No report or export is authorized. The queue's exact count is permitted only under the shared predicate and `DEC-0063` source-availability contract.
- Knowledge base / training: **Dunong handoff required after independently verified implementation.** Explain the two enrolled task types, pooled returned-correction behavior, destination reauthorization, and exclusion of final-close tasks without implying new permissions or assignments.
- Tests / UAT: Verify predicate and pagination parity, null-recorder and self-action denial for direct review/return, pooled corrections, permission-specific UI controls, cross-scope denial, stale destinations, responsive queue/detail behavior, and no source mutation from queue reads.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the Food Safety task adapter and closed-registry enrollment | Backend + Frontend Engineering | Before declaring Food Safety enrolled | Complete — focused tests, typecheck, and lint pass |
| Independently verify scope, null-recorder and self-action denial, count/page parity, destination reauthorization, permission-specific controls, stale state, and non-mutation | QA + Security + Engineering | Before UAT or completion claim | Accepted for this adapter slice; browser/database gates remain workspace-level |
| Resolve self-action and independent final-signoff policy for `REVIEWED` / `EXCEPTION_OPEN` close work through a separate material decision | Product Governance + Food Safety Owner | Before enrolling final-close tasks | Open prerequisite |
| Assess user guidance, release-note, and training impact | Dunong | After independently verified implementation | Complete — glossary and knowledge-base guidance updated; no separate training workflow added |

## Evidence

- Parent-confirmed conclusion, 2026-07-23: enroll independent `SUBMITTED`/`EXCEPTION_REVIEW` review tasks and pooled `RETURNED` correction tasks; require non-null recorder lineage and exclude the recorder from review and Return for correction; preserve tenant/company/optional-brand/location predicate parity, minimal projection, destination reauthorization, permission-correct UI controls, and direct-action fail-closed behavior; defer final-close tasks.
- The Decision Chair confirmed the conclusion after a unanimous independent council. The requested Code Spark model and the exact documented GPT-5.4/GPT-5.4-mini fallbacks were unavailable; the council used the permitted inherited GPT-5.6 model. The council considered scope isolation, permission boundaries, self-action risk, pooled-work semantics, count/page drift, stale destinations, and source-authority safeguards.
- `docs/core/00-governance/DEC-0063-CROSS-SOURCE-DASHBOARD-QUEUE-PAGINATION-DECISION-BRIEF.md`: closed source registry, source-owned predicate, minimal projection, exact count/page parity, cursor, degradation, and destination-reauthorization requirements.
- `docs/phases/phase-02-restaurant-operations-and-food-cost/workflows/food-safety-workflow.md`: current lifecycle, scope, source permissions, correction path, audit boundary, and exclusion of final close pending self-action policy.
- `docs/phases/phase-02-restaurant-operations-and-food-cost/specs/food-safety-ui-spec.md`: Food Safety queue, detail, action, responsive, and source-context requirements.
- `docs/phases/phase-02-restaurant-operations-and-food-cost/quality/PHASE2_UAT_SCENARIOS.md`: role, review, return, correction, audit, and non-mutation acceptance coverage.
- `apps/web/src/server/services/foodSafety.ts`: scoped Food Safety actions and task-adapter implementation pending independent verification.
- `apps/web/src/server/services/foodSafety.test.ts`: focused adapter, direct-action, audit, correction, and UI contract tests pending independent verification.
- `apps/web/src/app/(app)/food-safety/[id]/page.tsx`: permission-specific review, Return for correction, close, and returned-correction controls pending independent verification.
- `apps/web/src/server/services/authorization.ts`: existing Food Safety view, create, review, and correct permission codes.
- `packages/database/prisma/schema.prisma`: nullable `recordedByUserId` and Food Safety scope fields.
- `AGENTS.md` sections 4, 6-9, and 13: scope isolation, server authorization, no UI-only authority, workflow integrity, visible-surface verification, and material-decision hard gates.

## Supersession

This decision is not superseded. It authorizes only the two stated Food Safety task predicates. A later decision may enroll final-close work only after confirming its self-action and final-signoff policy and must preserve the scope, source-authority, parity, minimal-projection, destination-reauthorization, and non-mutation safeguards established here.
