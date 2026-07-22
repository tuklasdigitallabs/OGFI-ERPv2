import { prisma } from "@ogfi/database";
import { z } from "zod";
import { canUseStockCounts, permissions, requirePermission } from "./authorization";
import {
  assertAuthorizedLocation,
  requireSessionContext,
  type SessionContext
} from "./context";
import type { CsvRow } from "./csv";
import { normalizeInventoryLotKey } from "./inventory";
import { getStockCountCadencePolicy } from "./policySettings";
import { nextStockAdjustmentReference } from "./stockAdjustments";

const countTypes = ["FULL", "CYCLE", "SPOT", "HIGH_VALUE", "OPENING"] as const;

const optionalDateSchema = z
  .string()
  .optional()
  .transform((value) => (value ? new Date(value) : undefined));

const scheduleStockCountSchema = z.object({
  inventoryLocationId: z.string().uuid(),
  countType: z.enum(countTypes),
  scheduledDate: optionalDateSchema,
  blindCount: z.coerce.boolean().default(true),
  freezeMovements: z.coerce.boolean().default(false)
});

const stockCountActionSchema = z.object({
  id: z.string().uuid()
});

const stockCountLineEntrySchema = z.object({
  lineId: z.string().uuid(),
  countedQuantityBaseUom: z.coerce.number().min(0),
  notes: z.string().trim().max(1000).optional()
});

const saveStockCountSchema = z.object({
  id: z.string().uuid(),
  lines: z.array(stockCountLineEntrySchema).min(1)
});

const reviewStockCountSchema = z.object({
  id: z.string().uuid(),
  reviewAction: z.enum(["REVIEW", "RECOUNT"]),
  reviewNotes: z.string().trim().min(5).max(1000)
});

const cancelStockCountSchema = z.object({
  id: z.string().uuid(),
  cancellationReason: z.string().trim().min(5).max(500)
});

export function assertStockCountCanStart(status: string) {
  if (status !== "DRAFT") {
    throw new Error("STOCK_COUNT_NOT_DRAFT_FOR_START");
  }
}

export function assertStockCountCanEnter(status: string) {
  if (status !== "IN_PROGRESS" && status !== "RECOUNT_REQUESTED") {
    throw new Error("STOCK_COUNT_NOT_OPEN_FOR_ENTRY");
  }
}

export function assertStockCountCanSubmit(status: string) {
  if (status !== "IN_PROGRESS" && status !== "RECOUNT_REQUESTED") {
    throw new Error("STOCK_COUNT_NOT_OPEN_FOR_SUBMIT");
  }
}

export function assertStockCountCanReview(status: string) {
  if (status !== "SUBMITTED") {
    throw new Error("STOCK_COUNT_NOT_SUBMITTED_FOR_REVIEW");
  }
}

export function assertStockCountReviewerSegregation(input: {
  reviewerUserId: string;
  createdByUserId: string;
  countedByUserIds: Array<string | null>;
}) {
  if (input.reviewerUserId === input.createdByUserId) {
    throw new Error("STOCK_COUNT_SELF_REVIEW_BLOCKED");
  }
  if (input.countedByUserIds.includes(input.reviewerUserId)) {
    throw new Error("STOCK_COUNT_SELF_REVIEW_BLOCKED");
  }
}

export function assertStockCountCanGenerateAdjustment(status: string) {
  if (status !== "REVIEWED") {
    throw new Error("STOCK_COUNT_NOT_REVIEWED_FOR_ADJUSTMENT");
  }
}

export function assertStockCountCanCancel(status: string) {
  if (status === "REVIEWED" || status === "CANCELLED") {
    throw new Error("STOCK_COUNT_NOT_CANCELLABLE");
  }
}

export function calculateCountVariance(
  countedQuantityBaseUom: number,
  systemQuantityBaseUom: number
) {
  if (!Number.isFinite(countedQuantityBaseUom) || countedQuantityBaseUom < 0) {
    throw new Error("STOCK_COUNT_QUANTITY_INVALID");
  }
  return countedQuantityBaseUom - systemQuantityBaseUom;
}

