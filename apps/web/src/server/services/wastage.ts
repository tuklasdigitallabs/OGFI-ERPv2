import { prisma } from "@ogfi/database";
import { z } from "zod";
import { WASTAGE_MAX_LINES } from "../../lib/workflowLimits";
import { canUseWastageReports, permissions, requirePermission } from "./authorization";
import {
  assertAuthorizedLocation,
  requireSessionContext,
  type SessionContext
} from "./context";
import { postInventoryMovementInTransaction } from "./inventory";
import {
  recordWorkflowNotifications,
  resolveScopedNotificationRecipients
} from "./notifications";
import {
  listActiveOperationalReasonCodes,
  requireActiveOperationalReasonCode
} from "./operationalReasonCodes";
import {
  getInventoryLotExpiryPolicy,
  inventoryItemLotExpiryRequirements
} from "./policySettings";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";

const wastageTypes = [
  "SPOILAGE_EXPIRY",
  "RECEIVING_QUALITY",
  "PREPARATION_LOSS",
  "DAMAGE",
  "AUTHORIZED_CONSUMPTION",
  "CUSTOMER_SERVICE",
  "OPERATIONAL",
  "OTHER"
] as const;

const optionalDateSchema = z
  .string()
  .optional()
  .transform((value) => (value ? new Date(value) : undefined));

const createWastageReportSchema = z.object({
  inventoryLocationId: z.string().uuid(),
  wastageType: z.enum(wastageTypes),
  reasonCode: z.string().trim().min(2).max(80),
  evidenceReference: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1000).optional()
});

const createWastageLineSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  estimatedUnitCost: z.coerce.number().min(0).default(0),
  lotNumber: z.string().trim().max(120).optional(),
  expiryDate: optionalDateSchema,
  evidenceReference: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1000).optional()
});

const wastageActionSchema = z.object({
  id: z.string().uuid()
});

const reviewWastageSchema = z.object({
  id: z.string().uuid(),
  reviewAction: z.enum(["REVIEW", "RETURN", "REJECT"]),
  reviewNotes: z.string().trim().min(5).max(1000)
});

const cancelWastageSchema = z.object({
  id: z.string().uuid(),
  cancellationReason: z.string().trim().min(5).max(500)
});

const reverseWastageSchema = z.object({
  id: z.string().uuid(),
  reversalReason: z.string().trim().min(5).max(1000)
});

const wastagePolicyFlagLabels: Record<string, string> = {
  CATEGORY_PHOTO_REQUIRED: "Category photo required",
  HIGH_VALUE: "High-value wastage",
  EVIDENCE_REQUIRED: "Evidence required",
  EVIDENCE_MISSING: "Evidence missing",
  REPEAT_ITEM_LOCATION: "Repeat item/location pattern",
  REPEAT_REPORTER: "Repeat reporter pattern"
};

type WastagePolicyInput = {
  id: string;
  name: string;
  policyVersion: string;
  minimumEstimatedCost: number | null;
  requiresEvidence: boolean;
  repeatLookbackDays: number;
  repeatItemLocationCount: number;
  repeatReporterCount: number;
};

type WastagePolicyEvaluationInput = {
  policy: WastagePolicyInput | null;
  totalEstimatedCost: number;
  evidenceReference: string | null | undefined;
  categoryPhotoRequired: boolean;
  repeatItemLocationPriorCount: number;
  repeatReporterPriorCount: number;
};

type WastageLineDraft = {
  lineNumber: number;
  item: {
    id: string;
    itemName: string;
    baseUomId: string;
  };
  quantity: number;
  estimatedUnitCost: number;
  estimatedTotalCost: number;
  photoRequired: boolean;
  evidenceReference: string | null;
  lotNumber: string | null;
  expiryDate: Date | null;
  notes: string | null;
};

