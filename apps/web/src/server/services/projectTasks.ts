import { prisma } from "@ogfi/database";
import { z } from "zod";
import { recordSessionDeniedDecisionSafely } from "./authorizationDenials";
import { canViewExpansionFinancialEstimates, permissions } from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";
import { projectTaskDueState } from "./projectDates";
import {
  notifyProjectTaskAssigned,
  notifyProjectTaskBlocked
} from "./projectNotifications";
import {
  findAuthorizedProject,
  getActiveProjectScopes,
  hasCompanyManageScope,
  listAuthorizedProjectAccess
} from "./projects";
import { getProjectTaskPolicy } from "./policySettings";
import {
  assertExpansionSpecializedTaskTransition,
  hasExpansionStructuredEvidence
} from "./expansionTaskControls";

const taskStatuses = [
  "BACKLOG",
  "PLANNED",
  "IN_PROGRESS",
  "WAITING_FOR_APPROVAL",
  "BLOCKED",
  "FOR_REVIEW",
  "COMPLETED",
  "CANCELLED"
] as const;

const taskPriorities = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
const blockerSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const attachmentPurposes = [
  "EVIDENCE",
  "REFERENCE",
  "COMPLETION_SUPPORT",
  "ISSUE_SUPPORT"
] as const;

export type ProjectTaskStatus = (typeof taskStatuses)[number];
export type ProjectTaskPriority = (typeof taskPriorities)[number];
export type ProjectBlockerSeverity = (typeof blockerSeverities)[number];
export type ProjectAttachmentPurpose = (typeof attachmentPurposes)[number];

export type ProjectTaskCard = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  taskKey: string;
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  priority: ProjectTaskPriority;
  ownerName: string;
  dueAt: string | null;
  dueState: "ON_TIME" | "DUE_TODAY" | "OVERDUE";
  isOverdue: boolean;
  overdueDays: number;
  isBlocked: boolean;
  blockedReason: string | null;
  completedAt: string | null;
  createdAt: string;
  version: number;
  assigneeNames: string[];
  checklistItems: Array<{
    id: string;
    title: string;
    isCompleted: boolean;
    isRequired: boolean;
  }>;
  comments: Array<{
    id: string;
    authorName: string;
    body: string;
    createdAt: string;
  }>;
  attachments: Array<{
    id: string;
    purpose: ProjectAttachmentPurpose;
    caption: string | null;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    createdByName: string;
    createdAt: string;
  }>;
  checklistTotal: number;
  checklistCompleted: number;
  commentCount: number;
  attachmentCount: number;
  openBlockerCount: number;
  openBlockers: Array<{
    id: string;
    reason: string;
    severity: ProjectBlockerSeverity;
    ownerName: string;
    reportedAt: string;
    nextReviewAt: string | null;
  }>;
  nextBlockerReviewAt: string | null;
  canMutate: boolean;
};

export type ProjectTaskAssigneeOption = {
  id: string;
  displayName: string;
  email: string;
  projectRole: string;
};

const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(taskPriorities).default("NORMAL"),
  assigneeUserId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  dueAt: z.string().optional().or(z.literal("").transform(() => undefined))
});

const transitionTaskSchema = z.object({
  taskId: z.string().uuid(),
  nextStatus: z.enum(taskStatuses),
  expectedVersion: z.coerce.number().int().positive().optional(),
  reason: z.string().trim().max(1000).optional(),
  severity: z.enum(blockerSeverities).default("MEDIUM"),
  nextReviewAt: z.string().optional().or(z.literal("").transform(() => undefined)),
  completionNote: z.string().trim().max(1000).optional()
});

const reassignTaskSchema = z.object({
  taskId: z.string().uuid(),
  assigneeUserId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  reason: z.string().trim().max(1000).optional()
});

const resolveBlockerSchema = z.object({
  blockerId: z.string().uuid(),
  taskId: z.string().uuid(),
  nextStatus: z.enum(["RESOLVED", "CANCELLED"]),
  resolutionNote: z.string().trim().min(5).max(1000)
});

const addChecklistItemSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  isRequired: z.coerce.boolean().default(false)
});

const toggleChecklistItemSchema = z.object({
  checklistItemId: z.string().uuid(),
  isCompleted: z.coerce.boolean().default(false)
});

const addCommentSchema = z.object({
  taskId: z.string().uuid(),
  body: z.string().trim().min(2).max(2000)
});

const addAttachmentSchema = z.object({
  taskId: z.string().uuid(),
  attachmentId: z.string().uuid(),
  purpose: z.enum(attachmentPurposes).default("EVIDENCE"),
  caption: z.string().trim().max(500).optional()
});

const archiveAttachmentSchema = z.object({
  projectAttachmentId: z.string().uuid(),
  archiveReason: z.string().trim().min(5).max(1000)
});

type ProjectForTaskAccess = Awaited<ReturnType<typeof findAuthorizedProject>>;

function assertProjectFound(
  project: ProjectForTaskAccess
): asserts project is NonNullable<ProjectForTaskAccess> {
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }
}

function activeMemberRole(
  project: NonNullable<ProjectForTaskAccess>,
  userId: string
) {
  return project.members.find((member) => member.userId === userId)?.projectRole ?? null;
}

export function canMutateProjectWork(input: {
  project: NonNullable<ProjectForTaskAccess>;
  userId: string;
  permissionCodes: string[];
  hasCompanyManage: boolean;
}) {
  const role = activeMemberRole(input.project, input.userId);
  return (
    ["MANAGER", "ADMINISTRATOR", "CONTRIBUTOR"].includes(role ?? "") ||
    input.project.managerUserId === input.userId ||
    input.project.sponsorUserId === input.userId ||
    (input.permissionCodes.includes(permissions.projectManage) && input.hasCompanyManage)
  );
}

