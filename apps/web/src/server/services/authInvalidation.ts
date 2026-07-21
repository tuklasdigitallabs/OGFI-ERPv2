import { prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import { permissions, requirePermission } from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";

const completeAuthSessionInvalidationSchema = z.object({
  invalidationId: z.string().uuid(),
  providerName: z.string().trim().min(2).max(120),
  providerReference: z.string().trim().min(2).max(240),
  reason: z.string().trim().min(5).max(500),
});

async function assertCanManageAuthInvalidations(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);
  const assignment = await prisma.userScopeAssignment.findFirst({
    where: {
      userId: session.user.id,
      scopeType: "COMPANY",
      scopeId: session.context.companyId,
      accessLevel: "MANAGE",
      status: "ACTIVE",
    },
  });
  if (!assignment) {
    throw new Error("ADMIN_SCOPE_DENIED");
  }
}

export async function recordAuthSessionInvalidation(
  tx: TransactionClient,
  input: {
    targetUserId: string;
    companyId?: string | null;
    requestedByUserId?: string | null;
    reason: string;
    sourceEventType: string;
    sourceRecordId?: string | null;
  },
) {
  const targetUser = await tx.user.findUnique({
    where: { id: input.targetUserId },
    select: { tenantId: true },
  });
  if (!targetUser) {
    throw new Error("TARGET_USER_NOT_FOUND");
  }

  const now = new Date();
  await tx.authSession.updateMany({
    where: {
      userId: input.targetUserId,
      status: { in: ["ACTIVE", "PENDING_MFA", "MFA_ENROLLMENT_REQUIRED"] },
    },
    data: {
      status: "REVOKED",
      revokedAt: now,
      revocationReason: input.reason,
    },
  });

  await tx.authSessionInvalidation.create({
    data: {
      tenantId: targetUser.tenantId,
      companyId: input.companyId ?? null,
      targetUserId: input.targetUserId,
      requestedByUserId: input.requestedByUserId ?? null,
      status: process.env.AUTH_PROVIDER_NAME
        ? "PENDING_PROVIDER"
        : "APPLICATION_COMPLETED",
      reason: input.reason,
      sourceEventType: input.sourceEventType,
      sourceRecordId: input.sourceRecordId ?? null,
      demoEpochEnforced: true,
      providerName: process.env.AUTH_PROVIDER_NAME ?? "OGFI_LOCAL",
      providerReference: process.env.AUTH_PROVIDER_NAME
        ? null
        : "database-session-revocation",
      completedAt: process.env.AUTH_PROVIDER_NAME ? null : now,
    },
  });
}

export async function listAuthSessionInvalidations(session: SessionContext) {
  await assertCanManageAuthInvalidations(session);
  const records = await prisma.authSessionInvalidation.findMany({
    where: {
      tenantId: session.context.tenantId,
      OR: [{ companyId: session.context.companyId }, { companyId: null }],
    },
    include: {
      targetUser: true,
      requestedByUser: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return records.map((record) => ({
    id: record.id,
    status: record.status,
    targetUserName: record.targetUser.displayName || record.targetUser.email,
    targetUserEmail: record.targetUser.email,
    requestedByName: record.requestedByUser
      ? record.requestedByUser.displayName || record.requestedByUser.email
      : null,
    reason: record.reason,
    sourceEventType: record.sourceEventType,
    sourceRecordId: record.sourceRecordId,
    demoEpochEnforced: record.demoEpochEnforced,
    providerName: record.providerName,
    providerReference: record.providerReference,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  }));
}

export async function completeAuthSessionInvalidation(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageAuthInvalidations(session);
  const values = completeAuthSessionInvalidationSchema.parse(
    Object.fromEntries(formData),
  );
  const existing = await prisma.authSessionInvalidation.findFirst({
    where: {
      id: values.invalidationId,
      tenantId: session.context.tenantId,
      OR: [{ companyId: session.context.companyId }, { companyId: null }],
      status: "PENDING_PROVIDER",
    },
  });
  if (!existing) {
    throw new Error("AUTH_SESSION_INVALIDATION_NOT_FOUND");
  }
  if (existing.requestedByUserId === session.user.id) {
    throw new Error("AUTH_SESSION_INVALIDATION_SELF_COMPLETION_BLOCKED");
  }

  await prisma.$transaction(async (tx) => {
    const saved = await tx.authSessionInvalidation.update({
      where: { id: existing.id },
      data: {
        status: "PROVIDER_COMPLETED",
        providerName: values.providerName,
        providerReference: values.providerReference,
        completedAt: new Date(),
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: existing.companyId,
        actorUserId: session.user.id,
        eventType: "auth_session_invalidation.provider_completed",
        entityType: "AuthSessionInvalidation",
        entityId: saved.id,
        beforeData: {
          status: existing.status,
          providerName: existing.providerName,
          providerReference: existing.providerReference,
        },
        afterData: {
          status: saved.status,
          providerName: saved.providerName,
          providerReference: saved.providerReference,
          completedAt: saved.completedAt?.toISOString() ?? null,
        },
        metadata: {
          sourceDecisionId: "DEC-0036",
          reason: values.reason,
        },
      },
    });
  });
}
