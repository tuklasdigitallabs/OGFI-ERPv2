# DEC-0057 — Closed Transfer Follow-Up Dashboard Drilldown Profile

## Metadata

- Decision ID: `DEC-0057`
- Title: Closed Transfer Follow-Up Dashboard Drilldown Profile
- Status: `Confirmed`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation and Phase I Overview / Inventory Transfers
- Related decision brief: Parent-confirmed dashboard-drilldown deliberation, 2026-07-23

## Decision

Under `DEC-0055`, approve the closed, source-owned Transfer follow-up dashboard drilldown profile `transfer-follow-up-v1`. Under the current authorized tenant and company scope, and the selected location where that location is the transfer source **or** destination, it must resolve exactly `REQUESTED`, `DISPATCHED`, `PARTIALLY_RECEIVED`, and `DISPUTED` transfers.

The dashboard metric, destination list, authorized count, pagination, and export must share this one predicate. The profile ignores tab, status, scope, and filter overrides; direct detail and every action independently reauthorize the current session, and this read-only profile must never dispatch, receive, settle, or mutate inventory. Implementation is pending.

## Context

`DEC-0055` requires every enabled dashboard drilldown to use a finite, server-owned semantic profile, rather than forwarding client-controlled workspace filters, scope inputs, or tokens. Transfers require an independently defined source predicate because operational follow-up concerns unresolved movement across both sides of the transfer: the selected location can be the dispatching source or the receiving destination.

Independent QA and architecture review found that the above status set is sufficiently bounded for a follow-up profile only when it retains current target authorization, selected-location source-or-destination semantics, shared predicate parity, deterministic pagination, and export parity. Receiving variance, count variance, wastage, and adjustment drilldowns remain deferred: their status meaning and control requirements are more complex and have not yet met this evidence threshold.

## Options considered

### Option A — selected: closed `transfer-follow-up-v1` profile

- Summary: Resolve an allow-listed transfer follow-up profile at the server boundary to `REQUESTED`, `DISPATCHED`, `PARTIALLY_RECEIVED`, and `DISPUTED`, under current authorized tenant/company scope and the selected location as source or destination.
- Benefits: Gives the dashboard and transfer workspace one auditable population for follow-up; captures in-flight and disputed transfers relevant to either participating location; prevents client-controlled semantic drift; and supports truthful count, list, pagination, and export results.
- Failure modes: Separate predicates can cause dashboard/list/count/page/export disagreement; treating the selected location as source-only or destination-only can omit actionable work; lifecycle changes can omit a follow-up status; and stale access or status changes can disclose information if direct targets are not reauthorized.
- Why selected: It preserves the closed, source-owned contract of `DEC-0055` while representing transfer follow-up across the two operational locations without granting any source-record capability.

### Option B — rejected: raw tab, status, scope, or filter parameters

- Summary: Link the dashboard to the generic transfer workspace and let URL or client inputs select tabs, statuses, locations, or filters.
- Benefits: Small initial implementation effort and apparent reuse of existing workspace controls.
- Failure modes: Inputs can override or broaden the intended population; a selected-location source-or-destination predicate can drift across paths; and counts, rows, pages, and exports can silently have different meanings.
- Why selected or rejected: Rejected because it violates the closed-profile and server-authorized semantic boundary in `DEC-0055`.

### Option C — deferred: receiving variance, count variance, wastage, and adjustment profiles

- Summary: Add analogous dashboard drilldowns for receiving variance, stock-count variance, wastage, or stock adjustments in the same checkpoint.
- Benefits: Broader dashboard coverage for inventory exception work.
- Failure modes: These domains have materially different discrepancy, evidence, approval, inventory-ledger, and reversal semantics; a generic exception profile could conceal required controls or create misleading operational populations.
- Why selected or rejected: Deferred until each source has its own confirmed semantic predicate, direct authorization, pagination/export behavior where offered, and control evidence. This decision does not authorize them.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** The profile is resolved only under the current authorized tenant/company context and selected location. That location is applied as `(source location OR destination location)`; no URL, tab, filter, or dashboard payload can select or widen scope.
- **Server-enforced authorization:** The profile is an allow-listed server choice, not a capability. List, count, export, direct detail, and every transfer action must authorize the current session independently.
- **Approval segregation and workflow integrity:** The profile is read-only. It does not approve, dispatch, receive, settle, cancel, or otherwise transition a transfer; existing workflow and segregation controls remain authoritative.
- **Immutable inventory ledger and audit trail:** The profile cannot post, reverse, or directly update inventory. Dispatch, receipt, settlement, discrepancy, and audit controls remain with their authoritative transfer and inventory services.
- **Transaction consistency and idempotency:** This is a bounded read contract. Any later controlled action retains its existing transaction, locking, idempotency, and audit requirements.
- **Phase scope and recovery:** This is limited to Phase I dashboard navigation. It can remain disabled or be withdrawn without changing source data; deferred exception sources remain non-drilldown until separately confirmed.

## Required safeguards

