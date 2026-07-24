import { Prisma, prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import {
  getGrantedPermissionCodes,
  permissions,
  requirePermission,
} from "./authorization";
import { recordAuthSessionInvalidation } from "./authInvalidation";
import { requireSessionContext, type SessionContext } from "./context";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";
import {
  getPermissionPresentation,
  getRecommendedPermissionCodesForRole,
  getRecommendedRoleLabel,
  isSensitivePermissionCode,
} from "./rolePermissionCatalog";

type AuditEventWhereInput = NonNullable<
  NonNullable<Parameters<typeof prisma.auditEvent.findMany>[0]>["where"]
>;

const scopeReasonSchema = z.string().min(5).max(500);
const accessLevelSchema = z.enum(["VIEW", "OPERATE", "APPROVE", "MANAGE"]);
const assignableNonSensitiveRoleCodes = new Set(["CONFIGURED_REQUESTER"]);
const highRiskLocationTypes = new Set([
  "WAREHOUSE",
  "COMMISSARY",
  "CENTRAL_KITCHEN",
  "HEAD_OFFICE",
  "PROJECT_SITE",
  "TEMPORARY_SITE",
]);

const createLocationScopeSchema = z.object({
  targetUserId: z.string().uuid(),
  locationId: z.string().uuid(),
  accessLevel: accessLevelSchema,
  reason: scopeReasonSchema,
});

const requestHighRiskLocationScopeSchema = z.object({
  targetUserId: z.string().uuid(),
  locationId: z.string().uuid(),
  accessLevel: accessLevelSchema,
  reason: scopeReasonSchema,
  evidenceReference: z.string().trim().min(2).max(240),
});

const requestSensitiveRoleSchema = z.object({
  targetUserId: z.string().uuid(),
  roleId: z.string().uuid(),
  reason: scopeReasonSchema,
  evidenceReference: z.string().trim().min(2).max(240),
});

const reviewHighRiskLocationScopeSchema = z.object({
  requestId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  reviewReason: scopeReasonSchema,
});

const reviewSensitiveRoleSchema = z.object({
  requestId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  reviewReason: scopeReasonSchema,
});

const deactivateScopeSchema = z.object({
  targetUserId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  reason: scopeReasonSchema,
});

const createRoleAssignmentSchema = z.object({
  targetUserId: z.string().uuid(),
  roleId: z.string().uuid(),
  reason: scopeReasonSchema,
});

const deactivateRoleAssignmentSchema = z.object({
  targetUserId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  reason: scopeReasonSchema,
});

const optionalUuidSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().uuid().optional(),
);
const optionalTextSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).max(255).optional(),
);

const createCoreAdminUserSchema = z.object({
  email: z.string().trim().email().max(255),
  displayName: z.string().trim().min(2).max(255),
  initialRoleId: optionalUuidSchema,
  initialLocationId: optionalUuidSchema,
  accessLevel: accessLevelSchema.default("VIEW"),
  reason: scopeReasonSchema,
});

const createCoreAdminRoleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(80),
  reason: scopeReasonSchema,
});

const createCoreAdminCompanySchema = z.object({
  code: z.string().trim().min(2).max(50),
  legalName: z.string().trim().min(2).max(255),
  tradingName: optionalTextSchema,
  taxIdentifier: optionalTextSchema,
  currencyCode: z.string().trim().length(3),
  timezone: z.string().trim().min(3).max(80).default("Asia/Manila"),
  reason: scopeReasonSchema,
});

const createCoreAdminBrandSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(255),
  reason: scopeReasonSchema,
});

const createCoreAdminDepartmentSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(255),
  reason: scopeReasonSchema,
});

const createCoreAdminLocationSchema = z.object({
  companyId: z.string().uuid(),
  brandId: optionalUuidSchema,
  locationType: z.enum([
    "BRANCH",
    "WAREHOUSE",
    "COMMISSARY",
    "CENTRAL_KITCHEN",
    "HEAD_OFFICE",
    "PROJECT_SITE",
    "TEMPORARY_SITE",
  ]),
  code: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(255),
  address: optionalTextSchema,
  timezone: z.string().trim().min(3).max(80).default("Asia/Manila"),
  reason: scopeReasonSchema,
});

const coreAdminUserPageInputSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  query: z.string().trim().max(120).default(""),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

const coreAdminRolePageInputSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  query: z.string().trim().max(120).default(""),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

const updateRolePermissionsSchema = z.object({
  roleId: z.string().uuid(),
  reason: scopeReasonSchema,
});

function normalizeBusinessCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9._-]/g, "");
}

function canonicalizePrivilegeMutationUserIds(userIds: string[]) {
  return Array.from(new Set(userIds)).sort();
}

function isRolePermissionTransactionConflict(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    meta?: { code?: unknown } | null;
  };
  return (
    candidate.code === "P2034" ||
    candidate.code === "40P01" ||
    candidate.code === "40001" ||
    candidate.meta?.code === "40P01" ||
    candidate.meta?.code === "40001"
  );
}

async function lockUsersForPrivilegeMutation(
  tx: TransactionClient,
  tenantId: string,
  userIds: string[],
) {
  const canonicalUserIds = canonicalizePrivilegeMutationUserIds(userIds);
  const lockedUserById = new Map<
    string,
    { id: string; status: string; privilegeEpoch: number }
  >();
  for (const userId of canonicalUserIds) {
    const lockedUsers = await tx.$queryRaw<
      Array<{ id: string; status: string; privilegeEpoch: number }>
    >`
      SELECT "id", status, "privilegeEpoch"
        FROM "User"
       WHERE "id" = ${userId}::uuid
         AND "tenantId" = ${tenantId}::uuid
       FOR UPDATE
    `;
    if (lockedUsers.length !== 1) {
      throw new Error("ROLE_PERMISSION_CONCURRENT_CHANGE");
    }
    lockedUserById.set(userId, lockedUsers[0]!);
  }
  return { canonicalUserIds, lockedUserById };
}

type LockedRolePermissionSession = {
  status: string;
  assuranceLevel: string;
  mfaAuthenticatedAt: Date | null;
  privilegeEpochAtIssue: number;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
};

async function lockAndRevalidateRolePermissionActor(
  tx: TransactionClient,
  session: SessionContext,
  input: {
    actor: { id: string; status: string; privilegeEpoch: number } | undefined;
    roleId: string;
    roleCode: string;
    sensitiveChanges: string[];
    addedCodes: string[];
    removedCodes: string[];
  },
) {
  if (!input.actor || input.actor.status !== "ACTIVE") {
    throw new Error("ROLE_PERMISSION_AUTHORITY_STALE");
  }

  let liveSession: LockedRolePermissionSession | undefined;
  if (session.authentication?.sessionId) {
    const sessions = await tx.$queryRaw<LockedRolePermissionSession[]>`
      SELECT status, "assuranceLevel", "mfaAuthenticatedAt",
             "privilegeEpochAtIssue", "idleExpiresAt", "absoluteExpiresAt"
        FROM "AuthSession"
       WHERE "id" = ${session.authentication.sessionId}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "userId" = ${session.user.id}::uuid
       FOR SHARE
    `;
    liveSession = sessions[0];
    const now = new Date();
    if (
      !liveSession ||
      liveSession.status !== "ACTIVE" ||
      liveSession.privilegeEpochAtIssue !== input.actor.privilegeEpoch ||
      liveSession.idleExpiresAt <= now ||
      liveSession.absoluteExpiresAt <= now
    ) {
      throw new Error("ROLE_PERMISSION_AUTHORITY_STALE");
    }
  }

  const now = new Date();
  const liveRoleAssignments = await tx.userRoleAssignment.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      role: {
        status: "ACTIVE",
        OR: [
          { tenantId: session.context.tenantId },
          { tenantId: null },
        ],
      },
    },
    select: {
      role: {
        select: {
          permissions: {
            where: {
              permission: {
                code: {
                  in: [
                    permissions.coreAdminister,
                    permissions.tenantRoleAdminister,
                  ],
                },
                OR: [
                  { tenantId: session.context.tenantId },
                  { tenantId: null },
                ],
              },
            },
            select: { permission: { select: { code: true } } },
          },
        },
      },
    },
  });
  const livePermissionCodes = new Set(
    liveRoleAssignments.flatMap((assignment) =>
      assignment.role.permissions.map(
        (rolePermission) => rolePermission.permission.code,
      ),
    ),
  );
  if (
    !livePermissionCodes.has(permissions.coreAdminister) ||
    !livePermissionCodes.has(permissions.tenantRoleAdminister)
  ) {
    throw new Error("PERMISSION_DENIED");
  }

  const companyManageScope = await tx.userScopeAssignment.findFirst({
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
  if (!companyManageScope) {
    throw new Error("ADMIN_SCOPE_DENIED");
  }

  if (input.sensitiveChanges.length > 0) {
    // Lock the external-provider evidence and enforcement setting read by the
    // shared guard so neither can change between revalidation and mutation.
    await tx.$queryRaw`
      SELECT "id"
        FROM "PrivilegedMfaEnrollment"
       WHERE "tenantId" = ${session.context.tenantId}::uuid
         AND "companyId" = ${session.context.companyId}::uuid
         AND "targetUserId" = ${session.user.id}::uuid
         AND status = 'VERIFIED'
       FOR SHARE
    `;
    await tx.$queryRaw`
      SELECT "id"
        FROM "CompanyPolicySetting"
       WHERE "companyId" = ${session.context.companyId}::uuid
         AND key = 'security.privileged_mfa.enforcement_mode'
       FOR SHARE
    `;
    const mfaDecision = await assertPrivilegedMfaForAction(
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
        action: "role_permissions.update_sensitive",
        permissionCode: permissions.tenantRoleAdminister,
        entityType: "Role",
        entityId: input.roleId,
        reason:
          "Sensitive role-permission changes require verified privileged MFA evidence.",
        metadata: {
          roleCode: input.roleCode,
          addedCodes: input.addedCodes,
          removedCodes: input.removedCodes,
          sensitiveChanges: input.sensitiveChanges,
        },
      },
      { transaction: tx, deferDenialThrow: true },
    );
    return mfaDecision.deniedError;
  }
  return null;
}

export function assertNotSelfScopeMutation(
  actorUserId: string,
  targetUserId: string,
) {
  if (actorUserId === targetUserId) {
    throw new Error("SELF_SCOPE_MUTATION_BLOCKED");
  }
}

export function assertNoActiveDuplicateScope(existingAssignmentId?: string) {
  if (existingAssignmentId) {
    throw new Error("DUPLICATE_ACTIVE_SCOPE_ASSIGNMENT");
  }
}

export function getLocationScopeRiskLabel(location: { locationType: string }) {
  if (highRiskLocationTypes.has(location.locationType)) {
    return "High-risk location requires controlled approval";
  }
  return "Standard branch scope";
}

export function isDirectlyAssignableLocationScope(input: {
  locationType: string;
  accessLevel: z.infer<typeof accessLevelSchema>;
}) {
  return (
    input.accessLevel !== "MANAGE" &&
    !highRiskLocationTypes.has(input.locationType)
  );
}

export function assertDirectLocationScopeAssignmentAllowed(input: {
  locationType: string;
  accessLevel: z.infer<typeof accessLevelSchema>;
}) {
  if (!isDirectlyAssignableLocationScope(input)) {
    throw new Error("HIGH_RISK_SCOPE_ASSIGNMENT_BLOCKED");
  }
}

export function assertRequiresControlledLocationScopeRequest(input: {
  locationType: string;
  accessLevel: z.infer<typeof accessLevelSchema>;
}) {
  if (isDirectlyAssignableLocationScope(input)) {
    throw new Error("LOW_RISK_SCOPE_USE_QUICK_ASSIGNMENT");
  }
}

export function assertNotSelfRoleMutation(
  actorUserId: string,
  targetUserId: string,
) {
  if (actorUserId === targetUserId) {
    throw new Error("SELF_ROLE_MUTATION_BLOCKED");
  }
}

export function assertNoActiveDuplicateRole(existingAssignmentId?: string) {
  if (existingAssignmentId) {
    throw new Error("DUPLICATE_ACTIVE_ROLE_ASSIGNMENT");
  }
}

export function isAssignableNonSensitiveRole(roleCode: string) {
  return assignableNonSensitiveRoleCodes.has(roleCode);
}

export function assertAssignableNonSensitiveRole(roleCode: string) {
  if (!isAssignableNonSensitiveRole(roleCode)) {
    throw new Error("SENSITIVE_ROLE_ASSIGNMENT_BLOCKED");
  }
}

export function isDirectlyAssignableRole(role: {
  code: string;
  systemRole: boolean;
  permissions: Array<{ permission: { code: string } }>;
}) {
  if (
    role.permissions.some((rolePermission) =>
      isSensitivePermissionCode(rolePermission.permission.code),
    )
  ) {
    return false;
  }
  return isAssignableNonSensitiveRole(role.code) || !role.systemRole;
}

export function assertDirectRoleAssignmentAllowed(role: {
  code: string;
  systemRole: boolean;
  permissions: Array<{ permission: { code: string } }>;
}) {
  if (!isDirectlyAssignableRole(role)) {
    throw new Error("SENSITIVE_ROLE_ASSIGNMENT_BLOCKED");
  }
}

