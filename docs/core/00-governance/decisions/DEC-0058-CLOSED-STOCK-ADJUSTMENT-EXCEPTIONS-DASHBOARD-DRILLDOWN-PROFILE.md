# DEC-0058 — Closed Stock Adjustment Exceptions Dashboard Drilldown Profile

## Metadata

- Decision ID: `DEC-0058`
- Title: Closed Stock Adjustment Exceptions Dashboard Drilldown Profile
- Status: `Confirmed`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation and Phase I Overview / Inventory Adjustments
- Related decision brief: Parent-confirmed dashboard-drilldown deliberation, 2026-07-23

## Decision

Under `DEC-0055`, approve the closed, source-owned Stock Adjustment exceptions dashboard drilldown profile `stock-adjustment-exceptions-v1`. Under the current authorized tenant and company scope and the currently selected inventory location, it must resolve exactly stock adjustments in `PENDING_APPROVAL`, `APPROVED`, `POSTING`, or `RETURNED` status.

The dashboard metric, destination list, authorized count, pagination, and export must share this one predicate. The profile ignores raw status, scope, search, and token inputs; direct detail and every action independently reauthorize the current session. This read-only profile preserves no-self-approval, immutable-ledger, controlled posting/reversal, MFA, and audit controls. Implementation is pending.

## Context

`DEC-0055` requires every enabled dashboard drilldown to use a finite, server-owned semantic profile, rather than forwarding client-controlled workspace filters, scope inputs, searches, or tokens. Stock adjustments need a separately bounded exception population that surfaces adjustments requiring approval, awaiting posting, or returned for correction without granting source-record authority or altering the inventory workflow.

Independent QA and architecture review confirmed that this status set is sufficiently bounded only with current tenant/company/selected-inventory-location authorization, one shared predicate for every read and export path, deterministic pagination, export parity, raw-input resistance, and current target reauthorization. Receiving, stock-count, and wastage drilldowns remain deferred because their discrepancy, evidence, approval, posting, and reversal semantics require separate control analysis.

## Options considered

### Option A — selected: closed `stock-adjustment-exceptions-v1` profile

- Summary: Resolve an allow-listed Stock Adjustment exceptions profile at the server boundary to exactly `PENDING_APPROVAL`, `APPROVED`, `POSTING`, and `RETURNED`, under current authorized tenant/company scope and the currently selected inventory location.
- Benefits: Gives the dashboard and adjustment workspace one auditable exceptions population; prevents client-controlled semantic drift; supports truthful metric, list, count, page, and export results; and preserves controlled adjustment workflow boundaries.
- Failure modes: Separate predicates can cause dashboard/list/count/page/export disagreement; a raw status, scope, search, or token can broaden or alter the population; lifecycle changes can omit an actionable exception; and stale access can disclose information if direct targets are not reauthorized.
- Why selected: It preserves the closed, source-owned contract of `DEC-0055` while providing an explicitly defined, read-only adjustment-exception view without changing approval, posting, reversal, MFA, or ledger controls.

### Option B — rejected: generic workspace query from raw client inputs

- Summary: Link the dashboard to the generic Stock Adjustment workspace and allow URL or client inputs to select statuses, scope, search criteria, or a token.
- Benefits: Small initial implementation effort and apparent reuse of existing workspace controls.
- Failure modes: Inputs can override or broaden the intended population; status and selected-location semantics can drift across read paths; and metrics, rows, pages, and exports can silently have different meanings.
- Why selected or rejected: Rejected because it violates the closed-profile and server-authorized semantic boundary in `DEC-0055`.

### Option C — deferred: receiving, stock-count, and wastage exception profiles

- Summary: Add analogous dashboard drilldowns for receiving discrepancies, stock-count variances, or wastage in the same checkpoint.
- Benefits: Broader dashboard coverage for inventory exception work.
- Failure modes: These domains have materially different discrepancy, evidence, approval, posting, immutable-ledger, reversal, and audit semantics; a generic exception profile could conceal required controls or create misleading operational populations.
- Why selected or rejected: Deferred until each source has its own confirmed semantic predicate, direct authorization, pagination/export behavior where offered, and control evidence. This decision does not authorize them.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** The profile is resolved only under the current authorized tenant/company context and currently selected inventory location. No raw status, scope, search, token, or dashboard payload can select or widen scope.
- **Server-enforced authorization:** The profile is an allow-listed server choice, not a capability. List, count, export, direct detail, and every controlled adjustment action must authorize the current session independently.
- **Approval segregation and workflow integrity:** The profile is read-only and preserves no-self-approval. It does not approve, return, post, reverse, cancel, or otherwise transition a stock adjustment; authoritative approval and workflow services remain in control.
- **Immutable inventory ledger and audit trail:** The profile cannot post, reverse, or directly update inventory. Existing immutable-ledger, adjustment reason/evidence, reversal, MFA, and audit requirements remain authoritative.
- **Transaction consistency and idempotency:** This is a bounded read contract. Any later controlled adjustment action retains its existing transaction, locking, idempotency, posting, reversal, MFA, and audit requirements.
- **Phase scope and recovery:** This is limited to Phase I dashboard navigation. It can remain disabled or be withdrawn without changing source data; receiving, stock-count, and wastage sources remain non-drilldown until separately confirmed.

## Required safeguards

