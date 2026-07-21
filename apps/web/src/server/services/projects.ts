import { prisma, type TransactionClient } from "@ogfi/database"
import { z } from "zod"
import {
  canUseProjects,
  getGrantedPermissionCodes,
  permissions,
  requirePermission
} from "./authorization"
import { requireSessionContext, type SessionContext } from "./context"
import {
  parseProjectTemplateConfig,
  type ProjectTemplateConfig
} from "./projectTemplates"

type ProjectAccessScope = {
  scopeType: "COMPANY" | "BRAND" | "LOCATION" | "DEPARTMENT" | "PROJECT"
  scopeId: string
  accessLevel: "VIEW" | "OPERATE" | "APPROVE" | "MANAGE"
}

type ProjectJsonInput =
  | string
  | number
  | boolean
  | ProjectJsonInput[]
  | { [key: string]: ProjectJsonInput | null }

export type ProjectSummary = {
  id: string
  code: string
  name: string
  status: string
  version: number
  projectType: string
  isRestricted: boolean
  scopeLabel: string
  sponsorName: string
  managerName: string
  memberCount: number
  startAt: string | null
  targetEndAt: string | null
  createdAt: string
  canMutateWork: boolean
  canManageLifecycle: boolean
}

export type ProjectMemberSummary = {
  id: string
  userId: string
  projectId: string
  projectCode: string
  projectName: string
  userName: string
  userEmail: string
  projectRole: string
  canRemove: boolean
}

export type ProjectMemberOption = {
  id: string
  displayName: string
  email: string
}

const createProjectSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  projectType: z.string().trim().min(2).max(80),
  templateId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  description: z.string().trim().max(2000).optional(),
  isRestricted: z.coerce.boolean().default(false),
  locationId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  sponsorUserId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  managerUserId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  targetEndAt: z
    .string()
    .optional()
    .or(z.literal("").transform(() => undefined))
})

const projectMemberRoles = [
  "SPONSOR",
  "MANAGER",
  "CONTRIBUTOR",
  "VIEWER"
] as const

const addProjectMemberSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  projectRole: z.enum(projectMemberRoles).default("VIEWER")
})

const removeProjectMemberSchema = z.object({
  memberId: z.string().uuid(),
  removalReason: z.string().trim().min(5).max(500)
})

const projectLifecycleStatuses = [
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
  "ARCHIVED"
] as const

const expansionLifecycleProjectTypes = new Set([
  "BRANCH OPENING",
  "BRANCH RELOCATION",
  "BRANCH RENOVATION",
  "BRANCH EXPANSION",
  "KITCHEN UPGRADE",
  "WAREHOUSE / COMMISSARY PROJECT",
  "MAJOR EQUIPMENT REPLACEMENT",
  "MALL COMPLIANCE PROJECT"
])

const transitionProjectLifecycleSchema = z.object({
  projectId: z.string().uuid(),
  nextStatus: z.enum(projectLifecycleStatuses),
  expectedVersion: z.coerce.number().int().positive().optional(),
  reason: z.string().trim().max(1000).optional()
})

const updateProjectLeadershipSchema = z.object({
  projectId: z.string().uuid(),
  sponsorUserId: z.string().uuid(),
  managerUserId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  reason: z.string().trim().min(5).max(1000)
})

const updateProjectDetailsSchema = z.object({
  projectId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  description: z.string().trim().max(2000).optional(),
  targetEndAt: z.string().optional().or(z.literal(""))
})

function projectScopeLabel(project: {
  brand?: { name: string } | null
  location?: { name: string } | null
  department?: { name: string } | null
  costCenter?: { name: string } | null
}) {
  return (
    project.location?.name ??
    project.department?.name ??
    project.costCenter?.name ??
    project.brand?.name ??
    "Company-wide"
  )
}

function defaultProjectConfig() {
  return {
    statusSet: ["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"],
    source: "foundation-default"
  }
}

function assertProjectTemplateJson(value: unknown): ProjectJsonInput {
  if (value === null) {
    throw new Error("PROJECT_TEMPLATE_CONFIG_INVALID")
  }
  return value as ProjectJsonInput
}

export function addProjectTemplateDateOffset(
  baseDate: Date,
  offsetDays: number
) {
  const next = new Date(baseDate)
  next.setUTCDate(next.getUTCDate() + offsetDays)
  return next
}

export function resolveProjectTemplateOwner(input: {
  role: "PROJECT_MANAGER" | "PROJECT_SPONSOR" | "CREATOR"
  managerUserId: string
  sponsorUserId: string
  creatorUserId: string
}) {
  if (input.role === "PROJECT_SPONSOR") {
    return input.sponsorUserId
  }
  if (input.role === "CREATOR") {
    return input.creatorUserId
  }
  return input.managerUserId
}

export function projectTemplateStartDate(input: {
  startAt: Date | null
  targetEndAt: Date | null
  createdAt: Date
}) {
  return input.startAt ?? input.targetEndAt ?? input.createdAt
}

type ProjectTemplateSeedProject = {
  id: string
  tenantId: string
  companyId: string
  code: string
  startAt: Date | null
  targetEndAt: Date | null
  createdAt: Date
  managerUserId: string
  sponsorUserId: string
}