function roleAssignmentRiskLabel(role: {
  code: string;
  systemRole: boolean;
  permissions: Array<{ permission: { code: string } }>;
}) {
  if (isDirectlyAssignableRole(role)) {
    return "Available for quick setup";
  }
  if (role.systemRole) {
    return "Admin-controlled role";
  }
  return "Sensitive permissions require admin reason";
}

function sensitiveRoleRiskLabel(role: {
  code: string;
  systemRole: boolean;
  permissions: Array<{ permission: { code: string } }>;
}) {
  if (role.systemRole) {
    return "System/admin role requires controlled approval";
  }
  if (!isDirectlyAssignableRole(role)) {
    return "Sensitive permissions require controlled approval";
  }
  return "Use quick role assignment";
}

export async function touchUserPrivilegeEpoch(
  tx: TransactionClient,
  userId: string,
  input: {
    companyId?: string | null;
    requestedByUserId?: string | null;
    reason?: string;
    sourceEventType?: string;
    sourceRecordId?: string | null;
  } = {},
) {
  await tx.user.update({
    where: { id: userId },
    data: {
      updatedAt: new Date(),
      privilegeEpoch: { increment: 1 },
    },
  });
  await recordAuthSessionInvalidation(tx, {
    targetUserId: userId,
    companyId: input.companyId ?? null,
    requestedByUserId: input.requestedByUserId ?? null,
    reason:
      input.reason ??
      "Privilege epoch changed; invalidate active sessions for sensitive access.",
    sourceEventType: input.sourceEventType ?? "privilege_epoch.changed",
    sourceRecordId: input.sourceRecordId ?? null,
  });
}

export function assertRolePermissionChangesExist(
  addedCodes: string[],
  removedCodes: string[],
) {
  if (addedCodes.length === 0 && removedCodes.length === 0) {
    throw new Error("NO_ROLE_PERMISSION_CHANGES");
  }
}

export function assertAdminRoleRetainsCoreAdminPermission(
  roleCode: string,
  nextPermissionCodes: string[],
) {
  if (
    roleCode === "CONFIGURED_ADMIN" &&
    !nextPermissionCodes.includes(permissions.coreAdminister)
  ) {
    throw new Error("ADMIN_ROLE_CORE_PERMISSION_REQUIRED");
  }
}

export async function assertCanManageCompanyScope(
  session: SessionContext,
  companyId: string,
) {
  await requirePermission(session, permissions.coreAdminister);
  const now = new Date();

  const assignment = await prisma.userScopeAssignment.findFirst({
    where: {
      userId: session.user.id,
      scopeType: "COMPANY",
      scopeId: companyId,
      accessLevel: "MANAGE",
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
  });

  if (!assignment) {
    throw new Error("ADMIN_SCOPE_DENIED");
  }
}

async function assertCanAdministerTenantRoles(session: SessionContext) {
  await requirePermission(session, permissions.tenantRoleAdminister);
}

async function assertTargetUserInCurrentCompany(
  session: SessionContext,
  targetUserId: string,
) {
  const now = new Date();
  const locations = await prisma.location.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const assignment = await prisma.userScopeAssignment.findFirst({
    where: {
      userId: targetUserId,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      AND: [
        {
          OR: [
            { scopeType: "COMPANY", scopeId: session.context.companyId },
            {
              scopeType: "LOCATION",
              scopeId: { in: locations.map((location) => location.id) },
            },
          ],
        },
      ],
      user: { tenantId: session.context.tenantId, status: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!assignment) {
    throw new Error("TARGET_USER_NOT_FOUND");
  }
}

async function assertRoleNotUsedInActiveApprovalRules(
  roleId: string,
  tenantId: string,
) {
  const ruleStep = await prisma.approvalRuleStep.findFirst({
    where: {
      roleId,
      approvalRule: {
        tenantId,
        isActive: true,
      },
    },
    select: { id: true },
  });

  if (ruleStep) {
    throw new Error("APPROVAL_ROLE_MUTATION_BLOCKED");
  }
}

export type CoreAdminUserPage = {
  items: Array<{
    id: string;
    displayName: string;
    email: string;
    status: string;
    roles: string[];
    scopes: Array<{ type: string; id: string; accessLevel: string }>;
  }>;
  page: number;
  pageSize: number;
  totalItems: number;
  activeItems: number;
};

async function listCoreAdminUserPageAuthorized(
  session: SessionContext,
  input: z.input<typeof coreAdminUserPageInputSchema> = {},
): Promise<CoreAdminUserPage> {
  const values = coreAdminUserPageInputSchema.parse(input);
  const query = values.query.toLowerCase();
  const where: Prisma.UserWhereInput = {
    tenantId: session.context.tenantId,
    ...(values.status
      ? { status: values.status as NonNullable<Prisma.UserWhereInput["status"]> }
      : {}),
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" as const } },
            { displayName: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [totalItems, activeItems, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { ...where, status: "ACTIVE" as NonNullable<Prisma.UserWhereInput["status"]> } }),
    prisma.user.findMany({
      where,
      include: {
        roleAssignments: {
          where: { status: "ACTIVE" },
          include: { role: true },
        },
        scopeAssignments: {
          where: { status: "ACTIVE" },
          orderBy: { startsAt: "asc" },
        },
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      skip: (values.page - 1) * values.pageSize,
      take: values.pageSize,
    }),
  ]);
  return {
    items: users.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      roles: user.roleAssignments.map((assignment) => assignment.role.name),
      scopes: user.scopeAssignments.map((assignment) => ({
        type: assignment.scopeType,
        id: assignment.scopeId,
        accessLevel: assignment.accessLevel,
      })),
    })),
    page: values.page,
    pageSize: values.pageSize,
    totalItems,
    activeItems,
  };
}

const coreAdminHighAccessPermissionCodes = [
  permissions.coreAdminister,
  permissions.purchaseRequestApprove,
  permissions.purchaseOrderApprove,
  permissions.receivingPost,
  permissions.receivingReverse,
  permissions.stockAdjustmentPost,
  permissions.stockAdjustmentReverse,
  permissions.wastagePost,
  permissions.wastageReverse,
];

export type CoreAdminRolePage = {
  items: Array<{
    id: string;
    name: string;
    code: string;
    systemRole: boolean;
    status: string;
    canAssignDirectly: boolean;
    assignmentEligibility: string;
    permissionCount: number;
    permissionPreview: Array<{ id: string; code: string; label: string }>;
  }>;
  page: number;
  pageSize: number;
  totalItems: number;
  activeItems: number;
  highAccessItems: number;
};

async function listCoreAdminRolePageAuthorized(
  session: SessionContext,
  input: z.input<typeof coreAdminRolePageInputSchema> = {},
): Promise<CoreAdminRolePage> {
  const values = coreAdminRolePageInputSchema.parse(input);
  const query = values.query.toLowerCase();
  const where: Prisma.RoleWhereInput = {
    tenantId: session.context.tenantId,
    ...(values.status
      ? { status: values.status as NonNullable<Prisma.RoleWhereInput["status"]> }
      : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { code: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const highAccessPredicate: Prisma.RoleWhereInput = {
    permissions: {
      some: {
        permission: { code: { in: coreAdminHighAccessPermissionCodes } },
      },
    },
  };
  const [totalItems, activeItems, highAccessItems, roles] = await Promise.all([
    prisma.role.count({ where }),
    prisma.role.count({ where: { ...where, status: "ACTIVE" } }),
    prisma.role.count({ where: { ...where, ...highAccessPredicate } }),
    prisma.role.findMany({
      where,
      include: {
        permissions: {
          take: 3,
          orderBy: { permission: { code: "asc" } },
          include: { permission: true },
        },
        _count: { select: { permissions: true } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (values.page - 1) * values.pageSize,
      take: values.pageSize,
    }),
  ]);
  return {
    items: roles.map((role) => ({
      id: role.id,
      name: role.name,
      code: role.code,
      systemRole: role.systemRole,
      status: role.status,
      canAssignDirectly: isDirectlyAssignableRole(role),
      assignmentEligibility: roleAssignmentRiskLabel(role),
      permissionCount: role._count.permissions,
      permissionPreview: role.permissions.map((rolePermission) => ({
        id: rolePermission.permission.id,
        code: rolePermission.permission.code,
        label: getPermissionPresentation(rolePermission.permission.code).label,
      })),
    })),
    page: values.page,
    pageSize: values.pageSize,
    totalItems,
    activeItems,
    highAccessItems,
  };
}

async function listCoreAdminRoleOptionsAuthorized(session: SessionContext) {
  const [activeItems, options] = await Promise.all([
    prisma.role.count({
      where: { tenantId: session.context.tenantId, status: "ACTIVE" },
    }),
    prisma.role.findMany({
      where: { tenantId: session.context.tenantId, status: "ACTIVE" },
      select: { id: true, name: true, code: true, systemRole: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 100,
    }),
  ]);
  return {
    items: options,
    totalItems: activeItems,
    hasMore: activeItems > options.length,
  };
}

export async function listCoreAdminRolePage(
  session: SessionContext,
  input: z.input<typeof coreAdminRolePageInputSchema> = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  return listCoreAdminRolePageAuthorized(session, input);
}

export async function listCoreAdminUserPage(
  session: SessionContext,
  input: z.input<typeof coreAdminUserPageInputSchema> = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  return listCoreAdminUserPageAuthorized(session, input);
}

export async function getCoreAdminOverview(
  session: SessionContext,
  userPageInput: z.input<typeof coreAdminUserPageInputSchema> = {},
  rolePageInput: z.input<typeof coreAdminRolePageInputSchema> = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);

  const [userPage, rolePage, roleOptions] = await Promise.all([
    listCoreAdminUserPageAuthorized(session, userPageInput),
    listCoreAdminRolePageAuthorized(session, rolePageInput),
    listCoreAdminRoleOptionsAuthorized(session),
  ]);

  const [
    tenant,
    companies,
    brands,
    departments,
    locations,
    approvalRules,
    recentAuditEvents,
  ] = await Promise.all([
    prisma.tenant.findFirst({
      where: { id: session.context.tenantId },
      select: {
        name: true,
        defaultTimezone: true,
        status: true,
      },
    }),
    prisma.company.findMany({
      where: {
        tenantId: session.context.tenantId,
        id: session.context.companyId,
      },
      orderBy: { legalName: "asc" },
    }),
    prisma.brand.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
      },
      include: {
        company: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
      },
      include: {
        company: true,
        _count: {
          select: {
            budgets: true,
            budgetLines: true,
            costCenters: true,
            employeeAssignments: true,
          },
        },
      },
      orderBy: [{ company: { legalName: "asc" } }, { name: "asc" }],
    }),
    prisma.location.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
      },
      include: {
        company: true,
        brand: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.approvalRule.findMany({
      where: {
        tenantId: session.context.tenantId,
        OR: [{ companyId: session.context.companyId }, { companyId: null }],
      },
      include: {
        company: true,
        steps: {
          orderBy: { stepOrder: "asc" },
        },
      },
      orderBy: [{ isActive: "desc" }, { priority: "asc" }],
    }),
    prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        OR: [{ companyId: session.context.companyId }, { companyId: null }],
      },
      include: {
        actor: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 48,
    }),
  ]);

  return {
    tenant,
    users: userPage.items,
    userPage,
    roles: rolePage.items.map((role) => ({
      ...role,
      permissions: role.permissionPreview,
    })),
    rolePage,
    roleOptions,
    companies: companies.map((company) => ({
      id: company.id,
      code: company.code,
      name: company.tradingName ?? company.legalName,
      legalName: company.legalName,
      currencyCode: company.currencyCode,
      timezone: company.timezone,
      status: company.status,
    })),
    brands: brands.map((brand) => ({
      id: brand.id,
      companyId: brand.companyId,
      companyName: brand.company.tradingName ?? brand.company.legalName,
      name: brand.name,
      code: brand.code,
      status: brand.status,
    })),
    departments: departments.map((department) => ({
      id: department.id,
      companyId: department.companyId,
      companyName:
        department.company.tradingName ?? department.company.legalName,
      name: department.name,
      code: department.code,
      status: department.status,
      budgetCount: department._count.budgets,
      budgetLineCount: department._count.budgetLines,
      costCenterCount: department._count.costCenters,
      employeeAssignmentCount: department._count.employeeAssignments,
    })),
    locations: locations.map((location) => ({
      id: location.id,
      companyName: location.company.tradingName ?? location.company.legalName,
      brandName: location.brand?.name ?? "Company-wide",
      code: location.code,
      name: location.name,
      type: location.locationType,
      timezone: location.timezone,
      status: location.status,
    })),
    approvalRules: approvalRules.map((rule) => ({
      id: rule.id,
      transactionType: rule.transactionType,
      companyName:
        rule.company?.tradingName ?? rule.company?.legalName ?? "Tenant-wide",
      priority: rule.priority,
      isActive: rule.isActive,
      stepCount: rule.steps.length,
      stepSummary: rule.steps
        .map((step) => `Step ${step.stepOrder}: ${step.approverType}`)
        .join(", "),
    })),
    recentAuditEvents: recentAuditEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorName: event.actor?.displayName ?? "System",
      occurredAt: event.occurredAt.toISOString(),
    })),
  };
}

