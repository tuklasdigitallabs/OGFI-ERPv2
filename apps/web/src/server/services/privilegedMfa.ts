import { prisma, Prisma } from "@ogfi/database";
import { z } from "zod";
import { permissions, requirePermission } from "./authorization";
import { assertCanManageCompanyScope } from "./coreAdmin";
import { requireSessionContext, type SessionContext } from "./context";
import { isSensitivePermissionCode } from "./rolePermissionCatalog";

export const privilegedMfaStatuses = [
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REVOKED"
] as const;
export const privilegedMfaRowStatuses = ["NOT_RECORDED", ...privilegedMfaStatuses] as const;
const privilegedMfaPageInputSchema = z.object({
  query: z.string().trim().max(120).optional(),
  status: z.enum(privilegedMfaRowStatuses).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  pageSize: z.number().int().min(10).max(100).optional(),
  selectedUserId: z.string().uuid().optional(),
});

const plainEvidenceSchema = z
  .string()
  .trim()
  .min(2)
  .max(500)
  .refine((value) => !/[<>\u0000-\u001F]/.test(value), {
    message: "Evidence and notes must be plain text references."
  });
const mfaTextSchema = plainEvidenceSchema;

const recordPrivilegedMfaSchema = z.object({
  targetUserId: z.string().uuid(),
  providerName: z.string().trim().min(2).max(120),
  providerSubject: z.string().trim().max(255).optional(),
  evidenceReference: plainEvidenceSchema,
  attestationNote: mfaTextSchema
});

const reviewPrivilegedMfaSchema = z.object({
  enrollmentId: z.string().uuid(),
  reason: mfaTextSchema
});

function displayUser(user: { displayName: string; email: string }) {
  return user.displayName || user.email;
}

async function assertCanManagePrivilegedMfa(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);
}

async function getPrivilegedUserWhere(session: SessionContext) {
  const companyLocations = await prisma.location.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE"
    },
    select: { id: true }
  });
  const companyLocationIds = companyLocations.map((location) => location.id);
  const now = new Date();
  const sensitiveCodes = Object.values(permissions).filter(isSensitivePermissionCode);
  return {
    tenantId: session.context.tenantId,
    status: "ACTIVE" as const,
    scopeAssignments: { some: { status: "ACTIVE" as const, startsAt: { lte: now }, AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, { OR: [{ scopeType: "COMPANY" as const, scopeId: session.context.companyId }, { scopeType: "LOCATION" as const, scopeId: { in: companyLocationIds } }] }] } },
    roleAssignments: { some: { status: "ACTIVE" as const, startsAt: { lte: now }, AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, { role: { status: "ACTIVE" as const, OR: [{ tenantId: session.context.tenantId }, { tenantId: null }], permissions: { some: { permission: { code: { in: sensitiveCodes }, OR: [{ tenantId: session.context.tenantId }, { tenantId: null }] } } } } }] } }
  };
}

async function getPrivilegedMfaSummary(session: SessionContext) {
  const results = await Promise.all(privilegedMfaRowStatuses.map((status) => getMfaStatusPageIds(session, status, 1, 1, "")));
  return { total: results.reduce((sum, result) => sum + result.totalItems, 0), verified: results[2]?.totalItems ?? 0, pending: results[1]?.totalItems ?? 0, revoked: results[3]?.totalItems ?? 0, missing: results[0]?.totalItems ?? 0 };
}

