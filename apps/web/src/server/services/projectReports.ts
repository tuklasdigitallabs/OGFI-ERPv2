import { prisma } from "@ogfi/database";
import type { CsvRow } from "./csv";
import { canUseProjects, getGrantedPermissionCodes } from "./authorization";
import { getExportFailureReasonCode } from "./exportErrors";
import { assertReportExportScopeFilters } from "./exportAudit";
import { getProjectDashboard } from "./projectDashboard";
import type { SessionContext } from "./context";
import { projectTaskDueDateString, projectTaskDueState } from "./projectDates";
import {
  assertSafeSourceSummary,
  resolveProjectRecordLinkSourceSummary,
  type ProjectLinkSourceRecordType
} from "./projectRecordLinks";
import { listAuthorizedProjectAccess } from "./projects";
import { getReportExportPolicy } from "./policySettings";

const projectExportAttempts = new Map<string, number[]>();
const projectExportWindowMs = 60_000;
const maxProjectExportsPerWindow = 5;

async function canExportProjectsLive(session: SessionContext) {
  return canUseProjects(await getGrantedPermissionCodes(session));
}

function pruneProjectExportAttempts(now: number, attempts: number[]) {
  return attempts.filter((attemptedAt) => now - attemptedAt < projectExportWindowMs);
}

export function assertProjectExportThrottle(session: SessionContext, now = Date.now()) {
  const key = `${session.context.tenantId}:${session.context.companyId}:${session.user.id}`;
  const attempts = pruneProjectExportAttempts(
    now,
    projectExportAttempts.get(key) ?? []
  );
  if (attempts.length >= maxProjectExportsPerWindow) {
    throw new Error("PROJECT_EXPORT_RATE_LIMITED");
  }
  attempts.push(now);
  projectExportAttempts.set(key, attempts);
}

export async function logProjectExportAudit(input: {
  session: SessionContext;
  eventType:
    | "project_report.export_denied"
    | "project_report.export_started"
    | "project_report.export_completed"
    | "project_report.export_failed";
  reportId?:
    | "project-health"
    | "project-task-register"
    | "project-activity-log"
    | "project-linked-record-follow-up";
  rowCount?: number;
  reasonCode?: string;
}) {
  const exportPolicy =
    input.eventType === "project_report.export_started"
      ? await assertReportExportScopeFilters(input.session)
      : await getReportExportPolicy(input.session);
  await prisma.auditEvent.create({
    data: {
      tenantId: input.session.context.tenantId,
      companyId: input.session.context.companyId,
      actorUserId: input.session.user.id,
      eventType: input.eventType,
      entityType: "Company",
      entityId: input.session.context.companyId,
      metadata: {
        reportId: input.reportId ?? "project-health",
        rowCount: input.rowCount ?? null,
        reasonCode: input.reasonCode ?? null,
        companyId: input.session.context.companyId,
        companyName: input.session.context.companyName,
        brandId: input.session.context.brandId,
        brandName: input.session.context.brandName,
        locationId: input.session.context.locationId,
        locationName: input.session.context.locationName,
        locationType: input.session.context.locationType,
        requireScopeFilters: exportPolicy.requireScopeFilters,
        trustGateMode: exportPolicy.trustGate.mode,
        trustGateLabel: exportPolicy.trustGate.label,
        trustGateSourceDecisionId: exportPolicy.trustGate.sourceDecisionId,
        trustGateIsOverridden: exportPolicy.trustGate.isOverridden,
        source: "project-report-export"
      }
    }
  });
}

export async function logProjectExportFailure(input: {
  session: SessionContext;
  reportId:
    | "project-health"
    | "project-task-register"
    | "project-activity-log"
    | "project-linked-record-follow-up";
  error: unknown;
}) {
  await logProjectExportAudit({
    session: input.session,
    eventType: "project_report.export_failed",
    reportId: input.reportId,
    reasonCode: getExportFailureReasonCode(input.error)
  });
}

