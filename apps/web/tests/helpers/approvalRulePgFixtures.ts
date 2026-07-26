import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

export async function createSealedApprovalRuleFixture(
  prisma: PrismaClient,
  args: Prisma.ApprovalRuleCreateArgs,
) {
  return prisma.$transaction(async (tx) => {
    const id = typeof args.data.id === "string" ? args.data.id : randomUUID();
    const rule = await tx.approvalRule.create({
      data: {
        ...args.data,
        id,
        lineageId: id,
        definitionSealed: false,
      },
    });
    const sealed = await tx.approvalRule.updateMany({
      where: { id: rule.id, definitionSealed: false },
      data: { definitionSealed: true },
    });
    if (sealed.count !== 1) {
      throw new Error("APPROVAL_RULE_FIXTURE_SEAL_FAILED");
    }
    return { ...rule, definitionSealed: true };
  });
}