async function getMfaStatusPageIds(session: SessionContext, status: (typeof privilegedMfaRowStatuses)[number], page: number, pageSize: number, query: string) {
  const locations = await prisma.location.findMany({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, status: "ACTIVE" }, select: { id: true } });
  const sensitiveCodes = Object.values(permissions).filter(isSensitivePermissionCode);
  const locationIds = locations.length ? Prisma.join(locations.map((location) => Prisma.sql`${location.id}::uuid`), ",") : Prisma.sql`NULL::uuid`;
  const permissionCodes = Prisma.join(sensitiveCodes.map((code) => Prisma.sql`${code}`), ",");
  const queryValue = query ? Prisma.sql`AND (u."displayName" ILIKE ${`%${query}%`} OR u.email ILIKE ${`%${query}%`})` : Prisma.empty;
  const statusValue = Prisma.sql`${status}`;
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH privileged AS (
      SELECT u.id FROM "User" u
      WHERE u."tenantId" = ${session.context.tenantId}::uuid AND u.status = 'ACTIVE'
        ${queryValue}
        AND EXISTS (SELECT 1 FROM "UserScopeAssignment" s WHERE s."userId" = u.id AND s.status = 'ACTIVE' AND s."startsAt" <= CURRENT_TIMESTAMP AND (s."endsAt" IS NULL OR s."endsAt" > CURRENT_TIMESTAMP) AND ((s."scopeType" = 'COMPANY' AND s."scopeId" = ${session.context.companyId}::uuid) OR (s."scopeType" = 'LOCATION' AND s."scopeId" IN (${locationIds}))))
        AND EXISTS (SELECT 1 FROM "UserRoleAssignment" a JOIN "Role" r ON r.id = a."roleId" JOIN "RolePermission" rp ON rp."roleId" = r.id JOIN "Permission" p ON p.id = rp."permissionId" WHERE a."userId" = u.id AND a.status = 'ACTIVE' AND a."startsAt" <= CURRENT_TIMESTAMP AND (a."endsAt" IS NULL OR a."endsAt" > CURRENT_TIMESTAMP) AND r.status = 'ACTIVE' AND (r."tenantId" = ${session.context.tenantId}::uuid OR r."tenantId" IS NULL) AND (p."tenantId" = ${session.context.tenantId}::uuid OR p."tenantId" IS NULL) AND p.code IN (${permissionCodes}))
    ), latest AS (
      SELECT DISTINCT ON (e."targetUserId") e."targetUserId", e.status FROM "PrivilegedMfaEnrollment" e JOIN privileged p ON p.id = e."targetUserId" WHERE e."tenantId" = ${session.context.tenantId}::uuid AND e."companyId" = ${session.context.companyId}::uuid ORDER BY e."targetUserId", e."createdAt" DESC, e.id DESC
    )
    SELECT p.id FROM privileged p LEFT JOIN latest l ON l."targetUserId" = p.id WHERE COALESCE(l.status, 'NOT_RECORDED') = ${statusValue} ORDER BY p.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `);
  const count = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    WITH privileged AS (
      SELECT u.id FROM "User" u
      WHERE u."tenantId" = ${session.context.tenantId}::uuid AND u.status = 'ACTIVE'
        ${queryValue}
        AND EXISTS (SELECT 1 FROM "UserScopeAssignment" s WHERE s."userId" = u.id AND s.status = 'ACTIVE' AND s."startsAt" <= CURRENT_TIMESTAMP AND (s."endsAt" IS NULL OR s."endsAt" > CURRENT_TIMESTAMP) AND ((s."scopeType" = 'COMPANY' AND s."scopeId" = ${session.context.companyId}::uuid) OR (s."scopeType" = 'LOCATION' AND s."scopeId" IN (${locationIds}))))
        AND EXISTS (SELECT 1 FROM "UserRoleAssignment" a JOIN "Role" r ON r.id = a."roleId" JOIN "RolePermission" rp ON rp."roleId" = r.id JOIN "Permission" p ON p.id = rp."permissionId" WHERE a."userId" = u.id AND a.status = 'ACTIVE' AND a."startsAt" <= CURRENT_TIMESTAMP AND (a."endsAt" IS NULL OR a."endsAt" > CURRENT_TIMESTAMP) AND r.status = 'ACTIVE' AND (r."tenantId" = ${session.context.tenantId}::uuid OR r."tenantId" IS NULL) AND (p."tenantId" = ${session.context.tenantId}::uuid OR p."tenantId" IS NULL) AND p.code IN (${permissionCodes}))
    ), latest AS (SELECT DISTINCT ON (e."targetUserId") e."targetUserId", e.status FROM "PrivilegedMfaEnrollment" e JOIN privileged p ON p.id = e."targetUserId" WHERE e."tenantId" = ${session.context.tenantId}::uuid AND e."companyId" = ${session.context.companyId}::uuid ORDER BY e."targetUserId", e."createdAt" DESC, e.id DESC)
    SELECT COUNT(*)::bigint AS count FROM privileged p LEFT JOIN latest l ON l."targetUserId" = p.id WHERE COALESCE(l.status, 'NOT_RECORDED') = ${statusValue}
  `);
  return { ids: rows.map((row) => row.id), totalItems: Number(count[0]?.count ?? 0) };
}

