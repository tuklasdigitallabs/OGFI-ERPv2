import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { SessionContext } from "../src/server/services/context";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const contextMock = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));

vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<typeof import("../src/server/services/context")>(
    "../src/server/services/context",
  );
  return { ...actual, requireSessionContext: contextMock.requireSessionContext };
});

const databaseEnabled = process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes";
const ruleReason = "Disposable lifecycle verification requires this controlled change.";
const lifecycleAuditEventTypes = [
  "core_admin.approval_rule.created",
  "core_admin.approval_rule.revised",
  "core_admin.approval_rule.successor_created",
  "core_admin.approval_rule.activated",
  "core_admin.approval_rule.deactivated",
];

type LifecycleService = typeof import("../src/server/services/approvalRuleLifecycle");

function ruleForm(input: {
  transactionType?: string;
  routeKey?: string;
  priority?: number;
  reason?: string;
  idempotencyKey?: string;
  steps: Array<{ stepOrder: number; roleId: string }>;
}) {
  const form = new FormData();
  form.set("transactionType", input.transactionType ?? "PURCHASE_REQUEST");
  form.set("routeKey", input.routeKey ?? "DEFAULT");
  form.set("priority", String(input.priority ?? 100));
  form.set("reason", input.reason ?? ruleReason);
  form.set("idempotencyKey", input.idempotencyKey ?? randomUUID());
  form.set("stepsJson", JSON.stringify(input.steps));
  return form;
}

function actionForm(input: {
  ruleId: string;
  expectedLifecycleVersion: number;
  expectedActiveRuleId?: string | null;
  reason?: string;
  idempotencyKey?: string;
}) {
  const form = new FormData();
  form.set("ruleId", input.ruleId);
  form.set("expectedLifecycleVersion", String(input.expectedLifecycleVersion));
  if (input.expectedActiveRuleId !== undefined && input.expectedActiveRuleId !== null) {
    form.set("expectedActiveRuleId", input.expectedActiveRuleId);
  }
  form.set("reason", input.reason ?? ruleReason);
  form.set("idempotencyKey", input.idempotencyKey ?? randomUUID());
  return form;
}

