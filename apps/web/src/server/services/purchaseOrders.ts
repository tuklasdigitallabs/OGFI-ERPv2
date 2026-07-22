import { prisma, type Prisma } from "@ogfi/database";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  canReadPurchaseOrders,
  permissions,
  requirePermission,
} from "./authorization";
import {
  assertAuthorizedLocation,
  requireSessionContext,
  type SessionContext,
} from "./context";
import {
  recordWorkflowNotifications,
} from "./notifications";
import {
  assertAnyEligibleApprovalActorForStep,
  configureApprovalStepRouting
} from "./approvalRouting";
import { getApprovalRoutingPolicy } from "./approvalRoutingRegistry";
import {
  assertSupplierStatusAllowedForPurchaseOrder,
  getPurchasingSupplierPolicy,
} from "./policySettings";
import { reverseBudgetCommitmentFromApprovedSourceEvent } from "./budgetControl";

const createPurchaseOrderSchema = z.object({
  quotationRecommendationId: z.string().uuid(),
});

const submitPurchaseOrderSchema = z.object({
  id: z.string().uuid(),
});

const purchaseOrderIssueMethods = [
  "Email",
  "Printed copy",
  "Supplier portal",
  "Manual handoff",
] as const;

export const purchaseOrderOpenStatuses = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "ISSUED",
  "AMENDMENT_PENDING",
  "PARTIALLY_RECEIVED",
] as const;

export const purchaseOrderDashboardProfiles = ["po-open-v1"] as const;

export type PurchaseOrderDashboardProfile =
  (typeof purchaseOrderDashboardProfiles)[number];

export function resolvePurchaseOrderDashboardProfile(
  value: string | undefined,
): PurchaseOrderDashboardProfile | null {
  return purchaseOrderDashboardProfiles.includes(value as PurchaseOrderDashboardProfile)
    ? (value as PurchaseOrderDashboardProfile)
    : null;
}

export function purchaseOrderDashboardProfileHref(
  profile: PurchaseOrderDashboardProfile,
) {
  return `/purchase-orders?dashboard=${profile}`;
}

const issuePurchaseOrderSchema = z.object({
  id: z.string().uuid(),
  communicationMethod: z.string().trim().min(2).max(80),
  recipientReference: z.string().trim().max(160).optional(),
  remarks: z.string().trim().max(1000).optional(),
});

const cancelPurchaseOrderSchema = z.object({
  id: z.string().uuid(),
  cancellationReason: z.string().trim().min(5).max(1000),
  supplierNoticeReference: z.string().trim().max(160).optional(),
  supplierNoticeUnavailableReason: z.string().trim().max(500).optional(),
});

const requestPurchaseOrderBalanceClosureSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(5).max(1000),
  supplierNoticeReference: z.string().trim().max(160).optional(),
  supplierNoticeUnavailableReason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const requestPurchaseOrderAmendmentSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(5).max(1000),
  supplierNoticeReference: z.string().trim().max(160).optional(),
  supplierNoticeUnavailableReason: z.string().trim().max(500).optional(),
  expectedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  proposedLines: z.string().min(2),
});

const purchaseOrderStatuses = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "ISSUED",
  "AMENDMENT_PENDING",
  "PARTIALLY_RECEIVED",
  "FULLY_RECEIVED",
  "CANCELLED",
  "CLOSED",
] as const;

export const purchaseOrderCancellationSubtypes = [
  "approval_rejected",
  "pre_receiving_cancellation",
  "remaining_balance_closure",
  "unknown_unclassified",
] as const;

export type PurchaseOrderCancellationSubtype =
  (typeof purchaseOrderCancellationSubtypes)[number];

export type PurchaseOrderListFilters = {
  query?: string | undefined;
  status?: string | undefined;
  expectedFrom?: string | undefined;
  expectedTo?: string | undefined;
  minAmount?: string | undefined;
  maxAmount?: string | undefined;
  approver?: string | undefined;
};

function normalizeDateFilter(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : trimmed;
}

export function normalizePurchaseOrderFilters(
  filters: PurchaseOrderListFilters = {},
): PurchaseOrderListFilters {
  const minAmount = Number(filters.minAmount);
  const maxAmount = Number(filters.maxAmount);

  return {
    query: filters.query?.trim() || undefined,
    status: purchaseOrderStatuses.includes(filters.status as never)
      ? filters.status
      : undefined,
    expectedFrom: normalizeDateFilter(filters.expectedFrom),
    expectedTo: normalizeDateFilter(filters.expectedTo),
    minAmount:
      Number.isFinite(minAmount) && minAmount >= 0
        ? String(minAmount)
        : undefined,
    maxAmount:
      Number.isFinite(maxAmount) && maxAmount >= 0
        ? String(maxAmount)
        : undefined,
    approver: filters.approver?.trim() || undefined,
  };
}

function purchaseOrderScope(session: SessionContext) {
  return {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    deliveryLocationId: session.context.locationId,
  };
}

function purchaseOrderDashboardProfileStatusWhere(
  profile: PurchaseOrderDashboardProfile,
) {
  switch (profile) {
    case "po-open-v1":
      return { status: { in: [...purchaseOrderOpenStatuses] } };
  }
}

function purchaseOrderListWhere(
  session: SessionContext,
  filters: PurchaseOrderListFilters,
  dashboardProfile?: PurchaseOrderDashboardProfile,
): Prisma.PurchaseOrderWhereInput {
  const where: Prisma.PurchaseOrderWhereInput = purchaseOrderScope(session);
  if (dashboardProfile) {
    Object.assign(where, purchaseOrderDashboardProfileStatusWhere(dashboardProfile));
    return where;
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.expectedFrom || filters.expectedTo) {
    where.expectedDeliveryDate = {
      ...(filters.expectedFrom ? { gte: new Date(filters.expectedFrom) } : {}),
      ...(filters.expectedTo ? { lte: new Date(filters.expectedTo) } : {}),
    };
  }
  if (filters.minAmount || filters.maxAmount) {
    where.totalAmount = {
      ...(filters.minAmount ? { gte: filters.minAmount } : {}),
      ...(filters.maxAmount ? { lte: filters.maxAmount } : {}),
    };
  }
  if (filters.query) {
    where.OR = [
      { publicReference: { contains: filters.query, mode: "insensitive" } },
      { supplier: { legalName: { contains: filters.query, mode: "insensitive" } } },
      { supplier: { tradingName: { contains: filters.query, mode: "insensitive" } } },
      { purchaseRequest: { publicReference: { contains: filters.query, mode: "insensitive" } } },
      { selectedSupplierQuotation: { quoteReference: { contains: filters.query, mode: "insensitive" } } },
    ];
  }
  return where;
}

type QuoteLineSnapshotInput = {
  id: string;
  sourcePrLineId: string | null;
  itemId: string | null;
  quantity: unknown;
  uomId: string;
  unitPrice: unknown;
  lineTotal: unknown;
  availabilityStatus: string;
  leadTimeDays: number | null;
  notes: string | null;
  sourcePrLine?: {
    lineNumber: number;
    description: string;
    purpose: string;
    notes: string | null;
    budgetLineId?: string | null;
  } | null;
  item?: {
    itemName: string;
  } | null;
  uom?: {
    uomCode: string;
  } | null;
};

type PurchaseOrderClosureLineInput = {
  id: string;
  lineNumber: number;
  description: string;
  orderedQty: unknown;
  receivedQty: unknown;
  cancelledQty: unknown;
  unitPrice: unknown;
  lineTotal: unknown;
  uom?: {
    uomCode: string;
  } | null;
};

type PurchaseOrderAmendmentLineInput = PurchaseOrderClosureLineInput & {
  taxAmount: unknown;
  discountAmount: unknown;
  notes: string | null;
};

type ProposedPurchaseOrderLineChange = {
  purchaseOrderLineId: string;
  orderedQty: number;
  unitPrice: number;
  notes: string | null;
};

export function assertApprovedQuotationRecommendationForPo(status: string) {
  if (status !== "APPROVED") {
    throw new Error("QUOTATION_RECOMMENDATION_NOT_APPROVED_FOR_PO");
  }
}

export function assertPurchaseOrderCanSubmitForApproval(status: string) {
  if (status !== "DRAFT") {
    throw new Error("PURCHASE_ORDER_NOT_DRAFT_FOR_APPROVAL");
  }
}

export function assertPurchaseOrderCanBeApproved(status: string) {
  if (status !== "PENDING_APPROVAL") {
    throw new Error("PURCHASE_ORDER_NOT_PENDING_APPROVAL");
  }
}

export function assertPurchaseOrderCanBeIssued(status: string) {
  if (status !== "APPROVED") {
    throw new Error("PURCHASE_ORDER_NOT_APPROVED_FOR_ISSUE");
  }
}

export function assertPurchaseOrderCanBeResent(status: string) {
  if (status !== "ISSUED") {
    throw new Error("PURCHASE_ORDER_NOT_ISSUED_FOR_RESEND");
  }
}

export function assertPurchaseOrderIssueMethodAllowed(method: string) {
  if (!purchaseOrderIssueMethods.includes(method as never)) {
    throw new Error("PURCHASE_ORDER_ISSUE_METHOD_NOT_ALLOWED");
  }
}

export function assertPurchaseOrderCanRenderSupplierCopy(status: string) {
  if (
    ![
      "APPROVED",
      "ISSUED",
      "PARTIALLY_RECEIVED",
      "FULLY_RECEIVED",
      "CLOSED",
    ].includes(status)
  ) {
    throw new Error("PURCHASE_ORDER_SUPPLIER_COPY_NOT_AVAILABLE");
  }
}

