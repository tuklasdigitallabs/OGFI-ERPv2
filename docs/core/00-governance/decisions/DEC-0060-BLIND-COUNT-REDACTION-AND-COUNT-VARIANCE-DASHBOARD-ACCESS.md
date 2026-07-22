# DEC-0060 — Blind Count Redaction and Count Variance Dashboard Access

## Metadata

- Decision ID: `DEC-0060`
- Title: Blind Count Redaction and Count Variance Dashboard Access
- Status: `Confirmed — implementation pending`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Phase I Inventory / Stock Counts / Dashboard
- Related decision brief: Parent-confirmed blind-count confidentiality prerequisite, 2026-07-23

## Decision

For users who are not authorized count reviewers, server responses must redact system quantity, variance quantity, variance value, variance direction, reviewer notes, and audit facts that disclose variance. The Count Variance dashboard read and profile are reviewer-only, using scoped server authorization.

This decision is limited to read redaction and dashboard-access gating. It authorizes no mutation, inventory-ledger effect, workflow transition, or variance activation. Recount history must be immutable before variance activation is implemented.

## Context

Blind stock counts are ineffective if an entering or non-review user can obtain system quantity or variance facts through a response shape, audit activity, reviewer notes, dashboard metric, list, export, or profile route. The previously deferred Count Variance dashboard profile needs a confirmed confidentiality prerequisite before it can be designed or enabled.

The protection must be enforced at the server boundary under the current authorized scope; hiding fields in the interface alone is insufficient. A read-only dashboard gate must also avoid becoming a path to change count status, approve a variance, post inventory, or disclose reconciliation information through a separate response path.

## Options considered

### Option A — selected: server-side redaction with reviewer-only Count Variance reads

- Summary: Apply a server-side read projection that redacts all listed blind-count and variance facts for non-review users, including nested reviewer notes and audit facts. Restrict the Count Variance dashboard read/profile to authorized reviewers within their current tenant, company, and permitted operational scope.
- Benefits: Preserves blind-count confidentiality across API, UI, dashboard, and profile consumers; keeps access decisions authoritative and scope-aware; and permits a bounded reviewer experience without granting write authority.
- Failure modes: An unredacted nested relation, audit/event serializer, export, cache, count, or alternate endpoint can still disclose protected facts; broad reviewer assignment can expose another location's data; or a dashboard profile can accidentally expose an action surface.
- Why selected: It is the minimum confirmed control that protects blind-count information at the source while retaining scoped reviewer visibility.

### Option B — rejected: client-side field hiding with broadly readable Count Variance data

- Summary: Return full count and variance data to users and hide protected fields or dashboard widgets in the client.
- Benefits: Lower initial UI effort and reusable response shapes.
- Failure modes: Browser inspection, direct requests, exports, cached data, and alternate consumers can disclose system quantity and variance facts; UI visibility does not enforce tenant, company, location, or reviewer authority.
- Why selected or rejected: Rejected because it fails server-enforced authorization and blind-count confidentiality.

### Option C / defer — rejected for the prerequisite: activate variance workflow before immutable recount history exists

- Summary: Enable variance reconciliation or activation now and add immutable recount history later.
- Benefits: Earlier operational availability.
- Failure modes: Recount changes can obscure prior count values, reviewer decisions, and the basis of variance activation; audit reconstruction and controlled reversal become unreliable.
- Why selected or rejected: Rejected. Immutable recount history is a prerequisite to later variance activation; that activation remains outside this decision.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** Reviewer status never widens scope. Dashboard/profile and source reads must apply the current authorized tenant, company, and relevant location or other assigned operational scope before shaping a response.
- **Server-enforced authorization:** The service/data-access boundary decides whether a user is an authorized count reviewer and applies the corresponding redacted or reviewer projection. Client visibility is not an authorization control.
- **Approval segregation and workflow integrity:** This decision is read-only and does not authorize submitting, approving, returning, activating, or otherwise changing a stock count or variance. Existing segregation controls remain authoritative.
- **Immutable inventory ledger and audit trail:** No ledger posting, balance update, count adjustment, or audit mutation is permitted by this profile or redaction behavior. Later variance activation requires immutable recount history.
- **Transaction consistency and idempotency:** No posting operation is introduced. Any future controlled activation or posting must retain its own transactional, idempotency, locking, source-lineage, and audit requirements.
- **Phase scope and recovery:** The decision is confined to Phase I Stock Count confidentiality and dashboard access. The read gate can remain disabled or be withdrawn without changing source records.

## Required safeguards

