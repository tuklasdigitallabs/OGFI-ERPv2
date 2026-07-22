import {
  canReadPurchaseOrders,
  canUseBranchOperations,
  canUseFoodSafety,
  canUseIncidents,
  canUseMaintenance,
  canUseApprovals,
  canUsePurchaseRequests,
  canUseReceiving,
  canUseRecipesAndCosting,
  canUseStockAdjustments,
  canUseStockCounts,
  canUseTransfers,
  canUseWastageReports,
  permissions
} from "./authorization";
import { type ApprovalQueueItem } from "./approvals";
import type { SessionContext } from "./context";
import {
  getBranchOperationsDashboard,
  type BranchOperationsDashboard
} from "./branchOperations";
import {
  getFoodCostAnalysisDashboard,
  type FoodCostAnalysisDashboard
} from "./recipes";
import { getFoodSafetyDashboard, type FoodSafetyDashboard } from "./foodSafety";
import { getIncidentDashboard, type IncidentDashboard } from "./incidents";
import {
  getInventoryBalanceReconciliation,
  listInventoryBalances
} from "./inventory";
import { getMaintenanceDashboard, type MaintenanceDashboard } from "./maintenance";
import {
  getPurchaseOrderDashboardRead,
  listPurchaseOrders,
  purchaseOrderDashboardProfileHref,
  type PurchaseOrderDashboardRead
} from "./purchaseOrders";
import {
  getPurchaseRequestDashboardRead,
  purchaseRequestDashboardProfileHref,
  type PurchaseRequest,
  type PurchaseRequestDashboardRead
} from "./purchaseRequests";
import {
  getReceivingDashboardRead,
  listGoodsReceipts,
  type ReceivingDashboardRead
} from "./receiving";
import {
  getStockAdjustmentDashboardRead,
  listStockAdjustments,
  type StockAdjustmentDashboardRead
} from "./stockAdjustments";
import {
  getStockCountDashboardRead,
  listStockCounts,
  type StockCountDashboardRead
} from "./stockCounts";
import {
  getTransferDashboardRead,
  listInventoryTransfers,
  transferDashboardProfileHref,
  type TransferDashboardRead
} from "./transfers";
import {
  getWastageDashboardRead,
  listWastageReports,
  type WastageDashboardRead
} from "./wastage";
import {
  getDashboardTrustGatePolicy,
  type DashboardTrustGateMode
} from "./policySettings";

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

export type DashboardQueueItemLegacy = {
  id: string;
  label: string;
  reference: string;
  detail: string;
  status: string;
  href: string;
  tone: BadgeTone;
  nextAction?: string;
  nextActor?: string;
};

export type DashboardQueueItem = DashboardQueueItemLegacy & {
  priority: "CRITICAL" | "HIGH" | "NORMAL";
  severityLabel: string;
  locationName: string;
  ageLabel: string;
  ownerLabel: string;
};

export type DashboardQueueContract = {
  items: DashboardQueueItem[];
  totalCount: number;
  displayedCount: number;
  displayLimit: number;
  availability: "AVAILABLE" | "UNAVAILABLE";
  unavailableDetail?: string;
};

type DashboardQueueItemDraft = Omit<
  DashboardQueueItem,
  "priority" | "severityLabel" | "locationName" | "ageLabel" | "ownerLabel"
> & {
  priority?: DashboardQueueItem["priority"];
  severityLabel?: string;
  locationName?: string;
  ownerLabel?: string;
  dueAt?: string | null;
  sourceAgeAt?: string | null | undefined;
  isOverdue?: boolean;
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
  trustGate: {
    mode: DashboardTrustGateMode;
    label: string;
    isOverridden: boolean;
    sourceDecisionId: string;
  };
  approvalQueue: DashboardQueueItemLegacy[];
  exceptionQueue: DashboardQueueItemLegacy[];
  approvalQueueContract: DashboardQueueContract;
  exceptionQueueContract: DashboardQueueContract;
};

export type OperationalDashboardSource = {
  approvals?: ApprovalQueueItem[];
  approvalPreviewUnavailable?: boolean;
  hasUnavailableSource?: boolean;
  purchaseRequests?: PurchaseRequest[];
  purchaseRequestDashboard?: PurchaseRequestDashboardRead;
  purchaseOrders?: PurchaseOrderSummary[];
  purchaseOrderDashboard?: PurchaseOrderDashboardRead;
  goodsReceipts?: GoodsReceiptSummary[];
  receivingDashboard?: ReceivingDashboardRead;
  transfers?: InventoryTransferSummary[];
  transferDashboard?: TransferDashboardRead;
  stockCounts?: StockCountSummary[];
  stockCountDashboard?: StockCountDashboardRead;
  wastageReports?: WastageReportSummary[];
  wastageDashboard?: WastageDashboardRead;
  stockAdjustments?: StockAdjustmentSummary[];
  stockAdjustmentDashboard?: StockAdjustmentDashboardRead;
  inventoryBalances?: InventoryBalanceSummary[];
  reconciliation?: InventoryReconciliationSummary | null;
  foodCostAnalysis?: FoodCostAnalysisDashboard;
  branchOperations?: BranchOperationsDashboard;
  foodSafety?: FoodSafetyDashboard;
  incidents?: IncidentDashboard;
  maintenance?: MaintenanceDashboard;
  dashboardTrustGate?: Awaited<ReturnType<typeof getDashboardTrustGatePolicy>>;
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
const branchChecklistReviewStatuses = new Set(["SUBMITTED", "MANAGER_REVIEW"]);
const foodSafetyReviewStatuses = new Set(["SUBMITTED", "EXCEPTION_REVIEW"]);
const approvalQueueDisplayLimit = 5;
const exceptionQueueDisplayLimit = 8;

function dateOnly(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10);
}

