# DEC-0053 — Bounded, Scope-Authorized Dashboard Read Model

## Metadata

- Decision ID: `DEC-0053`
- Title: Bounded, Scope-Authorized Dashboard Read Model
- Status: `Confirmed`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation and Phase I dashboards
- Related decision brief: `OV-READMODEL-2026-07-23`

## Decision

OGFI dashboards will use a bounded, server-side read model that authorizes the requested company, brand, location, and role scope before assembling closed typed DTOs for explicitly registered dashboard routes. Each source may degrade independently into a generic, non-sensitive unavailable result, so that a failure in one source does not widen scope, expose internal failure detail, or prevent unrelated authorized work from being displayed.

The default dashboard hierarchy is action-first: show compact scope and freshness context, then a prioritized, paginated **Today’s work** queue, then compact role-required KPI summaries, with analytics and reports as secondary drill-down content. The target source service must reauthorize every resulting action; dashboard inclusion is not authority to read or mutate its source record.

## Context

Dashboard users need a single entry point for current operational work across approvals, purchasing, receiving, transfers, counts, wastage, adjustments, and authorized exceptions. A client-composed dashboard or an unbounded aggregate route can diverge from service-layer scope enforcement, leak record existence, become unavailable because one source is slow, and make the day’s actionable work less visible than summary numbers.

The confirmed model preserves the Phase I role KPI requirements while making action completion the first operational outcome. It is a read-model boundary, not a new workflow authority, reporting warehouse, or substitute for the governed source services.

## Options considered

### Option A — selected: bounded server-side, scope-authorized, per-source degradable read model

- Summary: A server route receives a bounded dashboard request, validates and authorizes its scope, obtains only registered typed source summaries/tasks, and returns a closed DTO with queue priority, total, paging, freshness, compact KPIs, and generic source availability states.
- Benefits: Keeps organizational authorization server-side; gives users a fast action-first queue; prevents a single source outage from blanking the dashboard; limits payload/query cost; gives the UI stable, non-sensitive contracts; and preserves source-service authority for drill-down and action.
- Failure modes: A source adapter can omit a task, return stale data, use inconsistent priority semantics, time out, or accidentally expose source-error details. A dashboard link can become stale before a user acts.
- Why selected or rejected: Selected because it makes the dashboard an authorized operational index rather than a client-side aggregation layer, while retaining clear failure and freshness behavior.

### Option B — rejected: UI-only composition of existing source endpoints

- Summary: Let the browser call multiple module APIs and combine their responses into dashboard cards and a task list.
- Benefits: Reduces initial backend composition work and can reuse visible source endpoints.
- Failure modes: Scope checks and filtering can drift by widget; partial failures produce inconsistent presentation; client requests can overfetch; record existence may be inferred; sorting/paging is not globally reliable; and the browser becomes an accidental authority coordinator.
- Why selected or rejected: Rejected because UI hiding and client aggregation cannot be the scope or authorization boundary and do not provide a coherent priority/total/paging contract.

### Option C — rejected: defer the cross-source dashboard until all sources are available

- Summary: Continue displaying KPI-first or isolated module widgets and postpone a shared operational queue until every participating source has complete data/read APIs.
- Benefits: Avoids adapter work and avoids partial-source presentation in the short term.
- Failure modes: Leaves urgent work fragmented, encourages users to navigate by module rather than task, and makes dashboard readiness depend on the slowest source.
- Why selected or rejected: Rejected because a bounded degradable queue can safely provide useful authorized work before every secondary analytical source is mature. Deferral remains appropriate only for an individual source that cannot satisfy its contract.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** The route must validate the requested scope against the current server session and use it as an immutable input for each source adapter. Consolidated scope is allowed only where the existing role and assignment rules allow it; no client-supplied record ID or widget parameter may widen it.
- **Server-enforced authorization:** The dashboard route and each source adapter authorize before querying. Target source services reauthorize when the user opens, exports, or acts on a record; a task DTO is never a capability token.
- **Approval segregation and controlled workflow integrity:** The read model may display eligible work but must not decide approvals, bypass no-self-approval rules, or mutate workflow state. Controlled actions continue through their existing source services.
- **Audit and confidentiality:** The dashboard emits no source stack traces, SQL errors, record-presence hints, or unauthorized totals. Where an availability state is required, it is generic and does not identify sensitive source records.
- **Transaction consistency and idempotency:** This is a read model. It must not post source mutations or synthesize transaction state. Source actions retain their own transaction, idempotency, locking, and audit controls.
- **Phase scope and recovery:** The dashboard is bounded to Phase I operational sources and existing authorized drill-downs. Per-source timeouts, generic failure states, freshness timestamps, and fallback to unaffected sources provide a recoverable degraded mode without inventing analytics or an external data platform.

