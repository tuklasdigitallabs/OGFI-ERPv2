import { prisma, type TransactionClient } from "@ogfi/database";
import { getGrantedPermissionCodes, permissions } from "./authorization";
import type { SessionContext } from "./context";
import { recordWorkflowNotifications } from "./notifications";
import {
  dateOnlyInTimeZone,
  projectTaskDaysUntilDue,
  projectTaskDueDateString
} from "./projectDates";
import { getActiveProjectScopes, hasCompanyManageScope } from "./projects";

type ProjectNotificationClient = TransactionClient;
type ProjectTaskDeadlineReminderKind = "DUE_SOON" | "OVERDUE";

type ProjectNotificationProject = {
  id: string;
  tenantId: string;
  companyId: string;
  locationId: string | null;
  code: string;
  name: string;
  isRestricted: boolean;
  managerUserId: string;
  sponsorUserId: string;
};

const defaultProjectReminderConfig = {
  dueSoonWindowDays: 2,
  overdueReminderFrequencyDays: 1,
  maxOverdueRemindersPerTask: 5
};

export function readProjectReminderConfig(configJson: unknown) {
  const notificationDefaults =
    typeof configJson === "object" &&
    configJson !== null &&
    "notificationDefaults" in configJson &&
    typeof configJson.notificationDefaults === "object" &&
    configJson.notificationDefaults !== null
      ? (configJson.notificationDefaults as Record<string, unknown>)
      : {};

  const dueSoonWindowDays =
    typeof notificationDefaults.dueSoonWindowDays === "number" &&
    Number.isInteger(notificationDefaults.dueSoonWindowDays) &&
    notificationDefaults.dueSoonWindowDays >= 0 &&
    notificationDefaults.dueSoonWindowDays <= 30
      ? notificationDefaults.dueSoonWindowDays
      : defaultProjectReminderConfig.dueSoonWindowDays;
  const overdueReminderFrequencyDays =
    typeof notificationDefaults.overdueReminderFrequencyDays === "number" &&
    Number.isInteger(notificationDefaults.overdueReminderFrequencyDays) &&
    notificationDefaults.overdueReminderFrequencyDays >= 1 &&
    notificationDefaults.overdueReminderFrequencyDays <= 30
      ? notificationDefaults.overdueReminderFrequencyDays
      : defaultProjectReminderConfig.overdueReminderFrequencyDays;
  const maxOverdueRemindersPerTask =
    typeof notificationDefaults.maxOverdueRemindersPerTask === "number" &&
    Number.isInteger(notificationDefaults.maxOverdueRemindersPerTask) &&
    notificationDefaults.maxOverdueRemindersPerTask >= 1 &&
    notificationDefaults.maxOverdueRemindersPerTask <= 30
      ? notificationDefaults.maxOverdueRemindersPerTask
      : defaultProjectReminderConfig.maxOverdueRemindersPerTask;

  return {
    dueSoonWindowDays,
    overdueReminderFrequencyDays,
    maxOverdueRemindersPerTask
  };
}

export function projectTaskDeadlineReminderKind(input: {
  dueDate?: Date | string | null;
  dueAt?: Date | string | null;
  status: string;
  asOf?: Date;
  dueSoonWindowDays: number;
}) {
  if (["COMPLETED", "CANCELLED"].includes(input.status)) {
    return null;
  }
  const daysUntilDue = projectTaskDaysUntilDue(input);
  if (daysUntilDue === null) {
    return null;
  }
  if (daysUntilDue < 0) {
    return "OVERDUE" as const;
  }
  if (daysUntilDue <= input.dueSoonWindowDays) {
    return "DUE_SOON" as const;
  }
  return null;
}