export function buildProjectTemplateSeedPlan(input: {
  project: ProjectTemplateSeedProject
  templateConfig: ProjectTemplateConfig
  actorUserId: string
}) {
  const baseDate = projectTemplateStartDate(input.project)
  let taskSequence = 1

  const tasks = input.templateConfig.tasks.map((taskDefault) => {
    const ownerUserId = resolveProjectTemplateOwner({
      role: taskDefault.owner.value,
      managerUserId: input.project.managerUserId,
      sponsorUserId: input.project.sponsorUserId,
      creatorUserId: input.actorUserId
    })
    const taskKey = `${input.project.code}-${String(taskSequence).padStart(3, "0")}`
    taskSequence += 1

    return {
      templateTaskCode: taskDefault.templateTaskCode,
      taskKey,
      title: taskDefault.title,
      description: taskDefault.description ?? null,
      status: taskDefault.status,
      priority: taskDefault.priority,
      ownerUserId,
      startDate:
        typeof taskDefault.startOffsetDays === "number"
          ? addProjectTemplateDateOffset(baseDate, taskDefault.startOffsetDays)
          : null,
      dueDate:
        typeof taskDefault.dueOffsetDays === "number"
          ? addProjectTemplateDateOffset(baseDate, taskDefault.dueOffsetDays)
          : null,
      checklistItems: taskDefault.checklistItems.map((item, index) => ({
        title: item.title,
        position: index + 1,
        isRequired: item.required
      }))
    }
  })

  const milestones = input.templateConfig.milestones.map(
    (milestoneDefault) => ({
      code: milestoneDefault.code,
      title: milestoneDefault.title,
      description: milestoneDefault.description ?? null,
      targetDate:
        typeof milestoneDefault.targetOffsetDays === "number"
          ? addProjectTemplateDateOffset(
              baseDate,
              milestoneDefault.targetOffsetDays
            )
          : null,
      ownerUserId: resolveProjectTemplateOwner({
        role: milestoneDefault.owner.value,
        managerUserId: input.project.managerUserId,
        sponsorUserId: input.project.sponsorUserId,
        creatorUserId: input.actorUserId
      })
    })
  )

  const evidenceRequirements = input.templateConfig.evidenceDefaults.map(
    (defaultValue) => ({
      code: defaultValue.code.toUpperCase(),
      label: defaultValue.label,
      evidenceType: defaultValue.evidenceType,
      templateTaskCode: defaultValue.taskCode?.toUpperCase() ?? null,
      isRequired: defaultValue.required,
      ownerUserId: resolveProjectTemplateOwner({
        role: defaultValue.owner.value,
        managerUserId: input.project.managerUserId,
        sponsorUserId: input.project.sponsorUserId,
        creatorUserId: input.actorUserId
      })
    })
  )
  const signoffRequirements = input.templateConfig.signoffDefaults.map(
    (defaultValue) => {
      const ownerUserId = resolveProjectTemplateOwner({
        role: defaultValue.owner.value,
        managerUserId: input.project.managerUserId,
        sponsorUserId: input.project.sponsorUserId,
        creatorUserId: input.actorUserId
      })
      // Signoffs require independent review. For the two controlled project
      // leaders, assign the other leader as reviewer rather than silently
      // materializing a self-review deadlock.
      const reviewerUserId =
        ownerUserId === input.project.managerUserId
          ? input.project.sponsorUserId
          : input.project.managerUserId
      return {
        code: defaultValue.code.toUpperCase(),
        label: defaultValue.label,
        signoffStage: defaultValue.stage,
        isRequired: defaultValue.required,
        ownerUserId,
        reviewerUserId
      }
    }
  )

  return { tasks, milestones, evidenceRequirements, signoffRequirements }
}

export function buildProjectTemplateSnapshot(template: {
  id: string
  code: string
  name: string
  projectType: string
  isRestrictedDefault: boolean
  configJson: unknown
}) {
  return {
    templateId: template.id,
    code: template.code,
    name: template.name,
    projectType: template.projectType,
    isRestrictedDefault: template.isRestrictedDefault,
    configJson: assertProjectTemplateJson(template.configJson),
    snapshotVersion: 1
  }
}

async function applyProjectTemplateDefaults(
  tx: TransactionClient,
  input: {
    project: {
      id: string
      tenantId: string
      companyId: string
      code: string
      startAt: Date | null
      targetEndAt: Date | null
      createdAt: Date
      managerUserId: string
      sponsorUserId: string
    }
    templateConfig: ProjectTemplateConfig
    actorUserId: string
  }
) {
  const seedPlan = buildProjectTemplateSeedPlan(input)
  const taskIdByTemplateCode = new Map<string, string>()

  for (const taskDefault of seedPlan.tasks) {
    const task = await tx.projectTask.create({
      data: {
        tenantId: input.project.tenantId,
        companyId: input.project.companyId,
        projectId: input.project.id,
        taskKey: taskDefault.taskKey,
        title: taskDefault.title,
        description: taskDefault.description,
        status: taskDefault.status,
        priority: taskDefault.priority,
        ownerUserId: taskDefault.ownerUserId,
        startDate: taskDefault.startDate,
        dueDate: taskDefault.dueDate,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId
      }
    })

    await tx.projectTaskAssignee.create({
      data: {
        tenantId: input.project.tenantId,
        companyId: input.project.companyId,
        projectId: input.project.id,
        taskId: task.id,
        userId: taskDefault.ownerUserId,
        assignedByUserId: input.actorUserId
      }
    })

    if (taskDefault.checklistItems.length > 0) {
      await tx.projectTaskChecklistItem.createMany({
        data: taskDefault.checklistItems.map((item) => ({
          tenantId: input.project.tenantId,
          companyId: input.project.companyId,
          projectId: input.project.id,
          taskId: task.id,
          title: item.title,
          position: item.position,
          isRequired: item.isRequired,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId
        }))
      })
    }

    await tx.projectActivityEvent.create({
      data: {
        tenantId: input.project.tenantId,
        companyId: input.project.companyId,
        projectId: input.project.id,
        actorUserId: input.actorUserId,
        eventType: "project_task.created",
        entityType: "ProjectTask",
        entityId: task.id,
        afterData: {
          taskKey: taskDefault.taskKey,
          title: task.title,
          status: task.status,
          templateTaskCode: taskDefault.templateTaskCode
        },
        metadata: { source: "project-template-apply" }
      }
    })
    taskIdByTemplateCode.set(
      taskDefault.templateTaskCode.toUpperCase(),
      task.id
    )
  }

  for (const milestoneDefault of seedPlan.milestones) {
    const milestone = await tx.projectMilestone.create({
      data: {
        tenantId: input.project.tenantId,
        companyId: input.project.companyId,
        projectId: input.project.id,
        title: milestoneDefault.title,
        description: milestoneDefault.description,
        targetDate: milestoneDefault.targetDate,
        ownerUserId: milestoneDefault.ownerUserId,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId
      }
    })

    await tx.projectActivityEvent.create({
      data: {
        tenantId: input.project.tenantId,
        companyId: input.project.companyId,
        projectId: input.project.id,
        actorUserId: input.actorUserId,
        eventType: "project_milestone.created",
        entityType: "ProjectMilestone",
        entityId: milestone.id,
        afterData: {
          code: milestoneDefault.code,
          title: milestone.title,
          targetDate: milestone.targetDate?.toISOString().slice(0, 10) ?? null
        },
        metadata: { source: "project-template-apply" }
      }
    })
  }

  const requirements = [
    ...seedPlan.evidenceRequirements.map((requirement) => ({
      ...requirement,
      kind: "EVIDENCE" as const,
      taskId: requirement.templateTaskCode
        ? (taskIdByTemplateCode.get(requirement.templateTaskCode) ?? null)
        : null,
      reviewerUserId: null,
      signoffStage: null
    })),
    ...seedPlan.signoffRequirements.map((requirement) => ({
      ...requirement,
      kind: "SIGNOFF" as const,
      taskId: null,
      evidenceType: null,
      templateTaskCode: null
    }))
  ]

  for (const requirementDefault of requirements) {
    if (
      requirementDefault.kind === "EVIDENCE" &&
      requirementDefault.templateTaskCode &&
      !requirementDefault.taskId
    ) {
      throw new Error("PROJECT_TEMPLATE_REQUIREMENT_TASK_NOT_FOUND")
    }
    const requirement = await tx.projectRequirement.create({
      data: {
        tenantId: input.project.tenantId,
        companyId: input.project.companyId,
        projectId: input.project.id,
        taskId: requirementDefault.taskId,
        kind: requirementDefault.kind,
        code: requirementDefault.code,
        label: requirementDefault.label,
        evidenceType: requirementDefault.evidenceType,
        signoffStage: requirementDefault.signoffStage,
        isRequired: requirementDefault.isRequired,
        ownerUserId: requirementDefault.ownerUserId,
        reviewerUserId: requirementDefault.reviewerUserId,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId
      }
    })
    await tx.projectActivityEvent.create({
      data: {
        tenantId: input.project.tenantId,
        companyId: input.project.companyId,
        projectId: input.project.id,
        actorUserId: input.actorUserId,
        eventType: "project_requirement.created",
        entityType: "ProjectRequirement",
        entityId: requirement.id,
        afterData: {
          kind: requirement.kind,
          code: requirement.code,
          taskId: requirement.taskId,
          required: requirement.isRequired
        },
        metadata: { source: "project-template-apply" }
      }
    })
  }
}