export function assertTaskTransition(input: {
  currentStatus: ProjectTaskStatus;
  nextStatus: ProjectTaskStatus;
  canMutate: boolean;
  reason?: string;
  blockerReasonRequired?: boolean;
}) {
  if (!input.canMutate) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }
  if (["COMPLETED", "CANCELLED"].includes(input.currentStatus)) {
    const isReopen = ["BACKLOG", "PLANNED", "IN_PROGRESS"].includes(input.nextStatus);
    if (!isReopen) {
      throw new Error("PROJECT_TASK_TERMINAL_STATUS");
    }
    if (!input.reason || input.reason.trim().length < 5) {
      throw new Error("PROJECT_TASK_REOPEN_REASON_REQUIRED");
    }
  }
  if (
    input.nextStatus === "BLOCKED" &&
    input.blockerReasonRequired !== false &&
    (!input.reason || input.reason.trim().length < 5)
  ) {
    throw new Error("PROJECT_TASK_BLOCKER_REASON_REQUIRED");
  }
  if (input.nextStatus === "CANCELLED" && (!input.reason || input.reason.trim().length < 5)) {
    throw new Error("PROJECT_TASK_CANCEL_REASON_REQUIRED");
  }
}

export function projectTaskReassignmentRequiresReason(input: {
  status: ProjectTaskStatus;
  priority: ProjectTaskPriority;
  isOverdue: boolean;
}) {
  return (
    input.isOverdue ||
    input.status === "BLOCKED" ||
    input.status === "WAITING_FOR_APPROVAL" ||
    input.priority === "HIGH" ||
    input.priority === "CRITICAL"
  );
}

export function assertProjectTaskCanReassign(input: {
  status: ProjectTaskStatus;
  priority: ProjectTaskPriority;
  isOverdue: boolean;
  reason?: string;
}) {
  if (input.status === "COMPLETED" || input.status === "CANCELLED") {
    throw new Error("PROJECT_TASK_REASSIGNMENT_TERMINAL_STATUS");
  }
  if (
    projectTaskReassignmentRequiresReason(input) &&
    (!input.reason || input.reason.trim().length < 5)
  ) {
    throw new Error("PROJECT_TASK_REASSIGNMENT_REASON_REQUIRED");
  }
}

export function enabledProjectTaskStatuses(projectConfigJson: unknown) {
  const statusSet =
    typeof projectConfigJson === "object" &&
    projectConfigJson !== null &&
    "statusSet" in projectConfigJson
      ? (projectConfigJson as { statusSet?: unknown }).statusSet
      : null;
  if (Array.isArray(statusSet)) {
    const configured = taskStatuses.filter((status) => statusSet.includes(status));
    if (configured.length > 0) {
      return new Set<ProjectTaskStatus>(configured);
    }
  }
  return new Set<ProjectTaskStatus>(taskStatuses);
}

export function assertProjectTaskStatusEnabled(input: {
  projectConfigJson: unknown;
  nextStatus: ProjectTaskStatus;
}) {
  if (!enabledProjectTaskStatuses(input.projectConfigJson).has(input.nextStatus)) {
    throw new Error("PROJECT_TASK_STATUS_NOT_ENABLED");
  }
}

function initialProjectTaskStatus(projectConfigJson: unknown) {
  const enabled = enabledProjectTaskStatuses(projectConfigJson);
  for (const status of ["PLANNED", "BACKLOG", "IN_PROGRESS"] as const) {
    if (enabled.has(status)) {
      return status;
    }
  }
  throw new Error("PROJECT_TASK_INITIAL_STATUS_NOT_ENABLED");
}

