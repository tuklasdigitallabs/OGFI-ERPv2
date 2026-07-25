import { prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import {
  getGrantedPermissionCodes,
  permissions,
  requirePermission,
} from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";

const completeAuthSessionInvalidationSchema = z.object({
  invalidationId: z.string().uuid(),
  providerName: z.string().trim().min(2).max(120),
  providerReference: z.string().trim().min(2).max(240),
  reason: z.string().trim().min(5).max(500),
});
export const authSessionInvalidationStatuses = [
  "PENDING_PROVIDER",
  "PROVIDER_COMPLETED",
  "APPLICATION_COMPLETED",
] as const;
const authSessionInvalidationPageInputSchema = z.object({
  query: z.string().trim().max(120).optional(),
  status: z.enum(authSessionInvalidationStatuses).optional(),
  createdFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  pageSize: z.number().int().min(10).max(100).optional(),
});

function accessibleCompanyPredicate(session: SessionContext, canManageTenantGlobal: boolean) {
  return canManageTenantGlobal
    ? { OR: [{ companyId: session.context.companyId }, { companyId: null }] }
    : { companyId: session.context.companyId };
}

function parseDateRange(createdFrom?: string, createdTo?: string) {
  const parseDate = (value: string | undefined, endOfDay = false) => {
    if (!value) return undefined;
    const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("AUTH_INVALIDATION_DATE_INVALID");
    return date;
  };
  const from = parseDate(createdFrom);
  const to = parseDate(createdTo, true);
  if (from && to && from > to) throw new Error("AUTH_INVALIDATION_DATE_RANGE_INVALID");
  if (from && to && to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) throw new Error("AUTH_INVALIDATION_DATE_RANGE_TOO_LONG");
  return { from, to };
}

async function assertCanManageAuthInvalidations(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);
  const now = new Date();
  const assignment = await prisma.userScopeAssignment.findFirst({
    where: {
      userId: session.user.id,
      scopeType: "COMPANY",
      scopeId: session.context.companyId,
      accessLevel: "MANAGE",
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
  });
  if (!assignment) {
    throw new Error("ADMIN_SCOPE_DENIED");
  }
  const grantedPermissionCodes = await getGrantedPermissionCodes(session);
  return {
    canManageTenantGlobal: grantedPermissionCodes.includes(
      permissions.tenantRoleAdminister,
    ),
  };
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

export async function listAuthSessionInvalidations(
  session: SessionContext,
  input: z.input<typeof authSessionInvalidationPageInputSchema> = {},
) {
  const access = await assertCanManageAuthInvalidations(session);
  const values = authSessionInvalidationPageInputSchema.parse(input);
  const query = values.query?.slice(0, 120) ?? "";
  const range = parseDateRange(values.createdFrom, values.createdTo);
  const pageSize = values.pageSize ?? 25;
  const requestedPage = values.page ?? 1;
  const scopePredicate = accessibleCompanyPredicate(session, access.canManageTenantGlobal);
  const where = {
    tenantId: session.context.tenantId,
    AND: [
      scopePredicate,
      ...(values.status ? [{ status: values.status }] : []),
      ...(range.from || range.to ? [{ createdAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }] : []),
      ...(query
        ? [{
            OR: [
            { reason: { contains: query, mode: "insensitive" as const } },
            { sourceEventType: { contains: query, mode: "insensitive" as const } },
            { sourceRecordId: { contains: query, mode: "insensitive" as const } },
            { targetUser: { OR: [{ displayName: { contains: query, mode: "insensitive" as const } }, { email: { contains: query, mode: "insensitive" as const } }] } },
            ],
          }]
        : []),
    ],
  };
  const totalItems = await prisma.authSessionInvalidation.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const records = await prisma.authSessionInvalidation.findMany({
    where,
    select: {
      id: true, companyId: true, status: true, targetUserId: true, requestedByUserId: true,
      reason: true, sourceEventType: true, sourceRecordId: true, demoEpochEnforced: true,
      providerName: true, providerReference: true, completedAt: true, createdAt: true,
      targetUser: { select: { displayName: true, email: true } },
      requestedByUser: { select: { displayName: true, email: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    items: records.map((record) => ({
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
    scopeLabel: record.companyId ? "Selected company" : "Tenant-wide",
    })),
    page,
    pageSize,
    totalItems,
    totalPages,
    query,
    status: values.status ?? null,
    createdFrom: values.createdFrom ?? null,
    createdTo: values.createdTo ?? null,
  };
}

export async function getAuthSessionInvalidation(session: SessionContext, id: string) {
  const access = await assertCanManageAuthInvalidations(session);
  if (!z.string().uuid().safeParse(id).success) return null;
  return prisma.authSessionInvalidation.findFirst({
    where: { id, tenantId: session.context.tenantId, ...accessibleCompanyPredicate(session, access.canManageTenantGlobal) },
    select: {
      id: true, companyId: true, status: true, targetUserId: true, requestedByUserId: true,
      reason: true, sourceEventType: true, sourceRecordId: true, demoEpochEnforced: true,
      providerName: true, providerReference: true, completedAt: true, createdAt: true,
      targetUser: { select: { displayName: true, email: true } },
      requestedByUser: { select: { displayName: true, email: true } },
    },
  }).then((record) => record ? { ...record, targetUserName: record.targetUser.displayName || record.targetUser.email, targetUserEmail: record.targetUser.email, requestedByName: record.requestedByUser ? record.requestedByUser.displayName || record.requestedByUser.email : null, scopeLabel: record.companyId ? "Selected company" : "Tenant-wide", createdAt: record.createdAt.toISOString(), completedAt: record.completedAt?.toISOString() ?? null } : null);
}

export async function completeAuthSessionInvalidation(formData: FormData) {
  const session = await requireSessionContext();
  const access = await assertCanManageAuthInvalidations(session);
  const values = completeAuthSessionInvalidationSchema.parse(
    Object.fromEntries(formData),
  );
  const accessibleCompanyPredicate = access.canManageTenantGlobal
    ? {
        OR: [
          { companyId: session.context.companyId },
          { companyId: null },
        ],
      }
    : { companyId: session.context.companyId };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.authSessionInvalidation.findFirst({
      where: {
        id: values.invalidationId,
        tenantId: session.context.tenantId,
        status: "PENDING_PROVIDER",
        ...accessibleCompanyPredicate,
      },
    });
    if (!existing) {
      throw new Error("AUTH_SESSION_INVALIDATION_NOT_FOUND");
    }
    if (existing.requestedByUserId === session.user.id) {
      throw new Error("AUTH_SESSION_INVALIDATION_SELF_COMPLETION_BLOCKED");
    }

    const claimed = await tx.authSessionInvalidation.updateMany({
      where: {
        id: existing.id,
        tenantId: session.context.tenantId,
        status: "PENDING_PROVIDER",
        ...accessibleCompanyPredicate,
      },
      data: {
        status: "PROVIDER_COMPLETED",
        providerName: values.providerName,
        providerReference: values.providerReference,
        completedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new Error("AUTH_SESSION_INVALIDATION_NOT_FOUND");
    }
    const saved = await tx.authSessionInvalidation.findUniqueOrThrow({
      where: { id: existing.id },
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
