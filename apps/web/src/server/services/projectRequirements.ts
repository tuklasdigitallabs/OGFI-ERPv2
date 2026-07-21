import { prisma, type Prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import { assertPermissionAllowed, permissions } from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";
import {
  findAuthorizedProject,
  getActiveProjectScopes,
  hasCompanyManageScope,
  listAuthorizedProjectAccess
} from "./projects";
import type { ControlledEvidenceAttachmentRow } from "./attachments";

export type ProjectRequirementKind = "EVIDENCE" | "SIGNOFF";
export type ProjectRequirementStatus =
  | "PENDING"
  | "SUBMITTED"
  | "APPROVED"
  | "RETURNED"
  | "WAIVED"
  | "CANCELLED";
export type ProjectRequirementEvidenceType =
  | "APPROVAL_NOTE"
  | "DOCUMENT"
  | "PHOTO"
  | "SOURCE_RECORD_LINK";

export type ProjectRequirementRow = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  taskId: string | null;
  kind: ProjectRequirementKind;
  code: string;
  label: string;
  evidenceType: string | null;
  signoffStage: string | null;
  evidenceNote: string | null;
  isRequired: boolean;
  ownerUserId: string;
  ownerName: string;
  reviewerUserId: string | null;
  reviewerName: string | null;
  status: ProjectRequirementStatus;
  submittedAt: string | null;
  submittedByName: string | null;
  decisionAt: string | null;
  decidedByName: string | null;
  decisionReason: string | null;
  attachmentCount: number;
  availableAttachmentCount: number;
  evidenceAttachments: ControlledEvidenceAttachmentRow[];
  sourceRecordLinkCount: number;
  version: number;
  canSubmit: boolean;
  canDecide: boolean;
  canReassignReviewer: boolean;
  canResolveException: boolean;
};

const requirementInclude = {
  project: true,
  owner: true,
  reviewer: true,
  submittedBy: true,
  decidedBy: true,
  attachments: {
    where: { status: "ACTIVE" as const, archivedAt: null },
    include: {
      attachment: {
        include: {
          controlledEvidenceLinks: {
            where: { status: "ACTIVE" as const, archivedAt: null }
          }
        }
      }
    }
  },
  recordLinks: {
    where: { archivedAt: null }
  }
} as const satisfies Prisma.ProjectRequirementInclude;

type RequirementWithRelations = Prisma.ProjectRequirementGetPayload<{
  include: typeof requirementInclude;
}>;

const listRequirementSchema = z.object({
  projectId: z.string().uuid().optional(),
  kind: z.enum(["EVIDENCE", "SIGNOFF"]).optional(),
  status: z
    .enum(["PENDING", "SUBMITTED", "APPROVED", "RETURNED", "WAIVED", "CANCELLED"])
    .optional(),
  ownerUserId: z.string().uuid().optional(),
  reviewerUserId: z.string().uuid().optional()
});

const submitRequirementSchema = z.object({
  requirementId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  evidenceNote: z.string().trim().max(2000).optional()
});

const decideRequirementSchema = z.object({
  requirementId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  decision: z.enum(["APPROVED", "RETURNED"]),
  reason: z.string().trim().max(1000).optional()
});

const reassignReviewerSchema = z.object({
  requirementId: z.string().uuid(),
  reviewerUserId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  reason: z.string().trim().min(5).max(1000)
});

const resolveRequirementExceptionSchema = z.object({
  requirementId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  resolution: z.enum(["WAIVED", "CANCELLED"]),
  reason: z.string().trim().min(5).max(1000)
});

type SubmitRequirementInput = z.input<typeof submitRequirementSchema>;
type DecideRequirementInput = z.input<typeof decideRequirementSchema>;
type ReassignReviewerInput = z.input<typeof reassignReviewerSchema>;
type ResolveRequirementExceptionInput = z.input<
  typeof resolveRequirementExceptionSchema
>;

export function mimeMatchesProjectRequirementEvidence(
  evidenceType: "DOCUMENT" | "PHOTO",
  mimeType: string
) {
  const normalized = mimeType.trim().toLowerCase();
  if (evidenceType === "PHOTO") {
    return normalized.startsWith("image/");
  }
  return normalized.startsWith("application/") || normalized.startsWith("text/");
}

