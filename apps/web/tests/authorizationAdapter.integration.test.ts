import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { getConfiguredContext as getConfiguredContextType } from "../src/server/services/context";
import type {
  permissions as permissionsType,
} from "../src/server/services/authorization";
import type {
  approveLeaveRequest as approveLeaveRequestType,
  createEmployee as createEmployeeType,
} from "../src/server/services/workforce";
import type { issueAuthenticationActivation as issueAuthenticationActivationType } from "../src/server/services/authenticationAdmin";
import type { submitProjectRequirementForSession as submitProjectRequirementForSessionType } from "../src/server/services/projectRequirements";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(process.env);
if (!process.env.DATABASE_URL) {
  throw new Error("AUTHORIZATION_ADAPTER_DATABASE_REQUIRED");
}

describe("database-backed named authorization adapters", () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenantId: randomUUID(),
    companyId: randomUUID(),
    locationId: randomUUID(),
    adjacentLocationId: randomUUID(),
    actorUserId: randomUUID(),
    ownerUserId: randomUUID(),
    roleId: randomUUID(),
    projectId: randomUUID(),
    projectMemberId: randomUUID(),
    projectScopeId: randomUUID(),
    projectRequirementId: randomUUID(),
    scopedEmployeeId: randomUUID(),
    adjacentEmployeeId: randomUUID(),
    scopedLeaveId: randomUUID(),
    selfLeaveId: randomUUID(),
  };
  const actorEmail = `authz-adapter-${suffix}@example.test`;

  let prisma: PrismaClient;
  let permissions: typeof permissionsType;
  let getConfiguredContext: typeof getConfiguredContextType;
  let createEmployee: typeof createEmployeeType;
  let approveLeaveRequest: typeof approveLeaveRequestType;
  let issueAuthenticationActivation: typeof issueAuthenticationActivationType;
  let submitProjectRequirementForSession: typeof submitProjectRequirementForSessionType;
  const permissionIds = new Map<string, string>();

  beforeAll(async () => {
    ({ prisma } = await import("@ogfi/database"));
    ({ permissions } = await import("../src/server/services/authorization"));
    ({ getConfiguredContext } = await import("../src/server/services/context"));
    ({ createEmployee, approveLeaveRequest } = await import(
      "../src/server/services/workforce"
    ));
    ({ issueAuthenticationActivation } = await import(
      "../src/server/services/authenticationAdmin"
    ));
    ({ submitProjectRequirementForSession } = await import(
      "../src/server/services/projectRequirements"
    ));

    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    if (identity[0]?.currentDatabase !== expectedDatabase) {
      throw new Error("AUTHORIZATION_DATABASE_IDENTITY_MISMATCH");
    }

    const requiredPermissionCodes = [
      permissions.coreAdminister,
      permissions.projectView,
      permissions.projectManage,
      permissions.workforceManage,
      permissions.workforceLeaveApprove,
    ];
    const assignedPermissionCodes = requiredPermissionCodes.filter(
      (code) => code !== permissions.coreAdminister,
    );
    const seededPermissions = await prisma.permission.findMany({
      where: { code: { in: requiredPermissionCodes } },
      select: { id: true, code: true },
    });
    if (seededPermissions.length !== requiredPermissionCodes.length) {
      throw new Error("SEEDED_AUTHORIZATION_ADAPTER_PERMISSIONS_REQUIRED");
    }
    for (const permission of seededPermissions) {
      permissionIds.set(permission.code, permission.id);
    }

    await prisma.tenant.create({
      data: {
        id: ids.tenantId,
        name: `Authorization Adapter Tenant ${suffix}`,
        loginCode: `authz-adapter-${suffix}`,
      },
    });
    await prisma.company.create({
      data: {
        id: ids.companyId,
        tenantId: ids.tenantId,
        code: `AZA-${suffix}`,
        legalName: `Authorization Adapter Company ${suffix}`,
        currencyCode: "PHP",
      },
    });
    await prisma.location.createMany({
      data: [
        {
          id: ids.locationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationType: "BRANCH",
          code: `AZA-${suffix}`,
          name: `Authorization Adapter Location ${suffix}`,
        },
        {
          id: ids.adjacentLocationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationType: "BRANCH",
          code: `AZA-ADJ-${suffix}`,
          name: `Authorization Adapter Adjacent Location ${suffix}`,
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: ids.actorUserId,
          tenantId: ids.tenantId,
          email: actorEmail,
          displayName: `Authorization Adapter Actor ${suffix}`,
        },
        {
          id: ids.ownerUserId,
          tenantId: ids.tenantId,
          email: `authz-adapter-owner-${suffix}@example.test`,
          displayName: `Authorization Adapter Owner ${suffix}`,
        },
      ],
    });
    await prisma.role.create({
      data: {
        id: ids.roleId,
        tenantId: ids.tenantId,
        code: `AUTHZ_ADAPTER_${suffix}`,
        name: `Authorization Adapter Role ${suffix}`,
      },
    });
    await prisma.rolePermission.createMany({
      data: assignedPermissionCodes.map((code) => ({
        roleId: ids.roleId,
        permissionId: permissionIds.get(code)!,
      })),
    });
    await prisma.userRoleAssignment.create({
      data: { userId: ids.actorUserId, roleId: ids.roleId },
    });
    await prisma.userScopeAssignment.create({
      data: {
        userId: ids.actorUserId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        accessLevel: "OPERATE",
      },
    });

    await prisma.project.create({
      data: {
        id: ids.projectId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        code: `AUTHZ-RESTRICTED-${suffix}`,
        name: `Authorization Restricted Project ${suffix}`,
        projectType: "IMPLEMENTATION",
        locationId: ids.locationId,
        sponsorUserId: ids.ownerUserId,
        managerUserId: ids.ownerUserId,
        isRestricted: true,
        createdByUserId: ids.ownerUserId,
        updatedByUserId: ids.ownerUserId,
      },
    });
    await prisma.projectMember.create({
      data: {
        id: ids.projectMemberId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        projectId: ids.projectId,
        userId: ids.actorUserId,
        projectRole: "CONTRIBUTOR",
        addedByUserId: ids.ownerUserId,
      },
    });
    await prisma.userScopeAssignment.create({
      data: {
        id: ids.projectScopeId,
        userId: ids.actorUserId,
        scopeType: "PROJECT",
        scopeId: ids.projectId,
        accessLevel: "OPERATE",
      },
    });
    await prisma.projectRequirement.create({
      data: {
        id: ids.projectRequirementId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        projectId: ids.projectId,
        kind: "EVIDENCE",
        code: `AUTHZ-NOTE-${suffix}`,
        label: "Authorization note",
        evidenceType: "APPROVAL_NOTE",
        ownerUserId: ids.actorUserId,
        status: "PENDING",
        createdByUserId: ids.ownerUserId,
        updatedByUserId: ids.ownerUserId,
      },
    });

    await prisma.employee.createMany({
      data: [
        {
          id: ids.scopedEmployeeId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          employeeCode: `AZA-SCOPE-${suffix}`,
          legalName: `Scoped Employee ${suffix}`,
          hireDate: new Date("2026-01-01T00:00:00.000Z"),
          homeLocationId: ids.locationId,
          createdByUserId: ids.ownerUserId,
        },
        {
          id: ids.adjacentEmployeeId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          employeeCode: `AZA-ADJ-${suffix}`,
          legalName: `Adjacent Employee ${suffix}`,
          hireDate: new Date("2026-01-01T00:00:00.000Z"),
          homeLocationId: ids.adjacentLocationId,
          createdByUserId: ids.ownerUserId,
        },
      ],
    });
    await prisma.employeeLeaveRequest.createMany({
      data: [
        {
          id: ids.scopedLeaveId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          employeeId: ids.adjacentEmployeeId,
          locationId: ids.adjacentLocationId,
          leaveType: "VACATION",
          status: "SUBMITTED",
          requestedByUserId: ids.ownerUserId,
          reason: "Authorization wrong-scope case",
          startDate: new Date("2026-08-01T00:00:00.000Z"),
          endDate: new Date("2026-08-01T00:00:00.000Z"),
          requestedMinutes: 480,
          sourceEventKey: `authz-adapter-wrong-scope-${suffix}`,
          createdByUserId: ids.ownerUserId,
        },
        {
          id: ids.selfLeaveId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          employeeId: ids.scopedEmployeeId,
          locationId: ids.locationId,
          leaveType: "VACATION",
          status: "SUBMITTED",
          requestedByUserId: ids.actorUserId,
          reason: "Authorization self-approval case",
          startDate: new Date("2026-08-02T00:00:00.000Z"),
          endDate: new Date("2026-08-02T00:00:00.000Z"),
          requestedMinutes: 480,
          sourceEventKey: `authz-adapter-self-${suffix}`,
          createdByUserId: ids.actorUserId,
        },
      ],
    });
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it("AUTHZ-ADAPTER-LIVE-PERMISSION-DB-DENIED-WRITE-NO-MUTATION", async () => {
    const staleSession = await getConfiguredContext(actorEmail);
    const permissionId = permissionIds.get(permissions.workforceManage)!;
    await prisma.rolePermission.delete({
      where: { roleId_permissionId: { roleId: ids.roleId, permissionId } },
    });
    const employeeCode = `AZA-REVOKED-${suffix}`;
    const before = await prisma.employee.count({
      where: { tenantId: ids.tenantId, employeeCode },
    });
    try {
      await expect(
        createEmployee(staleSession, {
          employeeCode,
          legalName: "Revoked Permission Employee",
          employmentType: "FULL_TIME",
          hireDate: "2026-07-21",
          homeLocationId: ids.locationId,
          reason: "Verify live permission revocation",
        }),
      ).rejects.toThrow("PERMISSION_DENIED");
      expect(
        await prisma.employee.count({ where: { tenantId: ids.tenantId, employeeCode } }),
      ).toBe(before);
    } finally {
      await prisma.rolePermission.create({ data: { roleId: ids.roleId, permissionId } });
    }
  });

  it("AUTHZ-ADAPTER-LIVE-PERMISSION-DB-REVOKED-CORE-ADMIN-DENIES-WRITE", async () => {
    const corePermissionId = permissionIds.get(permissions.coreAdminister)!;
    const workforcePermissionId = permissionIds.get(permissions.workforceManage)!;
    await prisma.rolePermission.create({
      data: { roleId: ids.roleId, permissionId: corePermissionId },
    });
    const staleSession = await getConfiguredContext(actorEmail);
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: ids.roleId,
        permissionId: { in: [corePermissionId, workforcePermissionId] },
      },
    });
    const employeeCode = `AZA-REVOKED-CORE-${suffix}`;
    const before = await prisma.employee.count({
      where: { tenantId: ids.tenantId, employeeCode },
    });
    try {
      await expect(
        createEmployee(staleSession, {
          employeeCode,
          legalName: "Revoked Core Admin Employee",
          employmentType: "FULL_TIME",
          hireDate: "2026-07-21",
          homeLocationId: ids.locationId,
          reason: "Verify live core-admin revocation",
        }),
      ).rejects.toThrow("PERMISSION_DENIED");
      expect(
        await prisma.employee.count({ where: { tenantId: ids.tenantId, employeeCode } }),
      ).toBe(before);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: workforcePermissionId },
      });
    }
  });

  it("AUTHZ-ADAPTER-COMPANY-MANAGE-DB-CORE-ADMIN-WRITE-DENIED", async () => {
    const permissionId = permissionIds.get(permissions.coreAdminister)!;
    await prisma.rolePermission.create({ data: { roleId: ids.roleId, permissionId } });
    try {
      const session = await getConfiguredContext(actorEmail);
      const before = await prisma.authActivationToken.count({
        where: { tenantId: ids.tenantId, targetUserId: ids.ownerUserId },
      });
      const formData = new FormData();
      formData.set("targetUserId", ids.ownerUserId);
      await expect(issueAuthenticationActivation(session, formData)).rejects.toThrow(
        "ADMIN_SCOPE_DENIED",
      );
      expect(
        await prisma.authActivationToken.count({
          where: { tenantId: ids.tenantId, targetUserId: ids.ownerUserId },
        }),
      ).toBe(before);
    } finally {
      await prisma.rolePermission.delete({
        where: { roleId_permissionId: { roleId: ids.roleId, permissionId } },
      });
    }
  });

  it("AUTHZ-ADAPTER-PROJECT-MUTATION-POLICY-REVOKED-ACCESS-NO-MUTATION", async () => {
    const staleSession = await getConfiguredContext(actorEmail);
    const projectPermissionId = permissionIds.get(permissions.projectManage)!;
    await prisma.projectMember.update({
      where: { id: ids.projectMemberId },
      data: { status: "INACTIVE", removedAt: new Date(), removedByUserId: ids.ownerUserId },
    });
    await prisma.userScopeAssignment.update({
      where: { id: ids.projectScopeId },
      data: { status: "INACTIVE", endsAt: new Date() },
    });
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: projectPermissionId,
        },
      },
    });
    const beforeRequirement = await prisma.projectRequirement.findUniqueOrThrow({
      where: { id: ids.projectRequirementId },
      select: { status: true, version: true },
    });
    const beforeActivity = await prisma.projectActivityEvent.count({
      where: { projectId: ids.projectId },
    });
    try {
      await expect(
        submitProjectRequirementForSession(staleSession, {
          requirementId: ids.projectRequirementId,
          expectedVersion: 1,
          evidenceNote: "Evidence remains inaccessible after authorization revocation.",
        }),
      ).rejects.toThrow("PROJECT_REQUIREMENT_NOT_FOUND");
      expect(
        await prisma.projectRequirement.findUniqueOrThrow({
          where: { id: ids.projectRequirementId },
          select: { status: true, version: true },
        }),
      ).toEqual(beforeRequirement);
      expect(
        await prisma.projectActivityEvent.count({ where: { projectId: ids.projectId } }),
      ).toBe(beforeActivity);
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
        data: { roleId: ids.roleId, permissionId: projectPermissionId },
      });
    }
  });

  it("AUTHZ-ADAPTER-APPROVAL-SCOPE-DB-WRONG-LOCATION-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const beforeRequest = await prisma.employeeLeaveRequest.findUniqueOrThrow({
      where: { id: ids.scopedLeaveId },
      select: { status: true, approvedByUserId: true, decisionAt: true },
    });
    const beforeAudit = await prisma.auditEvent.count({
      where: { entityType: "EmployeeLeaveRequest", entityId: ids.scopedLeaveId },
    });
    await expect(
      approveLeaveRequest(session, {
        leaveRequestId: ids.scopedLeaveId,
        reason: "Should not approve outside location scope",
      }),
    ).rejects.toThrow("WORKFORCE_LEAVE_REQUEST_NOT_FOUND");
    expect(
      await prisma.employeeLeaveRequest.findUniqueOrThrow({
        where: { id: ids.scopedLeaveId },
        select: { status: true, approvedByUserId: true, decisionAt: true },
      }),
    ).toEqual(beforeRequest);
    expect(
      await prisma.auditEvent.count({
        where: { entityType: "EmployeeLeaveRequest", entityId: ids.scopedLeaveId },
      }),
    ).toBe(beforeAudit);
  });

  it("AUTHZ-ADAPTER-APPROVAL-SOD-DB-SELF-APPROVAL-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const beforeRequest = await prisma.employeeLeaveRequest.findUniqueOrThrow({
      where: { id: ids.selfLeaveId },
      select: { status: true, approvedByUserId: true, decisionAt: true },
    });
    const beforeAudit = await prisma.auditEvent.count({
      where: { entityType: "EmployeeLeaveRequest", entityId: ids.selfLeaveId },
    });
    await expect(
      approveLeaveRequest(session, {
        leaveRequestId: ids.selfLeaveId,
        reason: "Should not self-approve",
      }),
    ).rejects.toThrow("WORKFORCE_LEAVE_SELF_APPROVAL_BLOCKED");
    expect(
      await prisma.employeeLeaveRequest.findUniqueOrThrow({
        where: { id: ids.selfLeaveId },
        select: { status: true, approvedByUserId: true, decisionAt: true },
      }),
    ).toEqual(beforeRequest);
    expect(
      await prisma.auditEvent.count({
        where: { entityType: "EmployeeLeaveRequest", entityId: ids.selfLeaveId },
      }),
    ).toBe(beforeAudit);
  });

  it("AUTHZ-ADAPTER-RECORD-SCOPED-QUERY-WRONG-LOCATION-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const employeeCode = `AZA-WRONG-LOCATION-${suffix}`;
    const before = await prisma.employee.count({
      where: { tenantId: ids.tenantId, employeeCode },
    });
    await expect(
      createEmployee(session, {
        employeeCode,
        legalName: "Wrong Location Employee",
        employmentType: "FULL_TIME",
        hireDate: "2026-07-21",
        homeLocationId: ids.adjacentLocationId,
        reason: "Verify record location scope",
      }),
    ).rejects.toThrow("SCOPE_DENIED");
    expect(
      await prisma.employee.count({ where: { tenantId: ids.tenantId, employeeCode } }),
    ).toBe(before);
  });

  it("AUTHZ-ADAPTER-SESSION-LOCATION-SET-REVOKED-DB-SCOPE-DENIES-WRITE", async () => {
    const staleSession = await getConfiguredContext(actorEmail);
    const locationScope = await prisma.userScopeAssignment.findFirstOrThrow({
      where: {
        userId: ids.actorUserId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        status: "ACTIVE",
      },
    });
    await prisma.userScopeAssignment.update({
      where: { id: locationScope.id },
      data: { status: "INACTIVE", endsAt: new Date() },
    });
    const employeeCode = `AZA-STALE-SCOPE-${suffix}`;
    const before = await prisma.employee.count({
      where: { tenantId: ids.tenantId, employeeCode },
    });
    let thrown: unknown;
    try {
      await createEmployee(staleSession, {
        employeeCode,
        legalName: "Stale Scope Employee",
        employmentType: "FULL_TIME",
        hireDate: "2026-07-21",
        homeLocationId: ids.locationId,
        reason: "Verify live location scope revocation",
      });
    } catch (error) {
      thrown = error;
    } finally {
      await prisma.userScopeAssignment.update({
        where: { id: locationScope.id },
        data: { status: "ACTIVE", endsAt: null },
      });
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("WORKFORCE_LOCATION_SCOPE_DENIED");
    expect(
      await prisma.employee.count({ where: { tenantId: ids.tenantId, employeeCode } }),
    ).toBe(before);
  });
});
