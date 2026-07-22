# DEC-0054 — Approval Preview While Normalized Routing Is Disabled

## Metadata

- Decision ID: `DEC-0054`
- Title: Approval Preview While Normalized Routing Is Disabled
- Status: `Confirmed`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation and Phase I Overview dashboard
- Related decision brief: `APPR-DASH-2026-07-23`

## Decision

While `APPROVAL_ROUTING_V1_ENABLED=false`, the Overview dashboard must not use the legacy unbounded `listPendingApprovals` service and must not issue a dashboard-specific direct approval query. Instead, it must render an explicit generic **approval preview unavailable** state with a server-authorized route to the existing Open Approval Inbox.

The unavailable preview must not be represented as zero or empty work and must not contribute to dashboard attention or notification totals. A future bounded approval-preview adapter may use only `listNormalizedApprovalInboxPage` after the normalized-routing cutover and runtime-readiness gates are approved; it must derive a minimal closed projection and must not call `getApprovalDetail` for dashboard aggregation.

## Context

`DEC-0053` establishes the Overview as a bounded, server-authorized read model, with per-source generic degradation rather than broad source reads or client-side composition. Approval work is a particularly sensitive source because visibility depends on current actor eligibility, live permissions, scope, no-self-approval/prohibited-actor controls, current active step, and routing runtime readiness.

The legacy `listPendingApprovals` implementation in `apps/web/src/server/services/approvals.ts` reads all matching pending approval instances and includes pending steps before reducing them to items. It is an established compatibility path, but it is not a bounded dashboard read contract. The normalized `listNormalizedApprovalInboxPage` delegates eligibility to `listEligibleApprovalStepPage`, which has its own scoped, active-step and actor-eligibility rules, but deliberately throws while `APPROVAL_ROUTING_V1_ENABLED` is disabled or routing runtime readiness is not proven. Treating either state as “no approvals” would understate work; bypassing it with a direct dashboard query would create a second approval-eligibility authority.

## Options considered

### Option A — selected: generic unavailable preview with authorized Inbox route

- Summary: While normalized routing is disabled, show a generic unavailable approval-preview state and an Open Approval Inbox route that is authorized by the destination service. Exclude the source from aggregate attention and notification totals.
- Benefits: Preserves a truthful operator signal; avoids overfetching and duplicate approval eligibility logic; keeps the dashboard within `DEC-0053`; and leaves the authoritative Inbox available without claiming that the dashboard can summarize its work.
- Failure modes: A user may need an extra navigation step, the route may later deny access because authority changed, or an unavailable-state label may be misunderstood as a system outage.
- Why selected: It is the only option that meets the bounded-read, authorization, approval-integrity, and truthful-summary controls while the normalized approval source is intentionally feature-disabled.

### Option B — rejected: call legacy `listPendingApprovals` from Overview

- Summary: Reuse the existing legacy service and derive dashboard approval counts/items from its result.
- Benefits: Gives the dashboard an immediate count and task preview with little new UI work.
- Failure modes: Performs an unbounded multi-instance/step read; imports a compatibility-path contract into the dashboard; creates avoidable latency and data-minimization risk; and makes the dashboard's totals depend on a source that does not meet its bounded adapter contract.
- Why rejected: It fails the bounded-read and least-data safeguards of `DEC-0053`. A familiar service is not authorization to use it as an aggregate dashboard source.

### Option C — rejected: implement a direct dashboard approval query

- Summary: Query approval tables directly from the Overview adapter and recreate enough filters to return a count and preview.
- Benefits: Could be made narrow and tailored to dashboard fields.
- Failure modes: Duplicates live approval-eligibility, role, scope, active-step, prohibited-actor, and no-self-approval semantics; can drift from the Approval Inbox; risks disclosing work or record existence; and makes the dashboard an unauthorized approval authority.
- Why rejected: It fails the server-authorized source-service boundary and approval-segregation hard gates. The dashboard must consume a governed service contract, not reconstruct approval rules.

### Option D — rejected for the current release posture: use normalized Inbox now

- Summary: Call `listNormalizedApprovalInboxPage` and project its bounded results into Overview immediately.
- Benefits: It is the intended bounded eligibility service and already supports page limits.
- Failure modes: The service correctly rejects calls while the feature flag is false or runtime readiness is incomplete. Circumventing those gates would expose incomplete normalized-routing behavior and contradict `DEC-0051` and `DEC-0052`.
- Why rejected: It is the future implementation path, not a permitted current path. It can be selected only after approved cutover and runtime readiness.

## Scorecard-quality reasoning

Options B, C, and D do not pass all applicable hard gates in the current feature-disabled posture, so their weighted scores cannot override rejection. Among executable options, Option A scores highest because it maintains operational truth without assigning the dashboard approval authority.

| Criterion | Weight | Option A |
|---|---:|---:|
| Operational correctness and control | 30% | 5 |
| Business value | 20% | 4 |
| User adoption and branch usability | 15% | 4 |
| Delivery effort and risk | 15% | 5 |
| Maintainability and scalability | 10% | 5 |
| Operating cost | 5% | 5 |
| Reversibility | 5% | 5 |
| **Weighted total** | **100%** | **4.65 / 5** |

