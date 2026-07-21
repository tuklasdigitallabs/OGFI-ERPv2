import { prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import { permissions, requirePermission } from "./authorization";
import {
  assertCanManageCompanyScope,
  assertNoActiveDuplicateScope,
  touchUserPrivilegeEpoch
} from "./coreAdmin";
import { requireSessionContext, type SessionContext } from "./context";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";

export const breakGlassAccessStatuses = [
  "PENDING_REVIEW",
  "ACTIVE",
  "REVOKED",
  "EXPIRED",
  "REJECTED",
  "POST_REVIEWED"
] as const;

const breakGlassMaxDurationHours = 24;
const scopeReasonSchema = z.string().trim().min(5).max(500);
const accessLevelSchema = z.enum(["VIEW", "OPERATE", "APPROVE", "MANAGE"]);

const requestBreakGlassAccessSchema = z.object({
  targetUserId: z.string().uuid(),
  locationId: z.string().uuid(),
  accessLevel: accessLevelSchema,
  requestedUntil: z.string().trim().min(1),
  reason: scopeReasonSchema,
  evidenceReference: z.string().trim().min(2).max(240)
});

const reviewBreakGlassAccessSchema = z.object({
  grantId: z.string().uuid(),
  reason: scopeReasonSchema
});

const postReviewBreakGlassAccessSchema = z.object({
  grantId: z.string().uuid(),
  postReviewOutcome: z.enum([
    "ACCEPTED",
    "FOLLOW_UP_REQUIRED",
    "POLICY_EXCEPTION"
  ]),
  postReviewReason: scopeReasonSchema,
  postReviewEvidenceReference: z.string().trim().min(2).max(240)
});

type BreakGlassStatus = (typeof breakGlassAccessStatuses)[number];

function parseRequestedUntil(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("BREAK_GLASS_EXPIRY_INVALID");
  }
  const now = new Date();
  if (date.getTime() <= now.getTime()) {
    throw new Error("BREAK_GLASS_EXPIRY_INVALID");
  }
  const maxExpiry = new Date(
    now.getTime() + breakGlassMaxDurationHours * 60 * 60 * 1000
  );
  if (date.getTime() > maxExpiry.getTime()) {
    throw new Error("BREAK_GLASS_EXPIRY_TOO_LONG");
  }
  return date;
}

function formatUserName(user: { displayName: string; email: string }) {
  return user.displayName || user.email;
}

async function assertCanManageBreakGlass(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);
}

async function expireActiveBreakGlassGrants(session: SessionContext) {
  const expired = await prisma.breakGlassAccessGrant.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE",
      requestedUntil: { lte: new Date() }
    }
  });

  for (const grant of expired) {
    await prisma.$transaction(async (tx) => {
      if (grant.assignmentId) {
        await tx.userScopeAssignment.updateMany({
          where: {
            id: grant.assignmentId,
            userId: grant.targetUserId,
            status: "ACTIVE"
          },
          data: {
            status: "INACTIVE",
            endsAt: new Date()
          }
        });
      }
      await tx.breakGlassAccessGrant.update({
        where: { id: grant.id },
        data: {
          status: "EXPIRED",
          revokedAt: new Date(),
          revocationReason: "Expired automatically at approved break-glass expiry."
        }
      });
      await touchUserPrivilegeEpoch(tx, grant.targetUserId);
      await tx.auditEvent.create({
        data: {
          tenantId: grant.tenantId,
          companyId: grant.companyId,
          actorUserId: null,
          eventType: "break_glass_access.expired",
          entityType: "BreakGlassAccessGrant",
          entityId: grant.id,
          beforeData: { status: "ACTIVE" },
          afterData: { status: "EXPIRED", assignmentId: grant.assignmentId },
          metadata: {
            sourceDecisionId: "DEC-0036",
            targetUserId: grant.targetUserId,
            locationId: grant.locationId,
            requestedUntil: grant.requestedUntil.toISOString()
          }
        }
      });
    });
  }
}

async function createBreakGlassAssignment(
  tx: TransactionClient,
  input: {
    targetUserId: string;
    locationId: string;
    accessLevel: z.infer<typeof accessLevelSchema>;
    requestedUntil: Date;
  }
) {
  const assignment = await tx.userScopeAssignment.create({
    data: {
      userId: input.targetUserId,
      scopeType: "LOCATION",
      scopeId: input.locationId,
      accessLevel: input.accessLevel,
      startsAt: new Date(),
      endsAt: input.requestedUntil
    }
  });
  await touchUserPrivilegeEpoch(tx, input.targetUserId);
  return assignment;
}

