import { prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import {
  assertAuthorizedLocation,
  requireSessionContext,
  type SessionContext,
} from "./context";
import {
  canUsePurchaseRequests,
  getGrantedPermissionCodes,
  permissions,
  requirePermission,
} from "./authorization";
import {
  recordWorkflowNotifications,
  resolveScopedNotificationRecipients,
} from "./notifications";
import { PURCHASE_REQUEST_MAX_LINES } from "../../lib/workflowLimits";
import { getPurchasingControlPolicy } from "./policySettings";
import { reverseBudgetCommitmentFromApprovedSourceEvent } from "./budgetControl";

export type PurchaseRequestStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "RETURNED"
  | "CANCELLED";

export type PurchaseRequest = {
  id: string;
  publicReference: string;
  tenantId: string;
  companyId: string;
  brandId: string;
  requestLocationId: string;
  requesterUserId: string;
  createdAt: string;
  requiredDate: string;
  urgency: string;
  isEmergency: boolean;
  slaStatus: PurchaseRequestSlaStatus;
  slaLabel: string;
  emergencyReason: string | null;
  emergencyEvidenceReference: string | null;
  emergencyPostReviewCompleted: boolean;
  emergencyPostReviewOutcome: string | null;
  emergencyPostReviewReason: string | null;
  emergencyPostReviewEvidenceReference: string | null;
  emergencyPostReviewCompletedAt: string | null;
  justification: string;
  status: PurchaseRequestStatus;
  currentApprovalStep: number | null;
  line: {
    itemId: string | null;
    itemName: string | null;
    uomId: string | null;
    description: string;
    requestedQty: number;
    estimatedUnitCost: number;
    estimatedLineTotal: number;
    budgetLineId: string | null;
    budgetLineCode: string | null;
    budgetLineName: string | null;
    budgetReference: string | null;
    uomCode: string;
    purpose: string;
  };
  lines: Array<{
    id: string;
    lineNumber: number;
    itemId: string | null;
    itemName: string | null;
    uomId: string | null;
    description: string;
    requestedQty: number;
    estimatedUnitCost: number;
    estimatedLineTotal: number;
    budgetLineId: string | null;
    budgetLineCode: string | null;
    budgetLineName: string | null;
    budgetReference: string | null;
    uomCode: string;
    purpose: string;
  }>;
  auditEvents: Array<{
    id: string;
    eventType: string;
    entityType: string;
    entityId: string;
    actorUserId: string;
    occurredAt: string;
    metadata?: Record<string, unknown>;
  }>;
  comments: Array<{
    id: string;
    authorName: string;
    body: string;
    createdAt: string;
  }>;
  approvalActions: Array<{
    id: string;
    stepOrder: number;
    status: string;
    actedAt: string | null;
    actedByName: string | null;
    remarks: string | null;
  }>;
  supplierQuotes: Array<{
    id: string;
    supplierName: string;
    quoteReference: string;
    quoteDate: string;
    currencyCode: string;
    totalAmount: number;
    status: string;
    availabilityStatus: string | null;
    leadTimeDays: number | null;
  }>;
};

export type PurchaseRequestSlaStatus =
  | "NOT_APPLICABLE"
  | "ON_TRACK"
  | "DUE_TODAY"
  | "OVERDUE"
  | "RESOLVED";

const optionalUuidSchema = z
  .string()
  .uuid()
  .optional()
  .or(z.literal("").transform(() => undefined));

const purchaseRequestLineInputSchema = z
  .object({
    itemId: optionalUuidSchema,
    description: z.string().trim().max(240).optional(),
    requestedQty: z.coerce.number().positive(),
    estimatedUnitCost: z.preprocess(
      (value) => (value === "" ? 0 : value),
      z.coerce.number().nonnegative(),
    ),
    budgetLineId: optionalUuidSchema,
    uomId: optionalUuidSchema,
    uomCode: z.string().max(24).optional(),
    purpose: z.string().min(2).max(240),
  })
  .superRefine((values, ctx) => {
    const issue = getCatalogLineUomRequirementIssue(values);
    if (issue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [issue.path],
        message: issue.message,
      });
    }
  });

const createDraftHeaderSchema = z.object({
  requiredDate: z.string().min(1),
  urgency: z.enum(["Normal", "Urgent", "Emergency"]),
  emergencyReason: z.string().trim().max(500).optional(),
  emergencyEvidenceReference: z.string().trim().max(240).optional(),
  justification: z.string().min(5).max(1000),
});

const cancelPurchaseRequestSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(5).max(500),
});

const addPurchaseRequestCommentSchema = z.object({
  purchaseRequestId: z.string().uuid(),
  body: z.string().trim().min(2).max(1000),
});

const completeEmergencyPurchasePostReviewSchema = z.object({
  id: z.string().uuid(),
  reviewOutcome: z.enum([
    "ACCEPTED",
    "FOLLOW_UP_REQUIRED",
    "POLICY_EXCEPTION",
  ]),
  reason: z.string().trim().min(5).max(500),
  evidenceReference: z.string().trim().min(2).max(240),
});