export function assertProjectRequirementSubmission(input: {
  status: ProjectRequirementStatus;
  ownerUserId: string;
  actorUserId: string;
  kind: ProjectRequirementKind;
  evidenceType: string | null;
  evidenceNote?: string | null;
  hasMatchingAttachment: boolean;
  hasSourceRecordLink: boolean;
}) {
  if (input.ownerUserId !== input.actorUserId) {
    throw new Error("PROJECT_REQUIREMENT_SUBMISSION_OWNER_REQUIRED");
  }
  if (!(["PENDING", "RETURNED"] as ProjectRequirementStatus[]).includes(input.status)) {
    throw new Error("PROJECT_REQUIREMENT_INVALID_SUBMIT_STATE");
  }
  if (input.kind !== "EVIDENCE") {
    return;
  }
  if (input.evidenceType === "APPROVAL_NOTE" && !input.evidenceNote?.trim()) {
    throw new Error("PROJECT_REQUIREMENT_EVIDENCE_NOTE_REQUIRED");
  }
  if (
    ["DOCUMENT", "PHOTO"].includes(input.evidenceType ?? "") &&
    !input.hasMatchingAttachment
  ) {
    throw new Error("PROJECT_REQUIREMENT_MATCHING_ATTACHMENT_REQUIRED");
  }
  if (input.evidenceType === "SOURCE_RECORD_LINK" && !input.hasSourceRecordLink) {
    throw new Error("PROJECT_REQUIREMENT_SOURCE_RECORD_LINK_REQUIRED");
  }
  if (
    !["APPROVAL_NOTE", "DOCUMENT", "PHOTO", "SOURCE_RECORD_LINK"].includes(
      input.evidenceType ?? ""
    )
  ) {
    throw new Error("PROJECT_REQUIREMENT_EVIDENCE_TYPE_INVALID");
  }
}

export function assertProjectRequirementDecision(input: {
  status: ProjectRequirementStatus;
  reviewerUserId: string | null;
  submittedByUserId: string | null;
  actorUserId: string;
  decision: "APPROVED" | "RETURNED";
  reason?: string | null;
}) {
  if (input.status !== "SUBMITTED") {
    throw new Error("PROJECT_REQUIREMENT_INVALID_DECISION_STATE");
  }
  if (!input.reviewerUserId || input.reviewerUserId !== input.actorUserId) {
    throw new Error("PROJECT_REQUIREMENT_DECISION_REVIEWER_REQUIRED");
  }
  if (input.submittedByUserId === input.actorUserId) {
    throw new Error("PROJECT_REQUIREMENT_SELF_DECISION_DENIED");
  }
  if (input.decision === "RETURNED" && (!input.reason || input.reason.trim().length < 5)) {
    throw new Error("PROJECT_REQUIREMENT_RETURN_REASON_REQUIRED");
  }
}

export function assertProjectRequirementExceptionResolution(input: {
  status: ProjectRequirementStatus;
  isRequired: boolean;
  resolution: "WAIVED" | "CANCELLED";
}) {
  if (!["PENDING", "RETURNED", "SUBMITTED"].includes(input.status)) {
    throw new Error("PROJECT_REQUIREMENT_EXCEPTION_INVALID_STATE");
  }
  if (input.resolution === "CANCELLED" && input.isRequired) {
    throw new Error("PROJECT_REQUIREMENT_REQUIRED_CANCELLATION_DENIED");
  }
}

