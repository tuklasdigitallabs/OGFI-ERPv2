import {
  canReadPurchaseOrders,
  canUseBranchOperations,
  canUseFoodSafety,
  canUseIncidents,
  canUseMaintenance,
  canUseApprovals,
  canUsePurchaseRequests,
  canUseReceiving,
  canUseStockAdjustments,
  canUseTransfers,
  canUseWastageReports,
  permissions
} from "./authorization";
import { type ApprovalQueueItem } from "./approvals";
import type { SessionContext } from "./context";
import {
  getBranchOperationsDashboardRead,
  type BranchOperationsDashboard,
  type BranchOperationsDashboardRead
} from "./branchOperations";
import {
  getFoodSafetyDashboardRead,
  type FoodSafetyDashboard,
  type FoodSafetyDashboardRead
} from "./foodSafety";
import {
  getIncidentDashboardRead,
  type IncidentDashboard,
  type IncidentDashboardRead
} from "./incidents";
import {
  getInventoryBalanceDashboardRead,
  getInventoryLedgerVarianceDashboardRead,
  inventoryDashboardProfileHref,
  type InventoryBalanceDashboardRead,
  type InventoryLedgerVarianceDashboardRead
} from "./inventory";
import {
  getMaintenanceDashboardRead,
  type MaintenanceDashboard,
  type MaintenanceDashboardRead
} from "./maintenance";
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
  isReceivingFollowUp,
  listGoodsReceipts,
  receivingDashboardProfileHref,
  receivingFollowUpInclusionReason,
  type ReceivingDashboardRead
} from "./receiving";
import {
  getStockAdjustmentDashboardRead,
  listStockAdjustments,
  stockAdjustmentDashboardProfileHref,
  type StockAdjustmentDashboardRead
} from "./stockAdjustments";
import {
  getTransferDashboardRead,
  listInventoryTransfers,
  transferDashboardProfileHref,
  type TransferDashboardRead
} from "./transfers";
import {
  getWastageDashboardRead,
  listWastageReports,
  wastageDashboardProfileHref,
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
type WastageReportSummary = Awaited<ReturnType<typeof listWastageReports>>[number];
type StockAdjustmentSummary = Awaited<
  ReturnType<typeof listStockAdjustments>
>[number];
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
  totalCount: number | null;
  displayedCount: number;
  displayLimit: number;
  availability: "AVAILABLE" | "UNAVAILABLE";
  completeness: "COMPLETE" | "PARTIAL";
  contributors: DashboardQueueContributor[];
  unavailableDetail?: string;
};

export const dashboardSourceIds = [
  "approvals",
  "purchase-requests",
  "purchase-orders",
  "receiving",
  "transfers",
  "stock-counts",
  "wastage",
  "stock-adjustments",
  "inventory-balances",
  "inventory-reconciliation",
  "branch-operations",
  "food-safety",
  "incidents",
  "maintenance",
  "trust-gate"
] as const;

export type DashboardSourceId = (typeof dashboardSourceIds)[number];

export type DashboardSourceObservation = {
  id: DashboardSourceId;
  label: string;
  href: string;
  availability: "AVAILABLE" | "UNAVAILABLE";
  checkedAt: string;
  dataAsOf?: string;
};

export type DashboardQueueContributor = {
  sourceId: DashboardSourceId;
  availability: "AVAILABLE" | "UNAVAILABLE";
  itemCount: number | null;
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
  contributorSourceId?: DashboardSourceId;
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
  assembledAt: string;
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
    availability: "AVAILABLE" | "UNAVAILABLE";
    mode: DashboardTrustGateMode;
    label: string;
    isOverridden: boolean;
    sourceDecisionId: string;
  };
  approvalQueue: DashboardQueueItemLegacy[];
  exceptionQueue: DashboardQueueItemLegacy[];
  approvalQueueContract: DashboardQueueContract;
  exceptionQueueContract: DashboardQueueContract;
  sourceObservations: DashboardSourceObservation[];
};

export type OperationalDashboardSource = {
  approvals?: ApprovalQueueItem[];
  approvalPreviewUnavailable?: boolean;
  hasUnavailableSource?: boolean;
  unavailableSources?: DashboardUnavailableSource[];
  purchaseRequests?: PurchaseRequest[];
  purchaseRequestDashboard?: PurchaseRequestDashboardRead;
  purchaseOrders?: PurchaseOrderSummary[];
  purchaseOrderDashboard?: PurchaseOrderDashboardRead;
  goodsReceipts?: GoodsReceiptSummary[];
  receivingDashboard?: ReceivingDashboardRead;
  transfers?: InventoryTransferSummary[];
  transferDashboard?: TransferDashboardRead;
  wastageReports?: WastageReportSummary[];
  wastageDashboard?: WastageDashboardRead;
  stockAdjustments?: StockAdjustmentSummary[];
  stockAdjustmentDashboard?: StockAdjustmentDashboardRead;
  inventoryBalanceDashboard?: InventoryBalanceDashboardRead;
  reconciliation?: InventoryLedgerVarianceDashboardRead | null;
  branchOperations?: BranchOperationsDashboard;
  foodSafety?: FoodSafetyDashboard;
  foodSafetyDashboard?: FoodSafetyDashboardRead;
  incidents?: IncidentDashboard;
  incidentDashboard?: IncidentDashboardRead;
  maintenance?: MaintenanceDashboard;
  maintenanceDashboard?: MaintenanceDashboardRead;
  branchOperationsDashboard?: BranchOperationsDashboardRead;
  dashboardTrustGate?: Awaited<ReturnType<typeof getDashboardTrustGatePolicy>>;
  sourceObservations?: DashboardSourceObservation[];
};