const activePurchaseRequestStatuses = new Set<PurchaseRequestStatus>([
  "DRAFT",
  "PENDING_APPROVAL",
  "RETURNED",
]);

export function isEmergencyPurchaseUrgency(urgency: string) {
  return urgency.trim().toLowerCase().includes("emergency");
}

function utcDateOnly(value: Date) {
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

export function getPurchaseRequestSlaStatus(values: {
  urgency: string;
  requiredDate: Date;
  status: PurchaseRequestStatus;
  now?: Date;
}): PurchaseRequestSlaStatus {
  if (!isEmergencyPurchaseUrgency(values.urgency)) {
    return "NOT_APPLICABLE";
  }
  if (!activePurchaseRequestStatuses.has(values.status)) {
    return "RESOLVED";
  }

  const requiredDate = utcDateOnly(values.requiredDate);
  const today = utcDateOnly(values.now ?? new Date());
  if (requiredDate < today) {
    return "OVERDUE";
  }
  if (requiredDate === today) {
    return "DUE_TODAY";
  }
  return "ON_TRACK";
}

export function getPurchaseRequestSlaLabel(status: PurchaseRequestSlaStatus) {
  switch (status) {
    case "ON_TRACK":
      return "Emergency SLA on track";
    case "DUE_TODAY":
      return "Emergency SLA due today";
    case "OVERDUE":
      return "Emergency SLA overdue";
    case "RESOLVED":
      return "Emergency SLA resolved";
    default:
      return "Normal priority";
  }
}

export function getCatalogLineUomRequirementIssue(values: {
  itemId?: string | undefined;
  uomId?: string | undefined;
  uomCode?: string | undefined;
}) {
  if (values.itemId && !values.uomId) {
    return {
      path: "uomId",
      message: "Catalog item lines require a catalog UOM.",
    };
  }
  if (!values.uomId && !values.uomCode?.trim()) {
    return {
      path: "uomCode",
      message: "Free-text lines require a UOM code.",
    };
  }
  return null;
}

function getFormValues(formData: FormData, key: string, legacyKey?: string) {
  const values = formData.getAll(key).map((value) => String(value));
  if (values.length > 0) {
    return values;
  }
  return legacyKey
    ? formData.getAll(legacyKey).map((value) => String(value))
    : [];
}

function parsePurchaseRequestLineInputs(formData: FormData) {
  const descriptions = getFormValues(
    formData,
    "lineDescription",
    "description",
  );
  const quantities = getFormValues(
    formData,
    "lineRequestedQty",
    "requestedQty",
  );
  const estimatedUnitCosts = getFormValues(
    formData,
    "lineEstimatedUnitCost",
    "estimatedUnitCost",
  );
  const budgetLineIds = getFormValues(
    formData,
    "lineBudgetLineId",
    "budgetLineId",
  );
  const itemIds = getFormValues(formData, "lineItemId", "itemId");
  const uomIds = getFormValues(formData, "lineUomId", "uomId");
  const uomCodes = getFormValues(formData, "lineUomCode", "uomCode");
  const purposes = getFormValues(formData, "linePurpose", "purpose");
  const lineCount = Math.max(
    descriptions.length,
    quantities.length,
    itemIds.length,
    budgetLineIds.length,
    uomIds.length,
    uomCodes.length,
    purposes.length,
  );

  const lines = Array.from({ length: lineCount }, (_, index) => ({
    itemId: itemIds[index] ?? "",
    description: descriptions[index] ?? "",
    requestedQty: quantities[index] ?? "",
    estimatedUnitCost: estimatedUnitCosts[index] ?? "",
    budgetLineId: budgetLineIds[index] ?? "",
    uomId: uomIds[index] ?? "",
    uomCode: uomCodes[index] ?? "",
    purpose: purposes[index] ?? "",
  })).filter(
    (line) =>
      line.itemId.trim() ||
      line.description.trim() ||
      line.requestedQty.trim() ||
      line.estimatedUnitCost.trim() ||
      line.budgetLineId.trim() ||
      line.uomId.trim() ||
      line.uomCode.trim() ||
      line.purpose.trim(),
  );
  if (lines.length > PURCHASE_REQUEST_MAX_LINES) {
    throw new Error("PURCHASE_REQUEST_LINES_LIMIT_EXCEEDED");
  }
  return lines;
}

type PurchaseRequestRecord = NonNullable<
  Awaited<ReturnType<typeof findPurchaseRequestRecord>>
>;
type AuditEventRecord = Awaited<ReturnType<typeof findAuditEvents>>[number];
type ApprovalActionRecord = Awaited<
  ReturnType<typeof findApprovalActions>
>[number];
type PurchaseRequestApprovalRules = Awaited<
  ReturnType<typeof findPurchaseRequestApprovalRule>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmergencyApprovalRule(scopeFilters: unknown) {
  if (!isRecord(scopeFilters)) {
    return false;
  }
  const route = String(scopeFilters.route ?? scopeFilters.appliesTo ?? "")
    .trim()
    .toLowerCase();
  return (
    scopeFilters.emergency === true ||
    route === "emergency" ||
    route === "emergency_purchase"
  );
}

export function resolvePurchaseRequestApprovalRule(input: {
  rules: PurchaseRequestApprovalRules;
  isEmergency: boolean;
}) {
  const emergencyRule = input.rules.find((rule) =>
    isEmergencyApprovalRule(rule.scopeFilters),
  );
  if (input.isEmergency && emergencyRule) {
    return {
      approvalRule: emergencyRule,
      routeType: "emergency" as const,
      fallbackUsed: false,
    };
  }
  const defaultRule =
    input.rules.find((rule) => !isEmergencyApprovalRule(rule.scopeFilters)) ??
    input.rules[0];
  return {
    approvalRule: defaultRule ?? null,
    routeType: input.isEmergency
      ? ("emergency_fallback" as const)
      : ("normal" as const),
    fallbackUsed: input.isEmergency && Boolean(defaultRule),
  };
}

function findPurchaseRequestApprovalRule(
  tx: TransactionClient,
  session: SessionContext,
) {
  return tx.approvalRule.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: "PURCHASE_REQUEST",
      isActive: true,
    },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" },
      },
    },
    orderBy: { priority: "asc" },
  });
}

