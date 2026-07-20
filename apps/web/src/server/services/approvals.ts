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
  approveFinanceCloseRunApproval,
  rejectFinanceCloseRunApproval
} from "./financePeriodClose";
import {
  assertPurchaseOrderCanRequestAmendment,
  assertPurchaseOrderCanRequestBalanceClosure,
  buildPurchaseOrderAmendmentProposal,
  buildPurchaseOrderClosureLineSnapshot
} from "./purchaseOrders";
import {
  getPurchaseRequestSlaLabel,
  getPurchaseRequestSlaStatus,
  isEmergencyPurchaseUrgency,
  type PurchaseRequestSlaStatus
} from "./purchaseRequests";
import { dateOnlyInTimeZone, daysBetweenDateOnly } from "./projectDates";
import { projectBudgetCommitmentFromApprovedSourceEvent } from "./budgetControl";

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
  isEmergency?: boolean;
  slaStatus?: PurchaseRequestSlaStatus;
  slaLabel?: string;
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
    | "StockAdjustment"
    | "BudgetRevision"
    | "ExpenseRequest"
    | "CashAdvanceRequest"
    | "PettyCashRequest"
    | "PaymentRequest"
    | "PaymentRelease"
    | "FinanceCloseRun"
    | "EmployeeLeaveRequest"
    | "EmployeeOvertimeRecord"
    | "WorkforceSchedule"
    | "AttendanceImportBatch";
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

type BudgetProjectionLine = {
  id: string;
  lineNumber: number;
  description: string;
  budgetLineId: string | null;
  estimatedLineTotal?: unknown;
  lineTotal?: unknown;
};

type PurchaseRequestBudgetProjectionSource = {
  id: string;
  publicReference: string;
  lines: BudgetProjectionLine[];
};

type PurchaseOrderBudgetProjectionSource = {
  id: string;
  publicReference: string;
  supplier?: { tradingName: string | null; legalName: string } | null;
  lines: BudgetProjectionLine[];
};

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

function attendanceImportRequestedFinalStatus(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "requestedFinalStatus" in value &&
    value.requestedFinalStatus === "REJECTED"
  ) {
    return "REJECTED" as const;
  }
  return "EXCEPTION_LIST" as const;
}

function decimalInputToNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
  ) {
    return value.toNumber();
  }
  return Number(value ?? 0);
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

async function hasCompanyApprovalScope(session: SessionContext) {
  const assignment = await prisma.userScopeAssignment.findFirst({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      accessLevel: { in: ["APPROVE", "MANAGE"] },
      scopeType: "COMPANY",
      scopeId: session.context.companyId
    }
  });

  return Boolean(assignment);
}

async function hasBudgetApprovalScope(
  session: SessionContext,
  budget: {
    locationId: string | null;
    lines: Array<{
      locationId: string | null;
    }>;
  }
) {
  const locationIds = [
    budget.locationId,
    ...budget.lines.map((line) => line.locationId)
  ].filter(Boolean) as string[];

  if (locationIds.length === 0) {
    return hasCompanyApprovalScope(session);
  }

  for (const locationId of [...new Set(locationIds)]) {
    if (!(await hasApprovalScope(session, locationId))) {
      return false;
    }
  }
  return true;
}

function budgetLocationLabel(budget: {
  location?: { name: string } | null;
  lines: Array<{
    location?: { name: string } | null;
  }>;
}) {
  return (
    budget.location?.name ??
    budget.lines.find((line) => line.location?.name)?.location?.name ??
    "Company-wide"
  );
}

function budgetRevisionAmountLabel(snapshot: unknown) {
  if (typeof snapshot !== "object" || snapshot === null) {
    return null;
  }
  const proposedAmount =
    "proposedAmountPhp" in snapshot ? Number(snapshot.proposedAmountPhp) : Number.NaN;
  if (!Number.isFinite(proposedAmount)) {
    return null;
  }
  return `PHP ${proposedAmount.toFixed(2)}`;
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
        orderBy: { lineNumber: "asc" }
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

async function projectPurchaseRequestBudgetCommitments(
  tx: TransactionClient,
  session: SessionContext,
  request: PurchaseRequestBudgetProjectionSource,
  approvedAt: Date
) {
  for (const line of request.lines) {
    const committedAmountPhp = decimalInputToNumber(line.estimatedLineTotal);
    if (!line.budgetLineId || committedAmountPhp <= 0) {
      continue;
    }

    await projectBudgetCommitmentFromApprovedSourceEvent(tx, session, {
      budgetLineId: line.budgetLineId,
      sourceType: "PURCHASE_REQUEST",
      sourceId: request.id,
      sourceLineId: line.id,
      sourceEventKey: `purchase_request.approved:${line.id}`,
      sourceEventAt: approvedAt,
      sourceReference: request.publicReference,
      sourceSummary: `Purchase request ${request.publicReference} line ${line.lineNumber}: ${line.description}`,
      committedAmountPhp,
      status: "PENDING"
    });
  }
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

async function projectPurchaseOrderBudgetCommitments(
  tx: TransactionClient,
  session: SessionContext,
  order: PurchaseOrderBudgetProjectionSource,
  approvedAt: Date
) {
  for (const line of order.lines) {
    const committedAmountPhp = decimalInputToNumber(line.lineTotal);
    if (!line.budgetLineId || committedAmountPhp <= 0) {
      continue;
    }

    await projectBudgetCommitmentFromApprovedSourceEvent(tx, session, {
      budgetLineId: line.budgetLineId,
      sourceType: "PURCHASE_ORDER",
      sourceId: order.id,
      sourceLineId: line.id,
      sourceEventKey: `purchase_order.approved:${line.id}`,
      sourceEventAt: approvedAt,
      sourceReference: order.publicReference,
      sourceSummary: `Purchase order ${order.publicReference} line ${line.lineNumber}: ${order.supplier?.tradingName ?? order.supplier?.legalName ?? "Supplier"} / ${line.description}`,
      committedAmountPhp,
      status: "PENDING"
    });
  }
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

async function findActionableBudgetRevisionApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "BudgetRevision",
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

  const revision = await prisma.budgetRevision.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "SUBMITTED"
    },
    include: {
      budget: {
        include: {
          location: true,
          lines: {
            include: {
              location: true
            }
          }
        }
      }
    }
  });

  if (!revision) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  if (!(await hasBudgetApprovalScope(session, revision.budget))) {
    throw new Error("APPROVAL_SCOPE_DENIED");
  }

  if (revision.requestedByUserId === session.user.id) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, revision };
}

async function findActionableExpenseRequestApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "ExpenseRequest",
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

  const request = await prisma.expenseRequest.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "AWAITING_APPROVAL"
    },
    include: {
      lines: true
    }
  });

  if (!request) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  await assertApprovalScope(session, request.locationId);

  if (request.requestedByUserId === session.user.id) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, request };
}

async function findActionableCashAdvanceRequestApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "CashAdvanceRequest",
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

  const request = await prisma.cashAdvanceRequest.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "AWAITING_APPROVAL"
    },
    include: {
      movements: true,
      liquidations: true
    }
  });

  if (!request) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  await assertApprovalScope(session, request.locationId);

  if (request.requestedByUserId === session.user.id) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, request };
}

async function findActionablePettyCashRequestApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "PettyCashRequest",
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

  const request = await prisma.pettyCashRequest.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "AWAITING_APPROVAL"
    },
    include: {
      fund: true,
      ledgerEntries: true
    }
  });

  if (!request) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  await assertApprovalScope(session, request.fund.locationId);

  if (request.requestedByUserId === session.user.id) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, request };
}

async function findActionablePaymentRequestApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "PaymentRequest",
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

  const request = await prisma.paymentRequest.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "AWAITING_APPROVAL"
    },
    include: {
      lines: {
        include: {
          apInvoice: true
        }
      },
      supplier: true,
      location: true
    }
  });

  if (!request) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  await assertApprovalScope(session, request.locationId);

  if (request.requestedByUserId === session.user.id) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, request };
}

async function findActionablePaymentReleaseApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "PaymentRelease",
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

  const release = await prisma.paymentRelease.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "DRAFT"
    },
    include: {
      paymentRequest: true,
      supplier: true,
      location: true,
      bankAccount: true,
      allocations: true
    }
  });

  if (!release) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  await assertApprovalScope(session, release.locationId);

  if (
    release.createdByUserId === session.user.id ||
    release.paymentRequest.requestedByUserId === session.user.id ||
    release.paymentRequest.approvedByUserId === session.user.id
  ) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, release };
}

async function findActionableEmployeeLeaveApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "EmployeeLeaveRequest",
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

  const request = await prisma.employeeLeaveRequest.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
    },
    include: {
      employee: true,
      location: true,
      requestedByUser: true
    }
  });

  if (!request) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  const approvalLocationId = request.locationId ?? request.employee.homeLocationId;
  if (!approvalLocationId) {
    throw new Error("APPROVAL_DOCUMENT_SCOPE_NOT_FOUND");
  }

  await assertApprovalScope(session, approvalLocationId);

  if (request.requestedByUserId === session.user.id) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, request };
}

async function findActionableEmployeeOvertimeApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "EmployeeOvertimeRecord",
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

  const record = await prisma.employeeOvertimeRecord.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
    },
    include: {
      employee: true,
      location: true,
      requestedByUser: true
    }
  });

  if (!record) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  const approvalLocationId = record.locationId ?? record.employee.homeLocationId;
  if (!approvalLocationId) {
    throw new Error("APPROVAL_DOCUMENT_SCOPE_NOT_FOUND");
  }

  await assertApprovalScope(session, approvalLocationId);

  if (record.requestedByUserId === session.user.id) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, record };
}

async function findActionableWorkforceScheduleApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "WorkforceSchedule",
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

  const schedule = await prisma.workforceSchedule.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
    },
    include: {
      location: true,
      createdBy: true,
      submittedBy: true,
      lines: true
    }
  });

  if (!schedule) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  await assertApprovalScope(session, schedule.locationId);

  if (
    schedule.createdByUserId === session.user.id ||
    schedule.submittedByUserId === session.user.id
  ) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, schedule };
}

