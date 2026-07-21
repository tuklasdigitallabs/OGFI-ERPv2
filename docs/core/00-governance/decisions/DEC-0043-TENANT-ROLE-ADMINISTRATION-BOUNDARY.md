# DEC-0043 — Tenant Role Administration Boundary

## Metadata

- Decision ID: `DEC-0043`
- Title: Tenant Role Administration Boundary
- Status: `Confirmed`
- Date: 2026-07-21
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — SPF-004 Core Administration authorization
- Related decision brief: Parent-confirmed SPF004 tenant role administration decision

## Decision

`UserRoleAssignment` remains tenant-global for the current implementation. Every direct role-administration surface requires the explicit tenant-level permission `core.tenant_role_administer`; `core.administer` or company `MANAGE` scope alone is not sufficient. The seeded `CONFIGURED_ADMIN` and `CONFIGURED_SUPER_USER` roles receive this permission.

For an action concerning a target user, the service must also prove that the target user has an active, currently effective membership in the operator's selected company. This company check limits who may be acted on from the current context; it does not make the resulting `UserRoleAssignment` company-bound. A company-bound role-assignment schema is deferred to a separate future decision.

## Context

The current `Role` is tenant-owned and `UserRoleAssignment` links a user to a role without a `company_id`. Existing Core Administration patterns relied on `core.administer` together with company `MANAGE` scope, although role catalog and assignment changes can affect authority across every company in the tenant. That mismatch lets a company-scoped administration capability appear to authorize a tenant-global mutation.

SPF-004 requires one explicit authorization contract for role overview and detail access, role creation, direct grants and deactivation, sensitive-role request and review, role-permission updates, and onboarding through `initialRoleId`. The selected design acknowledges the current data boundary, narrows the capability to an auditable tenant-level permission, and prevents administrators from using a selected company as a doorway to mutate users who are not effective members of that company.

## Options considered

### Option A — selected: retain tenant-global assignments with a dedicated tenant permission and target-company eligibility

- Summary: Keep the current tenant-level `Role` and `UserRoleAssignment` model. Require `core.tenant_role_administer` on every direct role-administration surface, and require active/effective selected-company membership for every target-user grant, deactivation, request, or review.
- Benefits: Aligns authorization with the current data model, removes reliance on incidental company `MANAGE` authority, supports consistent server-side enforcement, and avoids a rushed schema migration.
- Failure modes: A missed surface may continue to rely on `core.administer`; a target-membership check may accept expired, inactive, cross-tenant, or other-company scope; the UI may incorrectly describe a role as company-specific; or a configured tenant administrator may lose access if the permission is not seeded and migrated consistently.
- Why selected or rejected: Selected as the smallest coherent boundary that satisfies tenant isolation and server-enforced authorization without pretending that the current assignment carries company scope.

### Option B — rejected for now: make `UserRoleAssignment` company-bound immediately

- Summary: Add `company_id` or an equivalent binding to each role assignment and migrate existing grants.
- Benefits: Could represent different roles for the same user by company and make company administration semantics explicit.
- Failure modes: Existing assignment meaning and effective-permission resolution become ambiguous; migration and backfill need ownership rules; uniqueness, sensitive-role review, onboarding, session invalidation, reporting, and every permission query would need coordinated change; incorrect backfill could remove or broaden authority.
- Why selected or rejected: Rejected for this slice because the necessary business policy, migration rules, and full authorization impact have not been decided. It remains a future material decision.

### Option C — rejected: continue using `core.administer` plus selected-company `MANAGE`

- Summary: Treat company administration authority as sufficient for tenant-global role catalog and assignment actions.
- Benefits: Reuses the existing permission and scope guard with no new permission.
- Failure modes: A company-scoped administrator could mutate tenant-global authority, role overview and permission editing would have no honest company boundary, and behavior could differ across entry points.
- Why selected or rejected: Rejected because it fails least privilege and does not align the authorization boundary with the persisted assignment boundary.

### Option D — rejected: defer role administration

- Summary: Keep role surfaces unavailable until a company-bound schema is designed.
- Benefits: Avoids interim semantics.
- Failure modes: Blocks required administration and SPF-004 coverage even though a safe tenant-level boundary is available.
- Why selected or rejected: Rejected because the dedicated permission and target-company guard provide a controlled, reversible interim model.

## Hard-gate assessment

- **Tenant isolation:** Roles, permissions, target users, requests, assignments, and operator authority must resolve within the authenticated tenant. `core.tenant_role_administer` never authorizes cross-tenant access.
- **Company and target eligibility:** Target-user actions require an active user and at least one active, currently effective `COMPANY` assignment for the selected company or `LOCATION` assignment to an active location in that company. Default-company metadata alone is not membership. This check does not scope the tenant-global role grant.
- **Server-enforced authorization:** Overview, detail, creation, grant/deactivation, sensitive request/review, role-permission update, and onboarding `initialRoleId` paths must enforce the new permission in the service or data-access boundary. UI hiding is supplementary only.
- **Segregation and sensitive access:** Existing direct-assignability classification, sensitive-role request/reviewer separation, self-mutation prohibitions, MFA guards, reason/evidence rules, audit, privilege-epoch refresh, and session invalidation remain mandatory.
- **Audit and non-destructive history:** Role grants, permission changes, reviews, and deactivation remain auditable. Assignments are deactivated rather than deleted.
- **Phase and architecture fit:** This changes the Core Administration authorization contract only. It does not introduce a second role engine or broaden financial, approval, inventory, or company-data access.
- **Recovery and rollback:** The permission grant can be revoked and the application guards reverted without migrating assignment data. A later company-bound design requires its own migration, backfill, rollback, and superseding decision.

