import { prisma, type Prisma } from "@ogfi/database";
import type { SessionContext } from "./context";

export const permissions = {
  coreAdminister: "core.administer",
  tenantRoleAdminister: "core.tenant_role_administer",
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
  projectTemplateConfigure: "projects.template.configure",
  recipeView: "restaurant.recipe.view",
  recipeManage: "restaurant.recipe.manage",
  recipeSubmit: "restaurant.recipe.submit",
  recipeReview: "restaurant.recipe.review",
  recipeApprove: "restaurant.recipe.approve",
  recipePublish: "restaurant.recipe.publish",
  recipeArchive: "restaurant.recipe.archive",
  menuCostView: "restaurant.menu_cost.view",
  menuPriceDecide: "restaurant.menu_price.decide",
  branchOperationsView: "restaurant.branch_operations.view",
  branchOperationsCreate: "restaurant.branch_operations.create",
  branchOperationsReview: "restaurant.branch_operations.review",
  branchOperationsCorrect: "restaurant.branch_operations.correct",
  foodSafetyView: "restaurant.food_safety.view",
  foodSafetyCreate: "restaurant.food_safety.create",
  foodSafetyReview: "restaurant.food_safety.review",
  foodSafetyCorrect: "restaurant.food_safety.correct",
  incidentView: "restaurant.incident.view",
  incidentCreate: "restaurant.incident.create",
  incidentResolve: "restaurant.incident.resolve",
  incidentCorrect: "restaurant.incident.correct",
  maintenanceView: "restaurant.maintenance.view",
  maintenanceCreate: "restaurant.maintenance.create",
  maintenanceComplete: "restaurant.maintenance.complete",
  maintenanceCorrect: "restaurant.maintenance.correct",
  financeView: "finance.view",
  financeConfigure: "finance.configure",
  financeLedgerView: "finance.ledger.view",
  financePayablesView: "finance.payables.view",
  financeApInvoiceCreate: "finance.ap_invoice.create",
  financeApInvoiceSubmit: "finance.ap_invoice.submit",
  financeApInvoiceMatch: "finance.ap_invoice.match",
  financeApInvoiceReviewException: "finance.ap_invoice.review_exception",
  financeApInvoiceCancel: "finance.ap_invoice.cancel",
  financeSupplierCreditCreate: "finance.supplier_credit.create",
  financeSupplierCreditSubmit: "finance.supplier_credit.submit",
  financeSupplierCreditCancel: "finance.supplier_credit.cancel",
  financePaymentRequestCreate: "finance.payment_request.create",
  financePaymentRequestApprove: "finance.payment_request.approve",
  financePaymentRelease: "finance.payment.release",
  financeDisbursementCreate: "finance.disbursement.create",
  financeDisbursementApprove: "finance.disbursement.approve",
  financeCashDepositCreate: "finance.cash_deposit.create",
  financeReconciliationView: "finance.reconciliation.view",
  financeReconciliationMatch: "finance.reconciliation.match",
  financePeriodCloseManage: "finance.period_close.manage",
  financeJournalCreate: "finance.journal.create",
  financeJournalSubmit: "finance.journal.submit",
  financeJournalApprove: "finance.journal.approve",
  financeJournalPost: "finance.journal.post",
  financeJournalReverse: "finance.journal.reverse",
  financeBudgetView: "finance.budget.view",
  financeBudgetManage: "finance.budget.manage",
  financeBudgetApprove: "finance.budget.approve",
  financeBudgetCommitmentReview: "finance.budget.commitment.review",
  financeExpenseRequestView: "finance.expense_request.view",
  financeExpenseRequestCreate: "finance.expense_request.create",
  financeExpenseRequestSubmit: "finance.expense_request.submit",
  financeExpenseRequestApprove: "finance.expense_request.approve",
  financeExpenseRequestComplete: "finance.expense_request.complete",
  financeCashAdvanceView: "finance.cash_advance.view",
  financeCashAdvanceCreate: "finance.cash_advance.create",
  financeCashAdvanceSubmit: "finance.cash_advance.submit",
  financeCashAdvanceApprove: "finance.cash_advance.approve",
  financeCashAdvanceLiquidate: "finance.cash_advance.liquidate",
  financeCashAdvanceReviewLiquidation:
    "finance.cash_advance.review_liquidation",
  financePettyCashView: "finance.petty_cash.view",
  financePettyCashCreate: "finance.petty_cash.create",
  financePettyCashSubmit: "finance.petty_cash.submit",
  financePettyCashApprove: "finance.petty_cash.approve",
  financePettyCashReplenish: "finance.petty_cash.replenish",
  financePettyCashLiquidate: "finance.petty_cash.liquidate",
  financePettyCashReviewLiquidation:
    "finance.petty_cash.review_liquidation",
  workforceView: "workforce.view",
  workforceManage: "workforce.manage",
  workforceLeaveApprove: "workforce.leave.approve",
  workforceOvertimeApprove: "workforce.overtime.approve",
  workforceScheduleView: "workforce.schedule.view",
  workforceScheduleManage: "workforce.schedule.manage",
  workforceAttendanceImportView: "workforce.attendance_import.view",
  workforceAttendanceImportManage: "workforce.attendance_import.manage"
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

export function canViewExpansionFinancialEstimates(permissionCodes: string[]) {
  return permissionCodes.includes(permissions.financeBudgetView);
}

export function canConfigureProjectTemplates(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.projectTemplateView) ||
    permissionCodes.includes(permissions.projectTemplateConfigure)
  );
}

