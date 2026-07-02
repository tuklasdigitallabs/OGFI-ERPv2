import {
  canReadPurchaseOrders,
  canUseApprovals,
  canUsePurchaseRequests,
  canUseReceiving,
  canUseStockAdjustments,
  canUseStockCounts,
  canUseTransfers,
  canUseWastageReports,
  permissions
} from "./authorization";
import { listPendingApprovals, type ApprovalQueueItem } from "./approvals";
import type { SessionContext } from "./context";
import {
  getInventoryBalanceReconciliation,
  listInventoryBalances
} from "./inventory";
import { listPurchaseOrders } from "./purchaseOrders";
import { listPurchaseRequests, type PurchaseRequest } from "./purchaseRequests";
import { listGoodsReceipts } from "./receiving";
import { listStockAdjustments } from "./stockAdjustments";
import { listStockCounts } from "./stockCounts";
import { listInventoryTransfers } from "./transfers";
import { listWastageReports } from "./wastage";

type BadgeTone = "neutral" | "info" | "success" | "warning";

type PurchaseOrderSummary = Awaited<ReturnType<typeof listPurchaseOrders>>[number];
type GoodsReceiptSummary = Awaited<ReturnType<typeof listGoodsReceipts>>[number];
type InventoryTransferSummary = Awaited<
  ReturnType<typeof listInventoryTransfers>
>[number];
type StockCountSummary = Awaited<ReturnType<typeof listStockCounts>>[number];
type WastageReportSummary = Awaited<ReturnType<typeof listWastageReports>>[number];
type StockAdjustmentSummary = Awaited<
  ReturnType<typeof listStockAdjustments>
>[number];
type InventoryBalanceSummary = Awaited<
  ReturnType<typeof listInventoryBalances>
>[number];
type InventoryReconciliationSummary = Awaited<
  ReturnType<typeof getInventoryBalanceReconciliation>
>;

export type DashboardCard = {
  id: string;
  label: string;
  value: number;
  href: string;
  description: string;
  tone: BadgeTone;
};

export type DashboardQueueItem = {
  id: string;
  label: string;
  reference: string;
  detail: string;
  status: string;
  href: string;
  tone: BadgeTone;
};

export type DashboardMetric = {
  id: string;
  label: string;
  displayValue: string;
  detail: string;
  href?: string;
  tone: BadgeTone;
};

export type OperationalDashboard = {
  generatedAt: string;
  scope: {
    companyName: string;
    brandName: string;
    locationName: string;
    locationType: string;
  };
  cards: DashboardCard[];
  metrics: DashboardMetric[];
  stockHealth: DashboardMetric[];
  sourceHealth: DashboardMetric[];
  approvalQueue: DashboardQueueItem[];
  exceptionQueue: DashboardQueueItem[];
};

export type OperationalDashboardSource = {
  approvals?: ApprovalQueueItem[];
  purchaseRequests?: PurchaseRequest[];
  purchaseOrders?: PurchaseOrderSummary[];
  goodsReceipts?: GoodsReceiptSummary[];
  transfers?: InventoryTransferSummary[];
  stockCounts?: StockCountSummary[];
  wastageReports?: WastageReportSummary[];
  stockAdjustments?: StockAdjustmentSummary[];
  inventoryBalances?: InventoryBalanceSummary[];
  reconciliation?: InventoryReconciliationSummary | null;
};

const purchaseRequestOpenStatuses = new Set([
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "RETURNED"
]);
const purchaseOrderOpenStatuses = new Set([
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "ISSUED",
  "AMENDMENT_PENDING",
  "PARTIALLY_RECEIVED"
]);
const receivingExceptionStatuses = new Set([
  "DRAFT",
  "POSTING",
  "POSTED_WITH_DISCREPANCY"
]);
const transferExceptionStatuses = new Set([
  "REQUESTED",
  "DISPATCHED",
  "PARTIALLY_RECEIVED",
  "DISPUTED"
]);
const countActionStatuses = new Set([
  "SUBMITTED",
  "REVIEWED",
  "RECOUNT_REQUESTED"
]);
const wastageExceptionStatuses = new Set([
  "PENDING_APPROVAL",
  "APPROVED",
  "POSTING",
  "RETURNED"
]);
const stockAdjustmentExceptionStatuses = new Set([
  "PENDING_APPROVAL",
  "APPROVED",
  "POSTING",
  "RETURNED"
]);

