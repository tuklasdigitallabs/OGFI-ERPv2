# DEC-0070 — Closed Ledger Variance Reconciliation Dashboard Drilldown

## Metadata

- Decision ID: `DEC-0070`
- Title: Closed Ledger Variance Reconciliation Dashboard Drilldown
- Status: `Confirmed — production-gate verification pending`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation and Phase I Overview / Inventory Reconciliation
- Related decision brief: Parent-confirmed ledger-variance reconciliation deliberation, 2026-07-23; governed by `DEC-0053`, `DEC-0055`, and the immutable inventory-ledger controls

## Decision

Approve the closed, source-owned, read-only dashboard profile `ledger-variance-v1` at:

```text
/inventory/reconciliation?dashboard=ledger-variance-v1
```

Access requires both `inventory.balance.view` and `inventory.ledger.view`. Under the current tenant and company and the selected active location, the server must build the complete union of inventory-balance keys and posted inventory-movement keys in one database statement, aggregate each side, and include exactly keys for which:

```text
round(cached balance quantity - ledger-derived quantity, 6) != 0
```

Dashboard count and candidates, profile authorized total and pages, normalized search, and dedicated export must share this canonical population and deterministic order. The profile is diagnostic and read-only: it performs no balance repair, movement posting, adjustment, reversal, approval, or other mutation. Each row provides an exact ledger trace to the authoritative movement history for its item/location key.

When ledger-reconciliation block mode is active, the dashboard suppresses the numeric ledger-variance KPI so an untrusted value is not presented as operational truth. An otherwise authorized user may still open the diagnostic profile, which must display an explicit untrusted-data warning and retain the same read-only boundary.

## Context

The inventory movement ledger is authoritative, while the cached balance is a derived operational projection. A dashboard variance count is therefore meaningful only if it compares the complete set of keys present on either side. Starting from balances alone misses ledger-only keys; starting from movements alone misses cache-only keys. Separate application queries also create a time-of-check split and make count, page, search, candidates, and export vulnerable to population drift.

The generic `/inventory` workspace does not establish a closed reconciliation population, dual-permission boundary, full-outer key comparison, or diagnostic warning posture. It also risks presenting ordinary inventory actions near a control finding. A dedicated closed destination is required so the dashboard remains a bounded read aid and never becomes an implicit repair tool.

Block mode signals that ledger-derived inventory figures are not trusted for normal operational display. Suppressing only the diagnostic destination would remove the evidence needed to investigate the block. The accepted posture suppresses the headline number while preserving an authorized, clearly warned diagnostic page.

## Options considered

### Option A — selected: dedicated closed reconciliation profile

- Summary: Use `ledger-variance-v1` at the dedicated reconciliation route, require both balance and ledger read permissions, compute the full key union and six-decimal variance in one database statement, share the canonical resolver across every surface, and expose only read-only diagnostics and exact ledger trace.
- Benefits: Detects balance-only and ledger-only discrepancies; keeps scope and permissions exact; prevents cross-query population drift; gives operators a truthful investigation path; and preserves the ledger and controlled adjustment workflows as the only mutation authorities.
- Failure modes: An incomplete union can hide discrepancies; numeric normalization can differ between count and page; copied predicates can drift; search/export can broaden scope; a generic trace can lose the exact item/location key; block mode can display an untrusted KPI without warning; or profile controls can be mistaken for repair authority.
- Why selected: It is the only option that passes completeness, scope, least-authority, ledger-integrity, diagnostic-availability, and parity hard gates.

### Option B — rejected: link the KPI to generic `/inventory`

- Summary: Reuse the ordinary inventory workspace and its filters or client query parameters as the dashboard destination.
- Benefits: Requires less dedicated UI and route work.
- Failure modes: The workspace does not guarantee the canonical variance population, full key union, dual permission, shared count/page/export behavior, exact trace, or absence of mutation controls. Client inputs can redefine or widen the dashboard meaning.
- Why selected or rejected: Rejected because a generic workspace is not a closed server-owned drilldown profile and cannot safely represent this control finding.

### Option C — rejected: compare only cached-balance rows or use multiple application queries

- Summary: Iterate existing balance rows and calculate corresponding ledger totals separately, or query each side independently and merge in application memory.
- Benefits: Simpler ORM implementation and familiar balance-first presentation.
- Failure modes: Misses ledger-only keys, may miss cache-only or zero-side cases depending on the starting set, observes different database snapshots across calls, creates unbounded application work, and makes exact count/page/export parity difficult to prove.
- Why selected or rejected: Rejected because it fails completeness, consistency, and production-boundedness gates.

### Option D / defer — fallback only

- Summary: Keep the KPI non-navigable or disabled until the dedicated profile and production evidence are available.
- Benefits: Avoids publishing an incomplete diagnostic surface.
- Failure modes: Leaves an important integrity signal without a bounded investigation path and does not resolve population or authorization ambiguity.
- Why selected or rejected: Rejected as the target outcome, but retained as the safe fallback: do not activate or claim production readiness if the dedicated profile or required evidence is incomplete.