function mapTask(task: {
  id: string;
  projectId: string;
  taskKey: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: Date | null;
  dueDate: Date | null;
  isBlocked: boolean;
  blockedReason: string | null;
  completedAt: Date | null;
  createdAt: Date;
  version: number;
  owner: { displayName: string };
  project: { code: string; name: string };
  assignees: { status: string; user: { displayName: string } }[];
  checklistItems: {
    id: string;
    title: string;
    isRequired: boolean;
    isCompleted: boolean;
    archivedAt: Date | null;
  }[];
  comments: {
    id: string;
    status: string;
    body: string;
    createdAt: Date;
    author: { displayName: string };
  }[];
  attachments?: {
    id: string;
    purpose: string;
    caption: string | null;
    status: string;
    archivedAt: Date | null;
    createdAt: Date;
    createdBy: { displayName: string };
    attachment: {
      originalFilename: string;
      mimeType: string;
      sizeBytes: number;
    };
  }[];
  blockers: {
    id: string;
    status: string;
    reason: string;
    severity: string;
    reportedAt: Date;
    nextReviewAt: Date | null;
    owner?: { displayName: string };
  }[];
  canMutate?: boolean;
}): ProjectTaskCard {
  const isRestrictedExpansionFinancialTask =
    task.description?.startsWith("EXPANSION_FEASIBILITY_MODEL:") ||
    task.description?.startsWith("EXPANSION_CAPEX_PROCUREMENT_ITEM:");
  const activeChecklistItems = task.checklistItems.filter((item) => !item.archivedAt);
  const activeAttachments =
    task.attachments?.filter(
      (attachment) => attachment.status === "ACTIVE" && !attachment.archivedAt
    ) ?? [];
  const dueState = projectTaskDueState({
    dueDate: task.dueDate,
    dueAt: task.dueAt,
    status: task.status
  });
  const openBlockers = task.blockers.filter((blocker) => blocker.status === "OPEN");
  const nextBlockerReviewAt =
    openBlockers
      .map((blocker) => blocker.nextReviewAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return {
    id: task.id,
    projectId: task.projectId,
    projectCode: task.project.code,
    projectName: task.project.name,
    taskKey: task.taskKey,
    title: task.title,
    description: isRestrictedExpansionFinancialTask
      ? "Financial assumptions are available in the restricted Expansion workspace."
      : task.description,
    status: task.status as ProjectTaskStatus,
    priority: task.priority as ProjectTaskPriority,
    ownerName: task.owner.displayName,
    dueAt: task.dueAt?.toISOString() ?? null,
    dueState: dueState.dueState,
    isOverdue: dueState.dueState === "OVERDUE",
    overdueDays: dueState.overdueDays,
    isBlocked: task.isBlocked,
    blockedReason: task.blockedReason,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    version: task.version,
    assigneeNames: task.assignees
      .filter((assignee) => assignee.status === "ACTIVE")
      .map((assignee) => assignee.user.displayName),
    checklistItems: activeChecklistItems.map((item) => ({
      id: item.id,
      title: item.title,
      isCompleted: item.isCompleted,
      isRequired: item.isRequired
    })),
    comments: task.comments
      .filter((comment) => comment.status === "ACTIVE")
      .map((comment) => ({
        id: comment.id,
        authorName: comment.author.displayName,
        body: comment.body,
        createdAt: comment.createdAt.toISOString()
      })),
    attachments: activeAttachments.map((attachment) => ({
      id: attachment.id,
      purpose: attachment.purpose as ProjectAttachmentPurpose,
      caption: attachment.caption,
      originalFilename: attachment.attachment.originalFilename,
      mimeType: attachment.attachment.mimeType,
      sizeBytes: attachment.attachment.sizeBytes,
      createdByName: attachment.createdBy.displayName,
      createdAt: attachment.createdAt.toISOString()
    })),
    checklistTotal: activeChecklistItems.length,
    checklistCompleted: activeChecklistItems.filter((item) => item.isCompleted).length,
    commentCount: task.comments.filter((comment) => comment.status === "ACTIVE").length,
    attachmentCount: activeAttachments.length,
    openBlockerCount: openBlockers.length,
    openBlockers: openBlockers.map((blocker) => ({
      id: blocker.id,
      reason: blocker.reason,
      severity: blocker.severity as ProjectBlockerSeverity,
      ownerName: blocker.owner?.displayName ?? task.owner.displayName,
      reportedAt: blocker.reportedAt.toISOString(),
      nextReviewAt: blocker.nextReviewAt?.toISOString() ?? null
    })),
    nextBlockerReviewAt: nextBlockerReviewAt?.toISOString() ?? null,
    canMutate: task.canMutate ?? false
  };
}

async function getTaskMutationAccess(session: SessionContext, projectId: string) {
  const project = await findAuthorizedProject(session, projectId);
  assertProjectFound(project);
  const scopes = await getActiveProjectScopes(session);
  return canMutateProjectWork({
    project,
    userId: session.user.id,
    permissionCodes: session.permissionCodes,
    hasCompanyManage: hasCompanyManageScope(scopes, session.context.companyId)
  });
}

export async function listProjectBoardTasks(session: SessionContext, projectId: string) {
  const project = await findAuthorizedProject(session, projectId);
  assertProjectFound(project);
  const scopes = await getActiveProjectScopes(session);
  const canMutate = canMutateProjectWork({
    project,
    userId: session.user.id,
    permissionCodes: session.permissionCodes,
    hasCompanyManage: hasCompanyManageScope(scopes, session.context.companyId)
  });

  const tasks = await prisma.projectTask.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      projectId,
      archivedAt: null
    },
    include: {
      project: true,
      owner: true,
      assignees: { include: { user: true } },
      checklistItems: true,
      comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
      attachments: {
        where: { status: "ACTIVE", archivedAt: null },
        include: {
          attachment: true,
          createdBy: true
        },
        orderBy: { createdAt: "desc" }
      },
      blockers: { include: { owner: true } }
    },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }]
  });

  return tasks.map((task) => mapTask({ ...task, canMutate }));
}

export async function listProjectBoardStatuses(session: SessionContext, projectId: string) {
  const project = await findAuthorizedProject(session, projectId);
  assertProjectFound(project);
  return Array.from(enabledProjectTaskStatuses(project.projectConfigJson));
}

export async function listMyProjectTasks(session: SessionContext) {
  const access = await listAuthorizedProjectAccess(session);
  if (access.projectIds.length === 0) {
    return [];
  }

  const tasks = await prisma.projectTask.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      projectId: { in: access.projectIds },
      archivedAt: null,
      OR: [
        { ownerUserId: session.user.id },
        { assignees: { some: { userId: session.user.id, status: "ACTIVE" } } }
      ],
      status: { notIn: ["CANCELLED"] }
    },
    include: {
      project: true,
      owner: true,
      assignees: { include: { user: true } },
      checklistItems: true,
      comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
      attachments: {
        where: { status: "ACTIVE", archivedAt: null },
        include: {
          attachment: true,
          createdBy: true
        },
        orderBy: { createdAt: "desc" }
      },
      blockers: { include: { owner: true } }
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }]
  });

  return tasks.map((task) =>
    mapTask({
      ...task,
      canMutate: access.canMutateByProjectId.get(task.projectId) ?? false
    })
  );
}