async function findActionableAttendanceImportApproval(
  session: SessionContext,
  approvalInstanceId: string
) {
  const roleIds = await getActiveRoleIds(session);
  const approval = await prisma.approvalInstance.findFirst({
    where: {
      id: approvalInstanceId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "AttendanceImportBatch",
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

  const batch = await prisma.attendanceImportBatch.findFirst({
    where: {
      id: approval.documentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "VALIDATING"
    },
    include: {
      location: true,
      createdBy: true,
      reviewedBy: true,
      lines: true
    }
  });

  if (!batch) {
    throw new Error("APPROVAL_DOCUMENT_NOT_FOUND");
  }

  await assertApprovalScope(session, batch.locationId);

  if (
    batch.createdByUserId === session.user.id ||
    batch.reviewedByUserId === session.user.id
  ) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }

  return { approval, step, batch };
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
  isEmergency?: boolean;
  slaStatus?: PurchaseRequestSlaStatus;
  slaLabel?: string;
}): ApprovalQueueItem {
  return {
    ...record,
    requiredDate: record.requiredDate.toISOString().slice(0, 10)
  };
}

function readFinanceClosePendingApproval(configSnapshot: unknown) {
  const config =
    configSnapshot && typeof configSnapshot === "object" && !Array.isArray(configSnapshot)
      ? (configSnapshot as Record<string, unknown>)
      : {};
  const pending =
    config.pendingSensitiveApproval &&
    typeof config.pendingSensitiveApproval === "object" &&
    !Array.isArray(config.pendingSensitiveApproval)
      ? (config.pendingSensitiveApproval as Record<string, unknown>)
      : {};
  const approvalAction = pending.approvalAction;
  if (approvalAction !== "LOCK_PERIOD" && approvalAction !== "REOPEN_PERIOD") {
    return null;
  }
  return {
    approvalAction,
    reason: typeof pending.reason === "string" ? pending.reason : null,
    evidenceReference:
      typeof pending.evidenceReference === "string"
        ? pending.evidenceReference
        : null,
    requestedByUserId:
      typeof pending.requestedByUserId === "string"
        ? pending.requestedByUserId
        : null
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

      if (approval.documentType === "BudgetRevision") {
        if (!permissionCodes.includes(permissions.financeBudgetApprove)) {
          return null;
        }

        const revision = await prisma.budgetRevision.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "SUBMITTED"
          },
          include: {
            requestedBy: true,
            budget: {
              include: {
                location: true,
                lines: {
                  include: {
                    location: true
                  }
                }
              }
            }
          }
        });

        if (!revision) {
          return null;
        }

        if (
          !(await hasBudgetApprovalScope(session, revision.budget)) ||
          revision.requestedByUserId === session.user.id
        ) {
          return null;
        }

        const proposedAmount = budgetRevisionAmountLabel(
          revision.proposedSnapshot
        );

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: revision.id,
          publicReference: `${revision.budget.publicReference} R${revision.revisionNumber}`,
          requesterName: revision.requestedBy.displayName,
          locationName: budgetLocationLabel(revision.budget),
          requiredDate: revision.effectiveFrom ?? revision.requestedAt,
          status: revision.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Budget revision: ${revision.revisionType.toLowerCase()}${proposedAmount ? ` / ${proposedAmount}` : ""}`
        });
      }

      if (approval.documentType === "ExpenseRequest") {
        if (!permissionCodes.includes(permissions.financeExpenseRequestApprove)) {
          return null;
        }

        const request = await prisma.expenseRequest.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "AWAITING_APPROVAL"
          },
          include: {
            requestedBy: true,
            location: true,
            _count: {
              select: { lines: true }
            },
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
          !(await hasApprovalScope(session, request.locationId)) ||
          request.requestedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: request.id,
          publicReference: request.publicReference,
          requesterName: request.requestedBy.displayName,
          locationName: request.location.name,
          requiredDate: request.requiredByDate ?? request.requestDate,
          status: request.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Expense request: ${request.title} / ${request._count.lines} line${request._count.lines === 1 ? "" : "s"}`,
          evidenceStatus: request.evidenceReference ? "Recorded" : "Missing"
        });
      }

      if (approval.documentType === "CashAdvanceRequest") {
        if (!permissionCodes.includes(permissions.financeCashAdvanceApprove)) {
          return null;
        }

        const request = await prisma.cashAdvanceRequest.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "AWAITING_APPROVAL"
          },
          include: {
            requestedBy: true,
            beneficiary: true,
            location: true
          }
        });

        if (!request) {
          return null;
        }

        if (
          !(await hasApprovalScope(session, request.locationId)) ||
          request.requestedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: request.id,
          publicReference: request.publicReference,
          requesterName: request.requestedBy.displayName,
          locationName: request.location.name,
          requiredDate: request.dueDate ?? request.requestDate,
          status: request.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Cash advance: ${request.title} / PHP ${Number(request.requestedAmountPhp).toFixed(2)}${request.beneficiary ? ` / ${request.beneficiary.displayName}` : ""}`,
          evidenceStatus: request.evidenceReference ? "Recorded" : "Missing"
        });
      }

      if (approval.documentType === "PettyCashRequest") {
        if (!permissionCodes.includes(permissions.financePettyCashApprove)) {
          return null;
        }

        const request = await prisma.pettyCashRequest.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "AWAITING_APPROVAL"
          },
          include: {
            requestedBy: true,
            fund: {
              include: {
                location: true
              }
            }
          }
        });

        if (!request) {
          return null;
        }

        if (
          !(await hasApprovalScope(session, request.fund.locationId)) ||
          request.requestedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: request.id,
          publicReference: request.publicReference,
          requesterName: request.requestedBy.displayName,
          locationName: request.fund.location.name,
          requiredDate: request.dueBy ?? request.createdAt,
          status: request.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Petty cash: ${request.requestType.toLowerCase()} / PHP ${Number(request.requestedAmountPhp).toFixed(2)} / ${request.fund.name}`,
          evidenceStatus: request.evidenceReference ? "Recorded" : "Missing"
        });
      }

      if (approval.documentType === "PaymentRequest") {
        if (!permissionCodes.includes(permissions.financePaymentRequestApprove)) {
          return null;
        }

        const request = await prisma.paymentRequest.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "AWAITING_APPROVAL"
          },
          include: {
            requestedBy: true,
            supplier: true,
            location: true,
            _count: {
              select: { lines: true }
            }
          }
        });

        if (!request) {
          return null;
        }

        if (
          !(await hasApprovalScope(session, request.locationId)) ||
          request.requestedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: request.id,
          publicReference: request.publicReference,
          requesterName: request.requestedBy.displayName,
          locationName: request.location.name,
          requiredDate: request.submittedAt ?? request.createdAt,
          status: request.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Payment request: PHP ${Number(request.totalRequestedAmount).toFixed(2)} / ${request.supplier.tradingName ?? request.supplier.legalName} / ${request._count.lines} line${request._count.lines === 1 ? "" : "s"}`,
          evidenceStatus: request.evidenceReference ? "Recorded" : "Missing"
        });
      }

      if (approval.documentType === "PaymentRelease") {
        if (!permissionCodes.includes(permissions.financePaymentRelease)) {
          return null;
        }

        const release = await prisma.paymentRelease.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "DRAFT"
          },
          include: {
            paymentRequest: true,
            supplier: true,
            location: true,
            bankAccount: true
          }
        });

        if (!release) {
          return null;
        }

        if (
          !(await hasApprovalScope(session, release.locationId)) ||
          release.createdByUserId === session.user.id ||
          release.paymentRequest.requestedByUserId === session.user.id ||
          release.paymentRequest.approvedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: release.id,
          publicReference: release.publicReference,
          requesterName: "Payment release preparer",
          locationName: release.location.name,
          requiredDate: release.scheduledAt ?? release.createdAt,
          status: release.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Payment release: PHP ${Number(release.releaseAmount).toFixed(2)} / ${release.supplier.tradingName ?? release.supplier.legalName} / ${release.method}`,
          evidenceStatus: release.evidenceReference ? "Recorded" : "Missing"
        });
      }

      if (approval.documentType === "FinanceCloseRun") {
        if (!permissionCodes.includes(permissions.financePeriodCloseManage)) {
          return null;
        }

        const run = await prisma.financeCloseRun.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "CLOSED"
          },
          include: {
            accountingPeriod: true,
            initiatedBy: true
          }
        });

        if (!run) {
          return null;
        }

        const pending = readFinanceClosePendingApproval(run.configSnapshot);
        if (
          !pending ||
          run.initiatedByUserId === session.user.id ||
          pending.requestedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: run.id,
          publicReference: run.publicReference,
          requesterName: run.initiatedBy.displayName,
          locationName: "Company period close",
          requiredDate: run.accountingPeriod.endDate,
          status: `${pending.approvalAction}_PENDING`,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `${pending.approvalAction === "LOCK_PERIOD" ? "Period close lock" : "Period reopen"} / ${run.accountingPeriod.code}`,
          evidenceStatus: pending.evidenceReference ? "Recorded" : "Missing"
        });
      }

      if (approval.documentType === "EmployeeLeaveRequest") {
        if (!permissionCodes.includes(permissions.workforceLeaveApprove)) {
          return null;
        }

        const request = await prisma.employeeLeaveRequest.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
          },
          include: {
            employee: true,
            location: true,
            requestedByUser: true
          }
        });

        if (!request) {
          return null;
        }

        const approvalLocationId =
          request.locationId ?? request.employee.homeLocationId;
        if (!approvalLocationId) {
          return null;
        }

        if (
          !(await hasApprovalScope(session, approvalLocationId)) ||
          request.requestedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: request.id,
          publicReference: `LEAVE-${request.sourceEventKey.slice(-8).toUpperCase()}`,
          requesterName: request.requestedByUser.displayName,
          locationName: request.location?.name ?? "Employee home location",
          requiredDate: request.startDate,
          status: request.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Leave request: ${request.employee.legalName} / ${request.leaveType.toLowerCase()} / ${request.requestedMinutes} minutes`,
          evidenceStatus: "Audit evidence only"
        });
      }

      if (approval.documentType === "EmployeeOvertimeRecord") {
        if (!permissionCodes.includes(permissions.workforceOvertimeApprove)) {
          return null;
        }

        const record = await prisma.employeeOvertimeRecord.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
          },
          include: {
            employee: true,
            location: true,
            requestedByUser: true
          }
        });

        if (!record) {
          return null;
        }

        const approvalLocationId =
          record.locationId ?? record.employee.homeLocationId;
        if (!approvalLocationId) {
          return null;
        }

        if (
          !(await hasApprovalScope(session, approvalLocationId)) ||
          record.requestedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: record.id,
          publicReference: `OT-${record.sourceEventKey.slice(-8).toUpperCase()}`,
          requesterName: record.requestedByUser.displayName,
          locationName: record.location?.name ?? "Employee home location",
          requiredDate: record.workedStartAt,
          status: record.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Overtime: ${record.employee.legalName} / ${record.overtimeType.toLowerCase()} / ${record.requestedMinutes} minutes`,
          evidenceStatus: "Audit evidence only"
        });
      }

      if (approval.documentType === "WorkforceSchedule") {
        if (!permissionCodes.includes(permissions.workforceScheduleManage)) {
          return null;
        }

        const schedule = await prisma.workforceSchedule.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
          },
          include: {
            location: true,
            createdBy: true,
            submittedBy: true,
            _count: {
              select: { lines: true }
            }
          }
        });

        if (!schedule) {
          return null;
        }

        if (
          !(await hasApprovalScope(session, schedule.locationId)) ||
          schedule.createdByUserId === session.user.id ||
          schedule.submittedByUserId === session.user.id
        ) {
          return null;
        }

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: schedule.id,
          publicReference: schedule.publicReference,
          requesterName:
            schedule.submittedBy?.displayName ?? schedule.createdBy.displayName,
          locationName: schedule.location.name,
          requiredDate: schedule.scheduleDate,
          status: schedule.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Schedule: ${schedule.shiftType.toLowerCase()} / ${schedule._count.lines} line${schedule._count.lines === 1 ? "" : "s"} / ${schedule.coverageGapCount} gap${schedule.coverageGapCount === 1 ? "" : "s"}`,
          evidenceStatus: schedule.evidenceReference ? "Recorded" : "Missing"
        });
      }

      if (approval.documentType === "AttendanceImportBatch") {
        if (!permissionCodes.includes(permissions.workforceAttendanceImportManage)) {
          return null;
        }

        const batch = await prisma.attendanceImportBatch.findFirst({
          where: {
            id: approval.documentId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "VALIDATING"
          },
          include: {
            location: true,
            createdBy: true,
            reviewedBy: true
          }
        });

        if (!batch) {
          return null;
        }

        if (
          !(await hasApprovalScope(session, batch.locationId)) ||
          batch.createdByUserId === session.user.id ||
          batch.reviewedByUserId === session.user.id
        ) {
          return null;
        }

        const requestedFinalStatus = attendanceImportRequestedFinalStatus(
          batch.validationSummary
        );

        return toQueueItem({
          approvalInstanceId: approval.id,
          documentType: approval.documentType,
          documentId: batch.id,
          publicReference: batch.publicReference,
          requesterName:
            batch.reviewedBy?.displayName ?? batch.createdBy.displayName,
          locationName: batch.location.name,
          requiredDate: batch.businessDate,
          status: batch.status,
          currentStepOrder: approval.currentStepOrder,
          lineDescription: `Attendance import: ${requestedFinalStatus.toLowerCase()} / ${batch.exceptionCount} exception${batch.exceptionCount === 1 ? "" : "s"} / ${batch.duplicateCount} duplicate${batch.duplicateCount === 1 ? "" : "s"}`,
          evidenceStatus: batch.evidenceReference ? "Recorded" : "Missing"
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
          lineDescription: request.lines[0]?.description ?? "No line",
          isEmergency: isEmergencyPurchaseUrgency(request.urgency),
          slaStatus: getPurchaseRequestSlaStatus({
            urgency: request.urgency,
            requiredDate: request.requiredDate,
            status: request.status as "PENDING_APPROVAL"
          }),
          slaLabel: getPurchaseRequestSlaLabel(
            getPurchaseRequestSlaStatus({
              urgency: request.urgency,
              requiredDate: request.requiredDate,
              status: request.status as "PENDING_APPROVAL"
            })
          )
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

  if (approval.documentType === "BudgetRevision") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.financeBudgetApprove)) {
      return null;
    }

    const revision = await prisma.budgetRevision.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "SUBMITTED"
      },
      include: {
        requestedBy: true,
        budget: {
          include: {
            location: true,
            lines: {
              include: {
                location: true
              }
            }
          }
        }
      }
    });

    if (!revision) {
      return null;
    }

    if (
      !(await hasBudgetApprovalScope(session, revision.budget)) ||
      revision.requestedByUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "Budget",
        entityId: revision.budgetId
      },
      orderBy: { occurredAt: "asc" }
    });
    const proposedSnapshot =
      typeof revision.proposedSnapshot === "object" &&
      revision.proposedSnapshot !== null
        ? revision.proposedSnapshot
        : {};
    const originalSnapshot =
      typeof revision.originalSnapshot === "object" &&
      revision.originalSnapshot !== null
        ? revision.originalSnapshot
        : {};
    const proposedAmount = budgetRevisionAmountLabel(proposedSnapshot);
    const originalAmount =
      "currentAmountPhp" in originalSnapshot
        ? Number(originalSnapshot.currentAmountPhp)
        : Number.NaN;
    const amountDelta =
      "amountDeltaPhp" in proposedSnapshot
        ? Number(proposedSnapshot.amountDeltaPhp)
        : Number.NaN;

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: revision.id,
        publicReference: `${revision.budget.publicReference} R${revision.revisionNumber}`,
        requesterName: revision.requestedBy.displayName,
        locationName: budgetLocationLabel(revision.budget),
        requiredDate: revision.effectiveFrom ?? revision.requestedAt,
        status: revision.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Budget revision: ${revision.revisionType.toLowerCase()}`
      }),
      approvalTitle: "Budget Revision Approval",
      approvalKind: "BudgetRevision",
      justification: revision.reason,
      quantity: 1,
      uomCode: "revision",
      amountLabel: proposedAmount,
      selectedSupplierName: null,
      selectedQuoteReference: null,
      selectionReason: Number.isFinite(originalAmount)
        ? `Current amount PHP ${originalAmount.toFixed(2)}${
            Number.isFinite(amountDelta)
              ? ` / Change PHP ${amountDelta.toFixed(2)}`
              : ""
          }`
        : null,
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

  if (approval.documentType === "ExpenseRequest") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.financeExpenseRequestApprove)) {
      return null;
    }

    const request = await prisma.expenseRequest.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "AWAITING_APPROVAL"
      },
      include: {
        requestedBy: true,
        supplier: true,
        location: true,
        lines: {
          orderBy: { lineNumber: "asc" }
        },
        sourceLinks: true
      }
    });

    if (!request) {
      return null;
    }

    if (
      !(await hasApprovalScope(session, request.locationId)) ||
      request.requestedByUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "ExpenseRequest",
        entityId: request.id
      },
      orderBy: { occurredAt: "asc" }
    });
    const firstLine = request.lines[0];
    const supplierName = request.supplier
      ? request.supplier.tradingName ?? request.supplier.legalName
      : null;

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: request.id,
        publicReference: request.publicReference,
        requesterName: request.requestedBy.displayName,
        locationName: request.location.name,
        requiredDate: request.requiredByDate ?? request.requestDate,
        status: request.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Expense request: ${request.title} / ${request.lines.length} line${request.lines.length === 1 ? "" : "s"}`,
        evidenceStatus: request.evidenceReference ? "Recorded" : "Missing"
      }),
      approvalTitle: "Expense Request Approval",
      approvalKind: "ExpenseRequest",
      justification: request.requestReason,
      quantity: request.lines.length,
      uomCode: request.lines.length === 1 ? "line" : "lines",
      amountLabel: `${request.currencyCode} ${Number(
        request.totalRequestedAmount
      ).toFixed(2)}`,
      selectedSupplierName: supplierName,
      selectedQuoteReference: request.evidenceReference,
      selectionReason: `Category: ${request.categoryCode}. Budget status: ${request.budgetStatus}. Source links: ${request.sourceLinks.length}.`,
      nonLowestJustification: null,
      singleSourceJustification: firstLine?.description ?? null,
      comments: [],
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  if (approval.documentType === "CashAdvanceRequest") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.financeCashAdvanceApprove)) {
      return null;
    }

    const request = await prisma.cashAdvanceRequest.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "AWAITING_APPROVAL"
      },
      include: {
        requestedBy: true,
        beneficiary: true,
        supplier: true,
        location: true,
        expenseRequest: true,
        movements: true,
        liquidations: true
      }
    });

    if (!request) {
      return null;
    }

    if (
      !(await hasApprovalScope(session, request.locationId)) ||
      request.requestedByUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "CashAdvanceRequest",
        entityId: request.id
      },
      orderBy: { occurredAt: "asc" }
    });
    const supplierName = request.supplier
      ? request.supplier.tradingName ?? request.supplier.legalName
      : null;

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: request.id,
        publicReference: request.publicReference,
        requesterName: request.requestedBy.displayName,
        locationName: request.location.name,
        requiredDate: request.dueDate ?? request.requestDate,
        status: request.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Cash advance: ${request.title} / ${request.categoryCode}`,
        evidenceStatus: request.evidenceReference ? "Recorded" : "Missing"
      }),
      approvalTitle: "Cash Advance Approval",
      approvalKind: "CashAdvanceRequest",
      justification: request.purpose,
      quantity: 1,
      uomCode: "request",
      amountLabel: `${request.currencyCode} ${Number(
        request.requestedAmountPhp
      ).toFixed(2)}`,
      selectedSupplierName: supplierName,
      selectedQuoteReference: request.evidenceReference,
      selectionReason: `Budget status: ${request.budgetStatus}. Source: ${request.sourceType}. Linked expense request: ${request.expenseRequest?.publicReference ?? "None"}.`,
      nonLowestJustification: null,
      singleSourceJustification: request.beneficiary
        ? `Beneficiary: ${request.beneficiary.displayName}`
        : null,
      comments: [],
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  if (approval.documentType === "PettyCashRequest") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.financePettyCashApprove)) {
      return null;
    }

    const request = await prisma.pettyCashRequest.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "AWAITING_APPROVAL"
      },
      include: {
        requestedBy: true,
        fund: {
          include: {
            location: true,
            custodian: true
          }
        },
        ledgerEntries: true
      }
    });

    if (!request) {
      return null;
    }

    if (
      !(await hasApprovalScope(session, request.fund.locationId)) ||
      request.requestedByUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "PettyCashRequest",
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
        requesterName: request.requestedBy.displayName,
        locationName: request.fund.location.name,
        requiredDate: request.dueBy ?? request.createdAt,
        status: request.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Petty cash: ${request.requestType.toLowerCase()} / ${request.fund.name}`,
        evidenceStatus: request.evidenceReference ? "Recorded" : "Missing"
      }),
      approvalTitle: "Petty Cash Approval",
      approvalKind: "PettyCashRequest",
      justification: request.justification,
      quantity: 1,
      uomCode: "request",
      amountLabel: `${request.currencyCode} ${Number(
        request.requestedAmountPhp
      ).toFixed(2)}`,
      selectedSupplierName: request.fund.custodian.displayName,
      selectedQuoteReference: request.evidenceReference,
      selectionReason: `Fund: ${request.fund.name}. Request type: ${request.requestType}. Purpose: ${request.purpose}.`,
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

  if (approval.documentType === "PaymentRequest") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.financePaymentRequestApprove)) {
      return null;
    }

    const request = await prisma.paymentRequest.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "AWAITING_APPROVAL"
      },
      include: {
        requestedBy: true,
        supplier: true,
        location: true,
        lines: {
          orderBy: { lineNumber: "asc" },
          include: {
            apInvoice: true
          }
        }
      }
    });

    if (!request) {
      return null;
    }

    if (
      !(await hasApprovalScope(session, request.locationId)) ||
      request.requestedByUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "PaymentRequest",
        entityId: request.id
      },
      orderBy: { occurredAt: "asc" }
    });
    const supplierName = request.supplier.tradingName ?? request.supplier.legalName;
    const firstLine = request.lines[0];

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: request.id,
        publicReference: request.publicReference,
        requesterName: request.requestedBy.displayName,
        locationName: request.location.name,
        requiredDate: request.submittedAt ?? request.createdAt,
        status: request.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Payment request: ${supplierName} / ${request.lines.length} line${request.lines.length === 1 ? "" : "s"}`,
        evidenceStatus: request.evidenceReference ? "Recorded" : "Missing"
      }),
      approvalTitle: "Payment Request Approval",
      approvalKind: "PaymentRequest",
      justification: request.requestReason,
      quantity: request.lines.length,
      uomCode: request.lines.length === 1 ? "line" : "lines",
      amountLabel: `${request.currencyCode} ${Number(
        request.totalRequestedAmount
      ).toFixed(2)}`,
      selectedSupplierName: supplierName,
      selectedQuoteReference: request.evidenceReference,
      selectionReason: `Source AP invoice: ${firstLine?.apInvoice.publicReference ?? "Multiple or unavailable"}. Payment release remains separate.`,
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

  if (approval.documentType === "PaymentRelease") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.financePaymentRelease)) {
      return null;
    }

    const release = await prisma.paymentRelease.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "DRAFT"
      },
      include: {
        paymentRequest: true,
        supplier: true,
        location: true,
        bankAccount: true,
        allocations: {
          include: {
            apInvoice: true
          }
        }
      }
    });

    if (!release) {
      return null;
    }

    if (
      !(await hasApprovalScope(session, release.locationId)) ||
      release.createdByUserId === session.user.id ||
      release.paymentRequest.requestedByUserId === session.user.id ||
      release.paymentRequest.approvedByUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "PaymentRelease",
        entityId: release.id
      },
      orderBy: { occurredAt: "asc" }
    });
    const supplierName = release.supplier.tradingName ?? release.supplier.legalName;
    const firstAllocation = release.allocations[0];

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: release.id,
        publicReference: release.publicReference,
        requesterName: "Payment release preparer",
        locationName: release.location.name,
        requiredDate: release.scheduledAt ?? release.createdAt,
        status: release.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Payment release: ${supplierName} / ${release.method}`,
        evidenceStatus: release.evidenceReference ? "Recorded" : "Missing"
      }),
      approvalTitle: "Payment Release Approval",
      approvalKind: "PaymentRelease",
      justification: release.reason,
      quantity: release.allocations.length,
      uomCode: release.allocations.length === 1 ? "allocation" : "allocations",
      amountLabel: `${release.currencyCode} ${Number(
        release.releaseAmount
      ).toFixed(2)}`,
      selectedSupplierName: supplierName,
      selectedQuoteReference: release.evidenceReference,
      selectionReason: `Source payment request: ${release.paymentRequest.publicReference}. Bank: ${release.bankAccount.bankName} ${release.bankAccount.maskedAccountNumber}.`,
      nonLowestJustification: null,
      singleSourceJustification: firstAllocation
        ? `Source AP invoice: ${firstAllocation.apInvoice.publicReference}`
        : null,
      comments: [],
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  if (approval.documentType === "FinanceCloseRun") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.financePeriodCloseManage)) {
      return null;
    }

    const run = await prisma.financeCloseRun.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "CLOSED"
      },
      include: {
        accountingPeriod: true,
        initiatedBy: true,
        checklistItems: true,
        exceptions: true
      }
    });

    if (!run) {
      return null;
    }

    const pending = readFinanceClosePendingApproval(run.configSnapshot);
    if (
      !pending ||
      run.initiatedByUserId === session.user.id ||
      pending.requestedByUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "FinanceCloseRun",
        entityId: run.id
      },
      orderBy: { occurredAt: "asc" }
    });
    const requiredChecks = run.checklistItems.filter((item) => item.isRequired);
    const openExceptions = run.exceptions.filter((exception) =>
      ["OPEN", "ACKNOWLEDGED"].includes(exception.state)
    );
    const actionLabel =
      pending.approvalAction === "LOCK_PERIOD"
        ? "Period close lock"
        : "Period reopen";

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: run.id,
        publicReference: run.publicReference,
        requesterName: run.initiatedBy.displayName,
        locationName: "Company period close",
        requiredDate: run.accountingPeriod.endDate,
        status: `${pending.approvalAction}_PENDING`,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `${actionLabel} / ${run.accountingPeriod.code}`,
        evidenceStatus: pending.evidenceReference ? "Recorded" : "Missing"
      }),
      approvalTitle: "Period Close Approval",
      approvalKind: "FinanceCloseRun",
      justification:
        pending.reason ??
        run.reason ??
        `${actionLabel} requested for ${run.accountingPeriod.name}.`,
      quantity: requiredChecks.length,
      uomCode: requiredChecks.length === 1 ? "required check" : "required checks",
      amountLabel: null,
      selectedSupplierName: null,
      selectedQuoteReference: pending.evidenceReference ?? run.evidenceReference,
      selectionReason: `${actionLabel}. Current period status: ${run.accountingPeriod.status}. Open exceptions: ${openExceptions.length}.`,
      nonLowestJustification: null,
      singleSourceJustification:
        "Approval only authorizes the requested period action; it does not post journals, mutate AP, execute payments, or reconcile bank lines.",
      comments: [],
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  if (approval.documentType === "EmployeeLeaveRequest") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.workforceLeaveApprove)) {
      return null;
    }

    const request = await prisma.employeeLeaveRequest.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
      },
      include: {
        employee: true,
        location: true,
        requestedByUser: true
      }
    });

    if (!request) {
      return null;
    }

    const approvalLocationId =
      request.locationId ?? request.employee.homeLocationId;
    if (!approvalLocationId) {
      return null;
    }

    if (
      !(await hasApprovalScope(session, approvalLocationId)) ||
      request.requestedByUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "EmployeeLeaveRequest",
        entityId: request.id
      },
      orderBy: { occurredAt: "asc" }
    });

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: request.id,
        publicReference: `LEAVE-${request.sourceEventKey.slice(-8).toUpperCase()}`,
        requesterName: request.requestedByUser.displayName,
        locationName: request.location?.name ?? "Employee home location",
        requiredDate: request.startDate,
        status: request.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Leave request: ${request.employee.legalName} / ${request.leaveType.toLowerCase()}`,
        evidenceStatus: "Audit evidence only"
      }),
      approvalTitle: "Employee Leave Approval",
      approvalKind: "EmployeeLeaveRequest",
      justification: request.reason,
      quantity: request.requestedMinutes,
      uomCode: "minutes",
      amountLabel: null,
      selectedSupplierName: null,
      selectedQuoteReference: null,
      selectionReason: `Dates: ${request.startDate.toISOString().slice(0, 10)} to ${request.endDate.toISOString().slice(0, 10)}. Payroll computation remains separate and out of scope.`,
      nonLowestJustification: null,
      singleSourceJustification: `Employee: ${request.employee.legalName}`,
      comments: [],
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  if (approval.documentType === "EmployeeOvertimeRecord") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.workforceOvertimeApprove)) {
      return null;
    }

    const record = await prisma.employeeOvertimeRecord.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
      },
      include: {
        employee: true,
        location: true,
        requestedByUser: true
      }
    });

    if (!record) {
      return null;
    }

    const approvalLocationId = record.locationId ?? record.employee.homeLocationId;
    if (!approvalLocationId) {
      return null;
    }

    if (
      !(await hasApprovalScope(session, approvalLocationId)) ||
      record.requestedByUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "EmployeeOvertimeRecord",
        entityId: record.id
      },
      orderBy: { occurredAt: "asc" }
    });

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: record.id,
        publicReference: `OT-${record.sourceEventKey.slice(-8).toUpperCase()}`,
        requesterName: record.requestedByUser.displayName,
        locationName: record.location?.name ?? "Employee home location",
        requiredDate: record.workedStartAt,
        status: record.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Overtime: ${record.employee.legalName} / ${record.overtimeType.toLowerCase()}`,
        evidenceStatus: "Audit evidence only"
      }),
      approvalTitle: "Employee Overtime Approval",
      approvalKind: "EmployeeOvertimeRecord",
      justification: record.reason,
      quantity: record.requestedMinutes,
      uomCode: "minutes",
      amountLabel: null,
      selectedSupplierName: null,
      selectedQuoteReference: null,
      selectionReason: `Worked time: ${record.workedStartAt.toISOString()} to ${record.workedEndAt.toISOString()}. Payroll computation remains separate and out of scope.`,
      nonLowestJustification: null,
      singleSourceJustification: `Employee: ${record.employee.legalName}`,
      comments: [],
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  if (approval.documentType === "WorkforceSchedule") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.workforceScheduleManage)) {
      return null;
    }

    const schedule = await prisma.workforceSchedule.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
      },
      include: {
        location: true,
        createdBy: true,
        submittedBy: true,
        lines: {
          orderBy: { lineNumber: "asc" }
        }
      }
    });

    if (!schedule) {
      return null;
    }

    if (
      !(await hasApprovalScope(session, schedule.locationId)) ||
      schedule.createdByUserId === session.user.id ||
      schedule.submittedByUserId === session.user.id
    ) {
      return null;
    }

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "WorkforceSchedule",
        entityId: schedule.id
      },
      orderBy: { occurredAt: "asc" }
    });

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: schedule.id,
        publicReference: schedule.publicReference,
        requesterName:
          schedule.submittedBy?.displayName ?? schedule.createdBy.displayName,
        locationName: schedule.location.name,
        requiredDate: schedule.scheduleDate,
        status: schedule.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Schedule: ${schedule.shiftType.toLowerCase()} / ${schedule.lines.length} line${schedule.lines.length === 1 ? "" : "s"}`,
        evidenceStatus: schedule.evidenceReference ? "Recorded" : "Missing"
      }),
      approvalTitle: "Workforce Schedule Approval",
      approvalKind: "WorkforceSchedule",
      justification: schedule.reason ?? "Schedule approval requested.",
      quantity: schedule.lines.length,
      uomCode: schedule.lines.length === 1 ? "line" : "lines",
      amountLabel: null,
      selectedSupplierName: null,
      selectedQuoteReference: schedule.evidenceReference,
      selectionReason: `Date: ${schedule.scheduleDate.toISOString().slice(0, 10)}. Shift: ${schedule.shiftType}. Planned headcount: ${schedule.plannedHeadcount}. Coverage gaps: ${schedule.coverageGapCount}. Publication remains a separate action after approval.`,
      nonLowestJustification: null,
      singleSourceJustification:
        schedule.coverageGapCount > 0
          ? "Coverage gaps require waiver evidence at publish."
          : "No open coverage gaps recorded.",
      comments: [],
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  if (approval.documentType === "AttendanceImportBatch") {
    const permissionCodes = await getGrantedPermissionCodes(session);
    if (!permissionCodes.includes(permissions.workforceAttendanceImportManage)) {
      return null;
    }

    const batch = await prisma.attendanceImportBatch.findFirst({
      where: {
        id: approval.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "VALIDATING"
      },
      include: {
        location: true,
        createdBy: true,
        reviewedBy: true,
        lines: true
      }
    });

    if (!batch) {
      return null;
    }

    if (
      !(await hasApprovalScope(session, batch.locationId)) ||
      batch.createdByUserId === session.user.id ||
      batch.reviewedByUserId === session.user.id
    ) {
      return null;
    }

    const requestedFinalStatus = attendanceImportRequestedFinalStatus(
      batch.validationSummary
    );
    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "AttendanceImportBatch",
        entityId: batch.id
      },
      orderBy: { occurredAt: "asc" }
    });

    return {
      ...toQueueItem({
        approvalInstanceId: approval.id,
        documentType: approval.documentType,
        documentId: batch.id,
        publicReference: batch.publicReference,
        requesterName:
          batch.reviewedBy?.displayName ?? batch.createdBy.displayName,
        locationName: batch.location.name,
        requiredDate: batch.businessDate,
        status: batch.status,
        currentStepOrder: approval.currentStepOrder,
        lineDescription: `Attendance import: ${requestedFinalStatus.toLowerCase()} / ${batch.lines.length} line${batch.lines.length === 1 ? "" : "s"}`,
        evidenceStatus: batch.evidenceReference ? "Recorded" : "Missing"
      }),
      approvalTitle: "Attendance Import Review Approval",
      approvalKind: "AttendanceImportBatch",
      justification:
        batch.rejectionReason ??
        `Review ${batch.exceptionCount} exception(s) and ${batch.duplicateCount} duplicate(s).`,
      quantity: batch.lines.length,
      uomCode: batch.lines.length === 1 ? "row" : "rows",
      amountLabel: null,
      selectedSupplierName: null,
      selectedQuoteReference: batch.evidenceReference,
      selectionReason: `Requested result: ${requestedFinalStatus}. Accepted rows: ${batch.acceptedCount}/${batch.rowCount}. Attendance remains evidence only and does not become device truth or payroll output.`,
      nonLowestJustification: null,
      singleSourceJustification: `Source: ${batch.sourceType} / ${batch.sourceReference}`,
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
    const approvedAt = new Date();
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: "APPROVED",
        actedAt: approvedAt,
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
    await projectPurchaseRequestBudgetCommitments(
      tx,
      session,
      request,
      approvedAt
    );
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

    const approvedAt = new Date();
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: "APPROVED",
        actedAt: approvedAt,
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
        status: "CLOSED",
        cancellationSubtype: "remaining_balance_closure",
        cancellationReason: closure.reason,
        cancelledAt: approvedAt,
        cancelledByUserId: session.user.id
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
        approvedAt,
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
          afterData: {
            status: "CLOSED",
            cancellationSubtype: "remaining_balance_closure",
            cancelledAt: approvedAt.toISOString()
          },
          metadata: {
            approvalInstanceId: approval.id,
            balanceClosureId: closure.id,
            cancellationSubtype: "remaining_balance_closure",
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

  if (approval.documentType === "BudgetRevision") {
    await approveBudgetRevision(formData);
    return;
  }

  if (approval.documentType === "ExpenseRequest") {
    await approveExpenseRequest(formData);
    return;
  }

  if (approval.documentType === "CashAdvanceRequest") {
    await approveCashAdvanceRequest(formData);
    return;
  }

  if (approval.documentType === "PettyCashRequest") {
    await approvePettyCashRequest(formData);
    return;
  }

  if (approval.documentType === "PaymentRequest") {
    await approvePaymentRequestApproval(formData);
    return;
  }

  if (approval.documentType === "PaymentRelease") {
    await approvePaymentReleaseApproval(formData);
    return;
  }

  if (approval.documentType === "FinanceCloseRun") {
    await approveFinanceCloseRunApproval(formData);
    return;
  }

  if (approval.documentType === "EmployeeLeaveRequest") {
    await approveEmployeeLeaveRequestApproval(formData);
    return;
  }

  if (approval.documentType === "EmployeeOvertimeRecord") {
    await approveEmployeeOvertimeRecordApproval(formData);
    return;
  }

  if (approval.documentType === "WorkforceSchedule") {
    await approveWorkforceScheduleApproval(formData);
    return;
  }

  if (approval.documentType === "AttendanceImportBatch") {
    await approveAttendanceImportBatchApproval(formData);
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

  if (approval.documentType === "BudgetRevision") {
    throw new Error("BUDGET_REVISION_RETURN_NOT_SUPPORTED");
  }

  if (approval.documentType === "ExpenseRequest") {
    await closeExpenseRequestWithDecision(
      formData,
      "RETURNED_FOR_REVISION",
      "RETURNED",
      "expense_request.returned"
    );
    return;
  }

  if (approval.documentType === "CashAdvanceRequest") {
    await closeCashAdvanceRequestWithDecision(
      formData,
      "RETURNED_FOR_REVISION",
      "RETURNED",
      "cash_advance.returned"
    );
    return;
  }

  if (approval.documentType === "PettyCashRequest") {
    await closePettyCashRequestWithDecision(
      formData,
      "RETURNED_FOR_REVISION",
      "RETURNED",
      "petty_cash.request_returned"
    );
    return;
  }

  if (approval.documentType === "PaymentRequest") {
    await closePaymentRequestWithDecision(
      formData,
      "RETURNED_FOR_REVISION",
      "RETURNED",
      "payment_request.returned"
    );
    return;
  }

  if (approval.documentType === "PaymentRelease") {
    throw new Error("PAYMENT_RELEASE_RETURN_NOT_SUPPORTED");
  }

  if (approval.documentType === "FinanceCloseRun") {
    throw new Error("PERIOD_CLOSE_APPROVAL_RETURN_NOT_SUPPORTED");
  }

  if (approval.documentType === "EmployeeLeaveRequest") {
    await closeEmployeeLeaveRequestWithDecision(
      formData,
      "RETURNED_FOR_REVISION",
      "RETURNED",
      "workforce.leave_returned"
    );
    return;
  }

  if (approval.documentType === "EmployeeOvertimeRecord") {
    throw new Error("WORKFORCE_OVERTIME_RETURN_NOT_SUPPORTED");
  }

  if (approval.documentType === "WorkforceSchedule") {
    await closeWorkforceScheduleWithDecision(
      formData,
      "RETURNED_FOR_REVISION",
      "RETURNED",
      "workforce.schedule_returned"
    );
    return;
  }

  if (approval.documentType === "AttendanceImportBatch") {
    await closeAttendanceImportBatchWithDecision(
      formData,
      "RETURNED",
      "workforce.attendance_import_returned"
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

  if (approval.documentType === "BudgetRevision") {
    await closeBudgetRevisionWithDecision(
      formData,
      "REJECTED",
      "budget.revision_rejected"
    );
    return;
  }

  if (approval.documentType === "ExpenseRequest") {
    await closeExpenseRequestWithDecision(
      formData,
      "REJECTED",
      "REJECTED",
      "expense_request.rejected"
    );
    return;
  }

  if (approval.documentType === "CashAdvanceRequest") {
    await closeCashAdvanceRequestWithDecision(
      formData,
      "REJECTED",
      "REJECTED",
      "cash_advance.rejected"
    );
    return;
  }

  if (approval.documentType === "PettyCashRequest") {
    await closePettyCashRequestWithDecision(
      formData,
      "REJECTED",
      "REJECTED",
      "petty_cash.request_rejected"
    );
    return;
  }

  if (approval.documentType === "PaymentRequest") {
    await closePaymentRequestWithDecision(
      formData,
      "REJECTED",
      "REJECTED",
      "payment_request.rejected"
    );
    return;
  }

  if (approval.documentType === "PaymentRelease") {
    await rejectPaymentReleaseApproval(formData);
    return;
  }

  if (approval.documentType === "FinanceCloseRun") {
    await rejectFinanceCloseRunApproval(formData);
    return;
  }

  if (approval.documentType === "EmployeeLeaveRequest") {
    await closeEmployeeLeaveRequestWithDecision(
      formData,
      "REJECTED",
      "REJECTED",
      "workforce.leave_rejected"
    );
    return;
  }

  if (approval.documentType === "EmployeeOvertimeRecord") {
    await rejectEmployeeOvertimeRecordApproval(formData);
    return;
  }

  if (approval.documentType === "WorkforceSchedule") {
    await closeWorkforceScheduleWithDecision(
      formData,
      "REJECTED",
      "REJECTED",
      "workforce.schedule_rejected"
    );
    return;
  }

  if (approval.documentType === "AttendanceImportBatch") {
    await closeAttendanceImportBatchWithDecision(
      formData,
      "REJECTED",
      "workforce.attendance_import_approval_rejected"
    );
    return;
  }

  await rejectPurchaseRequest(formData);
}

export async function approveEmployeeLeaveRequestApproval(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.workforceLeaveApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, request } = await findActionableEmployeeLeaveApproval(
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
      await tx.employeeLeaveRequest.updateMany({
        where: {
          id: request.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
        },
        data: {
          status: "UNDER_REVIEW",
          decisionAt: new Date(),
          decisionNote: values.remarks?.trim() ?? "Advanced to next approval step",
          updatedByUserId: session.user.id
        }
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "workforce.leave_approval_step_approved",
          entityType: "EmployeeLeaveRequest",
          entityId: request.id,
          beforeData: { currentStepOrder: step.stepOrder },
          afterData: { currentStepOrder: nextStep.stepOrder },
          metadata: {
            approvalInstanceId: approval.id,
            approvedStepOrder: step.stepOrder,
            nextStepOrder: nextStep.stepOrder,
            remarks: values.remarks ?? null,
            noPayrollComputation: true,
            noWageComputation: true,
            noPayrollExport: true,
            noPaymentRequest: true,
            noFinanceJournal: true,
            noAttendanceDeviceAuthority: true
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
    const updatedRequest = await tx.employeeLeaveRequest.updateMany({
      where: {
        id: request.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
      },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        decisionAt: new Date(),
        decisionNote: values.remarks?.trim() ?? "Approved",
        updatedByUserId: session.user.id
      }
    });
    if (updatedRequest.count !== 1) {
      throw new Error("WORKFORCE_LEAVE_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "workforce.leave_approved",
        entityType: "EmployeeLeaveRequest",
        entityId: request.id,
        beforeData: { status: request.status },
        afterData: { status: "APPROVED" },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks ?? null,
          noSelfApproval: true,
          noPayrollComputation: true,
          noWageComputation: true,
          noPayrollExport: true,
          noPaymentRequest: true,
          noFinanceJournal: true,
          noAttendanceDeviceAuthority: true
        }
      }
    });
  });
}

async function closeEmployeeLeaveRequestWithDecision(
  formData: FormData,
  requestStatus: "RETURNED_FOR_REVISION" | "REJECTED",
  approvalStatus: "RETURNED" | "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.workforceLeaveApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, request } = await findActionableEmployeeLeaveApproval(
    session,
    values.approvalInstanceId
  );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: approvalStatus,
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstanceStep.updateMany({
      where: {
        approvalInstanceId: approval.id,
        status: "WAITING"
      },
      data: { status: "SKIPPED" }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: approvalStatus,
        currentStepOrder: null
      }
    });
    const updatedRequest = await tx.employeeLeaveRequest.updateMany({
      where: {
        id: request.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
      },
      data: {
        status: requestStatus,
        decisionAt: new Date(),
        decisionNote: values.remarks,
        updatedByUserId: session.user.id
      }
    });
    if (updatedRequest.count !== 1) {
      throw new Error("WORKFORCE_LEAVE_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "EmployeeLeaveRequest",
        entityId: request.id,
        beforeData: { status: request.status },
        afterData: { status: requestStatus },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks,
          noPayrollComputation: true,
          noWageComputation: true,
          noPayrollExport: true,
          noPaymentRequest: true,
          noFinanceJournal: true,
          noAttendanceDeviceAuthority: true
        }
      }
    });
  });
}