## Hard-gate assessment

- **Tenant, company, and selected-location isolation:** Every canonical query applies the exact current `tenantId`, `companyId`, and selected active `locationId`. The route, profile value, search text, export request, key data, and dashboard payload cannot override or widen scope.
- **Server-enforced authorization:** Dashboard diagnostic disclosure, profile pages, ledger trace, and export require both `inventory.balance.view` and `inventory.ledger.view`. The profile identifier is a closed allow-list value, not a capability.
- **Approval and segregation:** The profile grants no adjustment, posting, approval, rejection, reversal, or reconciliation-write authority. Any later corrective action remains in its authoritative source workflow with its own permission, reason, evidence, approval, and segregation controls.
- **Immutable inventory ledger and audit trail:** The profile reads posted movements and cached balances only. It never updates a balance directly or creates, edits, deletes, or reverses a movement. Export is separately authorized and audited.
- **Transactional consistency:** One database statement constructs and aggregates the complete balance/movement key union so a resolver call observes one statement snapshot. Shared resolver semantics keep count, candidates, page, search, and export aligned.
- **Phase scope and recovery:** The decision is limited to a Phase I diagnostic read surface. The route/profile can be disabled without changing balances, movements, approvals, or audit data. Defer remains the safe fallback when evidence is incomplete.

## Canonical population and trace contract

For the exact authorized tenant, company, and selected active location:

1. collect every item/location key represented by an inventory-balance row;
2. collect every item/location key represented by an eligible posted inventory movement;
3. form their full union in the same database statement;
4. aggregate cached quantity and ledger quantity for every union key, treating an absent side as zero according to the approved query contract;
5. normalize the difference to six decimal places; and
6. include the key only when the normalized difference is non-zero.

The same normalized values and deterministic unique tie-breaker must drive dashboard count/candidates, profile count/page, normalized search, and export. Search may only narrow the canonical authorized population over approved item identifiers or names; it cannot replace scope or variance membership.

Each displayed key must link to an exact ledger trace constrained to the same authorized tenant, company, location, and item. The trace must not silently fall back to a broad ledger list, a different location, or a client-controlled scope. Current authorization is rechecked at the trace destination.

## Required safeguards

- Register only the closed `ledger-variance-v1` profile for this destination. Reject or safely ignore unknown profile values without falling back to generic inventory filters.
- Require both `inventory.balance.view` and `inventory.ledger.view` for the KPI diagnostic population, profile, trace, and export. Neither permission alone is sufficient.
- Resolve and validate the selected active location from the current authorized session. Do not accept tenant, company, location, or brand scope from raw profile input.
- Use a single database statement per resolver call to build the full union of balance and posted-movement keys and aggregate both sides. Do not use balance-only, movement-only, N+1, or separately timed application merges.
- Centralize the canonical union, aggregation, `round(cache - ledger, 6) != 0` membership, and ordering contract. Dashboard count/candidates, authorized total/page, search, and export must use it without predicate copies that can drift.
- Use bounded deterministic server pagination and bounded candidates with a stable unique key tie-breaker, safe page bounds, and identical repeated-request ordering under unchanged data.
- Permit only trimmed, length-bounded, normalized search over approved item identifiers and display names. Search is an additional narrowing condition and cannot alter scope, membership arithmetic, order, or permissions.
- Keep the profile projection diagnostic and least-data: item identity, selected location identity, normalized cached quantity, normalized ledger quantity, normalized variance, and exact ledger-trace identity. Do not expose evidence payloads, approval internals, mutation inputs, or unrelated movement data.
- Render no repair, set-balance, adjustment, post, approve, reverse, or delete action in the profile. Help text must direct authorized corrections through the applicable source workflow without implying that every variance should be auto-fixed.
- Provide a dedicated export that repeats dual authorization, exact scope, canonical membership, normalized search, and deterministic order; audit the export with actor, tenant, company, selected location, profile, search metadata, row count, and outcome without logging sensitive row payloads.
- In reconciliation block mode, suppress the numeric dashboard KPI and use non-numeric blocked copy. Keep the authorized diagnostic route available with a prominent warning that its figures are untrusted for operational decisions until the block is cleared.
- Reauthorize every exact ledger trace and fail safely for revoked permission, moved scope, inactive location, stale/missing item, or no-longer-variant key without leaking foreign-scope existence.
- Test dual-permission combinations, exact scope and active-location checks, balance-only and movement-only keys, absent-side zero behavior, six-decimal boundary cases, full-union completeness, one-statement execution, count/candidate/page/search/export parity, deterministic pagination, search non-broadening, block-mode suppression and warning, exact trace constraints, dedicated export audit, least-data projection, no mutations, and safe stale/denied behavior.

## Implementation and documentation impact

