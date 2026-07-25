import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertDirectRoleAssignmentAllowed,
  assertDirectLocationScopeAssignmentAllowed,
  assertRequiresControlledLocationScopeRequest,
  getLocationScopeRiskLabel,
  isDirectlyAssignableLocationScope,
  isDirectlyAssignableRole
} from "./coreAdmin";

const nonSensitiveRole = {
  code: "BRANCH_REQUESTER",
  systemRole: false,
  permissions: [
    {
      permission: {
        code: "purchasing.purchase_request.create"
      }
    }
  ]
};

const sensitiveRole = {
  code: "OPS_APPROVER",
  systemRole: false,
  permissions: [
    {
      permission: {
        code: "purchasing.purchase_request.approve"
      }
    }
  ]
};

const systemRole = {
  code: "CONFIGURED_ADMIN",
  systemRole: true,
  permissions: [
    {
      permission: {
        code: "core.administer"
      }
    }
  ]
};

describe("core administration audit search wiring", () => {
  test("users registry uses a bounded server-owned page contract and explicit denial boundary", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const adminPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/page.tsx"),
      "utf8"
    );
    expect(serviceSource).toContain("coreAdminUserPageInputSchema");
    expect(serviceSource).toContain("listCoreAdminUserPageAuthorized");
    expect(serviceSource).toContain('orderBy: [{ displayName: "asc" }, { id: "asc" }]');
    expect(serviceSource).toContain("skip: (values.page - 1) * values.pageSize");
    expect(serviceSource).toContain("take: values.pageSize");
    expect(adminPageSource).toContain("permissions.tenantRoleAdminister");
    expect(adminPageSource).toContain("No users, roles, scope, or audit records were loaded.");
    expect(adminPageSource).toContain("Selected-company Manage scope is required");
    expect(adminPageSource).toContain("<PaginationBar");
    expect(adminPageSource).toContain('name="userQuery"');
    expect(adminPageSource).toContain('name="userStatus"');
  });

  test("Core Administration uses an active-tab read profile and compact URL-backed tabs", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const adminPageSource = readFileSync(path.resolve(__dirname, "../../app/(app)/admin/page.tsx"), "utf8");
    expect(serviceSource).toContain("CoreAdminOverviewTab");
    expect(serviceSource).toContain("activeTab === \"users\"");
    expect(serviceSource).toContain("activeTab === \"roles\"");
    expect(serviceSource).toContain("activeTab === \"organization\"");
    expect(serviceSource).toContain("activeTab === \"approval-rules\"");
    expect(serviceSource).toContain("recentAuditEvents: []");
    expect(adminPageSource).toContain("<WorkspaceTabs");
    expect(adminPageSource).toContain("Only the selected workspace register and its required option catalogs are loaded");
    expect(serviceSource).toContain("CoreAdminOrganizationSection");
    expect(serviceSource).toContain("organizationSection === \"brands\"");
    expect(serviceSource).toContain("organizationSection === \"locations\"");
    expect(adminPageSource).toContain("organizationSection");
    expect(adminPageSource).toContain("Companies / Summary");
    expect(adminPageSource).toContain("label: \"Departments\"");
    expect(adminPageSource).not.toContain("const workspaces = [");
  });

  test("administration reads enforce company authority and non-enumerating target checks", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const companyCreationSource = serviceSource.slice(
      serviceSource.indexOf("export async function createCoreAdminCompany"),
      serviceSource.indexOf("export async function createCoreAdminBrand"),
    );
    const overviewSource = serviceSource.slice(
      serviceSource.indexOf("export async function getCoreAdminOverview"),
      serviceSource.indexOf("export async function createCoreAdminUser"),
    );
    const userDetailSource = serviceSource.slice(
      serviceSource.indexOf("export async function getCoreAdminUserDetail"),
      serviceSource.indexOf("export async function createUserRoleAssignment"),
    );

    expect(companyCreationSource).toContain("assertCanAdministerTenantRoles(session)");
    expect(overviewSource).toContain(
      "assertCanManageCompanyScope(session, session.context.companyId)",
    );
    expect(overviewSource).not.toContain("activeTab === \"audit\" ? prisma.auditEvent.findMany");
    expect(userDetailSource).toContain("assertTargetUserInCurrentCompany(session, userId)");
    expect(userDetailSource).toContain(
      "assertCanManageCompanyScope(session, session.context.companyId)",
    );
    expect(userDetailSource).toContain('error.message === "TARGET_USER_NOT_FOUND"');
    expect(userDetailSource).not.toContain("scopeAssignments:");
    expect(userDetailSource).toContain("scopes: []");
    expect(readFileSync(path.resolve(__dirname, "../../app/(app)/admin/page.tsx"), "utf8")).toContain(
      "assertCanManageCompanyScope(session, session.context.companyId)",
    );
    expect(
      readFileSync(path.resolve(__dirname, "../../app/(app)/admin/users/[id]/page.tsx"), "utf8"),
    ).toContain("No user, role, scope, or access-history data was loaded.");
    expect(serviceSource).toContain(
      "await assertCanManageCompanyScope(session, session.context.companyId);",
    );
  });

  test("role library uses a bounded server-owned page and role-detail company guard", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const adminPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/page.tsx"),
      "utf8",
    );
    const roleDetailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/roles/[id]/page.tsx"),
      "utf8",
    );
    expect(serviceSource).toContain("coreAdminRolePageInputSchema");
    expect(serviceSource).toContain("listCoreAdminRolePageAuthorized");
    expect(serviceSource).toContain('orderBy: [{ name: "asc" }, { id: "asc" }]');
    expect(serviceSource).toContain("skip: (values.page - 1) * values.pageSize");
    expect(serviceSource).toContain("permissionPreview");
    expect(serviceSource).toContain("listCoreAdminRoleOptionsAuthorized");
    expect(adminPageSource).toContain('name="roleQuery"');
    expect(adminPageSource).toContain('name="roleStatus"');
    expect(adminPageSource).toContain("overview.rolePage");
    expect(adminPageSource).toContain("<PaginationBar");
    expect(roleDetailPageSource).toContain(
      "assertCanManageCompanyScope(session, session.context.companyId)",
    );
    expect(roleDetailPageSource).toContain("No role or permission data");
  });

  test("privilege mutation users use the same canonical order as approval user locks", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const lockSource = serviceSource.slice(
      serviceSource.indexOf("function canonicalizePrivilegeMutationUserIds"),
      serviceSource.indexOf("export function assertNotSelfScopeMutation")
    );
    const mutationSource = serviceSource.slice(
      serviceSource.indexOf("async function updateRolePermissionCodes"),
      serviceSource.indexOf("export async function updateRolePermissions")
    );
    expect(lockSource).toContain(
      "return Array.from(new Set(userIds)).sort();"
    );
    expect(lockSource).toContain("lockUsersForPrivilegeMutation(");
    expect(lockSource).toContain("for (const userId of canonicalUserIds)");
    expect(lockSource).toContain('FROM "User"');
    expect(lockSource).toContain("FOR UPDATE");
    expect(lockSource).toContain("lockAndRevalidateRolePermissionActor(");
    expect(lockSource).toContain('FROM "AuthSession"');
    expect(lockSource).toContain("FOR SHARE");
    expect(mutationSource).toContain('orderBy: { userId: "asc" }');
    expect(mutationSource).toContain("[session.user.id, ...affectedUserIds]");
    expect(mutationSource).toContain("for (const userId of affectedUserIds)");
  });

  test("role-permission authority is revalidated after role and canonical user locks", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const mutationSource = serviceSource.slice(
      serviceSource.indexOf("async function updateRolePermissionCodes"),
      serviceSource.indexOf("export async function updateRolePermissions")
    );
    const roleLockIndex = mutationSource.indexOf('FROM "Role"');
    const userLockIndex = mutationSource.indexOf("lockUsersForPrivilegeMutation(");
    const authorityIndex = mutationSource.indexOf(
      "lockAndRevalidateRolePermissionActor("
    );
    const permissionDeleteIndex = mutationSource.indexOf(
      "tx.rolePermission.deleteMany"
    );

    expect(roleLockIndex).toBeGreaterThan(-1);
    expect(userLockIndex).toBeGreaterThan(roleLockIndex);
    expect(authorityIndex).toBeGreaterThan(userLockIndex);
    expect(permissionDeleteIndex).toBeGreaterThan(authorityIndex);
    expect(serviceSource).toContain('throw new Error("ROLE_PERMISSION_AUTHORITY_STALE")');
    expect(serviceSource).toContain("permissions.coreAdminister");
    expect(serviceSource).toContain("permissions.tenantRoleAdminister");
    expect(serviceSource).toContain('scopeType: "COMPANY"');
    expect(serviceSource).toContain('accessLevel: "MANAGE"');
    expect(serviceSource).toContain("assertPrivilegedMfaForAction(");
  });

  test("role-permission transaction conflicts are mapped without broad retries", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const mutationSource = serviceSource.slice(
      serviceSource.indexOf("async function updateRolePermissionCodes"),
      serviceSource.indexOf("export async function updateRolePermissions")
    );
    expect(mutationSource).toContain("isRolePermissionTransactionConflict(error)");
    expect(mutationSource).toContain('throw new Error("ROLE_PERMISSION_CONCURRENT_CHANGE")');
    expect(mutationSource).not.toMatch(/retry|setTimeout/i);
    expect(serviceSource).toContain('candidate.code === "P2034"');
    expect(serviceSource).toContain('candidate.code === "40P01"');
    expect(serviceSource).toContain('candidate.code === "40001"');
    expect(serviceSource).toContain('candidate.meta?.code === "40P01"');
    expect(serviceSource).toContain('candidate.meta?.code === "40001"');
  });

  test("company creation invalidates the actor session after granting manage scope", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const companyCreationSource = serviceSource.slice(
      serviceSource.indexOf("export async function createCoreAdminCompany"),
      serviceSource.indexOf("export async function createCoreAdminBrand")
    );
    const scopeGrantIndex = companyCreationSource.indexOf("tx.userScopeAssignment.create");
    const epochIndex = companyCreationSource.indexOf("touchUserPrivilegeEpoch(tx, session.user.id");
    const auditIndex = companyCreationSource.indexOf("tx.auditEvent.create");

    expect(scopeGrantIndex).toBeGreaterThan(-1);
    expect(epochIndex).toBeGreaterThan(scopeGrantIndex);
    expect(auditIndex).toBeGreaterThan(epochIndex);
    expect(companyCreationSource).toContain("companyId: company.id");
    expect(companyCreationSource).toContain('sourceEventType: "user_scope_assignment.created"');
    expect(companyCreationSource).toContain("sourceRecordId: scopeAssignment.id");
  });

  test("sensitive and system roles are blocked by service-layer assignment guard", () => {
    expect(isDirectlyAssignableRole(nonSensitiveRole)).toBe(true);
    expect(isDirectlyAssignableRole(sensitiveRole)).toBe(false);
    expect(isDirectlyAssignableRole(systemRole)).toBe(false);

    expect(() => assertDirectRoleAssignmentAllowed(nonSensitiveRole)).not.toThrow();
    expect(() => assertDirectRoleAssignmentAllowed(sensitiveRole)).toThrow(
      "SENSITIVE_ROLE_ASSIGNMENT_BLOCKED"
    );
    expect(() => assertDirectRoleAssignmentAllowed(systemRole)).toThrow(
      "SENSITIVE_ROLE_ASSIGNMENT_BLOCKED"
    );
  });

  test("high-risk location scopes are blocked from direct quick assignment", () => {
    expect(
      isDirectlyAssignableLocationScope({
        locationType: "BRANCH",
        accessLevel: "VIEW"
      })
    ).toBe(true);
    expect(
      isDirectlyAssignableLocationScope({
        locationType: "BRANCH",
        accessLevel: "MANAGE"
      })
    ).toBe(false);
    expect(
      isDirectlyAssignableLocationScope({
        locationType: "WAREHOUSE",
        accessLevel: "VIEW"
      })
    ).toBe(false);
    expect(getLocationScopeRiskLabel({ locationType: "HEAD_OFFICE" })).toBe(
      "High-risk location requires controlled approval"
    );

    expect(() =>
      assertDirectLocationScopeAssignmentAllowed({
        locationType: "COMMISSARY",
        accessLevel: "OPERATE"
      })
    ).toThrow("HIGH_RISK_SCOPE_ASSIGNMENT_BLOCKED");
    expect(() =>
      assertRequiresControlledLocationScopeRequest({
        locationType: "COMMISSARY",
        accessLevel: "OPERATE"
      })
    ).not.toThrow();
    expect(() =>
      assertRequiresControlledLocationScopeRequest({
        locationType: "BRANCH",
        accessLevel: "VIEW"
      })
    ).toThrow("LOW_RISK_SCOPE_USE_QUICK_ASSIGNMENT");
  });

  test("role grant paths enforce direct assignability while revocation remains available", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const deactivationSource = serviceSource.slice(
      serviceSource.indexOf("export async function deactivateUserRoleAssignment"),
      serviceSource.indexOf("export async function requestSensitiveUserRole"),
    );

    expect(serviceSource).toContain("if (initialRole) {\n    assertDirectRoleAssignmentAllowed(initialRole);");
    expect(serviceSource).toContain("assertDirectRoleAssignmentAllowed(role);");
    expect(deactivationSource).not.toContain("assertDirectRoleAssignmentAllowed");
    expect(deactivationSource).toContain("controlledRevocation: true");
    expect(serviceSource).toContain(".filter((role) => isDirectlyAssignableRole(role))");
    expect(serviceSource).toContain("createCoreAdminUser");
    expect(serviceSource).toContain("createUserRoleAssignment");
    expect(serviceSource).toContain("deactivateUserRoleAssignment");
  });

  test("location scope mutation paths enforce direct assignability in the service layer", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/users/[id]/page.tsx"),
      "utf8"
    );
    const feedbackSource = readFileSync(path.resolve(__dirname, "actionFeedback.ts"), "utf8");

    expect(serviceSource).toContain("highRiskLocationTypes");
    expect(serviceSource).toContain("assertDirectLocationScopeAssignmentAllowed");
    expect(serviceSource).toContain("directScopeAssignment");
    expect(serviceSource).toContain("directScopeDeactivation");
    expect(detailPageSource).toContain("location.directAssignable");
    expect(detailPageSource).toContain("scope.canMutate");
    expect(detailPageSource).toContain("Manage-level scope requires controlled approval");
    expect(feedbackSource).toContain("HIGH_RISK_SCOPE_ASSIGNMENT_BLOCKED");
  });

  test("controlled high-risk scope request workflow preserves approval artifact controls", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/users/[id]/page.tsx"),
      "utf8"
    );
    const schemaSource = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
      "utf8"
    );
    const migrationSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260707143000_high_risk_scope_requests/migration.sql"
      ),
      "utf8"
    );
    const feedbackSource = readFileSync(path.resolve(__dirname, "actionFeedback.ts"), "utf8");

    expect(schemaSource).toContain("model HighRiskScopeRequest");
    expect(migrationSource).toContain('CREATE TABLE "HighRiskScopeRequest"');
    expect(serviceSource).toContain("requestHighRiskUserLocationScope");
    expect(serviceSource).toContain("approveHighRiskUserLocationScopeRequest");
    expect(serviceSource).toContain("rejectHighRiskUserLocationScopeRequest");
    expect(serviceSource).toContain("assertRequiresControlledLocationScopeRequest");
    expect(serviceSource).toContain("DUPLICATE_PENDING_HIGH_RISK_SCOPE_REQUEST");
    expect(serviceSource).toContain("SELF_SCOPE_APPROVAL_BLOCKED");
    expect(serviceSource).toContain('eventType: "high_risk_scope_request.created"');
    expect(serviceSource).toContain('eventType: "high_risk_scope_request.approved"');
    expect(serviceSource).toContain('eventType: "high_risk_scope_request.rejected"');
    expect(serviceSource).toContain("controlledScopeAssignment");
    expect(serviceSource).toContain("sourceDecisionId: \"DEC-0036\"");
    expect(serviceSource).toContain("await touchUserPrivilegeEpoch(tx, targetUser.id)");
    expect(detailPageSource).toContain("Controlled Scope Requests");
    expect(detailPageSource).toContain("Request Controlled Scope");
    expect(detailPageSource).toContain("approveHighRiskScopeRequest");
    expect(detailPageSource).toContain("rejectHighRiskScopeRequest");
    expect(feedbackSource).toContain("LOW_RISK_SCOPE_USE_QUICK_ASSIGNMENT");
    expect(feedbackSource).toContain("DUPLICATE_PENDING_HIGH_RISK_SCOPE_REQUEST");
    expect(feedbackSource).toContain("HIGH_RISK_SCOPE_REQUEST_NOT_FOUND");
    expect(feedbackSource).toContain("SELF_SCOPE_APPROVAL_BLOCKED");
  });

  test("controlled sensitive role request workflow preserves dual approval controls", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/users/[id]/page.tsx"),
      "utf8"
    );
    const schemaSource = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
      "utf8"
    );
    const migrationSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260707203000_sensitive_role_requests/migration.sql"
      ),
      "utf8"
    );
    const feedbackSource = readFileSync(path.resolve(__dirname, "actionFeedback.ts"), "utf8");

    expect(schemaSource).toContain("model SensitiveRoleRequest");
    expect(migrationSource).toContain('CREATE TABLE "SensitiveRoleRequest"');
    expect(serviceSource).toContain("requestSensitiveUserRole");
    expect(serviceSource).toContain("approveSensitiveUserRoleRequest");
    expect(serviceSource).toContain("rejectSensitiveUserRoleRequest");
    expect(serviceSource).toContain("sensitive_role_request.create");
    expect(serviceSource).toContain("sensitive_role_request.approve");
    expect(serviceSource).toContain("sensitive_role_request.reject");
    expect(serviceSource).toContain("DUPLICATE_PENDING_SENSITIVE_ROLE_REQUEST");
    expect(serviceSource).toContain("SELF_ROLE_APPROVAL_BLOCKED");
    expect(serviceSource).toContain("controlledSensitiveRoleAssignment");
    expect(serviceSource).toContain("Sensitive role assignment approved; invalidate active sessions.");
    expect(serviceSource).toContain("assertPrivilegedMfaForAction(session");
    expect(detailPageSource).toContain("Controlled Role Requests");
    expect(detailPageSource).toContain("Request Controlled Role");
    expect(detailPageSource).toContain("approveSensitiveRoleRequest");
    expect(detailPageSource).toContain("rejectSensitiveRoleRequest");
    expect(feedbackSource).toContain("LOW_RISK_ROLE_USE_QUICK_ASSIGNMENT");
    expect(feedbackSource).toContain("DUPLICATE_PENDING_SENSITIVE_ROLE_REQUEST");
    expect(feedbackSource).toContain("SENSITIVE_ROLE_REQUEST_NOT_FOUND");
    expect(feedbackSource).toContain("SELF_ROLE_APPROVAL_BLOCKED");
  });

  test("admin audit panel uses searchable audit filters and filtered export", () => {
    const adminPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/page.tsx"),
      "utf8"
    );
    const exportRouteSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/audit/export/route.ts"),
      "utf8"
    );
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");

    expect(adminPageSource).toContain("listCoreAdminAuditEventPage(session");
    expect(adminPageSource).toContain("const auditExportHref = `/admin/audit/export");
    for (const fieldName of [
      "eventType",
      "entityType",
      "entityId",
      "actor",
      "requestId",
      "occurredFrom",
      "occurredTo"
    ]) {
      expect(adminPageSource, `${fieldName} admin filter`).toContain(
        `name="${fieldName}"`
      );
      expect(exportRouteSource, `${fieldName} export filter`).toContain(
        `filters.${fieldName} = ${fieldName};`
      );
      expect(serviceSource, `${fieldName} service filter`).toContain(`${fieldName}?:`);
    }
  });

  test("audit service uses bounded keyset pages and a shared redacted projection", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    expect(serviceSource).toContain("listCoreAdminAuditEventPage");
    expect(serviceSource).toContain('occurredAt: { lt: cursor.occurredAt }');
    expect(serviceSource).toContain('orderBy: [{ occurredAt: "desc" }, { id: "desc" }]');
    expect(serviceSource).toContain("take: values.pageSize + 1");
    expect(serviceSource).toContain("totalItems");
    expect(serviceSource).toContain("redactAuditJson");
    expect(serviceSource).toContain("filterHash");
    expect(serviceSource).toContain("where.entityId = normalized.entityId");
    expect(serviceSource).toContain("entityId: filters.entityId?.trim() || undefined");
    expect(serviceSource).not.toContain("take: 500");
    expect(serviceSource).toContain("const resolved = await resolveCoreAdminAuditWhere(session, {});");
    expect(serviceSource).toContain('actorEmail: ""');
    expect(serviceSource).toContain('ipAddress: ""');
    expect(serviceSource).not.toContain("activeTab === \"audit\" ? prisma.auditEvent.findMany");
    expect(serviceSource).toContain("recentAuditEvents: []");
  });

  test("organization locations use a selected-company page contract and bounded active options", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    expect(serviceSource).toContain("coreAdminLocationPageInputSchema");
    expect(serviceSource).toContain("listCoreAdminLocationPageAuthorized");
    expect(serviceSource).toContain("listCoreAdminLocationOptionsAuthorized");
    expect(serviceSource).toContain("companyId: session.context.companyId");
    expect(serviceSource).toContain('orderBy: [{ name: "asc" }, { id: "asc" }]');
    expect(serviceSource).toContain("skip: (values.page - 1) * values.pageSize");
    expect(serviceSource).toContain("take: values.pageSize");
    expect(serviceSource).toContain("take: 100");
    expect(serviceSource).toContain("hasMore: totalItems > options.length");
    expect(serviceSource).toContain('name: { contains: query, mode: "insensitive" as const }');
    expect(serviceSource).toContain("brandId: location.brandId");
  });

  test("organization brands use a selected-company page contract and bounded active options", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    expect(serviceSource).toContain("coreAdminBrandPageInputSchema");
    expect(serviceSource).toContain("listCoreAdminBrandPageAuthorized");
    expect(serviceSource).toContain("listCoreAdminBrandOptionsAuthorized");
    expect(serviceSource).toContain("listCoreAdminBrandPage");
    expect(serviceSource).toContain("listCoreAdminBrandOptions");
    expect(serviceSource).toContain("companyId: session.context.companyId");
    expect(serviceSource).toContain('orderBy: [{ name: "asc" }, { id: "asc" }]');
    expect(serviceSource).toContain("skip: (values.page - 1) * values.pageSize");
    expect(serviceSource).toContain("take: values.pageSize");
    expect(serviceSource).toContain("hasMore: totalItems > options.length");
    expect(serviceSource).toContain("code: brand.code");
  });

  test("organization departments use bounded selected-company pagination and approved summaries", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    expect(serviceSource).toContain("coreAdminDepartmentPageInputSchema");
    expect(serviceSource).toContain("listCoreAdminDepartmentPageAuthorized");
    expect(serviceSource).toContain("listCoreAdminDepartmentPage");
    expect(serviceSource).toContain("companyId: session.context.companyId");
    expect(serviceSource).toContain('orderBy: [{ name: "asc" }, { id: "asc" }]');
    expect(serviceSource).toContain("skip: (values.page - 1) * values.pageSize");
    expect(serviceSource).toContain("take: values.pageSize");
    expect(serviceSource).toContain("budgetLines: true");
    expect(serviceSource).toContain("costCenters: true");
    expect(serviceSource).not.toContain("employeeAssignments: true");
  });

  test("approval rules use bounded selected-company and tenant-wide pagination with capped step previews", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    expect(serviceSource).toContain("coreAdminApprovalRulePageInputSchema");
    expect(serviceSource).toContain("listCoreAdminApprovalRulePageAuthorized");
    expect(serviceSource).toContain("listCoreAdminApprovalRulePage");
    expect(serviceSource).toContain("OR: [{ companyId: session.context.companyId }, { companyId: null }]");
    expect(serviceSource).toContain('orderBy: [{ isActive: "desc" }, { priority: "asc" }, { id: "asc" }]');
    expect(serviceSource).toContain("take: 3");
    expect(serviceSource).toContain("_count: { select: { steps: true } }");
    expect(serviceSource).toContain("stepPreview");
    expect(serviceSource).not.toContain("include: {\n        company: true,\n        steps:");
  });

  test("admin user access lifecycle forms use focused entry surfaces", () => {
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/users/[id]/page.tsx"),
      "utf8"
    );

    expect(detailPageSource).toContain("EntryModal");
    for (const title of [
      "Deactivate Scope",
      "Assign Location Scope",
      "Assign Role"
    ]) {
      expect(detailPageSource).toContain(`title="${title}"`);
    }
    for (const actionName of [
      "deactivateRoleAssignment",
      "deactivateScope",
      "createLocationScope",
      "createRoleAssignment"
    ]) {
      expect(detailPageSource).toContain(`action={${actionName}}`);
    }
    expect(detailPageSource).toContain("const roleActionId =");
    expect(detailPageSource).toContain("Open role controls");
    expect(detailPageSource).toContain('data-testid="admin-user-role-controls"');
    expect(detailPageSource).toContain('name="returnPath"');
    expect(detailPageSource).toContain('name="reason" minLength={5} required');
    expect(detailPageSource).toContain("This role assignment is no longer on the selected page");
    expect(detailPageSource).not.toContain('<EntryModal title="Deactivate Role"');
    expect(detailPageSource).toContain("TaskSheet");
    expect(detailPageSource).toContain("bodyScroll=\"contained\"");
    expect(detailPageSource).toContain("Controlled scope request for");
    expect(detailPageSource).toContain("Controlled role request for");
    expect(detailPageSource).toContain("The server rechecks status, actor, scope, MFA, and segregation of duties.");
    expect(detailPageSource).not.toContain('<EntryModal\n                  title="Request Controlled Scope"');
    expect(detailPageSource).not.toContain('<EntryModal\n                  title="Request Controlled Role"');
    expect(detailPageSource).not.toContain('<EntryModal title="Review controlled request"');
  });

  test("user detail assignment catalogs are bounded, searchable, and do not serialize role permissions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/users/[id]/page.tsx"),
      "utf8"
    );
    expect(serviceSource).toContain("assignableRoleTotal");
    expect(serviceSource).toContain("activeLocationTotal");
    expect(serviceSource).toContain("take: 100");
    expect(serviceSource).toContain("assignableRoleCatalogHasMore");
    expect(serviceSource).toContain("assignableLocationCatalogHasMore");
    expect(serviceSource).toContain("roleQuery");
    expect(serviceSource).toContain("locationQuery");
    expect(detailPageSource).toContain('name="locationQuery"');
    expect(detailPageSource).toContain('name="roleQuery"');
    expect(detailPageSource).toContain("More active locations exist");
    expect(detailPageSource).toContain("More active roles exist");
    expect(serviceSource).not.toContain("permissionCodes: role.permissions.map");
  });

  test("user detail controlled request history uses bounded status-filtered pages", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/users/[id]/page.tsx"),
      "utf8"
    );
    expect(serviceSource).toContain("scopeRequestPageSize");
    expect(serviceSource).toContain("roleRequestPageSize");
    expect(serviceSource).toContain("scopeRequestTotal");
    expect(serviceSource).toContain("roleRequestTotal");
    expect(serviceSource).toContain("const loadScopeRequests = options.requestKind === undefined || options.requestKind === \"scope\"");
    expect(serviceSource).toContain("const loadRoleRequests = options.requestKind === undefined || options.requestKind === \"role\"");
    expect(detailPageSource).toContain('requestKind: section === "requests" ? requestKind : "none"');
    expect(serviceSource).toContain("const loadRoleCatalog =");
    expect(serviceSource).toContain("const loadLocationCatalog =");
    expect(serviceSource).toContain("const loadRoleSurface =");
    expect(serviceSource).toContain("const needsRoleCatalog =");
    expect(serviceSource).toContain("loadRoleSurface || needsRoleCatalog");
    expect(serviceSource).toContain('orderBy: [{ createdAt: "desc" }, { id: "desc" }]');
    expect(serviceSource).toContain("highRiskScopeRequestPage");
    expect(serviceSource).toContain("sensitiveRoleRequestPage");
    expect(detailPageSource).toContain('name="scopeRequestStatus"');
    expect(detailPageSource).toContain('name="roleRequestStatus"');
    expect(detailPageSource).toContain("Showing {user.highRiskScopeRequests.length} of");
    expect(detailPageSource).toContain("Showing {user.sensitiveRoleRequests.length} of");
    expect(detailPageSource).toContain('section === "requests"');
    expect(detailPageSource).toContain("requestKind");
    expect(detailPageSource).toContain("requestActionId");
    expect(detailPageSource).toContain("Review controlled request");
    expect(detailPageSource).toContain("Open review controls");
  });

  test("request history redacts historical narrative and permission detail", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/users/[id]/page.tsx"),
      "utf8",
    );
    expect(serviceSource).toContain('const reviewContextVisible = request.status === "PENDING"');
    expect(serviceSource).toContain("reasonRecorded");
    expect(serviceSource).toContain("evidenceRecorded");
    expect(detailPageSource).toContain("historical summary");
    expect(detailPageSource).toContain("Permission detail is available during pending review only.");
  });

  test("user audit tab uses exact actor-scoped redacted keyset pages", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/users/[id]/page.tsx"),
      "utf8",
    );
    expect(serviceSource).toContain("listCoreAdminUserAuditEventPage");
    expect(serviceSource).toContain("actorUserId");
    expect(serviceSource).toContain("assertTargetUserInCurrentCompany(session, userId)");
    expect(serviceSource).toContain("const existingAnd = Array.isArray(where.AND)");
    expect(serviceSource).toContain("where.AND = [...existingAnd, { OR: queryConditions }]");
    expect(detailPageSource).toContain('section === "audit"');
    expect(detailPageSource).toContain("auditCursor");
    expect(detailPageSource).toContain('name="auditQuery"');
    expect(detailPageSource).toContain("Open audit detail");
    expect(detailPageSource).not.toContain("user.auditEvents");
  });

  test("user detail sections are mutually exclusive visible workspaces", () => {
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/users/[id]/page.tsx"),
      "utf8",
    );
    expect(detailPageSource).toContain('section === "overview" || section === "roles"');
    expect(detailPageSource).toContain('section === "scopes" ? <>');
    expect(detailPageSource).toContain('section === "requests" && requestKind === "scope"');
    expect(detailPageSource).toContain('section === "audit" ?');
    expect(detailPageSource).toContain('aria-label="User access sections"');
    expect(detailPageSource).toContain('section === "roles" && user.canMutateRoles');
    expect(detailPageSource).toContain("const loadScopePage =");
    expect(detailPageSource).toContain("const buildScopeHref =");
    expect(detailPageSource).toContain("/admin/users/${id}?section=scopes&scopePage=");
    expect(detailPageSource).toContain('<input name="section" type="hidden" value="scopes" />');
    expect(detailPageSource).toContain("buildScopeHref(scope.id)");
    expect(detailPageSource).toContain("buildScopeHref(undefined, nextPage)");
    expect(detailPageSource).toContain("const loadRoleSurface = section === \"overview\" || section === \"roles\";");
    expect(detailPageSource).toContain('{loadRoleSurface ? user.roles.length : "—"}');
    expect(detailPageSource).toContain('{loadRoleSurface ? user.permissions.length : "—"}');
    expect(detailPageSource).toContain('(section === \"requests\" && requestKind === \"scope\")');
  });

  test("high-risk scope review revalidates target membership and claims pending CAS", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    expect(serviceSource).toContain('SELECT "id"');
    expect(serviceSource).toContain("await assertTargetUserInCurrentCompany(session, targetUser.id, tx)");
    expect(serviceSource).toContain("await assertTargetUserInCurrentCompany(session, request.targetUserId, tx)");
    expect(serviceSource).toContain("tx.highRiskScopeRequest.updateMany");
    expect(serviceSource).toContain('where: { id: request.id, status: "PENDING" }');
  });

  test("sensitive role review revalidates target membership under transaction lock", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    expect(serviceSource).toContain("await assertTargetUserInCurrentCompany(session, targetUser.id, tx)");
    expect(serviceSource).toContain("await assertTargetUserInCurrentCompany(session, request.targetUserId, tx)");
    expect(serviceSource).toContain("tx.sensitiveRoleRequest.updateMany");
  });

  test("audit export pagination counts once and fails closed over the policy row cap", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const exportRouteSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/audit/export/route.ts"),
      "utf8",
    );
    const policySource = readFileSync(path.resolve(__dirname, "policySettings.ts"), "utf8");
    expect(serviceSource).toContain("includeTotal");
    expect(serviceSource).toContain("REPORT_EXPORT_ROW_LIMIT_EXCEEDED");
    expect(exportRouteSource).toContain("REPORT_EXPORT_DATE_RANGE_REQUIRED");
    expect(exportRouteSource).toContain("exportErrorResponse");
    expect(exportRouteSource).toContain("occurredBefore");
    expect(policySource).toContain('"reporting.export.max_rows"');
    expect(policySource).toContain('"reporting.export.max_date_span_days"');
  });

  test("Core Administration exposes truthful route loading and retryable error states", () => {
    const loadingSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/loading.tsx"),
      "utf8"
    );
    const errorSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/error.tsx"),
      "utf8"
    );
    expect(loadingSource).toContain("Loading Core Administration");
    expect(loadingSource).toContain('aria-live="polite"');
    expect(errorSource).toContain("Core Administration could not be loaded");
    expect(errorSource).toContain("onClick={reset}");
    expect(errorSource).toContain('role="alert"');
  });

  test("role permission configuration uses human labels, toggles, recommendations, and audit diff service", () => {
    const rolePageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/roles/[id]/page.tsx"),
      "utf8"
    );
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const catalogSource = readFileSync(
      path.resolve(__dirname, "rolePermissionCatalog.ts"),
      "utf8"
    );

    expect(catalogSource).toContain("getPermissionPresentation");
    expect(catalogSource).toContain("getRecommendedPermissionCodesForRole");
    expect(catalogSource).toContain("Create purchase requests");
    expect(catalogSource).toContain("Post receiving");

    expect(rolePageSource).toContain("Save Permission Overrides");
    expect(rolePageSource).toContain("Apply Recommended Set");
    expect(rolePageSource).toContain("Back to Roles Workspace");
    expect(rolePageSource).toContain('href="/admin?tab=roles"');
    expect(rolePageSource).toContain('type="checkbox"');
    expect(rolePageSource).toContain('name="permissionCodes"');
    expect(rolePageSource).toContain("permission.label");
    expect(rolePageSource).toContain("Recommended");
    expect(rolePageSource).toContain("Sensitive");

    expect(serviceSource).toContain("role_permissions.updated");
    expect(serviceSource).toContain("role_permissions.recommended_applied");
    expect(serviceSource).toContain("beforeData");
    expect(serviceSource).toContain("afterData");
    expect(serviceSource).toContain("addedCodes");
    expect(serviceSource).toContain("removedCodes");
    expect(serviceSource).toContain("sensitiveChanges");
    expect(serviceSource).toContain("assertRolePermissionChangesExist");
  });

  test("role permission mutation guards no-op changes and configured admin lockout", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const feedbackSource = readFileSync(path.resolve(__dirname, "actionFeedback.ts"), "utf8");

    expect(serviceSource).toContain('throw new Error("NO_ROLE_PERMISSION_CHANGES")');
    expect(serviceSource).toContain(
      'throw new Error("ADMIN_ROLE_CORE_PERMISSION_REQUIRED")'
    );
    expect(serviceSource).toContain("assertAdminRoleRetainsCoreAdminPermission");
    expect(feedbackSource).toContain("NO_ROLE_PERMISSION_CHANGES");
    expect(feedbackSource).toContain("ADMIN_ROLE_CORE_PERMISSION_REQUIRED");
    expect(feedbackSource).toContain("ROLE_RECOMMENDATION_NOT_CONFIGURED");
  });

  test("permission access detail uses bounded current-company role previews", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const pageSource = readFileSync(path.resolve(__dirname, "../../app/(app)/admin/permissions/[id]/page.tsx"), "utf8");
    expect(serviceSource).toContain("rolesPage");
    expect(serviceSource).toContain("rolePermission.findMany");
    expect(serviceSource).toContain("input.query?.trim().slice(0, 120)");
    expect(serviceSource).toContain("assignedUserCount");
    expect(serviceSource).toContain("take: 5");
    expect(serviceSource).toContain("companyLocationIds");
    expect(serviceSource).toContain("startsAt: { lte: now }");
    expect(serviceSource).not.toContain("assignments: {\n                where: {\n                  status: \"ACTIVE\"");
    expect(pageSource).toContain("Search granting roles");
    expect(pageSource).toContain("PaginationBar");
    expect(pageSource).toContain("Preview users shown on this page");
    expect(pageSource).toContain("not an exhaustive effective-user total");
    expect(pageSource).toContain("Show up to {role.assignedUsers.length} user previews");
    expect(pageSource).toContain("<details");
    expect(pageSource).toContain("Current role page only");
    expect(pageSource).toContain("permission.rolesPage.totalRoles");
  });

  test("user access detail uses a bounded assigned-role contract", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const pageSource = readFileSync(path.resolve(__dirname, "../../app/(app)/admin/users/[id]/page.tsx"), "utf8");
    expect(serviceSource).toContain("assignedRoleQuery");
    expect(serviceSource).toContain("rolesPage");
    expect(serviceSource).toContain("orderBy: [{ startsAt: \"asc\" }, { id: \"asc\" }]");
    expect(serviceSource).toContain("effectivePermissions");
    expect(pageSource).toContain("assignedRoleQuery");
    expect(pageSource).toContain("assignedRolePage");
    expect(pageSource).toContain("Search assigned roles");
    expect(pageSource).toContain('itemLabel="assigned roles"');
  });

  test("user scope detail uses a tenant/company-filtered polymorphic page contract", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const pageSource = readFileSync(path.resolve(__dirname, "../../app/(app)/admin/users/[id]/page.tsx"), "utf8");
    expect(serviceSource).toContain("listCoreAdminUserScopePage");
    expect(serviceSource).toContain("WITH scoped AS");
    expect(serviceSource).toContain('JOIN \"Company\"');
    expect(serviceSource).toContain('JOIN \"Brand\"');
    expect(serviceSource).toContain('JOIN \"Location\"');
    expect(serviceSource).toContain('JOIN \"Department\"');
    expect(serviceSource).toContain('JOIN \"Project\"');
    expect(serviceSource).toContain('SELECT COUNT(*)::int AS "totalItems" FROM filtered');
    expect(serviceSource).toContain("canMutate");
    expect(serviceSource).toContain("const countRows = await prisma.$queryRaw");
    expect(serviceSource).toContain("const page = Math.min(requestedPage, totalPages)");
    expect(serviceSource).toContain('ORDER BY \"scopeType\" ASC');
    expect(pageSource).toContain("scopeQuery");
    expect(pageSource).toContain("scopeType");
    expect(pageSource).toContain('itemLabel="scopes"');
    expect(pageSource).toContain("scopeActionId");
    expect(pageSource).toContain("Open scope controls");
    expect(pageSource).toContain("minLength={5}");
    expect(pageSource).toContain("returnPath");
  });

  test("role permission matrix uses bounded server paging and preserves hidden grants", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const pageSource = readFileSync(path.resolve(__dirname, "../../app/(app)/admin/roles/[id]/page.tsx"), "utf8");
    expect(serviceSource).toContain("permissionPageSize");
    expect(serviceSource).toContain("permissionQuery");
    expect(serviceSource).toContain("permissionFilter");
    expect(serviceSource).toContain("permissionTotal");
    expect(serviceSource).toContain("skip: (permissionPage - 1) * permissionPageSize");
    expect(serviceSource).toContain("take: permissionPageSize");
    expect(serviceSource).toContain("enabledPermissionCodes");
    expect(serviceSource).toContain("AND: [");
    expect(serviceSource).toContain('OR: [{ tenantId: session.context.tenantId }, { tenantId: null }]');
    expect(serviceSource).not.toContain("const [role, assignmentCount, allPermissions]");
    expect(pageSource).toContain('name="permissionQuery"');
    expect(pageSource).toContain('name="permissionFilter"');
    expect(pageSource).toContain('name="permissionCodes" type="hidden"');
    expect(pageSource).toContain('<form method="get" className="mt-5 grid gap-2');
    expect(pageSource).toContain('<form action={updateRolePermissionsAction} className="mt-5">');
    expect(pageSource).toContain('itemLabel="permissions"');
    expect(pageSource).toContain("permissionPage");
    expect(pageSource).toContain("on this page");
    expect(pageSource).toContain("role.assignedUsersPage.totalItems");
    expect(pageSource).toContain("No permissions match the current search or filter");
    expect(pageSource).toContain("permissionReturnPath");
    expect(pageSource).not.toContain('<button className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">Filter</button>');
  });
});
