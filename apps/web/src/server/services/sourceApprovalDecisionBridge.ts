import { prisma } from "@ogfi/database"
import type { SessionContext } from "./context"
import { canonicalApprovalDecisionsEnabled } from "./approvalDecisionMode"
import type { CanonicalApprovalDecisionCommand } from "./approvals"

type SourceApproveFields = {
  documentId: string
  remarks?: string | undefined
}

type SourceApproveWithEvidence = SourceApproveFields & {
  evidenceReference?: string | undefined
}

type SourceTerminalWithEvidence = {
  documentId: string
  remarks: string
  evidenceReference?: string | undefined
}

export type SourceApprovalDecisionInput =
  | (SourceApproveWithEvidence & {
      documentType: "BudgetRevision"
      action: "approve"
    })
  | (SourceTerminalWithEvidence & {
      documentType: "BudgetRevision"
      action: "reject"
    })
  | (SourceApproveWithEvidence & {
      documentType: "ExpenseRequest"
      action: "approve"
    })
  | (SourceTerminalWithEvidence & {
      documentType: "ExpenseRequest"
      action: "return" | "reject"
    })
  | (SourceApproveWithEvidence & {
      documentType: "CashAdvanceRequest"
      action: "approve"
    })
  | (SourceTerminalWithEvidence & {
      documentType: "CashAdvanceRequest"
      action: "return" | "reject"
    })
  | (SourceApproveWithEvidence & {
      documentType: "PettyCashRequest"
      action: "approve"
    })
  | (SourceTerminalWithEvidence & {
      documentType: "PettyCashRequest"
      action: "return" | "reject"
    })
  | (SourceApproveFields & {
      documentType: "PaymentRequest"
      action: "approve"
    })
  | ({ documentId: string; remarks: string } & {
      documentType: "PaymentRequest"
      action: "reject"
    })
  | (SourceApproveWithEvidence & {
      documentType: "EmployeeLeaveRequest"
      action: "approve"
    })
  | (SourceTerminalWithEvidence & {
      documentType: "EmployeeLeaveRequest"
      action: "return" | "reject"
    })
  | (SourceApproveWithEvidence & {
      documentType: "EmployeeOvertimeRecord"
      action: "approve"
    })
  | (SourceTerminalWithEvidence & {
      documentType: "EmployeeOvertimeRecord"
      action: "reject"
    })
  | (SourceApproveWithEvidence & {
      documentType: "WorkforceSchedule"
      action: "approve"
    })
  | (SourceTerminalWithEvidence & {
      documentType: "WorkforceSchedule"
      action: "reject"
    })

function toCanonicalApprovalDecisionCommand(
  approvalInstanceId: string,
  input: SourceApprovalDecisionInput
): CanonicalApprovalDecisionCommand {
  if (input.action === "approve") {
    return {
      approvalInstanceId,
      family: input.documentType,
      decision: "APPROVE",
      ...(input.remarks === undefined ? {} : { remarks: input.remarks }),
      ...(input.documentType === "PaymentRequest" ||
      input.evidenceReference === undefined
        ? {}
        : { evidenceReference: input.evidenceReference })
    } as CanonicalApprovalDecisionCommand
  }

  return {
    approvalInstanceId,
    family: input.documentType,
    decision: input.action === "return" ? "RETURN" : "REJECT",
    remarks: input.remarks,
    ...(input.documentType === "PaymentRequest" ||
    input.evidenceReference === undefined
      ? {}
      : { evidenceReference: input.evidenceReference })
  } as CanonicalApprovalDecisionCommand
}

export async function routeSourceWorkspaceApprovalDecision(
  session: SessionContext,
  input: SourceApprovalDecisionInput
) {
  if (!canonicalApprovalDecisionsEnabled()) {
    return false
  }

  const approvals = await prisma.approvalInstance.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: input.documentType,
      documentId: input.documentId,
      status: "PENDING"
    },
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true }
  })

  if (approvals.length !== 1) {
    throw new Error(
      approvals.length === 0
        ? "SOURCE_APPROVAL_INSTANCE_NOT_FOUND"
        : "SOURCE_APPROVAL_INSTANCE_AMBIGUOUS"
    )
  }

  const { executeCanonicalApprovalDecision } = await import("./approvals")
  await executeCanonicalApprovalDecision(
    toCanonicalApprovalDecisionCommand(approvals[0]!.id, input)
  )
  return true
}
