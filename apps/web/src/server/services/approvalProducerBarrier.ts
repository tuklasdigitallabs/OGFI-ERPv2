import { prisma, type TransactionClient } from "@ogfi/database";
import type { SupportedApprovalDocumentType } from "./approvalRoutingRegistry";

export type ApprovalProducerTransactionInput = {
  tenantId: string;
  companyId: string;
  documentType: SupportedApprovalDocumentType;
};

export async function acquireApprovalProducerBarrierShared(
  tx: TransactionClient,
  input: ApprovalProducerTransactionInput,
) {
  await tx.$executeRaw`
    SELECT public.acquire_approval_routing_producer_barrier_shared(
      ${input.tenantId}::uuid,
      ${input.companyId}::uuid,
      ${input.documentType}::text
    )
  `;
}

export async function withApprovalProducerTransaction<T>(
  input: ApprovalProducerTransactionInput,
  action: (tx: TransactionClient) => Promise<T>,
  options?: {
    beforeBarrier?: (tx: TransactionClient) => Promise<void>;
  },
) {
  return prisma.$transaction(async (tx) => {
    await options?.beforeBarrier?.(tx);
    await tx.$executeRaw`
      SELECT public.acquire_approval_routing_producer_barrier_shared(
        ${input.tenantId}::uuid,
        ${input.companyId}::uuid,
        ${input.documentType}::text
      )
    `;
    return action(tx);
  });
}