export async function approveEmployeeOvertimeRecordApproval(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.workforceOvertimeApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, record } = await findActionableEmployeeOvertimeApproval(
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
      await tx.employeeOvertimeRecord.updateMany({
        where: {
          id: record.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
        },
        data: {
          status: "UNDER_REVIEW",
          updatedByUserId: session.user.id
        }
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "workforce.overtime_approval_step_approved",
          entityType: "EmployeeOvertimeRecord",
          entityId: record.id,
          beforeData: { currentStepOrder: step.stepOrder },
          afterData: { currentStepOrder: nextStep.stepOrder },
          metadata: {
            approvalInstanceId: approval.id,
            approvedStepOrder: step.stepOrder,
            nextStepOrder: nextStep.stepOrder,
            remarks: values.remarks ?? null,
            noPayrollComputation: true,
            noWageComputation: true,
            noPayrollExport: true,
            noPaymentRequest: true,
            noFinanceJournal: true,
            noAttendanceDeviceAuthority: true
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
    const updatedRecord = await tx.employeeOvertimeRecord.updateMany({
      where: {
        id: record.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
      },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        updatedByUserId: session.user.id
      }
    });
    if (updatedRecord.count !== 1) {
      throw new Error("WORKFORCE_OVERTIME_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "workforce.overtime_approved",
        entityType: "EmployeeOvertimeRecord",
        entityId: record.id,
        beforeData: { status: record.status },
        afterData: { status: "APPROVED" },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks ?? null,
          noSelfApproval: true,
          noPayrollComputation: true,
          noWageComputation: true,
          noPayrollExport: true,
          noPaymentRequest: true,
          noFinanceJournal: true,
          noAttendanceDeviceAuthority: true
        }
      }
    });
  });
}

