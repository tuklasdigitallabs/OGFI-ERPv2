import { prisma } from "@ogfi/database";
import { z } from "zod";
import { permissions } from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";
import { notifyProjectRiskElevated } from "./projectNotifications";
import { canMutateProjectWork } from "./projectTasks";
import {
  findAuthorizedProject,
  getActiveProjectScopes,
  hasCompanyManageScope,
  listAuthorizedProjectAccess
} from "./projects";

const riskStatuses = [
  "OPEN",
  "MITIGATING",
  "MITIGATED",
  "ACCEPTED",
  "REALIZED",
  "CLOSED",
  "CANCELLED"
] as const;

const riskRatings = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export type ProjectRiskStatus = (typeof riskStatuses)[number];
export type ProjectRiskRating = (typeof riskRatings)[number];

export type ProjectRiskCard = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  title: string;
  description: string | null;
  category: string;
  likelihood: ProjectRiskRating;
  impact: ProjectRiskRating;
  severity: ProjectRiskRating;
  status: ProjectRiskStatus;
  ownerName: string;
  targetMitigationDate: string | null;
  mitigationPlan: string | null;
  resolutionNote: string | null;
  version: number;
  createdAt: string;
  canMutate: boolean;
  canResolve: boolean;
};

const optionalUuidSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .pipe(z.string().uuid().optional());

const optionalDateSchema = z
  .string()
  .optional()
  .transform((value) => (value ? new Date(value) : undefined));

const createRiskSchema = z.object({
  projectId: z.string().uuid(),
  taskId: optionalUuidSchema,
  milestoneId: optionalUuidSchema,
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().min(2).max(80),
  likelihood: z.enum(riskRatings),
  impact: z.enum(riskRatings),
  targetMitigationDate: optionalDateSchema,
  mitigationPlan: z.string().trim().max(2000).optional()
});

const transitionRiskSchema = z.object({
  riskId: z.string().uuid(),
  nextStatus: z.enum(riskStatuses),
  expectedVersion: z.coerce.number().int().positive().optional(),
  mitigationPlan: z.string().trim().max(2000).optional(),
  resolutionNote: z.string().trim().max(2000).optional()
});

const ratingWeight: Record<ProjectRiskRating, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

export function deriveProjectRiskSeverity(
  likelihood: ProjectRiskRating,
  impact: ProjectRiskRating
): ProjectRiskRating {
  const score = ratingWeight[likelihood] * ratingWeight[impact];
  if (score >= 12) {
    return "CRITICAL";
  }
  if (score >= 6) {
    return "HIGH";
  }
  if (score >= 3) {
    return "MEDIUM";
  }
  return "LOW";
}

export function assertProjectRiskContext(input: {
  taskId?: string | undefined;
  milestoneId?: string | undefined;
}) {
  if (input.taskId && input.milestoneId) {
    throw new Error("PROJECT_RISK_CONTEXT_INVALID");
  }
}

export function assertProjectRiskCreation(input: {
  severity: ProjectRiskRating;
  targetMitigationDate?: Date | undefined;
}) {
  if (
    ["HIGH", "CRITICAL"].includes(input.severity) &&
    !input.targetMitigationDate
  ) {
    throw new Error("PROJECT_RISK_TARGET_DATE_REQUIRED");
  }
}

export function assertProjectRiskTransition(input: {
  currentStatus: ProjectRiskStatus;
  nextStatus: ProjectRiskStatus;
  canMutate: boolean;
  canResolve: boolean;
  resolutionNote?: string | undefined;
}) {
  if (!input.canMutate) {
    throw new Error("PROJECT_RISK_PERMISSION_DENIED");
  }
  if (["CLOSED", "CANCELLED"].includes(input.currentStatus)) {
    if (input.nextStatus !== "OPEN") {
      throw new Error("PROJECT_RISK_TERMINAL_STATUS");
    }
    if (!input.resolutionNote || input.resolutionNote.trim().length < 5) {
      throw new Error("PROJECT_RISK_REOPEN_REASON_REQUIRED");
    }
  }
  if (
    ["MITIGATED", "ACCEPTED", "REALIZED", "CLOSED", "CANCELLED"].includes(
      input.nextStatus
    )
  ) {
    if (!input.canResolve) {
      throw new Error("PROJECT_RISK_RESOLVE_PERMISSION_DENIED");
    }
    if (!input.resolutionNote || input.resolutionNote.trim().length < 5) {
      throw new Error("PROJECT_RISK_RESOLUTION_NOTE_REQUIRED");
    }
  }
}

