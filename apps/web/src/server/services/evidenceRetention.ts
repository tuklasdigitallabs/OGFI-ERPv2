import { prisma } from "@ogfi/database";
import { z } from "zod";
import type { SessionContext } from "./context";
import { requireSessionContext } from "./context";
import {
  permissions,
  requireActiveScopeAssignment,
  requirePermission,
} from "./authorization";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";

export const setEvidenceLegalHoldSchema = z.object({
  attachmentId: z.string().uuid(),
  expectedRowVersion: z.number().int().positive(),
  authority: z.string().trim().min(3).max(200),
  caseReference: z.string().trim().min(2).max(200),
  reason: z.string().trim().min(5).max(1000),
});

export const evidenceRetentionRegisterQuerySchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  heldOnly: z.boolean().default(false),
});

type EvidenceLegalHoldIdentity = {
  authority: string;
  caseReference: string;
  reason: string;
};

type CurrentEvidenceLegalHold = {
  legalHold: boolean;
  legalHoldAuthority: string | null;
  legalHoldCaseReference: string | null;
  legalHoldReason: string | null;
};

export function isSameEvidenceLegalHold(
  current: CurrentEvidenceLegalHold,
  requested: EvidenceLegalHoldIdentity,
) {
  return (
    current.legalHold &&
    current.legalHoldAuthority === requested.authority &&
    current.legalHoldCaseReference === requested.caseReference &&
    current.legalHoldReason === requested.reason
  );
}

function assertCompanyContext(session: SessionContext) {
  const { tenantId, companyId } = session.context;
  if (!tenantId || !companyId) throw new Error("COMPANY_CONTEXT_REQUIRED");
  return { tenantId, companyId };
}

function legalHoldResult(
  attachment: {
    id: string;
    legalHold: boolean;
    legalHoldSetAt: Date | null;
    legalHoldSetByUserId: string | null;
    legalHoldAuthority: string | null;
    legalHoldCaseReference: string | null;
    legalHoldReason: string | null;
    rowVersion: number;
  },
  outcome: "PLACED" | "UNCHANGED",
) {
  return {
    attachmentId: attachment.id,
    outcome,
    legalHold: attachment.legalHold,
    legalHoldSetAt: attachment.legalHoldSetAt,
    legalHoldSetByUserId: attachment.legalHoldSetByUserId,
    authority: attachment.legalHoldAuthority,
    caseReference: attachment.legalHoldCaseReference,
    reason: attachment.legalHoldReason,
    rowVersion: attachment.rowVersion,
  };
}

export async function setEvidenceLegalHold(input: unknown) {
  const session = await requireSessionContext();
  return setEvidenceLegalHoldForSession(session, input);
}