export async function buildProjectHealthExportRows(session: SessionContext) {
  if (!(await canExportProjectsLive(session))) {
    await logProjectExportAudit({
      session,
      eventType: "project_report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    throw new Error("PERMISSION_DENIED");
  }

  assertProjectExportThrottle(session);
  await logProjectExportAudit({
    session,
    eventType: "project_report.export_started"
  });

  const dashboard = await getProjectDashboard(session);
  const rows: CsvRow[] = [
    [
      "Project Code",
      "Project Name",
      "Status",
      "Manager",
      "Target Date",
      "Task Count",
      "Completed Tasks",
      "Overdue Tasks",
      "Blocked Tasks",
      "Linked Record Count",
      "Next Milestone",
      "Next Milestone Date",
      "Health"
    ],
    ...dashboard.projects.map((project): CsvRow => [
      project.code,
      project.name,
      project.status,
      project.managerName,
      project.targetDate,
      project.taskCount,
      project.completedTaskCount,
      project.overdueTaskCount,
      project.blockedTaskCount,
      project.linkedRecordCount,
      project.nextMilestoneTitle,
      project.nextMilestoneDate,
      project.isAtRisk ? "At risk" : "On track"
    ])
  ];

  await logProjectExportAudit({
    session,
    eventType: "project_report.export_completed",
    rowCount: dashboard.projects.length
  });

  return rows;
}

export const projectTaskRegisterExportHeaders = [
  "Project Code",
  "Project Name",
  "Task Key",
  "Task Title",
  "Status",
  "Priority",
  "Owner",
  "Due Date",
  "Completed At",
  "Due State",
  "Overdue",
  "Overdue Days",
  "Blocked",
  "Checklist Total",
  "Checklist Completed",
  "Comment Count",
  "Attachment Count",
  "Open Blocker Count",
  "Open Blocker Next Review"
] as const;

export async function buildProjectTaskRegisterExportRows(session: SessionContext) {
  if (!(await canExportProjectsLive(session))) {
    await logProjectExportAudit({
      session,
      eventType: "project_report.export_denied",
      reportId: "project-task-register",
      reasonCode: "PERMISSION_DENIED"
    });
    throw new Error("PERMISSION_DENIED");
  }

  assertProjectExportThrottle(session);
  await logProjectExportAudit({
    session,
    eventType: "project_report.export_started",
    reportId: "project-task-register"
  });

  const access = await listAuthorizedProjectAccess(session);
  const tasks =
    access.projectIds.length === 0
      ? []
      : await prisma.projectTask.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            projectId: { in: access.projectIds },
            archivedAt: null
          },
          include: {
            project: true,
            owner: true,
            checklistItems: {
              select: { id: true, isCompleted: true, archivedAt: true }
            },
            comments: {
              where: { status: "ACTIVE" },
              select: { id: true }
            },
            attachments: {
              where: { status: "ACTIVE", archivedAt: null },
              select: { id: true }
            },
            blockers: {
              where: { status: "OPEN" },
              select: { id: true, nextReviewAt: true }
            }
          },
          orderBy: [
            { projectId: "asc" },
            { status: "asc" },
            { dueAt: "asc" },
            { createdAt: "desc" }
          ]
        });

  const rows: CsvRow[] = [
    [...projectTaskRegisterExportHeaders],
    ...tasks.map((task): CsvRow => {
      const activeChecklistItems = task.checklistItems.filter(
        (item) => !item.archivedAt
      );
      const dueState = projectTaskDueState({
        dueDate: task.dueDate,
        dueAt: task.dueAt,
        status: task.status
      });
      const nextBlockerReviewAt =
        task.blockers
          .map((blocker) => blocker.nextReviewAt)
          .filter((value): value is Date => Boolean(value))
          .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
      return [
        task.project.code,
        task.project.name,
        task.taskKey,
        task.title,
        task.status,
        task.priority,
        task.owner.displayName,
        projectTaskDueDateString({ dueDate: task.dueDate, dueAt: task.dueAt }) ?? "",
        task.completedAt?.toISOString() ?? "",
        dueState.dueState,
        dueState.dueState === "OVERDUE",
        dueState.overdueDays,
        task.isBlocked,
        activeChecklistItems.length,
        activeChecklistItems.filter((item) => item.isCompleted).length,
        task.comments.length,
        task.attachments.length,
        task.blockers.length,
        nextBlockerReviewAt?.toISOString() ?? ""
      ];
    })
  ];

  await logProjectExportAudit({
    session,
    eventType: "project_report.export_completed",
    reportId: "project-task-register",
    rowCount: tasks.length
  });

  return rows;
}

