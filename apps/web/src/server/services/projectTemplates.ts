import { prisma } from "@ogfi/database";
import { z } from "zod";
import { canConfigureProjectTemplates, permissions } from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";

export type ProjectTemplateStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type ProjectTemplateCard = {
  id: string;
  code: string;
  name: string;
  projectType: string;
  status: ProjectTemplateStatus;
  isRestrictedDefault: boolean;
  statusSet: string[];
  createdAt: string;
  canConfigure: boolean;
};

export type PublishedProjectTemplateOption = {
  id: string;
  code: string;
  name: string;
  projectType: string;
  isRestrictedDefault: boolean;
};

const validTaskStatuses = [
  "BACKLOG",
  "PLANNED",
  "IN_PROGRESS",
  "WAITING_FOR_APPROVAL",
  "BLOCKED",
  "FOR_REVIEW",
  "COMPLETED",
  "CANCELLED"
] as const;
const validTaskPriorities = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
const validOwnerRoles = ["PROJECT_MANAGER", "PROJECT_SPONSOR", "CREATOR"] as const;

const templateOwnerSchema = z.object({
  type: z.literal("ROLE"),
  value: z.enum(validOwnerRoles)
});

const templateChecklistItemSchema = z.object({
  title: z.string().trim().min(2).max(180),
  required: z.boolean().default(false)
});

const templateTaskSchema = z.object({
  templateTaskCode: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(validTaskPriorities).default("NORMAL"),
  status: z.enum(validTaskStatuses).default("PLANNED"),
  owner: templateOwnerSchema.default({ type: "ROLE", value: "PROJECT_MANAGER" }),
  startOffsetDays: z.number().int().min(-180).max(730).optional(),
  dueOffsetDays: z.number().int().min(-180).max(730).optional(),
  checklistItems: z.array(templateChecklistItemSchema).max(50).default([])
});

const templateMilestoneSchema = z.object({
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional(),
  targetOffsetDays: z.number().int().min(-180).max(730).optional(),
  owner: templateOwnerSchema.default({ type: "ROLE", value: "PROJECT_MANAGER" })
});

const projectTemplateConfigSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  statusSet: z.array(z.enum(validTaskStatuses)).min(1),
  defaults: z
    .object({
      initialTaskStatus: z.enum(validTaskStatuses).default("PLANNED"),
      ownerAssignment: z.literal("PROJECT_MANAGER").default("PROJECT_MANAGER")
    })
    .default({ initialTaskStatus: "PLANNED", ownerAssignment: "PROJECT_MANAGER" }),
  notificationDefaults: z
    .object({
      dueSoonWindowDays: z.number().int().min(0).max(30).default(2),
      overdueReminderFrequencyDays: z.number().int().min(1).max(30).default(1),
      maxOverdueRemindersPerTask: z.number().int().min(1).max(30).default(5)
    })
    .default({
      dueSoonWindowDays: 2,
      overdueReminderFrequencyDays: 1,
      maxOverdueRemindersPerTask: 5
    }),
  tasks: z.array(templateTaskSchema).max(100).default([]),
  milestones: z.array(templateMilestoneSchema).max(50).default([]),
  source: z.string().optional()
});

export type ProjectTemplateConfig = z.infer<typeof projectTemplateConfigSchema>;
export type ProjectTemplateTaskDefault = ProjectTemplateConfig["tasks"][number];
export type ProjectTemplateMilestoneDefault = ProjectTemplateConfig["milestones"][number];

const createTemplateSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  projectType: z.string().trim().min(2).max(80),
  isRestrictedDefault: z.coerce.boolean().default(false)
});

const templateActionSchema = z.object({
  id: z.string().uuid()
});

function defaultTemplateConfig() {
  return {
    schemaVersion: 1,
    statusSet: [
      "BACKLOG",
      "PLANNED",
      "IN_PROGRESS",
      "WAITING_FOR_APPROVAL",
      "BLOCKED",
      "FOR_REVIEW",
      "COMPLETED",
      "CANCELLED"
    ],
    defaults: {
      initialTaskStatus: "PLANNED",
      ownerAssignment: "PROJECT_MANAGER"
    },
    notificationDefaults: {
      dueSoonWindowDays: 2,
      overdueReminderFrequencyDays: 1,
      maxOverdueRemindersPerTask: 5
    },
    tasks: [
      {
        templateTaskCode: "T-001",
        title: "Confirm project kickoff scope",
        priority: "NORMAL",
        status: "PLANNED",
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
        dueOffsetDays: 2,
        checklistItems: [
          { title: "Confirm participants and working scope", required: true }
        ]
      }
    ],
    milestones: [
      {
        code: "MS-001",
        title: "Readiness checkpoint",
        targetOffsetDays: 5,
        owner: { type: "ROLE", value: "PROJECT_MANAGER" }
      }
    ],
    source: "project-template-foundation"
  };
}

function readStatusSet(configJson: unknown) {
  if (
    typeof configJson === "object" &&
    configJson !== null &&
    "statusSet" in configJson &&
    Array.isArray(configJson.statusSet)
  ) {
    return configJson.statusSet.filter((status): status is string => typeof status === "string");
  }
  return [];
}

