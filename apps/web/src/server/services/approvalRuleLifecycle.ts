import { createHash, randomUUID } from "node:crypto";
import { Prisma, prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import {
  approvalRuleCatalog,
  assertSupportedApprovalRuleRoute,
  buildApprovalRuleScopeFilters,
  getApprovalRuleCatalogEntry,
} from "./approvalRuleCatalog";
import { permissions, requirePermission } from "./authorization";
import { assertCanManageCompanyScope } from "./coreAdmin";
import { requireSessionContext, type SessionContext } from "./context";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";

const reasonSchema = z.string().trim().min(5).max(500);
const idempotencyKeySchema = z.string().uuid();
const lifecycleVersionSchema = z.coerce.number().int().min(1);

const approvalRuleStepSchema = z.object({
  stepOrder: z.number().int().min(1).max(20),
  roleId: z.string().uuid(),
});

function parseStepsJson(value: unknown) {
  if (typeof value !== "string") throw new Error("APPROVAL_RULE_STEPS_INVALID");
  try {
    return z.array(approvalRuleStepSchema).min(1).max(20).parse(JSON.parse(value));
  } catch {
    throw new Error("APPROVAL_RULE_STEPS_INVALID");
  }
}

const createRuleSchema = z.object({
  transactionType: z.string().trim().min(1).max(100),
  routeKey: z.string().trim().min(1).max(40),
  priority: z.coerce.number().int().min(1).max(10_000),
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
  stepsJson: z.unknown(),
});

const reviseRuleSchema = z.object({
  sourceRuleId: z.string().uuid(),
  transactionType: z.string().trim().min(1).max(100),
  routeKey: z.string().trim().min(1).max(40),
  priority: z.coerce.number().int().min(1).max(10_000),
  expectedLifecycleVersion: lifecycleVersionSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
  stepsJson: z.unknown(),
});

const lifecycleActionSchema = z.object({
  ruleId: z.string().uuid(),
  expectedLifecycleVersion: lifecycleVersionSchema,
  expectedActiveRuleId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().uuid().optional(),
  ),
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});

type RuleStepInput = z.infer<typeof approvalRuleStepSchema>;

function assertSequentialSteps(steps: RuleStepInput[]) {
  if (steps.some((step, index) => step.stepOrder !== index + 1)) {
    throw new Error("APPROVAL_RULE_STEP_ORDER_INVALID");
  }
  if (new Set(steps.map((step) => step.roleId)).size !== steps.length) {
    throw new Error("APPROVAL_RULE_DUPLICATE_ROLE_STEP");
  }
}

function requestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function lockCompany(tx: TransactionClient, session: SessionContext) {
  const companies = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
      FROM "Company"
     WHERE id = ${session.context.companyId}::uuid
       AND "tenantId" = ${session.context.tenantId}::uuid
       AND status = 'ACTIVE'
     FOR UPDATE
  `;
  if (companies.length !== 1) throw new Error("COMPANY_NOT_FOUND");
}

type LockedAuthSession = {
  status: string;
  assuranceLevel: string;
  mfaAuthenticatedAt: Date | null;
  privilegeEpochAtIssue: number;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
};

async function revalidateMutationAuthority(
  tx: TransactionClient,
  session: SessionContext,
  action: string,
  ruleId: string | null,
  reason: string,
) {
  const now = new Date();
  const actor = await tx.user.findFirst({
    where: { id: session.user.id, tenantId: session.context.tenantId, status: "ACTIVE" },
    select: { id: true, privilegeEpoch: true },
  });
  if (!actor) throw new Error("PERMISSION_DENIED");

  let liveSession: LockedAuthSession | undefined;
  if (session.authentication?.sessionId) {
    const rows = await tx.$queryRaw<LockedAuthSession[]>`
      SELECT status, "assuranceLevel", "mfaAuthenticatedAt",
             "privilegeEpochAtIssue", "idleExpiresAt", "absoluteExpiresAt"
        FROM "AuthSession"
       WHERE id = ${session.authentication.sessionId}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "userId" = ${session.user.id}::uuid
       FOR SHARE
    `;
    liveSession = rows[0];
    if (
      !liveSession ||
      liveSession.status !== "ACTIVE" ||
      liveSession.privilegeEpochAtIssue !== actor.privilegeEpoch ||
      liveSession.idleExpiresAt <= now ||
      liveSession.absoluteExpiresAt <= now
    ) {
      throw new Error("APPROVAL_RULE_AUTHORITY_STALE");
    }
  }

  const roleAssignments = await tx.userRoleAssignment.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      role: {
        status: "ACTIVE",
        OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
      },
    },
    select: {
      role: {
        select: {
          permissions: {
            where: {
              permission: {
                code: { in: [permissions.coreAdminister, permissions.tenantRoleAdminister] },
                OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
              },
            },
            select: { permission: { select: { code: true } } },
          },
        },
      },
    },
  });
  const liveCodes = new Set(
    roleAssignments.flatMap((assignment) =>
      assignment.role.permissions.map((item) => item.permission.code),
    ),
  );
  if (!liveCodes.has(permissions.coreAdminister) || !liveCodes.has(permissions.tenantRoleAdminister)) {
    throw new Error("PERMISSION_DENIED");
  }

  const manageScope = await tx.userScopeAssignment.findFirst({
    where: {
      userId: session.user.id,
      scopeType: "COMPANY",
      scopeId: session.context.companyId,
      accessLevel: "MANAGE",
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: { id: true },
  });
  if (!manageScope) throw new Error("ADMIN_SCOPE_DENIED");

  const mfa = await assertPrivilegedMfaForAction(
    {
      ...session,
      ...(liveSession && session.authentication
        ? {
            authentication: {
              ...session.authentication,
              assuranceLevel: liveSession.assuranceLevel,
              mfaAuthenticatedAt: liveSession.mfaAuthenticatedAt,
              absoluteExpiresAt: liveSession.absoluteExpiresAt,
            },
          }
        : {}),
    },
    {
      action,
      permissionCode: permissions.tenantRoleAdminister,
      entityType: "ApprovalRule",
      entityId: ruleId,
      reason,
      metadata: { sourceDecisionId: "DEC-0225" },
    },
    { transaction: tx, deferDenialThrow: true, forceEnforcement: true },
  );
  return mfa.deniedError;
}

async function findIdempotentResult(
  tx: TransactionClient,
  session: SessionContext,
  input: { action: string; idempotencyKey: string; hash: string },
) {
  const existing = await tx.approvalRuleLifecycleIntent.findUnique({
    where: {
      tenantId_companyId_idempotencyKey: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    select: { action: true, requestHash: true, approvalRuleId: true },
  });
  if (!existing) return null;
  if (existing.action !== input.action || existing.requestHash !== input.hash) {
    throw new Error("APPROVAL_RULE_IDEMPOTENCY_CONFLICT");
  }
  return existing.approvalRuleId;
}

async function validateRoleSteps(
  tx: TransactionClient,
  session: SessionContext,
  transactionType: string,
  steps: RuleStepInput[],
) {
  assertSequentialSteps(steps);
  const catalog = getApprovalRuleCatalogEntry(transactionType);
  if (!catalog) throw new Error("APPROVAL_RULE_TRANSACTION_TYPE_UNSUPPORTED");
  const roleIds = steps.map((step) => step.roleId);
  const now = new Date();
  const roles = await tx.role.findMany({
    where: {
      id: { in: roleIds },
      status: "ACTIVE",
      OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
      permissions: {
        some: {
          permission: {
            code: catalog.requiredPermissionCode,
            OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
          },
        },
      },
    },
    select: { id: true },
  });
  if (roles.length !== roleIds.length) throw new Error("APPROVAL_RULE_ROLE_INELIGIBLE");

  const assignments = await tx.userRoleAssignment.findMany({
    where: {
      roleId: { in: roleIds },
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      user: { tenantId: session.context.tenantId, status: "ACTIVE" },
    },
    select: { roleId: true, userId: true },
  });
  const userIds = Array.from(new Set(assignments.map((assignment) => assignment.userId)));
  const locationIds = await tx.location.findMany({
    where: { tenantId: session.context.tenantId, companyId: session.context.companyId, status: "ACTIVE" },
    select: { id: true },
  });
  const scopes = await tx.userScopeAssignment.findMany({
    where: {
      userId: { in: userIds },
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      AND: [
        {
          OR: [
            { scopeType: "COMPANY", scopeId: session.context.companyId },
            { scopeType: "LOCATION", scopeId: { in: locationIds.map((location) => location.id) } },
          ],
        },
      ],
    },
    select: { userId: true },
  });
  const scopedUsers = new Set(scopes.map((scope) => scope.userId));
  for (const roleId of roleIds) {
    if (!assignments.some((assignment) => assignment.roleId === roleId && scopedUsers.has(assignment.userId))) {
      throw new Error("APPROVAL_RULE_ROLE_HAS_NO_SCOPED_APPROVER");
    }
  }
}

async function writeIntent(
  tx: TransactionClient,
  session: SessionContext,
  input: { approvalRuleId: string; action: string; idempotencyKey: string; hash: string },
) {
  await tx.approvalRuleLifecycleIntent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      approvalRuleId: input.approvalRuleId,
      action: input.action,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.hash,
    },
  });
}

async function requireLifecycleReadAuthority(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);
  await requirePermission(session, permissions.tenantRoleAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);
}

export async function listApprovalRuleComposerOptions(session: SessionContext) {
  await requireLifecycleReadAuthority(session);
  const permissionCodes = Array.from(new Set(approvalRuleCatalog.map((entry) => entry.requiredPermissionCode)));
  const roles = await prisma.role.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
      permissions: { some: { permission: { code: { in: permissionCodes } } } },
    },
    select: {
      id: true,
      code: true,
      name: true,
      permissions: {
        where: { permission: { code: { in: permissionCodes } } },
        select: { permission: { select: { code: true } } },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 201,
  });
  return {
    transactionOptions: approvalRuleCatalog.map((entry) => ({
      value: entry.transactionType,
      label: entry.label,
      requiredPermissionCode: entry.requiredPermissionCode,
      routes: entry.routeKeys.map((routeKey) => ({
        value: routeKey,
        label: routeKey === "PR_EMERGENCY" ? "Purchase Request emergency" : "Default",
      })),
    })),
    roleOptions: roles.slice(0, 200).map((role) => ({
      id: role.id,
      code: role.code,
      label: role.name,
      permissionCodes: role.permissions.map((item) => item.permission.code),
    })),
    roleCatalogHasMore: roles.length > 200,
  };
}

export async function getApprovalRuleVersionForComposer(
  session: SessionContext,
  ruleId: string,
) {
  await requireLifecycleReadAuthority(session);
  if (!z.string().uuid().safeParse(ruleId).success) return null;
  const rule = await prisma.approvalRule.findFirst({
    where: { id: ruleId, tenantId: session.context.tenantId, companyId: session.context.companyId },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });
  if (!rule) return null;
  const catalog = getApprovalRuleCatalogEntry(rule.transactionType);
  const isSupported = Boolean(
    catalog && catalog.routeKeys.some((routeKey) => routeKey === rule.routeKey),
  );
  const hasLegacySteps = rule.steps.some(
    (step) => step.approverType !== "ROLE" || !step.roleId || step.userId,
  );
  const active = await prisma.approvalRule.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: rule.transactionType,
      routeKey: rule.routeKey,
      isActive: true,
    },
    select: { id: true },
  });
  return {
    id: rule.id,
    transactionType: rule.transactionType,
    routeKey: rule.routeKey,
    priority: rule.priority,
    version: rule.version,
    lineageId: rule.lineageId,
    lifecycleVersion: rule.lifecycleVersion,
    isActive: rule.isActive,
    expectedActiveRuleId: active?.id ?? null,
    hasLegacySteps,
    isSupported,
    successorRuleId: (await prisma.approvalRule.findFirst({ where: { supersedesRuleId: rule.id }, select: { id: true } }))?.id ?? null,
    steps: rule.steps.map((step) => ({ stepOrder: step.stepOrder, roleId: step.roleId })),
  };
}

export async function createCoreAdminApprovalRuleVersion(formData: FormData) {
  const session = await requireSessionContext();
  await requireLifecycleReadAuthority(session);
  const values = createRuleSchema.parse(Object.fromEntries(formData));
  const steps = parseStepsJson(values.stepsJson);
  const supported = assertSupportedApprovalRuleRoute(values.transactionType, values.routeKey);
  const hash = requestHash({ action: "CREATE", ...values, stepsJson: undefined, steps });

  const outcome = await prisma.$transaction(async (tx) => {
    await lockCompany(tx, session);
    const deniedError = await revalidateMutationAuthority(tx, session, "approval_rule.create", null, values.reason);
    if (deniedError) return { deniedError };
    const prior = await findIdempotentResult(tx, session, { action: "CREATE", idempotencyKey: values.idempotencyKey, hash });
    if (prior) return { ruleId: prior };
    const existingRoute = await tx.approvalRule.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        transactionType: values.transactionType,
        routeKey: supported.routeKey,
      },
      select: { id: true },
    });
    if (existingRoute) throw new Error("APPROVAL_RULE_ROUTE_ALREADY_EXISTS");
    await validateRoleSteps(tx, session, values.transactionType, steps);
    const id = randomUUID();
    const rule = await tx.approvalRule.create({
      data: {
        id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        transactionType: values.transactionType,
        routeKey: supported.routeKey,
        scopeFilters: buildApprovalRuleScopeFilters(values.transactionType, supported.routeKey),
        priority: values.priority,
        isActive: false,
        lineageId: id,
        version: 1,
        lifecycleVersion: 1,
        idempotencyKey: values.idempotencyKey,
        idempotencyRequestHash: hash,
        steps: {
          create: steps.map((step) => ({
            stepOrder: step.stepOrder,
            approverType: "ROLE",
            roleId: step.roleId,
            required: true,
          })),
        },
      },
    });
    const sealed = await tx.approvalRule.updateMany({
      where: { id: rule.id, definitionSealed: false },
      data: { definitionSealed: true },
    });
    if (sealed.count !== 1) throw new Error("APPROVAL_RULE_VERSION_SEAL_CONFLICT");
    await writeIntent(tx, session, { approvalRuleId: rule.id, action: "CREATE", idempotencyKey: values.idempotencyKey, hash });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "core_admin.approval_rule.created",
        entityType: "ApprovalRule",
        entityId: rule.id,
        afterData: { transactionType: rule.transactionType, routeKey: rule.routeKey, priority: rule.priority, version: rule.version, isActive: false, steps },
        metadata: { approvalRuleId: rule.id, lineageId: rule.lineageId, reason: values.reason, sourceDecisionId: "DEC-0225", idempotencyKey: values.idempotencyKey },
      },
    });
    return { ruleId: rule.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if ("deniedError" in outcome) throw new Error(outcome.deniedError);
  return outcome.ruleId;
}

export async function reviseCoreAdminApprovalRuleVersion(formData: FormData) {
  const session = await requireSessionContext();
  await requireLifecycleReadAuthority(session);
  const values = reviseRuleSchema.parse(Object.fromEntries(formData));
  const steps = parseStepsJson(values.stepsJson);
  assertSupportedApprovalRuleRoute(values.transactionType, values.routeKey);
  const hash = requestHash({ action: "REVISE", ...values, stepsJson: undefined, steps });

  const outcome = await prisma.$transaction(async (tx) => {
    await lockCompany(tx, session);
    const deniedError = await revalidateMutationAuthority(tx, session, "approval_rule.revise", values.sourceRuleId, values.reason);
    if (deniedError) return { deniedError };
    const prior = await findIdempotentResult(tx, session, { action: "REVISE", idempotencyKey: values.idempotencyKey, hash });
    if (prior) return { ruleId: prior };
    const source = await tx.approvalRule.findFirst({
      where: { id: values.sourceRuleId, tenantId: session.context.tenantId, companyId: session.context.companyId },
      include: { steps: true, successorRule: { select: { id: true } } },
    });
    if (!source) throw new Error("APPROVAL_RULE_NOT_FOUND");
    if (source.lifecycleVersion !== values.expectedLifecycleVersion) throw new Error("APPROVAL_RULE_VERSION_CONFLICT");
    if (source.transactionType !== values.transactionType || source.routeKey !== values.routeKey) throw new Error("APPROVAL_RULE_ROUTE_IMMUTABLE");
    if (source.successorRule) throw new Error("APPROVAL_RULE_SUCCESSOR_EXISTS");
    if (source.steps.some((step) => step.approverType !== "ROLE" || !step.roleId || step.userId)) throw new Error("APPROVAL_RULE_LEGACY_USER_READ_ONLY");
    await validateRoleSteps(tx, session, values.transactionType, steps);
    const id = randomUUID();
    const successor = await tx.approvalRule.create({
      data: {
        id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        transactionType: source.transactionType,
        routeKey: source.routeKey,
        scopeFilters: buildApprovalRuleScopeFilters(source.transactionType, source.routeKey),
        priority: values.priority,
        isActive: false,
        lineageId: source.lineageId,
        version: source.version + 1,
        supersedesRuleId: source.id,
        lifecycleVersion: 1,
        idempotencyKey: values.idempotencyKey,
        idempotencyRequestHash: hash,
        steps: { create: steps.map((step) => ({ stepOrder: step.stepOrder, approverType: "ROLE", roleId: step.roleId, required: true })) },
      },
    });
    const sealed = await tx.approvalRule.updateMany({
      where: { id: successor.id, definitionSealed: false },
      data: { definitionSealed: true },
    });
    if (sealed.count !== 1) throw new Error("APPROVAL_RULE_VERSION_SEAL_CONFLICT");
    const touched = await tx.approvalRule.updateMany({
      where: { id: source.id, lifecycleVersion: values.expectedLifecycleVersion },
      data: { lifecycleVersion: { increment: 1 } },
    });
    if (touched.count !== 1) throw new Error("APPROVAL_RULE_VERSION_CONFLICT");
    await writeIntent(tx, session, { approvalRuleId: successor.id, action: "REVISE", idempotencyKey: values.idempotencyKey, hash });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "core_admin.approval_rule.revised",
        entityType: "ApprovalRule",
        entityId: successor.id,
        beforeData: { approvalRuleId: source.id, version: source.version, priority: source.priority, isActive: source.isActive },
        afterData: { approvalRuleId: successor.id, version: successor.version, priority: successor.priority, isActive: false, steps },
        metadata: { approvalRuleId: successor.id, supersedesRuleId: source.id, lineageId: source.lineageId, reason: values.reason, sourceDecisionId: "DEC-0225", idempotencyKey: values.idempotencyKey },
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "core_admin.approval_rule.successor_created",
        entityType: "ApprovalRule",
        entityId: source.id,
        beforeData: { lifecycleVersion: source.lifecycleVersion, successorRuleId: null },
        afterData: { lifecycleVersion: source.lifecycleVersion + 1, successorRuleId: successor.id },
        metadata: { approvalRuleId: source.id, successorRuleId: successor.id, lineageId: source.lineageId, reason: values.reason, sourceDecisionId: "DEC-0225", idempotencyKey: values.idempotencyKey },
      },
    });
    return { ruleId: successor.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if ("deniedError" in outcome) throw new Error(outcome.deniedError);
  return outcome.ruleId;
}

export async function activateCoreAdminApprovalRuleVersion(formData: FormData) {
  return changeApprovalRuleActiveState(formData, true);
}

export async function deactivateCoreAdminApprovalRuleVersion(formData: FormData) {
  return changeApprovalRuleActiveState(formData, false);
}

async function changeApprovalRuleActiveState(formData: FormData, activate: boolean) {
  const session = await requireSessionContext();
  await requireLifecycleReadAuthority(session);
  const values = lifecycleActionSchema.parse(Object.fromEntries(formData));
  const action = activate ? "ACTIVATE" : "DEACTIVATE";
  const hash = requestHash({ action, ...values });

  const outcome = await prisma.$transaction(async (tx) => {
    await lockCompany(tx, session);
    const deniedError = await revalidateMutationAuthority(tx, session, `approval_rule.${action.toLowerCase()}`, values.ruleId, values.reason);
    if (deniedError) return { deniedError };
    const prior = await findIdempotentResult(tx, session, { action, idempotencyKey: values.idempotencyKey, hash });
    if (prior) return { ruleId: prior };
    const rule = await tx.approvalRule.findFirst({
      where: { id: values.ruleId, tenantId: session.context.tenantId, companyId: session.context.companyId },
      include: { steps: { orderBy: { stepOrder: "asc" } } },
    });
    if (!rule) throw new Error("APPROVAL_RULE_NOT_FOUND");
    if (rule.lifecycleVersion !== values.expectedLifecycleVersion) throw new Error("APPROVAL_RULE_VERSION_CONFLICT");
    if (rule.steps.some((step) => step.approverType !== "ROLE" || !step.roleId || step.userId)) throw new Error("APPROVAL_RULE_LEGACY_USER_READ_ONLY");
    assertSupportedApprovalRuleRoute(rule.transactionType, rule.routeKey);
    if (activate) await validateRoleSteps(tx, session, rule.transactionType, rule.steps.map((step) => ({ stepOrder: step.stepOrder, roleId: step.roleId! })));
    if (rule.isActive === activate) throw new Error("APPROVAL_RULE_TRANSITION_NOT_ALLOWED");
    const currentActive = await tx.approvalRule.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        transactionType: rule.transactionType,
        routeKey: rule.routeKey,
        isActive: true,
        ...(activate ? { id: { not: rule.id } } : {}),
      },
      select: { id: true, lifecycleVersion: true, version: true },
    });
    const observedActiveId = currentActive?.id;
    if (activate && observedActiveId !== values.expectedActiveRuleId) throw new Error("APPROVAL_RULE_ACTIVE_VERSION_CONFLICT");
    if (!activate && values.expectedActiveRuleId && values.expectedActiveRuleId !== rule.id) throw new Error("APPROVAL_RULE_ACTIVE_VERSION_CONFLICT");

    if (activate && currentActive) {
      const replaced = await tx.approvalRule.updateMany({
        where: { id: currentActive.id, isActive: true, lifecycleVersion: currentActive.lifecycleVersion },
        data: { isActive: false, lifecycleVersion: { increment: 1 } },
      });
      if (replaced.count !== 1) throw new Error("APPROVAL_RULE_ACTIVE_VERSION_CONFLICT");
    }
    const changed = await tx.approvalRule.updateMany({
      where: { id: rule.id, isActive: !activate, lifecycleVersion: values.expectedLifecycleVersion },
      data: { isActive: activate, lifecycleVersion: { increment: 1 } },
    });
    if (changed.count !== 1) throw new Error("APPROVAL_RULE_VERSION_CONFLICT");
    await writeIntent(tx, session, { approvalRuleId: rule.id, action, idempotencyKey: values.idempotencyKey, hash });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: `core_admin.approval_rule.${activate ? "activated" : "deactivated"}`,
        entityType: "ApprovalRule",
        entityId: rule.id,
        beforeData: { isActive: rule.isActive, lifecycleVersion: rule.lifecycleVersion, activeRuleId: activate ? currentActive?.id ?? null : rule.id },
        afterData: { isActive: activate, lifecycleVersion: rule.lifecycleVersion + 1, activeRuleId: activate ? rule.id : null },
        metadata: { approvalRuleId: rule.id, replacedRuleId: activate ? currentActive?.id ?? null : null, lineageId: rule.lineageId, version: rule.version, reason: values.reason, sourceDecisionId: "DEC-0225", idempotencyKey: values.idempotencyKey },
      },
    });
    if (activate && currentActive) {
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "core_admin.approval_rule.replaced",
          entityType: "ApprovalRule",
          entityId: currentActive.id,
          beforeData: { isActive: true, lifecycleVersion: currentActive.lifecycleVersion },
          afterData: { isActive: false, lifecycleVersion: currentActive.lifecycleVersion + 1 },
          metadata: { approvalRuleId: currentActive.id, replacementRuleId: rule.id, reason: values.reason, sourceDecisionId: "DEC-0225", idempotencyKey: values.idempotencyKey },
        },
      });
    }
    return { ruleId: rule.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if ("deniedError" in outcome) throw new Error(outcome.deniedError);
  return outcome.ruleId;
}
