import { prisma, type Prisma } from "@ogfi/database";
import { z } from "zod";
import { TRANSFER_MAX_LINES } from "../../lib/workflowLimits";
import { canUseTransfers, permissions, requirePermission } from "./authorization";
import { assertAuthorizedLocation, requireSessionContext, type SessionContext } from "./context";
import type { CsvRow } from "./csv";
import {
  lockInventoryLocationsForPosting,
  postInventoryMovementInTransaction
} from "./inventory";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";
import {
  dashboardTaskAfterWhere,
  type DashboardTaskCursor,
  type DashboardTaskFilter
} from "./dashboardTasks";

const optionalDateSchema = z
  .string()
  .optional()
  .transform((value) => (value ? new Date(value) : undefined));

const createTransferSchema = z.object({
  sourceInventoryLocationId: z.string().uuid(),
  transferType: z.string().trim().min(2).max(80),
  purpose: z.string().trim().min(5).max(500),
  requiredByDate: optionalDateSchema
});

const createTransferLineSchema = z.object({
  itemId: z.string().uuid(),
  requestedQty: z.coerce.number().positive(),
  notes: z.string().trim().max(1000).optional()
});

type TransferLineDraft = {
  lineNumber: number;
  item: {
    id: string;
    itemName: string;
    baseUomId: string;
  };
  requestedQty: number;
  notes: string | null;
};

const transferActionSchema = z.object({
  id: z.string().uuid()
});

const receiveTransferSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().trim().max(1000).optional()
});

const reverseTransferReceiptSchema = z.object({
  id: z.string().uuid(),
  receiptId: z.string().uuid(),
  reversalReason: z.string().trim().min(5).max(500)
});

const settleTransferDiscrepancySchema = z.object({
  id: z.string().uuid(),
  settlementReason: z.string().trim().min(5).max(1000),
  evidenceReference: z.string().trim().min(3).max(160),
  settlementType: z
    .enum(["INVESTIGATION_CLOSED", "REPLACEMENT_TRANSFER", "ADJUSTMENT_LINKED"])
    .default("INVESTIGATION_CLOSED")
});

const cancelTransferSchema = z.object({
  id: z.string().uuid(),
  cancellationReason: z.string().trim().min(5).max(500)
});

export function assertTransferLocationsDistinct(
  sourceLocationId: string,
  destinationLocationId: string
) {
  if (sourceLocationId === destinationLocationId) {
    throw new Error("TRANSFER_SOURCE_DESTINATION_MUST_DIFFER");
  }
}

export function assertPositiveTransferQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("TRANSFER_QUANTITY_INVALID");
  }
}

export function assertTransferCanSubmit(status: string) {
  if (status !== "DRAFT") {
    throw new Error("TRANSFER_NOT_DRAFT_FOR_SUBMIT");
  }
}

export function assertTransferCanCancel(status: string) {
  if (status !== "DRAFT" && status !== "REQUESTED") {
    throw new Error("TRANSFER_NOT_CANCELLABLE");
  }
}

export function assertTransferCanDispatch(status: string) {
  if (status !== "REQUESTED") {
    throw new Error("TRANSFER_NOT_REQUESTED_FOR_DISPATCH");
  }
}

export function assertTransferCanReceive(status: string) {
  if (!["DISPATCHED", "PARTIALLY_RECEIVED", "DISPUTED"].includes(status)) {
    throw new Error("TRANSFER_NOT_DISPATCHED_FOR_RECEIPT");
  }
}

export function assertTransferCanSettleDiscrepancy(input: {
  status: string;
  hasDiscrepancy: boolean;
  actorUserId: string;
  requestedByUserId: string;
  dispatchedByUserId?: string | null;
  activeReceiptReceiverUserIds: string[];
}) {
  if (input.status !== "DISPUTED") {
    throw new Error("TRANSFER_DISCREPANCY_NOT_SETTLEABLE");
  }
  if (!input.hasDiscrepancy) {
    throw new Error("TRANSFER_DISCREPANCY_NOT_FOUND");
  }
  if (input.actorUserId === input.requestedByUserId) {
    throw new Error("TRANSFER_DISCREPANCY_SELF_SETTLEMENT_NOT_ALLOWED");
  }
  if (input.dispatchedByUserId && input.actorUserId === input.dispatchedByUserId) {
    throw new Error("TRANSFER_DISCREPANCY_DISPATCHER_SETTLEMENT_NOT_ALLOWED");
  }
  if (input.activeReceiptReceiverUserIds.includes(input.actorUserId)) {
    throw new Error("TRANSFER_DISCREPANCY_RECEIVER_SETTLEMENT_NOT_ALLOWED");
  }
}

export function assertTransferReceiptCanReverse(
  status: string,
  reversedAt?: unknown
) {
  if (status === "REVERSED" || reversedAt) {
    throw new Error("TRANSFER_RECEIPT_ALREADY_REVERSED");
  }
  if (status !== "POSTED") {
    throw new Error("TRANSFER_RECEIPT_NOT_POSTED_FOR_REVERSAL");
  }
}

function parseReceiptQuantity(formData: FormData, lineId: string, field: string) {
  const value = formData.get(`lines.${lineId}.${field}`);
  if (value === null || String(value).trim() === "") {
    return undefined;
  }
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("TRANSFER_RECEIPT_QUANTITY_INVALID");
  }
  return quantity;
}

