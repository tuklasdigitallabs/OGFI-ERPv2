import { prisma, type Prisma, type TransactionClient } from "@ogfi/database";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { STOCK_ADJUSTMENT_MAX_LINES } from "../../lib/workflowLimits";
import {
  canUseStockAdjustments,
  permissions,
  requirePermission
} from "./authorization";
import {
  assertAuthorizedLocation,
  requireSessionContext,
  type SessionContext
} from "./context";
import {
  lockInventoryLocationsForPosting,
  normalizeInventoryLotKey,
  postInventoryMovementInTransaction
} from "./inventory";
import {
  recordWorkflowNotifications
} from "./notifications";
import {
  assertAnyEligibleApprovalActorForStep,
  configureApprovalStepRouting
} from "./approvalRouting";
import { getApprovalRoutingPolicy } from "./approvalRoutingRegistry";
import {
  listActiveOperationalReasonCodes,
  requireActiveOperationalReasonCode
} from "./operationalReasonCodes";
import {
  getInventoryAdjustmentPolicy,
  getInventoryLotExpiryPolicy,
  inventoryItemLotExpiryRequirements
} from "./policySettings";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";
import {
  dashboardTaskAfterWhere,
  type DashboardTaskCursor,
  type DashboardTaskFilter
} from "./dashboardTasks";

const manualAdjustmentTypes = ["INCREASE", "DECREASE", "OPENING_BALANCE"] as const;

const optionalDateSchema = z
  .string()
  .optional()
  .transform((value) => (value ? new Date(value) : undefined));

const optionalUuidSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .pipe(z.string().uuid().optional());

const createStockAdjustmentSchema = z.object({
  inventoryLocationId: z.string().uuid(),
  adjustmentType: z.enum(manualAdjustmentTypes),
  reasonCode: z.string().trim().min(2).max(80),
  reasonDescription: z.string().trim().min(5).max(1000),
  evidenceReference: z.string().trim().max(240).optional(),
  sourceDocumentType: z.string().trim().max(80).optional(),
  sourceDocumentId: optionalUuidSchema
});

const createStockAdjustmentLineSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0).default(0),
  lotNumber: z.string().trim().max(120).optional(),
  expiryDate: optionalDateSchema,
  evidenceReference: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1000).optional()
});

const stockAdjustmentActionSchema = z.object({
  id: z.string().uuid()
});

const cancelStockAdjustmentSchema = z.object({
  id: z.string().uuid(),
  cancellationReason: z.string().trim().min(5).max(500)
});

const reverseStockAdjustmentSchema = z.object({
  id: z.string().uuid(),
  reversalReason: z.string().trim().min(5).max(500)
});

type StockAdjustmentLineDraft = {
  lineNumber: number;
  item: {
    id: string;
    baseUomId: string;
  };
  lotKey: string;
  lotNumber: string | null;
  expiryDate: Date | null;
  systemQuantityBaseUom: number;
  quantityDeltaBaseUom: number;
  unitCost: number;
  estimatedValueImpact: number;
  evidenceReference: string | null;
  notes: string | null;
};

export function assertStockAdjustmentQuantity(quantityDeltaBaseUom: number) {
  if (!Number.isFinite(quantityDeltaBaseUom) || quantityDeltaBaseUom === 0) {
    throw new Error("STOCK_ADJUSTMENT_QUANTITY_INVALID");
  }
}

export function assertStockAdjustmentCanSubmit(status: string) {
  if (!["DRAFT", "SUBMITTED", "RETURNED"].includes(status)) {
    throw new Error("STOCK_ADJUSTMENT_NOT_OPEN_FOR_SUBMIT");
  }
}

export function assertStockAdjustmentCanCancel(status: string) {
  if (!["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "RETURNED"].includes(status)) {
    throw new Error("STOCK_ADJUSTMENT_NOT_CANCELLABLE");
  }
}

export function assertStockAdjustmentCanPost(status: string, postedAt?: unknown) {
  if (status === "POSTED" || postedAt) {
    throw new Error("STOCK_ADJUSTMENT_ALREADY_POSTED");
  }
  if (status !== "APPROVED") {
    throw new Error("STOCK_ADJUSTMENT_NOT_APPROVED_FOR_POSTING");
  }
}

export function assertStockAdjustmentCanReverse(
  status: string,
  reversedAt?: unknown
) {
  if (status === "REVERSED" || reversedAt) {
    throw new Error("STOCK_ADJUSTMENT_ALREADY_REVERSED");
  }
  if (status !== "POSTED") {
    throw new Error("STOCK_ADJUSTMENT_NOT_POSTED_FOR_REVERSAL");
  }
}

export function calculateAdjustmentDelta(
  adjustmentType: "INCREASE" | "DECREASE" | "OPENING_BALANCE",
  quantity: number
) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("STOCK_ADJUSTMENT_QUANTITY_INVALID");
  }
  return adjustmentType === "DECREASE" ? -quantity : quantity;
}

export function assertOpeningBalanceIsPostable(values: {
  adjustmentType: string;
  evidenceReference?: string | null | undefined;
  evidenceRequired?: boolean | undefined;
  systemQuantityBaseUom: number;
}) {
  if (values.adjustmentType !== "OPENING_BALANCE") {
    return;
  }
  if (values.evidenceRequired !== false && !values.evidenceReference?.trim()) {
    throw new Error("OPENING_BALANCE_EVIDENCE_REQUIRED");
  }
  if (values.systemQuantityBaseUom !== 0) {
    throw new Error("OPENING_BALANCE_EXISTING_STOCK_ACTIVITY");
  }
}

