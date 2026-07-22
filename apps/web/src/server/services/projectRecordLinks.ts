import { prisma } from "@ogfi/database";
import { z } from "zod";
import { recordSessionDeniedDecisionSafely } from "./authorizationDenials";
import {
  canReadPurchaseOrders,
  canUseApprovals,
  canUsePurchaseRequests,
  canUseReceiving,
  canUseStockAdjustments,
  canUseTransfers,
  canUseWastageReports,
  permissions
} from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";
import { canMutateProjectWork } from "./projectTasks";
import { findAuthorizedProject, listAuthorizedProjectAccess } from "./projects";

const sourceRecordTypes = [
  "PURCHASE_REQUEST",
  "PURCHASE_ORDER",
  "GOODS_RECEIPT",
  "INVENTORY_TRANSFER",
  "SUPPLIER",
  "INVENTORY_MOVEMENT",
  "INVENTORY_BALANCE",
  "APPROVAL_INSTANCE",
  "WASTAGE_REPORT",
  "STOCK_ADJUSTMENT"
] as const;

export type ProjectLinkSourceRecordType = (typeof sourceRecordTypes)[number];

export type SafeSourceSummary = {
  sourceRecordType: ProjectLinkSourceRecordType;
  sourceRecordId?: string;
  visible: boolean;
  label: string;
  status?: string;
  scopeLabel?: string;
  primaryDate?: string;
  href?: string;
  redactionReason?: "SOURCE_PERMISSION_DENIED" | "NOT_FOUND";
};

export type ProjectRecordLinkSummary = SafeSourceSummary & {
  id: string;
  projectId: string;
  taskId: string | null;
  milestoneId: string | null;
  relationType: string;
  linkLabel: string;
  createdAt: string;
};

const createLinkSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional(),
  requirementId: z.string().uuid().optional(),
  sourceRecordType: z.enum(sourceRecordTypes),
  sourceRecordId: z.string().trim().min(2).max(120),
  relationType: z.string().trim().min(2).max(80).default("RELATED"),
  linkLabel: z.string().trim().min(2).max(120)
});

const archiveLinkSchema = z.object({
  linkId: z.string().uuid(),
  archiveReason: z.string().trim().min(5).max(1000)
});

function restrictedSummary(sourceRecordType: ProjectLinkSourceRecordType): SafeSourceSummary {
  return {
    sourceRecordType,
    visible: false,
    label: "Restricted linked record",
    redactionReason: "SOURCE_PERMISSION_DENIED"
  };
}

async function logProjectRecordLinkDenied(input: {
  session: SessionContext;
  projectId: string;
  taskId?: string | null;
  milestoneId?: string | null;
  sourceRecordType: ProjectLinkSourceRecordType;
  sourceRecordId: string;
  reasonCode: string;
  attemptedAction: "CREATE" | "READ";
}) {
  await recordSessionDeniedDecisionSafely(input.session, {
    action: input.attemptedAction === "READ" ? "READ" : "CREATE",
    reason: "RESOURCE_HIDDEN",
    resource: "PROJECTS"
  });
}

export function assertSafeSourceSummary(summary: SafeSourceSummary) {
  if (!summary.visible) {
    if (
      summary.sourceRecordId ||
      summary.status ||
      summary.scopeLabel ||
      summary.primaryDate ||
      summary.href
    ) {
      throw new Error("PROJECT_LINK_REDACTION_LEAK");
    }
    if (summary.label !== "Restricted linked record") {
      throw new Error("PROJECT_LINK_REDACTION_LABEL_INVALID");
    }
  }
}

async function resolvePurchaseRequestSummary(
  session: SessionContext,
  sourceRecordId: string
): Promise<SafeSourceSummary> {
  if (!canUsePurchaseRequests(session.permissionCodes)) {
    return restrictedSummary("PURCHASE_REQUEST");
  }
  const record = await prisma.purchaseRequest.findFirst({
    where: {
      OR: [{ id: sourceRecordId }, { publicReference: sourceRecordId }],
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      requestLocationId: session.context.locationId
    },
    include: { requestLocation: true }
  });
  if (!record) {
    return restrictedSummary("PURCHASE_REQUEST");
  }
  return {
    sourceRecordType: "PURCHASE_REQUEST",
    sourceRecordId: record.id,
    visible: true,
    label: record.publicReference,
    status: record.status,
    scopeLabel: record.requestLocation.name,
    primaryDate: record.requiredDate.toISOString().slice(0, 10),
    href: `/purchase-requests/${record.id}`
  };
}