const activitySummaryByEventType: Record<string, string> = {
  "project.created": "Project created",
  "project.lifecycle.transitioned": "Project lifecycle changed",
  "project_member.added": "Project member added",
  "project_member.removed": "Project member removed",
  "project_task.created": "Task created",
  "project_task.assigned": "Task assigned",
  "project_task.reassigned": "Task reassigned",
  "project_task.status_changed": "Task status changed",
  "project_task_checklist_item.created": "Checklist item added",
  "project_task_checklist_item.completed": "Checklist item completed",
  "project_task_checklist_item.reopened": "Checklist item reopened",
  "project_comment.created": "Comment added",
  "project_attachment.added": "Attachment metadata linked",
  "project_attachment.archived": "Attachment metadata archived",
  "project_blocker.cancelled": "Blocker cancelled",
  "project_blocker.resolved": "Blocker resolved",
  "project_record_link.created": "Source record link added",
  "project_record_link.archived": "Source record link archived",
  "project_milestone.created": "Milestone created",
  "project_milestone.status_changed": "Milestone status changed",
  "project_risk.created": "Risk created",
  "project_risk.status_changed": "Risk status changed"
};

const categoryByEntityType: Record<string, string> = {
  Project: "PROJECT",
  ProjectMember: "MEMBER",
  ProjectTask: "TASK",
  ProjectTaskChecklistItem: "TASK",
  ProjectComment: "COMMENT",
  ProjectAttachment: "ATTACHMENT",
  ProjectBlocker: "BLOCKER",
  ProjectRecordLink: "LINK",
  ProjectMilestone: "MILESTONE",
  ProjectRisk: "RISK"
};

function normalizeActivityLabel(value: string) {
  return value.replaceAll("_", " ").replaceAll(".", " / ");
}

export function safeProjectActivityExportSummary(input: {
  eventType: string;
  entityType: string;
}) {
  return {
    eventType: normalizeActivityLabel(input.eventType),
    entityType: normalizeActivityLabel(input.entityType),
    entityCategory: categoryByEntityType[input.entityType] ?? "OTHER",
    changeSummary:
      activitySummaryByEventType[input.eventType] ?? "Unsupported event for safe CSV",
    reasonCode: input.eventType.includes(".denied")
      ? "DENIED"
      : input.eventType.includes("blocked")
        ? "BLOCKED"
        : activitySummaryByEventType[input.eventType]
          ? "NONE"
          : "MAPPED_UNKNOWN"
  };
}

export async function buildProjectActivityLogExportRows(session: SessionContext) {
  if (!(await canExportProjectsLive(session))) {
    await logProjectExportAudit({
      session,
      eventType: "project_report.export_denied",
      reportId: "project-activity-log",
      reasonCode: "PERMISSION_DENIED"
    });
    throw new Error("PERMISSION_DENIED");
  }

  assertProjectExportThrottle(session);
  await logProjectExportAudit({
    session,
    eventType: "project_report.export_started",
    reportId: "project-activity-log"
  });

  const access = await listAuthorizedProjectAccess(session);
  const events =
    access.projectIds.length === 0
      ? []
      : await prisma.projectActivityEvent.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            projectId: { in: access.projectIds }
          },
          include: {
            project: true,
            actor: true
          },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: 500
        });

  const rows: CsvRow[] = [
    [
      "Project Code",
      "Project Name",
      "Occurred At UTC",
      "Occurred At Company TZ",
      "Actor",
      "Event Type",
      "Entity Type",
      "Entity Category",
      "Change Summary",
      "Reason Code"
    ],
    ...events.map((event): CsvRow => {
      const summary = safeProjectActivityExportSummary({
        eventType: event.eventType,
        entityType: event.entityType
      });
      return [
        event.project.code,
        event.project.name,
        event.occurredAt.toISOString(),
        event.occurredAt.toLocaleString("en-US", { timeZone: "Asia/Manila" }),
        event.actor.displayName,
        summary.eventType,
        summary.entityType,
        summary.entityCategory,
        summary.changeSummary,
        summary.reasonCode
      ];
    })
  ];

  await logProjectExportAudit({
    session,
    eventType: "project_report.export_completed",
    reportId: "project-activity-log",
    rowCount: events.length
  });

  return rows;
}