## Required safeguards

- Define closed TypeScript DTOs and an explicit registered route contract. Do not return arbitrary source payloads, raw errors, opaque JSON, or client-selectable source names.
- Validate request shape, pagination limits, allowed filters, and scope server-side. Enforce deterministic page size and a maximum; expose `total`, current page/cursor, and next-page availability only for the authorized result set.
- Construct **Today’s work** from a documented common task projection: stable task ID, source type, record reference safe to display, allowed location context, status, due/age, priority, freshness, and permitted destination/action metadata. Never expose a source’s private fields by pass-through.
- Apply one documented default ordering: critical, overdue, due today, then newest; use deterministic secondary ordering and preserve priority labels in the DTO. Source adapters must not silently substitute their own incompatible priority ordering.
- Return compact KPI summaries only after scope authorization. Retain the role-required KPI categories in the Phase I dashboard specification; every KPI and queue item must drill into an authorized filtered list/report or the authoritative source surface.
- Use per-source deadlines and isolation. A failed, timed-out, or unavailable source returns a generic availability result and no internal reason; unaffected sources may render. Do not distinguish “not found,” “forbidden,” and internal source failure in a way that leaks record existence.
- Include scope and freshness context in the response and UI. Freshness must identify when the read model was assembled or when a source summary was last refreshed, without claiming real-time consistency it cannot prove.
- Reauthorize at the target source service for every drill-down, export, view, and write action. The dashboard may link only to registered destinations and must handle a later denial, status change, or stale task gracefully.
- Test route/schema validation, tenant/company/brand/location scope boundaries, role permissions, no overfetch, source failure isolation, generic error redaction, empty states, priority ordering, totals/paging, stale/deleted target handling, target-service reauthorization, responsive task completion, and source-action authorization regressions.

## Implementation and documentation impact

- Code / architecture: Add a bounded server-side dashboard composition boundary with explicit registered source adapters, closed typed DTOs, and route validation. Do not place cross-source authority or source action logic in browser components.
- Data / schema: No dashboard-specific source-of-truth table or schema change is authorized by this decision. Any future materialized/read-store proposal requires a separate decision and data-integrity review.
- Workflow / permissions: No new role, permission, approval authority, or action is created. Existing source-service authorization remains authoritative.
- UI / mobile: Present compact scope/freshness context, then Today’s work, then compact KPIs, with secondary analytics/reports. Preserve the existing role KPI requirements; show generic, useful degraded/empty states and clear authorized drill-downs.
- Reporting: Analytics and reports remain secondary and must use their own approved data and access controls. The dashboard read model is not an unrestricted reporting API.
- Knowledge base / training: Dunong must update dashboard role guidance after the registered source set, final labels, degraded-state copy, and mobile behavior are implemented and verified. No user-facing material should claim a dashboard task grants source-record access.
- Tests / UAT: Add unit, integration, and role/scope UAT coverage for the safeguards above before calling the dashboard production-ready.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Define the closed DTO, registered source set, route validation, deadlines, and generic availability taxonomy | Backend Engineering + Architecture | Before dashboard read-model implementation | Pending |
| Implement Today’s work queue with authorized priority, total, and paging semantics | Backend Engineering + Frontend Engineering | After route contract approval | Pending |
| Retain and connect role-required compact KPI categories to authorized drill-downs | Frontend Engineering + module owners | With dashboard workspace implementation | Pending |
| Verify target-service reauthorization and degraded-source behavior across permitted scopes | QA + Security | Before dashboard UAT | Pending |
| Prepare verified role-based dashboard guidance | Dunong | After implementation and UI labels are confirmed | Handoff required |

## Evidence

- `OV-READMODEL-2026-07-23`: parent-confirmed conclusion selecting the bounded server-side, scope-authorized, per-source degradable read model and action-first hierarchy.
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`: requires server authorization, scope isolation, audit safety, phase discipline, and recovery safeguards for a material architecture and UX decision.
- `docs/core/00-governance/DECISION_SCORECARD.md`: requires hard controls to prevail over convenience or visual preference.
- `docs/phases/phase-01-procurement-inventory/specs/dashboard-ui-spec.md`: Phase I role KPI requirements, action-queue standard, My Tasks priority order, scope constraints, and responsive behavior.
- `docs/core/04-design/UI_IMPLEMENTATION_STANDARD.md`: authoritative dashboard/workspace layout and responsive design standards.

## Supersession

This decision is not superseded. It resolves the dashboard read-model and information-hierarchy choice for the specified Phase I implementation. A later decision proposing a materialized store, external analytics platform, new dashboard authority, or changed scope semantics must explicitly amend or supersede this record.