export async function nextStockAdjustmentReference(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.stockAdjustment.count({
    where: {
      companyId,
      publicReference: { startsWith: `SA-${year}-` }
    }
  });
  return `SA-${year}-${String(count + 1).padStart(5, "0")}`;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function requireStockAdjustmentRead(session: SessionContext) {
  if (!canUseStockAdjustments(session.permissionCodes)) {
    await requirePermission(session, permissions.stockAdjustmentView);
  }
}

function scopedStockAdjustmentWhere(session: SessionContext, id?: string) {
  return {
    ...(id ? { id } : {}),
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    inventoryLocation: {
      locationId: session.context.locationId
    }
  };
}

export const stockAdjustmentDashboardProfiles = [
  "stock-adjustment-exceptions-v1"
] as const;
export type StockAdjustmentDashboardProfile =
  (typeof stockAdjustmentDashboardProfiles)[number];

const stockAdjustmentExceptionStatuses = [
  "PENDING_APPROVAL",
  "APPROVED",
  "POSTING",
  "RETURNED"
] as const;

const stockAdjustmentProfilePageSize = 25;

export function resolveStockAdjustmentDashboardProfile(
  value: string | undefined
): StockAdjustmentDashboardProfile | null {
  return value === "stock-adjustment-exceptions-v1" ? value : null;
}

export function stockAdjustmentDashboardProfileHref(
  profile: StockAdjustmentDashboardProfile,
  page = 1
) {
  const params = new URLSearchParams({ dashboard: profile });
  if (page > 1) {
    params.set("page", String(page));
  }
  return `/adjustments?${params.toString()}`;
}

/** Closed, server-owned dashboard population for adjustment follow-up. */
export function stockAdjustmentDashboardProfileWhere(
  session: SessionContext,
  profile: StockAdjustmentDashboardProfile
) {
  if (profile === "stock-adjustment-exceptions-v1") {
    return {
      ...scopedStockAdjustmentWhere(session),
      status: { in: [...stockAdjustmentExceptionStatuses] }
    } satisfies Prisma.StockAdjustmentWhereInput;
  }

  throw new Error("STOCK_ADJUSTMENT_DASHBOARD_PROFILE_UNSUPPORTED");
}

const stockAdjustmentDashboardTaskCandidateLimit = 8;
const stockAdjustmentMyTaskPageSize = 25;

export type StockAdjustmentDashboardTaskCandidate = {
  id: string;
  publicReference: string;
  status: string;
  adjustmentType: string;
  inventoryLocationName: string;
  lineCount: number;
  createdAt: string;
};

export type StockAdjustmentDashboardRead = {
  exceptionCount: number;
  taskCandidates: StockAdjustmentDashboardTaskCandidate[];
};

export type StockAdjustmentMyTaskPage = {
  totalCount: number;
  items: Array<{
    taskId: string;
    recordId: string;
    publicReference: string;
    adjustmentType: string;
    actionLabel: "Post stock adjustment";
    inventoryLocationName: string;
    createdAt: string;
  }>;
  nextCursor: DashboardTaskCursor | null;
};

/**
 * Returns the currently postable adjustment controls for the authenticated
 * user. Approval work remains in its authoritative Approval Inbox, and draft
 * correction work remains outside this initial task contract until it has a
 * focused editable surface.
 */
export async function listStockAdjustmentMyTaskPage(
  session: SessionContext,
  input: {
    after?: DashboardTaskCursor;
    take?: number;
    filter?: DashboardTaskFilter;
  } = {}
): Promise<StockAdjustmentMyTaskPage> {
  await requireStockAdjustmentRead(session);
  if (!session.permissionCodes.includes(permissions.stockAdjustmentPost)) {
    return { totalCount: 0, items: [], nextCursor: null };
  }
  if (input.filter?.priority && input.filter.priority !== "HIGH") return { totalCount: 0, items: [], nextCursor: null };
  if (input.filter?.status && input.filter.status !== "APPROVED") return { totalCount: 0, items: [], nextCursor: null };

  const take = Math.min(
    Math.max(input.take ?? stockAdjustmentMyTaskPageSize, 1),
    50
  );
  const afterWhere = dashboardTaskAfterWhere("STOCK_ADJUSTMENT", input.after);

  const where = {
    ...scopedStockAdjustmentWhere(session),
    status: "APPROVED",
    postedAt: null,
    ...(afterWhere ? { AND: [afterWhere] } : {})
  } satisfies Prisma.StockAdjustmentWhereInput;
  const select = {
    id: true,
    publicReference: true,
    adjustmentType: true,
    createdAt: true,
    inventoryLocation: { select: { name: true } }
  } satisfies Prisma.StockAdjustmentSelect;
  const [totalCount, rows] = await Promise.all([
    prisma.stockAdjustment.count({
      where: {
        ...scopedStockAdjustmentWhere(session),
        status: "APPROVED",
        postedAt: null
      }
    }),
    prisma.stockAdjustment.findMany({
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
    items: pageRows.map((adjustment) => ({
      taskId: `stock-adjustment-${adjustment.id}`,
      recordId: adjustment.id,
      publicReference: adjustment.publicReference,
      adjustmentType: adjustment.adjustmentType,
      actionLabel: "Post stock adjustment",
      inventoryLocationName: adjustment.inventoryLocation.name,
      createdAt: adjustment.createdAt.toISOString()
    })),
    nextCursor:
      rows.length > take && lastRow
        ? {
            createdAt: lastRow.createdAt.toISOString(),
            sourceType: "STOCK_ADJUSTMENT",
            recordId: lastRow.id
          }
        : null
  };
}

/**
 * Dashboard-only stock-adjustment read. It deliberately excludes adjustment
 * lines and workflow detail while preserving the normal scoped read gate.
 */
export async function getStockAdjustmentDashboardRead(
  session: SessionContext,
): Promise<StockAdjustmentDashboardRead> {
  await requireStockAdjustmentRead(session);

  const where = stockAdjustmentDashboardProfileWhere(
    session,
    "stock-adjustment-exceptions-v1"
  );
  const [exceptionCount, taskCandidates] = await Promise.all([
    prisma.stockAdjustment.count({ where }),
    prisma.stockAdjustment.findMany({
      where,
      select: {
        id: true,
        publicReference: true,
        status: true,
        adjustmentType: true,
        createdAt: true,
        inventoryLocation: { select: { name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: stockAdjustmentDashboardTaskCandidateLimit,
    }),
  ]);

  return {
    exceptionCount,
    taskCandidates: taskCandidates.map((adjustment) => ({
      id: adjustment.id,
      publicReference: adjustment.publicReference,
      status: adjustment.status,
      adjustmentType: adjustment.adjustmentType,
      inventoryLocationName: adjustment.inventoryLocation.name,
      lineCount: adjustment._count.lines,
      createdAt: adjustment.createdAt.toISOString(),
    })),
  };
}

type LockedStockAdjustmentCancellationUser = {
  id: string;
  status: string;
  privilegeEpoch: number;
};

type LockedStockAdjustmentCancellationSession = {
  status: string;
  assuranceLevel: string;
  mfaAuthenticatedAt: Date | null;
  privilegeEpochAtIssue: number;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
};

type LockedPendingStockAdjustmentApproval = {
  id: string;
  currentStepOrder: number;
};

function canonicalizeStockAdjustmentCancellationUserIds(userIds: string[]) {
  return Array.from(new Set(userIds)).sort();
}

function isStockAdjustmentCancellationTransactionConflict(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    meta?: { code?: unknown } | null;
  };
  return (
    candidate.code === "P2034" ||
    candidate.code === "40P01" ||
    candidate.code === "40001" ||
    candidate.meta?.code === "40P01" ||
    candidate.meta?.code === "40001"
  );
}

async function lockStockAdjustmentCancellationUsers(
  tx: TransactionClient,
  session: SessionContext,
  userIds: string[]
) {
  const lockedUserById = new Map<
    string,
    LockedStockAdjustmentCancellationUser
  >();
  for (const userId of canonicalizeStockAdjustmentCancellationUserIds(userIds)) {
    const users = await tx.$queryRaw<LockedStockAdjustmentCancellationUser[]>`
      SELECT id, status, "privilegeEpoch"
        FROM "User"
       WHERE id = ${userId}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
       FOR SHARE
    `;
    const user = users[0];
    if (!user) {
      throw new Error("STOCK_ADJUSTMENT_CANCELLATION_AUTHORITY_STALE");
    }
    lockedUserById.set(user.id, user);
  }
  return lockedUserById;
}

async function lockStockAdjustmentCancellationSession(
  tx: TransactionClient,
  session: SessionContext
) {
  if (!session.authentication?.sessionId) {
    return null;
  }
  const sessions = await tx.$queryRaw<LockedStockAdjustmentCancellationSession[]>`
    SELECT status, "assuranceLevel", "mfaAuthenticatedAt",
           "privilegeEpochAtIssue", "idleExpiresAt", "absoluteExpiresAt"
      FROM "AuthSession"
     WHERE id = ${session.authentication.sessionId}::uuid
       AND "tenantId" = ${session.context.tenantId}::uuid
       AND "userId" = ${session.user.id}::uuid
     FOR SHARE
  `;
  return sessions[0] ?? null;
}

async function lockPendingStockAdjustmentApproval(
  tx: TransactionClient,
  session: SessionContext,
  adjustmentId: string
) {
  const approvals = await tx.$queryRaw<LockedPendingStockAdjustmentApproval[]>`
    SELECT ai.id, ai."currentStepOrder"
      FROM "ApprovalInstance" ai
      JOIN "ApprovalInstanceStep" s
        ON s."approvalInstanceId" = ai.id
       AND s."stepOrder" = ai."currentStepOrder"
     WHERE ai."tenantId" = ${session.context.tenantId}::uuid
       AND ai."companyId" = ${session.context.companyId}::uuid
       AND ai."documentType" = 'StockAdjustment'
       AND ai."documentId" = ${adjustmentId}::uuid
       AND ai.status = 'PENDING'::"ApprovalStatus"
       AND s.status = 'PENDING'::"ApprovalStepStatus"
     ORDER BY ai."createdAt" ASC, ai.id ASC
     FOR UPDATE OF ai, s
  `;
  if (approvals.length > 1) {
    throw new Error("STOCK_ADJUSTMENT_MULTIPLE_PENDING_APPROVALS");
  }
  return approvals[0] ?? null;
}

async function assertFreshStockAdjustmentCancellationAuthority(
  tx: TransactionClient,
  session: SessionContext,
  input: {
    actor: LockedStockAdjustmentCancellationUser | undefined;
    authSession: LockedStockAdjustmentCancellationSession | null;
    inventoryLocationId: string;
  }
) {
  const now = new Date();
  if (input.actor?.status !== "ACTIVE") {
    throw new Error("STOCK_ADJUSTMENT_CANCELLATION_AUTHORITY_STALE");
  }
  if (
    session.authentication?.sessionId &&
    (!input.authSession ||
      input.authSession.status !== "ACTIVE" ||
      input.authSession.privilegeEpochAtIssue !== input.actor.privilegeEpoch ||
      input.authSession.idleExpiresAt <= now ||
      input.authSession.absoluteExpiresAt <= now)
  ) {
    throw new Error("STOCK_ADJUSTMENT_CANCELLATION_AUTHORITY_STALE");
  }

  const roleAssignment = await tx.userRoleAssignment.findFirst({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      role: {
        status: "ACTIVE",
        OR: [{ tenantId: null }, { tenantId: session.context.tenantId }],
        permissions: {
          some: {
            permission: {
              code: permissions.stockAdjustmentCancel,
              OR: [{ tenantId: null }, { tenantId: session.context.tenantId }]
            }
          }
        }
      }
    },
    select: { id: true }
  });
  if (!roleAssignment) {
    throw new Error("PERMISSION_DENIED");
  }

  const inventoryLocation = await tx.inventoryLocation.findFirst({
    where: {
      id: input.inventoryLocationId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE",
      location: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    },
    select: { locationId: true }
  });
  if (!inventoryLocation) {
    throw new Error("SCOPE_DENIED");
  }

  const scopeAssignment = await tx.userScopeAssignment.findFirst({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      AND: {
        OR: [
          {
            scopeType: "LOCATION",
            scopeId: inventoryLocation.locationId,
            accessLevel: { in: ["APPROVE", "MANAGE"] }
          },
          {
            scopeType: "COMPANY",
            scopeId: session.context.companyId,
            accessLevel: { in: ["APPROVE", "MANAGE"] }
          }
        ]
      }
    },
    select: { id: true }
  });
  if (!scopeAssignment) {
    throw new Error("SCOPE_DENIED");
  }
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

function parseStockAdjustmentLines(formData: FormData) {
  const itemIds = requiredFormValues(formData, "lineItemId");
  const quantities = requiredFormValues(formData, "lineQuantity");
  const unitCosts = optionalFormValues(formData, "lineUnitCost", itemIds.length);
  const lotNumbers = optionalFormValues(formData, "lineLotNumber", itemIds.length);
  const expiryDates = optionalFormValues(formData, "lineExpiryDate", itemIds.length);
  const evidenceReferences = optionalFormValues(
    formData,
    "lineEvidenceReference",
    itemIds.length
  );
  const notes = optionalFormValues(formData, "lineNotes", itemIds.length);

  if (itemIds.length === 0) {
    throw new Error("STOCK_ADJUSTMENT_HAS_NO_LINES");
  }
  if (itemIds.length > STOCK_ADJUSTMENT_MAX_LINES) {
    throw new Error("STOCK_ADJUSTMENT_TOO_MANY_LINES");
  }
  if (quantities.length !== itemIds.length) {
    throw new Error("STOCK_ADJUSTMENT_LINE_REQUIRED");
  }

  return itemIds.map((itemId, index) =>
    createStockAdjustmentLineSchema.parse({
      itemId,
      quantity: quantities[index],
      unitCost: unitCosts[index] || "0",
      lotNumber: lotNumbers[index] || undefined,
      expiryDate: expiryDates[index] || undefined,
      evidenceReference: evidenceReferences[index] || undefined,
      notes: notes[index] || undefined
    })
  );
}

export async function listStockAdjustmentFormOptions(session: SessionContext) {
  await requirePermission(session, permissions.stockAdjustmentCreate);

  const [inventoryLocations, items, reasonCodes, adjustmentPolicy] = await Promise.all([
    prisma.inventoryLocation.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: "ACTIVE"
      },
      orderBy: { name: "asc" }
    }),
    prisma.item.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
        trackInventory: true
      },
      include: {
        baseUom: true
      },
      orderBy: { itemName: "asc" }
    }),
    listActiveOperationalReasonCodes(session, "STOCK_ADJUSTMENT"),
    getInventoryAdjustmentPolicy(session)
  ]);

  return {
    inventoryLocations: inventoryLocations.map((location) => ({
      id: location.id,
      name: location.name
    })),
    items: items.map((item) => ({
      id: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      baseUomCode: item.baseUom.uomCode,
      trackLot: item.trackLot,
      trackExpiry: item.trackExpiry
    })),
    adjustmentTypes: manualAdjustmentTypes,
    reasonCodes,
    policy: adjustmentPolicy
  };
}

