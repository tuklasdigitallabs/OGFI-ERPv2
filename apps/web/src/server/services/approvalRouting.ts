import { prisma, type Prisma, type TransactionClient } from "@ogfi/database";
import type { SessionContext } from "./context";
import type { ApprovalRoutingPolicy } from "./approvalRoutingRegistry";

export const APPROVAL_ROUTING_SCHEMA_VERSION = 1;
export const APPROVAL_ROUTING_MAX_PAGE_SIZE = 100;
export const APPROVAL_ROUTING_MAX_OFFSET = 100_000;

type ApprovalRoutingReadClient = Pick<TransactionClient, "$queryRaw">;

export type ApprovalStepActivationAuditInput = {
  actorUserId: string | null;
  source: string;
  requestId?: string | null;
  ipAddress?: string | null;
  metadata?: Prisma.InputJsonObject;
};

export type ApprovalRoutingScopeTargetInput = {
  scopeType: "COMPANY" | "BRAND" | "LOCATION";
  companyId: string;
  brandId?: string | null;
  locationId?: string | null;
};

export type ConfigureApprovalStepRoutingInput = {
  approvalInstanceStepId: string;
  tenantId: string;
  companyId: string;
  routingPolicy: ApprovalRoutingPolicy;
  requiredPermissionCode: string;
  activatedAt?: Date | null;
  dueAt?: Date | null;
  activationAudit?: ApprovalStepActivationAuditInput;
  scopeGroups: Array<{
    groupOrder: number;
    targetMatchMode: "ANY" | "ALL";
    targets: ApprovalRoutingScopeTargetInput[];
  }>;
  prohibitedActors: Array<{
    userId: string;
    reasonCode: string;
  }>;
};

export type EligibleApprovalStep = {
  approvalInstanceId: string;
  approvalInstanceStepId: string;
  documentType: string;
  documentId: string;
  stepOrder: number;
  assignedUserId: string | null;
  assignedRoleId: string | null;
  requiredPermissionCode: string;
  activatedAt: Date;
  dueAt: Date | null;
};

export type EligibleApprovalStepPage = {
  items: EligibleApprovalStep[];
  totalItems: number;
  page: number;
  pageSize: number;
};

export type ApprovalStepEligibilityIdentity = {
  tenantId: string;
  companyId: string;
  approvalInstanceStepId: string;
  actorUserId?: string;
  now?: Date;
};

export type NormalizedApprovalDecisionPreflightInput = {
  approvalInstanceId: string;
  currentStepId: string;
  currentStepOrder: number;
  includeNextStep: boolean;
};

export type LockedNormalizedApprovalStepRouting = {
  id: string;
  stepOrder: number;
  assignedUserId: string | null;
  assignedRoleId: string | null;
};

export type NormalizedApprovalDecisionPreflight = {
  nextStep: LockedNormalizedApprovalStepRouting | null;
  directRecipientUserId: string | null;
};

export type LockedNormalizedApprovalLifecycleStep =
  LockedNormalizedApprovalStepRouting & {
    status: string;
    actedAt: Date | null;
    activatedAt: Date | null;
    dueAt: Date | null;
  };

export type LockedNormalizedApprovalLifecycleGraph = {
  approvalInstanceId: string;
  currentStepOrder: number;
  steps: LockedNormalizedApprovalLifecycleStep[];
};

type ApprovalStepActivationInput = ApprovalStepEligibilityIdentity & {
  activatedAt?: Date;
  dueAt?: Date | null;
  activationAudit: ApprovalStepActivationAuditInput;
};

type EligibleApprovalStepRow = EligibleApprovalStep & {
  totalItems: bigint;
};

function assertRoutingWriteInput(input: ConfigureApprovalStepRoutingInput) {
  if (input.routingPolicy.requiredPermissionCode !== input.requiredPermissionCode) {
    throw new Error("APPROVAL_ROUTING_POLICY_PERMISSION_MISMATCH");
  }
  if (input.scopeGroups.length === 0 || input.scopeGroups.length > 50) {
    throw new Error("APPROVAL_ROUTING_SCOPE_GROUPS_INVALID");
  }
  if (input.prohibitedActors.length > 50) {
    throw new Error("APPROVAL_ROUTING_PROHIBITED_ACTORS_INVALID");
  }
  const groupOrders = new Set<number>();
  for (const group of input.scopeGroups) {
    if (
      !Number.isInteger(group.groupOrder) ||
      group.groupOrder < 1 ||
      groupOrders.has(group.groupOrder) ||
      group.targets.length === 0 ||
      group.targets.length > 50
    ) {
      throw new Error("APPROVAL_ROUTING_SCOPE_GROUP_INVALID");
    }
    groupOrders.add(group.groupOrder);
  }
  const prohibitedUsers = new Set<string>();
  for (const actor of input.prohibitedActors) {
    if (
      prohibitedUsers.has(actor.userId) ||
      !/^[A-Z][A-Z0-9_]{1,39}$/.test(actor.reasonCode)
    ) {
      throw new Error("APPROVAL_ROUTING_PROHIBITED_ACTOR_INVALID");
    }
    prohibitedUsers.add(actor.userId);
  }
  if (input.activationAudit && !input.activationAudit.source.trim()) {
    throw new Error("APPROVAL_STEP_ACTIVATION_AUDIT_SOURCE_REQUIRED");
  }
}

async function recordApprovalStepActivationAudit(
  tx: TransactionClient,
  input: {
    tenantId: string;
    companyId: string;
    approvalInstanceId: string;
    approvalInstanceStepId: string;
    stepOrder: number;
    activatedAt: Date;
    fromStatus: "CREATED" | "WAITING";
    audit: ApprovalStepActivationAuditInput;
  }
) {
  if (!input.audit.source.trim()) {
    throw new Error("APPROVAL_STEP_ACTIVATION_AUDIT_SOURCE_REQUIRED");
  }
  if (input.audit.actorUserId) {
    const actor = await tx.user.findFirst({
      where: { id: input.audit.actorUserId, tenantId: input.tenantId },
      select: { id: true }
    });
    if (!actor) throw new Error("APPROVAL_STEP_ACTIVATION_ACTOR_INVALID");
  }
  await tx.auditEvent.create({
    data: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      actorUserId: input.audit.actorUserId,
      eventType: "approval.step_activated",
      entityType: "ApprovalInstanceStep",
      entityId: input.approvalInstanceStepId,
      occurredAt: input.activatedAt,
      requestId: input.audit.requestId ?? null,
      ipAddress: input.audit.ipAddress ?? null,
      beforeData: { status: input.fromStatus, activatedAt: null },
      afterData: { status: "PENDING", activatedAt: input.activatedAt },
      metadata: {
        ...(input.audit.metadata ?? {}),
        source: input.audit.source,
        approvalInstanceId: input.approvalInstanceId,
        approvalInstanceStepId: input.approvalInstanceStepId,
        stepOrder: input.stepOrder,
        fromStatus: input.fromStatus,
        routingSchemaVersion: APPROVAL_ROUTING_SCHEMA_VERSION
      }
    }
  });
}