export function assertPurchaseOrderCanBeCancelled({
  status,
  receivedQty,
  receiptCount,
}: {
  status: string;
  receivedQty: number;
  receiptCount: number;
}) {
  if (!["DRAFT", "APPROVED", "ISSUED"].includes(status)) {
    throw new Error("PURCHASE_ORDER_NOT_CANCELLABLE");
  }
  if (receivedQty > 0) {
    throw new Error("PURCHASE_ORDER_RECEIVED_QUANTITY_BLOCKS_CANCELLATION");
  }
  if (receiptCount > 0) {
    throw new Error("PURCHASE_ORDER_RECEIVING_REPORT_BLOCKS_CANCELLATION");
  }
}

export function assertSupplierNoticeEvidence(
  supplierNoticeReference?: string | null,
  supplierNoticeUnavailableReason?: string | null,
) {
  if (
    !supplierNoticeReference?.trim() &&
    !supplierNoticeUnavailableReason?.trim()
  ) {
    throw new Error("PURCHASE_ORDER_CLOSURE_SUPPLIER_NOTICE_REQUIRED");
  }
}

export function derivePurchaseOrderCancellationSubtype(input: {
  status: string;
  cancellationSubtype?: string | null;
  receivedQty: number;
  balanceClosureCount?: number;
}): PurchaseOrderCancellationSubtype {
  if (
    input.cancellationSubtype &&
    purchaseOrderCancellationSubtypes.includes(
      input.cancellationSubtype as PurchaseOrderCancellationSubtype,
    )
  ) {
    return input.cancellationSubtype as PurchaseOrderCancellationSubtype;
  }
  if (input.status === "CLOSED" && (input.balanceClosureCount ?? 0) > 0) {
    return "remaining_balance_closure";
  }
  if (input.status === "CANCELLED" && input.receivedQty <= 0) {
    return "pre_receiving_cancellation";
  }
  return "unknown_unclassified";
}

export function assertPurchaseOrderCanRequestBalanceClosure({
  status,
  outstandingQty,
  draftReceiptCount,
  pendingClosureCount,
}: {
  status: string;
  outstandingQty: number;
  draftReceiptCount: number;
  pendingClosureCount: number;
}) {
  if (status !== "PARTIALLY_RECEIVED") {
    throw new Error("PURCHASE_ORDER_NOT_PARTIALLY_RECEIVED_FOR_CLOSURE");
  }
  if (outstandingQty <= 0) {
    throw new Error("PURCHASE_ORDER_NO_REMAINING_BALANCE_TO_CLOSE");
  }
  if (draftReceiptCount > 0) {
    throw new Error("PURCHASE_ORDER_OPEN_RECEIPT_BLOCKS_CLOSURE");
  }
  if (pendingClosureCount > 0) {
    throw new Error("PURCHASE_ORDER_CLOSURE_ALREADY_PENDING");
  }
}

export function assertPurchaseOrderCanRequestAmendment({
  status,
  receivedQty,
  receiptCount,
  pendingClosureCount,
  pendingAmendmentCount,
}: {
  status: string;
  receivedQty: number;
  receiptCount: number;
  pendingClosureCount: number;
  pendingAmendmentCount: number;
}) {
  if (status !== "ISSUED") {
    throw new Error("PURCHASE_ORDER_NOT_ISSUED_FOR_AMENDMENT");
  }
  if (receivedQty > 0) {
    throw new Error("PURCHASE_ORDER_RECEIVED_QUANTITY_BLOCKS_AMENDMENT");
  }
  if (receiptCount > 0) {
    throw new Error("PURCHASE_ORDER_RECEIVING_REPORT_BLOCKS_AMENDMENT");
  }
  if (pendingClosureCount > 0) {
    throw new Error("PURCHASE_ORDER_CLOSURE_BLOCKS_AMENDMENT");
  }
  if (pendingAmendmentCount > 0) {
    throw new Error("PURCHASE_ORDER_AMENDMENT_ALREADY_PENDING");
  }
}

export function buildPurchaseOrderAmendmentLineSnapshot(
  lines: PurchaseOrderAmendmentLineInput[],
) {
  return lines.map((line) => ({
    purchaseOrderLineId: line.id,
    lineNumber: line.lineNumber,
    description: line.description,
    orderedQty: Number(line.orderedQty),
    receivedQty: Number(line.receivedQty),
    cancelledQty: Number(line.cancelledQty),
    uomCode: line.uom?.uomCode ?? "",
    unitPrice: Number(line.unitPrice),
    taxAmount: Number(line.taxAmount),
    discountAmount: Number(line.discountAmount),
    lineTotal: Number(line.lineTotal),
    notes: line.notes,
  }));
}

export function parsePurchaseOrderAmendmentLines(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("PURCHASE_ORDER_AMENDMENT_LINES_INVALID");
  }

  const schema = z.array(
    z.object({
      purchaseOrderLineId: z.string().uuid(),
      orderedQty: z.coerce.number().positive(),
      unitPrice: z.coerce.number().nonnegative(),
      notes: z.string().trim().max(1000).nullable().optional(),
    }),
  );

  return schema.parse(parsed).map((line) => ({
    purchaseOrderLineId: line.purchaseOrderLineId,
    orderedQty: line.orderedQty,
    unitPrice: line.unitPrice,
    notes: line.notes?.trim() || null,
  }));
}

export function buildPurchaseOrderAmendmentProposal({
  currentLines,
  proposedLines,
  expectedDeliveryDate,
}: {
  currentLines: PurchaseOrderAmendmentLineInput[];
  proposedLines: ProposedPurchaseOrderLineChange[];
  expectedDeliveryDate: string;
}) {
  if (currentLines.length === 0) {
    throw new Error("PURCHASE_ORDER_LINE_NOT_FOUND");
  }
  if (currentLines.length !== proposedLines.length) {
    throw new Error("PURCHASE_ORDER_AMENDMENT_LINE_SET_MISMATCH");
  }

  const proposedById = new Map(
    proposedLines.map((line) => [line.purchaseOrderLineId, line]),
  );
  if (proposedById.size !== currentLines.length) {
    throw new Error("PURCHASE_ORDER_AMENDMENT_LINE_SET_MISMATCH");
  }

  const lines = currentLines.map((line) => {
    const proposed = proposedById.get(line.id);
    if (!proposed) {
      throw new Error("PURCHASE_ORDER_AMENDMENT_LINE_SET_MISMATCH");
    }
    if (Number(line.receivedQty) > 0 || Number(line.cancelledQty) > 0) {
      throw new Error("PURCHASE_ORDER_LINE_ACTIVITY_BLOCKS_AMENDMENT");
    }
    const lineTotal = proposed.orderedQty * proposed.unitPrice;
    return {
      purchaseOrderLineId: line.id,
      lineNumber: line.lineNumber,
      description: line.description,
      orderedQty: proposed.orderedQty,
      receivedQty: Number(line.receivedQty),
      cancelledQty: Number(line.cancelledQty),
      uomCode: line.uom?.uomCode ?? "",
      unitPrice: proposed.unitPrice,
      taxAmount: 0,
      discountAmount: 0,
      lineTotal,
      notes: proposed.notes,
    };
  });

  return {
    expectedDeliveryDate,
    lines,
    totals: calculatePurchaseOrderTotals(lines),
  };
}

export function buildPurchaseOrderClosureLineSnapshot(
  lines: PurchaseOrderClosureLineInput[],
) {
  const snapshot = lines
    .map((line) => {
      const orderedQty = Number(line.orderedQty);
      const receivedQty = Number(line.receivedQty);
      const cancelledQty = Number(line.cancelledQty);
      const remainingQty = orderedQty - receivedQty - cancelledQty;
      const unitPrice = Number(line.unitPrice);

      return {
        purchaseOrderLineId: line.id,
        lineNumber: line.lineNumber,
        description: line.description,
        orderedQty,
        receivedQty,
        cancelledQty,
        remainingQty,
        uomCode: line.uom?.uomCode ?? "",
        unitPrice,
        closedValue: remainingQty * unitPrice,
        originalLineTotal: Number(line.lineTotal),
      };
    })
    .filter((line) => line.remainingQty > 0);

  if (snapshot.length === 0) {
    throw new Error("PURCHASE_ORDER_NO_REMAINING_BALANCE_TO_CLOSE");
  }

  return snapshot;
}

export function buildPurchaseOrderLineSnapshots(
  lines: QuoteLineSnapshotInput[],
) {
  if (lines.length === 0) {
    throw new Error("SUPPLIER_QUOTE_LINE_NOT_FOUND");
  }

  return lines.map((line, index) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const lineTotal = Number(line.lineTotal);
    if (quantity <= 0) {
      throw new Error("PURCHASE_ORDER_LINE_QUANTITY_INVALID");
    }
    if (unitPrice < 0 || lineTotal < 0) {
      throw new Error("PURCHASE_ORDER_LINE_AMOUNT_INVALID");
    }

    return {
      sourceSupplierQuoteLineId: line.id,
      sourcePrLineId: line.sourcePrLineId,
      budgetLineId: line.sourcePrLine?.budgetLineId ?? null,
      itemId: line.itemId,
      uomId: line.uomId,
      lineNumber: line.sourcePrLine?.lineNumber ?? index + 1,
      description:
        line.item?.itemName ??
        line.sourcePrLine?.description ??
        `Supplier quote line ${index + 1}`,
      orderedQty: quantity,
      unitPrice,
      taxAmount: 0,
      discountAmount: 0,
      lineTotal,
      availabilityStatus: line.availabilityStatus,
      leadTimeDays: line.leadTimeDays,
      notes: line.notes ?? line.sourcePrLine?.notes ?? null,
      uomCode: line.uom?.uomCode ?? "",
    };
  });
}

export function calculatePurchaseOrderTotals(
  lines: Array<{
    lineTotal: number;
    taxAmount?: number;
    discountAmount?: number;
  }>,
) {
  const subtotalAmount = lines.reduce(
    (total, line) => total + line.lineTotal,
    0,
  );
  const taxAmount = lines.reduce(
    (total, line) => total + (line.taxAmount ?? 0),
    0,
  );
  const discountAmount = lines.reduce(
    (total, line) => total + (line.discountAmount ?? 0),
    0,
  );

  return {
    subtotalAmount,
    taxAmount,
    discountAmount,
    totalAmount: subtotalAmount + taxAmount - discountAmount,
  };
}

