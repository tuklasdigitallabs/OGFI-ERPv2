# DEC-0074 — Shared Approval Step-Ready Notification Parity

## Metadata

- Decision ID: `DEC-0074`
- Title: Shared Approval Step-Ready Notification Parity
- Status: `Confirmed and implemented — PostgreSQL execution and activation gates pending`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — normalized approval routing notifications
- Related decision brief: Parent-led shared approval-advance notification deliberation, 2026-07-23

## Decision

The shared `approveCurrentStepAndAdvance` path used by Purchase Request, Quotation Recommendation, Purchase Order, Purchase Order Balance Closure, Purchase Order Amendment, Wastage Report, and Stock Adjustment must create next-step readiness through the shared `recordApprovalStepReadyNotification` helper.

For a direct-user next step, the notification uses the deterministic source event key:

`approval:<approval-instance-id>:step:<step-order>:ready`

It is written in the same transaction as the current-step decision and next-step activation and may create at most one personal notification under retry. A role-scoped next step creates zero per-user notification rows and remains discoverable through live Approval Inbox eligibility. `APPROVAL_ROUTING_V1_ENABLED` remains `false`.

The notification preserves the core step-ready fields and the existing routing metadata needed to describe the activated step: approval instance and step IDs, step order, assignment mode and direct recipient, `assignedRoleId`, `requiredPermissionCode`, `scopeType`, and `scopeId`. The helper may accept structured optional routing context, but that context cannot override its core identity, recipient, assignment, scope, permission, entity, deep-link, notification-type, priority, or deterministic-key fields.

## Context

Specialized normalized approval transitions already use the shared step-ready notification helper, but the seven-family shared `approveCurrentStepAndAdvance` path has a separate next-step notification implementation. Parallel implementations can drift in idempotency key, metadata, recipient behavior, or transaction placement. That creates a risk of duplicate direct-user notifications, role-member fanout, incomplete routing evidence, or inconsistent behavior between shared and specialized canonical decisions.

`DEC-0050` establishes that normalized direct-user work may create one idempotent personal notification while role-scoped work creates no per-user fanout and is found through live eligibility. This decision applies that confirmed contract to all seven families sharing the current-step advance primitive without combining it with the separate legacy initial-procurement notification migration.

## Options considered

### Option A — selected: one shared step-ready helper for all seven shared families

- Summary: Route direct-user next-step readiness from `approveCurrentStepAndAdvance` through `recordApprovalStepReadyNotification`, use its deterministic approval/step event key, retain the required routing metadata through non-overriding structured context, and create no notification for role-scoped activation.
- Benefits: Establishes one idempotency and metadata contract; prevents per-family drift; keeps the notification atomic with activation; preserves Approval Inbox as the live authority; and provides one bounded test matrix across all shared families.
- Failure modes: Optional context could overwrite core fields; an implementation could notify a role anchor as though it were a direct assignment; retry could change the event key; required routing metadata could be dropped; or notification creation could escape the decision transaction.
- Why selected or rejected: Selected because it closes a known normalized-routing parity gap through an existing shared primitive without changing approval policy or legacy initial-routing behavior.

### Option B — rejected: defer notification parity

- Summary: Leave the seven-family shared path on its current notification implementation until broader approval cutover work is complete.
- Benefits: Avoids an immediate internal API change.
- Failure modes: Retains two step-ready implementations and leaves retry cardinality, metadata parity, and role-fanout behavior inconsistent at an activation boundary.
- Why selected or rejected: Rejected because the bounded helper convergence is independently testable and is required before normalized-routing activation.

### Option C — rejected: combine with legacy initial procurement notification migration

- Summary: Change normalized next-step readiness and the legacy initial Purchase Request, Purchase Order, or related role-recipient notification paths in one checkpoint.
- Benefits: Could address more notification debt in one delivery.
- Failure modes: Mixes different lifecycle events and feature-flag postures, broadens rollback, and can obscure whether a regression belongs to initial routing or normalized step advance.
- Why selected or rejected: Rejected because legacy initial notification parity remains a separate implementation and verification concern.

### Option D — rejected: prohibited-actor matrix first

