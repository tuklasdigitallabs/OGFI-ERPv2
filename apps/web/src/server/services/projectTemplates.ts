import { prisma } from "@ogfi/database";
import { z } from "zod";
import {
  canConfigureProjectTemplates,
  canUseProjects,
  permissions,
} from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";
import { expansionProjectTypes } from "./expansionProjectTypes";

export type ProjectTemplateStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type ProjectTemplateCard = {
  id: string;
  code: string;
  name: string;
  projectType: string;
  status: ProjectTemplateStatus;
  isRestrictedDefault: boolean;
  statusSet: string[];
  taskCount: number;
  milestoneCount: number;
  sourceTemplateId: string | null;
  lineageRootTemplateId: string | null;
  revisionNumber: number;
  version: number;
  createdAt: string;
  canConfigure: boolean;
};

export type ExpansionOpeningPlaybookDetail = ProjectTemplateCard & {
  config: ProjectTemplateConfig;
  canEdit: boolean;
};

export type PublishedProjectTemplateOption = {
  id: string;
  code: string;
  name: string;
  projectType: string;
  isRestrictedDefault: boolean;
};

type ProjectJsonInput =
  | string
  | number
  | boolean
  | ProjectJsonInput[]
  | { [key: string]: ProjectJsonInput | null };
type ProjectJsonObject = { [key: string]: ProjectJsonInput | null };

const validTaskStatuses = [
  "BACKLOG",
  "PLANNED",
  "IN_PROGRESS",
  "WAITING_FOR_APPROVAL",
  "BLOCKED",
  "FOR_REVIEW",
  "COMPLETED",
  "CANCELLED",
] as const;
const validTaskPriorities = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
const validOwnerRoles = [
  "PROJECT_MANAGER",
  "PROJECT_SPONSOR",
  "CREATOR",
] as const;
const validEvidenceTypes = [
  "DOCUMENT",
  "PHOTO",
  "SOURCE_RECORD_LINK",
  "APPROVAL_NOTE",
] as const;
const validSignoffStages = [
  "SITE_HANDOVER",
  "PERMIT_READY",
  "CONSTRUCTION_READY",
  "OPS_READY",
  "GO_NO_GO",
  "STABILIZATION",
] as const;

const templateOwnerSchema = z.object({
  type: z.literal("ROLE"),
  value: z.enum(validOwnerRoles),
});

const templateChecklistItemSchema = z.object({
  title: z.string().trim().min(2).max(180),
  required: z.boolean().default(false),
});

const templateTaskSchema = z.object({
  templateTaskCode: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(validTaskPriorities).default("NORMAL"),
  status: z.enum(validTaskStatuses).default("PLANNED"),
  owner: templateOwnerSchema.default({
    type: "ROLE",
    value: "PROJECT_MANAGER",
  }),
  startOffsetDays: z.number().int().min(-180).max(730).optional(),
  dueOffsetDays: z.number().int().min(-180).max(730).optional(),
  checklistItems: z.array(templateChecklistItemSchema).max(50).default([]),
});

const templateMilestoneSchema = z.object({
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional(),
  targetOffsetDays: z.number().int().min(-180).max(730).optional(),
  owner: templateOwnerSchema.default({
    type: "ROLE",
    value: "PROJECT_MANAGER",
  }),
});

const templateEvidenceDefaultSchema = z.object({
  code: z.string().trim().min(1).max(40),
  label: z.string().trim().min(2).max(180),
  evidenceType: z.enum(validEvidenceTypes).default("DOCUMENT"),
  taskCode: z.string().trim().min(1).max(40).optional(),
  owner: templateOwnerSchema.default({
    type: "ROLE",
    value: "PROJECT_MANAGER",
  }),
  required: z.boolean().default(true),
});

const templateSignoffDefaultSchema = z.object({
  code: z.string().trim().min(1).max(40),
  label: z.string().trim().min(2).max(180),
  stage: z.enum(validSignoffStages).default("GO_NO_GO"),
  owner: templateOwnerSchema.default({
    type: "ROLE",
    value: "PROJECT_SPONSOR",
  }),
  required: z.boolean().default(true),
});

const projectTemplateConfigSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  statusSet: z.array(z.enum(validTaskStatuses)).min(1),
  defaults: z
    .object({
      initialTaskStatus: z.enum(validTaskStatuses).default("PLANNED"),
      ownerAssignment: z.literal("PROJECT_MANAGER").default("PROJECT_MANAGER"),
    })
    .default({
      initialTaskStatus: "PLANNED",
      ownerAssignment: "PROJECT_MANAGER",
    }),
  notificationDefaults: z
    .object({
      dueSoonWindowDays: z.number().int().min(0).max(30).default(2),
      overdueReminderFrequencyDays: z.number().int().min(1).max(30).default(1),
      maxOverdueRemindersPerTask: z.number().int().min(1).max(30).default(5),
    })
    .default({
      dueSoonWindowDays: 2,
      overdueReminderFrequencyDays: 1,
      maxOverdueRemindersPerTask: 5,
    }),
  tasks: z.array(templateTaskSchema).max(100).default([]),
  milestones: z.array(templateMilestoneSchema).max(50).default([]),
  evidenceDefaults: z.array(templateEvidenceDefaultSchema).max(50).default([]),
  signoffDefaults: z.array(templateSignoffDefaultSchema).max(50).default([]),
  source: z.string().optional(),
});

export type ProjectTemplateConfig = z.infer<typeof projectTemplateConfigSchema>;
export type ProjectTemplateTaskDefault = ProjectTemplateConfig["tasks"][number];
export type ProjectTemplateMilestoneDefault =
  ProjectTemplateConfig["milestones"][number];
export type ProjectTemplateEvidenceDefault =
  ProjectTemplateConfig["evidenceDefaults"][number];
export type ProjectTemplateSignoffDefault =
  ProjectTemplateConfig["signoffDefaults"][number];

const createTemplateSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  projectType: z.string().trim().min(2).max(80),
  isRestrictedDefault: z.coerce.boolean().default(false),
});

const expansionPlaybookProjectTypes = expansionProjectTypes;

const expansionPlaybookProjectTypeSet = new Set(
  expansionPlaybookProjectTypes.map((type) => type.toUpperCase()),
);

const createOpeningPlaybookSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  projectType: z.enum(expansionPlaybookProjectTypes).default("Branch Opening"),
  isRestrictedDefault: z.coerce.boolean().default(false),
});

const updateOpeningPlaybookOverviewSchema = z.object({
  id: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  name: z.string().trim().min(2).max(160),
  projectType: z.enum(expansionPlaybookProjectTypes).default("Branch Opening"),
  isRestrictedDefault: z.coerce.boolean().default(false),
});

const templateActionSchema = z.object({
  id: z.string().uuid(),
});

const versionedTemplateActionSchema = templateActionSchema.extend({
  expectedVersion: z.coerce.number().int().positive(),
});

const duplicateOpeningPlaybookRevisionSchema = z.object({
  sourceTemplateId: z.string().uuid(),
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160).optional(),
});

const templateLifecycleActionSchema = versionedTemplateActionSchema.extend({
  reason: z.string().trim().min(5).max(1000),
});

const templateTaskActionSchema = versionedTemplateActionSchema.extend({
  originalTaskCode: z.string().trim().min(1).max(40).optional(),
});

const upsertTemplateTaskSchema = templateTaskActionSchema.extend({
  templateTaskCode: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(validTaskPriorities).default("NORMAL"),
  status: z.enum(validTaskStatuses).default("PLANNED"),
  ownerRole: z.enum(validOwnerRoles).default("PROJECT_MANAGER"),
  startOffsetDays: z.coerce.number().int().min(-180).max(730).optional(),
  dueOffsetDays: z.coerce.number().int().min(-180).max(730).optional(),
  checklistItems: z.string().trim().max(4000).optional(),
});

const removeTemplateTaskSchema = templateTaskActionSchema.extend({
  templateTaskCode: z.string().trim().min(1).max(40),
});

const templateMilestoneActionSchema = versionedTemplateActionSchema.extend({
  originalCode: z.string().trim().min(1).max(40).optional(),
});

const upsertTemplateMilestoneSchema = templateMilestoneActionSchema.extend({
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional(),
  targetOffsetDays: z.coerce.number().int().min(-180).max(730).optional(),
  ownerRole: z.enum(validOwnerRoles).default("PROJECT_MANAGER"),
});

const removeTemplateMilestoneSchema = templateMilestoneActionSchema.extend({
  code: z.string().trim().min(1).max(40),
});

const templateChecklistActionSchema = versionedTemplateActionSchema.extend({
  taskCode: z.string().trim().min(1).max(40),
  originalTaskCode: z.string().trim().min(1).max(40).optional(),
  originalTitle: z.string().trim().min(2).max(180).optional(),
});

const upsertTemplateChecklistSchema = templateChecklistActionSchema.extend({
  title: z.string().trim().min(2).max(180),
  required: z.coerce.boolean().default(false),
});

const removeTemplateChecklistSchema = templateChecklistActionSchema.extend({
  title: z.string().trim().min(2).max(180),
});

const templateEvidenceActionSchema = versionedTemplateActionSchema.extend({
  originalCode: z.string().trim().min(1).max(40).optional(),
});

const upsertTemplateEvidenceSchema = templateEvidenceActionSchema.extend({
  code: z.string().trim().min(1).max(40),
  label: z.string().trim().min(2).max(180),
  evidenceType: z.enum(validEvidenceTypes).default("DOCUMENT"),
  taskCode: z.string().trim().min(1).max(40).optional(),
  ownerRole: z.enum(validOwnerRoles).default("PROJECT_MANAGER"),
  required: z.coerce.boolean().default(false),
});

const removeTemplateEvidenceSchema = templateEvidenceActionSchema.extend({
  code: z.string().trim().min(1).max(40),
});

const templateSignoffActionSchema = versionedTemplateActionSchema.extend({
  originalCode: z.string().trim().min(1).max(40).optional(),
});

const upsertTemplateSignoffSchema = templateSignoffActionSchema.extend({
  code: z.string().trim().min(1).max(40),
  label: z.string().trim().min(2).max(180),
  stage: z.enum(validSignoffStages).default("GO_NO_GO"),
  ownerRole: z.enum(validOwnerRoles).default("PROJECT_SPONSOR"),
  required: z.coerce.boolean().default(false),
});

const removeTemplateSignoffSchema = templateSignoffActionSchema.extend({
  code: z.string().trim().min(1).max(40),
});

const updateTemplateReminderSchema = versionedTemplateActionSchema.extend({
  dueSoonWindowDays: z.coerce.number().int().min(0).max(30),
  overdueReminderFrequencyDays: z.coerce.number().int().min(1).max(30),
  maxOverdueRemindersPerTask: z.coerce.number().int().min(1).max(30),
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
      "CANCELLED",
    ],
    defaults: {
      initialTaskStatus: "PLANNED",
      ownerAssignment: "PROJECT_MANAGER",
    },
    notificationDefaults: {
      dueSoonWindowDays: 2,
      overdueReminderFrequencyDays: 1,
      maxOverdueRemindersPerTask: 5,
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
          { title: "Confirm participants and working scope", required: true },
        ],
      },
    ],
    milestones: [
      {
        code: "MS-001",
        title: "Readiness checkpoint",
        targetOffsetDays: 5,
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
      },
    ],
    evidenceDefaults: [
      {
        code: "EV-SCOPE",
        label: "Kickoff scope confirmation",
        evidenceType: "DOCUMENT",
        taskCode: "T-001",
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
        required: true,
      },
    ],
    signoffDefaults: [
      {
        code: "SO-READINESS",
        label: "Readiness checkpoint signoff",
        stage: "GO_NO_GO",
        owner: { type: "ROLE", value: "PROJECT_SPONSOR" },
        required: true,
      },
    ],
    source: "project-template-foundation",
  };
}

function readStatusSet(configJson: unknown) {
  if (
    typeof configJson === "object" &&
    configJson !== null &&
    "statusSet" in configJson &&
    Array.isArray(configJson.statusSet)
  ) {
    return configJson.statusSet.filter(
      (status): status is string => typeof status === "string",
    );
  }
  return [];
}