export function hasCompanyManageScope(
  scopes: ProjectAccessScope[],
  companyId: string
) {
  return scopes.some(
    (scope) =>
      scope.scopeType === "COMPANY" &&
      scope.scopeId === companyId &&
      scope.accessLevel === "MANAGE"
  )
}

export function canAccessRestrictedProject(input: {
  isMember: boolean
  hasProjectScope: boolean
  canManageProjects: boolean
  hasCompanyManageScope: boolean
}) {
  return (
    input.isMember ||
    input.hasProjectScope ||
    (input.canManageProjects && input.hasCompanyManageScope)
  )
}

export function canAccessUnrestrictedProject(input: {
  isMember: boolean
  isOwner: boolean
  hasMatchingScope: boolean
  hasProjectScope: boolean
  canManageProjects: boolean
  hasCompanyManageScope: boolean
}) {
  return (
    input.isMember ||
    input.isOwner ||
    input.hasMatchingScope ||
    input.hasProjectScope ||
    (input.canManageProjects && input.hasCompanyManageScope)
  )
}

export async function getActiveProjectScopes(session: SessionContext) {
  const now = new Date()
  const assignments = await prisma.userScopeAssignment.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }]
    },
    select: {
      scopeType: true,
      scopeId: true,
      accessLevel: true
    }
  })

  return assignments as ProjectAccessScope[]
}

export function scopeMatchesProject(
  scopes: ProjectAccessScope[],
  project: {
    id: string
    companyId: string
    brandId: string | null
    locationId: string | null
    departmentId: string | null
  }
) {
  return scopes.some((scope) => {
    if (scope.scopeType === "COMPANY") {
      return scope.scopeId === project.companyId
    }
    if (scope.scopeType === "BRAND") {
      return scope.scopeId === project.brandId
    }
    if (scope.scopeType === "LOCATION") {
      return scope.scopeId === project.locationId
    }
    if (scope.scopeType === "DEPARTMENT") {
      return scope.scopeId === project.departmentId
    }
    if (scope.scopeType === "PROJECT") {
      return scope.scopeId === project.id
    }
    return false
  })
}

export function hasProjectScope(
  scopes: ProjectAccessScope[],
  projectId: string
) {
  return scopes.some(
    (scope) => scope.scopeType === "PROJECT" && scope.scopeId === projectId
  )
}

export type AuthorizedProjectAccess = {
  projectIds: string[]
  canMutateByProjectId: Map<string, boolean>
}

export async function listAuthorizedProjectAccess(session: SessionContext) {
  const permissionCodes = await getGrantedPermissionCodes(session)
  if (!canUseProjects(permissionCodes)) {
    throw new Error("PERMISSION_DENIED")
  }

  const scopes = await getActiveProjectScopes(session)
  const canManageProjects = permissionCodes.includes(permissions.projectManage)
  const companyManageScope = hasCompanyManageScope(
    scopes,
    session.context.companyId
  )
  const projects = await prisma.project.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      members: {
        where: { status: "ACTIVE" }
      }
    }
  })

  const projectIds: string[] = []
  const canMutateByProjectId = new Map<string, boolean>()
  for (const project of projects) {
    const isMember = project.members.some(
      (member) => member.userId === session.user.id
    )
    const isOwner =
      project.sponsorUserId === session.user.id ||
      project.managerUserId === session.user.id
    const projectScope = hasProjectScope(scopes, project.id)
    const canAccess = project.isRestricted
      ? canAccessRestrictedProject({
          isMember,
          hasProjectScope: projectScope,
          canManageProjects,
          hasCompanyManageScope: companyManageScope
        })
      : canAccessUnrestrictedProject({
          isMember,
          isOwner,
          hasMatchingScope: scopeMatchesProject(scopes, project),
          hasProjectScope: projectScope,
          canManageProjects,
          hasCompanyManageScope: companyManageScope
        })

    if (!canAccess) {
      continue
    }
    const memberRole =
      project.members.find((member) => member.userId === session.user.id)
        ?.projectRole ?? null
    projectIds.push(project.id)
    canMutateByProjectId.set(
      project.id,
      ["MANAGER", "ADMINISTRATOR", "CONTRIBUTOR"].includes(memberRole ?? "") ||
        isOwner ||
        (canManageProjects && companyManageScope)
    )
  }

  return { projectIds, canMutateByProjectId } satisfies AuthorizedProjectAccess
}

