# DEC-0055 — Closed, Server-Owned Dashboard Drilldown Profiles

## Metadata

- Decision ID: `DEC-0055`
- Title: Closed, Server-Owned Dashboard Drilldown Profiles
- Status: `Confirmed`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation and Phase I Overview / Purchase Orders
- Related decision brief: Parent-confirmed dashboard-drilldown deliberation, 2026-07-23

## Decision

Dashboard metrics and queue items may navigate only to closed, server-owned dashboard destinations with source-specific semantic profiles. They must not forward raw status values, generic filter expressions, record/scope IDs, or opaque client tokens as a drilldown contract.

The first authorized profile is the **Purchase Orders OPEN** profile. It must mean exactly the same bounded, selected-scope PO population as the Overview `openCount`; its list, count, pagination, and CSV export must resolve the same profile. Opening a record or taking an action remains subject to the target service's current server-side authorization.

## Context

`DEC-0053` establishes the Overview as a bounded, server-authorized read model whose task and KPI links are navigational aids rather than source-record capabilities. The existing PO dashboard read already derives `openCount` using a selected-scope predicate over the PO open lifecycle set, while the PO workspace and export currently accept broader workspace filtering and have no server pagination. A direct metric link such as a raw `status` query would allow the dashboard and target workspace to drift, could widen or change meaning through later UI parameters, and cannot prove that the displayed count, rows, pages, and export describe the same population.

The confirmed implementation sequence starts with one narrow source contract rather than attempting to make every current dashboard card clickable. Receiving, transfers, inventory, and other Overview sources remain pending until their own exact source predicate, visibility, pagination, export, and direct-target authorization contracts are reviewed and implemented.

## Options considered

### Option A — selected: closed destinations with source-specific semantic profiles

- Summary: Register a finite dashboard destination/profile pair at the server boundary. For Purchase Orders, resolve `OPEN` to the dashboard's documented open lifecycle set under the current authorized selected scope, then reuse that resolved profile for list, count, page navigation, and CSV export.
- Benefits: Preserves dashboard-to-workspace semantic parity; prevents client-controlled scope/filter expansion; supports bounded pages and truthful totals; gives exports the same operational meaning as the displayed drilldown; and keeps direct record/action authorization with the authoritative source service.
- Failure modes: A later source implementation can accidentally use a different predicate for one path, a new lifecycle status can be omitted from the profile, or a stale destination can resolve after the underlying record/status/access has changed.
- Why selected: It is the only executable option that combines a useful dashboard drilldown with `DEC-0053`'s server-authorized read-model boundary, least-data principle, bounded operational-list requirement, and source-service authority.

### Option B — rejected: forward raw workspace filters or status query parameters

- Summary: Link a metric directly to a generic workspace URL such as a status query and let the workspace parse normal filters.
- Benefits: Very small implementation change and reuse of an existing list UI.
- Failure modes: The raw value becomes an accidental public contract; status values, compound predicates, selected scope, count, page, and export can diverge; users or links can alter the filter; and new statuses may silently change dashboard meaning.
- Why rejected: It does not create a closed semantic contract or establish count/list/export parity. A generic workspace filter is not evidence that it is the same population as a dashboard metric.

### Option C — rejected: generic dashboard filter/scope IDs or opaque client tokens

- Summary: Accept a dashboard-provided generic filter definition, selected scope identifier, or signed/opaque token and use it to construct target queries.
- Benefits: Appears reusable across cards and could reduce source-specific URL work.
- Failure modes: Moves source-query semantics into a generic dispatcher; risks replay, stale scope, token parsing/validation defects, information disclosure, and a second authorization/filter authority; and makes the target contract hard to audit.
- Why rejected: It fails the closed, source-owned contract and server-authorization boundary. The dashboard must not be a query-language or capability issuer.

### Option D — rejected for the first implementation checkpoint: enable every dashboard metric drilldown now