function readTemplateCounts(configJson: unknown) {
  if (typeof configJson !== "object" || configJson === null) {
    return { taskCount: 0, milestoneCount: 0 };
  }
  const tasks =
    "tasks" in configJson && Array.isArray(configJson.tasks)
      ? configJson.tasks
      : [];
  const milestones =
    "milestones" in configJson && Array.isArray(configJson.milestones)
      ? configJson.milestones
      : [];
  return {
    taskCount: tasks.length,
    milestoneCount: milestones.length,
  };
}

function openingPlaybookConfig() {
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
      "CANCELLED",
    ],
    defaults: {
      initialTaskStatus: "PLANNED",
      ownerAssignment: "PROJECT_MANAGER",
    },
    notificationDefaults: {
      dueSoonWindowDays: 3,
      overdueReminderFrequencyDays: 1,
      maxOverdueRemindersPerTask: 5,
    },
    tasks: [
      {
        templateTaskCode: "SITE-001",
        title: "Confirm site handover package",
        priority: "HIGH",
        status: "PLANNED",
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
        dueOffsetDays: 3,
        checklistItems: [
          { title: "Attach mall or landlord handover notes", required: true },
          {
            title: "Confirm target opening date and constraints",
            required: true,
          },
        ],
      },
      {
        templateTaskCode: "PERMIT-001",
        title: "Track opening permits and required documents",
        priority: "HIGH",
        status: "PLANNED",
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
        dueOffsetDays: 10,
        checklistItems: [
          { title: "List required permits and renewal owners", required: true },
          { title: "Record document evidence references", required: true },
        ],
      },
      {
        templateTaskCode: "CAPEX-001",
        title: "Coordinate capex and equipment procurement",
        priority: "HIGH",
        status: "PLANNED",
        owner: { type: "ROLE", value: "PROJECT_SPONSOR" },
        dueOffsetDays: 14,
        checklistItems: [
          {
            title: "Link approved procurement or finance source records",
            required: true,
          },
          { title: "Confirm critical long-lead items", required: true },
        ],
      },
      {
        templateTaskCode: "CONST-001",
        title: "Monitor construction and contractor readiness",
        priority: "HIGH",
        status: "PLANNED",
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
        dueOffsetDays: 21,
        checklistItems: [
          { title: "Record contractor progress update", required: true },
          {
            title: "Capture blocked or safety-critical issues",
            required: true,
          },
        ],
      },
      {
        templateTaskCode: "OPS-001",
        title: "Complete operations opening readiness",
        priority: "CRITICAL",
        status: "PLANNED",
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
        dueOffsetDays: 28,
        checklistItems: [
          { title: "Confirm opening inventory readiness", required: true },
          { title: "Confirm training and dry-run readiness", required: true },
          { title: "Confirm IT/POS setup evidence reference", required: true },
        ],
      },
      {
        templateTaskCode: "GO-001",
        title: "Prepare opening go/no-go review",
        priority: "CRITICAL",
        status: "PLANNED",
        owner: { type: "ROLE", value: "PROJECT_SPONSOR" },
        dueOffsetDays: 30,
        checklistItems: [
          { title: "Review unresolved punch list items", required: true },
          {
            title: "Record go/no-go evidence and approver notes",
            required: true,
          },
        ],
      },
    ],
    milestones: [
      {
        code: "MS-SITE",
        title: "Site handover confirmed",
        targetOffsetDays: 3,
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
      },
      {
        code: "MS-PERMIT",
        title: "Permit readiness checkpoint",
        targetOffsetDays: 14,
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
      },
      {
        code: "MS-CONSTRUCTION",
        title: "Construction completion checkpoint",
        targetOffsetDays: 24,
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
      },
      {
        code: "MS-OPENING",
        title: "Opening go/no-go checkpoint",
        targetOffsetDays: 30,
        owner: { type: "ROLE", value: "PROJECT_SPONSOR" },
      },
      {
        code: "MS-STABILIZATION",
        title: "30-day stabilization review",
        targetOffsetDays: 60,
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
      },
    ],
    evidenceDefaults: [
      {
        code: "EV-SITE-HANDOVER",
        label: "Site handover package",
        evidenceType: "DOCUMENT",
        taskCode: "SITE-001",
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
        required: true,
      },
      {
        code: "EV-PERMITS",
        label: "Permit and license evidence",
        evidenceType: "DOCUMENT",
        taskCode: "PERMIT-001",
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
        required: true,
      },
      {
        code: "EV-CAPEX-SOURCE",
        label: "Approved capex or procurement source links",
        evidenceType: "SOURCE_RECORD_LINK",
        taskCode: "CAPEX-001",
        owner: { type: "ROLE", value: "PROJECT_SPONSOR" },
        required: true,
      },
      {
        code: "EV-CONSTRUCTION-PROGRESS",
        label: "Construction progress photo or contractor report",
        evidenceType: "PHOTO",
        taskCode: "CONST-001",
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
        required: true,
      },
      {
        code: "EV-GO-NOGO",
        label: "Go/no-go review notes",
        evidenceType: "APPROVAL_NOTE",
        taskCode: "GO-001",
        owner: { type: "ROLE", value: "PROJECT_SPONSOR" },
        required: true,
      },
    ],
    signoffDefaults: [
      {
        code: "SO-SITE-HANDOVER",
        label: "Site handover accepted",
        stage: "SITE_HANDOVER",
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
        required: true,
      },
      {
        code: "SO-PERMIT-READY",
        label: "Permits ready for opening",
        stage: "PERMIT_READY",
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
        required: true,
      },
      {
        code: "SO-OPS-READY",
        label: "Operations readiness confirmed",
        stage: "OPS_READY",
        owner: { type: "ROLE", value: "PROJECT_MANAGER" },
        required: true,
      },
      {
        code: "SO-GO-NOGO",
        label: "Opening go/no-go approval",
        stage: "GO_NO_GO",
        owner: { type: "ROLE", value: "PROJECT_SPONSOR" },
        required: true,
      },
    ],
    source: "expansion-opening-playbook",
  };
}