export async function listStockAdjustments(
  session: SessionContext,
  profile?: StockAdjustmentDashboardProfile
) {
  await requireStockAdjustmentRead(session);

  const adjustments = await prisma.stockAdjustment.findMany({
    where: profile
      ? stockAdjustmentDashboardProfileWhere(session, profile)
      : scopedStockAdjustmentWhere(session),
    include: {
      inventoryLocation: true,
      requestedBy: true,
      cancelledBy: true,
      postedBy: true,
      reversedBy: true,
      lines: true
    },
    orderBy: { createdAt: "desc" }
  });

  return adjustments.map(mapStockAdjustment);
}

type StockAdjustmentWithRelations = Prisma.StockAdjustmentGetPayload<{ include: {
  inventoryLocation: true; requestedBy: true; cancelledBy: true; postedBy: true; reversedBy: true; lines: true;
} }>;

function mapStockAdjustment(adjustment: StockAdjustmentWithRelations) {
  return {
    id: adjustment.id,
    publicReference: adjustment.publicReference,
    status: adjustment.status,
    adjustmentType: adjustment.adjustmentType,
    reasonCode: adjustment.reasonCode,
    reasonDescription: adjustment.reasonDescription,
    inventoryLocationName: adjustment.inventoryLocation.name,
    requestedByName: adjustment.requestedBy.displayName,
    cancelledByName: adjustment.cancelledBy?.displayName ?? null,
    postedByName: adjustment.postedBy?.displayName ?? null,
    reversedByName: adjustment.reversedBy?.displayName ?? null,
    createdAt: adjustment.createdAt.toISOString(),
    submittedAt: adjustment.submittedAt?.toISOString() ?? null,
    postedAt: adjustment.postedAt?.toISOString() ?? null,
    reversedAt: adjustment.reversedAt?.toISOString() ?? null,
    cancelledAt: adjustment.cancelledAt?.toISOString() ?? null,
    totalEstimatedValueImpact: Number(adjustment.totalEstimatedValueImpact),
    lineCount: adjustment.lines.length,
    totalQuantityDelta: adjustment.lines.reduce(
      (total, line) => total + Number(line.quantityDeltaBaseUom),
      0
    )
  };
}