function requiredFormValues(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function optionalFormValues(formData: FormData, name: string, count: number) {
  const values = formData.getAll(name).map((value) => String(value).trim());
  return Array.from({ length: count }, (_, index) => values[index] ?? "");
}

function parseTransferLines(formData: FormData) {
  const itemIds = requiredFormValues(formData, "lineItemId");
  const requestedQtys = requiredFormValues(formData, "lineRequestedQty");
  const notes = optionalFormValues(formData, "lineNotes", itemIds.length);

  if (itemIds.length === 0) {
    throw new Error("TRANSFER_HAS_NO_LINES");
  }
  if (itemIds.length > TRANSFER_MAX_LINES) {
    throw new Error("TRANSFER_TOO_MANY_LINES");
  }
  if (requestedQtys.length !== itemIds.length) {
    throw new Error("TRANSFER_LINE_REQUIRED");
  }

  return itemIds.map((itemId, index) =>
    createTransferLineSchema.parse({
      itemId,
      requestedQty: requestedQtys[index],
      notes: notes[index] || undefined
    })
  );
}

export function assertTransferReceiptQuantities(input: {
  acceptedQty: number;
  rejectedQty: number;
  damagedQty: number;
  discrepancyQty: number;
  remainingQty: number;
  discrepancyReason?: string | null;
  evidenceReference?: string | null;
}) {
  const quantities = [
    input.acceptedQty,
    input.rejectedQty,
    input.damagedQty,
    input.discrepancyQty,
    input.remainingQty
  ];
  if (quantities.some((quantity) => !Number.isFinite(quantity) || quantity < 0)) {
    throw new Error("TRANSFER_RECEIPT_QUANTITY_INVALID");
  }

  const capturedQty =
    input.acceptedQty +
    input.rejectedQty +
    input.damagedQty +
    input.discrepancyQty;
  if (capturedQty > input.remainingQty) {
    throw new Error("TRANSFER_RECEIPT_EXCEEDS_DISPATCHED");
  }
  if (
    input.rejectedQty + input.damagedQty + input.discrepancyQty > 0 &&
    (!input.discrepancyReason || input.discrepancyReason.trim().length < 5)
  ) {
    throw new Error("TRANSFER_RECEIPT_DISCREPANCY_REASON_REQUIRED");
  }
  if (
    input.rejectedQty + input.damagedQty + input.discrepancyQty > 0 &&
    (!input.evidenceReference || input.evidenceReference.trim().length < 3)
  ) {
    throw new Error("TRANSFER_RECEIPT_DISCREPANCY_EVIDENCE_REQUIRED");
  }
}

export function calculateTransferReceiptStatus(
  lines: Array<{
    dispatchedQty: number;
    receivedQty: number;
    rejectedQty: number;
    damagedQty: number;
    discrepancyQty: number;
  }>
) {
  const hasDiscrepancy = lines.some(
    (line) => line.rejectedQty + line.damagedQty + line.discrepancyQty > 0
  );
  if (hasDiscrepancy) {
    return "DISPUTED";
  }

  const hasDispatched = lines.some((line) => line.dispatchedQty > 0);
  const allReceived =
    hasDispatched &&
    lines.every(
      (line) => line.dispatchedQty > 0 && line.receivedQty >= line.dispatchedQty
    );
  if (allReceived) {
    return "RECEIVED";
  }

  const hasReceipt = lines.some((line) => line.receivedQty > 0);
  return hasReceipt ? "PARTIALLY_RECEIVED" : "DISPATCHED";
}

async function nextTransferReference(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.inventoryTransfer.count({
    where: {
      companyId,
      publicReference: { startsWith: `TR-${year}-` }
    }
  });
  return `TR-${year}-${String(count + 1).padStart(5, "0")}`;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function settlementMetadataValue(
  metadata: unknown,
  key: "settlementType" | "evidenceReference" | "reason"
) {
  if (typeof metadata !== "object" || metadata === null || !(key in metadata)) {
    return "";
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

async function requireTransferRead(session: SessionContext) {
  if (!canUseTransfers(session.permissionCodes)) {
    await requirePermission(session, permissions.transferView);
  }
}

function scopedTransferWhere(session: SessionContext, id?: string) {
  return {
    ...(id ? { id } : {}),
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    OR: [
      { sourceLocationId: session.context.locationId },
      { destinationLocationId: session.context.locationId }
    ]
  };
}

export const transferDashboardProfiles = ["transfer-follow-up-v1"] as const;
export type TransferDashboardProfile = (typeof transferDashboardProfiles)[number];

const transferFollowUpStatuses = [
  "REQUESTED",
  "DISPATCHED",
  "PARTIALLY_RECEIVED",
  "DISPUTED"
] as const;

const transferProfilePageSize = 25;

export function resolveTransferDashboardProfile(
  value: string | undefined
): TransferDashboardProfile | null {
  return value === "transfer-follow-up-v1" ? value : null;
}

export function transferDashboardProfileHref(
  profile: TransferDashboardProfile,
  page = 1
) {
  const params = new URLSearchParams({ dashboard: profile });
  if (page > 1) {
    params.set("page", String(page));
  }
  return `/transfers?${params.toString()}`;
}

export function transferDashboardProfileWhere(
  session: SessionContext,
  profile: TransferDashboardProfile
) {
  if (profile === "transfer-follow-up-v1") {
    return {
      ...scopedTransferWhere(session),
      status: { in: [...transferFollowUpStatuses] }
    } satisfies Prisma.InventoryTransferWhereInput;
  }

  throw new Error("TRANSFER_DASHBOARD_PROFILE_UNSUPPORTED");
}

const transferDashboardTaskCandidateLimit = 8;
const transferMyTaskPageSize = 25;

export type TransferDashboardRead = {
  followUpCount: number;
  taskCandidates: Array<{
    id: string;
    publicReference: string;
    status: string;
    sourceLocationName: string;
    destinationLocationName: string;
    createdAt: string;
  }>;
};

export type TransferMyTaskPage = {
  totalCount: number;
  items: Array<{
    taskId: string;
    recordId: string;
    publicReference: string;
    status: string;
    actionLabel: "Dispatch transfer" | "Receive transfer";
    sourceLocationName: string;
    destinationLocationName: string;
    createdAt: string;
  }>;
  nextCursor: DashboardTaskCursor | null;
};

/**
 * Returns only transfer actions that are currently executable in the selected
 * location. Dispute settlement is intentionally excluded until the task
 * projection can carry and verify its stricter independent-actor rule.
 */
export async function listTransferMyTaskPage(
  session: SessionContext,
  input: {
    after?: DashboardTaskCursor;
    take?: number;
    filter?: DashboardTaskFilter;
  } = {}
): Promise<TransferMyTaskPage> {
  await requireTransferRead(session);
  if (input.filter?.priority && input.filter.priority !== "HIGH") return { totalCount: 0, items: [], nextCursor: null };
  if (input.filter?.due && input.filter.due.kind !== "NO_DUE") return { totalCount: 0, items: [], nextCursor: null };
  if (input.filter?.status && !["REQUESTED", "DISPATCHED", "PARTIALLY_RECEIVED", "DISPUTED"].includes(input.filter.status)) return { totalCount: 0, items: [], nextCursor: null };

  const actionPredicates: Prisma.InventoryTransferWhereInput[] = [
    ...(session.permissionCodes.includes(permissions.transferDispatch)
      ? [
          {
            sourceLocationId: session.context.locationId,
            status: "REQUESTED"
          }
        ]
      : []),
    ...(session.permissionCodes.includes(permissions.transferReceive)
      ? [
          {
            destinationLocationId: session.context.locationId,
            status: { in: ["DISPATCHED", "PARTIALLY_RECEIVED", "DISPUTED"] },
            dispatchedByUserId: { not: session.user.id }
          }
        ]
      : [])
  ];
  const filteredActionPredicates = input.filter?.status
    ? actionPredicates.filter((predicate) =>
        input.filter?.status === "REQUESTED"
          ? "sourceLocationId" in predicate
          : "destinationLocationId" in predicate
      )
    : actionPredicates;
  if (filteredActionPredicates.length === 0) {
    return { totalCount: 0, items: [], nextCursor: null };
  }

  const take = Math.min(Math.max(input.take ?? transferMyTaskPageSize, 1), 50);
  const afterWhere = dashboardTaskAfterWhere("TRANSFER", input.after);
  const where = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(input.filter?.status ? { status: input.filter.status } : {}),
    AND: [
      { OR: filteredActionPredicates },
      ...(afterWhere ? [afterWhere] : [])
    ]
  } satisfies Prisma.InventoryTransferWhereInput;
  const select = {
    id: true,
    publicReference: true,
    status: true,
    createdAt: true,
    sourceLocationId: true,
    destinationLocationId: true,
    sourceLocation: { select: { name: true } },
    destinationLocation: { select: { name: true } }
  } satisfies Prisma.InventoryTransferSelect;
  const countWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(input.filter?.status ? { status: input.filter.status } : {}),
    OR: filteredActionPredicates
  } satisfies Prisma.InventoryTransferWhereInput;
  const [totalCount, rows] = await Promise.all([
    prisma.inventoryTransfer.count({ where: countWhere }),
    prisma.inventoryTransfer.findMany({
      where,
      select,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: take + 1
    })
  ]);
  const pageRows = rows.slice(0, take);
  const lastRow = pageRows.at(-1);

  return {
    totalCount,
    items: pageRows.map((transfer) => ({
      taskId: `transfer-${transfer.id}`,
      recordId: transfer.id,
      publicReference: transfer.publicReference,
      status: transfer.status,
      actionLabel:
        transfer.sourceLocationId === session.context.locationId
          ? "Dispatch transfer"
          : "Receive transfer",
      sourceLocationName: transfer.sourceLocation.name,
      destinationLocationName: transfer.destinationLocation.name,
      createdAt: transfer.createdAt.toISOString()
    })),
    nextCursor:
      rows.length > take && lastRow
        ? {
            createdAt: lastRow.createdAt.toISOString(),
            sourceType: "TRANSFER",
            recordId: lastRow.id
          }
        : null
  };
}

/**
 * Returns only the dashboard's transfer follow-up aggregate and a bounded
 * source-record candidate set. Transfer detail remains in its workspace.
 */
export async function getTransferDashboardRead(
  session: SessionContext
): Promise<TransferDashboardRead> {
  await requireTransferRead(session);

  const taskStatuses = ["DISPATCHED", "PARTIALLY_RECEIVED", "DISPUTED"];
  const profileWhere = transferDashboardProfileWhere(
    session,
    "transfer-follow-up-v1"
  );
  const candidateSelect = {
    id: true,
    publicReference: true,
    status: true,
    createdAt: true,
    sourceLocation: { select: { name: true } },
    destinationLocation: { select: { name: true } }
  } satisfies Prisma.InventoryTransferSelect;
  const candidateOrderBy: Prisma.InventoryTransferOrderByWithRelationInput[] = [
    { createdAt: "asc" },
    { id: "asc" }
  ];
  const [followUpCount, disputedCandidates, normalCandidates] = await Promise.all([
    prisma.inventoryTransfer.count({
      where: profileWhere
    }),
    prisma.inventoryTransfer.findMany({
      where: { ...profileWhere, status: "DISPUTED" },
      select: candidateSelect,
      orderBy: candidateOrderBy,
      take: transferDashboardTaskCandidateLimit
    }),
    prisma.inventoryTransfer.findMany({
      where: {
        ...profileWhere,
        status: { in: taskStatuses.filter((status) => status !== "DISPUTED") }
      },
      select: candidateSelect,
      orderBy: candidateOrderBy,
      take: transferDashboardTaskCandidateLimit
    })
  ]);
  const candidates = [...disputedCandidates, ...normalCandidates].slice(
    0,
    transferDashboardTaskCandidateLimit
  );

  return {
    followUpCount,
    taskCandidates: candidates.map((transfer) => ({
      id: transfer.id,
      publicReference: transfer.publicReference,
      status: transfer.status,
      sourceLocationName: transfer.sourceLocation.name,
      destinationLocationName: transfer.destinationLocation.name,
      createdAt: transfer.createdAt.toISOString()
    }))
  };
}

export async function listTransferFormOptions(session: SessionContext) {
  await requirePermission(session, permissions.transferCreate);

  const [destinationInventoryLocation, sourceInventoryLocations, items] =
    await Promise.all([
      prisma.inventoryLocation.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          locationId: session.context.locationId,
          status: "ACTIVE"
        },
        include: { location: true }
      }),
      prisma.inventoryLocation.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE",
          locationId: { not: session.context.locationId }
        },
        include: { location: true },
        orderBy: { name: "asc" }
      }),
      prisma.item.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE",
          trackInventory: true
        },
        include: { baseUom: true },
        orderBy: { itemName: "asc" }
      })
    ]);

  return {
    destinationInventoryLocation: destinationInventoryLocation
      ? {
          id: destinationInventoryLocation.id,
          name: destinationInventoryLocation.name,
          locationName: destinationInventoryLocation.location.name
        }
      : null,
    sourceInventoryLocations: sourceInventoryLocations.map((location) => ({
      id: location.id,
      name: location.name,
      locationName: location.location.name,
      locationType: location.location.locationType
    })),
    items: items.map((item) => ({
      id: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      baseUomId: item.baseUomId,
      baseUomCode: item.baseUom.uomCode
    }))
  };
}

