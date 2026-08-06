# DEC-0267 — Short Mutation Feedback Transport and Rollout

## Metadata

- Decision ID: `DEC-0267`
- Status: Confirmed
- Date: 2026-08-03
- Decision owner: OGFI Product Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I Core Administration, master data, and eligible operational-setup surfaces
- Related decision brief: Short-mutation feedback transport and staged rollout

## Decision

Standardize user feedback for explicitly allowlisted, short Phase I Core Administration, master-data, and eligible operational-setup mutations through the global toast host and an explicit trusted-origin `POST` response adapter. Modal and drawer forms close only after confirmed success; on an error they stay open with their entered values intact.

This is a staged allowlist, not a universal feedback transport. Security/access and MFA, role/scope changes, policy or approval-rule activation, finance or inventory posting, approvals, dispatch, receipt, reversal, count closure, and multi-step or evidence-heavy workflows are excluded. Those workflows retain an authoritative detail-state refresh; a toast may supplement, but never replace, that state.

## Context

Short, low-risk administrative and setup forms need consistent confirmation and recoverable error feedback. A broad transport rule would be unsafe: many ERP actions change authority, policy, money, inventory custody, or irreversible workflow state and need the durable record state, audit context, and next-action detail visible after a result. The decision therefore confines the transport to reviewed short mutations and makes admission explicit.

## Options considered

### Option A — Universal toast transport — rejected

- Summary: Route all mutation responses through the global toast host.
- Benefits: Uniform implementation and immediate UI consistency.
- Failure modes: A transient confirmation can be mistaken for authoritative workflow state; important errors and required evidence context can be lost; high-control actions could close before a user reviews their durable outcome.
- Why rejected: It cannot safely preserve the detail-state, custody, authorization, approval, inventory, and audit controls of excluded workflows.

### Option B — Server Action-only feedback — rejected

- Summary: Use feedback only where a mutation is implemented as a Server Action.
- Benefits: Narrower implementation boundary and simple same-origin handling.
- Failure modes: Creates inconsistent user feedback across eligible forms, leaves trusted `POST` response paths without a defined adapter, and encourages transport choice to determine UX rather than action risk.
- Why rejected: It does not provide a common, reviewable mechanism for all eligible trusted-origin short mutations.

### Option C — Staged explicit allowlist with trusted-origin POST adapter — selected

- Summary: Admit only named, short low-risk actions to the shared toast host; use an explicit adapter for trusted-origin `POST` responses and preserve form state until success is confirmed.
- Benefits: Consistent success/error feedback for eligible work while keeping consequential workflows on authoritative detail-state refresh; incremental, reviewable, and reversible rollout.
- Failure modes: An action can be incorrectly admitted, origin/response validation can be too permissive, duplicate feedback can occur, or a failure path can discard entered values.
- Why selected: It provides the desired usability improvement without weakening the controls required for higher-risk Phase I actions.

## Scorecard comparison

Only Option C passes all applicable hard gates. Scores use the governance scorecard's 1–5 scale; rejected options receive no implementation credit even where their arithmetic would otherwise be attractive.

| Criterion | Weight | A: Universal | B: Server Action-only | C: Staged allowlist |
|---|---:|---:|---:|---:|
| Operational correctness and control | 30% | 1 | 3 | 5 |
| Business value | 20% | 4 | 3 | 5 |
| User adoption and branch usability | 15% | 3 | 3 | 5 |
| Delivery effort and risk | 15% | 2 | 4 | 4 |
| Maintainability and scalability | 10% | 2 | 3 | 5 |
| Operating cost | 5% | 4 | 4 | 4 |
| Reversibility | 5% | 2 | 3 | 5 |
| **Weighted total / 5** | **100%** | **2.40** | **3.20** | **4.80** |

## Hard-gate assessment