function emergencyReviewMetadata(auditEvents: AuditEventRecord[]) {
  const createdEvent = auditEvents.find(
    (event) => event.eventType === "purchase_request.created",
  );
  const metadata =
    createdEvent?.metadata && typeof createdEvent.metadata === "object"
      ? (createdEvent.metadata as Record<string, unknown>)
      : {};
  return metadata.emergencyReview && typeof metadata.emergencyReview === "object"
    ? (metadata.emergencyReview as Record<string, unknown>)
    : {};
}

function emergencyPostReviewEvent(auditEvents: AuditEventRecord[]) {
  return auditEvents.find(
    (event) =>
      event.eventType === "purchase_request.emergency_post_review.completed",
  );
}

function emergencyPostReviewMetadata(auditEvents: AuditEventRecord[]) {
  const reviewEvent = emergencyPostReviewEvent(auditEvents);
  const metadata =
    reviewEvent?.metadata && typeof reviewEvent.metadata === "object"
      ? (reviewEvent.metadata as Record<string, unknown>)
      : {};
  return {
    event: reviewEvent,
    metadata,
  };
}

function toPurchaseRequest(
  record: PurchaseRequestRecord,
  auditEvents: AuditEventRecord[],
  approvalActions: ApprovalActionRecord[] = [],
): PurchaseRequest {
  const line = record.lines[0];
  if (!line) {
    throw new Error("PURCHASE_REQUEST_LINE_NOT_FOUND");
  }
  const emergencyReview = emergencyReviewMetadata(auditEvents);
  const emergencyPostReview = emergencyPostReviewMetadata(auditEvents);
  const slaStatus = getPurchaseRequestSlaStatus({
    urgency: record.urgency,
    requiredDate: record.requiredDate,
    status: record.status as PurchaseRequestStatus,
  });
  const lines = record.lines.map((requestLine) => ({
    id: requestLine.id,
    lineNumber: requestLine.lineNumber,
    itemId: requestLine.itemId,
    itemName: requestLine.item?.itemName ?? null,
    uomId: requestLine.uomId,
    description: requestLine.description,
    requestedQty: Number(requestLine.requestedQty),
    estimatedUnitCost: Number(requestLine.estimatedUnitCost),
    estimatedLineTotal: Number(requestLine.estimatedLineTotal),
    budgetLineId: requestLine.budgetLineId,
    budgetLineCode: requestLine.budgetLine?.code ?? null,
    budgetLineName: requestLine.budgetLine?.name ?? null,
    budgetReference: requestLine.budgetLine?.budget.publicReference ?? null,
    uomCode: requestLine.uom?.uomCode ?? requestLine.uomCode,
    purpose: requestLine.purpose,
  }));

  return {
    id: record.id,
    publicReference: record.publicReference,
    tenantId: record.tenantId,
    companyId: record.companyId,
    brandId: record.brandId ?? "",
    requestLocationId: record.requestLocationId,
    requesterUserId: record.requesterUserId,
    createdAt: record.createdAt.toISOString(),
    requiredDate: record.requiredDate.toISOString().slice(0, 10),
    urgency: record.urgency,
    isEmergency: isEmergencyPurchaseUrgency(record.urgency),
    slaStatus,
    slaLabel: getPurchaseRequestSlaLabel(slaStatus),
    emergencyReason:
      typeof emergencyReview.reason === "string" ? emergencyReview.reason : null,
    emergencyEvidenceReference:
      typeof emergencyReview.evidenceReference === "string"
        ? emergencyReview.evidenceReference
        : null,
    emergencyPostReviewCompleted: Boolean(emergencyPostReview.event),
    emergencyPostReviewOutcome:
      typeof emergencyPostReview.metadata.reviewOutcome === "string"
        ? emergencyPostReview.metadata.reviewOutcome
        : null,
    emergencyPostReviewReason:
      typeof emergencyPostReview.metadata.reason === "string"
        ? emergencyPostReview.metadata.reason
        : null,
    emergencyPostReviewEvidenceReference:
      typeof emergencyPostReview.metadata.evidenceReference === "string"
        ? emergencyPostReview.metadata.evidenceReference
        : null,
    emergencyPostReviewCompletedAt: emergencyPostReview.event
      ? emergencyPostReview.event.occurredAt.toISOString()
      : null,
    justification: record.justification,
    status: record.status as PurchaseRequestStatus,
    currentApprovalStep: record.currentApprovalStep,
    line: {
      itemId: line.itemId,
      itemName: line.item?.itemName ?? null,
      uomId: line.uomId,
      description: line.description,
      requestedQty: Number(line.requestedQty),
      estimatedUnitCost: Number(line.estimatedUnitCost),
      estimatedLineTotal: Number(line.estimatedLineTotal),
      budgetLineId: line.budgetLineId,
      budgetLineCode: line.budgetLine?.code ?? null,
      budgetLineName: line.budgetLine?.name ?? null,
      budgetReference: line.budgetLine?.budget.publicReference ?? null,
      uomCode: line.uom?.uomCode ?? line.uomCode,
      purpose: line.purpose,
    },
    lines,
    auditEvents: auditEvents.map((event) => {
      const metadata =
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>)
          : undefined;

      return {
        id: event.id,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        actorUserId: event.actorUserId ?? "",
        occurredAt: event.occurredAt.toISOString(),
        ...(metadata ? { metadata } : {}),
      };
    }),
    comments: record.comments.map((comment) => ({
      id: comment.id,
      authorName: comment.author.displayName,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
    })),
    approvalActions: approvalActions.map((action) => ({
      id: action.id,
      stepOrder: action.stepOrder,
      status: action.status,
      actedAt: action.actedAt ? action.actedAt.toISOString() : null,
      actedByName: action.actedByName,
      remarks: action.remarks,
    })),
    supplierQuotes: record.quotationRequests.flatMap((quotationRequest) =>
      quotationRequest.supplierQuotes.map((quote) => ({
        id: quote.id,
        supplierName: quote.supplier.tradingName ?? quote.supplier.legalName,
        quoteReference: quote.quoteReference,
        quoteDate: quote.quoteDate.toISOString().slice(0, 10),
        currencyCode: quote.currencyCode,
        totalAmount: Number(quote.totalAmount),
        status: quote.status,
        availabilityStatus: quote.lines[0]?.availabilityStatus ?? null,
        leadTimeDays: quote.lines[0]?.leadTimeDays ?? null,
      })),
    ),
  };
}