export function filterCountVarianceLines<
  T extends {
    countedQuantityBaseUom: unknown;
    varianceQuantityBaseUom: unknown;
  }
>(lines: T[]) {
  if (lines.some((line) => line.countedQuantityBaseUom === null)) {
    throw new Error("STOCK_COUNT_HAS_UNCOUNTED_LINES");
  }
  return lines.filter(
    (line) => Number(line.varianceQuantityBaseUom ?? 0) !== 0
  );
}

export function recommendedStockCountCadenceDays(
  countType: string,
  policy: {
    standardFrequencyDays: number;
    highRiskFrequencyDays: number;
  }
) {
  return countType === "HIGH_VALUE"
    ? policy.highRiskFrequencyDays
    : policy.standardFrequencyDays;
}

async function nextStockCountReference(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.stockCountSession.count({
    where: {
      companyId,
      publicReference: { startsWith: `SC-${year}-` }
    }
  });
  return `SC-${year}-${String(count + 1).padStart(5, "0")}`;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function requireStockCountRead(session: SessionContext) {
  if (!canUseStockCounts(session.permissionCodes)) {
    await requirePermission(session, permissions.stockCountView);
  }
}

function scopedStockCountWhere(session: SessionContext, id?: string) {
  return {
    ...(id ? { id } : {}),
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    inventoryLocation: {
      locationId: session.context.locationId
    }
  };
}

const stockCountDashboardTaskCandidateLimit = 8;
const stockCountDashboardActionStatuses = [
  "SUBMITTED",
  "REVIEWED",
  "RECOUNT_REQUESTED"
];

export type StockCountDashboardRead = {
  varianceCount: number;
  taskCandidates: Array<{
    id: string;
    publicReference: string;
    status: string;
    inventoryLocationName: string;
    varianceLineCount: number;
    createdAt: string;
  }>;
};

/**
 * Keeps dashboard work bounded to count sessions with a reviewable variance;
 * blind-count values and line detail never leave the counts workspace here.
 */
export async function getStockCountDashboardRead(
  session: SessionContext
): Promise<StockCountDashboardRead> {
  await requirePermission(session, permissions.stockCountReview);

  const varianceWhere = {
    ...scopedStockCountWhere(session),
    status: { in: stockCountDashboardActionStatuses },
    lines: { some: { varianceQuantityBaseUom: { not: 0 } } }
  };
  const [varianceCount, candidates] = await Promise.all([
    prisma.stockCountSession.count({ where: varianceWhere }),
    prisma.stockCountSession.findMany({
      where: varianceWhere,
      select: {
        id: true,
        publicReference: true,
        status: true,
        createdAt: true,
        inventoryLocation: { select: { name: true } },
        _count: {
          select: {
            lines: { where: { varianceQuantityBaseUom: { not: 0 } } }
          }
        }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: stockCountDashboardTaskCandidateLimit
    })
  ]);

  return {
    varianceCount,
    taskCandidates: candidates.map((count) => ({
      id: count.id,
      publicReference: count.publicReference,
      status: count.status,
      inventoryLocationName: count.inventoryLocation.name,
      varianceLineCount: count._count.lines,
      createdAt: count.createdAt.toISOString()
    }))
  };
}

export async function listStockCountFormOptions(session: SessionContext) {
  await requirePermission(session, permissions.stockCountCreate);
  const cadencePolicy = await getStockCountCadencePolicy(session);

  const inventoryLocations = await prisma.inventoryLocation.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: session.context.locationId,
      status: "ACTIVE"
    },
    orderBy: { name: "asc" }
  });

  return {
    inventoryLocations: inventoryLocations.map((location) => ({
      id: location.id,
      name: location.name
    })),
    countTypes: countTypes.map((countType) => ({
      value: countType,
      label: countType.replaceAll("_", " "),
      recommendedCadenceDays: recommendedStockCountCadenceDays(countType, cadencePolicy)
    })),
    cadencePolicy
  };
}