/**
 * Writes immutable routing context inside the caller's workflow transaction.
 * Callers must create the step at routingSchemaVersion=0, call this function,
 * prove at least one eligible actor, and only then commit source activation.
 */
export async function configureApprovalStepRouting(
  tx: TransactionClient,
  input: ConfigureApprovalStepRoutingInput
) {
  assertRoutingWriteInput(input);
  const step = await tx.approvalInstanceStep.findFirst({
    where: {
      id: input.approvalInstanceStepId,
      routingSchemaVersion: 0,
      approvalInstance: {
        tenantId: input.tenantId,
        companyId: input.companyId
      }
    },
    select: { id: true, approvalInstanceId: true, stepOrder: true, status: true }
  });
  if (!step) throw new Error("APPROVAL_ROUTING_STEP_NOT_CONFIGURABLE");

  const permission = await tx.permission.findFirst({
    where: {
      code: input.requiredPermissionCode,
      OR: [{ tenantId: null }, { tenantId: input.tenantId }]
    },
    select: { id: true }
  });
  if (!permission) throw new Error("APPROVAL_ROUTING_PERMISSION_NOT_FOUND");

  for (const group of [...input.scopeGroups].sort(
    (left, right) => left.groupOrder - right.groupOrder
  )) {
    await tx.approvalInstanceStepScopeGroup.create({
      data: {
        approvalInstanceStepId: step.id,
        groupOrder: group.groupOrder,
        targetMatchMode: group.targetMatchMode,
        targets: {
          create: group.targets.map((target) => ({
            scopeType: target.scopeType,
            companyId: target.companyId,
            brandId: target.brandId ?? null,
            locationId: target.locationId ?? null
          }))
        }
      }
    });
  }
  if (input.prohibitedActors.length > 0) {
    await tx.approvalInstanceStepProhibitedActor.createMany({
      data: input.prohibitedActors.map((actor) => ({
        approvalInstanceStepId: step.id,
        userId: actor.userId,
        reasonCode: actor.reasonCode
      }))
    });
  }

  const activatedAt =
    step.status === "PENDING" ? input.activatedAt ?? new Date() : null;
  if (activatedAt && !input.activationAudit) {
    throw new Error("APPROVAL_STEP_ACTIVATION_AUDIT_REQUIRED");
  }
  const updated = await tx.approvalInstanceStep.updateMany({
    where: { id: step.id, routingSchemaVersion: 0, status: step.status },
    data: {
      requiredPermissionId: permission.id,
      routingSchemaVersion: APPROVAL_ROUTING_SCHEMA_VERSION,
      scopeGroupMatchMode: "ALL",
      activatedAt,
      dueAt: input.dueAt ?? null
    }
  });
  if (updated.count !== 1) {
    throw new Error("APPROVAL_ROUTING_STEP_CONFIGURATION_RACE");
  }
  if (activatedAt && input.activationAudit) {
    await recordApprovalStepActivationAudit(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      approvalInstanceId: step.approvalInstanceId,
      approvalInstanceStepId: step.id,
      stepOrder: step.stepOrder,
      activatedAt,
      fromStatus: "CREATED",
      audit: input.activationAudit
    });
  }
  return { approvalInstanceStepId: step.id, routingSchemaVersion: 1 as const };
}