async function activeProjectRecipientIds(
  client: ProjectNotificationClient,
  input: {
    tenantId: string;
    projectId: string;
    isRestricted: boolean;
    userIds: Array<string | null | undefined>;
    memberRoles?: string[];
  }
) {
  const memberRows = await client.projectMember.findMany({
    where: {
      tenantId: input.tenantId,
      projectId: input.projectId,
      status: "ACTIVE"
    },
    select: { userId: true, projectRole: true }
  });

  const projectMemberUserIds = new Set(memberRows.map((member) => member.userId));
  const roleRecipientIds = input.memberRoles
    ? memberRows
        .filter((member) => input.memberRoles?.includes(member.projectRole))
        .map((member) => member.userId)
    : memberRows.map((member) => member.userId);
  const explicitUserIds = input.userIds.filter((userId): userId is string =>
    Boolean(userId)
  );
  const candidateIds = [
    ...(input.isRestricted
      ? explicitUserIds.filter((userId) => projectMemberUserIds.has(userId))
      : explicitUserIds),
    ...roleRecipientIds
  ];
  if (candidateIds.length === 0) {
    return [];
  }

  const users = await client.user.findMany({
    where: {
      tenantId: input.tenantId,
      id: { in: [...new Set(candidateIds)] },
      status: "ACTIVE"
    },
    select: { id: true }
  });
  return users.map((user) => user.id);
}

async function countExistingOverdueReminderBuckets(
  client: ProjectNotificationClient,
  input: { tenantId: string; taskId: string; recipientUserId: string }
) {
  return client.notification.count({
    where: {
      tenantId: input.tenantId,
      recipientUserId: input.recipientUserId,
      entityType: "ProjectTask",
      entityId: input.taskId,
      notificationType: "PROJECT_TASK_OVERDUE"
    }
  });
}

export async function notifyProjectTaskDeadlineReminder(
  client: ProjectNotificationClient,
  input: {
    project: ProjectNotificationProject;
    task: {
      id: string;
      taskKey: string;
      ownerUserId: string;
      priority: string;
      dueDateString: string;
      reminderKind: ProjectTaskDeadlineReminderKind;
      reminderBucket: string;
      overdueDays: number;
    };
    maxOverdueRemindersPerTask: number;
  }
) {
  const candidateRecipientIds = await activeProjectRecipientIds(client, {
    tenantId: input.project.tenantId,
    projectId: input.project.id,
    isRestricted: input.project.isRestricted,
    userIds: [
      input.task.ownerUserId,
      input.project.managerUserId,
      input.project.sponsorUserId
    ],
    memberRoles: ["MANAGER", "SPONSOR", "ADMINISTRATOR"]
  });

  const recipientUserIds =
    input.task.reminderKind === "OVERDUE"
      ? (
          await Promise.all(
            candidateRecipientIds.map(async (recipientUserId) => ({
              recipientUserId,
              existingCount: await countExistingOverdueReminderBuckets(client, {
                tenantId: input.project.tenantId,
                taskId: input.task.id,
                recipientUserId
              })
            }))
          )
        )
          .filter(
            (recipient) =>
              recipient.existingCount < input.maxOverdueRemindersPerTask
          )
          .map((recipient) => recipient.recipientUserId)
      : candidateRecipientIds;

  return recordWorkflowNotifications(client, {
    tenantId: input.project.tenantId,
    companyId: input.project.companyId,
    locationId: input.project.locationId,
    recipientUserIds,
    notificationType:
      input.task.reminderKind === "OVERDUE"
        ? "PROJECT_TASK_OVERDUE"
        : "PROJECT_TASK_DUE_SOON",
    priority:
      input.task.reminderKind === "OVERDUE" || input.task.priority === "CRITICAL"
        ? "HIGH"
        : "NORMAL",
    title:
      input.task.reminderKind === "OVERDUE"
        ? `Project task overdue: ${input.task.taskKey}`
        : `Project task due soon: ${input.task.taskKey}`,
    body:
      input.task.reminderKind === "OVERDUE"
        ? `${input.project.code} has an overdue project task requiring follow-up.`
        : `${input.project.code} has a project task approaching its due date.`,
    deepLink: `/my-work/${input.task.id}`,
    entityType: "ProjectTask",
    entityId: input.task.id,
    sourceEventKey: `project-task-deadline:${input.project.tenantId}:${input.task.id}:${input.task.reminderKind}:${input.task.dueDateString}:${input.task.reminderBucket}`,
    recipientBasis: "PROJECT_MANAGER_SPONSOR_OWNER",
    metadata: {
      projectId: input.project.id,
      projectCode: input.project.code,
      taskKey: input.task.taskKey,
      dueDate: input.task.dueDateString,
      reminderKind: input.task.reminderKind,
      overdueDays: input.task.overdueDays,
      source: "project-deadline-reminder"
    }
  });
}