- Register `stock-adjustment-exceptions-v1` in a closed server-owned destination/profile allow-list. Unrecognized profile values must be rejected or safely ignored, without generic workspace-query fallback.
- Define one shared resolver/predicate and reuse it for the dashboard metric, destination list, authorized total/count, server pagination, and CSV export. It must resolve exactly `PENDING_APPROVAL`, `APPROVED`, `POSTING`, and `RETURNED`.
- Apply current authorized tenant/company constraints and the currently selected inventory-location constraint consistently in every profile path.
- Ignore raw status, scope, search, and token inputs for the resolved profile. Ordinary Stock Adjustment workspace filtering may remain separately validated, but must not alter this dashboard contract.
- Provide deterministic, bounded server pagination; do not rely on browser-only slicing or an unpaginated operational list.
- Reauthorize direct detail access and every controlled adjustment action at the authoritative target service. Handle revoked access, deleted records, and lifecycle changes with safe user-facing states and without existence leakage.
- Preserve no-self-approval, immutable inventory-ledger, required reason/evidence, approval, controlled posting/reversal, MFA, export permission, and audit behavior. Ensure the export uses the identical resolved profile predicate.
- Ensure profile code and UI do not expose actions that approve, post, reverse, or mutate inventory merely because a record was reached through this dashboard profile.
- Add focused tests for allow-list validation; exact-status parity; tenant/company/location and role boundaries; list/count/page/export parity; raw override non-effect; deterministic pagination; no-self-approval; direct-target authorization; export authorization/audit; stale/denied targets; and confirmation that profile navigation cannot perform inventory-affecting actions.

## Implementation and documentation impact

- Code / architecture: Pending implementation of a closed Stock Adjustment profile resolver at the authoritative dashboard/list/count/export boundary. Do not add a generic dashboard query interpreter, client capability token, or action behavior to the profile.
- Data / schema: None.
- Workflow / permissions: No role, adjustment transition, approval authority, posting authority, reversal authority, MFA requirement, or source-record access is created. Direct details and controlled actions retain target-service authorization and existing segregation controls.
- UI / mobile: Pending implementation. Enable the dashboard destination only when it displays a paginated, scope-aware exception result with clear status and safe empty, changed, and denied states. The drilldown must remain read-only until a separately authorized source action is selected and reauthorized.
- Reporting: Pending implementation. CSV export must use the same resolved profile predicate and existing export metadata/audit controls; this does not authorize a generic dashboard export API.
- Knowledge base / training: **Dunong handoff required after verified implementation.** Assess and update dashboard and Stock Adjustment guidance only after the final label, selected-location scope behavior, statuses, pagination, empty/denied states, export behavior, and independently authorized action behavior are verified. Guidance must state that the dashboard exceptions view does not grant approval, posting, reversal, MFA bypass, or inventory authority.
- Tests / UAT: Pending implementation. Capture desktop, tablet, and mobile evidence for metric-to-list navigation, selected inventory-location scope, each included status, paging, export, empty state, denied access, stale target behavior, no-self-approval, MFA-protected actions, and action reauthorization before production readiness is claimed.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the closed `stock-adjustment-exceptions-v1` resolver, shared predicate, and server pagination | Backend + Frontend Engineering | Next Stock Adjustment dashboard-drilldown checkpoint | Pending |
| Prove dashboard/list/count/page/export parity, selected-location semantics, direct-target reauthorization, no-self-approval, ledger, reversal, MFA, and audit preservation | QA + Architecture + Security + Engineering | Before enabling the dashboard destination | Pending |
| Keep receiving, stock-count, and wastage drilldowns disabled pending their own confirmed profiles and evidence | Decision Chair + module owners | Before any of those cards become active | Pending / deferred |
| Assess user guidance and release-note impact | Dunong | After verified implementation | Handoff required |

## Evidence

- Parent-confirmed conclusion, 2026-07-23: activate the closed `stock-adjustment-exceptions-v1` profile with statuses `PENDING_APPROVAL`, `APPROVED`, `POSTING`, and `RETURNED`; preserve tenant/company/current selected inventory-location scope; require count/list/page/export predicate parity, raw-input resistance, and independent direct-target/action reauthorization; implementation remains pending.
- Independent QA consensus, 2026-07-23: required one exact predicate across dashboard/list/count/page/export, server pagination, override resistance, scope-boundary tests, and safe stale/denied behavior before activation.
- Independent architecture consensus, 2026-07-23: required a closed, source-specific profile, current target-service authorization, and a strictly read-only dashboard contract that preserves no-self-approval, immutable-ledger, controlled posting/reversal, MFA, and audit controls.
- `docs/core/00-governance/decisions/DEC-0055-CLOSED-SERVER-OWNED-DASHBOARD-DRILLDOWN-PROFILES.md`: governing closed-profile, parity, pagination, raw-input, export, and reauthorization contract.
- `docs/core/00-governance/decisions/DEC-0053-BOUNDED-SCOPE-AUTHORIZED-DASHBOARD-READ-MODEL.md`: bounded server-authorized dashboard read-model and target-service authorization requirements.
- `AGENTS.md` §§ 4–5: tenant/company scope, no-self-approval, immutable inventory ledger, adjustment evidence/approval, controlled posting/reversal, MFA, and audit requirements.

## Supersession

This decision is not superseded. It adds the Stock Adjustment exceptions source profile under `DEC-0055` and does not relax the closed, server-owned dashboard contract. A later confirmed decision may revise this profile or approve a deferred exception source only with its own semantic, authorization, parity, inventory-control, MFA, audit, and user-surface evidence.