## Required safeguards

- Define `core.tenant_role_administer` once in the shared permission catalog and database permission registry.
- Grant it by default only to the tenant-global configured administrator roles `CONFIGURED_ADMIN` and `CONFIGURED_SUPER_USER`; other roles require an explicit controlled permission change.
- Treat `core.administer`, company `MANAGE`, selected-company context, and target-company membership as insufficient substitutes for the new permission.
- Apply the permission guard to role overview and details, create role, direct role assignment and deactivation, sensitive-role request and review, role-permission update, and user onboarding whenever `initialRoleId` is present.
- For target-user actions, validate the target user's tenant, active account status, and current selected-company membership using effective dates and active scope/location records. Return a non-enumerating denial when the target is outside that boundary.
- Onboarding with `initialRoleId` must establish the new user's selected-company membership in the same transaction before or together with the role assignment; a role-only user must not be created through this path.
- Preserve all existing role sensitivity, approval-rule-use, no-self-action, MFA, audit, session invalidation, and transactional safeguards.
- Add the role-administration surfaces to the DEC-0041 executable authorization manifest as high-risk boundaries, with cross-tenant, missing-permission, expired/inactive membership, other-company, direct-route, and denied-write no-mutation cases.
- Do not label tenant-global role assignments as company-specific in the UI, API, exports, or documentation.

## Implementation and documentation impact

- Code / architecture: Introduce one reusable tenant-role-administration guard and apply it to every listed service, page, action, and direct route. Continue resolving effective role permissions tenant-wide.
- Data / schema: Add the permission registry/seed change only. `UserRoleAssignment` receives no `company_id`; no role-assignment migration or backfill is authorized.
- Workflow / permissions: `core.tenant_role_administer` replaces `core.administer` plus company `MANAGE` as the capability gate for direct role administration. Selected-company membership remains an additional target eligibility check where a target user exists.
- UI / mobile: Role administration must be hidden or denied without the new permission. Selected-company context must not imply that the role grant is company-bound.
- Reporting: No report definition change. Any role-administration export is governed by the same tenant permission and target eligibility rules.
- Knowledge base / training: Dunong must assess the administration guide and glossary after implementation and UI labels are stable, especially the distinction between tenant-global role authority and selected-company target eligibility.
- Tests / UAT: Verify every listed surface, both configured administrator roles, missing-permission denial despite company `MANAGE`, inactive/expired/other-company target denial, onboarding transaction behavior, cross-tenant denial, sensitive-role separation/MFA, audit/session invalidation, and denied-write no mutation.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement and reuse the tenant-role-administration permission guard across every listed surface | Engineering | SPF-004 implementation | Pending |
| Seed/migrate `core.tenant_role_administer` to `CONFIGURED_ADMIN` and `CONFIGURED_SUPER_USER` and verify existing-tenant upgrade behavior | Database + Engineering | Before SPF-004 verification | Pending |
| Add DEC-0041 manifest entries and database/service/route negative tests for the new boundary | Engineering + QA + Security | Before SPF-004 closure | Pending |
| Verify administrator labels, denial states, and selected-company wording, then prepare user-facing guidance | Dunong + QA | After implementation behavior is stable | Pending |
| Deliberate company-bound role assignments, ownership, migration, and backfill only if multi-company role differentiation is required | Decision Chair + Product + Security + Architecture + Database | Future policy trigger | Deferred future decision |

## Evidence

- Parent Decision Chair confirmation dated 2026-07-21: retain tenant-global `UserRoleAssignment`; require `core.tenant_role_administer` for all direct role-administration surfaces; require active/effective selected-company membership for target-user actions; seed configured administrator and super-user roles; defer company-bound assignments.
- `docs/core/00-governance/decisions/DEC-0002-constrained-user-role-assignment.md` — existing direct-assignment classification, audit, and non-destructive safeguards; its older `core.administer` plus company `MANAGE` authorization boundary is superseded by this record.
- `docs/core/00-governance/decisions/DEC-0041-RISK-BASED-EXECUTABLE-AUTHORIZATION-MATRIX.md` — classifies user/role administration as high risk and requires real database/service/route denial and no-mutation evidence.
- `docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md` — least privilege, additive permissions with enforced scope, sensitive-role request controls, audit, and session invalidation requirements.
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md` — server-side authorization, tenant/scope isolation, MFA, session invalidation, and sensitive grant separation.
- `docs/core/03-data/ERP_DATA_DICTIONARY.md` — current tenant-owned `Role`, unscoped `UserRoleAssignment`, effective-dated `UserScopeAssignment`, and company-context `SensitiveRoleRequest` representations.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` — SPF-004 remains pending full authorization regression evidence.
- Current implementation references reviewed for impact: `packages/database/prisma/schema.prisma`, `apps/web/src/server/services/coreAdmin.ts`, `apps/web/src/server/services/rolePermissionCatalog.ts`, and `packages/database/prisma/migrations/20260721160000_tenant_role_administration_permission/migration.sql`.

## Supersession

This decision supersedes only the role-administration capability and company-scope statements in DEC-0002 that required `core.administer` plus company `MANAGE`. DEC-0002's direct-assignability, sensitive-role, audit, non-destructive deactivation, and related safeguards remain in force.

A later decision may make role assignments company-bound only if it explicitly supersedes DEC-0043 and defines role ownership, assignment uniqueness, existing-data backfill, effective-permission resolution, sensitive-role request behavior, onboarding behavior, session invalidation, audit history, rollback, and cross-company tests.
