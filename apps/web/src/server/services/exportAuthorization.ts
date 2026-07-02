import {
  canReadPurchaseOrders,
  canUseProjects,
  canUsePurchaseRequests,
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
  return session.permissionCodes.includes(permissions.coreAdminister);
}

export function canExportInventoryBalances(session: SessionContext) {
  return session.permissionCodes.includes(permissions.inventoryBalanceView);
}

export function canExportInventoryLedger(session: SessionContext) {
  return session.permissionCodes.includes(permissions.inventoryLedgerView);
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
