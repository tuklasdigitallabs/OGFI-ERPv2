import type { Prisma } from "@ogfi/database";
import type { SessionContext } from "./context";

export type OperationalStatusTransitionInput = {
  targetEntityType: string;
  targetEntityId: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  brandId?: string | null;
  locationId?: string | null;
  reason?: string | null;
  evidenceReference?: string | null;
  idempotencyKey?: string | null;
  required?: boolean;
};

export async function recordOperationalStatusTransition(
  tx: Prisma.TransactionClient,
  session: SessionContext,
  input: OperationalStatusTransitionInput
) {
  const txAny = tx as Prisma.TransactionClient & Record<string, any>;
  if (!txAny.operationalStatusTransition?.create) {
    if (input.required) {
      throw new Error("OPERATIONAL_STATUS_TRANSITION_WRITE_REQUIRED");
    }
    return;
  }

  try {
    await txAny.operationalStatusTransition.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: input.brandId ?? session.context.brandId ?? null,
        locationId: input.locationId ?? session.context.locationId ?? null,
        targetEntityType: input.targetEntityType,
        targetEntityId: input.targetEntityId,
        action: input.action,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorUserId: session.user.id,
        reason: input.reason ?? null,
        evidenceReference: input.evidenceReference ?? null,
        idempotencyKey:
          input.idempotencyKey ??
          `${input.targetEntityType}:${input.targetEntityId}:${input.action}:${input.fromStatus}:${input.toStatus}`
      }
    });
  } catch (error) {
    if (
      !(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      )
    ) {
      throw error;
    }
  }
}