export function canUseRecipesAndCosting(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.recipeView) ||
    permissionCodes.includes(permissions.recipeManage) ||
    permissionCodes.includes(permissions.menuCostView)
  );
}

export function canUseBranchOperations(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.branchOperationsView) ||
    permissionCodes.includes(permissions.branchOperationsCreate) ||
    permissionCodes.includes(permissions.branchOperationsReview)
  );
}

export function canUseFoodSafety(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.foodSafetyView) ||
    permissionCodes.includes(permissions.foodSafetyCreate) ||
    permissionCodes.includes(permissions.foodSafetyReview)
  );
}

export function canUseIncidents(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.incidentView) ||
    permissionCodes.includes(permissions.incidentCreate) ||
    permissionCodes.includes(permissions.incidentResolve)
  );
}

export function canUseMaintenance(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.maintenanceView) ||
    permissionCodes.includes(permissions.maintenanceCreate) ||
    permissionCodes.includes(permissions.maintenanceComplete)
  );
}

export function canUseFinance(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.coreAdminister) ||
    permissionCodes.includes(permissions.financeView) ||
    permissionCodes.includes(permissions.financeConfigure) ||
    permissionCodes.includes(permissions.financeLedgerView) ||
    permissionCodes.includes(permissions.financePayablesView) ||
    permissionCodes.includes(permissions.financeApInvoiceCreate) ||
    permissionCodes.includes(permissions.financeApInvoiceSubmit) ||
    permissionCodes.includes(permissions.financeApInvoiceMatch) ||
    permissionCodes.includes(permissions.financeApInvoiceReviewException) ||
    permissionCodes.includes(permissions.financeApInvoiceCancel) ||
    permissionCodes.includes(permissions.financeSupplierCreditCreate) ||
    permissionCodes.includes(permissions.financeSupplierCreditSubmit) ||
    permissionCodes.includes(permissions.financeSupplierCreditCancel) ||
    permissionCodes.includes(permissions.financePaymentRequestCreate) ||
    permissionCodes.includes(permissions.financePaymentRequestApprove) ||
    permissionCodes.includes(permissions.financePaymentRelease) ||
    permissionCodes.includes(permissions.financeDisbursementCreate) ||
    permissionCodes.includes(permissions.financeDisbursementApprove) ||
    permissionCodes.includes(permissions.financeCashDepositCreate) ||
    permissionCodes.includes(permissions.financeReconciliationView) ||
    permissionCodes.includes(permissions.financeReconciliationMatch) ||
    permissionCodes.includes(permissions.financePeriodCloseManage) ||
    permissionCodes.includes(permissions.financeJournalCreate) ||
    permissionCodes.includes(permissions.financeJournalSubmit) ||
    permissionCodes.includes(permissions.financeJournalApprove) ||
    permissionCodes.includes(permissions.financeJournalPost) ||
    permissionCodes.includes(permissions.financeJournalReverse) ||
    permissionCodes.includes(permissions.financeBudgetView) ||
    permissionCodes.includes(permissions.financeBudgetManage) ||
    permissionCodes.includes(permissions.financeBudgetApprove) ||
    permissionCodes.includes(permissions.financeBudgetCommitmentReview) ||
    permissionCodes.includes(permissions.financeExpenseRequestView) ||
    permissionCodes.includes(permissions.financeExpenseRequestCreate) ||
    permissionCodes.includes(permissions.financeExpenseRequestSubmit) ||
    permissionCodes.includes(permissions.financeExpenseRequestApprove) ||
    permissionCodes.includes(permissions.financeExpenseRequestComplete) ||
    permissionCodes.includes(permissions.financeCashAdvanceView) ||
    permissionCodes.includes(permissions.financeCashAdvanceCreate) ||
    permissionCodes.includes(permissions.financeCashAdvanceSubmit) ||
    permissionCodes.includes(permissions.financeCashAdvanceApprove) ||
    permissionCodes.includes(permissions.financeCashAdvanceLiquidate) ||
    permissionCodes.includes(permissions.financeCashAdvanceReviewLiquidation) ||
    permissionCodes.includes(permissions.financePettyCashView) ||
    permissionCodes.includes(permissions.financePettyCashCreate) ||
    permissionCodes.includes(permissions.financePettyCashSubmit) ||
    permissionCodes.includes(permissions.financePettyCashApprove) ||
    permissionCodes.includes(permissions.financePettyCashReplenish) ||
    permissionCodes.includes(permissions.financePettyCashLiquidate) ||
    permissionCodes.includes(permissions.financePettyCashReviewLiquidation)
  );
}

