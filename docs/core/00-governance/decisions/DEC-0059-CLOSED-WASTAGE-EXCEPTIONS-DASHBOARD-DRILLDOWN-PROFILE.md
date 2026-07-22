# DEC-0059 — Closed Wastage Exceptions Dashboard Drilldown Profile

## Metadata

- Decision ID: `DEC-0059`
- Title: Closed Wastage Exceptions Dashboard Drilldown Profile
- Status: `Confirmed`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation and Phase I Overview / Wastage Reports
- Related decision brief: Parent-confirmed dashboard-drilldown deliberation, 2026-07-23

## Decision

Under `DEC-0055`, approve the closed, source-owned Wastage Exceptions dashboard drilldown profile `wastage-exceptions-v1`. Under the current authorized tenant and company scope and the currently selected inventory location, it must reuse exactly the current dashboard exception predicate: wastage reports in `PENDING_APPROVAL`, `APPROVED`, `POSTING`, or `RETURNED`, **or** reports for which `evidenceRequired = true` and `evidenceSatisfied = false`.

The dashboard metric, destination list, authorized count, server pagination, and export must share this one predicate. The profile ignores raw status, scope, search, filter, and token inputs; it is read-only, and direct detail and every controlled action independently reauthorize the current session. It preserves evidence policy, approval, audit, idempotent immutable-ledger posting, and reversal controls. Implementation is pending.

## Context

`DEC-0055` requires every enabled dashboard drilldown to be a finite, server-owned semantic profile rather than a client-controlled status, scope, search, filter, or token contract. The existing Wastage dashboard read already defines a bounded exception population under its scoped wastage query: reports needing approval, posting, or correction, plus reports whose configured required evidence is unsatisfied.

This profile must reproduce that existing predicate exactly rather than reduce it to a status-only view. Evidence compliance is an independent exception condition and remains governed by the authoritative wastage policy and report fields. The drilldown is a navigation/read aid only; it does not grant authority to approve, post, reverse, cancel, or amend a wastage report.

Count Variance remains deferred. Blind-count and reconciliation confidentiality require separate design and evidence before a count-variance dashboard profile can be confirmed; this decision does not authorize it.

## Options considered

### Option A — selected: closed `wastage-exceptions-v1` profile

- Summary: Resolve an allow-listed Wastage Exceptions profile at the server boundary using the current authorized tenant/company/selected-inventory-location scope and the existing dashboard predicate: status in `PENDING_APPROVAL`, `APPROVED`, `POSTING`, or `RETURNED`, or required evidence not satisfied.
- Benefits: Preserves the exact operational meaning already shown by the dashboard; treats missing required evidence as a first-class exception; prevents client-controlled semantic drift; supports truthful metric, list, count, page, and export results; and keeps approval and inventory authority with authoritative services.
- Failure modes: Predicate duplication can make the metric and destination disagree; a status-only implementation can omit evidence exceptions; a raw input can broaden or alter the population; or stale access can disclose information if direct targets are not reauthorized.
- Why selected: It is the only option that preserves the current dashboard's bounded exception meaning while meeting the closed, server-owned contract of `DEC-0055`.

### Option B — rejected: generic wastage workspace query from raw client inputs

- Summary: Link the dashboard to the generic Wastage workspace and allow URL or client inputs to select status, location, search, filter, or a token.
- Benefits: Small initial implementation effort and apparent reuse of existing workspace controls.
- Failure modes: Raw values can override or broaden the intended exception population; evidence exceptions can be omitted; selected-location semantics can drift; and dashboard counts, rows, pages, and exports can silently have different meanings.
- Why selected or rejected: Rejected because it violates `DEC-0055`'s closed-profile and server-authorization boundary.

### Option C — deferred: count-variance drilldown profile

- Summary: Add a Stock Count variance dashboard destination in the same implementation checkpoint.
- Benefits: Broadens inventory-exception navigation.
- Failure modes: Blind-count entry and reconciliation confidentiality can be exposed through a prematurely broad list, count, export, or direct-target contract; the population and permissible fields require separate design.
- Why selected or rejected: Deferred pending a separate confirmed design for blind-count/reconciliation confidentiality, source predicate, field minimization, authorization, pagination/export parity, and safe target behavior.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** The profile resolves only under the current authorized tenant/company context and selected inventory location. No raw status, scope, search, filter, token, or dashboard payload may select or widen scope.
- **Server-enforced authorization:** The profile is an allow-listed server choice, not a capability. List, count, export, direct detail, and every controlled wastage action independently authorize the current session.
- **Approval segregation and workflow integrity:** The profile is read-only. It does not submit, approve, return, reject, post, reverse, cancel, or otherwise transition a wastage report; no-self-approval and current approval controls remain authoritative.
- **Immutable inventory ledger and audit trail:** The profile cannot post, reverse, or directly update inventory. Required evidence, reason, approval, immutable `WASTAGE_OUT` posting, linked reversal, and audit controls remain with the authoritative wastage and inventory services.
- **Transaction consistency and idempotency:** This is a bounded read contract. Any later controlled posting or reversal retains its transaction, locking, idempotency, source-lineage, and audit requirements.
- **Phase scope and recovery:** This is limited to Phase I dashboard navigation. It can remain disabled or be withdrawn without changing source data. Count Variance remains non-drilldown until separately confirmed.

## Required safeguards