- Summary: Expand prohibited-actor decision tests before converging the step-ready notification implementation.
- Benefits: Improves segregation-of-duties evidence.
- Failure modes: Does not close the duplicate/drift risk in direct-user readiness notifications or prove zero role-scoped fanout.
- Why selected or rejected: Rejected as the next checkpoint. Prohibited-actor breadth remains an activation gate and is not a substitute for notification parity.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** The helper receives the already-authorized tenant/company source descriptor and exact activated-step scope. Optional context cannot widen or replace those core values.
- **Server-enforced authorization:** A notification is informational and grants no approval authority. Opening the Approval Inbox, detail, or action continues to revalidate live permission, assignment, scope, prohibited-actor, and current-step eligibility.
- **Approval segregation:** Direct-user notification is created only for the locked, eligible direct assignee. Role-scoped activation creates zero personal fanout and cannot treat a deterministic role anchor as personal assignment.
- **Audit integrity:** Notification metadata identifies the exact approval instance, activated step, assignment, permission, and scope without becoming approval evidence or authority. The canonical decision and audit remain authoritative.
- **Transactional consistency and idempotency:** Step activation and any direct-user readiness notification share one transaction. The deterministic approval/step event key enforces retry-safe cardinality through the existing notification writer.
- **Phase scope:** The decision aligns seven existing shared approval families. It does not change routes, thresholds, recipients for initial legacy activations, or user authority.
- **Recovery and rollback:** No migration or historical notification rewrite is authorized. While routing remains disabled, the implementation is code-reversible without deleting or rewriting notification or approval history.

## Required safeguards

- Call `recordApprovalStepReadyNotification` only after the exact next step has been successfully activated inside the supplied canonical decision transaction.
- For direct-user assignment, pass the exact activated step ID and order, assigned user, tenant/company/location, source identity, public reference, and deep-link source descriptor. Use exactly `approval:<instance>:step:<order>:ready` as the source event key.
- Preserve `assignedRoleId`, `requiredPermissionCode`, `scopeType`, and `scopeId` as structured metadata together with the core approval instance ID, step ID, order, assignment mode, and assigned user.
- If optional routing context is added to the helper, define a closed structured type. Merge only approved extension fields; never allow context to override tenant, company, location, approval/step identity, step order, recipient, assignment mode, role, permission, scope, entity, notification type, priority, deep link, or source event key.
- Create one direct-user notification at most under retry, concurrent delivery attempts, or repeated decision invocation. Do not generate a second notification with a family-specific event key.
- Create zero per-user rows for role-scoped next-step activation. Do not enumerate role members or notify the deterministic authority anchor.
- Keep notification creation in the same transaction as canonical step approval and next-step activation. Any notification failure must roll back the decision checkpoint rather than leave a partially advanced route.
- Preserve flag-off legacy behavior. Representative tests must prove an existing legacy decision path remains compatible while normalized routing is disabled.
- Test all seven shared families for direct-user activation, role-scoped zero fanout, exact metadata, deterministic key, retry/cardinality, atomic rollback, and no premature terminal outcome notification.
- Keep `APPROVAL_ROUTING_V1_ENABLED=false`. This checkpoint does not authorize normalized-routing activation or production promotion.

## Implementation and documentation impact

- Code / architecture: Replace the parallel next-step readiness writer inside `approveCurrentStepAndAdvance` with the shared helper and extend the helper with a closed, non-overriding optional routing-context contract if required.
- Data / schema: No migration, backfill, or historical notification rewrite is expected or authorized.
- Workflow / permissions: No approval route, threshold, status, assignee, permission, scope, prohibited-actor, or self-approval rule changes.
- UI / mobile: No visible action, state, label, navigation, or notification wording change is authorized by this record.
- Reporting: No report or metric change.
- Knowledge base / training: Dunong should assess impact after implementation. No user-facing update is expected if the flag stays disabled and wording/visible behavior remains unchanged.
- Tests / UAT: Add a seven-family direct/role matrix, exact metadata and event-key assertions, retry/cardinality and rollback cases, plus representative flag-off compatibility.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Converge the shared advance path on `recordApprovalStepReadyNotification` with closed non-overriding routing context | Backend Engineering + Architecture | Before next normalized-routing checkpoint | Implemented behind disabled routing flag |
| Prove direct-user one-row and role-scoped zero-row behavior across all seven shared families | QA + Database Engineering | Before checkpoint acceptance | PostgreSQL specifications implemented; local execution pending |
| Prove deterministic key, metadata preservation, retry/cardinality, rollback, and representative flag-off compatibility | QA + Security | Before checkpoint acceptance | Specifications implemented; non-PostgreSQL coverage passes and PostgreSQL execution remains pending |
| Independently review the implementation and activation posture | Architecture + Security + QA | After implementation evidence | Architecture GO and Security commit acceptance for feature-disabled checkpoint; activation NO-GO |
| Complete legacy initial procurement notification parity as a separate checkpoint | Product Governance + Engineering | Before normalized-routing activation | Pending; intentionally separate |

## Implemented checkpoint — 2026-07-23