function mapTemplateCard(
  template: Awaited<ReturnType<typeof prisma.projectTemplate.findMany>>[number],
  canConfigure: boolean,
): ProjectTemplateCard {
  const counts = readTemplateCounts(template.configJson);
  return {
    id: template.id,
    code: template.code,
    name: template.name,
    projectType: template.projectType,
    status: template.status,
    isRestrictedDefault: template.isRestrictedDefault,
    statusSet: readStatusSet(template.configJson),
    taskCount: counts.taskCount,
    milestoneCount: counts.milestoneCount,
    sourceTemplateId: template.sourceTemplateId,
    lineageRootTemplateId: template.lineageRootTemplateId,
    revisionNumber: template.revisionNumber,
    version: template.version,
    createdAt: template.createdAt.toISOString(),
    canConfigure,
  };
}

function assertProjectTemplateJson(
  value: ProjectTemplateConfig,
): ProjectJsonInput {
  return value as ProjectJsonInput;
}

function optionalNumberField(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  return value;
}

function checklistLinesFromText(value: string | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((title) => ({
      title: title.replace(/^\*\s*/, "").trim(),
      required: true,
    }));
}

async function getEditableExpansionPlaybook(
  session: SessionContext,
  id: string,
) {
  assertCanConfigureTemplates(session);
  const template = await prisma.projectTemplate.findFirst({
    where: {
      id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
  });
  if (!template) {
    throw new Error("PROJECT_TEMPLATE_NOT_FOUND");
  }
  if (
    !expansionPlaybookProjectTypeSet.has(template.projectType.toUpperCase())
  ) {
    throw new Error("PROJECT_TEMPLATE_NOT_FOUND");
  }
  if (template.status !== "DRAFT") {
    throw new Error("PROJECT_TEMPLATE_NOT_DRAFT");
  }
  return {
    template,
    config: parseProjectTemplateConfig(template.configJson),
  };
}

type EditableExpansionPlaybook = Awaited<
  ReturnType<typeof getEditableExpansionPlaybook>
>["template"];

async function updateExpansionPlaybookDraft(input: {
  session: SessionContext;
  template: EditableExpansionPlaybook;
  expectedVersion: number;
  changeType: string;
  data: {
    name?: string;
    projectType?: string;
    isRestrictedDefault?: boolean;
    configJson?: ProjectJsonInput;
  };
  beforeData: ProjectJsonObject;
  afterData: ProjectJsonObject;
}) {
  if (input.template.version !== input.expectedVersion) {
    throw new Error("PROJECT_TEMPLATE_STALE_VERSION");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.projectTemplate.updateMany({
      where: {
        id: input.template.id,
        tenantId: input.session.context.tenantId,
        companyId: input.session.context.companyId,
        status: "DRAFT",
        version: input.expectedVersion,
      },
      data: {
        ...input.data,
        updatedByUserId: input.session.user.id,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new Error("PROJECT_TEMPLATE_STALE_VERSION");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: input.template.tenantId,
        companyId: input.template.companyId,
        actorUserId: input.session.user.id,
        eventType: "expansion.opening_playbook.draft_updated",
        entityType: "ProjectTemplate",
        entityId: input.template.id,
        beforeData: {
          ...input.beforeData,
          version: input.expectedVersion,
        },
        afterData: {
          ...input.afterData,
          version: input.expectedVersion + 1,
        },
        metadata: {
          source: "expansion-opening-playbook-revision",
          changeType: input.changeType,
        },
      },
    });
  });
}

async function updateExpansionPlaybookConfig(input: {
  session: SessionContext;
  template: EditableExpansionPlaybook;
  expectedVersion: number;
  changeType: string;
  nextConfig: ProjectTemplateConfig;
}) {
  parseProjectTemplateConfig(input.nextConfig);
  await updateExpansionPlaybookDraft({
    ...input,
    data: { configJson: assertProjectTemplateJson(input.nextConfig) },
    beforeData: { configChanged: false },
    afterData: { configChanged: true },
  });
}

export function assertProjectTemplateCanPublish(configJson: unknown) {
  const config = parseProjectTemplateConfig(configJson);
  const statusSet = new Set(config.statusSet);
  if (config.tasks.length === 0 || config.milestones.length === 0) {
    throw new Error("PROJECT_TEMPLATE_CONFIG_INVALID");
  }
  if (
    !statusSet.has("IN_PROGRESS") ||
    !statusSet.has("COMPLETED") ||
    !statusSet.has("CANCELLED")
  ) {
    throw new Error("PROJECT_TEMPLATE_STATUS_SET_INCOMPLETE");
  }
}

export function parseProjectTemplateConfig(
  configJson: unknown,
): ProjectTemplateConfig {
  const config = projectTemplateConfigSchema.parse(configJson);
  const taskCodes = new Set<string>();
  for (const task of config.tasks) {
    const normalizedTaskCode = task.templateTaskCode.toUpperCase();
    if (taskCodes.has(normalizedTaskCode)) {
      throw new Error("PROJECT_TEMPLATE_TASK_CODE_DUPLICATE");
    }
    taskCodes.add(normalizedTaskCode);
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
  const milestoneCodes = new Set<string>();
  for (const milestone of config.milestones) {
    const normalizedMilestoneCode = milestone.code.toUpperCase();
    if (milestoneCodes.has(normalizedMilestoneCode)) {
      throw new Error("PROJECT_TEMPLATE_MILESTONE_CODE_DUPLICATE");
    }
    milestoneCodes.add(normalizedMilestoneCode);
  }
  const evidenceCodes = new Set<string>();
  for (const evidence of config.evidenceDefaults) {
    const normalizedEvidenceCode = evidence.code.toUpperCase();
    if (evidenceCodes.has(normalizedEvidenceCode)) {
      throw new Error("PROJECT_TEMPLATE_EVIDENCE_CODE_DUPLICATE");
    }
    evidenceCodes.add(normalizedEvidenceCode);
    if (evidence.taskCode && !taskCodes.has(evidence.taskCode.toUpperCase())) {
      throw new Error("PROJECT_TEMPLATE_EVIDENCE_TASK_NOT_FOUND");
    }
  }
  const signoffCodes = new Set<string>();
  for (const signoff of config.signoffDefaults) {
    const normalizedSignoffCode = signoff.code.toUpperCase();
    if (signoffCodes.has(normalizedSignoffCode)) {
      throw new Error("PROJECT_TEMPLATE_SIGNOFF_CODE_DUPLICATE");
    }
    signoffCodes.add(normalizedSignoffCode);
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
      companyId: session.context.companyId,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  const canConfigure = session.permissionCodes.includes(
    permissions.projectTemplateConfigure,
  );
  return templates.map((template) => mapTemplateCard(template, canConfigure));
}

export async function listExpansionOpeningPlaybooks(session: SessionContext) {
  if (
    !canUseProjects(session.permissionCodes) &&
    !canConfigureProjectTemplates(session.permissionCodes)
  ) {
    throw new Error("PERMISSION_DENIED");
  }
  const templates = await prisma.projectTemplate.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    orderBy: [{ status: "asc" }, { projectType: "asc" }, { name: "asc" }],
  });
  const canConfigure = session.permissionCodes.includes(
    permissions.projectTemplateConfigure,
  );
  return templates
    .filter((template) =>
      expansionPlaybookProjectTypeSet.has(template.projectType.toUpperCase()),
    )
    .map((template) => mapTemplateCard(template, canConfigure));
}

