# Decision Record

## Metadata

- Decision ID: `DEC-0002`
- Title: Constrained user role assignment follows verified scope assignment
- Status: `Confirmed`
- Date: 2026-06-26
- Decision owner: OGFI ERP product owner
- Decision Chair: Codex
- Related phase/module: Phase I / Core Administration / Security and access control
- Related decision brief: Writable role assignment after verified scope mutation controls

## Decision

Core Administration may add a constrained user role assignment create/deactivate path only for explicitly allowlisted non-sensitive roles. The first implementation allows the seeded `CONFIGURED_REQUESTER` role only. Admin, approver, approval-rule, inventory-posting, export, payment, and other sensitive roles remain blocked until a separate policy decision defines second approval, role classification, and recovery requirements.

## Context

`DEC-0001` selected location-scope assignment as the first writable Core Administration mutation. That path is now covered by service-layer authorization, self-mutation blocking, duplicate blocking, non-destructive deactivation, same-transaction audit, and E2E validation. Phase I setup also needs controlled role assignment, but role changes can alter approval, inventory, export, and administrative authority.

## Options considered

### Option A — selected

- Summary: Allow assignment/deactivation only for explicitly allowlisted non-sensitive existing roles.
- Benefits: Enables basic user onboarding while preserving approval and admin controls.
- Failure modes: Allowlist grows without review, stale sessions retain old authority, or a role later receives sensitive permissions.
- Why selected: It is the smallest useful next mutation and can be reversed without changing role or permission definitions.

### Option B — rejected

- Summary: Allow admins to assign any existing active role.
- Benefits: Fastest admin setup.
- Failure modes: Accidental approval authority, self-escalation, weak segregation of duties, export exposure, and inventory-control bypass.
- Why rejected: Broad role assignment crosses security and approval hard gates.

### Option C — rejected for now

- Summary: Defer all role assignment and continue only read-only administration.
- Benefits: Lowest authority risk.
- Failure modes: Delays validation of user onboarding and prevents controlled requester setup.
- Why rejected: A narrow allowlisted role path can proceed safely.

## Hard-gate assessment

- Tenant isolation: Target user and role must resolve server-side within the acting session tenant.
- Server-side authorization: Actor must have `core.administer` and active company `MANAGE` scope.
- Approval segregation: Self role mutation is blocked; approval/admin roles are not assignable in this slice.
- Audit history: Create/deactivate writes append-only `AuditEvent` in the same transaction.
- No destructive deletion: Deactivation sets `status = INACTIVE` and `endsAt`.
- Phase scope discipline: No role creation, permission editing, approval-rule editing, inventory, receiving, or purchasing expansion is included.
- Recovery: Incorrect non-sensitive grants can be deactivated while preserving history.

## Required safeguards

- Reason is required for create and deactivate.
- Duplicate active role assignment is blocked.
- Only explicitly allowlisted non-sensitive role codes are assignable.
- Roles used by active approval-rule steps are blocked from mutation.
- Sensitive roles remain blocked even if a direct server-action request is crafted.
- Audit metadata records the role code and evaluated permission codes.

## Implementation and documentation impact

- Code / architecture: Add controlled service actions for role assignment create/deactivate.
- Data / schema: No schema change; uses existing `UserRoleAssignment` and `AuditEvent`.
- Workflow / permissions: Requires `core.administer` plus company `MANAGE` scope.
- UI / mobile: User Access page exposes role controls only for non-self users and non-sensitive roles.
- Knowledge base / training: Future admin guide should explain why sensitive role grants are blocked pending policy.
- Tests / UAT: Validate self-mutation block, duplicate block, sensitive-role block, and E2E role create/deactivate audit visibility.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Define formal role sensitivity classification and grant workflow | OGFI Management + IT | Before writable approver/admin role assignment | Open |
| Decide whether sensitive role grants require second approval or break-glass review | OGFI Management + IT | Before production auth/UAT | Open |
| Define session refresh/revalidation behavior after role changes | IT + Engineering | Before production auth | Open |
| Add DB-backed integration tests for cross-tenant role IDOR denial and transactional audit rollback | Engineering | Before production auth/UAT | Open |

## Evidence

- `DEC-0001-first-admin-mutation-user-scope-assignment.md`
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md`
- `docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md`
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- Council first-round positions from Amihan, Dalisay, Hiraya, and Luningning on 2026-06-26.
- Challenge-round positions from Hiraya and Luningning requiring an explicit non-sensitive allowlist.
- Implementation references:
  - `apps/web/src/server/services/coreAdmin.ts`
  - `apps/web/src/app/(app)/admin/users/[id]/page.tsx`
  - `apps/web/tests/purchaseRequests.test.ts`
  - `tests/e2e/first-milestone.spec.ts`

## Supersession

Not superseded.
