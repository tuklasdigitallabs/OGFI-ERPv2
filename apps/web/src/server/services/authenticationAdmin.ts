import { prisma, type TransactionClient } from "@ogfi/database";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { permissions, requirePermission } from "./authorization";
import {
  assertCanManageCompanyScope,
  touchUserPrivilegeEpoch,
} from "./coreAdmin";
import { type SessionContext } from "./context";
import {
  deliverAccountActivation,
  hashPassword,
  issueAccountActivationInTransaction,
  revokeApplicationSessions,
} from "./authentication";
import { isSensitivePermissionCode } from "./rolePermissionCatalog";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";

const issueActivationSchema = z.object({
  targetUserId: z.string().uuid(),
});
const issueTemporaryPasswordSchema = z.object({ targetUserId: z.string().uuid() });

function temporaryPassword() {
  // Random, one-time credentials are deliberately returned only to the
  // initiating server action; neither the raw value nor a derivative is audited.
  return `Ogfi-${randomBytes(18).toString("base64url")}`;
}

async function assertTemporaryPasswordTargetAllowed(tx: TransactionClient, session: SessionContext, targetUserId: string) {
  const target = await tx.user.findFirst({
    where: { id: targetUserId, tenantId: session.context.tenantId, status: "ACTIVE" },
    select: {
      roleAssignments: {
        where: { status: "ACTIVE" },
        select: {
          role: {
            select: {
              systemRole: true,
              permissions: {
                select: { permission: { select: { code: true } } },
              },
            },
          },
        },
      },
      scopeAssignments: {
        where: { status: "ACTIVE" },
        select: {
          accessLevel: true,
          scopeType: true,
          scopeId: true,
        },
      },
    },
  });
  if (!target) throw new Error("AUTH_ACCOUNT_SCOPE_DENIED");
  const privileged = target.roleAssignments.some(({ role }) => role.systemRole || role.permissions.some(({ permission }) => isSensitivePermissionCode(permission.code) || /approve/i.test(permission.code)));
  const locationScopeIds = target.scopeAssignments
    .filter((scope) => scope.scopeType === "LOCATION")
    .map((scope) => scope.scopeId);
  const locations = locationScopeIds.length
    ? await tx.location.findMany({
        where: { id: { in: locationScopeIds }, tenantId: session.context.tenantId },
        select: { locationType: true },
      })
    : [];
  const highRiskScope = target.scopeAssignments.some((scope) => scope.accessLevel === "MANAGE")
    || locations.some(({ locationType }) => ["WAREHOUSE", "COMMISSARY", "CENTRAL_KITCHEN", "HEAD_OFFICE", "PROJECT_SITE", "TEMPORARY_SITE"].includes(locationType));
  if (privileged || highRiskScope) throw new Error("AUTH_TEMPORARY_PASSWORD_PRIVILEGED_TARGET_DENIED");
}

