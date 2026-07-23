import { describe, expect, test } from "vitest";
import {
  canReadPurchaseOrders,
  canUseBranchOperations,
  canUseFoodSafety,
  canUseIncidents,
  canUseMaintenance,
  canUseFinance,
  canUseApprovals,
  canUsePurchaseRequests,
  canUseProjects,
  canUseReceiving,
  canUseRecipesAndCosting,
  canUseStockAdjustments,
  canUseStockCounts,
  canUseTransfers,
  canUseWastageReports,
  getDefaultAppRoute,
  permissions
} from "./authorization";

describe("module access permission helpers", () => {
  test("uses Overview as the default app route for every role", () => {
    expect(getDefaultAppRoute([permissions.coreAdminister])).toBe("/dashboard");
    expect(getDefaultAppRoute([permissions.purchaseRequestCreate])).toBe(
      "/dashboard"
    );
    expect(getDefaultAppRoute([permissions.financeCashDepositCreate])).toBe(
      "/dashboard"
    );
    expect(getDefaultAppRoute([])).toBe("/dashboard");
  });

  test("allows purchase request access from every PR action permission", () => {
    expect(canUsePurchaseRequests([])).toBe(false);
    for (const permission of [
      permissions.purchaseRequestCreate,
      permissions.purchaseRequestSubmit,
      permissions.purchaseRequestApprove
    ]) {
      expect(canUsePurchaseRequests([permission]), permission).toBe(true);
    }
    expect(canUsePurchaseRequests([permissions.purchaseOrderView])).toBe(false);
  });

  test("allows approval access from every approval action permission", () => {
    expect(canUseApprovals([])).toBe(false);
    for (const permission of [
      permissions.purchaseRequestApprove,
      permissions.quoteApprove,
      permissions.purchaseOrderApprove,
      permissions.wastageApprove,
      permissions.stockAdjustmentApprove,
      permissions.financeBudgetApprove,
      permissions.financeExpenseRequestApprove,
      permissions.financeCashAdvanceApprove,
      permissions.financePettyCashApprove,
      permissions.financePaymentRequestApprove,
      permissions.financePaymentRelease,
      permissions.financePeriodCloseManage,
      permissions.workforceLeaveApprove,
      permissions.workforceOvertimeApprove,
      permissions.workforceScheduleManage,
      permissions.workforceAttendanceImportManage
    ]) {
      expect(canUseApprovals([permission]), permission).toBe(true);
    }
    expect(canUseApprovals([permissions.purchaseRequestCreate])).toBe(false);
  });

  test("allows purchase order access from every PO action permission", () => {
    expect(canReadPurchaseOrders([])).toBe(false);
    for (const permission of [
      permissions.purchaseOrderView,
      permissions.purchaseOrderCreate,
      permissions.purchaseOrderSubmit,
      permissions.purchaseOrderIssue,
      permissions.purchaseOrderCancel,
      permissions.purchaseOrderCloseRemaining
    ]) {
      expect(canReadPurchaseOrders([permission]), permission).toBe(true);
    }
    expect(canReadPurchaseOrders([permissions.receivingView])).toBe(false);
  });

  test("allows receiving access from every receiving action permission", () => {
    expect(canUseReceiving([])).toBe(false);
    for (const permission of [
      permissions.receivingView,
      permissions.receivingCreate,
      permissions.receivingPost
    ]) {
      expect(canUseReceiving([permission]), permission).toBe(true);
    }
  });

  test("allows transfer access from every transfer action permission", () => {
    expect(canUseTransfers([])).toBe(false);
    for (const permission of [
      permissions.transferView,
      permissions.transferCreate,
      permissions.transferSubmit,
      permissions.transferCancel,
      permissions.transferDispatch,
      permissions.transferReceive
    ]) {
      expect(canUseTransfers([permission]), permission).toBe(true);
    }
  });

  test("allows stock count access from every count action permission", () => {
    expect(canUseStockCounts([])).toBe(false);
    for (const permission of [
      permissions.stockCountView,
      permissions.stockCountCreate,
      permissions.stockCountEnter,
      permissions.stockCountSubmit,
      permissions.stockCountReview,
      permissions.stockCountCancel
    ]) {
      expect(canUseStockCounts([permission]), permission).toBe(true);
    }
  });

  test("allows wastage access from every wastage action permission", () => {
    expect(canUseWastageReports([])).toBe(false);
    for (const permission of [
      permissions.wastageView,
      permissions.wastageCreate,
      permissions.wastageSubmit,
      permissions.wastageApprove,
      permissions.wastagePost,
      permissions.wastageReverse,
      permissions.wastageReview,
      permissions.wastageCancel
    ]) {
      expect(canUseWastageReports([permission]), permission).toBe(true);
    }
  });

  test("allows stock adjustment access from every adjustment action permission", () => {
    expect(canUseStockAdjustments([])).toBe(false);
    for (const permission of [
      permissions.stockAdjustmentView,
      permissions.stockAdjustmentCreate,
      permissions.stockAdjustmentSubmit,
      permissions.stockAdjustmentCancel
    ]) {
      expect(canUseStockAdjustments([permission]), permission).toBe(true);
    }
  });

  test("allows project tracker access from project permissions", () => {
    expect(canUseProjects([])).toBe(false);
    for (const permission of [
      permissions.projectView,
      permissions.projectCreate,
      permissions.projectManage,
      permissions.projectManageMembers
    ]) {
      expect(canUseProjects([permission]), permission).toBe(true);
    }
    expect(canUseProjects([permissions.projectTemplateView])).toBe(false);
  });

  test("allows restaurant recipe and costing access from Phase 2 permissions", () => {
    expect(canUseRecipesAndCosting([])).toBe(false);
    for (const permission of [
      permissions.recipeView,
      permissions.recipeManage,
      permissions.menuCostView
    ]) {
      expect(canUseRecipesAndCosting([permission]), permission).toBe(true);
    }
    expect(canUseRecipesAndCosting([permissions.inventoryBalanceView])).toBe(false);
  });

  test("allows branch operations access from Phase 2 permission", () => {
    expect(canUseBranchOperations([])).toBe(false);
    expect(canUseBranchOperations([permissions.branchOperationsView])).toBe(true);
    expect(canUseBranchOperations([permissions.branchOperationsCreate])).toBe(true);
    expect(canUseBranchOperations([permissions.branchOperationsReview])).toBe(true);
    expect(canUseBranchOperations([permissions.recipeView])).toBe(false);
  });

  test("allows food safety access from Phase 2 permission", () => {
    expect(canUseFoodSafety([])).toBe(false);
    expect(canUseFoodSafety([permissions.foodSafetyView])).toBe(true);
    expect(canUseFoodSafety([permissions.foodSafetyCreate])).toBe(true);
    expect(canUseFoodSafety([permissions.foodSafetyReview])).toBe(true);
    expect(canUseFoodSafety([permissions.branchOperationsView])).toBe(false);
  });

  test("allows incident access from Phase 2 permission", () => {
    expect(canUseIncidents([])).toBe(false);
    expect(canUseIncidents([permissions.incidentView])).toBe(true);
    expect(canUseIncidents([permissions.incidentCreate])).toBe(true);
    expect(canUseIncidents([permissions.incidentResolve])).toBe(true);
    expect(canUseIncidents([permissions.foodSafetyView])).toBe(false);
  });

  test("allows maintenance access from Phase 2 permission", () => {
    expect(canUseMaintenance([])).toBe(false);
    expect(canUseMaintenance([permissions.maintenanceView])).toBe(true);
    expect(canUseMaintenance([permissions.maintenanceCreate])).toBe(true);
    expect(canUseMaintenance([permissions.maintenanceComplete])).toBe(true);
    expect(canUseMaintenance([permissions.maintenanceCorrect])).toBe(true);
    expect(canUseMaintenance([permissions.incidentView])).toBe(false);
  });

  test("allows finance access from cash deposit declaration permission", () => {
    expect(canUseFinance([])).toBe(false);
    expect(canUseFinance([permissions.financeCashDepositCreate])).toBe(true);
    expect(getDefaultAppRoute([permissions.financeCashDepositCreate])).toBe(
      "/dashboard"
    );
  });
});