export async function listStockCounts(session: SessionContext) {
  await requireStockCountRead(session);
  const cadencePolicy = await getStockCountCadencePolicy(session);
  const canReviewStockCounts = session.permissionCodes.includes(
    permissions.stockCountReview
  );

  const counts = await prisma.stockCountSession.findMany({
    where: scopedStockCountWhere(session),
    include: {
      inventoryLocation: true,
      createdBy: true,
      assignedTo: true,
      reviewedBy: true,
      lines: true
    },
    orderBy: [{ createdAt: "desc" }]
  });

  return counts.map((count) => ({
    id: count.id,
    publicReference: count.publicReference,
    status: count.status,
    countType: count.countType,
    inventoryLocationName: count.inventoryLocation.name,
    createdByName: count.createdBy.displayName,
    assignedToName: count.assignedTo?.displayName ?? null,
    reviewedByName: count.reviewedBy?.displayName ?? null,
    scheduledDate: count.scheduledDate?.toISOString().slice(0, 10) ?? null,
    recommendedCadenceDays: recommendedStockCountCadenceDays(
      count.countType,
      cadencePolicy
    ),
    cutoffAt: count.cutoffAt?.toISOString() ?? null,
    submittedAt: count.submittedAt?.toISOString() ?? null,
    lineCount: count.lines.length,
    varianceCount: canReviewStockCounts
      ? count.lines.filter(
          (line) => Number(line.varianceQuantityBaseUom ?? 0) !== 0
        ).length
      : null
  }));
}

export async function buildStockCountExportRows(session: SessionContext) {
  await requireStockCountRead(session);
  const canShowSystemQuantity = session.permissionCodes.includes(
    permissions.stockCountReview
  );

  const counts = await prisma.stockCountSession.findMany({
    where: scopedStockCountWhere(session),
    include: {
      inventoryLocation: true,
      createdBy: true,
      assignedTo: true,
      reviewedBy: true,
      stockAdjustments: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true,
          countedBy: true
        }
      }
    },
    orderBy: [{ createdAt: "desc" }]
  });

  const rows: CsvRow[] = [
    [
      "Reference",
      "Status",
      "Count Type",
      "Inventory Location",
      "Created By",
      "Assigned To",
      "Reviewed By",
      "Scheduled Date",
      "Cutoff At",
      "Submitted At",
      "Reviewed At",
      "Variance Adjustment",
      "Variance Adjustment Status",
      "Line",
      "Item Code",
      "Item Name",
      "UOM",
      "Lot",
      "Expiry",
      "System Qty",
      "Counted Qty",
      "Variance Qty",
      "Line Notes",
      "Counted By",
      "Counted At"
    ]
  ];

  for (const count of counts) {
    const adjustment = count.stockAdjustments[0];
    const sharedColumns: CsvRow = [
      count.publicReference,
      count.status,
      count.countType,
      count.inventoryLocation.name,
      count.createdBy.displayName,
      count.assignedTo?.displayName ?? "",
      count.reviewedBy?.displayName ?? "",
      count.scheduledDate?.toISOString().slice(0, 10) ?? "",
      count.cutoffAt?.toISOString() ?? "",
      count.submittedAt?.toISOString() ?? "",
      count.reviewedAt?.toISOString() ?? "",
      adjustment?.publicReference ?? "",
      adjustment?.status ?? ""
    ];

    if (count.lines.length === 0) {
      rows.push([...sharedColumns, "", "", "", "", "", "", "", "", "", "", "", ""]);
      continue;
    }

    for (const line of count.lines) {
      rows.push([
        ...sharedColumns,
        line.lineNumber,
        line.item.itemCode,
        line.item.itemName,
        line.uom.uomCode,
        line.lotNumber ?? "",
        line.expiryDate?.toISOString().slice(0, 10) ?? "",
        canShowSystemQuantity ? Number(line.systemQuantityBaseUom) : "",
        line.countedQuantityBaseUom === null
          ? ""
          : Number(line.countedQuantityBaseUom),
        canShowSystemQuantity && line.varianceQuantityBaseUom !== null
          ? Number(line.varianceQuantityBaseUom)
          : "",
        line.notes ?? "",
        line.countedBy?.displayName ?? "",
        line.countedAt?.toISOString() ?? ""
      ]);
    }
  }

  return rows;
}

