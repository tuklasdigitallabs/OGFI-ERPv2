import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("core administration audit search wiring", () => {
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