export async function createCoreAdminUser(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.coreAdminister);
  const values = createCoreAdminUserSchema.parse(Object.fromEntries(formData));
  if (values.initialRoleId) {
    await assertCanAdministerTenantRoles(session);
    if (!values.initialLocationId) {
      throw new Error("CORE_ADMIN_USER_INITIAL_LOCATION_REQUIRED");
    }
  }
  const email = values.email.toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: {
      tenantId_email: {
        tenantId: session.context.tenantId,
        email,
      },
    },
    select: { id: true },
  });
  if (existingUser) {
    throw new Error("CORE_ADMIN_USER_DUPLICATE");
  }

  const [initialRole, initialLocation] = await Promise.all([
    values.initialRoleId
      ? prisma.role.findFirst({
          where: {
            id: values.initialRoleId,
            tenantId: session.context.tenantId,
            status: "ACTIVE",
          },
          include: {
            permissions: { include: { permission: true } },
          },
        })
      : Promise.resolve(null),
    values.initialLocationId
      ? prisma.location.findFirst({
          where: {
            id: values.initialLocationId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE",
          },
        })
      : Promise.resolve(null),
  ]);

  if (values.initialRoleId && !initialRole) {
    throw new Error("TARGET_ROLE_NOT_FOUND");
  }
  if (initialRole) {
    assertDirectRoleAssignmentAllowed(initialRole);
  }
  if (values.initialLocationId && !initialLocation) {
    throw new Error("TARGET_LOCATION_NOT_FOUND");
  }
  if (initialLocation) {
    assertDirectLocationScopeAssignmentAllowed({
      locationType: initialLocation.locationType,
      accessLevel: values.accessLevel,
    });
    await assertCanManageCompanyScope(session, initialLocation.companyId);
  } else {
    await assertCanManageCompanyScope(session, session.context.companyId);
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: session.context.tenantId,
        email,
        displayName: values.displayName,
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "core_admin.user.created",
        entityType: "User",
        entityId: user.id,
        afterData: {
          email: user.email,
          displayName: user.displayName,
          status: user.status,
        },
        metadata: { reason: values.reason },
      },
    });

    if (initialRole) {
      const roleAssignment = await tx.userRoleAssignment.create({
        data: {
          userId: user.id,
          roleId: initialRole.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "user_role_assignment.created",
          entityType: "UserRoleAssignment",
          entityId: roleAssignment.id,
          afterData: {
            userId: user.id,
            roleId: initialRole.id,
            roleCode: initialRole.code,
            status: "ACTIVE",
          },
          metadata: {
            reason: values.reason,
            targetUserEmail: user.email,
            roleName: initialRole.name,
            roleCode: initialRole.code,
            permissionCodes: initialRole.permissions.map(
              (rolePermission) => rolePermission.permission.code,
            ),
            createdWithUser: true,
          },
        },
      });
    }

    if (initialLocation) {
      const scopeAssignment = await tx.userScopeAssignment.create({
        data: {
          userId: user.id,
          scopeType: "LOCATION",
          scopeId: initialLocation.id,
          accessLevel: values.accessLevel,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: initialLocation.companyId,
          actorUserId: session.user.id,
          eventType: "user_scope_assignment.created",
          entityType: "UserScopeAssignment",
          entityId: scopeAssignment.id,
          afterData: {
            userId: user.id,
            scopeType: "LOCATION",
            scopeId: initialLocation.id,
            accessLevel: values.accessLevel,
            status: "ACTIVE",
          },
          metadata: {
            reason: values.reason,
            targetUserEmail: user.email,
            locationCode: initialLocation.code,
            createdWithUser: true,
          },
        },
      });
    }

    if (initialRole || initialLocation) {
      await touchUserPrivilegeEpoch(tx, user.id);
    }
  });
}

export async function createCoreAdminRole(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  const values = createCoreAdminRoleSchema.parse(Object.fromEntries(formData));
  const code = normalizeBusinessCode(values.code);
  if (!code) {
    throw new Error("CORE_ADMIN_ROLE_CODE_INVALID");
  }

  const existingRole = await prisma.role.findUnique({
    where: {
      tenantId_code: {
        tenantId: session.context.tenantId,
        code,
      },
    },
    select: { id: true },
  });
  if (existingRole) {
    throw new Error("CORE_ADMIN_ROLE_DUPLICATE");
  }

  const role = await prisma.role.create({
    data: {
      tenantId: session.context.tenantId,
      code,
      name: values.name,
      systemRole: false,
    },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      actorUserId: session.user.id,
      eventType: "core_admin.role.created",
      entityType: "Role",
      entityId: role.id,
      afterData: {
        code: role.code,
        name: role.name,
        systemRole: role.systemRole,
        status: role.status,
      },
      metadata: { reason: values.reason },
    },
  });
}

export async function createCoreAdminCompany(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  const values = createCoreAdminCompanySchema.parse(
    Object.fromEntries(formData),
  );
  const code = normalizeBusinessCode(values.code);
  const currencyCode = values.currencyCode.toUpperCase();
  if (!code) {
    throw new Error("CORE_ADMIN_COMPANY_CODE_INVALID");
  }

  const existingCompany = await prisma.company.findUnique({
    where: {
      tenantId_code: {
        tenantId: session.context.tenantId,
        code,
      },
    },
    select: { id: true },
  });
  if (existingCompany) {
    throw new Error("CORE_ADMIN_COMPANY_DUPLICATE");
  }

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        tenantId: session.context.tenantId,
        code,
        legalName: values.legalName,
        tradingName: values.tradingName ?? null,
        taxIdentifier: values.taxIdentifier ?? null,
        currencyCode,
        timezone: values.timezone,
      },
    });

    const scopeAssignment = await tx.userScopeAssignment.create({
      data: {
        userId: session.user.id,
        scopeType: "COMPANY",
        scopeId: company.id,
        accessLevel: "MANAGE",
      },
    });

    await touchUserPrivilegeEpoch(tx, session.user.id, {
      companyId: company.id,
      requestedByUserId: session.user.id,
      reason: "Company management scope created; invalidate active sessions.",
      sourceEventType: "user_scope_assignment.created",
      sourceRecordId: scopeAssignment.id,
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: company.id,
        actorUserId: session.user.id,
        eventType: "core_admin.company.created",
        entityType: "Company",
        entityId: company.id,
        afterData: {
          legalName: company.legalName,
          code: company.code,
          tradingName: company.tradingName,
          currencyCode: company.currencyCode,
          timezone: company.timezone,
          status: company.status,
        },
        metadata: {
          reason: values.reason,
          actorManageScopeAssignmentId: scopeAssignment.id,
        },
      },
    });
  });
}

export async function createCoreAdminBrand(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.coreAdminister);
  const values = createCoreAdminBrandSchema.parse(Object.fromEntries(formData));
  const code = normalizeBusinessCode(values.code);
  if (!code) {
    throw new Error("CORE_ADMIN_BRAND_CODE_INVALID");
  }

  const [company, existingBrand] = await Promise.all([
    prisma.company.findFirst({
      where: {
        id: values.companyId,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
    }),
    prisma.brand.findUnique({
      where: {
        companyId_code: {
          companyId: values.companyId,
          code,
        },
      },
      select: { id: true },
    }),
  ]);

  if (!company) {
    throw new Error("COMPANY_NOT_FOUND");
  }
  if (existingBrand) {
    throw new Error("CORE_ADMIN_BRAND_DUPLICATE");
  }

  await assertCanManageCompanyScope(session, company.id);

  const brand = await prisma.brand.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: company.id,
      code,
      name: values.name,
    },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: company.id,
      actorUserId: session.user.id,
      eventType: "core_admin.brand.created",
      entityType: "Brand",
      entityId: brand.id,
      afterData: {
        companyId: company.id,
        code: brand.code,
        name: brand.name,
        status: brand.status,
      },
      metadata: {
        reason: values.reason,
        companyName: company.tradingName ?? company.legalName,
      },
    },
  });
}

export async function createCoreAdminDepartment(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.coreAdminister);
  const values = createCoreAdminDepartmentSchema.parse(
    Object.fromEntries(formData),
  );
  const code = normalizeBusinessCode(values.code);
  if (!code) {
    throw new Error("CORE_ADMIN_DEPARTMENT_CODE_INVALID");
  }

  const [company, existingDepartment] = await Promise.all([
    prisma.company.findFirst({
      where: {
        id: values.companyId,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
    }),
    prisma.department.findUnique({
      where: {
        companyId_code: {
          companyId: values.companyId,
          code,
        },
      },
      select: { id: true },
    }),
  ]);

  if (!company) {
    throw new Error("COMPANY_NOT_FOUND");
  }
  if (existingDepartment) {
    throw new Error("CORE_ADMIN_DEPARTMENT_DUPLICATE");
  }

  await assertCanManageCompanyScope(session, company.id);

  const department = await prisma.department.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: company.id,
      code,
      name: values.name,
    },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: company.id,
      actorUserId: session.user.id,
      eventType: "core_admin.department.created",
      entityType: "Department",
      entityId: department.id,
      afterData: {
        companyId: company.id,
        code: department.code,
        name: department.name,
        status: department.status,
      },
      metadata: {
        reason: values.reason,
        companyName: company.tradingName ?? company.legalName,
      },
    },
  });
}

export async function createCoreAdminLocation(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.coreAdminister);
  const values = createCoreAdminLocationSchema.parse(
    Object.fromEntries(formData),
  );
  const code = normalizeBusinessCode(values.code);
  if (!code) {
    throw new Error("CORE_ADMIN_LOCATION_CODE_INVALID");
  }

  const [company, brand, existingLocation] = await Promise.all([
    prisma.company.findFirst({
      where: {
        id: values.companyId,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
    }),
    values.brandId
      ? prisma.brand.findFirst({
          where: {
            id: values.brandId,
            tenantId: session.context.tenantId,
            companyId: values.companyId,
            status: "ACTIVE",
          },
        })
      : Promise.resolve(null),
    prisma.location.findUnique({
      where: {
        companyId_code: {
          companyId: values.companyId,
          code,
        },
      },
      select: { id: true },
    }),
  ]);

  if (!company) {
    throw new Error("COMPANY_NOT_FOUND");
  }
  if (values.brandId && !brand) {
    throw new Error("BRAND_NOT_FOUND");
  }
  if (values.locationType === "BRANCH" && !brand) {
    throw new Error("BRANCH_BRAND_REQUIRED");
  }
  if (existingLocation) {
    throw new Error("CORE_ADMIN_LOCATION_DUPLICATE");
  }

  await assertCanManageCompanyScope(session, company.id);

  const location = await prisma.location.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: company.id,
      brandId: brand?.id ?? null,
      locationType: values.locationType,
      code,
      name: values.name,
      address: values.address ?? null,
      timezone: values.timezone,
    },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: company.id,
      actorUserId: session.user.id,
      eventType: "core_admin.location.created",
      entityType: "Location",
      entityId: location.id,
      afterData: {
        companyId: company.id,
        brandId: brand?.id ?? null,
        locationType: location.locationType,
        code: location.code,
        name: location.name,
        timezone: location.timezone,
        status: location.status,
      },
      metadata: {
        reason: values.reason,
        companyName: company.tradingName ?? company.legalName,
        brandName: brand?.name ?? null,
      },
    },
  });
}

