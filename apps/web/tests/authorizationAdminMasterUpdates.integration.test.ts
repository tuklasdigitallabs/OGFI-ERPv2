import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";
import {
  authenticationSessionTokenHash,
  clearAuthenticatedRequest,
  configureAuthenticatedRequest,
} from "./authenticatedRequestHarness";

const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(process.env);
if (!process.env.DATABASE_URL) {
  throw new Error("AUTHORIZATION_ADMIN_MASTER_UPDATES_DATABASE_REQUIRED");
}

function formData(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("Core Administration master-update authorization boundaries against PostgreSQL", () => {
  const originalAuthSecret = process.env.AUTH_SECRET;
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenantId: randomUUID(),
    foreignTenantId: randomUUID(),
    companyId: randomUUID(),
    adjacentCompanyId: randomUUID(),
    foreignCompanyId: randomUUID(),
    brandId: randomUUID(),
    adjacentBrandId: randomUUID(),
    foreignBrandId: randomUUID(),
    departmentId: randomUUID(),
    adjacentDepartmentId: randomUUID(),
    foreignDepartmentId: randomUUID(),
    locationId: randomUUID(),
    adjacentLocationId: randomUUID(),
    foreignLocationId: randomUUID(),
    reasonCodeId: randomUUID(),
    adjacentReasonCodeId: randomUUID(),
    foreignReasonCodeId: randomUUID(),
    actorUserId: randomUUID(),
    authIdentityId: randomUUID(),
    authSessionId: randomUUID(),
    roleId: randomUUID(),
    roleAssignmentId: randomUUID(),
    companyScopeId: randomUUID(),
    locationScopeId: randomUUID(),
  };
  const actorEmail = `authz-admin-master-update-${suffix}@example.test`;
  const sessionToken = `authz-admin-master-update-token-${suffix}`;
  const reason = "Authorized correction verified by the master-data owner.";

  let prisma: PrismaClient;
  let coreAdminPermissionId: string;
  let tenantRoleAdminPermissionId: string;
  let updateCoreAdminCompany: typeof import("../src/server/services/coreAdmin").updateCoreAdminCompany;
  let updateCoreAdminBrand: typeof import("../src/server/services/coreAdmin").updateCoreAdminBrand;
  let updateCoreAdminDepartment: typeof import("../src/server/services/coreAdmin").updateCoreAdminDepartment;
  let updateCoreAdminLocation: typeof import("../src/server/services/coreAdmin").updateCoreAdminLocation;
  let updateOperationalReasonCode: typeof import("../src/server/services/operationalReasonCodes").updateOperationalReasonCode;

  const companyUpdate = (companyId: string, nextName: string, includeReason = true) =>
    formData({
      companyId,
      legalName: nextName,
      tradingName: `${nextName} Trading`,
      taxIdentifier: `TIN-${suffix}`,
      currencyCode: "PHP",
      timezone: "Asia/Manila",
      ...(includeReason ? { reason } : {}),
    });
  const brandUpdate = (brandId: string, nextName: string, includeReason = true) =>
    formData({ brandId, name: nextName, ...(includeReason ? { reason } : {}) });
  const departmentUpdate = (
    departmentId: string,
    nextName: string,
    includeReason = true,
  ) => formData({ departmentId, name: nextName, ...(includeReason ? { reason } : {}) });
  const locationUpdate = (
    locationId: string,
    nextName: string,
    includeReason = true,
  ) =>
    formData({
      locationId,
      name: nextName,
      address: `${nextName} address`,
      timezone: "Asia/Manila",
      ...(includeReason ? { reason } : {}),
    });
  const reasonCodeUpdate = (
    id: string,
    nextLabel: string,
    includeReason = true,
  ) =>
    formData({
      id,
      label: nextLabel,
      requiresEvidence: "true",
      sortOrder: "125",
      notes: "Controlled master-data correction",
      ...(includeReason ? { reason } : {}),
    });

  async function masterSnapshot() {
    const [company, brands, departments, locations, reasonCodes, auditCount] =
      await Promise.all([
        prisma.company.findMany({
          where: {
            id: { in: [ids.companyId, ids.adjacentCompanyId, ids.foreignCompanyId] },
          },
          orderBy: { id: "asc" },
        }),
        prisma.brand.findMany({
          where: { id: { in: [ids.brandId, ids.adjacentBrandId, ids.foreignBrandId] } },
          orderBy: { id: "asc" },
        }),
        prisma.department.findMany({
          where: {
            id: {
              in: [
                ids.departmentId,
                ids.adjacentDepartmentId,
                ids.foreignDepartmentId,
              ],
            },
          },
          orderBy: { id: "asc" },
        }),
        prisma.location.findMany({
          where: {
            id: { in: [ids.locationId, ids.adjacentLocationId, ids.foreignLocationId] },
          },
          orderBy: { id: "asc" },
        }),
        prisma.operationalReasonCode.findMany({
          where: {
            id: {
              in: [ids.reasonCodeId, ids.adjacentReasonCodeId, ids.foreignReasonCodeId],
            },
          },
          orderBy: { id: "asc" },
        }),
        prisma.auditEvent.count({
          where: {
            entityId: {
              in: [
                ids.companyId,
                ids.brandId,
                ids.departmentId,
                ids.locationId,
                ids.reasonCodeId,
              ],
            },
          },
        }),
      ]);
    return { company, brands, departments, locations, reasonCodes, auditCount };
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = "authorization-admin-master-update-test-secret";
    ({ prisma } = await import("@ogfi/database"));
    ({
      updateCoreAdminBrand,
      updateCoreAdminCompany,
      updateCoreAdminDepartment,
      updateCoreAdminLocation,
    } = await import("../src/server/services/coreAdmin"));
    ({ updateOperationalReasonCode } = await import(
      "../src/server/services/operationalReasonCodes"
    ));

    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    if (identity[0]?.currentDatabase !== expectedDatabase) {
      throw new Error("AUTHORIZATION_DATABASE_IDENTITY_MISMATCH");
    }

    const permissionRows = await prisma.permission.findMany({
      where: { code: { in: ["core.administer", "core.tenant_role_administer"] } },
      select: { id: true, code: true },
    });
    coreAdminPermissionId = permissionRows.find(
      (permission) => permission.code === "core.administer",
    )?.id ?? "";
    tenantRoleAdminPermissionId = permissionRows.find(
      (permission) => permission.code === "core.tenant_role_administer",
    )?.id ?? "";
    if (!coreAdminPermissionId || !tenantRoleAdminPermissionId) {
      throw new Error("SEEDED_CORE_ADMIN_PERMISSIONS_REQUIRED");
    }

    await prisma.tenant.createMany({
      data: [
        {
          id: ids.tenantId,
          name: `Admin master updates tenant ${suffix}`,
          loginCode: `amu-${suffix}`,
        },
        {
          id: ids.foreignTenantId,
          name: `Foreign admin master updates tenant ${suffix}`,
          loginCode: `amf-${suffix}`,
        },
      ],
    });
    await prisma.company.createMany({
      data: [
        {
          id: ids.companyId,
          tenantId: ids.tenantId,
          code: `AMU-${suffix}`,
          legalName: `Admin Master Company ${suffix}`,
          currencyCode: "PHP",
        },
        {
          id: ids.adjacentCompanyId,
          tenantId: ids.tenantId,
          code: `AMA-${suffix}`,
          legalName: `Adjacent Admin Master Company ${suffix}`,
          currencyCode: "PHP",
        },
        {
          id: ids.foreignCompanyId,
          tenantId: ids.foreignTenantId,
          code: `AMF-${suffix}`,
          legalName: `Foreign Admin Master Company ${suffix}`,
          currencyCode: "PHP",
        },
      ],
    });
    await prisma.brand.createMany({
      data: [
        { id: ids.brandId, tenantId: ids.tenantId, companyId: ids.companyId, code: `BR-${suffix}`, name: "Owned Brand" },
        { id: ids.adjacentBrandId, tenantId: ids.tenantId, companyId: ids.adjacentCompanyId, code: `BA-${suffix}`, name: "Adjacent Brand" },
        { id: ids.foreignBrandId, tenantId: ids.foreignTenantId, companyId: ids.foreignCompanyId, code: `BF-${suffix}`, name: "Foreign Brand" },
      ],
    });
    await prisma.department.createMany({
      data: [
        { id: ids.departmentId, tenantId: ids.tenantId, companyId: ids.companyId, code: `DP-${suffix}`, name: "Owned Department" },
        { id: ids.adjacentDepartmentId, tenantId: ids.tenantId, companyId: ids.adjacentCompanyId, code: `DA-${suffix}`, name: "Adjacent Department" },
        { id: ids.foreignDepartmentId, tenantId: ids.foreignTenantId, companyId: ids.foreignCompanyId, code: `DF-${suffix}`, name: "Foreign Department" },
      ],
    });
    await prisma.location.createMany({
      data: [
        { id: ids.locationId, tenantId: ids.tenantId, companyId: ids.companyId, brandId: ids.brandId, locationType: "BRANCH", code: `LC-${suffix}`, name: "Owned Location" },
        { id: ids.adjacentLocationId, tenantId: ids.tenantId, companyId: ids.adjacentCompanyId, brandId: ids.adjacentBrandId, locationType: "BRANCH", code: `LA-${suffix}`, name: "Adjacent Location" },
        { id: ids.foreignLocationId, tenantId: ids.foreignTenantId, companyId: ids.foreignCompanyId, brandId: ids.foreignBrandId, locationType: "BRANCH", code: `LF-${suffix}`, name: "Foreign Location" },
      ],
    });
    await prisma.operationalReasonCode.createMany({
      data: [
        { id: ids.reasonCodeId, tenantId: ids.tenantId, companyId: ids.companyId, workflow: "MASTER_DATA_CHANGE", code: `OWNED_${suffix.toUpperCase()}`, label: "Owned reason" },
        { id: ids.adjacentReasonCodeId, tenantId: ids.tenantId, companyId: ids.adjacentCompanyId, workflow: "MASTER_DATA_CHANGE", code: `ADJACENT_${suffix.toUpperCase()}`, label: "Adjacent reason" },
        { id: ids.foreignReasonCodeId, tenantId: ids.foreignTenantId, companyId: ids.foreignCompanyId, workflow: "MASTER_DATA_CHANGE", code: `FOREIGN_${suffix.toUpperCase()}`, label: "Foreign reason" },
      ],
    });
    await prisma.user.create({
      data: {
        id: ids.actorUserId,
        tenantId: ids.tenantId,
        email: actorEmail,
        displayName: `Admin Master Actor ${suffix}`,
      },
    });
    await prisma.role.create({
      data: {
        id: ids.roleId,
        tenantId: ids.tenantId,
        code: `ADMIN_MASTER_${suffix}`,
        name: `Admin Master Role ${suffix}`,
      },
    });
    await prisma.rolePermission.createMany({
      data: [
        { roleId: ids.roleId, permissionId: coreAdminPermissionId },
        { roleId: ids.roleId, permissionId: tenantRoleAdminPermissionId },
      ],
    });
    await prisma.userRoleAssignment.create({
      data: {
        id: ids.roleAssignmentId,
        userId: ids.actorUserId,
        roleId: ids.roleId,
      },
    });
    await prisma.userScopeAssignment.createMany({
      data: [
        {
          id: ids.companyScopeId,
          userId: ids.actorUserId,
          scopeType: "COMPANY",
          scopeId: ids.companyId,
          accessLevel: "MANAGE",
        },
        {
          id: ids.locationScopeId,
          userId: ids.actorUserId,
          scopeType: "LOCATION",
          scopeId: ids.locationId,
          accessLevel: "MANAGE",
        },
      ],
    });
    await prisma.authIdentity.create({
      data: {
        id: ids.authIdentityId,
        tenantId: ids.tenantId,
        userId: ids.actorUserId,
        provider: "LOCAL",
        normalizedIdentifier: actorEmail,
      },
    });
    await prisma.authSession.create({
      data: {
        id: ids.authSessionId,
        tenantId: ids.tenantId,
        userId: ids.actorUserId,
        authIdentityId: ids.authIdentityId,
        tokenHash: authenticationSessionTokenHash(sessionToken),
        status: "ACTIVE",
        assuranceLevel: "MFA",
        mfaAuthenticatedAt: new Date(),
        privilegeEpochAtIssue: 0,
        idleExpiresAt: new Date(Date.now() + 60 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 4 * 60 * 60_000),
      },
    });
  });

  afterAll(async () => {
    clearAuthenticatedRequest();
    if (prisma) await prisma.$disconnect();
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
  });

  it("AUTHZ-ADMIN-MASTER-UPDATES-LIVE-PERMISSION-DENIED-NO-MUTATION", async () => {
    configureAuthenticatedRequest({
      sessionToken,
      selectedLocationId: ids.locationId,
    });
    const before = await masterSnapshot();
    const calls = [
      () => updateCoreAdminCompany(companyUpdate(ids.companyId, "Denied Company")),
      () => updateCoreAdminBrand(brandUpdate(ids.brandId, "Denied Brand")),
      () => updateCoreAdminDepartment(departmentUpdate(ids.departmentId, "Denied Department")),
      () => updateCoreAdminLocation(locationUpdate(ids.locationId, "Denied Location")),
      () => updateOperationalReasonCode(reasonCodeUpdate(ids.reasonCodeId, "Denied reason")),
    ];

    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: coreAdminPermissionId,
        },
      },
    });
    try {
      for (const call of calls) await expect(call()).rejects.toThrow("PERMISSION_DENIED");
      expect(await masterSnapshot()).toEqual(before);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: coreAdminPermissionId },
      });
    }

    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: tenantRoleAdminPermissionId,
        },
      },
    });
    try {
      for (const call of calls.slice(0, 4)) {
        await expect(call()).rejects.toThrow("PERMISSION_DENIED");
      }
      expect(await masterSnapshot()).toEqual(before);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: tenantRoleAdminPermissionId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-ADMIN-MASTER-UPDATES-EXACT-TENANT-COMPANY-DENIED-NO-MUTATION", async () => {
    configureAuthenticatedRequest({
      sessionToken,
      selectedLocationId: ids.locationId,
    });
    const before = await masterSnapshot();

    await expect(
      updateCoreAdminCompany(companyUpdate(ids.adjacentCompanyId, "Adjacent denied")),
    ).rejects.toThrow("ADMIN_SCOPE_DENIED");
    await expect(
      updateCoreAdminBrand(brandUpdate(ids.adjacentBrandId, "Adjacent denied")),
    ).rejects.toThrow("ADMIN_SCOPE_DENIED");
    await expect(
      updateCoreAdminDepartment(
        departmentUpdate(ids.adjacentDepartmentId, "Adjacent denied"),
      ),
    ).rejects.toThrow("ADMIN_SCOPE_DENIED");
    await expect(
      updateCoreAdminLocation(locationUpdate(ids.adjacentLocationId, "Adjacent denied")),
    ).rejects.toThrow("ADMIN_SCOPE_DENIED");
    await expect(
      updateOperationalReasonCode(
        reasonCodeUpdate(ids.adjacentReasonCodeId, "Adjacent denied"),
      ),
    ).rejects.toThrow("OPERATIONAL_REASON_CODE_NOT_FOUND");

    await expect(
      updateCoreAdminCompany(companyUpdate(ids.foreignCompanyId, "Foreign denied")),
    ).rejects.toThrow("ADMIN_SCOPE_DENIED");
    await expect(
      updateCoreAdminBrand(brandUpdate(ids.foreignBrandId, "Foreign denied")),
    ).rejects.toThrow("BRAND_NOT_FOUND");
    await expect(
      updateCoreAdminDepartment(
        departmentUpdate(ids.foreignDepartmentId, "Foreign denied"),
      ),
    ).rejects.toThrow("DEPARTMENT_NOT_FOUND");
    await expect(
      updateCoreAdminLocation(locationUpdate(ids.foreignLocationId, "Foreign denied")),
    ).rejects.toThrow("LOCATION_NOT_FOUND");
    await expect(
      updateOperationalReasonCode(
        reasonCodeUpdate(ids.foreignReasonCodeId, "Foreign denied"),
      ),
    ).rejects.toThrow("OPERATIONAL_REASON_CODE_NOT_FOUND");

    expect(await masterSnapshot()).toEqual(before);
    clearAuthenticatedRequest();
  });

  it("AUTHZ-ADMIN-MASTER-UPDATES-REQUIRE-REASON-AND-AUDIT-BEFORE-AFTER", async () => {
    configureAuthenticatedRequest({
      sessionToken,
      selectedLocationId: ids.locationId,
    });
    const before = await masterSnapshot();
    const missingReasonCalls = [
      () => updateCoreAdminCompany(companyUpdate(ids.companyId, "Missing reason", false)),
      () => updateCoreAdminBrand(brandUpdate(ids.brandId, "Missing reason", false)),
      () => updateCoreAdminDepartment(departmentUpdate(ids.departmentId, "Missing reason", false)),
      () => updateCoreAdminLocation(locationUpdate(ids.locationId, "Missing reason", false)),
      () => updateOperationalReasonCode(reasonCodeUpdate(ids.reasonCodeId, "Missing reason", false)),
    ];
    for (const call of missingReasonCalls) await expect(call()).rejects.toThrow();
    expect(await masterSnapshot()).toEqual(before);

    await updateCoreAdminCompany(companyUpdate(ids.companyId, "Updated Company"));
    await updateCoreAdminBrand(brandUpdate(ids.brandId, "Updated Brand"));
    await updateCoreAdminDepartment(
      departmentUpdate(ids.departmentId, "Updated Department"),
    );
    await updateCoreAdminLocation(locationUpdate(ids.locationId, "Updated Location"));
    await updateOperationalReasonCode(
      reasonCodeUpdate(ids.reasonCodeId, "Updated reason"),
    );

    const [company, brand, department, location, reasonCode, audits] =
      await Promise.all([
        prisma.company.findUniqueOrThrow({ where: { id: ids.companyId } }),
        prisma.brand.findUniqueOrThrow({ where: { id: ids.brandId } }),
        prisma.department.findUniqueOrThrow({ where: { id: ids.departmentId } }),
        prisma.location.findUniqueOrThrow({ where: { id: ids.locationId } }),
        prisma.operationalReasonCode.findUniqueOrThrow({
          where: { id: ids.reasonCodeId },
        }),
        prisma.auditEvent.findMany({
          where: {
            actorUserId: ids.actorUserId,
            entityId: {
              in: [
                ids.companyId,
                ids.brandId,
                ids.departmentId,
                ids.locationId,
                ids.reasonCodeId,
              ],
            },
            eventType: {
              in: [
                "core_admin.company.updated",
                "core_admin.brand.updated",
                "core_admin.department.updated",
                "core_admin.location.updated",
                "operational_reason_code.updated",
              ],
            },
          },
        }),
      ]);

    expect(company.legalName).toBe("Updated Company");
    expect(brand.name).toBe("Updated Brand");
    expect(department.name).toBe("Updated Department");
    expect(location.name).toBe("Updated Location");
    expect(reasonCode.label).toBe("Updated reason");
    expect(audits).toHaveLength(5);
    for (const audit of audits) {
      expect(audit.beforeData).toBeTruthy();
      expect(audit.afterData).toBeTruthy();
      expect(audit.metadata).toMatchObject({ reason });
    }
    clearAuthenticatedRequest();
  });
});
