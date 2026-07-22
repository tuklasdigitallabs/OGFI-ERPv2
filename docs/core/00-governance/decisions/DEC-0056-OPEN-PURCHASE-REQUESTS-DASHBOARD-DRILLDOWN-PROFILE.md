# DEC-0056 — Open Purchase Requests Dashboard Drilldown Profile

## Metadata

- Decision ID: `DEC-0056`
- Title: Open Purchase Requests Dashboard Drilldown Profile
- Status: `Confirmed`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation and Phase I Overview / Purchase Requests
- Related decision brief: Parent-confirmed dashboard-drilldown deliberation, 2026-07-23

## Decision

Under `DEC-0055`, approve **Open Purchase Requests** as the next closed, server-owned dashboard drilldown profile, suggested identifier `purchase-request-open-v1`. It must resolve, under the currently authorized selected scope, to exactly `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, and `RETURNED` Purchase Requests.

This decision authorizes the profile contract only. The drilldown remains pending implementation and must not be presented as active or complete until all required safeguards and evidence are in place.

## Context

`DEC-0055` requires each dashboard drilldown to have a finite, source-owned semantic profile rather than a client-controlled status, filter, scope, or token contract. Independent QA and architecture review concluded that Open Purchase Requests is the next suitable source, provided the dashboard metric and its destination share one exact lifecycle predicate and the target preserves current server-side authorization.

The profile must remain truthful to its lifecycle definition. In particular, its user-facing text must include `APPROVED`; it must not imply that approved requests are excluded or ready for a different workflow state.

## Options considered

### Option A — selected: closed `purchase-request-open-v1` profile

- Summary: Resolve an allow-listed Purchase Request `OPEN` profile at the server boundary to `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, and `RETURNED` within the currently authorized selected scope.
- Benefits: Gives the dashboard and Purchase Request workspace one auditable operational meaning; prevents parameter-driven semantic drift; and supports comparable metric, list, page, and export populations.
- Failure modes: Predicate duplication can make the metric and destination disagree; lifecycle changes can omit a status; or stale links and changed access can disclose information if target authorization is not repeated.
- Why selected: It applies the closed, source-owned contract of `DEC-0055` while preserving Purchase Request lifecycle visibility, including approved-but-not-yet-converted requests.

### Option B — rejected: dashboard link with raw status/filter input

- Summary: Navigate with status values or generic workspace filters in the URL and allow the destination to interpret them.
- Benefits: Small initial implementation effort.
- Failure modes: Raw inputs can override or broaden the intended profile; dashboard counts, rows, pages, and exports can diverge; and later filter changes become an accidental public contract.
- Why selected or rejected: Rejected because it violates `DEC-0055`'s closed-profile boundary and cannot prove predicate parity.

### Option C — rejected: defer until all dashboard sources are ready

- Summary: Leave Open Purchase Requests non-navigable until every Overview source has a reviewed drilldown profile.
- Benefits: Avoids a source-by-source rollout.
- Failure modes: Delays a bounded, reviewed operational improvement and encourages an all-or-nothing implementation that can weaken source-specific safeguards.
- Why selected or rejected: Rejected because each source must earn activation independently; Open Purchase Requests may proceed once its own pending implementation gates pass.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** The resolved profile uses the target service's current authorized selected scope. A URL or dashboard payload must not select or widen scope.
- **Server-enforced authorization:** Profile resolution, list, export, direct record view, and actions must each authorize the current session. The dashboard link is not a capability.
- **Approval segregation and workflow integrity:** The profile is read-only and does not approve, submit, convert, cancel, or otherwise transition a Purchase Request. Existing no-self-approval and transition controls remain authoritative.
- **Inventory, audit, and data integrity:** The drilldown neither posts inventory nor mutates controlled records. Existing audit requirements continue to apply to source actions and exports.
- **Transaction consistency and idempotency:** This is a bounded read contract; any later Purchase Request action retains its existing transactional and idempotency requirements.
- **Phase scope and recovery:** This is a Phase I dashboard navigation profile. It can remain disabled or be withdrawn without data corruption; other sources remain pending until separately confirmed.