export async function getExpansionOpeningPlaybook(
  session: SessionContext,
  id: string,
): Promise<ExpansionOpeningPlaybookDetail> {
  if (
    !canUseProjects(session.permissionCodes) &&
    !canConfigureProjectTemplates(session.permissionCodes)
  ) {
    throw new Error("PERMISSION_DENIED");
  }
  const template = await prisma.projectTemplate.findFirst({
    where: {
      id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
  });
  if (
    !template ||
    !expansionPlaybookProjectTypeSet.has(template.projectType.toUpperCase())
  ) {
    throw new Error("PROJECT_TEMPLATE_NOT_FOUND");
  }
  const canConfigure = session.permissionCodes.includes(
    permissions.projectTemplateConfigure,
  );
  return {
    ...mapTemplateCard(template, canConfigure),
    config: parseProjectTemplateConfig(template.configJson),
    canEdit: canConfigure && template.status === "DRAFT",
  };
}

export async function listPublishedProjectTemplatesForProjectCreate(
  session: SessionContext,
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
      status: "PUBLISHED",
    },
    orderBy: [{ projectType: "asc" }, { name: "asc" }],
  });
  return templates.map(
    (template): PublishedProjectTemplateOption => ({
      id: template.id,
      code: template.code,
      name: template.name,
      projectType: template.projectType,
      isRestrictedDefault: template.isRestrictedDefault,
    }),
  );
}

export async function createProjectTemplate(formData: FormData) {
  const session = await requireSessionContext();
  assertCanConfigureTemplates(session);
  const values = createTemplateSchema.parse({
    code: formData.get("code"),
    name: formData.get("name"),
    projectType: formData.get("projectType"),
    isRestrictedDefault: formData.get("isRestrictedDefault") === "on",
  });
  const code = values.code.toUpperCase();
  const existingTemplate = await prisma.projectTemplate.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      code,
    },
    select: { id: true },
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
      updatedByUserId: session.user.id,
    },
  });

  return created.id;
}

export async function createExpansionOpeningPlaybook(formData: FormData) {
  const session = await requireSessionContext();
  assertCanConfigureTemplates(session);
  const values = createOpeningPlaybookSchema.parse({
    code: formData.get("code"),
    name: formData.get("name"),
    projectType: formData.get("projectType"),
    isRestrictedDefault: formData.get("isRestrictedDefault") === "on",
  });
  const code = values.code.toUpperCase();
  const existingTemplate = await prisma.projectTemplate.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      code,
    },
    select: { id: true },
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
      configJson: openingPlaybookConfig(),
      createdByUserId: session.user.id,
      updatedByUserId: session.user.id,
    },
  });

  return created.id;
}

export async function duplicateExpansionOpeningPlaybookRevision(
  formData: FormData,
) {
  const session = await requireSessionContext();
  assertCanConfigureTemplates(session);
  const values = duplicateOpeningPlaybookRevisionSchema.parse({
    sourceTemplateId: formData.get("sourceTemplateId"),
    code: formData.get("code"),
    name: formData.get("name") || undefined,
  });
  const code = values.code.toUpperCase();

  return prisma.$transaction(async (tx) => {
    const source = await tx.projectTemplate.findFirst({
      where: {
        id: values.sourceTemplateId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["PUBLISHED", "ARCHIVED"] },
      },
    });
    if (
      !source ||
      !expansionPlaybookProjectTypeSet.has(source.projectType.toUpperCase())
    ) {
      throw new Error("PROJECT_TEMPLATE_REVISION_SOURCE_NOT_FOUND");
    }
    const sourceConfig = parseProjectTemplateConfig(source.configJson);

    const duplicateCode = await tx.projectTemplate.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        code,
      },
      select: { id: true },
    });
    if (duplicateCode) {
      throw new Error("PROJECT_TEMPLATE_CODE_DUPLICATE");
    }

    const lineageRootTemplateId = source.lineageRootTemplateId ?? source.id;
    const latestRevision = await tx.projectTemplate.aggregate({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        OR: [{ id: lineageRootTemplateId }, { lineageRootTemplateId }],
      },
      _max: { revisionNumber: true },
    });
    const revisionNumber = (latestRevision._max.revisionNumber ?? 0) + 1;
    const created = await tx.projectTemplate.create({
      data: {
        tenantId: source.tenantId,
        companyId: source.companyId,
        code,
        name: values.name ?? source.name,
        projectType: source.projectType,
        status: "DRAFT",
        isRestrictedDefault: source.isRestrictedDefault,
        configJson: assertProjectTemplateJson(sourceConfig),
        sourceTemplateId: source.id,
        lineageRootTemplateId,
        revisionNumber,
        version: 1,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id,
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: source.tenantId,
        companyId: source.companyId,
        actorUserId: session.user.id,
        eventType: "expansion.opening_playbook.revision_created",
        entityType: "ProjectTemplate",
        entityId: created.id,
        afterData: {
          status: "DRAFT",
          code,
          revisionNumber,
          version: 1,
        },
        metadata: {
          source: "expansion-opening-playbook-revision",
          sourceTemplateId: source.id,
          sourceStatus: source.status,
          sourceRevisionNumber: source.revisionNumber,
          lineageRootTemplateId,
        },
      },
    });

    return created.id;
  });
}