export function buildWastagePolicyEvaluation({
  policy,
  totalEstimatedCost,
  evidenceReference,
  categoryPhotoRequired,
  repeatItemLocationPriorCount,
  repeatReporterPriorCount
}: WastagePolicyEvaluationInput) {
  const flags = new Set<string>();
  const minimumEstimatedCost = policy?.minimumEstimatedCost ?? null;
  const highValue =
    minimumEstimatedCost !== null && totalEstimatedCost >= minimumEstimatedCost;

  if (categoryPhotoRequired) {
    flags.add("CATEGORY_PHOTO_REQUIRED");
  }
  if (highValue) {
    flags.add("HIGH_VALUE");
  }

  const repeatItemLocationThreshold = policy?.repeatItemLocationCount ?? null;
  const repeatReporterThreshold = policy?.repeatReporterCount ?? null;
  if (
    repeatItemLocationThreshold !== null &&
    repeatItemLocationPriorCount + 1 >= repeatItemLocationThreshold
  ) {
    flags.add("REPEAT_ITEM_LOCATION");
  }
  if (
    repeatReporterThreshold !== null &&
    repeatReporterPriorCount + 1 >= repeatReporterThreshold
  ) {
    flags.add("REPEAT_REPORTER");
  }

  const evidenceRequired = categoryPhotoRequired || Boolean(policy?.requiresEvidence);
  const evidenceSatisfied = !evidenceRequired || Boolean(evidenceReference);
  if (evidenceRequired) {
    flags.add("EVIDENCE_REQUIRED");
  }
  if (!evidenceSatisfied) {
    flags.add("EVIDENCE_MISSING");
  }

  return {
    flags: Array.from(flags),
    flagLabels: Array.from(flags).map((flag) => wastagePolicyFlagLabels[flag] ?? flag),
    evidenceRequired,
    evidenceSatisfied,
    policySnapshot: {
      policyId: policy?.id ?? null,
      policyName: policy?.name ?? null,
      policyVersion: policy?.policyVersion ?? null,
      minimumEstimatedCost,
      requiresEvidence: policy?.requiresEvidence ?? false,
      repeatLookbackDays: policy?.repeatLookbackDays ?? null,
      repeatItemLocationCount: repeatItemLocationThreshold,
      repeatReporterCount: repeatReporterThreshold,
      totalEstimatedCost,
      categoryPhotoRequired,
      repeatItemLocationPriorCount,
      repeatReporterPriorCount,
      evaluatedAt: new Date().toISOString()
    }
  };
}

function parseWastagePolicyFlags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((flag): flag is string => typeof flag === "string");
}

function formatWastagePolicyFlagLabels(value: unknown) {
  return parseWastagePolicyFlags(value).map(
    (flag) => wastagePolicyFlagLabels[flag] ?? flag
  );
}

export function assertWastageQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("WASTAGE_QUANTITY_INVALID");
  }
}

export function assertWastageCanSubmit(status: string) {
  if (status !== "DRAFT" && status !== "RETURNED") {
    throw new Error("WASTAGE_NOT_OPEN_FOR_SUBMIT");
  }
}

export function assertWastageCanReview(status: string) {
  if (status !== "SUBMITTED") {
    throw new Error("WASTAGE_NOT_SUBMITTED_FOR_REVIEW");
  }
}

export function assertWastageCanPost(status: string, postedAt?: unknown) {
  if (status === "POSTED" || postedAt) {
    throw new Error("WASTAGE_ALREADY_POSTED");
  }
  if (status !== "APPROVED") {
    throw new Error("WASTAGE_NOT_APPROVED_FOR_POSTING");
  }
}

export function assertWastageCanReverse(status: string, reversedAt?: unknown) {
  if (status === "REVERSED" || reversedAt) {
    throw new Error("WASTAGE_ALREADY_REVERSED");
  }
  if (status !== "POSTED") {
    throw new Error("WASTAGE_NOT_POSTED_FOR_REVERSAL");
  }
}

export function assertWastageCanCancel(status: string) {
  if (
    status !== "DRAFT" &&
    status !== "SUBMITTED" &&
    status !== "PENDING_APPROVAL" &&
    status !== "RETURNED"
  ) {
    throw new Error("WASTAGE_NOT_CANCELLABLE");
  }
}

async function nextWastageReference(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.wastageReport.count({
    where: {
      companyId,
      publicReference: { startsWith: `WR-${year}-` }
    }
  });
  return `WR-${year}-${String(count + 1).padStart(5, "0")}`;
}