- Summary: Make all current Overview metrics navigate immediately, using the closest existing source lists or exports.
- Benefits: Broad visible coverage quickly.
- Failure modes: Several sources do not yet have proved predicate parity, bounded pagination, or export parity; broad activation would turn visually enabled cards into misleading or incomplete workspaces.
- Why rejected: It fails the visible-surface completion gate and the required source-specific evidence. Unsupported sources must remain explicitly pending rather than receive a plausible but unverified drilldown.

## Scorecard-quality reasoning

Options B and C fail the server-owned semantic-contract and authorization hard gates. Option D fails the source-parity and visible-surface readiness gates for currently unreviewed sources. Among options that could safely be implemented, Option A has the highest control and reversibility value despite requiring targeted source work.

| Criterion | Weight | Option A |
|---|---:|---:|
| Operational correctness and control | 30% | 5 |
| Business value | 20% | 4 |
| User adoption and branch usability | 15% | 4 |
| Delivery effort and risk | 15% | 4 |
| Maintainability and scalability | 10% | 5 |
| Operating cost | 5% | 5 |
| Reversibility | 5% | 5 |
| **Weighted total** | **100%** | **4.55 / 5** |

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** The profile is resolved only after the destination receives the current session and applies its existing tenant/company/selected-location scope. No dashboard URL parameter may select or widen a scope.
- **Server-enforced authorization:** Dashboard routing is an allow-listed destination/profile choice. The PO list, export, direct record view, and every action must independently reauthorize the current session; a dashboard item is not a capability token.
- **Approval segregation and controlled workflow integrity:** The profile is read-only. It neither evaluates approvals nor changes PO state, and no dashboard link bypasses no-self-approval or source transition controls.
- **Inventory, audit, and data integrity:** The decision creates no stock movement, PO mutation, balance update, or audit substitute. Existing source workflow/audit controls remain authoritative.
- **Transaction consistency and idempotency:** The profile is a bounded read contract. Any later PO action keeps its existing transactional, idempotency, and audit requirements.
- **Phase scope and recovery:** This covers Phase I dashboard navigation only. A profile can be disabled or left pending without corrupting data; unsupported sources retain their non-drilldown/degraded posture until independently verified.

## Required safeguards

- Define a closed server-owned destination/profile enum or equivalent allow-list; reject or ignore unrecognized profile values without falling back to arbitrary workspace filters.
- The Purchase Orders `OPEN` profile must resolve to the exact `purchaseOrderOpenStatuses` lifecycle set currently used by `getPurchaseOrderDashboardRead`: `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ISSUED`, `AMENDMENT_PENDING`, and `PARTIALLY_RECEIVED`, subject to the current authorized selected tenant/company/delivery-location scope.
- Implement a single profile-resolution path or shared predicate used by the PO dashboard metric, list query, total/count, pagination, and CSV export. Do not copy the status set into independently drifting routes.
- Add server pagination with deterministic ordering, bounded page size, authorized total, and navigation state derived from the resolved profile; do not rely on browser-only slicing or an unpaginated operational list.
- Preserve ordinary workspace filtering only as a separately validated workspace behavior. A dashboard destination must not turn raw `status`, filter expression, scope ID, or token input into a semantic-profile override.
- Apply target-service reauthorization for list, export, direct record view, and controlled actions. Handle revoked access, stale/deleted records, and status changes with safe user-facing outcomes and without existence leakage.
- Ensure the export uses the same profile resolution and selected-scope predicate as the list/count; export permissions and export audit events continue to apply.
- Add focused tests for closed-profile validation, exact PO predicate parity, list/count/page/export parity, tenant/company/location and role boundaries, raw-filter/token rejection or non-override behavior, pagination determinism, export authorization/audit, and stale/denied direct-target handling.
- Do not activate a receiving, transfer, inventory, approval, or other source drilldown until its semantic profile, source predicate, direct authorization, pagination, export behavior where offered, and tests meet the same evidence threshold.

## Implementation and documentation impact