export async function listPrivilegedMfaEnrollments(session: SessionContext, input: z.input<typeof privilegedMfaPageInputSchema> = {}) {
  await assertCanManagePrivilegedMfa(session);
  const values = privilegedMfaPageInputSchema.parse(input);
  const where = await getPrivilegedUserWhere(session);
  const query = values.query?.slice(0, 120) ?? "";
  const userWhere = { ...where, ...(query || values.selectedUserId ? { AND: [{ OR: [...(query ? [{ displayName: { contains: query, mode: "insensitive" as const } }, { email: { contains: query, mode: "insensitive" as const } }] : []), ...(values.selectedUserId ? [{ id: values.selectedUserId }] : [])] }] } : {}) };
  const pageSize = values.pageSize ?? 25;
  let totalItems = await prisma.user.count({ where: userWhere });
  let totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  let page = Math.min(values.page ?? 1, totalPages);
  let statusPageIds: string[] | undefined;
  if (values.status) {
    const statusCount = await getMfaStatusPageIds(session, values.status, 1, 1, query);
    totalItems = statusCount.totalItems;
    totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    page = Math.min(page, totalPages);
    statusPageIds = (await getMfaStatusPageIds(session, values.status, page, pageSize, query)).ids;
  }
  const effectiveUserWhere = statusPageIds ? { ...userWhere, id: { in: statusPageIds } } : userWhere;
  const privilegedUsers = await prisma.user.findMany({ where: effectiveUserWhere, select: { id: true, displayName: true, email: true, roleAssignments: { where: { status: "ACTIVE", startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }], role: { status: "ACTIVE", OR: [{ tenantId: session.context.tenantId }, { tenantId: null }] } }, select: { role: { select: { permissions: { select: { permission: { select: { code: true } } } } } } } } }, orderBy: [{ displayName: "asc" }, { id: "asc" }], skip: statusPageIds ? 0 : (page - 1) * pageSize, take: statusPageIds ? statusPageIds.length : pageSize });
  const userIds = privilegedUsers.map((user) => user.id);
  const enrollments = await prisma.privilegedMfaEnrollment.findMany({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, targetUserId: { in: userIds } }, select: { id: true, targetUserId: true, status: true, providerName: true, providerSubject: true, evidenceReference: true, attestationNote: true, attestedAt: true, verificationNote: true, verifiedAt: true, revocationReason: true, revokedAt: true, attestedByUser: { select: { displayName: true, email: true } }, verifiedByUser: { select: { displayName: true, email: true } }, revokedByUser: { select: { displayName: true, email: true } }, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });

  const latestByUser = new Map<string, (typeof enrollments)[number]>();
  for (const enrollment of enrollments) {
    if (!latestByUser.has(enrollment.targetUserId)) {
      latestByUser.set(enrollment.targetUserId, enrollment);
    }
  }

  const catalogUsers = await prisma.user.findMany({ where: userWhere, select: { id: true, displayName: true, email: true }, orderBy: [{ displayName: "asc" }, { id: "asc" }], take: 101 });
  const rows = privilegedUsers.map((user) => {
      const enrollment = latestByUser.get(user.id);
      const sensitivePermissionCount = new Set(user.roleAssignments.flatMap((assignment) => assignment.role.permissions.map((rolePermission) => rolePermission.permission.code).filter(isSensitivePermissionCode))).size;
      return {
        userId: user.id, userName: displayUser(user),
        email: user.email,
        sensitivePermissionCount,
        enrollmentId: enrollment?.id ?? null,
        status: enrollment?.status ?? "NOT_RECORDED",
        providerName: enrollment?.providerName ?? null,
        providerSubject: enrollment?.providerSubject ?? null,
        evidenceReference: enrollment?.evidenceReference ?? null,
        attestationNote: enrollment?.attestationNote ?? null,
        attestedByName: enrollment ? displayUser(enrollment.attestedByUser) : null,
        attestedAt: enrollment?.attestedAt.toISOString() ?? null,
        verifiedByName: enrollment?.verifiedByUser
          ? displayUser(enrollment.verifiedByUser)
          : null,
        verificationNote: enrollment?.verificationNote ?? null,
        verifiedAt: enrollment?.verifiedAt?.toISOString() ?? null,
        revokedByName: enrollment?.revokedByUser
          ? displayUser(enrollment.revokedByUser)
          : null,
        revocationReason: enrollment?.revocationReason ?? null,
        revokedAt: enrollment?.revokedAt?.toISOString() ?? null
      };
    });
  return { rows, options: catalogUsers.slice(0, 100).map((user) => ({ id: user.id, label: `${displayUser(user)} / ${user.email}` })), optionsHasMore: catalogUsers.length > 100, page, pageSize, totalItems, totalPages, query, status: values.status ?? null, summary: await getPrivilegedMfaSummary(session) };
}