## Required safeguards

- Register `purchase-request-open-v1` in a closed server-owned destination/profile allow-list; unrecognized profile values must be rejected or safely ignored without a generic-filter fallback.
- Define one shared Purchase Request profile predicate and reuse it for the dashboard metric, destination list, authorized total/count, server pagination, and CSV export.
- The predicate must be exactly `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, and `RETURNED` under the current authorized selected scope. Do not independently copy this lifecycle set into drifting paths.
- Provide deterministic, bounded server pagination; do not use browser-only slicing or an unpaginated operational list.
- Preserve normal workspace filters as separately validated functionality, but raw status, filter, scope, or token input must not override the resolved dashboard profile.
- Reauthorize direct record access and all controlled actions at the target service. Safely handle revoked access, deleted records, and lifecycle changes without existence leakage.
- Use the same profile resolver for export parity; preserve existing export permission and audit behavior.
- Ensure dashboard and workspace text accurately describes this profile and explicitly includes `APPROVED` in the open lifecycle meaning.
- Add focused tests for closed-profile validation, exact lifecycle predicate parity, metric/list/count/page/export parity, scope and role boundaries, raw-filter non-override, deterministic pagination, export authorization/audit, and stale or denied direct targets.

## Implementation and documentation impact

- Code / architecture: Pending implementation of a server-owned Purchase Request profile resolver at the authoritative list/count/export boundary. Do not add a generic dashboard query interpreter or client capability token.
- Data / schema: None.
- Workflow / permissions: No new role, approval authority, Purchase Request transition, or source-record access is created. Current target-service authorization remains required.
- UI / mobile: Pending implementation. Enable the dashboard destination only when it presents a paginated, scope-aware result with truthful `APPROVED` lifecycle text and safe empty, changed, and denied states.
- Reporting: Pending implementation. The CSV export must use the identical resolved profile; this does not authorize a generic dashboard export API.
- Knowledge base / training: **Dunong handoff required after verified implementation.** Assess and update dashboard and Purchase Request user guidance only after final labels, pagination, empty/denied states, and export behavior are verified.
- Tests / UAT: Pending implementation. Capture desktop, tablet, and mobile evidence for metric-to-list navigation, paging, export, empty state, denied access, and stale-target behavior before production readiness is claimed.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the closed `purchase-request-open-v1` resolver, shared predicate, and server pagination | Backend + Frontend Engineering | Next Purchase Request dashboard-drilldown checkpoint | Pending |
| Prove dashboard/list/count/page/export parity and direct-target reauthorization | QA + Security + Engineering | Before enabling the dashboard destination | Pending |
| Verify truthful UI text, including `APPROVED`, across dashboard, list, pagination, export, and responsive states | Product + QA | Before UAT readiness | Pending |
| Assess user guidance and release-note impact | Dunong | After verified implementation | Handoff required |

## Evidence

- Parent-confirmed conclusion, 2026-07-23: approve Open Purchase Requests as the next closed server-owned dashboard drilldown profile with lifecycle `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, and `RETURNED`; implementation remains pending.
- Independent QA review, 2026-07-23: required shared predicate, server pagination, export parity, raw-filter non-override, and truthful lifecycle text before activation.
- Independent architecture review, 2026-07-23: required closed source-specific profile resolution and direct target reauthorization rather than client-supplied status, filter, scope, or token semantics.
- `docs/core/00-governance/decisions/DEC-0055-CLOSED-SERVER-OWNED-DASHBOARD-DRILLDOWN-PROFILES.md`: governing closed-profile, parity, pagination, raw-filter, export, and reauthorization contract.
- `docs/core/00-governance/decisions/DEC-0053-BOUNDED-SCOPE-AUTHORIZED-DASHBOARD-READ-MODEL.md`: bounded server-authorized dashboard read-model and target-service authorization requirements.

## Supersession

This decision is not superseded. It adds the Open Purchase Requests source profile under `DEC-0055` and does not relax that decision's closed, server-owned dashboard contract. A later confirmed record may revise this profile only with lifecycle, authorization, parity, and user-surface evidence.