export async function listStockAdjustmentPage(
  session: SessionContext,
  input: { page?: number; pageSize?: number } = {}
) {
  await requireStockAdjustmentRead(session);
  const pageSize = Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 25)));
  const requestedPage = Math.max(1, Math.trunc(input.page ?? 1));
  const where = scopedStockAdjustmentWhere(session);
  const totalItems = await prisma.stockAdjustment.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const adjustments = await prisma.stockAdjustment.findMany({
    where,
    include: { inventoryLocation: true, requestedBy: true, cancelledBy: true, postedBy: true, reversedBy: true, lines: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize
  });
  return { items: adjustments.map(mapStockAdjustment), totalItems, page, pageSize, totalPages };
}

export type StockAdjustmentExceptionProfilePage = {
  adjustments: Awaited<ReturnType<typeof listStockAdjustments>>;
  totalItems: number;
  page: number;
  pageSize: number;
};

export async function listStockAdjustmentDashboardProfilePage(
  session: SessionContext,
  profile: StockAdjustmentDashboardProfile,
  requestedPage: number
): Promise<StockAdjustmentExceptionProfilePage> {
  await requireStockAdjustmentRead(session);

  const page = Number.isFinite(requestedPage) && requestedPage > 0
    ? Math.floor(requestedPage)
    : 1;
  const where = stockAdjustmentDashboardProfileWhere(session, profile);
  const totalItems = await prisma.stockAdjustment.count({ where });
  const safePage = Math.min(
    page,
    Math.max(1, Math.ceil(totalItems / stockAdjustmentProfilePageSize))
  );
  const adjustments = await prisma.stockAdjustment.findMany({
    where,
    include: {
      inventoryLocation: true,
      requestedBy: true,
      cancelledBy: true,
      postedBy: true,
      reversedBy: true,
      lines: true
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (safePage - 1) * stockAdjustmentProfilePageSize,
    take: stockAdjustmentProfilePageSize
  });

  return {
    adjustments: adjustments.map((adjustment) => ({
      id: adjustment.id,
      publicReference: adjustment.publicReference,
      status: adjustment.status,
      adjustmentType: adjustment.adjustmentType,
      reasonCode: adjustment.reasonCode,
      reasonDescription: adjustment.reasonDescription,
      inventoryLocationName: adjustment.inventoryLocation.name,
      requestedByName: adjustment.requestedBy.displayName,
      cancelledByName: adjustment.cancelledBy?.displayName ?? null,
      postedByName: adjustment.postedBy?.displayName ?? null,
      reversedByName: adjustment.reversedBy?.displayName ?? null,
      createdAt: adjustment.createdAt.toISOString(),
      submittedAt: adjustment.submittedAt?.toISOString() ?? null,
      postedAt: adjustment.postedAt?.toISOString() ?? null,
      reversedAt: adjustment.reversedAt?.toISOString() ?? null,
      cancelledAt: adjustment.cancelledAt?.toISOString() ?? null,
      totalEstimatedValueImpact: Number(adjustment.totalEstimatedValueImpact),
      lineCount: adjustment.lines.length,
      totalQuantityDelta: adjustment.lines.reduce(
        (total, line) => total + Number(line.quantityDeltaBaseUom),
        0
      )
    })),
    totalItems,
    page: safePage,
    pageSize: stockAdjustmentProfilePageSize
  };
}

export async function getStockAdjustment(session: SessionContext, id: string) {
  await requireStockAdjustmentRead(session);

  const adjustment = await prisma.stockAdjustment.findFirst({
    where: scopedStockAdjustmentWhere(session, id),
    include: {
      inventoryLocation: {
        include: { location: true }
      },
      requestedBy: true,
      cancelledBy: true,
      postedBy: true,
      reversedBy: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true,
          postedMovement: {
            include: {
              reversalMovements: true
            }
          }
        }
      }
    }
  });

  if (!adjustment) {
    return null;
  }

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      entityType: "StockAdjustment",
      entityId: adjustment.id
    },
    orderBy: { occurredAt: "asc" }
  });

  return {
    id: adjustment.id,
    publicReference: adjustment.publicReference,
    status: adjustment.status,
    adjustmentType: adjustment.adjustmentType,
    reasonCode: adjustment.reasonCode,
    reasonDescription: adjustment.reasonDescription,
    evidenceReference: adjustment.evidenceReference ?? null,
    sourceDocumentType: adjustment.sourceDocumentType ?? null,
    sourceDocumentId: adjustment.sourceDocumentId ?? null,
    totalEstimatedValueImpact: Number(adjustment.totalEstimatedValueImpact),
    inventoryLocationName: adjustment.inventoryLocation.name,
    locationName: adjustment.inventoryLocation.location.name,
    requestedByName: adjustment.requestedBy.displayName,
    cancelledByName: adjustment.cancelledBy?.displayName ?? null,
    postedByName: adjustment.postedBy?.displayName ?? null,
    reversedByName: adjustment.reversedBy?.displayName ?? null,
    submittedAt: adjustment.submittedAt?.toISOString() ?? null,
    postedAt: adjustment.postedAt?.toISOString() ?? null,
    reversedAt: adjustment.reversedAt?.toISOString() ?? null,
    cancelledAt: adjustment.cancelledAt?.toISOString() ?? null,
    cancellationReason: adjustment.cancellationReason ?? null,
    reversalReason: adjustment.reversalReason ?? null,
    createdAt: adjustment.createdAt.toISOString(),
    lines: adjustment.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      itemCode: line.item.itemCode,
      itemName: line.item.itemName,
      quantityDeltaBaseUom: Number(line.quantityDeltaBaseUom),
      systemQuantityBaseUom: Number(line.systemQuantityBaseUom),
      uomCode: line.uom.uomCode,
      unitCost: Number(line.unitCost),
      estimatedValueImpact: Number(line.estimatedValueImpact),
      reasonCode: line.reasonCode,
      evidenceReference: line.evidenceReference ?? null,
      postedMovementId: line.postedMovementId ?? null,
      reversalMovementCount: line.postedMovement?.reversalMovements.length ?? 0,
      lotKey: line.lotKey,
      lotNumber: line.lotNumber ?? null,
      expiryDate: line.expiryDate?.toISOString().slice(0, 10) ?? null,
      notes: line.notes ?? null
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      occurredAt: event.occurredAt.toISOString(),
      metadata: event.metadata
    }))
  };
}

