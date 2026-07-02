import { prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import {
  canUseApprovals,
  getGrantedPermissionCodes,
  permissions,
  requirePermission
} from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";
import { recordWorkflowNotifications } from "./notifications";
import {
  assertPurchaseOrderCanRequestAmendment,
  assertPurchaseOrderCanRequestBalanceClosure,
  buildPurchaseOrderAmendmentProposal,
  buildPurchaseOrderClosureLineSnapshot
} from "./purchaseOrders";
import { dateOnlyInTimeZone, daysBetweenDateOnly } from "./projectDates";

export type ApprovalQueueItem = {
  approvalInstanceId: string;
  documentType: string;
  documentId: string;
  publicReference: string;
  requesterName: string;
  locationName: string;
  requiredDate: string;
  status: string;
  currentStepOrder: number | null;
  lineDescription: string;
  policyFlagLabels?: string[];
  evidenceStatus?: string | null;
};

export type ApprovalDetail = ApprovalQueueItem & {
  approvalTitle: string;
  approvalKind:
    | "PurchaseRequest"
    | "QuotationRecommendation"
    | "PurchaseOrder"
    | "PurchaseOrderAmendment"
    | "PurchaseOrderBalanceClosure"
    | "WastageReport"
    | "StockAdjustment";
  justification: string;
  quantity: number;
  uomCode: string;
  amountLabel: string | null;
  selectedSupplierName: string | null;
  selectedQuoteReference: string | null;
  selectionReason: string | null;
  nonLowestJustification: string | null;
  singleSourceJustification: string | null;
  comments: Array<{
    id: string;
    authorName: string;
    body: string;
    createdAt: string;
  }>;
  auditEvents: Array<{
    id: string;
    eventType: string;
    occurredAt: string;
  }>;
};

type ApprovalReminderKind = "DUE_SOON" | "OVERDUE";

const approvalReminderConfig = {
  dueSoonWindowDays: 1,
  overdueReminderFrequencyDays: 1,
  maxOverdueRemindersPerApproval: 5
};

const wastagePolicyFlagLabels: Record<string, string> = {
  CATEGORY_PHOTO_REQUIRED: "Category photo required",
  HIGH_VALUE: "High-value wastage",
  EVIDENCE_REQUIRED: "Evidence required",
  EVIDENCE_MISSING: "Evidence missing",
  REPEAT_ITEM_LOCATION: "Repeat item/location pattern",
  REPEAT_REPORTER: "Repeat reporter pattern"
};

function formatWastagePolicyFlags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((flag): flag is string => typeof flag === "string")
    .map((flag) => wastagePolicyFlagLabels[flag] ?? flag);
}

const decisionSchema = z.object({
  approvalInstanceId: z.string().uuid(),
  remarks: z.string().max(1000).optional()
});

const remarksRequiredSchema = decisionSchema.extend({
  remarks: z.string().min(3).max(1000)
});

export function assertNotSelfApproval(requesterUserId: string, actorUserId: string) {
  if (requesterUserId === actorUserId) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }
}

async function getActiveRoleIds(session: SessionContext) {
  const assignments = await prisma.userRoleAssignment.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE"
    },
    select: { roleId: true }
  });
  return assignments.map((assignment) => assignment.roleId);
}

async function isAssignedToCurrentApprovalStep(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const step = await prisma.approvalInstanceStep.findFirst({
    where: {
      approvalInstanceId,
      status: "PENDING"
    },
    select: {
      assignedRoleId: true,
      assignedUserId: true
    }
  });

  if (!step) {
    return false;
  }

  const isAssignedUser = step.assignedUserId === session.user.id;
  const isAssignedRole = step.assignedRoleId
    ? roleIds.includes(step.assignedRoleId)
    : false;

  return isAssignedUser || isAssignedRole;
}

async function assertApprovalScope(session: SessionContext, locationId: string) {
  if (!(await hasApprovalScope(session, locationId))) {
    throw new Error("APPROVAL_SCOPE_DENIED");
  }
}

async function hasApprovalScope(session: SessionContext, locationId: string) {
  const location = await prisma.location.findFirst({
    where: {
      id: locationId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    select: {
      companyId: true,
      brandId: true
    }
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
        {
          scopeType: "LOCATION",
          scopeId: locationId
        },
        {
          scopeType: "COMPANY",
          scopeId: location.companyId
        },
        ...(location.brandId
          ? [
              {
                scopeType: "BRAND" as const,
                scopeId: location.brandId
              }
            ]
          : [])
      ]
    }
  });

  return Boolean(assignment);
}

async function findActionableApproval(session: SessionContext, approvalInstanceId: string) {
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING"
    },
    include: {
      steps: {
        where: { status: "PENDING" },
        take: 1
      }
    }
  });

  const step = approval?.steps[0];
  if (!approval || !step) {
    throw new Error("APPROVAL_NOT_ACTIONABLE");
  }

  if (!(await isAssignedToCurrentApprovalStep(session, approval.id))) {
    throw new Error("APPROVAL_ASSIGNMENT_DENIED");
  }

  const request = await prisma.purchaseRequest.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING_APPROVAL"
    },
    include: {
      requestLocation: true,
      requester: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        take: 1
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: true
        }
      }
    }
  });

  if (!request) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  await assertApprovalScope(session, request.requestLocationId);

  assertNotSelfApproval(request.requesterUserId, session.user.id);

  return { approval, step, request };
}

async function findActionableQuotationRecommendationApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "QuotationRecommendation",
      status: "PENDING"
    },
    include: {
      steps: {
        where: { status: "PENDING" },
        take: 1
      }
    }
  });

  const step = approval?.steps[0];
  if (!approval || !step) {
    throw new Error("APPROVAL_NOT_ACTIONABLE");
  }

  const isAssignedUser = step.assignedUserId === session.user.id;
  const isAssignedRole = step.assignedRoleId
    ? roleIds.includes(step.assignedRoleId)
    : false;

  if (!isAssignedUser && !isAssignedRole) {
    throw new Error("APPROVAL_ASSIGNMENT_DENIED");
  }

  const recommendation = await prisma.quotationRecommendation.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING_APPROVAL"
    },
    include: {
      quotationRequest: {
        include: {
          purchaseRequest: true
        }
      },
      selectedSupplierQuotation: {
        include: {
          supplier: true
        }
      }
    }
  });

  if (!recommendation) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  const purchaseRequest = recommendation.quotationRequest.purchaseRequest;
  await assertApprovalScope(session, purchaseRequest.requestLocationId);

  if (
    recommendation.preparedByUserId === session.user.id ||
    purchaseRequest.requesterUserId === session.user.id
  ) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, recommendation, purchaseRequest };
}

async function findActionablePurchaseOrderApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "PurchaseOrder",
      status: "PENDING"
    },
    include: {
      steps: {
        where: { status: "PENDING" },
        take: 1
      }
    }
  });

  const step = approval?.steps[0];
  if (!approval || !step) {
    throw new Error("APPROVAL_NOT_ACTIONABLE");
  }

  const isAssignedUser = step.assignedUserId === session.user.id;
  const isAssignedRole = step.assignedRoleId
    ? roleIds.includes(step.assignedRoleId)
    : false;

  if (!isAssignedUser && !isAssignedRole) {
    throw new Error("APPROVAL_ASSIGNMENT_DENIED");
  }

  const order = await prisma.purchaseOrder.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING_APPROVAL"
    },
    include: {
      createdBy: true,
      supplier: true,
      deliveryLocation: true,
      purchaseRequest: true,
      quotationRecommendation: true,
      selectedSupplierQuotation: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          uom: true
        }
      }
    }
  });

  if (!order) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  await assertApprovalScope(session, order.deliveryLocationId);

  if (
    order.createdByUserId === session.user.id ||
    order.purchaseRequest.requesterUserId === session.user.id ||
    order.quotationRecommendation.preparedByUserId === session.user.id
  ) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, order };
}

async function findActionablePurchaseOrderBalanceClosureApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "PurchaseOrderBalanceClosure",
      status: "PENDING"
    },
    include: {
      steps: {
        where: { status: "PENDING" },
        take: 1
      }
    }
  });

  const step = approval?.steps[0];
  if (!approval || !step) {
    throw new Error("APPROVAL_NOT_ACTIONABLE");
  }

  const isAssignedUser = step.assignedUserId === session.user.id;
  const isAssignedRole = step.assignedRoleId
    ? roleIds.includes(step.assignedRoleId)
    : false;

  if (!isAssignedUser && !isAssignedRole) {
    throw new Error("APPROVAL_ASSIGNMENT_DENIED");
  }

  const closure = await prisma.purchaseOrderBalanceClosure.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING_APPROVAL"
    },
    include: {
      requestedBy: true,
      purchaseOrder: {
        include: {
          createdBy: true,
          supplier: true,
          deliveryLocation: true,
          purchaseRequest: true,
          quotationRecommendation: true,
          selectedSupplierQuotation: true,
          goodsReceipts: {
            select: { id: true, status: true }
          },
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              uom: true
            }
          }
        }
      }
    }
  });

  if (!closure) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  const order = closure.purchaseOrder;
  await assertApprovalScope(session, order.deliveryLocationId);

  if (
    closure.requestedByUserId === session.user.id ||
    order.createdByUserId === session.user.id ||
    order.purchaseRequest.requesterUserId === session.user.id ||
    order.quotationRecommendation.preparedByUserId === session.user.id
  ) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, closure, order };
}

async function findActionablePurchaseOrderAmendmentApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "PurchaseOrderAmendment",
      status: "PENDING"
    },
    include: {
      steps: {
        where: { status: "PENDING" },
        take: 1
      }
    }
  });

  const step = approval?.steps[0];
  if (!approval || !step) {
    throw new Error("APPROVAL_NOT_ACTIONABLE");
  }

  const isAssignedUser = step.assignedUserId === session.user.id;
  const isAssignedRole = step.assignedRoleId
    ? roleIds.includes(step.assignedRoleId)
    : false;

  if (!isAssignedUser && !isAssignedRole) {
    throw new Error("APPROVAL_ASSIGNMENT_DENIED");
  }

  const amendment = await prisma.purchaseOrderAmendment.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING_APPROVAL"
    },
    include: {
      requestedBy: true,
      purchaseOrder: {
        include: {
          createdBy: true,
          supplier: true,
          deliveryLocation: true,
          purchaseRequest: true,
          quotationRecommendation: true,
          selectedSupplierQuotation: true,
          goodsReceipts: {
            select: { id: true }
          },
          balanceClosures: {
            where: { status: "PENDING_APPROVAL" },
            select: { id: true }
          },
          lines: {
            orderBy: { lineNumber: "asc" },
            include: { uom: true }
          }
        }
      }
    }
  });

  if (!amendment) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  const order = amendment.purchaseOrder;
  await assertApprovalScope(session, order.deliveryLocationId);

  if (
    amendment.requestedByUserId === session.user.id ||
    order.createdByUserId === session.user.id ||
    order.purchaseRequest.requesterUserId === session.user.id ||
    order.quotationRecommendation.preparedByUserId === session.user.id
  ) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, amendment, order };
}

async function findActionableWastageApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "WastageReport",
      status: "PENDING"
    },
    include: {
      steps: {
        where: { status: "PENDING" },
        take: 1
      }
    }
  });

  const step = approval?.steps[0];
  if (!approval || !step) {
    throw new Error("APPROVAL_NOT_ACTIONABLE");
  }

  if (!(await isAssignedToCurrentApprovalStep(session, approval.id))) {
    throw new Error("APPROVAL_ASSIGNMENT_DENIED");
  }

  const report = await prisma.wastageReport.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING_APPROVAL"
    },
    include: {
      inventoryLocation: {
        include: { location: true }
      },
      reportedBy: true,
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
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  await assertApprovalScope(session, report.inventoryLocation.locationId);
  assertNotSelfApproval(report.reportedByUserId, session.user.id);

  return { approval, step, report };
}

async function findActionableStockAdjustmentApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "StockAdjustment",
      status: "PENDING"
    },
    include: {
      steps: {
        where: { status: "PENDING" },
        take: 1
      }
    }
  });

  const step = approval?.steps[0];
  if (!approval || !step) {
    throw new Error("APPROVAL_NOT_ACTIONABLE");
  }

  if (!(await isAssignedToCurrentApprovalStep(session, approval.id))) {
    throw new Error("APPROVAL_ASSIGNMENT_DENIED");
  }

  const adjustment = await prisma.stockAdjustment.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING_APPROVAL"
    },
    include: {
      company: true,
      inventoryLocation: {
        include: { location: true }
      },
      requestedBy: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true
        }
      }
    }
  });

  if (!adjustment) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  await assertApprovalScope(session, adjustment.inventoryLocation.locationId);
  assertNotSelfApproval(adjustment.requestedByUserId, session.user.id);

  return { approval, step, adjustment };
}

function toQueueItem(record: {
  approvalInstanceId: string;
  documentType: string;
  documentId: string;
  publicReference: string;
  requesterName: string;
  locationName: string;
  requiredDate: Date;
  status: string;
  currentStepOrder: number | null;
  lineDescription: string;
  policyFlagLabels?: string[];
  evidenceStatus?: string | null;
}): ApprovalQueueItem {
  return {
    ...record,
    requiredDate: record.requiredDate.toISOString().slice(0, 10)
  };
}

export function approvalReminderKind(input: {
  requiredDate: Date | string;
  asOf?: Date;
  timeZone?: string;
  dueSoonWindowDays?: number;
}) {
  const requiredDate =
    typeof input.requiredDate === "string"
      ? input.requiredDate.slice(0, 10)
      : input.requiredDate.toISOString().slice(0, 10);
  const asOfDate = dateOnlyInTimeZone(input.asOf ?? new Date(), input.timeZone);
  const daysUntilRequired = daysBetweenDateOnly(asOfDate, requiredDate);

  if (daysUntilRequired < 0) {
    return "OVERDUE" as const;
  }
  if (
    daysUntilRequired <=
    (input.dueSoonWindowDays ?? approvalReminderConfig.dueSoonWindowDays)
  ) {
    return "DUE_SOON" as const;
  }
  return null;
}

