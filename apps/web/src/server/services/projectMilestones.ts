import { prisma } from "@ogfi/database";
import { z } from "zod";
import { requireSessionContext, type SessionContext } from "./context";
import { projectDateWindowBounds } from "./projectDates";
import { notifyProjectMilestoneAtRisk } from "./projectNotifications";
import { findAuthorizedProject, listAuthorizedProjectAccess } from "./projects";
import { canMutateProjectWork } from "./projectTasks";

export type ProjectMilestoneStatus = "PLANNED" | "ACHIEVED" | "CANCELLED";
export type ProjectCalendarEventType = "TASK_DUE" | "MILESTONE";

export type ProjectCalendarEvent = {
  id: string;
  type: ProjectCalendarEventType;
  projectId: string;
  projectCode: string;
  projectName: string;
  title: string;
  status: string;
  eventDate: string;
  ownerName: string;
  isAtRisk: boolean;
  href: string;
};

const milestoneStatuses = ["PLANNED", "ACHIEVED", "CANCELLED"] as const;

const createMilestoneSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isAtRisk: z.coerce.boolean().default(false),
  atRiskReason: z.string().trim().max(1000).optional()
});

const transitionMilestoneSchema = z.object({
  milestoneId: z.string().uuid(),
  nextStatus: z.enum(milestoneStatuses),
  expectedVersion: z.coerce.number().int().positive().optional(),
  reason: z.string().trim().max(1000).optional()
});

const calendarSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  projectId: z.string().uuid().optional()
});

export function dateOnlyString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

export function assertMilestoneMutation(input: {
  canMutate: boolean;
  nextStatus?: ProjectMilestoneStatus;
  isAtRisk?: boolean;
  reason?: string | null;
}) {
  if (!input.canMutate) {
    throw new Error("PROJECT_MILESTONE_PERMISSION_DENIED");
  }
  if (input.isAtRisk && (!input.reason || input.reason.trim().length < 5)) {
    throw new Error("PROJECT_MILESTONE_AT_RISK_REASON_REQUIRED");
  }
  if (input.nextStatus === "CANCELLED" && (!input.reason || input.reason.trim().length < 5)) {
    throw new Error("PROJECT_MILESTONE_CANCEL_REASON_REQUIRED");
  }
}

async function getProjectMutationAccess(session: SessionContext, projectId: string) {
  const project = await findAuthorizedProject(session, projectId);
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  const access = await listAuthorizedProjectAccess(session);
  return canMutateProjectWork({
    project,
    userId: session.user.id,
    permissionCodes: session.permissionCodes,
    hasCompanyManage: access.canMutateByProjectId.get(projectId) ?? false
  });
}

export async function listProjectMilestones(session: SessionContext, projectId: string) {
  const access = await listAuthorizedProjectAccess(session);
  if (!access.projectIds.includes(projectId)) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const milestones = await prisma.projectMilestone.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      projectId,
      archivedAt: null
    },
    include: {
      owner: true,
      project: true
    },
    orderBy: [{ status: "asc" }, { targetDate: "asc" }, { targetAt: "asc" }]
  });

  return milestones.map((milestone) => ({
    id: milestone.id,
    projectId: milestone.projectId,
    projectCode: milestone.project.code,
    projectName: milestone.project.name,
    title: milestone.title,
    description: milestone.description,
    status: milestone.status as ProjectMilestoneStatus,
    targetDate: dateOnlyString(milestone.targetDate),
    ownerName: milestone.owner.displayName,
    isAtRisk: milestone.isAtRisk,
    atRiskReason: milestone.atRiskReason,
    version: milestone.version,
    canMutate: access.canMutateByProjectId.get(milestone.projectId) ?? false
  }));
}

export async function listProjectCalendarEvents(
  session: SessionContext,
  filters: z.input<typeof calendarSchema> = {}
) {
  const values = calendarSchema.parse(filters);
  const access = await listAuthorizedProjectAccess(session);
  const authorizedProjectIds = values.projectId
    ? access.projectIds.filter((projectId) => projectId === values.projectId)
    : access.projectIds;

  if (authorizedProjectIds.length === 0) {
    return [];
  }

  const from = values.from ?? new Date().toISOString().slice(0, 10);
  const to =
    values.to ??
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { fromDate, toDateExclusive } = projectDateWindowBounds({ from, to });

  const [tasks, milestones] = await Promise.all([
    prisma.projectTask.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: { in: authorizedProjectIds },
        archivedAt: null,
        dueDate: { gte: fromDate, lt: toDateExclusive },
        status: { notIn: ["CANCELLED"] }
      },
      include: {
        owner: true,
        project: true
      }
    }),
    prisma.projectMilestone.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: { in: authorizedProjectIds },
        archivedAt: null,
        targetDate: { gte: fromDate, lt: toDateExclusive }
      },
      include: {
        owner: true,
        project: true
      }
    })
  ]);

  const taskEvents: ProjectCalendarEvent[] = tasks.flatMap((task) => {
    const eventDate = dateOnlyString(task.dueDate);
    return eventDate
      ? [
          {
            id: task.id,
            type: "TASK_DUE",
            projectId: task.projectId,
            projectCode: task.project.code,
            projectName: task.project.name,
            title: task.title,
            status: task.status,
            eventDate,
            ownerName: task.owner.displayName,
            isAtRisk: task.isBlocked,
            href: `/work-boards?projectId=${task.projectId}`
          } satisfies ProjectCalendarEvent
        ]
      : [];
  });
  const milestoneEvents: ProjectCalendarEvent[] = milestones.flatMap((milestone) => {
    const eventDate = dateOnlyString(milestone.targetDate);
    return eventDate
      ? [
          {
            id: milestone.id,
            type: "MILESTONE",
            projectId: milestone.projectId,
            projectCode: milestone.project.code,
            projectName: milestone.project.name,
            title: milestone.title,
            status: milestone.status,
            eventDate,
            ownerName: milestone.owner.displayName,
            isAtRisk: milestone.isAtRisk,
            href: `/work-calendar?projectId=${milestone.projectId}`
          } satisfies ProjectCalendarEvent
        ]
      : [];
  });

  return [...taskEvents, ...milestoneEvents].sort((a, b) =>
    a.eventDate.localeCompare(b.eventDate)
  );
}

