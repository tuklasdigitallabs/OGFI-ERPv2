import { prisma } from "@ogfi/database";
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
  requiredDate: string;
  urgency: string;
  justification: string;
  status: PurchaseRequestStatus;
  currentApprovalStep: number | null;
  line: {
    itemId: string | null;
    itemName: string | null;
    uomId: string | null;
    description: string;
    requestedQty: number;
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

const optionalUuidSchema = z
  .string()
  .uuid()
  .optional()
  .or(z.literal("").transform(() => undefined));

const purchaseRequestLineInputSchema = z
  .object({
    itemId: optionalUuidSchema,
    description: z.string().min(2).max(240),
    requestedQty: z.coerce.number().positive(),
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
  urgency: z.string().min(1).max(80),
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
  const itemIds = getFormValues(formData, "lineItemId", "itemId");
  const uomIds = getFormValues(formData, "lineUomId", "uomId");
  const uomCodes = getFormValues(formData, "lineUomCode", "uomCode");
  const purposes = getFormValues(formData, "linePurpose", "purpose");
  const lineCount = Math.max(
    descriptions.length,
    quantities.length,
    itemIds.length,
    uomIds.length,
    uomCodes.length,
    purposes.length,
  );

  const lines = Array.from({ length: lineCount }, (_, index) => ({
    itemId: itemIds[index] ?? "",
    description: descriptions[index] ?? "",
    requestedQty: quantities[index] ?? "",
    uomId: uomIds[index] ?? "",
    uomCode: uomCodes[index] ?? "",
    purpose: purposes[index] ?? "",
  })).filter(
    (line) =>
      line.itemId.trim() ||
      line.description.trim() ||
      line.requestedQty.trim() ||
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

function toPurchaseRequest(
  record: PurchaseRequestRecord,
  auditEvents: AuditEventRecord[],
  approvalActions: ApprovalActionRecord[] = [],
): PurchaseRequest {
  const line = record.lines[0];
  if (!line) {
    throw new Error("PURCHASE_REQUEST_LINE_NOT_FOUND");
  }
  const lines = record.lines.map((requestLine) => ({
    id: requestLine.id,
    lineNumber: requestLine.lineNumber,
    itemId: requestLine.itemId,
    itemName: requestLine.item?.itemName ?? null,
    uomId: requestLine.uomId,
    description: requestLine.description,
    requestedQty: Number(requestLine.requestedQty),
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
    requiredDate: record.requiredDate.toISOString().slice(0, 10),
    urgency: record.urgency,
    justification: record.justification,
    status: record.status as PurchaseRequestStatus,
    currentApprovalStep: record.currentApprovalStep,
    line: {
      itemId: line.itemId,
      itemName: line.item?.itemName ?? null,
      uomId: line.uomId,
      description: line.description,
      requestedQty: Number(line.requestedQty),
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
    };
  }

  const [items, uoms] = await Promise.all([
    prisma.item.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
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
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
    })),
    uoms: uoms.map((uom) => ({
      id: uom.id,
      uomCode: uom.uomCode,
      uomName: uom.uomName,
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

  const itemIds = Array.from(
    new Set(lines.flatMap((line) => (line.itemId ? [line.itemId] : []))),
  );
  const uomIds = Array.from(
    new Set(lines.flatMap((line) => (line.uomId ? [line.uomId] : []))),
  );
  const [items, catalogUoms] = await Promise.all([
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
  ]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const uomById = new Map(catalogUoms.map((uom) => [uom.id, uom]));
  const resolvedLines = lines.map((line, index) => {
    const item = line.itemId ? itemById.get(line.itemId) : null;
    const catalogUom = line.uomId ? uomById.get(line.uomId) : null;
    if (line.itemId && !item) {
      throw new Error("PR_LINE_ITEM_NOT_FOUND");
    }
    if (line.uomId && !catalogUom) {
      throw new Error("PR_LINE_UOM_NOT_FOUND");
    }
    const uomCode = catalogUom?.uomCode ?? line.uomCode?.trim().toUpperCase();
    if (!uomCode) {
      throw new Error("PR_LINE_UOM_REQUIRED");
    }
    return {
      lineNumber: index + 1,
      item,
      catalogUom,
      description: line.description,
      requestedQty: line.requestedQty,
      uomCode,
      purpose: line.purpose,
    };
  });

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
            description: line.description,
            requestedQty: line.requestedQty,
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
    const approvalRule = await tx.approvalRule.findFirst({
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
  });

  const request = await getPurchaseRequest(session, values.id);
  if (!request) {
    throw new Error("PURCHASE_REQUEST_NOT_FOUND_AFTER_CANCEL");
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