export async function listPendingApprovals(session: SessionContext) {
  if (!canUseApprovals(session.permissionCodes)) {
    return [];
  }

  const roleIds = await getActiveRoleIds(session);
  const permissionCodes = await getGrantedPermissionCodes(session);
  const approvals = await prisma.approvalInstance.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING",
      steps: {
        some: {
          status: "PENDING",
          OR: [
            { assignedUserId: session.user.id },
            { assignedRoleId: { in: roleIds } }
          ]
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const items = await Promise.all(
    approvals.map(async (approval) => {
      if (approval.documentType === "QuotationRecommendation") {
        if (!permissionCodes.includes(permissions.quoteApprove)) {
          return null;
        }

        const recommendation = await prisma.quotationRecommendation.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "PENDING_APPROVAL"
          },
          include: {
            preparedBy: true,
            selectedSupplierQuotation: {
              include: {
                supplier: true
              }
            },
            quotationRequest: {
              include: {
                purchaseRequest: {
                  include: {
                    requestLocation: true
                  }
                }
              }
            }
          }
        });

        if (!recommendation) {
          return null;
        }

        const locationId =
          recommendation.quotationRequest.purchaseRequest.requestLocationId;
        if (
          !(await hasApprovalScope(session, locationId)) ||
          recommendation.preparedByUserId === session.user.id ||
          recommendation.quotationRequest.purchaseRequest.requesterUserId ===
            session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: recommendation.id,
          publicReference:
            recommendation.quotationRequest.purchaseRequest.publicReference,
          requesterName: recommendation.preparedBy.displayName,
          locationName:
            recommendation.quotationRequest.purchaseRequest.requestLocation.name,
          requiredDate:
            recommendation.quotationRequest.purchaseRequest.requiredDate,
          status: recommendation.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Supplier recommendation: ${
            recommendation.selectedSupplierQuotation.supplier.tradingName ??
            recommendation.selectedSupplierQuotation.supplier.legalName
          } / ${recommendation.selectedSupplierQuotation.quoteReference}`
        });
      }

      if (approval.documentType === "PurchaseOrder") {
        if (!permissionCodes.includes(permissions.purchaseOrderApprove)) {
          return null;
        }

        const order = await prisma.purchaseOrder.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "PENDING_APPROVAL"
          },
          include: {
            createdBy: true,
            supplier: true,
            deliveryLocation: true,
            purchaseRequest: true,
            quotationRecommendation: true,
            lines: {
              orderBy: { lineNumber: "asc" },
              take: 1
            }
          }
        });

        if (!order) {
          return null;
        }

        if (
          !(await hasApprovalScope(session, order.deliveryLocationId)) ||
          order.createdByUserId === session.user.id ||
          order.purchaseRequest.requesterUserId === session.user.id ||
          order.quotationRecommendation.preparedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: order.id,
          publicReference: order.publicReference,
          requesterName: order.createdBy.displayName,
          locationName: order.deliveryLocation.name,
          requiredDate: order.expectedDeliveryDate,
          status: order.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Purchase Order: ${
            order.supplier.tradingName ?? order.supplier.legalName
          } / ${order.lines.length} line${order.lines.length === 1 ? "" : "s"}`
        });
      }

      if (approval.documentType === "PurchaseOrderAmendment") {
        if (!permissionCodes.includes(permissions.purchaseOrderApprove)) {
          return null;
        }

        const amendment = await prisma.purchaseOrderAmendment.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "PENDING_APPROVAL"
          },
          include: {
            requestedBy: true,
            purchaseOrder: {
              include: {
                createdBy: true,
                supplier: true,
                deliveryLocation: true,
                purchaseRequest: true,
                quotationRecommendation: true
              }
            }
          }
        });

        if (!amendment) {
          return null;
        }

        const order = amendment.purchaseOrder;
        if (
          !(await hasApprovalScope(session, order.deliveryLocationId)) ||
          amendment.requestedByUserId === session.user.id ||
          order.createdByUserId === session.user.id ||
          order.purchaseRequest.requesterUserId === session.user.id ||
          order.quotationRecommendation.preparedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: amendment.id,
          publicReference: order.publicReference,
          requesterName: amendment.requestedBy.displayName,
          locationName: order.deliveryLocation.name,
          requiredDate: amendment.requestedAt,
          status: amendment.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `PO amendment: ${
            order.supplier.tradingName ?? order.supplier.legalName
          }`
        });
      }

      if (approval.documentType === "PurchaseOrderBalanceClosure") {
        if (!permissionCodes.includes(permissions.purchaseOrderApprove)) {
          return null;
        }

        const closure = await prisma.purchaseOrderBalanceClosure.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "PENDING_APPROVAL"
          },
          include: {
            requestedBy: true,
            purchaseOrder: {
              include: {
                createdBy: true,
                supplier: true,
                deliveryLocation: true,
                purchaseRequest: true,
                quotationRecommendation: true
              }
            }
          }
        });

        if (!closure) {
          return null;
        }

        const order = closure.purchaseOrder;
        if (
          !(await hasApprovalScope(session, order.deliveryLocationId)) ||
          closure.requestedByUserId === session.user.id ||
          order.createdByUserId === session.user.id ||
          order.purchaseRequest.requesterUserId === session.user.id ||
          order.quotationRecommendation.preparedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: closure.id,
          publicReference: order.publicReference,
          requesterName: closure.requestedBy.displayName,
          locationName: order.deliveryLocation.name,
          requiredDate: closure.requestedAt,
          status: closure.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Close PO balance: ${
            order.supplier.tradingName ?? order.supplier.legalName
          } / ${Number(closure.totalClosedQuantity)} open qty`
        });
      }

      if (approval.documentType === "WastageReport") {
        if (!permissionCodes.includes(permissions.wastageApprove)) {
          return null;
        }

        const report = await prisma.wastageReport.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "PENDING_APPROVAL"
          },
          include: {
            inventoryLocation: {
              include: { location: true }
            },
            reportedBy: true,
            lines: true
          }
        });

        if (!report) {
          return null;
        }

        if (
          !(await hasApprovalScope(session, report.inventoryLocation.locationId)) ||
          report.reportedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: report.id,
          publicReference: report.publicReference,
          requesterName: report.reportedBy.displayName,
          locationName: report.inventoryLocation.location.name,
          requiredDate: report.submittedAt ?? report.createdAt,
          status: report.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Wastage: ${report.wastageType.replaceAll("_", " ")} / ${report.lines.length} line${report.lines.length === 1 ? "" : "s"}`,
          policyFlagLabels: formatWastagePolicyFlags(report.policyFlags),
          evidenceStatus: report.evidenceRequired
            ? report.evidenceSatisfied
              ? "Required and satisfied"
              : "Required and missing"
            : "Not required"
        });
      }

      if (approval.documentType === "StockAdjustment") {
        if (!permissionCodes.includes(permissions.stockAdjustmentApprove)) {
          return null;
        }

        const adjustment = await prisma.stockAdjustment.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "PENDING_APPROVAL"
          },
          include: {
            inventoryLocation: {
              include: { location: true }
            },
            requestedBy: true,
            lines: true
          }
        });

        if (!adjustment) {
          return null;
        }

        if (
          !(await hasApprovalScope(
            session,
            adjustment.inventoryLocation.locationId
          )) ||
          adjustment.requestedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: adjustment.id,
          publicReference: adjustment.publicReference,
          requesterName: adjustment.requestedBy.displayName,
          locationName: adjustment.inventoryLocation.location.name,
          requiredDate: adjustment.submittedAt ?? adjustment.createdAt,
          status: adjustment.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Stock adjustment: ${adjustment.adjustmentType.toLowerCase()} / ${adjustment.lines.length} line${adjustment.lines.length === 1 ? "" : "s"}`
        });
      }

      const request = await prisma.purchaseRequest.findFirst({
        where: {
          id: approval.documentId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "PENDING_APPROVAL"
        },
        include: {
          requester: true,
          requestLocation: true,
          lines: {
            orderBy: { lineNumber: "asc" },
            take: 1
          }
        }
      });

      if (!request) {
        return null;
      }

      if (
        !(await hasApprovalScope(session, request.requestLocationId)) ||
        request.requesterUserId === session.user.id
      ) {
        return null;
      }

      return toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: request.id,
        publicReference: request.publicReference,
        requesterName: request.requester.displayName,
        locationName: request.requestLocation.name,
        requiredDate: request.requiredDate,
        status: request.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: request.lines[0]?.description ?? "No line"
      });
    })
  );

  return items.filter((item): item is ApprovalQueueItem => Boolean(item));
}

async function countExistingApprovalOverdueReminderBuckets(input: {
  client: typeof prisma | TransactionClient;
  tenantId: string;
  approvalInstanceId: string;
  recipientUserId: string;
}) {
  return input.client.notification.count({
    where: {
      tenantId: input.tenantId,
      recipientUserId: input.recipientUserId,
      entityType: "ApprovalInstance",
      entityId: input.approvalInstanceId,
      notificationType: "APPROVAL_OVERDUE"
    }
  });
}

export async function runApprovalReminderScan(
  session: SessionContext,
  input: { asOf?: Date; timeZone?: string } = {}
) {
  if (!canUseApprovals(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }

  const asOf = input.asOf ?? new Date();
  const asOfDate = dateOnlyInTimeZone(asOf, input.timeZone);
  const approvals = await listPendingApprovals(session);
  const reminders: Array<{
    approvalInstanceId: string;
    reminderKind: ApprovalReminderKind;
  }> = [];

  await prisma.$transaction(async (tx) => {
    for (const approval of approvals) {
      const reminderKind = approvalReminderKind({
        requiredDate: approval.requiredDate,
        asOf,
        ...(input.timeZone ? { timeZone: input.timeZone } : {}),
        dueSoonWindowDays: approvalReminderConfig.dueSoonWindowDays
      });
      if (!reminderKind) {
        continue;
      }

      const daysUntilRequired = daysBetweenDateOnly(
        asOfDate,
        approval.requiredDate
      );
      const overdueDays =
        reminderKind === "OVERDUE" ? Math.abs(daysUntilRequired) : 0;
      if (
        reminderKind === "OVERDUE" &&
        overdueDays % approvalReminderConfig.overdueReminderFrequencyDays !== 0
      ) {
        continue;
      }

      if (reminderKind === "OVERDUE") {
        const existingCount = await countExistingApprovalOverdueReminderBuckets({
          client: tx,
          tenantId: session.context.tenantId,
          approvalInstanceId: approval.approvalInstanceId,
          recipientUserId: session.user.id
        });
        if (
          existingCount >= approvalReminderConfig.maxOverdueRemindersPerApproval
        ) {
          continue;
        }
      }

      const reminderBucket =
        reminderKind === "OVERDUE" ? asOfDate : approval.requiredDate;
      const notifications = await recordWorkflowNotifications(tx, {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        recipientUserIds: [session.user.id],
        notificationType:
          reminderKind === "OVERDUE" ? "APPROVAL_OVERDUE" : "APPROVAL_DUE_SOON",
        priority: reminderKind === "OVERDUE" ? "HIGH" : "NORMAL",
        title:
          reminderKind === "OVERDUE"
            ? `Approval overdue: ${approval.publicReference}`
            : `Approval due soon: ${approval.publicReference}`,
        body:
          reminderKind === "OVERDUE"
            ? `${approval.documentType} approval for ${approval.locationName} needs follow-up.`
            : `${approval.documentType} approval for ${approval.locationName} is approaching its required date.`,
        deepLink: `/approvals/${approval.approvalInstanceId}`,
        entityType: "ApprovalInstance",
        entityId: approval.approvalInstanceId,
        sourceEventKey: `approval-reminder:${session.context.tenantId}:${approval.approvalInstanceId}:${session.user.id}:${reminderKind}:${approval.requiredDate}:${reminderBucket}`,
        recipientBasis: "CURRENT_APPROVER_MANUAL_SCAN",
        metadata: {
          publicReference: approval.publicReference,
          documentType: approval.documentType,
          requiredDate: approval.requiredDate,
          reminderKind,
          overdueDays,
          source: "manual-approval-reminder-scan"
        }
      });

      if (notifications.length > 0) {
        reminders.push({
          approvalInstanceId: approval.approvalInstanceId,
          reminderKind
        });
      }
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "notification.approval_reminder_scan",
        entityType: "Company",
        entityId: session.context.companyId,
        afterData: {
          scannedApprovalCount: approvals.length,
          reminderCount: reminders.length,
          asOfDate
        },
        metadata: { source: "manual-approval-reminder-scan" }
      }
    });
  });

  return {
    scannedApprovalCount: approvals.length,
    reminderCount: reminders.length,
    reminders
  };
}

export async function getApprovalDetail(
  session: SessionContext,
  approvalInstanceId: string
): Promise<ApprovalDetail | null> {
  if (!canUseApprovals(session.permissionCodes)) {
    return null;
  }

  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING"
    }
  });

  if (!approval) {
    return null;
  }

  if (!(await isAssignedToCurrentApprovalStep(session, approval.id))) {
    return null;
  }

  if (approval.documentType === "QuotationRecommendation") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.quoteApprove)) {
      return null;
    }

    const recommendation = await prisma.quotationRecommendation.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      include: {
        preparedBy: true,
        selectedSupplierQuotation: {
          include: {
            supplier: true
          }
        },
        quotationRequest: {
          include: {
            purchaseRequest: {
              include: {
                requestLocation: true
              }
            }
          }
        }
      }
    });

    if (!recommendation) {
      return null;
    }

    const request = recommendation.quotationRequest.purchaseRequest;
    await assertApprovalScope(session, request.requestLocationId);
    if (
      recommendation.preparedByUserId === session.user.id ||
      request.requesterUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "PurchaseRequest",
        entityId: request.id
      },
      orderBy: { occurredAt: "asc" }
    });

    const supplierName =
      recommendation.selectedSupplierQuotation.supplier.tradingName ??
      recommendation.selectedSupplierQuotation.supplier.legalName;

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: recommendation.id,
        publicReference: request.publicReference,
        requesterName: recommendation.preparedBy.displayName,
        locationName: request.requestLocation.name,
        requiredDate: request.requiredDate,
        status: recommendation.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Supplier recommendation: ${supplierName} / ${recommendation.selectedSupplierQuotation.quoteReference}`
      }),
      approvalTitle: "Quotation Recommendation Approval",
      approvalKind: "QuotationRecommendation",
      justification: recommendation.selectionReason,
      quantity: recommendation.quoteCount,
      uomCode: "quotes",
      amountLabel: `${recommendation.currencyCode} ${Number(
        recommendation.selectedEvaluatedTotal
      ).toFixed(2)}`,
      selectedSupplierName: supplierName,
      selectedQuoteReference:
        recommendation.selectedSupplierQuotation.quoteReference,
      selectionReason: recommendation.selectionReason,
      nonLowestJustification:
        recommendation.nonLowestJustification ?? null,
      singleSourceJustification:
        recommendation.singleSourceJustification ?? null,
      comments: [],
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  if (approval.documentType === "PurchaseOrder") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.purchaseOrderApprove)) {
      return null;
    }

    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      include: {
        createdBy: true,
        supplier: true,
        deliveryLocation: true,
        purchaseRequest: true,
        quotationRecommendation: true,
        selectedSupplierQuotation: true,
        lines: {
          orderBy: { lineNumber: "asc" },
          include: {
            uom: true
          }
        }
      }
    });

    if (!order) {
      return null;
    }

    await assertApprovalScope(session, order.deliveryLocationId);
    if (
      order.createdByUserId === session.user.id ||
      order.purchaseRequest.requesterUserId === session.user.id ||
      order.quotationRecommendation.preparedByUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "PurchaseOrder",
        entityId: order.id
      },
      orderBy: { occurredAt: "asc" }
    });

    const supplierName = order.supplier.tradingName ?? order.supplier.legalName;
    const totalQty = order.lines.reduce(
      (total, line) => total + Number(line.orderedQty),
      0
    );

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: order.id,
        publicReference: order.publicReference,
        requesterName: order.createdBy.displayName,
        locationName: order.deliveryLocation.name,
        requiredDate: order.expectedDeliveryDate,
        status: order.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Purchase Order: ${supplierName} / ${
          order.selectedSupplierQuotation.quoteReference
        }`
      }),
      approvalTitle: "Purchase Order Approval",
      approvalKind: "PurchaseOrder",
      justification: `Approve PO generated from ${order.purchaseRequest.publicReference}. Supplier selection reason: ${order.quotationRecommendation.selectionReason}`,
      quantity: totalQty,
      uomCode: order.lines.length === 1 ? order.lines[0]?.uom.uomCode ?? "line" : "units",
      amountLabel: `${order.currencyCode} ${Number(order.totalAmount).toFixed(2)}`,
      selectedSupplierName: supplierName,
      selectedQuoteReference: order.selectedSupplierQuotation.quoteReference,
      selectionReason: order.quotationRecommendation.selectionReason,
      nonLowestJustification:
        order.quotationRecommendation.nonLowestJustification ?? null,
      singleSourceJustification:
        order.quotationRecommendation.singleSourceJustification ?? null,
      comments: [],
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  if (approval.documentType === "PurchaseOrderAmendment") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.purchaseOrderApprove)) {
      return null;
    }

    const amendment = await prisma.purchaseOrderAmendment.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      include: {
        requestedBy: true,
        purchaseOrder: {
          include: {
            createdBy: true,
            supplier: true,
            deliveryLocation: true,
            purchaseRequest: true,
            quotationRecommendation: true,
            selectedSupplierQuotation: true
          }
        }
      }
    });

    if (!amendment) {
      return null;
    }

    const order = amendment.purchaseOrder;
    await assertApprovalScope(session, order.deliveryLocationId);
    if (
      amendment.requestedByUserId === session.user.id ||
      order.createdByUserId === session.user.id ||
      order.purchaseRequest.requesterUserId === session.user.id ||
      order.quotationRecommendation.preparedByUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "PurchaseOrder",
        entityId: order.id
      },
      orderBy: { occurredAt: "asc" }
    });
    const supplierName = order.supplier.tradingName ?? order.supplier.legalName;
    const proposedSnapshot =
      amendment.proposedSnapshot && typeof amendment.proposedSnapshot === "object"
        ? (amendment.proposedSnapshot as {
            lines?: unknown[];
            totals?: { totalAmount?: unknown };
          })
        : {};
    const proposedTotal = Number(proposedSnapshot.totals?.totalAmount ?? 0);
    const noticeText = amendment.supplierNoticeReference
      ? `Supplier notice: ${amendment.supplierNoticeReference}.`
      : `Supplier notice unavailable: ${amendment.supplierNoticeUnavailableReason}.`;

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: amendment.id,
        publicReference: order.publicReference,
        requesterName: amendment.requestedBy.displayName,
        locationName: order.deliveryLocation.name,
        requiredDate: amendment.requestedAt,
        status: amendment.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `PO amendment: ${supplierName} / ${
          proposedSnapshot.lines?.length ?? 0
        } line${proposedSnapshot.lines?.length === 1 ? "" : "s"}`
      }),
      approvalTitle: "Purchase Order Amendment",
      approvalKind: "PurchaseOrderAmendment",
      justification: `Reason: ${amendment.reason}. ${noticeText}`,
      quantity: proposedSnapshot.lines?.length ?? 0,
      uomCode: "lines",
      amountLabel: `${order.currencyCode} ${proposedTotal.toFixed(2)}`,
      selectedSupplierName: supplierName,
      selectedQuoteReference: order.selectedSupplierQuotation.quoteReference,
      selectionReason: order.quotationRecommendation.selectionReason,
      nonLowestJustification:
        order.quotationRecommendation.nonLowestJustification ?? null,
      singleSourceJustification:
        order.quotationRecommendation.singleSourceJustification ?? null,
      comments: [],
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  if (approval.documentType === "PurchaseOrderBalanceClosure") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.purchaseOrderApprove)) {
      return null;
    }

    const closure = await prisma.purchaseOrderBalanceClosure.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      include: {
        requestedBy: true,
        purchaseOrder: {
          include: {
            createdBy: true,
            supplier: true,
            deliveryLocation: true,
            purchaseRequest: true,
            quotationRecommendation: true,
            selectedSupplierQuotation: true,
            lines: {
              orderBy: { lineNumber: "asc" },
              include: {
                uom: true
              }
            }
          }
        }
      }
    });

    if (!closure) {
      return null;
    }

    const order = closure.purchaseOrder;
    await assertApprovalScope(session, order.deliveryLocationId);
    if (
      closure.requestedByUserId === session.user.id ||
      order.createdByUserId === session.user.id ||
      order.purchaseRequest.requesterUserId === session.user.id ||
      order.quotationRecommendation.preparedByUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "PurchaseOrderBalanceClosure",
        entityId: closure.id
      },
      orderBy: { occurredAt: "asc" }
    });
    const supplierName = order.supplier.tradingName ?? order.supplier.legalName;
    const noticeText = closure.supplierNoticeReference
      ? `Supplier notice: ${closure.supplierNoticeReference}.`
      : `Supplier notice unavailable: ${closure.supplierNoticeUnavailableReason}.`;

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: closure.id,
        publicReference: order.publicReference,
        requesterName: closure.requestedBy.displayName,
        locationName: order.deliveryLocation.name,
        requiredDate: closure.requestedAt,
        status: closure.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Close PO balance: ${supplierName} / ${Number(
          closure.totalClosedQuantity
        )} open qty`
      }),
      approvalTitle: "PO Remaining Balance Closure",
      approvalKind: "PurchaseOrderBalanceClosure",
      justification: `Reason: ${closure.reason}. ${noticeText}${
        closure.notes ? ` Notes: ${closure.notes}` : ""
      }`,
      quantity: Number(closure.totalClosedQuantity),
      uomCode: order.lines.length === 1 ? order.lines[0]?.uom.uomCode ?? "units" : "units",
      amountLabel: `${order.currencyCode} ${Number(
        closure.totalClosedValue
      ).toFixed(2)}`,
      selectedSupplierName: supplierName,
      selectedQuoteReference: order.selectedSupplierQuotation.quoteReference,
      selectionReason: order.quotationRecommendation.selectionReason,
      nonLowestJustification:
        order.quotationRecommendation.nonLowestJustification ?? null,
      singleSourceJustification:
        order.quotationRecommendation.singleSourceJustification ?? null,
      comments: [],
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  if (approval.documentType === "WastageReport") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.wastageApprove)) {
      return null;
    }

    const report = await prisma.wastageReport.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      include: {
        company: true,
        inventoryLocation: {
          include: { location: true }
        },
        reportedBy: true,
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

    await assertApprovalScope(session, report.inventoryLocation.locationId);
    if (report.reportedByUserId === session.user.id) {
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
    const totalQty = report.lines.reduce(
      (total, line) => total + Number(line.quantityBaseUom),
      0
    );
    const firstLine = report.lines[0];
    const evidenceText = report.evidenceReference
      ? `Evidence: ${report.evidenceReference}.`
      : "Evidence reference not recorded.";
    const notesText = report.notes ? ` Notes: ${report.notes}` : "";

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: report.id,
        publicReference: report.publicReference,
        requesterName: report.reportedBy.displayName,
        locationName: report.inventoryLocation.location.name,
        requiredDate: report.submittedAt ?? report.createdAt,
        status: report.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Wastage: ${report.wastageType.replaceAll("_", " ")} / ${report.lines.length} line${report.lines.length === 1 ? "" : "s"}`
      }),
      approvalTitle: "Wastage Report Approval",
      approvalKind: "WastageReport",
      justification: `Reason: ${report.reasonCode}. ${evidenceText}${notesText}`,
      policyFlagLabels: formatWastagePolicyFlags(report.policyFlags),
      evidenceStatus: report.evidenceRequired
        ? report.evidenceSatisfied
          ? "Required and satisfied"
          : "Required and missing"
        : "Not required",
      quantity: totalQty,
      uomCode: firstLine?.uom.uomCode ?? "base units",
      amountLabel: `${report.company.currencyCode} ${Number(
        report.totalEstimatedCost
      ).toFixed(2)}`,
      selectedSupplierName: null,
      selectedQuoteReference: null,
      selectionReason: null,
      nonLowestJustification: null,
      singleSourceJustification: null,
      comments: [],
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  if (approval.documentType === "StockAdjustment") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.stockAdjustmentApprove)) {
      return null;
    }

    const adjustment = await prisma.stockAdjustment.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      include: {
        company: true,
        inventoryLocation: {
          include: { location: true }
        },
        requestedBy: true,
        lines: {
          orderBy: { lineNumber: "asc" },
          include: {
            item: true,
            uom: true
          }
        }
      }
    });

    if (!adjustment) {
      return null;
    }

    await assertApprovalScope(session, adjustment.inventoryLocation.locationId);
    if (adjustment.requestedByUserId === session.user.id) {
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
    const totalQty = adjustment.lines.reduce(
      (total, line) => total + Math.abs(Number(line.quantityDeltaBaseUom)),
      0
    );
    const firstLine = adjustment.lines[0];
    const evidenceText = adjustment.evidenceReference
      ? `Evidence: ${adjustment.evidenceReference}.`
      : "Evidence reference not recorded.";

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: adjustment.id,
        publicReference: adjustment.publicReference,
        requesterName: adjustment.requestedBy.displayName,
        locationName: adjustment.inventoryLocation.location.name,
        requiredDate: adjustment.submittedAt ?? adjustment.createdAt,
        status: adjustment.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Stock adjustment: ${adjustment.adjustmentType.toLowerCase()} / ${adjustment.lines.length} line${adjustment.lines.length === 1 ? "" : "s"}`
      }),
      approvalTitle: "Stock Adjustment Approval",
      approvalKind: "StockAdjustment",
      justification: `Reason: ${adjustment.reasonCode}. ${adjustment.reasonDescription}. ${evidenceText}`,
      quantity: totalQty,
      uomCode: firstLine?.uom.uomCode ?? "base units",
      amountLabel: `${adjustment.company.currencyCode} ${Number(
        adjustment.totalEstimatedValueImpact
      ).toFixed(2)}`,
      selectedSupplierName: null,
      selectedQuoteReference: null,
      selectionReason: null,
      nonLowestJustification: null,
      singleSourceJustification: null,
      comments: [],
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  const request = await prisma.purchaseRequest.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    include: {
      requester: true,
      requestLocation: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        take: 1
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: true
        }
      }
    }
  });

  if (!request) {
    return null;
  }

  await assertApprovalScope(session, request.requestLocationId);
  if (request.requesterUserId === session.user.id) {
    return null;
  }

  const line = request.lines[0];
  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      entityType: "PurchaseRequest",
      entityId: request.id
    },
    orderBy: { occurredAt: "asc" }
  });

  return {
    ...toQueueItem({
      approvalInstanceId: approval.id,
      documentType: approval.documentType,
      documentId: request.id,
      publicReference: request.publicReference,
      requesterName: request.requester.displayName,
      locationName: request.requestLocation.name,
      requiredDate: request.requiredDate,
      status: request.status,
      currentStepOrder: approval.currentStepOrder,
      lineDescription: line?.description ?? "No line"
    }),
    approvalTitle: "Purchase Request Approval",
    approvalKind: "PurchaseRequest",
    justification: request.justification,
    quantity: Number(line?.requestedQty ?? 0),
    uomCode: line?.uomCode ?? "",
    amountLabel: null,
    selectedSupplierName: null,
    selectedQuoteReference: null,
    selectionReason: null,
    nonLowestJustification: null,
    singleSourceJustification: null,
    comments: request.comments.map((comment) => ({
      id: comment.id,
      authorName: comment.author.displayName,
      body: comment.body,
      createdAt: comment.createdAt.toISOString()
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      occurredAt: event.occurredAt.toISOString()
    }))
  };
}