type DashboardUnavailableSource = {
  id: DashboardSourceId;
  label: string;
  href: string;
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
const transferExceptionStatuses = new Set([
  "REQUESTED",
  "DISPATCHED",
  "PARTIALLY_RECEIVED",
  "DISPUTED"
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
const defaultOperationalTimeZone = "Asia/Manila";
const exceptionQueueContributorIds = new Set<DashboardSourceId>([
  "purchase-orders",
  "receiving",
  "transfers",
  "stock-counts",
  "wastage",
  "stock-adjustments",
  "inventory-reconciliation",
  "branch-operations",
  "food-safety",
  "incidents",
  "maintenance"
]);

export function dashboardOperationalDate(
  value: string,
  timeZone = defaultOperationalTimeZone
) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(timestamp));
  const year = dateParts.find((part) => part.type === "year")?.value;
  const month = dateParts.find((part) => part.type === "month")?.value;
  const day = dateParts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function dashboardDueState(
  dueAt: string | null | undefined,
  isOverdue: boolean | undefined,
  now = new Date()
) {
  if (isOverdue) {
    return 0;
  }
  if (!dueAt) {
    return 2;
  }
  const dueDate = dashboardOperationalDate(dueAt);
  if (!dueDate) {
    return 2;
  }
  const today = dashboardOperationalDate(now.toISOString());
  return dueDate === today ? 1 : 2;
}

function isDateOverdue(value: string | null | undefined) {
  const dueDate = value ? dashboardOperationalDate(value) : null;
  const today = dashboardOperationalDate(new Date().toISOString());
  return dueDate !== null && today !== null && dueDate < today;
}

function queueAgeLabel(draft: DashboardQueueItemDraft) {
  const sourceAgeDate = draft.sourceAgeAt
    ? dashboardOperationalDate(draft.sourceAgeAt)
    : null;
  const dueDate = draft.dueAt ? dashboardOperationalDate(draft.dueAt) : null;
  const dueLabel = draft.isOverdue
    ? dueDate
      ? `Overdue since ${dueDate}`
      : "Overdue"
    : dashboardDueState(draft.dueAt, false) === 1
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
  displayLimit: number,
  observations: DashboardSourceObservation[] = []
): DashboardQueueContract {
  const orderedDrafts = [...drafts].sort((left, right) => {
      const leftPriority = left.priority ?? (left.tone === "warning" ? "HIGH" : "NORMAL");
      const rightPriority = right.priority ?? (right.tone === "warning" ? "HIGH" : "NORMAL");
      const priorityDifference = priorityRank(leftPriority) - priorityRank(rightPriority);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const dueDifference =
        dashboardDueState(left.dueAt, left.isOverdue) -
        dashboardDueState(right.dueAt, right.isOverdue);
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
  const contributors = observations.map<DashboardQueueContributor>((observation) => ({
    sourceId: observation.id,
    availability: observation.availability,
    itemCount:
      observation.availability === "AVAILABLE"
        ? drafts.filter((draft) => draft.contributorSourceId === observation.id).length
        : null
  }));
  const completeness = contributors.some(
    (contributor) => contributor.availability === "UNAVAILABLE"
  )
    ? "PARTIAL"
    : "COMPLETE";

  return {
    items: items.slice(0, displayLimit),
    totalCount: completeness === "COMPLETE" ? items.length : null,
    displayedCount: Math.min(items.length, displayLimit),
    displayLimit,
    availability: "AVAILABLE",
    completeness,
    contributors
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
  return !source.dashboardTrustGate || source.dashboardTrustGate.mode === "block";
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
        contributorSourceId: "purchase-orders",
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
      ? source.receivingDashboard.followUpCount
      : countRecords(
          source.goodsReceipts,
          isReceivingFollowUp
        );
    cards.push({
      id: "receiving-follow-up",
      label: "Receiving Follow-up",
      value,
      href: receivingDashboardProfileHref("receiving-follow-up-v1"),
      description: "Draft, posting, or discrepancy follow-up",
      tone: cardTone(value)
    });

    const receiptCandidates = source.receivingDashboard
      ? source.receivingDashboard.taskCandidates
      : source.goodsReceipts ?? [];
    for (const receipt of receiptCandidates) {
      if (isReceivingFollowUp(receipt)) {
        const inclusionReason =
          "inclusionReason" in receipt
            ? receipt.inclusionReason
            : receivingFollowUpInclusionReason(receipt);
        exceptionQueue.push({
          id: `grn-${receipt.id}`,
          contributorSourceId: "receiving",
          label: "Receiving follow-up",
          reference: receipt.publicReference,
          detail: `${inclusionReason} / ${receipt.supplierName} / ${receipt.purchaseOrderReference}`,
          status: receipt.status,
          href: `/receiving/${receipt.id}`,
          tone: "warning",
          priority:
            receipt.discrepancyFlag ||
            receipt.status === "POSTED_WITH_DISCREPANCY"
              ? "HIGH"
              : "NORMAL",
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
          contributorSourceId: "transfers",
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

  // Count Variance remains feature-disabled under DEC-0098 until immutable
  // recovery, adjustment lineage, and production evidence gates are closed.
  // Stock Count operational reads remain available in the authoritative Counts
  // workspace, but no dashboard card or exception task may imply activation.

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
      href: wastageDashboardProfileHref("wastage-exceptions-v1"),
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
          contributorSourceId: "wastage",
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
      href: stockAdjustmentDashboardProfileHref("stock-adjustment-exceptions-v1"),
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
          contributorSourceId: "stock-adjustments",
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
      value: source.reconciliation.varianceCount,
      href: inventoryDashboardProfileHref("ledger-variance-v1"),
      description: "Cache-to-ledger difference rows",
      tone: cardTone(source.reconciliation.varianceCount)
    });

    for (const row of source.reconciliation.candidates) {
      exceptionQueue.push({
        id: `ledger-${row.key}`,
        contributorSourceId: "inventory-reconciliation",
        label: "Ledger variance",
        reference: row.itemCode,
        detail: `${row.inventoryLocationName} / variance ${row.varianceQuantity} ${row.baseUomCode}`,
        status: row.status,
        href: inventoryDashboardProfileHref("ledger-variance-v1", {
          query: row.itemCode
        }),
        tone: "warning",
        priority: "HIGH",
        locationName: row.inventoryLocationName
      });
    }
  }

  if (source.inventoryBalanceDashboard) {
    const inventoryBalanceDashboard = source.inventoryBalanceDashboard;
    metrics.push({
      id: "stocked-items",
      label: "Stocked lines",
      displayValue: number(inventoryBalanceDashboard.positiveRows),
      detail: `${number(inventoryBalanceDashboard.totalRows)} balance row${inventoryBalanceDashboard.totalRows === 1 ? "" : "s"} tracked`,
      href: "/inventory",
      tone: inventoryBalanceDashboard.positiveRows > 0 ? "success" : "warning"
    });

    stockHealth.push(
      {
        id: "active-stock-rows",
        label: "Active stock rows",
        displayValue: number(inventoryBalanceDashboard.positiveRows),
        detail: "Rows with on-hand quantity above zero",
        href: "/inventory",
        tone: inventoryBalanceDashboard.positiveRows > 0 ? "success" : "warning"
      },
      {
        id: "zero-stock-rows",
        label: "Zero stock rows",
        displayValue: number(inventoryBalanceDashboard.zeroRows),
        detail: "Items configured but currently at zero",
        href: "/inventory",
        tone: inventoryBalanceDashboard.zeroRows > 0 ? "warning" : "success"
      },
      {
        id: "lot-expiry-coverage",
        label: "Lot / expiry tracked",
        displayValue: number(inventoryBalanceDashboard.lotExpiryTrackedRows),
        detail: "Rows carrying lot or expiry accountability",
        href: "/inventory",
        tone: inventoryBalanceDashboard.lotExpiryTrackedRows > 0 ? "info" : "neutral"
      },
      {
        id: "recent-stock-updates",
        label: "Updated this week",
        displayValue: number(inventoryBalanceDashboard.recentlyUpdatedRows),
        detail: "Inventory balances touched in the last 7 days",
        href: "/inventory",
        tone: inventoryBalanceDashboard.recentlyUpdatedRows > 0 ? "info" : "neutral"
      }
    );
  }

  if (source.branchOperations || source.branchOperationsDashboard) {
    const branchOperations = source.branchOperationsDashboard ?? source.branchOperations!;
    const reviewReadyChecklistCount =
      branchOperations.statusCounts.SUBMITTED +
      branchOperations.statusCounts.MANAGER_REVIEW;
    const reviewReadyChecklists = source.branchOperationsDashboard
      ? source.branchOperationsDashboard.reviewCandidates
      : source.branchOperations!.checklists.filter(
      (checklistSummary) =>
        branchChecklistReviewStatuses.has(checklistSummary.status)
    );
    cards.push({
      id: "branch-checklist-exceptions",
      label: "Checklist Exceptions",
      value: branchOperations.openExceptions,
      href: "/branch-operations",
      description: `${branchOperations.averageCompletionPercent.toFixed(0)}% average completion`,
      tone: cardTone(branchOperations.openExceptions)
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
        displayValue: number(branchOperations.severityCounts.CRITICAL),
        detail: "Critical branch checklist line exceptions in current scope",
        href: "/branch-operations",
        tone:
          branchOperations.severityCounts.CRITICAL > 0
            ? "warning"
            : "success"
      },
      {
        id: "branch-manager-review-count",
        label: "Manager review checklists",
        displayValue: number(branchOperations.statusCounts.MANAGER_REVIEW),
        detail: "Branch checklists waiting for manager review",
        href: "/branch-operations",
        tone:
          branchOperations.statusCounts.MANAGER_REVIEW > 0
            ? "warning"
            : "success"
      },
      {
        id: "branch-reviewed-count",
        label: "Reviewed checklists",
        displayValue: number(branchOperations.statusCounts.REVIEWED),
        detail: "Reviewed branch checklists in current scope",
        href: "/branch-operations",
        tone: "success"
      }
    );

    for (const checklist of reviewReadyChecklists.slice(0, 3)) {
      exceptionQueue.push({
        id: `branch-review-${checklist.id}`,
        contributorSourceId: "branch-operations",
        label: "Checklist review",
        reference: checklist.checklistName,
        detail: `${checklist.businessDate} / ${checklist.shiftType.toLowerCase()} / ${checklist.exceptionCount} exception${checklist.exceptionCount === 1 ? "" : "s"}`,
        status: checklist.status,
        href: `/branch-operations/${checklist.id}`,
        tone: "warning",
        nextAction: "Review checklist",
        priority: "HIGH",
        locationName: session.context.locationName,
        sourceAgeAt: checklist.businessDate
      });
    }

    const exceptionChecklists = source.branchOperationsDashboard
      ? source.branchOperationsDashboard.exceptionCandidates
      : source.branchOperations!.checklists
          .filter((checklistSummary) => checklistSummary.exceptionCount > 0)
          .slice(0, 3);
    for (const checklist of exceptionChecklists) {
      const hasCriticalException = "hasCriticalException" in checklist
        ? checklist.hasCriticalException
        : checklist.lines.some(
            (line) => line.result === "EXCEPTION" && line.severity === "CRITICAL"
          );
      exceptionQueue.push({
        id: `branch-ops-${checklist.id}`,
        contributorSourceId: "branch-operations",
        label: "Checklist exception",
        reference: checklist.checklistName,
        detail: `${checklist.businessDate} / ${checklist.exceptionCount} exception${checklist.exceptionCount === 1 ? "" : "s"}`,
        status: checklist.status,
        href: `/branch-operations/${checklist.id}`,
        tone: hasCriticalException ? "warning" : "info",
        nextAction: "Investigate checklist exception",
        priority: hasCriticalException ? "CRITICAL" : "NORMAL",
        severityLabel: hasCriticalException ? "CRITICAL" : "No severity reported",
        locationName: session.context.locationName,
        sourceAgeAt: checklist.businessDate
      });
    }
  }

  if (source.foodSafety || source.foodSafetyDashboard) {
    const foodSafety = source.foodSafetyDashboard ?? source.foodSafety!;
    const reviewReadyLogCount =
      foodSafety.statusCounts.SUBMITTED + foodSafety.statusCounts.EXCEPTION_REVIEW;
    const reviewReadyLogs = source.foodSafetyDashboard
      ? source.foodSafetyDashboard.reviewCandidates
      : source.foodSafety!.logs.filter((logSummary) =>
      foodSafetyReviewStatuses.has(logSummary.status)
    );
    cards.push({
      id: "food-safety-exceptions",
      label: "Food Safety Exceptions",
      value: foodSafety.exceptionCount,
      href: "/food-safety",
      description: `${foodSafety.totalReadings} reading${foodSafety.totalReadings === 1 ? "" : "s"} checked`,
      tone: cardTone(foodSafety.exceptionCount)
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
        displayValue: number(foodSafety.severityCounts.CRITICAL),
        detail: "Critical food-safety reading exceptions in current scope",
        href: "/food-safety",
        tone:
          foodSafety.severityCounts.CRITICAL > 0 ? "warning" : "success"
      },
      {
        id: "food-safety-exception-review-count",
        label: "Exception review logs",
        displayValue: number(foodSafety.statusCounts.EXCEPTION_REVIEW),
        detail: "Food-safety logs waiting for exception review",
        href: "/food-safety",
        tone:
          foodSafety.statusCounts.EXCEPTION_REVIEW > 0
            ? "warning"
            : "success"
      },
      {
        id: "food-safety-reviewed-count",
        label: "Reviewed food-safety logs",
        displayValue: number(foodSafety.statusCounts.REVIEWED),
        detail: "Reviewed food-safety logs in current scope",
        href: "/food-safety",
        tone: "success"
      }
    );

    for (const log of reviewReadyLogs.slice(0, 3)) {
      exceptionQueue.push({
        id: `food-safety-review-${log.id}`,
        contributorSourceId: "food-safety",
        label: "Food safety review",
        reference: log.title,
        detail: `${log.businessDate} / ${log.logType.toLowerCase()} / ${log.exceptionCount} exception${log.exceptionCount === 1 ? "" : "s"}`,
        status: log.status,
        href: `/food-safety/${log.id}`,
        tone: "warning",
        nextAction: "Review food-safety log",
        priority: "HIGH",
        locationName: session.context.locationName,
        sourceAgeAt: log.businessDate
      });
    }

    const exceptionLogs = source.foodSafetyDashboard
      ? source.foodSafetyDashboard.exceptionCandidates
      : source.foodSafety!.logs
          .filter((logSummary) => logSummary.exceptionCount > 0)
          .slice(0, 3);
    for (const log of exceptionLogs) {
      const hasCriticalException = "hasCriticalException" in log
        ? log.hasCriticalException
        : log.readings.some(
            (reading) => reading.result === "EXCEPTION" && reading.severity === "CRITICAL"
          );
      exceptionQueue.push({
        id: `food-safety-${log.id}`,
        contributorSourceId: "food-safety",
        label: "Food safety exception",
        reference: log.title,
        detail: `${log.businessDate} / ${log.exceptionCount} exception${log.exceptionCount === 1 ? "" : "s"}`,
        status: log.status,
        href: `/food-safety/${log.id}`,
        tone: hasCriticalException ? "warning" : "info",
        nextAction: "Acknowledge food-safety deviation",
        priority: hasCriticalException ? "CRITICAL" : "NORMAL",
        severityLabel: hasCriticalException ? "CRITICAL" : "No severity reported",
        locationName: session.context.locationName,
        sourceAgeAt: log.businessDate
      });
    }
  }

  if (source.incidents || source.incidentDashboard) {
    const incidents = source.incidentDashboard ?? source.incidents!;
    const openIncidentCount =
      incidents.statusCounts.OPEN +
      incidents.statusCounts.IN_PROGRESS +
      incidents.statusCounts.PENDING_REVIEW;
    cards.push({
      id: "open-operational-incidents",
      label: "Open Incidents",
      value: openIncidentCount,
      href: "/incidents",
      description: `${incidents.overdueIncidents} overdue corrective action${incidents.overdueIncidents === 1 ? "" : "s"}`,
      tone: cardTone(openIncidentCount)
    });
    metrics.push(
      {
        id: "incident-critical-count",
        label: "Critical incidents",
        displayValue: number(incidents.severityCounts.CRITICAL),
        detail: "Critical incident records in current scope",
        href: "/incidents",
        tone: incidents.severityCounts.CRITICAL > 0 ? "warning" : "success"
      },
      {
        id: "incident-pending-review-count",
        label: "Incident review",
        displayValue: number(incidents.statusCounts.PENDING_REVIEW),
        detail: "Incidents waiting for closure review",
        href: "/incidents",
        tone:
          incidents.statusCounts.PENDING_REVIEW > 0 ? "warning" : "success"
      },
      {
        id: "incident-overdue-count",
        label: "Incident overdue",
        displayValue: number(incidents.overdueIncidents),
        detail: "Incidents past corrective-action due date",
        href: "/incidents",
        tone: incidents.overdueIncidents > 0 ? "warning" : "success"
      }
    );

    const incidentCandidates = source.incidentDashboard
      ? source.incidentDashboard.followUpCandidates
      : source.incidents!.incidents
          .filter((incidentSummary) =>
            ["OPEN", "IN_PROGRESS", "PENDING_REVIEW"].includes(incidentSummary.status)
          )
          .slice(0, 3);
    for (const incident of incidentCandidates) {
      exceptionQueue.push({
        id: `incident-${incident.id}`,
        contributorSourceId: "incidents",
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
        locationName: session.context.locationName,
        ownerLabel: incident.ownerName ?? "Not assigned",
        dueAt: incident.dueAt,
        sourceAgeAt: incident.incidentDate,
        isOverdue: isDateOverdue(incident.dueAt)
      });
    }
  }

  if (source.maintenance || source.maintenanceDashboard) {
    const maintenance = source.maintenanceDashboard ?? source.maintenance!;
    const openMaintenanceCount =
      maintenance.statusCounts.OPEN +
      maintenance.statusCounts.IN_PROGRESS +
      maintenance.statusCounts.PENDING_VENDOR;
    cards.push({
      id: "maintenance-follow-up",
      label: "Maintenance Follow-up",
      value: openMaintenanceCount,
      href: "/maintenance",
      description: `${maintenance.overdueTickets} overdue / ${maintenance.downtimeMinutes} downtime minutes`,
      tone: cardTone(openMaintenanceCount)
    });
    metrics.push(
      {
        id: "maintenance-critical-count",
        label: "Critical maintenance",
        displayValue: number(maintenance.priorityCounts.CRITICAL),
        detail: "Critical maintenance tickets in current scope",
        href: "/maintenance",
        tone:
          maintenance.priorityCounts.CRITICAL > 0 ? "warning" : "success"
      },
      {
        id: "maintenance-vendor-count",
        label: "Pending vendor",
        displayValue: number(maintenance.statusCounts.PENDING_VENDOR),
        detail: "Tickets waiting for vendor action",
        href: "/maintenance",
        tone:
          maintenance.statusCounts.PENDING_VENDOR > 0
            ? "warning"
            : "success"
      },
      {
        id: "maintenance-overdue-count",
        label: "Maintenance overdue",
        displayValue: number(maintenance.overdueTickets),
        detail: "Tickets past target due date",
        href: "/maintenance",
        tone: maintenance.overdueTickets > 0 ? "warning" : "success"
      }
    );

    const maintenanceCandidates = source.maintenanceDashboard
      ? source.maintenanceDashboard.followUpCandidates
      : source.maintenance!.tickets
          .filter((ticketSummary) =>
            ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"].includes(ticketSummary.status)
          )
          .slice(0, 3);
    for (const ticket of maintenanceCandidates) {
      exceptionQueue.push({
        id: `maintenance-${ticket.id}`,
        contributorSourceId: "maintenance",
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
        locationName: session.context.locationName,
        ownerLabel: ticket.ownerName ?? "Not assigned",
        dueAt: ticket.targetDueAt,
        sourceAgeAt: ticket.requestedAt,
        isOverdue: isDateOverdue(ticket.targetDueAt)
      });
    }
  }

  sourceHealth.push(
    ...(source.unavailableSources?.map((unavailableSource) => ({
          id: `dashboard-source-unavailable-${unavailableSource.id}`,
          label: `${unavailableSource.label} summary`,
          displayValue: "Unavailable",
          detail:
            "This dashboard summary could not be refreshed. Open the source workspace for the authoritative current record.",
          href: unavailableSource.href,
          tone: "warning" as const,
        })) ??
      (source.hasUnavailableSource
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
      : [])),
    {
      id: "dashboard-trust-gate",
      label: "Reporting trust gate",
      displayValue: source.dashboardTrustGate?.label ?? "Unavailable",
      detail: !source.dashboardTrustGate
        ? "Trust policy could not be checked. Reconciliation-dependent values are withheld."
        : source.dashboardTrustGate.isOverridden
          ? "Company override is active for unreconciled dashboard source data"
          : "Recommended DEC-0036 dashboard source-data policy is active",
      tone:
        !source.dashboardTrustGate
          ? "warning"
          : source.dashboardTrustGate.mode === "show_only"
          ? "warning"
          : source.dashboardTrustGate.mode === "block"
            ? "success"
            : "info"
    },
    ...(source.reconciliation && isDashboardTrustGateBlocking(source)
      ? [
          {
            id: "ledger-reconciliation-blocked",
            label: "Ledger reconciliation",
            displayValue: "Blocked by trust gate",
            detail:
              "Decision-ready values are withheld. Authorized investigators may open the warned diagnostic comparison.",
            href: inventoryDashboardProfileHref("ledger-variance-v1"),
            tone: "warning" as const
          }
        ]
      : []),
    {
      id: "inventory-value-source",
      label: "Inventory value",
      displayValue: source.inventoryBalanceDashboard ? "Available" : "No access",
      detail:
        "On-hand stock is visible; formal valuation needs trusted costing/accounting source",
      ...(source.inventoryBalanceDashboard ? { href: "/inventory" } : {}),
      tone: source.inventoryBalanceDashboard ? "info" : "neutral"
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
    contributorSourceId: "approvals" as const
  })) ?? [];
  const approvalObservations = source.sourceObservations?.filter(
    (observation) => observation.id === "approvals"
  ) ?? [];
  const approvalQueueContract = buildDashboardQueueContract(
    session,
    approvalQueueDrafts,
    approvalQueueDisplayLimit,
    approvalObservations
  );
  if (
    source.approvalPreviewUnavailable ||
    approvalObservations.some(
      (observation) => observation.availability === "UNAVAILABLE"
    )
  ) {
    approvalQueueContract.availability = "UNAVAILABLE";
    approvalQueueContract.completeness = "PARTIAL";
    approvalQueueContract.totalCount = null;
    approvalQueueContract.contributors = approvalQueueContract.contributors.map(
      (contributor) => ({
        ...contributor,
        availability: "UNAVAILABLE",
        itemCount: null
      })
    );
    approvalQueueContract.unavailableDetail =
      "Use Approval Inbox while approval-routing transition safeguards are active.";
  }
  const exceptionObservations = source.sourceObservations?.filter(
    (observation) => exceptionQueueContributorIds.has(observation.id)
  ) ?? [];
  const exceptionQueueContract = buildDashboardQueueContract(
    session,
    exceptionQueue,
    exceptionQueueDisplayLimit,
    exceptionObservations
  );
  const assembledAt = new Date().toISOString();

  return {
    assembledAt,
    generatedAt: assembledAt,
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
      availability: source.dashboardTrustGate ? "AVAILABLE" : "UNAVAILABLE",
      mode: source.dashboardTrustGate?.mode ?? "block",
      label:
        source.dashboardTrustGate?.label ??
        "Unavailable — reconciliation values withheld",
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
    exceptionQueueContract,
    sourceObservations: source.sourceObservations ?? []
  };
}

const defaultDashboardSourceDeadlineMs = 2_500;
const maximumDashboardSourceDeadlineMs = 3_000;
const defaultDashboardSourceMaxInFlight = 32;
const maximumDashboardSourceMaxInFlight = 64;

export function getDashboardSourceDeadlineMs(
  environment: Record<string, string | undefined> = process.env
) {
  const raw = environment.DASHBOARD_SOURCE_DEADLINE_MS?.trim();
  const value = raw ? Number(raw) : defaultDashboardSourceDeadlineMs;
  if (!Number.isInteger(value) || value < 1 || value > maximumDashboardSourceDeadlineMs) {
    throw new Error("DASHBOARD_SOURCE_DEADLINE_MS_INVALID");
  }
  return value;
}

export function getDashboardSourceMaxInFlight(
  environment: Record<string, string | undefined> = process.env
) {
  const raw = environment.DASHBOARD_SOURCE_MAX_IN_FLIGHT?.trim();
  const value = raw ? Number(raw) : defaultDashboardSourceMaxInFlight;
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > maximumDashboardSourceMaxInFlight
  ) {
    throw new Error("DASHBOARD_SOURCE_MAX_IN_FLIGHT_INVALID");
  }
  return value;
}

export class DashboardSourceAdmissionController {
  private activeReads = 0;

  constructor(readonly maximumInFlight: number) {
    if (
      !Number.isInteger(maximumInFlight) ||
      maximumInFlight < 1 ||
      maximumInFlight > maximumDashboardSourceMaxInFlight
    ) {
      throw new Error("DASHBOARD_SOURCE_MAX_IN_FLIGHT_INVALID");
    }
  }

  get inFlight() {
    return this.activeReads;
  }

  tryAcquire() {
    if (this.activeReads >= this.maximumInFlight) return null;
    this.activeReads += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeReads -= 1;
    };
  }
}

export type DashboardTelemetryEvent =
  | {
      event: "dashboard_source_read";
      outcome: "EXCEPTION" | "TIMEOUT" | "LATE_COMPLETION" | "SATURATED";
      sourceId: DashboardSourceId;
      observedAt: string;
      durationMs: number;
    }
  | {
      event: "dashboard_assembly";
      outcome: "COMPLETE" | "PARTIAL";
      assembledAt: string;
      durationMs: number;
      attemptedSourceCount: number;
      unavailableSourceCount: number;
    };

export type DashboardTelemetryEmitter = (event: DashboardTelemetryEvent) => void;

export const emitDashboardTelemetry: DashboardTelemetryEmitter = (event) => {
  const message = JSON.stringify(event);
  if (event.event === "dashboard_source_read") {
    console.warn(message);
  } else {
    console.info(message);
  }
};

const dashboardSourceAdmissionController = new DashboardSourceAdmissionController(
  getDashboardSourceMaxInFlight()
);

export type DashboardSourceReadResult = {
  patch: Readonly<OperationalDashboardSource>;
  availability?: "AVAILABLE" | "UNAVAILABLE";
  dataAsOf?: string;
};

export type DashboardSourceReadContext = {
  signal: AbortSignal;
  deadlineAt: string;
};

export type DashboardSourceDescriptor = {
  id: DashboardSourceId;
  label: string;
  href: string;
  read: (context: DashboardSourceReadContext) => Promise<DashboardSourceReadResult>;
};

type DashboardSourceSettlement = {
  patch: Readonly<OperationalDashboardSource>;
  observation: DashboardSourceObservation;
};

function isoUtc(value: string | undefined) {
  if (!value) return undefined;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
}

async function settleDashboardSource(
  descriptor: DashboardSourceDescriptor,
  deadlineMs: number,
  admissionController: DashboardSourceAdmissionController,
  telemetry: DashboardTelemetryEmitter
): Promise<DashboardSourceSettlement> {
  const startedAt = Date.now();
  const release = admissionController.tryAcquire();
  if (!release) {
    const checkedAt = new Date().toISOString();
    telemetry({
      event: "dashboard_source_read",
      outcome: "SATURATED",
      sourceId: descriptor.id,
      observedAt: checkedAt,
      durationMs: 0
    });
    return {
      patch: {},
      observation: {
        id: descriptor.id,
        label: descriptor.label,
        href: descriptor.href,
        availability: "UNAVAILABLE",
        checkedAt
      }
    };
  }
  const timedOut = Symbol("dashboard-source-timeout");
  const abortController = new AbortController();
  let presentationClosed = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const sourceRead = Promise.resolve()
      .then(() => descriptor.read({
        signal: abortController.signal,
        deadlineAt: new Date(startedAt + deadlineMs).toISOString()
      }))
      .then(
        (result) => {
          release();
          if (presentationClosed) {
            telemetry({
              event: "dashboard_source_read",
              outcome: "LATE_COMPLETION",
              sourceId: descriptor.id,
              observedAt: new Date().toISOString(),
              durationMs: Math.max(0, Date.now() - startedAt)
            });
          }
          return result;
        },
        (error: unknown) => {
          release();
          if (presentationClosed) {
            telemetry({
              event: "dashboard_source_read",
              outcome: "LATE_COMPLETION",
              sourceId: descriptor.id,
              observedAt: new Date().toISOString(),
              durationMs: Math.max(0, Date.now() - startedAt)
            });
          }
          throw error;
        }
      );
    const result = await Promise.race([
      sourceRead,
      new Promise<typeof timedOut>((resolve) => {
        timeout = setTimeout(() => resolve(timedOut), deadlineMs);
      })
    ]);
    const checkedAt = new Date().toISOString();
    if (result === timedOut) {
      presentationClosed = true;
      abortController.abort();
      telemetry({
        event: "dashboard_source_read",
        outcome: "TIMEOUT",
        sourceId: descriptor.id,
        observedAt: checkedAt,
        durationMs: Math.max(0, Date.now() - startedAt)
      });
      return {
        patch: {},
        observation: {
          id: descriptor.id,
          label: descriptor.label,
          href: descriptor.href,
          availability: "UNAVAILABLE",
          checkedAt
        }
      };
    }
    const dataAsOf =
      descriptor.id === "inventory-reconciliation"
        ? isoUtc(result.dataAsOf)
        : undefined;
    return {
      patch: { ...result.patch },
      observation: {
        id: descriptor.id,
        label: descriptor.label,
        href: descriptor.href,
        availability: result.availability ?? "AVAILABLE",
        checkedAt,
        ...(dataAsOf ? { dataAsOf } : {})
      }
    };
  } catch {
    const checkedAt = new Date().toISOString();
    telemetry({
      event: "dashboard_source_read",
      outcome: "EXCEPTION",
      sourceId: descriptor.id,
      observedAt: checkedAt,
      durationMs: Math.max(0, Date.now() - startedAt)
    });
    return {
      patch: {},
      observation: {
        id: descriptor.id,
        label: descriptor.label,
        href: descriptor.href,
        availability: "UNAVAILABLE",
        checkedAt
      }
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function collectDashboardSources(
  descriptors: DashboardSourceDescriptor[],
  deadlineMs: number,
  options: {
    admissionController?: DashboardSourceAdmissionController;
    telemetry?: DashboardTelemetryEmitter;
  } = {}
): Promise<OperationalDashboardSource> {
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > maximumDashboardSourceDeadlineMs) {
    throw new Error("DASHBOARD_SOURCE_DEADLINE_MS_INVALID");
  }
  const admissionController =
    options.admissionController ?? dashboardSourceAdmissionController;
  const telemetry = options.telemetry ?? emitDashboardTelemetry;
  const settlements = await Promise.all(
    descriptors.map((descriptor) =>
      settleDashboardSource(
        descriptor,
        deadlineMs,
        admissionController,
        telemetry
      )
    )
  );
  const observations = settlements.map((settlement) => settlement.observation);
  return {
    ...Object.assign({}, ...settlements.map((settlement) => settlement.patch)),
    sourceObservations: observations,
    unavailableSources: observations
      .filter((observation) => observation.availability === "UNAVAILABLE")
      .map(({ id, label, href }) => ({ id, label, href }))
  };
}

function emitDashboardAssemblyTelemetry(
  startedAt: number,
  dashboard: OperationalDashboard,
  telemetry: DashboardTelemetryEmitter = emitDashboardTelemetry
) {
  const unavailableSourceCount = dashboard.sourceObservations.filter(
    (observation) => observation.availability === "UNAVAILABLE"
  ).length;
  telemetry({
    event: "dashboard_assembly",
    outcome: unavailableSourceCount > 0 ? "PARTIAL" : "COMPLETE",
    assembledAt: dashboard.assembledAt,
    durationMs: Math.max(0, Date.now() - startedAt),
    attemptedSourceCount: dashboard.sourceObservations.length,
    unavailableSourceCount
  });
}

export const dashboardRuntimeTestSupport = {
  collectDashboardSources,
  emitDashboardAssemblyTelemetry
};

export function getOperationalDashboardSourceDescriptors(
  session: SessionContext
): DashboardSourceDescriptor[] {
  return [
    ...(canUseApprovals(session.permissionCodes)
      ? [{
          id: "approvals" as const,
          label: "Approvals",
          href: "/approvals",
          read: async () => ({
            availability: "UNAVAILABLE" as const,
            patch: { approvalPreviewUnavailable: true }
          })
        }]
      : []),
    ...(canUsePurchaseRequests(session.permissionCodes)
      ? [{
          id: "purchase-requests" as const,
          label: "Purchase Requests",
          href: "/purchase-requests",
          read: async () => ({
            patch: { purchaseRequestDashboard: await getPurchaseRequestDashboardRead(session) }
          })
        }]
      : []),
    ...(canReadPurchaseOrders(session.permissionCodes)
      ? [{
          id: "purchase-orders" as const,
          label: "Purchase Orders",
          href: "/purchase-orders",
          read: async () => ({
            patch: { purchaseOrderDashboard: await getPurchaseOrderDashboardRead(session) }
          })
        }]
      : []),
    ...(canUseReceiving(session.permissionCodes)
      ? [{
          id: "receiving" as const,
          label: "Receiving Follow-up",
          href: receivingDashboardProfileHref("receiving-follow-up-v1"),
          read: async () => ({
            patch: { receivingDashboard: await getReceivingDashboardRead(session) }
          })
        }]
      : []),
    ...(canUseTransfers(session.permissionCodes)
      ? [{
          id: "transfers" as const,
          label: "Transfers",
          href: "/transfers",
          read: async () => ({
            patch: { transferDashboard: await getTransferDashboardRead(session) }
          })
        }]
      : []),
    ...(canUseWastageReports(session.permissionCodes)
      ? [{
          id: "wastage" as const,
          label: "Wastage",
          href: "/wastage",
          read: async () => ({
            patch: { wastageDashboard: await getWastageDashboardRead(session) }
          })
        }]
      : []),
    ...(canUseStockAdjustments(session.permissionCodes)
      ? [{
          id: "stock-adjustments" as const,
          label: "Stock Adjustments",
          href: "/adjustments",
          read: async () => ({
            patch: { stockAdjustmentDashboard: await getStockAdjustmentDashboardRead(session) }
          })
        }]
      : []),
    ...(session.permissionCodes.includes(permissions.inventoryBalanceView)
      ? [{
          id: "inventory-balances" as const,
          label: "Inventory balances",
          href: "/inventory",
          read: async () => ({
            patch: { inventoryBalanceDashboard: await getInventoryBalanceDashboardRead(session) }
          })
        }]
      : []),
    ...(session.permissionCodes.includes(permissions.inventoryBalanceView) &&
    session.permissionCodes.includes(permissions.inventoryLedgerView)
      ? [{
          id: "inventory-reconciliation" as const,
          label: "Ledger reconciliation",
          href: inventoryDashboardProfileHref("ledger-variance-v1"),
          read: async () => {
            const reconciliation = await getInventoryLedgerVarianceDashboardRead(session);
            return {
              patch: { reconciliation },
              dataAsOf: reconciliation.generatedAt
            };
          }
        }]
      : []),
    ...(canUseBranchOperations(session.permissionCodes)
      ? [{
          id: "branch-operations" as const,
          label: "Branch operations",
          href: "/operations",
          read: async () => ({
            patch: { branchOperationsDashboard: await getBranchOperationsDashboardRead(session) }
          })
        }]
      : []),
    ...(canUseFoodSafety(session.permissionCodes)
      ? [{
          id: "food-safety" as const,
          label: "Food safety",
          href: "/food-safety",
          read: async () => ({
            patch: { foodSafetyDashboard: await getFoodSafetyDashboardRead(session) }
          })
        }]
      : []),
    ...(canUseIncidents(session.permissionCodes)
      ? [{
          id: "incidents" as const,
          label: "Incidents",
          href: "/incidents",
          read: async () => ({
            patch: { incidentDashboard: await getIncidentDashboardRead(session) }
          })
        }]
      : []),
    ...(canUseMaintenance(session.permissionCodes)
      ? [{
          id: "maintenance" as const,
          label: "Maintenance",
          href: "/maintenance",
          read: async () => ({
            patch: { maintenanceDashboard: await getMaintenanceDashboardRead(session) }
          })
        }]
      : []),
    {
      id: "trust-gate",
      label: "Dashboard trust status",
      href: "/inventory",
      read: async () => ({
        patch: { dashboardTrustGate: await getDashboardTrustGatePolicy(session) }
      })
    }
  ];
}

export async function getOperationalDashboard(
  session: SessionContext
): Promise<OperationalDashboard> {
  const startedAt = Date.now();
  const source = await collectDashboardSources(
    getOperationalDashboardSourceDescriptors(session),
    getDashboardSourceDeadlineMs()
  );
  const dashboard = buildOperationalDashboardModel(session, source);
  emitDashboardAssemblyTelemetry(startedAt, dashboard);
  return dashboard;
}
