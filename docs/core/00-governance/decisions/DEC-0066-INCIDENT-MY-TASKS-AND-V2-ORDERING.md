# DEC-0066 — Incident My Tasks Enrollment and V2 Ordering

## Metadata

- Decision ID: `DEC-0066`
- Title: Incident My Tasks Enrollment and V2 Ordering
- Status: `Confirmed — implemented and independently verified`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared My Tasks / Phase II Incident Management
- Related decision brief: Parent-confirmed Incident enrollment and v2 ordering conclusion, 2026-07-23; governed by `DEC-0063`

## Decision

Adopt a `My Tasks` v2 ordering and cursor domain whose complete ascending tuple is:

1. priority rank `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`;
2. due-null rank, with dated work before undated work;
3. absolute `dueAt`;
4. `createdAt`;
5. source rank; and
6. `recordId`.

Existing enrolled sources remain fixed at `HIGH` priority with `dueAt = null`. Overdue, due-today, and future states are derived only for display using the authorized operational timezone, initially `Asia/Manila`; they are not ordering or cursor fields. The signed v1 cursor/domain is rejected rather than reinterpreted under the new tuple, and v2 cursors are bound to the v2 domain.

Enroll Incidents as one role-pooled, resolution-only task obligation per eligible incident. Eligibility requires `restaurant.incident.resolve`, exact tenant and company scope, exact brand scope including `brandId = null` when the selected brand is null, exact location scope, `status IN (OPEN, IN_PROGRESS, PENDING_REVIEW)`, and `resolvedAt = null`. For `CRITICAL` and `HIGH`, `reportedByUserId` must be non-null and different from the current actor; `MEDIUM` and `LOW` may be self-resolved. `ownerUserId` is context only and never grants resolution authority.

Cancellation, duplicate or exception task variants, correction, and terminal incidents are excluded. Cancellation would duplicate the same incident obligation or require unconfirmed exception semantics. Correction uses a different permission and has no source `correction-needed` state from which to derive an executable obligation. The adapter therefore exposes only `Resolve incident`, implemented through four bounded severity streams merged under the v2 tuple. Direct resolve and cancel commands must retain null-lineage and actor-parity hardening, and the Incident UI must show actions under the same actor rules enforced by the server.

## Context

`DEC-0063` established a closed, server-owned `My Tasks` registry with source-owned predicates, exact count/page parity, minimal projections, seek pagination, and destination reauthorization. Incident enrollment introduced two linked decisions: how real incident severity and due dates participate in a queue whose earlier sources had only fixed priority and no due date, and which incident actions represent genuine current-user obligations.

Treating overdue state as part of the cursor would make traversal change at Manila midnight without any source mutation. Retaining the earlier tuple would discard incident severity and due-date urgency. The v2 tuple instead orders on stable stored values and confines timezone-relative due state to presentation.

The accepted tradeoff is explicit: a newly dated `HIGH` incident precedes an old undated `HIGH` task because due-null rank is evaluated before age. This favors actionable due-date commitments over undated age. Pagination, links to authoritative source workspaces, and later operational monitoring mitigate starvation risk; they do not change the tuple.

Incident ownership does not prove authority, and not every visible incident action is a distinct task. Resolution is the only confirmed pooled obligation. High-risk resolution and cancellation require reporter independence under the existing risk policy, while routine `LOW` and `MEDIUM` resolution may be performed by the reporter when all other authority and scope checks pass.

## Options considered

### Option A — selected: v2 stable tuple and resolution-only Incident enrollment

- Summary: Version the cursor/domain; order by severity-derived priority, dated-before-undated, absolute due date, age, source, and record ID; enroll only eligible pooled resolution work through four severity streams.
- Benefits: Preserves deterministic traversal across timezone boundaries; represents incident urgency without changing existing-source semantics; keeps task visibility aligned with executable source authority; and carries exact scope and high-risk independence into both count and page reads.
- Failure modes: Dated work can repeatedly precede older undated work; four streams can drift from the shared predicate; a high-risk record with missing reporter lineage can leak into the queue; the UI can show resolve/cancel to a prohibited reporter; a stale queue row can be trusted as authority; or owner context can be mistaken for assignment authority.
- Why selected: It is the smallest stable ordering change and Incident predicate that preserves scope, permission, segregation, and source-authority controls.