export async function createStockAdjustment(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockAdjustmentCreate);
  const values = createStockAdjustmentSchema.parse(Object.fromEntries(formData));
  const lineValues = parseStockAdjustmentLines(formData);

  const inventoryLocation = await prisma.inventoryLocation.findFirst({
    where: {
      id: values.inventoryLocationId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: session.context.locationId,
      status: "ACTIVE"
    }
  });

  if (!inventoryLocation) {
    throw new Error("STOCK_ADJUSTMENT_INVENTORY_LOCATION_NOT_FOUND");
  }
  assertAuthorizedLocation(session, inventoryLocation.locationId);

  const itemIds = Array.from(new Set(lineValues.map((line) => line.itemId)));
  const items = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE",
      trackInventory: true
    },
    include: {
      baseUom: true,
      category: true
    }
  });
  const itemById = new Map(items.map((item) => [item.id, item]));
  if (items.length !== itemIds.length) {
    throw new Error("STOCK_ADJUSTMENT_ITEM_NOT_FOUND");
  }

  const lineDrafts: StockAdjustmentLineDraft[] = [];
  const openingBalanceLotKeys = new Set<string>();
  const adjustmentPolicy = await getInventoryAdjustmentPolicy(session);
  const lotExpiryPolicy = await getInventoryLotExpiryPolicy(session);

  for (const [index, line] of lineValues.entries()) {
    const item = itemById.get(line.itemId);
    if (!item) {
      throw new Error("STOCK_ADJUSTMENT_ITEM_NOT_FOUND");
    }
    const lotExpiryRequirements = inventoryItemLotExpiryRequirements(
      item,
      lotExpiryPolicy
    );
    if (lotExpiryRequirements.requiresLot && !line.lotNumber) {
      throw new Error("STOCK_ADJUSTMENT_LOT_REQUIRED");
    }
    if (lotExpiryRequirements.requiresExpiry && !line.expiryDate) {
      throw new Error("STOCK_ADJUSTMENT_EXPIRY_REQUIRED");
    }

    const quantityDeltaBaseUom = calculateAdjustmentDelta(
      values.adjustmentType,
      line.quantity
    );
    assertStockAdjustmentQuantity(quantityDeltaBaseUom);

    const lotKey = normalizeInventoryLotKey(line.lotNumber, line.expiryDate);
    const balance = await prisma.inventoryBalance.findUnique({
      where: {
        inventoryLocationId_itemId_lotKey: {
          inventoryLocationId: inventoryLocation.id,
          itemId: item.id,
          lotKey
        }
      }
    });
    const systemQuantityBaseUom = Number(balance?.qtyOnHand ?? 0);

    assertOpeningBalanceIsPostable({
      adjustmentType: values.adjustmentType,
      evidenceReference: line.evidenceReference || values.evidenceReference,
      evidenceRequired: adjustmentPolicy.openingBalanceEvidenceRequired,
      systemQuantityBaseUom
    });

    if (values.adjustmentType === "OPENING_BALANCE") {
      const openingKey = `${item.id}:${lotKey}`;
      if (openingBalanceLotKeys.has(openingKey)) {
        throw new Error("OPENING_BALANCE_ALREADY_EXISTS");
      }
      openingBalanceLotKeys.add(openingKey);

      const existingOpeningBalance = await prisma.stockAdjustmentLine.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: inventoryLocation.id,
          itemId: item.id,
          lotKey,
          stockAdjustment: {
            adjustmentType: "OPENING_BALANCE",
            status: { notIn: ["CANCELLED", "REJECTED", "REVERSED"] }
          }
        },
        select: { id: true }
      });
      if (existingOpeningBalance) {
        throw new Error("OPENING_BALANCE_ALREADY_EXISTS");
      }
    }

    lineDrafts.push({
      lineNumber: index + 1,
      item,
      lotKey,
      lotNumber: line.lotNumber || null,
      expiryDate: line.expiryDate ?? null,
      systemQuantityBaseUom,
      quantityDeltaBaseUom,
      unitCost: line.unitCost,
      estimatedValueImpact: line.quantity * line.unitCost,
      evidenceReference: line.evidenceReference || values.evidenceReference || null,
      notes: line.notes || null
    });
  }

  const controlledReasonCode = await requireActiveOperationalReasonCode(
    session,
    "STOCK_ADJUSTMENT",
    values.reasonCode,
    values.adjustmentType
  );
  const totalEstimatedValueImpact = lineDrafts.reduce(
    (total, line) => total + line.estimatedValueImpact,
    0
  );

  let adjustmentId: string | null = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const adjustment = await prisma.$transaction(async (tx) => {
        const created = await tx.stockAdjustment.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            inventoryLocationId: inventoryLocation.id,
            publicReference: await nextStockAdjustmentReference(
              session.context.companyId
            ),
            requestedByUserId: session.user.id,
            adjustmentType: values.adjustmentType,
            reasonCode: controlledReasonCode.code,
            reasonDescription: values.reasonDescription,
            evidenceReference: values.evidenceReference || null,
            sourceDocumentType: values.sourceDocumentType || null,
            sourceDocumentId: values.sourceDocumentId || null,
            totalEstimatedValueImpact
          }
        });

        await tx.stockAdjustmentLine.createMany({
          data: lineDrafts.map((line) => ({
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            stockAdjustmentId: created.id,
            inventoryLocationId: inventoryLocation.id,
            itemId: line.item.id,
            uomId: line.item.baseUomId,
            lineNumber: line.lineNumber,
            lotKey: line.lotKey,
            lotNumber: line.lotNumber,
            expiryDate: line.expiryDate,
            systemQuantityBaseUom: line.systemQuantityBaseUom,
            quantityDeltaBaseUom: line.quantityDeltaBaseUom,
            unitCost: line.unitCost,
            estimatedValueImpact: line.estimatedValueImpact,
            reasonCode: controlledReasonCode.code,
            notes: line.notes,
            evidenceReference: line.evidenceReference
          }))
        });

        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType: "stock_adjustment.created",
            entityType: "StockAdjustment",
            entityId: created.id,
            afterData: { status: "DRAFT" },
            metadata: {
              inventoryLocationId: inventoryLocation.id,
              itemIds,
              adjustmentType: values.adjustmentType,
              lineCount: lineDrafts.length,
              totalQuantityDeltaBaseUom: lineDrafts.reduce(
                (total, line) => total + line.quantityDeltaBaseUom,
                0
              ),
              totalEstimatedValueImpact,
              reasonCode: controlledReasonCode.code,
              reasonLabel: controlledReasonCode.label,
              reasonCodeId: controlledReasonCode.id,
              openingBalanceCutover: values.adjustmentType === "OPENING_BALANCE",
              approvalAndPostingRequired: true
            }
          }
        });

        return created;
      });
      adjustmentId = adjustment.id;
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 5) {
        throw error;
      }
    }
  }

  if (!adjustmentId) {
    throw new Error("STOCK_ADJUSTMENT_REFERENCE_ALLOCATION_FAILED");
  }

  return adjustmentId;
}