export async function getProjectTaskDetail(session: SessionContext, taskId: string) {
  const access = await listAuthorizedProjectAccess(session);
  if (access.projectIds.length === 0) {
    return null;
  }

  const task = await prisma.projectTask.findFirst({
    where: {
      id: taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      projectId: { in: access.projectIds },
      archivedAt: null
    },
    include: {
      project: true,
      owner: true,
      assignees: { include: { user: true } },
      checklistItems: true,
      comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
      attachments: {
        where: { status: "ACTIVE", archivedAt: null },
        include: {
          attachment: true,
          createdBy: true
        },
        orderBy: { createdAt: "desc" }
      },
      blockers: { include: { owner: true } }
    }
  });
  if (!task) {
    return null;
  }

  return mapTask({
    ...task,
    canMutate: access.canMutateByProjectId.get(task.projectId) ?? false
  });
}

export async function listProjectTaskAssigneeOptions(
  session: SessionContext,
  projectId: string
) {
  const project = await findAuthorizedProject(session, projectId);
  assertProjectFound(project);
  const canMutate = await getTaskMutationAccess(session, projectId);
  if (!canMutate) {
    return [];
  }

  return project.members
    .filter((member) => member.status === "ACTIVE" && member.user.status === "ACTIVE")
    .map((member): ProjectTaskAssigneeOption => ({
      id: member.userId,
      displayName: member.user.displayName,
      email: member.user.email,
      projectRole: member.projectRole
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function createProjectTask(formData: FormData) {
  const session = await requireSessionContext();
  const values = createTaskSchema.parse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    description: formData.get("description"),
    priority: formData.get("priority") || "NORMAL",
    assigneeUserId: formData.get("assigneeUserId"),
    dueAt: formData.get("dueAt")
  });
  const project = await findAuthorizedProject(session, values.projectId);
  assertProjectFound(project);
  const canMutate = await getTaskMutationAccess(session, values.projectId);
  if (!canMutate) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }
  const assigneeUserId = values.assigneeUserId ?? session.user.id;
  const assigneeMember = project.members.find(
    (member) =>
      member.userId === assigneeUserId &&
      member.status === "ACTIVE" &&
      member.user.status === "ACTIVE"
  );
  if (!assigneeMember) {
    throw new Error("PROJECT_TASK_ASSIGNEE_NOT_PROJECT_MEMBER");
  }

  const dueAt = values.dueAt ? new Date(values.dueAt) : null;
  const createdTask = await prisma.$transaction(async (tx) => {
    const taskCount = await tx.projectTask.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId
      }
    });
    const task = await tx.projectTask.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        taskKey: `${project.code}-${String(taskCount + 1).padStart(3, "0")}`,
        title: values.title,
        description: values.description || null,
        status: initialProjectTaskStatus(project.projectConfigJson),
        priority: values.priority,
        ownerUserId: assigneeUserId,
        dueAt,
        dueDate: dueAt,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id
      }
    });

    await tx.projectTaskAssignee.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        taskId: task.id,
        userId: assigneeUserId,
        assignedByUserId: session.user.id
      }
    });

    await tx.projectActivityEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        actorUserId: session.user.id,
        eventType: "project_task.created",
        entityType: "ProjectTask",
        entityId: task.id,
        afterData: {
          taskKey: task.taskKey,
          title: task.title,
          status: task.status,
          priority: task.priority,
          ownerUserId: task.ownerUserId,
          assigneeUserId,
          dueAt: task.dueAt?.toISOString() ?? null
        },
        metadata: { source: "project-task-foundation" }
      }
    });

    await tx.projectActivityEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        actorUserId: session.user.id,
        eventType: "project_task.assigned",
        entityType: "ProjectTask",
        entityId: task.id,
        afterData: {
          taskKey: task.taskKey,
          assigneeUserId,
          ownerUserId: task.ownerUserId,
          assignedByUserId: session.user.id
        },
        metadata: { source: "project-task-assignment" }
      }
    });

    await notifyProjectTaskAssigned(tx, {
      project: {
        id: project.id,
        tenantId: project.tenantId,
        companyId: project.companyId,
        locationId: project.locationId,
        code: project.code,
        name: project.name,
        isRestricted: project.isRestricted,
        managerUserId: project.managerUserId,
        sponsorUserId: project.sponsorUserId
      },
      task: {
        id: task.id,
        taskKey: task.taskKey,
        title: task.title,
        assigneeUserId,
        actorUserId: session.user.id,
        priority: task.priority
      }
    });

    return task;
  });

  return createdTask.id;
}