export async function updateExpansionOpeningPlaybookOverview(
  formData: FormData,
) {
  const session = await requireSessionContext();
  const values = updateOpeningPlaybookOverviewSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    name: formData.get("name"),
    projectType: formData.get("projectType"),
    isRestrictedDefault: formData.get("isRestrictedDefault") === "on",
  });
  const { template } = await getEditableExpansionPlaybook(session, values.id);
  await updateExpansionPlaybookDraft({
    session,
    template,
    expectedVersion: values.expectedVersion,
    changeType: "overview",
    data: {
      name: values.name,
      projectType: values.projectType,
      isRestrictedDefault: values.isRestrictedDefault,
    },
    beforeData: {
      name: template.name,
      projectType: template.projectType,
      isRestrictedDefault: template.isRestrictedDefault,
    },
    afterData: {
      name: values.name,
      projectType: values.projectType,
      isRestrictedDefault: values.isRestrictedDefault,
    },
  });
}

export async function upsertExpansionOpeningPlaybookTask(formData: FormData) {
  const session = await requireSessionContext();
  const values = upsertTemplateTaskSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    originalTaskCode: formData.get("originalTaskCode") || undefined,
    templateTaskCode: formData.get("templateTaskCode"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    priority: formData.get("priority"),
    status: formData.get("status"),
    ownerRole: formData.get("ownerRole"),
    startOffsetDays: optionalNumberField(formData.get("startOffsetDays")),
    dueOffsetDays: optionalNumberField(formData.get("dueOffsetDays")),
    checklistItems: formData.get("checklistItems") || undefined,
  });
  const { template, config } = await getEditableExpansionPlaybook(
    session,
    values.id,
  );
  const nextTask = {
    templateTaskCode: values.templateTaskCode.toUpperCase(),
    title: values.title,
    ...(values.description ? { description: values.description } : {}),
    priority: values.priority,
    status: values.status,
    owner: { type: "ROLE" as const, value: values.ownerRole },
    ...(typeof values.startOffsetDays === "number"
      ? { startOffsetDays: values.startOffsetDays }
      : {}),
    ...(typeof values.dueOffsetDays === "number"
      ? { dueOffsetDays: values.dueOffsetDays }
      : {}),
    checklistItems: checklistLinesFromText(values.checklistItems),
  };
  const existingIndex = values.originalTaskCode
    ? config.tasks.findIndex(
        (task) =>
          task.templateTaskCode.toUpperCase() ===
          values.originalTaskCode?.toUpperCase(),
      )
    : -1;
  const nextConfig: ProjectTemplateConfig = {
    ...config,
    tasks:
      existingIndex >= 0
        ? config.tasks.map((task, index) =>
            index === existingIndex ? nextTask : task,
          )
        : [...config.tasks, nextTask],
    evidenceDefaults:
      existingIndex >= 0 && values.originalTaskCode
        ? config.evidenceDefaults.map((evidence) =>
            evidence.taskCode?.toUpperCase() ===
            values.originalTaskCode?.toUpperCase()
              ? { ...evidence, taskCode: nextTask.templateTaskCode }
              : evidence,
          )
        : config.evidenceDefaults,
  };
  await updateExpansionPlaybookConfig({
    session,
    template,
    expectedVersion: values.expectedVersion,
    changeType: "task.upserted",
    nextConfig,
  });
}

export async function removeExpansionOpeningPlaybookTask(formData: FormData) {
  const session = await requireSessionContext();
  const values = removeTemplateTaskSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    originalTaskCode: formData.get("originalTaskCode") || undefined,
    templateTaskCode: formData.get("templateTaskCode"),
  });
  const { template, config } = await getEditableExpansionPlaybook(
    session,
    values.id,
  );
  const nextConfig: ProjectTemplateConfig = {
    ...config,
    tasks: config.tasks.filter(
      (task) =>
        task.templateTaskCode.toUpperCase() !==
        values.templateTaskCode.toUpperCase(),
    ),
    evidenceDefaults: config.evidenceDefaults.map((evidence) =>
      evidence.taskCode?.toUpperCase() === values.templateTaskCode.toUpperCase()
        ? { ...evidence, taskCode: undefined }
        : evidence,
    ),
  };
  await updateExpansionPlaybookConfig({
    session,
    template,
    expectedVersion: values.expectedVersion,
    changeType: "task.removed",
    nextConfig,
  });
}

export async function upsertExpansionOpeningPlaybookMilestone(
  formData: FormData,
) {
  const session = await requireSessionContext();
  const values = upsertTemplateMilestoneSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    originalCode: formData.get("originalCode") || undefined,
    code: formData.get("code"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    targetOffsetDays: optionalNumberField(formData.get("targetOffsetDays")),
    ownerRole: formData.get("ownerRole"),
  });
  const { template, config } = await getEditableExpansionPlaybook(
    session,
    values.id,
  );
  const nextMilestone = {
    code: values.code.toUpperCase(),
    title: values.title,
    ...(values.description ? { description: values.description } : {}),
    ...(typeof values.targetOffsetDays === "number"
      ? { targetOffsetDays: values.targetOffsetDays }
      : {}),
    owner: { type: "ROLE" as const, value: values.ownerRole },
  };
  const existingIndex = values.originalCode
    ? config.milestones.findIndex(
        (milestone) =>
          milestone.code.toUpperCase() === values.originalCode?.toUpperCase(),
      )
    : -1;
  const nextConfig: ProjectTemplateConfig = {
    ...config,
    milestones:
      existingIndex >= 0
        ? config.milestones.map((milestone, index) =>
            index === existingIndex ? nextMilestone : milestone,
          )
        : [...config.milestones, nextMilestone],
  };
  await updateExpansionPlaybookConfig({
    session,
    template,
    expectedVersion: values.expectedVersion,
    changeType: "milestone.upserted",
    nextConfig,
  });
}

export async function removeExpansionOpeningPlaybookMilestone(
  formData: FormData,
) {
  const session = await requireSessionContext();
  const values = removeTemplateMilestoneSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    originalCode: formData.get("originalCode") || undefined,
    code: formData.get("code"),
  });
  const { template, config } = await getEditableExpansionPlaybook(
    session,
    values.id,
  );
  const nextConfig: ProjectTemplateConfig = {
    ...config,
    milestones: config.milestones.filter(
      (milestone) => milestone.code.toUpperCase() !== values.code.toUpperCase(),
    ),
  };
  await updateExpansionPlaybookConfig({
    session,
    template,
    expectedVersion: values.expectedVersion,
    changeType: "milestone.removed",
    nextConfig,
  });
}