async function evaluateWastagePolicy(input: {
  session: SessionContext;
  inventoryLocationId: string;
  itemId: string;
  wastageType: string;
  reasonCode: string;
  evidenceReference?: string | null;
  estimatedTotalCost: number;
  categoryPhotoRequired: boolean;
}) {
  const policy = await prisma.wastagePolicy.findFirst({
    where: {
      tenantId: input.session.context.tenantId,
      companyId: input.session.context.companyId,
      isActive: true,
      AND: [
        {
          OR: [
            { inventoryLocationId: null },
            { inventoryLocationId: input.inventoryLocationId }
          ]
        },
        {
          OR: [{ wastageType: null }, { wastageType: input.wastageType }]
        },
        {
          OR: [{ reasonCode: null }, { reasonCode: input.reasonCode }]
        },
        {
          OR: [
            { minimumEstimatedCost: null },
            { minimumEstimatedCost: { lte: input.estimatedTotalCost } }
          ]
        }
      ]
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      policyVersion: true,
      minimumEstimatedCost: true,
      requiresEvidence: true,
      repeatLookbackDays: true,
      repeatItemLocationCount: true,
      repeatReporterCount: true
    }
  });

  let repeatItemLocationPriorCount = 0;
  let repeatReporterPriorCount = 0;
  if (policy) {
    const lookbackStart = new Date(
      Date.now() - policy.repeatLookbackDays * 24 * 60 * 60 * 1000
    );
    [repeatItemLocationPriorCount, repeatReporterPriorCount] = await Promise.all([
      prisma.wastageLine.count({
        where: {
          tenantId: input.session.context.tenantId,
          companyId: input.session.context.companyId,
          inventoryLocationId: input.inventoryLocationId,
          itemId: input.itemId,
          createdAt: { gte: lookbackStart },
          wastageReport: {
            status: { notIn: ["CANCELLED", "REJECTED"] }
          }
        }
      }),
      prisma.wastageReport.count({
        where: {
          tenantId: input.session.context.tenantId,
          companyId: input.session.context.companyId,
          inventoryLocationId: input.inventoryLocationId,
          reportedByUserId: input.session.user.id,
          createdAt: { gte: lookbackStart },
          status: { notIn: ["CANCELLED", "REJECTED"] }
        }
      })
    ]);
  }

  return buildWastagePolicyEvaluation({
    policy: policy
      ? {
          ...policy,
          minimumEstimatedCost: policy.minimumEstimatedCost
            ? Number(policy.minimumEstimatedCost)
            : null
        }
      : null,
    totalEstimatedCost: input.estimatedTotalCost,
    evidenceReference: input.evidenceReference,
    categoryPhotoRequired: input.categoryPhotoRequired,
    repeatItemLocationPriorCount,
    repeatReporterPriorCount
  });
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function requireWastageRead(session: SessionContext) {
  if (!canUseWastageReports(session.permissionCodes)) {
    await requirePermission(session, permissions.wastageView);
  }
}

function scopedWastageWhere(session: SessionContext, id?: string) {
  return {
    ...(id ? { id } : {}),
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    inventoryLocation: {
      locationId: session.context.locationId
    }
  };
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

function parseWastageLines(formData: FormData) {
  const itemIds = requiredFormValues(formData, "lineItemId");
  const quantities = requiredFormValues(formData, "lineQuantity");
  const estimatedUnitCosts = optionalFormValues(
    formData,
    "lineEstimatedUnitCost",
    itemIds.length
  );
  const lotNumbers = optionalFormValues(formData, "lineLotNumber", itemIds.length);
  const expiryDates = optionalFormValues(formData, "lineExpiryDate", itemIds.length);
  const evidenceReferences = optionalFormValues(
    formData,
    "lineEvidenceReference",
    itemIds.length
  );
  const notes = optionalFormValues(formData, "lineNotes", itemIds.length);

  if (itemIds.length === 0) {
    throw new Error("WASTAGE_REPORT_HAS_NO_LINES");
  }
  if (itemIds.length > WASTAGE_MAX_LINES) {
    throw new Error("WASTAGE_TOO_MANY_LINES");
  }
  if (quantities.length !== itemIds.length) {
    throw new Error("WASTAGE_LINE_REQUIRED");
  }

  return itemIds.map((itemId, index) =>
    createWastageLineSchema.parse({
      itemId,
      quantity: quantities[index],
      estimatedUnitCost: estimatedUnitCosts[index] || "0",
      lotNumber: lotNumbers[index] || undefined,
      expiryDate: expiryDates[index] || undefined,
      evidenceReference: evidenceReferences[index] || undefined,
      notes: notes[index] || undefined
    })
  );
}

export async function listWastageFormOptions(session: SessionContext) {
  await requirePermission(session, permissions.wastageCreate);

  const [inventoryLocations, items, reasonCodes] = await Promise.all([
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
        baseUom: true,
        category: true
      },
      orderBy: { itemName: "asc" }
    }),
    listActiveOperationalReasonCodes(session, "WASTAGE")
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
      trackExpiry: item.trackExpiry,
      defaultWastageRequiresPhoto: item.category.defaultWastageRequiresPhoto
    })),
    wastageTypes,
    reasonCodes
  };
}

export async function listWastageReports(session: SessionContext) {
  await requireWastageRead(session);

  const reports = await prisma.wastageReport.findMany({
    where: scopedWastageWhere(session),
    include: {
      inventoryLocation: true,
      reportedBy: true,
      reviewedBy: true,
      postedBy: true,
      reversedBy: true,
      lines: true
    },
    orderBy: { createdAt: "desc" }
  });

  return reports.map((report) => ({
    id: report.id,
    publicReference: report.publicReference,
    status: report.status,
    wastageType: report.wastageType,
    reasonCode: report.reasonCode,
    inventoryLocationName: report.inventoryLocation.name,
    reportedByName: report.reportedBy.displayName,
    reviewedByName: report.reviewedBy?.displayName ?? null,
    postedByName: report.postedBy?.displayName ?? null,
    reversedByName: report.reversedBy?.displayName ?? null,
    createdAt: report.createdAt.toISOString(),
    submittedAt: report.submittedAt?.toISOString() ?? null,
    reviewedAt: report.reviewedAt?.toISOString() ?? null,
    postedAt: report.postedAt?.toISOString() ?? null,
    reversedAt: report.reversedAt?.toISOString() ?? null,
    cancelledAt: report.cancelledAt?.toISOString() ?? null,
    totalEstimatedCost: Number(report.totalEstimatedCost),
    policyFlags: parseWastagePolicyFlags(report.policyFlags),
    policyFlagLabels: formatWastagePolicyFlagLabels(report.policyFlags),
    evidenceRequired: report.evidenceRequired,
    evidenceSatisfied: report.evidenceSatisfied,
    lineCount: report.lines.length,
    totalQuantity: report.lines.reduce(
      (total, line) => total + Number(line.quantityBaseUom),
      0
    )
  }));
}