- Tenant, company, brand, and location isolation: unchanged; admission to a feedback transport does not grant data access or widen scope.
- Server-side authorization: unchanged; the adapter consumes only a controlled response and cannot substitute for service/data-access authorization.
- Approval segregation and no self-approval: excluded approval and policy-activation actions retain their authoritative workflow surfaces.
- Immutable inventory ledger and audit history: posting, dispatch, receipt, reversal, and count-closure actions are excluded.
- Transaction consistency and idempotency: the adapter reports a confirmed response; it does not define or replace mutation idempotency or transaction rules.
- Phase scope and recovery: the rollout is limited to Phase I allowlisted short actions, and failure leaves the form recoverable with values retained.

## Required safeguards

- Maintain a reviewable explicit allowlist. Default all unlisted actions to the existing authoritative detail-state feedback behavior.
- Accept adapter input only from a trusted origin and explicit `POST` response contract; do not infer success from navigation, an HTTP redirect alone, or untrusted client-provided text.
- Close a modal or drawer only after confirmed success. On validation, service, authorization, or network errors, keep it open and preserve entered values with actionable inline or accessible error feedback.
- Do not use a toast as the sole durable outcome for excluded actions. Refresh and render the authoritative record/detail state, current status, next action, and relevant audit/activity access; a toast is supplemental only.
- Ensure success is emitted once per confirmed submission and prevent stale, retried, or duplicate responses from producing contradictory feedback.
- Preserve accessible announcement, visible error-state, focus, and dismissal behavior so short feedback does not conceal validation or workflow context.
- Require action-by-action tests for allowlist admission, rejected/untrusted origins, success-only close behavior, retained error values, duplicate suppression, and excluded-workflow detail refresh.

## First-round review safeguards

- Security review: strict trusted-origin and explicit response-contract checks; no client feedback adapter may become an authorization boundary or disclose protected error details.
- UX review: confirmation must be specific and non-blocking for admitted short actions, while errors preserve the user's work and keep correction context in view; high-consequence actions need durable authoritative state.
- QA review: prove both positive and negative paths, including stale/retried submissions, modal/drawer retention, no premature close, one feedback event, and no regression to excluded workflows.

## Implementation and documentation impact

- Code / architecture: Add or use one global toast host and a narrowly scoped, explicit trusted-origin `POST` response adapter only for admitted actions.
- Data / schema: No schema or data-model change.
- Workflow / permissions: No authorization, approval, inventory, custody, or state-transition change; excluded workflow behavior remains authoritative.
- UI / mobile: Eligible short forms receive consistent feedback; their success and error close/retain behavior must be equivalent in modal and drawer use.
- Reporting: No impact.
- Knowledge base / training: No end-user documentation update is authorized by this record alone. If the rollout changes visible task guidance, hand off a release-note/help assessment to Dunong.
- Tests / UAT: Do not claim implementation completion from this decision record. Completion requires per-action admission evidence and the safeguards/tests above, plus visible-surface verification.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Define and review the initial named action allowlist. | Implementation owner with Security/UX/QA review | Before enabling any action | Complete — organization scope; supplier create/accreditation/deactivation; category/UOM create/update/deactivation; conversion update are admitted. |
| Implement the global host and explicit trusted-origin POST adapter. | Implementation owner | Only for approved allowlisted actions | In progress — shared host/adapter and the initial named routes are implemented; no excluded workflow is enrolled. |
| Add action-level regression and UAT evidence. | QA / implementation owner | Before claiming rollout completion | In progress — adapter contract tests added; executable local validation and visible-surface UAT remain required. |
| Assess user-facing release-note/help impact. | Dunong | When visible rollout scope is confirmed | In progress — existing Core Administration release note will be updated after local visible verification. |

## Evidence

- Confirmed decision authorization from the parent agent on 2026-08-03.
- `docs/core/00-governance/DECISION_SCORECARD.md`.
- First-round Security, UX, and QA review safeguards summarized in this record.
- Code Spark and GPT-5.4-mini were unavailable in the active tool set; GPT-5.6-terra was used as the fallback reviewer model.

## Supersession

Not superseded.
