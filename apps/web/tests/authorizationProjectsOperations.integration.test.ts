import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { getConfiguredContext as getConfiguredContextType } from "../src/server/services/context";
import type { permissions as permissionsType } from "../src/server/services/authorization";
import type {
  decideProjectRequirementForSession as decideProjectRequirementForSessionType,
  reassignProjectRequirementReviewer as reassignProjectRequirementReviewerType,
  reassignProjectRequirementReviewerForSession as reassignProjectRequirementReviewerForSessionType,
  resolveProjectRequirementException as resolveProjectRequirementExceptionType,
  resolveProjectRequirementExceptionForSession as resolveProjectRequirementExceptionForSessionType,
  submitProjectRequirementForSession as submitProjectRequirementForSessionType,
  uploadProjectRequirementEvidence as uploadProjectRequirementEvidenceType,
} from "../src/server/services/projectRequirements";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";
import {
  authenticationSessionTokenHash,
  clearAuthenticatedRequest,
  configureAuthenticatedRequest,
} from "./authenticatedRequestHarness";

const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(
  process.env,
);
if (!process.env.DATABASE_URL) {
  throw new Error("AUTHORIZATION_PROJECTS_OPERATIONS_DATABASE_REQUIRED");
}

describe("projects and operations database-backed authorization boundaries", () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenantId: randomUUID(),
    companyId: randomUUID(),
    adjacentCompanyId: randomUUID(),
    brandId: randomUUID(),
    adjacentBrandId: randomUUID(),
    locationId: randomUUID(),
    adjacentLocationId: randomUUID(),
    actorUserId: randomUUID(),
    ownerUserId: randomUUID(),
    roleId: randomUUID(),
    restrictedProjectId: randomUUID(),
    adjacentCompanyProjectId: randomUUID(),
    adjacentLocationProjectId: randomUUID(),
    adjacentBrandProjectId: randomUUID(),
    projectMemberId: randomUUID(),
    projectScopeId: randomUUID(),
    restrictedRequirementId: randomUUID(),
    adjacentCompanyRequirementId: randomUUID(),
    adjacentLocationRequirementId: randomUUID(),
    adjacentBrandRequirementId: randomUUID(),
    invalidTransitionRequirementId: randomUUID(),
    selfDecisionRequirementId: randomUUID(),
    taskId: randomUUID(),
    milestoneId: randomUUID(),
    riskId: randomUUID(),
    recordLinkId: randomUUID(),
    attachmentId: randomUUID(),
    projectAttachmentId: randomUUID(),
    removableMemberId: randomUUID(),
    checklistItemId: randomUUID(),
    blockerId: randomUUID(),
    actorNotificationId: randomUUID(),
    ownerNotificationId: randomUUID(),
    companyManageScopeId: randomUUID(),
  };
  const actorEmail = `authz-project-ops-${suffix}@example.test`;
  const sessionToken = `authz-project-ops-session-${randomUUID()}`;

  let prisma: PrismaClient;
  let permissions: typeof permissionsType;
  let getConfiguredContext: typeof getConfiguredContextType;
  let submitProjectRequirementForSession: typeof submitProjectRequirementForSessionType;
  let decideProjectRequirementForSession: typeof decideProjectRequirementForSessionType;
  let uploadProjectRequirementEvidence: typeof uploadProjectRequirementEvidenceType;
  let reassignProjectRequirementReviewerForSession: typeof reassignProjectRequirementReviewerForSessionType;
  let reassignProjectRequirementReviewer: typeof reassignProjectRequirementReviewerType;
  let resolveProjectRequirementException: typeof resolveProjectRequirementExceptionType;
  let resolveProjectRequirementExceptionForSession: typeof resolveProjectRequirementExceptionForSessionType;
  let projectManagePermissionId: string;
  let branchOperations: typeof import("../src/server/services/branchOperations");
  let expansionProjects: typeof import("../src/server/services/expansionProjects");
  let foodSafety: typeof import("../src/server/services/foodSafety");
  let incidents: typeof import("../src/server/services/incidents");
  let maintenance: typeof import("../src/server/services/maintenance");
  let projectTemplates: typeof import("../src/server/services/projectTemplates");
  let projectMilestones: typeof import("../src/server/services/projectMilestones");
  let projectNotifications: typeof import("../src/server/services/projectNotifications");
  let projectRecordLinks: typeof import("../src/server/services/projectRecordLinks");
  let projectReports: typeof import("../src/server/services/projectReports");
  let projectRisks: typeof import("../src/server/services/projectRisks");
  let projectTasks: typeof import("../src/server/services/projectTasks");
  let projects: typeof import("../src/server/services/projects");
  let notifications: typeof import("../src/server/services/notifications");
  let restaurantOpsNotifications: typeof import("../src/server/services/restaurantOpsNotifications");
  let recipes: typeof import("../src/server/services/recipes");

  async function snapshotProtectedState() {
    const [
      projects,
      requirements,
      members,
      tasks,
      milestones,
      risks,
      checklistCount,
      blockerCount,
      commentCount,
      projectAttachments,
      templateCount,
      activityCount,
      sourceLinks,
      notificationRows,
      operationalCorrectionCount,
      operationalTransitionCount,
      attachmentCount,
      inventoryCount,
      financeCount,
      auditEvents,
    ] = await Promise.all([
      prisma.project.findMany({
        where: { tenantId: ids.tenantId },
        orderBy: { id: "asc" },
        select: { id: true, status: true, version: true, archivedAt: true },
      }),
      prisma.projectRequirement.findMany({
        where: { tenantId: ids.tenantId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          status: true,
          version: true,
          evidenceNote: true,
          submittedAt: true,
          decisionAt: true,
        },
      }),
      prisma.projectMember.findMany({
        where: { tenantId: ids.tenantId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          status: true,
          removedAt: true,
          removedByUserId: true,
        },
      }),
      prisma.projectTask.findMany({
        where: { tenantId: ids.tenantId },
        orderBy: { id: "asc" },
        select: { id: true, status: true, version: true, archivedAt: true },
      }),
      prisma.projectMilestone.findMany({
        where: { tenantId: ids.tenantId },
        orderBy: { id: "asc" },
        select: { id: true, status: true, version: true, archivedAt: true },
      }),
      prisma.projectRisk.findMany({
        where: { tenantId: ids.tenantId },
        orderBy: { id: "asc" },
        select: { id: true, status: true, version: true, archivedAt: true },
      }),
      prisma.projectTaskChecklistItem.count({
        where: { tenantId: ids.tenantId },
      }),
      prisma.projectBlocker.count({ where: { tenantId: ids.tenantId } }),
      prisma.projectComment.count({ where: { tenantId: ids.tenantId } }),
      prisma.projectAttachment.findMany({
        where: { tenantId: ids.tenantId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          status: true,
          archivedAt: true,
          archiveReason: true,
        },
      }),
      prisma.projectTemplate.count({ where: { tenantId: ids.tenantId } }),
      prisma.projectActivityEvent.count({ where: { tenantId: ids.tenantId } }),
      prisma.projectRecordLink.findMany({
        where: { tenantId: ids.tenantId },
        orderBy: { id: "asc" },
        select: { id: true, archivedAt: true, archiveReason: true },
      }),
      prisma.notification.findMany({
        where: { tenantId: ids.tenantId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          recipientUserId: true,
          status: true,
          readAt: true,
          archivedAt: true,
        },
      }),
      prisma.operationalCorrectionRecord.count({
        where: { tenantId: ids.tenantId },
      }),
      prisma.operationalStatusTransition.count({
        where: { tenantId: ids.tenantId },
      }),
      prisma.attachment.count({ where: { tenantId: ids.tenantId } }),
      prisma.inventoryMovement.count({ where: { tenantId: ids.tenantId } }),
      prisma.expenseRequest.count({ where: { tenantId: ids.tenantId } }),
      prisma.auditEvent.findMany({
        where: { tenantId: ids.tenantId },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          eventType: true,
          entityId: true,
          metadata: true,
          occurredAt: true,
        },
      }),
    ]);
    return {
      projects,
      requirements,
      members,
      tasks,
      milestones,
      risks,
      checklistCount,
      blockerCount,
      commentCount,
      projectAttachments,
      templateCount,
      activityCount,
      sourceLinks,
      notificationRows,
      operationalCorrectionCount,
      operationalTransitionCount,
      attachmentCount,
      inventoryCount,
      financeCount,
      auditEvents,
    };
  }

  beforeAll(async () => {
    ({ prisma } = await import("@ogfi/database"));
    ({ permissions } = await import("../src/server/services/authorization"));
    ({ getConfiguredContext } = await import("../src/server/services/context"));
    ({
      submitProjectRequirementForSession,
      decideProjectRequirementForSession,
      uploadProjectRequirementEvidence,
      reassignProjectRequirementReviewerForSession,
      reassignProjectRequirementReviewer,
      resolveProjectRequirementException,
      resolveProjectRequirementExceptionForSession,
    } = await import("../src/server/services/projectRequirements"));
    branchOperations = await import("../src/server/services/branchOperations");
    expansionProjects =
      await import("../src/server/services/expansionProjects");
    foodSafety = await import("../src/server/services/foodSafety");
    incidents = await import("../src/server/services/incidents");
    maintenance = await import("../src/server/services/maintenance");
    projectTemplates = await import("../src/server/services/projectTemplates");
    projectMilestones =
      await import("../src/server/services/projectMilestones");
    projectNotifications =
      await import("../src/server/services/projectNotifications");
    projectRecordLinks =
      await import("../src/server/services/projectRecordLinks");
    projectReports = await import("../src/server/services/projectReports");
    projectRisks = await import("../src/server/services/projectRisks");
    projectTasks = await import("../src/server/services/projectTasks");
    projects = await import("../src/server/services/projects");
    notifications = await import("../src/server/services/notifications");
    restaurantOpsNotifications =
      await import("../src/server/services/restaurantOpsNotifications");
    recipes = await import("../src/server/services/recipes");

    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    if (identity[0]?.currentDatabase !== expectedDatabase) {
      throw new Error("AUTHORIZATION_DATABASE_IDENTITY_MISMATCH");
    }

    const permissionRows = await prisma.permission.findMany({
      where: {
        code: { in: [permissions.projectView, permissions.projectManage] },
      },
      select: { id: true, code: true },
    });
    if (permissionRows.length !== 2) {
      throw new Error("SEEDED_PROJECT_AUTHORIZATION_PERMISSIONS_REQUIRED");
    }
    projectManagePermissionId = permissionRows.find(
      (permission) => permission.code === permissions.projectManage,
    )!.id;

    await prisma.tenant.create({
      data: {
        id: ids.tenantId,
        name: `Authorization Projects Operations ${suffix}`,
        loginCode: `authz-project-ops-${suffix}`,
      },
    });
    await prisma.company.createMany({
      data: [
        {
          id: ids.companyId,
          tenantId: ids.tenantId,
          code: `AZPO-${suffix}`,
          legalName: `Authorization Projects Operations ${suffix}`,
          currencyCode: "PHP",
        },
        {
          id: ids.adjacentCompanyId,
          tenantId: ids.tenantId,
          code: `AZPO-ADJ-${suffix}`,
          legalName: `Adjacent Authorization Projects Operations ${suffix}`,
          currencyCode: "PHP",
        },
      ],
    });
    await prisma.brand.createMany({
      data: [
        {
          id: ids.brandId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `AZPO-BRAND-${suffix}`,
          name: `Authorization Brand ${suffix}`,
        },
        {
          id: ids.adjacentBrandId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `AZPO-BRAND-ADJ-${suffix}`,
          name: `Adjacent Authorization Brand ${suffix}`,
        },
      ],
    });
    await prisma.location.createMany({
      data: [
        {
          id: ids.locationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationType: "BRANCH",
          code: `AZPO-${suffix}`,
          name: `Authorization Location ${suffix}`,
        },
        {
          id: ids.adjacentLocationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationType: "BRANCH",
          code: `AZPO-ADJ-${suffix}`,
          name: `Adjacent Authorization Location ${suffix}`,
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: ids.actorUserId,
          tenantId: ids.tenantId,
          email: actorEmail,
          displayName: `Authorization Actor ${suffix}`,
        },
        {
          id: ids.ownerUserId,
          tenantId: ids.tenantId,
          email: `authz-project-ops-owner-${suffix}@example.test`,
          displayName: `Authorization Owner ${suffix}`,
        },
      ],
    });
    await prisma.role.create({
      data: {
        id: ids.roleId,
        tenantId: ids.tenantId,
        code: `AUTHZ_PROJECT_OPS_${suffix}`,
        name: `Authorization Projects Operations ${suffix}`,
      },
    });
    await prisma.rolePermission.createMany({
      data: permissionRows.map((permission) => ({
        roleId: ids.roleId,
        permissionId: permission.id,
      })),
    });
    await prisma.userRoleAssignment.create({
      data: { userId: ids.actorUserId, roleId: ids.roleId },
    });
    await prisma.authSession.create({
      data: {
        tenantId: ids.tenantId,
        userId: ids.actorUserId,
        tokenHash: authenticationSessionTokenHash(sessionToken),
        status: "ACTIVE",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: 0,
        idleExpiresAt: new Date(Date.now() + 30 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    configureAuthenticatedRequest({
      sessionToken,
      selectedLocationId: ids.locationId,
    });
    await prisma.userScopeAssignment.createMany({
      data: [
        {
          userId: ids.actorUserId,
          scopeType: "LOCATION",
          scopeId: ids.locationId,
          accessLevel: "OPERATE",
        },
        {
          userId: ids.actorUserId,
          scopeType: "BRAND",
          scopeId: ids.brandId,
          accessLevel: "VIEW",
        },
        {
          id: ids.projectScopeId,
          userId: ids.actorUserId,
          scopeType: "PROJECT",
          scopeId: ids.restrictedProjectId,
          accessLevel: "OPERATE",
        },
      ],
    });

    await prisma.project.createMany({
      data: [
        {
          id: ids.restrictedProjectId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `AZPO-RESTRICTED-${suffix}`,
          name: `Restricted Project ${suffix}`,
          projectType: "IMPLEMENTATION",
          brandId: ids.brandId,
          locationId: ids.locationId,
          sponsorUserId: ids.ownerUserId,
          managerUserId: ids.ownerUserId,
          isRestricted: true,
          createdByUserId: ids.ownerUserId,
          updatedByUserId: ids.ownerUserId,
        },
        {
          id: ids.adjacentLocationProjectId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `AZPO-LOCATION-${suffix}`,
          name: `Adjacent Location Project ${suffix}`,
          projectType: "IMPLEMENTATION",
          locationId: ids.adjacentLocationId,
          sponsorUserId: ids.ownerUserId,
          managerUserId: ids.ownerUserId,
          createdByUserId: ids.ownerUserId,
          updatedByUserId: ids.ownerUserId,
        },
        {
          id: ids.adjacentBrandProjectId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `AZPO-BRAND-${suffix}`,
          name: `Adjacent Brand Project ${suffix}`,
          projectType: "IMPLEMENTATION",
          brandId: ids.adjacentBrandId,
          sponsorUserId: ids.ownerUserId,
          managerUserId: ids.ownerUserId,
          createdByUserId: ids.ownerUserId,
          updatedByUserId: ids.ownerUserId,
        },
        {
          id: ids.adjacentCompanyProjectId,
          tenantId: ids.tenantId,
          companyId: ids.adjacentCompanyId,
          code: `AZPO-COMPANY-${suffix}`,
          name: `Adjacent Company Project ${suffix}`,
          projectType: "IMPLEMENTATION",
          sponsorUserId: ids.ownerUserId,
          managerUserId: ids.ownerUserId,
          createdByUserId: ids.ownerUserId,
          updatedByUserId: ids.ownerUserId,
        },
      ],
    });
    await prisma.projectMember.create({
      data: {
        id: ids.projectMemberId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        projectId: ids.restrictedProjectId,
        userId: ids.actorUserId,
        projectRole: "CONTRIBUTOR",
        addedByUserId: ids.ownerUserId,
      },
    });
    await prisma.projectMember.create({
      data: {
        id: ids.removableMemberId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        projectId: ids.restrictedProjectId,
        userId: ids.ownerUserId,
        projectRole: "VIEWER",
        addedByUserId: ids.ownerUserId,
      },
    });
    await prisma.projectTask.create({
      data: {
        id: ids.taskId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        projectId: ids.restrictedProjectId,
        taskKey: `AZPO-TASK-${suffix}`,
        title: `Authorization task ${suffix}`,
        status: "PLANNED",
        ownerUserId: ids.actorUserId,
        createdByUserId: ids.ownerUserId,
        updatedByUserId: ids.ownerUserId,
      },
    });
    await prisma.projectTaskChecklistItem.create({
      data: {
        id: ids.checklistItemId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        projectId: ids.restrictedProjectId,
        taskId: ids.taskId,
        title: "Authorization checklist item",
        position: 1,
        isRequired: true,
        createdByUserId: ids.ownerUserId,
        updatedByUserId: ids.ownerUserId,
      },
    });
    await prisma.projectBlocker.create({
      data: {
        id: ids.blockerId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        projectId: ids.restrictedProjectId,
        taskId: ids.taskId,
        reason: "Authorization blocker",
        blockerType: "DEPENDENCY",
        severity: "MEDIUM",
        ownerUserId: ids.actorUserId,
        reportedByUserId: ids.ownerUserId,
      },
    });
    await prisma.projectMilestone.create({
      data: {
        id: ids.milestoneId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        projectId: ids.restrictedProjectId,
        title: `Authorization milestone ${suffix}`,
        status: "PLANNED",
        targetDate: new Date("2026-08-31T00:00:00.000Z"),
        ownerUserId: ids.actorUserId,
        createdByUserId: ids.ownerUserId,
        updatedByUserId: ids.ownerUserId,
      },
    });
    await prisma.projectRisk.create({
      data: {
        id: ids.riskId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        projectId: ids.restrictedProjectId,
        title: `Authorization risk ${suffix}`,
        category: "Delivery",
        likelihood: "HIGH",
        impact: "HIGH",
        severity: "HIGH",
        status: "OPEN",
        ownerUserId: ids.actorUserId,
        createdByUserId: ids.ownerUserId,
        updatedByUserId: ids.ownerUserId,
      },
    });
    await prisma.projectRecordLink.create({
      data: {
        id: ids.recordLinkId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        projectId: ids.restrictedProjectId,
        taskId: ids.taskId,
        sourceRecordType: "PURCHASE_ORDER",
        sourceRecordId: randomUUID(),
        relationType: "RELATED",
        linkLabel: "Authorization source link",
        createdByUserId: ids.ownerUserId,
        updatedByUserId: ids.ownerUserId,
      },
    });
    await prisma.attachment.create({
      data: {
        id: ids.attachmentId,
        tenantId: ids.tenantId,
        storageProvider: "PRIVATE_LOCAL",
        objectKey: `authorization/projects/${suffix}/evidence.pdf`,
        originalFilename: "evidence.pdf",
        mimeType: "application/pdf",
        sizeBytes: 128,
        uploadedByUserId: ids.ownerUserId,
      },
    });
    await prisma.projectAttachment.create({
      data: {
        id: ids.projectAttachmentId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        projectId: ids.restrictedProjectId,
        taskId: ids.taskId,
        attachmentId: ids.attachmentId,
        purpose: "EVIDENCE",
        caption: "Authorization evidence",
        createdByUserId: ids.ownerUserId,
      },
    });
    await prisma.notification.createMany({
      data: [
        {
          id: ids.actorNotificationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationId: ids.locationId,
          recipientUserId: ids.actorUserId,
          notificationType: "AUTHORIZATION_TEST",
          title: "Actor notification",
          body: "Actor notification body",
          deepLink: "/notifications",
          entityType: "Project",
          entityId: ids.restrictedProjectId,
          sourceEventKey: `authz-project-actor-${suffix}`,
        },
        {
          id: ids.ownerNotificationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationId: ids.locationId,
          recipientUserId: ids.ownerUserId,
          notificationType: "AUTHORIZATION_TEST",
          title: "Owner notification",
          body: "Owner notification body",
          deepLink: "/notifications",
          entityType: "Project",
          entityId: ids.restrictedProjectId,
          sourceEventKey: `authz-project-owner-${suffix}`,
        },
      ],
    });

    const requirementBase = {
      tenantId: ids.tenantId,
      kind: "EVIDENCE" as const,
      label: "Authorization evidence note",
      evidenceType: "APPROVAL_NOTE",
      ownerUserId: ids.actorUserId,
      createdByUserId: ids.ownerUserId,
      updatedByUserId: ids.ownerUserId,
    };
    await prisma.projectRequirement.createMany({
      data: [
        {
          ...requirementBase,
          id: ids.restrictedRequirementId,
          companyId: ids.companyId,
          projectId: ids.restrictedProjectId,
          code: `AZPO-RESTRICTED-${suffix}`,
        },
        {
          ...requirementBase,
          id: ids.adjacentLocationRequirementId,
          companyId: ids.companyId,
          projectId: ids.adjacentLocationProjectId,
          code: `AZPO-LOCATION-${suffix}`,
        },
        {
          ...requirementBase,
          id: ids.adjacentBrandRequirementId,
          companyId: ids.companyId,
          projectId: ids.adjacentBrandProjectId,
          code: `AZPO-BRAND-${suffix}`,
        },
        {
          ...requirementBase,
          id: ids.adjacentCompanyRequirementId,
          companyId: ids.adjacentCompanyId,
          projectId: ids.adjacentCompanyProjectId,
          code: `AZPO-COMPANY-${suffix}`,
        },
        {
          ...requirementBase,
          id: ids.invalidTransitionRequirementId,
          companyId: ids.companyId,
          projectId: ids.restrictedProjectId,
          code: `AZPO-INVALID-${suffix}`,
          status: "SUBMITTED",
          submittedAt: new Date("2026-07-20T00:00:00.000Z"),
          submittedByUserId: ids.ownerUserId,
        },
        {
          ...requirementBase,
          id: ids.selfDecisionRequirementId,
          companyId: ids.companyId,
          projectId: ids.restrictedProjectId,
          code: `AZPO-SELF-${suffix}`,
          status: "SUBMITTED",
          reviewerUserId: ids.actorUserId,
          submittedAt: new Date("2026-07-20T00:00:00.000Z"),
          submittedByUserId: ids.actorUserId,
        },
      ],
    });
  });

  afterAll(async () => {
    clearAuthenticatedRequest();
    if (prisma) await prisma.$disconnect();
  });

  it("AUTHZ-PROJECT-OPS-RESTRICTED-ACCESS-REVOCATION-NO-MUTATION", async () => {
    const staleSession = await getConfiguredContext(actorEmail);
    await prisma.projectMember.update({
      where: { id: ids.projectMemberId },
      data: {
        status: "INACTIVE",
        removedAt: new Date(),
        removedByUserId: ids.ownerUserId,
      },
    });
    await prisma.userScopeAssignment.update({
      where: { id: ids.projectScopeId },
      data: { status: "INACTIVE", endsAt: new Date() },
    });
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: projectManagePermissionId,
        },
      },
    });
    const before = await snapshotProtectedState();
    try {
      await expect(
        submitProjectRequirementForSession(staleSession, {
          requirementId: ids.restrictedRequirementId,
          expectedVersion: 1,
          evidenceNote: "This denied write must not persist.",
        }),
      ).rejects.toThrow("PROJECT_REQUIREMENT_NOT_FOUND");
      const createTaskForm = new FormData();
      createTaskForm.set("projectId", ids.restrictedProjectId);
      createTaskForm.set("title", "Denied task");
      createTaskForm.set("description", "");
      createTaskForm.set("assigneeUserId", "");
      createTaskForm.set("dueAt", "");
      await expect(
        projectTasks.createProjectTask(createTaskForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");
      const createMilestoneForm = new FormData();
      createMilestoneForm.set("projectId", ids.restrictedProjectId);
      createMilestoneForm.set("title", "Denied milestone");
      createMilestoneForm.set("description", "");
      createMilestoneForm.set("targetDate", "2026-08-31");
      createMilestoneForm.set("atRiskReason", "");
      await expect(
        projectMilestones.createProjectMilestone(createMilestoneForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");
      const createRiskForm = new FormData();
      createRiskForm.set("projectId", ids.restrictedProjectId);
      createRiskForm.set("title", "Denied risk");
      createRiskForm.set("category", "Delivery");
      createRiskForm.set("likelihood", "HIGH");
      createRiskForm.set("impact", "HIGH");
      await expect(
        projectRisks.createProjectRisk(createRiskForm),
      ).rejects.toThrow("PROJECT_RISK_PERMISSION_DENIED");
      const createLinkForm = new FormData();
      createLinkForm.set("projectId", ids.restrictedProjectId);
      createLinkForm.set("sourceRecordType", "PURCHASE_ORDER");
      createLinkForm.set("sourceRecordId", "PO-DENIED");
      createLinkForm.set("relationType", "RELATED");
      createLinkForm.set("linkLabel", "Denied source link");
      await expect(
        projectRecordLinks.createProjectRecordLink(createLinkForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");

      const transitionMilestoneForm = new FormData();
      transitionMilestoneForm.set("milestoneId", ids.milestoneId);
      transitionMilestoneForm.set("nextStatus", "ACHIEVED");
      transitionMilestoneForm.set("expectedVersion", "1");
      transitionMilestoneForm.set(
        "reason",
        "Authorization denial verification",
      );
      await expect(
        projectMilestones.transitionProjectMilestone(transitionMilestoneForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");

      const archiveLinkForm = new FormData();
      archiveLinkForm.set("linkId", ids.recordLinkId);
      archiveLinkForm.set("archiveReason", "Authorization denial verification");
      await expect(
        projectRecordLinks.archiveProjectRecordLink(archiveLinkForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");

      const uploadRequirementForm = new FormData();
      uploadRequirementForm.set("requirementId", ids.restrictedRequirementId);
      uploadRequirementForm.set("caption", "Authorization denial verification");
      uploadRequirementForm.set(
        "file",
        new File(["authorization evidence"], "evidence.pdf", {
          type: "application/pdf",
        }),
      );
      await expect(
        uploadProjectRequirementEvidence(uploadRequirementForm),
      ).rejects.toThrow("PROJECT_REQUIREMENT_NOT_FOUND");
      await expect(
        reassignProjectRequirementReviewerForSession(staleSession, {
          requirementId: ids.restrictedRequirementId,
          reviewerUserId: ids.ownerUserId,
          expectedVersion: 1,
          reason: "Authorization denial verification",
        }),
      ).rejects.toThrow("PROJECT_REQUIREMENT_NOT_FOUND");
      const reassignRequirementForm = new FormData();
      reassignRequirementForm.set("requirementId", ids.restrictedRequirementId);
      reassignRequirementForm.set("reviewerUserId", ids.ownerUserId);
      reassignRequirementForm.set("expectedVersion", "1");
      reassignRequirementForm.set(
        "reason",
        "Authorization denial verification",
      );
      await expect(
        reassignProjectRequirementReviewer(reassignRequirementForm),
      ).rejects.toThrow("PROJECT_REQUIREMENT_NOT_FOUND");
      await expect(
        projectRecordLinks.listProjectTaskRecordLinks(staleSession, ids.taskId),
      ).rejects.toThrow("PROJECT_TASK_NOT_FOUND");
      await expect(
        resolveProjectRequirementExceptionForSession(staleSession, {
          requirementId: ids.restrictedRequirementId,
          expectedVersion: 1,
          resolution: "WAIVED",
          reason: "Authorization denial verification",
        }),
      ).rejects.toThrow("PROJECT_REQUIREMENT_NOT_FOUND");
      const resolveRequirementForm = new FormData();
      resolveRequirementForm.set("requirementId", ids.restrictedRequirementId);
      resolveRequirementForm.set("expectedVersion", "1");
      resolveRequirementForm.set("resolution", "WAIVED");
      resolveRequirementForm.set("reason", "Authorization denial verification");
      await expect(
        resolveProjectRequirementException(resolveRequirementForm),
      ).rejects.toThrow("PROJECT_REQUIREMENT_NOT_FOUND");

      const transitionRiskForm = new FormData();
      transitionRiskForm.set("riskId", ids.riskId);
      transitionRiskForm.set("nextStatus", "MITIGATING");
      transitionRiskForm.set("expectedVersion", "1");
      transitionRiskForm.set(
        "mitigationPlan",
        "Authorization denial verification",
      );
      transitionRiskForm.set(
        "resolutionNote",
        "Authorization denial verification",
      );
      await expect(
        projectRisks.transitionProjectRisk(transitionRiskForm),
      ).rejects.toThrow("PROJECT_RISK_PERMISSION_DENIED");

      const addMemberForm = new FormData();
      addMemberForm.set("projectId", ids.restrictedProjectId);
      addMemberForm.set("userId", ids.ownerUserId);
      addMemberForm.set("projectRole", "VIEWER");
      await expect(projects.addProjectMember(addMemberForm)).rejects.toThrow(
        "PERMISSION_DENIED",
      );

      const removeMemberForm = new FormData();
      removeMemberForm.set("memberId", ids.removableMemberId);
      removeMemberForm.set(
        "removalReason",
        "Authorization denial verification",
      );
      await expect(
        projects.removeProjectMember(removeMemberForm),
      ).rejects.toThrow("PERMISSION_DENIED");

      const createProjectForm = new FormData();
      createProjectForm.set("code", `DENIED-${suffix}`);
      createProjectForm.set("name", "Denied project");
      createProjectForm.set("projectType", "IMPLEMENTATION");
      await expect(projects.createProject(createProjectForm)).rejects.toThrow(
        "PERMISSION_DENIED",
      );

      const updateLeadershipForm = new FormData();
      updateLeadershipForm.set("projectId", ids.restrictedProjectId);
      updateLeadershipForm.set("sponsorUserId", ids.ownerUserId);
      updateLeadershipForm.set("managerUserId", ids.actorUserId);
      updateLeadershipForm.set("expectedVersion", "1");
      updateLeadershipForm.set("reason", "Authorization denial verification");
      await expect(
        projects.updateProjectLeadership(updateLeadershipForm),
      ).rejects.toThrow("PERMISSION_DENIED");

      const updateDetailsForm = new FormData();
      updateDetailsForm.set("projectId", ids.restrictedProjectId);
      updateDetailsForm.set("expectedVersion", "1");
      updateDetailsForm.set("description", "Denied project details");
      updateDetailsForm.set("targetEndAt", "");
      await expect(
        projects.updateProjectDetails(updateDetailsForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");

      const transitionTaskForm = new FormData();
      transitionTaskForm.set("taskId", ids.taskId);
      transitionTaskForm.set("nextStatus", "IN_PROGRESS");
      transitionTaskForm.set("expectedVersion", "1");
      transitionTaskForm.set("reason", "Authorization denial verification");
      transitionTaskForm.set("nextReviewAt", "");
      transitionTaskForm.set(
        "completionNote",
        "Authorization denial verification",
      );
      await expect(
        projectTasks.transitionProjectTask(transitionTaskForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");
      const reassignTaskForm = new FormData();
      reassignTaskForm.set("taskId", ids.taskId);
      reassignTaskForm.set("assigneeUserId", ids.ownerUserId);
      reassignTaskForm.set("expectedVersion", "1");
      reassignTaskForm.set("reason", "Authorization denial verification");
      await expect(
        projectTasks.reassignProjectTask(reassignTaskForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");

      const resolveBlockerForm = new FormData();
      resolveBlockerForm.set("blockerId", ids.blockerId);
      resolveBlockerForm.set("taskId", ids.taskId);
      resolveBlockerForm.set("nextStatus", "RESOLVED");
      resolveBlockerForm.set(
        "resolutionNote",
        "Authorization denial verification",
      );
      await expect(
        projectTasks.resolveProjectTaskBlocker(resolveBlockerForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");

      const toggleChecklistForm = new FormData();
      toggleChecklistForm.set("checklistItemId", ids.checklistItemId);
      toggleChecklistForm.set("isCompleted", "true");
      await expect(
        projectTasks.toggleProjectTaskChecklistItem(toggleChecklistForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");

      const checklistForm = new FormData();
      checklistForm.set("taskId", ids.taskId);
      checklistForm.set("title", "Denied checklist item");
      await expect(
        projectTasks.addProjectTaskChecklistItem(checklistForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");

      const commentForm = new FormData();
      commentForm.set("taskId", ids.taskId);
      commentForm.set("body", "Denied project task comment");
      await expect(
        projectTasks.addProjectTaskComment(commentForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");

      const addAttachmentForm = new FormData();
      addAttachmentForm.set("taskId", ids.taskId);
      addAttachmentForm.set("attachmentId", ids.attachmentId);
      addAttachmentForm.set("purpose", "EVIDENCE");
      addAttachmentForm.set("caption", "Authorization denial verification");
      await expect(
        projectTasks.addProjectTaskAttachment(addAttachmentForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");

      const archiveAttachmentForm = new FormData();
      archiveAttachmentForm.set("projectAttachmentId", ids.projectAttachmentId);
      archiveAttachmentForm.set(
        "archiveReason",
        "Authorization denial verification",
      );
      await expect(
        projectTasks.archiveProjectTaskAttachment(archiveAttachmentForm),
      ).rejects.toThrow("PROJECT_NOT_FOUND");
      expect(await snapshotProtectedState()).toEqual(before);
    } finally {
      await prisma.projectMember.update({
        where: { id: ids.projectMemberId },
        data: { status: "ACTIVE", removedAt: null, removedByUserId: null },
      });
      await prisma.userScopeAssignment.update({
        where: { id: ids.projectScopeId },
        data: { status: "ACTIVE", endsAt: null },
      });
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: projectManagePermissionId },
      });
    }
  });

  it("AUTHZ-PROJECT-CREATE-LIVE-PERMISSION-REVOCATION-NO-MUTATION", async () => {
    const projectCreatePermission = await prisma.permission.findUniqueOrThrow({
      where: { code: permissions.projectCreate },
      select: { id: true },
    });
    await prisma.rolePermission.create({
      data: {
        roleId: ids.roleId,
        permissionId: projectCreatePermission.id,
      },
    });
    const staleSession = await getConfiguredContext(actorEmail);
    expect(staleSession.permissionCodes).toContain(permissions.projectCreate);
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: projectCreatePermission.id,
        },
      },
    });
    const before = await snapshotProtectedState();
    const createProjectForm = new FormData();
    createProjectForm.set("code", `REVOKED-CREATE-${suffix}`);
    createProjectForm.set("name", "Revoked project creation");
    createProjectForm.set("projectType", "IMPLEMENTATION");
    try {
      await expect(projects.createProject(createProjectForm)).rejects.toThrow(
        "PERMISSION_DENIED",
      );
      expect(await snapshotProtectedState()).toEqual(before);
    } finally {
      await prisma.rolePermission.deleteMany({
        where: {
          roleId: ids.roleId,
          permissionId: projectCreatePermission.id,
        },
      });
    }
  });

  it("AUTHZ-PROJECT-OPS-LIFECYCLE-DENIAL-AUDIT-NO-MUTATION", async () => {
    const form = new FormData();
    form.set("projectId", ids.restrictedProjectId);
    form.set("nextStatus", "ACTIVE");
    form.set("expectedVersion", "1");
    form.set("reason", "Authorization denial verification");
    const before = await snapshotProtectedState();

    await expect(projects.transitionProjectLifecycle(form)).rejects.toThrow(
      "PROJECT_LIFECYCLE_PERMISSION_DENIED",
    );

    const after = await snapshotProtectedState();
    expect({ ...after, auditEvents: before.auditEvents }).toEqual(before);
    expect(after.auditEvents).toHaveLength(before.auditEvents.length + 1);
    expect(after.auditEvents.at(-1)).toMatchObject({
      eventType: "project.lifecycle.denied",
      entityId: ids.restrictedProjectId,
      metadata: expect.objectContaining({
        nextStatus: "ACTIVE",
        reasonCode: "PROJECT_LIFECYCLE_PERMISSION_DENIED",
      }),
    });
  });

  it("AUTHZ-PROJECT-OPS-EXPORT-LIVE-PERMISSION-REVOCATION-AUDIT-NO-DATA-LEAK", async () => {
    const staleSession = await getConfiguredContext(actorEmail);
    const projectPermissionRows = await prisma.permission.findMany({
      where: {
        code: { in: [permissions.projectView, permissions.projectManage] },
      },
      select: { id: true },
    });
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: ids.roleId,
        permissionId: { in: projectPermissionRows.map(({ id }) => id) },
      },
    });
    const before = await snapshotProtectedState();
    const deniedExports: Array<readonly [string, () => Promise<unknown>]> = [
      [
        "project-health",
        () => projectReports.buildProjectHealthExportRows(staleSession),
      ],
      [
        "project-task-register",
        () => projectReports.buildProjectTaskRegisterExportRows(staleSession),
      ],
      [
        "project-activity-log",
        () => projectReports.buildProjectActivityLogExportRows(staleSession),
      ],
      [
        "project-linked-record-follow-up",
        () =>
          projectReports.buildProjectLinkedRecordFollowUpExportRows(
            staleSession,
          ),
      ],
    ];

    try {
      for (const [, invoke] of deniedExports) {
        await expect(invoke()).rejects.toThrow("PERMISSION_DENIED");
      }
      const after = await snapshotProtectedState();
      expect({ ...after, auditEvents: before.auditEvents }).toEqual(before);
      const newAuditEvents = after.auditEvents.slice(before.auditEvents.length);
      expect(newAuditEvents).toHaveLength(deniedExports.length);
      expect(
        newAuditEvents.map((event) => ({
          eventType: event.eventType,
          entityId: event.entityId,
          reportId: (event.metadata as { reportId?: unknown } | null)?.reportId,
          reasonCode: (event.metadata as { reasonCode?: unknown } | null)
            ?.reasonCode,
        })),
      ).toEqual(
        expect.arrayContaining(
          deniedExports.map(([reportId]) => ({
            eventType: "project_report.export_denied",
            entityId: ids.companyId,
            reportId,
            reasonCode: "PERMISSION_DENIED",
          })),
        ),
      );
    } finally {
      await prisma.rolePermission.createMany({
        data: projectPermissionRows.map(({ id }) => ({
          roleId: ids.roleId,
          permissionId: id,
        })),
      });
    }
  });

  it("AUTHZ-PROJECT-OPS-COMPANY-LOCATION-BRAND-SCOPE-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    for (const requirementId of [
      ids.adjacentCompanyRequirementId,
      ids.adjacentLocationRequirementId,
      ids.adjacentBrandRequirementId,
    ]) {
      const before = await snapshotProtectedState();
      await expect(
        submitProjectRequirementForSession(session, {
          requirementId,
          expectedVersion: 1,
          evidenceNote: "This out-of-scope write must not persist.",
        }),
      ).rejects.toThrow("PROJECT_REQUIREMENT_NOT_FOUND");
      expect(await snapshotProtectedState()).toEqual(before);
    }
  });

  it("AUTHZ-PROJECT-OPS-NOTIFICATION-SCOPE-AND-GUARDED-CALLERS-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const before = await snapshotProtectedState();

    await notifications.markNotificationRead(session, ids.ownerNotificationId);
    expect(await snapshotProtectedState()).toEqual(before);

    await expect(
      projectNotifications.runProjectTaskDeadlineReminderScan(session, {
        asOf: new Date("2026-07-21T00:00:00.000Z"),
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      restaurantOpsNotifications.runRestaurantOpsExceptionReminderScan(
        session,
        {
          asOf: new Date("2026-07-21T00:00:00.000Z"),
          timeZone: "Asia/Manila",
        },
      ),
    ).rejects.toThrow("PERMISSION_DENIED");

    const scopedRecipients =
      await notifications.resolveScopedNotificationRecipients(prisma, {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        locationId: ids.locationId,
      });
    expect(scopedRecipients).toEqual([ids.actorUserId]);
    await expect(
      notifications.recordWorkflowNotifications(prisma, {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        locationId: ids.locationId,
        recipientUserIds: [],
        notificationType: "AUTHORIZATION_TEST",
        title: "No recipient notification",
        body: "This must not be written.",
        deepLink: "/notifications",
        entityType: "Project",
        entityId: ids.restrictedProjectId,
        sourceEventKey: `authz-project-empty-${suffix}`,
      }),
    ).resolves.toEqual([]);
    expect(await snapshotProtectedState()).toEqual(before);
  });

  it("AUTHZ-PROJECT-OPS-REMINDER-LIVE-PERMISSION-REVOCATION-NO-MUTATION", async () => {
    const branchViewPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: permissions.branchOperationsView },
      select: { id: true },
    });
    await prisma.rolePermission.create({
      data: { roleId: ids.roleId, permissionId: branchViewPermission.id },
    });
    await prisma.userScopeAssignment.create({
      data: {
        id: ids.companyManageScopeId,
        userId: ids.actorUserId,
        scopeType: "COMPANY",
        scopeId: ids.companyId,
        accessLevel: "MANAGE",
      },
    });
    const staleSession = await getConfiguredContext(actorEmail);
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: ids.roleId,
        permissionId: {
          in: [projectManagePermissionId, branchViewPermission.id],
        },
      },
    });
    const before = await snapshotProtectedState();

    try {
      await expect(
        projectNotifications.runProjectTaskDeadlineReminderScan(staleSession, {
          asOf: new Date("2026-07-21T00:00:00.000Z"),
        }),
      ).rejects.toThrow("PERMISSION_DENIED");
      await expect(
        restaurantOpsNotifications.runRestaurantOpsExceptionReminderScan(
          staleSession,
          {
            asOf: new Date("2026-07-21T00:00:00.000Z"),
            timeZone: "Asia/Manila",
          },
        ),
      ).rejects.toThrow("PERMISSION_DENIED");
      expect(await snapshotProtectedState()).toEqual(before);
    } finally {
      await prisma.userScopeAssignment.delete({
        where: { id: ids.companyManageScopeId },
      });
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: projectManagePermissionId },
      });
    }
  });

  it("AUTHZ-PROJECT-OPS-WORKFLOW-TRANSITION-DENIAL-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const before = await snapshotProtectedState();
    await expect(
      submitProjectRequirementForSession(session, {
        requirementId: ids.invalidTransitionRequirementId,
        expectedVersion: 1,
        evidenceNote: "A submitted requirement cannot be submitted again.",
      }),
    ).rejects.toThrow("PROJECT_REQUIREMENT_INVALID_SUBMIT_STATE");
    expect(await snapshotProtectedState()).toEqual(before);
  });

  it("AUTHZ-PROJECT-OPS-SELF-DECISION-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const before = await snapshotProtectedState();
    await expect(
      decideProjectRequirementForSession(session, {
        requirementId: ids.selfDecisionRequirementId,
        expectedVersion: 1,
        decision: "APPROVED",
      }),
    ).rejects.toThrow("PROJECT_REQUIREMENT_SELF_DECISION_DENIED");
    expect(await snapshotProtectedState()).toEqual(before);
  });

  it("AUTHZ-PROJECT-OPS-RESTAURANT-PERMISSION-DENIAL-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const deniedCalls: Array<readonly [string, () => Promise<unknown>]> = [
      [
        "branch create",
        () => branchOperations.createBranchOperationChecklist(new FormData()),
      ],
      [
        "branch review",
        () => branchOperations.reviewBranchOperationChecklist(new FormData()),
      ],
      [
        "branch close",
        () => branchOperations.closeBranchOperationChecklist(new FormData()),
      ],
      [
        "branch return correction",
        () =>
          branchOperations.returnBranchOperationChecklistForCorrection(
            new FormData(),
          ),
      ],
      [
        "branch apply correction",
        () =>
          branchOperations.applyBranchOperationChecklistCorrection(
            new FormData(),
          ),
      ],
      [
        "branch export",
        () => branchOperations.buildBranchOperationsExportRows(session),
      ],
      [
        "food safety create",
        () => foodSafety.createFoodSafetyLog(new FormData()),
      ],
      [
        "food safety review",
        () => foodSafety.reviewFoodSafetyLog(new FormData()),
      ],
      [
        "food safety close",
        () => foodSafety.closeFoodSafetyLog(new FormData()),
      ],
      [
        "food safety return correction",
        () => foodSafety.returnFoodSafetyLogForCorrection(new FormData()),
      ],
      [
        "food safety apply correction",
        () => foodSafety.applyFoodSafetyLogCorrection(new FormData()),
      ],
      [
        "food safety export",
        () => foodSafety.buildFoodSafetyExportRows(session),
      ],
      [
        "incident create",
        () => incidents.createOperationalIncident(new FormData()),
      ],
      [
        "incident cancel",
        () => incidents.cancelOperationalIncident(new FormData()),
      ],
      [
        "incident resolve",
        () => incidents.resolveOperationalIncident(new FormData()),
      ],
      [
        "incident correct",
        () => incidents.correctOperationalIncident(new FormData()),
      ],
      ["incident export", () => incidents.buildIncidentExportRows(session)],
      [
        "maintenance create",
        () => maintenance.createMaintenanceTicket(new FormData()),
      ],
      [
        "maintenance complete",
        () => maintenance.completeMaintenanceTicket(new FormData()),
      ],
      [
        "maintenance cancel",
        () => maintenance.cancelMaintenanceTicket(new FormData()),
      ],
      [
        "maintenance correct",
        () => maintenance.correctMaintenanceTicket(new FormData()),
      ],
      [
        "maintenance export",
        () => maintenance.buildMaintenanceExportRows(session),
      ],
      ["recipe create", () => recipes.createDraftRecipe(new FormData())],
      [
        "recipe revision",
        () => recipes.createRecipeRevisionDraft(new FormData()),
      ],
      ["recipe archive", () => recipes.archiveRecipe(new FormData())],
      [
        "menu price create",
        () => recipes.createMenuPriceDecision(new FormData()),
      ],
      [
        "recipe costing export",
        () => recipes.buildRecipeCostingExportRows(session),
      ],
      [
        "food cost export",
        () => recipes.buildFoodCostAnalysisExportRows(session),
      ],
    ];
    const before = await snapshotProtectedState();
    for (const [, invoke] of deniedCalls) {
      await expect(invoke()).rejects.toThrow("PERMISSION_DENIED");
    }
    expect(await snapshotProtectedState()).toEqual(before);
  });

  it("AUTHZ-PROJECT-OPS-TEMPLATE-PERMISSION-DENIAL-NO-MUTATION", async () => {
    const templateId = randomUUID();
    const versionedForm = () => {
      const form = new FormData();
      form.set("id", templateId);
      form.set("expectedVersion", "1");
      return form;
    };
    const deniedCalls: Array<() => Promise<unknown>> = [
      () => projectTemplates.createProjectTemplate(new FormData()),
      () => projectTemplates.createExpansionOpeningPlaybook(new FormData()),
      () =>
        projectTemplates.duplicateExpansionOpeningPlaybookRevision(
          new FormData(),
        ),
      () => projectTemplates.archiveProjectTemplate(new FormData()),
      () => projectTemplates.publishProjectTemplate(new FormData()),
      () => {
        const form = versionedForm();
        form.set("name", "Denied opening playbook");
        form.set("projectType", "Branch Opening");
        return projectTemplates.updateExpansionOpeningPlaybookOverview(form);
      },
      () => {
        const form = versionedForm();
        form.set("templateTaskCode", "DENIED-TASK");
        form.set("title", "Denied task");
        form.set("priority", "NORMAL");
        form.set("status", "PLANNED");
        form.set("ownerRole", "PROJECT_MANAGER");
        return projectTemplates.upsertExpansionOpeningPlaybookTask(form);
      },
      () => {
        const form = versionedForm();
        form.set("templateTaskCode", "DENIED-TASK");
        return projectTemplates.removeExpansionOpeningPlaybookTask(form);
      },
      () => {
        const form = versionedForm();
        form.set("code", "DENIED-MILESTONE");
        form.set("title", "Denied milestone");
        form.set("ownerRole", "PROJECT_MANAGER");
        return projectTemplates.upsertExpansionOpeningPlaybookMilestone(form);
      },
      () => {
        const form = versionedForm();
        form.set("code", "DENIED-MILESTONE");
        return projectTemplates.removeExpansionOpeningPlaybookMilestone(form);
      },
      () => {
        const form = versionedForm();
        form.set("taskCode", "DENIED-TASK");
        form.set("title", "Denied checklist item");
        return projectTemplates.upsertExpansionOpeningPlaybookChecklistItem(
          form,
        );
      },
      () => {
        const form = versionedForm();
        form.set("taskCode", "DENIED-TASK");
        form.set("title", "Denied checklist item");
        return projectTemplates.removeExpansionOpeningPlaybookChecklistItem(
          form,
        );
      },
      () => {
        const form = versionedForm();
        form.set("code", "DENIED-EVIDENCE");
        form.set("label", "Denied evidence");
        form.set("evidenceType", "DOCUMENT");
        form.set("ownerRole", "PROJECT_MANAGER");
        return projectTemplates.upsertExpansionOpeningPlaybookEvidenceDefault(
          form,
        );
      },
      () => {
        const form = versionedForm();
        form.set("code", "DENIED-EVIDENCE");
        return projectTemplates.removeExpansionOpeningPlaybookEvidenceDefault(
          form,
        );
      },
      () => {
        const form = versionedForm();
        form.set("code", "DENIED-SIGNOFF");
        form.set("label", "Denied signoff");
        form.set("stage", "GO_NO_GO");
        form.set("ownerRole", "PROJECT_SPONSOR");
        return projectTemplates.upsertExpansionOpeningPlaybookSignoffDefault(
          form,
        );
      },
      () => {
        const form = versionedForm();
        form.set("code", "DENIED-SIGNOFF");
        return projectTemplates.removeExpansionOpeningPlaybookSignoffDefault(
          form,
        );
      },
      () => {
        const form = versionedForm();
        form.set("dueSoonWindowDays", "2");
        form.set("overdueReminderFrequencyDays", "1");
        form.set("maxOverdueRemindersPerTask", "5");
        return projectTemplates.updateExpansionOpeningPlaybookReminders(form);
      },
    ];
    const before = await snapshotProtectedState();
    for (const invoke of deniedCalls) {
      await expect(invoke()).rejects.toThrow(
        "PROJECT_TEMPLATE_PERMISSION_DENIED",
      );
    }
    expect(await snapshotProtectedState()).toEqual(before);
  });

  it("AUTHZ-PROJECT-OPS-TEMPLATE-LIVE-PERMISSION-REVOCATION-NO-MUTATION", async () => {
    const templatePermission = await prisma.permission.findUniqueOrThrow({
      where: { code: permissions.projectTemplateConfigure },
      select: { id: true },
    });
    await prisma.rolePermission.create({
      data: { roleId: ids.roleId, permissionId: templatePermission.id },
    });
    const staleSession = await getConfiguredContext(actorEmail);
    const projectPermissionRows = await prisma.permission.findMany({
      where: {
        code: { in: [permissions.projectView, permissions.projectManage] },
      },
      select: { id: true },
    });
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: ids.roleId,
        permissionId: {
          in: [
            templatePermission.id,
            ...projectPermissionRows.map(({ id }) => id),
          ],
        },
      },
    });
    const before = await snapshotProtectedState();

    try {
      await expect(
        projectTemplates.listProjectTemplates(staleSession),
      ).rejects.toThrow("PERMISSION_DENIED");
      await expect(
        projectTemplates.listExpansionOpeningPlaybooks(staleSession),
      ).rejects.toThrow("PERMISSION_DENIED");
      await expect(
        projectTemplates.getExpansionOpeningPlaybook(
          staleSession,
          randomUUID(),
        ),
      ).rejects.toThrow("PERMISSION_DENIED");
      await expect(
        projectTemplates.listPublishedProjectTemplatesForProjectCreate(
          staleSession,
        ),
      ).rejects.toThrow("PERMISSION_DENIED");

      const upsertForm = new FormData();
      upsertForm.set("id", randomUUID());
      upsertForm.set("expectedVersion", "1");
      upsertForm.set("templateTaskCode", "DENIED-LIVE-TASK");
      upsertForm.set("title", "Denied live task");
      upsertForm.set("priority", "NORMAL");
      upsertForm.set("status", "PLANNED");
      upsertForm.set("ownerRole", "PROJECT_MANAGER");
      await expect(
        projectTemplates.upsertExpansionOpeningPlaybookTask(upsertForm),
      ).rejects.toThrow("PROJECT_TEMPLATE_PERMISSION_DENIED");
      expect(await snapshotProtectedState()).toEqual(before);
    } finally {
      await prisma.rolePermission.createMany({
        data: projectPermissionRows.map(({ id }) => ({
          roleId: ids.roleId,
          permissionId: id,
        })),
      });
    }
  });

  it("AUTHZ-PROJECT-OPS-MEMBER-MANAGE-LIVE-PERMISSION-REVOCATION-NO-MUTATION", async () => {
    const manageMembersPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: permissions.projectManageMembers },
      select: { id: true },
    });
    await prisma.rolePermission.create({
      data: { roleId: ids.roleId, permissionId: manageMembersPermission.id },
    });
    const staleSession = await getConfiguredContext(actorEmail);
    expect(
      (await projects.listProjectMemberOptions(staleSession)).map(
        ({ id }) => id,
      ),
    ).toEqual(expect.arrayContaining([ids.actorUserId, ids.ownerUserId]));
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: manageMembersPermission.id,
        },
      },
    });
    const before = await snapshotProtectedState();

    await expect(
      projects.listProjectMemberOptions(staleSession),
    ).rejects.toThrow("PERMISSION_DENIED");

    const addMemberForm = new FormData();
    addMemberForm.set("projectId", ids.restrictedProjectId);
    addMemberForm.set("userId", ids.ownerUserId);
    addMemberForm.set("projectRole", "VIEWER");
    await expect(projects.addProjectMember(addMemberForm)).rejects.toThrow(
      "PERMISSION_DENIED",
    );

    const removeMemberForm = new FormData();
    removeMemberForm.set("memberId", ids.removableMemberId);
    removeMemberForm.set("removalReason", "Authorization denial verification");
    await expect(
      projects.removeProjectMember(removeMemberForm),
    ).rejects.toThrow("PERMISSION_DENIED");
    expect(await snapshotProtectedState()).toEqual(before);
  });

  it("AUTHZ-PROJECT-OPS-EXPANSION-LIVE-PERMISSION-REVOCATION-NO-MUTATION", async () => {
    const staleSession = await getConfiguredContext(actorEmail);
    const projectPermissionRows = await prisma.permission.findMany({
      where: {
        code: { in: [permissions.projectView, permissions.projectManage] },
      },
      select: { id: true },
    });
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: ids.roleId,
        permissionId: { in: projectPermissionRows.map(({ id }) => id) },
      },
    });
    const deniedFormCalls = [
      expansionProjects.createExpansionCapexProcurementItem,
      expansionProjects.createExpansionConstructionTask,
      expansionProjects.createExpansionFeasibilityModel,
      expansionProjects.createExpansionOpeningReadiness,
      expansionProjects.createExpansionPermitDocument,
      expansionProjects.createExpansionPostOpeningReview,
      expansionProjects.createExpansionPunchListItem,
      expansionProjects.transitionExpansionCapexProcurementItem,
      expansionProjects.transitionExpansionConstructionTask,
      expansionProjects.transitionExpansionFeasibilityModel,
      expansionProjects.transitionExpansionLifecycleGate,
      expansionProjects.transitionExpansionOpeningReadiness,
      expansionProjects.transitionExpansionPermitDocument,
      expansionProjects.transitionExpansionPostOpeningReview,
      expansionProjects.transitionExpansionPunchListItem,
      expansionProjects.recordExpansionConstructionProgress,
      expansionProjects.seedExpansionLifecycleGates,
      expansionProjects.toggleExpansionOpeningReadinessChecklist,
    ];
    const before = await snapshotProtectedState();
    try {
      for (const invoke of deniedFormCalls) {
        await expect(invoke(new FormData())).rejects.toThrow(
          "PERMISSION_DENIED",
        );
      }
      await expect(
        expansionProjects.buildExpansionPortfolioExportRows(staleSession),
      ).rejects.toThrow("PERMISSION_DENIED");
      expect(await snapshotProtectedState()).toEqual(before);
    } finally {
      await prisma.rolePermission.createMany({
        data: projectPermissionRows.map(({ id }) => ({
          roleId: ids.roleId,
          permissionId: id,
        })),
      });
    }
  });

  it("AUTHZ-PROJECT-OPS-RECIPE-RECORD-SCOPE-NO-MUTATION", async () => {
    const menuPriceForm = new FormData();
    menuPriceForm.set("menuPriceDecisionId", randomUUID());
    menuPriceForm.set("action", "APPROVE");
    const recipeVersionForm = new FormData();
    recipeVersionForm.set("recipeVersionId", randomUUID());
    recipeVersionForm.set("action", "SUBMIT");
    const before = await snapshotProtectedState();
    await expect(
      recipes.transitionMenuPriceDecision(menuPriceForm),
    ).rejects.toThrow("MENU_PRICE_DECISION_NOT_FOUND");
    await expect(
      recipes.transitionRecipeVersion(recipeVersionForm),
    ).rejects.toThrow("RECIPE_VERSION_NOT_FOUND");
    expect(await snapshotProtectedState()).toEqual(before);
  });
});