async function resolvePurchaseOrderSummary(
  session: SessionContext,
  sourceRecordId: string
): Promise<SafeSourceSummary> {
  if (!canReadPurchaseOrders(session.permissionCodes)) {
    return restrictedSummary("PURCHASE_ORDER");
  }
  const record = await prisma.purchaseOrder.findFirst({
    where: {
      OR: [{ id: sourceRecordId }, { publicReference: sourceRecordId }],
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      deliveryLocationId: session.context.locationId
    },
    include: { deliveryLocation: true }
  });
  if (!record) {
    return restrictedSummary("PURCHASE_ORDER");
  }
  return {
    sourceRecordType: "PURCHASE_ORDER",
    sourceRecordId: record.id,
    visible: true,
    label: record.publicReference,
    status: record.status,
    scopeLabel: record.deliveryLocation.name,
    primaryDate: record.expectedDeliveryDate.toISOString().slice(0, 10),
    href: `/purchase-orders/${record.id}`
  };
}

async function resolveGoodsReceiptSummary(
  session: SessionContext,
  sourceRecordId: string
): Promise<SafeSourceSummary> {
  if (!canUseReceiving(session.permissionCodes)) {
    return restrictedSummary("GOODS_RECEIPT");
  }
  const record = await prisma.goodsReceipt.findFirst({
    where: {
      OR: [{ id: sourceRecordId }, { publicReference: sourceRecordId }],
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      receivingLocationId: session.context.locationId
    },
    include: { receivingLocation: true }
  });
  if (!record) {
    return restrictedSummary("GOODS_RECEIPT");
  }
  return {
    sourceRecordType: "GOODS_RECEIPT",
    sourceRecordId: record.id,
    visible: true,
    label: record.publicReference,
    status: record.status,
    scopeLabel: record.receivingLocation.name,
    primaryDate: record.receivedAt.toISOString().slice(0, 10),
    href: `/receiving/${record.id}`
  };
}

async function resolveTransferSummary(
  session: SessionContext,
  sourceRecordId: string
): Promise<SafeSourceSummary> {
  if (!canUseTransfers(session.permissionCodes)) {
    return restrictedSummary("INVENTORY_TRANSFER");
  }
  const record = await prisma.inventoryTransfer.findFirst({
    where: {
      AND: [
        { OR: [{ id: sourceRecordId }, { publicReference: sourceRecordId }] },
        {
          OR: [
            { sourceLocationId: session.context.locationId },
            { destinationLocationId: session.context.locationId }
          ]
        }
      ],
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    include: {
      sourceLocation: true,
      destinationLocation: true
    }
  });
  if (!record) {
    return restrictedSummary("INVENTORY_TRANSFER");
  }
  const primaryDate = record.requiredByDate?.toISOString().slice(0, 10);
  return {
    sourceRecordType: "INVENTORY_TRANSFER",
    sourceRecordId: record.id,
    visible: true,
    label: record.publicReference,
    status: record.status,
    scopeLabel: `${record.sourceLocation.name} to ${record.destinationLocation.name}`,
    ...(primaryDate ? { primaryDate } : {}),
    href: `/transfers/${record.id}`
  };
}

async function resolveSupplierSummary(
  session: SessionContext,
  sourceRecordId: string
): Promise<SafeSourceSummary> {
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    return restrictedSummary("SUPPLIER");
  }
  const record = await prisma.supplier.findFirst({
    where: {
      id: sourceRecordId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    }
  });
  if (!record) {
    return restrictedSummary("SUPPLIER");
  }
  return {
    sourceRecordType: "SUPPLIER",
    sourceRecordId: record.id,
    visible: true,
    label: record.supplierCode,
    status: record.status,
    scopeLabel: "Company supplier master",
    href: "/suppliers"
  };
}