- Enforce the non-review redacted projection in server services/data access for every count read path, including detail, lists, dashboard/profile sources, activity/audit views, related-record embeds, exports, and error or empty-state metadata where applicable.
- Redact system quantity, variance quantity, variance value, variance direction, reviewer notes, and audit facts that disclose variance for every non-review user; do not rely on omitted UI columns or client filtering.
- Authorize the Count Variance dashboard read/profile only for users with the applicable count-review authority and current tenant/company/location or assigned-scope access. Reauthorize direct record access independently.
- Keep the Count Variance dashboard/profile read-only. Do not expose actions or endpoints that mutate counts, approve or activate variance, adjust inventory, or post ledger movements because a user reached a record from the dashboard.
- Apply redaction before serialization, export generation, caching, telemetry payload construction, and any shared response reuse. Prevent cache keys or shared server state from serving a reviewer projection to a non-review user.
- Use safe denied, changed, missing, and stale-target states that do not reveal protected values or record existence beyond the user's authorized scope.
- Do not implement or enable variance activation until immutable recount history preserves each recount, actor, timestamp, reason/evidence where applicable, reviewer decision context, and audit lineage. This record does not define that later workflow.
- Add tests for non-review response redaction across all supported read surfaces; reviewer scoped access; cross-tenant/company/location denial; direct-target reauthorization; profile/dashboard/export denial or redaction; cache isolation; absence of mutation/ledger effects; and immutable recount-history prerequisite before variance activation.

## Implementation and documentation impact

- Code / architecture: Pending implementation of an authoritative count-read projection/redaction layer and reviewer-only Count Variance dashboard/profile gate. Do not create client-controlled reviewer flags or generic dashboard-query fallback.
- Data / schema: No schema change is authorized by this decision. A future variance-activation implementation must first provide immutable recount history and document any resulting data-model change separately.
- Workflow / permissions: No new role, scope, approval, activation, posting, or adjustment authority is created. Existing scoped count-review authorization governs reviewer visibility.
- UI / mobile: Pending implementation. Non-review screens must not render protected values, reviewer notes, or variance-disclosing audit facts. Count Variance access must be hidden or show a safe denied state for non-review users; reviewer screens remain read-only under this decision.
- Reporting: The Count Variance dashboard read/profile is reviewer-only. Any export or report path containing protected facts must enforce the same reviewer and scope gate; no new export authority is created.
- Knowledge base / training: **Dunong handoff required after verified implementation.** Assess role-specific blind-count and dashboard guidance only after final reviewer labels, safe denied behavior, scope behavior, read-only status, and export behavior are verified. Guidance must not disclose protected values to non-review users or imply variance activation authority.
- Tests / UAT: Pending implementation. Capture desktop, tablet, and mobile evidence for non-review redaction, reviewer access, scope boundaries, dashboard/profile denial or safe access, export behavior, nested audit/reviewer-note redaction, stale targets, cache isolation, and confirmation of no count mutation or inventory-ledger effect.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement server-side blind-count redaction across all count read surfaces and reviewer-only Count Variance dashboard/profile authorization | Backend + Frontend Engineering | Before enabling Count Variance dashboard/profile access | Pending |
| Verify redaction, reviewer scope boundaries, direct-target authorization, export/cache isolation, safe states, and absence of mutation or ledger effects | QA + Security + Architecture + Engineering | Before UAT or dashboard enablement | Pending |
| Design and implement immutable recount history before proposing any variance-activation decision | Stock Count module owner + Data + Architecture | Before variance activation is implemented or enabled | Prerequisite pending |
| Assess user guidance and release-note impact | Dunong | After verified implementation | Handoff required |

## Evidence

- Parent-confirmed conclusion, 2026-07-23: server-side redaction is required for non-review users for system quantity, variance quantity/value/direction, reviewer notes, and audit variance facts; Count Variance dashboard read/profile is reviewer-only with scoped server authorization; the decision is read-only and has no mutation or ledger effects; immutable recount history is required before variance activation.
- `AGENTS.md` §§ 4–5, 7, and 9: tenant/company and assigned-scope controls, server-side authorization, immutable inventory-ledger/audit requirements, stock-count controls, and safe user states.
- `docs/core/00-governance/decisions/DEC-0055-CLOSED-SERVER-OWNED-DASHBOARD-DRILLDOWN-PROFILES.md`: governing closed server-owned profile, authorization, parity, safe target, and non-mutation principles for dashboard drilldowns.
- `docs/core/00-governance/decisions/DEC-0059-CLOSED-WASTAGE-EXCEPTIONS-DASHBOARD-DRILLDOWN-PROFILE.md`: Count Variance was deferred pending separate blind-count/reconciliation confidentiality design.

## Supersession

This decision is not superseded. It establishes the confidentiality and reviewer-access prerequisite for a future Count Variance dashboard/profile but does not itself approve a profile predicate, variance workflow, recount data model, activation, approval, adjustment, inventory posting, or export feature. Any later decision must preserve this redaction and scope boundary and separately confirm immutable recount history before variance activation.