export async function listInventoryTransfers(session: SessionContext) {
  await requireTransferRead(session);

  const transfers = await prisma.inventoryTransfer.findMany({
    where: scopedTransferWhere(session),
    include: {
      sourceLocation: true,
      destinationLocation: true,
      requestedBy: true,
      lines: true
    },
    orderBy: { createdAt: "desc" }
  });

  return transfers.map(mapInventoryTransfer);
}

type InventoryTransferWithRelations = Prisma.InventoryTransferGetPayload<{ include: {
  sourceLocation: true; destinationLocation: true; requestedBy: true; lines: true;
} }>;

function mapInventoryTransfer(transfer: InventoryTransferWithRelations) {
  return {
    id: transfer.id,
    publicReference: transfer.publicReference,
    status: transfer.status,
    transferType: transfer.transferType,
    purpose: transfer.purpose,
    sourceLocationId: transfer.sourceLocationId,
    destinationLocationId: transfer.destinationLocationId,
    sourceLocationName: transfer.sourceLocation.name,
    destinationLocationName: transfer.destinationLocation.name,
    requestedByName: transfer.requestedBy.displayName,
    requiredByDate: transfer.requiredByDate?.toISOString().slice(0, 10) ?? null,
    createdAt: transfer.createdAt.toISOString(),
    submittedAt: transfer.submittedAt?.toISOString() ?? null,
    dispatchedAt: transfer.dispatchedAt?.toISOString() ?? null,
    receivedAt: transfer.receivedAt?.toISOString() ?? null,
    cancelledAt: transfer.cancelledAt?.toISOString() ?? null,
    lineCount: transfer.lines.length,
    requestedQty: transfer.lines.reduce(
      (total, line) => total + Number(line.requestedQty),
      0
    )
  };
}

export async function listInventoryTransferPage(
  session: SessionContext,
  input: { tab?: "all" | "draft" | "dispatch" | "receive" | "completed"; page?: number; pageSize?: number } = {}
) {
  await requireTransferRead(session);
  const tab = input.tab ?? "all";
  const statusWhere = tab === "draft" ? { status: "DRAFT" }
    : tab === "dispatch" ? { status: "REQUESTED" }
      : tab === "receive" ? { status: { in: ["DISPATCHED", "PARTIALLY_RECEIVED"] } }
        : tab === "completed" ? { status: "RECEIVED" } : {};
  const pageSize = Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 25)));
  const requestedPage = Math.max(1, Math.trunc(input.page ?? 1));
  const where = { ...scopedTransferWhere(session), ...statusWhere } satisfies Prisma.InventoryTransferWhereInput;
  const [totalItems, allCount, draftCount, dispatchCount, receiveCount, completedCount] = await Promise.all([
    prisma.inventoryTransfer.count({ where }),
    prisma.inventoryTransfer.count({ where: scopedTransferWhere(session) }),
    prisma.inventoryTransfer.count({ where: { ...scopedTransferWhere(session), status: "DRAFT" } }),
    prisma.inventoryTransfer.count({ where: { ...scopedTransferWhere(session), status: "REQUESTED" } }),
    prisma.inventoryTransfer.count({ where: { ...scopedTransferWhere(session), status: { in: ["DISPATCHED", "PARTIALLY_RECEIVED"] } } }),
    prisma.inventoryTransfer.count({ where: { ...scopedTransferWhere(session), status: "RECEIVED" } })
  ]);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const transfers = await prisma.inventoryTransfer.findMany({
    where,
    include: { sourceLocation: true, destinationLocation: true, requestedBy: true, lines: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize
  });
  return { items: transfers.map(mapInventoryTransfer), totalItems, page, pageSize, totalPages, tabCounts: { all: allCount, draft: draftCount, dispatch: dispatchCount, receive: receiveCount, completed: completedCount } };
}

export type TransferFollowUpProfilePage = {
  transfers: Awaited<ReturnType<typeof listInventoryTransfers>>;
  totalItems: number;
  page: number;
  pageSize: number;
};

