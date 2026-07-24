# DEC-0107 — My Tasks Filter Contract and Assignment Semantics

## Metadata

- Decision ID: `DEC-0107`
- Title: My Tasks filter contract and assignment semantics
- Status: `Confirmed`
- Date: 2026-07-24
- Decision owner: Product / Engineering
- Decision Chair: Parent implementation agent
- Related phase/module: Phase I / Overview and application shell / My Tasks
- Related decision brief: `DEC-0063-CROSS-SOURCE-DASHBOARD-QUEUE-PAGINATION-DECISION-BRIEF.md`

## Decision

My Tasks filters may be implemented only as server-owned, source-predicate filters: enrolled module, canonical priority, source-native status, the already-selected location, and native `dueAt` where a source supplies it. Enrolled module, canonical priority, source-qualified status, and native due buckets are now implemented with count/page predicate parity. Due buckets query only Incident and Maintenance native due fields; fixed/no-due sources are excluded from date-bucket reads. `Assigned by` and arbitrary multi-location filtering remain deferred until their authority and data semantics are explicitly defined.

The current queue remains unfiltered until every selected adapter accepts the same filter contract for count and page predicates. UI-only or post-merge filtering is prohibited.

## Context

The dashboard specification requires priority, module, location, due-date, assigned-by, and status filters. The current queue adapters accept only seek cursor and page size; they return heterogeneous minimal projections. Only Incident and Maintenance currently expose native priority and due dates. Other sources use fixed `HIGH` and no due date. Several sources are role-pooled or requester-owned, so creator, reporter, opener, or submitter cannot be relabeled as an assigner.

## Options considered

### Option A — selected: source-owned filter contract

- Summary: Add normalized filters at the service boundary, pass them into every enrolled adapter's count and row predicate, bind them to signed cursor scope, and keep selected-location authorization server-enforced.
- Benefits: Preserves count/page parity, stable cursors, source-native status semantics, and existing authorization boundaries.
- Failure modes: Requires coordinated adapter changes and a filter/status matrix before the UI can expose controls.
- Why selected: It is the only option that satisfies pagination and authorization hard gates.

### Option B — rejected: browser or post-merge filtering

- Summary: Filter the loaded page after adapters return.
- Benefits: Small initial code change.
- Failure modes: Misses matching records outside the loaded page, lies about totals, and causes cursor skips or duplicates.
- Why rejected: Violates queue integrity and visible-surface truthfulness.

### Option C — deferred: assigned-by and arbitrary location filters

- Summary: Add common assignment identity and a multi-location selector.
- Benefits: Matches the full dashboard requirement.
- Failure modes: Invents assignment meaning for role-pooled work and risks widening scope beyond the selected authorized location.
- Why deferred: Requires a separate policy, data, and authorization decision.

## Hard-gate assessment

- Tenant/company/brand/location isolation remains in each source service; the selected location is context, not a client-controlled widening filter.
- Source actions remain independently reauthorized; queue membership and cursors do not grant authority.
- Exact totals remain withheld when an enrolled selected source is unavailable.
- Filter changes must invalidate a cursor through canonical filter binding and a registry-version bump.

## Required safeguards

- Validate and canonicalize filters once at the My Tasks server boundary.
- Use source-qualified native statuses; do not invent a cross-module status lifecycle.
- Use only native `dueAt`; do not reinterpret required dates, business dates, or creation dates as task due dates.
- Do not expose `assignedBy` until a source-agnostic meaning and projection are approved.
- Resolve the existing partial-source continuation risk before declaring filtered pagination complete; a partial page must not issue a continuation cursor unless its snapshot semantics are proven.
- Before UAT at representative volume, run PostgreSQL query-plan/volume evidence for native due predicates and assess a scoped due-date index; no index is claimed by this slice.
- Test invalid filters, unauthorized modules/locations, cursor binding, date rollover, count/page parity, mixed-source ordering, partial availability, and destination reauthorization.

## Implementation and documentation impact

- Code / architecture: The current slice exposes enrolled-module, canonical priority, source-qualified status, and native due buckets. Each enrolled adapter intersects the filter with its existing action predicate for both count and page reads; future due-range or source changes must accept the contract above and bump `myTasksRegistryVersion`.
- Data / schema: No schema change; no actor identity is added for deferred `assignedBy`.
- Workflow / permissions: Role-pooled and personal obligations retain their existing semantics.
- UI / mobile: The My Tasks workspace exposes working module, priority, source-qualified status, and native due-bucket filters and clearly labels assignment and arbitrary-location filtering as pending server contracts.
- Knowledge base / training: Explain that the current queue is paginated but not yet a filtered enterprise task list.
- Tests / UAT: Use the matrix above before exposing filters.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Define source-qualified status catalog and adapter input contract | Engineering / Product | Before filter implementation | Open |
| Decide whether multi-location task views are required | Product / Security | Before location selector | Open |
| Define assignment semantics for pooled and personal obligations | Product / HR/Operations | Before `assignedBy` | Open |
| Design partial-source continuation or no-next-cursor behavior | Engineering / QA | Before filtered pagination | Open |

## Evidence

- `docs/phases/phase-01-procurement-inventory/specs/dashboard-ui-spec.md` §6
- `apps/web/src/server/services/myTasks.ts`
- `apps/web/src/server/services/dashboardTasks.ts`
- `DEC-0063`, `DEC-0064`, `DEC-0065`, `DEC-0066`, `DEC-0067`, `DEC-0068`
- Independent first-round workflow and data/security reviews on 2026-07-24; requested Code Spark/GPT-5.4 models were unavailable and the closest active GPT-5.6 fallback was used.