export async function getCoreAdminUserDetail(
  session: SessionContext,
  userId: string,
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);

  try {
    await assertTargetUserInCurrentCompany(session, userId);
  } catch (error) {
    if (error instanceof Error && error.message === "TARGET_USER_NOT_FOUND") {
      return null;
    }
    throw error;
  }

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId: session.context.tenantId,
    },
    include: {
      roleAssignments: {
        where: { status: "ACTIVE" },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
      scopeAssignments: {
        where: { status: "ACTIVE" },
        orderBy: { startsAt: "asc" },
      },
      auditEvents: {
        where: {
          OR: [{ companyId: session.context.companyId }, { companyId: null }],
        },
        orderBy: { occurredAt: "desc" },
        take: 10,
      },
    },
  });

  if (!user) {
    return null;
  }

  const permissionCodes = Array.from(
    new Set(
      user.roleAssignments.flatMap((assignment) =>
        assignment.role.permissions.map(
          (rolePermission) => rolePermission.permission.code,
        ),
      ),
    ),
  );
  const assignedRoleIds = new Set(
    user.roleAssignments.map((assignment) => assignment.role.id),
  );
  const scopeIdsByType = user.scopeAssignments.reduce(
    (groups, assignment) => {
      groups[assignment.scopeType].push(assignment.scopeId);
      return groups;
    },
    {
      COMPANY: [] as string[],
      BRAND: [] as string[],
      LOCATION: [] as string[],
      DEPARTMENT: [] as string[],
      PROJECT: [] as string[],
    },
  );
  const [
    scopeCompanies,
    scopeBrands,
    scopeLocations,
    scopeDepartments,
    scopeProjects,
  ] = await Promise.all([
    prisma.company.findMany({
      where: {
        id: { in: scopeIdsByType.COMPANY },
        tenantId: session.context.tenantId,
      },
      select: {
        id: true,
        legalName: true,
        tradingName: true,
        currencyCode: true,
      },
    }),
    prisma.brand.findMany({
      where: {
        id: { in: scopeIdsByType.BRAND },
        tenantId: session.context.tenantId,
      },
      select: { id: true, name: true, code: true, companyId: true },
    }),
    prisma.location.findMany({
      where: {
        id: { in: scopeIdsByType.LOCATION },
        tenantId: session.context.tenantId,
      },
      include: {
        company: { select: { legalName: true, tradingName: true } },
        brand: { select: { name: true } },
      },
    }),
    prisma.department.findMany({
      where: {
        id: { in: scopeIdsByType.DEPARTMENT },
        tenantId: session.context.tenantId,
      },
      include: { company: { select: { legalName: true, tradingName: true } } },
    }),
    prisma.project.findMany({
      where: {
        id: { in: scopeIdsByType.PROJECT },
        tenantId: session.context.tenantId,
      },
      include: { company: { select: { legalName: true, tradingName: true } } },
    }),
  ]);
  const scopeDisplay = new Map<
    string,
    { name: string; context: string; code?: string | null }
  >();
  scopeCompanies.forEach((company) => {
    scopeDisplay.set(company.id, {
      name: company.tradingName ?? company.legalName,
      context: `${company.currencyCode} company`,
    });
  });
  scopeBrands.forEach((brand) => {
    scopeDisplay.set(brand.id, {
      name: brand.name,
      context: "Brand",
      code: brand.code,
    });
  });
  scopeLocations.forEach((location) => {
    scopeDisplay.set(location.id, {
      name: location.name,
      context: [
        location.brand?.name,
        location.company.tradingName ?? location.company.legalName,
        location.locationType.replace(/_/g, " "),
      ]
        .filter(Boolean)
        .join(" / "),
      code: location.code,
    });
  });
  scopeDepartments.forEach((department) => {
    scopeDisplay.set(department.id, {
      name: department.name,
      context: `${department.company.tradingName ?? department.company.legalName} / Department`,
      code: department.code,
    });
  });
  scopeProjects.forEach((project) => {
    scopeDisplay.set(project.id, {
      name: project.name,
      context: `${project.company.tradingName ?? project.company.legalName} / Project`,
      code: project.code,
    });
  });
  const visibleScopeIdsByType = {
    COMPANY: new Set(
      scopeCompanies
      .filter((company) => company.id === session.context.companyId)
      .map((company) => company.id),
    ),
    BRAND: new Set(
      scopeBrands
      .filter((brand) => brand.companyId === session.context.companyId)
      .map((brand) => brand.id),
    ),
    LOCATION: new Set(
      scopeLocations
      .filter((location) => location.companyId === session.context.companyId)
      .map((location) => location.id),
    ),
    DEPARTMENT: new Set(
      scopeDepartments
      .filter((department) => department.companyId === session.context.companyId)
      .map((department) => department.id),
    ),
    PROJECT: new Set(
      scopeProjects
      .filter((project) => project.companyId === session.context.companyId)
      .map((project) => project.id),
    ),
  };
  const visibleScopeAssignments = user.scopeAssignments.filter((assignment) => {
    const allowedIds =
      visibleScopeIdsByType[assignment.scopeType as keyof typeof visibleScopeIdsByType];
    return allowedIds?.has(assignment.scopeId) ?? false;
  });
  const assignableRoles = await prisma.role.findMany({
    where: {
      tenantId: session.context.tenantId,
      status: "ACTIVE",
      id: { notIn: Array.from(assignedRoleIds) },
    },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });
  const [highRiskScopeRequests, sensitiveRoleRequests, allActiveLocations] =
    await Promise.all([
      prisma.highRiskScopeRequest.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          targetUserId: user.id,
          status: { in: ["PENDING", "APPROVED", "REJECTED"] },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.sensitiveRoleRequest.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          targetUserId: user.id,
          status: { in: ["PENDING", "APPROVED", "REJECTED"] },
        },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.location.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE",
        },
        orderBy: { name: "asc" },
      }),
    ]);
  const highRiskRequestUserIds = Array.from(
    new Set([
      ...highRiskScopeRequests.flatMap((request) => [
        request.requestedByUserId,
        ...(request.reviewedByUserId ? [request.reviewedByUserId] : []),
      ]),
      ...sensitiveRoleRequests.flatMap((request) => [
        request.requestedByUserId,
        ...(request.reviewedByUserId ? [request.reviewedByUserId] : []),
      ]),
    ]),
  );
  const highRiskRequestUsers = highRiskRequestUserIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: highRiskRequestUserIds },
          tenantId: session.context.tenantId,
        },
        select: { id: true, displayName: true, email: true },
      })
    : [];
  const highRiskRequestUserDisplay = new Map(
    highRiskRequestUsers.map((requestUser) => [
      requestUser.id,
      requestUser.displayName || requestUser.email,
    ]),
  );
  const allActiveLocationDisplay = new Map(
    allActiveLocations.map((location) => [location.id, location]),
  );
  const pendingSensitiveRoleIds = new Set(
    sensitiveRoleRequests
      .filter((request) => request.status === "PENDING")
      .map((request) => request.roleId),
  );

  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    roles: user.roleAssignments.map((assignment) => ({
      id: assignment.role.id,
      assignmentId: assignment.id,
      name: assignment.role.name,
      code: assignment.role.code,
      canMutate: isAssignableNonSensitiveRole(assignment.role.code),
      startsAt: assignment.startsAt.toISOString(),
    })),
    scopes: visibleScopeAssignments.map((assignment) => ({
      id: assignment.id,
      type: assignment.scopeType,
      scopeId: assignment.scopeId,
      displayName:
        scopeDisplay.get(assignment.scopeId)?.name ?? "Unknown scope",
      displayContext:
        scopeDisplay.get(assignment.scopeId)?.context ??
        "Scope record not found",
      code: scopeDisplay.get(assignment.scopeId)?.code ?? null,
      accessLevel: assignment.accessLevel,
      canMutate:
        assignment.scopeType === "LOCATION" &&
        isDirectlyAssignableLocationScope({
          locationType:
            scopeLocations.find(
              (location) => location.id === assignment.scopeId,
            )?.locationType ?? "UNKNOWN",
          accessLevel: assignment.accessLevel as z.infer<
            typeof accessLevelSchema
          >,
        }),
      riskLabel:
        assignment.scopeType === "LOCATION"
          ? getLocationScopeRiskLabel({
              locationType:
                scopeLocations.find(
                  (location) => location.id === assignment.scopeId,
                )?.locationType ?? "UNKNOWN",
            })
          : "Broad scope requires controlled approval",
      startsAt: assignment.startsAt.toISOString(),
    })),
    assignableLocations: allActiveLocations.map((location) => ({
      id: location.id,
      name: location.name,
      code: location.code,
      type: location.locationType,
      assignmentEligibility: getLocationScopeRiskLabel(location),
      directAssignable: isDirectlyAssignableLocationScope({
        locationType: location.locationType,
        accessLevel: "VIEW",
      }),
    })),
    highRiskScopeRequests: highRiskScopeRequests.map((request) => {
      const location = allActiveLocationDisplay.get(request.locationId);
      return {
        id: request.id,
        status: request.status,
        accessLevel: request.accessLevel,
        reason: request.reason,
        evidenceReference: request.evidenceReference,
        reviewReason: request.reviewReason,
        createdAt: request.createdAt.toISOString(),
        reviewedAt: request.reviewedAt?.toISOString() ?? null,
        requestedByUserId: request.requestedByUserId,
        requestedByName:
          highRiskRequestUserDisplay.get(request.requestedByUserId) ??
          "Unknown requester",
        reviewedByName: request.reviewedByUserId
          ? (highRiskRequestUserDisplay.get(request.reviewedByUserId) ??
            "Unknown reviewer")
          : null,
        locationId: request.locationId,
        locationName: location?.name ?? "Unknown location",
        locationCode: location?.code ?? null,
        locationType: location?.locationType ?? "UNKNOWN",
        riskLabel: location
          ? getLocationScopeRiskLabel(location)
          : "Scope record not found",
      };
    }),
    canMutateScopes: user.id !== session.user.id,
    canMutateRoles: user.id !== session.user.id,
    assignableRoles: assignableRoles
      .filter((role) => isDirectlyAssignableRole(role))
      .map((role) => ({
        id: role.id,
        name: role.name,
        code: role.code,
        assignmentEligibility: roleAssignmentRiskLabel(role),
        permissionCodes: role.permissions.map(
          (rolePermission) => rolePermission.permission.code,
        ),
      })),
    requestableSensitiveRoles: assignableRoles
      .filter((role) => !isDirectlyAssignableRole(role))
      .filter((role) => !pendingSensitiveRoleIds.has(role.id))
      .map((role) => ({
        id: role.id,
        name: role.name,
        code: role.code,
        assignmentEligibility: sensitiveRoleRiskLabel(role),
        permissionCodes: role.permissions.map(
          (rolePermission) => rolePermission.permission.code,
        ),
      })),
    sensitiveRoleRequests: sensitiveRoleRequests.map((request) => ({
      id: request.id,
      status: request.status,
      reason: request.reason,
      evidenceReference: request.evidenceReference,
      reviewReason: request.reviewReason,
      createdAt: request.createdAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      requestedByUserId: request.requestedByUserId,
      requestedByName:
        highRiskRequestUserDisplay.get(request.requestedByUserId) ??
        "Unknown requester",
      reviewedByName: request.reviewedByUserId
        ? (highRiskRequestUserDisplay.get(request.reviewedByUserId) ??
          "Unknown reviewer")
        : null,
      roleId: request.roleId,
      roleName: request.role.name,
      roleCode: request.role.code,
      riskLabel: sensitiveRoleRiskLabel(request.role),
      permissionLabels: request.role.permissions.map((rolePermission) =>
        getPermissionPresentation(rolePermission.permission.code),
      ),
    })),
    permissionCodes,
    permissions: permissionCodes.map((code) => getPermissionPresentation(code)),
    auditEvents: user.auditEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      occurredAt: event.occurredAt.toISOString(),
    })),
  };
}

export async function createUserRoleAssignment(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  const values = createRoleAssignmentSchema.parse(Object.fromEntries(formData));
  assertNotSelfRoleMutation(session.user.id, values.targetUserId);
  await assertTargetUserInCurrentCompany(session, values.targetUserId);

  const [targetUser, role] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: values.targetUserId,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
    }),
    prisma.role.findFirst({
      where: {
        id: values.roleId,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    }),
  ]);

  if (!targetUser) {
    throw new Error("TARGET_USER_NOT_FOUND");
  }
  if (!role) {
    throw new Error("TARGET_ROLE_NOT_FOUND");
  }
  assertDirectRoleAssignmentAllowed(role);

  await assertCanManageCompanyScope(session, session.context.companyId);
  await assertRoleNotUsedInActiveApprovalRules(
    role.id,
    session.context.tenantId,
  );

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "Role"
      WHERE "id" = ${role.id}::uuid
      FOR UPDATE
    `;
    const lockedRole = await tx.role.findUniqueOrThrow({
      where: { id: role.id },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
    assertDirectRoleAssignmentAllowed(lockedRole);
    const permissionCodes = lockedRole.permissions.map(
      (rolePermission) => rolePermission.permission.code,
    );
    const existing = await tx.userRoleAssignment.findFirst({
      where: {
        userId: targetUser.id,
        roleId: role.id,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    assertNoActiveDuplicateRole(existing?.id);

    const assignment = await tx.userRoleAssignment.create({
      data: {
        userId: targetUser.id,
        roleId: role.id,
      },
    });
    await touchUserPrivilegeEpoch(tx, targetUser.id, {
      companyId: session.context.companyId,
      requestedByUserId: session.user.id,
      reason: "Role assignment created; invalidate active sessions.",
      sourceEventType: "user_role_assignment.created",
      sourceRecordId: assignment.id,
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "user_role_assignment.created",
        entityType: "UserRoleAssignment",
        entityId: assignment.id,
        afterData: {
          userId: targetUser.id,
          roleId: role.id,
          roleCode: role.code,
          status: "ACTIVE",
        },
        metadata: {
          reason: values.reason,
          targetUserEmail: targetUser.email,
          roleName: role.name,
          roleCode: role.code,
          permissionCodes,
          nonSensitiveAllowlist: true,
        },
      },
    });
  });
}

export async function deactivateUserRoleAssignment(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  const values = deactivateRoleAssignmentSchema.parse(
    Object.fromEntries(formData),
  );
  assertNotSelfRoleMutation(session.user.id, values.targetUserId);
  await assertTargetUserInCurrentCompany(session, values.targetUserId);

  const assignment = await prisma.userRoleAssignment.findFirst({
    where: {
      id: values.assignmentId,
      userId: values.targetUserId,
      status: "ACTIVE",
      user: {
        tenantId: session.context.tenantId,
      },
    },
    include: {
      user: true,
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  if (!assignment) {
    throw new Error("ROLE_ASSIGNMENT_NOT_FOUND");
  }

  await assertCanManageCompanyScope(session, session.context.companyId);
  await assertRoleNotUsedInActiveApprovalRules(
    assignment.role.id,
    session.context.tenantId,
  );
  const endedAt = new Date();
  const permissionCodes = assignment.role.permissions.map(
    (rolePermission) => rolePermission.permission.code,
  );

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "Role"
      WHERE "id" = ${assignment.role.id}::uuid
      FOR UPDATE
    `;
    const lockedAssignment = await tx.userRoleAssignment.findFirst({
      where: {
        id: assignment.id,
        userId: values.targetUserId,
        status: "ACTIVE",
        user: {
          tenantId: session.context.tenantId,
        },
      },
      select: { id: true },
    });
    if (!lockedAssignment) {
      throw new Error("ROLE_ASSIGNMENT_NOT_FOUND");
    }
    const claimed = await tx.userRoleAssignment.updateMany({
      where: {
        id: assignment.id,
        userId: values.targetUserId,
        status: "ACTIVE",
      },
      data: {
        status: "INACTIVE",
        endsAt: endedAt,
      },
    });
    if (claimed.count !== 1) {
      throw new Error("ROLE_ASSIGNMENT_NOT_FOUND");
    }
    await touchUserPrivilegeEpoch(tx, assignment.userId, {
      companyId: session.context.companyId,
      requestedByUserId: session.user.id,
      reason: "Role assignment deactivated; invalidate active sessions.",
      sourceEventType: "user_role_assignment.deactivated",
      sourceRecordId: assignment.id,
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "user_role_assignment.deactivated",
        entityType: "UserRoleAssignment",
        entityId: assignment.id,
        beforeData: {
          userId: assignment.userId,
          roleId: assignment.roleId,
          roleCode: assignment.role.code,
          status: assignment.status,
        },
        afterData: {
          status: "INACTIVE",
          endsAt: endedAt.toISOString(),
        },
        metadata: {
          reason: values.reason,
          targetUserEmail: assignment.user.email,
          roleName: assignment.role.name,
          roleCode: assignment.role.code,
          permissionCodes,
          directAssignmentEligible: isDirectlyAssignableRole(assignment.role),
          controlledRevocation: true,
        },
      },
    });
  });
}