### Option B — rejected: retain or reinterpret the v1 cursor/order

- Summary: Keep the earlier created-time/source ordering or accept v1 cursors while adding priority and due dates implicitly.
- Benefits: Avoids an explicit cursor version change and keeps older bookmarks superficially usable.
- Failure modes: Reinterpreting a signed cursor under a different tuple can skip or duplicate rows; age-first ordering suppresses confirmed incident urgency; adding Manila-relative overdue bands makes cursor position change with the clock; and absent priority/due fields become ambiguous.
- Why selected or rejected: Rejected. V1 cursors must fail closed, and the new tuple belongs to the signed `my-tasks-v2` domain.

### Option C — rejected: enroll every incident action or assign tasks by owner

- Summary: Create separate resolve, cancel, exception, and correction tasks, or show incidents only to `ownerUserId`.
- Benefits: Appears to expose more Incident workflow and can make the queue look individually assigned.
- Failure modes: Resolve and cancel duplicate one source obligation; exception semantics are not confirmed; correction permission does not match resolution permission and no correction-needed state exists; terminal records are not actionable; and owner identity neither proves current permission nor replaces exact scope and actor checks.
- Why selected or rejected: Rejected because it invents task semantics and authority not established by the Incident source workflow.

### Option D / defer — rejected: exclude Incidents until every source has native priority and due dates

- Summary: Keep all sources on the old fixed ordering until each adapter can provide source-native priority and due dates.
- Benefits: Avoids mixed fixed and source-derived values in the shared queue.
- Failure modes: Withholds a confirmed executable Incident obligation and forces unrelated source redesign before adopting a stable extensible tuple.
- Why selected or rejected: Rejected. Existing sources can safely remain fixed at `HIGH`/null while Incidents supply native severity and due dates.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** Count and all four page streams apply exact current `tenantId`, `companyId`, `brandId` including exact null, and `locationId`. Enrollment never expands Incident scope.
- **Server-enforced authorization:** The adapter requires `restaurant.incident.resolve`; the Incident destination reauthorizes the current session, permission, exact scope, status, lineage, and action. Queue presence, ownership, and UI visibility grant no authority.
- **Approval segregation and no self-action:** `CRITICAL`/`HIGH` task membership and direct resolve/cancel both require non-null reporter lineage and actor inequality. `LOW`/`MEDIUM` self-resolution is the confirmed routine-risk exception, not a general self-action bypass.
- **Immutable inventory ledger and audit trail:** Queue reads do not mutate Incident, source, inventory, financial, approval, or audit state. Resolution and cancellation remain transactionally audited source commands and never alter linked source records.
- **Transactional consistency and idempotency:** The adapter is read-only. Destination resolve/cancel retain guarded status/resolution predicates, idempotency, transactional audit, and transition writes.
- **Phase scope and recovery:** The decision is limited to the shared queue and existing Phase II Incident actions. Incident enrollment can be removed from the closed registry without changing source records; v1 cursors fail safely and users restart from the first v2 page.

## Required safeguards