export async function getWastageReport(session: SessionContext, id: string) {
  await requireWastageRead(session);

  const report = await prisma.wastageReport.findFirst({
    where: scopedWastageWhere(session, id),
    include: {
      inventoryLocation: {
        include: { location: true }
      },
      reportedBy: true,
      reviewedBy: true,
      postedBy: true,
      reversedBy: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true
        }
      }
    }
  });

  if (!report) {
    return null;
  }

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      entityType: "WastageReport",
      entityId: report.id
    },
    orderBy: { occurredAt: "asc" }
  });

  return {
    id: report.id,
    publicReference: report.publicReference,
    status: report.status,
    wastageType: report.wastageType,
    reasonCode: report.reasonCode,
    evidenceReference: report.evidenceReference ?? null,
    notes: report.notes ?? null,
    totalEstimatedCost: Number(report.totalEstimatedCost),
    inventoryLocationName: report.inventoryLocation.name,
    locationName: report.inventoryLocation.location.name,
    reportedByUserId: report.reportedByUserId,
    reportedByName: report.reportedBy.displayName,
    reviewedByName: report.reviewedBy?.displayName ?? null,
    postedByName: report.postedBy?.displayName ?? null,
    reversedByName: report.reversedBy?.displayName ?? null,
    submittedAt: report.submittedAt?.toISOString() ?? null,
    reviewedAt: report.reviewedAt?.toISOString() ?? null,
    postedAt: report.postedAt?.toISOString() ?? null,
    reversedAt: report.reversedAt?.toISOString() ?? null,
    cancelledAt: report.cancelledAt?.toISOString() ?? null,
    cancellationReason: report.cancellationReason ?? null,
    reviewNotes: report.reviewNotes ?? null,
    reversalReason: report.reversalReason ?? null,
    policyFlags: parseWastagePolicyFlags(report.policyFlags),
    policyFlagLabels: formatWastagePolicyFlagLabels(report.policyFlags),
    policySnapshot: report.policySnapshot,
    evidenceRequired: report.evidenceRequired,
    evidenceSatisfied: report.evidenceSatisfied,
    createdAt: report.createdAt.toISOString(),
    lines: report.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      itemCode: line.item.itemCode,
      itemName: line.item.itemName,
      description: line.description,
      quantity: Number(line.quantity),
      quantityBaseUom: Number(line.quantityBaseUom),
      uomCode: line.uom.uomCode,
      estimatedUnitCost: Number(line.estimatedUnitCost),
      estimatedTotalCost: Number(line.estimatedTotalCost),
      reasonCode: line.reasonCode,
      evidenceReference: line.evidenceReference ?? null,
      photoRequired: line.photoRequired,
      postedMovementId: line.postedMovementId ?? null,
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

export async function createWastageReport(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.wastageCreate);
  const values = createWastageReportSchema.parse(Object.fromEntries(formData));
  const lineValues = parseWastageLines(formData);

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
    throw new Error("WASTAGE_INVENTORY_LOCATION_NOT_FOUND");
  }
  assertAuthorizedLocation(session, inventoryLocation.locationId);

  const controlledReasonCode = await requireActiveOperationalReasonCode(
    session,
    "WASTAGE",
    values.reasonCode,
    values.wastageType
  );

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
    throw new Error("WASTAGE_ITEM_NOT_FOUND");
  }

  const lineDrafts: WastageLineDraft[] = [];
  const lotExpiryPolicy = await getInventoryLotExpiryPolicy(session);
  for (const [index, line] of lineValues.entries()) {
    assertWastageQuantity(line.quantity);
    const item = itemById.get(line.itemId);
    if (!item) {
      throw new Error("WASTAGE_ITEM_NOT_FOUND");
    }
    const lotExpiryRequirements = inventoryItemLotExpiryRequirements(
      item,
      lotExpiryPolicy
    );
    if (lotExpiryRequirements.requiresLot && !line.lotNumber) {
      throw new Error("WASTAGE_LOT_REQUIRED");
    }
    if (lotExpiryRequirements.requiresExpiry && !line.expiryDate) {
      throw new Error("WASTAGE_EXPIRY_REQUIRED");
    }

    const photoRequired = item.category.defaultWastageRequiresPhoto;
    const lineEvidenceReference =
      line.evidenceReference || values.evidenceReference || null;
    if (photoRequired && !lineEvidenceReference) {
      throw new Error("WASTAGE_EVIDENCE_REFERENCE_REQUIRED");
    }

    lineDrafts.push({
      lineNumber: index + 1,
      item,
      quantity: line.quantity,
      estimatedUnitCost: line.estimatedUnitCost,
      estimatedTotalCost: line.quantity * line.estimatedUnitCost,
      photoRequired,
      evidenceReference: lineEvidenceReference,
      lotNumber: line.lotNumber || null,
      expiryDate: line.expiryDate ?? null,
      notes: line.notes || null
    });
  }

  const estimatedTotalCost = lineDrafts.reduce(
    (total, line) => total + line.estimatedTotalCost,
    0
  );
  const firstLine = lineDrafts[0];
  if (!firstLine) {
    throw new Error("WASTAGE_REPORT_HAS_NO_LINES");
  }
  const evidenceReference =
    values.evidenceReference ||
    lineDrafts.find((line) => line.evidenceReference)?.evidenceReference ||
    null;
  const policyEvaluation = await evaluateWastagePolicy({
    session,
    inventoryLocationId: inventoryLocation.id,
    itemId: firstLine.item.id,
    wastageType: values.wastageType,
    reasonCode: controlledReasonCode.code,
    evidenceReference,
    estimatedTotalCost,
    categoryPhotoRequired: lineDrafts.some((line) => line.photoRequired)
  });
  if (policyEvaluation.evidenceRequired && !policyEvaluation.evidenceSatisfied) {
    throw new Error("WASTAGE_EVIDENCE_REFERENCE_REQUIRED");
  }

  let reportId: string | null = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const report = await prisma.$transaction(async (tx) => {
        const created = await tx.wastageReport.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            inventoryLocationId: inventoryLocation.id,
            publicReference: await nextWastageReference(session.context.companyId),
            reportedByUserId: session.user.id,
            wastageType: values.wastageType,
            reasonCode: controlledReasonCode.code,
            evidenceReference: values.evidenceReference || null,
            notes: values.notes || null,
            totalEstimatedCost: estimatedTotalCost,
            policyFlags: policyEvaluation.flags,
            policySnapshot: policyEvaluation.policySnapshot,
            evidenceRequired: policyEvaluation.evidenceRequired,
            evidenceSatisfied: policyEvaluation.evidenceSatisfied
          }
        });

        await tx.wastageLine.createMany({
          data: lineDrafts.map((line) => ({
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            wastageReportId: created.id,
            inventoryLocationId: inventoryLocation.id,
            itemId: line.item.id,
            uomId: line.item.baseUomId,
            lineNumber: line.lineNumber,
            description: line.item.itemName,
            quantity: line.quantity,
            quantityBaseUom: line.quantity,
            estimatedUnitCost: line.estimatedUnitCost,
            estimatedTotalCost: line.estimatedTotalCost,
            reasonCode: controlledReasonCode.code,
            evidenceReference: line.evidenceReference,
            photoRequired: line.photoRequired,
            lotNumber: line.lotNumber,
            expiryDate: line.expiryDate,
            notes: line.notes
          }))
        });

        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType: "wastage_report.created",
            entityType: "WastageReport",
            entityId: created.id,
            afterData: { status: "DRAFT" },
            metadata: {
              inventoryLocationId: inventoryLocation.id,
              itemIds,
              lineCount: lineDrafts.length,
              totalQuantity: lineDrafts.reduce(
                (total, line) => total + line.quantity,
                0
              ),
              totalEstimatedCost: estimatedTotalCost,
              reasonCode: controlledReasonCode.code,
              reasonLabel: controlledReasonCode.label,
              reasonCodeId: controlledReasonCode.id,
              policyFlags: policyEvaluation.flags,
              evidenceRequired: policyEvaluation.evidenceRequired,
              evidenceSatisfied: policyEvaluation.evidenceSatisfied,
              postingRequiresSeparateAction: true
            }
          }
        });

        return created;
      });
      reportId = report.id;
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 5) {
        throw error;
      }
    }
  }

  if (!reportId) {
    throw new Error("WASTAGE_REFERENCE_ALLOCATION_FAILED");
  }

  return reportId;
}