export async function requestSensitiveUserRole(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  const values = requestSensitiveRoleSchema.parse(Object.fromEntries(formData));
  assertNotSelfRoleMutation(session.user.id, values.targetUserId);
  await assertTargetUserInCurrentCompany(session, values.targetUserId);

  const [targetUser, role] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: values.targetUserId,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
    }),
    prisma.role.findFirst({
      where: {
        id: values.roleId,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    }),
  ]);

  if (!targetUser) {
    throw new Error("TARGET_USER_NOT_FOUND");
  }
  if (!role) {
    throw new Error("TARGET_ROLE_NOT_FOUND");
  }
  if (isDirectlyAssignableRole(role)) {
    throw new Error("LOW_RISK_ROLE_USE_QUICK_ASSIGNMENT");
  }
  await assertCanManageCompanyScope(session, session.context.companyId);
  await assertRoleNotUsedInActiveApprovalRules(
    role.id,
    session.context.tenantId,
  );
  await assertPrivilegedMfaForAction(session, {
    action: "sensitive_role_request.create",
    permissionCode: permissions.tenantRoleAdminister,
    entityType: "SensitiveRoleRequest",
    reason: "Sensitive role requests require verified privileged MFA evidence.",
    metadata: {
      targetUserId: targetUser.id,
      roleId: role.id,
      roleCode: role.code,
    },
  });

  const [existingAssignment, pendingRequest] = await Promise.all([
    prisma.userRoleAssignment.findFirst({
      where: {
        userId: targetUser.id,
        roleId: role.id,
        status: "ACTIVE",
      },
      select: { id: true },
    }),
    prisma.sensitiveRoleRequest.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        targetUserId: targetUser.id,
        roleId: role.id,
        status: "PENDING",
      },
      select: { id: true },
    }),
  ]);
  assertNoActiveDuplicateRole(existingAssignment?.id);
  if (pendingRequest) {
    throw new Error("DUPLICATE_PENDING_SENSITIVE_ROLE_REQUEST");
  }

  const permissionCodes = role.permissions.map(
    (rolePermission) => rolePermission.permission.code,
  );

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "Role"
      WHERE "id" = ${role.id}::uuid
      FOR UPDATE
    `;
    const [
      lockedTargetUser,
      lockedRole,
      lockedAssignment,
      lockedPendingRequest,
    ] = await Promise.all([
      tx.user.findFirst({
        where: {
          id: targetUser.id,
          tenantId: session.context.tenantId,
          status: "ACTIVE",
        },
        select: { id: true },
      }),
      tx.role.findFirst({
        where: {
          id: role.id,
          tenantId: session.context.tenantId,
          status: "ACTIVE",
        },
        select: { id: true },
      }),
      tx.userRoleAssignment.findFirst({
        where: {
          userId: targetUser.id,
          roleId: role.id,
          status: "ACTIVE",
        },
        select: { id: true },
      }),
      tx.sensitiveRoleRequest.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          targetUserId: targetUser.id,
          roleId: role.id,
          status: "PENDING",
        },
        select: { id: true },
      }),
    ]);
    if (!lockedTargetUser) {
      throw new Error("TARGET_USER_NOT_FOUND");
    }
    if (!lockedRole) {
      throw new Error("TARGET_ROLE_NOT_FOUND");
    }
    assertNoActiveDuplicateRole(lockedAssignment?.id);
    if (lockedPendingRequest) {
      throw new Error("DUPLICATE_PENDING_SENSITIVE_ROLE_REQUEST");
    }

    const request = await tx.sensitiveRoleRequest.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        targetUserId: targetUser.id,
        roleId: role.id,
        reason: values.reason,
        evidenceReference: values.evidenceReference,
        requestedByUserId: session.user.id,
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "sensitive_role_request.created",
        entityType: "SensitiveRoleRequest",
        entityId: request.id,
        afterData: {
          targetUserId: targetUser.id,
          roleId: role.id,
          roleCode: role.code,
          status: "PENDING",
        },
        metadata: {
          sourceDecisionId: "DEC-0036",
          reason: values.reason,
          evidenceReference: values.evidenceReference,
          targetUserEmail: targetUser.email,
          roleName: role.name,
          roleCode: role.code,
          permissionCodes,
          riskLabel: sensitiveRoleRiskLabel(role),
        },
      },
    });
  });
}

export async function approveSensitiveUserRoleRequest(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  const values = reviewSensitiveRoleSchema.parse(Object.fromEntries(formData));
  await assertTargetUserInCurrentCompany(session, values.targetUserId);

  const request = await prisma.sensitiveRoleRequest.findFirst({
    where: {
      id: values.requestId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      targetUserId: values.targetUserId,
      status: "PENDING",
    },
  });
  if (!request) {
    throw new Error("SENSITIVE_ROLE_REQUEST_NOT_FOUND");
  }
  if (
    request.requestedByUserId === session.user.id ||
    request.targetUserId === session.user.id
  ) {
    throw new Error("SELF_ROLE_APPROVAL_BLOCKED");
  }

  const [targetUser, role] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: request.targetUserId,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
    }),
    prisma.role.findFirst({
      where: {
        id: request.roleId,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    }),
  ]);
  if (!targetUser) {
    throw new Error("TARGET_USER_NOT_FOUND");
  }
  if (!role) {
    throw new Error("TARGET_ROLE_NOT_FOUND");
  }
  if (isDirectlyAssignableRole(role)) {
    throw new Error("LOW_RISK_ROLE_USE_QUICK_ASSIGNMENT");
  }
  await assertCanManageCompanyScope(session, session.context.companyId);
  await assertRoleNotUsedInActiveApprovalRules(
    role.id,
    session.context.tenantId,
  );
  await assertPrivilegedMfaForAction(session, {
    action: "sensitive_role_request.approve",
    permissionCode: permissions.tenantRoleAdminister,
    entityType: "SensitiveRoleRequest",
    entityId: request.id,
    reason:
      "Sensitive role approval requires verified privileged MFA evidence.",
    metadata: {
      targetUserId: targetUser.id,
      roleId: role.id,
      roleCode: role.code,
    },
  });

  const reviewedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "Role"
      WHERE "id" = ${role.id}::uuid
      FOR UPDATE
    `;
    const lockedRole = await tx.role.findFirst({
      where: {
        id: role.id,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
    if (!lockedRole) {
      throw new Error("TARGET_ROLE_NOT_FOUND");
    }
    if (isDirectlyAssignableRole(lockedRole)) {
      throw new Error("LOW_RISK_ROLE_USE_QUICK_ASSIGNMENT");
    }
    const permissionCodes = lockedRole.permissions
      .map((rolePermission) => rolePermission.permission.code)
      .sort();
    const claimed = await tx.sensitiveRoleRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewedByUserId: session.user.id,
        reviewReason: values.reviewReason,
        reviewedAt,
      },
    });
    if (claimed.count !== 1) {
      throw new Error("SENSITIVE_ROLE_REQUEST_NOT_FOUND");
    }

    const existing = await tx.userRoleAssignment.findFirst({
      where: {
        userId: targetUser.id,
        roleId: role.id,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    assertNoActiveDuplicateRole(existing?.id);

    const assignment = await tx.userRoleAssignment.create({
      data: {
        userId: targetUser.id,
        roleId: role.id,
      },
    });
    await touchUserPrivilegeEpoch(tx, targetUser.id, {
      companyId: session.context.companyId,
      requestedByUserId: session.user.id,
      reason: "Sensitive role assignment approved; invalidate active sessions.",
      sourceEventType: "sensitive_role_request.approved",
      sourceRecordId: request.id,
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "sensitive_role_request.approved",
        entityType: "SensitiveRoleRequest",
        entityId: request.id,
        beforeData: {
          status: "PENDING",
        },
        afterData: {
          status: "APPROVED",
          assignmentId: assignment.id,
        },
        metadata: {
          sourceDecisionId: "DEC-0036",
          reviewReason: values.reviewReason,
          requestedByUserId: request.requestedByUserId,
          targetUserEmail: targetUser.email,
          roleName: lockedRole.name,
          roleCode: lockedRole.code,
          permissionCodes,
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "user_role_assignment.created",
        entityType: "UserRoleAssignment",
        entityId: assignment.id,
        afterData: {
          userId: targetUser.id,
          roleId: role.id,
          roleCode: lockedRole.code,
          status: "ACTIVE",
        },
        metadata: {
          sourceDecisionId: "DEC-0036",
          sourceRequestId: request.id,
          reviewReason: values.reviewReason,
          targetUserEmail: targetUser.email,
          roleName: lockedRole.name,
          roleCode: lockedRole.code,
          permissionCodes,
          controlledSensitiveRoleAssignment: true,
        },
      },
    });
  });
}

export async function rejectSensitiveUserRoleRequest(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  const values = reviewSensitiveRoleSchema.parse(Object.fromEntries(formData));

  const request = await prisma.sensitiveRoleRequest.findFirst({
    where: {
      id: values.requestId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      targetUserId: values.targetUserId,
      status: "PENDING",
    },
  });
  if (!request) {
    throw new Error("SENSITIVE_ROLE_REQUEST_NOT_FOUND");
  }
  if (
    request.requestedByUserId === session.user.id ||
    request.targetUserId === session.user.id
  ) {
    throw new Error("SELF_ROLE_APPROVAL_BLOCKED");
  }
  await assertTargetUserInCurrentCompany(session, values.targetUserId);
  const role = await prisma.role.findFirst({
    where: {
      id: request.roleId,
      tenantId: session.context.tenantId,
    },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
  });
  if (!role) {
    throw new Error("TARGET_ROLE_NOT_FOUND");
  }
  await assertCanManageCompanyScope(session, session.context.companyId);
  await assertPrivilegedMfaForAction(session, {
    action: "sensitive_role_request.reject",
    permissionCode: permissions.tenantRoleAdminister,
    entityType: "SensitiveRoleRequest",
    entityId: request.id,
    reason:
      "Sensitive role rejection requires verified privileged MFA evidence.",
    metadata: {
      targetUserId: request.targetUserId,
      roleId: role.id,
      roleCode: role.code,
    },
  });
  const reviewedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.sensitiveRoleRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewedByUserId: session.user.id,
        reviewReason: values.reviewReason,
        reviewedAt,
      },
    });
    if (claimed.count !== 1) {
      throw new Error("SENSITIVE_ROLE_REQUEST_NOT_FOUND");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "sensitive_role_request.rejected",
        entityType: "SensitiveRoleRequest",
        entityId: request.id,
        beforeData: {
          status: "PENDING",
        },
        afterData: {
          status: "REJECTED",
        },
        metadata: {
          sourceDecisionId: "DEC-0036",
          reviewReason: values.reviewReason,
          requestedByUserId: request.requestedByUserId,
          roleName: role.name,
          roleCode: role.code,
        },
      },
    });
  });
}