export async function listBreakGlassAccessGrants(session: SessionContext) {
  await assertCanManageBreakGlass(session);
  await expireActiveBreakGlassGrants(session);

  const grants = await prisma.breakGlassAccessGrant.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    include: {
      targetUser: true,
      location: true,
      requestedByUser: true,
      approvedByUser: true,
      revokedByUser: true,
      postReviewedByUser: true
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return grants.map((grant) => ({
    id: grant.id,
    status: grant.status as BreakGlassStatus,
    targetUserId: grant.targetUserId,
    targetUserName: formatUserName(grant.targetUser),
    locationId: grant.locationId,
    locationName: grant.location.name,
    locationCode: grant.location.code,
    locationType: grant.location.locationType,
    accessLevel: grant.accessLevel,
    reason: grant.reason,
    evidenceReference: grant.evidenceReference,
    requestedUntil: grant.requestedUntil.toISOString(),
    assignmentId: grant.assignmentId,
    requestedByName: formatUserName(grant.requestedByUser),
    approvedByName: grant.approvedByUser
      ? formatUserName(grant.approvedByUser)
      : null,
    approvalReason: grant.approvalReason,
    approvedAt: grant.approvedAt?.toISOString() ?? null,
    revokedByName: grant.revokedByUser ? formatUserName(grant.revokedByUser) : null,
    revocationReason: grant.revocationReason,
    revokedAt: grant.revokedAt?.toISOString() ?? null,
    postReviewedByName: grant.postReviewedByUser
      ? formatUserName(grant.postReviewedByUser)
      : null,
    postReviewOutcome: grant.postReviewOutcome,
    postReviewReason: grant.postReviewReason,
    postReviewEvidenceReference: grant.postReviewEvidenceReference,
    postReviewedAt: grant.postReviewedAt?.toISOString() ?? null,
    createdAt: grant.createdAt.toISOString()
  }));
}

export async function listBreakGlassAccessOptions(session: SessionContext) {
  await assertCanManageBreakGlass(session);
  const [users, locations] = await Promise.all([
    prisma.user.findMany({
      where: {
        tenantId: session.context.tenantId,
        status: "ACTIVE",
        id: { not: session.user.id }
      },
      orderBy: { displayName: "asc" }
    }),
    prisma.location.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      orderBy: { name: "asc" }
    })
  ]);
  return {
    users: users.map((user) => ({
      id: user.id,
      label: `${formatUserName(user)} / ${user.email}`
    })),
    locations: locations.map((location) => ({
      id: location.id,
      label: `${location.name} / ${location.locationType.replace(/_/g, " ")}`
    })),
    maxDurationHours: breakGlassMaxDurationHours
  };
}

export async function requestBreakGlassAccess(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageBreakGlass(session);
  const values = requestBreakGlassAccessSchema.parse(Object.fromEntries(formData));
  await assertPrivilegedMfaForAction(session, {
    action: "break_glass_access.request",
    permissionCode: permissions.coreAdminister,
    entityType: "BreakGlassAccessGrant",
    reason: "Break-glass access requests require verified privileged MFA evidence.",
    metadata: {
      targetUserId: values.targetUserId,
      locationId: values.locationId,
      accessLevel: values.accessLevel
    }
  });
  if (values.targetUserId === session.user.id) {
    throw new Error("BREAK_GLASS_SELF_REQUEST_BLOCKED");
  }
  const requestedUntil = parseRequestedUntil(values.requestedUntil);

  const [targetUser, location, pendingGrant] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: values.targetUserId,
        tenantId: session.context.tenantId,
        status: "ACTIVE"
      }
    }),
    prisma.location.findFirst({
      where: {
        id: values.locationId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
    prisma.breakGlassAccessGrant.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        targetUserId: values.targetUserId,
        status: { in: ["PENDING_REVIEW", "ACTIVE"] }
      },
      select: { id: true }
    })
  ]);

  if (!targetUser) {
    throw new Error("TARGET_USER_NOT_FOUND");
  }
  if (!location) {
    throw new Error("TARGET_LOCATION_NOT_FOUND");
  }
  if (pendingGrant) {
    throw new Error("DUPLICATE_ACTIVE_BREAK_GLASS_ACCESS");
  }

  const grant = await prisma.breakGlassAccessGrant.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: location.companyId,
      targetUserId: targetUser.id,
      locationId: location.id,
      accessLevel: values.accessLevel,
      requestedUntil,
      reason: values.reason,
      evidenceReference: values.evidenceReference,
      requestedByUserId: session.user.id
    }
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: location.companyId,
      actorUserId: session.user.id,
      eventType: "break_glass_access.requested",
      entityType: "BreakGlassAccessGrant",
      entityId: grant.id,
      afterData: {
        status: "PENDING_REVIEW",
        targetUserId: targetUser.id,
        locationId: location.id,
        accessLevel: values.accessLevel,
        requestedUntil: requestedUntil.toISOString()
      },
      metadata: {
        sourceDecisionId: "DEC-0036",
        reason: values.reason,
        evidenceReference: values.evidenceReference,
        targetUserEmail: targetUser.email,
        locationCode: location.code,
        locationType: location.locationType
      }
    }
  });
}