export async function submitWastageReport(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.wastageSubmit);
  const values = wastageActionSchema.parse(Object.fromEntries(formData));

  const report = await prisma.wastageReport.findFirst({
    where: scopedWastageWhere(session, values.id),
    include: {
      inventoryLocation: true,
      lines: { orderBy: { lineNumber: "asc" } }
    }
  });
  if (!report) {
    throw new Error("WASTAGE_REPORT_NOT_FOUND");
  }
  assertWastageCanSubmit(report.status);
  if (report.lines.length === 0) {
    throw new Error("WASTAGE_REPORT_HAS_NO_LINES");
  }
  const firstLine = report.lines[0];
  if (!firstLine) {
    throw new Error("WASTAGE_REPORT_HAS_NO_LINES");
  }
  const policyEvaluation = await evaluateWastagePolicy({
    session,
    inventoryLocationId: report.inventoryLocationId,
    itemId: firstLine.itemId,
    wastageType: report.wastageType,
    reasonCode: report.reasonCode,
    evidenceReference:
      report.evidenceReference ??
      report.lines.find((line) => line.evidenceReference)?.evidenceReference ??
      null,
    estimatedTotalCost: Number(report.totalEstimatedCost),
    categoryPhotoRequired: report.lines.some((line) => line.photoRequired)
  });
  if (policyEvaluation.evidenceRequired && !policyEvaluation.evidenceSatisfied) {
    throw new Error("WASTAGE_EVIDENCE_REFERENCE_REQUIRED");
  }

  await prisma.$transaction(async (tx) => {
    const approvalRule = await tx.approvalRule.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        transactionType: "WastageReport",
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
        documentType: "WastageReport",
        documentId: report.id,
        status: "PENDING"
      },
      select: { id: true }
    });
    if (existingPendingApproval) {
      throw new Error("WASTAGE_APPROVAL_ALREADY_SUBMITTED");
    }

    const submitted = await tx.wastageReport.updateMany({
      where: {
        id: report.id,
        status: { in: ["DRAFT", "RETURNED"] }
      },
      data: {
        status: "PENDING_APPROVAL",
        submittedAt: new Date(),
        policyFlags: policyEvaluation.flags,
        policySnapshot: policyEvaluation.policySnapshot,
        evidenceRequired: policyEvaluation.evidenceRequired,
        evidenceSatisfied: policyEvaluation.evidenceSatisfied
      }
    });
    if (submitted.count !== 1) {
      throw new Error("WASTAGE_NOT_OPEN_FOR_SUBMIT");
    }

    const approval = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "WastageReport",
        documentId: report.id,
        approvalRuleId: approvalRule.id,
        status: "PENDING",
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: approvalRule.steps.map((step, index) => ({
            stepOrder: step.stepOrder,
            assignedUserId: step.userId,
            assignedRoleId: step.roleId,
            status: index === 0 ? "PENDING" : "WAITING"
          }))
        }
      }
    });

    const auditEvent = await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "wastage_report.submitted",
        entityType: "WastageReport",
        entityId: report.id,
        beforeData: { status: report.status },
        afterData: {
          status: "PENDING_APPROVAL",
          currentApprovalStep: firstStep.stepOrder
        },
        metadata: {
          approvalInstanceId: approval.id,
          approvalRuleId: approvalRule.id,
          lineCount: report.lines.length,
          totalEstimatedCost: Number(report.totalEstimatedCost),
          policyFlags: policyEvaluation.flags,
          evidenceRequired: policyEvaluation.evidenceRequired,
          evidenceSatisfied: policyEvaluation.evidenceSatisfied,
          nonPostingApproval: true
        }
      }
    });

    const recipientUserIds = await resolveScopedNotificationRecipients(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: report.inventoryLocation.locationId,
      assignedUserId: firstStep.userId,
      assignedRoleId: firstStep.roleId
    });
    await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: report.inventoryLocation.locationId,
      recipientUserIds,
      notificationType: "APPROVE_WASTAGE_REPORT",
      priority: policyEvaluation.evidenceRequired ? "HIGH" : "NORMAL",
      title: `Approve Wastage Report ${report.publicReference}`,
      body: `${session.user.displayName} submitted ${report.publicReference} for wastage approval.`,
      deepLink: `/approvals/${approval.id}`,
      entityType: "WastageReport",
      entityId: report.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approval.id,
        approvalStepOrder: firstStep.stepOrder,
        publicReference: report.publicReference,
        lineCount: report.lines.length,
        source: "wastage-approval-submission"
      }
    });
  });
}

