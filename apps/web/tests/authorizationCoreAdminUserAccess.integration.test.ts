import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "../src/server/services/context";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const mockContext = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));
vi.mock("../src/server/services/context", async () => ({
  ...(await vi.importActual<typeof import("../src/server/services/context")>(
    "../src/server/services/context",
  )),
  requireSessionContext: mockContext.requireSessionContext,
}));

const databaseEnabled = process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes";

describe.skipIf(!databaseEnabled)(
  "DEC-0200 core-admin effective permission register against disposable PostgreSQL",
  () => {
    let prisma: PrismaClient;
    let getCoreAdminUserDetail: typeof import("../src/server/services/coreAdmin").getCoreAdminUserDetail;
    let permissionCodes: typeof import("../src/server/services/authorization").permissions;

    const suffix = randomUUID().slice(0, 8);
    const ids = {
      tenant: randomUUID(),
      otherTenant: randomUUID(),
      company: randomUUID(),
      otherCompany: randomUUID(),
      location: randomUUID(),
      actor: randomUUID(),
      target: randomUUID(),
      actorRole: randomUUID(),
      roleA: randomUUID(),
      roleB: randomUUID(),
      futureRole: randomUUID(),
      expiredRole: randomUUID(),
      inactiveRole: randomUUID(),
      globalRole: randomUUID(),
      otherRole: randomUUID(),
      actorAssignment: randomUUID(),
    };
    const tenantPermissionIds: string[] = [];
    const globalPermissionIds: string[] = [];
    const otherPermissionIds: string[] = [];
    const excludedPermissionIds: string[] = [];

    beforeAll(async () => {
      const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(process.env);
      ({ prisma } = await import("@ogfi/database"));
      ({ permissions: permissionCodes } = await import("../src/server/services/authorization"));
      ({ getCoreAdminUserDetail } = await import("../src/server/services/coreAdmin"));
      await prisma.$connect();
      await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
      const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
        SELECT current_database() AS "currentDatabase"
      `;
      expect(identity[0]?.currentDatabase).toBe(expectedDatabase);

      await prisma.tenant.createMany({ data: [
        { id: ids.tenant, name: `DEC0200 Tenant ${suffix}`, loginCode: `dec0200-${suffix}` },
        { id: ids.otherTenant, name: `DEC0200 Other Tenant ${suffix}`, loginCode: `dec0200-other-${suffix}` },
      ] });
      await prisma.company.createMany({ data: [
        { id: ids.company, tenantId: ids.tenant, code: `D20-${suffix}`, legalName: `DEC0200 Company ${suffix}`, currencyCode: "PHP" },
        { id: ids.otherCompany, tenantId: ids.otherTenant, code: `D20O-${suffix}`, legalName: `DEC0200 Other Company ${suffix}`, currencyCode: "PHP" },
      ] });
      await prisma.location.create({ data: { id: ids.location, tenantId: ids.tenant, companyId: ids.company, code: `D20-HO-${suffix}`, name: `DEC0200 Head Office ${suffix}`, locationType: "HEAD_OFFICE" } });
      await prisma.user.createMany({ data: [
        { id: ids.actor, tenantId: ids.tenant, email: `dec0200-actor-${suffix}@example.test`, displayName: "DEC0200 Actor" },
        { id: ids.target, tenantId: ids.tenant, email: `dec0200-target-${suffix}@example.test`, displayName: "DEC0200 Target" },
      ] });
      await prisma.role.createMany({ data: [
        { id: ids.actorRole, tenantId: ids.tenant, code: `D20_ACTOR_${suffix}`, name: "DEC0200 Actor Role" },
        { id: ids.roleA, tenantId: ids.tenant, code: `D20_A_${suffix}`, name: "DEC0200 Active A" },
        { id: ids.roleB, tenantId: ids.tenant, code: `D20_B_${suffix}`, name: "DEC0200 Active B" },
        { id: ids.futureRole, tenantId: ids.tenant, code: `D20_FUTURE_${suffix}`, name: "DEC0200 Future Role" },
        { id: ids.expiredRole, tenantId: ids.tenant, code: `D20_EXPIRED_${suffix}`, name: "DEC0200 Expired Role" },
        { id: ids.inactiveRole, tenantId: ids.tenant, code: `D20_INACTIVE_${suffix}`, name: "DEC0200 Inactive Role", status: "INACTIVE" },
        { id: ids.globalRole, tenantId: null, code: `D20_GLOBAL_${suffix}`, name: "DEC0200 Global Role" },
        { id: ids.otherRole, tenantId: ids.otherTenant, code: `D20_OTHER_${suffix}`, name: "DEC0200 Other Role" },
      ] });

      const core = await prisma.permission.upsert({ where: { code: permissionCodes.coreAdminister }, update: {}, create: { code: permissionCodes.coreAdminister, module: "core", action: "administer" }, select: { id: true } });
      const tenantRoleAdmin = await prisma.permission.upsert({ where: { code: permissionCodes.tenantRoleAdminister }, update: {}, create: { code: permissionCodes.tenantRoleAdminister, module: "core", action: "tenant_role_administer" }, select: { id: true } });
      await prisma.rolePermission.createMany({ data: [ { roleId: ids.actorRole, permissionId: core.id }, { roleId: ids.actorRole, permissionId: tenantRoleAdmin.id } ] });

      for (let index = 0; index < 30; index += 1) {
        const permission = await prisma.permission.create({ data: { tenantId: ids.tenant, code: `dec0200.permission.${String(index)}.${suffix}`, module: "dec0200", action: `view_${index}` }, select: { id: true, code: true } });
        tenantPermissionIds.push(permission.id);
      }
      for (let index = 0; index < 2; index += 1) {
        const permission = await prisma.permission.create({ data: { tenantId: null, code: `dec0200.global.${index}.${suffix}`, module: "dec0200", action: `global_${index}` }, select: { id: true } });
        globalPermissionIds.push(permission.id);
      }
      const otherPermission = await prisma.permission.create({ data: { tenantId: ids.otherTenant, code: `dec0200.other.${suffix}`, module: "dec0200", action: "other" }, select: { id: true } });
      otherPermissionIds.push(otherPermission.id);
      for (const [roleId, label] of [[ids.futureRole, "future"], [ids.expiredRole, "expired"], [ids.inactiveRole, "inactive"]] as const) {
        const permission = await prisma.permission.create({ data: { tenantId: ids.tenant, code: `dec0200.excluded.${label}.${suffix}`, module: "dec0200", action: label }, select: { id: true } });
        excludedPermissionIds.push(permission.id);
        await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } });
      }
      await prisma.rolePermission.createMany({ data: [
        ...tenantPermissionIds.slice(0, 20).map((permissionId) => ({ roleId: ids.roleA, permissionId })),
        ...tenantPermissionIds.slice(10).map((permissionId) => ({ roleId: ids.roleB, permissionId })),
        ...tenantPermissionIds.slice(0, 3).map((permissionId) => ({ roleId: ids.inactiveRole, permissionId })),
        ...globalPermissionIds.map((permissionId) => ({ roleId: ids.globalRole, permissionId })),
        { roleId: ids.otherRole, permissionId: otherPermission.id },
      ] });
      await prisma.userRoleAssignment.createMany({ data: [
        { id: ids.actorAssignment, userId: ids.actor, roleId: ids.actorRole },
        { userId: ids.target, roleId: ids.roleA },
        { userId: ids.target, roleId: ids.roleB },
        { userId: ids.target, roleId: ids.globalRole },
        { userId: ids.target, roleId: ids.futureRole, startsAt: new Date(Date.now() + 86_400_000) },
        { userId: ids.target, roleId: ids.expiredRole, startsAt: new Date(Date.now() - 172_800_000), endsAt: new Date(Date.now() - 86_400_000) },
        { userId: ids.target, roleId: ids.inactiveRole, status: "INACTIVE" },
        { userId: ids.target, roleId: ids.otherRole },
      ] });
      await prisma.userScopeAssignment.create({ data: { userId: ids.actor, scopeType: "COMPANY", scopeId: ids.company, accessLevel: "MANAGE" } });
      await prisma.userScopeAssignment.create({ data: { userId: ids.target, scopeType: "COMPANY", scopeId: ids.company, accessLevel: "VIEW" } });
      const sessionExpiry = new Date(Date.now() + 3_600_000);
      mockContext.requireSessionContext.mockResolvedValue({
        user: { id: ids.actor, email: `dec0200-actor-${suffix}@example.test`, displayName: "DEC0200 Actor", role: "DEC0200 Actor Role" },
        context: { tenantId: ids.tenant, companyId: ids.company, companyName: `DEC0200 Company ${suffix}`, brandId: "", brandName: "Company-wide", locationId: ids.location, locationName: `DEC0200 Head Office ${suffix}`, locationType: "HEAD_OFFICE" },
        authorizedLocations: [], permissionCodes: [permissionCodes.coreAdminister, permissionCodes.tenantRoleAdminister],
        authentication: { sessionId: randomUUID(), assuranceLevel: "MFA", mfaAuthenticatedAt: new Date(), absoluteExpiresAt: sessionExpiry },
      } as SessionContext);
    });

    afterAll(async () => {
      if (!prisma) return;
      // The disposable runner tears down this database. Retaining fixture rows
      // avoids deleting immutable AuditEvent-linked history during cleanup.
      await prisma.$disconnect();
    });

    it("returns a deterministic, de-duplicated effective register with filters and clamped pages", async () => {
      const pageOne = await getCoreAdminUserDetail((await mockContext.requireSessionContext()) as SessionContext, ids.target, { userAccessSection: "roles", permissionPage: 1, permissionPageSize: 10 });
      expect(pageOne?.permissionTotal).toBe(32);
      expect(pageOne?.permissionsPage).toMatchObject({ page: 1, pageSize: 10, totalItems: 32, totalPages: 4, query: "" });
      expect(pageOne?.permissions).toHaveLength(10);
      expect(new Set(pageOne?.permissions.map((permission) => permission.code)).size).toBe(10);
      expect(pageOne?.permissions.some((permission) => permission.code.includes("excluded.") || permission.code.includes("other"))).toBe(false);

      const traversed: string[] = [];
      for (const page of [1, 2, 3, 4]) {
        const result = await getCoreAdminUserDetail((await mockContext.requireSessionContext()) as SessionContext, ids.target, { userAccessSection: "roles", permissionPage: page, permissionPageSize: 10 });
        traversed.push(...(result?.permissions.map((permission) => permission.code) ?? []));
      }
      expect(traversed).toHaveLength(32);
      expect(new Set(traversed).size).toBe(32);
      expect(traversed).toEqual([...traversed].sort());
      expect(traversed.some((code) => code.includes("excluded.") || code.includes("other"))).toBe(false);

      const stale = await getCoreAdminUserDetail((await mockContext.requireSessionContext()) as SessionContext, ids.target, { userAccessSection: "roles", permissionPage: 999, permissionPageSize: 10 });
      expect(stale?.permissionsPage.page).toBe(4);
      const filtered = await getCoreAdminUserDetail((await mockContext.requireSessionContext()) as SessionContext, ids.target, { userAccessSection: "roles", permissionPage: 1, permissionPageSize: 10, permissionQuery: "permission.2" });
      expect(filtered?.permissionsPage.totalItems).toBe(11);
      expect(filtered?.permissionTotal).toBe(32);
      expect(filtered?.permissions.every((permission) => permission.code.includes("permission.2"))).toBe(true);
      const noMatch = await getCoreAdminUserDetail((await mockContext.requireSessionContext()) as SessionContext, ids.target, { userAccessSection: "roles", permissionQuery: "does-not-exist" });
      expect(noMatch?.permissionsPage).toMatchObject({ page: 1, totalItems: 0, totalPages: 1 });
      const cleared = await getCoreAdminUserDetail((await mockContext.requireSessionContext()) as SessionContext, ids.target, { userAccessSection: "roles", permissionQuery: "" });
      expect(cleared?.permissionsPage.totalItems).toBe(32);
    });
  },
);