async function assertCanCreateProjectInScope(
  session: SessionContext,
  scopes: ProjectAccessScope[],
  values: { locationId: string | null }
) {
  await requirePermission(session, permissions.projectCreate)

  if (hasCompanyManageScope(scopes, session.context.companyId)) {
    return
  }

  if (!values.locationId) {
    throw new Error("PROJECT_SCOPE_REQUIRED")
  }

  const canCreateInLocation = scopes.some(
    (scope) =>
      scope.scopeType === "LOCATION" &&
      scope.scopeId === values.locationId &&
      ["OPERATE", "MANAGE"].includes(scope.accessLevel)
  )

  if (!canCreateInLocation) {
    throw new Error("PROJECT_SCOPE_DENIED")
  }
}

export async function listProjects(session: SessionContext) {
  const permissionCodes = await getGrantedPermissionCodes(session)
  if (!canUseProjects(permissionCodes)) {
    throw new Error("PERMISSION_DENIED")
  }

  const scopes = await getActiveProjectScopes(session)
  const canManageProjects = permissionCodes.includes(permissions.projectManage)
  const companyManageScope = hasCompanyManageScope(
    scopes,
    session.context.companyId
  )

  const projects = await prisma.project.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      brand: true,
      location: true,
      department: true,
      costCenter: true,
      sponsor: true,
      manager: true,
      members: {
        where: { status: "ACTIVE" },
        include: { user: true }
      }
    },
    orderBy: { createdAt: "desc" }
  })

  return projects
    .filter((project) => {
      const isMember = project.members.some(
        (member) => member.userId === session.user.id
      )
      const isOwner =
        project.sponsorUserId === session.user.id ||
        project.managerUserId === session.user.id
      const projectScope = hasProjectScope(scopes, project.id)
      if (project.isRestricted) {
        return canAccessRestrictedProject({
          isMember,
          hasProjectScope: projectScope,
          canManageProjects,
          hasCompanyManageScope: companyManageScope
        })
      }
      return canAccessUnrestrictedProject({
        isMember,
        isOwner,
        hasMatchingScope: scopeMatchesProject(scopes, project),
        hasProjectScope: projectScope,
        canManageProjects,
        hasCompanyManageScope: companyManageScope
      })
    })
    .map((project): ProjectSummary => {
      const memberRole =
        project.members.find((member) => member.userId === session.user.id)
          ?.projectRole ?? null
      const isOwner =
        project.sponsorUserId === session.user.id ||
        project.managerUserId === session.user.id
      return {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
        version: project.version,
        projectType: project.projectType,
        isRestricted: project.isRestricted,
        scopeLabel: projectScopeLabel(project),
        sponsorName: project.sponsor.displayName,
        managerName: project.manager.displayName,
        memberCount: project.members.length,
        startAt: project.startAt?.toISOString() ?? null,
        targetEndAt: project.targetEndAt?.toISOString() ?? null,
        createdAt: project.createdAt.toISOString(),
        canMutateWork:
          ["MANAGER", "ADMINISTRATOR", "CONTRIBUTOR"].includes(
            memberRole ?? ""
          ) ||
          isOwner ||
          (canManageProjects && companyManageScope),
        canManageLifecycle: canManageLifecycleForProject({
          session,
          project,
          hasCompanyManage: companyManageScope
        })
      }
    })
}

export async function findAuthorizedProject(
  session: SessionContext,
  projectId: string
) {
  const permissionCodes = await getGrantedPermissionCodes(session)
  if (!canUseProjects(permissionCodes)) {
    throw new Error("PERMISSION_DENIED")
  }

  const scopes = await getActiveProjectScopes(session)
  const canManageProjects = permissionCodes.includes(permissions.projectManage)
  const companyManageScope = hasCompanyManageScope(
    scopes,
    session.context.companyId
  )
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: { user: true }
      }
    }
  })

  if (!project) {
    return null
  }

  const isMember = project.members.some(
    (member) => member.userId === session.user.id
  )
  const isOwner =
    project.sponsorUserId === session.user.id ||
    project.managerUserId === session.user.id
  const projectScope = hasProjectScope(scopes, project.id)
  const canAccess = project.isRestricted
    ? canAccessRestrictedProject({
        isMember,
        hasProjectScope: projectScope,
        canManageProjects,
        hasCompanyManageScope: companyManageScope
      })
    : canAccessUnrestrictedProject({
        isMember,
        isOwner,
        hasMatchingScope: scopeMatchesProject(scopes, project),
        hasProjectScope: projectScope,
        canManageProjects,
        hasCompanyManageScope: companyManageScope
      })

  return canAccess ? project : null
}

function canManageMembersForProject(input: {
  session: SessionContext
  project: NonNullable<Awaited<ReturnType<typeof findAuthorizedProject>>>
  hasCompanyManage: boolean
}) {
  return (
    input.project.managerUserId === input.session.user.id ||
    input.project.sponsorUserId === input.session.user.id ||
    input.project.members.some(
      (member) =>
        member.userId === input.session.user.id &&
        ["MANAGER", "ADMINISTRATOR"].includes(member.projectRole)
    ) ||
    (input.session.permissionCodes.includes(permissions.projectManageMembers) &&
      input.hasCompanyManage)
  )
}

function canManageLifecycleForProject(input: {
  session: SessionContext
  project: {
    sponsorUserId: string
    managerUserId: string
    members: { userId: string; projectRole: string }[]
  }
  hasCompanyManage: boolean
}) {
  return (
    input.project.managerUserId === input.session.user.id ||
    input.project.sponsorUserId === input.session.user.id ||
    input.project.members.some(
      (member) =>
        member.userId === input.session.user.id &&
        ["MANAGER", "ADMINISTRATOR"].includes(member.projectRole)
    ) ||
    (input.session.permissionCodes.includes(permissions.projectManage) &&
      input.hasCompanyManage)
  )
}