export function summarizePurchaseOrderFulfillment(
  lines: Array<{
    orderedQty: unknown;
    receivedQty: unknown;
    cancelledQty: unknown;
    unitPrice: unknown;
  }>,
) {
  return lines.reduce(
    (summary, line) => {
      const orderedQty = Number(line.orderedQty);
      const receivedQty = Number(line.receivedQty);
      const cancelledQty = Number(line.cancelledQty);
      const unitPrice = Number(line.unitPrice);
      const openQty = orderedQty - receivedQty - cancelledQty;

      return {
        orderedQty: summary.orderedQty + orderedQty,
        receivedQty: summary.receivedQty + receivedQty,
        cancelledQty: summary.cancelledQty + cancelledQty,
        openQty: summary.openQty + openQty,
        receivedValue: summary.receivedValue + receivedQty * unitPrice,
        cancelledValue: summary.cancelledValue + cancelledQty * unitPrice,
        openValue: summary.openValue + openQty * unitPrice,
      };
    },
    {
      orderedQty: 0,
      receivedQty: 0,
      cancelledQty: 0,
      openQty: 0,
      receivedValue: 0,
      cancelledValue: 0,
      openValue: 0,
    },
  );
}

function dateOnlyUtc(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return Date.UTC(year, month - 1, day);
}

export function classifyPurchaseOrderDeliveryAging({
  status,
  expectedDeliveryDate,
  today,
}: {
  status: string;
  expectedDeliveryDate: string;
  today: string;
}) {
  if (!["ISSUED", "PARTIALLY_RECEIVED"].includes(status)) {
    return {
      deliveryAgingStatus: "NOT_APPLICABLE",
      daysOverdue: 0,
    };
  }

  const expected = dateOnlyUtc(expectedDeliveryDate);
  const current = dateOnlyUtc(today);
  if (expected === null || current === null) {
    return {
      deliveryAgingStatus: "UNKNOWN",
      daysOverdue: 0,
    };
  }

  const daysDelta = Math.floor((current - expected) / 86_400_000);
  if (daysDelta > 0) {
    return {
      deliveryAgingStatus: "OVERDUE",
      daysOverdue: daysDelta,
    };
  }
  if (daysDelta === 0) {
    return {
      deliveryAgingStatus: "DUE_TODAY",
      daysOverdue: 0,
    };
  }

  return {
    deliveryAgingStatus: "UPCOMING",
    daysOverdue: 0,
  };
}

async function requirePurchaseOrderRead(session: SessionContext) {
  if (!canReadPurchaseOrders(session.permissionCodes)) {
    await requirePermission(session, permissions.purchaseOrderView);
  }
}

export type PurchaseOrderDashboardRead = {
  openCount: number;
  committedValue: number;
  openValue: number;
  receivedValue: number;
  primaryCurrency: string | null;
  overdueCandidates: Array<{
    id: string;
    publicReference: string;
    status: string;
    supplierName: string;
    expectedDeliveryDate: string;
    daysOverdue: number;
  }>;
};

/**
 * Dashboard-only PO read. Keep source authorization and selected location scope
 * here; dashboard callers must not receive the workspace list DTO.
 */
export async function getPurchaseOrderDashboardRead(
  session: SessionContext,
): Promise<PurchaseOrderDashboardRead> {
  await requirePurchaseOrderRead(session);

  const scope = purchaseOrderScope(session);
  const today = new Date().toISOString().slice(0, 10);
  const todayStart = new Date(`${today}T00:00:00.000Z`);
  const [openCount, commitment, fulfillmentLines, overdueOrders, currencyOrder] =
    await Promise.all([
      prisma.purchaseOrder.count({
        where: purchaseOrderListWhere(session, {}, "po-open-v1"),
      }),
      prisma.purchaseOrder.aggregate({
        where: scope,
        _sum: { totalAmount: true },
      }),
      prisma.purchaseOrderLine.findMany({
        where: { purchaseOrder: scope },
        select: {
          orderedQty: true,
          receivedQty: true,
          cancelledQty: true,
          unitPrice: true,
        },
      }),
      prisma.purchaseOrder.findMany({
        where: {
          ...scope,
          status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] },
          expectedDeliveryDate: { lt: todayStart },
        },
        select: {
          id: true,
          publicReference: true,
          status: true,
          expectedDeliveryDate: true,
          supplier: { select: { legalName: true, tradingName: true } },
        },
        orderBy: [{ expectedDeliveryDate: "asc" }, { id: "asc" }],
        take: 8,
      }),
      prisma.purchaseOrder.findFirst({
        where: scope,
        select: { currencyCode: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
  const fulfillment = summarizePurchaseOrderFulfillment(fulfillmentLines);

  return {
    openCount,
    committedValue: Number(commitment._sum.totalAmount ?? 0),
    openValue: fulfillment.openValue,
    receivedValue: fulfillment.receivedValue,
    primaryCurrency: currencyOrder?.currencyCode ?? null,
    overdueCandidates: overdueOrders.map((order) => ({
      id: order.id,
      publicReference: order.publicReference,
      status: order.status,
      supplierName: order.supplier.tradingName ?? order.supplier.legalName,
      expectedDeliveryDate: order.expectedDeliveryDate.toISOString(),
      daysOverdue: classifyPurchaseOrderDeliveryAging({
        status: order.status,
        expectedDeliveryDate: order.expectedDeliveryDate.toISOString().slice(0, 10),
        today,
      }).daysOverdue,
    })),
  };
}

async function listPurchaseOrdersWithOptions(
  session: SessionContext,
  filters: PurchaseOrderListFilters = {},
  options: {
    dashboardProfile?: PurchaseOrderDashboardProfile;
    pagination?: { page: number; pageSize: number };
  } = {},
) {
  await requirePurchaseOrderRead(session);
  const normalizedFilters = options.dashboardProfile
    ? {}
    : normalizePurchaseOrderFilters(filters);

  const orders = await prisma.purchaseOrder.findMany({
    where: purchaseOrderListWhere(session, normalizedFilters, options.dashboardProfile),
    include: {
      supplier: true,
      purchaseRequest: true,
      deliveryLocation: true,
      quotationRecommendation: true,
      selectedSupplierQuotation: true,
      balanceClosures: {
        where: { status: "APPROVED" },
        select: { id: true },
      },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          uom: true,
        },
      },
      createdBy: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(options.pagination
      ? {
          skip: (options.pagination.page - 1) * options.pagination.pageSize,
          take: options.pagination.pageSize,
        }
      : {}),
  });

  const approvalInstances =
    orders.length > 0
      ? await prisma.approvalInstance.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            documentType: "PurchaseOrder",
            documentId: { in: orders.map((order) => order.id) },
            status: "PENDING",
          },
          include: {
            steps: {
              where: { status: "PENDING" },
              take: 1,
            },
          },
        })
      : [];
  const pendingSteps = approvalInstances.flatMap((approval) =>
    approval.steps.map((step) => ({
      documentId: approval.documentId,
      assignedRoleId: step.assignedRoleId,
      assignedUserId: step.assignedUserId,
    })),
  );
  const pendingAssignedUserIds = pendingSteps
    .map((step) => step.assignedUserId)
    .filter((id): id is string => Boolean(id));
  const assignedRoleIds = pendingSteps
    .map((step) => step.assignedRoleId)
    .filter((id): id is string => Boolean(id));
  const assignedRoles =
    assignedRoleIds.length > 0
      ? await prisma.role.findMany({
          where: { id: { in: assignedRoleIds } },
          select: { id: true, name: true },
        })
      : [];
  const issueEvents =
    orders.length > 0
      ? await prisma.auditEvent.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            entityType: "PurchaseOrder",
            entityId: { in: orders.map((order) => order.id) },
            eventType: {
              in: ["purchase_order.issued", "purchase_order.resent"],
            },
          },
          orderBy: { occurredAt: "asc" },
        })
      : [];
  const issueActorUserIds = issueEvents
    .map((event) => event.actorUserId)
    .filter((id): id is string => Boolean(id));
  const userIds = Array.from(
    new Set([...pendingAssignedUserIds, ...issueActorUserIds]),
  );
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true },
        })
      : [];
  const userNames = new Map(users.map((user) => [user.id, user.displayName]));
  const roleNames = new Map(assignedRoles.map((role) => [role.id, role.name]));
  const approverNames = new Map(
    pendingSteps.map((step) => [
      step.documentId,
      step.assignedUserId
        ? (userNames.get(step.assignedUserId) ?? "Assigned user")
        : step.assignedRoleId
          ? (roleNames.get(step.assignedRoleId) ?? "Assigned role")
          : "Operations approver",
    ]),
  );
  const latestIssueEventByOrder = new Map(
    issueEvents.map((event) => [event.entityId, event]),
  );
  const today = new Date().toISOString().slice(0, 10);

  const mappedOrders = orders.map((order) => {
    const fulfillment = summarizePurchaseOrderFulfillment(order.lines);
    const expectedDeliveryDate = order.expectedDeliveryDate
      .toISOString()
      .slice(0, 10);
    const deliveryAging = classifyPurchaseOrderDeliveryAging({
      status: order.status,
      expectedDeliveryDate,
      today,
    });
    const cancellationSubtype = derivePurchaseOrderCancellationSubtype({
      status: order.status,
      cancellationSubtype: order.cancellationSubtype,
      receivedQty: fulfillment.receivedQty,
      balanceClosureCount: order.balanceClosures.length,
    });

    return {
      id: order.id,
      publicReference: order.publicReference,
      status: order.status,
      cancellationSubtype,
      cancellationReason: order.cancellationReason,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      supplierName: order.supplier.tradingName ?? order.supplier.legalName,
      supplierCode: order.supplier.supplierCode,
      purchaseRequestReference: order.purchaseRequest.publicReference,
      quotationRecommendationId: order.quotationRecommendationId,
      selectedQuoteReference: order.selectedSupplierQuotation.quoteReference,
      deliveryLocationName: order.deliveryLocation.name,
      expectedDeliveryDate,
      deliveryAgingStatus: deliveryAging.deliveryAgingStatus,
      daysOverdue: deliveryAging.daysOverdue,
      currencyCode: order.currencyCode,
      totalAmount: Number(order.totalAmount),
      orderedQty: fulfillment.orderedQty,
      receivedQty: fulfillment.receivedQty,
      cancelledQty: fulfillment.cancelledQty,
      openQty: fulfillment.openQty,
      receivedValue: fulfillment.receivedValue,
      cancelledValue: fulfillment.cancelledValue,
      openValue: fulfillment.openValue,
      currentApproverName: approverNames.get(order.id) ?? null,
      lastIssuedAt:
        latestIssueEventByOrder.get(order.id)?.occurredAt.toISOString() ?? null,
      lastIssueActorName: latestIssueEventByOrder.get(order.id)?.actorUserId
        ? (userNames.get(
            latestIssueEventByOrder.get(order.id)?.actorUserId ?? "",
          ) ?? "Recorded user")
        : null,
      lastIssueMethod:
        typeof latestIssueEventByOrder.get(order.id)?.metadata === "object" &&
        latestIssueEventByOrder.get(order.id)?.metadata !== null &&
        !Array.isArray(latestIssueEventByOrder.get(order.id)?.metadata)
          ? (((
              latestIssueEventByOrder.get(order.id)?.metadata as Record<
                string,
                unknown
              >
            ).communicationMethod as string | undefined) ?? null)
          : null,
      lastIssueReference:
        typeof latestIssueEventByOrder.get(order.id)?.metadata === "object" &&
        latestIssueEventByOrder.get(order.id)?.metadata !== null &&
        !Array.isArray(latestIssueEventByOrder.get(order.id)?.metadata)
          ? (((
              latestIssueEventByOrder.get(order.id)?.metadata as Record<
                string,
                unknown
              >
            ).recipientReference as string | undefined) ?? null)
          : null,
      createdByName: order.createdBy.displayName,
      createdAt: order.createdAt.toISOString(),
      lineCount: order.lines.length,
      lines: order.lines.map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        description: line.description,
        orderedQty: Number(line.orderedQty),
        receivedQty: Number(line.receivedQty),
        cancelledQty: Number(line.cancelledQty),
        uomCode: line.uom.uomCode,
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
      })),
    };
  });

  if (!options.dashboardProfile && normalizedFilters.approver) {
    const approverQuery = normalizedFilters.approver.toLowerCase();
    return mappedOrders.filter((order) =>
      order.currentApproverName?.toLowerCase().includes(approverQuery),
    );
  }

  return mappedOrders;
}