export async function issueTemporaryPassword(session: SessionContext, formData: FormData) {
  await assertCanManageAuthentication(session);
  const values = issueTemporaryPasswordSchema.parse(Object.fromEntries(formData));
  if (values.targetUserId === session.user.id) throw new Error("AUTH_TEMPORARY_PASSWORD_SELF_ISSUE_BLOCKED");
  await assertPrivilegedMfaForAction(session, { action: "ISSUE_TEMPORARY_PASSWORD", permissionCode: permissions.coreAdminister, enforcementScope: "admin_security", entityType: "User", entityId: values.targetUserId });
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  await prisma.$transaction(async (tx) => {
    await assertTargetUserInCompanyScope(tx, session, values.targetUserId);
    await assertTemporaryPasswordTargetAllowed(tx, session, values.targetUserId);
    const target = await tx.user.findFirst({ where: { id: values.targetUserId, tenantId: session.context.tenantId, status: "ACTIVE" }, select: { email: true } });
    if (!target) throw new Error("AUTH_ACCOUNT_SCOPE_DENIED");
    const normalizedIdentifier = target.email.trim().toLowerCase();
    const existing = await tx.authIdentity.findUnique({ where: { tenantId_provider_normalizedIdentifier: { tenantId: session.context.tenantId, provider: "LOCAL", normalizedIdentifier } }, select: { id: true, userId: true } });
    if (existing && existing.userId !== values.targetUserId) throw new Error("AUTH_IDENTITY_CONFLICT");
    const identity = existing ? await tx.authIdentity.update({ where: { id: existing.id }, data: { status: "ACTIVE" } }) : await tx.authIdentity.create({ data: { tenantId: session.context.tenantId, userId: values.targetUserId, provider: "LOCAL", normalizedIdentifier } });
    await tx.passwordCredential.upsert({ where: { authIdentityId: identity.id }, create: { authIdentityId: identity.id, passwordHash, requiresChange: true, temporaryPasswordExpiresAt: expiresAt }, update: { passwordHash, hashAlgorithm: "ARGON2ID", requiresChange: true, temporaryPasswordExpiresAt: expiresAt, temporaryPasswordUsedAt: null, passwordChangedAt: new Date() } });
    await touchUserPrivilegeEpoch(tx, values.targetUserId, { companyId: session.context.companyId, requestedByUserId: session.user.id, reason: "Administrator issued a one-use temporary password; revoke prior sessions.", sourceEventType: "auth.temporary_password.issued", sourceRecordId: values.targetUserId });
    await revokeApplicationSessions(tx, { userId: values.targetUserId, reason: "Temporary password issued by administrator." });
    await tx.auditEvent.create({ data: { tenantId: session.context.tenantId, companyId: session.context.companyId, actorUserId: session.user.id, eventType: "auth.temporary_password.issued", entityType: "User", entityId: values.targetUserId, afterData: { requiresPasswordChange: true, expiresAt: expiresAt.toISOString() }, metadata: { sourceDecisionId: "DEC-0040", delivery: "MANUAL" } } });
  });
  return { password, expiresAt: expiresAt.toISOString() };
}
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
const recoveryPageInputSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  query: z.string().trim().max(120).catch(""),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  createdFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  createdTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});
const recoveryTargetCatalogSchema = z.object({ query: z.string().trim().max(120).catch(""), selectedUserId: z.string().uuid().optional() });

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

export async function listAuthRecoveryRequestPage(session: SessionContext, input: unknown = {}) {
  await assertCanManageAuthentication(session);
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rawQuery = typeof raw.query === "string" ? raw.query.trim() : "";
  const validDate = (v: unknown) => {
    if (typeof v !== "string") return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const [year, month, day] = v.split("-").map(Number);
    const parsed = new Date(Date.UTC(year!, month! - 1, day!));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day;
  };
  if (rawQuery.length > 120 || !validDate(raw.createdFrom) || !validDate(raw.createdTo) || (typeof raw.createdFrom === "string" && typeof raw.createdTo === "string" && raw.createdFrom > raw.createdTo)) {
    const pageSize = typeof raw.pageSize === "number" && raw.pageSize >= 10 && raw.pageSize <= 100 ? raw.pageSize : 25;
    return { items: [], page: 1, pageSize, totalItems: 0, totalPages: 1, invalidInput: true as const };
  }
  const values = recoveryPageInputSchema.parse(input);
  const where = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(values.status ? { status: values.status } : {}),
    ...(values.query ? { OR: [
      { reason: { contains: values.query, mode: "insensitive" as const } },
      { evidenceReference: { contains: values.query, mode: "insensitive" as const } },
      { targetUser: { OR: [
        { displayName: { contains: values.query, mode: "insensitive" as const } },
        { email: { contains: values.query, mode: "insensitive" as const } },
      ] } },
      { requestedByUser: { OR: [
        { displayName: { contains: values.query, mode: "insensitive" as const } },
        { email: { contains: values.query, mode: "insensitive" as const } },
      ] } },
    ] } : {}),
    ...(values.createdFrom || values.createdTo ? { createdAt: {
      ...(values.createdFrom ? { gte: new Date(`${values.createdFrom}T00:00:00.000Z`) } : {}),
      ...(values.createdTo ? { lte: new Date(`${values.createdTo}T23:59:59.999Z`) } : {}),
    } } : {}),
  };
  const totalItems = await prisma.authRecoveryRequest.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / values.pageSize));
  const page = Math.min(values.page, totalPages);
  const items = await prisma.authRecoveryRequest.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * values.pageSize,
      take: values.pageSize,
      select: {
        id: true, companyId: true, targetUserId: true, requestedByUserId: true,
        status: true, resetPassword: true, resetMfa: true, reason: true,
        evidenceReference: true, createdAt: true, reviewedAt: true,
        reviewReason: true,
        targetUser: { select: { displayName: true, email: true } },
        requestedByUser: { select: { displayName: true, email: true } },
        reviewedByUser: { select: { displayName: true, email: true } },
      },
    });
  return { items, page, pageSize: values.pageSize, totalItems, totalPages, invalidInput: false as const };
}