export async function listInventoryTransfersDashboardProfilePage(
  session: SessionContext,
  profile: TransferDashboardProfile,
  requestedPage: number
): Promise<TransferFollowUpProfilePage> {
  await requireTransferRead(session);

  const page = Number.isFinite(requestedPage) && requestedPage > 0
    ? Math.floor(requestedPage)
    : 1;
  const where = transferDashboardProfileWhere(session, profile);
  const totalItems = await prisma.inventoryTransfer.count({ where });
  const safePage = Math.min(
    page,
    Math.max(1, Math.ceil(totalItems / transferProfilePageSize))
  );
  const transfers = await prisma.inventoryTransfer.findMany({
    where,
    include: {
      sourceLocation: true,
      destinationLocation: true,
      requestedBy: true,
      lines: true
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (safePage - 1) * transferProfilePageSize,
    take: transferProfilePageSize
  });

  return {
    transfers: transfers.map((transfer) => ({
      id: transfer.id,
      publicReference: transfer.publicReference,
      status: transfer.status,
      transferType: transfer.transferType,
      purpose: transfer.purpose,
      sourceLocationId: transfer.sourceLocationId,
      destinationLocationId: transfer.destinationLocationId,
      sourceLocationName: transfer.sourceLocation.name,
      destinationLocationName: transfer.destinationLocation.name,
      requestedByName: transfer.requestedBy.displayName,
      requiredByDate: transfer.requiredByDate?.toISOString().slice(0, 10) ?? null,
      createdAt: transfer.createdAt.toISOString(),
      submittedAt: transfer.submittedAt?.toISOString() ?? null,
      dispatchedAt: transfer.dispatchedAt?.toISOString() ?? null,
      receivedAt: transfer.receivedAt?.toISOString() ?? null,
      cancelledAt: transfer.cancelledAt?.toISOString() ?? null,
      lineCount: transfer.lines.length,
      requestedQty: transfer.lines.reduce(
        (total, line) => total + Number(line.requestedQty),
        0
      )
    })),
    totalItems,
    page: safePage,
    pageSize: transferProfilePageSize
  };
}

export async function buildInventoryTransferExportRows(
  session: SessionContext,
  profile?: TransferDashboardProfile
) {
  await requireTransferRead(session);

  const transfers = await prisma.inventoryTransfer.findMany({
    where: profile
      ? transferDashboardProfileWhere(session, profile)
      : scopedTransferWhere(session),
    include: {
      sourceLocation: true,
      destinationLocation: true,
      requestedBy: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true
        }
      },
      receipts: {
        orderBy: { receivedAt: "desc" },
        include: {
          receivedBy: true,
          reversedBy: true,
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              item: true,
              uom: true
            }
          }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
  const settlementEvents =
    transfers.length > 0
      ? await prisma.auditEvent.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            entityType: "InventoryTransfer",
            entityId: { in: transfers.map((transfer) => transfer.id) },
            eventType: "inventory_transfer.discrepancy_settled"
          },
          include: { actor: true },
          orderBy: { occurredAt: "desc" }
        })
      : [];
  const latestSettlementByTransferId = new Map<
    string,
    (typeof settlementEvents)[number]
  >();
  for (const event of settlementEvents) {
    if (!latestSettlementByTransferId.has(event.entityId)) {
      latestSettlementByTransferId.set(event.entityId, event);
    }
  }

  const rows: CsvRow[] = [
    [
      "Reference",
      "Status",
      "Type",
      "Source Location",
      "Destination Location",
      "Requested By",
      "Required By",
      "Created At",
      "Submitted At",
      "Dispatched At",
      "Received At",
      "Transfer Line",
      "Item Code",
      "Item Name",
      "UOM",
      "Requested Qty",
      "Dispatched Qty",
      "Cumulative Received Qty",
      "Cumulative Rejected Qty",
      "Cumulative Damaged Qty",
      "Cumulative Discrepancy Qty",
      "Settlement Status",
      "Settlement Type",
      "Settlement Evidence Reference",
      "Settlement Reason",
      "Settled At",
      "Settled By",
      "Receipt Status",
      "Receipt Received At",
      "Receipt Received By",
      "Receipt Reversed At",
      "Receipt Reversed By",
      "Accepted Qty",
      "Rejected Qty",
      "Damaged Qty",
      "Discrepancy Qty",
      "Outstanding Qty",
      "Discrepancy Type",
      "Discrepancy Reason",
      "Evidence Reference"
    ]
  ];

  for (const transfer of transfers) {
    const settlement = latestSettlementByTransferId.get(transfer.id);
    const settlementColumns: CsvRow = [
      settlement ? "SETTLED" : "",
      settlementMetadataValue(settlement?.metadata, "settlementType"),
      settlementMetadataValue(settlement?.metadata, "evidenceReference"),
      settlementMetadataValue(settlement?.metadata, "reason"),
      settlement?.occurredAt.toISOString() ?? "",
      settlement?.actor?.displayName ?? ""
    ];

    for (const line of transfer.lines) {
      const receiptLines = transfer.receipts.flatMap((receipt) =>
        receipt.lines
          .filter((receiptLine) => receiptLine.inventoryTransferLineId === line.id)
          .map((receiptLine) => ({ receipt, receiptLine }))
      );
      const baseRow: CsvRow = [
        transfer.publicReference,
        transfer.status,
        transfer.transferType,
        transfer.sourceLocation.name,
        transfer.destinationLocation.name,
        transfer.requestedBy.displayName,
        transfer.requiredByDate?.toISOString().slice(0, 10) ?? "",
        transfer.createdAt.toISOString(),
        transfer.submittedAt?.toISOString() ?? "",
        transfer.dispatchedAt?.toISOString() ?? "",
        transfer.receivedAt?.toISOString() ?? "",
        line.lineNumber,
        line.item.itemCode,
        line.item.itemName,
        line.uom.uomCode,
        Number(line.requestedQty),
        Number(line.dispatchedQty),
        Number(line.receivedQty),
        Number(line.rejectedQty),
        Number(line.damagedQty),
        Number(line.discrepancyQty),
        ...settlementColumns
      ];

      if (receiptLines.length === 0) {
        rows.push([...baseRow, "", "", "", "", "", "", "", "", "", "", "", "", ""]);
        continue;
      }

      for (const { receipt, receiptLine } of receiptLines) {
        rows.push([
          ...baseRow,
          receipt.status,
          receipt.receivedAt.toISOString(),
          receipt.receivedBy.displayName,
          receipt.reversedAt?.toISOString() ?? "",
          receipt.reversedBy?.displayName ?? "",
          Number(receiptLine.acceptedQty),
          Number(receiptLine.rejectedQty),
          Number(receiptLine.damagedQty),
          Number(receiptLine.discrepancyQty),
          Number(receiptLine.outstandingQty),
          receiptLine.discrepancyType ?? "",
          receiptLine.discrepancyReason ?? "",
          receiptLine.evidenceReference ?? ""
        ]);
      }
    }
  }

  return rows;
}

