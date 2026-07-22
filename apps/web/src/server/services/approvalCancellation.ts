import type { TransactionClient } from "@ogfi/database";
import { normalizedApprovalRoutingEnabled } from "./approvalRouting";

export type ApprovalCancellationPolicy = "APPROVAL_OPTIONAL" | "APPROVAL_REQUIRED";

export const approvalCancellationErrors = {
  missing: "APPROVAL_CANCELLATION_PENDING_APPROVAL_REQUIRED",
  ambiguous: "APPROVAL_CANCELLATION_PENDING_APPROVAL_AMBIGUOUS",
  incoherent: "APPROVAL_CANCELLATION_STATE_INCOHERENT",
  stepCasFailed: "APPROVAL_CANCELLATION_STEP_CAS_FAILED",
  instanceCasFailed: "APPROVAL_CANCELLATION_INSTANCE_CAS_FAILED",
  residueDetected: "APPROVAL_CANCELLATION_ACTIVE_STEP_RESIDUE_DETECTED"
} as const;

type LockedApproval = {
  id: string;
  currentStepOrder: number | null;
};

type LockedStep = {
  id: string;
  stepOrder: number;
  status: string;
};

export type ApprovalCancellationResult =
  | { mode: "LEGACY"; approvalInstanceId: null }
  | { mode: "NO_PENDING_APPROVAL"; approvalInstanceId: null }
  | { mode: "CANCELLED"; approvalInstanceId: string };

/**
 * Terminates a document's normalized pending approval. The caller must invoke
 * this inside the same Prisma transaction as its source-record cancellation.
 * In legacy mode this intentionally performs no work so existing callers can
 * preserve their pre-normalization behavior.
 */
export async function terminatePendingApprovalForCancellation(
  tx: TransactionClient,
  input: {
    tenantId: string;
    companyId: string;
    documentType: string;
    documentId: string;
    policy: ApprovalCancellationPolicy;
  }
): Promise<ApprovalCancellationResult> {
  if (!normalizedApprovalRoutingEnabled()) {
    return { mode: "LEGACY", approvalInstanceId: null };
  }

  const approvals = await tx.$queryRaw<LockedApproval[]>`
    SELECT ai.id, ai."currentStepOrder"
      FROM "ApprovalInstance" ai
     WHERE ai."tenantId" = ${input.tenantId}::uuid
       AND ai."companyId" = ${input.companyId}::uuid
       AND ai."documentType" = ${input.documentType}
       AND ai."documentId" = ${input.documentId}::uuid
       AND ai.status = 'PENDING'::"ApprovalStatus"
     ORDER BY ai.id ASC
     FOR UPDATE OF ai
  `;

  if (approvals.length > 1) {
    throw new Error(approvalCancellationErrors.ambiguous);
  }
  const approval = approvals[0];
  if (!approval) {
    if (input.policy === "APPROVAL_REQUIRED") {
      throw new Error(approvalCancellationErrors.missing);
    }
    return { mode: "NO_PENDING_APPROVAL", approvalInstanceId: null };
  }
  if (approval.currentStepOrder === null) {
    throw new Error(approvalCancellationErrors.incoherent);
  }

  const steps = await tx.$queryRaw<LockedStep[]>`
    SELECT s.id, s."stepOrder", s.status::text AS status
      FROM "ApprovalInstanceStep" s
     WHERE s."approvalInstanceId" = ${approval.id}::uuid
     ORDER BY s."stepOrder" ASC, s.id ASC
     FOR UPDATE OF s
  `;
  const current = steps.filter(
    (step) => step.stepOrder === approval.currentStepOrder
  );
  const coherent =
    current.length === 1 &&
    current[0]?.status === "PENDING" &&
    steps.every((step) => {
      if (step.stepOrder < approval.currentStepOrder!) {
        return step.status === "APPROVED";
      }
      if (step.stepOrder > approval.currentStepOrder!) {
        return step.status === "WAITING";
      }
      return step.status === "PENDING";
    });
  if (!coherent) throw new Error(approvalCancellationErrors.incoherent);

  const activeStepIds = steps
    .filter((step) => step.stepOrder >= approval.currentStepOrder!)
    .map((step) => step.id);
  const skipped = await tx.approvalInstanceStep.updateMany({
    where: {
      id: { in: activeStepIds },
      approvalInstanceId: approval.id,
      status: { in: ["PENDING", "WAITING"] },
      approvalInstance: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        status: "PENDING"
      }
    },
    data: { status: "SKIPPED" }
  });
  if (skipped.count !== activeStepIds.length) {
    throw new Error(approvalCancellationErrors.stepCasFailed);
  }

  const cancelled = await tx.approvalInstance.updateMany({
    where: {
      id: approval.id,
      tenantId: input.tenantId,
      companyId: input.companyId,
      documentType: input.documentType,
      documentId: input.documentId,
      status: "PENDING",
      currentStepOrder: approval.currentStepOrder
    },
    data: { status: "CANCELLED", currentStepOrder: null }
  });
  if (cancelled.count !== 1) {
    throw new Error(approvalCancellationErrors.instanceCasFailed);
  }

  const residue = await tx.approvalInstanceStep.findFirst({
    where: {
      approvalInstanceId: approval.id,
      status: { in: ["PENDING", "WAITING"] },
      approvalInstance: {
        tenantId: input.tenantId,
        companyId: input.companyId
      }
    },
    select: { id: true }
  });
  if (residue) throw new Error(approvalCancellationErrors.residueDetected);

  return { mode: "CANCELLED", approvalInstanceId: approval.id };
}