export async function submitStockAdjustment(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockAdjustmentSubmit);
  const values = stockAdjustmentActionSchema.parse(Object.fromEntries(formData));

  const adjustment = await prisma.stockAdjustment.findFirst({
    where: scopedStockAdjustmentWhere(session, values.id),
    include: {
      inventoryLocation: true,
      lines: true
    }
  });
  if (!adjustment) {
    throw new Error("STOCK_ADJUSTMENT_NOT_FOUND");
  }
  assertStockAdjustmentCanSubmit(adjustment.status);
  if (adjustment.lines.length === 0) {
    throw new Error("STOCK_ADJUSTMENT_HAS_NO_LINES");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "stock_adjustment.post",
    enforcementScope: "all_sensitive",
    permissionCode: permissions.stockAdjustmentPost,
    entityType: "StockAdjustment",
    entityId: adjustment.id,
    reason:
      "Posting a stock adjustment changes inventory balances and requires privileged MFA evidence.",
    metadata: {
      adjustmentType: adjustment.adjustmentType,
      inventoryLocationId: adjustment.inventoryLocationId
    }
  });

  await prisma.$transaction(async (tx) => {
    const transactionType = adjustment.sourceStockCountSessionId
      ? "StockCountVarianceAdjustment"
      : "StockAdjustment";
    const approvalRule = await tx.approvalRule.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        transactionType,
        isActive: true
      },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" }
        }
      },
      orderBy: { priority: "asc" }
    });
    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("APPROVAL_RULE_NOT_CONFIGURED");
    }
    const firstStep = approvalRule.steps[0];
    if (!firstStep) {
      throw new Error("APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }

    const existingPendingApproval = await tx.approvalInstance.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "StockAdjustment",
        documentId: adjustment.id,
        status: "PENDING"
      },
      select: { id: true }
    });
    if (existingPendingApproval) {
      throw new Error("STOCK_ADJUSTMENT_APPROVAL_ALREADY_SUBMITTED");
    }

    const routedSteps = approvalRule.steps.map((step, index) => ({
      ...step,
      approvalInstanceStepId: randomUUID(),
      activationStatus: index === 0 ? "PENDING" as const : "WAITING" as const
    }));
    const firstRoutedStep = routedSteps[0];
    if (!firstRoutedStep) {
      throw new Error("APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }

    const approval = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "StockAdjustment",
        documentId: adjustment.id,
        approvalRuleId: approvalRule.id,
        status: "PENDING",
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: routedSteps.map((step) => ({
            id: step.approvalInstanceStepId,
            stepOrder: step.stepOrder,
            assignedUserId: step.userId,
            assignedRoleId: step.roleId,
            status: step.activationStatus
          }))
        }
      }
    });

    for (const step of routedSteps) {
      await configureApprovalStepRouting(tx, {
        approvalInstanceStepId: step.approvalInstanceStepId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        routingPolicy: getApprovalRoutingPolicy("StockAdjustment"),
        requiredPermissionCode: permissions.stockAdjustmentApprove,
        dueAt: null,
        activationAudit: {
          actorUserId: session.user.id,
          source: "stock-adjustment-submission"
        },
        scopeGroups: [{
          groupOrder: 1,
          targetMatchMode: "ANY",
          targets: [{
            scopeType: "LOCATION",
            companyId: session.context.companyId,
            locationId: adjustment.inventoryLocation.locationId
          }]
        }],
        prohibitedActors: [{
          userId: adjustment.requestedByUserId,
          reasonCode: "REQUESTER"
        }]
      });
    }
    await assertAnyEligibleApprovalActorForStep(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      approvalInstanceStepId: firstRoutedStep.approvalInstanceStepId
    });

    const submitted = await tx.stockAdjustment.updateMany({
      where: {
        id: adjustment.id,
        status: { in: ["DRAFT", "SUBMITTED", "RETURNED"] }
      },
      data: {
        status: "PENDING_APPROVAL",
        submittedAt: new Date()
      }
    });
    if (submitted.count !== 1) {
      throw new Error("STOCK_ADJUSTMENT_NOT_OPEN_FOR_SUBMIT");
    }

    const auditEvent = await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "stock_adjustment.submitted",
        entityType: "StockAdjustment",
        entityId: adjustment.id,
        beforeData: { status: adjustment.status },
        afterData: {
          status: "PENDING_APPROVAL",
          currentApprovalStep: firstStep.stepOrder
        },
        metadata: {
          approvalInstanceId: approval.id,
          approvalRuleId: approvalRule.id,
          approvalRuleTransactionType: transactionType,
          lineCount: adjustment.lines.length,
          totalEstimatedValueImpact: Number(adjustment.totalEstimatedValueImpact),
          nonPostingApproval: true
        }
      }
    });

    await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: adjustment.inventoryLocation.locationId,
      recipientUserIds: firstStep.userId ? [firstStep.userId] : [],
      notificationType: "APPROVE_STOCK_ADJUSTMENT",
      priority:
        adjustment.adjustmentType === "OPENING_BALANCE" ? "HIGH" : "NORMAL",
      title: `Approve Stock Adjustment ${adjustment.publicReference}`,
      body: `${session.user.displayName} submitted ${adjustment.publicReference} for stock-adjustment approval.`,
      deepLink: `/approvals/${approval.id}`,
      entityType: "StockAdjustment",
      entityId: adjustment.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approval.id,
        approvalStepOrder: firstStep.stepOrder,
        publicReference: adjustment.publicReference,
        adjustmentType: adjustment.adjustmentType,
        lineCount: adjustment.lines.length,
        source: "stock-adjustment-approval-submission"
      }
    });
  });
}

