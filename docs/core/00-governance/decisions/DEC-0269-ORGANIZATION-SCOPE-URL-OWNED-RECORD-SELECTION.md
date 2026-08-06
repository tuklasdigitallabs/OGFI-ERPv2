# DEC-0269 — Organization Scope URL-owned record selection

## Metadata

- Decision ID: `DEC-0269`
- Status: Confirmed
- Date: 2026-08-03
- Decision owner: OGFI Product Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I Core Administration — Organization Scope (Companies, Brands, Departments, and Locations)
- Related decision brief: Organization Scope selected-record interaction

## Decision

Organization Scope registers use a URL-owned single-record selection. Selecting a Company, Brand, Department, or Location preserves the current authorized tab, filters, and page in the URL and opens a read-only selected-detail panel. A contextual, short edit modal is opened only from that selected panel; per-card edit controls are removed.

Changing the filter, page, or Organization Scope sub-tab clears the record selection. The selected detail is loaded through the server-authorized read boundary. A malformed, unavailable, deleted, or no-longer-authorized selection renders a safe unavailable state without exposing the record or disrupting the register context.

## Context

The Organization Scope workspace contains bounded, selected-company registries and a controlled descriptive-edit slice. Repeated per-card editing weakens the list-first workspace, makes one record's context harder to retain, and creates inconsistent navigation state. A client-held detail projection could also become stale or disclose an entity after authorization or scope changes.

The decision keeps the existing selected-company scope, server authorization, short-mutation feedback, and audited mutation services intact while making record selection deterministic, linkable, and recoverable.

## Options considered

### Option A — Per-card edit controls — rejected

- Summary: Retain a separate edit affordance and form on every visible Company, Brand, Department, and Location card or row.
- Benefits: Direct access to editing from a list.
- Failure modes: Repeated actions make the register less scannable, encourage stacked editing surfaces, and do not provide a durable selected-record context or shareable return state.
- Why rejected: It conflicts with the list-first, selected-record workspace standard and does not reliably preserve user context.

### Option B — Client-owned selected panel with editable fields — rejected

- Summary: Keep selection only in component state and edit directly in the panel.
- Benefits: Fewer navigation updates and fewer UI elements.
- Failure modes: Selection is lost on refresh or deep link, can become stale after filter/page changes, and may show data that is no longer authorized; a long-lived inline form obscures the read-only record state.
- Why rejected: It weakens recoverability and makes the authorized read boundary less explicit.

### Option C — URL-owned selection, authorized read-only detail, contextual short edit modal — selected

- Summary: Store one selected record in the URL alongside the current register state; resolve it server-side; open a short edit modal only from the read-only detail.
- Benefits: Preserves list context, supports deep links and refreshes, keeps the normal detail state readable, confines edits to a focused short form, and makes stale/unavailable selection handling explicit.
- Failure modes: A stale URL can point to a different filter/page/sub-tab, an unavailable ID can disclose existence, or an edit can be made against stale detail.
- Why selected: It improves administration usability while retaining bounded register semantics and existing server-enforced scope and audit controls.

### Option D — Dedicated full-page detail route for every organization record — rejected for this slice

- Summary: Navigate away from Organization Scope to record-specific pages for reading and editing.
- Benefits: Strong record focus and room for future complex lifecycle actions.
- Failure modes: Needlessly fragments the existing bounded setup workspace, loses register context without additional return-state work, and is disproportionate for current short descriptive edits.
- Why rejected: Current controlled edits are short; a selected panel satisfies the workspace standard without expanding route surface or Phase I scope.

## Hard-gate assessment

- Tenant, company, brand, and location isolation: preserved. The selected record remains constrained to the active authorized Organization Scope register and selected-company context.
- Server-side authorization: required for the detail lookup and unchanged for the edit mutation. URL state is not authorization.
- Approval segregation and inventory integrity: not applicable; no approval, money, or stock action is introduced.
- Audit history: selection is read-only. Any edit continues through the existing auditable mutation service and its reason/before-and-after history.
- Transaction consistency and recovery: no transaction or data-model change. Filter/page/sub-tab changes clear selection, and unavailable selections fail safely to the register.
- Phase scope: limited to Phase I Core Administration Organization Scope.

## Required safeguards

- Keep tab, filter, page, and a single record selection in URL state. Do not store the authoritative detail only in client memory.
- On a filter, page, or sub-tab change, remove the selection parameter before rendering the new register context.
- Resolve selected details through a server-authorized, selected-company-scoped read. Do not trust URL identifiers or infer access from an already rendered row.
- Treat malformed, unavailable, deleted, out-of-filter, or unauthorized selections as one safe unavailable state; do not disclose why the record cannot be shown.
- The panel is read-only. The edit affordance must be contextual to the selected record and open a short modal only for the existing approved descriptive fields and required reason.
- Successful edits refresh the authoritative selected detail/register and retain the existing short-mutation feedback contract. Failed edits keep the modal open with user-safe feedback and entered values preserved.
- Preserve the current audited edit service. Record selection itself creates no audit event; edits must retain existing before/after/reason audit evidence.
- Verify deep-link/refresh retention, filter/page/sub-tab clearing, unauthorized/unavailable selection handling, edit success/error behavior, and desktop/mobile panel/modal usability.

## Implementation and documentation impact

- Code / architecture: add URL parsing/serialization and a server-authorized selected-detail boundary for the four Organization Scope record types; retain existing controlled edit routes/services.
- Data / schema: no change.
- Workflow / permissions: no new permission or scope; existing `core.administer`, tenant-role authority, and selected-company `MANAGE` controls remain authoritative.
- UI / mobile: one selected read-only detail panel per active register and a contextual short edit modal replace per-card edit controls. Safe unavailable state is required.
- Reporting: no impact.
- Knowledge base / training: No user-facing procedure is authorized by this decision alone. Dunong should assess the Organization Scope administrator guidance and release note once the visible behavior is implemented and verified.
- Tests / UAT: implementation is not complete until URL-state, authorization/no-disclosure, edit/audit, and responsive visible-surface checks pass.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement URL-owned single-record selection and safe server-authorized detail states. | Core Administration implementation owner | Before claiming Organization Scope interaction completion | Pending |
| Retain audited controlled edits in a contextual short modal and remove per-card edit controls. | Core Administration implementation owner | With selection implementation | Pending |
| Add URL-state, unavailable/denied, edit/audit, and responsive acceptance coverage. | QA / implementation owner | Before UAT claim | Pending |
| Assess administrator help/release-note impact. | Dunong | After visible behavior and labels are verified | Pending handoff |

## Evidence

- Confirmed decision authorization from the parent agent on 2026-08-03.
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` and `DECISION_RECORD_TEMPLATE.md`.
- `docs/core/00-governance/decisions/DEC-0211-ADMIN-ORGANIZATION-SELECTED-COMPANY-CONTEXT.md` — selected-company Organization Scope context.
- `docs/core/00-governance/decisions/DEC-0212-ADMIN-ORGANIZATION-REGISTRY-PAGING.md` — bounded selected-company registry and URL filter/page contract.
- `docs/core/00-governance/decisions/DEC-0267-SHORT-MUTATION-FEEDBACK-TRANSPORT-AND-ROLLOUT.md` — approved short-mutation modal and feedback constraints.
- `docs/core/04-design/UI_IMPLEMENTATION_STANDARD.md` — list-first workspace, selected-record action, mobile context-retention, and short-mutation feedback standards.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` — current Organization Scope controlled-edit and feedback implementation status.

## Supersession

Not superseded.