export async function reviewWastageReport(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.wastageReview);
  const values = reviewWastageSchema.parse(Object.fromEntries(formData));

  const report = await prisma.wastageReport.findFirst({
    where: scopedWastageWhere(session, values.id)
  });
  if (!report) {
    throw new Error("WASTAGE_REPORT_NOT_FOUND");
  }
  assertWastageCanReview(report.status);
  if (report.reportedByUserId === session.user.id) {
    throw new Error("WASTAGE_SELF_REVIEW_DENIED");
  }

  const nextStatus =
    values.reviewAction === "REVIEW"
      ? "REVIEWED"
      : values.reviewAction === "RETURN"
        ? "RETURNED"
        : "REJECTED";

  await prisma.$transaction(async (tx) => {
    const reviewed = await tx.wastageReport.updateMany({
      where: {
        id: report.id,
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
      throw new Error("WASTAGE_NOT_SUBMITTED_FOR_REVIEW");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: `wastage_report.${nextStatus.toLowerCase()}`,
        entityType: "WastageReport",
        entityId: report.id,
        beforeData: { status: "SUBMITTED" },
        afterData: { status: nextStatus },
        metadata: {
          reviewAction: values.reviewAction,
          reviewNotes: values.reviewNotes,
          postingRequiresSeparateAction: true
        }
      }
    });
  });
}

