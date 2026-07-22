# DEC-0063 — Cross-Source Dashboard Queue Pagination Decision Brief

## Decision ID

`DEC-0063`

## Status

`Confirmed`

## Decision question

How should the Overview's cross-source `Today’s work` queue provide complete, deterministic access to authorized actionable work without widening source reads, exposing protected records, or misrepresenting a preview as a paginated queue?

## Why now

The active Overview correctly discloses that it shows bounded priority previews (five approval items and eight exceptions). This is safe but does not meet the confirmed `DEC-0053` target of authorized totals and pagination for the cross-source queue. The user requested ordered completion toward production readiness, so the next step is to decide the queue contract before changing its data access or UI.

## Affected scope

- **Phase:** Shared Production Foundation and Phase I dashboard/My Tasks.
- **Modules:** Overview, approvals, purchase requests/orders, receiving, transfers, stock counts, wastage, adjustments, branch operations, food safety, incidents, and maintenance.
- **Users / roles:** Any authorized dashboard user; source roles and selected company/brand/location scope remain authoritative.
- **Records / data:** Read-only common task projections and source availability/freshness metadata. No source workflow state or inventory data may be mutated.
- **Operational impact:** Branch and warehouse users need a truthful, mobile-usable way to reach lower-priority work without having a dashboard item act as an authority grant.

## Verified current state

- `DEC-0053` confirms a bounded, server-authorized dashboard read model and requires deterministic page semantics for `Today’s work`.
- The active dashboard builds one in-memory ordered result from bounded source candidates, then uses `slice` only for an explicitly labeled priority preview. It exposes a count of candidates, not a guaranteed total of every cross-source task.
- Registered source adapters provide scoped aggregates and narrow candidates; some source workspaces have independently confirmed closed drilldown profiles, while other source semantics are still deliberately deferred.
- Approval preview remains feature-disabled while normalized routing is not activated. Food Cost cannot join a new dashboard projection while `DEC-0062` remains open.
- Source services independently reauthorize destination reads and actions. Existing dashboard source failure handling is generic and source-local.

## Constraints and hard gates

- Retain tenant, company, brand, location, project, and role scope isolation at the server boundary.
- A dashboard item is not a capability: every source destination/action must reauthorize.
- Do not broaden any source query to full details or return raw source errors.
- Preserve no-self-approval, immutable inventory ledger, and audit controls by keeping this read-only.
- Do not silently include a source whose task semantics, confidentiality requirements, or actual total are not proven. `DEC-0061` Count Variance and `DEC-0062` Food Cost remain excluded.
- Do not add AWS, Redis, an external queue, a reporting store, or a second source of truth. Hostinger/PostgreSQL remain the deployment boundary.
- The UI must distinguish a paginated complete queue from a priority preview and remain usable on desktop, tablet, and mobile.

## Options

### Option A — confirmed-source central queue page with a server-owned composite cursor

Add a dedicated `My Tasks`/queue route backed by a closed dashboard task projection. Each participating source supplies an authorized, minimal, seek-paginated task adapter; the server applies one priority/order contract and returns a composite cursor plus source completeness/availability metadata. Keep Overview as a small truthful preview that links to the full queue. Exclude unavailable, feature-disabled, and semantically unresolved sources.

### Option B — use only source-owned queues and remove the expectation of a complete cross-source queue

Keep Overview as a preview and direct users to each source workspace. Do not build shared pagination until every Phase I source can participate.

### Option C — materialize cross-source tasks into a new durable dashboard/read-model table

Write task projections during source transitions and paginate that table. This would require new source-of-truth, synchronization, recovery, audit, migration, and stale-task semantics.

## Required source documents

- `docs/core/00-governance/decisions/DEC-0053-BOUNDED-SCOPE-AUTHORIZED-DASHBOARD-READ-MODEL.md`
- `docs/core/00-governance/decisions/DEC-0054-APPROVAL-PREVIEW-FEATURE-DISABLED-POSTURE.md`
- `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md`
- `docs/phases/phase-01-procurement-inventory/specs/dashboard-ui-spec.md`
- `docs/core/04-design/UI_IMPLEMENTATION_STANDARD.md`
- `apps/web/src/server/services/dashboard.ts`
- Source dashboard-read service contracts referenced by that service.

## Council and challenge roles

- **First-round specialists:** Mutya (reporting/read model), Hiraya (architecture and scope), Diwata (dashboard/mobile UX), Luningning (authorization and confidentiality).
- **Challenge reviewer:** Lualhati (verification and edge cases) if the first round identifies a viable option.
- **Decision Chair:** Codex parent agent.

## Decision deadline and owner

- **Deadline:** Before the next cross-source queue implementation checkpoint.
- **Human owner, if needed:** OGFI ERP product owner for any choice that changes the intended source set or task-completeness promise.

## Output required

A confirmed architecture and UI contract, or a documented open decision/defer outcome. No implementation is authorized while the decision remains under review.

## Decision Chair conclusion — July 23, 2026

**Option A is confirmed.** Keep Overview as an explicitly bounded preview and add a separate, server-owned `My Tasks` workspace only through a closed registry of source-owned, authorized, seek-paginated task adapters. This is a live current-work view, not a durable snapshot or new task source of truth.

The queue must use one normalized priority/due/age/source/task ordering contract, evaluate due states in the authorized operational timezone (initially `Asia/Manila`), and reauthorize both queue reads and every destination. Exact `totalCount` is permitted only when every registered source is available and uses the same documented task predicate for its exact count and paged rows. Otherwise the UI must report partial coverage, omit the numeric total/final-page claim, and link generically to affected authoritative workspaces. Unauthorized sources are not disclosed.

The cursor must be opaque, versioned, scope/filter/source-set bound, and integrity protected. A single global anchor is permitted only if all enrolled adapters can seek after the identical global ordering tuple. Otherwise it must retain per-source positions **and bounded unconsumed lookahead**; advancing a source merely because it was fetched is forbidden. Tests must prove no gap/duplicate traversal for stable data, cursor invalidation on scope/filter change, generic source degradation, destination reauthorization, and Manila-midnight ordering.

Initial enrollment remains intentionally narrow. No source joins until its action-obligation grain, exact predicate, minimal fields, ordering tuple, and source-page parity are independently verified. Approval is excluded while `DEC-0054` remains feature-disabled; Count Variance and Food Cost remain excluded under `DEC-0061` and `DEC-0062`. A durable projection table is rejected for this checkpoint because it would add synchronization, stale-state, recovery, and migration obligations before task semantics are stable.