export async function createUserLocationScopeAssignment(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageCompanyScope(session, session.context.companyId);
  const values = createLocationScopeSchema.parse(Object.fromEntries(formData));
  assertNotSelfScopeMutation(session.user.id, values.targetUserId);

  const [targetUser, location] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: values.targetUserId,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
    }),
    prisma.location.findFirst({
      where: {
        id: values.locationId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
      },
    }),
  ]);

  if (!targetUser) {
    throw new Error("TARGET_USER_NOT_FOUND");
  }
  if (!location) {
    throw new Error("TARGET_LOCATION_NOT_FOUND");
  }
  assertDirectLocationScopeAssignmentAllowed({
    locationType: location.locationType,
    accessLevel: values.accessLevel,
  });

  await assertCanManageCompanyScope(session, location.companyId);

  const existing = await prisma.userScopeAssignment.findFirst({
    where: {
      userId: targetUser.id,
      scopeType: "LOCATION",
      scopeId: location.id,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  assertNoActiveDuplicateScope(existing?.id);

  await prisma.$transaction(async (tx) => {
    const assignment = await tx.userScopeAssignment.create({
      data: {
        userId: targetUser.id,
        scopeType: "LOCATION",
        scopeId: location.id,
        accessLevel: values.accessLevel,
      },
    });
    await touchUserPrivilegeEpoch(tx, targetUser.id);

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: location.companyId,
        actorUserId: session.user.id,
        eventType: "user_scope_assignment.created",
        entityType: "UserScopeAssignment",
        entityId: assignment.id,
        afterData: {
          userId: targetUser.id,
          scopeType: "LOCATION",
          scopeId: location.id,
          accessLevel: values.accessLevel,
          status: "ACTIVE",
        },
        metadata: {
          reason: values.reason,
          targetUserEmail: targetUser.email,
          locationCode: location.code,
          locationType: location.locationType,
          directScopeAssignment: true,
        },
      },
    });
  });
}

export async function requestHighRiskUserLocationScope(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageCompanyScope(session, session.context.companyId);
  const values = requestHighRiskLocationScopeSchema.parse(
    Object.fromEntries(formData),
  );
  assertNotSelfScopeMutation(session.user.id, values.targetUserId);

  const [targetUser, location] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: values.targetUserId,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
    }),
    prisma.location.findFirst({
      where: {
        id: values.locationId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
      },
    }),
  ]);

  if (!targetUser) {
    throw new Error("TARGET_USER_NOT_FOUND");
  }
  if (!location) {
    throw new Error("TARGET_LOCATION_NOT_FOUND");
  }
  assertRequiresControlledLocationScopeRequest({
    locationType: location.locationType,
    accessLevel: values.accessLevel,
  });
  await assertCanManageCompanyScope(session, location.companyId);
  await assertPrivilegedMfaForAction(session, {
    action: "high_risk_scope_request.create",
    permissionCode: permissions.coreAdminister,
    entityType: "HighRiskScopeRequest",
    reason:
      "High-risk scope requests require verified privileged MFA evidence.",
    metadata: {
      targetUserId: targetUser.id,
      locationId: location.id,
      locationType: location.locationType,
      accessLevel: values.accessLevel,
    },
  });

  const [existingAssignment, pendingRequest] = await Promise.all([
    prisma.userScopeAssignment.findFirst({
      where: {
        userId: targetUser.id,
        scopeType: "LOCATION",
        scopeId: location.id,
        status: "ACTIVE",
      },
      select: { id: true },
    }),
    prisma.highRiskScopeRequest.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: location.companyId,
        targetUserId: targetUser.id,
        locationId: location.id,
        status: "PENDING",
      },
      select: { id: true },
    }),
  ]);
  assertNoActiveDuplicateScope(existingAssignment?.id);
  if (pendingRequest) {
    throw new Error("DUPLICATE_PENDING_HIGH_RISK_SCOPE_REQUEST");
  }

  await prisma.$transaction(async (tx) => {
    const request = await tx.highRiskScopeRequest.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: location.companyId,
        targetUserId: targetUser.id,
        locationId: location.id,
        accessLevel: values.accessLevel,
        reason: values.reason,
        evidenceReference: values.evidenceReference,
        requestedByUserId: session.user.id,
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: location.companyId,
        actorUserId: session.user.id,
        eventType: "high_risk_scope_request.created",
        entityType: "HighRiskScopeRequest",
        entityId: request.id,
        afterData: {
          targetUserId: targetUser.id,
          scopeType: "LOCATION",
          scopeId: location.id,
          accessLevel: values.accessLevel,
          status: "PENDING",
        },
        metadata: {
          sourceDecisionId: "DEC-0036",
          reason: values.reason,
          evidenceReference: values.evidenceReference,
          targetUserEmail: targetUser.email,
          locationCode: location.code,
          locationType: location.locationType,
          riskLabel: getLocationScopeRiskLabel(location),
        },
      },
    });
  });
}

export async function approveHighRiskUserLocationScopeRequest(
  formData: FormData,
) {
  const session = await requireSessionContext();
  await assertCanManageCompanyScope(session, session.context.companyId);
  const values = reviewHighRiskLocationScopeSchema.parse(
    Object.fromEntries(formData),
  );

  const request = await prisma.highRiskScopeRequest.findFirst({
    where: {
      id: values.requestId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      targetUserId: values.targetUserId,
      status: "PENDING",
    },
  });
  if (!request) {
    throw new Error("HIGH_RISK_SCOPE_REQUEST_NOT_FOUND");
  }
  if (
    request.requestedByUserId === session.user.id ||
    request.targetUserId === session.user.id
  ) {
    throw new Error("SELF_SCOPE_APPROVAL_BLOCKED");
  }

  const [targetUser, location] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: request.targetUserId,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
    }),
    prisma.location.findFirst({
      where: {
        id: request.locationId,
        tenantId: session.context.tenantId,
        companyId: request.companyId,
        status: "ACTIVE",
      },
    }),
  ]);
  if (!targetUser) {
    throw new Error("TARGET_USER_NOT_FOUND");
  }
  if (!location) {
    throw new Error("TARGET_LOCATION_NOT_FOUND");
  }
  assertRequiresControlledLocationScopeRequest({
    locationType: location.locationType,
    accessLevel: request.accessLevel as z.infer<typeof accessLevelSchema>,
  });
  await assertCanManageCompanyScope(session, location.companyId);
  await assertPrivilegedMfaForAction(session, {
    action: "high_risk_scope_request.approve",
    permissionCode: permissions.coreAdminister,
    entityType: "HighRiskScopeRequest",
    entityId: request.id,
    reason:
      "High-risk scope approval requires verified privileged MFA evidence.",
    metadata: {
      targetUserId: targetUser.id,
      locationId: location.id,
      locationType: location.locationType,
      accessLevel: request.accessLevel,
    },
  });

  const existing = await prisma.userScopeAssignment.findFirst({
    where: {
      userId: targetUser.id,
      scopeType: "LOCATION",
      scopeId: location.id,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  assertNoActiveDuplicateScope(existing?.id);
  const reviewedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.highRiskScopeRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        reviewedByUserId: session.user.id,
        reviewReason: values.reviewReason,
        reviewedAt,
      },
    });

    const assignment = await tx.userScopeAssignment.create({
      data: {
        userId: targetUser.id,
        scopeType: "LOCATION",
        scopeId: location.id,
        accessLevel: request.accessLevel,
      },
    });
    await touchUserPrivilegeEpoch(tx, targetUser.id);

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: location.companyId,
        actorUserId: session.user.id,
        eventType: "high_risk_scope_request.approved",
        entityType: "HighRiskScopeRequest",
        entityId: request.id,
        beforeData: {
          status: "PENDING",
        },
        afterData: {
          status: "APPROVED",
          assignmentId: assignment.id,
        },
        metadata: {
          sourceDecisionId: "DEC-0036",
          reviewReason: values.reviewReason,
          requestedByUserId: request.requestedByUserId,
          targetUserEmail: targetUser.email,
          locationCode: location.code,
          locationType: location.locationType,
          accessLevel: request.accessLevel,
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: location.companyId,
        actorUserId: session.user.id,
        eventType: "user_scope_assignment.created",
        entityType: "UserScopeAssignment",
        entityId: assignment.id,
        afterData: {
          userId: targetUser.id,
          scopeType: "LOCATION",
          scopeId: location.id,
          accessLevel: request.accessLevel,
          status: "ACTIVE",
        },
        metadata: {
          sourceDecisionId: "DEC-0036",
          sourceRequestId: request.id,
          reviewReason: values.reviewReason,
          targetUserEmail: targetUser.email,
          locationCode: location.code,
          locationType: location.locationType,
          controlledScopeAssignment: true,
        },
      },
    });
  });
}

export async function rejectHighRiskUserLocationScopeRequest(
  formData: FormData,
) {
  const session = await requireSessionContext();
  await assertCanManageCompanyScope(session, session.context.companyId);
  const values = reviewHighRiskLocationScopeSchema.parse(
    Object.fromEntries(formData),
  );

  const request = await prisma.highRiskScopeRequest.findFirst({
    where: {
      id: values.requestId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      targetUserId: values.targetUserId,
      status: "PENDING",
    },
  });
  if (!request) {
    throw new Error("HIGH_RISK_SCOPE_REQUEST_NOT_FOUND");
  }
  if (
    request.requestedByUserId === session.user.id ||
    request.targetUserId === session.user.id
  ) {
    throw new Error("SELF_SCOPE_APPROVAL_BLOCKED");
  }
  const location = await prisma.location.findFirst({
    where: {
      id: request.locationId,
      tenantId: session.context.tenantId,
      companyId: request.companyId,
    },
  });
  if (!location) {
    throw new Error("TARGET_LOCATION_NOT_FOUND");
  }
  await assertCanManageCompanyScope(session, location.companyId);
  await assertPrivilegedMfaForAction(session, {
    action: "high_risk_scope_request.reject",
    permissionCode: permissions.coreAdminister,
    entityType: "HighRiskScopeRequest",
    entityId: request.id,
    reason:
      "High-risk scope rejection requires verified privileged MFA evidence.",
    metadata: {
      targetUserId: request.targetUserId,
      locationId: location.id,
      locationType: location.locationType,
      accessLevel: request.accessLevel,
    },
  });
  const reviewedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.highRiskScopeRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        reviewedByUserId: session.user.id,
        reviewReason: values.reviewReason,
        reviewedAt,
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: location.companyId,
        actorUserId: session.user.id,
        eventType: "high_risk_scope_request.rejected",
        entityType: "HighRiskScopeRequest",
        entityId: request.id,
        beforeData: {
          status: "PENDING",
        },
        afterData: {
          status: "REJECTED",
        },
        metadata: {
          sourceDecisionId: "DEC-0036",
          reviewReason: values.reviewReason,
          requestedByUserId: request.requestedByUserId,
          locationCode: location.code,
          locationType: location.locationType,
          accessLevel: request.accessLevel,
        },
      },
    });
  });
}

export async function deactivateUserScopeAssignment(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageCompanyScope(session, session.context.companyId);
  const values = deactivateScopeSchema.parse(Object.fromEntries(formData));
  assertNotSelfScopeMutation(session.user.id, values.targetUserId);

  const assignment = await prisma.userScopeAssignment.findFirst({
    where: {
      id: values.assignmentId,
      userId: values.targetUserId,
      status: "ACTIVE",
      user: {
        tenantId: session.context.tenantId,
      },
    },
    include: {
      user: true,
    },
  });

  if (!assignment) {
    throw new Error("SCOPE_ASSIGNMENT_NOT_FOUND");
  }
  if (assignment.scopeType !== "LOCATION") {
    throw new Error("ONLY_LOCATION_SCOPE_MUTATION_SUPPORTED");
  }

  const location = await prisma.location.findFirst({
    where: {
      id: assignment.scopeId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
  });

  if (!location) {
    throw new Error("TARGET_LOCATION_NOT_FOUND");
  }
  assertDirectLocationScopeAssignmentAllowed({
    locationType: location.locationType,
    accessLevel: assignment.accessLevel as z.infer<typeof accessLevelSchema>,
  });

  await assertCanManageCompanyScope(session, location.companyId);
  const endedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.userScopeAssignment.update({
      where: { id: assignment.id },
      data: {
        status: "INACTIVE",
        endsAt: endedAt,
      },
    });
    await touchUserPrivilegeEpoch(tx, assignment.userId);

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: location.companyId,
        actorUserId: session.user.id,
        eventType: "user_scope_assignment.deactivated",
        entityType: "UserScopeAssignment",
        entityId: assignment.id,
        beforeData: {
          userId: assignment.userId,
          scopeType: assignment.scopeType,
          scopeId: assignment.scopeId,
          accessLevel: assignment.accessLevel,
          status: assignment.status,
        },
        afterData: {
          status: "INACTIVE",
          endsAt: endedAt.toISOString(),
        },
        metadata: {
          reason: values.reason,
          targetUserEmail: assignment.user.email,
          locationCode: location.code,
          locationType: location.locationType,
          directScopeDeactivation: true,
        },
      },
    });
  });
}