export function assertProjectLifecycleTransition(input: {
  currentStatus: string
  nextStatus: (typeof projectLifecycleStatuses)[number]
  reason?: string
}) {
  const reasonRequired = ["ON_HOLD", "CANCELLED", "ARCHIVED"].includes(
    input.nextStatus
  )
  if (reasonRequired && (!input.reason || input.reason.trim().length < 5)) {
    throw new Error("PROJECT_LIFECYCLE_REASON_REQUIRED")
  }

  const allowed: Record<
    string,
    Array<(typeof projectLifecycleStatuses)[number]>
  > = {
    DRAFT: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"],
    ON_HOLD: ["ACTIVE", "CANCELLED"],
    COMPLETED: ["ARCHIVED"],
    CANCELLED: ["ARCHIVED"],
    ARCHIVED: []
  }
  if (!allowed[input.currentStatus]?.includes(input.nextStatus)) {
    throw new Error("PROJECT_LIFECYCLE_INVALID_TRANSITION")
  }
}

async function assertProjectMemberManageAccess(
  session: SessionContext,
  projectId: string
) {
  await requirePermission(session, permissions.projectManageMembers)
  const project = await findAuthorizedProject(session, projectId)
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND")
  }
  const scopes = await getActiveProjectScopes(session)
  if (
    !canManageMembersForProject({
      session,
      project,
      hasCompanyManage: hasCompanyManageScope(scopes, session.context.companyId)
    })
  ) {
    throw new Error("PROJECT_MEMBER_PERMISSION_DENIED")
  }
  return project
}

async function logProjectLifecycleDenied(input: {
  session: SessionContext
  projectId: string
  nextStatus: string
  reasonCode: string
}) {
  await prisma.auditEvent.create({
    data: {
      tenantId: input.session.context.tenantId,
      companyId: input.session.context.companyId,
      actorUserId: input.session.user.id,
      eventType: "project.lifecycle.denied",
      entityType: "Project",
      entityId: input.projectId,
      metadata: {
        nextStatus: input.nextStatus,
        reasonCode: input.reasonCode,
        source: "project-lifecycle"
      }
    }
  })
}

async function assertProjectLifecycleManageAccess(
  session: SessionContext,
  projectId: string,
  nextStatus: string
) {
  const project = await findAuthorizedProject(session, projectId)
  if (!project) {
    await logProjectLifecycleDenied({
      session,
      projectId,
      nextStatus,
      reasonCode: "PROJECT_NOT_FOUND_OR_NOT_AUTHORIZED"
    })
    throw new Error("PROJECT_NOT_FOUND")
  }
  const scopes = await getActiveProjectScopes(session)
  if (
    !canManageLifecycleForProject({
      session,
      project,
      hasCompanyManage: hasCompanyManageScope(scopes, session.context.companyId)
    })
  ) {
    await logProjectLifecycleDenied({
      session,
      projectId,
      nextStatus,
      reasonCode: "PROJECT_LIFECYCLE_PERMISSION_DENIED"
    })
    throw new Error("PROJECT_LIFECYCLE_PERMISSION_DENIED")
  }
  return project
}

export async function listProjectMembers(session: SessionContext) {
  const access = await listAuthorizedProjectAccess(session)
  if (access.projectIds.length === 0) {
    return []
  }
  const scopes = await getActiveProjectScopes(session)
  const members = await prisma.projectMember.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      projectId: { in: access.projectIds },
      status: "ACTIVE"
    },
    include: {
      project: {
        include: {
          members: { where: { status: "ACTIVE" }, include: { user: true } }
        }
      },
      user: true
    },
    orderBy: [{ projectId: "asc" }, { createdAt: "asc" }]
  })
  const hasCompanyManage = hasCompanyManageScope(
    scopes,
    session.context.companyId
  )
  return members.map(
    (member): ProjectMemberSummary => ({
      id: member.id,
      userId: member.userId,
      projectId: member.projectId,
      projectCode: member.project.code,
      projectName: member.project.name,
      userName: member.user.displayName,
      userEmail: member.user.email,
      projectRole: member.projectRole,
      canRemove:
        member.userId !== session.user.id &&
        session.permissionCodes.includes(permissions.projectManageMembers) &&
        canManageMembersForProject({
          session,
          project: member.project,
          hasCompanyManage
        })
    })
  )
}

export async function listProjectMemberOptions(session: SessionContext) {
  await requirePermission(session, permissions.projectManageMembers)
  const users = await prisma.user.findMany({
    where: {
      tenantId: session.context.tenantId,
      status: "ACTIVE"
    },
    orderBy: { displayName: "asc" }
  })
  return users.map(
    (user): ProjectMemberOption => ({
      id: user.id,
      displayName: user.displayName,
      email: user.email
    })
  )
}

export async function addProjectMember(formData: FormData) {
  const session = await requireSessionContext()
  const values = addProjectMemberSchema.parse({
    projectId: formData.get("projectId"),
    userId: formData.get("userId"),
    projectRole: formData.get("projectRole") || "VIEWER"
  })
  await assertProjectMemberManageAccess(session, values.projectId)
  const user = await prisma.user.findFirst({
    where: {
      id: values.userId,
      tenantId: session.context.tenantId,
      status: "ACTIVE"
    },
    select: { id: true }
  })
  if (!user) {
    throw new Error("PROJECT_MEMBER_USER_NOT_FOUND")
  }

  await prisma.$transaction(async (tx) => {
    const member = await tx.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: values.projectId,
          userId: values.userId
        }
      },
      create: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        userId: values.userId,
        projectRole: values.projectRole,
        addedByUserId: session.user.id
      },
      update: {
        projectRole: values.projectRole,
        status: "ACTIVE",
        removedAt: null,
        removedByUserId: null,
        addedByUserId: session.user.id
      }
    })
    await tx.projectActivityEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: values.projectId,
        actorUserId: session.user.id,
        eventType: "project_member.added",
        entityType: "ProjectMember",
        entityId: member.id,
        afterData: {
          userId: member.userId,
          projectRole: member.projectRole,
          status: member.status
        },
        metadata: { source: "project-member-management" }
      }
    })
  })
}