function findPurchaseRequestRecord(session: SessionContext, id: string) {
  return prisma.purchaseRequest.findFirst({
    where: {
      id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      requestLocationId: session.context.locationId,
    },
    include: {
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true,
          budgetLine: {
            include: {
              budget: {
                select: {
                  publicReference: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: true,
        },
      },
      quotationRequests: {
        include: {
          supplierQuotes: {
            include: {
              supplier: true,
              lines: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });
}

function findAuditEvents(session: SessionContext, entityIds: string[]) {
  return prisma.auditEvent.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      entityType: "PurchaseRequest",
      entityId: { in: entityIds },
    },
    orderBy: { occurredAt: "asc" },
  });
}

async function findApprovalActions(
  session: SessionContext,
  purchaseRequestId: string,
) {
  const instances = await prisma.approvalInstance.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "PurchaseRequest",
      documentId: purchaseRequestId,
    },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const actedByUserIds = Array.from(
    new Set(
      instances.flatMap((instance) =>
        instance.steps.flatMap((step) =>
          step.actedByUserId ? [step.actedByUserId] : [],
        ),
      ),
    ),
  );
  const users = actedByUserIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: actedByUserIds },
          tenantId: session.context.tenantId,
        },
        select: {
          id: true,
          displayName: true,
        },
      })
    : [];

  return instances.flatMap((instance) =>
    instance.steps.map((step) => ({
      id: step.id,
      stepOrder: step.stepOrder,
      status: step.status,
      actedAt: step.actedAt,
      actedByName:
        users.find((user) => user.id === step.actedByUserId)?.displayName ??
        null,
      remarks: step.remarks,
    })),
  );
}

export type PurchaseRequestListFilters = {
  status?: PurchaseRequestStatus | "ALL";
  search?: string;
};