export function toProjectRequirementRow(
  requirement: RequirementWithRelations,
  session: SessionContext
): ProjectRequirementRow {
  return {
    id: requirement.id,
    projectId: requirement.projectId,
    projectCode: requirement.project.code,
    projectName: requirement.project.name,
    taskId: requirement.taskId,
    kind: requirement.kind as ProjectRequirementKind,
    code: requirement.code,
    label: requirement.label,
    evidenceType: requirement.evidenceType,
    signoffStage: requirement.signoffStage,
    evidenceNote: requirement.evidenceNote,
    isRequired: requirement.isRequired,
    ownerUserId: requirement.ownerUserId,
    ownerName: requirement.owner.displayName,
    reviewerUserId: requirement.reviewerUserId,
    reviewerName: requirement.reviewer?.displayName ?? null,
    status: requirement.status as ProjectRequirementStatus,
    submittedAt: requirement.submittedAt?.toISOString() ?? null,
    submittedByName: requirement.submittedBy?.displayName ?? null,
    decisionAt: requirement.decisionAt?.toISOString() ?? null,
    decidedByName: requirement.decidedBy?.displayName ?? null,
    decisionReason: requirement.decisionReason,
    attachmentCount: requirement.attachments.length,
    availableAttachmentCount: requirement.attachments.filter(
      (projectLink) =>
        projectLink.attachment.uploadState === "VERIFIED" &&
        projectLink.attachment.physicalState === "DURABLE" &&
        projectLink.attachment.scanState === "CLEAN" &&
        projectLink.attachment.availabilityState === "AVAILABLE"
    ).length,
    evidenceAttachments: requirement.attachments.flatMap((projectLink) =>
      projectLink.attachment.controlledEvidenceLinks
        .filter(
          (controlledLink) =>
            controlledLink.sourceType === "PROJECT_REQUIREMENT" &&
            controlledLink.sourceRecordId === requirement.id
        )
        .map((controlledLink) => ({
          id: controlledLink.id,
          sourceType: "PROJECT_REQUIREMENT" as const,
          sourceRecordId: controlledLink.sourceRecordId,
          sourceLineId: controlledLink.sourceLineId,
          sourceKey: controlledLink.sourceKey,
          attachmentId: controlledLink.attachmentId,
          purpose: controlledLink.purpose as ControlledEvidenceAttachmentRow["purpose"],
          caption: controlledLink.caption,
          requiredForAction: controlledLink.requiredForAction,
          legalHold: projectLink.attachment.legalHold,
          originalFilename: projectLink.attachment.originalFilename,
          mimeType: projectLink.attachment.mimeType,
          sizeBytes: projectLink.attachment.sizeBytes,
          storageProvider: projectLink.attachment.storageProvider,
          uploadState: projectLink.attachment.uploadState,
          scanState: projectLink.attachment.scanState,
          availabilityState: projectLink.attachment.availabilityState,
          status: controlledLink.status,
          createdByUserId: controlledLink.createdByUserId,
          createdAt: controlledLink.createdAt.toISOString()
        }))
    ),
    sourceRecordLinkCount: requirement.recordLinks.length,
    version: requirement.version,
    canSubmit:
      requirement.ownerUserId === session.user.id &&
      ["PENDING", "RETURNED"].includes(requirement.status),
    canDecide:
      requirement.status === "SUBMITTED" &&
      requirement.reviewerUserId === session.user.id &&
      requirement.submittedByUserId !== session.user.id,
    canReassignReviewer:
      session.permissionCodes.includes(permissions.projectManage) &&
      ["PENDING", "RETURNED", "SUBMITTED"].includes(requirement.status),
    canResolveException:
      session.permissionCodes.includes(permissions.projectManage) &&
      ["PENDING", "RETURNED", "SUBMITTED"].includes(requirement.status)
  };
}

export async function listProjectRequirements(
  session: SessionContext,
  filters: z.input<typeof listRequirementSchema> = {}
) {
  const values = listRequirementSchema.parse(filters);
  const access = await listAuthorizedProjectAccess(session);
  const projectIds = values.projectId
    ? access.projectIds.filter((projectId) => projectId === values.projectId)
    : access.projectIds;
  if (projectIds.length === 0) {
    return [];
  }

  const requirements = await prisma.projectRequirement.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      projectId: { in: projectIds },
      archivedAt: null,
      ...(values.kind ? { kind: values.kind } : {}),
      ...(values.status ? { status: values.status } : {}),
      ...(values.ownerUserId ? { ownerUserId: values.ownerUserId } : {}),
      ...(values.reviewerUserId ? { reviewerUserId: values.reviewerUserId } : {})
    },
    include: requirementInclude,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }]
  });

  return requirements.map((requirement) =>
    toProjectRequirementRow(requirement as RequirementWithRelations, session)
  );
}

