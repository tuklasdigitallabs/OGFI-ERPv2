import { prisma } from "@ogfi/database";
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

async function getPrivilegedUserIds(session: SessionContext) {
  const companyLocations = await prisma.location.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE"
    },
    select: { id: true }
  });
  const companyLocationIds = new Set(companyLocations.map((location) => location.id));
  const users = await prisma.user.findMany({
    where: {
      tenantId: session.context.tenantId,
      status: "ACTIVE"
    },
    include: {
      scopeAssignments: {
        where: { status: "ACTIVE" }
      },
      roleAssignments: {
        where: { status: "ACTIVE" },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true }
              }
            }
          }
        }
      }
    },
    orderBy: { displayName: "asc" }
  });

  return users
    .map((user) => ({
      user,
      inCompanyScope: user.scopeAssignments.some(
        (scope) =>
          (scope.scopeType === "COMPANY" &&
            scope.scopeId === session.context.companyId) ||
          (scope.scopeType === "LOCATION" && companyLocationIds.has(scope.scopeId))
      ),
      sensitivePermissionCount: new Set(
        user.roleAssignments.flatMap((assignment) =>
          assignment.role.permissions
            .map((rolePermission) => rolePermission.permission.code)
            .filter((code) => isSensitivePermissionCode(code))
        )
      ).size
    }))
    .filter((entry) => entry.inCompanyScope && entry.sensitivePermissionCount > 0);
}

export async function listPrivilegedMfaEnrollments(session: SessionContext) {
  await assertCanManagePrivilegedMfa(session);
  const [privilegedUsers, enrollments] = await Promise.all([
    getPrivilegedUserIds(session),
    prisma.privilegedMfaEnrollment.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      include: {
        targetUser: true,
        attestedByUser: true,
        verifiedByUser: true,
        revokedByUser: true
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const latestByUser = new Map<string, (typeof enrollments)[number]>();
  for (const enrollment of enrollments) {
    if (!latestByUser.has(enrollment.targetUserId)) {
      latestByUser.set(enrollment.targetUserId, enrollment);
    }
  }

  return {
    rows: privilegedUsers.map(({ user, sensitivePermissionCount }) => {
      const enrollment = latestByUser.get(user.id);
      return {
        userId: user.id,
        userName: displayUser(user),
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
    }),
    options: privilegedUsers.map(({ user, sensitivePermissionCount }) => ({
      id: user.id,
      label: `${displayUser(user)} / ${user.email} / ${sensitivePermissionCount} sensitive permission${sensitivePermissionCount === 1 ? "" : "s"}`
    }))
  };
}

export async function recordPrivilegedMfaEnrollment(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManagePrivilegedMfa(session);
  const values = recordPrivilegedMfaSchema.parse(Object.fromEntries(formData));
  if (values.targetUserId === session.user.id) {
    throw new Error("PRIVILEGED_MFA_SELF_ATTESTATION_BLOCKED");
  }

  const privilegedUserIds = new Set(
    (await getPrivilegedUserIds(session)).map((entry) => entry.user.id)
  );
  if (!privilegedUserIds.has(values.targetUserId)) {
    throw new Error("PRIVILEGED_MFA_TARGET_NOT_PRIVILEGED");
  }

  const saved = await prisma.privilegedMfaEnrollment.upsert({
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

  await prisma.auditEvent.create({
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
    const saved = await tx.privilegedMfaEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "VERIFIED",
        verifiedByUserId: session.user.id,
        verificationNote: values.reason,
        verifiedAt: new Date()
      }
    });
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
    const saved = await tx.privilegedMfaEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "REVOKED",
        revokedByUserId: session.user.id,
        revocationReason: values.reason,
        revokedAt: new Date()
      }
    });
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
