import type { TransactionClient } from "@ogfi/database";

type LockedFutureStep = {
  id: string;
  status: string;
};

export const approvalTerminalErrors = {
  invalidFutureState: "APPROVAL_TERMINAL_FUTURE_STEP_STATE_INVALID",
  casFailed: "APPROVAL_TERMINAL_FUTURE_STEP_CAS_FAILED",
  residueDetected: "APPROVAL_TERMINAL_FUTURE_STEP_RESIDUE_DETECTED"
} as const;

/**
 * Terminates every step after the acting step while holding ascending row locks.
 * This must run in the caller's transaction so any invariant failure rolls back
 * the current-step decision and source-record transition as one unit.
 */
export async function skipFutureApprovalStepsForTerminalDecision(
  tx: TransactionClient,
  input: {
    tenantId: string;
    companyId: string;
    approvalInstanceId: string;
    currentStepOrder: number;
  }
) {
  const futureSteps = await tx.$queryRaw<LockedFutureStep[]>`
    SELECT s.id, s.status::text AS status
      FROM "ApprovalInstanceStep" s
      JOIN "ApprovalInstance" ai ON ai.id = s."approvalInstanceId"
     WHERE ai.id = ${input.approvalInstanceId}::uuid
       AND ai."tenantId" = ${input.tenantId}::uuid
       AND ai."companyId" = ${input.companyId}::uuid
       AND s."stepOrder" > ${input.currentStepOrder}
     ORDER BY s."stepOrder" ASC, s.id ASC
     FOR UPDATE OF s
  `;

  if (futureSteps.some((step) => step.status !== "WAITING")) {
    throw new Error(approvalTerminalErrors.invalidFutureState);
  }

  if (futureSteps.length === 0) return;

  const futureStepIds = futureSteps.map((step) => step.id);
  const skipped = await tx.approvalInstanceStep.updateMany({
    where: {
      id: { in: futureStepIds },
      approvalInstanceId: input.approvalInstanceId,
      status: "WAITING",
      approvalInstance: {
        tenantId: input.tenantId,
        companyId: input.companyId
      }
    },
    data: { status: "SKIPPED" }
  });
  if (skipped.count !== futureSteps.length) {
    throw new Error(approvalTerminalErrors.casFailed);
  }

  const residue = await tx.approvalInstanceStep.findFirst({
    where: {
      approvalInstanceId: input.approvalInstanceId,
      stepOrder: { gt: input.currentStepOrder },
      status: { not: "SKIPPED" },
      approvalInstance: {
        tenantId: input.tenantId,
        companyId: input.companyId
      }
    },
    select: { id: true }
  });
  if (residue) throw new Error(approvalTerminalErrors.residueDetected);
}
