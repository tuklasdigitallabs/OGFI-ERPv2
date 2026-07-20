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

  test("role assignment mutation paths enforce direct assignability in the service layer", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");

    expect(serviceSource).toContain("if (initialRole) {\n    assertDirectRoleAssignmentAllowed(initialRole);");
    expect(serviceSource).toContain("assertDirectRoleAssignmentAllowed(role);");
    expect(serviceSource).toContain("assertDirectRoleAssignmentAllowed(assignment.role);");
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

    expect(adminPageSource).toContain("listCoreAdminAuditEvents(session, auditFilters)");
    expect(adminPageSource).toContain("const auditExportHref = `/admin/audit/export");
    for (const fieldName of [
      "eventType",
      "entityType",
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

  test("admin user access lifecycle forms use modal entry surfaces", () => {
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/users/[id]/page.tsx"),
      "utf8"
    );

    expect(detailPageSource).toContain("EntryModal");
    for (const title of [
      "Deactivate Role",
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
});
