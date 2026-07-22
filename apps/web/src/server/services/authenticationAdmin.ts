import { prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import { permissions, requirePermission } from "./authorization";
import {
  assertCanManageCompanyScope,
  touchUserPrivilegeEpoch,
} from "./coreAdmin";
import { type SessionContext } from "./context";
import {
  deliverAccountActivation,
  issueAccountActivationInTransaction,
} from "./authentication";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";

const issueActivationSchema = z.object({
  targetUserId: z.string().uuid(),
});
const retryActivationSchema = z.object({
  activationTokenId: z.string().uuid(),
});
const requestRecoverySchema = z.object({
  targetUserId: z.string().uuid(),
  resetMfa: z.enum(["true", "false"]).transform((value) => value === "true"),
  reason: z.string().trim().min(10).max(500),
  evidenceReference: z.string().trim().min(2).max(240),
});
const reviewRecoverySchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().trim().min(10).max(500),
});

async function assertCanManageAuthentication(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function targetUserIdsForCompany(session: SessionContext) {
  const now = new Date();
  const locations = await prisma.location.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    select: { id: true },
  });
  const locationIds = locations.map(({ id }) => id);
  const assignments = await prisma.userScopeAssignment.findMany({
    where: {
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      AND: [
        {
          OR: [
            {
              scopeType: "COMPANY",
              scopeId: session.context.companyId,
            },
            { scopeType: "LOCATION", scopeId: { in: locationIds } },
          ],
        },
      ],
      user: { tenantId: session.context.tenantId, status: "ACTIVE" },
    },
    select: { userId: true },
  });
  return Array.from(new Set(assignments.map(({ userId }) => userId)));
}

async function assertTargetUserInCompanyScope(
  tx: TransactionClient,
  session: SessionContext,
  targetUserId: string,
) {
  const now = new Date();
  const locations = await tx.location.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    select: { id: true },
  });
  const assignment = await tx.userScopeAssignment.findFirst({
    where: {
      userId: targetUserId,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      AND: [
        {
          OR: [
            {
              scopeType: "COMPANY",
              scopeId: session.context.companyId,
            },
            {
              scopeType: "LOCATION",
              scopeId: { in: locations.map(({ id }) => id) },
            },
          ],
        },
      ],
      user: { tenantId: session.context.tenantId, status: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!assignment) {
    throw new Error("AUTH_ACCOUNT_SCOPE_DENIED");
  }
}

export async function listAuthenticationAccounts(session: SessionContext) {
  await assertCanManageAuthentication(session);
  const userIds = await targetUserIdsForCompany(session);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, tenantId: session.context.tenantId },
    select: {
      id: true,
      email: true,
      displayName: true,
      status: true,
      authIdentities: {
        where: { provider: "LOCAL", status: "ACTIVE" },
        select: { id: true },
      },
      mfaAuthenticators: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
      authSessions: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
    orderBy: [{ displayName: "asc" }, { email: "asc" }],
  });
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    localIdentityActive: user.authIdentities.length > 0,
    mfaActive: user.mfaAuthenticators.length > 0,
    activeSessionCount: user.authSessions.length,
  }));
}