async function getRiskProjectMutationAccess(session: SessionContext, projectId: string) {
  const project = await findAuthorizedProject(session, projectId);
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  const scopes = await getActiveProjectScopes(session);
  const hasCompanyManage = hasCompanyManageScope(scopes, session.context.companyId);
  return canMutateProjectWork({
    project,
    userId: session.user.id,
    permissionCodes: session.permissionCodes,
    hasCompanyManage
  });
}

async function assertRiskContextExists(
  session: SessionContext,
  values: {
    projectId: string;
    taskId?: string | undefined;
    milestoneId?: string | undefined;
  }
) {
  assertProjectRiskContext(values);
  if (values.taskId) {
    const task = await prisma.projectTask.findFirst({
      where: {
        id: values.taskId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        archivedAt: null
      },
      select: { id: true }
    });
    if (!task) {
      throw new Error("PROJECT_RISK_CONTEXT_INVALID");
    }
  }
  if (values.milestoneId) {
    const milestone = await prisma.projectMilestone.findFirst({
      where: {
        id: values.milestoneId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        archivedAt: null
      },
      select: { id: true }
    });
    if (!milestone) {
      throw new Error("PROJECT_RISK_CONTEXT_INVALID");
    }
  }
}

export async function listProjectRisks(session: SessionContext) {
  const access = await listAuthorizedProjectAccess(session);
  if (access.projectIds.length === 0) {
    return [];
  }
  const risks = await prisma.projectRisk.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      projectId: { in: access.projectIds },
      archivedAt: null
    },
    include: {
      project: true,
      owner: true
    },
    orderBy: [{ severity: "desc" }, { targetMitigationDate: "asc" }, { createdAt: "desc" }]
  });

  return risks.map((risk): ProjectRiskCard => ({
    id: risk.id,
    projectId: risk.projectId,
    projectCode: risk.project.code,
    projectName: risk.project.name,
    title: risk.title,
    description: risk.description,
    category: risk.category,
    likelihood: risk.likelihood,
    impact: risk.impact,
    severity: risk.severity,
    status: risk.status,
    ownerName: risk.owner.displayName,
    targetMitigationDate: risk.targetMitigationDate?.toISOString().slice(0, 10) ?? null,
    mitigationPlan: risk.mitigationPlan,
    resolutionNote: risk.resolutionNote,
    version: risk.version,
    createdAt: risk.createdAt.toISOString(),
    canMutate: access.canMutateByProjectId.get(risk.projectId) ?? false,
    canResolve:
      (access.canMutateByProjectId.get(risk.projectId) ?? false) &&
      session.permissionCodes.includes(permissions.projectRiskResolve)
  }));
}