- Code / architecture: Add a source-owned dashboard destination/profile resolver for the Purchase Orders `OPEN` profile and use it at the authoritative PO list/count/export boundary. Do not introduce a generic dashboard-query interpreter or client capability token.
- Data / schema: None.
- Workflow / permissions: No new role, permission, PO transition, approval authority, or source-record access is created. Direct targets continue to reauthorize current access.
- UI / mobile: The Overview may enable only destinations backed by confirmed profiles. The PO workspace must present a paginated, scope-aware OPEN result and clear safe states for empty, changed, or denied targets; unsupported cards remain visibly pending rather than misleadingly active.
- Reporting: The PO CSV export for this destination must state/apply the same resolved profile and existing export metadata/audit controls. This does not authorize a generic dashboard export API.
- Knowledge base / training: **Dunong handoff required after verified implementation.** Update dashboard and Purchase Order guidance only after the final destination label, profile behavior, pagination, empty/denied states, and export behavior are verified. Explain that a dashboard drilldown narrows an authorized source list and does not grant record access or permit changing its filter/scope.
- Tests / UAT: Add the safeguards above to dashboard and PO focused tests, then capture desktop/tablet/mobile evidence for the metric-to-list flow, paging, export, empty state, authorization denial, and stale target behavior before production readiness is claimed.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the closed Purchase Orders `OPEN` destination/profile resolver and server pagination | Backend + Frontend Engineering | Current dashboard drilldown checkpoint | Pending |
| Prove exact dashboard/list/count/page/export predicate parity and direct-target reauthorization | QA + Security + Engineering | Before committing the PO drilldown checkpoint | Pending |
| Review each remaining dashboard source for its own semantic profile and parity contract | Architecture + module owner + QA | Before enabling that source's drilldown | Pending / source-specific |
| Update the Overview implementation-plan status with evidence after the PO checkpoint passes its gates | Decision Chair + Mithi | After implementation validation | Pending |
| Prepare verified role guidance and release-note assessment | Dunong | After final UI and export behavior are verified | Handoff required |

## Evidence

- Parent-confirmed dashboard-drilldown conclusion, 2026-07-23: start with a server-owned PO `OPEN` profile; do not use raw/generic filters, scope IDs, or tokens; require list/count/pagination/export parity and direct-target reauthorization.
- Independent QA review, 2026-07-23: identified **Open Purchase Orders** as the first safe drilldown only with server pagination, shared list/export filter resolution, and exact status parity; found other source contracts incomplete.
- Independent architecture review, 2026-07-23: concurred that destinations require closed, source-specific semantic profiles rather than raw status/tab URLs or client-provided scope/query parameters, while source actions must reauthorize independently.
- `docs/core/00-governance/decisions/DEC-0053-BOUNDED-SCOPE-AUTHORIZED-DASHBOARD-READ-MODEL.md`: bounded server-authorized read model, registered destinations, source isolation, and target-service reauthorization requirements.
- `apps/web/src/server/services/purchaseOrders.ts` — `purchaseOrderOpenStatuses` and `getPurchaseOrderDashboardRead`: current selected-scope `openCount` lifecycle predicate.
- `apps/web/src/server/services/purchaseOrders.ts` — `listPurchaseOrders` and `normalizePurchaseOrderFilters`: existing broader workspace list/filter behavior that cannot by itself prove dashboard parity.
- `apps/web/src/app/(app)/purchase-orders/page.tsx`: current query-driven PO workspace with no server pagination.
- `apps/web/src/app/(app)/purchase-orders/export/route.ts`: current CSV route resolves normalized workspace filters through `listPurchaseOrders`; it must be aligned to the profile resolver before the dashboard export contract is called complete.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md`: Overview remains in progress; complete filtered drilldowns and production-readiness evidence are pending.
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` and `DECISION_SCORECARD.md`: control-first deliberation and decision-record requirements.

## Supersession

This decision is not superseded. It confirms the cross-source drilldown contract and the first PO `OPEN` implementation profile only. A later confirmed record may add another source profile after its own evidence proves semantic, authorization, pagination, export, and user-surface readiness; it must not weaken the closed server-owned contract established here.
