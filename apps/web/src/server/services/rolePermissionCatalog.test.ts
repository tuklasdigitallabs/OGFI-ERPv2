import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { permissions } from "./authorization";
import {
  getPermissionPresentation,
  getRecommendedPermissionCodesForRole,
  isSensitivePermissionCode
} from "./rolePermissionCatalog";

describe("role permission catalog metadata", () => {
  test("exposes human labels while keeping stable permission codes internal", () => {
    expect(getPermissionPresentation(permissions.purchaseRequestCreate)).toMatchObject({
      code: permissions.purchaseRequestCreate,
      label: "Create purchase requests",
      group: "Procurement",
      sensitive: false
    });
    expect(getPermissionPresentation(permissions.receivingPost)).toMatchObject({
      label: "Post receiving",
      group: "Receiving",
      sensitive: true
    });
    expect(getPermissionPresentation(permissions.recipePublish)).toMatchObject({
      label: "Publish recipe versions",
      group: "Restaurant Operations",
      sensitive: true
    });
    expect(getPermissionPresentation(permissions.menuPriceDecide)).toMatchObject({
      label: "Decide menu price changes",
      group: "Restaurant Operations",
      sensitive: true
    });
  });

  test("defines recommended defaults for configured roles", () => {
    expect(getRecommendedPermissionCodesForRole("CONFIGURED_REQUESTER")).toContain(
      permissions.purchaseRequestCreate
    );
    expect(getRecommendedPermissionCodesForRole("CONFIGURED_REQUESTER")).toContain(
      permissions.maintenanceCreate
    );
    expect(getRecommendedPermissionCodesForRole("CONFIGURED_REQUESTER")).toContain(
      permissions.maintenanceComplete
    );
    expect(getRecommendedPermissionCodesForRole("CONFIGURED_REQUESTER")).toContain(
      permissions.incidentResolve
    );
    expect(getRecommendedPermissionCodesForRole("CONFIGURED_REQUESTER")).toContain(
      permissions.branchOperationsCreate
    );
    expect(getRecommendedPermissionCodesForRole("CONFIGURED_REQUESTER")).toContain(
      permissions.foodSafetyCreate
    );
    expect(getRecommendedPermissionCodesForRole("CONFIGURED_REQUESTER")).not.toContain(
      permissions.branchOperationsReview
    );
    expect(getRecommendedPermissionCodesForRole("CONFIGURED_REQUESTER")).not.toContain(
      permissions.foodSafetyReview
    );
    expect(getRecommendedPermissionCodesForRole("CONFIGURED_ADMIN")).toContain(
      permissions.coreAdminister
    );
    expect(getRecommendedPermissionCodesForRole("UNMAPPED_ROLE")).toEqual([]);
  });

  test("flags approval, posting, reversal, and admin capabilities as sensitive", () => {
    expect(isSensitivePermissionCode(permissions.coreAdminister)).toBe(true);
    expect(isSensitivePermissionCode(permissions.purchaseOrderApprove)).toBe(true);
    expect(isSensitivePermissionCode(permissions.stockAdjustmentPost)).toBe(true);
    expect(isSensitivePermissionCode(permissions.receivingReverse)).toBe(true);
    expect(isSensitivePermissionCode(permissions.maintenanceCreate)).toBe(true);
    expect(isSensitivePermissionCode(permissions.maintenanceComplete)).toBe(true);
    expect(isSensitivePermissionCode(permissions.incidentResolve)).toBe(true);
    expect(isSensitivePermissionCode(permissions.branchOperationsCreate)).toBe(true);
    expect(isSensitivePermissionCode(permissions.branchOperationsReview)).toBe(true);
    expect(isSensitivePermissionCode(permissions.branchOperationsCorrect)).toBe(true);
    expect(isSensitivePermissionCode(permissions.foodSafetyCreate)).toBe(true);
    expect(isSensitivePermissionCode(permissions.foodSafetyReview)).toBe(true);
    expect(isSensitivePermissionCode(permissions.foodSafetyCorrect)).toBe(true);
    expect(isSensitivePermissionCode(permissions.recipePublish)).toBe(true);
    expect(isSensitivePermissionCode(permissions.menuPriceDecide)).toBe(true);
    expect(isSensitivePermissionCode(permissions.inventoryBalanceView)).toBe(false);
  });

  test("documents Phase 2 restaurant operations permission codes", () => {
    const source = readFileSync(
      join(process.cwd(), "../../docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md"),
      "utf8"
    );
    const documentedPermissions = [
      permissions.branchOperationsView,
      permissions.branchOperationsCreate,
      permissions.branchOperationsReview,
      permissions.branchOperationsCorrect,
      permissions.foodSafetyView,
      permissions.foodSafetyCreate,
      permissions.foodSafetyReview,
      permissions.foodSafetyCorrect,
      permissions.incidentView,
      permissions.incidentCreate,
      permissions.incidentResolve,
      permissions.incidentCorrect,
      permissions.maintenanceView,
      permissions.maintenanceCreate,
      permissions.maintenanceComplete,
      permissions.maintenanceCorrect,
      permissions.recipeView,
      permissions.recipeManage,
      permissions.recipeSubmit,
      permissions.recipeReview,
      permissions.recipeApprove,
      permissions.recipePublish,
      permissions.recipeArchive,
      permissions.menuCostView,
      permissions.menuPriceDecide
    ];

    for (const permissionCode of documentedPermissions) {
      expect(source).toContain(`\`${permissionCode}\``);
    }
  });
});