export async function listPurchaseRequests(
  session: SessionContext,
  filters: PurchaseRequestListFilters = {},
) {
  if (!canUsePurchaseRequests(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }

  const search = filters.search?.trim();
  const status =
    filters.status && filters.status !== "ALL" ? filters.status : undefined;
  const records = await prisma.purchaseRequest.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      requestLocationId: session.context.locationId,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { publicReference: { contains: search, mode: "insensitive" } },
              { justification: { contains: search, mode: "insensitive" } },
              {
                lines: {
                  some: {
                    OR: [
                      {
                        description: { contains: search, mode: "insensitive" },
                      },
                      { purpose: { contains: search, mode: "insensitive" } },
                      {
                        item: {
                          itemName: { contains: search, mode: "insensitive" },
                        },
                      },
                      {
                        item: {
                          itemCode: { contains: search, mode: "insensitive" },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true,
          budgetLine: {
            include: {
              budget: {
                select: {
                  publicReference: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: true,
        },
      },
      quotationRequests: {
        include: {
          supplierQuotes: {
            include: {
              supplier: true,
              lines: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const auditEvents = await findAuditEvents(
    session,
    records.map((record) => record.id),
  );

  return records.map((record) =>
    toPurchaseRequest(
      record,
      auditEvents.filter((event) => event.entityId === record.id),
    ),
  );
}

export async function getPurchaseRequest(session: SessionContext, id: string) {
  if (!canUsePurchaseRequests(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }

  const request = await findPurchaseRequestRecord(session, id);
  if (!request) {
    return null;
  }
  assertAuthorizedLocation(session, request.requestLocationId);
  const auditEvents = await findAuditEvents(session, [request.id]);
  const approvalActions = await findApprovalActions(session, request.id);
  return toPurchaseRequest(request, auditEvents, approvalActions);
}

export async function listPurchaseRequestDraftOptions(session: SessionContext) {
  const permissionCodes = await getGrantedPermissionCodes(session);
  if (!permissionCodes.includes(permissions.purchaseRequestCreate)) {
    return {
      items: [],
      uoms: [],
      budgetLines: [],
    };
  }

  const [items, uoms, budgetLines] = await Promise.all([
    prisma.item.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
      },
      include: {
        baseUom: true,
        purchaseUom: true,
        issueUom: true,
        uomConversions: {
          include: {
            fromUom: true,
            toUom: true,
          },
        },
      },
      orderBy: { itemName: "asc" },
    }),
    prisma.uom.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
      },
      orderBy: { uomCode: "asc" },
    }),
    prisma.budgetLine.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
        budget: {
          status: { in: ["ACTIVE", "PARTIALLY_RELEASED"] },
        },
        OR: [
          { locationId: null },
          { locationId: session.context.locationId },
        ],
        ...(session.context.brandId
          ? {
              AND: [
                {
                  OR: [
                    { brandId: null },
                    { brandId: session.context.brandId },
                  ],
                },
              ],
            }
          : {}),
      },
      include: {
        budget: {
          select: {
            publicReference: true,
            name: true,
          },
        },
      },
      orderBy: [{ code: "asc" }, { name: "asc" }],
      take: 200,
    }),
  ]);

  return {
    items: items.map((item) => {
      const itemUoms = new Map<
        string,
        { id: string; uomCode: string; uomName: string }
      >();
      const addUom = (
        uom:
          | {
              id: string;
              uomCode: string;
              uomName: string;
            }
          | null,
      ) => {
        if (uom) {
          itemUoms.set(uom.id, {
            id: uom.id,
            uomCode: uom.uomCode,
            uomName: uom.uomName,
          });
        }
      };
      addUom(item.purchaseUom);
      addUom(item.baseUom);
      addUom(item.issueUom);
      item.uomConversions.forEach((conversion) => {
        addUom(conversion.fromUom);
        addUom(conversion.toUom);
      });

      return {
        id: item.id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        defaultUomId: item.purchaseUomId ?? item.baseUomId,
        uoms: Array.from(itemUoms.values()).sort((left, right) =>
          left.uomCode.localeCompare(right.uomCode),
        ),
      };
    }),
    uoms: uoms.map((uom) => ({
      id: uom.id,
      uomCode: uom.uomCode,
      uomName: uom.uomName,
    })),
    budgetLines: budgetLines.map((line) => ({
      id: line.id,
      label: `${line.code} - ${line.name}`,
      helper: `${line.budget.publicReference} / ${line.budget.name}`,
    })),
  };
}

export async function createDraftPurchaseRequest(formData: FormData) {
  const session = await requireSessionContext();
  const values = createDraftHeaderSchema.parse(Object.fromEntries(formData));
  const lines = parsePurchaseRequestLineInputs(formData).map((line) =>
    purchaseRequestLineInputSchema.parse(line),
  );
  if (lines.length === 0) {
    throw new Error("PURCHASE_REQUEST_LINE_NOT_FOUND");
  }
  await requirePermission(session, permissions.purchaseRequestCreate);
  assertAuthorizedLocation(session, session.context.locationId);
  const purchasingPolicy = await getPurchasingControlPolicy(session);
  const isEmergency = isEmergencyPurchaseUrgency(values.urgency);
  if (isEmergency && !values.emergencyReason?.trim()) {
    throw new Error("EMERGENCY_PURCHASE_REASON_REQUIRED");
  }
  if (isEmergency && !values.emergencyEvidenceReference?.trim()) {
    throw new Error("EMERGENCY_PURCHASE_EVIDENCE_REQUIRED");
  }
  const emergencySlaStatus = getPurchaseRequestSlaStatus({
    urgency: values.urgency,
    requiredDate: new Date(`${values.requiredDate}T00:00:00.000Z`),
    status: "DRAFT",
  });

  const itemIds = Array.from(
    new Set(lines.flatMap((line) => (line.itemId ? [line.itemId] : []))),
  );
  const uomIds = Array.from(
    new Set(lines.flatMap((line) => (line.uomId ? [line.uomId] : []))),
  );
  const budgetLineIds = Array.from(
    new Set(
      lines.flatMap((line) => (line.budgetLineId ? [line.budgetLineId] : [])),
    ),
  );
  const [items, catalogUoms, budgetLines] = await Promise.all([
    itemIds.length
      ? prisma.item.findMany({
          where: {
            id: { in: itemIds },
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE",
          },
        })
      : [],
    uomIds.length
      ? prisma.uom.findMany({
          where: {
            id: { in: uomIds },
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE",
          },
        })
      : [],
    budgetLineIds.length
      ? prisma.budgetLine.findMany({
          where: {
            id: { in: budgetLineIds },
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE",
            budget: {
              status: { in: ["ACTIVE", "PARTIALLY_RELEASED"] },
            },
            OR: [
              { locationId: null },
              { locationId: session.context.locationId },
            ],
            ...(session.context.brandId
              ? {
                  AND: [
                    {
                      OR: [
                        { brandId: null },
                        { brandId: session.context.brandId },
                      ],
                    },
                  ],
                }
              : {}),
          },
          include: {
            budget: {
              select: {
                publicReference: true,
                name: true,
              },
            },
          },
        })
      : [],
  ]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const uomById = new Map(catalogUoms.map((uom) => [uom.id, uom]));
  const budgetLineById = new Map(
    budgetLines.map((budgetLine) => [budgetLine.id, budgetLine]),
  );
  const resolvedLines = lines.map((line, index) => {
    const item = line.itemId ? itemById.get(line.itemId) : null;
    const catalogUom = line.uomId ? uomById.get(line.uomId) : null;
    const budgetLine = line.budgetLineId
      ? budgetLineById.get(line.budgetLineId)
      : null;
    if (line.itemId && !item) {
      throw new Error("PR_LINE_ITEM_NOT_FOUND");
    }
    if (line.uomId && !catalogUom) {
      throw new Error("PR_LINE_UOM_NOT_FOUND");
    }
    if (line.budgetLineId && !budgetLine) {
      throw new Error("PR_LINE_BUDGET_LINE_NOT_FOUND");
    }
    const uomCode = catalogUom?.uomCode ?? line.uomCode?.trim().toUpperCase();
    if (!uomCode) {
      throw new Error("PR_LINE_UOM_REQUIRED");
    }
    return {
      lineNumber: index + 1,
      item,
      catalogUom,
      budgetLine,
      description: line.description,
      requestedQty: line.requestedQty,
      estimatedUnitCost: line.estimatedUnitCost,
      estimatedLineTotal: line.requestedQty * line.estimatedUnitCost,
      uomCode,
      purpose: line.purpose,
    };
  });
  const estimatedTotalAmount = resolvedLines.reduce(
    (total, line) => total + line.estimatedLineTotal,
    0,
  );
  if (isEmergency && estimatedTotalAmount <= 0) {
    throw new Error("EMERGENCY_PURCHASE_ESTIMATE_REQUIRED");
  }
  if (
    isEmergency &&
    estimatedTotalAmount > purchasingPolicy.emergencyMaxAmountPhp
  ) {
    throw new Error("EMERGENCY_PURCHASE_CAP_EXCEEDED");
  }

  const created = await prisma.$transaction(async (tx) => {
    const request = await tx.purchaseRequest.create({
      data: {
        publicReference: `PR-DRAFT-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId || null,
        requestLocationId: session.context.locationId,
        requesterUserId: session.user.id,
        requiredDate: new Date(`${values.requiredDate}T00:00:00.000Z`),
        urgency: values.urgency,
        justification: values.justification,
        status: "DRAFT",
        lines: {
          create: resolvedLines.map((line) => ({
            lineNumber: line.lineNumber,
            itemId: line.item?.id ?? null,
            description:
              line.description?.trim() ||
              line.item?.itemName ||
              line.purpose,
            requestedQty: line.requestedQty,
            estimatedUnitCost: line.estimatedUnitCost,
            estimatedLineTotal: line.estimatedLineTotal,
            budgetLineId: line.budgetLine?.id ?? null,
            uomId: line.catalogUom?.id ?? null,
            uomCode: line.uomCode,
            purpose: line.purpose,
          })),
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_request.created",
        entityType: "PurchaseRequest",
        entityId: request.id,
        afterData: {
          status: request.status,
        },
        metadata: {
          source: "purchase-request-draft",
          lineCount: resolvedLines.length,
          lineItemCodes: resolvedLines.map(
            (line) => line.item?.itemCode ?? null,
          ),
          lineUomCodes: resolvedLines.map((line) => line.uomCode),
          budgetLineCodes: resolvedLines.map(
            (line) => line.budgetLine?.code ?? null,
          ),
          estimatedTotalAmount,
          emergencyReview: {
            isEmergency,
            slaStatus: emergencySlaStatus,
            slaLabel: getPurchaseRequestSlaLabel(emergencySlaStatus),
            reason: values.emergencyReason?.trim() || null,
            evidenceReference: values.emergencyEvidenceReference?.trim() || null,
            estimatedTotalAmount,
            capAmount: purchasingPolicy.emergencyMaxAmountPhp,
          },
          purchasingPolicy: {
            standardApprovalThresholdPhp:
              purchasingPolicy.standardApprovalThresholdPhp,
            highValueApprovalThresholdPhp:
              purchasingPolicy.highValueApprovalThresholdPhp,
            seniorApprovalThresholdPhp:
              purchasingPolicy.seniorApprovalThresholdPhp,
            emergencyMaxAmountPhp: purchasingPolicy.emergencyMaxAmountPhp,
            quotationRequiredThresholdPhp:
              purchasingPolicy.quotationRequiredThresholdPhp,
            minimumQuotes: purchasingPolicy.minimumQuotes,
          },
        },
      },
    });

    return request;
  });

  const request = await getPurchaseRequest(session, created.id);
  if (!request) {
    throw new Error("PURCHASE_REQUEST_NOT_FOUND_AFTER_CREATE");
  }
  return request;
}

export async function submitPurchaseRequest(id: string) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseRequestSubmit);
  const existing = await getPurchaseRequest(session, id);
  if (!existing) {
    throw new Error("PURCHASE_REQUEST_NOT_FOUND");
  }
  if (existing.status !== "DRAFT") {
    throw new Error("INVALID_STATUS_TRANSITION");
  }

  await prisma.$transaction(async (tx) => {
    const route = resolvePurchaseRequestApprovalRule({
      rules: await findPurchaseRequestApprovalRule(tx, session),
      isEmergency: existing.isEmergency,
    });
    const approvalRule = route.approvalRule;

    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("APPROVAL_RULE_NOT_CONFIGURED");
    }

    const firstStep = approvalRule.steps[0];
    if (!firstStep) {
      throw new Error("APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }

    await tx.purchaseRequest.update({
      where: { id },
      data: {
        status: "PENDING_APPROVAL",
        currentApprovalStep: firstStep.stepOrder,
        version: { increment: 1 },
      },
    });

    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "PurchaseRequest",
        documentId: id,
        approvalRuleId: approvalRule.id,
        status: "PENDING",
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: approvalRule.steps.map((step, index) => ({
            stepOrder: step.stepOrder,
            assignedUserId: step.userId,
            assignedRoleId: step.roleId,
            status: index === 0 ? "PENDING" : "WAITING",
          })),
        },
      },
    });

    const auditEvent = await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_request.submitted",
        entityType: "PurchaseRequest",
        entityId: id,
        beforeData: {
          status: "DRAFT",
        },
        afterData: {
          status: "PENDING_APPROVAL",
          currentApprovalStep: firstStep.stepOrder,
        },
        metadata: {
          approvalRuleId: approvalRule.id,
          approvalRouteType: route.routeType,
          emergencyFallbackUsed: route.fallbackUsed,
          emergencyReview: {
            isEmergency: existing.isEmergency,
            slaStatus: existing.slaStatus,
            slaLabel: existing.slaLabel,
          },
        },
      },
    });

    const recipientUserIds = await resolveScopedNotificationRecipients(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: session.context.locationId,
      assignedUserId: firstStep.userId,
      assignedRoleId: firstStep.roleId,
    });
    await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: session.context.locationId,
      recipientUserIds,
      notificationType: "APPROVE_PURCHASE_REQUEST",
      priority: "NORMAL",
      title: `Approve Purchase Request ${existing.publicReference}`,
      body: `${session.user.displayName} submitted ${existing.publicReference} for ${session.context.locationName}.`,
      deepLink: `/approvals/${approvalInstance.id}`,
      entityType: "PurchaseRequest",
      entityId: id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalStepOrder: firstStep.stepOrder,
        publicReference: existing.publicReference,
        approvalRouteType: route.routeType,
        emergencyFallbackUsed: route.fallbackUsed,
        emergencySlaStatus: existing.slaStatus,
      },
    });
  });

  const request = await getPurchaseRequest(session, id);
  if (!request) {
    throw new Error("PURCHASE_REQUEST_NOT_FOUND_AFTER_SUBMIT");
  }
  return request;
}

export function assertCanReopenReturnedPurchaseRequest(
  status: PurchaseRequestStatus,
) {
  if (status !== "RETURNED") {
    throw new Error("INVALID_STATUS_TRANSITION");
  }
}

export function assertCanCancelPurchaseRequest(status: PurchaseRequestStatus) {
  if (!["DRAFT", "RETURNED"].includes(status)) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }
}

export async function reopenReturnedPurchaseRequest(id: string) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseRequestSubmit);
  const existing = await getPurchaseRequest(session, id);
  if (!existing) {
    throw new Error("PURCHASE_REQUEST_NOT_FOUND");
  }
  if (existing.requesterUserId !== session.user.id) {
    throw new Error("REQUESTER_ONLY_ACTION");
  }
  assertCanReopenReturnedPurchaseRequest(existing.status);

  await prisma.$transaction(async (tx) => {
    await tx.purchaseRequest.update({
      where: { id },
      data: {
        status: "DRAFT",
        currentApprovalStep: null,
        version: { increment: 1 },
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_request.reopened",
        entityType: "PurchaseRequest",
        entityId: id,
        beforeData: {
          status: "RETURNED",
        },
        afterData: {
          status: "DRAFT",
        },
        metadata: {
          source: "returned-request-revision",
        },
      },
    });

  });

  const request = await getPurchaseRequest(session, id);
  if (!request) {
    throw new Error("PURCHASE_REQUEST_NOT_FOUND_AFTER_REOPEN");
  }
  return request;
}

export async function cancelPurchaseRequest(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseRequestSubmit);
  const values = cancelPurchaseRequestSchema.parse(
    Object.fromEntries(formData),
  );
  const existing = await getPurchaseRequest(session, values.id);
  if (!existing) {
    throw new Error("PURCHASE_REQUEST_NOT_FOUND");
  }
  if (existing.requesterUserId !== session.user.id) {
    throw new Error("REQUESTER_ONLY_ACTION");
  }
  assertCanCancelPurchaseRequest(existing.status);

  await prisma.$transaction(async (tx) => {
    await tx.purchaseRequest.update({
      where: { id: values.id },
      data: {
        status: "CANCELLED",
        currentApprovalStep: null,
        version: { increment: 1 },
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_request.cancelled",
        entityType: "PurchaseRequest",
        entityId: values.id,
        beforeData: {
          status: existing.status,
        },
        afterData: {
          status: "CANCELLED",
        },
        metadata: {
          reason: values.reason,
        },
      },
    });

    for (const line of existing.lines) {
      if (!line.budgetLineId) {
        continue;
      }
      await reverseBudgetCommitmentFromApprovedSourceEvent(tx, session, {
        sourceType: "PURCHASE_REQUEST",
        sourceId: existing.id,
        sourceEventKey: `purchase_request.approved:${line.id}`,
        reversalEventKey: `purchase_request.cancelled:${line.id}`,
        reason: values.reason,
      });
    }
  });

  const request = await getPurchaseRequest(session, values.id);
  if (!request) {
    throw new Error("PURCHASE_REQUEST_NOT_FOUND_AFTER_CANCEL");
  }
  return request;
}

export async function completeEmergencyPurchasePostReview(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseRequestApprove);
  const values = completeEmergencyPurchasePostReviewSchema.parse(
    Object.fromEntries(formData),
  );
  const existing = await getPurchaseRequest(session, values.id);
  if (!existing) {
    throw new Error("PURCHASE_REQUEST_NOT_FOUND");
  }
  if (!existing.isEmergency) {
    throw new Error("EMERGENCY_PURCHASE_POST_REVIEW_NOT_REQUIRED");
  }
  if (!["APPROVED", "REJECTED", "CANCELLED"].includes(existing.status)) {
    throw new Error("EMERGENCY_PURCHASE_POST_REVIEW_NOT_READY");
  }
  if (existing.requesterUserId === session.user.id) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }
  if (existing.emergencyPostReviewCompleted) {
    throw new Error("EMERGENCY_PURCHASE_POST_REVIEW_ALREADY_COMPLETED");
  }

  await prisma.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      actorUserId: session.user.id,
      eventType: "purchase_request.emergency_post_review.completed",
      entityType: "PurchaseRequest",
      entityId: values.id,
      beforeData: {
        emergencyPostReviewCompleted: false,
      },
      afterData: {
        emergencyPostReviewCompleted: true,
        reviewOutcome: values.reviewOutcome,
      },
      metadata: {
        source: "emergency-purchase-post-review",
        sourceDecisionId: "DEC-0036",
        reviewOutcome: values.reviewOutcome,
        reason: values.reason,
        evidenceReference: values.evidenceReference,
        statusAtReview: existing.status,
        publicReference: existing.publicReference,
      },
    },
  });

  const request = await getPurchaseRequest(session, values.id);
  if (!request) {
    throw new Error("PURCHASE_REQUEST_NOT_FOUND_AFTER_POST_REVIEW");
  }
  return request;
}

export async function addPurchaseRequestComment(formData: FormData) {
  const session = await requireSessionContext();
  const values = addPurchaseRequestCommentSchema.parse(
    Object.fromEntries(formData),
  );
  const request = await findPurchaseRequestRecord(
    session,
    values.purchaseRequestId,
  );
  if (!request) {
    throw new Error("PURCHASE_REQUEST_NOT_FOUND");
  }
  assertAuthorizedLocation(session, request.requestLocationId);

  await prisma.$transaction(async (tx) => {
    await tx.purchaseRequestComment.create({
      data: {
        purchaseRequestId: request.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        authorUserId: session.user.id,
        body: values.body,
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_request.comment_added",
        entityType: "PurchaseRequest",
        entityId: request.id,
        metadata: {
          bodyLength: values.body.length,
        },
      },
    });
  });

  const updated = await getPurchaseRequest(session, request.id);
  if (!updated) {
    throw new Error("PURCHASE_REQUEST_NOT_FOUND_AFTER_COMMENT");
  }
  return updated;
}