export async function cancelWastageReport(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.wastageCancel);
  const values = cancelWastageSchema.parse(Object.fromEntries(formData));

  const report = await prisma.wastageReport.findFirst({
    where: scopedWastageWhere(session, values.id)
  });
  if (!report) {
    throw new Error("WASTAGE_REPORT_NOT_FOUND");
  }
  assertWastageCanCancel(report.status);

  await prisma.$transaction(async (tx) => {
    const cancelled = await tx.wastageReport.updateMany({
      where: {
        id: report.id,
        status: { in: ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "RETURNED"] }
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: values.cancellationReason
      }
    });
    if (cancelled.count !== 1) {
      throw new Error("WASTAGE_NOT_CANCELLABLE");
    }

    const approval = await tx.approvalInstance.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "WastageReport",
        documentId: report.id,
        status: "PENDING"
      },
      select: { id: true }
    });

    if (approval) {
      await tx.approvalInstance.update({
        where: { id: approval.id },
        data: {
          status: "CANCELLED",
          currentStepOrder: null
        }
      });
      await tx.approvalInstanceStep.updateMany({
        where: {
          approvalInstanceId: approval.id,
          status: { in: ["PENDING", "WAITING"] }
        },
        data: { status: "SKIPPED" }
      });
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "wastage_report.cancelled",
        entityType: "WastageReport",
        entityId: report.id,
        beforeData: { status: report.status },
        afterData: { status: "CANCELLED" },
        metadata: {
          approvalInstanceId: approval?.id ?? null,
          cancellationReason: values.cancellationReason,
          nonPostingApproval: report.status === "PENDING_APPROVAL"
        }
      }
    });
  });
}

export async function postWastageReport(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.wastagePost);
  const values = wastageActionSchema.parse(Object.fromEntries(formData));

  const report = await prisma.wastageReport.findFirst({
    where: scopedWastageWhere(session, values.id),
    include: {
      inventoryLocation: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true
        }
      }
    }
  });
  if (!report) {
    throw new Error("WASTAGE_REPORT_NOT_FOUND");
  }
  assertAuthorizedLocation(session, report.inventoryLocation.locationId);
  assertWastageCanPost(report.status, report.postedAt);
  if (report.lines.length === 0) {
    throw new Error("WASTAGE_REPORT_HAS_NO_LINES");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "wastage_report.post",
    enforcementScope: "all_sensitive",
    permissionCode: permissions.wastagePost,
    entityType: "WastageReport",
    entityId: report.id,
    reason:
      "Posting wastage changes inventory balances and requires privileged MFA evidence.",
    metadata: {
      wastageType: report.wastageType,
      inventoryLocationId: report.inventoryLocationId
    }
  });

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.wastageReport.updateMany({
      where: {
        id: report.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "APPROVED",
        postedAt: null
      },
      data: { status: "POSTING" }
    });
    if (claimed.count !== 1) {
      const current = await tx.wastageReport.findFirst({
        where: {
          id: report.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId
        },
        select: { status: true, postedAt: true }
      });
      if (current?.status === "POSTED" || current?.postedAt) {
        return;
      }
      throw new Error("WASTAGE_NOT_APPROVED_FOR_POSTING");
    }

    const movementIds: string[] = [];
    for (const line of report.lines) {
      if (line.postedMovementId) {
        movementIds.push(line.postedMovementId);
        continue;
      }

      const quantityBaseUom = Number(line.quantityBaseUom);
      const { movement } = await postInventoryMovementInTransaction(tx, session, {
        inventoryLocationId: line.inventoryLocationId,
        itemId: line.itemId,
        movementType: "WASTAGE_OUT",
        occurredAt: new Date(),
        enteredQuantity: Number(line.quantity),
        enteredUomId: line.uomId,
        quantityDeltaBaseUom: -Math.abs(quantityBaseUom),
        sourceDocumentType: "WastageReport",
        sourceDocumentId: report.id,
        sourceDocumentLineId: line.id,
        sourceEventKey: `wastage_line:${line.id}:post`,
        lotNumber: line.lotNumber ?? null,
        expiryDate: line.expiryDate ?? null,
        unitCost: Number(line.estimatedUnitCost),
        totalCost: Number(line.estimatedTotalCost),
        reasonCode: line.reasonCode,
        notes: line.notes ?? report.notes ?? null
      });

      await tx.wastageLine.update({
        where: { id: line.id },
        data: { postedMovementId: movement.id }
      });
      movementIds.push(movement.id);
    }

    const postedAt = new Date();
    const posted = await tx.wastageReport.updateMany({
      where: {
        id: report.id,
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
      throw new Error("WASTAGE_POSTING_STATE_CONFLICT");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "wastage_report.posted",
        entityType: "WastageReport",
        entityId: report.id,
        beforeData: { status: "APPROVED" },
        afterData: { status: "POSTED", postedAt },
        metadata: {
          lineCount: report.lines.length,
          movementIds,
          totalEstimatedCost: Number(report.totalEstimatedCost),
          reversalRequiredForCorrections: true
        }
      }
    });
  });
}