export async function rejectEmployeeOvertimeRecordApproval(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.workforceOvertimeApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, record } = await findActionableEmployeeOvertimeApproval(
    session,
    values.approvalInstanceId
  );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: "REJECTED",
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstanceStep.updateMany({
      where: {
        approvalInstanceId: approval.id,
        status: "WAITING"
      },
      data: { status: "SKIPPED" }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: "REJECTED",
        currentStepOrder: null
      }
    });
    const updatedRecord = await tx.employeeOvertimeRecord.updateMany({
      where: {
        id: record.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
      },
      data: {
        status: "REJECTED",
        updatedByUserId: session.user.id
      }
    });
    if (updatedRecord.count !== 1) {
      throw new Error("WORKFORCE_OVERTIME_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "workforce.overtime_rejected",
        entityType: "EmployeeOvertimeRecord",
        entityId: record.id,
        beforeData: { status: record.status },
        afterData: { status: "REJECTED" },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks,
          noPayrollComputation: true,
          noWageComputation: true,
          noPayrollExport: true,
          noPaymentRequest: true,
          noFinanceJournal: true,
          noAttendanceDeviceAuthority: true
        }
      }
    });
  });
}

export async function approveWorkforceScheduleApproval(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.workforceScheduleManage);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, schedule } = await findActionableWorkforceScheduleApproval(
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
      await tx.workforceSchedule.updateMany({
        where: {
          id: schedule.id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
        },
        data: {
          status: "UNDER_REVIEW",
          reason: values.remarks?.trim() ?? schedule.reason
        }
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "workforce.schedule_approval_step_approved",
          entityType: "WorkforceSchedule",
          entityId: schedule.id,
          beforeData: { currentStepOrder: step.stepOrder },
          afterData: { currentStepOrder: nextStep.stepOrder },
          metadata: {
            approvalInstanceId: approval.id,
            approvedStepOrder: step.stepOrder,
            nextStepOrder: nextStep.stepOrder,
            remarks: values.remarks ?? null,
            noSchedulePublication: true,
            noPayrollComputation: true,
            noWageComputation: true,
            noPayrollExport: true,
            noPaymentRequest: true,
            noFinanceJournal: true,
            noAttendanceDeviceAuthority: true
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
    const updatedSchedule = await tx.workforceSchedule.updateMany({
      where: {
        id: schedule.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
      },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        reason: values.remarks?.trim() ?? schedule.reason
      }
    });
    if (updatedSchedule.count !== 1) {
      throw new Error("WORKFORCE_SCHEDULE_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "workforce.schedule_approved",
        entityType: "WorkforceSchedule",
        entityId: schedule.id,
        beforeData: { status: schedule.status },
        afterData: { status: "APPROVED" },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks ?? null,
          noSelfApproval: true,
          noSchedulePublication: true,
          noPayrollComputation: true,
          noWageComputation: true,
          noPayrollExport: true,
          noPaymentRequest: true,
          noFinanceJournal: true,
          noAttendanceDeviceAuthority: true
        }
      }
    });
  });
}