- Code / architecture: Add a source-owned reconciliation resolver backed by one database statement and shared by dashboard, candidates, page, normalized search, and export. Add the dedicated route and exact trace navigation; do not reuse generic `/inventory` query interpretation.
- Data / schema: No schema change, balance rewrite, movement backfill, or repair is authorized. Existing balance, movement, item, location, and scope data are compared read-only.
- Workflow / permissions: No new mutation permission or workflow state is created. Both existing balance-view and ledger-view permissions are required for diagnostic disclosure. Corrective writes remain in their existing controlled workflows.
- UI / mobile: Provide a responsive, paginated, searchable reconciliation list with selected-scope context, cached/ledger/variance values, exact trace links, and loading/empty/error/denied/stale states. Block mode hides the dashboard number but leaves the authorized page visibly marked untrusted. No mutation actions appear.
- Reporting: Add a dedicated, audited CSV export whose rows and order match the authorized profile population and normalized search at export time.
- Knowledge base / training: **Dunong handoff required after verified implementation.** Explain why the ledger is authoritative, what a six-decimal variance means, why both read permissions are required, how to use the exact ledger trace, how block mode changes display, and that the profile cannot repair inventory.
- Tests / UAT: Focused query, service, permission, dashboard, route, export, audit, trace, block-mode, and responsive UI tests must cover every safeguard. Representative PostgreSQL, authenticated-browser, and hosted evidence remain separate production-readiness gates.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the dedicated closed resolver, route, full-union statement, shared surfaces, block-mode posture, exact trace, and audited export | Backend + Frontend Engineering | Before enabling the destination | Pending evidence-backed implementation status |
| Independently verify dual authorization, exact scope, union completeness, decimal semantics, parity, least-data, audit, and no-mutation behavior | Security + Database + QA | Before checkpoint completion | Pending evidence acceptance |
| Capture representative PostgreSQL query-plan and result evidence, including balance-only/movement-only keys and production-scale bounds | Database + QA | Before Workspace 1 production-ready claim | Pending PostgreSQL gate |
| Verify dashboard/profile navigation, block-mode suppression/warning, paging, search, trace, export, and all UX states at desktop, tablet, and mobile widths | Frontend + QA | Before Workspace 1 production-ready claim | Pending browser gate |
| Validate hosted deployment, rollback/profile-disablement, export audit/delivery, monitoring, backup, and recovery | DevOps + Release | Before production release | Pending hosted gate |
| Assess user guidance, release-note, and training impact | Dunong | After verified implementation | Handoff required |

## Evidence

- Parent-confirmed conclusion, 2026-07-23: use dedicated `/inventory/reconciliation?dashboard=ledger-variance-v1`; require both balance-view and ledger-view permissions; compute the full balance/movement key union and six-decimal non-zero variance in one database statement; share population semantics across dashboard, candidates, page, search, and export; keep the profile read-only with exact ledger trace and dedicated audited export; suppress the numeric KPI in block mode while retaining an authorized warned diagnostic page; and keep representative PostgreSQL, browser, and hosted gates pending.
- Independent product, architecture, database, security, and QA evaluation supported the dedicated closed profile and identified the full-union, dual-permission, block-mode, and exact-trace controls as non-negotiable.
- Requested Code Spark and exact GPT-5.4/GPT-5.4-mini models were unavailable in the active toolset. The Decision Chair used the closest permitted GPT-5.6 role specialists. This fallback did not relax any hard gate, safeguard, or production-evidence requirement.
- `docs/core/00-governance/decisions/DEC-0053-BOUNDED-SCOPE-AUTHORIZED-DASHBOARD-READ-MODEL.md`: bounded authorized dashboard reads and direct-target reauthorization.
- `docs/core/00-governance/decisions/DEC-0055-CLOSED-SERVER-OWNED-DASHBOARD-DRILLDOWN-PROFILES.md`: closed profile allow-list, canonical population, count/page/export parity, and read-only destination requirements.
- `AGENTS.md` sections 4-9 and 13: exact scope isolation, server-enforced authorization, immutable movement-ledger authority, no direct balance mutation, bounded UI lists, verification, and decision hard gates.

## Pending production-readiness evidence

This record confirms the profile contract; it does not prove the profile or Workspace 1 production-ready. Keep these gates open until evidence is accepted:

- representative PostgreSQL execution-plan and result verification for the single-statement full union, both missing-side cases, six-decimal normalization, paging/search/export consistency, deterministic ordering, and acceptable production-scale bounds;
- authenticated responsive-browser evidence for dedicated navigation, exact selected scope, dual-permission denial, normalized search, paging, exact ledger trace, dedicated export, loading/empty/error/denied/stale states, absence of mutation controls, numeric KPI suppression, and the untrusted diagnostic warning in block mode;
- hosted deployment, rollback/profile-disablement, export delivery/audit, observability, backup, and recovery verification.

## Supersession

This decision is not superseded. It adds the closed `ledger-variance-v1` profile under `DEC-0055`; it does not change ledger authority, balance derivation, inventory posting, adjustment, approval, reversal, or ordinary Inventory workspace behavior. Any automatic repair, direct balance mutation, new variance tolerance, broader scope, permission reduction, action-enabled reconciliation surface, or change to block-mode visibility requires a new confirmed decision that explicitly amends or supersedes this record.