export async function getInventoryTransfer(session: SessionContext, id: string) {
  await requireTransferRead(session);

  const transfer = await prisma.inventoryTransfer.findFirst({
    where: scopedTransferWhere(session, id),
    include: {
      sourceLocation: true,
      destinationLocation: true,
      requestedBy: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          sourceInventoryLocation: true,
          destinationInventoryLocation: true,
          item: true,
          uom: true
        }
      },
      receipts: {
        orderBy: { receivedAt: "desc" },
        include: {
          receivedBy: true,
          reversedBy: true,
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              postedMovement: {
                include: {
                  reversalMovements: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!transfer) {
    return null;
  }

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      entityType: "InventoryTransfer",
      entityId: transfer.id
    },
    orderBy: { occurredAt: "asc" }
  });

  return {
    id: transfer.id,
    publicReference: transfer.publicReference,
    status: transfer.status,
    transferType: transfer.transferType,
    purpose: transfer.purpose,
    sourceLocationId: transfer.sourceLocationId,
    destinationLocationId: transfer.destinationLocationId,
    sourceLocationName: transfer.sourceLocation.name,
    destinationLocationName: transfer.destinationLocation.name,
    requestedByName: transfer.requestedBy.displayName,
    requiredByDate: transfer.requiredByDate?.toISOString().slice(0, 10) ?? null,
    submittedAt: transfer.submittedAt?.toISOString() ?? null,
    dispatchedAt: transfer.dispatchedAt?.toISOString() ?? null,
    receivedAt: transfer.receivedAt?.toISOString() ?? null,
    cancelledAt: transfer.cancelledAt?.toISOString() ?? null,
    cancellationReason: transfer.cancellationReason ?? null,
    createdAt: transfer.createdAt.toISOString(),
    lines: transfer.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      description: line.description,
      sourceInventoryLocationName: line.sourceInventoryLocation.name,
      destinationInventoryLocationName: line.destinationInventoryLocation.name,
      itemCode: line.item.itemCode,
      itemName: line.item.itemName,
      requestedQty: Number(line.requestedQty),
      approvedQty: Number(line.approvedQty),
      preparedQty: Number(line.preparedQty),
      dispatchedQty: Number(line.dispatchedQty),
      receivedQty: Number(line.receivedQty),
      rejectedQty: Number(line.rejectedQty),
      damagedQty: Number(line.damagedQty),
      discrepancyQty: Number(line.discrepancyQty),
      uomCode: line.uom.uomCode,
      lotNumber: line.lotNumber ?? null,
      expiryDate: line.expiryDate?.toISOString().slice(0, 10) ?? null,
      notes: line.notes ?? null
    })),
    receipts: transfer.receipts.map((receipt) => ({
      id: receipt.id,
      status: receipt.status,
      receivedAt: receipt.receivedAt.toISOString(),
      postedAt: receipt.postedAt?.toISOString() ?? null,
      receivedByName: receipt.receivedBy.displayName,
      reversedByName: receipt.reversedBy?.displayName ?? null,
      reversedAt: receipt.reversedAt?.toISOString() ?? null,
      reversalReason: receipt.reversalReason ?? null,
      discrepancyFlag: receipt.discrepancyFlag,
      discrepancySummary: receipt.discrepancySummary ?? null,
      notes: receipt.notes ?? null,
      lines: receipt.lines.map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        acceptedQty: Number(line.acceptedQty),
        rejectedQty: Number(line.rejectedQty),
        damagedQty: Number(line.damagedQty),
        discrepancyQty: Number(line.discrepancyQty),
        outstandingQty: Number(line.outstandingQty),
        discrepancyReason: line.discrepancyReason ?? null,
        postedMovementId: line.postedMovementId ?? null,
        reversalMovementCount: line.postedMovement?.reversalMovements.length ?? 0
      }))
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      occurredAt: event.occurredAt.toISOString(),
      metadata:
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>)
          : undefined
    }))
  };
}

export async function createInventoryTransfer(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferCreate);
  assertAuthorizedLocation(session, session.context.locationId);
  const values = createTransferSchema.parse(Object.fromEntries(formData));
  const lineValues = parseTransferLines(formData);

  const [sourceInventoryLocation, destinationInventoryLocation] =
    await Promise.all([
      prisma.inventoryLocation.findFirst({
        where: {
          id: values.sourceInventoryLocationId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE"
        },
        include: { location: true }
      }),
      prisma.inventoryLocation.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          locationId: session.context.locationId,
          status: "ACTIVE"
        },
        include: { location: true }
      })
    ]);

  if (!sourceInventoryLocation) {
    throw new Error("TRANSFER_SOURCE_INVENTORY_LOCATION_NOT_FOUND");
  }
  if (!destinationInventoryLocation) {
    throw new Error("TRANSFER_DESTINATION_INVENTORY_LOCATION_NOT_FOUND");
  }
  assertTransferLocationsDistinct(
    sourceInventoryLocation.locationId,
    destinationInventoryLocation.locationId
  );
  assertAuthorizedLocation(session, destinationInventoryLocation.locationId);

  const itemIds = Array.from(new Set(lineValues.map((line) => line.itemId)));
  const items = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE",
      trackInventory: true
    },
    include: { baseUom: true }
  });
  const itemById = new Map(items.map((item) => [item.id, item]));
  if (items.length !== itemIds.length) {
    throw new Error("TRANSFER_ITEM_NOT_FOUND");
  }

  const lineDrafts: TransferLineDraft[] = lineValues.map((line, index) => {
    assertPositiveTransferQuantity(line.requestedQty);
    const item = itemById.get(line.itemId);
    if (!item) {
      throw new Error("TRANSFER_ITEM_NOT_FOUND");
    }
    return {
      lineNumber: index + 1,
      item,
      requestedQty: line.requestedQty,
      notes: line.notes || null
    };
  });

  let transferId: string | null = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const transfer = await prisma.inventoryTransfer.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          publicReference: await nextTransferReference(session.context.companyId),
          sourceLocationId: sourceInventoryLocation.locationId,
          destinationLocationId: destinationInventoryLocation.locationId,
          requestedByUserId: session.user.id,
          transferType: values.transferType,
          purpose: values.purpose,
          requiredByDate: values.requiredByDate ?? null,
          lines: {
            create: lineDrafts.map((line) => ({
                tenantId: session.context.tenantId,
                companyId: session.context.companyId,
                sourceInventoryLocationId: sourceInventoryLocation.id,
                destinationInventoryLocationId: destinationInventoryLocation.id,
                itemId: line.item.id,
                uomId: line.item.baseUomId,
                lineNumber: line.lineNumber,
                description: line.item.itemName,
                requestedQty: line.requestedQty,
                notes: line.notes
              }))
          }
        }
      });
      transferId = transfer.id;
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 5) {
        throw error;
      }
    }
  }

  if (!transferId) {
    throw new Error("TRANSFER_REFERENCE_ALLOCATION_FAILED");
  }

  await prisma.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      actorUserId: session.user.id,
      eventType: "inventory_transfer.created",
      entityType: "InventoryTransfer",
      entityId: transferId,
      afterData: { status: "DRAFT" },
      metadata: {
        sourceLocationId: sourceInventoryLocation.locationId,
        destinationLocationId: destinationInventoryLocation.locationId,
        itemIds,
        lineCount: lineDrafts.length,
        requestedQty: lineDrafts.reduce(
          (total, line) => total + line.requestedQty,
          0
        )
      }
    }
  });

  return transferId;
}

export async function submitInventoryTransfer(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferSubmit);
  const values = transferActionSchema.parse(Object.fromEntries(formData));

  const transfer = await prisma.inventoryTransfer.findFirst({
    where: scopedTransferWhere(session, values.id)
  });
  if (!transfer) {
    throw new Error("TRANSFER_NOT_FOUND");
  }
  assertTransferCanSubmit(transfer.status);

  await prisma.$transaction(async (tx) => {
    const submitted = await tx.inventoryTransfer.updateMany({
      where: {
        id: transfer.id,
        status: "DRAFT"
      },
      data: {
        status: "REQUESTED",
        submittedAt: new Date()
      }
    });
    if (submitted.count !== 1) {
      throw new Error("TRANSFER_NOT_DRAFT_FOR_SUBMIT");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "inventory_transfer.submitted",
        entityType: "InventoryTransfer",
        entityId: transfer.id,
        beforeData: { status: "DRAFT" },
        afterData: { status: "REQUESTED" }
      }
    });
  });
}