async function closeWorkforceScheduleWithDecision(
  formData: FormData,
  scheduleStatus: "RETURNED_FOR_REVISION" | "REJECTED",
  approvalStatus: "RETURNED" | "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.workforceScheduleManage);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, schedule } = await findActionableWorkforceScheduleApproval(
    session,
    values.approvalInstanceId
  );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: approvalStatus,
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstanceStep.updateMany({
      where: {
        approvalInstanceId: approval.id,
        status: "WAITING"
      },
      data: { status: "SKIPPED" }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: approvalStatus,
        currentStepOrder: null
      }
    });
    const updatedSchedule = await tx.workforceSchedule.updateMany({
      where: {
        id: schedule.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
      },
      data: {
        status: scheduleStatus,
        reason: values.remarks
      }
    });
    if (updatedSchedule.count !== 1) {
      throw new Error("WORKFORCE_SCHEDULE_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "WorkforceSchedule",
        entityId: schedule.id,
        beforeData: { status: schedule.status },
        afterData: { status: scheduleStatus },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks,
          noSchedulePublication: true,
          noPayrollComputation: true,
          noWageComputation: true,
          noPayrollExport: true,
          noPaymentRequest: true,
          noFinanceJournal: true,
          noAttendanceDeviceAuthority: true
        }
      }
    });
  });
}

