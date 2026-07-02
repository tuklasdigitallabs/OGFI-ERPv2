import { describe, expect, test } from "vitest";
import {
  canReadPurchaseOrders,
  canUseApprovals,
  canUsePurchaseRequests,
  canUseProjects,
  canUseReceiving,
  canUseStockAdjustments,
  canUseStockCounts,
  canUseTransfers,
  canUseWastageReports,
  getDefaultAppRoute,
  permissions
} from "./authorization";

describe("module access permission helpers", () => {
  test("selects the first accessible default app route", () => {
    expect(getDefaultAppRoute([permissions.coreAdminister])).toBe("/admin");
    expect(getDefaultAppRoute([permissions.purchaseRequestCreate])).toBe(
      "/purchase-requests"
    );
    expect(getDefaultAppRoute([permissions.purchaseRequestApprove])).toBe(
      "/purchase-requests"
    );
    expect(getDefaultAppRoute([permissions.purchaseOrderApprove])).toBe("/approvals");
    expect(getDefaultAppRoute([permissions.inventoryBalanceView])).toBe("/inventory");
    expect(getDefaultAppRoute([permissions.inventoryLedgerView])).toBe(
      "/inventory/ledger"
    );
    expect(getDefaultAppRoute([permissions.purchaseOrderView])).toBe(
      "/purchase-orders"
    );
    expect(getDefaultAppRoute([permissions.receivingView])).toBe("/receiving");
    expect(getDefaultAppRoute([permissions.transferView])).toBe("/transfers");
    expect(getDefaultAppRoute([permissions.stockCountView])).toBe("/counts");
    expect(getDefaultAppRoute([permissions.wastageView])).toBe("/wastage");
    expect(getDefaultAppRoute([permissions.stockAdjustmentView])).toBe(
      "/adjustments"
    );
    expect(getDefaultAppRoute([permissions.quoteManage])).toBe("/quotes");
    expect(getDefaultAppRoute([permissions.projectTemplateView])).toBe(
      "/project-templates"
    );
    expect(getDefaultAppRoute([permissions.projectView])).toBe("/projects");
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
      permissions.wastageApprove
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
});
