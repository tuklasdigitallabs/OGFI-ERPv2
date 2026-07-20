# DEC-0037 — Phase II Risk-Tiered Operations Lifecycle

- **Status:** Confirmed product and control decision
- **Date:** 2026-07-11
- **Decision owner:** OGFI ERP Product Governance
- **Decision Chair:** Codex parent agent
- **Related phase/module:** Phase II — Incident Management and Maintenance
- **Related decision brief:** Parent decision conclusion adopting a risk-tiered Phase II operations lifecycle

## Decision

Phase II incident and maintenance workflows will use a risk-tiered lifecycle. Routine closure may be completed directly with reason, required evidence, and audit history; high-risk, regulatory, branch-blocking, food-safety-critical, void, and reopen actions require independent review.

The version-controlled policy registry remains the authoritative resolver for action eligibility and must be reconciled to currently supported statuses. Policy or status changes are prospective and must not rewrite historical workflow or audit records.

## Context

A single review rule would either over-control routine work or under-control actions with material operational, safety, regulatory, or audit consequences. The lifecycle therefore needs risk-sensitive review while preserving one authoritative transition policy and existing history.

## Options Considered

### Option A — selected: risk-tiered closure and exception review

- **Benefits:** Keeps routine closure efficient while applying segregation and evidence controls to consequential actions.
- **Failure modes:** Incorrect risk classification, policy/status drift, or an actor serving as their own independent reviewer.
- **Why selected:** Balances branch usability with safety, regulatory, operational, and audit controls.

### Option B — rejected: independent review for every closure

- **Benefits:** Simple and uniformly conservative.
- **Failure modes:** Review bottlenecks, delayed routine completion, and avoidable operational overhead.
- **Why rejected:** Disproportionate for routine incidents and maintenance work with adequate reason, evidence, and audit.

### Option C — rejected: direct closure and exception actions without review

- **Benefits:** Fastest workflow.
- **Failure modes:** Weak segregation for high-risk closure, void, and reopen actions; increased safety, regulatory, and audit exposure.
- **Why rejected:** Fails the required control level for consequential actions.

## Hard-Gate Assessment

- Tenant, company, brand, location, role, and assigned-scope authorization remain server-enforced.
- Independent review must prevent self-review and preserve actor/reviewer attribution.
- Reason, configured evidence, transition history, and audit records are append-only.
- Incident and maintenance actions do not alter inventory, purchasing, finance, or other source records.
- The policy resolver is version-controlled, status-compatible, and applied prospectively without history rewrite.

## Required Safeguards

- Define deterministic risk criteria for routine, high-risk, regulatory, branch-blocking, and food-safety-critical records.
- Require an eligible reviewer independent from the initiating actor for controlled closure, void, and reopen actions.
- Reconcile policy entries to supported statuses before activation; reject unmapped or stale transitions safely.
- Record policy version, risk tier, actor, reviewer where applicable, reason, evidence references, timestamps, and transition outcome.
- Test direct routine closure, every mandatory-review category, self-review denial, missing evidence, stale status, retry/idempotency, and historical-record preservation.

## Implementation And Documentation Impact

- **Code / architecture:** Use the version-controlled policy registry as the authoritative lifecycle resolver.
- **Data / schema:** Preserve existing records; add only prospective policy/version or review metadata if implementation requires it.
- **Workflow / permissions:** Permit direct routine closure; require independent review for the specified risk and exception actions.
- **UI / mobile:** Show whether an action is direct or review-required and explain blocked actions.
- **Reporting:** Retain risk tier, policy version, review outcome, and lifecycle history for audit and operational reporting.
- **Knowledge base / training:** Dunong must assess incident and maintenance guidance for changed closure, void, and reopen behavior.
- **Tests / UAT:** Cover risk classification, authorization, review segregation, evidence, status reconciliation, audit, and no-history-rewrite behavior.

## Follow-Up Actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Reconcile lifecycle policy entries to currently supported incident and maintenance statuses | Engineering / Product | Before policy activation | Pending |
| Validate direct and review-required paths in Phase II UAT | QA / Operations | Before Phase II release readiness | Pending |
| Assess user-facing guidance changes | Dunong / Enablement | Before Phase II UAT | Pending |

## Evidence

- Parent decision conclusion confirmed on 2026-07-11.
- `docs/core/00-governance/decisions/DEC-0035-PHASE2-FNB-WORKFLOW-CONTROL-POLICY.md`
- `docs/phases/phase-02-restaurant-operations-and-food-cost/implementation/PHASE2_DECISION_REGISTER.md`
- `docs/phases/phase-02-restaurant-operations-and-food-cost/workflows/incident-management-workflow.md`
- `docs/phases/phase-02-restaurant-operations-and-food-cost/workflows/maintenance-workflow.md`

## Supersession

This decision refines the Phase II operational lifecycle controls in `DEC-0035`; it does not rewrite or supersede historical workflow records.
