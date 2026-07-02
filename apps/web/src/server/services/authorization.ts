import { prisma } from "@ogfi/database";
import type { SessionContext } from "./context";

export const permissions = {
  coreAdminister: "core.administer",
  purchaseRequestCreate: "purchasing.purchase_request.create",
  purchaseRequestSubmit: "purchasing.purchase_request.submit",
  purchaseRequestApprove: "purchasing.purchase_request.approve",
  quoteManage: "purchasing.quote.manage",
  quoteApprove: "purchasing.quote.approve",
  purchaseOrderView: "purchasing.purchase_order.view",
  purchaseOrderCreate: "purchasing.purchase_order.create",
  purchaseOrderSubmit: "purchasing.purchase_order.submit",
  purchaseOrderApprove: "purchasing.purchase_order.approve",
  purchaseOrderIssue: "purchasing.purchase_order.issue",
  purchaseOrderCancel: "purchasing.purchase_order.cancel",
  purchaseOrderCloseRemaining: "purchasing.purchase_order.close_remaining",
  purchaseOrderAmend: "purchasing.purchase_order.amend",
  inventoryBalanceView: "inventory.balance.view",
  inventoryLedgerView: "inventory.ledger.view",
  transferView: "inventory.transfer.view",
  transferCreate: "inventory.transfer.create",
  transferSubmit: "inventory.transfer.submit",
  transferCancel: "inventory.transfer.cancel",
  transferDispatch: "inventory.transfer.dispatch",
  transferReceive: "inventory.transfer.receive",
  transferReceiptReverse: "inventory.transfer.receipt.reverse",
  transferDiscrepancySettle: "inventory.transfer.discrepancy.settle",
  stockCountView: "inventory.stock_count.view",
  stockCountCreate: "inventory.stock_count.create",
  stockCountEnter: "inventory.stock_count.enter",
  stockCountSubmit: "inventory.stock_count.submit",
  stockCountReview: "inventory.stock_count.review",
  stockCountCancel: "inventory.stock_count.cancel",
  wastageView: "inventory.wastage.view",
  wastageCreate: "inventory.wastage.create",
  wastageSubmit: "inventory.wastage.submit",
  wastageApprove: "inventory.wastage.approve",
  wastagePost: "inventory.wastage.post",
  wastageReverse: "inventory.wastage.reverse",
  wastageReview: "inventory.wastage.review",
  wastageCancel: "inventory.wastage.cancel",
  stockAdjustmentView: "inventory.stock_adjustment.view",
  stockAdjustmentCreate: "inventory.stock_adjustment.create",
  stockAdjustmentSubmit: "inventory.stock_adjustment.submit",
  stockAdjustmentApprove: "inventory.stock_adjustment.approve",
  stockAdjustmentPost: "inventory.stock_adjustment.post",
  stockAdjustmentReverse: "inventory.stock_adjustment.reverse",
  stockAdjustmentCancel: "inventory.stock_adjustment.cancel",
  receivingView: "inventory.receiving.view",
  receivingCreate: "inventory.receiving.create",
  receivingPost: "inventory.receiving.post",
  receivingReverse: "inventory.receiving.reverse",
  projectView: "projects.project.view",
  projectCreate: "projects.project.create",
  projectManage: "projects.project.manage",
  projectManageMembers: "projects.project.manage_members",
  projectRiskCreate: "projects.risk.create",
  projectRiskUpdate: "projects.risk.update",
  projectRiskResolve: "projects.risk.resolve",
  projectRiskArchive: "projects.risk.archive",
  projectTemplateView: "projects.template.view",
  projectTemplateConfigure: "projects.template.configure"
} as const;

export function assertPermissionAllowed(
  grantedPermissionCodes: string[],
  requiredPermissionCode: string
) {
  if (!grantedPermissionCodes.includes(requiredPermissionCode)) {
    throw new Error("PERMISSION_DENIED");
  }
}

export function canReadPurchaseOrders(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.purchaseOrderView) ||
    permissionCodes.includes(permissions.purchaseOrderCreate) ||
    permissionCodes.includes(permissions.purchaseOrderSubmit) ||
    permissionCodes.includes(permissions.purchaseOrderIssue) ||
    permissionCodes.includes(permissions.purchaseOrderCancel) ||
    permissionCodes.includes(permissions.purchaseOrderCloseRemaining) ||
    permissionCodes.includes(permissions.purchaseOrderAmend)
  );
}

export function canUsePurchaseRequests(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.purchaseRequestCreate) ||
    permissionCodes.includes(permissions.purchaseRequestSubmit) ||
    permissionCodes.includes(permissions.purchaseRequestApprove)
  );
}

export function canUseApprovals(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.purchaseRequestApprove) ||
    permissionCodes.includes(permissions.quoteApprove) ||
    permissionCodes.includes(permissions.purchaseOrderApprove) ||
    permissionCodes.includes(permissions.wastageApprove) ||
    permissionCodes.includes(permissions.stockAdjustmentApprove)
  );
}