export async function listPurchaseOrders(
  session: SessionContext,
  filters: PurchaseOrderListFilters = {},
) {
  return listPurchaseOrdersWithOptions(session, filters);
}

export type PurchaseOrderDashboardProfilePage = {
  profile: PurchaseOrderDashboardProfile;
  items: Awaited<ReturnType<typeof listPurchaseOrders>>;
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listPurchaseOrdersDashboardProfilePage(
  session: SessionContext,
  profileValue: string | undefined,
  requestedPage: number,
): Promise<PurchaseOrderDashboardProfilePage | null> {
  const profile = resolvePurchaseOrderDashboardProfile(profileValue);
  if (!profile) {
    return null;
  }
  await requirePurchaseOrderRead(session);
  const pageSize = 25;
  const totalCount = await prisma.purchaseOrder.count({
    where: purchaseOrderListWhere(session, {}, profile),
  });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const items = await listPurchaseOrdersWithOptions(session, {}, {
    dashboardProfile: profile,
    pagination: { page, pageSize },
  });

  return { profile, items, totalCount, page, pageSize, totalPages };
}

/**
 * Export companion for a closed dashboard profile. This intentionally accepts no
 * ordinary workspace filters so a dashboard export cannot silently change the
 * population shown by its count and pages.
 */
export async function listPurchaseOrdersDashboardProfile(
  session: SessionContext,
  profileValue: string | undefined,
) {
  const profile = resolvePurchaseOrderDashboardProfile(profileValue);
  if (!profile) {
    return null;
  }
  return listPurchaseOrdersWithOptions(session, {}, { dashboardProfile: profile });
}

export async function getPurchaseOrder(session: SessionContext, id: string) {
  await requirePurchaseOrderRead(session);

  const order = await prisma.purchaseOrder.findFirst({
    where: {
      id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      deliveryLocationId: session.context.locationId,
    },
    include: {
      supplier: true,
      purchaseRequest: {
        include: {
          requester: true,
          requestLocation: true,
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              item: true,
              uom: true,
            },
          },
        },
      },
      quotationRequest: true,
      quotationRecommendation: {
        include: {
          preparedBy: true,
        },
      },
      selectedSupplierQuotation: true,
      deliveryLocation: true,
      department: true,
      costCenter: true,
      createdBy: true,
      goodsReceipts: {
        orderBy: { createdAt: "desc" },
        include: {
          receivedBy: true,
          lines: true,
        },
      },
      balanceClosures: {
        orderBy: { requestedAt: "desc" },
        include: {
          requestedBy: true,
          approvedBy: true,
        },
      },
      amendments: {
        orderBy: { requestedAt: "desc" },
        include: {
          requestedBy: true,
          approvedBy: true,
        },
      },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true,
          sourcePrLine: true,
          sourceSupplierQuoteLine: true,
        },
      },
    },
  });

  if (!order) {
    return null;
  }

  assertAuthorizedLocation(session, order.deliveryLocationId);

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      entityType: "PurchaseOrder",
      entityId: order.id,
    },
    orderBy: { occurredAt: "asc" },
  });
  const approvalInstances = await prisma.approvalInstance.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "PurchaseOrder",
      documentId: order.id,
    },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const approvalSteps = approvalInstances.flatMap((approval) => approval.steps);
  const assignedUserIds = approvalSteps
    .flatMap((step) => [step.assignedUserId, step.actedByUserId])
    .filter((id): id is string => Boolean(id));
  const auditActorUserIds = auditEvents
    .map((event) => event.actorUserId)
    .filter((id): id is string => Boolean(id));
  const userIdsForTimeline = Array.from(
    new Set([...assignedUserIds, ...auditActorUserIds]),
  );
  const assignedRoleIds = approvalSteps
    .map((step) => step.assignedRoleId)
    .filter((id): id is string => Boolean(id));
  const [approvalUsers, approvalRoles] = await Promise.all([
    userIdsForTimeline.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIdsForTimeline } },
          select: { id: true, displayName: true },
        })
      : Promise.resolve([]),
    assignedRoleIds.length > 0
      ? prisma.role.findMany({
          where: { id: { in: assignedRoleIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const approvalUserNames = new Map(
    approvalUsers.map((user) => [user.id, user.displayName]),
  );
  const approvalRoleNames = new Map(
    approvalRoles.map((role) => [role.id, role.name]),
  );
  const expectedDeliveryDate = order.expectedDeliveryDate
    .toISOString()
    .slice(0, 10);
  const deliveryAging = classifyPurchaseOrderDeliveryAging({
    status: order.status,
    expectedDeliveryDate,
    today: new Date().toISOString().slice(0, 10),
  });

  return {
    id: order.id,
    publicReference: order.publicReference,
    status: order.status,
    supplierName: order.supplier.tradingName ?? order.supplier.legalName,
    supplierCode: order.supplier.supplierCode,
    purchaseRequestId: order.purchaseRequestId,
    purchaseRequestReference: order.purchaseRequest.publicReference,
    purchaseRequestStatus: order.purchaseRequest.status,
    requesterName: order.purchaseRequest.requester.displayName,
    quotationRequestId: order.quotationRequestId,
    quotationRecommendationId: order.quotationRecommendationId,
    selectedQuoteReference: order.selectedSupplierQuotation.quoteReference,
    selectedQuoteDate: order.selectedSupplierQuotation.quoteDate
      .toISOString()
      .slice(0, 10),
    selectedQuoteValidityDate:
      order.selectedSupplierQuotation.validityDate
        ?.toISOString()
        .slice(0, 10) ?? null,
    selectedQuoteTerms: order.selectedSupplierQuotation.terms ?? null,
    supplierPaymentTerms: order.supplier.paymentTerms ?? null,
    recommendationStatus: order.quotationRecommendation.status,
    recommendationPreparedByName:
      order.quotationRecommendation.preparedBy.displayName,
    recommendationSelectionReason:
      order.quotationRecommendation.selectionReason,
    recommendationNonLowestJustification:
      order.quotationRecommendation.nonLowestJustification,
    recommendationSingleSourceJustification:
      order.quotationRecommendation.singleSourceJustification,
    deliveryLocationName: order.deliveryLocation.name,
    departmentName: order.department?.name ?? null,
    costCenterName: order.costCenter?.name ?? null,
    expectedDeliveryDate,
    deliveryAgingStatus: deliveryAging.deliveryAgingStatus,
    daysOverdue: deliveryAging.daysOverdue,
    currencyCode: order.currencyCode,
    subtotalAmount: Number(order.subtotalAmount),
    taxAmount: Number(order.taxAmount),
    discountAmount: Number(order.discountAmount),
    totalAmount: Number(order.totalAmount),
    createdByName: order.createdBy.displayName,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    sourceSnapshot: order.sourceSnapshot,
    lines: order.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      sourcePrLineId: line.sourcePrLineId,
      sourceSupplierQuoteLineId: line.sourceSupplierQuoteLineId,
      itemCode: line.item?.itemCode ?? null,
      itemName: line.item?.itemName ?? null,
      description: line.description,
      orderedQty: Number(line.orderedQty),
      receivedQty: Number(line.receivedQty),
      cancelledQty: Number(line.cancelledQty),
      outstandingQty:
        Number(line.orderedQty) -
        Number(line.receivedQty) -
        Number(line.cancelledQty),
      uomCode: line.uom.uomCode,
      unitPrice: Number(line.unitPrice),
      taxAmount: Number(line.taxAmount),
      discountAmount: Number(line.discountAmount),
      lineTotal: Number(line.lineTotal),
      availabilityStatus: line.availabilityStatus,
      leadTimeDays: line.leadTimeDays,
      notes: line.notes,
      sourcePrPurpose: line.sourcePrLine?.purpose ?? null,
    })),
    receivingReports: order.goodsReceipts.map((receipt) => ({
      id: receipt.id,
      publicReference: receipt.publicReference,
      status: receipt.status,
      receivedByName: receipt.receivedBy.displayName,
      receivedAt: receipt.receivedAt.toISOString(),
      postedAt: receipt.postedAt?.toISOString() ?? null,
      supplierDeliveryReceiptNumber:
        receipt.supplierDeliveryReceiptNumber ?? null,
      discrepancyFlag: receipt.discrepancyFlag,
      acceptedQty: receipt.lines.reduce(
        (total, line) => total + Number(line.acceptedQty),
        0,
      ),
      rejectedQty: receipt.lines.reduce(
        (total, line) => total + Number(line.rejectedQty),
        0,
      ),
      damagedQty: receipt.lines.reduce(
        (total, line) => total + Number(line.damagedQty),
        0,
      ),
      shortQty: receipt.lines.reduce(
        (total, line) => total + Number(line.shortQty),
        0,
      ),
    })),
    balanceClosures: order.balanceClosures.map((closure) => ({
      id: closure.id,
      status: closure.status,
      reason: closure.reason,
      supplierNoticeReference: closure.supplierNoticeReference,
      supplierNoticeUnavailableReason: closure.supplierNoticeUnavailableReason,
      notes: closure.notes,
      totalClosedQuantity: Number(closure.totalClosedQuantity),
      totalClosedValue: Number(closure.totalClosedValue),
      requestedByName: closure.requestedBy.displayName,
      approvedByName: closure.approvedBy?.displayName ?? null,
      requestedAt: closure.requestedAt.toISOString(),
      approvedAt: closure.approvedAt?.toISOString() ?? null,
      rejectedAt: closure.rejectedAt?.toISOString() ?? null,
      rejectionReason: closure.rejectionReason,
      lineSnapshot: closure.lineSnapshot,
    })),
    amendments: order.amendments.map((amendment) => ({
      id: amendment.id,
      status: amendment.status,
      reason: amendment.reason,
      supplierNoticeReference: amendment.supplierNoticeReference,
      supplierNoticeUnavailableReason:
        amendment.supplierNoticeUnavailableReason,
      requestedByName: amendment.requestedBy.displayName,
      approvedByName: amendment.approvedBy?.displayName ?? null,
      requestedAt: amendment.requestedAt.toISOString(),
      approvedAt: amendment.approvedAt?.toISOString() ?? null,
      rejectedAt: amendment.rejectedAt?.toISOString() ?? null,
      rejectionReason: amendment.rejectionReason,
      appliedAt: amendment.appliedAt?.toISOString() ?? null,
      beforeSnapshot: amendment.beforeSnapshot,
      proposedSnapshot: amendment.proposedSnapshot,
    })),
    purchaseRequestLines: order.purchaseRequest.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      itemName: line.item?.itemName ?? null,
      description: line.description,
      requestedQty: Number(line.requestedQty),
      uomCode: line.uom?.uomCode ?? line.uomCode,
      purpose: line.purpose,
    })),
    approvalTimeline: approvalInstances.map((approval) => ({
      id: approval.id,
      status: approval.status,
      currentStepOrder: approval.currentStepOrder,
      createdAt: approval.createdAt.toISOString(),
      steps: approval.steps.map((step) => ({
        id: step.id,
        stepOrder: step.stepOrder,
        status: step.status,
        assignedName: step.assignedUserId
          ? (approvalUserNames.get(step.assignedUserId) ?? "Assigned user")
          : step.assignedRoleId
            ? (approvalRoleNames.get(step.assignedRoleId) ?? "Assigned role")
            : "Operations approver",
        actedByName: step.actedByUserId
          ? (approvalUserNames.get(step.actedByUserId) ?? "Approver")
          : null,
        actedAt: step.actedAt?.toISOString() ?? null,
        remarks: step.remarks ?? null,
      })),
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      actorUserId: event.actorUserId ?? "",
      actorName: event.actorUserId
        ? (approvalUserNames.get(event.actorUserId) ?? "Recorded user")
        : null,
      occurredAt: event.occurredAt.toISOString(),
      metadata:
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>)
          : undefined,
    })),
  };
}