export async function getCoreAdminApprovalRuleDetail(
  session: SessionContext,
  approvalRuleId: string,
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);
  const canViewTenantRule = (await getGrantedPermissionCodes(session)).includes(
    permissions.tenantRoleAdminister,
  );

  const rule = await prisma.approvalRule.findFirst({
    where: {
      id: approvalRuleId,
      tenantId: session.context.tenantId,
      OR: [
        { companyId: session.context.companyId },
        ...(canViewTenantRule ? [{ companyId: null }] : []),
      ],
    },
    include: {
      company: true,
      steps: {
        orderBy: { stepOrder: "asc" },
      },
    },
  });

  if (!rule) {
    return null;
  }

  const roleIds = rule.steps
    .map((step) => step.roleId)
    .filter((roleId): roleId is string => Boolean(roleId));
  const userIds = rule.steps
    .map((step) => step.userId)
    .filter((userId): userId is string => Boolean(userId));

  const [roles, users, relatedAuditEvents] = await Promise.all([
    prisma.role.findMany({
      where: {
        id: { in: roleIds },
        tenantId: session.context.tenantId,
      },
    }),
    prisma.user.findMany({
      where: {
        id: { in: userIds },
        tenantId: session.context.tenantId,
      },
    }),
    prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        metadata: {
          path: ["approvalRuleId"],
          equals: rule.id,
        },
      },
      include: {
        actor: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    id: rule.id,
    transactionType: rule.transactionType,
    companyName:
      rule.company?.tradingName ?? rule.company?.legalName ?? "Tenant-wide",
    priority: rule.priority,
    isActive: rule.isActive,
    scopeFilters: rule.scopeFilters,
    createdAt: rule.createdAt.toISOString(),
    steps: rule.steps.map((step) => {
      const role = roles.find((record) => record.id === step.roleId);
      const user = users.find((record) => record.id === step.userId);

      return {
        id: step.id,
        stepOrder: step.stepOrder,
        approverType: step.approverType,
        assigneeName: role?.name ?? user?.displayName ?? "Unassigned",
        assigneeCode: role?.code ?? user?.email ?? "",
        required: step.required,
        escalationHours: step.escalationHours,
      };
    }),
    relatedAuditEvents: relatedAuditEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorName: event.actor?.displayName ?? "System",
      occurredAt: event.occurredAt.toISOString(),
    })),
  };
}

