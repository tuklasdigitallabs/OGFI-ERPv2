# Decision Record

## Metadata

- Decision ID: `DEC-0001`
- Title: First writable Core Administration mutation is user scope assignment
- Status: `Confirmed`
- Date: 2026-06-26
- Decision owner: OGFI ERP product owner
- Decision Chair: Codex
- Related phase/module: Phase I / Core Administration / Security and access control
- Related decision brief: First admin mutation after read-only Core Administration foundation

## Decision

The first writable Core Administration mutation is user location-scope assignment create/deactivate. Role assignment and approval-rule editing remain deferred until the scope mutation path proves server-side isolation, append-only audit, non-destructive deactivation, and recovery behavior.

## Context

The application now has read-only Core Administration visibility for users, roles, permissions, companies, locations, approval rules, and audit events. Phase I needs controlled administration, but the first write must not weaken approval authority, inventory controls, or branch isolation. The documented model states that roles define capability and scope assignments define where that capability applies.

## Options considered

### Option A — selected

- Summary: Allow admins to create/deactivate user location-scope assignments first.
- Benefits: Proves branch/location isolation, uses existing `UserScopeAssignment`, avoids changing functional authority, and is reversible through deactivation.
- Failure modes: Cross-company scope grant, duplicate active scope, self-expansion, stale sessions, or missing audit evidence.
- Why selected: It is the smallest useful writable admin control that advances Phase I access integrity without changing roles or approval rules.

### Option B — rejected for now

- Summary: User role assignment create/deactivate first.
- Benefits: Enables broader admin setup.
- Failure modes: Accidentally grants approval, export, inventory, or admin authority before scope boundaries are proven.
- Why rejected: Higher authority impact than scope assignment; should follow after scope mutation guardrails are stable.

### Option C — rejected for now

- Summary: Approval rule activation or step editing first.
- Benefits: Moves approval configuration closer to production readiness.
- Failure modes: Incorrect approvers, weakened segregation of duties, disrupted in-flight approvals, and monetary approval exposure.
- Why rejected: Requires versioning, simulation, effective-date rules, and policy confirmation before safe editing.

### Option D — rejected for now

- Summary: Defer admin mutations and continue only read-only/master-data scaffolding.
- Benefits: Lowest immediate risk.
- Failure modes: Delays validation of the service-layer authorization and audit pattern.
- Why rejected: Scope assignment can proceed safely with strict safeguards and gives needed access-control evidence.

## Hard-gate assessment

- Tenant/company/location isolation: Target user and target location must be resolved server-side within the acting session tenant and company.
- Server-side authorization: Actor must have `core.administer` and active company `MANAGE` scope.
- No silent permission changes: Scope mutation does not create, edit, or remove roles or permissions.
- Audit history: Create/deactivate writes append-only `AuditEvent` in the same transaction.
- No destructive deletion: Deactivation sets `status = INACTIVE` and `endsAt`.
- Transaction consistency: Scope mutation and audit event are committed together.
- Phase scope discipline: Limited to Phase I Core Administration.
- Recovery: Incorrect grants can be deactivated while preserving history.

## Required safeguards

- Reason is required for create and deactivate.
- Self-scope mutation is blocked.
- Duplicate active location-scope assignment is blocked.
- Scope assignment supports only `LOCATION` for the first mutation path.
- Target scope IDs are never trusted without database validation.
- Deactivation requires the active assignment ID, target user ID, and server-side tenant/company validation.
- No role assignment, permission editing, or approval-rule editing occurs as a side effect.

## Implementation and documentation impact

- Code / architecture: Add controlled service actions for location-scope create/deactivate.
- Data / schema: No schema change; uses existing `UserScopeAssignment` and `AuditEvent`.
- Workflow / permissions: Admin mutation requires `core.administer` plus company `MANAGE` scope.
- UI / mobile: User Access page exposes mutation controls only for non-self users.
- Reporting: No reporting impact.
- Knowledge base / training: Future admin guide should explain role versus scope and reason requirements.
- Tests / UAT: Validate self-mutation block, duplicate block, read-only user inspection, and full PR/admin flow.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Add DB-backed integration tests for scope create/deactivate with cross-tenant and cross-company denial | Engineering | Before production auth/UAT | Open |
| Define session refresh/revalidation behavior after scope changes | IT + Engineering | Before production auth | Open |
| Decide whether high-risk scope changes need second approval | OGFI Management + IT | Before production go-live | Open |
| Implement constrained non-sensitive role assignment mutation only after scope mutation controls are verified | Engineering | After scope UAT | Closed by `DEC-0002` |

## Evidence

- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md`
- `docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md`
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- Council first-round positions from Amihan, Dalisay, Hiraya, and Luningning on 2026-06-26.
- Implementation references:
  - `apps/web/src/server/services/coreAdmin.ts`
  - `apps/web/src/app/(app)/admin/users/[id]/page.tsx`
  - `apps/web/tests/purchaseRequests.test.ts`
  - `tests/e2e/first-milestone.spec.ts`

## Supersession

Not superseded.