export async function getStockCount(session: SessionContext, id: string) {
  await requireStockCountRead(session);

  const count = await prisma.stockCountSession.findFirst({
    where: scopedStockCountWhere(session, id),
    include: {
      inventoryLocation: {
        include: {
          location: true
        }
      },
      createdBy: true,
      assignedTo: true,
      reviewedBy: true,
      stockAdjustments: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true,
          countedBy: true
        }
      }
    }
  });

  if (!count) {
    return null;
  }

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      entityType: "StockCountSession",
      entityId: count.id
    },
    orderBy: { occurredAt: "asc" }
  });

  const canShowSystemQuantity = session.permissionCodes.includes(
    permissions.stockCountReview
  );

  return {
    id: count.id,
    publicReference: count.publicReference,
    status: count.status,
    countType: count.countType,
    blindCount: count.blindCount,
    freezeMovements: count.freezeMovements,
    inventoryLocationId: count.inventoryLocationId,
    inventoryLocationName: count.inventoryLocation.name,
    locationName: count.inventoryLocation.location.name,
    createdByName: count.createdBy.displayName,
    assignedToName: count.assignedTo?.displayName ?? null,
    reviewedByName: count.reviewedBy?.displayName ?? null,
    scheduledDate: count.scheduledDate?.toISOString().slice(0, 10) ?? null,
    cutoffAt: count.cutoffAt?.toISOString() ?? null,
    startedAt: count.startedAt?.toISOString() ?? null,
    submittedAt: count.submittedAt?.toISOString() ?? null,
    reviewedAt: count.reviewedAt?.toISOString() ?? null,
    cancelledAt: count.cancelledAt?.toISOString() ?? null,
    cancellationReason: count.cancellationReason ?? null,
    reviewNotes: canShowSystemQuantity ? count.reviewNotes ?? null : null,
    varianceAdjustmentId: count.stockAdjustments[0]?.id ?? null,
    varianceAdjustmentReference:
      count.stockAdjustments[0]?.publicReference ?? null,
    varianceAdjustmentStatus: count.stockAdjustments[0]?.status ?? null,
    canShowSystemQuantity,
    lines: count.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      itemCode: line.item.itemCode,
      itemName: line.item.itemName,
      uomCode: line.uom.uomCode,
      lotNumber: line.lotNumber ?? null,
      expiryDate: line.expiryDate?.toISOString().slice(0, 10) ?? null,
      systemQuantityBaseUom: canShowSystemQuantity
        ? Number(line.systemQuantityBaseUom)
        : null,
      countedQuantityBaseUom:
        line.countedQuantityBaseUom === null
          ? null
          : Number(line.countedQuantityBaseUom),
      varianceQuantityBaseUom:
        canShowSystemQuantity && line.varianceQuantityBaseUom !== null
          ? Number(line.varianceQuantityBaseUom)
          : null,
      notes: line.notes ?? null,
      countedByName: line.countedBy?.displayName ?? null,
      countedAt: line.countedAt?.toISOString() ?? null
    })),
    auditEvents: canShowSystemQuantity
      ? auditEvents.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          occurredAt: event.occurredAt.toISOString(),
          metadata: event.metadata
        }))
      : []
  };
}