export async function removeProjectMember(formData: FormData) {
  const session = await requireSessionContext()
  const values = removeProjectMemberSchema.parse({
    memberId: formData.get("memberId"),
    removalReason: formData.get("removalReason")
  })
  const member = await prisma.projectMember.findFirst({
    where: {
      id: values.memberId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE"
    }
  })
  if (!member) {
    throw new Error("PROJECT_MEMBER_NOT_FOUND")
  }
  if (member.userId === session.user.id) {
    throw new Error("PROJECT_MEMBER_SELF_REMOVE_BLOCKED")
  }
  await assertProjectMemberManageAccess(session, member.projectId)

  await prisma.$transaction(async (tx) => {
    const removed = await tx.projectMember.update({
      where: { id: member.id },
      data: {
        status: "INACTIVE",
        removedAt: new Date(),
        removedByUserId: session.user.id
      }
    })
    await tx.projectActivityEvent.create({
      data: {
        tenantId: member.tenantId,
        companyId: member.companyId,
        projectId: member.projectId,
        actorUserId: session.user.id,
        eventType: "project_member.removed",
        entityType: "ProjectMember",
        entityId: member.id,
        reason: values.removalReason,
        beforeData: {
          userId: member.userId,
          projectRole: member.projectRole,
          status: member.status
        },
        afterData: {
          userId: removed.userId,
          projectRole: removed.projectRole,
          status: removed.status
        },
        metadata: { source: "project-member-management" }
      }
    })
  })
}

async function assertProjectCanCloseCancelOrArchive(input: {
  session: SessionContext
  projectId: string
  projectType: string
  nextStatus: (typeof projectLifecycleStatuses)[number]
}) {
  if (!["COMPLETED", "CANCELLED", "ARCHIVED"].includes(input.nextStatus)) {
    return
  }

  const activeTaskCount = await prisma.projectTask.count({
    where: {
      projectId: input.projectId,
      archivedAt: null,
      status: { notIn: ["COMPLETED", "CANCELLED"] }
    }
  })
  if (activeTaskCount > 0) {
    await logProjectLifecycleDenied({
      session: input.session,
      projectId: input.projectId,
      nextStatus: input.nextStatus,
      reasonCode: "PROJECT_LIFECYCLE_ACTIVE_TASKS_BLOCKED"
    })
    throw new Error("PROJECT_LIFECYCLE_ACTIVE_TASKS_BLOCKED")
  }

  const openBlockerCount = await prisma.projectBlocker.count({
    where: {
      projectId: input.projectId,
      status: "OPEN"
    }
  })
  if (openBlockerCount > 0) {
    await logProjectLifecycleDenied({
      session: input.session,
      projectId: input.projectId,
      nextStatus: input.nextStatus,
      reasonCode: "PROJECT_LIFECYCLE_OPEN_BLOCKERS_BLOCKED"
    })
    throw new Error("PROJECT_LIFECYCLE_OPEN_BLOCKERS_BLOCKED")
  }

  const openRiskCount = await prisma.projectRisk.count({
    where: {
      projectId: input.projectId,
      archivedAt: null,
      status: { in: ["OPEN", "MITIGATING", "REALIZED"] }
    }
  })
  if (openRiskCount > 0) {
    await logProjectLifecycleDenied({
      session: input.session,
      projectId: input.projectId,
      nextStatus: input.nextStatus,
      reasonCode: "PROJECT_LIFECYCLE_OPEN_RISKS_BLOCKED"
    })
    throw new Error("PROJECT_LIFECYCLE_OPEN_RISKS_BLOCKED")
  }

  if (
    ["COMPLETED", "ARCHIVED"].includes(input.nextStatus) &&
    expansionLifecycleProjectTypes.has(input.projectType.toUpperCase())
  ) {
    const [
      gateCount,
      unresolvedGateCount,
      incompleteRequiredChecklistCount,
      pendingRequiredRequirementCount
    ] = await Promise.all([
      prisma.projectMilestone.count({
        where: {
          projectId: input.projectId,
          archivedAt: null,
          description: { startsWith: "EXPANSION_LIFECYCLE_GATE:" }
        }
      }),
      prisma.projectMilestone.count({
        where: {
          projectId: input.projectId,
          archivedAt: null,
          description: { startsWith: "EXPANSION_LIFECYCLE_GATE:" },
          status: { not: "ACHIEVED" }
        }
      }),
      prisma.projectTaskChecklistItem.count({
        where: {
          projectId: input.projectId,
          archivedAt: null,
          isRequired: true,
          isCompleted: false
        }
      }),
      prisma.projectRequirement.count({
        where: {
          projectId: input.projectId,
          archivedAt: null,
          isRequired: true,
          status: { notIn: ["APPROVED", "WAIVED"] }
        }
      })
    ])
    if (gateCount < 9 || unresolvedGateCount > 0) {
      await logProjectLifecycleDenied({
        session: input.session,
        projectId: input.projectId,
        nextStatus: input.nextStatus,
        reasonCode: "PROJECT_LIFECYCLE_EXPANSION_GATES_BLOCKED"
      })
      throw new Error("PROJECT_LIFECYCLE_EXPANSION_GATES_BLOCKED")
    }
    if (
      incompleteRequiredChecklistCount > 0 ||
      pendingRequiredRequirementCount > 0
    ) {
      await logProjectLifecycleDenied({
        session: input.session,
        projectId: input.projectId,
        nextStatus: input.nextStatus,
        reasonCode: "PROJECT_LIFECYCLE_REQUIREMENTS_BLOCKED"
      })
      throw new Error("PROJECT_LIFECYCLE_REQUIREMENTS_BLOCKED")
    }
  }
}