export async function approvePurchaseRequest(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseRequestApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, request } = await findActionableApproval(
    session,
    values.approvalInstanceId
  );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: "APPROVED",
        actedAt: new Date(),
        actedByUserId: session.user.id,
        ...(values.remarks ? { remarks: values.remarks } : {})
      }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        currentStepOrder: null
      }
    });
    await tx.purchaseRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        currentApprovalStep: null,
        version: { increment: 1 }
      }
    });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_request.approved",
        entityType: "PurchaseRequest",
        entityId: request.id,
        beforeData: { status: "PENDING_APPROVAL" },
        afterData: { status: "APPROVED" },
        metadata: { approvalInstanceId: approval.id }
      }
    });
  });
}

export async function approveWastageReport(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.wastageApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, report } = await findActionableWastageApproval(
    session,
    values.approvalInstanceId
  );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: "APPROVED",
        actedAt: new Date(),
        actedByUserId: session.user.id,
        ...(values.remarks ? { remarks: values.remarks } : {})
      }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        currentStepOrder: null
      }
    });
    const updatedReport = await tx.wastageReport.updateMany({
      where: {
        id: report.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedByUserId: session.user.id,
        ...(values.remarks ? { reviewNotes: values.remarks } : {})
      }
    });
    if (updatedReport.count !== 1) {
      throw new Error("WASTAGE_NOT_PENDING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "wastage_report.approved",
        entityType: "WastageReport",
        entityId: report.id,
        beforeData: { status: "PENDING_APPROVAL" },
        afterData: { status: "APPROVED" },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks ?? null,
          policyFlags: report.policyFlags ?? [],
          evidenceRequired: report.evidenceRequired,
          evidenceSatisfied: report.evidenceSatisfied,
          nonPostingApproval: true
        }
      }
    });
  });
}