export function canUseWorkforce(permissionCodes: string[]) {
  return (
    permissionCodes.includes(permissions.coreAdminister) ||
    permissionCodes.includes(permissions.workforceView) ||
    permissionCodes.includes(permissions.workforceManage) ||
    permissionCodes.includes(permissions.workforceLeaveApprove) ||
    permissionCodes.includes(permissions.workforceOvertimeApprove) ||
    permissionCodes.includes(permissions.workforceScheduleView) ||
    permissionCodes.includes(permissions.workforceScheduleManage) ||
    permissionCodes.includes(permissions.workforceAttendanceImportView) ||
    permissionCodes.includes(permissions.workforceAttendanceImportManage)
  );
}

export function getDefaultAppRoute(_permissionCodes: string[]) {
  return "/dashboard";
}

export async function getGrantedPermissionCodes(session: SessionContext) {
  const now = new Date();
  const assignments = await prisma.userRoleAssignment.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
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

export async function requireAnyPermission(
  session: SessionContext,
  permissionCodes: string[]
) {
  const grantedPermissionCodes = await getGrantedPermissionCodes(session);
  if (
    !permissionCodes.some((permissionCode) =>
      grantedPermissionCodes.includes(permissionCode)
    )
  ) {
    throw new Error("PERMISSION_DENIED");
  }
}

export async function requireFinanceAccess(session: SessionContext) {
  const grantedPermissionCodes = await getGrantedPermissionCodes(session);
  if (!canUseFinance(grantedPermissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  return grantedPermissionCodes;
}

export async function requireWorkforceAccess(session: SessionContext) {
  const grantedPermissionCodes = await getGrantedPermissionCodes(session);
  if (!canUseWorkforce(grantedPermissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  return grantedPermissionCodes;
}

export type ActiveOrganizationalScopeType =
  | "COMPANY"
  | "BRAND"
  | "LOCATION"
  | "DEPARTMENT"
  | "PROJECT";

export async function requireActiveScopeAssignment(
  session: SessionContext,
  input: {
    scopeType: ActiveOrganizationalScopeType;
    scopeId: string;
    allowCompanyManage?: boolean;
  },
) {
  const scopeId = input.scopeId.trim();
  if (!scopeId) {
    throw new Error("SCOPE_DENIED");
  }
  const now = new Date();
  const scopeAlternatives: Prisma.UserScopeAssignmentWhereInput[] = [
    {
      scopeType: input.scopeType,
      scopeId,
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
  ];
  if (input.allowCompanyManage) {
    scopeAlternatives.push({
      scopeType: "COMPANY",
      scopeId: session.context.companyId,
      accessLevel: "MANAGE",
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    });
  }
  const assignment = await prisma.userScopeAssignment.findFirst({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: scopeAlternatives,
    },
    select: { id: true },
  });
  if (!assignment) {
    throw new Error("SCOPE_DENIED");
  }
}