export async function findProjectRequirement(
  session: SessionContext,
  requirementId: string
) {
  const id = z.string().uuid().parse(requirementId);
  const requirement = await prisma.projectRequirement.findFirst({
    where: {
      id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: requirementInclude
  });
  if (!requirement || !(await findAuthorizedProject(session, requirement.projectId))) {
    return null;
  }
  return toProjectRequirementRow(requirement as RequirementWithRelations, session);
}

async function findRequirementForAction(session: SessionContext, requirementId: string) {
  const requirement = await prisma.projectRequirement.findFirst({
    where: {
      id: requirementId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    }
  });
  if (!requirement || !(await findAuthorizedProject(session, requirement.projectId))) {
    throw new Error("PROJECT_REQUIREMENT_NOT_FOUND");
  }
  return requirement;
}

async function assertRequirementControlManageAccess(
  session: SessionContext,
  projectId: string
) {
  assertPermissionAllowed(session.permissionCodes, permissions.projectManage);
  const project = await findAuthorizedProject(session, projectId);
  if (!project) {
    throw new Error("PROJECT_REQUIREMENT_NOT_FOUND");
  }
  const scopes = await getActiveProjectScopes(session);
  const memberRole = project.members.find(
    (member) => member.userId === session.user.id
  )?.projectRole;
  const isEligibleProjectController =
    project.managerUserId === session.user.id ||
    project.sponsorUserId === session.user.id ||
    ["MANAGER", "ADMINISTRATOR"].includes(memberRole ?? "") ||
    hasCompanyManageScope(scopes, session.context.companyId);
  if (!isEligibleProjectController) {
    throw new Error("PROJECT_REQUIREMENT_CONTROL_PERMISSION_DENIED");
  }
}

async function writeRequirementHistory(
  tx: TransactionClient,
  input: {
    requirement: Awaited<ReturnType<typeof findRequirementForAction>>;
    actorUserId: string;
    eventType: string;
    reason?: string | null;
    beforeData: Record<string, string | number | null>;
    afterData: Record<string, string | number | null>;
  }
) {
  const data = {
    tenantId: input.requirement.tenantId,
    companyId: input.requirement.companyId,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    entityType: "ProjectRequirement",
    entityId: input.requirement.id,
    beforeData: input.beforeData,
    afterData: input.afterData,
    metadata: {
      reason: input.reason ?? null,
      projectId: input.requirement.projectId,
      source: "project-requirements"
    }
  };
  await tx.projectActivityEvent.create({
    data: {
      ...data,
      projectId: input.requirement.projectId,
      reason: input.reason ?? null
    }
  });
  await tx.auditEvent.create({ data });
}

export async function submitProjectRequirementForSession(
  session: SessionContext,
  input: SubmitRequirementInput
) {
  const values = submitRequirementSchema.parse(input);
  const requirement = await findRequirementForAction(session, values.requirementId);
  if (requirement.version !== values.expectedVersion) {
    throw new Error("PROJECT_REQUIREMENT_STALE_VERSION");
  }

  // A signoff approves the project's readiness package, so all required
  // checklist lines must be complete before the package can enter review.
  if (requirement.kind === "SIGNOFF") {
    const incompleteRequiredChecklistCount = await prisma.projectTaskChecklistItem.count({
      where: {
        tenantId: requirement.tenantId,
        companyId: requirement.companyId,
        projectId: requirement.projectId,
        archivedAt: null,
        isRequired: true,
        isCompleted: false
      }
    });
    if (incompleteRequiredChecklistCount > 0) {
      throw new Error("PROJECT_REQUIREMENT_CHECKLIST_INCOMPLETE");
    }
  }

  await prisma.$transaction(async (tx) => {
    const [attachments, sourceRecordLinkCount] = await Promise.all([
      tx.projectAttachment.findMany({
        where: {
          tenantId: requirement.tenantId,
          companyId: requirement.companyId,
          projectId: requirement.projectId,
          requirementId: requirement.id,
          status: "ACTIVE",
          archivedAt: null,
          attachment: {
            status: "ACTIVE",
            uploadState: "VERIFIED",
            physicalState: "DURABLE",
            scanState: "CLEAN",
            availabilityState: "AVAILABLE"
          }
        },
        include: { attachment: true }
      }),
      tx.projectRecordLink.count({
        where: {
          tenantId: requirement.tenantId,
          companyId: requirement.companyId,
          projectId: requirement.projectId,
          requirementId: requirement.id,
          archivedAt: null
        }
      })
    ]);
    const evidenceType = requirement.evidenceType as ProjectRequirementEvidenceType | null;
    const hasMatchingAttachment =
      evidenceType === "DOCUMENT" || evidenceType === "PHOTO"
        ? attachments.some((link) =>
            mimeMatchesProjectRequirementEvidence(evidenceType, link.attachment.mimeType)
          )
        : false;
    assertProjectRequirementSubmission({
      status: requirement.status as ProjectRequirementStatus,
      ownerUserId: requirement.ownerUserId,
      actorUserId: session.user.id,
      kind: requirement.kind as ProjectRequirementKind,
      evidenceType,
      evidenceNote: values.evidenceNote ?? requirement.evidenceNote,
      hasMatchingAttachment,
      hasSourceRecordLink: sourceRecordLinkCount > 0
    });

    const updated = await tx.projectRequirement.updateMany({
      where: {
        id: requirement.id,
        tenantId: requirement.tenantId,
        companyId: requirement.companyId,
        projectId: requirement.projectId,
        archivedAt: null,
        status: { in: ["PENDING", "RETURNED"] },
        version: values.expectedVersion
      },
      data: {
        status: "SUBMITTED",
        evidenceNote: values.evidenceNote?.trim() || requirement.evidenceNote,
        submittedAt: new Date(),
        submittedByUserId: session.user.id,
        decisionAt: null,
        decidedByUserId: null,
        decisionReason: null,
        updatedByUserId: session.user.id,
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) {
      throw new Error("PROJECT_REQUIREMENT_STALE_VERSION");
    }
    await writeRequirementHistory(tx, {
      requirement,
      actorUserId: session.user.id,
      eventType: "project_requirement.submitted",
      beforeData: { status: requirement.status, version: requirement.version },
      afterData: { status: "SUBMITTED", version: requirement.version + 1 }
    });
  });
  return requirement.id;
}

export async function decideProjectRequirementForSession(
  session: SessionContext,
  input: DecideRequirementInput
) {
  const values = decideRequirementSchema.parse(input);
  const requirement = await findRequirementForAction(session, values.requirementId);
  if (requirement.version !== values.expectedVersion) {
    throw new Error("PROJECT_REQUIREMENT_STALE_VERSION");
  }
  assertProjectRequirementDecision({
    status: requirement.status as ProjectRequirementStatus,
    reviewerUserId: requirement.reviewerUserId,
    submittedByUserId: requirement.submittedByUserId,
    actorUserId: session.user.id,
    decision: values.decision,
    ...(values.reason !== undefined ? { reason: values.reason } : {})
  });

  await prisma.$transaction(async (tx) => {
    const updated = await tx.projectRequirement.updateMany({
      where: {
        id: requirement.id,
        tenantId: requirement.tenantId,
        companyId: requirement.companyId,
        projectId: requirement.projectId,
        archivedAt: null,
        status: "SUBMITTED",
        reviewerUserId: session.user.id,
        submittedByUserId: { not: session.user.id },
        version: values.expectedVersion
      },
      data: {
        status: values.decision,
        decisionAt: new Date(),
        decidedByUserId: session.user.id,
        decisionReason: values.reason?.trim() || null,
        updatedByUserId: session.user.id,
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) {
      throw new Error("PROJECT_REQUIREMENT_STALE_VERSION");
    }
    await writeRequirementHistory(tx, {
      requirement,
      actorUserId: session.user.id,
      eventType:
        values.decision === "APPROVED"
          ? "project_requirement.approved"
          : "project_requirement.returned",
      ...(values.reason !== undefined ? { reason: values.reason } : {}),
      beforeData: { status: requirement.status, version: requirement.version },
      afterData: { status: values.decision, version: requirement.version + 1 }
    });
  });
  return requirement.id;
}

export async function reassignProjectRequirementReviewerForSession(
  session: SessionContext,
  input: ReassignReviewerInput
) {
  const values = reassignReviewerSchema.parse(input);
  const requirement = await findRequirementForAction(session, values.requirementId);
  await assertRequirementControlManageAccess(session, requirement.projectId);
  if (requirement.version !== values.expectedVersion) {
    throw new Error("PROJECT_REQUIREMENT_STALE_VERSION");
  }
  if (!["PENDING", "RETURNED", "SUBMITTED"].includes(requirement.status)) {
    throw new Error("PROJECT_REQUIREMENT_REASSIGNMENT_INVALID_STATE");
  }
  if (values.reviewerUserId === requirement.reviewerUserId) {
    throw new Error("PROJECT_REQUIREMENT_REVIEWER_UNCHANGED");
  }
  if (values.reviewerUserId === requirement.ownerUserId) {
    throw new Error("PROJECT_REQUIREMENT_SIGNOFF_REVIEWER_MUST_BE_INDEPENDENT");
  }
  const membership = await prisma.projectMember.findFirst({
    where: {
      tenantId: requirement.tenantId,
      companyId: requirement.companyId,
      projectId: requirement.projectId,
      userId: values.reviewerUserId,
      status: "ACTIVE",
      user: { status: "ACTIVE" }
    }
  });
  if (!membership) {
    throw new Error("PROJECT_REQUIREMENT_REVIEWER_NOT_ACTIVE_PROJECT_MEMBER");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.projectRequirement.updateMany({
      where: {
        id: requirement.id,
        tenantId: requirement.tenantId,
        companyId: requirement.companyId,
        projectId: requirement.projectId,
        archivedAt: null,
        version: values.expectedVersion
      },
      data: {
        reviewerUserId: values.reviewerUserId,
        updatedByUserId: session.user.id,
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) {
      throw new Error("PROJECT_REQUIREMENT_STALE_VERSION");
    }
    await writeRequirementHistory(tx, {
      requirement,
      actorUserId: session.user.id,
      eventType: "project_requirement.reviewer_reassigned",
      reason: values.reason,
      beforeData: {
        reviewerUserId: requirement.reviewerUserId,
        version: requirement.version
      },
      afterData: {
        reviewerUserId: values.reviewerUserId,
        version: requirement.version + 1
      }
    });
  });
  return requirement.id;
}

export async function resolveProjectRequirementExceptionForSession(
  session: SessionContext,
  input: ResolveRequirementExceptionInput
) {
  const values = resolveRequirementExceptionSchema.parse(input);
  const requirement = await findRequirementForAction(session, values.requirementId);
  await assertRequirementControlManageAccess(session, requirement.projectId);
  if (requirement.version !== values.expectedVersion) {
    throw new Error("PROJECT_REQUIREMENT_STALE_VERSION");
  }
  assertProjectRequirementExceptionResolution({
    status: requirement.status as ProjectRequirementStatus,
    isRequired: requirement.isRequired,
    resolution: values.resolution
  });

  await prisma.$transaction(async (tx) => {
    const updated = await tx.projectRequirement.updateMany({
      where: {
        id: requirement.id,
        tenantId: requirement.tenantId,
        companyId: requirement.companyId,
        projectId: requirement.projectId,
        archivedAt: null,
        status: { in: ["PENDING", "RETURNED", "SUBMITTED"] },
        version: values.expectedVersion
      },
      data: {
        status: values.resolution,
        decisionAt: new Date(),
        decidedByUserId: session.user.id,
        decisionReason: values.reason,
        updatedByUserId: session.user.id,
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) {
      throw new Error("PROJECT_REQUIREMENT_STALE_VERSION");
    }
    await writeRequirementHistory(tx, {
      requirement,
      actorUserId: session.user.id,
      eventType:
        values.resolution === "WAIVED"
          ? "project_requirement.waived"
          : "project_requirement.cancelled",
      reason: values.reason,
      beforeData: { status: requirement.status, version: requirement.version },
      afterData: { status: values.resolution, version: requirement.version + 1 }
    });
  });
  return requirement.id;
}

export async function submitProjectRequirement(formData: FormData) {
  const session = await requireSessionContext();
  return submitProjectRequirementForSession(session, {
    requirementId: String(formData.get("requirementId") ?? ""),
    expectedVersion: Number(formData.get("expectedVersion")),
    evidenceNote: String(formData.get("evidenceNote") ?? "") || undefined
  });
}

export async function decideProjectRequirement(formData: FormData) {
  const session = await requireSessionContext();
  return decideProjectRequirementForSession(session, {
    requirementId: String(formData.get("requirementId") ?? ""),
    expectedVersion: Number(formData.get("expectedVersion")),
    decision: String(formData.get("decision") ?? "") as "APPROVED" | "RETURNED",
    reason: String(formData.get("reason") ?? "") || undefined
  });
}

export async function reassignProjectRequirementReviewer(formData: FormData) {
  const session = await requireSessionContext();
  return reassignProjectRequirementReviewerForSession(session, {
    requirementId: String(formData.get("requirementId") ?? ""),
    reviewerUserId: String(formData.get("reviewerUserId") ?? ""),
    expectedVersion: Number(formData.get("expectedVersion")),
    reason: String(formData.get("reason") ?? "")
  });
}

export async function resolveProjectRequirementException(formData: FormData) {
  const session = await requireSessionContext();
  return resolveProjectRequirementExceptionForSession(session, {
    requirementId: String(formData.get("requirementId") ?? ""),
    expectedVersion: Number(formData.get("expectedVersion")),
    resolution: String(formData.get("resolution") ?? "") as "WAIVED" | "CANCELLED",
    reason: String(formData.get("reason") ?? "")
  });
}