export function canUseReceiving(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.receivingView) ||
    permissionCodes.includes(permissions.receivingCreate) ||
    permissionCodes.includes(permissions.receivingPost) ||
    permissionCodes.includes(permissions.receivingReverse)
  );
}

export function canUseTransfers(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.transferView) ||
    permissionCodes.includes(permissions.transferCreate) ||
    permissionCodes.includes(permissions.transferSubmit) ||
    permissionCodes.includes(permissions.transferCancel) ||
    permissionCodes.includes(permissions.transferDispatch) ||
    permissionCodes.includes(permissions.transferReceive) ||
    permissionCodes.includes(permissions.transferReceiptReverse) ||
    permissionCodes.includes(permissions.transferDiscrepancySettle)
  );
}

export function canUseStockCounts(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.stockCountView) ||
    permissionCodes.includes(permissions.stockCountCreate) ||
    permissionCodes.includes(permissions.stockCountEnter) ||
    permissionCodes.includes(permissions.stockCountSubmit) ||
    permissionCodes.includes(permissions.stockCountReview) ||
    permissionCodes.includes(permissions.stockCountCancel)
  );
}

export function canUseWastageReports(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.wastageView) ||
    permissionCodes.includes(permissions.wastageCreate) ||
    permissionCodes.includes(permissions.wastageSubmit) ||
    permissionCodes.includes(permissions.wastageApprove) ||
    permissionCodes.includes(permissions.wastagePost) ||
    permissionCodes.includes(permissions.wastageReverse) ||
    permissionCodes.includes(permissions.wastageReview) ||
    permissionCodes.includes(permissions.wastageCancel)
  );
}

export function canUseStockAdjustments(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.stockAdjustmentView) ||
    permissionCodes.includes(permissions.stockAdjustmentCreate) ||
    permissionCodes.includes(permissions.stockAdjustmentSubmit) ||
    permissionCodes.includes(permissions.stockAdjustmentApprove) ||
    permissionCodes.includes(permissions.stockAdjustmentPost) ||
    permissionCodes.includes(permissions.stockAdjustmentReverse) ||
    permissionCodes.includes(permissions.stockAdjustmentCancel)
  );
}

export function canUseProjects(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.projectView) ||
    permissionCodes.includes(permissions.projectCreate) ||
    permissionCodes.includes(permissions.projectManage) ||
    permissionCodes.includes(permissions.projectManageMembers) ||
    permissionCodes.includes(permissions.projectRiskCreate) ||
    permissionCodes.includes(permissions.projectRiskUpdate) ||
    permissionCodes.includes(permissions.projectRiskResolve) ||
    permissionCodes.includes(permissions.projectRiskArchive)
  );
}

export function canConfigureProjectTemplates(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.projectTemplateView) ||
    permissionCodes.includes(permissions.projectTemplateConfigure)
  );
}

export function getDefaultAppRoute(permissionCodes: string[]) {
  if (permissionCodes.includes(permissions.coreAdminister)) {
    return "/admin";
  }
  if (canUsePurchaseRequests(permissionCodes)) {
    return "/purchase-requests";
  }
  if (canUseApprovals(permissionCodes)) {
    return "/approvals";
  }
  if (permissionCodes.includes(permissions.inventoryBalanceView)) {
    return "/inventory";
  }
  if (permissionCodes.includes(permissions.inventoryLedgerView)) {
    return "/inventory/ledger";
  }
  if (canReadPurchaseOrders(permissionCodes)) {
    return "/purchase-orders";
  }
  if (canUseReceiving(permissionCodes)) {
    return "/receiving";
  }
  if (canUseTransfers(permissionCodes)) {
    return "/transfers";
  }
  if (canUseStockCounts(permissionCodes)) {
    return "/counts";
  }
  if (canUseWastageReports(permissionCodes)) {
    return "/wastage";
  }
  if (canUseStockAdjustments(permissionCodes)) {
    return "/adjustments";
  }
  if (permissionCodes.includes(permissions.quoteManage)) {
    return "/quotes";
  }
  if (canConfigureProjectTemplates(permissionCodes)) {
    return "/project-templates";
  }
  if (canUseProjects(permissionCodes)) {
    return "/projects";
  }
  return "/dashboard";
}

export async function getGrantedPermissionCodes(session: SessionContext) {
  const assignments = await prisma.userRoleAssignment.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      role: {
        status: "ACTIVE",
        OR: [{ tenantId: session.context.tenantId }, { tenantId: null }]
      }
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      }
    }
  });

  return Array.from(
    new Set(
      assignments.flatMap((assignment) =>
        assignment.role.permissions
          .filter(
            (rolePermission) =>
              rolePermission.permission.tenantId === session.context.tenantId ||
              rolePermission.permission.tenantId === null
          )
          .map((rolePermission) => rolePermission.permission.code)
      )
    )
  );
}

export async function requirePermission(
  session: SessionContext,
  permissionCode: string
) {
  const grantedPermissionCodes = await getGrantedPermissionCodes(session);
  assertPermissionAllowed(grantedPermissionCodes, permissionCode);
}