export async function reassignProjectTask(formData: FormData) {
  const session = await requireSessionContext();
  const values = reassignTaskSchema.parse({
    taskId: formData.get("taskId"),
    assigneeUserId: formData.get("assigneeUserId"),
    expectedVersion: formData.get("expectedVersion"),
    reason: formData.get("reason")
  });

  const task = await prisma.projectTask.findFirst({
    where: {
      id: values.taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      project: {
        include: {
          members: {
            where: { status: "ACTIVE" },
            include: { user: true }
          }
        }
      }
    }
  });
  if (!task) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }
  if (task.version !== values.expectedVersion) {
    throw new Error("PROJECT_TASK_STALE_VERSION");
  }

  const canMutate = await getTaskMutationAccess(session, task.projectId);
  if (!canMutate) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }
  const assigneeMember = task.project.members.find(
    (member) =>
      member.userId === values.assigneeUserId &&
      member.status === "ACTIVE" &&
      member.user.status === "ACTIVE"
  );
  if (!assigneeMember) {
    throw new Error("PROJECT_TASK_ASSIGNEE_NOT_PROJECT_MEMBER");
  }
  if (values.assigneeUserId === task.ownerUserId) {
    return task.id;
  }

  const dueState = projectTaskDueState({
    dueDate: task.dueDate,
    dueAt: task.dueAt,
    status: task.status
  });
  assertProjectTaskCanReassign({
    status: task.status as ProjectTaskStatus,
    priority: task.priority as ProjectTaskPriority,
    isOverdue: dueState.dueState === "OVERDUE",
    ...(values.reason ? { reason: values.reason } : {})
  });

  await prisma.$transaction(async (tx) => {
    const updated = await tx.projectTask.updateMany({
      where: {
        id: task.id,
        version: values.expectedVersion
      },
      data: {
        ownerUserId: values.assigneeUserId,
        updatedByUserId: session.user.id,
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) {
      throw new Error("PROJECT_TASK_STALE_VERSION");
    }

    await tx.projectTaskAssignee.updateMany({
      where: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        taskId: task.id,
        status: "ACTIVE"
      },
      data: {
        status: "INACTIVE",
        removedAt: new Date(),
        removedByUserId: session.user.id
      }
    });

    await tx.projectTaskAssignee.upsert({
      where: {
        taskId_userId: {
          taskId: task.id,
          userId: values.assigneeUserId
        }
      },
      create: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        taskId: task.id,
        userId: values.assigneeUserId,
        assignedByUserId: session.user.id
      },
      update: {
        status: "ACTIVE",
        assignedByUserId: session.user.id,
        removedAt: null,
        removedByUserId: null
      }
    });

    await tx.projectActivityEvent.create({
      data: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        actorUserId: session.user.id,
        eventType: "project_task.reassigned",
        entityType: "ProjectTask",
        entityId: task.id,
        reason: values.reason || null,
        beforeData: {
          ownerUserId: task.ownerUserId,
          version: task.version
        },
        afterData: {
          ownerUserId: values.assigneeUserId,
          assignedByUserId: session.user.id,
          version: task.version + 1
        },
        metadata: { source: "project-task-reassignment" }
      }
    });

    await notifyProjectTaskAssigned(tx, {
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
        title: task.title,
        assigneeUserId: values.assigneeUserId,
        actorUserId: session.user.id,
        priority: task.priority,
        sourceEventKeySuffix: `reassign-v${task.version + 1}`
      }
    });
  });

  return task.id;
}