export async function approveBreakGlassAccess(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageBreakGlass(session);
  const values = reviewBreakGlassAccessSchema.parse(Object.fromEntries(formData));

  const grant = await prisma.breakGlassAccessGrant.findFirst({
    where: {
      id: values.grantId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING_REVIEW"
    },
    include: {
      targetUser: true,
      location: true
    }
  });
  if (!grant) {
    throw new Error("BREAK_GLASS_ACCESS_NOT_FOUND");
  }
  if (
    grant.requestedByUserId === session.user.id ||
    grant.targetUserId === session.user.id
  ) {
    throw new Error("BREAK_GLASS_SELF_APPROVAL_BLOCKED");
  }
  if (grant.requestedUntil.getTime() <= Date.now()) {
    throw new Error("BREAK_GLASS_EXPIRY_INVALID");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "break_glass_access.approve",
    permissionCode: permissions.coreAdminister,
    entityType: "BreakGlassAccessGrant",
    entityId: grant.id,
    reason: "Break-glass approval requires verified privileged MFA evidence.",
    metadata: {
      targetUserId: grant.targetUserId,
      locationId: grant.locationId,
      accessLevel: grant.accessLevel
    }
  });

  const existing = await prisma.userScopeAssignment.findFirst({
    where: {
      userId: grant.targetUserId,
      scopeType: "LOCATION",
      scopeId: grant.locationId,
      status: "ACTIVE"
    },
    select: { id: true }
  });
  assertNoActiveDuplicateScope(existing?.id);
  const approvedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const assignment = await createBreakGlassAssignment(tx, {
      targetUserId: grant.targetUserId,
      locationId: grant.locationId,
      accessLevel: grant.accessLevel,
      requestedUntil: grant.requestedUntil
    });
    await tx.breakGlassAccessGrant.update({
      where: { id: grant.id },
      data: {
        status: "ACTIVE",
        assignmentId: assignment.id,
        approvedByUserId: session.user.id,
        approvalReason: values.reason,
        approvedAt
      }
    });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: grant.companyId,
        actorUserId: session.user.id,
        eventType: "break_glass_access.activated",
        entityType: "BreakGlassAccessGrant",
        entityId: grant.id,
        beforeData: { status: "PENDING_REVIEW" },
        afterData: {
          status: "ACTIVE",
          assignmentId: assignment.id,
          requestedUntil: grant.requestedUntil.toISOString()
        },
        metadata: {
          sourceDecisionId: "DEC-0036",
          approvalReason: values.reason,
          targetUserEmail: grant.targetUser.email,
          locationCode: grant.location.code,
          locationType: grant.location.locationType
        }
      }
    });
  });
}

export async function rejectBreakGlassAccess(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageBreakGlass(session);
  const values = reviewBreakGlassAccessSchema.parse(Object.fromEntries(formData));

  const grant = await prisma.breakGlassAccessGrant.findFirst({
    where: {
      id: values.grantId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PENDING_REVIEW"
    }
  });
  if (!grant) {
    throw new Error("BREAK_GLASS_ACCESS_NOT_FOUND");
  }
  if (
    grant.requestedByUserId === session.user.id ||
    grant.targetUserId === session.user.id
  ) {
    throw new Error("BREAK_GLASS_SELF_APPROVAL_BLOCKED");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "break_glass_access.reject",
    permissionCode: permissions.coreAdminister,
    entityType: "BreakGlassAccessGrant",
    entityId: grant.id,
    reason: "Break-glass rejection requires verified privileged MFA evidence.",
    metadata: {
      targetUserId: grant.targetUserId,
      locationId: grant.locationId,
      accessLevel: grant.accessLevel
    }
  });

  await prisma.$transaction(async (tx) => {
    await tx.breakGlassAccessGrant.update({
      where: { id: grant.id },
      data: {
        status: "REJECTED",
        revokedByUserId: session.user.id,
        revocationReason: values.reason,
        revokedAt: new Date()
      }
    });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: grant.companyId,
        actorUserId: session.user.id,
        eventType: "break_glass_access.rejected",
        entityType: "BreakGlassAccessGrant",
        entityId: grant.id,
        beforeData: { status: "PENDING_REVIEW" },
        afterData: { status: "REJECTED" },
        metadata: {
          sourceDecisionId: "DEC-0036",
          reason: values.reason
        }
      }
    });
  });
}