async function hasProjectLinkApprovalScope(session: SessionContext, locationId: string) {
  const location = await prisma.location.findFirst({
    where: {
      id: locationId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    select: { companyId: true, brandId: true }
  });
  if (!location) {
    return false;
  }

  const assignment = await prisma.userScopeAssignment.findFirst({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      accessLevel: { in: ["APPROVE", "MANAGE"] },
      OR: [
        { scopeType: "LOCATION", scopeId: locationId },
        { scopeType: "COMPANY", scopeId: location.companyId },
        ...(location.brandId
          ? [{ scopeType: "BRAND" as const, scopeId: location.brandId }]
          : [])
      ]
    },
    select: { id: true }
  });

  return Boolean(assignment);
}

async function isAssignedToPendingApprovalStep(
  session: SessionContext,
  approvalInstanceId: string
) {
  const assignments = await prisma.userRoleAssignment.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE"
    },
    select: { roleId: true }
  });
  const roleIds = assignments.map((assignment) => assignment.roleId);
  const step = await prisma.approvalInstanceStep.findFirst({
    where: {
      approvalInstanceId,
      status: "PENDING",
      OR: [
        { assignedUserId: session.user.id },
        { assignedRoleId: { in: roleIds } }
      ]
    },
    select: { id: true }
  });

  return Boolean(step);
}