export async function scheduleStockCount(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockCountCreate);
  const values = scheduleStockCountSchema.parse(Object.fromEntries(formData));
  const cadencePolicy = await getStockCountCadencePolicy(session);
  const recommendedCadenceDays = recommendedStockCountCadenceDays(
    values.countType,
    cadencePolicy
  );

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
    throw new Error("STOCK_COUNT_INVENTORY_LOCATION_NOT_FOUND");
  }
  assertAuthorizedLocation(session, inventoryLocation.locationId);

  let countId: string | null = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const count = await prisma.stockCountSession.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: inventoryLocation.id,
          publicReference: await nextStockCountReference(session.context.companyId),
          countType: values.countType,
          scheduledDate: values.scheduledDate ?? null,
          blindCount: values.blindCount,
          freezeMovements: values.freezeMovements,
          createdByUserId: session.user.id,
          assignedToUserId: session.user.id
        }
      });
      countId = count.id;
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 5) {
        throw error;
      }
    }
  }

  if (!countId) {
    throw new Error("STOCK_COUNT_REFERENCE_ALLOCATION_FAILED");
  }

  await prisma.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      actorUserId: session.user.id,
      eventType: "stock_count.scheduled",
      entityType: "StockCountSession",
      entityId: countId,
      afterData: { status: "DRAFT" },
      metadata: {
        inventoryLocationId: inventoryLocation.id,
        countType: values.countType,
        recommendedCadenceDays,
        cadencePolicy
      }
    }
  });

  return countId;
}

export async function startStockCount(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockCountEnter);
  const values = stockCountActionSchema.parse(Object.fromEntries(formData));

  const count = await prisma.stockCountSession.findFirst({
    where: scopedStockCountWhere(session, values.id),
    include: {
      inventoryLocation: true
    }
  });
  if (!count) {
    throw new Error("STOCK_COUNT_NOT_FOUND");
  }
  assertStockCountCanStart(count.status);

  const now = new Date();
  const balances = await prisma.inventoryBalance.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      inventoryLocationId: count.inventoryLocationId
    },
    include: {
      item: true
    },
    orderBy: [{ item: { itemName: "asc" } }, { expiryDate: "asc" }]
  });

  await prisma.$transaction(async (tx) => {
    const started = await tx.stockCountSession.updateMany({
      where: {
        id: count.id,
        status: "DRAFT"
      },
      data: {
        status: "IN_PROGRESS",
        startedAt: now,
        cutoffAt: now
      }
    });
    if (started.count !== 1) {
      throw new Error("STOCK_COUNT_NOT_DRAFT_FOR_START");
    }

    if (balances.length > 0) {
      await tx.stockCountLine.createMany({
        data: balances.map((balance, index) => ({
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          stockCountSessionId: count.id,
          inventoryLocationId: count.inventoryLocationId,
          itemId: balance.itemId,
          uomId: balance.baseUomId,
          lineNumber: index + 1,
          lotKey: balance.lotKey,
          lotNumber: balance.lotNumber,
          expiryDate: balance.expiryDate,
          systemQuantityBaseUom: balance.qtyOnHand
        })),
        skipDuplicates: true
      });
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "stock_count.started",
        entityType: "StockCountSession",
        entityId: count.id,
        beforeData: { status: "DRAFT" },
        afterData: { status: "IN_PROGRESS" },
        metadata: {
          cutoffAt: now.toISOString(),
          snapshotLineCount: balances.length
        }
      }
    });
  });
}

export async function saveStockCountEntries(rawValues: unknown) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockCountEnter);
  const values = saveStockCountSchema.parse(rawValues);

  const count = await prisma.stockCountSession.findFirst({
    where: scopedStockCountWhere(session, values.id),
    include: {
      lines: true
    }
  });
  if (!count) {
    throw new Error("STOCK_COUNT_NOT_FOUND");
  }
  assertStockCountCanEnter(count.status);

  const linesById = new Map(count.lines.map((line) => [line.id, line]));
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const entry of values.lines) {
      const line = linesById.get(entry.lineId);
      if (!line) {
        throw new Error("STOCK_COUNT_LINE_NOT_FOUND");
      }
      const variance = calculateCountVariance(
        entry.countedQuantityBaseUom,
        Number(line.systemQuantityBaseUom)
      );
      await tx.stockCountLine.update({
        where: { id: entry.lineId },
        data: {
          countedQuantityBaseUom: entry.countedQuantityBaseUom,
          varianceQuantityBaseUom: variance,
          notes: entry.notes || null,
          countedByUserId: session.user.id,
          countedAt: now
        }
      });
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "stock_count.entries_saved",
        entityType: "StockCountSession",
        entityId: count.id,
        metadata: { lineCount: values.lines.length }
      }
    });
  });
}

