import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { getConfiguredContext as getConfiguredContextType } from "../src/server/services/context";
import type { requirePermission as requirePermissionType } from "../src/server/services/authorization";

function isSupportedIntegrationDatabaseUrl(databaseUrl: string) {
  return databaseUrl.startsWith("prisma://") || databaseUrl.startsWith("prisma+postgres://");
}

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return isSupportedIntegrationDatabaseUrl(process.env.DATABASE_URL);
  }

  const envPath = fileURLToPath(
    new URL("../../../packages/database/.env", import.meta.url)
  );
  if (!existsSync(envPath)) {
    return false;
  }

  const env = readFileSync(envPath, "utf8");
  const databaseUrl = env
    .split(/\r?\n/)
    .find((line) => line.startsWith("DATABASE_URL="))
    ?.slice("DATABASE_URL=".length)
    .trim();

  if (!databaseUrl) {
    return false;
  }

  if (!isSupportedIntegrationDatabaseUrl(databaseUrl)) {
    return false;
  }

  process.env.DATABASE_URL = databaseUrl;
  return true;
}

const hasDatabaseUrl = loadDatabaseUrl();
const describeDb = hasDatabaseUrl ? describe : describe.skip;

describeDb("database-backed access control", () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenantId: randomUUID(),
    companyId: randomUUID(),
    locationId: randomUUID(),
    userId: randomUUID(),
    roleId: randomUUID(),
    permissionId: randomUUID(),
    otherTenantId: randomUUID(),
    otherTenantRoleId: randomUUID(),
    otherTenantPermissionId: randomUUID()
  };
  const email = `access-control-${suffix}@example.test`;
  const permissionCode = `test.access_control.${suffix}`;
  const otherTenantPermissionCode = `test.cross_tenant.${suffix}`;

  let prisma: PrismaClient;
  let getConfiguredContext: typeof getConfiguredContextType;
  let requirePermission: typeof requirePermissionType;

  beforeAll(async () => {
    ({ prisma } = await import("@ogfi/database"));
    ({ getConfiguredContext } = await import("../src/server/services/context"));
    ({ requirePermission } = await import("../src/server/services/authorization"));

    await prisma.$connect();
    await prisma.tenant.create({
      data: {
        id: ids.tenantId,
        name: `Access Control Test ${suffix}`
      }
    });
    await prisma.tenant.create({
      data: {
        id: ids.otherTenantId,
        name: `Other Access Control Test ${suffix}`
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
    await prisma.user.create({
      data: {
        id: ids.userId,
        tenantId: ids.tenantId,
        email,
        displayName: `Access Control User ${suffix}`
      }
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
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }

    await prisma.userScopeAssignment.deleteMany({ where: { userId: ids.userId } });
    await prisma.userRoleAssignment.deleteMany({ where: { userId: ids.userId } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: [ids.roleId, ids.otherTenantRoleId] } }
    });
    await prisma.permission.deleteMany({
      where: { id: { in: [ids.permissionId, ids.otherTenantPermissionId] } }
    });
    await prisma.role.deleteMany({
      where: { id: { in: [ids.roleId, ids.otherTenantRoleId] } }
    });
    await prisma.user.deleteMany({ where: { id: ids.userId } });
    await prisma.location.deleteMany({ where: { id: ids.locationId } });
    await prisma.company.deleteMany({ where: { id: ids.companyId } });
    await prisma.tenant.deleteMany({
      where: { id: { in: [ids.tenantId, ids.otherTenantId] } }
    });
    await prisma.$disconnect();
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
  });

  it("rejects a user context after active location scope is removed", async () => {
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