function dueState(dueAt: string | null | undefined, isOverdue: boolean | undefined) {
  if (isOverdue) {
    return 0;
  }
  if (!dueAt) {
    return 2;
  }
  const dueDate = dateOnly(dueAt);
  if (!dueDate) {
    return 2;
  }
  const today = new Date().toISOString().slice(0, 10);
  return dueDate === today ? 1 : 2;
}

function isDateOverdue(value: string | null | undefined) {
  const dueDate = value ? dateOnly(value) : null;
  return dueDate !== null && dueDate < new Date().toISOString().slice(0, 10);
}

function queueAgeLabel(draft: DashboardQueueItemDraft) {
  const sourceAgeDate = draft.sourceAgeAt ? dateOnly(draft.sourceAgeAt) : null;
  const dueDate = draft.dueAt ? dateOnly(draft.dueAt) : null;
  const dueLabel = draft.isOverdue
    ? dueDate
      ? `Overdue since ${dueDate}`
      : "Overdue"
    : dueState(draft.dueAt, false) === 1
      ? "Due today"
      : dueDate
        ? `Due ${dueDate}`
        : "No due date";

  return sourceAgeDate ? `Open since ${sourceAgeDate} · ${dueLabel}` : dueLabel;
}

function priorityRank(priority: DashboardQueueItem["priority"]) {
  return priority === "CRITICAL" ? 0 : priority === "HIGH" ? 1 : 2;
}

function sourceAgeRank(sourceAgeAt: string | null | undefined) {
  if (!sourceAgeAt) {
    return Number.MAX_SAFE_INTEGER;
  }
  const timestamp = new Date(sourceAgeAt).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function buildDashboardQueueContract(
  session: SessionContext,
  drafts: DashboardQueueItemDraft[],
  displayLimit: number
): DashboardQueueContract {
  const orderedDrafts = [...drafts].sort((left, right) => {
      const leftPriority = left.priority ?? (left.tone === "warning" ? "HIGH" : "NORMAL");
      const rightPriority = right.priority ?? (right.tone === "warning" ? "HIGH" : "NORMAL");
      const priorityDifference = priorityRank(leftPriority) - priorityRank(rightPriority);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const dueDifference =
        dueState(left.dueAt, left.isOverdue) - dueState(right.dueAt, right.isOverdue);
      if (dueDifference !== 0) {
        return dueDifference;
      }

      const ageDifference =
        sourceAgeRank(left.sourceAgeAt) - sourceAgeRank(right.sourceAgeAt);
      if (ageDifference !== 0) {
        return ageDifference;
      }
      return left.reference.localeCompare(right.reference) || left.id.localeCompare(right.id);
    });
  const items = orderedDrafts.map<DashboardQueueItem>((draft) => ({
    id: draft.id,
    label: draft.label,
    reference: draft.reference,
    detail: draft.detail,
    status: draft.status,
    href: draft.href,
    tone: draft.tone,
    ...(draft.nextAction ? { nextAction: draft.nextAction } : {}),
    ...(draft.nextActor ? { nextActor: draft.nextActor } : {}),
    priority: draft.priority ?? (draft.tone === "warning" ? "HIGH" : "NORMAL"),
    severityLabel: draft.severityLabel ?? "No severity reported",
    locationName: draft.locationName ?? session.context.locationName,
    ageLabel: queueAgeLabel(draft),
    ownerLabel: draft.ownerLabel ?? draft.nextActor ?? "Not assigned"
  }));

  return {
    items: items.slice(0, displayLimit),
    totalCount: items.length,
    displayedCount: Math.min(items.length, displayLimit),
    displayLimit,
    availability: "AVAILABLE"
  };
}

function toLegacyDashboardQueueItems(items: DashboardQueueItemLegacy[]) {
  return items.map(
    ({
      id,
      label,
      reference,
      detail,
      status,
      href,
      tone,
      nextAction,
      nextActor
    }) => ({
      id,
      label,
      reference,
      detail,
      status,
      href,
      tone,
      ...(nextAction ? { nextAction } : {}),
      ...(nextActor ? { nextActor } : {})
    })
  );
}

function cardTone(value: number): BadgeTone {
  return value > 0 ? "warning" : "success";
}

function isDashboardTrustGateBlocking(source: OperationalDashboardSource) {
  return source.dashboardTrustGate?.mode === "block";
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

function percent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Pending";
  }
  return `${value.toFixed(1)}%`;
}