export async function upsertExpansionOpeningPlaybookChecklistItem(
  formData: FormData,
) {
  const session = await requireSessionContext();
  const values = upsertTemplateChecklistSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    taskCode: formData.get("taskCode"),
    originalTaskCode: formData.get("originalTaskCode") || undefined,
    originalTitle: formData.get("originalTitle") || undefined,
    title: formData.get("title"),
    required: formData.get("required") === "on",
  });
  const { template, config } = await getEditableExpansionPlaybook(
    session,
    values.id,
  );
  const taskCode = values.taskCode.toUpperCase();
  const originalTaskCode = values.originalTaskCode?.toUpperCase() ?? taskCode;
  let didFindTask = false;
  const nextConfig: ProjectTemplateConfig = {
    ...config,
    tasks: config.tasks.map((task) => {
      const currentTaskCode = task.templateTaskCode.toUpperCase();
      const existingIndex = values.originalTitle
        ? task.checklistItems.findIndex(
            (item) =>
              item.title.toLowerCase() === values.originalTitle?.toLowerCase(),
          )
        : -1;
      const nextChecklistItem = {
        title: values.title,
        required: values.required,
      };
      if (
        currentTaskCode === originalTaskCode &&
        currentTaskCode !== taskCode
      ) {
        return {
          ...task,
          checklistItems: task.checklistItems.filter(
            (item) =>
              item.title.toLowerCase() !== values.originalTitle?.toLowerCase(),
          ),
        };
      }
      if (currentTaskCode !== taskCode) {
        return task;
      }
      didFindTask = true;
      return {
        ...task,
        checklistItems:
          existingIndex >= 0
            ? task.checklistItems.map((item, index) =>
                index === existingIndex ? nextChecklistItem : item,
              )
            : [...task.checklistItems, nextChecklistItem],
      };
    }),
  };
  if (!didFindTask) {
    throw new Error("PROJECT_TEMPLATE_TASK_NOT_FOUND");
  }
  await updateExpansionPlaybookConfig({
    session,
    template,
    expectedVersion: values.expectedVersion,
    changeType: "checklist_item.upserted",
    nextConfig,
  });
}

export async function removeExpansionOpeningPlaybookChecklistItem(
  formData: FormData,
) {
  const session = await requireSessionContext();
  const values = removeTemplateChecklistSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    taskCode: formData.get("taskCode"),
    originalTitle: formData.get("originalTitle") || undefined,
    title: formData.get("title"),
  });
  const { template, config } = await getEditableExpansionPlaybook(
    session,
    values.id,
  );
  const taskCode = values.taskCode.toUpperCase();
  let didFindTask = false;
  const nextConfig: ProjectTemplateConfig = {
    ...config,
    tasks: config.tasks.map((task) => {
      if (task.templateTaskCode.toUpperCase() !== taskCode) {
        return task;
      }
      didFindTask = true;
      return {
        ...task,
        checklistItems: task.checklistItems.filter(
          (item) => item.title.toLowerCase() !== values.title.toLowerCase(),
        ),
      };
    }),
  };
  if (!didFindTask) {
    throw new Error("PROJECT_TEMPLATE_TASK_NOT_FOUND");
  }
  await updateExpansionPlaybookConfig({
    session,
    template,
    expectedVersion: values.expectedVersion,
    changeType: "checklist_item.removed",
    nextConfig,
  });
}

export async function upsertExpansionOpeningPlaybookEvidenceDefault(
  formData: FormData,
) {
  const session = await requireSessionContext();
  const values = upsertTemplateEvidenceSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    originalCode: formData.get("originalCode") || undefined,
    code: formData.get("code"),
    label: formData.get("label"),
    evidenceType: formData.get("evidenceType"),
    taskCode: formData.get("taskCode") || undefined,
    ownerRole: formData.get("ownerRole"),
    required: formData.get("required") === "on",
  });
  const { template, config } = await getEditableExpansionPlaybook(
    session,
    values.id,
  );
  const nextEvidence = {
    code: values.code.toUpperCase(),
    label: values.label,
    evidenceType: values.evidenceType,
    ...(values.taskCode ? { taskCode: values.taskCode.toUpperCase() } : {}),
    owner: { type: "ROLE" as const, value: values.ownerRole },
    required: values.required,
  };
  const existingIndex = values.originalCode
    ? config.evidenceDefaults.findIndex(
        (evidence) =>
          evidence.code.toUpperCase() === values.originalCode?.toUpperCase(),
      )
    : -1;
  const nextConfig: ProjectTemplateConfig = {
    ...config,
    evidenceDefaults:
      existingIndex >= 0
        ? config.evidenceDefaults.map((evidence, index) =>
            index === existingIndex ? nextEvidence : evidence,
          )
        : [...config.evidenceDefaults, nextEvidence],
  };
  await updateExpansionPlaybookConfig({
    session,
    template,
    expectedVersion: values.expectedVersion,
    changeType: "evidence_default.upserted",
    nextConfig,
  });
}

export async function removeExpansionOpeningPlaybookEvidenceDefault(
  formData: FormData,
) {
  const session = await requireSessionContext();
  const values = removeTemplateEvidenceSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    originalCode: formData.get("originalCode") || undefined,
    code: formData.get("code"),
  });
  const { template, config } = await getEditableExpansionPlaybook(
    session,
    values.id,
  );
  const nextConfig: ProjectTemplateConfig = {
    ...config,
    evidenceDefaults: config.evidenceDefaults.filter(
      (evidence) => evidence.code.toUpperCase() !== values.code.toUpperCase(),
    ),
  };
  await updateExpansionPlaybookConfig({
    session,
    template,
    expectedVersion: values.expectedVersion,
    changeType: "evidence_default.removed",
    nextConfig,
  });
}