export async function listAuthRecoveryTargetCatalog(session: SessionContext, input: unknown = {}) {
  await assertCanManageAuthentication(session);
  const rawQuery = input && typeof input === "object" && typeof (input as { query?: unknown }).query === "string" ? String((input as { query: string }).query).trim() : "";
  if (rawQuery.length > 120) return { items: [], overflow: false, query: rawQuery.slice(0, 120), invalidInput: true as const };
  const values = recoveryTargetCatalogSchema.parse(input);
  const userIds = await targetUserIdsForCompany(session);
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds }, tenantId: session.context.tenantId, status: "ACTIVE",
      authIdentities: { some: { provider: "LOCAL", status: "ACTIVE" } },
      ...(values.query ? { OR: [
        { displayName: { contains: values.query, mode: "insensitive" as const } },
        { email: { contains: values.query, mode: "insensitive" as const } },
      ] } : {}),
    },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    take: 101,
    select: { id: true, displayName: true, email: true },
  });
  const selected = values.selectedUserId && userIds.includes(values.selectedUserId) && !users.some((user) => user.id === values.selectedUserId)
    ? await prisma.user.findFirst({ where: { id: values.selectedUserId, tenantId: session.context.tenantId, status: "ACTIVE", authIdentities: { some: { provider: "LOCAL", status: "ACTIVE" } } }, select: { id: true, displayName: true, email: true } })
    : null;
  const overflow = users.length > 100;
  const items = (overflow ? users.slice(0, 100) : users).concat(selected && !users.some((user) => user.id === selected.id) ? [selected] : []);
  return { items, overflow, query: values.query, invalidInput: false as const };
}

export async function getAuthRecoveryRequest(session: SessionContext, requestId: string) {
  await assertCanManageAuthentication(session);
  const id = z.string().uuid().safeParse(requestId);
  if (!id.success) return null;
  return prisma.authRecoveryRequest.findFirst({
    where: { id: id.data, tenantId: session.context.tenantId, companyId: session.context.companyId },
    select: {
      id: true, companyId: true, targetUserId: true, requestedByUserId: true,
      status: true, resetPassword: true, resetMfa: true, reason: true,
      evidenceReference: true, createdAt: true, reviewedAt: true, reviewReason: true,
      targetUser: { select: { displayName: true, email: true } },
      requestedByUser: { select: { displayName: true, email: true } },
      reviewedByUser: { select: { displayName: true, email: true } },
    },
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
  const localIdentity = await prisma.authIdentity.findFirst({ where: { userId: values.targetUserId, provider: "LOCAL", status: "ACTIVE" }, select: { id: true } });
  if (!localIdentity) throw new Error("AUTH_RECOVERY_LOCAL_IDENTITY_REQUIRED");
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
      const activeIdentity = await tx.authIdentity.findFirst({ where: { userId: values.targetUserId, provider: "LOCAL", status: "ACTIVE" }, select: { id: true } });
      if (!activeIdentity) throw new Error("AUTH_RECOVERY_LOCAL_IDENTITY_REQUIRED");
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
    const localIdentity = await tx.authIdentity.findFirst({
      where: { userId: request.targetUserId, provider: "LOCAL", status: "ACTIVE" },
      select: { id: true },
    });
    if (!localIdentity) throw new Error("AUTH_RECOVERY_LOCAL_IDENTITY_REQUIRED");
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