export async function buildProjectLinkedRecordFollowUpExportRows(
  session: SessionContext
) {
  if (!(await canExportProjectsLive(session))) {
    await logProjectExportAudit({
      session,
      eventType: "project_report.export_denied",
      reportId: "project-linked-record-follow-up",
      reasonCode: "PERMISSION_DENIED"
    });
    throw new Error("PERMISSION_DENIED");
  }

  assertProjectExportThrottle(session);
  await logProjectExportAudit({
    session,
    eventType: "project_report.export_started",
    reportId: "project-linked-record-follow-up"
  });

  const access = await listAuthorizedProjectAccess(session);
  const links =
    access.projectIds.length === 0
      ? []
      : await prisma.projectRecordLink.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            projectId: { in: access.projectIds },
            archivedAt: null
          },
          include: {
            project: true,
            task: {
              select: {
                taskKey: true,
                title: true,
                status: true,
                priority: true,
                dueDate: true,
                dueAt: true,
                isBlocked: true,
                owner: { select: { displayName: true } }
              }
            },
            milestone: {
              select: {
                title: true,
                status: true,
                targetDate: true
              }
            }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 500
        });

  const rows: CsvRow[] = [
    [
      "Project Code",
      "Project Name",
      "Context Type",
      "Context Key",
      "Context Title",
      "Context Status",
      "Task Owner",
      "Task Priority",
      "Task Due Date",
      "Task Due State",
      "Task Blocked",
      "Link Label",
      "Relation",
      "Source Visibility",
      "Source Type",
      "Source Summary",
      "Source Status",
      "Source Scope",
      "Source Date",
      "Source Link",
      "Link Created At"
    ]
  ];

  for (const link of links) {
    const summary = await resolveProjectRecordLinkSourceSummary(
      session,
      link.sourceRecordType as ProjectLinkSourceRecordType,
      link.sourceRecordId
    );
    assertSafeSourceSummary(summary);

    const dueState = link.task
      ? projectTaskDueState({
          dueDate: link.task.dueDate,
          dueAt: link.task.dueAt,
          status: link.task.status
        })
      : null;
    const contextType = link.task ? "Task" : link.milestone ? "Milestone" : "Project";
    const contextKey = link.task?.taskKey ?? "";
    const contextTitle = link.task?.title ?? link.milestone?.title ?? link.project.name;
    const contextStatus = link.task?.status ?? link.milestone?.status ?? link.project.status;
    const sourceVisibility = summary.visible ? "Visible" : "Restricted";

    rows.push([
      link.project.code,
      link.project.name,
      contextType,
      contextKey,
      contextTitle,
      contextStatus,
      link.task?.owner.displayName ?? "",
      link.task?.priority ?? "",
      link.task
        ? projectTaskDueDateString({
            dueDate: link.task.dueDate,
            dueAt: link.task.dueAt
          }) ?? ""
        : link.milestone?.targetDate?.toISOString().slice(0, 10) ?? "",
      dueState?.dueState ?? "",
      link.task?.isBlocked ?? false,
      link.linkLabel,
      link.relationType,
      sourceVisibility,
      summary.visible ? summary.sourceRecordType : "Restricted",
      summary.visible ? summary.label : "Linked record exists",
      summary.visible ? summary.status ?? "" : "",
      summary.visible ? summary.scopeLabel ?? "" : "",
      summary.visible ? summary.primaryDate ?? "" : "",
      summary.visible ? summary.href ?? "" : "",
      link.createdAt.toISOString()
    ]);
  }

  await logProjectExportAudit({
    session,
    eventType: "project_report.export_completed",
    reportId: "project-linked-record-follow-up",
    rowCount: links.length
  });

  return rows;
}