export async function cancelStockAdjustment(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockAdjustmentCancel);
  const values = cancelStockAdjustmentSchema.parse(Object.fromEntries(formData));

  const adjustment = await prisma.stockAdjustment.findFirst({
    where: scopedStockAdjustmentWhere(session, values.id),
    include: { inventoryLocation: true }
  });
  if (!adjustment) {
    throw new Error("STOCK_ADJUSTMENT_NOT_FOUND");
  }
  assertStockAdjustmentCanCancel(adjustment.status);

  try {
    await prisma.$transaction(async (tx) => {
      const lockedUserById = await lockStockAdjustmentCancellationUsers(
        tx,
        session,
        [session.user.id, adjustment.requestedByUserId]
      );
      const authSession = await lockStockAdjustmentCancellationSession(
        tx,
        session
      );
      const approval = await lockPendingStockAdjustmentApproval(
        tx,
        session,
        adjustment.id
      );

      await assertFreshStockAdjustmentCancellationAuthority(tx, session, {
        actor: lockedUserById.get(session.user.id),
        authSession,
        inventoryLocationId: adjustment.inventoryLocationId
      });
      const liveMfaSession = authSession
        ? {
            ...session,
            authentication: {
              sessionId: session.authentication!.sessionId,
              assuranceLevel: authSession.assuranceLevel,
              mfaAuthenticatedAt: authSession.mfaAuthenticatedAt,
              absoluteExpiresAt: authSession.absoluteExpiresAt
            }
          }
        : session;
      await assertPrivilegedMfaForAction(liveMfaSession, {
        action: "stock_adjustment.cancel",
        enforcementScope: "all_sensitive",
        permissionCode: permissions.stockAdjustmentCancel,
        entityType: "StockAdjustment",
        entityId: adjustment.id,
        reason:
          "Cancelling a stock adjustment is a sensitive controlled-workflow action.",
        metadata: {
          adjustmentType: adjustment.adjustmentType,
          inventoryLocationId: adjustment.inventoryLocationId
        }
      });

      if (adjustment.status === "PENDING_APPROVAL" && !approval) {
        throw new Error("STOCK_ADJUSTMENT_NOT_CANCELLABLE");
      }

      const cancelled = await tx.stockAdjustment.updateMany({
        where: {
          id: adjustment.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: adjustment.inventoryLocationId,
          status: adjustment.status,
          inventoryLocation: {
            locationId: adjustment.inventoryLocation.locationId
          }
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledByUserId: session.user.id,
          cancellationReason: values.cancellationReason
        }
      });
      if (cancelled.count !== 1) {
        throw new Error("STOCK_ADJUSTMENT_NOT_CANCELLABLE");
      }

      if (approval) {
        const cancelledApproval = await tx.approvalInstance.updateMany({
          where: {
            id: approval.id,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "PENDING",
            currentStepOrder: approval.currentStepOrder
          },
          data: {
            status: "CANCELLED",
            currentStepOrder: null
          }
        });
        if (cancelledApproval.count !== 1) {
          throw new Error("STOCK_ADJUSTMENT_NOT_CANCELLABLE");
        }
        const skippedSteps = await tx.approvalInstanceStep.updateMany({
          where: {
            approvalInstanceId: approval.id,
            status: { in: ["PENDING", "WAITING"] }
          },
          data: { status: "SKIPPED" }
        });
        if (skippedSteps.count < 1) {
          throw new Error("STOCK_ADJUSTMENT_NOT_CANCELLABLE");
        }
      }

      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "stock_adjustment.cancelled",
          entityType: "StockAdjustment",
          entityId: adjustment.id,
          beforeData: { status: adjustment.status },
          afterData: { status: "CANCELLED" },
          metadata: {
            approvalInstanceId: approval?.id ?? null,
            cancellationReason: values.cancellationReason,
            nonPostingApproval: adjustment.status === "PENDING_APPROVAL"
          }
        }
      });
    });
  } catch (error) {
    if (isStockAdjustmentCancellationTransactionConflict(error)) {
      throw new Error("STOCK_ADJUSTMENT_NOT_CANCELLABLE");
    }
    throw error;
  }
}

export async function postStockAdjustment(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockAdjustmentPost);
  const values = stockAdjustmentActionSchema.parse(Object.fromEntries(formData));

  const adjustment = await prisma.stockAdjustment.findFirst({
    where: scopedStockAdjustmentWhere(session, values.id),
    include: {
      inventoryLocation: true,
      lines: {
        orderBy: { lineNumber: "asc" }
      }
    }
  });
  if (!adjustment) {
    throw new Error("STOCK_ADJUSTMENT_NOT_FOUND");
  }
  assertAuthorizedLocation(session, adjustment.inventoryLocation.locationId);
  assertStockAdjustmentCanPost(adjustment.status, adjustment.postedAt);
  if (adjustment.lines.length === 0) {
    throw new Error("STOCK_ADJUSTMENT_HAS_NO_LINES");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "stock_adjustment.reverse",
    enforcementScope: "all_sensitive",
    permissionCode: permissions.stockAdjustmentReverse,
    entityType: "StockAdjustment",
    entityId: adjustment.id,
    reason:
      "Reversing a stock adjustment creates counter-movements and requires privileged MFA evidence.",
    metadata: {
      adjustmentType: adjustment.adjustmentType,
      inventoryLocationId: adjustment.inventoryLocationId
    }
  });

  await prisma.$transaction(async (tx) => {
    const inventoryLocationLock = await lockInventoryLocationsForPosting(
      tx,
      session,
      adjustment.lines.map((line) => line.inventoryLocationId)
    );
    const claimed = await tx.stockAdjustment.updateMany({
      where: {
        id: adjustment.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "APPROVED",
        postedAt: null
      },
      data: { status: "POSTING" }
    });
    if (claimed.count !== 1) {
      const current = await tx.stockAdjustment.findFirst({
        where: {
          id: adjustment.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId
        },
        select: { status: true, postedAt: true }
      });
      if (current?.status === "POSTED" || current?.postedAt) {
        return;
      }
      throw new Error("STOCK_ADJUSTMENT_NOT_APPROVED_FOR_POSTING");
    }

    const movementIds: string[] = [];
    for (const line of adjustment.lines) {
      if (line.postedMovementId) {
        movementIds.push(line.postedMovementId);
        continue;
      }

      const quantityDeltaBaseUom = Number(line.quantityDeltaBaseUom);
      const movementType =
        adjustment.adjustmentType === "OPENING_BALANCE"
          ? "OPENING_BALANCE_IN"
          : quantityDeltaBaseUom > 0
            ? "ADJUSTMENT_IN"
            : "ADJUSTMENT_OUT";
      const { movement } = await postInventoryMovementInTransaction(tx, session, inventoryLocationLock, {
        inventoryLocationId: line.inventoryLocationId,
        itemId: line.itemId,
        movementType,
        occurredAt: new Date(),
        enteredQuantity: Math.abs(quantityDeltaBaseUom),
        enteredUomId: line.uomId,
        quantityDeltaBaseUom,
        sourceDocumentType: "StockAdjustment",
        sourceDocumentId: adjustment.id,
        sourceDocumentLineId: line.id,
        sourceEventKey: `stock_adjustment_line:${line.id}:post`,
        lotNumber: line.lotNumber ?? null,
        expiryDate: line.expiryDate ?? null,
        unitCost: Number(line.unitCost),
        totalCost: Number(line.estimatedValueImpact),
        reasonCode: line.reasonCode,
        notes: line.notes ?? adjustment.reasonDescription
      });

      await tx.stockAdjustmentLine.update({
        where: { id: line.id },
        data: { postedMovementId: movement.id }
      });
      movementIds.push(movement.id);
    }

    const postedAt = new Date();
    const posted = await tx.stockAdjustment.updateMany({
      where: {
        id: adjustment.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "POSTING",
        postedAt: null
      },
      data: {
        status: "POSTED",
        postedAt,
        postedByUserId: session.user.id
      }
    });
    if (posted.count !== 1) {
      throw new Error("STOCK_ADJUSTMENT_POSTING_STATE_CONFLICT");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "stock_adjustment.posted",
        entityType: "StockAdjustment",
        entityId: adjustment.id,
        beforeData: { status: "APPROVED" },
        afterData: { status: "POSTED", postedAt },
        metadata: {
          lineCount: adjustment.lines.length,
          movementIds,
          openingBalanceCutover: adjustment.adjustmentType === "OPENING_BALANCE",
          totalEstimatedValueImpact: Number(adjustment.totalEstimatedValueImpact),
          reversalRequiredForCorrections: true
        }
      }
    });
  });
}

