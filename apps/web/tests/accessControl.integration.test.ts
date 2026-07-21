import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { getConfiguredContext as getConfiguredContextType } from "../src/server/services/context";
import type {
  permissions as permissionsType,
  requirePermission as requirePermissionType,
} from "../src/server/services/authorization";
import type { findAuthorizedProject as findAuthorizedProjectType } from "../src/server/services/projects";
import type { assertControlledEvidenceSourceAccess as assertControlledEvidenceSourceAccessType } from "../src/server/services/attachments";
import type { downloadControlledEvidenceAttachmentForSession as downloadControlledEvidenceAttachmentForSessionType } from "../src/server/services/attachments";
import type { evidenceAttachmentSourceTypes as evidenceAttachmentSourceTypesType } from "../src/server/services/attachments";
import type { postInventoryMovement as postInventoryMovementType } from "../src/server/services/inventory";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(process.env);
if (!process.env.DATABASE_URL) {
  throw new Error(
    "ACCESS_CONTROL_DATABASE_REQUIRED: configure a disposable PostgreSQL DATABASE_URL before running the database-backed access-control suite"
  );
}

describe("database-backed access control", () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenantId: randomUUID(),
    companyId: randomUUID(),
    adjacentCompanyId: randomUUID(),
    brandId: randomUUID(),
    adjacentBrandId: randomUUID(),
    departmentId: randomUUID(),
    adjacentDepartmentId: randomUUID(),
    locationId: randomUUID(),
    userId: randomUUID(),
    fixtureOwnerUserId: randomUUID(),
    roleId: randomUUID(),
    permissionId: randomUUID(),
    otherTenantId: randomUUID(),
    otherTenantRoleId: randomUUID(),
    otherTenantPermissionId: randomUUID(),
    unrestrictedProjectId: randomUUID(),
    restrictedProjectId: randomUUID(),
    adjacentLocationId: randomUUID(),
    adjacentInventoryLocationId: randomUUID(),
    adjacentEmployeeId: randomUUID(),
    attachmentId: randomUUID(),
    controlledEvidenceLinkId: randomUUID(),
    projectLinkedExpenseId: randomUUID(),
    brandProjectId: randomUUID(),
    adjacentBrandProjectId: randomUUID(),
    departmentProjectId: randomUUID(),
    adjacentDepartmentProjectId: randomUUID(),
    adjacentCompanyProjectId: randomUUID(),
  };
  const email = `access-control-${suffix}@example.test`;
  const permissionCode = `test.access_control.${suffix}`;
  const otherTenantPermissionCode = `test.cross_tenant.${suffix}`;

  let prisma: PrismaClient;
  let getConfiguredContext: typeof getConfiguredContextType;
  let requirePermission: typeof requirePermissionType;
  let permissions: typeof permissionsType;
  let findAuthorizedProject: typeof findAuthorizedProjectType;
  let assertControlledEvidenceSourceAccess: typeof assertControlledEvidenceSourceAccessType;
  let downloadControlledEvidenceAttachmentForSession: typeof downloadControlledEvidenceAttachmentForSessionType;
  let evidenceAttachmentSourceTypes: typeof evidenceAttachmentSourceTypesType;
  let postInventoryMovement: typeof postInventoryMovementType;
  let workforcePermissionId: string;
  let projectManagePermissionId: string;
  let attachmentRoot: string | null = null;

  beforeAll(async () => {
    ({ prisma } = await import("@ogfi/database"));
    ({ getConfiguredContext } = await import("../src/server/services/context"));
    ({ permissions, requirePermission } = await import("../src/server/services/authorization"));
    ({ findAuthorizedProject } = await import("../src/server/services/projects"));
    ({
      assertControlledEvidenceSourceAccess,
      downloadControlledEvidenceAttachmentForSession,
      evidenceAttachmentSourceTypes,
    } = await import("../src/server/services/attachments"));
    ({ postInventoryMovement } = await import("../src/server/services/inventory"));

    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    if (identity[0]?.currentDatabase !== expectedDatabase) {
      throw new Error("AUTHORIZATION_DATABASE_IDENTITY_MISMATCH");
    }
    await prisma.tenant.create({
      data: {
        id: ids.tenantId,
        name: `Access Control Test ${suffix}`,
        loginCode: `access-${suffix}`,
      }
    });
    await prisma.tenant.create({
      data: {
        id: ids.otherTenantId,
        name: `Other Access Control Test ${suffix}`,
        loginCode: `access-other-${suffix}`,
      }
    });
    await prisma.company.create({
      data: {
        id: ids.companyId,
        tenantId: ids.tenantId,
        code: `ACT-${suffix}`,
        legalName: `Access Control Company ${suffix}`,
        currencyCode: "PHP"
      }
    });
    await prisma.company.create({
      data: {
        id: ids.adjacentCompanyId,
        tenantId: ids.tenantId,
        code: `ACT-ADJ-${suffix}`,
        legalName: `Adjacent Access Control Company ${suffix}`,
        currencyCode: "PHP",
      },
    });
    await prisma.brand.createMany({
      data: [
        {
          id: ids.brandId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `ACT-BRAND-${suffix}`,
          name: `Access Control Brand ${suffix}`,
        },
        {
          id: ids.adjacentBrandId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `ACT-BRAND-ADJ-${suffix}`,
          name: `Adjacent Access Control Brand ${suffix}`,
        },
      ],
    });
    await prisma.department.createMany({
      data: [
        {
          id: ids.departmentId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `ACT-DEPT-${suffix}`,
          name: `Access Control Department ${suffix}`,
        },
        {
          id: ids.adjacentDepartmentId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `ACT-DEPT-ADJ-${suffix}`,
          name: `Adjacent Access Control Department ${suffix}`,
        },
      ],
    });
    await prisma.location.create({
      data: {
        id: ids.locationId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        locationType: "BRANCH",
        code: `ACT-${suffix}`,
        name: `Access Control Location ${suffix}`
      }
    });
    await prisma.location.create({
      data: {
        id: ids.adjacentLocationId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        locationType: "BRANCH",
        code: `ACT-ADJ-${suffix}`,
        name: `Adjacent Access Control Location ${suffix}`,
      },
    });
    await prisma.inventoryLocation.create({
      data: {
        id: ids.adjacentInventoryLocationId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        locationId: ids.adjacentLocationId,
        code: `ACT-INV-ADJ-${suffix}`,
        name: `Adjacent Inventory Location ${suffix}`,
      },
    });
    await prisma.user.create({
      data: {
        id: ids.userId,
        tenantId: ids.tenantId,
        email,
        displayName: `Access Control User ${suffix}`
      }
    });
    await prisma.user.create({
      data: {
        id: ids.fixtureOwnerUserId,
        tenantId: ids.tenantId,
        email: `access-control-owner-${suffix}@example.test`,
        displayName: `Access Control Fixture Owner ${suffix}`,
      },
    });
    await prisma.role.create({
      data: {
        id: ids.roleId,
        tenantId: ids.tenantId,
        code: `ACCESS_CONTROL_${suffix}`,
        name: `Access Control Role ${suffix}`
      }
    });
    await prisma.role.create({
      data: {
        id: ids.otherTenantRoleId,
        tenantId: ids.otherTenantId,
        code: `OTHER_ACCESS_CONTROL_${suffix}`,
        name: `Other Access Control Role ${suffix}`
      }
    });
    await prisma.permission.create({
      data: {
        id: ids.permissionId,
        code: permissionCode,
        module: "test",
        action: "access_control"
      }
    });
    await prisma.permission.create({
      data: {
        id: ids.otherTenantPermissionId,
        tenantId: ids.otherTenantId,
        code: otherTenantPermissionCode,
        module: "test",
        action: "cross_tenant"
      }
    });
    await prisma.rolePermission.create({
      data: {
        roleId: ids.roleId,
        permissionId: ids.permissionId
      }
    });
    const authorizationPermissions = await prisma.permission.findMany({
      where: {
        code: {
          in: [
            permissions.projectView,
            permissions.projectManage,
            permissions.workforceManage,
          ],
        },
      },
      select: { id: true, code: true },
    });
    if (authorizationPermissions.length !== 3) {
      throw new Error("SEEDED_AUTHORIZATION_PERMISSIONS_REQUIRED");
    }
    workforcePermissionId = authorizationPermissions.find(
      (permission) => permission.code === permissions.workforceManage,
    )!.id;
    projectManagePermissionId = authorizationPermissions.find(
      (permission) => permission.code === permissions.projectManage,
    )!.id;
    await prisma.rolePermission.createMany({
      data: authorizationPermissions.map((permission) => ({
        roleId: ids.roleId,
        permissionId: permission.id,
      })),
    });
    await prisma.rolePermission.create({
      data: {
        roleId: ids.otherTenantRoleId,
        permissionId: ids.otherTenantPermissionId
      }
    });
    await prisma.userRoleAssignment.create({
      data: {
        userId: ids.userId,
        roleId: ids.roleId
      }
    });
    await prisma.userRoleAssignment.create({
      data: {
        userId: ids.userId,
        roleId: ids.otherTenantRoleId
      }
    });
    await prisma.userScopeAssignment.create({
      data: {
        userId: ids.userId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        accessLevel: "OPERATE"
      }
    });
    await prisma.project.createMany({
      data: [
        {
          id: ids.unrestrictedProjectId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `AUTHZ-OPEN-${suffix}`,
          name: `Authorization Open Project ${suffix}`,
          projectType: "IMPLEMENTATION",
          locationId: ids.locationId,
          sponsorUserId: ids.fixtureOwnerUserId,
          managerUserId: ids.fixtureOwnerUserId,
          isRestricted: false,
          createdByUserId: ids.userId,
          updatedByUserId: ids.userId,
        },
        {
          id: ids.restrictedProjectId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `AUTHZ-RESTRICTED-${suffix}`,
          name: `Authorization Restricted Project ${suffix}`,
          projectType: "IMPLEMENTATION",
          locationId: ids.locationId,
          sponsorUserId: ids.fixtureOwnerUserId,
          managerUserId: ids.fixtureOwnerUserId,
          isRestricted: true,
          createdByUserId: ids.userId,
          updatedByUserId: ids.userId,
        },
        {
          id: ids.brandProjectId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `AUTHZ-BRAND-${suffix}`,
          name: `Authorization Brand Project ${suffix}`,
          projectType: "IMPLEMENTATION",
          brandId: ids.brandId,
          sponsorUserId: ids.fixtureOwnerUserId,
          managerUserId: ids.fixtureOwnerUserId,
          createdByUserId: ids.userId,
          updatedByUserId: ids.userId,
        },
        {
          id: ids.adjacentBrandProjectId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `AUTHZ-BRAND-ADJ-${suffix}`,
          name: `Authorization Adjacent Brand Project ${suffix}`,
          projectType: "IMPLEMENTATION",
          brandId: ids.adjacentBrandId,
          sponsorUserId: ids.fixtureOwnerUserId,
          managerUserId: ids.fixtureOwnerUserId,
          createdByUserId: ids.userId,
          updatedByUserId: ids.userId,
        },
        {
          id: ids.departmentProjectId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `AUTHZ-DEPT-${suffix}`,
          name: `Authorization Department Project ${suffix}`,
          projectType: "IMPLEMENTATION",
          departmentId: ids.departmentId,
          sponsorUserId: ids.fixtureOwnerUserId,
          managerUserId: ids.fixtureOwnerUserId,
          createdByUserId: ids.userId,
          updatedByUserId: ids.userId,
        },
        {
          id: ids.adjacentDepartmentProjectId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `AUTHZ-DEPT-ADJ-${suffix}`,
          name: `Authorization Adjacent Department Project ${suffix}`,
          projectType: "IMPLEMENTATION",
          departmentId: ids.adjacentDepartmentId,
          sponsorUserId: ids.fixtureOwnerUserId,
          managerUserId: ids.fixtureOwnerUserId,
          createdByUserId: ids.userId,
          updatedByUserId: ids.userId,
        },
        {
          id: ids.adjacentCompanyProjectId,
          tenantId: ids.tenantId,
          companyId: ids.adjacentCompanyId,
          code: `AUTHZ-COMPANY-ADJ-${suffix}`,
          name: `Authorization Adjacent Company Project ${suffix}`,
          projectType: "IMPLEMENTATION",
          sponsorUserId: ids.fixtureOwnerUserId,
          managerUserId: ids.fixtureOwnerUserId,
          createdByUserId: ids.userId,
          updatedByUserId: ids.userId,
        },
      ],
    });
    await prisma.employee.create({
      data: {
        id: ids.adjacentEmployeeId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeCode: `AUTHZ-${suffix}`,
        legalName: `Adjacent Employee ${suffix}`,
        hireDate: new Date("2026-01-01T00:00:00.000Z"),
        homeLocationId: ids.adjacentLocationId,
        createdByUserId: ids.userId,
      },
    });
    await prisma.expenseRequest.create({
      data: {
        id: ids.projectLinkedExpenseId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: `AUTHZ-EXP-${suffix}`,
        requestDate: new Date("2026-01-02T00:00:00.000Z"),
        title: `Project-linked adjacent expense ${suffix}`,
        requestReason: "Authorization regression fixture",
        categoryCode: "AUTHZ_TEST",
        locationId: ids.adjacentLocationId,
        projectId: ids.unrestrictedProjectId,
        requestedByUserId: ids.userId,
      },
    });
    attachmentRoot = await mkdtemp(path.join(tmpdir(), "ogfi-authz-evidence-"));
    process.env.OGFI_PRIVATE_ATTACHMENT_ROOT = attachmentRoot;
    const objectKey = path.posix.join(
      "controlled-evidence",
      ids.tenantId,
      ids.attachmentId,
      "evidence.txt",
    );
    const evidenceBuffer = Buffer.from("authorized evidence");
    const evidencePath = path.join(attachmentRoot, ...objectKey.split("/"));
    await mkdir(path.dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, evidenceBuffer);
    await prisma.attachment.create({
      data: {
        id: ids.attachmentId,
        tenantId: ids.tenantId,
        storageProvider: "local-private",
        objectKey,
        originalFilename: "evidence.txt",
        mimeType: "text/plain",
        sizeBytes: evidenceBuffer.byteLength,
        checksum: `sha256:${createHash("sha256").update(evidenceBuffer).digest("hex")}`,
        uploadedByUserId: ids.userId,
      },
    });
    await prisma.controlledEvidenceAttachment.create({
      data: {
        id: ids.controlledEvidenceLinkId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        sourceType: "WORKFORCE_EMPLOYEE",
        sourceRecordId: ids.adjacentEmployeeId,
        sourceKey: `${ids.adjacentEmployeeId}:HEADER`,
        attachmentId: ids.attachmentId,
        createdByUserId: ids.userId,
      },
    });
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (attachmentRoot) {
      await rm(attachmentRoot, { recursive: true, force: true });
    }
    delete process.env.OGFI_PRIVATE_ATTACHMENT_ROOT;
  });

  it("recomputes active role permissions on the next authorization check", async () => {
    const session = await getConfiguredContext(email);
    expect(session.permissionCodes).toContain(permissionCode);
    expect(session.permissionCodes).not.toContain(otherTenantPermissionCode);
    await expect(requirePermission(session, permissionCode)).resolves.toBeUndefined();
    await expect(requirePermission(session, otherTenantPermissionCode)).rejects.toThrow(
      "PERMISSION_DENIED"
    );

    await prisma.userRoleAssignment.updateMany({
      where: { userId: ids.userId, roleId: ids.roleId },
      data: { startsAt: new Date(Date.now() + 60_000), endsAt: null }
    });
    expect((await getConfiguredContext(email)).permissionCodes).not.toContain(
      permissionCode
    );

    await prisma.userRoleAssignment.updateMany({
      where: { userId: ids.userId, roleId: ids.roleId },
      data: {
        startsAt: new Date(Date.now() - 120_000),
        endsAt: new Date(Date.now() - 60_000)
      }
    });
    expect((await getConfiguredContext(email)).permissionCodes).not.toContain(
      permissionCode
    );

    await prisma.userRoleAssignment.updateMany({
      where: {
        userId: ids.userId,
        roleId: ids.roleId,
        status: "ACTIVE"
      },
      data: {
        status: "INACTIVE",
        endsAt: new Date()
      }
    });

    const refreshedSession = await getConfiguredContext(email);
    expect(refreshedSession.permissionCodes).not.toContain(permissionCode);
    await expect(requirePermission(session, permissionCode)).rejects.toThrow(
      "PERMISSION_DENIED"
    );
    await prisma.userRoleAssignment.updateMany({
      where: { userId: ids.userId, roleId: ids.roleId },
      data: {
        status: "ACTIVE",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: null,
      },
    });
  });

  it("enforces restricted-project membership and exact project scope through the real service", async () => {
    const session = await getConfiguredContext(email);
    await expect(
      findAuthorizedProject(session, ids.unrestrictedProjectId),
    ).resolves.toMatchObject({ id: ids.unrestrictedProjectId });
    await expect(
      findAuthorizedProject(session, ids.restrictedProjectId),
    ).resolves.toBeNull();
    await expect(
      findAuthorizedProject(session, ids.adjacentCompanyProjectId),
    ).resolves.toBeNull();

    await prisma.userScopeAssignment.create({
      data: {
        userId: ids.userId,
        scopeType: "BRAND",
        scopeId: ids.brandId,
        accessLevel: "VIEW",
      },
    });
    await expect(findAuthorizedProject(session, ids.brandProjectId)).resolves.toMatchObject({
      id: ids.brandProjectId,
    });
    await expect(
      findAuthorizedProject(session, ids.adjacentBrandProjectId),
    ).resolves.toBeNull();

    await prisma.userScopeAssignment.create({
      data: {
        userId: ids.userId,
        scopeType: "DEPARTMENT",
        scopeId: ids.departmentId,
        accessLevel: "VIEW",
      },
    });
    await expect(
      findAuthorizedProject(session, ids.departmentProjectId),
    ).resolves.toMatchObject({ id: ids.departmentProjectId });
    await expect(
      findAuthorizedProject(session, ids.adjacentDepartmentProjectId),
    ).resolves.toBeNull();
    await expect(
      findAuthorizedProject(session, ids.restrictedProjectId),
    ).resolves.toBeNull();

    await prisma.projectMember.create({
      data: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        projectId: ids.restrictedProjectId,
        userId: ids.userId,
        projectRole: "CONTRIBUTOR",
        addedByUserId: ids.userId,
      },
    });
    await expect(
      findAuthorizedProject(session, ids.restrictedProjectId),
    ).resolves.toMatchObject({ id: ids.restrictedProjectId });

    await prisma.projectMember.updateMany({
      where: { projectId: ids.restrictedProjectId, userId: ids.userId },
      data: {
        status: "INACTIVE",
        removedAt: new Date(),
        removedByUserId: ids.userId,
      },
    });
    await expect(
      findAuthorizedProject(session, ids.restrictedProjectId),
    ).resolves.toBeNull();

    await prisma.userScopeAssignment.create({
      data: {
        userId: ids.userId,
        scopeType: "PROJECT",
        scopeId: ids.restrictedProjectId,
        accessLevel: "VIEW",
      },
    });
    await expect(
      findAuthorizedProject(session, ids.restrictedProjectId),
    ).resolves.toMatchObject({ id: ids.restrictedProjectId });

    await prisma.userScopeAssignment.deleteMany({
      where: {
        userId: ids.userId,
        scopeType: "PROJECT",
        scopeId: ids.restrictedProjectId,
      },
    });
    await prisma.userScopeAssignment.create({
      data: {
        userId: ids.userId,
        scopeType: "COMPANY",
        scopeId: ids.companyId,
        accessLevel: "MANAGE",
      },
    });
    await expect(
      findAuthorizedProject(session, ids.restrictedProjectId),
    ).resolves.toMatchObject({ id: ids.restrictedProjectId });
    await prisma.rolePermission.deleteMany({
      where: { roleId: ids.roleId, permissionId: projectManagePermissionId },
    });
    await expect(
      findAuthorizedProject(session, ids.restrictedProjectId),
    ).resolves.toBeNull();
    await prisma.rolePermission.create({
      data: { roleId: ids.roleId, permissionId: projectManagePermissionId },
    });
    await prisma.userScopeAssignment.deleteMany({
      where: {
        userId: ids.userId,
        scopeType: "COMPANY",
        scopeId: ids.companyId,
      },
    });
  });

  it("denies same-company evidence source records outside the active location scope", async () => {
    const session = await getConfiguredContext(email);
    await expect(
      assertControlledEvidenceSourceAccess(
        session,
        "WORKFORCE_EMPLOYEE",
        ids.adjacentEmployeeId,
      ),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
    await expect(
      assertControlledEvidenceSourceAccess(
        session,
        "EXPENSE_REQUEST",
        ids.projectLinkedExpenseId,
      ),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
    await expect(
      downloadControlledEvidenceAttachmentForSession(session, {
        controlledEvidenceAttachmentId: ids.controlledEvidenceLinkId,
      }),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");

    await prisma.userScopeAssignment.create({
      data: {
        userId: ids.userId,
        scopeType: "LOCATION",
        scopeId: ids.adjacentLocationId,
        accessLevel: "VIEW",
      },
    });
    await expect(
      assertControlledEvidenceSourceAccess(
        session,
        "WORKFORCE_EMPLOYEE",
        ids.adjacentEmployeeId,
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertControlledEvidenceSourceAccess(
        session,
        "EXPENSE_REQUEST",
        ids.projectLinkedExpenseId,
      ),
    ).resolves.toBeUndefined();
    await expect(
      downloadControlledEvidenceAttachmentForSession(session, {
        controlledEvidenceAttachmentId: ids.controlledEvidenceLinkId,
      }),
    ).resolves.toMatchObject({
      originalFilename: "evidence.txt",
      mimeType: "text/plain",
      sizeBytes: 19,
    });

    await prisma.attachment.update({
      where: { id: ids.attachmentId },
      data: { checksum: "sha256:invalid" },
    });
    await expect(
      downloadControlledEvidenceAttachmentForSession(session, {
        controlledEvidenceAttachmentId: ids.controlledEvidenceLinkId,
      }),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_ATTACHMENT_CHECKSUM_MISMATCH");
    await prisma.attachment.update({
      where: { id: ids.attachmentId },
      data: {
        checksum: `sha256:${createHash("sha256")
          .update(Buffer.from("authorized evidence"))
          .digest("hex")}`,
        sizeBytes: 20,
      },
    });
    await expect(
      downloadControlledEvidenceAttachmentForSession(session, {
        controlledEvidenceAttachmentId: ids.controlledEvidenceLinkId,
      }),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_ATTACHMENT_SIZE_MISMATCH");
    await prisma.attachment.update({
      where: { id: ids.attachmentId },
      data: { sizeBytes: 19 },
    });

    await prisma.rolePermission.deleteMany({
      where: { roleId: ids.roleId, permissionId: workforcePermissionId },
    });
    await expect(
      downloadControlledEvidenceAttachmentForSession(session, {
        controlledEvidenceAttachmentId: ids.controlledEvidenceLinkId,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await prisma.rolePermission.create({
      data: { roleId: ids.roleId, permissionId: workforcePermissionId },
    });
    await prisma.controlledEvidenceAttachment.update({
      where: { id: ids.controlledEvidenceLinkId },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByUserId: ids.userId,
        archiveReason: "Authorization regression fixture",
      },
    });
    await expect(
      downloadControlledEvidenceAttachmentForSession(session, {
        controlledEvidenceAttachmentId: ids.controlledEvidenceLinkId,
      }),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_ATTACHMENT_LINK_NOT_FOUND");
    await prisma.controlledEvidenceAttachment.update({
      where: { id: ids.controlledEvidenceLinkId },
      data: {
        status: "ACTIVE",
        archivedAt: null,
        archivedByUserId: null,
        archiveReason: null,
      },
    });
    await expect(
      downloadControlledEvidenceAttachmentForSession(session, {
        controlledEvidenceAttachmentId: randomUUID(),
      }),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_ATTACHMENT_LINK_NOT_FOUND");

    const downloadAudits = await prisma.auditEvent.findMany({
      where: {
        tenantId: ids.tenantId,
        actorUserId: ids.userId,
        eventType: {
          in: [
            "controlled_evidence_attachment.downloaded",
            "controlled_evidence_attachment.denied",
          ],
        },
      },
      select: { eventType: true },
    });
    expect(downloadAudits.filter((event) => event.eventType.endsWith(".denied"))).toHaveLength(6);
    expect(downloadAudits.filter((event) => event.eventType.endsWith(".downloaded"))).toHaveLength(1);
    await prisma.userScopeAssignment.deleteMany({
      where: {
        userId: ids.userId,
        scopeType: "LOCATION",
        scopeId: ids.adjacentLocationId,
      },
    });
  });

  it("executes every controlled-evidence source adapter against the migrated schema", async () => {
    const session = await getConfiguredContext(email);
    for (const sourceType of evidenceAttachmentSourceTypes) {
      await expect(
        assertControlledEvidenceSourceAccess(session, sourceType, randomUUID()),
      ).rejects.toThrow("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
    }
  });

  it("denies an out-of-scope inventory posting without mutating the ledger or balances", async () => {
    const session = await getConfiguredContext(email);
    const sourceDocumentId = randomUUID();
    const before = await Promise.all([
      prisma.inventoryMovement.count({ where: { tenantId: ids.tenantId } }),
      prisma.inventoryBalance.count({ where: { tenantId: ids.tenantId } }),
    ]);

    await expect(
      postInventoryMovement(session, {
        inventoryLocationId: ids.adjacentInventoryLocationId,
        itemId: randomUUID(),
        movementType: "ADJUSTMENT_IN",
        occurredAt: new Date("2026-07-21T00:00:00.000Z"),
        enteredQuantity: 1,
        enteredUomId: randomUUID(),
        quantityDeltaBaseUom: 1,
        sourceDocumentType: "AUTHORIZATION_REGRESSION",
        sourceDocumentId,
        sourceEventKey: `denied-${suffix}`,
      }),
    ).rejects.toThrow("INVENTORY_LOCATION_SCOPE_DENIED");

    const after = await Promise.all([
      prisma.inventoryMovement.count({ where: { tenantId: ids.tenantId } }),
      prisma.inventoryBalance.count({ where: { tenantId: ids.tenantId } }),
    ]);
    expect(after).toEqual(before);
    await expect(
      prisma.inventoryMovement.findFirst({
        where: {
          tenantId: ids.tenantId,
          sourceDocumentType: "AUTHORIZATION_REGRESSION",
          sourceDocumentId,
        },
      }),
    ).resolves.toBeNull();
  });

  it("rejects a user context after active location scope is removed", async () => {
    await prisma.userScopeAssignment.updateMany({
      where: {
        userId: ids.userId,
        scopeType: "LOCATION",
        scopeId: ids.locationId
      },
      data: { startsAt: new Date(Date.now() + 60_000), endsAt: null }
    });
    await expect(getConfiguredContext(email)).rejects.toThrow(
      "SEEDED_USER_CONTEXT_NOT_FOUND"
    );

    await prisma.userScopeAssignment.updateMany({
      where: {
        userId: ids.userId,
        scopeType: "LOCATION",
        scopeId: ids.locationId
      },
      data: {
        startsAt: new Date(Date.now() - 120_000),
        endsAt: new Date(Date.now() - 60_000)
      }
    });
    await expect(getConfiguredContext(email)).rejects.toThrow(
      "SEEDED_USER_CONTEXT_NOT_FOUND"
    );

    await prisma.userScopeAssignment.updateMany({
      where: {
        userId: ids.userId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        status: "ACTIVE"
      },
      data: {
        status: "INACTIVE",
        endsAt: new Date()
      }
    });

    await expect(getConfiguredContext(email)).rejects.toThrow(
      "SEEDED_USER_CONTEXT_NOT_FOUND"
    );
  });
});