- Treat the v2 tuple as one indivisible contract: priority rank, due-null rank, absolute `dueAt`, `createdAt`, source rank, and `recordId`, all ascending in the stated order.
- Keep `CRITICAL`, `HIGH`, `MEDIUM`, and `LOW` as the only priority values and preserve existing sources as fixed `HIGH` with null due date until a separately confirmed source decision changes them.
- Bind signed cursors to `my-tasks-v2`, require version 2 and the complete tuple, current scope/user/permission/source-registry hash, valid timestamps, and expiry, and reject v1, malformed, expired, foreign-scope, and tampered cursors.
- Compute overdue/today/future from `dueAt` for display in `Asia/Manila` or the later authorized operational timezone. Never encode relative due state into ordering, seek predicates, or cursors.
- Preserve the accepted dated-before-undated tradeoff. Mitigate potential undated-task aging through seek pagination, authoritative source-workspace links, and later monitoring; do not silently move age ahead of due-null rank.
- Define one authoritative Incident base predicate and reuse it unchanged for exact count and every severity stream. A stream may add only its severity and continuation predicate.
- Bound Incident reads to four streams, one per severity, each limited to the requested page size plus one and ordered by due date with nulls last, then `createdAt`, then ID. Merge and trim only under the shared v2 comparator.
- Keep the task projection minimal: incident ID, public incident number, status, severity/priority, due date, creation time, action label, and destination identity. Do not return narrative, evidence, corrective action, reporter, owner, source-record detail, or mutation inputs.
- Require exact eligibility: resolve permission; exact tenant/company/brand-null-aware/location scope; `OPEN`, `IN_PROGRESS`, or `PENDING_REVIEW`; null `resolvedAt`; and for `CRITICAL`/`HIGH`, non-null reporter unequal to the actor. Do not add owner filtering.
- Exclude cancellation, duplicate/exception variants, correction, `RESOLVED`, `CANCELLED`, or any other terminal state. A later enrollment needs its own confirmed action-obligation predicate.
- Reauthorize resolution at the Incident destination. A stale, missing, denied, terminal, moved-scope, or actor-prohibited record must fail safely without source mutation.
- Enforce direct resolve and cancel actor parity server-side: high-risk missing reporter lineage and reporter self-action fail closed even if the action is invoked directly or exposed by a stale/manipulated UI.
- Render Incident resolve/cancel controls only when the page has sufficient reporter context and the same severity/actor eligibility used by the server. Do not infer authority from `ownerUserId`.
- Test tuple ordering, dated-before-undated behavior, exact absolute due ordering, equal-key source/record tie breaks, Manila midnight display stability, v1 rejection, v2 binding, all four severity streams, count/page parity, exact null brand scope, high-risk null/self reporter exclusion, routine-risk self-resolution, owner non-authority, terminal/correction/cancel exclusions, destination reauthorization, direct resolve/cancel denial, UI parity, bounded reads, minimal response, and non-mutation.

## Implementation and documentation impact

- Code / architecture: Version the shared `My Tasks` cursor/domain and comparator; adapt existing sources to fixed `HIGH`/null; register the Incident source adapter using four bounded severity streams. Implementation exists but remains pending independent verification.
- Data / schema: No schema change or backfill is authorized. Existing Incident `severity`, `dueAt`, `createdAt`, `reportedByUserId`, `resolvedAt`, scope, and status fields are used as stored.
- Workflow / permissions: No permission is created. `restaurant.incident.resolve` remains necessary but not sufficient; exact scope, current status, resolution state, and high-risk reporter independence also apply. Ownership remains non-authoritative.
- UI / mobile: `My Tasks` shows `Resolve incident`, source/severity/status, due presentation, and a link to the authoritative Incident detail. Overdue labels are Manila-derived display only. Incident detail resolve/cancel visibility must match server actor eligibility.
- Reporting: No report or export change is authorized. Later monitoring should detect prolonged undated work and validate the accepted dated-before-undated tradeoff without changing queue order silently.
- Knowledge base / training: **Dunong handoff required after independent verification.** Explain priority and due ordering, pooled resolution semantics, high-risk reporter independence, routine-risk self-resolution, and destination reauthorization without implying owner assignment or cancellation/correction task enrollment.
- Tests / UAT: Independent verification must cover ordering and cursor migration, eligibility and four-stream pagination, count/page parity, scope and actor controls, stale destination behavior, direct command hardening, UI parity, responsive usability, and absence of queue-side mutations.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Independently verify the v2 cursor/order contract, legacy cursor rejection, and mixed native/fixed source pagination | QA + Engineering + Security | Before claiming v2 queue completion | Accepted for this implementation slice; hosted/browser gates remain |
| Independently verify Incident predicate parity, four bounded streams, scope isolation, high-risk lineage, routine self-resolution, destination reauthorization, and non-mutation | QA + Security + Engineering | Before UAT or completion claim | Accepted after exact null-brand detail remediation |
| Verify Incident detail resolve/cancel actor parity across desktop, tablet, and mobile | Frontend Engineering + QA | Before UAT or completion claim | Code and focused tests complete; responsive browser evidence remains pending |
| Monitor whether dated `HIGH` work materially starves old undated `HIGH` work | Product + Operations + BI | After representative pilot usage | Pending — monitoring does not authorize tuple change |
| Assess user guidance, release-note, and training impact | Dunong | After independently verified implementation | Complete — glossary and knowledge-base guidance updated; no separate training workflow added |