export function assertProjectTemplateCanPublish(configJson: unknown) {
  const config = parseProjectTemplateConfig(configJson);
  const statusSet = new Set(config.statusSet);
  if (
    !statusSet.has("IN_PROGRESS") ||
    !statusSet.has("COMPLETED") ||
    !statusSet.has("CANCELLED")
  ) {
    throw new Error("PROJECT_TEMPLATE_STATUS_SET_INCOMPLETE");
  }
}

export function parseProjectTemplateConfig(configJson: unknown): ProjectTemplateConfig {
  const config = projectTemplateConfigSchema.parse(configJson);
  const taskCodes = new Set<string>();
  for (const task of config.tasks) {
    if (taskCodes.has(task.templateTaskCode)) {
      throw new Error("PROJECT_TEMPLATE_TASK_CODE_DUPLICATE");
    }
    taskCodes.add(task.templateTaskCode);
    if (!config.statusSet.includes(task.status)) {
      throw new Error("PROJECT_TEMPLATE_TASK_STATUS_DISABLED");
    }
    const checklistTitles = new Set<string>();
    for (const item of task.checklistItems) {
      const normalizedTitle = item.title.toLowerCase();
      if (checklistTitles.has(normalizedTitle)) {
        throw new Error("PROJECT_TEMPLATE_CHECKLIST_DUPLICATE");
      }
      checklistTitles.add(normalizedTitle);
    }
  }
  return config;
}

function assertCanConfigureTemplates(session: SessionContext) {
  if (!session.permissionCodes.includes(permissions.projectTemplateConfigure)) {
    throw new Error("PROJECT_TEMPLATE_PERMISSION_DENIED");
  }
}

export async function listProjectTemplates(session: SessionContext) {
  if (!canConfigureProjectTemplates(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
  const templates = await prisma.projectTemplate.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });
  const canConfigure = session.permissionCodes.includes(
    permissions.projectTemplateConfigure
  );
  return templates.map((template): ProjectTemplateCard => ({
    id: template.id,
    code: template.code,
    name: template.name,
    projectType: template.projectType,
    status: template.status,
    isRestrictedDefault: template.isRestrictedDefault,
    statusSet: readStatusSet(template.configJson),
    createdAt: template.createdAt.toISOString(),
    canConfigure
  }));
}

export async function listPublishedProjectTemplatesForProjectCreate(
  session: SessionContext
) {
  if (
    !session.permissionCodes.includes(permissions.projectCreate) &&
    !canConfigureProjectTemplates(session.permissionCodes)
  ) {
    throw new Error("PERMISSION_DENIED");
  }
  const templates = await prisma.projectTemplate.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "PUBLISHED"
    },
    orderBy: [{ projectType: "asc" }, { name: "asc" }]
  });
  return templates.map((template): PublishedProjectTemplateOption => ({
    id: template.id,
    code: template.code,
    name: template.name,
    projectType: template.projectType,
    isRestrictedDefault: template.isRestrictedDefault
  }));
}

export async function createProjectTemplate(formData: FormData) {
  const session = await requireSessionContext();
  assertCanConfigureTemplates(session);
  const values = createTemplateSchema.parse({
    code: formData.get("code"),
    name: formData.get("name"),
    projectType: formData.get("projectType"),
    isRestrictedDefault: formData.get("isRestrictedDefault") === "on"
  });
  const code = values.code.toUpperCase();
  const existingTemplate = await prisma.projectTemplate.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      code
    },
    select: { id: true }
  });
  if (existingTemplate) {
    throw new Error("PROJECT_TEMPLATE_CODE_DUPLICATE");
  }

  const created = await prisma.projectTemplate.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      code,
      name: values.name,
      projectType: values.projectType,
      isRestrictedDefault: values.isRestrictedDefault,
      configJson: defaultTemplateConfig(),
      createdByUserId: session.user.id,
      updatedByUserId: session.user.id
    }
  });

  return created.id;
}

export async function publishProjectTemplate(formData: FormData) {
  const session = await requireSessionContext();
  assertCanConfigureTemplates(session);
  const values = templateActionSchema.parse({ id: formData.get("id") });
  const template = await prisma.projectTemplate.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "DRAFT"
    }
  });
  if (!template) {
    throw new Error("PROJECT_TEMPLATE_NOT_DRAFT");
  }
  assertProjectTemplateCanPublish(template.configJson);
  await prisma.projectTemplate.update({
    where: { id: template.id },
    data: {
      status: "PUBLISHED",
      updatedByUserId: session.user.id
    }
  });
}

export async function archiveProjectTemplate(formData: FormData) {
  const session = await requireSessionContext();
  assertCanConfigureTemplates(session);
  const values = templateActionSchema.parse({ id: formData.get("id") });
  const template = await prisma.projectTemplate.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: { not: "ARCHIVED" }
    }
  });
  if (!template) {
    throw new Error("PROJECT_TEMPLATE_NOT_FOUND");
  }
  await prisma.projectTemplate.update({
    where: { id: template.id },
    data: {
      status: "ARCHIVED",
      updatedByUserId: session.user.id
    }
  });
}