export async function getCoreAdminLocationDetail(
  session: SessionContext,
  locationId: string,
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);

  const location = await prisma.location.findFirst({
    where: {
      id: locationId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    include: {
      company: true,
      brand: true,
    },
  });

  if (!location) {
    return null;
  }

  const [scopeAssignments, purchaseRequests, auditEvents] = await Promise.all([
    prisma.userScopeAssignment.findMany({
      where: {
        scopeType: "LOCATION",
        scopeId: location.id,
        status: "ACTIVE",
      },
      include: {
        user: {
          include: {
            roleAssignments: {
              where: { status: "ACTIVE" },
              include: { role: true },
            },
          },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.purchaseRequest.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: location.companyId,
        requestLocationId: location.id,
      },
      include: {
        requester: true,
        lines: {
          orderBy: { lineNumber: "asc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: location.companyId,
        entityType: "PurchaseRequest",
        entityId: {
          in: await prisma.purchaseRequest
            .findMany({
              where: {
                tenantId: session.context.tenantId,
                companyId: location.companyId,
                requestLocationId: location.id,
              },
              select: { id: true },
              take: 12,
              orderBy: { createdAt: "desc" },
            })
            .then((records) => records.map((record) => record.id)),
        },
      },
      include: {
        actor: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    id: location.id,
    name: location.name,
    code: location.code,
    type: location.locationType,
    status: location.status,
    timezone: location.timezone,
    address: location.address,
    companyName: location.company.tradingName ?? location.company.legalName,
    brandName: location.brand?.name ?? "Company-wide",
    assignedUsers: scopeAssignments.map((assignment) => ({
      id: assignment.id,
      userId: assignment.userId,
      displayName: assignment.user.displayName,
      email: assignment.user.email,
      roles: assignment.user.roleAssignments.map(
        (roleAssignment) => roleAssignment.role.name,
      ),
      accessLevel: assignment.accessLevel,
      startsAt: assignment.startsAt.toISOString(),
    })),
    purchaseRequests: purchaseRequests.map((request) => ({
      id: request.id,
      publicReference: request.publicReference,
      status: request.status,
      requesterName: request.requester.displayName,
      lineDescription: request.lines[0]?.description ?? "No line",
      requiredDate: request.requiredDate.toISOString().slice(0, 10),
      createdAt: request.createdAt.toISOString(),
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorName: event.actor?.displayName ?? "System",
      occurredAt: event.occurredAt.toISOString(),
    })),
  };
}

export async function getCoreAdminRoleDetail(
  session: SessionContext,
  roleId: string,
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);

  const [role, allPermissions] = await Promise.all([
    prisma.role.findFirst({
      where: {
        id: roleId,
        tenantId: session.context.tenantId,
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        assignments: {
          where: { status: "ACTIVE" },
          include: {
            user: {
              include: {
                scopeAssignments: {
                  where: { status: "ACTIVE" },
                  orderBy: { startsAt: "asc" },
                },
              },
            },
          },
          orderBy: { startsAt: "asc" },
        },
      },
    }),
    prisma.permission.findMany({
      where: {
        OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
      },
      orderBy: [{ module: "asc" }, { action: "asc" }, { code: "asc" }],
    }),
  ]);

  if (!role) {
    return null;
  }

  const currentPermissionCodes = new Set(
    role.permissions.map((rolePermission) => rolePermission.permission.code),
  );
  const recommendedPermissionCodes = new Set(
    getRecommendedPermissionCodesForRole(role.code),
  );
  const permissionRows = allPermissions.map((permission) => {
    const presentation = getPermissionPresentation(permission.code);
    const enabled = currentPermissionCodes.has(permission.code);
    const recommended = recommendedPermissionCodes.has(permission.code);
    return {
      id: permission.id,
      code: permission.code,
      module: permission.module,
      action: permission.action,
      label: presentation.label,
      description: permission.description ?? presentation.description,
      group: presentation.group,
      sensitive: presentation.sensitive,
      enabled,
      recommended,
      overrideState:
        enabled === recommended
          ? "MATCHES_RECOMMENDED"
          : enabled
            ? "ADDED_FROM_RECOMMENDED"
            : "REMOVED_FROM_RECOMMENDED",
    };
  });
  const permissionGroups = Array.from(
    permissionRows
      .reduce((groups, permission) => {
        const group = groups.get(permission.group) ?? {
          name: permission.group,
          enabledCount: 0,
          recommendedCount: 0,
          permissions: [] as typeof permissionRows,
        };
        if (permission.enabled) {
          group.enabledCount += 1;
        }
        if (permission.recommended) {
          group.recommendedCount += 1;
        }
        group.permissions.push(permission);
        groups.set(permission.group, group);
        return groups;
      }, new Map<string, { name: string; enabledCount: number; recommendedCount: number; permissions: typeof permissionRows }>())
      .values(),
  );
  const addedFromRecommended = permissionRows.filter(
    (permission) => permission.overrideState === "ADDED_FROM_RECOMMENDED",
  ).length;
  const removedFromRecommended = permissionRows.filter(
    (permission) => permission.overrideState === "REMOVED_FROM_RECOMMENDED",
  ).length;
  const sensitiveEnabledCount = permissionRows.filter(
    (permission) => permission.enabled && permission.sensitive,
  ).length;

  return {
    id: role.id,
    name: role.name,
    code: role.code,
    status: role.status,
    systemRole: role.systemRole,
    recommendedLabel: getRecommendedRoleLabel(role.code),
    recommendedPermissionCount: recommendedPermissionCodes.size,
    addedFromRecommended,
    removedFromRecommended,
    sensitiveEnabledCount,
    hasRecommendedSet: recommendedPermissionCodes.size > 0,
    permissionGroups,
    permissions: role.permissions.map((rolePermission) => ({
      id: rolePermission.permission.id,
      code: rolePermission.permission.code,
      module: rolePermission.permission.module,
      action: rolePermission.permission.action,
      label: getPermissionPresentation(rolePermission.permission.code).label,
      description:
        rolePermission.permission.description ??
        getPermissionPresentation(rolePermission.permission.code).description,
      sensitive: isSensitivePermissionCode(rolePermission.permission.code),
    })),
    assignedUsers: role.assignments.map((assignment) => ({
      id: assignment.id,
      userId: assignment.userId,
      displayName: assignment.user.displayName,
      email: assignment.user.email,
      startsAt: assignment.startsAt.toISOString(),
      scopes: assignment.user.scopeAssignments.map((scope) => ({
        id: scope.id,
        type: scope.scopeType,
        scopeId: scope.scopeId,
        accessLevel: scope.accessLevel,
      })),
    })),
  };
}

async function updateRolePermissionCodes({
  session,
  roleId,
  nextPermissionCodes,
  reason,
  source,
}: {
  session: SessionContext;
  roleId: string;
  nextPermissionCodes: string[];
  reason: string;
  source: "manual_override" | "recommended_set";
}) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);

  const [role, availablePermissions] = await Promise.all([
    prisma.role.findFirst({
      where: {
        id: roleId,
        tenantId: session.context.tenantId,
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    }),
    prisma.permission.findMany({
      where: {
        OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
      },
    }),
  ]);

  if (!role) {
    throw new Error("ROLE_NOT_FOUND");
  }
  const now = new Date();
  const actorAssignment = await prisma.userRoleAssignment.findFirst({
    where: {
      userId: session.user.id,
      roleId: role.id,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: { id: true },
  });
  if (actorAssignment) {
    throw new Error("SELF_ROLE_PERMISSION_CHANGE_FORBIDDEN");
  }

  const availablePermissionByCode = new Map(
    availablePermissions.map((permission) => [permission.code, permission]),
  );
  const normalizedNextCodes = Array.from(new Set(nextPermissionCodes)).sort();
  const unknownCodes = normalizedNextCodes.filter(
    (code) => !availablePermissionByCode.has(code),
  );
  if (unknownCodes.length > 0) {
    throw new Error("UNKNOWN_PERMISSION_CODE");
  }
  assertAdminRoleRetainsCoreAdminPermission(role.code, normalizedNextCodes);

  const currentCodes = role.permissions
    .map((rolePermission) => rolePermission.permission.code)
    .sort();
  const currentCodeSet = new Set(currentCodes);
  const nextCodeSet = new Set(normalizedNextCodes);
  const addedCodes = normalizedNextCodes.filter(
    (code) => !currentCodeSet.has(code),
  );
  const removedCodes = currentCodes.filter((code) => !nextCodeSet.has(code));
  assertRolePermissionChangesExist(addedCodes, removedCodes);

  const recommendedCodes = getRecommendedPermissionCodesForRole(
    role.code,
  ).sort();
  const recommendedCodeSet = new Set(recommendedCodes);
  const sensitiveChanges = [...addedCodes, ...removedCodes].filter((code) =>
    isSensitivePermissionCode(code),
  );
  const addedSensitiveCodes = addedCodes.filter((code) =>
    isSensitivePermissionCode(code),
  );

  const rolePermissionMutation = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "Role"
      WHERE "id" = ${role.id}::uuid
      FOR UPDATE
    `;
    const lockedPermissionRows = await tx.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permission: { select: { code: true } } },
    });
    const lockedCurrentCodes = lockedPermissionRows
      .map((row) => row.permission.code)
      .sort();
    if (JSON.stringify(lockedCurrentCodes) !== JSON.stringify(currentCodes)) {
      throw new Error("ROLE_PERMISSION_CONCURRENT_CHANGE");
    }

    const pendingSensitiveRoleRequest = await tx.sensitiveRoleRequest.findFirst({
      where: {
        tenantId: session.context.tenantId,
        roleId: role.id,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (pendingSensitiveRoleRequest) {
      throw new Error("PENDING_SENSITIVE_ROLE_REQUEST_PERMISSION_CHANGE_BLOCKED");
    }

    const lockedAt = new Date();
    const lockedActorAssignment = await tx.userRoleAssignment.findFirst({
      where: {
        userId: session.user.id,
        roleId: role.id,
        status: "ACTIVE",
        startsAt: { lte: lockedAt },
        OR: [{ endsAt: null }, { endsAt: { gt: lockedAt } }],
      },
      select: { id: true },
    });
    if (lockedActorAssignment) {
      throw new Error("SELF_ROLE_PERMISSION_CHANGE_FORBIDDEN");
    }

    if (addedSensitiveCodes.length > 0) {
      const activeAssignee = await tx.userRoleAssignment.findFirst({
        where: {
          roleId: role.id,
          status: "ACTIVE",
          startsAt: { lte: lockedAt },
          OR: [{ endsAt: null }, { endsAt: { gt: lockedAt } }],
          user: {
            tenantId: session.context.tenantId,
            status: "ACTIVE",
          },
        },
        select: { id: true },
      });
      if (activeAssignee) {
        throw new Error("ASSIGNED_ROLE_SENSITIVE_PERMISSION_CHANGE_BLOCKED");
      }
    }

    const affectedAssignees = await tx.userRoleAssignment.findMany({
      where: {
        roleId: role.id,
        status: "ACTIVE",
        startsAt: { lte: lockedAt },
        OR: [{ endsAt: null }, { endsAt: { gt: lockedAt } }],
        user: {
          tenantId: session.context.tenantId,
          status: "ACTIVE",
        },
      },
      select: { userId: true },
      distinct: ["userId"],
      orderBy: { userId: "asc" },
    });
    const affectedUserIds = canonicalizePrivilegeMutationUserIds(
      affectedAssignees.map((assignee) => assignee.userId),
    );
    // Global role/privilege mutation lock order: target Role first, then every
    // acting or affected User in ascending UUID order, then the acting
    // AuthSession. Approval routing uses the same sorted User order with
    // FOR SHARE, so mixed SHARE/UPDATE user locks cannot invert each other.
    const lockedUsers = await lockUsersForPrivilegeMutation(
      tx,
      session.context.tenantId,
      [session.user.id, ...affectedUserIds],
    );
    const deferredMfaDenial = await lockAndRevalidateRolePermissionActor(
      tx,
      session,
      {
        actor: lockedUsers.lockedUserById.get(session.user.id),
        roleId: role.id,
        roleCode: role.code,
        sensitiveChanges,
        addedCodes,
        removedCodes,
      },
    );
    if (deferredMfaDenial) {
      return { deniedError: deferredMfaDenial };
    }

    if (removedCodes.length > 0) {
      const removedPermissionIds = removedCodes
        .map((code) => availablePermissionByCode.get(code)?.id)
        .filter((permissionId): permissionId is string =>
          Boolean(permissionId),
        );

      await tx.rolePermission.deleteMany({
        where: {
          roleId: role.id,
          permissionId: { in: removedPermissionIds },
        },
      });
    }

    if (addedCodes.length > 0) {
      await tx.rolePermission.createMany({
        data: addedCodes.map((code) => ({
          roleId: role.id,
          permissionId: availablePermissionByCode.get(code)!.id,
        })),
        skipDuplicates: true,
      });
    }

    for (const userId of affectedUserIds) {
      await touchUserPrivilegeEpoch(tx, userId, {
        requestedByUserId: session.user.id,
        reason: "Role permissions changed; invalidate active sessions.",
        sourceEventType: "role_permissions.changed",
        sourceRecordId: role.id,
      });
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType:
          source === "recommended_set"
            ? "role_permissions.recommended_applied"
            : "role_permissions.updated",
        entityType: "Role",
        entityId: role.id,
        beforeData: {
          roleCode: role.code,
          permissionCodes: currentCodes,
        },
        afterData: {
          roleCode: role.code,
          permissionCodes: normalizedNextCodes,
        },
        metadata: {
          reason,
          source,
          roleName: role.name,
          roleCode: role.code,
          addedCodes,
          removedCodes,
          sensitiveChanges,
          recommendedCodes,
          addedFromRecommended: normalizedNextCodes.filter(
            (code) => !recommendedCodeSet.has(code),
          ),
          removedFromRecommended: recommendedCodes.filter(
            (code) => !nextCodeSet.has(code),
          ),
        },
      },
    });
    return { deniedError: null };
  });
  const mutationOutcome = await rolePermissionMutation.catch(
    (error: unknown) => {
      if (isRolePermissionTransactionConflict(error)) {
        throw new Error("ROLE_PERMISSION_CONCURRENT_CHANGE");
      }
      throw error;
    },
  );
  if (mutationOutcome.deniedError) {
    throw new Error(mutationOutcome.deniedError);
  }
}

export async function updateRolePermissions(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanAdministerTenantRoles(session);
  const values = updateRolePermissionsSchema.parse(
    Object.fromEntries(formData),
  );
  const nextPermissionCodes = formData
    .getAll("permissionCodes")
    .map((value) => String(value));

  await updateRolePermissionCodes({
    session,
    roleId: values.roleId,
    nextPermissionCodes,
    reason: values.reason,
    source: "manual_override",
  });
}

export async function applyRecommendedRolePermissions(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanAdministerTenantRoles(session);
  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);
  const values = updateRolePermissionsSchema.parse(
    Object.fromEntries(formData),
  );

  const role = await prisma.role.findFirst({
    where: {
      id: values.roleId,
      tenantId: session.context.tenantId,
    },
    select: { code: true },
  });
  if (!role) {
    throw new Error("ROLE_NOT_FOUND");
  }

  const recommendedPermissionCodes = getRecommendedPermissionCodesForRole(
    role.code,
  );
  if (recommendedPermissionCodes.length === 0) {
    throw new Error("ROLE_RECOMMENDATION_NOT_CONFIGURED");
  }

  await updateRolePermissionCodes({
    session,
    roleId: values.roleId,
    nextPermissionCodes: recommendedPermissionCodes,
    reason: values.reason,
    source: "recommended_set",
  });
}

function toSafeJsonRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export async function getCoreAdminAuditEventDetail(
  session: SessionContext,
  auditEventId: string,
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  const canViewTenantAudit = (
    await getGrantedPermissionCodes(session)
  ).includes(permissions.tenantRoleAdminister);

  const event = await prisma.auditEvent.findFirst({
    where: {
      id: auditEventId,
      tenantId: session.context.tenantId,
      OR: [
        { companyId: session.context.companyId },
        ...(canViewTenantAudit ? [{ companyId: null }] : []),
      ],
    },
    include: {
      actor: true,
      company: true,
    },
  });

  if (!event) {
    return null;
  }

  return {
    id: event.id,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorName: event.actor?.displayName ?? "System",
    actorEmail: event.actor?.email ?? "",
    companyName:
      event.company?.tradingName ?? event.company?.legalName ?? "Tenant-wide",
    occurredAt: event.occurredAt.toISOString(),
    requestId: event.requestId,
    ipAddress: event.ipAddress,
    beforeData: toSafeJsonRecord(event.beforeData),
    afterData: toSafeJsonRecord(event.afterData),
    metadata: toSafeJsonRecord(event.metadata),
  };
}

export type CoreAdminAuditEventFilters = {
  query?: string;
  eventType?: string;
  entityType?: string;
  actor?: string;
  requestId?: string;
  occurredFrom?: string;
  occurredTo?: string;
};

function parsedDate(value?: string) {
  if (!value?.trim()) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsedEndOfDay(value?: string) {
  const date = parsedDate(value);
  if (!date) {
    return null;
  }
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function listCoreAdminAuditEvents(
  session: SessionContext,
  filters: CoreAdminAuditEventFilters = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  const canViewTenantAudit = (
    await getGrantedPermissionCodes(session)
  ).includes(permissions.tenantRoleAdminister);

  const query = filters.query?.trim();
  const eventType = filters.eventType?.trim();
  const entityType = filters.entityType?.trim();
  const actor = filters.actor?.trim();
  const requestId = filters.requestId?.trim();
  const occurredFrom = parsedDate(filters.occurredFrom);
  const occurredTo = parsedEndOfDay(filters.occurredTo);
  const queryConditions: AuditEventWhereInput[] = query
    ? [
        { eventType: { contains: query, mode: "insensitive" } },
        { entityType: { contains: query, mode: "insensitive" } },
        { requestId: { contains: query, mode: "insensitive" } },
        {
          actor: {
            is: { displayName: { contains: query, mode: "insensitive" } },
          },
        },
        {
          actor: {
            is: { email: { contains: query, mode: "insensitive" } },
          },
        },
        ...(isUuid(query) ? [{ entityId: query }] : []),
      ]
    : [];
  const where: AuditEventWhereInput = {
    tenantId: session.context.tenantId,
    OR: [
      { companyId: session.context.companyId },
      ...(canViewTenantAudit ? [{ companyId: null }] : []),
    ],
  };
  if (eventType) {
    where.eventType = { contains: eventType, mode: "insensitive" };
  }
  if (entityType) {
    where.entityType = { contains: entityType, mode: "insensitive" };
  }
  if (actor) {
    where.actor = {
      is: {
        OR: [
          { displayName: { contains: actor, mode: "insensitive" } },
          { email: { contains: actor, mode: "insensitive" } },
        ],
      },
    };
  }
  if (requestId) {
    where.requestId = { contains: requestId, mode: "insensitive" };
  }
  if (occurredFrom || occurredTo) {
    where.occurredAt = {
      ...(occurredFrom ? { gte: occurredFrom } : {}),
      ...(occurredTo ? { lte: occurredTo } : {}),
    };
  }
  if (queryConditions.length > 0) {
    where.AND = [{ OR: queryConditions }];
  }

  const events = await prisma.auditEvent.findMany({
    where,
    include: {
      actor: true,
      company: true,
    },
    orderBy: { occurredAt: "desc" },
    take: 500,
  });

  return events.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorName: event.actor?.displayName ?? "System",
    actorEmail: event.actor?.email ?? "",
    companyName:
      event.company?.tradingName ?? event.company?.legalName ?? "Tenant-wide",
    occurredAt: event.occurredAt.toISOString(),
    requestId: event.requestId ?? "",
    ipAddress: event.ipAddress ?? "",
  }));
}

export async function getCoreAdminPermissionDetail(
  session: SessionContext,
  permissionId: string,
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);

  const permission = await prisma.permission.findFirst({
    where: {
      id: permissionId,
      OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
    },
    include: {
      roles: {
        where: {
          role: {
            tenantId: session.context.tenantId,
          },
        },
        include: {
          role: {
            include: {
              assignments: {
                where: {
                  status: "ACTIVE",
                  user: {
                    tenantId: session.context.tenantId,
                  },
                },
                include: {
                  user: {
                    include: {
                      scopeAssignments: {
                        where: { status: "ACTIVE" },
                        orderBy: { startsAt: "asc" },
                      },
                    },
                  },
                },
                orderBy: { startsAt: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!permission) {
    return null;
  }

  return {
    id: permission.id,
    code: permission.code,
    module: permission.module,
    action: permission.action,
    description: permission.description,
    roles: permission.roles.map((rolePermission) => ({
      id: rolePermission.role.id,
      name: rolePermission.role.name,
      code: rolePermission.role.code,
      status: rolePermission.role.status,
      assignedUsers: rolePermission.role.assignments.map((assignment) => ({
        id: assignment.id,
        userId: assignment.userId,
        displayName: assignment.user.displayName,
        email: assignment.user.email,
        scopes: assignment.user.scopeAssignments.map((scope) => ({
          id: scope.id,
          type: scope.scopeType,
          accessLevel: scope.accessLevel,
        })),
      })),
    })),
  };
}

export async function getCoreAdminCompanyDetail(
  session: SessionContext,
  companyId: string,
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  if (companyId !== session.context.companyId) {
    return null;
  }

  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      tenantId: session.context.tenantId,
    },
    include: {
      brands: {
        orderBy: { name: "asc" },
      },
      locations: {
        orderBy: { name: "asc" },
      },
      approvalRules: {
        include: {
          steps: true,
        },
        orderBy: [{ isActive: "desc" }, { priority: "asc" }],
      },
    },
  });

  if (!company) {
    return null;
  }

  const [companyScopeAssignments, purchaseRequests, auditEvents] =
    await Promise.all([
      prisma.userScopeAssignment.findMany({
        where: {
          scopeType: "COMPANY",
          scopeId: company.id,
          status: "ACTIVE",
        },
        include: {
          user: {
            include: {
              roleAssignments: {
                where: { status: "ACTIVE" },
                include: { role: true },
              },
            },
          },
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.purchaseRequest.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: company.id,
        },
        include: {
          requester: true,
          requestLocation: true,
          lines: {
            orderBy: { lineNumber: "asc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.auditEvent.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: company.id,
        },
        include: {
          actor: true,
        },
        orderBy: { occurredAt: "desc" },
        take: 10,
      }),
    ]);

  return {
    id: company.id,
    legalName: company.legalName,
    tradingName: company.tradingName,
    displayName: company.tradingName ?? company.legalName,
    taxIdentifier: company.taxIdentifier,
    currencyCode: company.currencyCode,
    timezone: company.timezone,
    status: company.status,
    brands: company.brands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      code: brand.code,
      status: brand.status,
    })),
    locations: company.locations.map((location) => ({
      id: location.id,
      name: location.name,
      code: location.code,
      type: location.locationType,
      status: location.status,
    })),
    approvalRules: company.approvalRules.map((rule) => ({
      id: rule.id,
      transactionType: rule.transactionType,
      priority: rule.priority,
      isActive: rule.isActive,
      stepCount: rule.steps.length,
    })),
    assignedUsers: companyScopeAssignments.map((assignment) => ({
      id: assignment.id,
      displayName: assignment.user.displayName,
      email: assignment.user.email,
      accessLevel: assignment.accessLevel,
      roles: assignment.user.roleAssignments.map(
        (roleAssignment) => roleAssignment.role.name,
      ),
      startsAt: assignment.startsAt.toISOString(),
    })),
    purchaseRequests: purchaseRequests.map((request) => ({
      id: request.id,
      publicReference: request.publicReference,
      locationName: request.requestLocation.name,
      requesterName: request.requester.displayName,
      status: request.status,
      lineDescription: request.lines[0]?.description ?? "No line",
      createdAt: request.createdAt.toISOString(),
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorName: event.actor?.displayName ?? "System",
      occurredAt: event.occurredAt.toISOString(),
    })),
  };
}