async function resolveApprovalSourceVisibility(
  session: SessionContext,
  documentType: string,
  documentId: string
) {
  if (documentType === "QuotationRecommendation") {
    if (!session.permissionCodes.includes(permissions.quoteApprove)) {
      return null;
    }
    const recommendation = await prisma.quotationRecommendation.findFirst({
      where: {
        id: documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      include: {
        preparedBy: true,
        quotationRequest: { include: { purchaseRequest: { include: { requestLocation: true } } } }
      }
    });
    const request = recommendation?.quotationRequest.purchaseRequest;
    if (
      !recommendation ||
      !request ||
      recommendation.preparedByUserId === session.user.id ||
      request.requesterUserId === session.user.id ||
      !(await hasProjectLinkApprovalScope(session, request.requestLocationId))
    ) {
      return null;
    }
    return {
      label: request.publicReference,
      scopeLabel: request.requestLocation.name,
      primaryDate: request.requiredDate.toISOString().slice(0, 10)
    };
  }

  if (documentType === "PurchaseOrder") {
    if (!session.permissionCodes.includes(permissions.purchaseOrderApprove)) {
      return null;
    }
    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id: documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      include: {
        deliveryLocation: true,
        purchaseRequest: true,
        quotationRecommendation: true
      }
    });
    if (
      !order ||
      order.createdByUserId === session.user.id ||
      order.purchaseRequest.requesterUserId === session.user.id ||
      order.quotationRecommendation.preparedByUserId === session.user.id ||
      !(await hasProjectLinkApprovalScope(session, order.deliveryLocationId))
    ) {
      return null;
    }
    return {
      label: order.publicReference,
      scopeLabel: order.deliveryLocation.name,
      primaryDate: order.expectedDeliveryDate.toISOString().slice(0, 10)
    };
  }

  if (documentType === "PurchaseOrderBalanceClosure") {
    if (!session.permissionCodes.includes(permissions.purchaseOrderApprove)) {
      return null;
    }
    const closure = await prisma.purchaseOrderBalanceClosure.findFirst({
      where: {
        id: documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      include: {
        purchaseOrder: {
          include: {
            deliveryLocation: true,
            purchaseRequest: true,
            quotationRecommendation: true
          }
        }
      }
    });
    const order = closure?.purchaseOrder;
    if (
      !closure ||
      !order ||
      closure.requestedByUserId === session.user.id ||
      order.createdByUserId === session.user.id ||
      order.purchaseRequest.requesterUserId === session.user.id ||
      order.quotationRecommendation.preparedByUserId === session.user.id ||
      !(await hasProjectLinkApprovalScope(session, order.deliveryLocationId))
    ) {
      return null;
    }
    return {
      label: order.publicReference,
      scopeLabel: order.deliveryLocation.name,
      primaryDate: closure.requestedAt.toISOString().slice(0, 10)
    };
  }

  if (documentType === "WastageReport") {
    if (!session.permissionCodes.includes(permissions.wastageApprove)) {
      return null;
    }
    const report = await prisma.wastageReport.findFirst({
      where: {
        id: documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      include: { inventoryLocation: { include: { location: true } } }
    });
    if (
      !report ||
      report.reportedByUserId === session.user.id ||
      !(await hasProjectLinkApprovalScope(session, report.inventoryLocation.locationId))
    ) {
      return null;
    }
    return {
      label: report.publicReference,
      scopeLabel: report.inventoryLocation.location.name,
      primaryDate: (report.submittedAt ?? report.createdAt).toISOString().slice(0, 10)
    };
  }

  if (documentType === "StockAdjustment") {
    if (!session.permissionCodes.includes(permissions.stockAdjustmentApprove)) {
      return null;
    }
    const adjustment = await prisma.stockAdjustment.findFirst({
      where: {
        id: documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      include: { inventoryLocation: { include: { location: true } } }
    });
    if (
      !adjustment ||
      adjustment.requestedByUserId === session.user.id ||
      !(await hasProjectLinkApprovalScope(
        session,
        adjustment.inventoryLocation.locationId
      ))
    ) {
      return null;
    }
    return {
      label: adjustment.publicReference,
      scopeLabel: adjustment.inventoryLocation.location.name,
      primaryDate: (adjustment.submittedAt ?? adjustment.createdAt)
        .toISOString()
        .slice(0, 10)
    };
  }

  if (!session.permissionCodes.includes(permissions.purchaseRequestApprove)) {
    return null;
  }
  const request = await prisma.purchaseRequest.findFirst({
    where: {
      id: documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING_APPROVAL"
    },
    include: { requestLocation: true }
  });
  if (
    !request ||
    request.requesterUserId === session.user.id ||
    !(await hasProjectLinkApprovalScope(session, request.requestLocationId))
  ) {
    return null;
  }
  return {
    label: request.publicReference,
    scopeLabel: request.requestLocation.name,
    primaryDate: request.requiredDate.toISOString().slice(0, 10)
  };
}

async function resolveInventoryMovementSummary(
  session: SessionContext,
  sourceRecordId: string
): Promise<SafeSourceSummary> {
  if (!session.permissionCodes.includes(permissions.inventoryLedgerView)) {
    return restrictedSummary("INVENTORY_MOVEMENT");
  }
  const record = await prisma.inventoryMovement.findFirst({
    where: {
      id: sourceRecordId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      inventoryLocation: {
        locationId: session.context.locationId
      }
    },
    include: {
      inventoryLocation: true,
      item: true
    }
  });
  if (!record) {
    return restrictedSummary("INVENTORY_MOVEMENT");
  }
  return {
    sourceRecordType: "INVENTORY_MOVEMENT",
    sourceRecordId: record.id,
    visible: true,
    label: `${record.movementType} / ${record.item.itemCode}`,
    status: record.sourceDocumentType,
    scopeLabel: record.inventoryLocation.name,
    primaryDate: record.occurredAt.toISOString().slice(0, 10),
    href: `/inventory/ledger?query=${encodeURIComponent(record.sourceDocumentType)}`
  };
}

async function resolveInventoryBalanceSummary(
  session: SessionContext,
  sourceRecordId: string
): Promise<SafeSourceSummary> {
  if (!session.permissionCodes.includes(permissions.inventoryBalanceView)) {
    return restrictedSummary("INVENTORY_BALANCE");
  }
  const record = await prisma.inventoryBalance.findFirst({
    where: {
      id: sourceRecordId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      inventoryLocation: {
        locationId: session.context.locationId
      }
    },
    include: {
      inventoryLocation: true,
      item: true,
      baseUom: true
    }
  });
  if (!record) {
    return restrictedSummary("INVENTORY_BALANCE");
  }
  return {
    sourceRecordType: "INVENTORY_BALANCE",
    sourceRecordId: record.id,
    visible: true,
    label: `${record.item.itemCode} ${record.item.itemName} / ${Number(record.qtyOnHand)} ${record.baseUom.uomCode}`,
    scopeLabel: record.inventoryLocation.name,
    primaryDate: record.updatedAt.toISOString().slice(0, 10),
    href: `/inventory?query=${encodeURIComponent(record.item.itemCode)}`
  };
}

async function resolveApprovalInstanceSummary(
  session: SessionContext,
  sourceRecordId: string
): Promise<SafeSourceSummary> {
  if (!canUseApprovals(session.permissionCodes)) {
    return restrictedSummary("APPROVAL_INSTANCE");
  }
  const record = await prisma.approvalInstance.findFirst({
    where: {
      id: sourceRecordId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING"
    }
  });
  if (!record) {
    return restrictedSummary("APPROVAL_INSTANCE");
  }
  if (!(await isAssignedToPendingApprovalStep(session, record.id))) {
    return restrictedSummary("APPROVAL_INSTANCE");
  }
  const sourceVisibility = await resolveApprovalSourceVisibility(
    session,
    record.documentType,
    record.documentId
  );
  if (!sourceVisibility) {
    return restrictedSummary("APPROVAL_INSTANCE");
  }
  return {
    sourceRecordType: "APPROVAL_INSTANCE",
    sourceRecordId: record.id,
    visible: true,
    label: `${record.documentType} approval / ${sourceVisibility.label}`,
    status: record.status,
    scopeLabel: sourceVisibility.scopeLabel,
    primaryDate: sourceVisibility.primaryDate,
    href: "/approvals"
  };
}

async function resolveWastageReportSummary(
  session: SessionContext,
  sourceRecordId: string
): Promise<SafeSourceSummary> {
  if (!canUseWastageReports(session.permissionCodes)) {
    return restrictedSummary("WASTAGE_REPORT");
  }
  const record = await prisma.wastageReport.findFirst({
    where: {
      id: sourceRecordId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      inventoryLocation: {
        locationId: session.context.locationId
      }
    },
    include: { inventoryLocation: true }
  });
  if (!record) {
    return restrictedSummary("WASTAGE_REPORT");
  }
  return {
    sourceRecordType: "WASTAGE_REPORT",
    sourceRecordId: record.id,
    visible: true,
    label: record.publicReference,
    status: record.status,
    scopeLabel: record.inventoryLocation.name,
    primaryDate: record.createdAt.toISOString().slice(0, 10),
    href: "/wastage"
  };
}

async function resolveStockAdjustmentSummary(
  session: SessionContext,
  sourceRecordId: string
): Promise<SafeSourceSummary> {
  if (!canUseStockAdjustments(session.permissionCodes)) {
    return restrictedSummary("STOCK_ADJUSTMENT");
  }
  const record = await prisma.stockAdjustment.findFirst({
    where: {
      id: sourceRecordId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      inventoryLocation: {
        locationId: session.context.locationId
      }
    },
    include: { inventoryLocation: true }
  });
  if (!record) {
    return restrictedSummary("STOCK_ADJUSTMENT");
  }
  return {
    sourceRecordType: "STOCK_ADJUSTMENT",
    sourceRecordId: record.id,
    visible: true,
    label: record.publicReference,
    status: record.status,
    scopeLabel: record.inventoryLocation.name,
    primaryDate: record.createdAt.toISOString().slice(0, 10),
    href: "/adjustments"
  };
}

export async function resolveProjectRecordLinkSourceSummary(
  session: SessionContext,
  sourceRecordType: ProjectLinkSourceRecordType,
  sourceRecordId: string
) {
  if (sourceRecordType === "PURCHASE_REQUEST") {
    return resolvePurchaseRequestSummary(session, sourceRecordId);
  }
  if (sourceRecordType === "PURCHASE_ORDER") {
    return resolvePurchaseOrderSummary(session, sourceRecordId);
  }
  if (sourceRecordType === "GOODS_RECEIPT") {
    return resolveGoodsReceiptSummary(session, sourceRecordId);
  }
  if (sourceRecordType === "INVENTORY_TRANSFER") {
    return resolveTransferSummary(session, sourceRecordId);
  }
  if (sourceRecordType === "SUPPLIER") {
    return resolveSupplierSummary(session, sourceRecordId);
  }
  if (sourceRecordType === "INVENTORY_MOVEMENT") {
    return resolveInventoryMovementSummary(session, sourceRecordId);
  }
  if (sourceRecordType === "INVENTORY_BALANCE") {
    return resolveInventoryBalanceSummary(session, sourceRecordId);
  }
  if (sourceRecordType === "APPROVAL_INSTANCE") {
    return resolveApprovalInstanceSummary(session, sourceRecordId);
  }
  if (sourceRecordType === "WASTAGE_REPORT") {
    return resolveWastageReportSummary(session, sourceRecordId);
  }
  return resolveStockAdjustmentSummary(session, sourceRecordId);
}

async function assertProjectMutationAccess(session: SessionContext, projectId: string) {
  const project = await findAuthorizedProject(session, projectId);
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  const access = await listAuthorizedProjectAccess(session);
  const canMutate = canMutateProjectWork({
    project,
    userId: session.user.id,
    permissionCodes: session.permissionCodes,
    hasCompanyManage: access.canMutateByProjectId.get(projectId) ?? false
  });
  if (!canMutate) {
    throw new Error("PROJECT_LINK_PERMISSION_DENIED");
  }
}

async function assertLinkContext(session: SessionContext, values: z.infer<typeof createLinkSchema>) {
  if ([values.taskId, values.milestoneId, values.requirementId].filter(Boolean).length > 1) {
    throw new Error("PROJECT_LINK_CONTEXT_INVALID");
  }

  if (values.taskId) {
    const task = await prisma.projectTask.findFirst({
      where: {
        id: values.taskId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        archivedAt: null
      },
      select: { id: true }
    });
    if (!task) {
      throw new Error("PROJECT_LINK_CONTEXT_INVALID");
    }
  }

  if (values.milestoneId) {
    const milestone = await prisma.projectMilestone.findFirst({
      where: {
        id: values.milestoneId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        archivedAt: null
      },
      select: { id: true }
    });
    if (!milestone) {
      throw new Error("PROJECT_LINK_CONTEXT_INVALID");
    }
  }

  if (values.requirementId) {
    const requirement = await prisma.projectRequirement.findFirst({
      where: {
        id: values.requirementId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        archivedAt: null,
        status: { in: ["PENDING", "RETURNED"] }
      },
      select: { id: true }
    });
    if (!requirement) {
      throw new Error("PROJECT_LINK_CONTEXT_INVALID");
    }
  }
}

export async function listProjectTaskRecordLinks(session: SessionContext, taskId: string) {
  const task = await prisma.projectTask.findFirst({
    where: {
      id: taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    select: { id: true, projectId: true }
  });
  if (!task) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }
  const project = await findAuthorizedProject(session, task.projectId);
  if (!project) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }

  const links = await prisma.projectRecordLink.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      projectId: task.projectId,
      taskId,
      archivedAt: null
    },
    orderBy: { createdAt: "desc" }
  });

  const summaries = await Promise.all(
    links.map(async (link) => {
      const summary = await resolveProjectRecordLinkSourceSummary(
        session,
        link.sourceRecordType as ProjectLinkSourceRecordType,
        link.sourceRecordId
      );
      assertSafeSourceSummary(summary);
      return { link, summary };
    })
  );
  const firstDenied = summaries.find(({ summary }) => !summary.visible);
  if (firstDenied) {
    await logProjectRecordLinkDenied({
      session,
      projectId: firstDenied.link.projectId,
      taskId: firstDenied.link.taskId,
      milestoneId: firstDenied.link.milestoneId,
      sourceRecordType:
        firstDenied.link.sourceRecordType as ProjectLinkSourceRecordType,
      sourceRecordId: firstDenied.link.sourceRecordId,
      reasonCode:
        firstDenied.summary.redactionReason ?? "SOURCE_PERMISSION_DENIED",
      attemptedAction: "READ"
    });
  }
  return summaries.map(
    ({ link, summary }): ProjectRecordLinkSummary => ({
        ...summary,
        id: link.id,
        projectId: link.projectId,
        taskId: link.taskId,
        milestoneId: link.milestoneId,
        relationType: link.relationType,
        linkLabel: link.linkLabel,
        createdAt: link.createdAt.toISOString()
      })
  );
}

