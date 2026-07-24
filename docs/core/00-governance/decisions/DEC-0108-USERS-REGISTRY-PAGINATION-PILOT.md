# DEC-0108 — Users Registry Pagination Pilot and Explicit Administration Denial

## Metadata

- Decision ID: `DEC-0108`
- Title: Users registry pagination pilot and explicit administration denial
- Status: `Confirmed`
- Date: 2026-07-24
- Decision owner: Product / Engineering
- Decision Chair: Parent implementation agent
- Related phase/module: Phase I / Core Administration / Users registry
- Related decision brief: Parent-confirmed Administration Users pagination pilot deliberation (2026-07-24)

## Decision

Implement a bounded, server-owned Users-registry pagination pilot using the existing authorized service projection and deterministic ordering, with a 25-row page contract and URL-backed navigation. The page must perform an explicit permission preflight and render a truthful denied state before any Users query when the operator lacks the required administration authority.

The pilot is limited to the Users registry. Roles, organization, audit, request/permission registers, and user/role/organization/audit detail pagination remain deferred. `DEC-0043` remains authoritative: service/data-access authorization must continue to require `core.tenant_role_administer`; this decision does not broaden `core.administer`, selected-company `MANAGE`, or UI-only authority.

## Context

The Administration workspace currently combines several registers and detail surfaces with unbounded or hard-capped reads. The Users registry is the smallest useful pilot for proving bounded reads, truthful page state, and a visible denial explanation without changing the tenant-global role-assignment boundary. A page-level guard that only hides content can leave the service contract unclear, while a client-side slice cannot provide truthful totals or protect query cost.

## Options considered

### Option A — selected: Users-only server pagination pilot

- Summary: Add a server-owned 25-row Users query with bounded inputs, deterministic ordering, URL-backed page state, and a pre-query permission denial state. Keep the existing service authorization as the final authority.
- Benefits: Establishes a reversible pattern on one high-value register, limits query cost, makes totals/page state truthful, and directly addresses the current visible denial gap.
- Failure modes: A future caller could bypass the page preflight; count and row predicates could diverge; unstable ordering could duplicate or skip users; or the pilot could be mistaken for completion of the whole Administration workspace.
- Why selected: It satisfies the bounded-query and visible-surface gates while preserving `DEC-0043` and keeping the implementation scope reviewable.

### Option B — rejected: paginate every Administration register and detail surface now

- Summary: Cut over Users, roles, organization, audit, requests/permissions, and details as one broad workspace change.
- Benefits: More uniform information architecture in one release.
- Failure modes: Expands the authorization, filter, audit, and responsive-surface review beyond the evidence available for this slice; increases regression risk and can hide incomplete tabs behind a broad “done” claim.
- Why selected or rejected: Rejected because each surface has distinct scope, projection, and detail semantics that require separate contracts.

### Option C — rejected: client-side slicing or a larger unbounded read

- Summary: Continue loading the full Users collection (or a hard cap) and paginate/filter in the browser.
- Benefits: Minimal service change.
- Failure modes: Query and memory cost grow with tenant size, totals are not authoritative, records outside the loaded cap disappear, and authorization remains dependent on a UI boundary.
- Why selected or rejected: Rejected because it fails bounded-query, truthful-pagination, and server-enforced authorization gates.

### Option D — rejected: defer Users pagination until the entire Administration workspace is redesigned

- Summary: Leave the Users registry unchanged while waiting for all registers and details to receive final contracts.
- Benefits: Avoids an interim pattern.
- Failure modes: Preserves the current unbounded read and unexplained denial state, delaying measurable risk reduction.
- Why selected or rejected: Rejected because a narrow pilot can be independently verified and does not pre-commit the deferred surfaces.

## Hard-gate assessment

- **Tenant and scope isolation:** The Users service query remains tenant-scoped and uses the existing company/target eligibility rules. Pagination cannot widen the authenticated scope.
- **Server-enforced authorization:** `core.tenant_role_administer` remains required at the service/data-access boundary under `DEC-0043`. The page preflight is additive UX protection, not an authorization substitute.
- **Bounded and truthful reads:** Page size is clamped to the approved 25-row contract; count and row predicates are shared; ordering is deterministic; page links preserve the canonical query state.
- **Non-destructive administration:** This is a read/pagination decision. It creates no role, grant, deactivation, onboarding, approval, or audit mutation authority.
- **Phase and recovery:** The pilot is limited to Core Administration and can be rolled back without schema or assignment migration. Deferred surfaces remain explicitly pending.