export async function dispatchInventoryTransfer(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferDispatch);
  const values = transferActionSchema.parse(Object.fromEntries(formData));

  const transfer = await prisma.inventoryTransfer.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      sourceLocationId: session.context.locationId
    },
    include: {
      lines: {
        orderBy: { lineNumber: "asc" }
      }
    }
  });
  if (!transfer) {
    throw new Error("TRANSFER_NOT_FOUND");
  }
  if (transfer.status === "DISPATCHED") {
    return;
  }
  assertTransferCanDispatch(transfer.status);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const inventoryLocationLock = await lockInventoryLocationsForPosting(
      tx,
      session,
      transfer.lines.flatMap((line) => [
        line.sourceInventoryLocationId,
        line.destinationInventoryLocationId
      ])
    );
    const dispatched = await tx.inventoryTransfer.updateMany({
      where: {
        id: transfer.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceLocationId: session.context.locationId,
        status: "REQUESTED"
      },
      data: {
        status: "DISPATCHED",
        dispatchedAt: now,
        dispatchedByUserId: session.user.id
      }
    });
    if (dispatched.count !== 1) {
      throw new Error("TRANSFER_NOT_REQUESTED_FOR_DISPATCH");
    }

    for (const line of transfer.lines) {
      const requestedQty = Number(line.requestedQty);
      assertPositiveTransferQuantity(requestedQty);
      if (Number(line.dispatchedQty) > 0) {
        throw new Error("TRANSFER_LINE_ALREADY_DISPATCHED");
      }

      const { duplicate } = await postInventoryMovementInTransaction(tx, session, inventoryLocationLock, {
        inventoryLocationId: line.sourceInventoryLocationId,
        relatedInventoryLocationId: line.destinationInventoryLocationId,
        itemId: line.itemId,
        movementType: "TRANSFER_OUT",
        occurredAt: now,
        enteredQuantity: requestedQty,
        enteredUomId: line.uomId,
        quantityDeltaBaseUom: -requestedQty,
        sourceDocumentType: "InventoryTransfer",
        sourceDocumentId: transfer.id,
        sourceDocumentLineId: line.id,
        sourceEventKey: `dispatch:${line.id}`,
        lotNumber: line.lotNumber,
        expiryDate: line.expiryDate,
        reasonCode: "TRANSFER_DISPATCH",
        notes: transfer.publicReference
      });

      if (!duplicate) {
        await tx.inventoryTransferLine.update({
          where: { id: line.id },
          data: {
            dispatchedQty: {
              increment: requestedQty
            }
          }
        });
      }
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "inventory_transfer.dispatched",
        entityType: "InventoryTransfer",
        entityId: transfer.id,
        beforeData: { status: "REQUESTED" },
        afterData: { status: "DISPATCHED" },
        metadata: {
          sourceLocationId: transfer.sourceLocationId,
          destinationLocationId: transfer.destinationLocationId,
          lineCount: transfer.lines.length
        }
      }
    });
  });
}

export async function receiveInventoryTransfer(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferReceive);
  const values = receiveTransferSchema.parse(Object.fromEntries(formData));

  const transfer = await prisma.inventoryTransfer.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      destinationLocationId: session.context.locationId
    },
    include: {
      lines: {
        orderBy: { lineNumber: "asc" }
      }
    }
  });
  if (!transfer) {
    throw new Error("TRANSFER_NOT_FOUND");
  }
  if (transfer.status === "RECEIVED") {
    return;
  }
  assertTransferCanReceive(transfer.status);
  if (transfer.dispatchedByUserId === session.user.id) {
    throw new Error("TRANSFER_RECEIVER_MUST_DIFFER_FROM_DISPATCHER");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const inventoryLocationLock = await lockInventoryLocationsForPosting(
      tx,
      session,
      transfer.lines.flatMap((line) => [
        line.sourceInventoryLocationId,
        line.destinationInventoryLocationId
      ])
    );
    const receipt = await tx.inventoryTransferReceipt.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryTransferId: transfer.id,
        receivedByUserId: session.user.id,
        status: "POSTING",
        receivedAt: now,
        notes: values.notes || null
      }
    });

    const claimed = await tx.inventoryTransfer.updateMany({
      where: {
        id: transfer.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        destinationLocationId: session.context.locationId,
        status: { in: ["DISPATCHED", "PARTIALLY_RECEIVED", "DISPUTED"] }
      },
      data: {
        receivedAt: now,
        receivedByUserId: session.user.id
      }
    });
    if (claimed.count !== 1) {
      throw new Error("TRANSFER_NOT_DISPATCHED_FOR_RECEIPT");
    }

    let capturedReceiptQty = 0;
    let discrepancyFlag = false;
    const discrepancySummaries: string[] = [];

    for (const line of transfer.lines) {
      const dispatchedQty = Number(line.dispatchedQty);
      assertPositiveTransferQuantity(dispatchedQty);
      const alreadyAccountedQty =
        Number(line.receivedQty) +
        Number(line.rejectedQty) +
        Number(line.damagedQty) +
        Number(line.discrepancyQty);
      const remainingQty = Number((dispatchedQty - alreadyAccountedQty).toFixed(6));
      if (remainingQty <= 0) {
        continue;
      }

      const acceptedInput = parseReceiptQuantity(formData, line.id, "acceptedQty");
      const acceptedQty = acceptedInput ?? remainingQty;
      const rejectedQty =
        parseReceiptQuantity(formData, line.id, "rejectedQty") ?? 0;
      const damagedQty =
        parseReceiptQuantity(formData, line.id, "damagedQty") ?? 0;
      const discrepancyQty =
        parseReceiptQuantity(formData, line.id, "discrepancyQty") ?? 0;
      const discrepancyReason =
        String(formData.get(`lines.${line.id}.discrepancyReason`) ?? "").trim() ||
        null;
      const discrepancyType =
        String(formData.get(`lines.${line.id}.discrepancyType`) ?? "").trim() ||
        null;
      const evidenceReference =
        String(formData.get(`lines.${line.id}.evidenceReference`) ?? "").trim() ||
        null;

      assertTransferReceiptQuantities({
        acceptedQty,
        rejectedQty,
        damagedQty,
        discrepancyQty,
        remainingQty,
        discrepancyReason,
        evidenceReference
      });

      const capturedLineQty =
        acceptedQty + rejectedQty + damagedQty + discrepancyQty;
      if (capturedLineQty <= 0) {
        continue;
      }

      const outstandingQty = Number((remainingQty - capturedLineQty).toFixed(6));
      const receiptLine = await tx.inventoryTransferReceiptLine.create({
        data: {
          transferReceiptId: receipt.id,
          inventoryTransferId: transfer.id,
          inventoryTransferLineId: line.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          itemId: line.itemId,
          uomId: line.uomId,
          lineNumber: line.lineNumber,
          dispatchedQtySnapshot: dispatchedQty,
          acceptedQty,
          rejectedQty,
          damagedQty,
          discrepancyQty,
          outstandingQty,
          discrepancyType,
          discrepancyReason,
          evidenceReference
        }
      });

      if (acceptedQty > 0) {
        const { movement } = await postInventoryMovementInTransaction(tx, session, inventoryLocationLock, {
          inventoryLocationId: line.destinationInventoryLocationId,
          relatedInventoryLocationId: line.sourceInventoryLocationId,
          itemId: line.itemId,
          movementType: "TRANSFER_IN",
          occurredAt: now,
          enteredQuantity: acceptedQty,
          enteredUomId: line.uomId,
          quantityDeltaBaseUom: acceptedQty,
          sourceDocumentType: "InventoryTransfer",
          sourceDocumentId: transfer.id,
          sourceDocumentLineId: line.id,
          sourceEventKey: `receipt:${receiptLine.id}`,
          lotNumber: line.lotNumber,
          expiryDate: line.expiryDate,
          reasonCode: "TRANSFER_RECEIPT",
          notes: transfer.publicReference
        });

        await tx.inventoryTransferReceiptLine.update({
          where: { id: receiptLine.id },
          data: { postedMovementId: movement.id }
        });
      }

      const updated = await tx.inventoryTransferLine.updateMany({
        where: {
          id: line.id,
          receivedQty: line.receivedQty,
          rejectedQty: line.rejectedQty,
          damagedQty: line.damagedQty,
          discrepancyQty: line.discrepancyQty
        },
        data: {
          receivedQty: { increment: acceptedQty },
          rejectedQty: { increment: rejectedQty },
          damagedQty: { increment: damagedQty },
          discrepancyQty: { increment: discrepancyQty }
        }
      });
      if (updated.count !== 1) {
        throw new Error("TRANSFER_RECEIPT_STATE_CONFLICT");
      }

      capturedReceiptQty += capturedLineQty;
      if (rejectedQty + damagedQty + discrepancyQty > 0) {
        discrepancyFlag = true;
        discrepancySummaries.push(
          `Line ${line.lineNumber}: ${rejectedQty} rejected, ${damagedQty} damaged, ${discrepancyQty} short/discrepant`
        );
      }
    }

    if (capturedReceiptQty <= 0) {
      throw new Error("TRANSFER_RECEIPT_QUANTITY_REQUIRED");
    }

    const updatedLines = await tx.inventoryTransferLine.findMany({
      where: { inventoryTransferId: transfer.id },
      orderBy: { lineNumber: "asc" }
    });
    const nextStatus = calculateTransferReceiptStatus(
      updatedLines.map((line) => ({
        dispatchedQty: Number(line.dispatchedQty),
        receivedQty: Number(line.receivedQty),
        rejectedQty: Number(line.rejectedQty),
        damagedQty: Number(line.damagedQty),
        discrepancyQty: Number(line.discrepancyQty)
      }))
    );

    await tx.inventoryTransferReceipt.update({
      where: { id: receipt.id },
      data: {
        status: "POSTED",
        postedAt: now,
        discrepancyFlag,
        discrepancySummary: discrepancySummaries.join("; ") || null
      }
    });

    await tx.inventoryTransfer.update({
      where: { id: transfer.id },
      data: {
        status: nextStatus,
        receivedAt: now,
        receivedByUserId: session.user.id
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "inventory_transfer.received",
        entityType: "InventoryTransfer",
        entityId: transfer.id,
        beforeData: { status: transfer.status },
        afterData: { status: nextStatus },
        metadata: {
          receiptId: receipt.id,
          sourceLocationId: transfer.sourceLocationId,
          destinationLocationId: transfer.destinationLocationId,
          lineCount: transfer.lines.length,
          discrepancyFlag
        }
      }
    });
  });
}

