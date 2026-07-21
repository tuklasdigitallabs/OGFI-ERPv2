import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "../src/server/services/context";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const mockContext = vi.hoisted(() => ({
  requireSessionContext: vi.fn(),
}));

vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<
    typeof import("../src/server/services/context")
  >("../src/server/services/context");
  return {
    ...actual,
    requireSessionContext: mockContext.requireSessionContext,
  };
});

const databaseEnabled =
  process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes";

describe.skipIf(!databaseEnabled)(
  "core-admin role-permission authority race against disposable PostgreSQL",
  () => {
    let prisma: PrismaClient;
    let updateRolePermissions: typeof import("../src/server/services/coreAdmin").updateRolePermissions;
    let permissionCodes: typeof import("../src/server/services/authorization").permissions;

    const suffix = randomUUID().slice(0, 8);
    const ids = {
      tenant: randomUUID(),
      company: randomUUID(),
      actor: randomUUID(),
      assignee: randomUUID(),
      actorRole: randomUUID(),
      targetRole: randomUUID(),
      actorAssignment: randomUUID(),
      targetAssignment: randomUUID(),
      companyScope: randomUUID(),
      actorSession: randomUUID(),
      targetSession: randomUUID(),
      mfaEnrollment: randomUUID(),
    };

    beforeAll(async () => {
      const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(
        process.env,
      );
      ({ prisma } = await import("@ogfi/database"));
      ({ permissions: permissionCodes } = await import(
        "../src/server/services/authorization"
      ));
      ({ updateRolePermissions } = await import(
        "../src/server/services/coreAdmin"
      ));
      await prisma.$connect();
      await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
      const identity = await prisma.$queryRaw<
        Array<{ currentDatabase: string }>
      >`SELECT current_database() AS "currentDatabase"`;
      if (identity[0]?.currentDatabase !== expectedDatabase) {
        throw new Error("CORE_ADMIN_RACE_DATABASE_IDENTITY_MISMATCH");
      }

      await prisma.tenant.create({
        data: {
          id: ids.tenant,
          name: `Core Admin Race Tenant ${suffix}`,
          loginCode: `core-admin-race-${suffix}`,
        },
      });
      await prisma.company.create({
        data: {
          id: ids.company,
          tenantId: ids.tenant,
          code: `CAR-${suffix}`,
          legalName: `Core Admin Race Company ${suffix}`,
          currencyCode: "PHP",
        },
      });
      await prisma.user.createMany({
        data: [
          {
            id: ids.actor,
            tenantId: ids.tenant,
            email: `core-admin-race-actor-${suffix}@example.test`,
            displayName: "Core Admin Race Actor",
          },
          {
            id: ids.assignee,
            tenantId: ids.tenant,
            email: `core-admin-race-assignee-${suffix}@example.test`,
            displayName: "Core Admin Race Assignee",
          },
        ],
      });
      await prisma.role.createMany({
        data: [
          {
            id: ids.actorRole,
            tenantId: ids.tenant,
            code: `CORE_ADMIN_RACE_ACTOR_${suffix}`,
            name: "Core Admin Race Actor Role",
          },
          {
            id: ids.targetRole,
            tenantId: ids.tenant,
            code: `CORE_ADMIN_RACE_TARGET_${suffix}`,
            name: "Core Admin Race Target Role",
          },
        ],
      });

      const corePermission = await prisma.permission.upsert({
        where: { code: permissionCodes.coreAdminister },
        update: {},
        create: {
          code: permissionCodes.coreAdminister,
          module: "core",
          action: "administer",
        },
        select: { id: true },
      });
      const tenantRolePermission = await prisma.permission.upsert({
        where: { code: permissionCodes.tenantRoleAdminister },
        update: {},
        create: {
          code: permissionCodes.tenantRoleAdminister,
          module: "core",
          action: "tenant_role_administer",
        },
        select: { id: true },
      });
      const sensitivePermission = await prisma.permission.upsert({
        where: { code: permissionCodes.purchaseOrderApprove },
        update: {},
        create: {
          code: permissionCodes.purchaseOrderApprove,
          module: "purchasing",
          action: "approve",
        },
        select: { id: true },
      });
      const retainedPermission = await prisma.permission.create({
        data: {
          tenantId: ids.tenant,
          code: `core_admin_race_${suffix}.view`,
          module: "core_admin_race",
          action: "view",
        },
        select: { id: true },
      });
      await prisma.rolePermission.createMany({
        data: [
          { roleId: ids.actorRole, permissionId: corePermission.id },
          { roleId: ids.actorRole, permissionId: tenantRolePermission.id },
          { roleId: ids.targetRole, permissionId: sensitivePermission.id },
          { roleId: ids.targetRole, permissionId: retainedPermission.id },
        ],
      });
      await prisma.userRoleAssignment.createMany({
        data: [
          {
            id: ids.actorAssignment,
            userId: ids.actor,
            roleId: ids.actorRole,
          },
          {
            id: ids.targetAssignment,
            userId: ids.assignee,
            roleId: ids.targetRole,
          },
        ],
      });
      await prisma.userScopeAssignment.create({
        data: {
          id: ids.companyScope,
          userId: ids.actor,
          scopeType: "COMPANY",
          scopeId: ids.company,
          accessLevel: "MANAGE",
        },
      });
      const sessionExpiry = new Date(Date.now() + 60 * 60_000);
      await prisma.authSession.createMany({
        data: [
          {
            id: ids.actorSession,
            tenantId: ids.tenant,
            userId: ids.actor,
            tokenHash: `core-admin-race-actor-${suffix}`,
            status: "ACTIVE",
            assuranceLevel: "MFA",
            mfaAuthenticatedAt: new Date(),
            privilegeEpochAtIssue: 0,
            idleExpiresAt: sessionExpiry,
            absoluteExpiresAt: sessionExpiry,
          },
          {
            id: ids.targetSession,
            tenantId: ids.tenant,
            userId: ids.assignee,
            tokenHash: `core-admin-race-target-${suffix}`,
            status: "ACTIVE",
            assuranceLevel: "PASSWORD",
            privilegeEpochAtIssue: 0,
            idleExpiresAt: sessionExpiry,
            absoluteExpiresAt: sessionExpiry,
          },
        ],
      });
      await prisma.companyPolicySetting.create({
        data: {
          tenantId: ids.tenant,
          companyId: ids.company,
          key: "security.privileged_mfa.enforcement_mode",
          category: "security",
          label: "Privileged MFA enforcement",
          description: "Core-admin concurrency fixture",
          value: "enforce_admin_security",
          defaultValue: "warn_and_audit",
          valueType: "SELECT",
          isDefault: false,
          updatedByUserId: ids.assignee,
        },
      });
      await prisma.privilegedMfaEnrollment.create({
        data: {
          id: ids.mfaEnrollment,
          tenantId: ids.tenant,
          companyId: ids.company,
          targetUserId: ids.actor,
          providerName: `CORE-ADMIN-RACE-${suffix}`,
          status: "VERIFIED",
          evidenceReference: `CORE-ADMIN-RACE-EVIDENCE-${suffix}`,
          attestationNote: "Disposable concurrency test evidence",
          attestedByUserId: ids.assignee,
          verifiedByUserId: ids.assignee,
          verificationNote: "Independent disposable test verification",
          verifiedAt: new Date(),
        },
      });

      const session: SessionContext = {
        user: {
          id: ids.actor,
          email: `core-admin-race-actor-${suffix}@example.test`,
          displayName: "Core Admin Race Actor",
          role: "Core Admin Race Actor Role",
        },
        context: {
          tenantId: ids.tenant,
          companyId: ids.company,
          companyName: "Core Admin Race Company",
          brandId: randomUUID(),
          brandName: "Core Admin Race Brand",
          locationId: randomUUID(),
          locationName: "Core Admin Race Location",
          locationType: "BRANCH",
        },
        authorizedLocations: [],
        permissionCodes: [
          permissionCodes.coreAdminister,
          permissionCodes.tenantRoleAdminister,
        ],
        authentication: {
          sessionId: ids.actorSession,
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: new Date(),
          absoluteExpiresAt: sessionExpiry,
        },
      };
      mockContext.requireSessionContext.mockResolvedValue(session);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("commits one stable MFA denial after evidence is revoked during the role-lock wait", async () => {
      const rolePermissionsBefore = await prisma.rolePermission.findMany({
        where: { roleId: ids.targetRole },
        select: { permissionId: true },
        orderBy: { permissionId: "asc" },
      });
      const usersBefore = await prisma.user.findMany({
        where: { id: { in: [ids.actor, ids.assignee] } },
        select: { id: true, privilegeEpoch: true },
        orderBy: { id: "asc" },
      });
      const sessionsBefore = await prisma.authSession.findMany({
        where: { id: { in: [ids.actorSession, ids.targetSession] } },
        select: {
          id: true,
          status: true,
          privilegeEpochAtIssue: true,
          revokedAt: true,
          revocationReason: true,
        },
        orderBy: { id: "asc" },
      });
      const invalidationsBefore = await prisma.authSessionInvalidation.count({
        where: { targetUserId: { in: [ids.actor, ids.assignee] } },
      });
      const mutationAuditsBefore = await prisma.auditEvent.count({
        where: {
          tenantId: ids.tenant,
          entityId: ids.targetRole,
          eventType: {
            in: [
              "role_permissions.updated",
              "role_permissions.recommended_applied",
            ],
          },
        },
      });
      const denialAuditsBefore = await prisma.auditEvent.count({
        where: {
          tenantId: ids.tenant,
          entityId: ids.targetRole,
          eventType: "privileged_mfa.required_denied",
        },
      });

      let releaseRole!: () => void;
      let signalRoleLocked!: () => void;
      const roleRelease = new Promise<void>((resolve) => {
        releaseRole = resolve;
      });
      const roleLocked = new Promise<void>((resolve) => {
        signalRoleLocked = resolve;
      });
      const roleBlocker = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
            FROM "Role"
           WHERE "id" = ${ids.targetRole}::uuid
           FOR UPDATE
        `;
        signalRoleLocked();
        await roleRelease;
      });
      await roleLocked;

      const form = new FormData();
      form.set("roleId", ids.targetRole);
      form.set(
        "reason",
        "Remove sensitive authority only with live privileged MFA evidence.",
      );
      form.append("permissionCodes", `core_admin_race_${suffix}.view`);
      const mutationOutcome = updateRolePermissions(form).then(
        () => ({ status: "fulfilled" as const, error: null }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );

      try {
        const waitDeadline = Date.now() + 5_000;
        let waitingOnRoleLock = false;
        while (Date.now() < waitDeadline && !waitingOnRoleLock) {
          const waiting = await prisma.$queryRaw<Array<{ count: number }>>`
            SELECT COUNT(*)::int AS count
              FROM pg_stat_activity
             WHERE datname = current_database()
               AND pid <> pg_backend_pid()
               AND wait_event_type = 'Lock'
               AND query LIKE '%FROM "Role"%'
          `;
          waitingOnRoleLock = (waiting[0]?.count ?? 0) > 0;
          if (!waitingOnRoleLock) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
        expect(waitingOnRoleLock).toBe(true);

        await prisma.$transaction(async (tx) => {
          const revoked = await tx.privilegedMfaEnrollment.updateMany({
            where: { id: ids.mfaEnrollment, status: "VERIFIED" },
            data: {
              status: "REVOKED",
              revokedByUserId: ids.assignee,
              revocationReason: "Disposable MFA authority-race revocation",
              revokedAt: new Date(),
            },
          });
          expect(revoked.count).toBe(1);
          await tx.auditEvent.create({
            data: {
              tenantId: ids.tenant,
              companyId: ids.company,
              actorUserId: ids.assignee,
              eventType: "test.privileged_mfa_enrollment.revoked",
              entityType: "PrivilegedMfaEnrollment",
              entityId: ids.mfaEnrollment,
              beforeData: { status: "VERIFIED" },
              afterData: { status: "REVOKED" },
              metadata: { testRun: suffix },
            },
          });
        });
      } finally {
        releaseRole();
        await roleBlocker;
      }

      const outcome = await mutationOutcome;
      expect(outcome.status).toBe("rejected");
      expect(outcome.error).toBeInstanceOf(Error);
      expect((outcome.error as Error).message).toBe(
        "PRIVILEGED_MFA_REQUIRED",
      );
      expect(
        await prisma.rolePermission.findMany({
          where: { roleId: ids.targetRole },
          select: { permissionId: true },
          orderBy: { permissionId: "asc" },
        }),
      ).toEqual(rolePermissionsBefore);
      expect(
        await prisma.user.findMany({
          where: { id: { in: [ids.actor, ids.assignee] } },
          select: { id: true, privilegeEpoch: true },
          orderBy: { id: "asc" },
        }),
      ).toEqual(usersBefore);
      expect(
        await prisma.authSession.findMany({
          where: { id: { in: [ids.actorSession, ids.targetSession] } },
          select: {
            id: true,
            status: true,
            privilegeEpochAtIssue: true,
            revokedAt: true,
            revocationReason: true,
          },
          orderBy: { id: "asc" },
        }),
      ).toEqual(sessionsBefore);
      expect(
        await prisma.authSessionInvalidation.count({
          where: { targetUserId: { in: [ids.actor, ids.assignee] } },
        }),
      ).toBe(invalidationsBefore);
      expect(
        await prisma.auditEvent.count({
          where: {
            tenantId: ids.tenant,
            entityId: ids.targetRole,
            eventType: {
              in: [
                "role_permissions.updated",
                "role_permissions.recommended_applied",
              ],
            },
          },
        }),
      ).toBe(mutationAuditsBefore);
      const denialAudits = await prisma.auditEvent.findMany({
        where: {
          tenantId: ids.tenant,
          entityId: ids.targetRole,
          eventType: "privileged_mfa.required_denied",
        },
        select: { afterData: true },
      });
      expect(denialAudits).toHaveLength(denialAuditsBefore + 1);
      expect(denialAudits.at(-1)?.afterData).toMatchObject({
        action: "role_permissions.update_sensitive",
        outcome: "DENIED",
        mode: "enforce_admin_security",
      });
    });

    it("rejects stale actor authority after the role-lock wait with no partial mutation", async () => {
      const rolePermissionsBefore = await prisma.rolePermission.findMany({
        where: { roleId: ids.targetRole },
        select: { permissionId: true },
        orderBy: { permissionId: "asc" },
      });
      const assigneeBefore = await prisma.user.findUniqueOrThrow({
        where: { id: ids.assignee },
        select: { privilegeEpoch: true },
      });
      const assigneeSessionBefore = await prisma.authSession.findUniqueOrThrow({
        where: { id: ids.targetSession },
        select: {
          status: true,
          privilegeEpochAtIssue: true,
          revokedAt: true,
          revocationReason: true,
        },
      });
      const roleAuditBefore = await prisma.auditEvent.count({
        where: { tenantId: ids.tenant, entityId: ids.targetRole },
      });
      const assigneeInvalidationBefore =
        await prisma.authSessionInvalidation.count({
          where: { targetUserId: ids.assignee },
        });

      let releaseRole!: () => void;
      let signalRoleLocked!: () => void;
      const roleRelease = new Promise<void>((resolve) => {
        releaseRole = resolve;
      });
      const roleLocked = new Promise<void>((resolve) => {
        signalRoleLocked = resolve;
      });
      const roleBlocker = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
            FROM "Role"
           WHERE "id" = ${ids.targetRole}::uuid
           FOR UPDATE
        `;
        signalRoleLocked();
        await roleRelease;
      });
      await roleLocked;

      const form = new FormData();
      form.set("roleId", ids.targetRole);
      form.set(
        "reason",
        "Remove sensitive authority only while the actor remains authorized.",
      );
      form.append("permissionCodes", `core_admin_race_${suffix}.view`);
      const mutationOutcome = updateRolePermissions(form).then(
        () => ({ status: "fulfilled" as const, error: null }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );

      try {
        const waitDeadline = Date.now() + 5_000;
        let waitingOnRoleLock = false;
        while (Date.now() < waitDeadline && !waitingOnRoleLock) {
          const waiting = await prisma.$queryRaw<Array<{ count: number }>>`
            SELECT COUNT(*)::int AS count
              FROM pg_stat_activity
             WHERE datname = current_database()
               AND pid <> pg_backend_pid()
               AND wait_event_type = 'Lock'
               AND query LIKE '%FROM "Role"%'
          `;
          waitingOnRoleLock = (waiting[0]?.count ?? 0) > 0;
          if (!waitingOnRoleLock) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
        expect(waitingOnRoleLock).toBe(true);

        await prisma.$transaction(async (tx) => {
          const revoked = await tx.userRoleAssignment.updateMany({
            where: { id: ids.actorAssignment, status: "ACTIVE" },
            data: { status: "INACTIVE", endsAt: new Date() },
          });
          expect(revoked.count).toBe(1);
          await tx.user.update({
            where: { id: ids.actor },
            data: { privilegeEpoch: { increment: 1 } },
          });
          await tx.authSession.update({
            where: { id: ids.actorSession },
            data: {
              status: "REVOKED",
              revokedAt: new Date(),
              revocationReason: "Disposable authority-race revocation",
            },
          });
          await tx.auditEvent.create({
            data: {
              tenantId: ids.tenant,
              companyId: ids.company,
              actorUserId: ids.assignee,
              eventType: "test.role_admin_authority.revoked",
              entityType: "UserRoleAssignment",
              entityId: ids.actorAssignment,
              beforeData: { status: "ACTIVE" },
              afterData: { status: "INACTIVE" },
              metadata: { testRun: suffix },
            },
          });
        });
      } finally {
        releaseRole();
        await roleBlocker;
      }
      const outcome = await mutationOutcome;
      expect(outcome.status).toBe("rejected");
      expect(outcome.error).toBeInstanceOf(Error);
      expect((outcome.error as Error).message).toBe(
        "ROLE_PERMISSION_AUTHORITY_STALE",
      );

      expect(
        await prisma.rolePermission.findMany({
          where: { roleId: ids.targetRole },
          select: { permissionId: true },
          orderBy: { permissionId: "asc" },
        }),
      ).toEqual(rolePermissionsBefore);
      expect(
        await prisma.user.findUniqueOrThrow({
          where: { id: ids.assignee },
          select: { privilegeEpoch: true },
        }),
      ).toEqual(assigneeBefore);
      expect(
        await prisma.authSession.findUniqueOrThrow({
          where: { id: ids.targetSession },
          select: {
            status: true,
            privilegeEpochAtIssue: true,
            revokedAt: true,
            revocationReason: true,
          },
        }),
      ).toEqual(assigneeSessionBefore);
      expect(
        await prisma.auditEvent.count({
          where: { tenantId: ids.tenant, entityId: ids.targetRole },
        }),
      ).toBe(roleAuditBefore);
      expect(
        await prisma.authSessionInvalidation.count({
          where: { targetUserId: ids.assignee },
        }),
      ).toBe(assigneeInvalidationBefore);
      expect(
        await prisma.user.findUniqueOrThrow({
          where: { id: ids.actor },
          select: { privilegeEpoch: true },
        }),
      ).toEqual({ privilegeEpoch: 1 });
      expect(
        await prisma.authSession.findUniqueOrThrow({
          where: { id: ids.actorSession },
          select: { status: true, revocationReason: true },
        }),
      ).toEqual({
        status: "REVOKED",
        revocationReason: "Disposable authority-race revocation",
      });
      expect(
        await prisma.auditEvent.count({
          where: {
            tenantId: ids.tenant,
            entityId: ids.actorAssignment,
            eventType: "test.role_admin_authority.revoked",
          },
        }),
      ).toBe(1);
    });
  },
);