export async function transitionProjectLifecycle(formData: FormData) {
  const session = await requireSessionContext()
  const values = transitionProjectLifecycleSchema.parse({
    projectId: formData.get("projectId"),
    nextStatus: formData.get("nextStatus"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    reason: formData.get("reason")
  })

  const project = await assertProjectLifecycleManageAccess(
    session,
    values.projectId,
    values.nextStatus
  )
  if (values.expectedVersion && project.version !== values.expectedVersion) {
    await logProjectLifecycleDenied({
      session,
      projectId: values.projectId,
      nextStatus: values.nextStatus,
      reasonCode: "PROJECT_LIFECYCLE_STALE_VERSION"
    })
    throw new Error("PROJECT_LIFECYCLE_STALE_VERSION")
  }

  assertProjectLifecycleTransition({
    currentStatus: project.status,
    nextStatus: values.nextStatus,
    ...(values.reason ? { reason: values.reason } : {})
  })
  await assertProjectCanCloseCancelOrArchive({
    session,
    projectId: project.id,
    projectType: project.projectType,
    nextStatus: values.nextStatus
  })

  await prisma.$transaction(async (tx) => {
    const now = new Date()
    const updateResult = await tx.project.updateMany({
      where: {
        id: project.id,
        tenantId: project.tenantId,
        companyId: project.companyId,
        version: project.version,
        archivedAt: null
      },
      data: {
        status: values.nextStatus,
        updatedByUserId: session.user.id,
        version: { increment: 1 },
        ...(values.nextStatus === "ACTIVE" && project.status === "DRAFT"
          ? {
              startAt: project.startAt ?? now,
              startDate: project.startDate ?? now
            }
          : {}),
        ...(values.nextStatus === "COMPLETED"
          ? { actualEndAt: now, actualEndDate: now }
          : {}),
        ...(values.nextStatus === "ARCHIVED"
          ? {
              archivedAt: now,
              archivedByUserId: session.user.id,
              archiveReason: values.reason ?? "Lifecycle archive"
            }
          : {})
      }
    })
    if (updateResult.count !== 1) {
      throw new Error("PROJECT_LIFECYCLE_STALE_VERSION")
    }
    const updated = await tx.project.findUniqueOrThrow({
      where: { id: project.id }
    })

    await tx.projectActivityEvent.create({
      data: {
        tenantId: project.tenantId,
        companyId: project.companyId,
        projectId: project.id,
        actorUserId: session.user.id,
        eventType: "project.lifecycle.transitioned",
        entityType: "Project",
        entityId: project.id,
        reason: values.reason || null,
        beforeData: {
          status: project.status,
          version: project.version
        },
        afterData: {
          status: updated.status,
          version: updated.version,
          archivedAt: updated.archivedAt?.toISOString() ?? null,
          actualEndAt: updated.actualEndAt?.toISOString() ?? null
        },
        metadata: { source: "project-lifecycle" }
      }
    })

    await tx.auditEvent.create({
      data: {
        tenantId: project.tenantId,
        companyId: project.companyId,
        actorUserId: session.user.id,
        eventType: "project.lifecycle.transitioned",
        entityType: "Project",
        entityId: project.id,
        beforeData: {
          status: project.status,
          version: project.version
        },
        afterData: {
          status: updated.status,
          version: updated.version
        },
        metadata: {
          reason: values.reason ?? null,
          source: "project-lifecycle"
        }
      }
    })
  })
}

export async function createProject(formData: FormData) {
  const session = await requireSessionContext()
  await requirePermission(session, permissions.projectCreate)

  const values = createProjectSchema.parse({
    code: formData.get("code"),
    name: formData.get("name"),
    projectType: formData.get("projectType"),
    templateId: formData.get("templateId"),
    description: formData.get("description"),
    isRestricted: formData.get("isRestricted") === "on",
    locationId: formData.get("locationId"),
    targetEndAt: formData.get("targetEndAt")
  })
  const locationId = values.locationId ?? null
  const scopes = await getActiveProjectScopes(session)
  await assertCanCreateProjectInScope(session, scopes, { locationId })

  const targetEndAt = values.targetEndAt ? new Date(values.targetEndAt) : null
  const hasExplicitLeadership = Boolean(
    values.sponsorUserId || values.managerUserId
  )
  if (
    hasExplicitLeadership &&
    (!values.sponsorUserId || !values.managerUserId)
  ) {
    throw new Error("PROJECT_LEADERSHIP_INCOMPLETE")
  }
  if (
    hasExplicitLeadership &&
    (values.sponsorUserId === values.managerUserId ||
      values.sponsorUserId === session.user.id ||
      values.managerUserId === session.user.id)
  ) {
    throw new Error("PROJECT_LEADERSHIP_SEGREGATION_REQUIRED")
  }
  const project = await prisma.$transaction(async (tx) => {
    if (locationId) {
      const location = await tx.location.findFirst({
        where: {
          id: locationId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE"
        },
        select: { id: true }
      })
      if (!location) {
        throw new Error("PROJECT_SCOPE_DENIED")
      }
    }

    const template = values.templateId
      ? await tx.projectTemplate.findFirst({
          where: {
            id: values.templateId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "PUBLISHED"
          }
        })
      : null
    if (values.templateId && !template) {
      throw new Error("PROJECT_TEMPLATE_NOT_PUBLISHED")
    }
    const templateSnapshot = template
      ? buildProjectTemplateSnapshot(template)
      : null
    const templateConfig = template
      ? parseProjectTemplateConfig(template.configJson)
      : null
    const projectConfigJson = template
      ? assertProjectTemplateJson(templateConfig)
      : defaultProjectConfig()
    const projectType = template?.projectType ?? values.projectType
    const isRestricted = template?.isRestrictedDefault
      ? true
      : values.isRestricted

    const leadershipUserIds = hasExplicitLeadership
      ? [values.sponsorUserId!, values.managerUserId!]
      : []
    if (leadershipUserIds.length > 0) {
      const leaders = await tx.user.findMany({
        where: {
          id: { in: leadershipUserIds },
          tenantId: session.context.tenantId,
          status: "ACTIVE"
        },
        select: { id: true }
      })
      if (leaders.length !== leadershipUserIds.length) {
        throw new Error("PROJECT_LEADERSHIP_USER_NOT_FOUND")
      }
    }

    const sponsorUserId = values.sponsorUserId ?? session.user.id
    const managerUserId = values.managerUserId ?? session.user.id
    const createdProject = await tx.project.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        templateId: template?.id ?? null,
        brandId: session.context.brandId,
        locationId,
        code: values.code.toUpperCase(),
        name: values.name,
        projectType,
        description: values.description || null,
        isRestricted,
        targetEndAt,
        sponsorUserId,
        managerUserId,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id,
        ...(templateSnapshot ? { templateSnapshotJson: templateSnapshot } : {}),
        projectConfigJson
      }
    })

    await tx.projectMember.createMany({
      data: [
        {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          projectId: createdProject.id,
          userId: managerUserId,
          projectRole: "MANAGER",
          addedByUserId: session.user.id
        },
        ...(sponsorUserId !== managerUserId
          ? [
              {
                tenantId: session.context.tenantId,
                companyId: session.context.companyId,
                projectId: createdProject.id,
                userId: sponsorUserId,
                projectRole: "SPONSOR" as const,
                addedByUserId: session.user.id
              }
            ]
          : []),
        ...(session.user.id !== managerUserId &&
        session.user.id !== sponsorUserId
          ? [
              {
                tenantId: session.context.tenantId,
                companyId: session.context.companyId,
                projectId: createdProject.id,
                userId: session.user.id,
                projectRole: "CONTRIBUTOR" as const,
                addedByUserId: session.user.id
              }
            ]
          : [])
      ]
    })

    await tx.projectActivityEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: createdProject.id,
        actorUserId: session.user.id,
        eventType: "project.created",
        entityType: "Project",
        entityId: createdProject.id,
        afterData: {
          code: createdProject.code,
          name: createdProject.name,
          projectType: createdProject.projectType,
          isRestricted: createdProject.isRestricted,
          locationId: createdProject.locationId,
          templateId: createdProject.templateId
        },
        metadata: {
          source: "projects-foundation"
        }
      }
    })

    if (templateConfig) {
      await applyProjectTemplateDefaults(tx, {
        project: createdProject,
        templateConfig,
        actorUserId: session.user.id
      })
    }

    return createdProject
  })

  return project.id
}