export async function scanProjectTaskDeadlineReminders(input: {
  tenantId?: string;
  companyId?: string;
  asOf?: Date;
  timeZone?: string;
} = {}) {
  const asOf = input.asOf ?? new Date();
  const asOfDate = dateOnlyInTimeZone(asOf, input.timeZone);
  const tasks = await prisma.projectTask.findMany({
    where: {
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.companyId ? { companyId: input.companyId } : {}),
      archivedAt: null,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      OR: [{ dueDate: { not: null } }, { dueAt: { not: null } }],
      project: { archivedAt: null, status: { notIn: ["CANCELLED", "ARCHIVED"] } }
    },
    include: { project: true },
    orderBy: [{ dueDate: "asc" }, { dueAt: "asc" }]
  });

  const results: Array<{ taskId: string; reminderKind: ProjectTaskDeadlineReminderKind }> = [];
  await prisma.$transaction(async (tx) => {
    for (const task of tasks) {
      const reminderConfig = readProjectReminderConfig(task.project.projectConfigJson);
      const reminderKind = projectTaskDeadlineReminderKind({
        dueDate: task.dueDate,
        dueAt: task.dueAt,
        status: task.status,
        asOf,
        dueSoonWindowDays: reminderConfig.dueSoonWindowDays
      });
      const dueDateString = projectTaskDueDateString({
        dueDate: task.dueDate,
        dueAt: task.dueAt
      });
      if (!reminderKind || !dueDateString) {
        continue;
      }
      const daysUntilDue = projectTaskDaysUntilDue({
        dueDate: task.dueDate,
        dueAt: task.dueAt,
        asOf
      });
      const overdueDays =
        reminderKind === "OVERDUE" && daysUntilDue !== null
          ? Math.abs(daysUntilDue)
          : 0;
      if (
        reminderKind === "OVERDUE" &&
        overdueDays % reminderConfig.overdueReminderFrequencyDays !== 0
      ) {
        continue;
      }
      const reminderBucket =
        reminderKind === "OVERDUE" ? asOfDate : dueDateString;
      const notifications = await notifyProjectTaskDeadlineReminder(tx, {
        project: {
          id: task.project.id,
          tenantId: task.project.tenantId,
          companyId: task.project.companyId,
          locationId: task.project.locationId,
          code: task.project.code,
          name: task.project.name,
          isRestricted: task.project.isRestricted,
          managerUserId: task.project.managerUserId,
          sponsorUserId: task.project.sponsorUserId
        },
        task: {
          id: task.id,
          taskKey: task.taskKey,
          ownerUserId: task.ownerUserId,
          priority: task.priority,
          dueDateString,
          reminderKind,
          reminderBucket,
          overdueDays
        },
        maxOverdueRemindersPerTask: reminderConfig.maxOverdueRemindersPerTask
      });
      if (notifications.length === 0) {
        continue;
      }
      await tx.projectActivityEvent.create({
        data: {
          tenantId: task.tenantId,
          companyId: task.companyId,
          projectId: task.projectId,
          actorUserId: task.updatedByUserId,
          eventType:
            reminderKind === "OVERDUE"
              ? "project_task.overdue_reminder"
              : "project_task.due_soon_reminder",
          entityType: "ProjectTask",
          entityId: task.id,
          afterData: {
            taskKey: task.taskKey,
            dueDate: dueDateString,
            reminderKind,
            reminderBucket,
            overdueDays,
            notificationCount: notifications.length
          },
          metadata: { source: "project-deadline-reminder-scan" }
        }
      });
      results.push({ taskId: task.id, reminderKind });
    }
  });

  return {
    scannedTaskCount: tasks.length,
    reminderCount: results.length,
    reminders: results
  };
}