export async function createProjectMilestone(formData: FormData) {
  const session = await requireSessionContext();
  const values = createMilestoneSchema.parse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    description: formData.get("description"),
    targetDate: formData.get("targetDate"),
    isAtRisk: formData.get("isAtRisk") === "on",
    atRiskReason: formData.get("atRiskReason")
  });
  const canMutate = await getProjectMutationAccess(session, values.projectId);
  const project = await findAuthorizedProject(session, values.projectId);
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  const atRiskReason = values.atRiskReason ?? null;
  assertMilestoneMutation({
    canMutate,
    isAtRisk: values.isAtRisk,
    reason: atRiskReason
  });

  const milestone = await prisma.$transaction(async (tx) => {
    const created = await tx.projectMilestone.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        title: values.title,
        description: values.description || null,
        targetDate: new Date(values.targetDate),
        ownerUserId: session.user.id,
        isAtRisk: values.isAtRisk,
        atRiskReason: values.isAtRisk ? atRiskReason : null,
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
        eventType: "project_milestone.created",
        entityType: "ProjectMilestone",
        entityId: created.id,
        afterData: {
          title: created.title,
          status: created.status,
          targetDate: dateOnlyString(created.targetDate),
          isAtRisk: created.isAtRisk
        },
        metadata: { source: "project-milestone-calendar-foundation" }
      }
    });

    if (created.isAtRisk) {
      await notifyProjectMilestoneAtRisk(tx, {
        project,
        milestone: {
          id: created.id,
          title: created.title,
          ownerUserId: created.ownerUserId,
          targetDate: created.targetDate,
          version: created.version
        }
      });
    }

    return created;
  });

  return milestone.id;
}

export async function transitionProjectMilestone(formData: FormData) {
  const session = await requireSessionContext();
  const values = transitionMilestoneSchema.parse({
    milestoneId: formData.get("milestoneId"),
    nextStatus: formData.get("nextStatus"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    reason: formData.get("reason")
  });
  const milestone = await prisma.projectMilestone.findFirst({
    where: {
      id: values.milestoneId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    }
  });
  if (!milestone) {
    throw new Error("PROJECT_MILESTONE_NOT_FOUND");
  }
  if (values.expectedVersion && milestone.version !== values.expectedVersion) {
    throw new Error("PROJECT_MILESTONE_STALE_VERSION");
  }
  const canMutate = await getProjectMutationAccess(session, milestone.projectId);
  const reason = values.reason ?? null;
  assertMilestoneMutation({
    canMutate,
    nextStatus: values.nextStatus,
    reason
  });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.projectMilestone.updateMany({
      where: {
        id: milestone.id,
        ...(values.expectedVersion ? { version: values.expectedVersion } : {})
      },
      data: {
        status: values.nextStatus,
        achievedAt: values.nextStatus === "ACHIEVED" ? now : null,
        achievedByUserId: values.nextStatus === "ACHIEVED" ? session.user.id : null,
        cancelledAt: values.nextStatus === "CANCELLED" ? now : null,
        cancelledByUserId: values.nextStatus === "CANCELLED" ? session.user.id : null,
        cancelReason: values.nextStatus === "CANCELLED" ? reason : null,
        updatedByUserId: session.user.id,
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) {
      throw new Error("PROJECT_MILESTONE_STALE_VERSION");
    }

    await tx.projectActivityEvent.create({
      data: {
        tenantId: milestone.tenantId,
        companyId: milestone.companyId,
        projectId: milestone.projectId,
        actorUserId: session.user.id,
        eventType: "project_milestone.status_changed",
        entityType: "ProjectMilestone",
        entityId: milestone.id,
        reason,
        beforeData: {
          status: milestone.status,
          targetDate: dateOnlyString(milestone.targetDate),
          isAtRisk: milestone.isAtRisk
        },
        afterData: {
          status: values.nextStatus,
          targetDate: dateOnlyString(milestone.targetDate),
          isAtRisk: milestone.isAtRisk,
          version: milestone.version + 1
        },
        metadata: { source: "project-milestone-calendar-foundation" }
      }
    });
  });
}