export async function updateProjectLeadership(formData: FormData) {
  const session = await requireSessionContext()
  const values = updateProjectLeadershipSchema.parse({
    projectId: formData.get("projectId"),
    sponsorUserId: formData.get("sponsorUserId"),
    managerUserId: formData.get("managerUserId"),
    expectedVersion: formData.get("expectedVersion"),
    reason: formData.get("reason")
  })
  await requirePermission(session, permissions.projectManage)
  const project = await findAuthorizedProject(session, values.projectId)
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND")
  }
  if (
    values.sponsorUserId === values.managerUserId ||
    values.sponsorUserId === project.createdByUserId ||
    values.managerUserId === project.createdByUserId
  ) {
    throw new Error("PROJECT_LEADERSHIP_SEGREGATION_REQUIRED")
  }

  await prisma.$transaction(async (tx) => {
    const leaders = await tx.user.findMany({
      where: {
        id: { in: [values.sponsorUserId, values.managerUserId] },
        tenantId: session.context.tenantId,
        status: "ACTIVE"
      },
      select: { id: true }
    })
    if (leaders.length !== 2) {
      throw new Error("PROJECT_LEADERSHIP_USER_NOT_FOUND")
    }
    const updated = await tx.project.updateMany({
      where: {
        id: project.id,
        tenantId: project.tenantId,
        companyId: project.companyId,
        version: values.expectedVersion,
        archivedAt: null
      },
      data: {
        sponsorUserId: values.sponsorUserId,
        managerUserId: values.managerUserId,
        updatedByUserId: session.user.id,
        version: { increment: 1 }
      }
    })
    if (updated.count !== 1) {
      throw new Error("PROJECT_STALE_VERSION")
    }
    for (const [userId, projectRole] of [
      [values.sponsorUserId, "SPONSOR"],
      [values.managerUserId, "MANAGER"]
    ] as const) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId } },
        create: {
          tenantId: project.tenantId,
          companyId: project.companyId,
          projectId: project.id,
          userId,
          projectRole,
          addedByUserId: session.user.id
        },
        update: {
          projectRole,
          status: "ACTIVE",
          removedAt: null,
          removedByUserId: null,
          addedByUserId: session.user.id
        }
      })
    }
    await tx.projectActivityEvent.create({
      data: {
        tenantId: project.tenantId,
        companyId: project.companyId,
        projectId: project.id,
        actorUserId: session.user.id,
        eventType: "project_leadership.updated",
        entityType: "Project",
        entityId: project.id,
        reason: values.reason,
        beforeData: {
          sponsorUserId: project.sponsorUserId,
          managerUserId: project.managerUserId,
          version: project.version
        },
        afterData: {
          sponsorUserId: values.sponsorUserId,
          managerUserId: values.managerUserId,
          version: project.version + 1
        },
        metadata: { source: "project-leadership-management" }
      }
    })
  })
}

export async function updateProjectDetails(formData: FormData) {
  const session = await requireSessionContext()
  const values = updateProjectDetailsSchema.parse({
    projectId: formData.get("projectId"),
    expectedVersion: formData.get("expectedVersion"),
    description: formData.get("description"),
    targetEndAt: formData.get("targetEndAt")
  })
  const project = await findAuthorizedProject(session, values.projectId)
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND")
  }
  const scopes = await getActiveProjectScopes(session)
  if (
    !canManageLifecycleForProject({
      session,
      project,
      hasCompanyManage: hasCompanyManageScope(scopes, session.context.companyId)
    })
  ) {
    throw new Error("PROJECT_DETAILS_PERMISSION_DENIED")
  }
  if (project.version !== values.expectedVersion) {
    throw new Error("PROJECT_STALE_VERSION")
  }
  const targetEndAt = values.targetEndAt ? new Date(values.targetEndAt) : null
  if (targetEndAt && Number.isNaN(targetEndAt.getTime())) {
    throw new Error("PROJECT_TARGET_DATE_INVALID")
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.project.updateMany({
      where: {
        id: project.id,
        tenantId: project.tenantId,
        companyId: project.companyId,
        version: values.expectedVersion,
        archivedAt: null
      },
      data: {
        description: values.description?.trim() || null,
        targetEndAt,
        targetEndDate: targetEndAt,
        updatedByUserId: session.user.id,
        version: { increment: 1 }
      }
    })
    if (updated.count !== 1) {
      throw new Error("PROJECT_STALE_VERSION")
    }
    await tx.projectActivityEvent.create({
      data: {
        tenantId: project.tenantId,
        companyId: project.companyId,
        projectId: project.id,
        actorUserId: session.user.id,
        eventType: "project.details.updated",
        entityType: "Project",
        entityId: project.id,
        beforeData: {
          description: project.description,
          targetEndAt: project.targetEndAt?.toISOString() ?? null,
          version: project.version
        },
        afterData: {
          description: values.description?.trim() || null,
          targetEndAt: targetEndAt?.toISOString() ?? null,
          version: project.version + 1
        },
        metadata: { source: "project-details" }
      }
    })
    await tx.auditEvent.create({
      data: {
        tenantId: project.tenantId,
        companyId: project.companyId,
        actorUserId: session.user.id,
        eventType: "project.details.updated",
        entityType: "Project",
        entityId: project.id,
        beforeData: {
          description: project.description,
          targetEndAt: project.targetEndAt?.toISOString() ?? null,
          version: project.version
        },
        afterData: {
          description: values.description?.trim() || null,
          targetEndAt: targetEndAt?.toISOString() ?? null,
          version: project.version + 1
        },
        metadata: { source: "project-details" }
      }
    })
  })
}