export async function approveStockAdjustment(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockAdjustmentApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, adjustment } =
    await findActionableStockAdjustmentApproval(
      session,
      values.approvalInstanceId
    );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: "APPROVED",
        actedAt: new Date(),
        actedByUserId: session.user.id,
        ...(values.remarks ? { remarks: values.remarks } : {})
      }
    });
    const nextStep = await tx.approvalInstanceStep.findFirst({
      where: {
        approvalInstanceId: approval.id,
        stepOrder: { gt: step.stepOrder },
        status: "WAITING"
      },
      orderBy: { stepOrder: "asc" }
    });
    if (nextStep) {
      await tx.approvalInstanceStep.update({
        where: { id: nextStep.id },
        data: { status: "PENDING" }
      });
      await tx.approvalInstance.update({
        where: { id: approval.id },
        data: { currentStepOrder: nextStep.stepOrder }
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "stock_adjustment.approval_step_approved",
          entityType: "StockAdjustment",
          entityId: adjustment.id,
          beforeData: { currentStepOrder: step.stepOrder },
          afterData: { currentStepOrder: nextStep.stepOrder },
          metadata: {
            approvalInstanceId: approval.id,
            approvedStepOrder: step.stepOrder,
            nextStepOrder: nextStep.stepOrder,
            remarks: values.remarks ?? null,
            nonPostingApproval: true
          }
        }
      });
      return;
    }
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        currentStepOrder: null
      }
    });
    const updatedAdjustment = await tx.stockAdjustment.updateMany({
      where: {
        id: adjustment.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      data: { status: "APPROVED" }
    });
    if (updatedAdjustment.count !== 1) {
      throw new Error("STOCK_ADJUSTMENT_NOT_PENDING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "stock_adjustment.approved",
        entityType: "StockAdjustment",
        entityId: adjustment.id,
        beforeData: { status: "PENDING_APPROVAL" },
        afterData: { status: "APPROVED" },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks ?? null,
          nonPostingApproval: true
        }
      }
    });
  });
}