function cardTone(value: number): BadgeTone {
  return value > 0 ? "warning" : "success";
}

function countByStatus<T extends { status: string }>(
  records: T[] | undefined,
  statuses: Set<string>
) {
  return records?.filter((record) => statuses.has(record.status)).length ?? 0;
}

function countRecords<T>(
  records: T[] | undefined,
  predicate: (record: T) => boolean
) {
  return records?.filter(predicate).length ?? 0;
}

function currency(value: number, currencyCode = "PHP") {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0
  }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 0
  }).format(value);
}

export function buildOperationalDashboardModel(
  session: SessionContext,
  source: OperationalDashboardSource
): OperationalDashboard {
  const cards: DashboardCard[] = [];
  const metrics: DashboardMetric[] = [];
  const stockHealth: DashboardMetric[] = [];
  const sourceHealth: DashboardMetric[] = [];
  const exceptionQueue: DashboardQueueItem[] = [];
  const primaryCurrency =
    source.purchaseOrders?.find((order) => order.currencyCode)?.currencyCode ?? "PHP";

  if (source.approvals) {
    cards.push({
      id: "pending-approvals",
      label: "Pending Approvals",
      value: source.approvals.length,
      href: "/approvals",
      description: "Assigned decisions only",
      tone: cardTone(source.approvals.length)
    });
  }

  if (source.purchaseRequests) {
    const value = countByStatus(source.purchaseRequests, purchaseRequestOpenStatuses);
    cards.push({
      id: "open-purchase-requests",
      label: "Open PRs",
      value,
      href: "/purchase-requests",
      description: "Draft, returned, and pending approval",
      tone: cardTone(value)
    });
  }

  if (source.purchaseOrders) {
    const value = countByStatus(source.purchaseOrders, purchaseOrderOpenStatuses);
    const committedValue = source.purchaseOrders.reduce(
      (total, order) => total + order.totalAmount,
      0
    );
    const openValue = source.purchaseOrders.reduce(
      (total, order) => total + order.openValue,
      0
    );
    const receivedValue = source.purchaseOrders.reduce(
      (total, order) => total + order.receivedValue,
      0
    );
    cards.push({
      id: "open-purchase-orders",
      label: "Open POs",
      value,
      href: "/purchase-orders",
      description: "Approval, issue, and receiving pipeline",
      tone: cardTone(value)
    });
    metrics.push(
      {
        id: "po-commitment-value",
        label: "PO commitment",
        displayValue: currency(committedValue, primaryCurrency),
        detail: "Approved/draft PO value in selected scope",
        href: "/purchase-orders",
        tone: committedValue > 0 ? "info" : "neutral"
      },
      {
        id: "open-po-exposure",
        label: "Open PO exposure",
        displayValue: currency(openValue, primaryCurrency),
        detail: "Remaining value not yet received or closed",
        href: "/purchase-orders",
        tone: openValue > 0 ? "warning" : "success"
      },
      {
        id: "received-po-value",
        label: "Received value",
        displayValue: currency(receivedValue, primaryCurrency),
        detail: "PO value already received into operations",
        href: "/receiving",
        tone: receivedValue > 0 ? "success" : "neutral"
      }
    );

    for (const order of source.purchaseOrders) {
      if (order.deliveryAgingStatus === "OVERDUE") {
        exceptionQueue.push({
          id: `po-${order.id}`,
          label: "Overdue PO",
          reference: order.publicReference,
          detail: `${order.supplierName} / ${order.daysOverdue} day${order.daysOverdue === 1 ? "" : "s"} overdue`,
          status: order.status,
          href: `/purchase-orders/${order.id}`,
          tone: "warning"
        });
      }
    }
  }

  if (source.goodsReceipts) {
    const value = countRecords(
      source.goodsReceipts,
      (receipt) =>
        receivingExceptionStatuses.has(receipt.status) ||
        (receipt.discrepancyFlag && receipt.status !== "REVERSED")
    );
    cards.push({
      id: "receiving-variance",
      label: "Receiving Variance",
      value,
      href: "/receiving",
      description: "Draft, posting, or discrepancy receipts",
      tone: cardTone(value)
    });

    for (const receipt of source.goodsReceipts) {
      if (receipt.discrepancyFlag && receipt.status !== "REVERSED") {
        exceptionQueue.push({
          id: `grn-${receipt.id}`,
          label: "Receiving discrepancy",
          reference: receipt.publicReference,
          detail: `${receipt.supplierName} / ${receipt.purchaseOrderReference}`,
          status: receipt.status,
          href: `/receiving/${receipt.id}`,
          tone: "warning"
        });
      }
    }
  }

  if (source.transfers) {
    const value = countByStatus(source.transfers, transferExceptionStatuses);
    cards.push({
      id: "transfer-follow-up",
      label: "Transfer Follow-up",
      value,
      href: "/transfers",
      description: "Requested, dispatched, partial, or disputed",
      tone: cardTone(value)
    });

    for (const transfer of source.transfers) {
      if (["DISPATCHED", "PARTIALLY_RECEIVED", "DISPUTED"].includes(transfer.status)) {
        exceptionQueue.push({
          id: `transfer-${transfer.id}`,
          label: "Transfer follow-up",
          reference: transfer.publicReference,
          detail: `${transfer.sourceLocationName} to ${transfer.destinationLocationName}`,
          status: transfer.status,
          href: `/transfers/${transfer.id}`,
          tone: "warning"
        });
      }
    }
  }

  if (source.stockCounts) {
    const value = source.stockCounts.filter(
      (count) => countActionStatuses.has(count.status) && count.varianceCount > 0
    ).length;
    cards.push({
      id: "count-variance",
      label: "Count Variance",
      value,
      href: "/counts",
      description: "Reviewed or submitted counts with variance",
      tone: cardTone(value)
    });

    for (const count of source.stockCounts) {
      if (countActionStatuses.has(count.status) && count.varianceCount > 0) {
        exceptionQueue.push({
          id: `count-${count.id}`,
          label: "Count variance",
          reference: count.publicReference,
          detail: `${count.inventoryLocationName} / ${count.varianceCount} line${count.varianceCount === 1 ? "" : "s"}`,
          status: count.status,
          href: `/counts/${count.id}`,
          tone: "warning"
        });
      }
    }
  }

  if (source.wastageReports) {
    const value = countRecords(
      source.wastageReports,
      (report) =>
        wastageExceptionStatuses.has(report.status) ||
        (report.evidenceRequired && !report.evidenceSatisfied)
    );
    cards.push({
      id: "wastage-exceptions",
      label: "Wastage Exceptions",
      value,
      href: "/wastage",
      description: "Pending, returned, or missing evidence",
      tone: cardTone(value)
    });

    for (const report of source.wastageReports) {
      if (
        wastageExceptionStatuses.has(report.status) ||
        (report.evidenceRequired && !report.evidenceSatisfied)
      ) {
        exceptionQueue.push({
          id: `wastage-${report.id}`,
          label:
            report.evidenceRequired && !report.evidenceSatisfied
              ? "Wastage evidence"
              : "Wastage follow-up",
          reference: report.publicReference,
          detail: `${report.inventoryLocationName} / ${report.lineCount} line${report.lineCount === 1 ? "" : "s"}`,
          status: report.status,
          href: `/wastage/${report.id}`,
          tone: "warning"
        });
      }
    }
  }

  if (source.stockAdjustments) {
    const value = countByStatus(
      source.stockAdjustments,
      stockAdjustmentExceptionStatuses
    );
    cards.push({
      id: "adjustment-exceptions",
      label: "Adjustment Exceptions",
      value,
      href: "/adjustments",
      description: "Approval and posting follow-up",
      tone: cardTone(value)
    });

    for (const adjustment of source.stockAdjustments) {
      if (stockAdjustmentExceptionStatuses.has(adjustment.status)) {
        exceptionQueue.push({
          id: `adjustment-${adjustment.id}`,
          label: "Adjustment follow-up",
          reference: adjustment.publicReference,
          detail: `${adjustment.inventoryLocationName} / ${adjustment.adjustmentType.toLowerCase()} / ${adjustment.lineCount} line${adjustment.lineCount === 1 ? "" : "s"}`,
          status: adjustment.status,
          href: `/adjustments/${adjustment.id}`,
          tone: "warning"
        });
      }
    }
  }

  if (source.reconciliation) {
    cards.push({
      id: "ledger-reconciliation",
      label: "Ledger Variance",
      value: source.reconciliation.varianceRows,
      href: "/inventory",
      description: `${source.reconciliation.totalRows} balance row${source.reconciliation.totalRows === 1 ? "" : "s"} checked`,
      tone: cardTone(source.reconciliation.varianceRows)
    });

    for (const row of source.reconciliation.rows
      .filter((reconciliationRow) => reconciliationRow.status === "VARIANCE")
      .slice(0, 3)) {
      exceptionQueue.push({
        id: `ledger-${row.key}`,
        label: "Ledger variance",
        reference: row.itemCode,
        detail: `${row.inventoryLocationName} / variance ${row.varianceQuantity} ${row.baseUomCode}`,
        status: row.status,
        href: "/inventory",
        tone: "warning"
      });
    }
  }

  if (source.inventoryBalances) {
    const positiveRows = source.inventoryBalances.filter(
      (balance) => balance.qtyOnHand > 0
    );
    const zeroRows = source.inventoryBalances.filter(
      (balance) => balance.qtyOnHand === 0
    );
    const lotTrackedRows = source.inventoryBalances.filter(
      (balance) => balance.lotNumber || balance.expiryDate
    );
    const recentlyUpdatedRows = source.inventoryBalances.filter((balance) => {
      const updatedAt = new Date(balance.updatedAt).getTime();
      const ageDays = (Date.now() - updatedAt) / 86_400_000;
      return ageDays <= 7;
    });

    metrics.push({
      id: "stocked-items",
      label: "Stocked lines",
      displayValue: number(positiveRows.length),
      detail: `${number(source.inventoryBalances.length)} balance row${source.inventoryBalances.length === 1 ? "" : "s"} tracked`,
      href: "/inventory",
      tone: positiveRows.length > 0 ? "success" : "warning"
    });

    stockHealth.push(
      {
        id: "active-stock-rows",
        label: "Active stock rows",
        displayValue: number(positiveRows.length),
        detail: "Rows with on-hand quantity above zero",
        href: "/inventory",
        tone: positiveRows.length > 0 ? "success" : "warning"
      },
      {
        id: "zero-stock-rows",
        label: "Zero stock rows",
        displayValue: number(zeroRows.length),
        detail: "Items configured but currently at zero",
        href: "/inventory",
        tone: zeroRows.length > 0 ? "warning" : "success"
      },
      {
        id: "lot-expiry-coverage",
        label: "Lot / expiry tracked",
        displayValue: number(lotTrackedRows.length),
        detail: "Rows carrying lot or expiry accountability",
        href: "/inventory",
        tone: lotTrackedRows.length > 0 ? "info" : "neutral"
      },
      {
        id: "recent-stock-updates",
        label: "Updated this week",
        displayValue: number(recentlyUpdatedRows.length),
        detail: "Inventory balances touched in the last 7 days",
        href: "/inventory",
        tone: recentlyUpdatedRows.length > 0 ? "info" : "neutral"
      }
    );
  }

  sourceHealth.push(
    {
      id: "sales-source",
      label: "Sales / revenue",
      displayValue: "Not connected",
      detail: "No approved POS/accounting sales source is live in Phase I",
      tone: "neutral"
    },
    {
      id: "inventory-value-source",
      label: "Inventory value",
      displayValue: source.inventoryBalances ? "Qty source live" : "No access",
      detail:
        "On-hand stock is visible; formal valuation needs trusted costing/accounting source",
      ...(source.inventoryBalances ? { href: "/inventory" } : {}),
      tone: source.inventoryBalances ? "info" : "neutral"
    }
  );

  const approvalQueue =
    source.approvals?.slice(0, 5).map((approval) => ({
      id: approval.approvalInstanceId,
      label: approval.documentType,
      reference: approval.publicReference,
      detail: `${approval.requesterName} / ${approval.locationName}`,
      status: approval.status,
      href: `/approvals/${approval.approvalInstanceId}`,
      tone: "warning" as const
    })) ?? [];

  return {
    generatedAt: new Date().toISOString(),
    scope: {
      companyName: session.context.companyName,
      brandName: session.context.brandName,
      locationName: session.context.locationName,
      locationType: session.context.locationType
    },
    cards,
    metrics,
    stockHealth,
    sourceHealth,
    approvalQueue,
    exceptionQueue: exceptionQueue.slice(0, 8)
  };
}

