import { describe, expect, test } from "vitest";
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
  });

  test("defines recommended defaults for configured roles", () => {
    expect(getRecommendedPermissionCodesForRole("CONFIGURED_REQUESTER")).toContain(
      permissions.purchaseRequestCreate
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
    expect(isSensitivePermissionCode(permissions.inventoryBalanceView)).toBe(false);
  });
});
