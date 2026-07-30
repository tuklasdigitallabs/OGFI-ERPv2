import { permissions } from "./authorization";

export const approvalRuleRouteKeys = ["DEFAULT", "PR_EMERGENCY"] as const;

export type ApprovalRuleRouteKey = (typeof approvalRuleRouteKeys)[number];

export type ApprovalRuleCatalogEntry = {
  transactionType: string;
  label: string;
  requiredPermissionCode: string;
  routeKeys: readonly ApprovalRuleRouteKey[];
};

const defaultRoute = ["DEFAULT"] as const;

/**
 * Exact persisted Phase I transaction keys consumed by live approval-rule selectors.
 * This registry is deliberately closed: adding a composer option requires a
 * matching runtime consumer and approval permission under DEC-0225.
 */
export const approvalRuleCatalog = [
  {
    transactionType: "PURCHASE_REQUEST",
    label: "Purchase Request",
    requiredPermissionCode: permissions.purchaseRequestApprove,
    routeKeys: approvalRuleRouteKeys,
  },
  {
    transactionType: "QuotationRecommendation",
    label: "Quotation Recommendation",
    requiredPermissionCode: permissions.quoteApprove,
    routeKeys: defaultRoute,
  },
  {
    transactionType: "PurchaseOrder",
    label: "Purchase Order",
    requiredPermissionCode: permissions.purchaseOrderApprove,
    routeKeys: defaultRoute,
  },
  {
    transactionType: "PurchaseOrderBalanceClosure",
    label: "Purchase Order Balance Closure",
    requiredPermissionCode: permissions.purchaseOrderApprove,
    routeKeys: defaultRoute,
  },
  {
    transactionType: "PurchaseOrderAmendment",
    label: "Purchase Order Amendment",
    requiredPermissionCode: permissions.purchaseOrderApprove,
    routeKeys: defaultRoute,
  },
  {
    transactionType: "InventoryTransfer",
    label: "Inventory Transfer",
    requiredPermissionCode: permissions.transferApprove,
    routeKeys: defaultRoute,
  },
  {
    transactionType: "StockCountAttemptReview",
    label: "Stock Count Review",
    requiredPermissionCode: permissions.stockCountReview,
    routeKeys: defaultRoute,
  },
  {
    transactionType: "WastageReport",
    label: "Wastage Report",
    requiredPermissionCode: permissions.wastageApprove,
    routeKeys: defaultRoute,
  },
  {
    transactionType: "StockAdjustment",
    label: "Stock Adjustment",
    requiredPermissionCode: permissions.stockAdjustmentApprove,
    routeKeys: defaultRoute,
  },
  {
    transactionType: "StockCountVarianceAdjustment",
    label: "Stock Count Variance Adjustment",
    requiredPermissionCode: permissions.stockAdjustmentApprove,
    routeKeys: defaultRoute,
  },
] as const satisfies readonly ApprovalRuleCatalogEntry[];

export function getApprovalRuleCatalogEntry(transactionType: string) {
  return approvalRuleCatalog.find(
    (entry) => entry.transactionType === transactionType,
  );
}

export function assertSupportedApprovalRuleRoute(
  transactionType: string,
  routeKey: string,
) {
  const entry = getApprovalRuleCatalogEntry(transactionType);
  if (!entry) {
    throw new Error("APPROVAL_RULE_TRANSACTION_TYPE_UNSUPPORTED");
  }
  if (!entry.routeKeys.some((candidate) => candidate === routeKey)) {
    throw new Error("APPROVAL_RULE_ROUTE_UNSUPPORTED");
  }
  return {
    entry,
    routeKey: routeKey as ApprovalRuleRouteKey,
  };
}

export function buildApprovalRuleScopeFilters(
  transactionType: string,
  routeKey: string,
) {
  const supported = assertSupportedApprovalRuleRoute(transactionType, routeKey);
  if (supported.routeKey === "PR_EMERGENCY") {
    return {
      sourceDecisionId: "DEC-0225",
      route: "emergency_purchase",
      emergency: true,
    };
  }
  return {
    sourceDecisionId: "DEC-0225",
    route: "default",
  };
}
