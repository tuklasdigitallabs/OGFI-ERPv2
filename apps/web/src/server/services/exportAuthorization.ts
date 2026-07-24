import {
  canReadPurchaseOrders,
  canUseFinance,
  canUseBranchOperations,
  canUseFoodSafety,
  canUseIncidents,
  canUseMaintenance,
  canUseProjects,
  canUsePurchaseRequests,
  canUseRecipesAndCosting,
  canUseWorkforce,
  permissions
} from "./authorization";
import type { SessionContext } from "./context";

export function canExportPurchaseRequests(session: SessionContext) {
  return canUsePurchaseRequests(session.permissionCodes);
}

export function canExportPurchaseOrders(session: SessionContext) {
  return canReadPurchaseOrders(session.permissionCodes);
}

export function canExportSupplierQuotes(session: SessionContext) {
  return session.permissionCodes.includes(permissions.quoteManage);
}

export function canExportCoreAdminAudit(session: SessionContext) {
  return (
    session.permissionCodes.includes(permissions.coreAdminister) &&
    session.permissionCodes.includes(permissions.tenantRoleAdminister)
  );
}

export function canExportReleaseReadiness(session: SessionContext) {
  return session.permissionCodes.includes(permissions.coreAdminister);
}

export function canExportInventoryBalances(session: SessionContext) {
  return session.permissionCodes.includes(permissions.inventoryBalanceView);
}

export function canExportInventoryLedger(session: SessionContext) {
  return session.permissionCodes.includes(permissions.inventoryLedgerView);
}

export function canExportInventoryLedgerVariance(session: SessionContext) {
  return (
    session.permissionCodes.includes(permissions.inventoryBalanceView) &&
    session.permissionCodes.includes(permissions.inventoryLedgerView)
  );
}

export function canExportReceivingReports(session: SessionContext) {
  return session.permissionCodes.includes(permissions.receivingView);
}

export function canExportInventoryTransfers(session: SessionContext) {
  return session.permissionCodes.includes(permissions.transferView);
}

export function canExportStockCounts(session: SessionContext) {
  return session.permissionCodes.includes(permissions.stockCountView);
}

export function canExportWastageReports(session: SessionContext) {
  return session.permissionCodes.includes(permissions.wastageView);
}

export function canExportStockAdjustments(session: SessionContext) {
  return session.permissionCodes.includes(permissions.stockAdjustmentView);
}

export function canExportProjects(session: SessionContext) {
  return canUseProjects(session.permissionCodes);
}

export function canExportExpansion(session: SessionContext) {
  return canUseProjects(session.permissionCodes);
}

export function canExportRecipeCosting(session: SessionContext) {
  return canUseRecipesAndCosting(session.permissionCodes);
}

export function canExportFoodCostAnalysis(session: SessionContext) {
  return canUseRecipesAndCosting(session.permissionCodes);
}

export function canExportBranchOperations(session: SessionContext) {
  return canUseBranchOperations(session.permissionCodes);
}

export function canExportFoodSafety(session: SessionContext) {
  return canUseFoodSafety(session.permissionCodes);
}

export function canExportIncidents(session: SessionContext) {
  return canUseIncidents(session.permissionCodes);
}

export function canExportMaintenance(session: SessionContext) {
  return canUseMaintenance(session.permissionCodes);
}

export function canExportFinance(session: SessionContext) {
  return canUseFinance(session.permissionCodes);
}

export function canExportWorkforce(session: SessionContext) {
  return canUseWorkforce(session.permissionCodes);
}