export async function getPrivilegedMfaEnrollment(session: SessionContext, enrollmentId: string) {
  await assertCanManagePrivilegedMfa(session);
  if (!z.string().uuid().safeParse(enrollmentId).success) return null;
  const privilegedWhere = await getPrivilegedUserWhere(session);
  const enrollment = await prisma.privilegedMfaEnrollment.findFirst({ where: { id: enrollmentId, tenantId: session.context.tenantId, companyId: session.context.companyId, targetUser: { is: privilegedWhere } }, select: { id: true, targetUserId: true, status: true, providerName: true, providerSubject: true, evidenceReference: true, attestationNote: true, attestedAt: true, verificationNote: true, verifiedAt: true, revocationReason: true, revokedAt: true, targetUser: { select: { displayName: true, email: true } }, attestedByUser: { select: { displayName: true, email: true } }, verifiedByUser: { select: { displayName: true, email: true } }, revokedByUser: { select: { displayName: true, email: true } } } });
  return enrollment ? { ...enrollment, targetUserName: displayUser(enrollment.targetUser), targetUserEmail: enrollment.targetUser.email, attestedByName: enrollment.attestedByUser ? displayUser(enrollment.attestedByUser) : null, verifiedByName: enrollment.verifiedByUser ? displayUser(enrollment.verifiedByUser) : null, revokedByName: enrollment.revokedByUser ? displayUser(enrollment.revokedByUser) : null } : null;
}

export async function recordPrivilegedMfaEnrollment(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManagePrivilegedMfa(session);
  const values = recordPrivilegedMfaSchema.parse(Object.fromEntries(formData));
  if (values.targetUserId === session.user.id) {
    throw new Error("PRIVILEGED_MFA_SELF_ATTESTATION_BLOCKED");
  }

  const privilegedWhere = await getPrivilegedUserWhere(session);
  const privilegedTarget = await prisma.user.findFirst({ where: { ...privilegedWhere, id: values.targetUserId }, select: { id: true } });
  if (!privilegedTarget) {
    throw new Error("PRIVILEGED_MFA_TARGET_NOT_PRIVILEGED");
  }

  await prisma.$transaction(async (tx) => {
  const saved = await tx.privilegedMfaEnrollment.upsert({
    where: {
      companyId_targetUserId_providerName: {
        companyId: session.context.companyId,
        targetUserId: values.targetUserId,
        providerName: values.providerName
      }
    },
    update: {
      status: "PENDING_VERIFICATION",
      providerSubject: values.providerSubject || null,
      evidenceReference: values.evidenceReference,
      attestationNote: values.attestationNote,
      attestedByUserId: session.user.id,
      attestedAt: new Date(),
      verifiedByUserId: null,
      verificationNote: null,
      verifiedAt: null,
      revokedByUserId: null,
      revocationReason: null,
      revokedAt: null,
      sourceDecisionId: "DEC-0036"
    },
    create: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      targetUserId: values.targetUserId,
      providerName: values.providerName,
      providerSubject: values.providerSubject || null,
      evidenceReference: values.evidenceReference,
      attestationNote: values.attestationNote,
      attestedByUserId: session.user.id,
      sourceDecisionId: "DEC-0036"
    }
  });

  await tx.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      actorUserId: session.user.id,
      eventType: "privileged_mfa_enrollment.recorded",
      entityType: "PrivilegedMfaEnrollment",
      entityId: saved.id,
      afterData: {
        targetUserId: values.targetUserId,
        providerName: values.providerName,
        status: "PENDING_VERIFICATION"
      },
      metadata: {
        sourceDecisionId: "DEC-0036",
        evidenceReference: values.evidenceReference,
        attestationNote: values.attestationNote,
        limitation:
          "ERP records MFA enrollment evidence only; external identity provider enforces MFA."
      }
    }
  });
  });
}