export async function settleInventoryTransferDiscrepancy(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferDiscrepancySettle);
  const values = settleTransferDiscrepancySchema.parse(Object.fromEntries(formData));

  const transfer = await prisma.inventoryTransfer.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      destinationLocationId: session.context.locationId
    },
    include: {
      lines: true,
      receipts: {
        where: {
          status: "POSTED",
          reversedAt: null
        },
        select: {
          id: true,
          receivedByUserId: true,
          discrepancyFlag: true
        }
      }
    }
  });
  if (!transfer) {
    throw new Error("TRANSFER_NOT_FOUND");
  }

  const discrepancyLines = transfer.lines
    .filter(
      (line) =>
        Number(line.rejectedQty) +
          Number(line.damagedQty) +
          Number(line.discrepancyQty) >
        0
    )
    .map((line) => ({
      lineId: line.id,
      lineNumber: line.lineNumber,
      rejectedQty: Number(line.rejectedQty),
      damagedQty: Number(line.damagedQty),
      discrepancyQty: Number(line.discrepancyQty)
    }));

  assertTransferCanSettleDiscrepancy({
    status: transfer.status,
    hasDiscrepancy:
      discrepancyLines.length > 0 ||
      transfer.receipts.some((receipt) => receipt.discrepancyFlag),
    actorUserId: session.user.id,
    requestedByUserId: transfer.requestedByUserId,
    dispatchedByUserId: transfer.dispatchedByUserId,
    activeReceiptReceiverUserIds: transfer.receipts.map(
      (receipt) => receipt.receivedByUserId
    )
  });

  await prisma.$transaction(async (tx) => {
    const updated = await tx.inventoryTransfer.updateMany({
      where: {
        id: transfer.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        destinationLocationId: session.context.locationId,
        status: "DISPUTED"
      },
      data: {
        status: "DISCREPANCY_SETTLED"
      }
    });
    if (updated.count !== 1) {
      throw new Error("TRANSFER_DISCREPANCY_SETTLEMENT_STATE_CONFLICT");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "inventory_transfer.discrepancy_settled",
        entityType: "InventoryTransfer",
        entityId: transfer.id,
        beforeData: { status: "DISPUTED" },
        afterData: { status: "DISCREPANCY_SETTLED" },
        metadata: {
          reason: values.settlementReason,
          evidenceReference: values.evidenceReference,
          settlementType: values.settlementType,
          nonPostingSettlement: true,
          receiptIds: transfer.receipts.map((receipt) => receipt.id),
          discrepancyLines
        }
      }
    });
  });
}