export async function listAuthenticationActivationDeliveries(
  session: SessionContext,
) {
  await assertCanManageAuthentication(session);
  const userIds = await targetUserIdsForCompany(session);
  const staleDeliveryCutoff = new Date(Date.now() - 5 * 60_000);
  return prisma.authActivationToken.findMany({
    where: {
      tenantId: session.context.tenantId,
      targetUserId: { in: userIds },
      status: { in: ["ACTIVE", "REVOKED"] },
      OR: [
        { deliveryStatus: { in: ["PENDING", "FAILED"] } },
        {
          deliveryStatus: "SENDING",
          deliveryAttemptedAt: { lt: staleDeliveryCutoff },
        },
      ],
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      deliveryStatus: true,
      deliveryAttemptCount: true,
      deliveryAttemptedAt: true,
      expiresAt: true,
      targetUser: { select: { displayName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function retryAuthenticationActivationDelivery(
  session: SessionContext,
  formData: FormData,
) {
  await assertCanManageAuthentication(session);
  const values = retryActivationSchema.parse(Object.fromEntries(formData));
  const allowedUserIds = await targetUserIdsForCompany(session);
  const staleDeliveryCutoff = new Date(Date.now() - 5 * 60_000);
  const activation = await prisma.authActivationToken.findFirst({
    where: {
      id: values.activationTokenId,
      tenantId: session.context.tenantId,
      targetUserId: { in: allowedUserIds },
      status: { in: ["ACTIVE", "REVOKED"] },
      OR: [
        { deliveryStatus: { in: ["PENDING", "FAILED"] } },
        {
          deliveryStatus: "SENDING",
          deliveryAttemptedAt: { lt: staleDeliveryCutoff },
        },
      ],
      expiresAt: { gt: new Date() },
    },
    select: { id: true, targetUserId: true },
  });
  if (!activation) {
    throw new Error("AUTH_ACTIVATION_DELIVERY_NOT_AVAILABLE");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "RETRY_ACCOUNT_ACTIVATION_DELIVERY",
    permissionCode: permissions.coreAdminister,
    enforcementScope: "admin_security",
    entityType: "AuthActivationToken",
    entityId: activation.id,
  });
  const replacement = await prisma.$transaction(async (tx) => {
    await assertTargetUserInCompanyScope(
      tx,
      session,
      activation.targetUserId,
    );
    return issueAccountActivationInTransaction(tx, {
      tenantId: session.context.tenantId,
      targetUserId: activation.targetUserId,
      issuedByUserId: session.user.id,
    });
  });
  return deliverAccountActivation({
    activationTokenId: replacement.activationTokenId,
    token: replacement.token,
  });
}

export async function issueAuthenticationActivation(
  session: SessionContext,
  formData: FormData,
) {
  await assertCanManageAuthentication(session);
  const values = issueActivationSchema.parse(Object.fromEntries(formData));
  if (values.targetUserId === session.user.id) {
    throw new Error("AUTH_ACTIVATION_SELF_ISSUE_BLOCKED");
  }
  const allowedUserIds = await targetUserIdsForCompany(session);
  if (!allowedUserIds.includes(values.targetUserId)) {
    throw new Error("AUTH_ACCOUNT_SCOPE_DENIED");
  }
  const existingIdentity = await prisma.authIdentity.findFirst({
    where: {
      tenantId: session.context.tenantId,
      userId: values.targetUserId,
      provider: "LOCAL",
      status: "ACTIVE",
    },
  });
  if (existingIdentity) {
    throw new Error("AUTH_RECOVERY_APPROVAL_REQUIRED");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "ISSUE_ACCOUNT_ACTIVATION",
    permissionCode: permissions.coreAdminister,
    enforcementScope: "admin_security",
    entityType: "User",
    entityId: values.targetUserId,
  });
  const result = await prisma.$transaction(async (tx) => {
    await assertTargetUserInCompanyScope(tx, session, values.targetUserId);
    return issueAccountActivationInTransaction(tx, {
      tenantId: session.context.tenantId,
      targetUserId: values.targetUserId,
      issuedByUserId: session.user.id,
    });
  });
  const delivery = await deliverAccountActivation({
    activationTokenId: result.activationTokenId,
    token: result.token,
  });
  return {
    message: "Activation link delivered to the account email address.",
    deliveryStatus: delivery.deliveryStatus,
    expiresAt: delivery.expiresAt.toISOString(),
  };
}

export async function listAuthRecoveryRequests(session: SessionContext) {
  await assertCanManageAuthentication(session);
  return prisma.authRecoveryRequest.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    include: {
      targetUser: { select: { displayName: true, email: true } },
      requestedByUser: { select: { displayName: true, email: true } },
      reviewedByUser: { select: { displayName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function requestAuthRecovery(
  session: SessionContext,
  formData: FormData,
) {
  await assertCanManageAuthentication(session);
  const values = requestRecoverySchema.parse(Object.fromEntries(formData));
  if (values.targetUserId === session.user.id) {
    throw new Error("AUTH_RECOVERY_SELF_REQUEST_BLOCKED");
  }
  const allowedUserIds = await targetUserIdsForCompany(session);
  if (!allowedUserIds.includes(values.targetUserId)) {
    throw new Error("AUTH_ACCOUNT_SCOPE_DENIED");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "REQUEST_ACCOUNT_RECOVERY",
    permissionCode: permissions.coreAdminister,
    enforcementScope: "admin_security",
    entityType: "User",
    entityId: values.targetUserId,
  });
  const duplicate = await prisma.authRecoveryRequest.findFirst({
    where: {
      tenantId: session.context.tenantId,
      targetUserId: values.targetUserId,
      status: "PENDING",
    },
  });
  if (duplicate) {
    throw new Error("AUTH_RECOVERY_DUPLICATE_PENDING");
  }
  try {
    return await prisma.$transaction(async (tx) => {
      await assertTargetUserInCompanyScope(tx, session, values.targetUserId);
      const saved = await tx.authRecoveryRequest.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          targetUserId: values.targetUserId,
          requestedByUserId: session.user.id,
          resetPassword: true,
          resetMfa: values.resetMfa,
          reason: values.reason,
          evidenceReference: values.evidenceReference,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "auth.recovery.requested",
          entityType: "AuthRecoveryRequest",
          entityId: saved.id,
          afterData: {
            status: saved.status,
            targetUserId: saved.targetUserId,
            resetPassword: saved.resetPassword,
            resetMfa: saved.resetMfa,
          },
          metadata: {
            sourceDecisionId: "DEC-0040",
            reason: values.reason,
            evidenceReference: values.evidenceReference,
          },
        },
      });
      return saved;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("AUTH_RECOVERY_DUPLICATE_PENDING");
    }
    throw error;
  }
}

export async function approveAuthRecovery(
  session: SessionContext,
  formData: FormData,
) {
  await assertCanManageAuthentication(session);
  const values = reviewRecoverySchema.parse(Object.fromEntries(formData));
  const request = await prisma.authRecoveryRequest.findFirst({
    where: {
      id: values.requestId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING",
    },
  });
  if (!request) {
    throw new Error("AUTH_RECOVERY_NOT_FOUND");
  }
  if (
    request.requestedByUserId === session.user.id ||
    request.targetUserId === session.user.id
  ) {
    throw new Error("AUTH_RECOVERY_SELF_REVIEW_BLOCKED");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "APPROVE_ACCOUNT_RECOVERY",
    permissionCode: permissions.coreAdminister,
    enforcementScope: "admin_security",
    entityType: "AuthRecoveryRequest",
    entityId: request.id,
  });
  const result = await prisma.$transaction(async (tx) => {
    await assertTargetUserInCompanyScope(tx, session, request.targetUserId);
    const reviewed = await tx.authRecoveryRequest.updateMany({
      where: {
        id: request.id,
        tenantId: request.tenantId,
        companyId: request.companyId,
        status: "PENDING",
      },
      data: {
        status: "APPROVED",
        reviewedByUserId: session.user.id,
        reviewReason: values.reason,
        reviewedAt: new Date(),
      },
    });
    if (reviewed.count !== 1) {
      throw new Error("AUTH_RECOVERY_REVIEW_CONFLICT");
    }
    await touchUserPrivilegeEpoch(tx, request.targetUserId, {
      companyId: request.companyId,
      requestedByUserId: session.user.id,
      reason:
        "Approved controlled account recovery; revoke all prior sessions.",
      sourceEventType: "auth.recovery.approved",
      sourceRecordId: request.id,
    });
    if (request.resetMfa) {
      await tx.mfaAuthenticator.updateMany({
        where: {
          tenantId: request.tenantId,
          userId: request.targetUserId,
          status: { in: ["ACTIVE", "PENDING"] },
        },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
    }
    await tx.auditEvent.create({
      data: {
        tenantId: request.tenantId,
        companyId: request.companyId,
        actorUserId: session.user.id,
        eventType: "auth.recovery.approved",
        entityType: "AuthRecoveryRequest",
        entityId: request.id,
        beforeData: { status: "PENDING" },
        afterData: { status: "APPROVED", resetMfa: request.resetMfa },
        metadata: { sourceDecisionId: "DEC-0040", reason: values.reason },
      },
    });
    return issueAccountActivationInTransaction(tx, {
      tenantId: request.tenantId,
      targetUserId: request.targetUserId,
      issuedByUserId: session.user.id,
    });
  });
  const delivery = await deliverAccountActivation({
    activationTokenId: result.activationTokenId,
    token: result.token,
  });
  return {
    message: "Recovery approved and link delivered to the account email address.",
    deliveryStatus: delivery.deliveryStatus,
    expiresAt: delivery.expiresAt.toISOString(),
  };
}

export async function rejectAuthRecovery(
  session: SessionContext,
  formData: FormData,
) {
  await assertCanManageAuthentication(session);
  const values = reviewRecoverySchema.parse(Object.fromEntries(formData));
  const request = await prisma.authRecoveryRequest.findFirst({
    where: {
      id: values.requestId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING",
    },
  });
  if (!request) {
    throw new Error("AUTH_RECOVERY_NOT_FOUND");
  }
  if (
    request.requestedByUserId === session.user.id ||
    request.targetUserId === session.user.id
  ) {
    throw new Error("AUTH_RECOVERY_SELF_REVIEW_BLOCKED");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "REJECT_ACCOUNT_RECOVERY",
    permissionCode: permissions.coreAdminister,
    enforcementScope: "admin_security",
    entityType: "AuthRecoveryRequest",
    entityId: request.id,
  });
  await prisma.$transaction(async (tx) => {
    const rejected = await tx.authRecoveryRequest.updateMany({
      where: {
        id: request.id,
        tenantId: request.tenantId,
        companyId: request.companyId,
        status: "PENDING",
      },
      data: {
        status: "REJECTED",
        reviewedByUserId: session.user.id,
        reviewReason: values.reason,
        reviewedAt: new Date(),
      },
    });
    if (rejected.count !== 1) {
      throw new Error("AUTH_RECOVERY_REVIEW_CONFLICT");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: request.tenantId,
        companyId: request.companyId,
        actorUserId: session.user.id,
        eventType: "auth.recovery.rejected",
        entityType: "AuthRecoveryRequest",
        entityId: request.id,
        beforeData: { status: "PENDING" },
        afterData: { status: "REJECTED" },
        metadata: { sourceDecisionId: "DEC-0040", reason: values.reason },
      },
    });
  });
}

export async function revokeAuthenticationSessions(
  session: SessionContext,
  formData: FormData,
) {
  await assertCanManageAuthentication(session);
  const values = issueActivationSchema.parse(Object.fromEntries(formData));
  if (values.targetUserId === session.user.id) {
    throw new Error("AUTH_SESSION_SELF_ADMIN_REVOCATION_BLOCKED");
  }
  const allowedUserIds = await targetUserIdsForCompany(session);
  if (!allowedUserIds.includes(values.targetUserId)) {
    throw new Error("AUTH_ACCOUNT_SCOPE_DENIED");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "REVOKE_ACCOUNT_SESSIONS",
    permissionCode: permissions.coreAdminister,
    enforcementScope: "admin_security",
    entityType: "User",
    entityId: values.targetUserId,
  });
  await prisma.$transaction(async (tx) => {
    await assertTargetUserInCompanyScope(tx, session, values.targetUserId);
    await touchUserPrivilegeEpoch(tx, values.targetUserId, {
      companyId: session.context.companyId,
      requestedByUserId: session.user.id,
      reason:
        "Administrator revoked all application sessions for this account.",
      sourceEventType: "auth.sessions.admin_revoked",
      sourceRecordId: values.targetUserId,
    });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "auth.sessions.admin_revoked",
        entityType: "User",
        entityId: values.targetUserId,
        afterData: { sessionsRevoked: true },
        metadata: { sourceDecisionId: "DEC-0040" },
      },
    });
  });
}