export async function approveAttendanceImportBatchApproval(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.workforceAttendanceImportManage);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, batch } = await findActionableAttendanceImportApproval(
    session,
    values.approvalInstanceId
  );
  const requestedFinalStatus = attendanceImportRequestedFinalStatus(
    batch.validationSummary
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
          eventType: "workforce.attendance_import_approval_step_approved",
          entityType: "AttendanceImportBatch",
          entityId: batch.id,
          beforeData: { currentStepOrder: step.stepOrder },
          afterData: { currentStepOrder: nextStep.stepOrder },
          metadata: {
            approvalInstanceId: approval.id,
            approvedStepOrder: step.stepOrder,
            nextStepOrder: nextStep.stepOrder,
            remarks: values.remarks ?? null,
            noPayrollExport: true,
            noAttendanceDeviceAuthority: true,
            noPaymentRequest: true,
            noFinanceJournal: true
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
    const updatedBatch = await tx.attendanceImportBatch.updateMany({
      where: {
        id: batch.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "VALIDATING"
      },
      data: {
        status: requestedFinalStatus,
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        rejectionReason:
          requestedFinalStatus === "REJECTED"
            ? values.remarks?.trim() ?? batch.rejectionReason
            : batch.rejectionReason,
        validationSummary: {
          verdict: requestedFinalStatus,
          approvalApproved: true,
          approvalInstanceId: approval.id,
          approverRemarks: values.remarks ?? null,
          rowCount: batch.rowCount,
          acceptedCount: batch.acceptedCount,
          exceptionCount: batch.exceptionCount,
          duplicateCount: batch.duplicateCount,
          noPayrollExport: true,
          noAttendanceDeviceAuthority: true,
          noPaymentRequest: true,
          noFinanceJournal: true
        }
      }
    });
    if (updatedBatch.count !== 1) {
      throw new Error("WORKFORCE_ATTENDANCE_IMPORT_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "workforce.attendance_import_approved",
        entityType: "AttendanceImportBatch",
        entityId: batch.id,
        beforeData: { status: batch.status },
        afterData: { status: requestedFinalStatus },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks ?? null,
          noSelfApproval: true,
          noPayrollExport: true,
          noAttendanceDeviceAuthority: true,
          noPaymentRequest: true,
          noFinanceJournal: true
        }
      }
    });
  });
}

async function closeAttendanceImportBatchWithDecision(
  formData: FormData,
  approvalStatus: "RETURNED" | "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.workforceAttendanceImportManage);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, batch } = await findActionableAttendanceImportApproval(
    session,
    values.approvalInstanceId
  );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: approvalStatus,
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstanceStep.updateMany({
      where: {
        approvalInstanceId: approval.id,
        status: "WAITING"
      },
      data: { status: "SKIPPED" }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: approvalStatus,
        currentStepOrder: null
      }
    });
    const updatedBatch = await tx.attendanceImportBatch.updateMany({
      where: {
        id: batch.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "VALIDATING"
      },
      data: {
        status: "REVIEW_READY",
        rejectionReason: values.remarks,
        validationSummary: {
          approvalStatus,
          approvalInstanceId: approval.id,
          approverRemarks: values.remarks,
          returnedForReReview: true,
          rowCount: batch.rowCount,
          acceptedCount: batch.acceptedCount,
          exceptionCount: batch.exceptionCount,
          duplicateCount: batch.duplicateCount,
          noPayrollExport: true,
          noAttendanceDeviceAuthority: true,
          noPaymentRequest: true,
          noFinanceJournal: true
        }
      }
    });
    if (updatedBatch.count !== 1) {
      throw new Error("WORKFORCE_ATTENDANCE_IMPORT_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "AttendanceImportBatch",
        entityId: batch.id,
        beforeData: { status: batch.status },
        afterData: { status: "REVIEW_READY" },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks,
          noPayrollExport: true,
          noAttendanceDeviceAuthority: true,
          noPaymentRequest: true,
          noFinanceJournal: true
        }
      }
    });
  });
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
    const approvedAt = new Date();
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: "APPROVED",
        actedAt: approvedAt,
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
    await projectPurchaseOrderBudgetCommitments(tx, session, order, approvedAt);
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