The lower immediate convenience of Option A is intentional: a truthful unavailable state is safer than a plausible but incomplete count, and the authorized Inbox route preserves the operator's ability to reach the source workflow.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** The Overview receives no direct approval-record query or client-controlled approval filter. The destination Inbox continues to apply its own server-side scope and eligibility logic.
- **Server-enforced authorization:** The Overview only exposes a registered route; opening the Inbox is reauthorized there. A dashboard state or link is never a capability to read an approval record.
- **Approval segregation and no self-approval:** No dashboard aggregation evaluates or changes approval eligibility. Existing Inbox/source controls remain the sole authority for live eligibility and decisions.
- **Audit, confidentiality, and data minimization:** The state is generic and contains neither approval counts nor record metadata. It exposes no raw error, forbidden/not-found distinction, or sensitive source detail.
- **Transaction consistency and idempotency:** The decision is read-only and adds no approval mutation, synthesized state, or duplicate notification behavior.
- **Phase scope and recovery:** This is a feature-disabled dashboard posture, not a routing activation or new approval workflow. It can safely transition to a bounded normalized adapter after the separate cutover gates are approved; until then the generic state remains the rollback-safe fallback.

## Required safeguards

- Do not import or call `listPendingApprovals` from the Overview dashboard composition path while the flag is false.
- Do not query approval, approval-step, role-assignment, or permission tables directly from Overview to construct an approval preview.
- Render explicit generic unavailable copy; do not use a zero count, an empty-state message, a hidden card, or an “all clear” indicator for this source.
- Exclude unavailable approval preview state from attention counts, notifications/badge totals, and any KPI that implies a complete operational total.
- Limit the dashboard to a registered Open Approval Inbox destination; the Inbox and any target action must reauthorize the current session and safely handle later denial, revocation, or state changes.
- Permit a future preview adapter only after the approved normalized-routing cutover and runtime-readiness checks. It must call `listNormalizedApprovalInboxPage`, respect its bounded pagination, map only a documented minimal closed task projection, and never load `getApprovalDetail` or source-family detail records merely to populate Overview.
- Add focused tests proving the flag-off unavailable state, absence from aggregate totals, absence of legacy/direct approval reads, route authorization behavior, and future-adapter readiness/flag rejection. Before production readiness, add browser/UAT coverage for the state, responsive route affordance, denied/stale destination handling, and no-self-approval preservation.

## Implementation and documentation impact

- Code / architecture: Overview owns only generic availability presentation and a registered destination. Approval eligibility remains in the Approval Inbox services; no data/schema change is authorized.
- Data / schema: None.
- Workflow / permissions: No change to approval route, decision authority, permission, no-self-approval, or audit policy. The Inbox remains the authoritative work surface.
- UI / mobile: Show the unavailable state and clearly labelled Open Approval Inbox action in the action-first dashboard. The state must be usable on mobile and must not imply zero pending approvals.
- Reporting: No dashboard approval metric or notification total is authorized in the feature-disabled posture.
- Knowledge base / training: **Dunong handoff required after the verified UI ships.** Update dashboard and Approval Inbox guidance to explain that the Overview may show an unavailable approval preview during routing readiness work, that this is not a zero-work signal, and that users must open the Inbox for authoritative approval work. Do not publish this explanation before final labels and behavior are verified.
- Tests / UAT: Add the safeguards above to focused dashboard/approval tests and the Overview production-readiness/UAT matrix. This decision does not itself prove normalized-routing activation readiness.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement generic flag-off approval-preview unavailable state and authorized Inbox destination; exclude it from aggregate totals | Backend + Frontend Engineering | Current Overview checkpoint | Pending |
| Add focused contract, authorization, aggregate-total, and UI-state tests | QA + Security + Engineering | Before committing the checkpoint | Pending |
| Define the minimal closed normalized approval-preview DTO using `listNormalizedApprovalInboxPage` | Architecture + Backend Engineering | Only after normalized-routing cutover/readiness approval | Pending / gated |
| Verify flag, runtime-readiness, scope, live eligibility, no-self-approval, stale/denied destination, and responsive behavior in UAT | QA + Security | Before Overview is production-ready | Pending |
| Prepare verified role guidance for the temporary preview state and authoritative Inbox route | Dunong | After verified UI labels and behavior | Handoff required |

## Evidence

- `APPR-DASH-2026-07-23`: parent-confirmed conclusion after independent first-round and challenge evaluation.
- `docs/core/00-governance/decisions/DEC-0053-BOUNDED-SCOPE-AUTHORIZED-DASHBOARD-READ-MODEL.md`: requires bounded, server-authorized, closed dashboard source adapters and generic degraded states.
- `docs/core/00-governance/decisions/DEC-0051-CANONICAL-APPROVAL-DECISION-PARITY-AND-ATOMIC-SOURCE-EFFECTS.md` and `DEC-0052-APPROVAL-INTEGRITY-LOCKING-AND-TYPED-FINANCIAL-INTENT.md`: retain `APPROVAL_ROUTING_V1_ENABLED=false` until cutover and exact-release gates are passed.
- `apps/web/src/server/services/approvals.ts` — `listPendingApprovals` (around line 2696): legacy pending-instance/step list, not a bounded Overview adapter.
- `apps/web/src/server/services/approvals.ts` — `listNormalizedApprovalInboxPage` (around line 75): flag- and runtime-readiness-gated normalized Inbox entry point.
- `apps/web/src/server/services/approvalRouting.ts` — `listEligibleApprovalStepPage` (around line 497): governed current-step, actor-eligibility, scope, and bounded paging behavior.
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` and `DECISION_SCORECARD.md`: required control-first decision process and scorecard criteria.

## Supersession

This decision is not superseded. It governs only the Overview approval-preview posture while normalized approval routing is disabled. A later confirmed cutover decision may amend it to register a bounded normalized adapter; that change must retain source-service authority, closed minimal projection, and the stated safeguards.