export async function transitionProjectTask(formData: FormData) {
  const session = await requireSessionContext();
  const values = transitionTaskSchema.parse({
    taskId: formData.get("taskId"),
    nextStatus: formData.get("nextStatus"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    reason: formData.get("reason"),
    severity: formData.get("severity") || "MEDIUM",
    nextReviewAt: formData.get("nextReviewAt") || undefined,
    completionNote: formData.get("completionNote")
  });

  const task = await prisma.projectTask.findFirst({
    where: {
      id: values.taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      project: { include: { members: { where: { status: "ACTIVE" } } } },
      checklistItems: {
        where: { archivedAt: null },
        select: { isRequired: true, isCompleted: true }
      },
      attachments: {
        where: { status: "ACTIVE", archivedAt: null },
        select: { id: true }
      },
      recordLinks: {
        where: { archivedAt: null },
        select: { id: true }
      }
    }
  });
  if (!task) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }
  if (values.expectedVersion && task.version !== values.expectedVersion) {
    throw new Error("PROJECT_TASK_STALE_VERSION");
  }

  const canMutate = await getTaskMutationAccess(session, task.projectId);
  const taskPolicy = await getProjectTaskPolicy(session);
  assertTaskTransition({
    currentStatus: task.status as ProjectTaskStatus,
    nextStatus: values.nextStatus,
    canMutate,
    blockerReasonRequired: taskPolicy.blockerReasonRequired,
    ...(values.reason ? { reason: values.reason } : {})
  });
  assertProjectTaskStatusEnabled({
    projectConfigJson: task.project.projectConfigJson,
    nextStatus: values.nextStatus
  });
  const expansionTaskKind = assertExpansionSpecializedTaskTransition({
    description: task.description,
    currentStatus: task.status as ProjectTaskStatus,
    nextStatus: values.nextStatus,
    hasStructuredEvidence: hasExpansionStructuredEvidence({
      description: task.description,
      activeAttachmentCount: task.attachments.length,
      sourceRecordLinkCount: task.recordLinks.length
    }),
    actorUserId: session.user.id,
    ownerUserId: task.ownerUserId,
    createdByUserId: task.createdByUserId,
    sponsorUserId: task.project.sponsorUserId
  });
  if (
    expansionTaskKind &&
    ["EXPANSION_FEASIBILITY_MODEL", "EXPANSION_CAPEX_PROCUREMENT_ITEM"].includes(
      expansionTaskKind
    ) &&
    !canViewExpansionFinancialEstimates(session.permissionCodes)
  ) {
    throw new Error("EXPANSION_FINANCIAL_PERMISSION_DENIED");
  }
  if (
    values.nextStatus === "COMPLETED" &&
    task.checklistItems.some((item) => item.isRequired && !item.isCompleted)
  ) {
    throw new Error("PROJECT_TASK_REQUIRED_CHECKLIST_INCOMPLETE");
  }

  const now = new Date();
  const nextReviewAt = values.nextReviewAt ? new Date(values.nextReviewAt) : null;
  const shouldCloseOpenBlockers =
    task.status === "BLOCKED" && values.nextStatus !== "BLOCKED";
  await prisma.$transaction(async (tx) => {
    const updateData: Parameters<typeof prisma.projectTask.update>[0]["data"] = {
      status: values.nextStatus,
      updatedByUserId: session.user.id,
      version: { increment: 1 },
      isBlocked: false,
      blockedReason: null,
      blockedAt: null,
      blockedByUserId: null,
      completedAt: null,
      completedByUserId: null,
      completionNote: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancelReason: null
    };

    if (values.nextStatus === "BLOCKED") {
      Object.assign(updateData, {
        isBlocked: true,
        blockedReason: values.reason,
        blockedAt: now,
        blockedByUserId: session.user.id
      });
    }
    if (values.nextStatus === "COMPLETED") {
      Object.assign(updateData, {
        completedAt: now,
        completedByUserId: session.user.id,
        completionNote: values.completionNote || null
      });
    }
    if (values.nextStatus === "CANCELLED") {
      Object.assign(updateData, {
        cancelledAt: now,
        cancelledByUserId: session.user.id,
        cancelReason: values.reason
      });
    }
    if (["BACKLOG", "PLANNED", "IN_PROGRESS"].includes(values.nextStatus)) {
      Object.assign(updateData, {
        lastReopenedAt:
          task.status === "COMPLETED" || task.status === "CANCELLED" ? now : task.lastReopenedAt,
        lastReopenedByUserId:
          task.status === "COMPLETED" || task.status === "CANCELLED"
            ? session.user.id
            : task.lastReopenedByUserId,
        lastReopenReason:
          task.status === "COMPLETED" || task.status === "CANCELLED"
            ? values.reason
            : task.lastReopenReason
      });
    }

    const updateResult = await tx.projectTask.updateMany({
      where: {
        id: task.id,
        tenantId: task.tenantId,
        companyId: task.companyId,
        version: task.version,
        archivedAt: null
      },
      data: updateData
    });
    if (updateResult.count !== 1) {
      throw new Error("PROJECT_TASK_STALE_VERSION");
    }
    const updated = await tx.projectTask.findUniqueOrThrow({
      where: { id: task.id }
    });

    if (values.nextStatus === "BLOCKED") {
      await tx.projectBlocker.create({
        data: {
          tenantId: task.tenantId,
          companyId: task.companyId,
          projectId: task.projectId,
          taskId: task.id,
          reason: values.reason ?? "",
          blockerType: "TASK_BLOCKER",
          severity: values.severity,
          ownerUserId: task.ownerUserId,
          reportedByUserId: session.user.id,
          nextReviewAt
        }
      });
    }

    if (shouldCloseOpenBlockers) {
      const openBlockers = await tx.projectBlocker.findMany({
        where: {
          tenantId: task.tenantId,
          companyId: task.companyId,
          projectId: task.projectId,
          taskId: task.id,
          status: "OPEN"
        },
        select: {
          id: true,
          status: true
        }
      });
      const blockerStatus =
        values.nextStatus === "CANCELLED" ? "CANCELLED" : "RESOLVED";
      const resolutionNote =
        values.reason ||
        values.completionNote ||
        `Task moved to ${values.nextStatus}`;

      if (openBlockers.length > 0) {
        await tx.projectBlocker.updateMany({
          where: {
            id: { in: openBlockers.map((blocker) => blocker.id) },
            status: "OPEN"
          },
          data: {
            status: blockerStatus,
            resolvedAt: now,
            resolvedByUserId: session.user.id,
            resolutionNote
          }
        });

        await tx.projectActivityEvent.createMany({
          data: openBlockers.map((blocker) => ({
            tenantId: task.tenantId,
            companyId: task.companyId,
            projectId: task.projectId,
            actorUserId: session.user.id,
            eventType:
              blockerStatus === "CANCELLED"
                ? "project_blocker.cancelled"
                : "project_blocker.resolved",
            entityType: "ProjectBlocker",
            entityId: blocker.id,
            reason: resolutionNote,
            beforeData: { status: blocker.status },
            afterData: {
              status: blockerStatus,
              taskId: task.id,
              taskStatus: values.nextStatus
            },
            metadata: { source: "project-task-blocker-resolution" }
          }))
        });
      }
    }

    await tx.projectActivityEvent.create({
      data: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        actorUserId: session.user.id,
        eventType: "project_task.status_changed",
        entityType: "ProjectTask",
        entityId: task.id,
        reason: values.reason || values.completionNote || null,
        beforeData: {
          status: task.status,
          isBlocked: task.isBlocked,
          completedAt: task.completedAt?.toISOString() ?? null,
          cancelledAt: task.cancelledAt?.toISOString() ?? null
        },
        afterData: {
          status: updated.status,
          isBlocked: updated.isBlocked,
          completedAt: updated.completedAt?.toISOString() ?? null,
          cancelledAt: updated.cancelledAt?.toISOString() ?? null,
          openBlockersClosed: shouldCloseOpenBlockers,
          nextReviewAt: nextReviewAt?.toISOString() ?? null
        },
        metadata: { source: "project-task-foundation" }
      }
    });

    if (values.nextStatus === "BLOCKED") {
      await notifyProjectTaskBlocked(tx, {
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
          version: updated.version
        }
      });
    }
  });
}