- `approveCurrentStepAndAdvance` now delegates direct-user next-step delivery to `recordApprovalStepReadyNotification` for Purchase Request, Quotation Recommendation, Purchase Order, Purchase Order Balance Closure, Purchase Order Amendment, Wastage Report, and Stock Adjustment. The prior audit-ID event key is replaced by `approval:<instance>:step:<order>:ready`, and helper execution remains inside the same transaction as current-step approval, next-step activation, and activation audit.
- The helper accepts a closed optional `routingContext` containing only nullable `assignedRoleId`, `requiredPermissionCode`, `scopeType`, and `scopeId`. Core approval instance/step identity, order, assignment mode, recipient, entity, deep link, notification type, priority, and deterministic event key remain helper-owned and cannot be overridden by the extension object.
- Direct-user activation passes the exact prepared recipient and emits at most one personal row under the deterministic key. The helper is not called for role-scoped activation, preserving zero role-member fanout and live Approval Inbox discovery. The notification metadata includes approval instance ID, exact activated-step ID/order, `DIRECT_USER`, assigned user, assigned role value, permission code, and location-context scope.
- The seven-family PostgreSQL matrix asserts exact direct-user recipient/key/entity/deep-link/metadata and retry stability, plus zero step-ready rows for role-scoped activation. The Quotation Recommendation assertion was corrected to the authoritative related Purchase Request entity mapping rather than incorrectly treating the recommendation source ID as the notification entity.
- Additional PostgreSQL specifications cover representative flag-off Purchase Order compatibility, a same-step concurrent decision with one winner/one loser and exactly one readiness row, and atomic rollback when a runtime-permitted database notification write failure occurs. These new PostgreSQL specifications are **implemented but locally unexecuted** because `DISPOSABLE_DATABASE_ADMIN_URL` is unavailable; they are not production evidence.
- Local focused verification passes 112 tests, skips 95 PostgreSQL cases, and retains two existing policy TODOs. The unchanged-candidate root suite passes 1,233 web tests with 185 skipped and two TODOs across 117 passed/seven skipped files, 27 database-package tests with 18 skipped, and one worker test. Root typecheck, web lint, and the isolated-`NEXT_DIST_DIR` production build pass.
- The disposable PostgreSQL command fails only with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`. Final independent Architecture review reports no Critical/High finding and returns GO only for the feature-disabled source-control checkpoint. Security reports no Critical/High issue introduced by this change and keeps activation at NO-GO; it requires executable PostgreSQL before accepting this checkpoint as behavioral evidence. Broader prohibited-actor/live-revocation, legacy initial-notification parity, all-family parity, unresolved policy, cutover/drain, exact-candidate authorization/E2E, and hosted release/recovery gates remain open.
- Source-truth assessment found no visible behavior, approval policy, permission, action, status, label, or navigation change while normalized routing remains disabled. No knowledge-base, glossary, training, or user-facing release-note update is required for this checkpoint.

## Evidence

- The Decision Chair confirmed this conclusion on 2026-07-23 after independent architecture, workflow, correctness, and test-gap analysis. The independent positions agreed, so no targeted challenge round was required. Requested GPT-5.3 Codex Spark and `gpt-5.4` models were unavailable; the closest permitted GPT-5.6 specialist roles were used. Model fallback did not relax any hard gate.
- `docs/core/00-governance/decisions/DEC-0050-BOUNDED-DENIAL-AUDIT-AND-ROLE-SCOPED-APPROVAL-WORK.md` establishes idempotent direct-user notification and zero per-user role-scoped fanout for normalized approval work.
- `docs/core/00-governance/decisions/DEC-0051-CANONICAL-APPROVAL-DECISION-PARITY-AND-ATOMIC-SOURCE-EFFECTS.md` requires canonical step advancement, notifications, audit, and source effects to use one controlled transaction boundary.
- `apps/web/src/server/services/notifications.ts` implements the shared step-ready writer, deterministic `approval:<instance>:step:<order>:ready` event key, and closed optional routing-context metadata.
- `apps/web/src/server/services/approvals.ts` converges the seven-family `approveCurrentStepAndAdvance` path on that helper inside the canonical transaction and preserves zero role-scoped fanout.
- `apps/web/tests/approvalDecisionParity.integration.test.ts` and `apps/web/tests/helpers/approvalDecisionPgFixtures.ts` implement the seven-family direct/role, exact-metadata, retry, flag-off, concurrent-winner, runtime-permitted rollback, and authoritative Quotation/Purchase Request mapping specifications. Their PostgreSQL execution remains pending because the disposable-database administrator URL is unavailable.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` records legacy initial procurement role notifications and normalized notification/action parity as remaining activation gates.

## Supersession

This decision is not superseded. It applies the notification contract of `DEC-0050` to the seven-family shared current-step advance path without replacing broader approval-integrity, source-locking, prohibited-actor, legacy-notification, policy, or activation gates. A later decision that changes direct versus role-scoped recipient behavior, deterministic event-key semantics, metadata authority, transaction placement, or activation posture must explicitly amend or supersede this record.