export async function submitStockCount(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockCountSubmit);
  const values = stockCountActionSchema.parse(Object.fromEntries(formData));

  const count = await prisma.stockCountSession.findFirst({
    where: scopedStockCountWhere(session, values.id),
    include: { lines: true }
  });
  if (!count) {
    throw new Error("STOCK_COUNT_NOT_FOUND");
  }
  assertStockCountCanSubmit(count.status);
  if (count.lines.length === 0) {
    throw new Error("STOCK_COUNT_HAS_NO_LINES");
  }
  if (count.lines.some((line) => line.countedQuantityBaseUom === null)) {
    throw new Error("STOCK_COUNT_HAS_UNCOUNTED_LINES");
  }

  await prisma.$transaction(async (tx) => {
    const submitted = await tx.stockCountSession.updateMany({
      where: {
        id: count.id,
        status: { in: ["IN_PROGRESS", "RECOUNT_REQUESTED"] }
      },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date()
      }
    });
    if (submitted.count !== 1) {
      throw new Error("STOCK_COUNT_NOT_OPEN_FOR_SUBMIT");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "stock_count.submitted",
        entityType: "StockCountSession",
        entityId: count.id,
        beforeData: { status: count.status },
        afterData: { status: "SUBMITTED" }
      }
    });
  });
}

export async function reviewStockCount(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockCountReview);
  const values = reviewStockCountSchema.parse(Object.fromEntries(formData));

  const count = await prisma.stockCountSession.findFirst({
    where: scopedStockCountWhere(session, values.id),
    include: {
      lines: {
        select: { countedByUserId: true }
      }
    }
  });
  if (!count) {
    throw new Error("STOCK_COUNT_NOT_FOUND");
  }
  assertStockCountCanReview(count.status);
  assertStockCountReviewerSegregation({
    reviewerUserId: session.user.id,
    createdByUserId: count.createdByUserId,
    countedByUserIds: count.lines.map((line) => line.countedByUserId)
  });

  const nextStatus =
    values.reviewAction === "RECOUNT" ? "RECOUNT_REQUESTED" : "REVIEWED";
  await prisma.$transaction(async (tx) => {
    const reviewed = await tx.stockCountSession.updateMany({
      where: {
        id: count.id,
        status: "SUBMITTED"
      },
      data: {
        status: nextStatus,
        reviewedAt: new Date(),
        reviewedByUserId: session.user.id,
        reviewNotes: values.reviewNotes
      }
    });
    if (reviewed.count !== 1) {
      throw new Error("STOCK_COUNT_NOT_SUBMITTED_FOR_REVIEW");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType:
          values.reviewAction === "RECOUNT"
            ? "stock_count.recount_requested"
            : "stock_count.reviewed",
        entityType: "StockCountSession",
        entityId: count.id,
        beforeData: { status: "SUBMITTED" },
        afterData: { status: nextStatus },
        metadata: { reviewNotes: values.reviewNotes }
      }
    });
  });
}

export async function cancelStockCount(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockCountCancel);
  const values = cancelStockCountSchema.parse(Object.fromEntries(formData));

  const count = await prisma.stockCountSession.findFirst({
    where: scopedStockCountWhere(session, values.id)
  });
  if (!count) {
    throw new Error("STOCK_COUNT_NOT_FOUND");
  }
  assertStockCountCanCancel(count.status);

  await prisma.$transaction(async (tx) => {
    const cancelled = await tx.stockCountSession.updateMany({
      where: {
        id: count.id,
        status: { notIn: ["REVIEWED", "CANCELLED"] }
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: values.cancellationReason
      }
    });
    if (cancelled.count !== 1) {
      throw new Error("STOCK_COUNT_NOT_CANCELLABLE");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "stock_count.cancelled",
        entityType: "StockCountSession",
        entityId: count.id,
        beforeData: { status: count.status },
        afterData: { status: "CANCELLED" },
        metadata: { reason: values.cancellationReason }
      }
    });
  });
}