export async function createProjectRisk(formData: FormData) {
  const session = await requireSessionContext();
  if (!session.permissionCodes.includes(permissions.projectRiskCreate)) {
    throw new Error("PROJECT_RISK_PERMISSION_DENIED");
  }
  const values = createRiskSchema.parse({
    projectId: formData.get("projectId"),
    taskId: formData.get("taskId") || undefined,
    milestoneId: formData.get("milestoneId") || undefined,
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    likelihood: formData.get("likelihood"),
    impact: formData.get("impact"),
    targetMitigationDate: formData.get("targetMitigationDate"),
    mitigationPlan: formData.get("mitigationPlan")
  });
  await assertRiskContextExists(session, values);
  const canMutate = await getRiskProjectMutationAccess(session, values.projectId);
  if (!canMutate) {
    throw new Error("PROJECT_RISK_PERMISSION_DENIED");
  }
  const severity = deriveProjectRiskSeverity(values.likelihood, values.impact);
  assertProjectRiskCreation({
    severity,
    targetMitigationDate: values.targetMitigationDate
  });
  const project = await prisma.project.findFirst({
    where: {
      id: values.projectId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    select: {
      id: true,
      tenantId: true,
      companyId: true,
      locationId: true,
      code: true,
      name: true,
      isRestricted: true,
      managerUserId: true,
      sponsorUserId: true
    }
  });
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const created = await prisma.$transaction(async (tx) => {
    const risk = await tx.projectRisk.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        taskId: values.taskId ?? null,
        milestoneId: values.milestoneId ?? null,
        title: values.title,
        description: values.description || null,
        category: values.category,
        likelihood: values.likelihood,
        impact: values.impact,
        severity,
        ownerUserId: session.user.id,
        targetMitigationDate: values.targetMitigationDate ?? null,
        mitigationPlan: values.mitigationPlan || null,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id
      }
    });
    await tx.projectActivityEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        actorUserId: session.user.id,
        eventType: "project_risk.created",
        entityType: "ProjectRisk",
        entityId: risk.id,
        afterData: {
          title: risk.title,
          category: risk.category,
          severity: risk.severity,
          status: risk.status
        },
        metadata: { source: "project-risk-foundation" }
      }
    });
    await notifyProjectRiskElevated(tx, {
      project,
      risk: {
        id: risk.id,
        ownerUserId: risk.ownerUserId,
        severity: risk.severity,
        version: risk.version
      }
    });
    return risk;
  });

  return created.id;
}

export async function transitionProjectRisk(formData: FormData) {
  const session = await requireSessionContext();
  const values = transitionRiskSchema.parse({
    riskId: formData.get("riskId"),
    nextStatus: formData.get("nextStatus"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    mitigationPlan: formData.get("mitigationPlan"),
    resolutionNote: formData.get("resolutionNote")
  });
  const risk = await prisma.projectRisk.findFirst({
    where: {
      id: values.riskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    }
  });
  if (!risk) {
    throw new Error("PROJECT_RISK_NOT_FOUND");
  }
  if (values.expectedVersion && risk.version !== values.expectedVersion) {
    throw new Error("PROJECT_RISK_STALE_VERSION");
  }
  const canMutate =
    session.permissionCodes.includes(permissions.projectRiskUpdate) &&
    (await getRiskProjectMutationAccess(session, risk.projectId));
  const canResolve = session.permissionCodes.includes(permissions.projectRiskResolve);
  assertProjectRiskTransition({
    currentStatus: risk.status,
    nextStatus: values.nextStatus,
    canMutate,
    canResolve,
    resolutionNote: values.resolutionNote
  });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const terminal = ["MITIGATED", "ACCEPTED", "REALIZED", "CLOSED", "CANCELLED"].includes(
      values.nextStatus
    );
    const updated = await tx.projectRisk.updateMany({
      where: {
        id: risk.id,
        ...(values.expectedVersion ? { version: values.expectedVersion } : {})
      },
      data: {
        status: values.nextStatus,
        mitigationPlan: values.mitigationPlan || risk.mitigationPlan,
        resolvedAt: terminal ? now : null,
        resolvedByUserId: terminal ? session.user.id : null,
        resolutionNote: terminal ? values.resolutionNote ?? null : null,
        lastReopenedAt:
          values.nextStatus === "OPEN" && ["CLOSED", "CANCELLED"].includes(risk.status)
            ? now
            : risk.lastReopenedAt,
        lastReopenReason:
          values.nextStatus === "OPEN" && ["CLOSED", "CANCELLED"].includes(risk.status)
            ? values.resolutionNote ?? null
            : risk.lastReopenReason,
        updatedByUserId: session.user.id,
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) {
      throw new Error("PROJECT_RISK_STALE_VERSION");
    }
    await tx.projectActivityEvent.create({
      data: {
        tenantId: risk.tenantId,
        companyId: risk.companyId,
        projectId: risk.projectId,
        actorUserId: session.user.id,
        eventType: "project_risk.status_changed",
        entityType: "ProjectRisk",
        entityId: risk.id,
        reason: values.resolutionNote || values.mitigationPlan || null,
        beforeData: { status: risk.status },
        afterData: { status: values.nextStatus, version: risk.version + 1 },
        metadata: { source: "project-risk-foundation" }
      }
    });
  });
}