- Register `wastage-exceptions-v1` in a closed server-owned destination/profile allow-list. Unrecognized profile values must be rejected or safely ignored without generic workspace-query fallback.
- Define one shared resolver/predicate and reuse it for the current dashboard metric, destination list, authorized total/count, deterministic bounded server pagination, and CSV export. It must resolve exactly `(status IN [PENDING_APPROVAL, APPROVED, POSTING, RETURNED]) OR (evidenceRequired = true AND evidenceSatisfied = false)`.
- Apply current authorized tenant/company constraints and the currently selected inventory-location constraint consistently in every profile path.
- Ignore raw status, scope, search, filter, and token overrides for the resolved profile. Ordinary Wastage workspace filtering may remain separately validated but must not alter this dashboard contract.
- Preserve the authoritative evidence-policy evaluation. The profile must neither treat evidence as satisfied based on client input nor omit a report that meets the missing-required-evidence condition.
- Reauthorize direct detail access and every controlled wastage action at the authoritative target service. Handle revoked access, deleted records, and lifecycle changes with safe user-facing states and without existence leakage.
- Preserve no-self-approval, required reason/evidence, approval, audit, idempotent immutable-ledger posting, source-linked reversal, export permission, and export-audit behavior. Ensure export uses the identical resolved profile predicate.
- Ensure profile code and UI do not expose actions that approve, post, reverse, cancel, or mutate inventory merely because a record was reached through this dashboard profile.
- Add focused tests for allow-list validation; exact status-and-evidence predicate parity; tenant/company/location and role boundaries; list/count/page/export parity; raw override non-effect; deterministic pagination; evidence-policy preservation; no-self-approval; direct-target authorization; export authorization/audit; stale/denied targets; idempotent posting/reversal preservation; and confirmation that profile navigation cannot perform inventory-affecting actions.

## Implementation and documentation impact

- Code / architecture: Pending implementation of a closed Wastage profile resolver at the authoritative dashboard/list/count/export boundary. Do not add a generic dashboard-query interpreter, client capability token, or action behavior to the profile.
- Data / schema: None.
- Workflow / permissions: No role, evidence-policy exception, approval authority, posting authority, reversal authority, or source-record access is created. Direct details and controlled actions retain target-service authorization and segregation controls.
- UI / mobile: Pending implementation. Enable the dashboard destination only when it displays a paginated, selected-location-scoped exceptions result with clear status/evidence context and safe empty, changed, and denied states. The drilldown remains read-only until a separately authorized source action is selected and reauthorized.
- Reporting: Pending implementation. CSV export must use the same resolved status-and-evidence predicate and existing export metadata/audit controls; this does not authorize a generic dashboard export API.
- Knowledge base / training: **Dunong handoff required after verified implementation.** Assess and update dashboard and Wastage guidance only after the final label, selected-location scope behavior, status/evidence conditions, pagination, empty/denied states, export behavior, and independently authorized action behavior are verified. Guidance must state that the exceptions view does not grant evidence-policy override, approval, posting, reversal, or inventory authority.
- Tests / UAT: Pending implementation. Capture desktop, tablet, and mobile evidence for metric-to-list navigation, selected inventory-location scope, each included status, missing-required-evidence cases, paging, export, empty state, denied access, stale target behavior, no-self-approval, posting/reversal control preservation, and action reauthorization before production readiness is claimed.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the closed `wastage-exceptions-v1` resolver, shared status-and-evidence predicate, server pagination, and export parity | Backend + Frontend Engineering | Next Wastage dashboard-drilldown checkpoint | Pending |
| Prove dashboard/list/count/page/export parity, selected-location semantics, evidence-policy preservation, direct-target reauthorization, approval, ledger, reversal, idempotency, and audit preservation | QA + Architecture + Security + Engineering | Before enabling the dashboard destination | Pending |
| Keep Count Variance drilldown disabled pending a separately confirmed blind-count/reconciliation confidentiality design | Decision Chair + Stock Count module owner | Before any Count Variance card becomes active | Pending / deferred |
| Assess user guidance and release-note impact | Dunong | After verified implementation | Handoff required |

## Evidence

- Parent-confirmed conclusion, 2026-07-23: Wastage Exceptions is next; it must exactly reuse the current dashboard exception predicate and selected inventory-location scope, use a server-owned allow-list with list/count/page/export parity and no raw overrides, remain read-only, preserve evidence/approval/audit/idempotent immutable-ledger posting/reversal controls, and remain pending implementation. Count Variance is deferred pending separate blind-count/reconciliation confidentiality design.
- `apps/web/src/server/services/wastage.ts` — `wastageDashboardExceptionStatuses` and `getWastageDashboardRead`: current exception predicate is `PENDING_APPROVAL`, `APPROVED`, `POSTING`, or `RETURNED`, or `evidenceRequired` with unsatisfied evidence; its scope derives from the current tenant, company, and inventory location.
- `apps/web/src/server/services/dashboard.ts` — Wastage Exceptions card and queue assembly: uses the same status-or-missing-required-evidence condition and labels the card `Wastage Exceptions`.
- `docs/core/00-governance/decisions/DEC-0055-CLOSED-SERVER-OWNED-DASHBOARD-DRILLDOWN-PROFILES.md`: governing closed-profile, parity, pagination, raw-input, export, and reauthorization contract.
- `docs/core/00-governance/decisions/DEC-0058-CLOSED-STOCK-ADJUSTMENT-EXCEPTIONS-DASHBOARD-DRILLDOWN-PROFILE.md`: adjacent inventory-exception profile precedent; this Wastage profile additionally preserves the current evidence condition.
- `AGENTS.md` §§ 4–5: tenant/company scope, no-self-approval, required evidence, immutable inventory ledger, wastage posting/reversal, idempotency, and audit requirements.

## Supersession

This decision is not superseded. It adds the Wastage Exceptions source profile under `DEC-0055` and does not relax the closed, server-owned dashboard contract. A later confirmed decision may revise this profile or approve Count Variance only with its own semantic, confidentiality, authorization, pagination/export, inventory-control, audit, and user-surface evidence.