export async function revokeBreakGlassAccess(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageBreakGlass(session);
  const values = reviewBreakGlassAccessSchema.parse(Object.fromEntries(formData));

  const grant = await prisma.breakGlassAccessGrant.findFirst({
    where: {
      id: values.grantId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE"
    }
  });
  if (!grant) {
    throw new Error("BREAK_GLASS_ACCESS_NOT_FOUND");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "break_glass_access.revoke",
    permissionCode: permissions.coreAdminister,
    entityType: "BreakGlassAccessGrant",
    entityId: grant.id,
    reason: "Break-glass revocation requires verified privileged MFA evidence.",
    metadata: {
      targetUserId: grant.targetUserId,
      locationId: grant.locationId,
      accessLevel: grant.accessLevel
    }
  });
  await prisma.$transaction(async (tx) => {
    if (grant.assignmentId) {
      await tx.userScopeAssignment.updateMany({
        where: {
          id: grant.assignmentId,
          userId: grant.targetUserId,
          status: "ACTIVE"
        },
        data: {
          status: "INACTIVE",
          endsAt: new Date()
        }
      });
    }
    await tx.breakGlassAccessGrant.update({
      where: { id: grant.id },
      data: {
        status: "REVOKED",
        revokedByUserId: session.user.id,
        revocationReason: values.reason,
        revokedAt: new Date()
      }
    });
    await touchUserPrivilegeEpoch(tx, grant.targetUserId);
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: grant.companyId,
        actorUserId: session.user.id,
        eventType: "break_glass_access.revoked",
        entityType: "BreakGlassAccessGrant",
        entityId: grant.id,
        beforeData: { status: "ACTIVE", assignmentId: grant.assignmentId },
        afterData: { status: "REVOKED" },
        metadata: {
          sourceDecisionId: "DEC-0036",
          reason: values.reason
        }
      }
    });
  });
}

export async function completeBreakGlassPostReview(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageBreakGlass(session);
  const values = postReviewBreakGlassAccessSchema.parse(
    Object.fromEntries(formData)
  );

  const grant = await prisma.breakGlassAccessGrant.findFirst({
    where: {
      id: values.grantId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: { in: ["REVOKED", "EXPIRED", "REJECTED"] }
    }
  });
  if (!grant) {
    throw new Error("BREAK_GLASS_POST_REVIEW_NOT_READY");
  }
  if (grant.requestedByUserId === session.user.id || grant.targetUserId === session.user.id) {
    throw new Error("BREAK_GLASS_SELF_REVIEW_BLOCKED");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "break_glass_access.post_review",
    permissionCode: permissions.coreAdminister,
    entityType: "BreakGlassAccessGrant",
    entityId: grant.id,
    reason: "Break-glass post-review requires verified privileged MFA evidence.",
    metadata: {
      targetUserId: grant.targetUserId,
      locationId: grant.locationId,
      accessLevel: grant.accessLevel
    }
  });
  await prisma.$transaction(async (tx) => {
    await tx.breakGlassAccessGrant.update({
      where: { id: grant.id },
      data: {
        status: "POST_REVIEWED",
        postReviewedByUserId: session.user.id,
        postReviewOutcome: values.postReviewOutcome,
        postReviewReason: values.postReviewReason,
        postReviewEvidenceReference: values.postReviewEvidenceReference,
        postReviewedAt: new Date()
      }
    });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: grant.companyId,
        actorUserId: session.user.id,
        eventType: "break_glass_access.post_reviewed",
        entityType: "BreakGlassAccessGrant",
        entityId: grant.id,
        beforeData: { status: grant.status },
        afterData: {
          status: "POST_REVIEWED",
          postReviewOutcome: values.postReviewOutcome
        },
        metadata: {
          sourceDecisionId: "DEC-0036",
          postReviewReason: values.postReviewReason,
          postReviewEvidenceReference: values.postReviewEvidenceReference
        }
      }
    });
  });
}