export async function generateStockCountVarianceAdjustment(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockAdjustmentCreate);
  const values = stockCountActionSchema.parse(Object.fromEntries(formData));

  const count = await prisma.stockCountSession.findFirst({
    where: scopedStockCountWhere(session, values.id),
    include: {
      inventoryLocation: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true
        }
      },
      stockAdjustments: {
        where: {
          sourceStockCountSessionId: values.id
        },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });
  if (!count) {
    throw new Error("STOCK_COUNT_NOT_FOUND");
  }
  assertAuthorizedLocation(session, count.inventoryLocation.locationId);
  assertStockCountCanGenerateAdjustment(count.status);

  const existingAdjustment = count.stockAdjustments[0];
  if (existingAdjustment) {
    return existingAdjustment.id;
  }

  const varianceLines = filterCountVarianceLines(count.lines);
  if (varianceLines.length === 0) {
    throw new Error("STOCK_COUNT_HAS_NO_VARIANCE_LINES");
  }

  let adjustmentId: string | null = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const adjustment = await prisma.$transaction(async (tx) => {
        const existing = await tx.stockAdjustment.findFirst({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            sourceStockCountSessionId: count.id
          },
          select: { id: true }
        });
        if (existing) {
          return existing;
        }

        const created = await tx.stockAdjustment.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            inventoryLocationId: count.inventoryLocationId,
            publicReference: await nextStockAdjustmentReference(
              session.context.companyId
            ),
            requestedByUserId: session.user.id,
            adjustmentType: "COUNT_VARIANCE",
            reasonCode: "COUNT_VARIANCE",
            reasonDescription: `Stock count variance generated from ${count.publicReference}`,
            sourceDocumentType: "StockCountSession",
            sourceDocumentId: count.id,
            sourceStockCountSessionId: count.id,
            totalEstimatedValueImpact: 0
          }
        });

        await tx.stockAdjustmentLine.createMany({
          data: varianceLines.map((line, index) => {
            const quantityDeltaBaseUom = Number(line.varianceQuantityBaseUom);
            const lotKey = normalizeInventoryLotKey(
              line.lotNumber,
              line.expiryDate
            );

            return {
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              stockAdjustmentId: created.id,
              inventoryLocationId: count.inventoryLocationId,
              itemId: line.itemId,
              uomId: line.uomId,
              lineNumber: index + 1,
              lotKey,
              lotNumber: line.lotNumber ?? null,
              expiryDate: line.expiryDate ?? null,
              systemQuantityBaseUom: line.systemQuantityBaseUom,
              quantityDeltaBaseUom,
              unitCost: 0,
              estimatedValueImpact: 0,
              reasonCode: "COUNT_VARIANCE",
              notes:
                line.notes ??
                `Counted ${Number(line.countedQuantityBaseUom)} ${line.uom.uomCode}`,
              sourceStockCountLineId: line.id
            };
          })
        });

        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType: "stock_count.variance_adjustment_generated",
            entityType: "StockCountSession",
            entityId: count.id,
            metadata: {
              adjustmentId: created.id,
              lineCount: varianceLines.length,
              nonPostingAdjustment: true
            }
          }
        });

        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType: "stock_adjustment.created_from_stock_count",
            entityType: "StockAdjustment",
            entityId: created.id,
            afterData: { status: "DRAFT" },
            metadata: {
              stockCountSessionId: count.id,
              stockCountReference: count.publicReference,
              lineCount: varianceLines.length,
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