- Register `transfer-follow-up-v1` in a closed server-owned destination/profile allow-list. Unrecognized profile values must be rejected or safely ignored, without generic workspace-filter fallback.
- Define one shared resolver/predicate and reuse it for the dashboard metric, destination list, authorized total/count, server pagination, and CSV export. It must resolve exactly `REQUESTED`, `DISPATCHED`, `PARTIALLY_RECEIVED`, and `DISPUTED`.
- Apply current authorized tenant/company constraints and the selected-location predicate `(source location = selected location OR destination location = selected location)` consistently in every profile path.
- Ignore tab, status, scope, and filter overrides for the resolved profile. Ordinary transfer workspace filtering may remain separately validated, but must not alter this dashboard contract.
- Provide deterministic, bounded server pagination; do not rely on browser-only slicing or an unpaginated operational list.
- Reauthorize direct detail access and every controlled transfer action at the authoritative target service. Handle revoked access, deleted records, and lifecycle changes with safe user-facing states and without existence leakage.
- Preserve existing export permission and audit behavior, and ensure the export uses the identical resolved profile predicate.
- Ensure profile code and UI do not expose actions that dispatch, receive, settle, or mutate inventory merely because a record was reached through this dashboard profile.
- Add focused tests for allow-list validation; exact status parity; source-or-destination location parity; tenant/company/location and role boundaries; list/count/page/export parity; raw override non-effect; deterministic pagination; export authorization/audit; denied or stale direct targets; and confirmation that profile navigation cannot perform inventory-affecting actions.

## Implementation and documentation impact

- Code / architecture: Pending implementation of a closed Transfer profile resolver at the authoritative dashboard/list/count/export boundary. Do not add a generic dashboard query interpreter, client capability token, or action behavior to the profile.
- Data / schema: None.
- Workflow / permissions: No role, transfer transition, approval authority, settlement authority, or source-record access is created. Direct details and controlled actions retain target-service authorization.
- UI / mobile: Pending implementation. Enable the dashboard destination only when it displays a paginated, scope-aware follow-up result with clear source/destination relevance and safe empty, changed, and denied states. The drilldown must remain read-only until a separately authorized source action is selected and reauthorized.
- Reporting: Pending implementation. CSV export must use the same resolved source-or-destination profile predicate and existing export metadata/audit controls; this does not authorize a generic dashboard export API.
- Knowledge base / training: **Dunong handoff required after verified implementation.** Assess and update dashboard and Transfer guidance only after the final label, source/destination scope behavior, pagination, empty/denied states, export behavior, and independently authorized action behavior are verified. Guidance must state that the dashboard follow-up view does not grant dispatch, receipt, settlement, or inventory authority.
- Tests / UAT: Pending implementation. Capture desktop, tablet, and mobile evidence for metric-to-list navigation, source and destination location cases, paging, export, empty state, denied access, stale target behavior, and action reauthorization before production readiness is claimed.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the closed `transfer-follow-up-v1` resolver, shared predicate, and server pagination | Backend + Frontend Engineering | Next Transfer dashboard-drilldown checkpoint | Pending |
| Prove dashboard/list/count/page/export parity, source-or-destination scope semantics, and direct-target reauthorization | QA + Architecture + Security + Engineering | Before enabling the dashboard destination | Pending |
| Keep receiving variance, count variance, wastage, and adjustment drilldowns disabled pending their own confirmed profiles and evidence | Decision Chair + module owners | Before any of those cards become active | Pending / deferred |
| Assess user guidance and release-note impact | Dunong | After verified implementation | Handoff required |

## Evidence

- Parent-confirmed conclusion, 2026-07-23: activate the closed `transfer-follow-up-v1` profile with statuses `REQUESTED`, `DISPATCHED`, `PARTIALLY_RECEIVED`, and `DISPUTED`; preserve tenant/company and selected source-or-destination location scope; require parity and independent action/detail reauthorization; implementation remains pending.
- Independent QA consensus, 2026-07-23: required a single exact predicate across dashboard/list/count/page/export, server pagination, override resistance, scope-boundary tests, and safe stale/denied behavior before activation.
- Independent architecture consensus, 2026-07-23: required a closed, source-specific profile, source-or-destination location semantics, current target-service authorization, and a strictly read-only dashboard contract that cannot mutate transfer or inventory state.
- `docs/core/00-governance/decisions/DEC-0055-CLOSED-SERVER-OWNED-DASHBOARD-DRILLDOWN-PROFILES.md`: governing closed-profile, parity, pagination, raw-filter, export, and reauthorization contract.
- `docs/core/00-governance/decisions/DEC-0053-BOUNDED-SCOPE-AUTHORIZED-DASHBOARD-READ-MODEL.md`: bounded server-authorized dashboard read-model and target-service authorization requirements.
- `AGENTS.md` §§ 4–5: tenant/company scope, transfer dispatch/receipt integrity, immutable inventory ledger, and controlled workflow requirements.

## Supersession

This decision is not superseded. It adds the Transfer follow-up source profile under `DEC-0055` and does not relax the closed, server-owned dashboard contract. A later confirmed decision may revise this profile or approve a deferred exception source only with its own semantic, authorization, parity, inventory-control, and user-surface evidence.