export async function approvePurchaseOrderBalanceClosure(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseOrderApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, closure, order } =
    await findActionablePurchaseOrderBalanceClosureApproval(
      session,
      values.approvalInstanceId
    );

  await prisma.$transaction(async (tx) => {
    const currentOrder = await tx.purchaseOrder.findFirst({
      where: {
        id: order.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        deliveryLocationId: order.deliveryLocationId
      },
      include: {
        lines: {
          orderBy: { lineNumber: "asc" },
          include: { uom: true }
        },
        goodsReceipts: {
          select: { id: true, status: true }
        },
        balanceClosures: {
          where: {
            status: "PENDING_APPROVAL"
          },
          select: { id: true }
        }
      }
    });

    if (!currentOrder) {
      throw new Error("PURCHASE_ORDER_NOT_FOUND");
    }

    const lineSnapshot = buildPurchaseOrderClosureLineSnapshot(
      currentOrder.lines
    );
    const outstandingQty = lineSnapshot.reduce(
      (total, line) => total + line.remainingQty,
      0
    );
    assertPurchaseOrderCanRequestBalanceClosure({
      status: currentOrder.status,
      outstandingQty,
      draftReceiptCount: currentOrder.goodsReceipts.filter(
        (receipt) => receipt.status !== "POSTED"
      ).length,
      pendingClosureCount: currentOrder.balanceClosures.filter(
        (pendingClosure) => pendingClosure.id !== closure.id
      ).length
    });

    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: "APPROVED",
        actedAt: new Date(),
        actedByUserId: session.user.id,
        ...(values.remarks ? { remarks: values.remarks } : {})
      }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        currentStepOrder: null
      }
    });

    for (const line of currentOrder.lines) {
      const orderedQty = Number(line.orderedQty);
      const receivedQty = Number(line.receivedQty);
      const cancelledQty = Number(line.cancelledQty);
      const remainingQty = orderedQty - receivedQty - cancelledQty;
      if (remainingQty > 0) {
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: {
            cancelledQty: cancelledQty + remainingQty
          }
        });
      }
    }

    const updatedOrder = await tx.purchaseOrder.updateMany({
      where: {
        id: currentOrder.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PARTIALLY_RECEIVED"
      },
      data: {
        status: "CLOSED"
      }
    });
    if (updatedOrder.count !== 1) {
      throw new Error("PURCHASE_ORDER_NOT_PARTIALLY_RECEIVED_FOR_CLOSURE");
    }

    const currentClosedValue = lineSnapshot.reduce(
      (total, line) => total + line.closedValue,
      0
    );
    await tx.purchaseOrderBalanceClosure.update({
      where: { id: closure.id },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        lineSnapshot,
        totalClosedQuantity: outstandingQty,
        totalClosedValue: currentClosedValue
      }
    });
    await tx.auditEvent.createMany({
      data: [
        {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "purchase_order_balance_closure.approved",
          entityType: "PurchaseOrderBalanceClosure",
          entityId: closure.id,
          beforeData: { status: "PENDING_APPROVAL" },
          afterData: {
            status: "APPROVED",
            totalClosedQuantity: outstandingQty,
            totalClosedValue: currentClosedValue
          },
          metadata: {
            approvalInstanceId: approval.id,
            purchaseOrderId: order.id,
            remarks: values.remarks ?? null
          }
        },
        {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "purchase_order.closed_remaining_balance",
          entityType: "PurchaseOrder",
          entityId: order.id,
          beforeData: { status: "PARTIALLY_RECEIVED" },
          afterData: { status: "CLOSED" },
          metadata: {
            approvalInstanceId: approval.id,
            balanceClosureId: closure.id,
            totalClosedQuantity: outstandingQty,
            totalClosedValue: currentClosedValue,
            noInventoryMovement: true
          }
        }
      ]
    });
  });
}