export async function upsertExpansionOpeningPlaybookSignoffDefault(
  formData: FormData,
) {
  const session = await requireSessionContext();
  const values = upsertTemplateSignoffSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    originalCode: formData.get("originalCode") || undefined,
    code: formData.get("code"),
    label: formData.get("label"),
    stage: formData.get("stage"),
    ownerRole: formData.get("ownerRole"),
    required: formData.get("required") === "on",
  });
  const { template, config } = await getEditableExpansionPlaybook(
    session,
    values.id,
  );
  const nextSignoff = {
    code: values.code.toUpperCase(),
    label: values.label,
    stage: values.stage,
    owner: { type: "ROLE" as const, value: values.ownerRole },
    required: values.required,
  };
  const existingIndex = values.originalCode
    ? config.signoffDefaults.findIndex(
        (signoff) =>
          signoff.code.toUpperCase() === values.originalCode?.toUpperCase(),
      )
    : -1;
  const nextConfig: ProjectTemplateConfig = {
    ...config,
    signoffDefaults:
      existingIndex >= 0
        ? config.signoffDefaults.map((signoff, index) =>
            index === existingIndex ? nextSignoff : signoff,
          )
        : [...config.signoffDefaults, nextSignoff],
  };
  await updateExpansionPlaybookConfig({
    session,
    template,
    expectedVersion: values.expectedVersion,
    changeType: "signoff_default.upserted",
    nextConfig,
  });
}

export async function removeExpansionOpeningPlaybookSignoffDefault(
  formData: FormData,
) {
  const session = await requireSessionContext();
  const values = removeTemplateSignoffSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    originalCode: formData.get("originalCode") || undefined,
    code: formData.get("code"),
  });
  const { template, config } = await getEditableExpansionPlaybook(
    session,
    values.id,
  );
  const nextConfig: ProjectTemplateConfig = {
    ...config,
    signoffDefaults: config.signoffDefaults.filter(
      (signoff) => signoff.code.toUpperCase() !== values.code.toUpperCase(),
    ),
  };
  await updateExpansionPlaybookConfig({
    session,
    template,
    expectedVersion: values.expectedVersion,
    changeType: "signoff_default.removed",
    nextConfig,
  });
}

export async function updateExpansionOpeningPlaybookReminders(
  formData: FormData,
) {
  const session = await requireSessionContext();
  const values = updateTemplateReminderSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    dueSoonWindowDays: formData.get("dueSoonWindowDays"),
    overdueReminderFrequencyDays: formData.get("overdueReminderFrequencyDays"),
    maxOverdueRemindersPerTask: formData.get("maxOverdueRemindersPerTask"),
  });
  const { template, config } = await getEditableExpansionPlaybook(
    session,
    values.id,
  );
  const nextConfig: ProjectTemplateConfig = {
    ...config,
    notificationDefaults: {
      dueSoonWindowDays: values.dueSoonWindowDays,
      overdueReminderFrequencyDays: values.overdueReminderFrequencyDays,
      maxOverdueRemindersPerTask: values.maxOverdueRemindersPerTask,
    },
  };
  await updateExpansionPlaybookConfig({
    session,
    template,
    expectedVersion: values.expectedVersion,
    changeType: "reminders.updated",
    nextConfig,
  });
}

export async function publishProjectTemplate(formData: FormData) {
  const session = await requireSessionContext();
  assertCanConfigureTemplates(session);
  const values = templateLifecycleActionSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    reason: formData.get("reason"),
  });
  const template = await prisma.projectTemplate.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "DRAFT",
    },
  });
  if (!template) {
    throw new Error("PROJECT_TEMPLATE_NOT_DRAFT");
  }
  if (template.version !== values.expectedVersion) {
    throw new Error("PROJECT_TEMPLATE_STALE_VERSION");
  }
  assertProjectTemplateCanPublish(template.configJson);
  await prisma.$transaction(async (tx) => {
    const published = await tx.projectTemplate.updateMany({
      where: {
        id: template.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "DRAFT",
        version: values.expectedVersion,
      },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishReason: values.reason,
        updatedByUserId: session.user.id,
        version: { increment: 1 },
      },
    });
    if (published.count !== 1) {
      throw new Error("PROJECT_TEMPLATE_STALE_VERSION");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: template.tenantId,
        companyId: template.companyId,
        actorUserId: session.user.id,
        eventType: "expansion.opening_playbook.published",
        entityType: "ProjectTemplate",
        entityId: template.id,
        beforeData: { status: template.status, version: template.version },
        afterData: {
          status: "PUBLISHED",
          version: template.version + 1,
        },
        metadata: {
          source: "expansion-opening-playbook-revision",
          reason: values.reason,
          revisionNumber: template.revisionNumber,
        },
      },
    });
  });
}

export async function archiveProjectTemplate(formData: FormData) {
  const session = await requireSessionContext();
  assertCanConfigureTemplates(session);
  const values = templateLifecycleActionSchema.parse({
    id: formData.get("id"),
    expectedVersion: formData.get("expectedVersion"),
    reason: formData.get("reason"),
  });
  const template = await prisma.projectTemplate.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: { not: "ARCHIVED" },
    },
  });
  if (!template) {
    throw new Error("PROJECT_TEMPLATE_NOT_FOUND");
  }
  if (template.version !== values.expectedVersion) {
    throw new Error("PROJECT_TEMPLATE_STALE_VERSION");
  }
  await prisma.$transaction(async (tx) => {
    const archived = await tx.projectTemplate.updateMany({
      where: {
        id: template.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { not: "ARCHIVED" },
        version: values.expectedVersion,
      },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archiveReason: values.reason,
        updatedByUserId: session.user.id,
        version: { increment: 1 },
      },
    });
    if (archived.count !== 1) {
      throw new Error("PROJECT_TEMPLATE_STALE_VERSION");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: template.tenantId,
        companyId: template.companyId,
        actorUserId: session.user.id,
        eventType: "expansion.opening_playbook.archived",
        entityType: "ProjectTemplate",
        entityId: template.id,
        beforeData: { status: template.status, version: template.version },
        afterData: {
          status: "ARCHIVED",
          version: template.version + 1,
        },
        metadata: {
          source: "expansion-opening-playbook-revision",
          reason: values.reason,
          revisionNumber: template.revisionNumber,
        },
      },
    });
  });
}