export async function runProjectTaskDeadlineReminderScan(
  session: SessionContext,
  input: { asOf?: Date } = {}
) {
  const scopes = await getActiveProjectScopes(session);
  const permissionCodes = await getGrantedPermissionCodes(session);
  const canScan =
    permissionCodes.includes(permissions.projectManage) &&
    hasCompanyManageScope(scopes, session.context.companyId);
  if (!canScan) {
    throw new Error("PERMISSION_DENIED");
  }

  return scanProjectTaskDeadlineReminders({
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(input.asOf ? { asOf: input.asOf } : {})
  });
}

export async function notifyProjectTaskBlocked(
  client: ProjectNotificationClient,
  input: {
    project: ProjectNotificationProject;
    task: {
      id: string;
      taskKey: string;
      ownerUserId: string;
      priority: string;
      version: number;
    };
  }
) {
  const recipientUserIds = await activeProjectRecipientIds(client, {
    tenantId: input.project.tenantId,
    projectId: input.project.id,
    isRestricted: input.project.isRestricted,
    userIds: [
      input.task.ownerUserId,
      input.project.managerUserId,
      input.project.sponsorUserId
    ],
    memberRoles: ["MANAGER", "SPONSOR", "ADMINISTRATOR"]
  });

  return recordWorkflowNotifications(client, {
    tenantId: input.project.tenantId,
    companyId: input.project.companyId,
    locationId: input.project.locationId,
    recipientUserIds,
    notificationType: "PROJECT_TASK_BLOCKED",
    priority: input.task.priority === "CRITICAL" ? "HIGH" : "NORMAL",
    title: `Project task blocked: ${input.task.taskKey}`,
    body: `${input.project.code} has a blocked task that needs project follow-up.`,
    deepLink: `/work-boards?projectId=${input.project.id}`,
    entityType: "ProjectTask",
    entityId: input.task.id,
    sourceEventKey: `project-task-blocked:${input.project.tenantId}:${input.task.id}:v${input.task.version}`,
    recipientBasis: "PROJECT_MANAGER_SPONSOR_OWNER",
    metadata: {
      projectId: input.project.id,
      projectCode: input.project.code,
      taskKey: input.task.taskKey,
      source: "project-notifications"
    }
  });
}

export async function notifyProjectTaskAssigned(
  client: ProjectNotificationClient,
  input: {
    project: ProjectNotificationProject;
    task: {
      id: string;
      taskKey: string;
      title: string;
      assigneeUserId: string;
      actorUserId: string;
      priority: string;
      sourceEventKeySuffix?: string;
    };
  }
) {
  if (input.task.assigneeUserId === input.task.actorUserId) {
    return [];
  }

  const recipientUserIds = await activeProjectRecipientIds(client, {
    tenantId: input.project.tenantId,
    projectId: input.project.id,
    isRestricted: input.project.isRestricted,
    userIds: [input.task.assigneeUserId]
  });

  return recordWorkflowNotifications(client, {
    tenantId: input.project.tenantId,
    companyId: input.project.companyId,
    locationId: input.project.locationId,
    recipientUserIds,
    notificationType: "PROJECT_TASK_ASSIGNED",
    priority: input.task.priority === "CRITICAL" ? "HIGH" : "NORMAL",
    title: `Project task assigned: ${input.task.taskKey}`,
    body: `${input.project.code} assigned a project task to you.`,
    deepLink: `/my-work/${input.task.id}`,
    entityType: "ProjectTask",
    entityId: input.task.id,
    sourceEventKey: `project-task-assigned:${input.project.tenantId}:${input.task.id}:${input.task.assigneeUserId}${
      input.task.sourceEventKeySuffix ? `:${input.task.sourceEventKeySuffix}` : ""
    }`,
    recipientBasis: "PROJECT_TASK_ASSIGNEE",
    metadata: {
      projectId: input.project.id,
      projectCode: input.project.code,
      taskKey: input.task.taskKey,
      source: "project-notifications"
    }
  });
}