describe.skipIf(!databaseEnabled).sequential(
  "DEC-0225 approval-rule lifecycle against disposable PostgreSQL",
  () => {
    let prisma: PrismaClient;
    let lifecycle: LifecycleService;
    let session: SessionContext;
    let approverRoleId: string;
    const suffix = randomUUID().slice(0, 8);
    const ids = {
      tenant: randomUUID(),
      company: randomUUID(),
      location: randomUUID(),
      actor: randomUUID(),
      approver: randomUUID(),
      adminRole: randomUUID(),
      approverRole: randomUUID(),
      actorSession: randomUUID(),
      actorAssignment: randomUUID(),
      actorCompanyScope: randomUUID(),
      mfaEnrollment: randomUUID(),
      alternateCompany: randomUUID(),
    };

    beforeAll(async () => {
      const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(process.env);
      ({ prisma } = await import("@ogfi/database"));
      lifecycle = await import("../src/server/services/approvalRuleLifecycle");
      const { permissions } = await import("../src/server/services/authorization");

      await prisma.$connect();
      await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
      const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
        SELECT current_database() AS "currentDatabase"
      `;
      expect(identity).toEqual([{ currentDatabase: expectedDatabase }]);

      await prisma.tenant.create({
        data: { id: ids.tenant, name: `Approval lifecycle tenant ${suffix}`, loginCode: `arl-${suffix}` },
      });
      await prisma.company.create({
        data: {
          id: ids.company,
          tenantId: ids.tenant,
          code: `ARL-${suffix}`,
          legalName: `Approval lifecycle company ${suffix}`,
          currencyCode: "PHP",
        },
      });
      await prisma.company.create({
        data: {
          id: ids.alternateCompany,
          tenantId: ids.tenant,
          code: `ARL-X-${suffix}`,
          legalName: `Approval lifecycle alternate company ${suffix}`,
          currencyCode: "PHP",
        },
      });
      await prisma.location.create({
        data: {
          id: ids.location,
          tenantId: ids.tenant,
          companyId: ids.company,
          code: `ARL-HO-${suffix}`,
          name: "Approval lifecycle head office",
          locationType: "HEAD_OFFICE",
        },
      });
      await prisma.user.createMany({
        data: [
          {
            id: ids.actor,
            tenantId: ids.tenant,
            email: `approval-lifecycle-admin-${suffix}@example.test`,
            displayName: "Approval lifecycle administrator",
          },
          {
            id: ids.approver,
            tenantId: ids.tenant,
            email: `approval-lifecycle-approver-${suffix}@example.test`,
            displayName: "Approval lifecycle approver",
          },
        ],
      });
      const permissionRows = await Promise.all([
        prisma.permission.upsert({
          where: { code: permissions.coreAdminister },
          update: {},
          create: { code: permissions.coreAdminister, module: "core", action: "administer" },
          select: { id: true },
        }),
        prisma.permission.upsert({
          where: { code: permissions.tenantRoleAdminister },
          update: {},
          create: { code: permissions.tenantRoleAdminister, module: "core", action: "tenant_role_administer" },
          select: { id: true },
        }),
        prisma.permission.upsert({
          where: { code: permissions.purchaseRequestApprove },
          update: {},
          create: { code: permissions.purchaseRequestApprove, module: "purchasing", action: "approve" },
          select: { id: true },
        }),
      ]);
      await prisma.role.create({
        data: {
          id: ids.adminRole,
          tenantId: ids.tenant,
          code: `APPROVAL_LIFECYCLE_ADMIN_${suffix}`,
          name: "Approval lifecycle administrator",
          permissions: { create: permissionRows.slice(0, 2).map(({ id: permissionId }) => ({ permissionId })) },
        },
      });
      await prisma.role.create({
        data: {
          id: ids.approverRole,
          tenantId: ids.tenant,
          code: `APPROVAL_LIFECYCLE_APPROVER_${suffix}`,
          name: "Approval lifecycle approver",
          permissions: { create: [{ permissionId: permissionRows[2]!.id }] },
        },
      });
      approverRoleId = ids.approverRole;
      await prisma.userRoleAssignment.createMany({
        data: [
          { id: ids.actorAssignment, userId: ids.actor, roleId: ids.adminRole, startsAt: new Date(Date.now() - 60_000) },
          { userId: ids.approver, roleId: ids.approverRole, startsAt: new Date(Date.now() - 60_000) },
        ],
      });
      await prisma.userScopeAssignment.createMany({
        data: [
          { id: ids.actorCompanyScope, userId: ids.actor, scopeType: "COMPANY", scopeId: ids.company, accessLevel: "MANAGE", startsAt: new Date(Date.now() - 60_000) },
          { userId: ids.approver, scopeType: "COMPANY", scopeId: ids.company, accessLevel: "VIEW", startsAt: new Date(Date.now() - 60_000) },
        ],
      });
      const sessionExpiry = new Date(Date.now() + 60 * 60_000);
      await prisma.authSession.create({
        data: {
          id: ids.actorSession,
          tenantId: ids.tenant,
          userId: ids.actor,
          tokenHash: `approval-lifecycle-${suffix}`,
          status: "ACTIVE",
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: new Date(),
          privilegeEpochAtIssue: 0,
          idleExpiresAt: sessionExpiry,
          absoluteExpiresAt: sessionExpiry,
        },
      });
      await prisma.companyPolicySetting.create({
        data: {
          tenantId: ids.tenant,
          companyId: ids.company,
          key: "security.privileged_mfa.enforcement_mode",
          category: "security",
          label: "Privileged MFA enforcement",
          description: "Disposable approval-rule lifecycle fixture policy.",
          value: "enforce_admin_security",
          defaultValue: "warn_and_audit",
          valueType: "SELECT",
          isDefault: false,
          updatedByUserId: ids.approver,
        },
      });
      // Demo-mode privileged-MFA policy accepts verified evidence; without it
      // each successful lifecycle command would add a warning audit that is
      // unrelated to the lifecycle audit contract asserted below.
      await prisma.privilegedMfaEnrollment.create({
        data: {
          id: ids.mfaEnrollment,
          tenantId: ids.tenant,
          companyId: ids.company,
          targetUserId: ids.actor,
          providerName: `APPROVAL-LIFECYCLE-${suffix}`,
          status: "VERIFIED",
          evidenceReference: `APPROVAL-LIFECYCLE-EVIDENCE-${suffix}`,
          attestationNote: "Disposable approval-rule lifecycle fixture evidence.",
          attestedByUserId: ids.approver,
          verifiedByUserId: ids.approver,
          verificationNote: "Disposable fixture verification.",
          verifiedAt: new Date(),
        },
      });
      session = {
        user: {
          id: ids.actor,
          email: `approval-lifecycle-admin-${suffix}@example.test`,
          displayName: "Approval lifecycle administrator",
          role: "Approval lifecycle administrator",
        },
        context: {
          tenantId: ids.tenant,
          companyId: ids.company,
          companyName: "Approval lifecycle company",
          brandId: "",
          brandName: "Company-wide",
          locationId: ids.location,
          locationName: "Approval lifecycle head office",
          locationType: "HEAD_OFFICE",
        },
        authorizedLocations: [],
        permissionCodes: [permissions.coreAdminister, permissions.tenantRoleAdminister],
        authentication: {
          sessionId: ids.actorSession,
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: new Date(),
          absoluteExpiresAt: sessionExpiry,
        },
      };
      contextMock.requireSessionContext.mockResolvedValue(session);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    test("AUTHZ-APPROVAL-RULE-LIFECYCLE-LIVE-AUTHORITY-MFA-SCOPE-AND-IMMUTABILITY", async () => {
      const createKey = randomUUID();
      const create = ruleForm({ idempotencyKey: createKey, priority: 100, steps: [{ stepOrder: 1, roleId: approverRoleId }] });
      const sourceId = await lifecycle.createCoreAdminApprovalRuleVersion(create);
      expect(await lifecycle.createCoreAdminApprovalRuleVersion(create)).toBe(sourceId);
      await expect(
        lifecycle.createCoreAdminApprovalRuleVersion(
          ruleForm({ idempotencyKey: createKey, priority: 101, steps: [{ stepOrder: 1, roleId: approverRoleId }] }),
        ),
      ).rejects.toThrow("APPROVAL_RULE_IDEMPOTENCY_CONFLICT");
      await expect(
        lifecycle.createCoreAdminApprovalRuleVersion(
          ruleForm({ priority: 100, steps: [{ stepOrder: 1, roleId: approverRoleId }] }),
        ),
      ).rejects.toThrow("APPROVAL_RULE_ROUTE_ALREADY_EXISTS");

      const sourceBefore = await prisma.approvalRule.findUniqueOrThrow({
        where: { id: sourceId },
        include: { steps: { orderBy: { stepOrder: "asc" } } },
      });
      expect(sourceBefore).toMatchObject({
        version: 1,
        lifecycleVersion: 1,
        isActive: false,
        lineageId: sourceId,
        definitionSealed: true,
      });
      const [composerOptions, composerVersion] = await Promise.all([
        lifecycle.listApprovalRuleComposerOptions(session),
        lifecycle.getApprovalRuleVersionForComposer(session, sourceId),
      ]);
      expect(composerOptions.transactionOptions).toContainEqual(expect.objectContaining({
        value: "PURCHASE_REQUEST",
      }));
      expect(composerOptions.roleOptions).toContainEqual(expect.objectContaining({
        id: approverRoleId,
      }));
      expect(composerVersion).toMatchObject({
        id: sourceId,
        lifecycleVersion: 1,
        isActive: false,
        steps: [{ stepOrder: 1, roleId: approverRoleId }],
      });

      // The service's duplicate-route response is application-level scope
      // enforcement. These direct writes prove the separate database controls
      // that preserve immutable versions and append-only lifecycle evidence.
      const createIntent = await prisma.approvalRuleLifecycleIntent.findFirstOrThrow({
        where: { approvalRuleId: sourceId, action: "CREATE" },
        select: { id: true },
      });
      const sourceStepId = sourceBefore.steps[0]!.id;
      await expect(
        prisma.approvalRule.update({ where: { id: sourceId }, data: { priority: 101 } }),
      ).rejects.toThrow("ApprovalRule version definitions are immutable");
      await expect(
        prisma.approvalRule.delete({ where: { id: sourceId } }),
      ).rejects.toThrow("ApprovalRule versions are append-only");
      await expect(
        prisma.approvalRuleStep.update({ where: { id: sourceStepId }, data: { required: false } }),
      ).rejects.toThrow("ApprovalRuleStep definitions are immutable");
      await expect(
        prisma.approvalRuleStep.delete({ where: { id: sourceStepId } }),
      ).rejects.toThrow("ApprovalRuleStep definitions are immutable");
      await expect(
        prisma.approvalRuleStep.create({
          data: {
            approvalRuleId: sourceId,
            stepOrder: 2,
            approverType: "ROLE",
            roleId: approverRoleId,
            required: true,
          },
        }),
      ).rejects.toThrow("APPROVAL_RULE_VERSION_ALREADY_SEALED");
      const [ruleCountBeforeTruncate, stepCountBeforeTruncate] = await Promise.all([
        prisma.approvalRule.count({ where: { tenantId: ids.tenant } }),
        prisma.approvalRuleStep.count({ where: { approvalRule: { tenantId: ids.tenant } } }),
      ]);
      await expect(
        prisma.$executeRawUnsafe('TRUNCATE TABLE "ApprovalRule" CASCADE'),
      ).rejects.toThrow("permission denied for table ApprovalRule");
      await expect(
        prisma.$executeRawUnsafe('TRUNCATE TABLE "ApprovalRuleStep"'),
      ).rejects.toThrow("permission denied for table ApprovalRuleStep");
      await expect(Promise.all([
        prisma.approvalRule.count({ where: { tenantId: ids.tenant } }),
        prisma.approvalRuleStep.count({ where: { approvalRule: { tenantId: ids.tenant } } }),
      ])).resolves.toEqual([ruleCountBeforeTruncate, stepCountBeforeTruncate]);
      await expect(
        prisma.approvalRuleLifecycleIntent.update({
          where: { id: createIntent.id },
          data: { action: "REVISE" },
        }),
      ).rejects.toThrow("ApprovalRuleLifecycleIntent is append-only");
      await expect(
        prisma.approvalRuleLifecycleIntent.delete({ where: { id: createIntent.id } }),
      ).rejects.toThrow("ApprovalRuleLifecycleIntent is append-only");
      await expect(
        prisma.approvalRuleLifecycleIntent.create({
          data: {
            tenantId: ids.tenant,
            companyId: ids.alternateCompany,
            approvalRuleId: sourceId,
            action: "CREATE",
            idempotencyKey: randomUUID(),
            requestHash: "a".repeat(64),
          },
        }),
      ).rejects.toThrow("ApprovalRuleLifecycleIntent_approvalRuleId_fkey");
      await expect(
        prisma.approvalRule.create({
          data: {
            tenantId: ids.tenant,
            companyId: ids.alternateCompany,
            transactionType: sourceBefore.transactionType,
            routeKey: sourceBefore.routeKey,
            scopeFilters: sourceBefore.scopeFilters ?? undefined,
            priority: 200,
            isActive: false,
            lineageId: sourceBefore.lineageId,
            version: 2,
            supersedesRuleId: sourceId,
            lifecycleVersion: 1,
          },
        }),
      ).rejects.toThrow("APPROVAL_RULE_SUCCESSOR_LINEAGE_INVALID");

      const [rulesBeforeMfaDenial, intentsBeforeMfaDenial, lifecycleAuditsBeforeMfaDenial, denialBucketsBeforeMfaDenial] = await Promise.all([
        prisma.approvalRule.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
        prisma.approvalRuleLifecycleIntent.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
        prisma.auditEvent.count({
          where: {
            tenantId: ids.tenant,
            companyId: ids.company,
            eventType: { in: lifecycleAuditEventTypes },
          },
        }),
        prisma.authorizationDenialBucket.findMany({
          where: {
            tenantId: ids.tenant,
            companyId: ids.company,
            locationId: ids.location,
            actorUserId: ids.actor,
            resource: "ADMINISTRATION",
            action: "ADMINISTER",
            reason: "MFA_REQUIRED",
          },
          select: { denialCount: true, firstAuditEvent: { select: { eventType: true } } },
        }),
      ]);
      expect(denialBucketsBeforeMfaDenial).toEqual([]);
      const previousAuthMode = process.env.AUTH_MODE;
      try {
        process.env.AUTH_MODE = "demo";
        await prisma.privilegedMfaEnrollment.update({
          where: { id: ids.mfaEnrollment },
          data: {
            status: "REVOKED",
            revokedByUserId: ids.approver,
            revocationReason: "Disposable strict-MFA denial verification.",
            revokedAt: new Date(),
          },
        });
        await expect(
          lifecycle.createCoreAdminApprovalRuleVersion(
            ruleForm({ priority: 101, steps: [{ stepOrder: 1, roleId: approverRoleId }] }),
          ),
        ).rejects.toThrow("PRIVILEGED_MFA_REQUIRED");
      } finally {
        await prisma.privilegedMfaEnrollment.update({
          where: { id: ids.mfaEnrollment },
          data: {
            status: "VERIFIED",
            revokedByUserId: null,
            revocationReason: null,
            revokedAt: null,
          },
        });
        if (previousAuthMode === undefined) delete process.env.AUTH_MODE;
        else process.env.AUTH_MODE = previousAuthMode;
      }
      const [rulesAfterMfaDenial, intentsAfterMfaDenial, lifecycleAuditsAfterMfaDenial, denialBucketsAfterMfaDenial] = await Promise.all([
        prisma.approvalRule.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
        prisma.approvalRuleLifecycleIntent.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
        prisma.auditEvent.count({
          where: {
            tenantId: ids.tenant,
            companyId: ids.company,
            eventType: { in: lifecycleAuditEventTypes },
          },
        }),
        prisma.authorizationDenialBucket.findMany({
          where: {
            tenantId: ids.tenant,
            companyId: ids.company,
            locationId: ids.location,
            actorUserId: ids.actor,
            resource: "ADMINISTRATION",
            action: "ADMINISTER",
            reason: "MFA_REQUIRED",
          },
          select: { denialCount: true, firstAuditEvent: { select: { eventType: true } } },
        }),
      ]);
      expect([rulesAfterMfaDenial, intentsAfterMfaDenial, lifecycleAuditsAfterMfaDenial])
        .toEqual([rulesBeforeMfaDenial, intentsBeforeMfaDenial, lifecycleAuditsBeforeMfaDenial]);
      expect(denialBucketsAfterMfaDenial).toEqual([{
        denialCount: 1n,
        firstAuditEvent: { eventType: "authorization.denial.first" },
      }]);
      const lifecycleStateBeforeLiveAuthorityDenials = await Promise.all([
        prisma.approvalRule.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
        prisma.approvalRuleLifecycleIntent.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
        prisma.auditEvent.count({
          where: {
            tenantId: ids.tenant,
            companyId: ids.company,
            eventType: { in: lifecycleAuditEventTypes },
          },
        }),
      ]);
      await prisma.userRoleAssignment.update({
        where: { id: ids.actorAssignment },
        data: { status: "INACTIVE", endsAt: new Date() },
      });
      try {
        await expect(lifecycle.listApprovalRuleComposerOptions(session)).rejects.toThrow("PERMISSION_DENIED");
        await expect(lifecycle.getApprovalRuleVersionForComposer(session, sourceId)).rejects.toThrow("PERMISSION_DENIED");
        await expect(
          lifecycle.createCoreAdminApprovalRuleVersion(
            ruleForm({ priority: 101, steps: [{ stepOrder: 1, roleId: approverRoleId }] }),
          ),
        ).rejects.toThrow("PERMISSION_DENIED");
      } finally {
        await prisma.userRoleAssignment.update({
          where: { id: ids.actorAssignment },
          data: { status: "ACTIVE", endsAt: null },
        });
      }
      await prisma.userScopeAssignment.update({
        where: { id: ids.actorCompanyScope },
        data: { status: "INACTIVE", endsAt: new Date() },
      });
      try {
        await expect(lifecycle.listApprovalRuleComposerOptions(session)).rejects.toThrow("ADMIN_SCOPE_DENIED");
        await expect(lifecycle.getApprovalRuleVersionForComposer(session, sourceId)).rejects.toThrow("ADMIN_SCOPE_DENIED");
        await expect(
          lifecycle.createCoreAdminApprovalRuleVersion(
            ruleForm({ priority: 101, steps: [{ stepOrder: 1, roleId: approverRoleId }] }),
          ),
        ).rejects.toThrow("ADMIN_SCOPE_DENIED");
      } finally {
        await prisma.userScopeAssignment.update({
          where: { id: ids.actorCompanyScope },
          data: { status: "ACTIVE", endsAt: null },
        });
      }
      await expect(Promise.all([
        prisma.approvalRule.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
        prisma.approvalRuleLifecycleIntent.count({ where: { tenantId: ids.tenant, companyId: ids.company } }),
        prisma.auditEvent.count({
          where: {
            tenantId: ids.tenant,
            companyId: ids.company,
            eventType: { in: lifecycleAuditEventTypes },
          },
        }),
      ])).resolves.toEqual(lifecycleStateBeforeLiveAuthorityDenials);

      const reviseKey = randomUUID();
      const revise = ruleForm({ priority: 200, idempotencyKey: reviseKey, steps: [{ stepOrder: 1, roleId: approverRoleId }] });
      revise.set("sourceRuleId", sourceId);
      revise.set("expectedLifecycleVersion", "1");
      const successorId = await lifecycle.reviseCoreAdminApprovalRuleVersion(revise);
      expect(await lifecycle.reviseCoreAdminApprovalRuleVersion(revise)).toBe(successorId);
      await expect(
        lifecycle.reviseCoreAdminApprovalRuleVersion(
          (() => {
            const form = ruleForm({ priority: 201, idempotencyKey: reviseKey, steps: [{ stepOrder: 1, roleId: approverRoleId }] });
            form.set("sourceRuleId", sourceId);
            form.set("expectedLifecycleVersion", "1");
            return form;
          })(),
        ),
      ).rejects.toThrow("APPROVAL_RULE_IDEMPOTENCY_CONFLICT");
      await expect(
        lifecycle.reviseCoreAdminApprovalRuleVersion(
          (() => {
            const form = ruleForm({ priority: 250, steps: [{ stepOrder: 1, roleId: approverRoleId }] });
            form.set("sourceRuleId", sourceId);
            form.set("expectedLifecycleVersion", "1");
            return form;
          })(),
        ),
      ).rejects.toThrow("APPROVAL_RULE_VERSION_CONFLICT");

      const [sourceAfter, successor] = await Promise.all([
        prisma.approvalRule.findUniqueOrThrow({ where: { id: sourceId }, include: { steps: { orderBy: { stepOrder: "asc" } } } }),
        prisma.approvalRule.findUniqueOrThrow({ where: { id: successorId }, include: { steps: { orderBy: { stepOrder: "asc" } } } }),
      ]);
      expect(sourceAfter).toMatchObject({
        id: sourceBefore.id,
        lineageId: sourceBefore.lineageId,
        version: 1,
        lifecycleVersion: 2,
        priority: sourceBefore.priority,
        isActive: false,
      });
      expect(sourceAfter.steps.map(({ stepOrder, roleId, approverType, required }) => ({ stepOrder, roleId, approverType, required })))
        .toEqual(sourceBefore.steps.map(({ stepOrder, roleId, approverType, required }) => ({ stepOrder, roleId, approverType, required })));
      expect(successor).toMatchObject({
        supersedesRuleId: sourceId,
        lineageId: sourceBefore.lineageId,
        version: 2,
        lifecycleVersion: 1,
        priority: 200,
        isActive: false,
        definitionSealed: true,
      });

      const activateKey = randomUUID();
      const activate = actionForm({ ruleId: successorId, expectedLifecycleVersion: 1, expectedActiveRuleId: null, idempotencyKey: activateKey });
      expect(await lifecycle.activateCoreAdminApprovalRuleVersion(activate)).toBe(successorId);
      expect(await lifecycle.activateCoreAdminApprovalRuleVersion(activate)).toBe(successorId);
      await expect(
        lifecycle.activateCoreAdminApprovalRuleVersion(
          actionForm({ ruleId: successorId, expectedLifecycleVersion: 1, expectedActiveRuleId: null, idempotencyKey: activateKey, reason: "Different replay payload must be rejected." }),
        ),
      ).rejects.toThrow("APPROVAL_RULE_IDEMPOTENCY_CONFLICT");
      await expect(
        lifecycle.deactivateCoreAdminApprovalRuleVersion(
          actionForm({ ruleId: successorId, expectedLifecycleVersion: 1, expectedActiveRuleId: successorId }),
        ),
      ).rejects.toThrow("APPROVAL_RULE_VERSION_CONFLICT");

      await prisma.approvalInstance.create({
        data: {
          tenantId: ids.tenant,
          companyId: ids.company,
          documentType: "ApprovalRuleLifecyclePgFixture",
          documentId: randomUUID(),
          approvalRuleId: successorId,
          status: "PENDING",
          currentStepOrder: 1,
        },
      });
      const deactivateKey = randomUUID();
      const deactivate = actionForm({ ruleId: successorId, expectedLifecycleVersion: 2, expectedActiveRuleId: successorId, idempotencyKey: deactivateKey });
      expect(await lifecycle.deactivateCoreAdminApprovalRuleVersion(deactivate)).toBe(successorId);
      expect(await lifecycle.deactivateCoreAdminApprovalRuleVersion(deactivate)).toBe(successorId);

      const [finalSource, finalSuccessor, pinnedInstances, intents, audits] = await Promise.all([
        prisma.approvalRule.findUniqueOrThrow({ where: { id: sourceId }, include: { steps: { orderBy: { stepOrder: "asc" } } } }),
        prisma.approvalRule.findUniqueOrThrow({ where: { id: successorId } }),
        prisma.approvalInstance.findMany({ where: { approvalRuleId: successorId }, select: { approvalRuleId: true } }),
        prisma.approvalRuleLifecycleIntent.findMany({
          where: { tenantId: ids.tenant, companyId: ids.company, approvalRuleId: { in: [sourceId, successorId] } },
          select: { action: true, approvalRuleId: true, idempotencyKey: true },
          orderBy: { createdAt: "asc" },
        }),
        prisma.auditEvent.findMany({
          where: { tenantId: ids.tenant, companyId: ids.company, entityId: { in: [sourceId, successorId] } },
          select: { eventType: true, entityId: true },
          orderBy: { occurredAt: "asc" },
        }),
      ]);
      expect(finalSource.steps.map(({ stepOrder, roleId }) => ({ stepOrder, roleId })))
        .toEqual(sourceBefore.steps.map(({ stepOrder, roleId }) => ({ stepOrder, roleId })));
      expect(finalSuccessor).toMatchObject({
        isActive: false,
        lifecycleVersion: 3,
        supersedesRuleId: sourceId,
        definitionSealed: true,
      });
      expect(pinnedInstances).toEqual([{ approvalRuleId: successorId }]);
      expect(intents).toEqual([
        { action: "CREATE", approvalRuleId: sourceId, idempotencyKey: createKey },
        { action: "REVISE", approvalRuleId: successorId, idempotencyKey: reviseKey },
        { action: "ACTIVATE", approvalRuleId: successorId, idempotencyKey: activateKey },
        { action: "DEACTIVATE", approvalRuleId: successorId, idempotencyKey: deactivateKey },
      ]);
      expect(audits.map(({ eventType }) => eventType)).toEqual([
        "core_admin.approval_rule.created",
        "core_admin.approval_rule.revised",
        "core_admin.approval_rule.successor_created",
        "core_admin.approval_rule.activated",
        "core_admin.approval_rule.deactivated",
      ]);
    });
  },
);