export async function approveBudgetRevision(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeBudgetApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, revision } = await findActionableBudgetRevisionApproval(
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
          eventType: "budget.revision_approval_step_approved",
          entityType: "Budget",
          entityId: revision.budgetId,
          beforeData: { currentStepOrder: step.stepOrder },
          afterData: { currentStepOrder: nextStep.stepOrder },
          metadata: {
            approvalInstanceId: approval.id,
            revisionId: revision.id,
            revisionNumber: revision.revisionNumber,
            approvedStepOrder: step.stepOrder,
            nextStepOrder: nextStep.stepOrder,
            remarks: values.remarks ?? null,
            budgetMutationDeferred: true,
            lineMutationDeferred: true,
            noSourceMutation: true,
            noPaymentMutation: true,
            noJournalPosting: true
          }
        }
      });
      return;
    }

    const approvedSnapshot = {
      ...(typeof revision.proposedSnapshot === "object" &&
      revision.proposedSnapshot !== null
        ? revision.proposedSnapshot
        : {}),
      approvedByUserId: session.user.id,
      approvedAt: new Date().toISOString(),
      approvalInstanceId: approval.id,
      budgetMutationDeferred: true,
      lineMutationDeferred: true,
      noSourceMutation: true,
      noPaymentMutation: true,
      noJournalPosting: true
    };
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        currentStepOrder: null
      }
    });
    const updatedRevision = await tx.budgetRevision.updateMany({
      where: {
        id: revision.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "SUBMITTED"
      },
      data: {
        status: "APPROVED",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        approvedSnapshot
      }
    });
    if (updatedRevision.count !== 1) {
      throw new Error("BUDGET_REVISION_NOT_SUBMITTED");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "budget.revision_approved",
        entityType: "Budget",
        entityId: revision.budgetId,
        beforeData: { status: "SUBMITTED" },
        afterData: { status: "APPROVED" },
        metadata: {
          approvalInstanceId: approval.id,
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          remarks: values.remarks ?? null,
          noSelfApproval: true,
          approvedRequestOnly: true,
          budgetMutationDeferred: true,
          lineMutationDeferred: true,
          noSourceMutation: true,
          noPaymentMutation: true,
          noJournalPosting: true
        }
      }
    });
  });
}

export async function approveExpenseRequest(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeExpenseRequestApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, request } = await findActionableExpenseRequestApproval(
    session,
    values.approvalInstanceId
  );

  if (request.budgetStatus === "OVER_BUDGET" && !values.remarks?.trim()) {
    throw new Error("EXPENSE_REQUEST_BUDGET_OVERRIDE_REASON_REQUIRED");
  }

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
          eventType: "expense_request.approval_step_approved",
          entityType: "ExpenseRequest",
          entityId: request.id,
          beforeData: { currentStepOrder: step.stepOrder },
          afterData: { currentStepOrder: nextStep.stepOrder },
          metadata: {
            approvalInstanceId: approval.id,
            approvedStepOrder: step.stepOrder,
            nextStepOrder: nextStep.stepOrder,
            remarks: values.remarks ?? null,
            noPaymentCreation: true,
            noPaymentRelease: true,
            noJournalPosting: true,
            noApSettlement: true
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
    const updatedRequest = await tx.expenseRequest.updateMany({
      where: {
        id: request.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "AWAITING_APPROVAL"
      },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        budgetSnapshot: {
          budgetStatus: request.budgetStatus,
          overrideReason: values.remarks?.trim() ?? null,
          approvalInstanceId: approval.id,
          warningFirst: true,
          noPaymentMutation: true,
          noJournalPosting: true
        },
        version: { increment: 1 }
      }
    });
    if (updatedRequest.count !== 1) {
      throw new Error("EXPENSE_REQUEST_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "expense_request.approved",
        entityType: "ExpenseRequest",
        entityId: request.id,
        beforeData: { status: "AWAITING_APPROVAL" },
        afterData: { status: "APPROVED" },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks ?? null,
          budgetStatus: request.budgetStatus,
          noSelfApproval: true,
          noPaymentCreation: true,
          noPaymentRelease: true,
          noJournalPosting: true,
          noApSettlement: true
        }
      }
    });
  });
}

async function closeExpenseRequestWithDecision(
  formData: FormData,
  requestStatus: "RETURNED_FOR_REVISION" | "REJECTED",
  approvalStatus: "RETURNED" | "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeExpenseRequestApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, request } = await findActionableExpenseRequestApproval(
    session,
    values.approvalInstanceId
  );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: approvalStatus,
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstanceStep.updateMany({
      where: {
        approvalInstanceId: approval.id,
        status: "WAITING"
      },
      data: { status: "SKIPPED" }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: approvalStatus,
        currentStepOrder: null
      }
    });
    const updatedRequest = await tx.expenseRequest.updateMany({
      where: {
        id: request.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "AWAITING_APPROVAL"
      },
      data:
        requestStatus === "RETURNED_FOR_REVISION"
          ? {
              status: requestStatus,
              returnedByUserId: session.user.id,
              returnedAt: new Date(),
              returnReason: values.remarks,
              version: { increment: 1 }
            }
          : {
              status: requestStatus,
              rejectedByUserId: session.user.id,
              rejectedAt: new Date(),
              rejectionReason: values.remarks,
              version: { increment: 1 }
            }
    });
    if (updatedRequest.count !== 1) {
      throw new Error("EXPENSE_REQUEST_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "ExpenseRequest",
        entityId: request.id,
        beforeData: { status: "AWAITING_APPROVAL" },
        afterData: { status: requestStatus },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks,
          noPaymentCreation: true,
          noPaymentRelease: true,
          noJournalPosting: true,
          noApSettlement: true
        }
      }
    });
  });
}

export async function approveCashAdvanceRequest(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeCashAdvanceApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, request } =
    await findActionableCashAdvanceRequestApproval(
      session,
      values.approvalInstanceId
    );

  if (request.budgetStatus === "OVER_BUDGET") {
    if (!values.remarks?.trim()) {
      throw new Error("CASH_ADVANCE_BUDGET_OVERRIDE_REASON_REQUIRED");
    }
    if (!request.evidenceReference) {
      throw new Error("CASH_ADVANCE_BUDGET_OVERRIDE_EVIDENCE_REQUIRED");
    }
  }

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
          eventType: "cash_advance.approval_step_approved",
          entityType: "CashAdvanceRequest",
          entityId: request.id,
          beforeData: { currentStepOrder: step.stepOrder },
          afterData: { currentStepOrder: nextStep.stepOrder },
          metadata: {
            approvalInstanceId: approval.id,
            approvedStepOrder: step.stepOrder,
            nextStepOrder: nextStep.stepOrder,
            remarks: values.remarks ?? null,
            noPaymentCreation: true,
            noPaymentRelease: true,
            noJournalPosting: true,
            noBankMutation: true,
            noApSettlement: true
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
    const updatedRequest = await tx.cashAdvanceRequest.updateMany({
      where: {
        id: request.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "AWAITING_APPROVAL"
      },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        budgetSnapshot: {
          budgetStatus: request.budgetStatus,
          overrideReason: values.remarks?.trim() ?? null,
          approvalInstanceId: approval.id,
          nonPostingApproval: true,
          noPaymentRelease: true,
          noJournalPosting: true,
          noBankMutation: true
        },
        version: { increment: 1 }
      }
    });
    if (updatedRequest.count !== 1) {
      throw new Error("CASH_ADVANCE_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "cash_advance.approved",
        entityType: "CashAdvanceRequest",
        entityId: request.id,
        beforeData: { status: "AWAITING_APPROVAL" },
        afterData: { status: "APPROVED" },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks ?? null,
          budgetStatus: request.budgetStatus,
          noSelfApproval: true,
          noPaymentCreation: true,
          noPaymentRelease: true,
          noJournalPosting: true,
          noBankMutation: true,
          noApSettlement: true
        }
      }
    });
  });
}

async function closeCashAdvanceRequestWithDecision(
  formData: FormData,
  requestStatus: "RETURNED_FOR_REVISION" | "REJECTED",
  approvalStatus: "RETURNED" | "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeCashAdvanceApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, request } =
    await findActionableCashAdvanceRequestApproval(
      session,
      values.approvalInstanceId
    );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: approvalStatus,
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstanceStep.updateMany({
      where: {
        approvalInstanceId: approval.id,
        status: "WAITING"
      },
      data: { status: "SKIPPED" }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: approvalStatus,
        currentStepOrder: null
      }
    });
    const updatedRequest = await tx.cashAdvanceRequest.updateMany({
      where: {
        id: request.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "AWAITING_APPROVAL"
      },
      data:
        requestStatus === "RETURNED_FOR_REVISION"
          ? {
              status: requestStatus,
              returnedByUserId: session.user.id,
              returnedAt: new Date(),
              returnReason: values.remarks,
              version: { increment: 1 }
            }
          : {
              status: requestStatus,
              rejectedByUserId: session.user.id,
              rejectedAt: new Date(),
              rejectionReason: values.remarks,
              version: { increment: 1 }
            }
    });
    if (updatedRequest.count !== 1) {
      throw new Error("CASH_ADVANCE_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "CashAdvanceRequest",
        entityId: request.id,
        beforeData: { status: "AWAITING_APPROVAL" },
        afterData: { status: requestStatus },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks,
          noPaymentCreation: true,
          noPaymentRelease: true,
          noJournalPosting: true,
          noBankMutation: true,
          noApSettlement: true
        }
      }
    });
  });
}