export async function approvePurchaseOrderAmendment(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseOrderApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, amendment, order } =
    await findActionablePurchaseOrderAmendmentApproval(
      session,
      values.approvalInstanceId
    );

  const proposedSnapshot =
    amendment.proposedSnapshot && typeof amendment.proposedSnapshot === "object"
      ? (amendment.proposedSnapshot as {
          expectedDeliveryDate?: string;
          lines?: Array<{
            purchaseOrderLineId: string;
            orderedQty: number;
            unitPrice: number;
            notes: string | null;
          }>;
        })
      : {};

  if (!proposedSnapshot.expectedDeliveryDate || !proposedSnapshot.lines) {
    throw new Error("PURCHASE_ORDER_AMENDMENT_PROPOSAL_INVALID");
  }
  const proposedLines = proposedSnapshot.lines;
  const proposedExpectedDeliveryDate = proposedSnapshot.expectedDeliveryDate;

  await prisma.$transaction(async (tx) => {
    const currentOrder = await tx.purchaseOrder.findFirst({
      where: {
        id: order.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        deliveryLocationId: order.deliveryLocationId
      },
      include: {
        lines: {
          orderBy: { lineNumber: "asc" },
          include: { uom: true }
        },
        goodsReceipts: {
          select: { id: true }
        },
        balanceClosures: {
          where: { status: "PENDING_APPROVAL" },
          select: { id: true }
        },
        amendments: {
          where: { status: "PENDING_APPROVAL" },
          select: { id: true }
        }
      }
    });

    if (!currentOrder) {
      throw new Error("PURCHASE_ORDER_NOT_FOUND");
    }
    if (currentOrder.status !== "AMENDMENT_PENDING") {
      throw new Error("PURCHASE_ORDER_NOT_PENDING_AMENDMENT");
    }

    const receivedQty = currentOrder.lines.reduce(
      (total, line) => total + Number(line.receivedQty),
      0
    );
    assertPurchaseOrderCanRequestAmendment({
      status: "ISSUED",
      receivedQty,
      receiptCount: currentOrder.goodsReceipts.length,
      pendingClosureCount: currentOrder.balanceClosures.length,
      pendingAmendmentCount: currentOrder.amendments.filter(
        (pendingAmendment) => pendingAmendment.id !== amendment.id
      ).length
    });

    const verifiedProposal = buildPurchaseOrderAmendmentProposal({
      currentLines: currentOrder.lines,
      proposedLines,
      expectedDeliveryDate: proposedExpectedDeliveryDate
    });

    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: "APPROVED",
        actedAt: new Date(),
        actedByUserId: session.user.id,
        ...(values.remarks ? { remarks: values.remarks } : {})
      }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        currentStepOrder: null
      }
    });

    for (const line of verifiedProposal.lines) {
      const updatedLine = await tx.purchaseOrderLine.updateMany({
        where: {
          id: line.purchaseOrderLineId,
          purchaseOrderId: order.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          receivedQty: 0,
          cancelledQty: 0
        },
        data: {
          orderedQty: line.orderedQty,
          unitPrice: line.unitPrice,
          taxAmount: line.taxAmount,
          discountAmount: line.discountAmount,
          lineTotal: line.lineTotal,
          notes: line.notes
        }
      });
      if (updatedLine.count !== 1) {
        throw new Error("PURCHASE_ORDER_LINE_ACTIVITY_BLOCKS_AMENDMENT");
      }
    }

    const updatedOrder = await tx.purchaseOrder.updateMany({
      where: {
        id: order.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        deliveryLocationId: order.deliveryLocationId,
        status: "AMENDMENT_PENDING"
      },
      data: {
        status: "ISSUED",
        expectedDeliveryDate: new Date(
          `${verifiedProposal.expectedDeliveryDate}T00:00:00.000Z`
        ),
        subtotalAmount: verifiedProposal.totals.subtotalAmount,
        taxAmount: verifiedProposal.totals.taxAmount,
        discountAmount: verifiedProposal.totals.discountAmount,
        totalAmount: verifiedProposal.totals.totalAmount
      }
    });
    if (updatedOrder.count !== 1) {
      throw new Error("PURCHASE_ORDER_NOT_PENDING_AMENDMENT");
    }

    const updatedAmendment = await tx.purchaseOrderAmendment.updateMany({
      where: {
        id: amendment.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        appliedAt: new Date()
      }
    });
    if (updatedAmendment.count !== 1) {
      throw new Error("PURCHASE_ORDER_AMENDMENT_NOT_PENDING_APPROVAL");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_order.amendment_approved",
        entityType: "PurchaseOrder",
        entityId: order.id,
        beforeData: amendment.beforeSnapshot ?? {},
        afterData: verifiedProposal,
        metadata: {
          approvalInstanceId: approval.id,
          amendmentId: amendment.id,
          remarks: values.remarks ?? null,
          supplierNoticeReference: amendment.supplierNoticeReference,
          supplierNoticeUnavailableReason:
            amendment.supplierNoticeUnavailableReason
        }
      }
    });
  });
}

export async function approveApproval(formData: FormData) {
  const session = await requireSessionContext();
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: values.approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING"
    },
    select: { documentType: true }
  });

  if (!approval) {
    throw new Error("APPROVAL_NOT_ACTIONABLE");
  }

  if (approval.documentType === "QuotationRecommendation") {
    await approveQuotationRecommendation(formData);
    return;
  }

  if (approval.documentType === "PurchaseOrder") {
    await approvePurchaseOrder(formData);
    return;
  }

  if (approval.documentType === "PurchaseOrderBalanceClosure") {
    await approvePurchaseOrderBalanceClosure(formData);
    return;
  }

  if (approval.documentType === "PurchaseOrderAmendment") {
    await approvePurchaseOrderAmendment(formData);
    return;
  }

  if (approval.documentType === "WastageReport") {
    await approveWastageReport(formData);
    return;
  }

  if (approval.documentType === "StockAdjustment") {
    await approveStockAdjustment(formData);
    return;
  }

  await approvePurchaseRequest(formData);
}

export async function returnApproval(formData: FormData) {
  const session = await requireSessionContext();
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: values.approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING"
    },
    select: { documentType: true }
  });

  if (!approval) {
    throw new Error("APPROVAL_NOT_ACTIONABLE");
  }

  if (approval.documentType === "QuotationRecommendation") {
    await closeQuotationRecommendationWithDecision(
      formData,
      "RETURNED",
      "quotation_recommendation.returned"
    );
    return;
  }

  if (approval.documentType === "PurchaseOrder") {
    await closePurchaseOrderWithDecision(
      formData,
      "DRAFT",
      "purchase_order.returned"
    );
    return;
  }

  if (approval.documentType === "PurchaseOrderBalanceClosure") {
    await closePurchaseOrderBalanceClosureWithDecision(
      formData,
      "RETURNED",
      "purchase_order_balance_closure.returned"
    );
    return;
  }

  if (approval.documentType === "PurchaseOrderAmendment") {
    await closePurchaseOrderAmendmentWithDecision(
      formData,
      "RETURNED",
      "purchase_order.amendment_returned"
    );
    return;
  }

  if (approval.documentType === "WastageReport") {
    await closeWastageReportWithDecision(
      formData,
      "RETURNED",
      "wastage_report.returned"
    );
    return;
  }

  if (approval.documentType === "StockAdjustment") {
    await closeStockAdjustmentWithDecision(
      formData,
      "RETURNED",
      "stock_adjustment.returned"
    );
    return;
  }

  await returnPurchaseRequest(formData);
}

export async function rejectApproval(formData: FormData) {
  const session = await requireSessionContext();
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: values.approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING"
    },
    select: { documentType: true }
  });

  if (!approval) {
    throw new Error("APPROVAL_NOT_ACTIONABLE");
  }

  if (approval.documentType === "QuotationRecommendation") {
    await closeQuotationRecommendationWithDecision(
      formData,
      "REJECTED",
      "quotation_recommendation.rejected"
    );
    return;
  }

  if (approval.documentType === "PurchaseOrder") {
    await closePurchaseOrderWithDecision(
      formData,
      "CANCELLED",
      "purchase_order.rejected"
    );
    return;
  }

  if (approval.documentType === "PurchaseOrderBalanceClosure") {
    await closePurchaseOrderBalanceClosureWithDecision(
      formData,
      "REJECTED",
      "purchase_order_balance_closure.rejected"
    );
    return;
  }

  if (approval.documentType === "PurchaseOrderAmendment") {
    await closePurchaseOrderAmendmentWithDecision(
      formData,
      "REJECTED",
      "purchase_order.amendment_rejected"
    );
    return;
  }

  if (approval.documentType === "WastageReport") {
    await closeWastageReportWithDecision(
      formData,
      "REJECTED",
      "wastage_report.rejected"
    );
    return;
  }

  if (approval.documentType === "StockAdjustment") {
    await closeStockAdjustmentWithDecision(
      formData,
      "REJECTED",
      "stock_adjustment.rejected"
    );
    return;
  }

  await rejectPurchaseRequest(formData);
}