export async function reverseWastageReport(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.wastageReverse);
  const values = reverseWastageSchema.parse(Object.fromEntries(formData));

  const report = await prisma.wastageReport.findFirst({
    where: scopedWastageWhere(session, values.id),
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
  if (!report) {
    throw new Error("WASTAGE_REPORT_NOT_FOUND");
  }
  assertAuthorizedLocation(session, report.inventoryLocation.locationId);
  assertWastageCanReverse(report.status, report.reversedAt);
  if (!report.postedAt) {
    throw new Error("WASTAGE_NOT_POSTED_FOR_REVERSAL");
  }
  if (report.lines.length === 0) {
    throw new Error("WASTAGE_REPORT_HAS_NO_LINES");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "wastage_report.reverse",
    enforcementScope: "all_sensitive",
    permissionCode: permissions.wastageReverse,
    entityType: "WastageReport",
    entityId: report.id,
    reason:
      "Reversing wastage creates counter-movements and requires privileged MFA evidence.",
    metadata: {
      wastageType: report.wastageType,
      inventoryLocationId: report.inventoryLocationId
    }
  });

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.wastageReport.updateMany({
      where: {
        id: report.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "POSTED",
        postedAt: { not: null },
        reversedAt: null
      },
      data: { status: "REVERSING" }
    });
    if (claimed.count !== 1) {
      const current = await tx.wastageReport.findFirst({
        where: {
          id: report.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId
        },
        select: { status: true, reversedAt: true }
      });
      if (current?.status === "REVERSED" || current?.reversedAt) {
        return;
      }
      throw new Error("WASTAGE_NOT_POSTED_FOR_REVERSAL");
    }

    const reversalMovementIds: string[] = [];
    const originalMovementIds: string[] = [];
    for (const line of report.lines) {
      const original = line.postedMovement;
      if (!original || !line.postedMovementId) {
        throw new Error("WASTAGE_LINE_POSTED_MOVEMENT_REQUIRED");
      }
      if (original.movementType !== "WASTAGE_OUT") {
        throw new Error("WASTAGE_REVERSAL_ORIGINAL_MOVEMENT_INVALID");
      }
      if (
        original.tenantId !== session.context.tenantId ||
        original.companyId !== session.context.companyId ||
        original.inventoryLocationId !== line.inventoryLocationId ||
        original.itemId !== line.itemId ||
        original.sourceDocumentType !== "WastageReport" ||
        original.sourceDocumentId !== report.id ||
        original.sourceDocumentLineId !== line.id
      ) {
        throw new Error("WASTAGE_REVERSAL_ORIGINAL_MOVEMENT_MISMATCH");
      }
      if (original.reversalMovements.length > 0) {
        throw new Error("WASTAGE_LINE_ALREADY_REVERSED");
      }

      const quantityDeltaBaseUom = Math.abs(Number(original.quantityDeltaBaseUom));
      const { movement } = await postInventoryMovementInTransaction(tx, session, {
        inventoryLocationId: original.inventoryLocationId,
        relatedInventoryLocationId: original.relatedInventoryLocationId,
        itemId: original.itemId,
        movementType: "REVERSAL",
        occurredAt: new Date(),
        enteredQuantity: Number(original.enteredQuantity),
        enteredUomId: original.enteredUomId,
        quantityDeltaBaseUom,
        sourceDocumentType: "WastageReport",
        sourceDocumentId: report.id,
        sourceDocumentLineId: line.id,
        sourceEventKey: `wastage_line:${line.id}:reverse`,
        lotNumber: original.lotNumber,
        expiryDate: original.expiryDate,
        unitCost: original.unitCost ? Number(original.unitCost) : null,
        totalCost: original.totalCost ? Number(original.totalCost) : null,
        reasonCode: "WASTAGE_REVERSAL",
        notes: values.reversalReason,
        reversalOfMovementId: original.id
      });
      originalMovementIds.push(original.id);
      reversalMovementIds.push(movement.id);
    }

    const reversedAt = new Date();
    const reversed = await tx.wastageReport.updateMany({
      where: {
        id: report.id,
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
      throw new Error("WASTAGE_REVERSAL_STATE_CONFLICT");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "wastage_report.reversed",
        entityType: "WastageReport",
        entityId: report.id,
        beforeData: { status: "POSTED" },
        afterData: { status: "REVERSED", reversedAt },
        metadata: {
          reversalReason: values.reversalReason,
          originalMovementIds,
          reversalMovementIds,
          correctedReplacementRequiredWhenNeeded: true
        }
      }
    });
  });
}