export async function getOperationalDashboard(
  session: SessionContext
): Promise<OperationalDashboard> {
  const source: OperationalDashboardSource = {};

  await Promise.all([
    canUseApprovals(session.permissionCodes)
      ? listPendingApprovals(session).then((approvals) => {
          source.approvals = approvals;
        })
      : Promise.resolve(),
    canUsePurchaseRequests(session.permissionCodes)
      ? listPurchaseRequests(session).then((purchaseRequests) => {
          source.purchaseRequests = purchaseRequests;
        })
      : Promise.resolve(),
    canReadPurchaseOrders(session.permissionCodes)
      ? listPurchaseOrders(session).then((purchaseOrders) => {
          source.purchaseOrders = purchaseOrders;
        })
      : Promise.resolve(),
    canUseReceiving(session.permissionCodes)
      ? listGoodsReceipts(session).then((goodsReceipts) => {
          source.goodsReceipts = goodsReceipts;
        })
      : Promise.resolve(),
    canUseTransfers(session.permissionCodes)
      ? listInventoryTransfers(session).then((transfers) => {
          source.transfers = transfers;
        })
      : Promise.resolve(),
    canUseStockCounts(session.permissionCodes)
      ? listStockCounts(session).then((stockCounts) => {
          source.stockCounts = stockCounts;
        })
      : Promise.resolve(),
    canUseWastageReports(session.permissionCodes)
      ? listWastageReports(session).then((wastageReports) => {
          source.wastageReports = wastageReports;
        })
      : Promise.resolve(),
    canUseStockAdjustments(session.permissionCodes)
      ? listStockAdjustments(session).then((stockAdjustments) => {
          source.stockAdjustments = stockAdjustments;
        })
      : Promise.resolve(),
    session.permissionCodes.includes(permissions.inventoryBalanceView)
      ? listInventoryBalances(session).then((inventoryBalances) => {
          source.inventoryBalances = inventoryBalances;
        })
      : Promise.resolve(),
    session.permissionCodes.includes(permissions.inventoryLedgerView)
      ? getInventoryBalanceReconciliation(session).then((reconciliation) => {
          source.reconciliation = reconciliation;
        })
      : Promise.resolve()
  ]);

  return buildOperationalDashboardModel(session, source);
}