export async function createProjectRecordLink(formData: FormData) {
  const session = await requireSessionContext();
  const values = createLinkSchema.parse({
    projectId: formData.get("projectId"),
    taskId: formData.get("taskId") || undefined,
    milestoneId: formData.get("milestoneId") || undefined,
    requirementId: formData.get("requirementId") || undefined,
    sourceRecordType: formData.get("sourceRecordType"),
    sourceRecordId: formData.get("sourceRecordId"),
    relationType: formData.get("relationType") || "RELATED",
    linkLabel: formData.get("linkLabel")
  });
  await assertProjectMutationAccess(session, values.projectId);
  await assertLinkContext(session, values);

  const summary = await resolveProjectRecordLinkSourceSummary(
    session,
    values.sourceRecordType,
    values.sourceRecordId
  );
  if (!summary.visible || !summary.sourceRecordId) {
    await logProjectRecordLinkDenied({
      session,
      projectId: values.projectId,
      taskId: values.taskId ?? null,
      milestoneId: values.milestoneId ?? null,
      sourceRecordType: values.sourceRecordType,
      sourceRecordId: values.sourceRecordId,
      reasonCode: summary.redactionReason ?? "SOURCE_PERMISSION_DENIED",
      attemptedAction: "CREATE"
    });
    throw new Error("PROJECT_LINK_SOURCE_DENIED");
  }

  const created = await prisma.$transaction(async (tx) => {
    const link = await tx.projectRecordLink.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        taskId: values.taskId ?? null,
        milestoneId: values.milestoneId ?? null,
        requirementId: values.requirementId ?? null,
        sourceRecordType: values.sourceRecordType,
        sourceRecordId: summary.sourceRecordId!,
        relationType: values.relationType,
        linkLabel: values.linkLabel,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id
      }
    });
    await tx.projectActivityEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        actorUserId: session.user.id,
        eventType: "project_record_link.created",
        entityType: "ProjectRecordLink",
        entityId: link.id,
        afterData: {
          sourceRecordType: link.sourceRecordType,
          relationType: link.relationType,
          taskId: link.taskId,
          milestoneId: link.milestoneId,
          requirementId: link.requirementId
        },
        metadata: { source: "project-record-links-foundation" }
      }
    });

    return link;
  });

  return created.id;
}