export async function approvePurchaseOrder(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseOrderApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, order } = await findActionablePurchaseOrderApproval(
    session,
    values.approvalInstanceId
  );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: "APPROVED",
        actedAt: new Date(),
        actedByUserId: session.user.id,
        ...(values.remarks ? { remarks: values.remarks } : {})
      }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        currentStepOrder: null
      }
    });
    const updatedOrder = await tx.purchaseOrder.updateMany({
      where: {
        id: order.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      data: {
        status: "APPROVED"
      }
    });
    if (updatedOrder.count !== 1) {
      throw new Error("PURCHASE_ORDER_NOT_PENDING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "purchase_order.approved",
        entityType: "PurchaseOrder",
        entityId: order.id,
        beforeData: { status: "PENDING_APPROVAL" },
        afterData: { status: "APPROVED" },
        metadata: {
          approvalInstanceId: approval.id,
          purchaseRequestId: order.purchaseRequestId,
          quotationRecommendationId: order.quotationRecommendationId,
          supplierId: order.supplierId
        }
      }
    });
  });
}

export async function approveQuotationRecommendation(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.quoteApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, recommendation, purchaseRequest } =
    await findActionableQuotationRecommendationApproval(
      session,
      values.approvalInstanceId
    );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: "APPROVED",
        actedAt: new Date(),
        actedByUserId: session.user.id,
        ...(values.remarks ? { remarks: values.remarks } : {})
      }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        currentStepOrder: null
      }
    });
    await tx.quotationRecommendation.update({
      where: { id: recommendation.id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        version: { increment: 1 }
      }
    });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "quotation_recommendation.approved",
        entityType: "PurchaseRequest",
        entityId: purchaseRequest.id,
        beforeData: { status: "PENDING_APPROVAL" },
        afterData: { status: "APPROVED" },
        metadata: {
          approvalInstanceId: approval.id,
          quotationRecommendationId: recommendation.id,
          selectedSupplierQuotationId:
            recommendation.selectedSupplierQuotationId,
          selectedSupplierCode:
            recommendation.selectedSupplierQuotation.supplier.supplierCode
        }
      }
    });
  });
}

export async function returnPurchaseRequest(formData: FormData) {
  await closeWithDecision(formData, "RETURNED", "purchase_request.returned");
}

export async function rejectPurchaseRequest(formData: FormData) {
  await closeWithDecision(formData, "REJECTED", "purchase_request.rejected");
}

async function closeWithDecision(
  formData: FormData,
  status: "RETURNED" | "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseRequestApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, request } = await findActionableApproval(
    session,
    values.approvalInstanceId
  );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status,
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status,
        currentStepOrder: null
      }
    });
    await tx.purchaseRequest.update({
      where: { id: request.id },
      data: {
        status,
        currentApprovalStep: null,
        version: { increment: 1 }
      }
    });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "PurchaseRequest",
        entityId: request.id,
        beforeData: { status: "PENDING_APPROVAL" },
        afterData: { status },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks
        }
      }
    });
  });
}

async function closeQuotationRecommendationWithDecision(
  formData: FormData,
  status: "RETURNED" | "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.quoteApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, recommendation, purchaseRequest } =
    await findActionableQuotationRecommendationApproval(
      session,
      values.approvalInstanceId
    );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status,
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status,
        currentStepOrder: null
      }
    });
    await tx.quotationRecommendation.update({
      where: { id: recommendation.id },
      data: {
        status,
        version: { increment: 1 }
      }
    });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "PurchaseRequest",
        entityId: purchaseRequest.id,
        beforeData: { status: "PENDING_APPROVAL" },
        afterData: { status },
        metadata: {
          approvalInstanceId: approval.id,
          quotationRecommendationId: recommendation.id,
          selectedSupplierQuotationId:
            recommendation.selectedSupplierQuotationId,
          remarks: values.remarks
        }
      }
    });
  });
}

async function closePurchaseOrderWithDecision(
  formData: FormData,
  status: "DRAFT" | "CANCELLED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseOrderApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, order } = await findActionablePurchaseOrderApproval(
    session,
    values.approvalInstanceId
  );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: status === "DRAFT" ? "RETURNED" : "REJECTED",
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: status === "DRAFT" ? "RETURNED" : "REJECTED",
        currentStepOrder: null
      }
    });
    const updatedOrder = await tx.purchaseOrder.updateMany({
      where: {
        id: order.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      data: { status }
    });
    if (updatedOrder.count !== 1) {
      throw new Error("PURCHASE_ORDER_NOT_PENDING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "PurchaseOrder",
        entityId: order.id,
        beforeData: { status: "PENDING_APPROVAL" },
        afterData: { status },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks,
          purchaseRequestId: order.purchaseRequestId,
          quotationRecommendationId: order.quotationRecommendationId,
          supplierId: order.supplierId
        }
      }
    });
  });
}

async function closePurchaseOrderBalanceClosureWithDecision(
  formData: FormData,
  status: "RETURNED" | "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseOrderApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, closure, order } =
    await findActionablePurchaseOrderBalanceClosureApproval(
      session,
      values.approvalInstanceId
    );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status,
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status,
        currentStepOrder: null
      }
    });
    const updatedClosure = await tx.purchaseOrderBalanceClosure.updateMany({
      where: {
        id: closure.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      data: {
        status,
        rejectedAt: new Date(),
        rejectionReason: values.remarks
      }
    });
    if (updatedClosure.count !== 1) {
      throw new Error("PURCHASE_ORDER_CLOSURE_NOT_PENDING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "PurchaseOrderBalanceClosure",
        entityId: closure.id,
        beforeData: { status: "PENDING_APPROVAL" },
        afterData: { status },
        metadata: {
          approvalInstanceId: approval.id,
          purchaseOrderId: order.id,
          remarks: values.remarks,
          noPurchaseOrderMutation: true
        }
      }
    });
  });
}

async function closePurchaseOrderAmendmentWithDecision(
  formData: FormData,
  status: "RETURNED" | "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.purchaseOrderApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, amendment, order } =
    await findActionablePurchaseOrderAmendmentApproval(
      session,
      values.approvalInstanceId
    );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status,
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status,
        currentStepOrder: null
      }
    });
    const updatedAmendment = await tx.purchaseOrderAmendment.updateMany({
      where: {
        id: amendment.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      data: {
        status,
        rejectedAt: new Date(),
        rejectionReason: values.remarks
      }
    });
    if (updatedAmendment.count !== 1) {
      throw new Error("PURCHASE_ORDER_AMENDMENT_NOT_PENDING_APPROVAL");
    }
    const updatedOrder = await tx.purchaseOrder.updateMany({
      where: {
        id: order.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        deliveryLocationId: order.deliveryLocationId,
        status: "AMENDMENT_PENDING"
      },
      data: {
        status: "ISSUED"
      }
    });
    if (updatedOrder.count !== 1) {
      throw new Error("PURCHASE_ORDER_NOT_PENDING_AMENDMENT");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "PurchaseOrder",
        entityId: order.id,
        beforeData: { status: "AMENDMENT_PENDING" },
        afterData: { status: "ISSUED" },
        metadata: {
          approvalInstanceId: approval.id,
          amendmentId: amendment.id,
          decisionStatus: status,
          remarks: values.remarks,
          noPurchaseOrderLineMutation: true
        }
      }
    });
  });
}

async function closeWastageReportWithDecision(
  formData: FormData,
  status: "RETURNED" | "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.wastageApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, report } = await findActionableWastageApproval(
    session,
    values.approvalInstanceId
  );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status,
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status,
        currentStepOrder: null
      }
    });
    const updatedReport = await tx.wastageReport.updateMany({
      where: {
        id: report.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedByUserId: session.user.id,
        reviewNotes: values.remarks
      }
    });
    if (updatedReport.count !== 1) {
      throw new Error("WASTAGE_NOT_PENDING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "WastageReport",
        entityId: report.id,
        beforeData: { status: "PENDING_APPROVAL" },
        afterData: { status },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks,
          nonPostingApproval: true
        }
      }
    });
  });
}

async function closeStockAdjustmentWithDecision(
  formData: FormData,
  status: "RETURNED" | "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.stockAdjustmentApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, adjustment } =
    await findActionableStockAdjustmentApproval(
      session,
      values.approvalInstanceId
    );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status,
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status,
        currentStepOrder: null
      }
    });
    const updatedAdjustment = await tx.stockAdjustment.updateMany({
      where: {
        id: adjustment.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL"
      },
      data: { status }
    });
    if (updatedAdjustment.count !== 1) {
      throw new Error("STOCK_ADJUSTMENT_NOT_PENDING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "StockAdjustment",
        entityId: adjustment.id,
        beforeData: { status: "PENDING_APPROVAL" },
        afterData: { status },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks,
          nonPostingApproval: true
        }
      }
    });
  });
}