export async function reverseInventoryTransferReceipt(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferReceiptReverse);
  const values = reverseTransferReceiptSchema.parse(Object.fromEntries(formData));

  const receipt = await prisma.inventoryTransferReceipt.findFirst({
    where: {
      id: values.receiptId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      inventoryTransferId: values.id,
      inventoryTransfer: {
        destinationLocationId: session.context.locationId
      }
    },
    include: {
      inventoryTransfer: {
        include: {
          lines: {
            orderBy: { lineNumber: "asc" }
          }
        }
      },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          inventoryTransferLine: true,
          postedMovement: {
            include: {
              reversalMovements: true
            }
          }
        }
      }
    }
  });
  if (!receipt) {
    throw new Error("TRANSFER_RECEIPT_NOT_FOUND");
  }
  const transfer = receipt.inventoryTransfer;
  assertAuthorizedLocation(session, transfer.destinationLocationId);
  assertTransferReceiptCanReverse(receipt.status, receipt.reversedAt);
  if (receipt.receivedByUserId === session.user.id) {
    throw new Error("TRANSFER_RECEIPT_SELF_REVERSAL_NOT_ALLOWED");
  }
  if (transfer.dispatchedByUserId === session.user.id) {
    throw new Error("TRANSFER_RECEIPT_DISPATCHER_REVERSAL_NOT_ALLOWED");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "inventory_transfer_receipt.reverse",
    enforcementScope: "all_sensitive",
    permissionCode: permissions.transferReceiptReverse,
    entityType: "InventoryTransferReceipt",
    entityId: receipt.id,
    reason:
      "Transfer receipt reversal creates counter-movements and requires privileged MFA evidence.",
    metadata: {
      transferId: transfer.id,
      destinationLocationId: transfer.destinationLocationId
    }
  });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const reversalInventoryLocationIds = receipt.lines.flatMap((line) => {
      if (Number(line.acceptedQty) <= 0 || !line.postedMovement) {
        return [];
      }
      return [
        line.postedMovement.inventoryLocationId,
        ...(line.postedMovement.relatedInventoryLocationId
          ? [line.postedMovement.relatedInventoryLocationId]
          : [])
      ];
    });
    const inventoryLocationLock =
      reversalInventoryLocationIds.length > 0
        ? await lockInventoryLocationsForPosting(
            tx,
            session,
            reversalInventoryLocationIds
          )
        : null;
    const claimed = await tx.inventoryTransferReceipt.updateMany({
      where: {
        id: receipt.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "POSTED",
        reversedAt: null
      },
      data: { status: "REVERSING" }
    });
    if (claimed.count !== 1) {
      const current = await tx.inventoryTransferReceipt.findFirst({
        where: {
          id: receipt.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId
        },
        select: { status: true, reversedAt: true }
      });
      if (current?.status === "REVERSED" || current?.reversedAt) {
        return;
      }
      throw new Error("TRANSFER_RECEIPT_NOT_POSTED_FOR_REVERSAL");
    }

    const originalMovementIds: string[] = [];
    const reversalMovementIds: string[] = [];
    const receiptLineIds: string[] = [];

    for (const line of receipt.lines) {
      const acceptedQty = Number(line.acceptedQty);
      const rejectedQty = Number(line.rejectedQty);
      const damagedQty = Number(line.damagedQty);
      const discrepancyQty = Number(line.discrepancyQty);

      if (acceptedQty > 0) {
        const original = line.postedMovement;
        if (!original || !line.postedMovementId) {
          throw new Error("TRANSFER_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_REQUIRED");
        }
        if (original.movementType !== "TRANSFER_IN") {
          throw new Error("TRANSFER_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_INVALID");
        }
        if (
          original.tenantId !== session.context.tenantId ||
          original.companyId !== session.context.companyId ||
          original.inventoryLocationId !==
            line.inventoryTransferLine.destinationInventoryLocationId ||
          original.itemId !== line.itemId ||
          original.sourceDocumentType !== "InventoryTransfer" ||
          original.sourceDocumentId !== transfer.id ||
          original.sourceDocumentLineId !== line.inventoryTransferLineId
        ) {
          throw new Error("TRANSFER_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_MISMATCH");
        }
        if (original.reversalMovements.length > 0) {
          throw new Error("TRANSFER_RECEIPT_LINE_ALREADY_REVERSED");
        }

        const { movement } = await postInventoryMovementInTransaction(tx, session, inventoryLocationLock!, {
          inventoryLocationId: original.inventoryLocationId,
          relatedInventoryLocationId: original.relatedInventoryLocationId,
          itemId: original.itemId,
          movementType: "REVERSAL",
          occurredAt: now,
          enteredQuantity: Number(original.enteredQuantity),
          enteredUomId: original.enteredUomId,
          quantityDeltaBaseUom: -Number(original.quantityDeltaBaseUom),
          sourceDocumentType: "InventoryTransfer",
          sourceDocumentId: transfer.id,
          sourceDocumentLineId: line.inventoryTransferLineId,
          sourceEventKey: `receipt:${line.id}:reverse`,
          lotNumber: original.lotNumber,
          expiryDate: original.expiryDate,
          unitCost: original.unitCost ? Number(original.unitCost) : null,
          totalCost: original.totalCost ? Number(original.totalCost) : null,
          reasonCode: "TRANSFER_RECEIPT_REVERSAL",
          notes: values.reversalReason,
          reversalOfMovementId: original.id
        });
        originalMovementIds.push(original.id);
        reversalMovementIds.push(movement.id);
      }

      const updated = await tx.inventoryTransferLine.updateMany({
        where: {
          id: line.inventoryTransferLineId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          receivedQty: { gte: line.acceptedQty },
          rejectedQty: { gte: line.rejectedQty },
          damagedQty: { gte: line.damagedQty },
          discrepancyQty: { gte: line.discrepancyQty }
        },
        data: {
          receivedQty: { decrement: acceptedQty },
          rejectedQty: { decrement: rejectedQty },
          damagedQty: { decrement: damagedQty },
          discrepancyQty: { decrement: discrepancyQty }
        }
      });
      if (updated.count !== 1) {
        throw new Error("TRANSFER_RECEIPT_REVERSAL_ROLLUP_INVALID");
      }
      receiptLineIds.push(line.id);
    }

    const updatedLines = await tx.inventoryTransferLine.findMany({
      where: { inventoryTransferId: transfer.id },
      orderBy: { lineNumber: "asc" }
    });
    const nextStatus = calculateTransferReceiptStatus(
      updatedLines.map((line) => ({
        dispatchedQty: Number(line.dispatchedQty),
        receivedQty: Number(line.receivedQty),
        rejectedQty: Number(line.rejectedQty),
        damagedQty: Number(line.damagedQty),
        discrepancyQty: Number(line.discrepancyQty)
      }))
    );

    const latestRemainingReceipt = await tx.inventoryTransferReceipt.findFirst({
      where: {
        inventoryTransferId: transfer.id,
        status: "POSTED",
        reversedAt: null,
        id: { not: receipt.id }
      },
      orderBy: { receivedAt: "desc" },
      select: {
        receivedAt: true,
        receivedByUserId: true
      }
    });

    const reversed = await tx.inventoryTransferReceipt.updateMany({
      where: {
        id: receipt.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "REVERSING",
        reversedAt: null
      },
      data: {
        status: "REVERSED",
        reversedAt: now,
        reversedByUserId: session.user.id,
        reversalReason: values.reversalReason
      }
    });
    if (reversed.count !== 1) {
      throw new Error("TRANSFER_RECEIPT_REVERSAL_STATE_CONFLICT");
    }

    await tx.inventoryTransfer.update({
      where: { id: transfer.id },
      data: {
        status: nextStatus,
        receivedAt: latestRemainingReceipt?.receivedAt ?? null,
        receivedByUserId: latestRemainingReceipt?.receivedByUserId ?? null
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "inventory_transfer.receipt_reversed",
        entityType: "InventoryTransfer",
        entityId: transfer.id,
        beforeData: { status: transfer.status },
        afterData: { status: nextStatus },
        metadata: {
          receiptId: receipt.id,
          receiptLineIds,
          reversalReason: values.reversalReason,
          originalMovementIds,
          reversalMovementIds
        }
      }
    });
  });
}

export async function cancelInventoryTransfer(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.transferCancel);
  const values = cancelTransferSchema.parse(Object.fromEntries(formData));

  const transfer = await prisma.inventoryTransfer.findFirst({
    where: scopedTransferWhere(session, values.id)
  });
  if (!transfer) {
    throw new Error("TRANSFER_NOT_FOUND");
  }
  assertTransferCanCancel(transfer.status);

  await prisma.$transaction(async (tx) => {
    const cancelled = await tx.inventoryTransfer.updateMany({
      where: {
        id: transfer.id,
        status: { in: ["DRAFT", "REQUESTED"] }
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: values.cancellationReason
      }
    });
    if (cancelled.count !== 1) {
      throw new Error("TRANSFER_NOT_CANCELLABLE");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "inventory_transfer.cancelled",
        entityType: "InventoryTransfer",
        entityId: transfer.id,
        beforeData: { status: transfer.status },
        afterData: { status: "CANCELLED" },
        metadata: { reason: values.cancellationReason }
      }
    });
  });
}