## Required safeguards

- Run the permission preflight before constructing or executing the Users list/count query; denied responses must explain that `core.tenant_role_administer` is required without enumerating user data.
- Retain the service/data-access guard and reauthorize any linked detail or mutation action independently; a page result or URL must never grant authority.
- Validate and clamp page input server-side, use one predicate for rows and totals, and use deterministic ordering with a stable tie-breaker.
- Preserve tenant, active-account, and selected-company eligibility behavior from `DEC-0043`; do not relabel tenant-global role assignments as company-bound.
- Provide loading, empty, error, and denied states, including a clear distinction between “no users found” and “not authorized.”
- Add tests for missing permission, cross-tenant attempts, bounded query/page behavior, count/page parity, deterministic navigation, and denied-write/no-query behavior.
- Do not expose pagination controls or claim completion for roles, organization, audit, request/permission, or detail surfaces until their contracts are separately confirmed.

## Implementation and documentation impact

- Code / architecture: Add the Users registry server page/query contract and page-level preflight while retaining `coreAdmin.ts` (or its successor) as the authorization authority. No schema or role-engine change.
- Data / schema: None.
- Workflow / permissions: No permission is added or removed. `core.tenant_role_administer` remains the required tenant-level administration capability; `core.administer` plus company `MANAGE` is not a substitute.
- UI / mobile: Users receives bounded pagination and an explicit pre-query denied state with truthful empty/error/loading behavior. Other Administration tabs/details remain pending rather than passive or misleadingly complete.
- Reporting: No export or report contract changes; any future Users export requires its own bounded/authorized decision.
- Knowledge base / training: Dunong handoff is required after the pilot is implemented and labels/denial copy are stable; guidance must explain the permission denial without implying company-bound role assignments.
- Tests / UAT: Verify desktop/tablet/mobile list states, URL-backed navigation, representative-volume query bounds, permission denial before query, and preservation of DEC-0043 authorization.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the Users 25-row server pagination and shared count/page contract | Engineering | Administration Users pilot | Pending |
| Add explicit pre-query denial state and no-query authorization tests | Engineering + QA + Security | Before pilot UAT | Pending |
| Verify responsive list, empty/error/loading/denied states and URL navigation | UX + QA | Before visible-surface gate | Pending |
| Deliberate roles, organization, audit, request/permission, and detail pagination separately | Decision Chair + Product + Engineering | After Users pilot evidence | Deferred |
| Assess user-facing administration guidance and release impact | Dunong | After verified pilot behavior | Handoff required |

## Evidence

- Parent Decision Chair confirmation dated 2026-07-24: select a bounded Users-registry pagination pilot with explicit pre-query denied state; preserve `DEC-0043`; defer roles/org/audit/detail pagination.
- `docs/core/00-governance/decisions/DEC-0043-TENANT-ROLE-ADMINISTRATION-BOUNDARY.md` — tenant-global role administration and `core.tenant_role_administer` service authorization.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` § Administration — identifies unbounded/hard-capped Administration reads and requires explicit denial explanation without relaxing the service guard.
- `docs/core/04-design/UI_UX_WORKSPACE_AUDIT.md` — URL-backed pagination and visible-surface requirements.
- `apps/web/src/app/(app)/admin/page.tsx` and `apps/web/src/server/services/coreAdmin.ts` — current Users registry/page and service authorization surfaces reviewed for scope.
- Requested Code Spark/GPT-5.4 reviewers were unavailable; the closest permitted GPT-5.6 fallback was used, without relaxing any hard gate.

## Supersession

This decision does not supersede `DEC-0043`. It narrows only the delivery sequence and read-surface contract for the Users registry. A later Administration decision may extend or replace this pilot only after preserving the `core.tenant_role_administer` boundary and documenting the additional surface-specific contracts.