export async function findAnyEligibleApprovalActorForStep(
  tx: TransactionClient,
  input: ApprovalStepEligibilityIdentity
) {
  const now = input.now ?? new Date();
  const rows = await tx.$queryRaw<Array<{ userId: string }>>`
    SELECT actor.id AS "userId"
      FROM "ApprovalInstanceStep" step
      JOIN "ApprovalInstance" ai ON ai.id = step."approvalInstanceId"
      JOIN "Permission" permission ON permission.id = step."requiredPermissionId"
      JOIN "User" actor ON actor."tenantId" = ai."tenantId"
     WHERE step.id = ${input.approvalInstanceStepId}::uuid
       AND ai."tenantId" = ${input.tenantId}::uuid
       AND ai."companyId" = ${input.companyId}::uuid
       AND (${input.actorUserId ?? null}::uuid IS NULL OR actor.id = ${input.actorUserId ?? null}::uuid)
       AND ai.status = 'PENDING'::"ApprovalStatus"
       AND step.status IN ('WAITING'::"ApprovalStepStatus", 'PENDING'::"ApprovalStepStatus")
       AND step."routingSchemaVersion" = ${APPROVAL_ROUTING_SCHEMA_VERSION}
       AND step."scopeGroupMatchMode" = 'ALL'::"ApprovalScopeGroupMatchMode"
       AND actor.status = 'ACTIVE'::"RecordStatus"
       AND NOT EXISTS (
         SELECT 1 FROM "ApprovalInstanceStepProhibitedActor" prohibited
          WHERE prohibited."approvalInstanceStepId" = step.id
            AND prohibited."userId" = actor.id
       )
       AND (
         (step."assignedUserId" = actor.id AND step."assignedRoleId" IS NULL AND EXISTS (
           SELECT 1
             FROM "UserRoleAssignment" assignment
             JOIN "Role" role ON role.id = assignment."roleId"
             JOIN "RolePermission" grant_row ON grant_row."roleId" = role.id
            WHERE assignment."userId" = actor.id
              AND assignment.status = 'ACTIVE'::"RecordStatus"
              AND assignment."startsAt" <= ${now}
              AND (assignment."endsAt" IS NULL OR assignment."endsAt" > ${now})
              AND role.status = 'ACTIVE'::"RecordStatus"
              AND (role."tenantId" IS NULL OR role."tenantId" = ai."tenantId")
              AND grant_row."permissionId" = step."requiredPermissionId"
         ))
         OR
         (step."assignedUserId" IS NULL AND step."assignedRoleId" IS NOT NULL AND EXISTS (
           SELECT 1
             FROM "UserRoleAssignment" assignment
             JOIN "Role" role ON role.id = assignment."roleId"
             JOIN "RolePermission" grant_row ON grant_row."roleId" = role.id
            WHERE assignment."userId" = actor.id
              AND assignment."roleId" = step."assignedRoleId"
              AND assignment.status = 'ACTIVE'::"RecordStatus"
              AND assignment."startsAt" <= ${now}
              AND (assignment."endsAt" IS NULL OR assignment."endsAt" > ${now})
              AND role.status = 'ACTIVE'::"RecordStatus"
              AND (role."tenantId" IS NULL OR role."tenantId" = ai."tenantId")
              AND grant_row."permissionId" = step."requiredPermissionId"
         ))
       )
       AND EXISTS (
         SELECT 1 FROM "ApprovalInstanceStepScopeGroup" scope_group
          WHERE scope_group."approvalInstanceStepId" = step.id
       )
       AND NOT EXISTS (
         SELECT 1
           FROM "ApprovalInstanceStepScopeGroup" scope_group
          WHERE scope_group."approvalInstanceStepId" = step.id
            AND (
              NOT EXISTS (
                SELECT 1 FROM "ApprovalInstanceStepScopeTarget" target
                 WHERE target."scopeGroupId" = scope_group.id
              )
              OR EXISTS (
                SELECT 1 FROM "ApprovalInstanceStepScopeTarget" target
                 WHERE target."scopeGroupId" = scope_group.id
                   AND (
                     NOT EXISTS (SELECT 1 FROM "Company" company WHERE company.id = target."companyId" AND company.status = 'ACTIVE'::"RecordStatus")
                     OR (target."brandId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Brand" brand WHERE brand.id = target."brandId" AND brand.status = 'ACTIVE'::"RecordStatus"))
                     OR (target."locationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" location WHERE location.id = target."locationId" AND location.status = 'ACTIVE'::"RecordStatus"))
                   )
              )
              OR (scope_group."targetMatchMode" = 'ANY'::"ApprovalScopeTargetMatchMode" AND NOT EXISTS (
                SELECT 1 FROM "ApprovalInstanceStepScopeTarget" target
                 WHERE target."scopeGroupId" = scope_group.id
                   AND EXISTS (SELECT 1 FROM "Company" company WHERE company.id = target."companyId" AND company.status = 'ACTIVE'::"RecordStatus")
                   AND (target."brandId" IS NULL OR EXISTS (SELECT 1 FROM "Brand" brand WHERE brand.id = target."brandId" AND brand.status = 'ACTIVE'::"RecordStatus"))
                   AND (target."locationId" IS NULL OR EXISTS (SELECT 1 FROM "Location" location WHERE location.id = target."locationId" AND location.status = 'ACTIVE'::"RecordStatus"))
                   AND EXISTS (
                     SELECT 1 FROM "UserScopeAssignment" scope_assignment
                      WHERE scope_assignment."userId" = actor.id
                        AND scope_assignment.status = 'ACTIVE'::"RecordStatus"
                        AND scope_assignment."startsAt" <= ${now}
                        AND (scope_assignment."endsAt" IS NULL OR scope_assignment."endsAt" > ${now})
                        AND scope_assignment."accessLevel" IN ('APPROVE'::"AccessLevel", 'MANAGE'::"AccessLevel")
                        AND (
                          (scope_assignment."scopeType" = 'COMPANY'::"ScopeType" AND scope_assignment."scopeId" = target."companyId")
                          OR (target."brandId" IS NOT NULL AND scope_assignment."scopeType" = 'BRAND'::"ScopeType" AND scope_assignment."scopeId" = target."brandId")
                          OR (target."locationId" IS NOT NULL AND scope_assignment."scopeType" = 'LOCATION'::"ScopeType" AND scope_assignment."scopeId" = target."locationId")
                        )
                   )
              ))
              OR (scope_group."targetMatchMode" = 'ALL'::"ApprovalScopeTargetMatchMode" AND EXISTS (
                SELECT 1 FROM "ApprovalInstanceStepScopeTarget" target
                 WHERE target."scopeGroupId" = scope_group.id
                   AND EXISTS (SELECT 1 FROM "Company" company WHERE company.id = target."companyId" AND company.status = 'ACTIVE'::"RecordStatus")
                   AND (target."brandId" IS NULL OR EXISTS (SELECT 1 FROM "Brand" brand WHERE brand.id = target."brandId" AND brand.status = 'ACTIVE'::"RecordStatus"))
                   AND (target."locationId" IS NULL OR EXISTS (SELECT 1 FROM "Location" location WHERE location.id = target."locationId" AND location.status = 'ACTIVE'::"RecordStatus"))
                   AND NOT EXISTS (
                     SELECT 1 FROM "UserScopeAssignment" scope_assignment
                      WHERE scope_assignment."userId" = actor.id
                        AND scope_assignment.status = 'ACTIVE'::"RecordStatus"
                        AND scope_assignment."startsAt" <= ${now}
                        AND (scope_assignment."endsAt" IS NULL OR scope_assignment."endsAt" > ${now})
                        AND scope_assignment."accessLevel" IN ('APPROVE'::"AccessLevel", 'MANAGE'::"AccessLevel")
                        AND (
                          (scope_assignment."scopeType" = 'COMPANY'::"ScopeType" AND scope_assignment."scopeId" = target."companyId")
                          OR (target."brandId" IS NOT NULL AND scope_assignment."scopeType" = 'BRAND'::"ScopeType" AND scope_assignment."scopeId" = target."brandId")
                          OR (target."locationId" IS NOT NULL AND scope_assignment."scopeType" = 'LOCATION'::"ScopeType" AND scope_assignment."scopeId" = target."locationId")
                        )
                   )
              ))
            )
       )
     ORDER BY actor.id
     LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function assertAnyEligibleApprovalActorForStep(
  tx: TransactionClient,
  input: ApprovalStepEligibilityIdentity
) {
  const actor = await findAnyEligibleApprovalActorForStep(tx, input);
  if (!actor) throw new Error("APPROVAL_STEP_ELIGIBLE_ACTOR_NOT_AVAILABLE");
  return actor;
}

export async function activateApprovalStepWithEligibility(
  tx: TransactionClient,
  input: ApprovalStepActivationInput
) {
  const activatedAt = input.activatedAt ?? input.now ?? new Date();
  await assertAnyEligibleApprovalActorForStep(tx, { ...input, now: activatedAt });
  const activated = await tx.approvalInstanceStep.updateMany({
    where: {
      id: input.approvalInstanceStepId,
      routingSchemaVersion: APPROVAL_ROUTING_SCHEMA_VERSION,
      status: "WAITING",
      approvalInstance: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        status: "PENDING"
      }
    },
    data: {
      status: "PENDING",
      activatedAt,
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {})
    }
  });
  if (activated.count !== 1) throw new Error("APPROVAL_STEP_ACTIVATION_RACE");
  await assertAnyEligibleApprovalActorForStep(tx, { ...input, now: activatedAt });
  const step = await tx.approvalInstanceStep.findFirst({
    where: {
      id: input.approvalInstanceStepId,
      approvalInstance: {
        tenantId: input.tenantId,
        companyId: input.companyId
      }
    },
    select: { approvalInstanceId: true, stepOrder: true }
  });
  if (!step) throw new Error("APPROVAL_STEP_ACTIVATION_RACE");
  await recordApprovalStepActivationAudit(tx, {
    tenantId: input.tenantId,
    companyId: input.companyId,
    approvalInstanceId: step.approvalInstanceId,
    approvalInstanceStepId: input.approvalInstanceStepId,
    stepOrder: step.stepOrder,
    activatedAt,
    fromStatus: "WAITING",
    audit: input.activationAudit
  });
  return { approvalInstanceStepId: input.approvalInstanceStepId, activatedAt };
}

export function normalizeApprovalRoutingPage(input: {
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(
    APPROVAL_ROUTING_MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input.pageSize ?? 10))
  );
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset > APPROVAL_ROUTING_MAX_OFFSET) {
    throw new Error("APPROVAL_ROUTING_PAGE_OUT_OF_RANGE");
  }
  return { page, pageSize, offset };
}

export async function listEligibleApprovalStepPage(
  session: SessionContext,
  input: {
    page?: number;
    pageSize?: number;
    approvalInstanceStepId?: string;
    view?: "ASSIGNED" | "DUE_SOON";
    dueBefore?: Date;
    now?: Date;
  } = {},
  client: ApprovalRoutingReadClient = prisma
): Promise<EligibleApprovalStepPage> {
  const { page, pageSize, offset } = normalizeApprovalRoutingPage(input);
  const now = input.now ?? new Date();
  const stepId = input.approvalInstanceStepId ?? null;
  const view = input.view ?? "ASSIGNED";
  if (view === "DUE_SOON" && !input.dueBefore) {
    throw new Error("APPROVAL_ROUTING_DUE_BEFORE_REQUIRED");
  }
  const dueBefore = input.dueBefore ?? now;
  const isDueSoon = view === "DUE_SOON";
  const rows = await client.$queryRaw<EligibleApprovalStepRow[]>`
    WITH eligible AS MATERIALIZED (
      SELECT ai.id AS "approvalInstanceId",
             step.id AS "approvalInstanceStepId",
             ai."documentType",
             ai."documentId",
             step."stepOrder",
             step."assignedUserId",
             step."assignedRoleId",
             permission.code AS "requiredPermissionCode",
             step."activatedAt",
             step."dueAt"
        FROM "ApprovalInstanceStep" step
        JOIN "ApprovalInstance" ai ON ai.id = step."approvalInstanceId"
        JOIN "Permission" permission ON permission.id = step."requiredPermissionId"
        JOIN "User" actor ON actor.id = ${session.user.id}::uuid
       WHERE ai."tenantId" = ${session.context.tenantId}::uuid
         AND ai."companyId" = ${session.context.companyId}::uuid
         AND ai.status = 'PENDING'::"ApprovalStatus"
         AND step.status = 'PENDING'::"ApprovalStepStatus"
         AND step."stepOrder" = ai."currentStepOrder"
         AND step."routingSchemaVersion" = ${APPROVAL_ROUTING_SCHEMA_VERSION}
         AND step."scopeGroupMatchMode" = 'ALL'::"ApprovalScopeGroupMatchMode"
         AND step."activatedAt" IS NOT NULL
         AND (${isDueSoon} = false OR (step."dueAt" IS NOT NULL AND step."dueAt" <= ${dueBefore}))
         AND (${stepId}::uuid IS NULL OR step.id = ${stepId}::uuid)
         AND actor."tenantId" = ai."tenantId"
         AND actor.status = 'ACTIVE'::"RecordStatus"
         AND NOT EXISTS (
           SELECT 1 FROM "ApprovalInstanceStepProhibitedActor" prohibited
            WHERE prohibited."approvalInstanceStepId" = step.id
              AND prohibited."userId" = actor.id
         )
         AND (
           (step."assignedUserId" = actor.id AND step."assignedRoleId" IS NULL AND EXISTS (
             SELECT 1
               FROM "UserRoleAssignment" assignment
               JOIN "Role" role ON role.id = assignment."roleId"
               JOIN "RolePermission" grant_row ON grant_row."roleId" = role.id
              WHERE assignment."userId" = actor.id
                AND assignment.status = 'ACTIVE'::"RecordStatus"
                AND assignment."startsAt" <= ${now}
                AND (assignment."endsAt" IS NULL OR assignment."endsAt" > ${now})
                AND role.status = 'ACTIVE'::"RecordStatus"
                AND (role."tenantId" IS NULL OR role."tenantId" = ai."tenantId")
                AND grant_row."permissionId" = step."requiredPermissionId"
           ))
           OR
           (step."assignedUserId" IS NULL AND step."assignedRoleId" IS NOT NULL AND EXISTS (
             SELECT 1
               FROM "UserRoleAssignment" assignment
               JOIN "Role" role ON role.id = assignment."roleId"
               JOIN "RolePermission" grant_row ON grant_row."roleId" = role.id
              WHERE assignment."userId" = actor.id
                AND assignment."roleId" = step."assignedRoleId"
                AND assignment.status = 'ACTIVE'::"RecordStatus"
                AND assignment."startsAt" <= ${now}
                AND (assignment."endsAt" IS NULL OR assignment."endsAt" > ${now})
                AND role.status = 'ACTIVE'::"RecordStatus"
                AND (role."tenantId" IS NULL OR role."tenantId" = ai."tenantId")
                AND grant_row."permissionId" = step."requiredPermissionId"
           ))
         )
         AND EXISTS (
           SELECT 1 FROM "ApprovalInstanceStepScopeGroup" scope_group
            WHERE scope_group."approvalInstanceStepId" = step.id
         )
         AND NOT EXISTS (
           SELECT 1
             FROM "ApprovalInstanceStepScopeGroup" scope_group
            WHERE scope_group."approvalInstanceStepId" = step.id
              AND (
                NOT EXISTS (
                  SELECT 1 FROM "ApprovalInstanceStepScopeTarget" target
                   WHERE target."scopeGroupId" = scope_group.id
                )
                OR EXISTS (
                  SELECT 1 FROM "ApprovalInstanceStepScopeTarget" target
                   WHERE target."scopeGroupId" = scope_group.id
                     AND (
                       NOT EXISTS (SELECT 1 FROM "Company" company WHERE company.id = target."companyId" AND company.status = 'ACTIVE'::"RecordStatus")
                       OR (target."brandId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Brand" brand WHERE brand.id = target."brandId" AND brand.status = 'ACTIVE'::"RecordStatus"))
                       OR (target."locationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Location" location WHERE location.id = target."locationId" AND location.status = 'ACTIVE'::"RecordStatus"))
                     )
                )
                OR (scope_group."targetMatchMode" = 'ANY'::"ApprovalScopeTargetMatchMode" AND NOT EXISTS (
                  SELECT 1
                    FROM "ApprovalInstanceStepScopeTarget" target
                   WHERE target."scopeGroupId" = scope_group.id
                     AND EXISTS (SELECT 1 FROM "Company" company WHERE company.id = target."companyId" AND company.status = 'ACTIVE'::"RecordStatus")
                     AND (target."brandId" IS NULL OR EXISTS (SELECT 1 FROM "Brand" brand WHERE brand.id = target."brandId" AND brand.status = 'ACTIVE'::"RecordStatus"))
                     AND (target."locationId" IS NULL OR EXISTS (SELECT 1 FROM "Location" location WHERE location.id = target."locationId" AND location.status = 'ACTIVE'::"RecordStatus"))
                     AND EXISTS (
                       SELECT 1 FROM "UserScopeAssignment" scope_assignment
                        WHERE scope_assignment."userId" = actor.id
                          AND scope_assignment.status = 'ACTIVE'::"RecordStatus"
                          AND scope_assignment."startsAt" <= ${now}
                          AND (scope_assignment."endsAt" IS NULL OR scope_assignment."endsAt" > ${now})
                          AND scope_assignment."accessLevel" IN ('APPROVE'::"AccessLevel", 'MANAGE'::"AccessLevel")
                          AND (
                            (scope_assignment."scopeType" = 'COMPANY'::"ScopeType" AND scope_assignment."scopeId" = target."companyId")
                            OR (target."brandId" IS NOT NULL AND scope_assignment."scopeType" = 'BRAND'::"ScopeType" AND scope_assignment."scopeId" = target."brandId")
                            OR (target."locationId" IS NOT NULL AND scope_assignment."scopeType" = 'LOCATION'::"ScopeType" AND scope_assignment."scopeId" = target."locationId")
                          )
                     )
                ))
                OR (scope_group."targetMatchMode" = 'ALL'::"ApprovalScopeTargetMatchMode" AND EXISTS (
                  SELECT 1
                    FROM "ApprovalInstanceStepScopeTarget" target
                   WHERE target."scopeGroupId" = scope_group.id
                     AND EXISTS (SELECT 1 FROM "Company" company WHERE company.id = target."companyId" AND company.status = 'ACTIVE'::"RecordStatus")
                     AND (target."brandId" IS NULL OR EXISTS (SELECT 1 FROM "Brand" brand WHERE brand.id = target."brandId" AND brand.status = 'ACTIVE'::"RecordStatus"))
                     AND (target."locationId" IS NULL OR EXISTS (SELECT 1 FROM "Location" location WHERE location.id = target."locationId" AND location.status = 'ACTIVE'::"RecordStatus"))
                     AND NOT EXISTS (
                       SELECT 1 FROM "UserScopeAssignment" scope_assignment
                        WHERE scope_assignment."userId" = actor.id
                          AND scope_assignment.status = 'ACTIVE'::"RecordStatus"
                          AND scope_assignment."startsAt" <= ${now}
                          AND (scope_assignment."endsAt" IS NULL OR scope_assignment."endsAt" > ${now})
                          AND scope_assignment."accessLevel" IN ('APPROVE'::"AccessLevel", 'MANAGE'::"AccessLevel")
                          AND (
                            (scope_assignment."scopeType" = 'COMPANY'::"ScopeType" AND scope_assignment."scopeId" = target."companyId")
                            OR (target."brandId" IS NOT NULL AND scope_assignment."scopeType" = 'BRAND'::"ScopeType" AND scope_assignment."scopeId" = target."brandId")
                            OR (target."locationId" IS NOT NULL AND scope_assignment."scopeType" = 'LOCATION'::"ScopeType" AND scope_assignment."scopeId" = target."locationId")
                          )
                     )
                ))
              )
         )
    ), total AS (
      SELECT count(*)::bigint AS "totalItems" FROM eligible
    ), page_rows AS (
      SELECT * FROM eligible
       ORDER BY "activatedAt" DESC, "approvalInstanceId" DESC, "approvalInstanceStepId" DESC
       LIMIT ${pageSize} OFFSET ${offset}
    )
    SELECT total."totalItems", page_rows.*
      FROM total
      LEFT JOIN page_rows ON true
     ORDER BY page_rows."activatedAt" DESC NULLS LAST,
              page_rows."approvalInstanceId" DESC NULLS LAST,
              page_rows."approvalInstanceStepId" DESC NULLS LAST
  `;
  const totalItems = Number(rows[0]?.totalItems ?? 0n);
  const items = rows
    .filter((row) => row.approvalInstanceStepId !== null)
    .map(({ totalItems: _totalItems, ...row }) => row);
  return { items, totalItems, page, pageSize };
}

export async function assertEligibleApprovalStep(
  session: SessionContext,
  approvalInstanceStepId: string,
  client: ApprovalRoutingReadClient = prisma,
  now = new Date()
) {
  const page = await listEligibleApprovalStepPage(session, {
    page: 1,
    pageSize: 1,
    approvalInstanceStepId,
    now
  }, client);
  if (page.totalItems !== 1 || page.items.length !== 1) {
    throw new Error("APPROVAL_AUTHORITY_STALE");
  }
  return page.items[0];
}

type LockedApprovalDecisionActor = {
  id: string;
  status: string;
  privilegeEpoch: number;
};

type LockedApprovalDecisionSession = {
  status: string;
  privilegeEpochAtIssue: number;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
};

function sameLockedApprovalRouting(
  left: LockedNormalizedApprovalStepRouting | null,
  right: LockedNormalizedApprovalStepRouting | null
) {
  return (
    left?.id === right?.id &&
    left?.stepOrder === right?.stepOrder &&
    left?.assignedUserId === right?.assignedUserId &&
    left?.assignedRoleId === right?.assignedRoleId
  );
}

async function readNormalizedApprovalDecisionRouting(
  tx: TransactionClient,
  session: SessionContext,
  input: NormalizedApprovalDecisionPreflightInput
) {
  const currentStep = await tx.approvalInstanceStep.findFirst({
    where: {
      id: input.currentStepId,
      approvalInstanceId: input.approvalInstanceId,
      stepOrder: input.currentStepOrder,
      status: "PENDING",
      approvalInstance: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      }
    },
    select: {
      id: true,
      stepOrder: true,
      assignedUserId: true,
      assignedRoleId: true
    }
  });
  if (!currentStep) throw new Error("APPROVAL_NOT_ACTIONABLE");

  const nextStep = input.includeNextStep
    ? await tx.approvalInstanceStep.findFirst({
        where: {
          approvalInstanceId: input.approvalInstanceId,
          stepOrder: { gt: input.currentStepOrder },
          status: "WAITING",
          approvalInstance: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId
          }
        },
        orderBy: { stepOrder: "asc" },
        select: {
          id: true,
          stepOrder: true,
          assignedUserId: true,
          assignedRoleId: true
        }
      })
    : null;
  return { currentStep, nextStep };
}

/**
 * Locks the live workflow principals before a normalized lifecycle operation
 * acquires approval or source rows. Entitlement mutation paths fence their
 * changes through the affected User privilege epoch, so this shared User lock
 * keeps the later in-transaction permission and scope revalidation stable.
 */
export async function lockNormalizedApprovalLifecycleActors(
  tx: TransactionClient,
  session: SessionContext,
  input: { additionalActorUserIds?: string[]; now?: Date } = {}
) {
  const now = input.now ?? new Date();
  const actorIds = [
    session.user.id,
    ...(input.additionalActorUserIds ?? [])
  ]
    .filter((id, index, values) => values.indexOf(id) === index)
    .sort();
  const lockedActors = new Map<string, LockedApprovalDecisionActor>();
  for (const userId of actorIds) {
    const rows = await tx.$queryRaw<LockedApprovalDecisionActor[]>`
      SELECT id, status, "privilegeEpoch"
        FROM "User"
       WHERE id = ${userId}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
       FOR SHARE
    `;
    const actor = rows[0];
    if (rows.length !== 1 || !actor || actor.status !== "ACTIVE") {
      throw new Error("APPROVAL_AUTHORITY_STALE");
    }
    lockedActors.set(userId, actor);
  }

  if (session.authentication?.sessionId) {
    const rows = await tx.$queryRaw<LockedApprovalDecisionSession[]>`
      SELECT status, "privilegeEpochAtIssue", "idleExpiresAt", "absoluteExpiresAt"
        FROM "AuthSession"
       WHERE id = ${session.authentication.sessionId}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "userId" = ${session.user.id}::uuid
       FOR SHARE
    `;
    const liveSession = rows[0];
    const actingUser = lockedActors.get(session.user.id);
    if (
      !liveSession ||
      !actingUser ||
      liveSession.status !== "ACTIVE" ||
      liveSession.privilegeEpochAtIssue !== actingUser.privilegeEpoch ||
      liveSession.idleExpiresAt <= now ||
      liveSession.absoluteExpiresAt <= now
    ) {
      throw new Error("APPROVAL_AUTHORITY_STALE");
    }
  }

  return { now, actorIds };
}

/** Locks one complete normalized approval graph in deterministic row order. */
export async function lockNormalizedApprovalLifecycleGraph(
  tx: TransactionClient,
  input: {
    tenantId: string;
    companyId: string;
    approvalInstanceId: string;
    documentType: string;
    documentId: string;
  }
): Promise<LockedNormalizedApprovalLifecycleGraph> {
  const instances = await tx.$queryRaw<Array<{
    id: string;
    currentStepOrder: number | null;
  }>>`
    SELECT ai.id, ai."currentStepOrder"
      FROM "ApprovalInstance" ai
     WHERE ai.id = ${input.approvalInstanceId}::uuid
       AND ai."tenantId" = ${input.tenantId}::uuid
       AND ai."companyId" = ${input.companyId}::uuid
       AND ai."documentType" = ${input.documentType}
       AND ai."documentId" = ${input.documentId}::uuid
       AND ai.status = 'PENDING'::"ApprovalStatus"
     FOR UPDATE OF ai
  `;
  const instance = instances[0];
  if (!instance || instance.currentStepOrder === null) {
    throw new Error("APPROVAL_NOT_ACTIONABLE");
  }

  const steps = await tx.$queryRaw<LockedNormalizedApprovalLifecycleStep[]>`
    SELECT step.id,
           step."stepOrder",
           step."assignedUserId",
           step."assignedRoleId",
           step.status::text AS status,
           step."actedAt",
           step."activatedAt",
           step."dueAt"
      FROM "ApprovalInstanceStep" step
     WHERE step."approvalInstanceId" = ${instance.id}::uuid
     ORDER BY step."stepOrder" ASC, step.id ASC
     FOR UPDATE OF step
  `;
  if (steps.length === 0) throw new Error("APPROVAL_NOT_ACTIONABLE");
  return {
    approvalInstanceId: instance.id,
    currentStepOrder: instance.currentStepOrder,
    steps
  };
}

async function lockNormalizedApprovalDecisionAuthority(
  tx: TransactionClient,
  session: SessionContext,
  input: NormalizedApprovalDecisionPreflightInput
) {
  const lockedInstances = await tx.$queryRaw<
    Array<{
      approvalStatus: string;
      currentStepOrder: number | null;
    }>
  >`
    SELECT ai.status AS "approvalStatus",
           ai."currentStepOrder"
      FROM "ApprovalInstance" ai
     WHERE ai.id = ${input.approvalInstanceId}::uuid
       AND ai."tenantId" = ${session.context.tenantId}::uuid
       AND ai."companyId" = ${session.context.companyId}::uuid
     FOR UPDATE OF ai
  `;
  const lockedInstance = lockedInstances[0];
  if (
    !lockedInstance ||
    lockedInstance.approvalStatus !== "PENDING" ||
    lockedInstance.currentStepOrder !== input.currentStepOrder
  ) {
    throw new Error("APPROVAL_NOT_ACTIONABLE");
  }

  const lockedSteps = await tx.$queryRaw<
    Array<{
      id: string;
      stepOrder: number;
      assignedUserId: string | null;
      assignedRoleId: string | null;
    }>
  >`
    SELECT step.id,
           step."stepOrder",
           step."assignedUserId",
           step."assignedRoleId"
      FROM "ApprovalInstanceStep" step
     WHERE step.id = ${input.currentStepId}::uuid
       AND step."approvalInstanceId" = ${input.approvalInstanceId}::uuid
       AND step."stepOrder" = ${input.currentStepOrder}
       AND step.status = 'PENDING'::"ApprovalStepStatus"
     FOR UPDATE OF step
  `;
  const currentStep = lockedSteps[0];
  if (!currentStep) throw new Error("APPROVAL_NOT_ACTIONABLE");

  const nextRows = input.includeNextStep
    ? await tx.$queryRaw<LockedNormalizedApprovalStepRouting[]>`
        SELECT step.id,
               step."stepOrder",
               step."assignedUserId",
               step."assignedRoleId"
          FROM "ApprovalInstanceStep" step
         WHERE step."approvalInstanceId" = ${input.approvalInstanceId}::uuid
           AND step."stepOrder" > ${input.currentStepOrder}
           AND step.status = 'WAITING'::"ApprovalStepStatus"
         ORDER BY step."stepOrder" ASC
         LIMIT 1
         FOR UPDATE OF step
      `
    : [];

  return {
    currentStep: {
      id: currentStep.id,
      stepOrder: currentStep.stepOrder,
      assignedUserId: currentStep.assignedUserId,
      assignedRoleId: currentStep.assignedRoleId
    },
    nextStep: nextRows[0] ?? null
  };
}

/**
 * Canonical normalized-routing authority preflight. It completes every read,
 * actor/session lock, workflow lock, structural check, and live eligibility
 * revalidation while the approval is still in its steady pre-decision state.
 */
export async function prepareNormalizedApprovalDecisionPreflight(
  tx: TransactionClient,
  session: SessionContext,
  input: NormalizedApprovalDecisionPreflightInput
): Promise<NormalizedApprovalDecisionPreflight> {
  const preliminary = await readNormalizedApprovalDecisionRouting(
    tx,
    session,
    input
  );
  const preliminaryAnchor = preliminary.nextStep
    ? await findAnyEligibleApprovalActorForStep(tx, {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        approvalInstanceStepId: preliminary.nextStep.id
      })
    : null;
  if (preliminary.nextStep && !preliminaryAnchor) {
    throw new Error("APPROVAL_NEXT_STEP_RECIPIENT_NOT_AVAILABLE");
  }

  const lockedActors = new Map<string, LockedApprovalDecisionActor>();
  const actorIds = [session.user.id, preliminaryAnchor?.userId]
    .filter((id): id is string => Boolean(id))
    .filter((id, index, values) => values.indexOf(id) === index)
    .sort();
  for (const userId of actorIds) {
    const rows = await tx.$queryRaw<LockedApprovalDecisionActor[]>`
      SELECT id, status, "privilegeEpoch"
        FROM "User"
       WHERE id = ${userId}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
       FOR SHARE
    `;
    const lockedActor = rows[0];
    if (rows.length !== 1 || !lockedActor) {
      throw new Error("APPROVAL_AUTHORITY_STALE");
    }
    lockedActors.set(userId, lockedActor);
  }

  let lockedSession: LockedApprovalDecisionSession | undefined;
  if (session.authentication?.sessionId) {
    const rows = await tx.$queryRaw<LockedApprovalDecisionSession[]>`
      SELECT status, "privilegeEpochAtIssue", "idleExpiresAt", "absoluteExpiresAt"
        FROM "AuthSession"
       WHERE id = ${session.authentication.sessionId}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "userId" = ${session.user.id}::uuid
       FOR SHARE
    `;
    lockedSession = rows[0];
  }

  const lockedRouting = await lockNormalizedApprovalDecisionAuthority(
    tx,
    session,
    input
  );
  if (
    !sameLockedApprovalRouting(preliminary.currentStep, lockedRouting.currentStep) ||
    !sameLockedApprovalRouting(preliminary.nextStep, lockedRouting.nextStep)
  ) {
    throw new Error("APPROVAL_NEXT_STEP_ROUTING_CHANGED");
  }

  await assertApprovalRoutingRuntimeReady(
    session.context.tenantId,
    session.context.companyId,
    tx
  );

  const now = new Date();
  const actingUser = lockedActors.get(session.user.id);
  if (!actingUser || actingUser.status !== "ACTIVE") {
    throw new Error("APPROVAL_AUTHORITY_STALE");
  }
  if (
    session.authentication?.sessionId &&
    (!lockedSession ||
      lockedSession.status !== "ACTIVE" ||
      lockedSession.privilegeEpochAtIssue !== actingUser.privilegeEpoch ||
      lockedSession.idleExpiresAt <= now ||
      lockedSession.absoluteExpiresAt <= now)
  ) {
    throw new Error("APPROVAL_AUTHORITY_STALE");
  }
  await assertEligibleApprovalStep(session, input.currentStepId, tx, now);

  if (lockedRouting.nextStep) {
    const anchorUserId = preliminaryAnchor?.userId;
    if (!anchorUserId || !lockedActors.has(anchorUserId)) {
      throw new Error("APPROVAL_NEXT_STEP_RECIPIENT_NOT_AVAILABLE");
    }
    const revalidatedAnchor = await findAnyEligibleApprovalActorForStep(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      approvalInstanceStepId: lockedRouting.nextStep.id,
      actorUserId: anchorUserId,
      now
    });
    if (!revalidatedAnchor) {
      throw new Error("APPROVAL_NEXT_STEP_RECIPIENT_NOT_AVAILABLE");
    }
  }

  return {
    nextStep: lockedRouting.nextStep,
    directRecipientUserId: lockedRouting.nextStep?.assignedUserId ?? null
  };
}

export async function assertApprovalRoutingRuntimeReady(
  tenantId: string,
  companyId: string,
  client: ApprovalRoutingReadClient
) {
  const gaps = await client.$queryRaw<Array<{ count: bigint }>>`
    WITH active_instance AS (
      SELECT ai.*,
             (
               ai."documentType" = 'BudgetRevision'
               AND EXISTS (
                 SELECT 1
                   FROM "BudgetRevision" revision
                  WHERE revision.id = ai."documentId"
                    AND revision."tenantId" = ai."tenantId"
                    AND revision."companyId" = ai."companyId"
                    AND revision.status = 'SUBMITTED'::"BudgetRevisionStatus"
               )
             ) AS "isBudgetRevisionPreReview"
        FROM "ApprovalInstance" ai
       WHERE ai."tenantId" = ${tenantId}::uuid
         AND ai."companyId" = ${companyId}::uuid
         AND ai.status = 'PENDING'::"ApprovalStatus"
    )
    SELECT count(*)::bigint AS count
      FROM active_instance ai
     WHERE (
         ai."currentStepOrder" IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM "ApprovalInstanceStep" step
            WHERE step."approvalInstanceId" = ai.id
         )
         OR EXISTS (
           SELECT 1
             FROM "ApprovalInstanceStep" step
            WHERE step."approvalInstanceId" = ai.id
              AND (
                step."stepOrder" < 1
                OR num_nonnulls(step."assignedUserId", step."assignedRoleId") <> 1
                OR step."delegatedFromUserId" IS NOT NULL
                OR step."routingSchemaVersion" <> ${APPROVAL_ROUTING_SCHEMA_VERSION}
                OR step."requiredPermissionId" IS NULL
                OR step."scopeGroupMatchMode" IS DISTINCT FROM 'ALL'::"ApprovalScopeGroupMatchMode"
                OR NOT EXISTS (
                  SELECT 1
                    FROM "ApprovalInstanceStepScopeGroup" scope_group
                   WHERE scope_group."approvalInstanceStepId" = step.id
                )
                OR EXISTS (
                  SELECT 1
                    FROM "ApprovalInstanceStepScopeGroup" scope_group
                   WHERE scope_group."approvalInstanceStepId" = step.id
                     AND NOT EXISTS (
                       SELECT 1
                         FROM "ApprovalInstanceStepScopeTarget" target
                        WHERE target."scopeGroupId" = scope_group.id
                     )
                )
              )
         )
         OR (
           ai."isBudgetRevisionPreReview"
           AND (
             EXISTS (
               SELECT 1
                 FROM "ApprovalInstanceStep" step
                WHERE step."approvalInstanceId" = ai.id
                  AND (
                    step.status <> 'WAITING'::"ApprovalStepStatus"
                    OR step."actedAt" IS NOT NULL
                    OR step."activatedAt" IS NOT NULL
                    OR step."dueAt" IS NOT NULL
                  )
             )
             OR NOT EXISTS (
               SELECT 1
                 FROM "ApprovalInstanceStep" step
                WHERE step."approvalInstanceId" = ai.id
                  AND step."stepOrder" = ai."currentStepOrder"
             )
             OR ai."currentStepOrder" <> (
               SELECT min(step."stepOrder")
                 FROM "ApprovalInstanceStep" step
                WHERE step."approvalInstanceId" = ai.id
             )
             OR EXISTS (
               SELECT 1
                 FROM "AuditEvent" audit
                WHERE audit."tenantId" = ai."tenantId"
                  AND audit."entityType" = 'ApprovalInstanceStep'
                  AND audit."eventType" = 'approval.step_activated'
                  AND audit."entityId" IN (
                    SELECT step.id
                      FROM "ApprovalInstanceStep" step
                     WHERE step."approvalInstanceId" = ai.id
                  )
             )
           )
         )
         OR (
           NOT ai."isBudgetRevisionPreReview"
           AND (
             (
               SELECT count(*)
                 FROM "ApprovalInstanceStep" step
                WHERE step."approvalInstanceId" = ai.id
                  AND step.status = 'PENDING'::"ApprovalStepStatus"
             ) <> 1
             OR NOT EXISTS (
               SELECT 1
                 FROM "ApprovalInstanceStep" step
                WHERE step."approvalInstanceId" = ai.id
                  AND step."stepOrder" = ai."currentStepOrder"
                  AND step.status = 'PENDING'::"ApprovalStepStatus"
             )
             OR EXISTS (
               SELECT 1
                 FROM "ApprovalInstanceStep" step
                WHERE step."approvalInstanceId" = ai.id
                  AND (
                    (
                      step."stepOrder" < ai."currentStepOrder"
                      AND step.status NOT IN (
                        'APPROVED'::"ApprovalStepStatus",
                        'SKIPPED'::"ApprovalStepStatus"
                      )
                    )
                    OR (
                      step."stepOrder" = ai."currentStepOrder"
                      AND step.status <> 'PENDING'::"ApprovalStepStatus"
                    )
                    OR (
                      step."stepOrder" > ai."currentStepOrder"
                      AND step.status <> 'WAITING'::"ApprovalStepStatus"
                    )
                    OR (
                      step.status = 'PENDING'::"ApprovalStepStatus"
                      AND step."activatedAt" IS NULL
                    )
                    OR (
                      step.status = 'WAITING'::"ApprovalStepStatus"
                      AND step."activatedAt" IS NOT NULL
                    )
                  )
             )
             OR (
               ai."documentType" = 'BudgetRevision'
               AND EXISTS (
                 SELECT 1
                   FROM "BudgetRevision" revision
                   JOIN "ApprovalInstanceStep" step
                     ON step."approvalInstanceId" = ai.id
                    AND step."stepOrder" = ai."currentStepOrder"
                  WHERE revision.id = ai."documentId"
                    AND revision."tenantId" = ai."tenantId"
                    AND revision."companyId" = ai."companyId"
                    AND revision.status = 'UNDER_REVIEW'::"BudgetRevisionStatus"
                    AND step."dueAt" IS DISTINCT FROM revision."effectiveFrom"
               )
             )
           )
         )
       )
  `;
  if (Number(gaps[0]?.count ?? 0n) !== 0) {
    throw new Error("APPROVAL_ROUTING_BACKFILL_REQUIRED");
  }
}

/**
 * Exhaustive operator-only cutover certification. Runtime request paths must
 * use assertApprovalRoutingRuntimeReady with their own Prisma client so they
 * never open the backfill coordinator from inside a workflow transaction.
 */
export async function assertApprovalRoutingCutoverReady(
  tenantId: string,
  companyId: string
) {
  await assertApprovalRoutingRuntimeReady(tenantId, companyId, prisma);
  const { inspectApprovalRoutingReadiness } = await import(
    "./approvalRoutingBackfill"
  );
  const readiness = await inspectApprovalRoutingReadiness({
    tenantId,
    companyId,
  });
  if (!readiness.ready) {
    throw new Error("APPROVAL_ROUTING_BACKFILL_REQUIRED");
  }
}

export function normalizedApprovalRoutingEnabled() {
  return process.env.APPROVAL_ROUTING_V1_ENABLED === "true";
}