export async function setEvidenceLegalHoldForSession(
  session: SessionContext,
  input: unknown,
) {
  const scope = assertCompanyContext(session);
  await requirePermission(session, permissions.evidenceLegalHoldSet);
  await requireActiveScopeAssignment(session, {
    scopeType: "COMPANY",
    scopeId: scope.companyId,
  });
  const values = setEvidenceLegalHoldSchema.parse(input);
  const requested = {
    authority: values.authority,
    caseReference: values.caseReference,
    reason: values.reason,
  };

  await assertPrivilegedMfaForAction(session, {
    action: "evidence.legal_hold.set",
    permissionCode: permissions.evidenceLegalHoldSet,
    enforcementScope: "admin_security",
    entityType: "Attachment",
    entityId: values.attachmentId,
    reason:
      "Legal-hold placement is a preservation control and requires current privileged MFA assurance.",
    metadata: {
      sourceDecisionId: "DEC-0046",
      caseReference: requested.caseReference,
    },
  });

  const current = await prisma.attachment.findFirst({
    where: {
      id: values.attachmentId,
      tenantId: scope.tenantId,
      companyId: scope.companyId,
    },
    select: {
      id: true,
      legalHold: true,
      legalHoldSetAt: true,
      legalHoldSetByUserId: true,
      legalHoldAuthority: true,
      legalHoldCaseReference: true,
      legalHoldReason: true,
      physicalState: true,
      purgedAt: true,
      rowVersion: true,
    },
  });
  if (!current) throw new Error("EVIDENCE_ATTACHMENT_NOT_FOUND");
  if (isSameEvidenceLegalHold(current, requested)) {
    return legalHoldResult(current, "UNCHANGED");
  }
  if (current.legalHold) throw new Error("EVIDENCE_LEGAL_HOLD_CONFLICT");
  if (current.physicalState === "PURGED" || current.purgedAt) {
    throw new Error("EVIDENCE_LEGAL_HOLD_BYTES_NOT_PRESERVABLE");
  }
  if (current.rowVersion !== values.expectedRowVersion) {
    throw new Error("EVIDENCE_LEGAL_HOLD_CONCURRENT_CHANGE");
  }

  return prisma.$transaction(async (tx) => {
    const heldAt = new Date();
    const changed = await tx.attachment.updateMany({
      where: {
        id: current.id,
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        legalHold: false,
        rowVersion: values.expectedRowVersion,
        purgedAt: null,
        NOT: { physicalState: "PURGED" },
      },
      data: {
        legalHold: true,
        legalHoldSetAt: heldAt,
        legalHoldSetByUserId: session.user.id,
        legalHoldAuthority: requested.authority,
        legalHoldCaseReference: requested.caseReference,
        legalHoldReason: requested.reason,
        rowVersion: { increment: 1 },
      },
    });

    const saved = await tx.attachment.findFirst({
      where: {
        id: current.id,
        tenantId: scope.tenantId,
        companyId: scope.companyId,
      },
      select: {
        id: true,
        legalHold: true,
        legalHoldSetAt: true,
        legalHoldSetByUserId: true,
        legalHoldAuthority: true,
        legalHoldCaseReference: true,
        legalHoldReason: true,
        rowVersion: true,
      },
    });
    if (!saved) throw new Error("EVIDENCE_ATTACHMENT_NOT_FOUND");
    if (changed.count === 0) {
      if (isSameEvidenceLegalHold(saved, requested)) {
        return legalHoldResult(saved, "UNCHANGED");
      }
      throw new Error("EVIDENCE_LEGAL_HOLD_CONCURRENT_CHANGE");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        actorUserId: session.user.id,
        eventType: "evidence.legal_hold.placed",
        entityType: "Attachment",
        entityId: saved.id,
        beforeData: {
          legalHold: false,
          rowVersion: current.rowVersion,
        },
        afterData: {
          legalHold: true,
          legalHoldSetAt: saved.legalHoldSetAt?.toISOString() ?? null,
          legalHoldSetByUserId: saved.legalHoldSetByUserId,
          legalHoldAuthority: saved.legalHoldAuthority,
          legalHoldCaseReference: saved.legalHoldCaseReference,
          legalHoldReason: saved.legalHoldReason,
          rowVersion: saved.rowVersion,
        },
        metadata: {
          sourceDecisionId: "DEC-0046",
          preservationOnly: true,
          holdReleaseSupported: false,
          physicalPurgeSupported: false,
        },
      },
    });

    return legalHoldResult(saved, "PLACED");
  });
}

export async function listEvidenceRetentionRegister(input: unknown = {}) {
  const session = await requireSessionContext();
  return listEvidenceRetentionRegisterForSession(session, input);
}

export async function listEvidenceRetentionRegisterForSession(
  session: SessionContext,
  input: unknown = {},
) {
  const scope = assertCompanyContext(session);
  // This register is intentionally a dedicated company-admin boundary. Generic
  // source viewers cannot use it to enumerate confidential evidence metadata.
  await requirePermission(session, permissions.evidenceRetentionView);
  await requireActiveScopeAssignment(session, {
    scopeType: "COMPANY",
    scopeId: scope.companyId,
  });
  const values = evidenceRetentionRegisterQuerySchema.parse(input);
  const where = {
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    ...(values.heldOnly ? { legalHold: true } : {}),
  };

  const [totalCount, rows] = await prisma.$transaction([
    prisma.attachment.count({ where }),
    prisma.attachment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (values.page - 1) * values.pageSize,
      take: values.pageSize,
      select: {
        id: true,
        createdAt: true,
        status: true,
        uploadState: true,
        scanState: true,
        availabilityState: true,
        physicalState: true,
        sizeBytes: true,
        mimeType: true,
        retentionClass: true,
        retainUntil: true,
        legalHold: true,
        legalHoldSetAt: true,
        legalHoldSetByUserId: true,
        legalHoldAuthority: true,
        legalHoldCaseReference: true,
        legalHoldReason: true,
        rowVersion: true,
        controlledEvidenceLinks: {
          select: {
            sourceType: true,
            sourceRecordId: true,
            sourceLineId: true,
            purpose: true,
            requiredForAction: true,
            status: true,
            archivedAt: true,
          },
        },
        projectLinks: {
          select: {
            projectId: true,
            taskId: true,
            requirementId: true,
            purpose: true,
            status: true,
            archivedAt: true,
          },
        },
      },
    }),
  ]);

  return {
    rows,
    page: values.page,
    pageSize: values.pageSize,
    totalCount,
    totalPages: Math.ceil(totalCount / values.pageSize),
    confidentialityBoundary: permissions.evidenceRetentionView,
    includesFileBytes: false as const,
  };
}