export async function verifyPrivilegedMfaEnrollment(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManagePrivilegedMfa(session);
  const values = reviewPrivilegedMfaSchema.parse(Object.fromEntries(formData));
  const enrollment = await prisma.privilegedMfaEnrollment.findFirst({
    where: {
      id: values.enrollmentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING_VERIFICATION"
    }
  });
  if (!enrollment) {
    throw new Error("PRIVILEGED_MFA_ENROLLMENT_NOT_FOUND");
  }
  if (
    enrollment.targetUserId === session.user.id ||
    enrollment.attestedByUserId === session.user.id
  ) {
    throw new Error("PRIVILEGED_MFA_SELF_VERIFICATION_BLOCKED");
  }
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.privilegedMfaEnrollment.updateMany({ where: { id: enrollment.id, tenantId: session.context.tenantId, companyId: session.context.companyId, status: "PENDING_VERIFICATION" }, data: { status: "PENDING_VERIFICATION" } });
    if (claimed.count !== 1) throw new Error("PRIVILEGED_MFA_ENROLLMENT_NOT_FOUND");
    const saved = await tx.privilegedMfaEnrollment.update({ where: { id: enrollment.id }, data: {
        status: "VERIFIED",
        verifiedByUserId: session.user.id,
        verificationNote: values.reason,
        verifiedAt: new Date()
      } });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "privileged_mfa_enrollment.verified",
        entityType: "PrivilegedMfaEnrollment",
        entityId: saved.id,
        beforeData: { status: "PENDING_VERIFICATION" },
        afterData: { status: "VERIFIED" },
        metadata: {
          sourceDecisionId: "DEC-0036",
          verificationNote: values.reason
        }
      }
    });
  });
}

export async function revokePrivilegedMfaEnrollment(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManagePrivilegedMfa(session);
  const values = reviewPrivilegedMfaSchema.parse(Object.fromEntries(formData));
  const enrollment = await prisma.privilegedMfaEnrollment.findFirst({
    where: {
      id: values.enrollmentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: { in: ["PENDING_VERIFICATION", "VERIFIED"] }
    }
  });
  if (!enrollment) {
    throw new Error("PRIVILEGED_MFA_ENROLLMENT_NOT_FOUND");
  }
  if (enrollment.targetUserId === session.user.id) {
    throw new Error("PRIVILEGED_MFA_SELF_VERIFICATION_BLOCKED");
  }
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.privilegedMfaEnrollment.updateMany({ where: { id: enrollment.id, tenantId: session.context.tenantId, companyId: session.context.companyId, status: { in: ["PENDING_VERIFICATION", "VERIFIED"] } }, data: { status: enrollment.status } });
    if (claimed.count !== 1) throw new Error("PRIVILEGED_MFA_ENROLLMENT_NOT_FOUND");
    const saved = await tx.privilegedMfaEnrollment.update({ where: { id: enrollment.id }, data: {
        status: "REVOKED",
        revokedByUserId: session.user.id,
        revocationReason: values.reason,
        revokedAt: new Date()
      } });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "privileged_mfa_enrollment.revoked",
        entityType: "PrivilegedMfaEnrollment",
        entityId: saved.id,
        beforeData: { status: enrollment.status },
        afterData: { status: "REVOKED" },
        metadata: {
          sourceDecisionId: "DEC-0036",
          revocationReason: values.reason
        }
      }
    });
  });
}