## Evidence

- Parent-confirmed conclusion, 2026-07-23: adopt the v2 tuple and domain; keep existing sources fixed `HIGH`/null; derive overdue in Manila for display only; accept dated-before-old-undated tradeoff with pagination/source-workspace/monitoring mitigation; enroll only role-pooled Incident resolution under the exact scope, state, permission, severity, and reporter predicate; use four bounded severity streams; exclude cancel/duplicate/exception, correction, and terminal work; and harden direct resolve/cancel and UI actor parity.
- The requested council models were unavailable. The Decision Chair used the permitted GPT-5.6 council and confirmed the conclusion; this record does not substitute for the pending independent implementation verification.
- `docs/core/00-governance/DEC-0063-CROSS-SOURCE-DASHBOARD-QUEUE-PAGINATION-DECISION-BRIEF.md`: closed source registry, source-owned predicates, minimal projection, exact count/page parity, cursor, degradation, destination reauthorization, and non-mutation requirements.
- `docs/core/00-governance/decisions/DEC-0037-PHASE2-RISK-TIERED-OPERATIONS-LIFECYCLE.md`: risk-tiered Incident lifecycle and independent-review controls.
- `docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md`: `restaurant.incident.resolve` authority boundary.
- `docs/phases/phase-02-restaurant-operations-and-food-cost/workflows/incident-management-workflow.md`: implemented Incident lifecycle, direct correction boundary, terminal states, source-link non-mutation, and audit requirements.
- `docs/phases/phase-02-restaurant-operations-and-food-cost/specs/incident-management-ui-spec.md`: authoritative Incident workspace, action, context, and responsive requirements.
- `docs/phases/phase-02-restaurant-operations-and-food-cost/quality/PHASE2_UAT_SCENARIOS.md`: Incident resolution permission, lifecycle, scope, correction, audit, and source-link acceptance coverage.
- `apps/web/src/server/services/dashboardTasks.ts`: v2 tuple comparator, source ordering, and existing fixed-source seek behavior pending independent verification.
- `apps/web/src/server/services/myTasks.ts`: signed `my-tasks-v2` cursor, version/scope binding, source registry, fixed-source normalization, and Incident enrollment pending independent verification.
- `apps/web/src/server/services/incidents.ts`: exact Incident predicate, four severity streams, minimal task projection, and direct resolve/cancel lineage hardening pending independent verification.
- `apps/web/src/server/services/dashboardTasks.test.ts`, `apps/web/src/server/services/myTasks.test.ts`, and `apps/web/src/server/services/incidents.test.ts`: focused ordering, cursor, enrollment, predicate, pagination, and lineage tests pending independent verification.
- `apps/web/src/app/(app)/my-tasks/page.tsx` and `apps/web/src/app/(app)/incidents/[id]/page.tsx`: queue destination and Incident action UI parity pending independent verification.
- `packages/database/prisma/schema.prisma`: Incident severity, nullable due/reporter/resolution fields, status, scope, ownership, and creation timestamp.
- `AGENTS.md` sections 4, 6-9, and 13: scope isolation, server authorization, no UI-only authority, workflow/audit integrity, visible-surface verification, and material-decision hard gates.

## Supersession

This decision is not superseded. It supersedes only the prior `My Tasks` v1 cursor and ordering contract; it does not alter any source workflow, permission, incident risk policy, or stored due date. A later decision may add an Incident action type or change source-native ordering fields only after confirming its exact executable obligation, authority, segregation, scope, pagination, and migration behavior.