export async function resolveProjectTaskBlocker(formData: FormData) {
  const session = await requireSessionContext();
  const values = resolveBlockerSchema.parse({
    blockerId: formData.get("blockerId"),
    taskId: formData.get("taskId"),
    nextStatus: formData.get("nextStatus"),
    resolutionNote: formData.get("resolutionNote")
  });

  const blocker = await prisma.projectBlocker.findFirst({
    where: {
      id: values.blockerId,
      taskId: values.taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    include: {
      task: {
        select: {
          id: true,
          projectId: true,
          archivedAt: true
        }
      }
    }
  });
  if (!blocker || blocker.task.archivedAt) {
    throw new Error("PROJECT_BLOCKER_NOT_FOUND");
  }
  if (blocker.status !== "OPEN") {
    throw new Error("PROJECT_BLOCKER_NOT_OPEN");
  }

  const canMutate = await getTaskMutationAccess(session, blocker.projectId);
  if (!canMutate) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.projectBlocker.updateMany({
      where: {
        id: blocker.id,
        tenantId: blocker.tenantId,
        companyId: blocker.companyId,
        projectId: blocker.projectId,
        taskId: blocker.taskId,
        status: "OPEN"
      },
      data: {
        status: values.nextStatus,
        resolvedAt: now,
        resolvedByUserId: session.user.id,
        resolutionNote: values.resolutionNote
      }
    });
    if (updated.count !== 1) {
      throw new Error("PROJECT_BLOCKER_NOT_OPEN");
    }

    await tx.projectActivityEvent.create({
      data: {
        tenantId: blocker.tenantId,
        companyId: blocker.companyId,
        projectId: blocker.projectId,
        actorUserId: session.user.id,
        eventType:
          values.nextStatus === "CANCELLED"
            ? "project_blocker.cancelled"
            : "project_blocker.resolved",
        entityType: "ProjectBlocker",
        entityId: blocker.id,
        reason: values.resolutionNote,
        beforeData: {
          status: blocker.status,
          taskId: blocker.taskId,
          reason: blocker.reason,
          severity: blocker.severity
        },
        afterData: {
          status: values.nextStatus,
          taskId: blocker.taskId,
          resolvedAt: now.toISOString()
        },
        metadata: { source: "project-task-blocker-manual-resolution" }
      }
    });
  });

  return blocker.taskId;
}

async function findMutableTask(session: SessionContext, taskId: string) {
  const task = await prisma.projectTask.findFirst({
    where: {
      id: taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    select: {
      id: true,
      tenantId: true,
      companyId: true,
      projectId: true,
      status: true
    }
  });
  if (!task) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }
  const canMutate = await getTaskMutationAccess(session, task.projectId);
  if (!canMutate) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }
  return task;
}

export async function addProjectTaskChecklistItem(formData: FormData) {
  const session = await requireSessionContext();
  const values = addChecklistItemSchema.parse({
    taskId: formData.get("taskId"),
    title: formData.get("title"),
    isRequired: formData.get("isRequired") === "on"
  });
  const task = await findMutableTask(session, values.taskId);

  await prisma.$transaction(async (tx) => {
    const position = await tx.projectTaskChecklistItem.count({
      where: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        taskId: task.id,
        archivedAt: null
      }
    });
    const item = await tx.projectTaskChecklistItem.create({
      data: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        taskId: task.id,
        title: values.title,
        position: position + 1,
        isRequired: values.isRequired,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id
      }
    });
    await tx.projectActivityEvent.create({
      data: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        actorUserId: session.user.id,
        eventType: "project_task_checklist_item.created",
        entityType: "ProjectTaskChecklistItem",
        entityId: item.id,
        afterData: {
          taskId: task.id,
          title: item.title,
          isRequired: item.isRequired
        },
        metadata: { source: "project-task-checklist-comments" }
      }
    });
  });
}

export async function toggleProjectTaskChecklistItem(formData: FormData) {
  const session = await requireSessionContext();
  const values = toggleChecklistItemSchema.parse({
    checklistItemId: formData.get("checklistItemId"),
    isCompleted: formData.get("isCompleted") === "true"
  });
  const item = await prisma.projectTaskChecklistItem.findFirst({
    where: {
      id: values.checklistItemId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    select: {
      id: true,
      tenantId: true,
      companyId: true,
      projectId: true,
      taskId: true,
      title: true,
      isCompleted: true
    }
  });
  if (!item) {
    throw new Error("PROJECT_CHECKLIST_ITEM_NOT_FOUND");
  }
  await findMutableTask(session, item.taskId);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.projectTaskChecklistItem.update({
      where: { id: item.id },
      data: {
        isCompleted: values.isCompleted,
        completedAt: values.isCompleted ? now : null,
        completedByUserId: values.isCompleted ? session.user.id : null,
        updatedByUserId: session.user.id
      }
    });
    await tx.projectActivityEvent.create({
      data: {
        tenantId: item.tenantId,
        companyId: item.companyId,
        projectId: item.projectId,
        actorUserId: session.user.id,
        eventType: values.isCompleted
          ? "project_task_checklist_item.completed"
          : "project_task_checklist_item.reopened",
        entityType: "ProjectTaskChecklistItem",
        entityId: item.id,
        beforeData: { isCompleted: item.isCompleted },
        afterData: { isCompleted: updated.isCompleted },
        metadata: {
          taskId: item.taskId,
          source: "project-task-checklist-comments"
        }
      }
    });
  });
}

export async function addProjectTaskComment(formData: FormData) {
  const session = await requireSessionContext();
  const values = addCommentSchema.parse({
    taskId: formData.get("taskId"),
    body: formData.get("body")
  });
  const task = await findMutableTask(session, values.taskId);

  await prisma.$transaction(async (tx) => {
    const comment = await tx.projectComment.create({
      data: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        taskId: task.id,
        authorUserId: session.user.id,
        body: values.body
      }
    });
    await tx.projectActivityEvent.create({
      data: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        actorUserId: session.user.id,
        eventType: "project_comment.created",
        entityType: "ProjectComment",
        entityId: comment.id,
        afterData: {
          taskId: task.id,
          bodyPreview: comment.body.slice(0, 120)
        },
        metadata: { source: "project-task-checklist-comments" }
      }
    });
  });
}