export async function archiveProjectRecordLink(formData: FormData) {
  const session = await requireSessionContext();
  const values = archiveLinkSchema.parse({
    linkId: formData.get("linkId"),
    archiveReason: formData.get("archiveReason")
  });
  const link = await prisma.projectRecordLink.findFirst({
    where: {
      id: values.linkId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    }
  });
  if (!link) {
    throw new Error("PROJECT_LINK_NOT_FOUND");
  }
  await assertProjectMutationAccess(session, link.projectId);

  await prisma.$transaction(async (tx) => {
    const archived = await tx.projectRecordLink.update({
      where: { id: link.id },
      data: {
        archivedAt: new Date(),
        archivedByUserId: session.user.id,
        archiveReason: values.archiveReason,
        updatedByUserId: session.user.id
      }
    });
    await tx.projectActivityEvent.create({
      data: {
        tenantId: link.tenantId,
        companyId: link.companyId,
        projectId: link.projectId,
        actorUserId: session.user.id,
        eventType: "project_record_link.archived",
        entityType: "ProjectRecordLink",
        entityId: link.id,
        reason: values.archiveReason,
        beforeData: {
          sourceRecordType: link.sourceRecordType,
          relationType: link.relationType,
          archivedAt: null
        },
        afterData: {
          sourceRecordType: archived.sourceRecordType,
          relationType: archived.relationType,
          archivedAt: archived.archivedAt?.toISOString() ?? null
        },
        metadata: { source: "project-record-links-foundation" }
      }
    });
  });
}