export async function approvePettyCashRequest(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePettyCashApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, request } =
    await findActionablePettyCashRequestApproval(
      session,
      values.approvalInstanceId
    );

  if (!request.evidenceReference) {
    throw new Error("PETTY_CASH_REQUEST_EVIDENCE_REQUIRED");
  }

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
          eventType: "petty_cash.request_approval_step_approved",
          entityType: "PettyCashRequest",
          entityId: request.id,
          beforeData: { currentStepOrder: step.stepOrder },
          afterData: { currentStepOrder: nextStep.stepOrder },
          metadata: {
            approvalInstanceId: approval.id,
            approvedStepOrder: step.stepOrder,
            nextStepOrder: nextStep.stepOrder,
            remarks: values.remarks ?? null,
            noPaymentCreation: true,
            noPaymentRelease: true,
            noJournalPosting: true,
            noBankMutation: true,
            noPeriodCloseMutation: true
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
    const updatedRequest = await tx.pettyCashRequest.updateMany({
      where: {
        id: request.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "AWAITING_APPROVAL"
      },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        approvedAmountPhp: request.requestedAmountPhp
      }
    });
    if (updatedRequest.count !== 1) {
      throw new Error("PETTY_CASH_REQUEST_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "petty_cash.request_approved",
        entityType: "PettyCashRequest",
        entityId: request.id,
        beforeData: { status: "AWAITING_APPROVAL" },
        afterData: {
          status: "APPROVED",
          approvedAmountPhp: Number(request.requestedAmountPhp)
        },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks ?? null,
          noSelfApproval: true,
          noPaymentCreation: true,
          noPaymentRelease: true,
          noJournalPosting: true,
          noBankMutation: true,
          noPeriodCloseMutation: true
        }
      }
    });
  });
}

async function closePettyCashRequestWithDecision(
  formData: FormData,
  requestStatus: "RETURNED_FOR_REVISION" | "REJECTED",
  approvalStatus: "RETURNED" | "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePettyCashApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, request } =
    await findActionablePettyCashRequestApproval(
      session,
      values.approvalInstanceId
    );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: approvalStatus,
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstanceStep.updateMany({
      where: {
        approvalInstanceId: approval.id,
        status: "WAITING"
      },
      data: { status: "SKIPPED" }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: approvalStatus,
        currentStepOrder: null
      }
    });
    const updatedRequest = await tx.pettyCashRequest.updateMany({
      where: {
        id: request.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "AWAITING_APPROVAL"
      },
      data:
        requestStatus === "RETURNED_FOR_REVISION"
          ? {
              status: requestStatus,
              returnedByUserId: session.user.id,
              returnedAt: new Date(),
              returnReason: values.remarks
            }
          : {
              status: requestStatus,
              rejectedByUserId: session.user.id,
              rejectedAt: new Date(),
              rejectionReason: values.remarks
            }
    });
    if (updatedRequest.count !== 1) {
      throw new Error("PETTY_CASH_REQUEST_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "PettyCashRequest",
        entityId: request.id,
        beforeData: { status: "AWAITING_APPROVAL" },
        afterData: { status: requestStatus },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks,
          noPaymentCreation: true,
          noPaymentRelease: true,
          noJournalPosting: true,
          noBankMutation: true,
          noPeriodCloseMutation: true
        }
      }
    });
  });
}

export async function approvePaymentRequestApproval(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRequestApprove);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, request } = await findActionablePaymentRequestApproval(
    session,
    values.approvalInstanceId
  );

  if (!request.evidenceReference) {
    throw new Error("PAYMENT_REQUEST_EVIDENCE_REQUIRED");
  }

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
          eventType: "payment_request.approval_step_approved",
          entityType: "PaymentRequest",
          entityId: request.id,
          beforeData: { currentStepOrder: step.stepOrder },
          afterData: { currentStepOrder: nextStep.stepOrder },
          metadata: {
            approvalInstanceId: approval.id,
            approvedStepOrder: step.stepOrder,
            nextStepOrder: nextStep.stepOrder,
            remarks: values.remarks ?? null,
            noSourceMutation: true,
            noPaymentRelease: true,
            noBankMutation: true,
            noJournalPosting: true
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
    const updatedRequest = await tx.paymentRequest.updateMany({
      where: {
        id: request.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "AWAITING_APPROVAL"
      },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date()
      }
    });
    if (updatedRequest.count !== 1) {
      throw new Error("PAYMENT_REQUEST_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "payment_request.approved",
        entityType: "PaymentRequest",
        entityId: request.id,
        beforeData: { status: "AWAITING_APPROVAL" },
        afterData: { status: "APPROVED" },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks ?? null,
          noSelfApproval: true,
          noSourceMutation: true,
          noPaymentRelease: true,
          noBankMutation: true,
          noJournalPosting: true
        }
      }
    });
  });
}

async function closePaymentRequestWithDecision(
  formData: FormData,
  requestStatus: "RETURNED_FOR_REVISION" | "REJECTED",
  approvalStatus: "RETURNED" | "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRequestApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, request } = await findActionablePaymentRequestApproval(
    session,
    values.approvalInstanceId
  );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: approvalStatus,
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstanceStep.updateMany({
      where: {
        approvalInstanceId: approval.id,
        status: "WAITING"
      },
      data: { status: "SKIPPED" }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: approvalStatus,
        currentStepOrder: null
      }
    });
    const updatedRequest = await tx.paymentRequest.updateMany({
      where: {
        id: request.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "AWAITING_APPROVAL"
      },
      data:
        requestStatus === "RETURNED_FOR_REVISION"
          ? {
              status: requestStatus,
              returnedAt: new Date(),
              holdReason: values.remarks
            }
          : {
              status: requestStatus,
              rejectedByUserId: session.user.id,
              rejectedAt: new Date(),
              rejectionReason: values.remarks
            }
    });
    if (updatedRequest.count !== 1) {
      throw new Error("PAYMENT_REQUEST_NOT_AWAITING_APPROVAL");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "PaymentRequest",
        entityId: request.id,
        beforeData: { status: "AWAITING_APPROVAL" },
        afterData: { status: requestStatus },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks,
          returnReasonStoredIn: requestStatus === "RETURNED_FOR_REVISION" ? "holdReason" : null,
          noSourceMutation: true,
          noPaymentRelease: true,
          noBankMutation: true,
          noJournalPosting: true
        }
      }
    });
  });
}

export async function approvePaymentReleaseApproval(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRelease);
  const values = decisionSchema.parse(Object.fromEntries(formData));
  const { approval, step, release } = await findActionablePaymentReleaseApproval(
    session,
    values.approvalInstanceId
  );

  if (!release.evidenceReference) {
    throw new Error("PAYMENT_RELEASE_EVIDENCE_REQUIRED");
  }

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
          eventType: "payment_release.approval_step_approved",
          entityType: "PaymentRelease",
          entityId: release.id,
          beforeData: { currentStepOrder: step.stepOrder },
          afterData: { currentStepOrder: nextStep.stepOrder },
          metadata: {
            approvalInstanceId: approval.id,
            approvedStepOrder: step.stepOrder,
            nextStepOrder: nextStep.stepOrder,
            remarks: values.remarks ?? null,
            noSourceMutation: true,
            noPaymentExecution: true,
            noApMutation: true,
            noBankApiCall: true,
            noJournalPosting: true
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
    const updatedRelease = await tx.paymentRelease.updateMany({
      where: {
        id: release.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "DRAFT"
      },
      data: {
        status: "READY_FOR_RELEASE"
      }
    });
    if (updatedRelease.count !== 1) {
      throw new Error("PAYMENT_RELEASE_NOT_DRAFT");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "payment_release.approved",
        entityType: "PaymentRelease",
        entityId: release.id,
        beforeData: { status: "DRAFT" },
        afterData: { status: "READY_FOR_RELEASE" },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks ?? null,
          noSelfApproval: true,
          noSourceMutation: true,
          noPaymentExecution: true,
          noApMutation: true,
          noBankApiCall: true,
          noJournalPosting: true
        }
      }
    });
  });
}

export async function rejectPaymentReleaseApproval(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financePaymentRelease);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, release } = await findActionablePaymentReleaseApproval(
    session,
    values.approvalInstanceId
  );

  await prisma.$transaction(async (tx) => {
    await tx.approvalInstanceStep.update({
      where: { id: step.id },
      data: {
        status: "REJECTED",
        actedAt: new Date(),
        actedByUserId: session.user.id,
        remarks: values.remarks
      }
    });
    await tx.approvalInstanceStep.updateMany({
      where: {
        approvalInstanceId: approval.id,
        status: "WAITING"
      },
      data: { status: "SKIPPED" }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status: "REJECTED",
        currentStepOrder: null
      }
    });
    const updatedRelease = await tx.paymentRelease.updateMany({
      where: {
        id: release.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "DRAFT"
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledByUserId: session.user.id,
        cancellationReason: values.remarks
      }
    });
    if (updatedRelease.count !== 1) {
      throw new Error("PAYMENT_RELEASE_NOT_DRAFT");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "payment_release.rejected",
        entityType: "PaymentRelease",
        entityId: release.id,
        beforeData: { status: "DRAFT" },
        afterData: { status: "CANCELLED" },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks,
          noSourceMutation: true,
          noPaymentExecution: true,
          noApMutation: true,
          noBankApiCall: true,
          noJournalPosting: true
        }
      }
    });
  });
}

async function closeBudgetRevisionWithDecision(
  formData: FormData,
  status: "REJECTED",
  eventType: string
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.financeBudgetApprove);
  const values = remarksRequiredSchema.parse(Object.fromEntries(formData));
  const { approval, step, revision } = await findActionableBudgetRevisionApproval(
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
    await tx.approvalInstanceStep.updateMany({
      where: {
        approvalInstanceId: approval.id,
        status: "WAITING"
      },
      data: { status: "SKIPPED" }
    });
    await tx.approvalInstance.update({
      where: { id: approval.id },
      data: {
        status,
        currentStepOrder: null
      }
    });
    const updatedRevision = await tx.budgetRevision.updateMany({
      where: {
        id: revision.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "SUBMITTED"
      },
      data: {
        status,
        reviewedByUserId: session.user.id,
        reviewedAt: new Date()
      }
    });
    if (updatedRevision.count !== 1) {
      throw new Error("BUDGET_REVISION_NOT_SUBMITTED");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType,
        entityType: "Budget",
        entityId: revision.budgetId,
        beforeData: { status: "SUBMITTED" },
        afterData: { status },
        metadata: {
          approvalInstanceId: approval.id,
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          remarks: values.remarks,
          budgetMutationDeferred: true,
          lineMutationDeferred: true,
          noSourceMutation: true,
          noPaymentMutation: true,
          noJournalPosting: true
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
      data: {
        status,
        ...(status === "CANCELLED"
          ? {
              cancellationSubtype: "approval_rejected",
              cancellationReason: values.remarks,
              cancelledAt: new Date(),
              cancelledByUserId: session.user.id
            }
          : {})
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
        eventType,
        entityType: "PurchaseOrder",
        entityId: order.id,
        beforeData: { status: "PENDING_APPROVAL" },
        afterData: { status },
        metadata: {
          approvalInstanceId: approval.id,
          remarks: values.remarks,
          ...(status === "CANCELLED"
            ? { cancellationSubtype: "approval_rejected" }
            : {}),
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