export async function listApprovedRecommendationsForPo(
  session: SessionContext,
) {
  await requirePermission(session, permissions.purchaseOrderCreate);

  const recommendations = await prisma.quotationRecommendation.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "APPROVED",
      purchaseOrder: null,
      quotationRequest: {
        purchaseRequest: {
          requestLocationId: session.context.locationId,
          status: "APPROVED",
        },
      },
    },
    include: {
      quotationRequest: {
        include: {
          purchaseRequest: {
            include: {
              requestLocation: true,
            },
          },
        },
      },
      selectedSupplierQuotation: {
        include: {
          supplier: true,
          lines: {
            include: {
              uom: true,
              item: true,
              sourcePrLine: true,
            },
          },
        },
      },
      preparedBy: true,
    },
    orderBy: { approvedAt: "desc" },
  });

  return recommendations.map((recommendation) => ({
    id: recommendation.id,
    purchaseRequestReference:
      recommendation.quotationRequest.purchaseRequest.publicReference,
    selectedSupplierName:
      recommendation.selectedSupplierQuotation.supplier.tradingName ??
      recommendation.selectedSupplierQuotation.supplier.legalName,
    selectedQuoteReference:
      recommendation.selectedSupplierQuotation.quoteReference,
    currencyCode: recommendation.currencyCode,
    selectedEvaluatedTotal: Number(recommendation.selectedEvaluatedTotal),
    expectedDeliveryDate:
      recommendation.quotationRequest.purchaseRequest.requiredDate
        .toISOString()
        .slice(0, 10),
    lineLabel:
      recommendation.selectedSupplierQuotation.lines[0]?.item?.itemName ??
      recommendation.selectedSupplierQuotation.lines[0]?.sourcePrLine
        ?.description ??
      "Approved quote line",
    preparedByName: recommendation.preparedBy.displayName,
  }));
}