async function logProjectAttachmentDenied(input: {
  session: SessionContext;
  taskId?: string;
  projectId?: string;
  attachmentId?: string;
  reasonCode: string;
  attemptedAction: "CREATE" | "ARCHIVE" | "RELINK";
}) {
  await recordSessionDeniedDecisionSafely(input.session, {
    action: input.attemptedAction === "ARCHIVE" ? "DELETE" : "CREATE",
    reason: input.reasonCode === "PROJECT_ATTACHMENT_NOT_FOUND" ||
        input.reasonCode === "ATTACHMENT_NOT_FOUND_INACTIVE_OR_UNSCOPED"
      ? "RESOURCE_HIDDEN"
      : "POLICY_DENIED",
    resource: "PROJECTS"
  });
}

export async function addProjectTaskAttachment(formData: FormData) {
  const session = await requireSessionContext();
  const values = addAttachmentSchema.parse({
    taskId: formData.get("taskId"),
    attachmentId: formData.get("attachmentId"),
    purpose: formData.get("purpose") || "EVIDENCE",
    caption: formData.get("caption")
  });
  const task = await findMutableTask(session, values.taskId);
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: values.attachmentId,
      tenantId: session.context.tenantId,
      status: "ACTIVE",
      projectLinks: {
        some: {
          tenantId: task.tenantId,
          companyId: task.companyId,
          projectId: task.projectId,
          status: "ACTIVE",
          archivedAt: null
        }
      }
    },
    select: {
      id: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true
    }
  });
  if (!attachment) {
    await logProjectAttachmentDenied({
      session,
      taskId: task.id,
      projectId: task.projectId,
      attachmentId: values.attachmentId,
      reasonCode: "ATTACHMENT_NOT_FOUND_INACTIVE_OR_UNSCOPED",
      attemptedAction: "RELINK"
    });
    throw new Error("PROJECT_ATTACHMENT_NOT_FOUND");
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.projectAttachment.findFirst({
      where: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        taskId: task.id,
        attachmentId: attachment.id,
        status: "ACTIVE",
        archivedAt: null
      }
    });
    if (existing) {
      return;
    }
    const link = await tx.projectAttachment.create({
      data: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        taskId: task.id,
        attachmentId: attachment.id,
        purpose: values.purpose,
        caption: values.caption || null,
        createdByUserId: session.user.id
      }
    });
    await tx.projectActivityEvent.create({
      data: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        actorUserId: session.user.id,
        eventType: "project_attachment.added",
        entityType: "ProjectAttachment",
        entityId: link.id,
        afterData: {
          taskId: task.id,
          purpose: link.purpose,
          caption: link.caption,
          originalFilename: attachment.originalFilename,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes
        },
        metadata: { source: "project-task-attachments" }
      }
    });
  });
}

export async function archiveProjectTaskAttachment(formData: FormData) {
  const session = await requireSessionContext();
  const values = archiveAttachmentSchema.parse({
    projectAttachmentId: formData.get("projectAttachmentId"),
    archiveReason: formData.get("archiveReason")
  });
  const link = await prisma.projectAttachment.findFirst({
    where: {
      id: values.projectAttachmentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE",
      archivedAt: null
    },
    include: {
      attachment: true,
      requirement: { select: { isRequired: true } }
    }
  });
  if (!link || !link.taskId) {
    await logProjectAttachmentDenied({
      session,
      reasonCode: "PROJECT_ATTACHMENT_NOT_FOUND",
      attemptedAction: "ARCHIVE",
      ...(link?.taskId ? { taskId: link.taskId } : {}),
      ...(link?.projectId ? { projectId: link.projectId } : {}),
      ...(link?.attachmentId ? { attachmentId: link.attachmentId } : {})
    });
    throw new Error("PROJECT_ATTACHMENT_NOT_FOUND");
  }
  if (link.attachment.legalHold || link.requirement?.isRequired) {
    await logProjectAttachmentDenied({
      session,
      reasonCode: link.attachment.legalHold
        ? "PROJECT_ATTACHMENT_LEGAL_HOLD_ARCHIVE_DENIED"
        : "PROJECT_REQUIRED_EVIDENCE_ARCHIVE_DENIED",
      attemptedAction: "ARCHIVE",
      taskId: link.taskId,
      projectId: link.projectId,
      attachmentId: link.attachmentId
    });
    throw new Error("PROJECT_ATTACHMENT_NOT_FOUND");
  }
  const task = await findMutableTask(session, link.taskId);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "Attachment"
      WHERE "id" = ${link.attachmentId}::uuid
        AND "tenantId" = ${link.tenantId}::uuid
        AND "companyId" = ${link.companyId}::uuid
      FOR UPDATE
    `;
    const preservationState = await tx.attachment.findFirst({
      where: {
        id: link.attachmentId,
        tenantId: link.tenantId,
        companyId: link.companyId
      },
      select: { legalHold: true }
    });
    if (!preservationState || preservationState.legalHold) {
      throw new Error("PROJECT_ATTACHMENT_NOT_FOUND");
    }
    const archived = await tx.projectAttachment.update({
      where: { id: link.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByUserId: session.user.id,
        archiveReason: values.archiveReason
      }
    });
    await tx.projectActivityEvent.create({
      data: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        actorUserId: session.user.id,
        eventType: "project_attachment.archived",
        entityType: "ProjectAttachment",
        entityId: archived.id,
        reason: values.archiveReason,
        beforeData: {
          status: link.status,
          taskId: link.taskId,
          purpose: link.purpose,
          originalFilename: link.attachment.originalFilename
        },
        afterData: {
          status: archived.status,
          archivedAt: archived.archivedAt?.toISOString() ?? null
        },
        metadata: { source: "project-task-attachments" }
      }
    });
  });
}
