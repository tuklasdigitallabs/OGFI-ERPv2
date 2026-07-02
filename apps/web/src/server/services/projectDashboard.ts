import { prisma } from "@ogfi/database";
import type { SessionContext } from "./context";
import { dateOnlyString, isProjectTaskOverdue } from "./projectDates";
import { listAuthorizedProjectAccess } from "./projects";

export type ProjectHealthCard = {
  projectId: string;
  code: string;
  name: string;
  status: string;
  managerName: string;
  targetDate: string | null;
  taskCount: number;
  completedTaskCount: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  linkedRecordCount: number;
  nextMilestoneTitle: string | null;
  nextMilestoneDate: string | null;
  isAtRisk: boolean;
};

export type ProjectDashboardSummary = {
  projectCount: number;
  activeProjectCount: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  atRiskMilestoneCount: number;
  linkedRecordCount: number;
  recentActivity: Array<{
    id: string;
    projectId: string;
    projectName: string;
    eventType: string;
    actorName: string;
    occurredAt: string;
  }>;
  projects: ProjectHealthCard[];
};

export async function getProjectDashboard(session: SessionContext) {
  const access = await listAuthorizedProjectAccess(session);
  if (access.projectIds.length === 0) {
    return {
      projectCount: 0,
      activeProjectCount: 0,
      overdueTaskCount: 0,
      blockedTaskCount: 0,
      atRiskMilestoneCount: 0,
      linkedRecordCount: 0,
      recentActivity: [],
      projects: []
    } satisfies ProjectDashboardSummary;
  }

  const today = new Date();
  const [projects, recentActivity] = await Promise.all([
    prisma.project.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        id: { in: access.projectIds },
        archivedAt: null
      },
      include: {
        manager: true,
        tasks: {
          where: { archivedAt: null },
          include: {
            recordLinks: {
              where: { archivedAt: null },
              select: { id: true }
            }
          }
        },
        milestones: {
          where: { archivedAt: null },
          orderBy: [{ targetDate: "asc" }, { targetAt: "asc" }]
        },
        recordLinks: {
          where: { archivedAt: null },
          select: { id: true }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.projectActivityEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: { in: access.projectIds }
      },
      include: {
        actor: true,
        project: true
      },
      orderBy: { occurredAt: "desc" },
      take: 10
    })
  ]);

  const healthCards = projects.map((project): ProjectHealthCard => {
    const activeTasks = project.tasks.filter((task) => task.status !== "CANCELLED");
    const completedTasks = activeTasks.filter((task) => task.status === "COMPLETED");
    const overdueTasks = activeTasks.filter(
      (task) =>
        isProjectTaskOverdue({
          dueDate: task.dueDate,
          dueAt: task.dueAt,
          status: task.status,
          asOf: today
        })
    );
    const blockedTasks = activeTasks.filter((task) => task.status === "BLOCKED");
    const nextMilestone =
      project.milestones.find((milestone) => milestone.status === "PLANNED") ?? null;
    const taskLinkCount = project.tasks.reduce(
      (total, task) => total + task.recordLinks.length,
      0
    );

    return {
      projectId: project.id,
      code: project.code,
      name: project.name,
      status: project.status,
      managerName: project.manager.displayName,
      targetDate: dateOnlyString(project.targetEndDate ?? project.targetEndAt),
      taskCount: activeTasks.length,
      completedTaskCount: completedTasks.length,
      overdueTaskCount: overdueTasks.length,
      blockedTaskCount: blockedTasks.length,
      linkedRecordCount: project.recordLinks.length + taskLinkCount,
      nextMilestoneTitle: nextMilestone?.title ?? null,
      nextMilestoneDate: dateOnlyString(nextMilestone?.targetDate ?? nextMilestone?.targetAt ?? null),
      isAtRisk:
        blockedTasks.length > 0 ||
        overdueTasks.some((task) => task.priority === "CRITICAL") ||
        project.milestones.some((milestone) => milestone.isAtRisk)
    };
  });

  return {
    projectCount: healthCards.length,
    activeProjectCount: healthCards.filter((project) => project.status === "ACTIVE").length,
    overdueTaskCount: healthCards.reduce((total, project) => total + project.overdueTaskCount, 0),
    blockedTaskCount: healthCards.reduce((total, project) => total + project.blockedTaskCount, 0),
    atRiskMilestoneCount: projects.reduce(
      (total, project) =>
        total + project.milestones.filter((milestone) => milestone.isAtRisk).length,
      0
    ),
    linkedRecordCount: healthCards.reduce((total, project) => total + project.linkedRecordCount, 0),
    recentActivity: recentActivity.map((event) => ({
      id: event.id,
      projectId: event.projectId,
      projectName: event.project.name,
      eventType: event.eventType,
      actorName: event.actor.displayName,
      occurredAt: event.occurredAt.toISOString()
    })),
    projects: healthCards
  } satisfies ProjectDashboardSummary;
}