export async function createPurchaseOrderFromRecommendation(
  formData: FormData,
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseOrderCreate);
  const values = createPurchaseOrderSchema.parse(Object.fromEntries(formData));

  const recommendation = await prisma.quotationRecommendation.findFirst({
    where: {
      id: values.quotationRecommendationId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    include: {
      purchaseOrder: true,
      quotationRequest: {
        include: {
          purchaseRequest: true,
        },
      },
      selectedSupplierQuotation: {
        include: {
          supplier: true,
          lines: {
            include: {
              uom: true,
              item: true,
              sourcePrLine: true,
            },
          },
        },
      },
    },
  });

  if (!recommendation) {
    throw new Error("QUOTATION_RECOMMENDATION_NOT_FOUND");
  }
  assertApprovedQuotationRecommendationForPo(recommendation.status);

  const purchaseRequest = recommendation.quotationRequest.purchaseRequest;
  assertAuthorizedLocation(session, purchaseRequest.requestLocationId);
  if (purchaseRequest.status !== "APPROVED") {
    throw new Error("PURCHASE_REQUEST_NOT_APPROVED_FOR_PO");
  }
  if (recommendation.purchaseOrder) {
    throw new Error("PURCHASE_ORDER_ALREADY_EXISTS_FOR_RECOMMENDATION");
  }
  const supplierPolicy = await getPurchasingSupplierPolicy(session);
  assertSupplierStatusAllowedForPurchaseOrder(
    recommendation.selectedSupplierQuotation.supplier.accreditationStatus,
    supplierPolicy,
  );

  const lineSnapshots = buildPurchaseOrderLineSnapshots(
    recommendation.selectedSupplierQuotation.lines,
  );
  const totals = calculatePurchaseOrderTotals(lineSnapshots);
  const publicReference = `PO-${new Date().getUTCFullYear()}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;

  await prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: purchaseRequest.brandId,
        publicReference,
        purchaseRequestId: purchaseRequest.id,
        quotationRequestId: recommendation.quotationRequestId,
        quotationRecommendationId: recommendation.id,
        selectedSupplierQuotationId: recommendation.selectedSupplierQuotationId,
        supplierId: recommendation.selectedSupplierQuotation.supplierId,
        deliveryLocationId: purchaseRequest.requestLocationId,
        departmentId: purchaseRequest.departmentId,
        costCenterId: purchaseRequest.costCenterId,
        currencyCode: recommendation.currencyCode,
        subtotalAmount: totals.subtotalAmount,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
        expectedDeliveryDate: purchaseRequest.requiredDate,
        status: "DRAFT",
        sourceSnapshot: {
          lifecycleEnabled: true,
          supplierCommitmentRequiresIssue: true,
          purchaseRequestId: purchaseRequest.id,
          purchaseRequestReference: purchaseRequest.publicReference,
          quotationRequestId: recommendation.quotationRequestId,
          quotationRecommendationId: recommendation.id,
          selectedSupplierQuotationId:
            recommendation.selectedSupplierQuotationId,
          selectedQuoteReference:
            recommendation.selectedSupplierQuotation.quoteReference,
          supplierId: recommendation.selectedSupplierQuotation.supplierId,
          supplierCode:
            recommendation.selectedSupplierQuotation.supplier.supplierCode,
          selectionReason: recommendation.selectionReason,
          nonLowestJustification: recommendation.nonLowestJustification ?? null,
          singleSourceJustification:
            recommendation.singleSourceJustification ?? null,
          lines: lineSnapshots.map((line) => ({
            sourceSupplierQuoteLineId: line.sourceSupplierQuoteLineId,
            sourcePrLineId: line.sourcePrLineId,
            budgetLineId: line.budgetLineId,
            itemId: line.itemId,
            lineNumber: line.lineNumber,
            description: line.description,
            orderedQty: line.orderedQty,
            uomId: line.uomId,
            uomCode: line.uomCode,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })),
        },
        createdByUserId: session.user.id,
        lines: {
          create: lineSnapshots.map((line) => ({
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            sourcePrLineId: line.sourcePrLineId,
            sourceSupplierQuoteLineId: line.sourceSupplierQuoteLineId,
            budgetLineId: line.budgetLineId,
            itemId: line.itemId,
            uomId: line.uomId,
            lineNumber: line.lineNumber,
            description: line.description,
            orderedQty: line.orderedQty,
            receivedQty: 0,
            cancelledQty: 0,
            unitPrice: line.unitPrice,
            taxAmount: line.taxAmount,
            discountAmount: line.discountAmount,
            lineTotal: line.lineTotal,
            availabilityStatus: line.availabilityStatus,
            leadTimeDays: line.leadTimeDays,
            notes: line.notes,
          })),
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_order.created",
        entityType: "PurchaseOrder",
        entityId: order.id,
        afterData: {
          status: "DRAFT",
          totalAmount: totals.totalAmount,
          currencyCode: recommendation.currencyCode,
        },
        metadata: {
          lifecycleEnabled: true,
          supplierCommitmentRequiresIssue: true,
          purchaseRequestId: purchaseRequest.id,
          quotationRequestId: recommendation.quotationRequestId,
          quotationRecommendationId: recommendation.id,
          selectedSupplierQuotationId:
            recommendation.selectedSupplierQuotationId,
          supplierId: recommendation.selectedSupplierQuotation.supplierId,
          deliveryLocationId: purchaseRequest.requestLocationId,
          lineCount: lineSnapshots.length,
        },
      },
    });
  });
}

export async function submitPurchaseOrderForApproval(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseOrderSubmit);
  const values = submitPurchaseOrderSchema.parse(Object.fromEntries(formData));

  const order = await prisma.purchaseOrder.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      deliveryLocationId: session.context.locationId,
    },
    include: {
      purchaseRequest: true,
      quotationRecommendation: true,
      supplier: true,
      deliveryLocation: true,
    },
  });

  if (!order) {
    throw new Error("PURCHASE_ORDER_NOT_FOUND");
  }
  assertAuthorizedLocation(session, order.deliveryLocationId);
  assertPurchaseOrderCanSubmitForApproval(order.status);

  if (order.purchaseRequest.status !== "APPROVED") {
    throw new Error("PURCHASE_REQUEST_NOT_APPROVED_FOR_PO");
  }
  assertApprovedQuotationRecommendationForPo(
    order.quotationRecommendation.status,
  );
  const supplierPolicy = await getPurchasingSupplierPolicy(session);
  assertSupplierStatusAllowedForPurchaseOrder(
    order.supplier.accreditationStatus,
    supplierPolicy,
  );
  if (order.deliveryLocation.status !== "ACTIVE") {
    throw new Error("PURCHASE_ORDER_DELIVERY_LOCATION_INACTIVE");
  }

  await prisma.$transaction(async (tx) => {
    const approvalRule = await tx.approvalRule.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        transactionType: "PurchaseOrder",
        isActive: true,
      },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
        },
      },
      orderBy: { priority: "asc" },
    });

    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("APPROVAL_RULE_NOT_CONFIGURED");
    }

    const existingApproval = await tx.approvalInstance.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "PurchaseOrder",
        documentId: order.id,
        status: "PENDING",
      },
    });

    if (existingApproval) {
      throw new Error("PURCHASE_ORDER_ALREADY_SUBMITTED");
    }

    const firstStep = approvalRule.steps[0];
    if (!firstStep) {
      throw new Error("APPROVAL_RULE_NOT_CONFIGURED");
    }

    const routedSteps = approvalRule.steps.map((step, index) => ({
      ...step,
      approvalInstanceStepId: randomUUID(),
      activationStatus: index === 0 ? "PENDING" as const : "WAITING" as const
    }));
    const firstRoutedStep = routedSteps[0];
    if (!firstRoutedStep) throw new Error("APPROVAL_RULE_NOT_CONFIGURED");

    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "PurchaseOrder",
        documentId: order.id,
        approvalRuleId: approvalRule.id,
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: routedSteps.map((step) => ({
            id: step.approvalInstanceStepId,
            stepOrder: step.stepOrder,
            assignedRoleId: step.roleId,
            assignedUserId: step.userId,
            status: step.activationStatus,
          })),
        },
      },
    });

    const prohibitedActors = Array.from(new Map([
      [order.createdByUserId, {
        userId: order.createdByUserId,
        reasonCode: "CREATOR"
      }],
      [order.purchaseRequest.requesterUserId, {
        userId: order.purchaseRequest.requesterUserId,
        reasonCode: "REQUESTER"
      }],
      [order.quotationRecommendation.preparedByUserId, {
        userId: order.quotationRecommendation.preparedByUserId,
        reasonCode: "PREPARER"
      }]
    ]).values());
    for (const step of routedSteps) {
      await configureApprovalStepRouting(tx, {
        approvalInstanceStepId: step.approvalInstanceStepId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        routingPolicy: getApprovalRoutingPolicy("PurchaseOrder"),
        requiredPermissionCode: permissions.purchaseOrderApprove,
        dueAt: order.expectedDeliveryDate,
        activationAudit: {
          actorUserId: session.user.id,
          source: "purchase-order-submission"
        },
        scopeGroups: [{
          groupOrder: 1,
          targetMatchMode: "ANY",
          targets: [{
            scopeType: "LOCATION",
            companyId: session.context.companyId,
            locationId: order.deliveryLocationId
          }]
        }],
        prohibitedActors
      });
    }
    const firstEligibleActor = await assertAnyEligibleApprovalActorForStep(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      approvalInstanceStepId: firstRoutedStep.approvalInstanceStepId
    });

    const updated = await tx.purchaseOrder.updateMany({
      where: {
        id: order.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "DRAFT",
      },
      data: {
        status: "PENDING_APPROVAL",
      },
    });

    if (updated.count !== 1) {
      throw new Error("PURCHASE_ORDER_NOT_DRAFT_FOR_APPROVAL");
    }

    const auditEvent = await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_order.submitted",
        entityType: "PurchaseOrder",
        entityId: order.id,
        beforeData: { status: "DRAFT" },
        afterData: {
          status: "PENDING_APPROVAL",
          currentStepOrder: firstStep.stepOrder,
        },
        metadata: {
          approvalInstanceId: approvalInstance.id,
          approvalRuleId: approvalRule.id,
          purchaseRequestId: order.purchaseRequestId,
          quotationRecommendationId: order.quotationRecommendationId,
          supplierId: order.supplierId,
          totalAmount: Number(order.totalAmount),
        },
      },
    });

    await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: order.deliveryLocationId,
      recipientUserIds: [firstEligibleActor.userId],
      notificationType: "APPROVE_PURCHASE_ORDER",
      priority: "NORMAL",
      title: `Approve Purchase Order ${order.publicReference}`,
      body: `${session.user.displayName} submitted ${order.publicReference} for ${order.supplier.tradingName ?? order.supplier.legalName}.`,
      deepLink: `/approvals/${approvalInstance.id}`,
      entityType: "PurchaseOrder",
      entityId: order.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalStepOrder: firstStep.stepOrder,
        publicReference: order.publicReference,
        supplierId: order.supplierId,
      },
    });
  });
}

export async function issuePurchaseOrderToSupplier(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseOrderIssue);
  const values = issuePurchaseOrderSchema.parse(Object.fromEntries(formData));
  assertPurchaseOrderIssueMethodAllowed(values.communicationMethod);

  const order = await prisma.purchaseOrder.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      deliveryLocationId: session.context.locationId,
      status: { in: ["APPROVED", "ISSUED"] },
    },
    include: {
      supplier: true,
      deliveryLocation: true,
    },
  });

  if (!order) {
    throw new Error("PURCHASE_ORDER_NOT_FOUND");
  }
  assertAuthorizedLocation(session, order.deliveryLocationId);

  const supplierPolicy = await getPurchasingSupplierPolicy(session);
  assertSupplierStatusAllowedForPurchaseOrder(
    order.supplier.accreditationStatus,
    supplierPolicy,
    "SUPPLIER_NOT_ACTIVE_FOR_PO_ISSUE",
  );
  if (order.deliveryLocation.status !== "ACTIVE") {
    throw new Error("PURCHASE_ORDER_DELIVERY_LOCATION_INACTIVE");
  }

  const metadata = {
    communicationMethod: values.communicationMethod,
    recipientReference: values.recipientReference || null,
    remarks: values.remarks || null,
    supplierId: order.supplierId,
    totalAmount: Number(order.totalAmount),
  };

  if (order.status === "ISSUED") {
    assertPurchaseOrderCanBeResent(order.status);
    await prisma.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_order.resent",
        entityType: "PurchaseOrder",
        entityId: order.id,
        beforeData: { status: "ISSUED" },
        afterData: { status: "ISSUED" },
        metadata,
      },
    });
    return;
  }

  assertPurchaseOrderCanBeIssued(order.status);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.purchaseOrder.updateMany({
      where: {
        id: order.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "APPROVED",
      },
      data: {
        status: "ISSUED",
      },
    });

    if (updated.count !== 1) {
      throw new Error("PURCHASE_ORDER_NOT_APPROVED_FOR_ISSUE");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_order.issued",
        entityType: "PurchaseOrder",
        entityId: order.id,
        beforeData: { status: "APPROVED" },
        afterData: { status: "ISSUED" },
        metadata,
      },
    });
  });
}

export async function cancelPurchaseOrder(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseOrderCancel);
  const values = cancelPurchaseOrderSchema.parse(Object.fromEntries(formData));

  const order = await prisma.purchaseOrder.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      deliveryLocationId: session.context.locationId,
    },
    include: {
      lines: true,
      goodsReceipts: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error("PURCHASE_ORDER_NOT_FOUND");
  }
  assertAuthorizedLocation(session, order.deliveryLocationId);

  const receivedQty = order.lines.reduce(
    (total, line) => total + Number(line.receivedQty),
    0,
  );
  assertPurchaseOrderCanBeCancelled({
    status: order.status,
    receivedQty,
    receiptCount: order.goodsReceipts.length,
  });

  const supplierNoticeReference = values.supplierNoticeReference || null;
  const supplierNoticeUnavailableReason =
    values.supplierNoticeUnavailableReason || null;
  if (
    order.status === "ISSUED" &&
    !supplierNoticeReference &&
    !supplierNoticeUnavailableReason
  ) {
    throw new Error("PURCHASE_ORDER_SUPPLIER_CANCELLATION_NOTICE_REQUIRED");
  }

  await prisma.$transaction(async (tx) => {
    const activeReceiptCount = await tx.goodsReceipt.count({
      where: {
        purchaseOrderId: order.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
      },
    });
    const currentLines = await tx.purchaseOrderLine.findMany({
      where: {
        purchaseOrderId: order.id,
      },
      select: {
        id: true,
        budgetLineId: true,
        orderedQty: true,
        receivedQty: true,
        cancelledQty: true,
      },
    });
    const currentReceivedQty = currentLines.reduce(
      (total, line) => total + Number(line.receivedQty),
      0,
    );

    assertPurchaseOrderCanBeCancelled({
      status: order.status,
      receivedQty: currentReceivedQty,
      receiptCount: activeReceiptCount,
    });

    const updated = await tx.purchaseOrder.updateMany({
      where: {
        id: order.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        deliveryLocationId: session.context.locationId,
        status: { in: ["DRAFT", "APPROVED", "ISSUED"] },
      },
      data: {
        status: "CANCELLED",
        cancellationSubtype: "pre_receiving_cancellation",
        cancellationReason: values.cancellationReason,
        cancelledAt: new Date(),
        cancelledByUserId: session.user.id,
      },
    });

    if (updated.count !== 1) {
      throw new Error("PURCHASE_ORDER_NOT_CANCELLABLE");
    }

    for (const line of currentLines) {
      await tx.purchaseOrderLine.update({
        where: {
          id: line.id,
        },
        data: {
          cancelledQty: Number(line.orderedQty) - Number(line.receivedQty),
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_order.cancelled",
        entityType: "PurchaseOrder",
        entityId: order.id,
        beforeData: { status: order.status },
        afterData: { status: "CANCELLED" },
        metadata: {
          cancellationSubtype: "pre_receiving_cancellation",
          cancellationReason: values.cancellationReason,
          previousStatus: order.status,
          supplierNoticeReference,
          supplierNoticeUnavailableReason,
          purchaseRequestId: order.purchaseRequestId,
          quotationRecommendationId: order.quotationRecommendationId,
          supplierId: order.supplierId,
          totalAmount: Number(order.totalAmount),
          lineCount: currentLines.length,
        },
      },
    });

    for (const line of currentLines) {
      if (!line.budgetLineId) {
        continue;
      }
      await reverseBudgetCommitmentFromApprovedSourceEvent(tx, session, {
        sourceType: "PURCHASE_ORDER",
        sourceId: order.id,
        sourceEventKey: `purchase_order.approved:${line.id}`,
        reversalEventKey: `purchase_order.cancelled:${line.id}`,
        reason: values.cancellationReason,
      });
    }
  });
}

export async function requestPurchaseOrderBalanceClosure(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseOrderCloseRemaining);
  const values = requestPurchaseOrderBalanceClosureSchema.parse(
    Object.fromEntries(formData),
  );

  const supplierNoticeReference = values.supplierNoticeReference || null;
  const supplierNoticeUnavailableReason =
    values.supplierNoticeUnavailableReason || null;
  assertSupplierNoticeEvidence(
    supplierNoticeReference,
    supplierNoticeUnavailableReason,
  );

  const order = await prisma.purchaseOrder.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      deliveryLocationId: session.context.locationId,
    },
    include: {
      supplier: true,
      purchaseRequest: true,
      quotationRecommendation: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          uom: true,
        },
      },
      goodsReceipts: {
        select: {
          id: true,
          status: true,
        },
      },
      balanceClosures: {
        where: {
          status: "PENDING_APPROVAL",
        },
        select: {
          id: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error("PURCHASE_ORDER_NOT_FOUND");
  }
  assertAuthorizedLocation(session, order.deliveryLocationId);

  const lineSnapshot = buildPurchaseOrderClosureLineSnapshot(order.lines);
  const outstandingQty = lineSnapshot.reduce(
    (total, line) => total + line.remainingQty,
    0,
  );
  assertPurchaseOrderCanRequestBalanceClosure({
    status: order.status,
    outstandingQty,
    draftReceiptCount: order.goodsReceipts.filter(
      (receipt) => receipt.status !== "POSTED",
    ).length,
    pendingClosureCount: order.balanceClosures.length,
  });

  await prisma.$transaction(async (tx) => {
    const approvalRule = await tx.approvalRule.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        transactionType: "PurchaseOrderBalanceClosure",
        isActive: true,
      },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
        },
      },
      orderBy: { priority: "asc" },
    });

    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("APPROVAL_RULE_NOT_CONFIGURED");
    }

    const currentOrder = await tx.purchaseOrder.findFirst({
      where: {
        id: order.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        deliveryLocationId: session.context.locationId,
      },
      include: {
        lines: {
          orderBy: { lineNumber: "asc" },
          include: { uom: true },
        },
        goodsReceipts: {
          select: { id: true, status: true },
        },
        balanceClosures: {
          where: { status: "PENDING_APPROVAL" },
          select: { id: true },
        },
      },
    });

    if (!currentOrder) {
      throw new Error("PURCHASE_ORDER_NOT_FOUND");
    }

    const currentLineSnapshot = buildPurchaseOrderClosureLineSnapshot(
      currentOrder.lines,
    );
    const currentOutstandingQty = currentLineSnapshot.reduce(
      (total, line) => total + line.remainingQty,
      0,
    );
    assertPurchaseOrderCanRequestBalanceClosure({
      status: currentOrder.status,
      outstandingQty: currentOutstandingQty,
      draftReceiptCount: currentOrder.goodsReceipts.filter(
        (receipt) => receipt.status !== "POSTED",
      ).length,
      pendingClosureCount: currentOrder.balanceClosures.length,
    });

    const currentClosedValue = currentLineSnapshot.reduce(
      (total, line) => total + line.closedValue,
      0,
    );
    const firstStep = approvalRule.steps[0];
    if (!firstStep) {
      throw new Error("APPROVAL_RULE_NOT_CONFIGURED");
    }

    const closureId = randomUUID();
    const routedSteps = approvalRule.steps.map((step, index) => ({
      ...step,
      approvalInstanceStepId: randomUUID(),
      activationStatus: index === 0 ? "PENDING" as const : "WAITING" as const
    }));
    const firstRoutedStep = routedSteps[0];
    if (!firstRoutedStep) throw new Error("APPROVAL_RULE_NOT_CONFIGURED");

    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "PurchaseOrderBalanceClosure",
        documentId: closureId,
        approvalRuleId: approvalRule.id,
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: routedSteps.map((step) => ({
            id: step.approvalInstanceStepId,
            stepOrder: step.stepOrder,
            assignedRoleId: step.roleId,
            assignedUserId: step.userId,
            status: step.activationStatus,
          })),
        },
      },
    });

    const prohibitedActors = Array.from(new Map([
      [session.user.id, { userId: session.user.id, reasonCode: "REQUESTER" }],
      [order.createdByUserId, {
        userId: order.createdByUserId,
        reasonCode: "CREATOR"
      }],
      [order.purchaseRequest.requesterUserId, {
        userId: order.purchaseRequest.requesterUserId,
        reasonCode: "REQUESTER"
      }],
      [order.quotationRecommendation.preparedByUserId, {
        userId: order.quotationRecommendation.preparedByUserId,
        reasonCode: "PREPARER"
      }]
    ]).values());
    for (const step of routedSteps) {
      await configureApprovalStepRouting(tx, {
        approvalInstanceStepId: step.approvalInstanceStepId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        routingPolicy: getApprovalRoutingPolicy("PurchaseOrderBalanceClosure"),
        requiredPermissionCode: permissions.purchaseOrderApprove,
        dueAt: order.expectedDeliveryDate,
        activationAudit: {
          actorUserId: session.user.id,
          source: "purchase-order-balance-closure-request"
        },
        scopeGroups: [{
          groupOrder: 1,
          targetMatchMode: "ANY",
          targets: [{
            scopeType: "LOCATION",
            companyId: session.context.companyId,
            locationId: order.deliveryLocationId
          }]
        }],
        prohibitedActors
      });
    }
    const firstEligibleActor = await assertAnyEligibleApprovalActorForStep(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      approvalInstanceStepId: firstRoutedStep.approvalInstanceStepId
    });

    const closure = await tx.purchaseOrderBalanceClosure.create({
      data: {
        id: closureId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        purchaseOrderId: order.id,
        requestedByUserId: session.user.id,
        reason: values.reason,
        supplierNoticeReference,
        supplierNoticeUnavailableReason,
        notes: values.notes || null,
        lineSnapshot: currentLineSnapshot,
        totalClosedQuantity: currentOutstandingQty,
        totalClosedValue: currentClosedValue,
      },
    });

    const auditEvent = await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_order_balance_closure.requested",
        entityType: "PurchaseOrderBalanceClosure",
        entityId: closure.id,
        afterData: {
          status: "PENDING_APPROVAL",
          totalClosedQuantity: currentOutstandingQty,
          totalClosedValue: currentClosedValue,
        },
        metadata: {
          approvalInstanceId: approvalInstance.id,
          purchaseOrderId: order.id,
          purchaseOrderReference: order.publicReference,
          supplierId: order.supplierId,
          reason: values.reason,
          supplierNoticeReference,
          supplierNoticeUnavailableReason,
        },
      },
    });

    await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: order.deliveryLocationId,
      recipientUserIds: [firstEligibleActor.userId],
      notificationType: "APPROVE_PO_BALANCE_CLOSURE",
      priority: "NORMAL",
      title: `Approve Balance Closure ${order.publicReference}`,
      body: `${session.user.displayName} requested closure of the remaining balance on ${order.publicReference}.`,
      deepLink: `/approvals/${approvalInstance.id}`,
      entityType: "PurchaseOrderBalanceClosure",
      entityId: closure.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalStepOrder: firstStep.stepOrder,
        purchaseOrderId: order.id,
        publicReference: order.publicReference,
        totalClosedQuantity: currentOutstandingQty,
        totalClosedValue: currentClosedValue,
      },
    });
  });
}

export async function requestPurchaseOrderAmendment(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseOrderAmend);
  const values = requestPurchaseOrderAmendmentSchema.parse(
    Object.fromEntries(formData),
  );

  const supplierNoticeReference = values.supplierNoticeReference || null;
  const supplierNoticeUnavailableReason =
    values.supplierNoticeUnavailableReason || null;
  assertSupplierNoticeEvidence(
    supplierNoticeReference,
    supplierNoticeUnavailableReason,
  );
  const proposedLines = parsePurchaseOrderAmendmentLines(values.proposedLines);

  const order = await prisma.purchaseOrder.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      deliveryLocationId: session.context.locationId,
    },
    include: {
      supplier: true,
      purchaseRequest: true,
      quotationRecommendation: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: { uom: true },
      },
      goodsReceipts: {
        select: { id: true },
      },
      balanceClosures: {
        where: { status: "PENDING_APPROVAL" },
        select: { id: true },
      },
      amendments: {
        where: { status: "PENDING_APPROVAL" },
        select: { id: true },
      },
    },
  });

  if (!order) {
    throw new Error("PURCHASE_ORDER_NOT_FOUND");
  }
  assertAuthorizedLocation(session, order.deliveryLocationId);

  const receivedQty = order.lines.reduce(
    (total, line) => total + Number(line.receivedQty),
    0,
  );
  assertPurchaseOrderCanRequestAmendment({
    status: order.status,
    receivedQty,
    receiptCount: order.goodsReceipts.length,
    pendingClosureCount: order.balanceClosures.length,
    pendingAmendmentCount: order.amendments.length,
  });

  await prisma.$transaction(async (tx) => {
    const approvalRule = await tx.approvalRule.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        transactionType: "PurchaseOrderAmendment",
        isActive: true,
      },
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
      },
      orderBy: { priority: "asc" },
    });

    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("APPROVAL_RULE_NOT_CONFIGURED");
    }

    const currentOrder = await tx.purchaseOrder.findFirst({
      where: {
        id: order.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        deliveryLocationId: session.context.locationId,
      },
      include: {
        lines: {
          orderBy: { lineNumber: "asc" },
          include: { uom: true },
        },
        goodsReceipts: {
          select: { id: true },
        },
        balanceClosures: {
          where: { status: "PENDING_APPROVAL" },
          select: { id: true },
        },
        amendments: {
          where: { status: "PENDING_APPROVAL" },
          select: { id: true },
        },
      },
    });

    if (!currentOrder) {
      throw new Error("PURCHASE_ORDER_NOT_FOUND");
    }

    const currentReceivedQty = currentOrder.lines.reduce(
      (total, line) => total + Number(line.receivedQty),
      0,
    );
    assertPurchaseOrderCanRequestAmendment({
      status: currentOrder.status,
      receivedQty: currentReceivedQty,
      receiptCount: currentOrder.goodsReceipts.length,
      pendingClosureCount: currentOrder.balanceClosures.length,
      pendingAmendmentCount: currentOrder.amendments.length,
    });

    const beforeSnapshot = {
      status: currentOrder.status,
      expectedDeliveryDate: currentOrder.expectedDeliveryDate
        .toISOString()
        .slice(0, 10),
      lines: buildPurchaseOrderAmendmentLineSnapshot(currentOrder.lines),
      totals: {
        subtotalAmount: Number(currentOrder.subtotalAmount),
        taxAmount: Number(currentOrder.taxAmount),
        discountAmount: Number(currentOrder.discountAmount),
        totalAmount: Number(currentOrder.totalAmount),
      },
    };
    const proposedSnapshot = buildPurchaseOrderAmendmentProposal({
      currentLines: currentOrder.lines,
      proposedLines,
      expectedDeliveryDate: values.expectedDeliveryDate,
    });

    const firstStep = approvalRule.steps[0];
    if (!firstStep) {
      throw new Error("APPROVAL_RULE_NOT_CONFIGURED");
    }

    const amendmentId = randomUUID();
    const routedSteps = approvalRule.steps.map((step, index) => ({
      ...step,
      approvalInstanceStepId: randomUUID(),
      activationStatus: index === 0 ? "PENDING" as const : "WAITING" as const
    }));
    const firstRoutedStep = routedSteps[0];
    if (!firstRoutedStep) throw new Error("APPROVAL_RULE_NOT_CONFIGURED");

    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "PurchaseOrderAmendment",
        documentId: amendmentId,
        approvalRuleId: approvalRule.id,
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: routedSteps.map((step) => ({
            id: step.approvalInstanceStepId,
            stepOrder: step.stepOrder,
            assignedRoleId: step.roleId,
            assignedUserId: step.userId,
            status: step.activationStatus,
          })),
        },
      },
    });

    const prohibitedActors = Array.from(new Map([
      [session.user.id, { userId: session.user.id, reasonCode: "REQUESTER" }],
      [order.createdByUserId, {
        userId: order.createdByUserId,
        reasonCode: "CREATOR"
      }],
      [order.purchaseRequest.requesterUserId, {
        userId: order.purchaseRequest.requesterUserId,
        reasonCode: "REQUESTER"
      }],
      [order.quotationRecommendation.preparedByUserId, {
        userId: order.quotationRecommendation.preparedByUserId,
        reasonCode: "PREPARER"
      }]
    ]).values());
    for (const step of routedSteps) {
      await configureApprovalStepRouting(tx, {
        approvalInstanceStepId: step.approvalInstanceStepId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        routingPolicy: getApprovalRoutingPolicy("PurchaseOrderAmendment"),
        requiredPermissionCode: permissions.purchaseOrderApprove,
        dueAt: order.expectedDeliveryDate,
        activationAudit: {
          actorUserId: session.user.id,
          source: "purchase-order-amendment-request"
        },
        scopeGroups: [{
          groupOrder: 1,
          targetMatchMode: "ANY",
          targets: [{
            scopeType: "LOCATION",
            companyId: session.context.companyId,
            locationId: order.deliveryLocationId
          }]
        }],
        prohibitedActors
      });
    }
    const firstEligibleActor = await assertAnyEligibleApprovalActorForStep(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      approvalInstanceStepId: firstRoutedStep.approvalInstanceStepId
    });

    const amendment = await tx.purchaseOrderAmendment.create({
      data: {
        id: amendmentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        purchaseOrderId: order.id,
        requestedByUserId: session.user.id,
        reason: values.reason,
        supplierNoticeReference,
        supplierNoticeUnavailableReason,
        beforeSnapshot,
        proposedSnapshot,
      },
    });

    const updatedOrder = await tx.purchaseOrder.updateMany({
      where: {
        id: order.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        deliveryLocationId: session.context.locationId,
        status: "ISSUED",
      },
      data: {
        status: "AMENDMENT_PENDING",
      },
    });
    if (updatedOrder.count !== 1) {
      throw new Error("PURCHASE_ORDER_NOT_ISSUED_FOR_AMENDMENT");
    }

    const auditEvent = await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_order.amendment_requested",
        entityType: "PurchaseOrder",
        entityId: order.id,
        beforeData: { status: "ISSUED" },
        afterData: { status: "AMENDMENT_PENDING" },
        metadata: {
          amendmentId: amendment.id,
          approvalInstanceId: approvalInstance.id,
          reason: values.reason,
          supplierNoticeReference,
          supplierNoticeUnavailableReason,
          proposedExpectedDeliveryDate: values.expectedDeliveryDate,
          proposedTotalAmount: proposedSnapshot.totals.totalAmount,
        },
      },
    });

    await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: order.deliveryLocationId,
      recipientUserIds: [firstEligibleActor.userId],
      notificationType: "APPROVE_PO_AMENDMENT",
      priority: "NORMAL",
      title: `Approve PO Amendment ${order.publicReference}`,
      body: `${session.user.displayName} requested an amendment to ${order.publicReference}.`,
      deepLink: `/approvals/${approvalInstance.id}`,
      entityType: "PurchaseOrderAmendment",
      entityId: amendment.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalStepOrder: firstStep.stepOrder,
        purchaseOrderId: order.id,
        publicReference: order.publicReference,
        proposedTotalAmount: proposedSnapshot.totals.totalAmount,
      },
    });
  });
}