export async function reverseStockAdjustment(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockAdjustmentReverse);
  const values = reverseStockAdjustmentSchema.parse(Object.fromEntries(formData));

  const adjustment = await prisma.stockAdjustment.findFirst({
    where: scopedStockAdjustmentWhere(session, values.id),
    include: {
      inventoryLocation: true,
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
  });
  if (!adjustment) {
    throw new Error("STOCK_ADJUSTMENT_NOT_FOUND");
  }
  assertAuthorizedLocation(session, adjustment.inventoryLocation.locationId);
  assertStockAdjustmentCanReverse(adjustment.status, adjustment.reversedAt);
  if (!adjustment.postedAt) {
    throw new Error("STOCK_ADJUSTMENT_NOT_POSTED_FOR_REVERSAL");
  }
  if (adjustment.lines.length === 0) {
    throw new Error("STOCK_ADJUSTMENT_HAS_NO_LINES");
  }

  await prisma.$transaction(async (tx) => {
    const inventoryLocationLock = await lockInventoryLocationsForPosting(
      tx,
      session,
      adjustment.lines.flatMap((line) => [
        line.postedMovement?.inventoryLocationId ?? line.inventoryLocationId,
        ...(line.postedMovement?.relatedInventoryLocationId
          ? [line.postedMovement.relatedInventoryLocationId]
          : [])
      ])
    );
    const claimed = await tx.stockAdjustment.updateMany({
      where: {
        id: adjustment.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "POSTED",
        postedAt: { not: null },
        reversedAt: null
      },
      data: { status: "REVERSING" }
    });
    if (claimed.count !== 1) {
      const current = await tx.stockAdjustment.findFirst({
        where: {
          id: adjustment.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId
        },
        select: { status: true, reversedAt: true }
      });
      if (current?.status === "REVERSED" || current?.reversedAt) {
        return;
      }
      throw new Error("STOCK_ADJUSTMENT_NOT_POSTED_FOR_REVERSAL");
    }

    const originalMovementIds: string[] = [];
    const reversalMovementIds: string[] = [];
    for (const line of adjustment.lines) {
      const original = line.postedMovement;
      if (!original || !line.postedMovementId) {
        throw new Error("STOCK_ADJUSTMENT_LINE_POSTED_MOVEMENT_REQUIRED");
      }
      if (
        !["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "OPENING_BALANCE_IN"].includes(
          original.movementType
        )
      ) {
        throw new Error("STOCK_ADJUSTMENT_REVERSAL_ORIGINAL_MOVEMENT_INVALID");
      }
      if (
        original.tenantId !== session.context.tenantId ||
        original.companyId !== session.context.companyId ||
        original.inventoryLocationId !== line.inventoryLocationId ||
        original.itemId !== line.itemId ||
        original.sourceDocumentType !== "StockAdjustment" ||
        original.sourceDocumentId !== adjustment.id ||
        original.sourceDocumentLineId !== line.id
      ) {
        throw new Error("STOCK_ADJUSTMENT_REVERSAL_ORIGINAL_MOVEMENT_MISMATCH");
      }
      if (original.reversalMovements.length > 0) {
        throw new Error("STOCK_ADJUSTMENT_LINE_ALREADY_REVERSED");
      }

      const { movement } = await postInventoryMovementInTransaction(tx, session, inventoryLocationLock, {
        inventoryLocationId: original.inventoryLocationId,
        relatedInventoryLocationId: original.relatedInventoryLocationId,
        itemId: original.itemId,
        movementType: "REVERSAL",
        occurredAt: new Date(),
        enteredQuantity: Number(original.enteredQuantity),
        enteredUomId: original.enteredUomId,
        quantityDeltaBaseUom: -Number(original.quantityDeltaBaseUom),
        sourceDocumentType: "StockAdjustment",
        sourceDocumentId: adjustment.id,
        sourceDocumentLineId: line.id,
        sourceEventKey: `stock_adjustment_line:${line.id}:reverse`,
        lotNumber: original.lotNumber,
        expiryDate: original.expiryDate,
        unitCost: original.unitCost ? Number(original.unitCost) : null,
        totalCost: original.totalCost ? Number(original.totalCost) : null,
        reasonCode: "STOCK_ADJUSTMENT_REVERSAL",
        notes: values.reversalReason,
        reversalOfMovementId: original.id
      });
      originalMovementIds.push(original.id);
      reversalMovementIds.push(movement.id);
    }

    const reversedAt = new Date();
    const reversed = await tx.stockAdjustment.updateMany({
      where: {
        id: adjustment.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "REVERSING",
        reversedAt: null
      },
      data: {
        status: "REVERSED",
        reversedAt,
        reversedByUserId: session.user.id,
        reversalReason: values.reversalReason
      }
    });
    if (reversed.count !== 1) {
      throw new Error("STOCK_ADJUSTMENT_REVERSAL_STATE_CONFLICT");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "stock_adjustment.reversed",
        entityType: "StockAdjustment",
        entityId: adjustment.id,
        beforeData: { status: "POSTED" },
        afterData: { status: "REVERSED", reversedAt },
        metadata: {
          reversalReason: values.reversalReason,
          originalMovementIds,
          reversalMovementIds
        }
      }
    });
  });
}