export async function notifyProjectRiskElevated(
  client: ProjectNotificationClient,
  input: {
    project: ProjectNotificationProject;
    risk: {
      id: string;
      ownerUserId: string;
      severity: string;
      version: number;
    };
  }
) {
  if (!["HIGH", "CRITICAL"].includes(input.risk.severity)) {
    return [];
  }

  const recipientUserIds = await activeProjectRecipientIds(client, {
    tenantId: input.project.tenantId,
    projectId: input.project.id,
    isRestricted: input.project.isRestricted,
    userIds: [
      input.risk.ownerUserId,
      input.project.managerUserId,
      input.project.sponsorUserId
    ],
    memberRoles: ["MANAGER", "SPONSOR", "ADMINISTRATOR"]
  });

  return recordWorkflowNotifications(client, {
    tenantId: input.project.tenantId,
    companyId: input.project.companyId,
    locationId: input.project.locationId,
    recipientUserIds,
    notificationType: "PROJECT_RISK_ELEVATED",
    priority: input.risk.severity === "CRITICAL" ? "HIGH" : "NORMAL",
    title: `${input.risk.severity} project risk`,
    body: `${input.project.code} has a ${input.risk.severity.toLowerCase()} project risk requiring follow-up.`,
    deepLink: `/projects`,
    entityType: "ProjectRisk",
    entityId: input.risk.id,
    sourceEventKey: `project-risk-elevated:${input.project.tenantId}:${input.risk.id}:v${input.risk.version}`,
    recipientBasis: "PROJECT_MANAGER_SPONSOR_OWNER",
    metadata: {
      projectId: input.project.id,
      projectCode: input.project.code,
      severity: input.risk.severity,
      source: "project-notifications"
    }
  });
}

export async function notifyProjectMilestoneAtRisk(
  client: ProjectNotificationClient,
  input: {
    project: ProjectNotificationProject;
    milestone: {
      id: string;
      title: string;
      ownerUserId: string;
      targetDate: Date | null;
      version: number;
    };
  }
) {
  const recipientUserIds = await activeProjectRecipientIds(client, {
    tenantId: input.project.tenantId,
    projectId: input.project.id,
    isRestricted: input.project.isRestricted,
    userIds: [
      input.milestone.ownerUserId,
      input.project.managerUserId,
      input.project.sponsorUserId
    ],
    memberRoles: ["MANAGER", "SPONSOR", "ADMINISTRATOR"]
  });

  return recordWorkflowNotifications(client, {
    tenantId: input.project.tenantId,
    companyId: input.project.companyId,
    locationId: input.project.locationId,
    recipientUserIds,
    notificationType: "PROJECT_MILESTONE_AT_RISK",
    priority: "HIGH",
    title: `Milestone at risk: ${input.milestone.title}`,
    body: `${input.project.code} has an at-risk milestone requiring follow-up.`,
    deepLink: `/work-calendar?projectId=${input.project.id}`,
    entityType: "ProjectMilestone",
    entityId: input.milestone.id,
    sourceEventKey: `project-milestone-at-risk:${input.project.tenantId}:${input.milestone.id}:v${input.milestone.version}`,
    recipientBasis: "PROJECT_MANAGER_SPONSOR_OWNER",
    metadata: {
      projectId: input.project.id,
      projectCode: input.project.code,
      targetDate: input.milestone.targetDate?.toISOString().slice(0, 10) ?? null,
      source: "project-notifications"
    }
  });
}
