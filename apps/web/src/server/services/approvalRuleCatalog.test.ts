import { describe, expect, test } from "vitest";
import { permissions } from "./authorization";
import {
  approvalRuleCatalog,
  assertSupportedApprovalRuleRoute,
  buildApprovalRuleScopeFilters,
  getApprovalRuleCatalogEntry,
} from "./approvalRuleCatalog";

describe("approval-rule composer catalog", () => {
  test("uses unique exact keys from Phase I live approval consumers", () => {
    const keys = approvalRuleCatalog.map((entry) => entry.transactionType);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      "PURCHASE_REQUEST",
      "QuotationRecommendation",
      "PurchaseOrder",
      "PurchaseOrderBalanceClosure",
      "PurchaseOrderAmendment",
      "WastageReport",
      "StockAdjustment",
      "StockCountVarianceAdjustment",
    ]);
  });

  test("binds representative workflows to their runtime approval permission", () => {
    expect(getApprovalRuleCatalogEntry("PURCHASE_REQUEST")?.requiredPermissionCode)
      .toBe(permissions.purchaseRequestApprove);
    expect(getApprovalRuleCatalogEntry("PurchaseOrderAmendment")?.requiredPermissionCode)
      .toBe(permissions.purchaseOrderApprove);
    expect(getApprovalRuleCatalogEntry("StockCountVarianceAdjustment")?.requiredPermissionCode)
      .toBe(permissions.stockAdjustmentApprove);
    expect(getApprovalRuleCatalogEntry("BudgetRevision")).toBeUndefined();
  });

  test("permits the emergency route only for purchase requests", () => {
    expect(
      assertSupportedApprovalRuleRoute("PURCHASE_REQUEST", "PR_EMERGENCY").routeKey,
    ).toBe("PR_EMERGENCY");
    expect(() =>
      assertSupportedApprovalRuleRoute("PurchaseOrder", "PR_EMERGENCY"),
    ).toThrow("APPROVAL_RULE_ROUTE_UNSUPPORTED");
    expect(() =>
      assertSupportedApprovalRuleRoute("UnknownDocument", "DEFAULT"),
    ).toThrow("APPROVAL_RULE_TRANSACTION_TYPE_UNSUPPORTED");
  });

  test("generates bounded filters instead of accepting arbitrary JSON", () => {
    expect(buildApprovalRuleScopeFilters("PURCHASE_REQUEST", "PR_EMERGENCY"))
      .toEqual({
        sourceDecisionId: "DEC-0225",
        route: "emergency_purchase",
        emergency: true,
      });
    expect(buildApprovalRuleScopeFilters("PurchaseOrder", "DEFAULT")).toEqual({
      sourceDecisionId: "DEC-0225",
      route: "default",
    });
  });
});