export function buildOperationalDashboardModel(
  session: SessionContext,
  source: OperationalDashboardSource
): OperationalDashboard {
  const cards: DashboardCard[] = [];
  const metrics: DashboardMetric[] = [];
  const stockHealth: DashboardMetric[] = [];
  const sourceHealth: DashboardMetric[] = [];
  const exceptionQueue: DashboardQueueItemDraft[] = [];
  const primaryCurrency =
    source.purchaseOrderDashboard?.primaryCurrency ??
    source.purchaseOrders?.find((order) => order.currencyCode)?.currencyCode ??
    "PHP";

  if (source.approvals) {
    cards.push({
      id: "pending-approvals",
      label: "Pending Approvals",
      value: source.approvals.length,
      href: "/approvals",
      description: "Assigned decisions only",
      tone: cardTone(source.approvals.length),
    });
  }

  if (source.purchaseRequests || source.purchaseRequestDashboard) {
    const value = source.purchaseRequestDashboard
      ? source.purchaseRequestDashboard.openCount
      : countByStatus(source.purchaseRequests, purchaseRequestOpenStatuses);
    cards.push({
      id: "open-purchase-requests",
      label: "Open PRs",
      value,
      href: purchaseRequestDashboardProfileHref("purchase-request-open-v1"),
      description: "Draft, pending approval, approved, and returned",
      tone: cardTone(value)
    });
  }

  if (source.purchaseOrders || source.purchaseOrderDashboard) {
    const purchaseOrders = source.purchaseOrders ?? [];
    const value = source.purchaseOrderDashboard
      ? source.purchaseOrderDashboard.openCount
      : countByStatus(purchaseOrders, purchaseOrderOpenStatuses);
    const committedValue = source.purchaseOrderDashboard
      ? source.purchaseOrderDashboard.committedValue
      : purchaseOrders.reduce(
      (total, order) => total + order.totalAmount,
      0
    );
    const openValue = source.purchaseOrderDashboard
      ? source.purchaseOrderDashboard.openValue
      : purchaseOrders.reduce(
      (total, order) => total + order.openValue,
      0
    );
    const receivedValue = source.purchaseOrderDashboard
      ? source.purchaseOrderDashboard.receivedValue
      : purchaseOrders.reduce(
      (total, order) => total + order.receivedValue,
      0
    );
    cards.push({
      id: "open-purchase-orders",
      label: "Open POs",
      value,
      href: purchaseOrderDashboardProfileHref("po-open-v1"),
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

    const overdueOrders = source.purchaseOrderDashboard
      ? source.purchaseOrderDashboard.overdueCandidates
      : purchaseOrders.filter(
          (order) => order.deliveryAgingStatus === "OVERDUE",
        );
    for (const order of overdueOrders) {
      exceptionQueue.push({
        id: `po-${order.id}`,
        label: "Overdue PO",
        reference: order.publicReference,
        detail: `${order.supplierName} / ${order.daysOverdue} day${order.daysOverdue === 1 ? "" : "s"} overdue`,
        status: order.status,
        href: `/purchase-orders/${order.id}`,
        tone: "warning",
        priority: "HIGH",
        locationName: session.context.locationName,
        isOverdue: true
      });
    }
  }

  if (source.goodsReceipts || source.receivingDashboard) {
    const value = source.receivingDashboard
      ? source.receivingDashboard.exceptionCount
      : countRecords(
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

    const receiptCandidates = source.receivingDashboard
      ? source.receivingDashboard.taskCandidates.map((receipt) => ({
          ...receipt,
          discrepancyFlag: true
        }))
      : source.goodsReceipts ?? [];
    for (const receipt of receiptCandidates) {
      if (receipt.discrepancyFlag && receipt.status !== "REVERSED") {
        exceptionQueue.push({
          id: `grn-${receipt.id}`,
          label: "Receiving discrepancy",
          reference: receipt.publicReference,
          detail: `${receipt.supplierName} / ${receipt.purchaseOrderReference}`,
          status: receipt.status,
          href: `/receiving/${receipt.id}`,
          tone: "warning",
          priority: "HIGH",
          locationName: session.context.locationName,
          sourceAgeAt: "receivedAt" in receipt ? receipt.receivedAt : undefined
        });
      }
    }
  }

  if (source.transfers || source.transferDashboard) {
    const value = source.transferDashboard
      ? source.transferDashboard.followUpCount
      : countByStatus(source.transfers, transferExceptionStatuses);
    cards.push({
      id: "transfer-follow-up",
      label: "Transfer Follow-up",
      value,
      href: transferDashboardProfileHref("transfer-follow-up-v1"),
      description: "Requested, dispatched, partial, or disputed",
      tone: cardTone(value)
    });

    const transferCandidates = source.transferDashboard
      ? source.transferDashboard.taskCandidates
      : source.transfers ?? [];
    for (const transfer of transferCandidates) {
      if (["DISPATCHED", "PARTIALLY_RECEIVED", "DISPUTED"].includes(transfer.status)) {
        exceptionQueue.push({
          id: `transfer-${transfer.id}`,
          label: "Transfer follow-up",
          reference: transfer.publicReference,
          detail: `${transfer.sourceLocationName} to ${transfer.destinationLocationName}`,
          status: transfer.status,
          href: `/transfers/${transfer.id}`,
          tone: "warning",
          priority: transfer.status === "DISPUTED" ? "HIGH" : "NORMAL",
          locationName: transfer.destinationLocationName,
          sourceAgeAt: "createdAt" in transfer ? transfer.createdAt : undefined
        });
      }
    }
  }

  if (source.stockCounts || source.stockCountDashboard) {
    const value = source.stockCountDashboard
      ? source.stockCountDashboard.varianceCount
      : source.stockCounts?.filter(
          (count) => countActionStatuses.has(count.status) && count.varianceCount > 0
        ).length ?? 0;
    cards.push({
      id: "count-variance",
      label: "Count Variance",
      value,
      href: "/counts",
      description: "Reviewed or submitted counts with variance",
      tone: cardTone(value)
    });

    const stockCountCandidates = source.stockCountDashboard
      ? source.stockCountDashboard.taskCandidates.map((count) => ({
          ...count,
          varianceCount: count.varianceLineCount
        }))
      : source.stockCounts ?? [];
    for (const count of stockCountCandidates) {
      if (countActionStatuses.has(count.status) && count.varianceCount > 0) {
        exceptionQueue.push({
          id: `count-${count.id}`,
          label: "Count variance",
          reference: count.publicReference,
          detail: `${count.inventoryLocationName} / ${count.varianceCount} line${count.varianceCount === 1 ? "" : "s"}`,
          status: count.status,
          href: `/counts/${count.id}`,
          tone: "warning",
          priority: "HIGH",
          locationName: count.inventoryLocationName,
          sourceAgeAt: "createdAt" in count ? count.createdAt : undefined
        });
      }
    }
  }

  if (source.wastageReports || source.wastageDashboard) {
    const value = source.wastageDashboard
      ? source.wastageDashboard.exceptionCount
      : countRecords(
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

    const wastageCandidates = source.wastageDashboard
      ? source.wastageDashboard.taskCandidates
      : source.wastageReports ?? [];
    for (const report of wastageCandidates) {
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
          tone: "warning",
          priority: "HIGH",
          locationName: report.inventoryLocationName,
          sourceAgeAt: "createdAt" in report ? report.createdAt : undefined
        });
      }
    }
  }

  if (source.stockAdjustments || source.stockAdjustmentDashboard) {
    const value = source.stockAdjustmentDashboard
      ? source.stockAdjustmentDashboard.exceptionCount
      : countByStatus(
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

    const adjustmentCandidates = source.stockAdjustmentDashboard
      ? source.stockAdjustmentDashboard.taskCandidates
      : source.stockAdjustments ?? [];
    for (const adjustment of adjustmentCandidates) {
      if (stockAdjustmentExceptionStatuses.has(adjustment.status)) {
        exceptionQueue.push({
          id: `adjustment-${adjustment.id}`,
          label: "Adjustment follow-up",
          reference: adjustment.publicReference,
          detail: `${adjustment.inventoryLocationName} / ${adjustment.adjustmentType.toLowerCase()} / ${adjustment.lineCount} line${adjustment.lineCount === 1 ? "" : "s"}`,
          status: adjustment.status,
          href: `/adjustments/${adjustment.id}`,
          tone: "warning",
          priority: "HIGH",
          locationName: adjustment.inventoryLocationName,
          sourceAgeAt: "createdAt" in adjustment ? adjustment.createdAt : undefined
        });
      }
    }
  }

  if (source.reconciliation && !isDashboardTrustGateBlocking(source)) {
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
        tone: "warning",
        priority: "HIGH",
        locationName: row.inventoryLocationName
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

  if (source.foodCostAnalysis) {
    const varianceAmount = source.foodCostAnalysis.varianceAmount ?? 0;
    const overTargetRows = source.foodCostAnalysis.statusCounts.ABOVE_TARGET;
    const missingCostRows = source.foodCostAnalysis.statusCounts.MISSING_COST;
    const awaitingActualRows = source.foodCostAnalysis.statusCounts.AWAITING_ACTUALS;
    const foodCostExceptionRows = overTargetRows + missingCostRows;

    cards.push({
      id: "food-cost-exceptions",
      label: "Food Cost Exceptions",
      value: foodCostExceptionRows,
      href: "/recipes/analysis",
      description: "Menu rows above target or missing recipe cost",
      tone: cardTone(foodCostExceptionRows)
    });
    metrics.push(
      {
        id: "restaurant-net-sales",
        label: "Net sales",
        displayValue: currency(source.foodCostAnalysis.netSalesAmount),
        detail: `${number(source.foodCostAnalysis.quantitySold)} sold units from posted imports`,
        href: "/recipes/analysis",
        tone: source.foodCostAnalysis.netSalesAmount > 0 ? "success" : "neutral"
      },
      {
        id: "theoretical-food-cost",
        label: "Theoretical food cost",
        displayValue: currency(source.foodCostAnalysis.theoreticalCost),
        detail: `${percent(source.foodCostAnalysis.theoreticalFoodCostPercent)} of imported net sales`,
        href: "/recipes/analysis",
        tone: source.foodCostAnalysis.theoreticalCost > 0 ? "info" : "neutral"
      },
      {
        id: "actual-food-cost",
        label: "Actual food cost",
        displayValue:
          source.foodCostAnalysis.actualCost === null
            ? "Pending"
            : currency(source.foodCostAnalysis.actualCost),
        detail: source.foodCostAnalysis.actualCostSource,
        href: "/recipes/analysis",
        tone: source.foodCostAnalysis.actualCost === null ? "warning" : "info"
      },
      {
        id: "food-cost-variance",
        label: "Food cost variance",
        displayValue:
          source.foodCostAnalysis.varianceAmount === null
            ? "Pending"
            : currency(Math.abs(varianceAmount)),
        detail: `${percent(source.foodCostAnalysis.variancePercent)} variance from posted actual consumption`,
        href: "/recipes/analysis",
        tone:
          source.foodCostAnalysis.varianceAmount === null
            ? "warning"
            : varianceAmount > 0
              ? "warning"
              : "success"
      },
      {
        id: "food-cost-above-target",
        label: "Above target",
        displayValue: number(overTargetRows),
        detail: "Menu rows above target food-cost percentage",
        href: "/recipes/analysis",
        tone: overTargetRows > 0 ? "warning" : "success"
      },
      {
        id: "food-cost-missing-cost",
        label: "Missing cost",
        displayValue: number(missingCostRows),
        detail: "Menu rows without complete recipe costing",
        href: "/recipes/analysis",
        tone: missingCostRows > 0 ? "warning" : "success"
      },
      {
        id: "food-cost-awaiting-actuals",
        label: "Awaiting actuals",
        displayValue: number(awaitingActualRows),
        detail: "Menu rows waiting for actual ledger evidence",
        href: "/recipes/analysis",
        tone: awaitingActualRows > 0 ? "warning" : "success"
      }
    );

    if (source.foodCostAnalysis.actualCost === null) {
      exceptionQueue.push({
        id: "food-cost-actual-ledger-pending",
        label: "Actual ledger pending",
        reference: source.foodCostAnalysis.businessDate ?? "No business date",
        detail: source.foodCostAnalysis.actualCostSource,
        status: "AWAITING_ACTUALS",
        href: "/recipes/analysis",
        tone: "warning",
        nextAction: "Review actual ledger evidence",
        priority: "HIGH",
        locationName: source.foodCostAnalysis.locationName
      });
    }

    for (const row of source.foodCostAnalysis.rows
      .filter((analysisRow) =>
        ["ABOVE_TARGET", "MISSING_COST"].includes(analysisRow.status)
      )
      .slice(0, 3)) {
      exceptionQueue.push({
        id: `food-cost-${row.menuItemId}`,
        label: "Food cost follow-up",
        reference: row.menuItemName,
        detail: `${row.status.replaceAll("_", " ").toLowerCase()} / ${currency(row.netSalesAmount)} sales`,
        status: row.status,
        href: "/recipes/analysis",
        tone: "warning",
        nextAction: "Review recipe cost and sales evidence",
        priority: "HIGH",
        locationName: source.foodCostAnalysis.locationName
      });
    }
  }

  if (source.branchOperations) {
    const reviewReadyChecklistCount =
      source.branchOperations.statusCounts.SUBMITTED +
      source.branchOperations.statusCounts.MANAGER_REVIEW;
    const reviewReadyChecklists = source.branchOperations.checklists.filter(
      (checklistSummary) =>
        branchChecklistReviewStatuses.has(checklistSummary.status)
    );
    cards.push({
      id: "branch-checklist-exceptions",
      label: "Checklist Exceptions",
      value: source.branchOperations.openExceptions,
      href: "/branch-operations",
      description: `${source.branchOperations.averageCompletionPercent.toFixed(0)}% average completion`,
      tone: cardTone(source.branchOperations.openExceptions)
    });
    cards.push({
      id: "branch-checklist-reviews",
      label: "Checklist Reviews",
      value: reviewReadyChecklistCount,
      href: "/branch-operations",
      description: "Submitted or manager-review checklists",
      tone: cardTone(reviewReadyChecklistCount)
    });
    metrics.push(
      {
        id: "branch-critical-exception-count",
        label: "Critical checklist exceptions",
        displayValue: number(source.branchOperations.severityCounts.CRITICAL),
        detail: "Critical branch checklist line exceptions in current scope",
        href: "/branch-operations",
        tone:
          source.branchOperations.severityCounts.CRITICAL > 0
            ? "warning"
            : "success"
      },
      {
        id: "branch-manager-review-count",
        label: "Manager review checklists",
        displayValue: number(source.branchOperations.statusCounts.MANAGER_REVIEW),
        detail: "Branch checklists waiting for manager review",
        href: "/branch-operations",
        tone:
          source.branchOperations.statusCounts.MANAGER_REVIEW > 0
            ? "warning"
            : "success"
      },
      {
        id: "branch-reviewed-count",
        label: "Reviewed checklists",
        displayValue: number(source.branchOperations.statusCounts.REVIEWED),
        detail: "Reviewed branch checklists in current scope",
        href: "/branch-operations",
        tone: "success"
      }
    );

    for (const checklist of reviewReadyChecklists.slice(0, 3)) {
      exceptionQueue.push({
        id: `branch-review-${checklist.id}`,
        label: "Checklist review",
        reference: checklist.checklistName,
        detail: `${checklist.businessDate} / ${checklist.shiftType.toLowerCase()} / ${checklist.exceptionCount} exception${checklist.exceptionCount === 1 ? "" : "s"}`,
        status: checklist.status,
        href: `/branch-operations/${checklist.id}`,
        tone: "warning",
        nextAction: "Review checklist",
        priority: "HIGH",
        locationName: checklist.locationName,
        sourceAgeAt: checklist.businessDate
      });
    }

    for (const checklist of source.branchOperations.checklists
      .filter((checklistSummary) => checklistSummary.exceptionCount > 0)
      .slice(0, 3)) {
      exceptionQueue.push({
        id: `branch-ops-${checklist.id}`,
        label: "Checklist exception",
        reference: checklist.checklistName,
        detail: `${checklist.businessDate} / ${checklist.exceptionCount} exception${checklist.exceptionCount === 1 ? "" : "s"}`,
        status: checklist.status,
        href: `/branch-operations/${checklist.id}`,
        tone: checklist.lines.some(
          (line) => line.result === "EXCEPTION" && line.severity === "CRITICAL"
        )
          ? "warning"
          : "info",
        nextAction: "Investigate checklist exception",
        priority: checklist.lines.some(
          (line) => line.result === "EXCEPTION" && line.severity === "CRITICAL"
        )
          ? "CRITICAL"
          : "NORMAL",
        severityLabel: checklist.lines.some(
          (line) => line.result === "EXCEPTION" && line.severity === "CRITICAL"
        )
          ? "CRITICAL"
          : "No severity reported",
        locationName: checklist.locationName,
        sourceAgeAt: checklist.businessDate
      });
    }
  }

  if (source.foodSafety) {
    const reviewReadyLogCount =
      source.foodSafety.statusCounts.SUBMITTED +
      source.foodSafety.statusCounts.EXCEPTION_REVIEW;
    const reviewReadyLogs = source.foodSafety.logs.filter((logSummary) =>
      foodSafetyReviewStatuses.has(logSummary.status)
    );
    cards.push({
      id: "food-safety-exceptions",
      label: "Food Safety Exceptions",
      value: source.foodSafety.exceptionCount,
      href: "/food-safety",
      description: `${source.foodSafety.totalReadings} reading${source.foodSafety.totalReadings === 1 ? "" : "s"} checked`,
      tone: cardTone(source.foodSafety.exceptionCount)
    });
    cards.push({
      id: "food-safety-reviews",
      label: "Food Safety Reviews",
      value: reviewReadyLogCount,
      href: "/food-safety",
      description: "Submitted or exception-review logs",
      tone: cardTone(reviewReadyLogCount)
    });
    metrics.push(
      {
        id: "food-safety-critical-count",
        label: "Critical food-safety exceptions",
        displayValue: number(source.foodSafety.severityCounts.CRITICAL),
        detail: "Critical food-safety reading exceptions in current scope",
        href: "/food-safety",
        tone:
          source.foodSafety.severityCounts.CRITICAL > 0 ? "warning" : "success"
      },
      {
        id: "food-safety-exception-review-count",
        label: "Exception review logs",
        displayValue: number(source.foodSafety.statusCounts.EXCEPTION_REVIEW),
        detail: "Food-safety logs waiting for exception review",
        href: "/food-safety",
        tone:
          source.foodSafety.statusCounts.EXCEPTION_REVIEW > 0
            ? "warning"
            : "success"
      },
      {
        id: "food-safety-reviewed-count",
        label: "Reviewed food-safety logs",
        displayValue: number(source.foodSafety.statusCounts.REVIEWED),
        detail: "Reviewed food-safety logs in current scope",
        href: "/food-safety",
        tone: "success"
      }
    );

    for (const log of reviewReadyLogs.slice(0, 3)) {
      exceptionQueue.push({
        id: `food-safety-review-${log.id}`,
        label: "Food safety review",
        reference: log.title,
        detail: `${log.businessDate} / ${log.logType.toLowerCase()} / ${log.exceptionCount} exception${log.exceptionCount === 1 ? "" : "s"}`,
        status: log.status,
        href: `/food-safety/${log.id}`,
        tone: "warning",
        nextAction: "Review food-safety log",
        priority: "HIGH",
        locationName: log.locationName,
        sourceAgeAt: log.businessDate
      });
    }

    for (const log of source.foodSafety.logs
      .filter((logSummary) => logSummary.exceptionCount > 0)
      .slice(0, 3)) {
      exceptionQueue.push({
        id: `food-safety-${log.id}`,
        label: "Food safety exception",
        reference: log.title,
        detail: `${log.businessDate} / ${log.exceptionCount} exception${log.exceptionCount === 1 ? "" : "s"}`,
        status: log.status,
        href: `/food-safety/${log.id}`,
        tone: log.readings.some(
          (reading) =>
            reading.result === "EXCEPTION" && reading.severity === "CRITICAL"
        )
          ? "warning"
          : "info",
        nextAction: "Acknowledge food-safety deviation",
        priority: log.readings.some(
          (reading) => reading.result === "EXCEPTION" && reading.severity === "CRITICAL"
        )
          ? "CRITICAL"
          : "NORMAL",
        severityLabel: log.readings.some(
          (reading) =>
            reading.result === "EXCEPTION" && reading.severity === "CRITICAL"
        )
          ? "CRITICAL"
          : "No severity reported",
        locationName: log.locationName,
        sourceAgeAt: log.businessDate
      });
    }
  }

  if (source.incidents) {
    const openIncidentCount =
      source.incidents.statusCounts.OPEN +
      source.incidents.statusCounts.IN_PROGRESS +
      source.incidents.statusCounts.PENDING_REVIEW;
    cards.push({
      id: "open-operational-incidents",
      label: "Open Incidents",
      value: openIncidentCount,
      href: "/incidents",
      description: `${source.incidents.overdueIncidents} overdue corrective action${source.incidents.overdueIncidents === 1 ? "" : "s"}`,
      tone: cardTone(openIncidentCount)
    });
    metrics.push(
      {
        id: "incident-critical-count",
        label: "Critical incidents",
        displayValue: number(source.incidents.severityCounts.CRITICAL),
        detail: "Critical incident records in current scope",
        href: "/incidents",
        tone: source.incidents.severityCounts.CRITICAL > 0 ? "warning" : "success"
      },
      {
        id: "incident-pending-review-count",
        label: "Incident review",
        displayValue: number(source.incidents.statusCounts.PENDING_REVIEW),
        detail: "Incidents waiting for closure review",
        href: "/incidents",
        tone:
          source.incidents.statusCounts.PENDING_REVIEW > 0 ? "warning" : "success"
      },
      {
        id: "incident-overdue-count",
        label: "Incident overdue",
        displayValue: number(source.incidents.overdueIncidents),
        detail: "Incidents past corrective-action due date",
        href: "/incidents",
        tone: source.incidents.overdueIncidents > 0 ? "warning" : "success"
      }
    );

    for (const incident of source.incidents.incidents
      .filter((incidentSummary) =>
        ["OPEN", "IN_PROGRESS", "PENDING_REVIEW"].includes(incidentSummary.status)
      )
      .slice(0, 3)) {
      exceptionQueue.push({
        id: `incident-${incident.id}`,
        label: "Incident follow-up",
        reference: incident.incidentNumber,
        detail: `${incident.title} / ${incident.severity.toLowerCase()}`,
        status: incident.status,
        href: `/incidents/${incident.id}`,
        tone: incident.severity === "CRITICAL" ? "warning" : "info",
        nextAction:
          incident.status === "PENDING_REVIEW"
            ? "Review closure evidence"
            : "Assign or resolve incident",
        nextActor: incident.ownerName ?? "Unassigned",
        priority:
          incident.severity === "CRITICAL"
            ? "CRITICAL"
            : incident.severity === "HIGH"
              ? "HIGH"
              : "NORMAL",
        severityLabel: incident.severity,
        locationName: incident.locationName,
        ownerLabel: incident.ownerName ?? "Not assigned",
        dueAt: incident.dueAt,
        sourceAgeAt: incident.incidentDate,
        isOverdue: isDateOverdue(incident.dueAt)
      });
    }
  }

  if (source.maintenance) {
    const openMaintenanceCount =
      source.maintenance.statusCounts.OPEN +
      source.maintenance.statusCounts.IN_PROGRESS +
      source.maintenance.statusCounts.PENDING_VENDOR;
    cards.push({
      id: "maintenance-follow-up",
      label: "Maintenance Follow-up",
      value: openMaintenanceCount,
      href: "/maintenance",
      description: `${source.maintenance.overdueTickets} overdue / ${source.maintenance.downtimeMinutes} downtime minutes`,
      tone: cardTone(openMaintenanceCount)
    });
    metrics.push(
      {
        id: "maintenance-critical-count",
        label: "Critical maintenance",
        displayValue: number(source.maintenance.priorityCounts.CRITICAL),
        detail: "Critical maintenance tickets in current scope",
        href: "/maintenance",
        tone:
          source.maintenance.priorityCounts.CRITICAL > 0 ? "warning" : "success"
      },
      {
        id: "maintenance-vendor-count",
        label: "Pending vendor",
        displayValue: number(source.maintenance.statusCounts.PENDING_VENDOR),
        detail: "Tickets waiting for vendor action",
        href: "/maintenance",
        tone:
          source.maintenance.statusCounts.PENDING_VENDOR > 0
            ? "warning"
            : "success"
      },
      {
        id: "maintenance-overdue-count",
        label: "Maintenance overdue",
        displayValue: number(source.maintenance.overdueTickets),
        detail: "Tickets past target due date",
        href: "/maintenance",
        tone: source.maintenance.overdueTickets > 0 ? "warning" : "success"
      }
    );

    for (const ticket of source.maintenance.tickets
      .filter((ticketSummary) =>
        ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"].includes(ticketSummary.status)
      )
      .slice(0, 3)) {
      exceptionQueue.push({
        id: `maintenance-${ticket.id}`,
        label: "Maintenance follow-up",
        reference: ticket.ticketNumber,
        detail: `${ticket.assetName} / ${ticket.priority.toLowerCase()}`,
        status: ticket.status,
        href: `/maintenance/${ticket.id}`,
        tone: ticket.priority === "CRITICAL" ? "warning" : "info",
        nextAction:
          ticket.status === "PENDING_VENDOR"
            ? "Follow up vendor"
            : "Update or complete ticket",
        nextActor: ticket.ownerName ?? "Unassigned",
        priority:
          ticket.priority === "CRITICAL"
            ? "CRITICAL"
            : ticket.priority === "HIGH"
              ? "HIGH"
              : "NORMAL",
        severityLabel: ticket.priority,
        locationName: ticket.locationName,
        ownerLabel: ticket.ownerName ?? "Not assigned",
        dueAt: ticket.targetDueAt,
        sourceAgeAt: ticket.requestedAt,
        isOverdue: isDateOverdue(ticket.targetDueAt)
      });
    }
  }

  sourceHealth.push(
    ...(source.hasUnavailableSource
      ? [
          {
            id: "dashboard-source-unavailable",
            label: "Dashboard source status",
            displayValue: "Some data unavailable",
            detail:
              "Some dashboard summaries could not be refreshed. Open the source workspace for the authoritative current record.",
            tone: "warning" as const,
          },
        ]
      : []),
    {
      id: "dashboard-trust-gate",
      label: "Reporting trust gate",
      displayValue: source.dashboardTrustGate?.label ?? "Show warning and source link",
      detail: source.dashboardTrustGate?.isOverridden
        ? "Company override is active for unreconciled dashboard source data"
        : "Recommended DEC-0036 dashboard source-data policy is active",
      tone:
        source.dashboardTrustGate?.mode === "show_only"
          ? "warning"
          : source.dashboardTrustGate?.mode === "block"
            ? "success"
            : "info"
    },
    ...(source.reconciliation && isDashboardTrustGateBlocking(source)
      ? [
          {
            id: "ledger-reconciliation-blocked",
            label: "Ledger reconciliation",
            displayValue: "Blocked by trust gate",
            detail: `${source.reconciliation.totalRows} balance row${source.reconciliation.totalRows === 1 ? "" : "s"} withheld until ledger reconciliation is accepted`,
            href: "/inventory",
            tone: "warning" as const
          }
        ]
      : []),
    {
      id: "sales-source",
      label: "Sales / revenue",
      displayValue: source.foodCostAnalysis ? "Import source live" : "Not connected",
      detail: source.foodCostAnalysis
        ? `${source.foodCostAnalysis.salesImportBatches} posted sales import batch${source.foodCostAnalysis.salesImportBatches === 1 ? "" : "es"} in scope`
        : "No approved POS/accounting sales source is live for this scope",
      ...(source.foodCostAnalysis ? { href: "/recipes/analysis" } : {}),
      tone: source.foodCostAnalysis ? "info" : "neutral"
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

  const approvalQueueDrafts = source.approvals?.map((approval) => ({
    id: approval.approvalInstanceId,
    label: approval.documentType,
    reference: approval.publicReference,
    detail: `${approval.requesterName} / ${approval.locationName}`,
    status: approval.status,
    href: `/approvals/${approval.approvalInstanceId}`,
    tone: "warning" as const,
    nextAction: "Review assigned approval",
    nextActor: session.user.displayName,
    priority: "HIGH" as const,
    locationName: approval.locationName,
    ownerLabel: session.user.displayName,
    dueAt: approval.requiredDate,
    isOverdue: isDateOverdue(approval.requiredDate),
  })) ?? [];
  const approvalQueueContract = buildDashboardQueueContract(
    session,
    approvalQueueDrafts,
    approvalQueueDisplayLimit
  );
  if (source.approvalPreviewUnavailable) {
    approvalQueueContract.availability = "UNAVAILABLE";
    approvalQueueContract.unavailableDetail =
      "Use Approval Inbox while approval-routing transition safeguards are active.";
  }
  const exceptionQueueContract = buildDashboardQueueContract(
    session,
    exceptionQueue,
    exceptionQueueDisplayLimit
  );

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
    trustGate: {
      mode: source.dashboardTrustGate?.mode ?? "warn_and_link",
      label: source.dashboardTrustGate?.label ?? "Show warning and source link",
      isOverridden: source.dashboardTrustGate?.isOverridden ?? false,
      sourceDecisionId: source.dashboardTrustGate?.sourceDecisionId ?? "DEC-0036"
    },
    approvalQueue: toLegacyDashboardQueueItems(
      approvalQueueDrafts.slice(0, approvalQueueDisplayLimit),
    ),
    exceptionQueue: toLegacyDashboardQueueItems(
      exceptionQueue.slice(0, exceptionQueueDisplayLimit)
    ),
    approvalQueueContract,
    exceptionQueueContract
  };
}

export async function getOperationalDashboard(
  session: SessionContext
): Promise<OperationalDashboard> {
  const source: OperationalDashboardSource = {};

  const sourceResults = await Promise.allSettled([
    canUseApprovals(session.permissionCodes)
      ? Promise.resolve().then(() => {
          source.approvalPreviewUnavailable = true;
        })
      : Promise.resolve(),
    canUsePurchaseRequests(session.permissionCodes)
      ? getPurchaseRequestDashboardRead(session).then((purchaseRequestDashboard) => {
          source.purchaseRequestDashboard = purchaseRequestDashboard;
        })
      : Promise.resolve(),
    canReadPurchaseOrders(session.permissionCodes)
      ? getPurchaseOrderDashboardRead(session).then((purchaseOrderDashboard) => {
          source.purchaseOrderDashboard = purchaseOrderDashboard;
        })
      : Promise.resolve(),
    canUseReceiving(session.permissionCodes)
      ? getReceivingDashboardRead(session).then((receivingDashboard) => {
          source.receivingDashboard = receivingDashboard;
        })
      : Promise.resolve(),
    canUseTransfers(session.permissionCodes)
      ? getTransferDashboardRead(session).then((transferDashboard) => {
          source.transferDashboard = transferDashboard;
        })
      : Promise.resolve(),
    canUseStockCounts(session.permissionCodes)
      ? getStockCountDashboardRead(session).then((stockCountDashboard) => {
          source.stockCountDashboard = stockCountDashboard;
        })
      : Promise.resolve(),
    canUseWastageReports(session.permissionCodes)
      ? getWastageDashboardRead(session).then((wastageDashboard) => {
          source.wastageDashboard = wastageDashboard;
        })
      : Promise.resolve(),
    canUseStockAdjustments(session.permissionCodes)
      ? getStockAdjustmentDashboardRead(session).then((stockAdjustmentDashboard) => {
          source.stockAdjustmentDashboard = stockAdjustmentDashboard;
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
      : Promise.resolve(),
    canUseRecipesAndCosting(session.permissionCodes)
      ? getFoodCostAnalysisDashboard(session).then((foodCostAnalysis) => {
          source.foodCostAnalysis = foodCostAnalysis;
        })
      : Promise.resolve(),
    canUseBranchOperations(session.permissionCodes)
      ? getBranchOperationsDashboard(session).then((branchOperations) => {
          source.branchOperations = branchOperations;
        })
      : Promise.resolve(),
    canUseFoodSafety(session.permissionCodes)
      ? getFoodSafetyDashboard(session).then((foodSafety) => {
          source.foodSafety = foodSafety;
        })
      : Promise.resolve(),
    canUseIncidents(session.permissionCodes)
      ? getIncidentDashboard(session).then((incidents) => {
          source.incidents = incidents;
        })
      : Promise.resolve(),
    canUseMaintenance(session.permissionCodes)
      ? getMaintenanceDashboard(session).then((maintenance) => {
          source.maintenance = maintenance;
        })
      : Promise.resolve(),
    getDashboardTrustGatePolicy(session).then((dashboardTrustGate) => {
      source.dashboardTrustGate = dashboardTrustGate;
    })
  ]);
  source.hasUnavailableSource = sourceResults.some(
    (result) => result.status === "rejected",
  );

  return buildOperationalDashboardModel(session, source);
}
