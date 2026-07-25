import { Prisma, prisma, type TransactionClient } from "@ogfi/database";
import { createHash } from "node:crypto";
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

const coreAdminLocationPageInputSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  query: z.string().trim().max(120).default(""),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  locationType: z
    .enum([
      "BRANCH",
      "WAREHOUSE",
      "COMMISSARY",
      "CENTRAL_KITCHEN",
      "HEAD_OFFICE",
      "PROJECT_SITE",
      "TEMPORARY_SITE",
    ])
    .optional(),
});

const coreAdminBrandPageInputSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  query: z.string().trim().max(120).default(""),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

const coreAdminDepartmentPageInputSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  query: z.string().trim().max(120).default(""),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

const coreAdminApprovalRulePageInputSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  query: z.string().trim().max(120).default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
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
  client: typeof prisma | TransactionClient = prisma,
) {
  const now = new Date();
  const locations = await client.location.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const assignment = await client.userScopeAssignment.findFirst({
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
    effectiveRolePreviewCapped: boolean;
    currentAccessState: "CURRENT" | "INACTIVE_USER" | "NO_CURRENT_ACCESS";
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
  const effectiveNow = new Date();
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
  const [totalItems, activeItems] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { ...where, status: "ACTIVE" as NonNullable<Prisma.UserWhereInput["status"]> } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(totalItems / values.pageSize));
  const page = Math.min(values.page, pageCount);
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      displayName: true,
      email: true,
      status: true,
      roleAssignments: {
        where: {
          status: "ACTIVE",
          startsAt: { lte: effectiveNow },
          OR: [{ endsAt: null }, { endsAt: { gt: effectiveNow } }],
          role: {
            status: "ACTIVE",
            OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
          },
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: 9,
        select: { role: { select: { name: true } } },
      },
    },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    skip: (page - 1) * values.pageSize,
    take: values.pageSize,
  });
  return {
    items: users.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      roles: user.status === "ACTIVE" ? user.roleAssignments.slice(0, 8).map((assignment) => assignment.role.name) : [],
      effectiveRolePreviewCapped: user.status === "ACTIVE" && user.roleAssignments.length > 8,
      currentAccessState: user.status !== "ACTIVE"
        ? "INACTIVE_USER"
        : user.roleAssignments.length > 0
          ? "CURRENT"
          : "NO_CURRENT_ACCESS",
    })),
    page,
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

function tenantGlobalPermissionWhere(tenantId: string): Prisma.PermissionWhereInput {
  return { OR: [{ tenantId }, { tenantId: null }] };
}

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
        permission: {
          code: { in: coreAdminHighAccessPermissionCodes },
          OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
        },
      },
    },
  };
  const [totalItems, activeItems, highAccessItems] = await Promise.all([
    prisma.role.count({ where }),
    prisma.role.count({ where: { ...where, status: "ACTIVE" } }),
    prisma.role.count({ where: { ...where, ...highAccessPredicate } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(totalItems / values.pageSize));
  const page = Math.min(values.page, pageCount);
  const roles = await prisma.role.findMany({
    where,
    select: {
      id: true,
      name: true,
      code: true,
      systemRole: true,
      status: true,
      permissions: {
        where: { permission: { OR: [{ tenantId: session.context.tenantId }, { tenantId: null }] } },
        take: 3,
        orderBy: { permission: { code: "asc" } },
        select: { permission: { select: { id: true, code: true } } },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (page - 1) * values.pageSize,
    take: values.pageSize,
  });
  const permissionCounts = roles.length === 0
    ? []
    : await prisma.rolePermission.groupBy({
        by: ["roleId"],
        where: {
          roleId: { in: roles.map((role) => role.id) },
          permission: { OR: [{ tenantId: session.context.tenantId }, { tenantId: null }] },
        },
        _count: { roleId: true },
      });
  const permissionCountByRoleId = new Map(permissionCounts.map((entry) => [entry.roleId, entry._count.roleId]));
  return {
    items: roles.map((role) => ({
      id: role.id,
      name: role.name,
      code: role.code,
      systemRole: role.systemRole,
      status: role.status,
      canAssignDirectly: isDirectlyAssignableRole(role),
      assignmentEligibility: roleAssignmentRiskLabel(role),
      permissionCount: permissionCountByRoleId.get(role.id) ?? 0,
      permissionPreview: role.permissions.map((rolePermission) => ({
        id: rolePermission.permission.id,
        code: rolePermission.permission.code,
        label: getPermissionPresentation(rolePermission.permission.code).label,
      })),
    })),
    page,
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

export type CoreAdminLocationPage = {
  items: Array<{
    id: string;
    companyId: string;
    companyName: string;
    brandId: string | null;
    brandName: string;
    code: string;
    name: string;
    type: string;
    timezone: string;
    status: string;
  }>;
  page: number;
  pageSize: number;
  totalItems: number;
  activeItems: number;
};

async function listCoreAdminLocationPageAuthorized(
  session: SessionContext,
  input: z.input<typeof coreAdminLocationPageInputSchema> = {},
): Promise<CoreAdminLocationPage> {
  const values = coreAdminLocationPageInputSchema.parse(input);
  const query = values.query.toLowerCase();
  const where: Prisma.LocationWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(values.status ? { status: values.status } : {}),
    ...(values.locationType ? { locationType: values.locationType } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { code: { contains: query, mode: "insensitive" as const } },
            { brand: { name: { contains: query, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const [totalItems, activeItems] = await Promise.all([
    prisma.location.count({ where }),
    prisma.location.count({ where: { ...where, status: "ACTIVE" } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(totalItems / values.pageSize));
  const page = Math.min(values.page, pageCount);
  const locations = await prisma.location.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      brandId: true,
      code: true,
      name: true,
      locationType: true,
      timezone: true,
      status: true,
      company: { select: { legalName: true, tradingName: true } },
      brand: { select: { name: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (page - 1) * values.pageSize,
    take: values.pageSize,
  });
  return {
    items: locations.map((location) => ({
      id: location.id,
      companyId: location.companyId,
      companyName: location.company.tradingName ?? location.company.legalName,
      brandId: location.brandId,
      brandName: location.brand?.name ?? "Company-wide",
      code: location.code,
      name: location.name,
      type: location.locationType,
      timezone: location.timezone,
      status: location.status,
    })),
    page,
    pageSize: values.pageSize,
    totalItems,
    activeItems,
  };
}

async function listCoreAdminLocationOptionsAuthorized(session: SessionContext) {
  const where = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    status: "ACTIVE" as const,
  };
  const [totalItems, options] = await Promise.all([
    prisma.location.count({ where }),
    prisma.location.findMany({
      where,
      select: { id: true, name: true, code: true, locationType: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 100,
    }),
  ]);
  return {
    items: options,
    totalItems,
    hasMore: totalItems > options.length,
  };
}

export type CoreAdminBrandPage = {
  items: Array<{
    id: string;
    companyId: string;
    companyName: string;
    code: string;
    name: string;
    status: string;
  }>;
  page: number;
  pageSize: number;
  totalItems: number;
  activeItems: number;
};

async function listCoreAdminBrandPageAuthorized(
  session: SessionContext,
  input: z.input<typeof coreAdminBrandPageInputSchema> = {},
): Promise<CoreAdminBrandPage> {
  const values = coreAdminBrandPageInputSchema.parse(input);
  const query = values.query.toLowerCase();
  const where: Prisma.BrandWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(values.status ? { status: values.status } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { code: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [totalItems, activeItems] = await Promise.all([
    prisma.brand.count({ where }),
    prisma.brand.count({ where: { ...where, status: "ACTIVE" } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(totalItems / values.pageSize));
  const page = Math.min(values.page, pageCount);
  const brands = await prisma.brand.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      code: true,
      name: true,
      status: true,
      company: { select: { legalName: true, tradingName: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (page - 1) * values.pageSize,
    take: values.pageSize,
  });
  return {
    items: brands.map((brand) => ({
      id: brand.id,
      companyId: brand.companyId,
      companyName: brand.company.tradingName ?? brand.company.legalName,
      code: brand.code,
      name: brand.name,
      status: brand.status,
    })),
    page,
    pageSize: values.pageSize,
    totalItems,
    activeItems,
  };
}

async function listCoreAdminBrandOptionsAuthorized(session: SessionContext) {
  const where = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    status: "ACTIVE" as const,
  };
  const [totalItems, options] = await Promise.all([
    prisma.brand.count({ where }),
    prisma.brand.findMany({
      where,
      select: { id: true, name: true, code: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 100,
    }),
  ]);
  return {
    items: options,
    totalItems,
    hasMore: totalItems > options.length,
  };
}

export type CoreAdminDepartmentPage = {
  items: Array<{
    id: string;
    companyId: string;
    companyName: string;
    code: string;
    name: string;
    status: string;
    budgetCount: number;
    budgetLineCount: number;
    costCenterCount: number;
  }>;
  page: number;
  pageSize: number;
  totalItems: number;
  activeItems: number;
};

async function listCoreAdminDepartmentPageAuthorized(
  session: SessionContext,
  input: z.input<typeof coreAdminDepartmentPageInputSchema> = {},
): Promise<CoreAdminDepartmentPage> {
  const values = coreAdminDepartmentPageInputSchema.parse(input);
  const query = values.query.toLowerCase();
  const where: Prisma.DepartmentWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(values.status ? { status: values.status } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { code: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [totalItems, activeItems] = await Promise.all([
    prisma.department.count({ where }),
    prisma.department.count({ where: { ...where, status: "ACTIVE" } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(totalItems / values.pageSize));
  const page = Math.min(values.page, pageCount);
  const departments = await prisma.department.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      name: true,
      code: true,
      status: true,
      company: { select: { legalName: true, tradingName: true } },
      _count: { select: { budgets: true, budgetLines: true, costCenters: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (page - 1) * values.pageSize,
    take: values.pageSize,
  });
  return {
    items: departments.map((department) => ({
      id: department.id,
      companyId: department.companyId,
      companyName: department.company.tradingName ?? department.company.legalName,
      name: department.name,
      code: department.code,
      status: department.status,
      budgetCount: department._count.budgets,
      budgetLineCount: department._count.budgetLines,
      costCenterCount: department._count.costCenters,
    })),
    page,
    pageSize: values.pageSize,
    totalItems,
    activeItems,
  };
}

export type CoreAdminApprovalRulePage = {
  items: Array<{
    id: string;
    transactionType: string;
    companyName: string;
    priority: number;
    isActive: boolean;
    stepCount: number;
    stepPreview: string[];
  }>;
  page: number;
  pageSize: number;
  totalItems: number;
  activeItems: number;
};

async function listCoreAdminApprovalRulePageAuthorized(
  session: SessionContext,
  input: z.input<typeof coreAdminApprovalRulePageInputSchema> = {},
): Promise<CoreAdminApprovalRulePage> {
  const values = coreAdminApprovalRulePageInputSchema.parse(input);
  const query = values.query.toLowerCase();
  const where: Prisma.ApprovalRuleWhereInput = {
    tenantId: session.context.tenantId,
    OR: [{ companyId: session.context.companyId }, { companyId: null }],
    ...(values.status ? { isActive: values.status === "ACTIVE" } : {}),
    ...(query
      ? { transactionType: { contains: query, mode: "insensitive" as const } }
      : {}),
  };
  const [totalItems, activeItems] = await Promise.all([
    prisma.approvalRule.count({ where }),
    prisma.approvalRule.count({ where: { ...where, isActive: true } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(totalItems / values.pageSize));
  const page = Math.min(values.page, pageCount);
  const rules = await prisma.approvalRule.findMany({
    where,
    select: {
      id: true,
      transactionType: true,
      priority: true,
      isActive: true,
      company: { select: { legalName: true, tradingName: true } },
      _count: { select: { steps: true } },
      steps: {
        orderBy: { stepOrder: "asc" },
        take: 3,
        select: { stepOrder: true, approverType: true },
      },
    },
    orderBy: [{ isActive: "desc" }, { priority: "asc" }, { id: "asc" }],
    skip: (page - 1) * values.pageSize,
    take: values.pageSize,
  });
  return {
    items: rules.map((rule) => ({
      id: rule.id,
      transactionType: rule.transactionType,
      companyName: rule.company?.tradingName ?? rule.company?.legalName ?? "Tenant-wide",
      priority: rule.priority,
      isActive: rule.isActive,
      stepCount: rule._count.steps,
      stepPreview: rule.steps.map((step) => `Step ${step.stepOrder}: ${step.approverType}`),
    })),
    page,
    pageSize: values.pageSize,
    totalItems,
    activeItems,
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

export async function listCoreAdminLocationPage(
  session: SessionContext,
  input: z.input<typeof coreAdminLocationPageInputSchema> = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  return listCoreAdminLocationPageAuthorized(session, input);
}

export async function listCoreAdminLocationOptions(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  return listCoreAdminLocationOptionsAuthorized(session);
}

export async function listCoreAdminBrandPage(
  session: SessionContext,
  input: z.input<typeof coreAdminBrandPageInputSchema> = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  return listCoreAdminBrandPageAuthorized(session, input);
}

export async function listCoreAdminBrandOptions(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  return listCoreAdminBrandOptionsAuthorized(session);
}

export async function listCoreAdminDepartmentPage(
  session: SessionContext,
  input: z.input<typeof coreAdminDepartmentPageInputSchema> = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  return listCoreAdminDepartmentPageAuthorized(session, input);
}

export async function listCoreAdminApprovalRulePage(
  session: SessionContext,
  input: z.input<typeof coreAdminApprovalRulePageInputSchema> = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  return listCoreAdminApprovalRulePageAuthorized(session, input);
}

export type CoreAdminOverviewTab = "users" | "roles" | "organization" | "approval-rules" | "audit";
export type CoreAdminOrganizationSection = "companies" | "brands" | "departments" | "locations";

type CoreAdminRoleOptions = Awaited<ReturnType<typeof listCoreAdminRoleOptionsAuthorized>>;

const emptyCoreAdminUserPage = (): CoreAdminUserPage => ({ items: [], page: 1, pageSize: 25, totalItems: 0, activeItems: 0 });
const emptyCoreAdminRolePage = (): CoreAdminRolePage => ({ items: [], page: 1, pageSize: 25, totalItems: 0, activeItems: 0, highAccessItems: 0 });
const emptyCoreAdminBrandPage = (): CoreAdminBrandPage => ({ items: [], page: 1, pageSize: 25, totalItems: 0, activeItems: 0 });
const emptyCoreAdminLocationPage = (): CoreAdminLocationPage => ({ items: [], page: 1, pageSize: 25, totalItems: 0, activeItems: 0 });
const emptyCoreAdminDepartmentPage = (): CoreAdminDepartmentPage => ({ items: [], page: 1, pageSize: 25, totalItems: 0, activeItems: 0 });
const emptyCoreAdminApprovalRulePage = (): CoreAdminApprovalRulePage => ({ items: [], page: 1, pageSize: 25, totalItems: 0, activeItems: 0 });

export async function getCoreAdminOverview(
  session: SessionContext,
  userPageInput: z.input<typeof coreAdminUserPageInputSchema> = {},
  rolePageInput: z.input<typeof coreAdminRolePageInputSchema> = {},
  brandPageInput: z.input<typeof coreAdminBrandPageInputSchema> = {},
  locationPageInput: z.input<typeof coreAdminLocationPageInputSchema> = {},
  departmentPageInput: z.input<typeof coreAdminDepartmentPageInputSchema> = {},
  approvalRulePageInput: z.input<typeof coreAdminApprovalRulePageInputSchema> = {},
  options: { activeTab?: CoreAdminOverviewTab; organizationSection?: CoreAdminOrganizationSection } = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);

  const activeTab = options.activeTab ?? "users";
  const organizationSection = options.organizationSection ?? "companies";
  const [userPage, rolePage, roleOptions, brandPage, locationPage, departmentPage, approvalRulePage] = await Promise.all([
    activeTab === "users" ? listCoreAdminUserPageAuthorized(session, userPageInput) : Promise.resolve(emptyCoreAdminUserPage()),
    activeTab === "roles" ? listCoreAdminRolePageAuthorized(session, rolePageInput) : Promise.resolve(emptyCoreAdminRolePage()),
    activeTab === "users" ? listCoreAdminRoleOptionsAuthorized(session) : Promise.resolve({ items: [], totalItems: 0, hasMore: false } satisfies CoreAdminRoleOptions),
    activeTab === "organization" && organizationSection === "brands" ? listCoreAdminBrandPageAuthorized(session, brandPageInput) : Promise.resolve(emptyCoreAdminBrandPage()),
    activeTab === "organization" && organizationSection === "locations" ? listCoreAdminLocationPageAuthorized(session, locationPageInput) : Promise.resolve(emptyCoreAdminLocationPage()),
    activeTab === "organization" && organizationSection === "departments" ? listCoreAdminDepartmentPageAuthorized(session, departmentPageInput) : Promise.resolve(emptyCoreAdminDepartmentPage()),
    activeTab === "approval-rules" ? listCoreAdminApprovalRulePageAuthorized(session, approvalRulePageInput) : Promise.resolve(emptyCoreAdminApprovalRulePage()),
  ]);

  const [
    tenant,
    companies,
  ] = await Promise.all([
    prisma.tenant.findFirst({
      where: { id: session.context.tenantId },
      select: {
        name: true,
        defaultTimezone: true,
        status: true,
      },
    }),
    activeTab === "organization" && (organizationSection === "companies" || organizationSection === "brands" || organizationSection === "departments" || organizationSection === "locations") ? prisma.company.findMany({
      where: {
        tenantId: session.context.tenantId,
        id: session.context.companyId,
      },
      orderBy: { legalName: "asc" },
    }) : Promise.resolve([]),
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
    brands: brandPage.items,
    brandPage,
    departments: departmentPage.items,
    departmentPage,
    locations: locationPage.items,
    locationPage,
    approvalRules: approvalRulePage.items.map((rule) => ({
      ...rule,
      stepSummary: rule.stepPreview.join(", "),
    })),
    approvalRulePage,
    recentAuditEvents: [],
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
  options: {
    locationQuery?: string;
    roleQuery?: string;
    assignedRoleQuery?: string;
    assignedRolePage?: number;
    assignedRolePageSize?: number;
    rolePage?: number;
    rolePageSize?: number;
    permissionPage?: number;
    permissionPageSize?: number;
    permissionQuery?: string;
    scopeRequestPage?: number;
    scopeRequestPageSize?: number;
    scopeRequestStatus?: "PENDING" | "APPROVED" | "REJECTED";
    requestKind?: "scope" | "role" | "none";
    roleRequestPage?: number;
    roleRequestPageSize?: number;
    roleRequestStatus?: "PENDING" | "APPROVED" | "REJECTED";
    userAccessSection?: "overview" | "roles" | "scopes" | "requests" | "audit";
  } = {},
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
      roleAssignments: false,
    },
  });

  if (!user) {
    return null;
  }

  const loadRoleSurface =
    options.userAccessSection === undefined ||
    options.userAccessSection === "overview" ||
    options.userAccessSection === "roles";
  const rolePageSize = Math.min(25, Math.max(10, Math.floor(options.assignedRolePageSize ?? options.rolePageSize ?? 25)));
  const assignedRoleQuery = (options.assignedRoleQuery ?? options.roleQuery)?.trim() ?? "";
  const permissionPageSize = Math.min(100, Math.max(10, Math.floor(options.permissionPageSize ?? 25)));
  const permissionQuery = options.permissionQuery?.trim().slice(0, 120) ?? "";
  const effectiveNow = new Date();
  const roleAssignmentWhere: Prisma.UserRoleAssignmentWhereInput = {
    userId: user.id,
    status: "ACTIVE",
    role: { AND: [{ OR: [{ tenantId: session.context.tenantId }, { tenantId: null }] }], ...(assignedRoleQuery ? { OR: [{ name: { contains: assignedRoleQuery, mode: "insensitive" } }, { code: { contains: assignedRoleQuery, mode: "insensitive" } }] } : {}) },
  };
  const effectivePermissionBaseWhere: Prisma.PermissionWhereInput = {
    OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
    roles: { some: { role: { status: "ACTIVE", OR: [{ tenantId: session.context.tenantId }, { tenantId: null }], assignments: { some: { userId: user.id, status: "ACTIVE", startsAt: { lte: effectiveNow }, OR: [{ endsAt: null }, { endsAt: { gt: effectiveNow } }] } } } } },
  };
  const effectivePermissionWhere: Prisma.PermissionWhereInput = permissionQuery
    ? { AND: [effectivePermissionBaseWhere, { code: { contains: permissionQuery, mode: "insensitive" } }] }
    : effectivePermissionBaseWhere;
  const [activeRoleCount, effectivePermissionTotal, filteredPermissionTotal] = await Promise.all([
    loadRoleSurface ? prisma.userRoleAssignment.count({ where: roleAssignmentWhere }) : Promise.resolve(0),
    loadRoleSurface ? prisma.permission.count({ where: effectivePermissionBaseWhere }) : Promise.resolve(0),
    loadRoleSurface ? prisma.permission.count({ where: effectivePermissionWhere }) : Promise.resolve(0),
  ]);
  const permissionPageCount = Math.max(1, Math.ceil(filteredPermissionTotal / permissionPageSize));
  const permissionPage = Math.min(Math.max(1, Math.floor(options.permissionPage ?? 1)), permissionPageCount);
  const effectivePermissionRows = loadRoleSurface
    ? await prisma.permission.findMany({
        where: effectivePermissionWhere,
        select: { id: true, code: true },
        orderBy: [{ code: "asc" }, { id: "asc" }],
        skip: options.userAccessSection === "roles" ? (permissionPage - 1) * permissionPageSize : 0,
        take: options.userAccessSection === "roles" ? permissionPageSize : 13,
      })
    : [];
  const rolePageCount = Math.max(1, Math.ceil(activeRoleCount / rolePageSize));
  const rolePage = Math.min(Math.max(1, Math.floor(options.assignedRolePage ?? options.rolePage ?? 1)), rolePageCount);
  const roleAssignments = loadRoleSurface
    ? await prisma.userRoleAssignment.findMany({
        where: roleAssignmentWhere,
        select: { id: true, startsAt: true, endsAt: true, role: { select: { id: true, name: true, code: true, status: true } } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        skip: (rolePage - 1) * rolePageSize,
        take: rolePageSize,
      })
    : [];

  const permissionCodes = Array.from(
    new Set(
      effectivePermissionRows.map((permission) => permission.code),
    ),
  );
  const permissionIdByCode = new Map(effectivePermissionRows.map((permission) => [permission.code, permission.id]));
  const roleQuery = options.roleQuery?.trim().toLowerCase() ?? "";
  const locationQuery = options.locationQuery?.trim().toLowerCase() ?? "";
  const scopeRequestPage = Math.min(Math.max(options.scopeRequestPage ?? 1, 1), 10_000);
  const scopeRequestPageSize = Math.min(Math.max(options.scopeRequestPageSize ?? 25, 10), 100);
  const roleRequestPage = Math.min(Math.max(options.roleRequestPage ?? 1, 1), 10_000);
  const roleRequestPageSize = Math.min(Math.max(options.roleRequestPageSize ?? 25, 10), 100);
  const loadRoleCatalog =
    options.userAccessSection === undefined ||
    options.userAccessSection === "roles" ||
    (options.userAccessSection === "requests" && options.requestKind === "role");
  const loadLocationCatalog =
    options.userAccessSection === undefined ||
    options.userAccessSection === "scopes" ||
    (options.userAccessSection === "requests" && options.requestKind === "scope");
  const sensitivePermissionCodes = Object.values(permissions).filter(isSensitivePermissionCode);
  const roleCatalogBasePredicate = Prisma.sql`
    FROM "Role" r
    WHERE r."tenantId" = ${session.context.tenantId}
      AND r.status = 'ACTIVE'
      AND (${roleQuery} = '' OR r.name ILIKE '%' || ${roleQuery} || '%' OR r.code ILIKE '%' || ${roleQuery} || '%')
      AND NOT EXISTS (
        SELECT 1 FROM "UserRoleAssignment" ura
        WHERE ura."roleId" = r.id AND ura."userId" = ${user.id} AND ura.status = 'ACTIVE'
      )
      AND NOT EXISTS (
        SELECT 1 FROM "SensitiveRoleRequest" srr
        WHERE srr."roleId" = r.id AND srr."tenantId" = ${session.context.tenantId}
          AND srr."companyId" = ${session.context.companyId}
          AND srr."targetUserId" = ${user.id} AND srr.status = 'PENDING'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "ApprovalRuleStep" ars
        JOIN "ApprovalRule" ar ON ar.id = ars."approvalRuleId"
        WHERE ars."roleId" = r.id AND ar."tenantId" = ${session.context.tenantId} AND ar."isActive" = true
      )
  `;
  const permissionSensitivePredicate = Prisma.sql`(
    p.code IN (${Prisma.join(sensitivePermissionCodes)})
    OR p.code ILIKE '%approve%'
    OR p.code ILIKE '%post%'
    OR p.code ILIKE '%reverse%'
  )`;
  const directRolePredicate = Prisma.sql`
    AND (r.code IN (${Prisma.join(Array.from(assignableNonSensitiveRoleCodes))}) OR r."systemRole" = false)
    AND NOT EXISTS (
      SELECT 1 FROM "RolePermission" rp
      JOIN "Permission" p ON p.id = rp."permissionId"
      WHERE rp."roleId" = r.id AND ${permissionSensitivePredicate}
    )
  `;
  const sensitiveRolePredicate = Prisma.sql`
    AND (
      (r."systemRole" = true AND r.code NOT IN (${Prisma.join(Array.from(assignableNonSensitiveRoleCodes))}))
      OR EXISTS (
        SELECT 1 FROM "RolePermission" rp
        JOIN "Permission" p ON p.id = rp."permissionId"
        WHERE rp."roleId" = r.id AND ${permissionSensitivePredicate}
      )
    )
  `;
  const [assignableRoleTotal, assignableRoles, sensitiveRoleTotal, sensitiveRoles] = await Promise.all([
    loadRoleCatalog ? prisma.$queryRaw<Array<{ totalItems: number }>>`SELECT COUNT(*)::int AS "totalItems" ${roleCatalogBasePredicate} ${directRolePredicate}`.then((rows) => rows[0]?.totalItems ?? 0) : Promise.resolve(0),
    loadRoleCatalog ? prisma.$queryRaw<Array<{ id: string; name: string; code: string; systemRole: boolean }>>`SELECT r.id, r.name, r.code, r."systemRole" ${roleCatalogBasePredicate} ${directRolePredicate} ORDER BY r.name ASC, r.id ASC LIMIT 100` : Promise.resolve([]),
    loadRoleCatalog ? prisma.$queryRaw<Array<{ totalItems: number }>>`SELECT COUNT(*)::int AS "totalItems" ${roleCatalogBasePredicate} ${sensitiveRolePredicate}`.then((rows) => rows[0]?.totalItems ?? 0) : Promise.resolve(0),
    loadRoleCatalog ? prisma.$queryRaw<Array<{ id: string; name: string; code: string; systemRole: boolean }>>`SELECT r.id, r.name, r.code, r."systemRole" ${roleCatalogBasePredicate} ${sensitiveRolePredicate} ORDER BY r.name ASC, r.id ASC LIMIT 100` : Promise.resolve([]),
  ]);
  const requestableSensitiveRoleCatalogHasMore = sensitiveRoleTotal > sensitiveRoles.length;
  const scopeRequestWhere: Prisma.HighRiskScopeRequestWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    targetUserId: user.id,
    ...(options.scopeRequestStatus
      ? { status: options.scopeRequestStatus }
      : { status: { in: ["PENDING", "APPROVED", "REJECTED"] } }),
  };
  const roleRequestWhere: Prisma.SensitiveRoleRequestWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    targetUserId: user.id,
    ...(options.roleRequestStatus
      ? { status: options.roleRequestStatus }
      : { status: { in: ["PENDING", "APPROVED", "REJECTED"] } }),
  };
  const loadScopeRequests = options.requestKind === undefined || options.requestKind === "scope";
  const loadRoleRequests = options.requestKind === undefined || options.requestKind === "role";
  let [scopeRequestTotal, highRiskScopeRequests, roleRequestTotal, sensitiveRoleRequests] =
    await Promise.all([
      loadScopeRequests ? prisma.highRiskScopeRequest.count({ where: scopeRequestWhere }) : Promise.resolve(0),
      loadScopeRequests
        ? prisma.highRiskScopeRequest.findMany({
            where: scopeRequestWhere,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (scopeRequestPage - 1) * scopeRequestPageSize,
            take: scopeRequestPageSize,
          })
        : Promise.resolve([]),
      loadRoleRequests ? prisma.sensitiveRoleRequest.count({ where: roleRequestWhere }) : Promise.resolve(0),
      loadRoleRequests
        ? prisma.sensitiveRoleRequest.findMany({
            where: roleRequestWhere,
            include: {
              role: {
                include: {
                permissions: {
                    orderBy: { permission: { code: "asc" } },
                    take: 7,
                    include: { permission: true },
                  },
                  _count: { select: { permissions: true } },
                },
              },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (roleRequestPage - 1) * roleRequestPageSize,
            take: roleRequestPageSize,
          })
        : Promise.resolve([]),
    ]);
  const resolvedScopeRequestPage = Math.min(scopeRequestPage, Math.max(1, Math.ceil(scopeRequestTotal / scopeRequestPageSize)));
  const resolvedRoleRequestPage = Math.min(roleRequestPage, Math.max(1, Math.ceil(roleRequestTotal / roleRequestPageSize)));
  if (loadScopeRequests && resolvedScopeRequestPage !== scopeRequestPage) {
    highRiskScopeRequests = await prisma.highRiskScopeRequest.findMany({
      where: scopeRequestWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (resolvedScopeRequestPage - 1) * scopeRequestPageSize,
      take: scopeRequestPageSize,
    });
  }
  if (loadRoleRequests && resolvedRoleRequestPage !== roleRequestPage) {
    sensitiveRoleRequests = await prisma.sensitiveRoleRequest.findMany({
      where: roleRequestWhere,
      include: {
        role: {
          include: {
            permissions: {
              orderBy: { permission: { code: "asc" } },
              take: 7,
              include: { permission: true },
            },
            _count: { select: { permissions: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (resolvedRoleRequestPage - 1) * roleRequestPageSize,
      take: roleRequestPageSize,
    });
  }
  const referencedLocationIds = Array.from(
    new Set([
      ...highRiskScopeRequests.map((request) => request.locationId),
    ]),
  );
  const highRiskLocationTypeValues = Array.from(highRiskLocationTypes);
  const locationCatalogPredicate = Prisma.sql`
    FROM "Location" l
    WHERE l."tenantId" = ${session.context.tenantId}
      AND l."companyId" = ${session.context.companyId}
      AND l.status = 'ACTIVE'
      AND (${locationQuery} = '' OR l.name ILIKE '%' || ${locationQuery} || '%' OR COALESCE(l.code, '') ILIKE '%' || ${locationQuery} || '%')
      AND NOT EXISTS (
        SELECT 1 FROM "UserScopeAssignment" usa
        WHERE usa."userId" = ${user.id} AND usa.status = 'ACTIVE'
          AND usa."scopeType" = 'LOCATION' AND usa."scopeId" = l.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM "HighRiskScopeRequest" hrr
        WHERE hrr."tenantId" = ${session.context.tenantId}
          AND hrr."companyId" = ${session.context.companyId}
          AND hrr."targetUserId" = ${user.id}
          AND hrr."locationId" = l.id AND hrr.status = 'PENDING'
      )
  `;
  const directLocationPredicate = Prisma.sql`${locationCatalogPredicate} AND l."locationType"::text NOT IN (${Prisma.join(highRiskLocationTypeValues)})`;
  const controlledLocationPredicate = Prisma.sql`${locationCatalogPredicate} AND l."locationType"::text IN (${Prisma.join(highRiskLocationTypeValues)})`;
  const [directLocationTotal, directLocationCatalog, controlledLocationTotal, controlledLocationCatalog, referencedLocations] =
    await Promise.all([
      loadLocationCatalog ? prisma.$queryRaw<Array<{ totalItems: number }>>`SELECT COUNT(*)::int AS "totalItems" ${directLocationPredicate}`.then((rows) => rows[0]?.totalItems ?? 0) : Promise.resolve(0),
      loadLocationCatalog ? prisma.$queryRaw<Array<{ id: string; name: string; code: string | null; locationType: string }>>`SELECT l.id, l.name, l.code, l."locationType"::text AS "locationType" ${directLocationPredicate} ORDER BY l.name ASC, l.id ASC LIMIT 100` : Promise.resolve([]),
      loadLocationCatalog ? prisma.$queryRaw<Array<{ totalItems: number }>>`SELECT COUNT(*)::int AS "totalItems" ${controlledLocationPredicate}`.then((rows) => rows[0]?.totalItems ?? 0) : Promise.resolve(0),
      loadLocationCatalog ? prisma.$queryRaw<Array<{ id: string; name: string; code: string | null; locationType: string }>>`SELECT l.id, l.name, l.code, l."locationType"::text AS "locationType" ${controlledLocationPredicate} ORDER BY l.name ASC, l.id ASC LIMIT 100` : Promise.resolve([]),
      referencedLocationIds.length
        ? prisma.location.findMany({
            where: {
              id: { in: referencedLocationIds },
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
            },
            select: { id: true, name: true, code: true, locationType: true },
          })
        : Promise.resolve([]),
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
    [...referencedLocations, ...directLocationCatalog, ...controlledLocationCatalog].map((location) => [location.id, location]),
  );
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    roles: roleAssignments.map((assignment) => ({
      id: assignment.role.id,
      roleId: assignment.role.id,
      assignmentId: assignment.id,
      name: assignment.role.name,
      code: assignment.role.code,
      status: assignment.role.status,
      canMutate: isAssignableNonSensitiveRole(assignment.role.code),
      startsAt: assignment.startsAt.toISOString(),
      endsAt: assignment.endsAt?.toISOString() ?? null,
      effectiveState: assignment.startsAt > effectiveNow
        ? "FUTURE"
        : assignment.endsAt && assignment.endsAt <= effectiveNow
          ? "EXPIRED"
          : "CURRENT",
    })),
    rolesPage: {
      page: rolePage,
      pageSize: rolePageSize,
      totalItems: activeRoleCount,
      totalPages: rolePageCount,
      query: assignedRoleQuery,
    },
    scopes: [],
    assignableLocations: directLocationCatalog.map((location) => ({
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
    controlledLocationCatalog: controlledLocationCatalog.map((location) => ({
      id: location.id,
      name: location.name,
      code: location.code,
      type: location.locationType,
      assignmentEligibility: getLocationScopeRiskLabel(location),
      directAssignable: false,
    })),
    highRiskScopeRequests: highRiskScopeRequests.map((request) => {
      const location = allActiveLocationDisplay.get(request.locationId);
      const reviewContextVisible = request.status === "PENDING";
      return {
        id: request.id,
        status: request.status,
        accessLevel: request.accessLevel,
        reason: reviewContextVisible ? request.reason : null,
        evidenceReference: reviewContextVisible ? request.evidenceReference : null,
        reviewReason: reviewContextVisible ? request.reviewReason : null,
        reasonRecorded: Boolean(request.reason),
        evidenceRecorded: Boolean(request.evidenceReference),
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
    highRiskScopeRequestPage: {
      page: resolvedScopeRequestPage,
      pageSize: scopeRequestPageSize,
      totalItems: scopeRequestTotal,
    },
    canMutateScopes: user.id !== session.user.id,
    canMutateRoles: user.id !== session.user.id,
    assignableRoles: assignableRoles
      .map((role) => ({
        id: role.id,
        name: role.name,
        code: role.code,
        assignmentEligibility: "Available for quick setup",
      })),
    requestableSensitiveRoles: sensitiveRoles
      .map((role) => ({
        id: role.id,
        name: role.name,
        code: role.code,
        assignmentEligibility: role.systemRole
          ? "System/admin role requires controlled approval"
          : "Sensitive permissions require controlled approval",
      })),
    assignableLocationCatalogHasMore: directLocationTotal > directLocationCatalog.length,
    controlledLocationCatalogHasMore: controlledLocationTotal > controlledLocationCatalog.length,
    assignableRoleCatalogHasMore: assignableRoleTotal > assignableRoles.length,
    requestableSensitiveRoleCatalogHasMore,
    sensitiveRoleRequests: sensitiveRoleRequests.map((request) => ({
      ...(() => {
        const reviewContextVisible = request.status === "PENDING";
        return {
          reason: reviewContextVisible ? request.reason : null,
          evidenceReference: reviewContextVisible ? request.evidenceReference : null,
          reviewReason: reviewContextVisible ? request.reviewReason : null,
          reasonRecorded: Boolean(request.reason),
          evidenceRecorded: Boolean(request.evidenceReference),
          permissionLabels: reviewContextVisible
            ? request.role.permissions.map((rolePermission) =>
                getPermissionPresentation(rolePermission.permission.code),
              )
            : [],
          permissionTotal: reviewContextVisible ? request.role._count.permissions : 0,
        };
      })(),
      id: request.id,
      status: request.status,
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
      riskLabel: request.role.systemRole
        ? "System/admin role requires controlled approval"
        : "Sensitive permissions require controlled approval",
    })),
    sensitiveRoleRequestPage: {
      page: resolvedRoleRequestPage,
      pageSize: roleRequestPageSize,
      totalItems: roleRequestTotal,
    },
    permissionCodes,
    permissionTotal: effectivePermissionTotal,
    permissionsPage: {
      page: permissionPage,
      pageSize: permissionPageSize,
      totalItems: filteredPermissionTotal,
      totalPages: permissionPageCount,
      query: permissionQuery,
    },
    permissions: permissionCodes.map((code) => ({
      id: permissionIdByCode.get(code) ?? null,
      ...getPermissionPresentation(code),
    })),
  };
}

type CoreAdminUserScopePage = {
  id: string;
  scopeType: string;
  scopeId: string;
  accessLevel: string;
  startsAt: Date;
  endsAt: Date | null;
  displayName: string;
  displayContext: string;
  code: string | null;
  locationType: string | null;
  effectiveState: "CURRENT" | "FUTURE" | "EXPIRED";
  canMutate: boolean;
  riskLabel: string;
};

export async function listCoreAdminUserScopePage(
  session: SessionContext,
  userId: string,
  input: { page?: number; pageSize?: number; query?: string; scopeType?: string } = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  await assertTargetUserInCurrentCompany(session, userId);
  const pageSize = Math.min(100, Math.max(10, Math.floor(input.pageSize ?? 25)));
  const requestedPage = Math.max(1, Math.floor(input.page ?? 1));
  const query = input.query?.trim().slice(0, 120) ?? "";
  const type = ["COMPANY", "BRAND", "LOCATION", "DEPARTMENT", "PROJECT"].includes(input.scopeType ?? "") ? input.scopeType! : null;
  const scopeBase = Prisma.sql`
    WITH scoped AS (
      SELECT usa.id, usa."scopeType"::text AS "scopeType", usa."scopeId", usa."accessLevel"::text AS "accessLevel", usa."startsAt", usa."endsAt", COALESCE(c."tradingName", c."legalName") AS "displayName", c."legalName" || ' / Company' AS "displayContext", c.code, NULL::text AS "locationType"
        FROM "UserScopeAssignment" usa JOIN "Company" c ON c.id = usa."scopeId" AND c."tenantId" = ${session.context.tenantId} AND c.id = ${session.context.companyId}
       WHERE usa."userId" = ${userId} AND usa.status = 'ACTIVE' AND usa."scopeType" = 'COMPANY'
      UNION ALL
      SELECT usa.id, usa."scopeType"::text, usa."scopeId", usa."accessLevel"::text, usa."startsAt", usa."endsAt", b.name, c."tradingName" || ' / Brand', b.code, NULL::text
        FROM "UserScopeAssignment" usa JOIN "Brand" b ON b.id = usa."scopeId" AND b."tenantId" = ${session.context.tenantId} AND b."companyId" = ${session.context.companyId} JOIN "Company" c ON c.id = b."companyId"
       WHERE usa."userId" = ${userId} AND usa.status = 'ACTIVE' AND usa."scopeType" = 'BRAND'
      UNION ALL
      SELECT usa.id, usa."scopeType"::text, usa."scopeId", usa."accessLevel"::text, usa."startsAt", usa."endsAt", l.name, COALESCE(b.name || ' / ', '') || c."tradingName" || ' / ' || l."locationType"::text, l.code, l."locationType"::text
        FROM "UserScopeAssignment" usa JOIN "Location" l ON l.id = usa."scopeId" AND l."tenantId" = ${session.context.tenantId} AND l."companyId" = ${session.context.companyId} JOIN "Company" c ON c.id = l."companyId" LEFT JOIN "Brand" b ON b.id = l."brandId"
       WHERE usa."userId" = ${userId} AND usa.status = 'ACTIVE' AND usa."scopeType" = 'LOCATION'
      UNION ALL
      SELECT usa.id, usa."scopeType"::text, usa."scopeId", usa."accessLevel"::text, usa."startsAt", usa."endsAt", d.name, c."tradingName" || ' / Department', d.code, NULL::text
        FROM "UserScopeAssignment" usa JOIN "Department" d ON d.id = usa."scopeId" AND d."tenantId" = ${session.context.tenantId} AND d."companyId" = ${session.context.companyId} JOIN "Company" c ON c.id = d."companyId"
       WHERE usa."userId" = ${userId} AND usa.status = 'ACTIVE' AND usa."scopeType" = 'DEPARTMENT'
      UNION ALL
      SELECT usa.id, usa."scopeType"::text, usa."scopeId", usa."accessLevel"::text, usa."startsAt", usa."endsAt", p.name, c."tradingName" || ' / Project', p.code, NULL::text
        FROM "UserScopeAssignment" usa JOIN "Project" p ON p.id = usa."scopeId" AND p."tenantId" = ${session.context.tenantId} AND p."companyId" = ${session.context.companyId} JOIN "Company" c ON c.id = p."companyId"
       WHERE usa."userId" = ${userId} AND usa.status = 'ACTIVE' AND usa."scopeType" = 'PROJECT'
    ), filtered AS (
      SELECT *, CASE WHEN "startsAt" > CURRENT_TIMESTAMP THEN 'FUTURE' WHEN "endsAt" IS NOT NULL AND "endsAt" <= CURRENT_TIMESTAMP THEN 'EXPIRED' ELSE 'CURRENT' END AS "effectiveState" FROM scoped
       WHERE (${type}::text IS NULL OR "scopeType" = ${type})
         AND (${query} = '' OR "displayName" ILIKE '%' || ${query} || '%' OR COALESCE(code, '') ILIKE '%' || ${query} || '%')
    )
  `;
  const countRows = await prisma.$queryRaw<Array<{ totalItems: number }>>`${scopeBase} SELECT COUNT(*)::int AS "totalItems" FROM filtered`;
  const totalItems = countRows[0]?.totalItems ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.$queryRaw<Array<Omit<CoreAdminUserScopePage, "canMutate" | "riskLabel">>>`${scopeBase} SELECT * FROM filtered ORDER BY "scopeType" ASC, "displayName" ASC, "startsAt" ASC, id ASC OFFSET ${(page - 1) * pageSize} LIMIT ${pageSize}`;
  return {
    items: rows.map((row) => ({
      ...row,
      canMutate:
        row.scopeType === "LOCATION" &&
        isDirectlyAssignableLocationScope({
          locationType: row.locationType ?? "UNKNOWN",
          accessLevel: row.accessLevel as z.infer<typeof accessLevelSchema>,
        }),
      riskLabel:
        row.scopeType === "LOCATION"
          ? getLocationScopeRiskLabel({ locationType: row.locationType ?? "UNKNOWN" })
          : "Broad scope requires controlled approval",
    })),
    page,
    pageSize,
    totalItems,
    totalPages,
    query,
    scopeType: type,
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
      FROM "User"
      WHERE "id" = ${targetUser.id}::uuid
      FOR UPDATE
    `;
    await assertTargetUserInCurrentCompany(session, targetUser.id, tx);
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
    await tx.$queryRaw`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${request.targetUserId}::uuid
      FOR UPDATE
    `;
    await assertTargetUserInCurrentCompany(session, request.targetUserId, tx);
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
    await tx.$queryRaw`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${targetUser.id}::uuid
      FOR UPDATE
    `;
    await assertTargetUserInCurrentCompany(session, targetUser.id, tx);
    const claimed = await tx.highRiskScopeRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewedByUserId: session.user.id,
        reviewReason: values.reviewReason,
        reviewedAt,
      },
    });
    if (claimed.count !== 1) {
      throw new Error("HIGH_RISK_SCOPE_REQUEST_NOT_FOUND");
    }

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
    await tx.$queryRaw`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${request.targetUserId}::uuid
      FOR UPDATE
    `;
    await assertTargetUserInCurrentCompany(session, request.targetUserId, tx);
    const claimed = await tx.highRiskScopeRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewedByUserId: session.user.id,
        reviewReason: values.reviewReason,
        reviewedAt,
      },
    });
    if (claimed.count !== 1) {
      throw new Error("HIGH_RISK_SCOPE_REQUEST_NOT_FOUND");
    }

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
  input: {
    stepsPage?: number;
    stepsPageSize?: number;
    auditPage?: number;
    auditPageSize?: number;
  } = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);
  if (!z.string().uuid().safeParse(approvalRuleId).success) {
    return null;
  }
  const canViewTenantRule = (await getGrantedPermissionCodes(session)).includes(
    permissions.tenantRoleAdminister,
  );

  const rawStepsPageSize = Number(input.stepsPageSize ?? 25);
  const rawStepsPage = Number(input.stepsPage ?? 1);
  const rawAuditPageSize = Number(input.auditPageSize ?? 25);
  const rawAuditPage = Number(input.auditPage ?? 1);
  const stepsPageSize = Number.isFinite(rawStepsPageSize)
    ? Math.min(100, Math.max(10, Math.floor(rawStepsPageSize)))
    : 25;
  const requestedStepsPage = Number.isFinite(rawStepsPage)
    ? Math.min(100_000, Math.max(1, Math.floor(rawStepsPage)))
    : 1;
  const auditPageSize = Number.isFinite(rawAuditPageSize)
    ? Math.min(100, Math.max(10, Math.floor(rawAuditPageSize)))
    : 25;
  const requestedAuditPage = Number.isFinite(rawAuditPage)
    ? Math.min(100_000, Math.max(1, Math.floor(rawAuditPage)))
    : 1;

  const rule = await prisma.approvalRule.findFirst({
    where: {
      id: approvalRuleId,
      tenantId: session.context.tenantId,
      OR: [
        { companyId: session.context.companyId },
        ...(canViewTenantRule ? [{ companyId: null }] : []),
      ],
    },
    select: {
      id: true,
      transactionType: true,
      scopeFilters: true,
      priority: true,
      isActive: true,
      createdAt: true,
      company: {
        select: { tradingName: true, legalName: true, timezone: true },
      },
    },
  });

  if (!rule) {
    return null;
  }

  const stepTotal = await prisma.approvalRuleStep.count({
    where: { approvalRuleId: rule.id },
  });
  const auditWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    metadata: { path: ["approvalRuleId"], equals: rule.id },
  };
  const auditTotal = await prisma.auditEvent.count({ where: auditWhere });
  const stepsPageCount = Math.max(1, Math.ceil(stepTotal / stepsPageSize));
  const stepsPage = Math.min(requestedStepsPage, stepsPageCount);
  const auditPageCount = Math.max(1, Math.ceil(auditTotal / auditPageSize));
  const auditPage = Math.min(requestedAuditPage, auditPageCount);
  const [stepRows, relatedAuditEvents] = await Promise.all([
    prisma.approvalRuleStep.findMany({
      where: { approvalRuleId: rule.id },
      orderBy: [{ stepOrder: "asc" }, { id: "asc" }],
      skip: (stepsPage - 1) * stepsPageSize,
      take: stepsPageSize,
      select: {
        id: true,
        stepOrder: true,
        approverType: true,
        roleId: true,
        userId: true,
        required: true,
        escalationHours: true,
      },
    }),
    prisma.auditEvent.findMany({
      where: auditWhere,
      select: {
        id: true,
        eventType: true,
        entityType: true,
        entityId: true,
        occurredAt: true,
        actor: { select: { displayName: true } },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: (auditPage - 1) * auditPageSize,
      take: auditPageSize,
    }),
  ]);
  const roleIds = Array.from(new Set(stepRows.map((step) => step.roleId).filter((id): id is string => Boolean(id))));
  const userIds = Array.from(new Set(stepRows.map((step) => step.userId).filter((id): id is string => Boolean(id))));
  const [roles, users] = await Promise.all([
    prisma.role.findMany({
      where: { id: { in: roleIds }, OR: [{ tenantId: session.context.tenantId }, { tenantId: null }] },
      select: { id: true, code: true, name: true, status: true },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds }, tenantId: session.context.tenantId },
      select: { id: true, displayName: true, email: true, status: true },
    }),
  ]);

  return {
    id: rule.id,
    transactionType: rule.transactionType,
    companyName:
      rule.company?.tradingName ?? rule.company?.legalName ?? "Tenant-wide",
    timezone: rule.company?.timezone ?? "Asia/Manila",
    priority: rule.priority,
    isActive: rule.isActive,
    scopeFilters: rule.scopeFilters,
    createdAt: rule.createdAt.toISOString(),
    stepsPage: { page: stepsPage, pageSize: stepsPageSize, totalItems: stepTotal, totalPages: stepsPageCount },
    steps: stepRows.map((step) => {
      const role = roles.find((record) => record.id === step.roleId);
      const user = users.find((record) => record.id === step.userId);

      return {
        id: step.id,
        stepOrder: step.stepOrder,
        approverType: step.approverType,
        assigneeName: role?.name ?? user?.displayName ?? "Unassigned",
        assigneeCode: role?.code ?? user?.email ?? "",
        assigneeStatus: role?.status ?? user?.status ?? "MISSING",
        required: step.required,
        escalationHours: step.escalationHours,
      };
    }),
    auditPage: { page: auditPage, pageSize: auditPageSize, totalItems: auditTotal, totalPages: auditPageCount },
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
  input: {
    accessPage?: number;
    accessPageSize?: number;
  } = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);

  if (!z.string().uuid().safeParse(locationId).success) {
    return null;
  }

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

  const rawPageSize = Number(input.accessPageSize ?? 25);
  const rawPage = Number(input.accessPage ?? 1);
  const accessPageSize = Number.isFinite(rawPageSize)
    ? Math.min(100, Math.max(10, Math.floor(rawPageSize)))
    : 25;
  const requestedAccessPage = Number.isFinite(rawPage)
    ? Math.min(100_000, Math.max(1, Math.floor(rawPage)))
    : 1;
  const effectiveNow = new Date();
  const accessWhere = {
    scopeType: "LOCATION" as const,
    scopeId: location.id,
    status: "ACTIVE" as const,
    startsAt: { lte: effectiveNow },
    OR: [{ endsAt: null }, { endsAt: { gt: effectiveNow } }],
    role: {
      status: "ACTIVE" as const,
      OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
    },
    user: {
      tenantId: session.context.tenantId,
      status: "ACTIVE" as const,
    },
  };
  const [scopeAssignmentTotal, purchaseRequests, auditEvents] = await Promise.all([
    prisma.userScopeAssignment.count({ where: accessWhere }),
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
  const accessPageCount = Math.max(1, Math.ceil(scopeAssignmentTotal / accessPageSize));
  const accessPage = Math.min(requestedAccessPage, accessPageCount);
  const scopeAssignments = await prisma.userScopeAssignment.findMany({
    where: accessWhere,
    select: {
      id: true,
      userId: true,
      startsAt: true,
      accessLevel: true,
      user: {
        select: {
          displayName: true,
          email: true,
          roleAssignments: {
            where: {
              status: "ACTIVE",
              startsAt: { lte: effectiveNow },
              OR: [{ endsAt: null }, { endsAt: { gt: effectiveNow } }],
              role: {
                status: "ACTIVE",
                OR: [{ tenantId: null }, { tenantId: session.context.tenantId }],
              },
            },
            select: { role: { select: { name: true } } },
            orderBy: { startsAt: "asc" },
            take: 8,
          },
        },
      },
    },
    orderBy: [{ userId: "asc" }, { id: "asc" }],
    skip: (accessPage - 1) * accessPageSize,
    take: accessPageSize,
  });

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
    assignedUsersPage: {
      page: accessPage,
      pageSize: accessPageSize,
      totalItems: scopeAssignmentTotal,
      totalPages: accessPageCount,
    },
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
  input: {
    page?: number;
    pageSize?: number;
    query?: string;
    permissionPage?: number;
    permissionPageSize?: number;
    permissionQuery?: string;
    permissionFilter?: "ALL" | "SENSITIVE" | "OVERRIDES" | "RECOMMENDED_DRIFT";
  } = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);

  if (!z.string().uuid().safeParse(roleId).success) {
    return null;
  }

  const rawPageSize = Number(input.pageSize ?? 25);
  const rawPage = Number(input.page ?? 1);
  const rawPermissionPageSize = Number(input.permissionPageSize ?? 25);
  const rawPermissionPage = Number(input.permissionPage ?? 1);
  const pageSize = Number.isFinite(rawPageSize) ? Math.min(25, Math.max(10, Math.floor(rawPageSize))) : 25;
  const requestedPage = Number.isFinite(rawPage) ? Math.min(100_000, Math.max(1, Math.floor(rawPage))) : 1;
  const query = typeof input.query === "string" ? input.query.trim().slice(0, 120) : "";
  const permissionPageSize = Number.isFinite(rawPermissionPageSize) ? Math.min(100, Math.max(10, Math.floor(rawPermissionPageSize))) : 25;
  const requestedPermissionPage = Number.isFinite(rawPermissionPage) ? Math.min(100_000, Math.max(1, Math.floor(rawPermissionPage))) : 1;
  const permissionQuery = typeof input.permissionQuery === "string" ? input.permissionQuery.trim().slice(0, 120) : "";
  const permissionFilter = input.permissionFilter ?? "ALL";
  const effectiveNow = new Date();
  const [companyBrands, companyLocations, companyDepartments, companyProjects] = await Promise.all([
    prisma.brand.findMany({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId }, select: { id: true }, orderBy: { id: "asc" }, take: 1001 }),
    prisma.location.findMany({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId }, select: { id: true }, orderBy: { id: "asc" }, take: 1001 }),
    prisma.department.findMany({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId }, select: { id: true }, orderBy: { id: "asc" }, take: 1001 }),
    prisma.project.findMany({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId }, select: { id: true }, orderBy: { id: "asc" }, take: 1001 }),
  ]);
  const scopeCatalogCapped = [companyBrands, companyLocations, companyDepartments, companyProjects].some((rows) => rows.length > 1000);
  const selectedCompany = await prisma.company.findFirst({
    where: { id: session.context.companyId, tenantId: session.context.tenantId },
    select: { timezone: true },
  });
  const scopePreviewWhere = {
    status: "ACTIVE" as const,
    startsAt: { lte: effectiveNow },
    OR: [{ endsAt: null }, { endsAt: { gt: effectiveNow } }],
    AND: [{ OR: [
      { scopeType: "COMPANY" as const, scopeId: session.context.companyId },
      { scopeType: "BRAND" as const, scopeId: { in: companyBrands.map((row) => row.id) } },
      { scopeType: "LOCATION" as const, scopeId: { in: companyLocations.map((row) => row.id) } },
      { scopeType: "DEPARTMENT" as const, scopeId: { in: companyDepartments.map((row) => row.id) } },
      { scopeType: "PROJECT" as const, scopeId: { in: companyProjects.map((row) => row.id) } },
    ] }],
  };
  const assignmentWhere = {
    status: "ACTIVE" as const,
    startsAt: { lte: effectiveNow },
    OR: [{ endsAt: null }, { endsAt: { gt: effectiveNow } }],
    role: {
      status: "ACTIVE" as const,
      OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
    },
    user: {
      tenantId: session.context.tenantId,
      status: "ACTIVE" as const,
      ...(query ? { OR: [
        { displayName: { contains: query, mode: "insensitive" as const } },
        { email: { contains: query, mode: "insensitive" as const } },
      ] } : {}),
    },
  };
  const role = await prisma.role.findFirst({
      where: {
        id: roleId,
        tenantId: session.context.tenantId,
      },
      include: {
        permissions: {
          where: { permission: tenantGlobalPermissionWhere(session.context.tenantId) },
          select: { permission: { select: { id: true, code: true, module: true, action: true, description: true } } },
        },
      },
  });

  if (!role) {
    return null;
  }

  const rolePermissionTotal = await prisma.rolePermission.count({ where: { roleId: role.id } });
  const permissionIntegrityIssue = rolePermissionTotal !== role.permissions.length;
  const currentPermissionCodes = new Set(
    role.permissions.map((rolePermission) => rolePermission.permission.code),
  );
  const recommendedPermissionCodes = new Set(getRecommendedPermissionCodesForRole(role.code));
  const sensitivePermissionCodes = Object.values(permissions).filter(isSensitivePermissionCode);
  const permissionFilterCodes = permissionFilter === "SENSITIVE"
    ? sensitivePermissionCodes
    : permissionFilter === "RECOMMENDED_DRIFT"
      ? Array.from(new Set([
          ...Array.from(currentPermissionCodes).filter((code) => !recommendedPermissionCodes.has(code)),
          ...Array.from(recommendedPermissionCodes).filter((code) => !currentPermissionCodes.has(code)),
        ]))
      : permissionFilter === "OVERRIDES"
        ? Array.from(currentPermissionCodes).filter((code) => !recommendedPermissionCodes.has(code))
        : undefined;
  const permissionWhere: Prisma.PermissionWhereInput = {
    AND: [
      { OR: [{ tenantId: session.context.tenantId }, { tenantId: null }] },
      ...(permissionQuery
        ? [{ OR: [
            { code: { contains: permissionQuery, mode: "insensitive" as const } },
            { module: { contains: permissionQuery, mode: "insensitive" as const } },
            { action: { contains: permissionQuery, mode: "insensitive" as const } },
          ] }]
        : []),
      ...(permissionFilterCodes ? [{ code: { in: permissionFilterCodes } }] : []),
    ],
  };
  const [assignmentCount, permissionTotal] = await Promise.all([
    prisma.userRoleAssignment.count({ where: { roleId, ...assignmentWhere } }),
    prisma.permission.count({ where: permissionWhere }),
  ]);

  const pageCount = Math.max(1, Math.ceil(assignmentCount / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const assignments = await prisma.userRoleAssignment.findMany({
    where: { roleId, ...assignmentWhere },
    select: { id: true, userId: true, startsAt: true, user: { select: { displayName: true, email: true, scopeAssignments: { where: scopePreviewWhere, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 9, select: { id: true, scopeType: true, scopeId: true, accessLevel: true } } } } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const permissionPageCount = Math.max(1, Math.ceil(permissionTotal / permissionPageSize));
  const permissionPage = Math.min(requestedPermissionPage, permissionPageCount);
  const permissionRowsData = await prisma.permission.findMany({
    where: permissionWhere,
    orderBy: [{ module: "asc" }, { action: "asc" }, { code: "asc" }],
    skip: (permissionPage - 1) * permissionPageSize,
    take: permissionPageSize,
  });
  const permissionRows = permissionRowsData.map((permission) => {
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
  const addedFromRecommendedTotal = Array.from(currentPermissionCodes)
    .filter((code) => !recommendedPermissionCodes.has(code)).length;
  const removedFromRecommendedTotal = Array.from(recommendedPermissionCodes)
    .filter((code) => !currentPermissionCodes.has(code)).length;
  const sensitiveEnabledCount = Array.from(currentPermissionCodes)
    .filter((code) => isSensitivePermissionCode(code)).length;

  return {
    id: role.id,
    name: role.name,
    code: role.code,
    status: role.status,
    systemRole: role.systemRole,
    recommendedLabel: getRecommendedRoleLabel(role.code),
    recommendedPermissionCount: recommendedPermissionCodes.size,
    addedFromRecommended: addedFromRecommendedTotal,
    removedFromRecommended: removedFromRecommendedTotal,
    sensitiveEnabledCount,
    hasRecommendedSet: recommendedPermissionCodes.size > 0,
    permissionGroups,
    permissionPage: {
      page: permissionPage,
      pageSize: permissionPageSize,
      totalItems: permissionTotal,
      totalPages: permissionPageCount,
      query: permissionQuery,
      filter: permissionFilter,
    },
    timezone: selectedCompany?.timezone ?? "Asia/Manila",
    scopeCatalogCapped,
    permissionIntegrityIssue,
    enabledPermissionCodes: Array.from(currentPermissionCodes),
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
    assignedUsers: assignments.map((assignment) => ({
      id: assignment.id,
      userId: assignment.userId,
      displayName: assignment.user.displayName,
      email: assignment.user.email,
      startsAt: assignment.startsAt.toISOString(),
      scopes: assignment.user.scopeAssignments.slice(0, 8).map((scope) => ({
        id: scope.id,
        type: scope.scopeType,
        scopeId: scope.scopeId,
        accessLevel: scope.accessLevel,
      })),
      scopePreviewCapped: assignment.user.scopeAssignments.length > 8,
    })),
    assignedUsersPage: { page, pageSize, totalItems: assignmentCount, totalPages: pageCount, query },
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
          where: { permission: tenantGlobalPermissionWhere(session.context.tenantId) },
          select: { permission: { select: { code: true } } },
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
  const rolePermissionTotal = await prisma.rolePermission.count({ where: { roleId: role.id } });
  if (rolePermissionTotal !== role.permissions.length) {
    throw new Error("ROLE_PERMISSION_SCOPE_CORRUPTED");
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
      select: { permission: { select: { code: true, tenantId: true } } },
    });
    if (lockedPermissionRows.some((row) => row.permission.tenantId !== null && row.permission.tenantId !== session.context.tenantId)) {
      throw new Error("ROLE_PERMISSION_SCOPE_CORRUPTED");
    }
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

const auditPageInputSchema = z.object({
  pageSize: z.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().max(512).optional(),
});
const auditFilterInputSchema = z.object({
  query: z.string().trim().max(120).optional(),
  eventType: z.string().trim().max(120).optional(),
  entityType: z.string().trim().max(120).optional(),
  entityId: z.string().uuid().optional(),
  actor: z.string().trim().max(120).optional(),
  requestId: z.string().trim().max(120).optional(),
  occurredFrom: z.string().trim().max(40).optional(),
  occurredTo: z.string().trim().max(40).optional(),
  occurredBefore: z.string().trim().max(40).optional(),
  actorUserId: z.string().uuid().optional(),
});

function auditSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    normalized.includes("password") ||
    normalized.includes("credential") ||
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("email") ||
    normalized.includes("ipaddress") ||
    normalized === "ip" ||
    normalized.includes("objectkey") ||
    normalized.includes("storagekey") ||
    normalized.includes("signedurl") ||
    normalized.includes("downloadurl") ||
    normalized.includes("evidenceurl")
  );
}

function redactAuditJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactAuditJson);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = auditSensitiveKey(key)
      ? "[REDACTED]"
      : redactAuditJson(nested);
  }
  return output;
}

function toSafeJsonRecord(value: unknown) {
  return value && typeof value === "object"
    ? (redactAuditJson(value) as Record<string, unknown>)
    : null;
}

const auditDetailMaxDepth = 8;
const auditDetailMaxNodes = 500;
const auditDetailMaxBytes = 64 * 1024;

function toBoundedAuditJsonRecord(value: unknown) {
  let nodes = 0;
  let truncated = false;
  const visit = (input: unknown, depth: number): unknown => {
    if (depth > auditDetailMaxDepth || nodes >= auditDetailMaxNodes) {
      truncated = true;
      return "[TRUNCATED_POLICY_LIMIT]";
    }
    nodes += 1;
    if (Array.isArray(input)) {
      return input.map((item) => visit(item, depth + 1));
    }
    if (!input || typeof input !== "object") {
      return input;
    }
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(input)) {
      output[key] = auditSensitiveKey(key)
        ? "[REDACTED]"
        : visit(nested, depth + 1);
    }
    return output;
  };
  const visited = visit(value, 0);
  let bounded = visited && typeof visited === "object" ? (visited as Record<string, unknown>) : null;
  try {
    if (Buffer.byteLength(JSON.stringify(bounded), "utf8") > auditDetailMaxBytes) {
      truncated = true;
      bounded = { "[TRUNCATED_POLICY_LIMIT]": "Audit payload exceeds the detail display budget." };
    }
  } catch {
    truncated = true;
    bounded = { "[TRUNCATED_POLICY_LIMIT]": "Audit payload could not be rendered within the detail budget." };
  }
  return { value: bounded, truncated };
}

export async function getCoreAdminAuditEventDetail(
  session: SessionContext,
  auditEventId: string,
) {
  const resolved = await resolveCoreAdminAuditWhere(session, {});

  if (!isUuid(auditEventId)) {
    return null;
  }

  const event = await prisma.auditEvent.findFirst({
    where: {
      id: auditEventId,
      AND: [resolved.where],
    },
    select: {
      id: true,
      eventType: true,
      entityType: true,
      entityId: true,
      occurredAt: true,
      requestId: true,
      beforeData: true,
      afterData: true,
      metadata: true,
      actor: { select: { displayName: true, tenantId: true } },
      company: { select: { tradingName: true, legalName: true, tenantId: true, timezone: true } },
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
    actorName: event.actor?.tenantId === session.context.tenantId ? event.actor.displayName : "System",
    actorEmail: "",
    companyName:
      event.company?.tenantId === session.context.tenantId
        ? event.company.tradingName ?? event.company.legalName ?? "Tenant-wide"
        : "Tenant-wide",
    timezone: event.company?.timezone ?? "Asia/Manila",
    occurredAt: event.occurredAt.toISOString(),
    requestId: event.requestId,
    ipAddress: "",
    beforeData: toBoundedAuditJsonRecord(event.beforeData),
    afterData: toBoundedAuditJsonRecord(event.afterData),
    metadata: toBoundedAuditJsonRecord(event.metadata),
  };
}

export type CoreAdminAuditEventFilters = {
  query?: string | undefined;
  eventType?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  actor?: string | undefined;
  requestId?: string | undefined;
  occurredFrom?: string | undefined;
  occurredTo?: string | undefined;
  occurredBefore?: string | undefined;
  actorUserId?: string | undefined;
};

export type CoreAdminAuditEventPageInput = CoreAdminAuditEventFilters &
  z.input<typeof auditPageInputSchema>;

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

function normalizeAuditFilters(filters: CoreAdminAuditEventFilters = {}) {
  return auditFilterInputSchema.parse({
    query: filters.query?.trim() || undefined,
    eventType: filters.eventType?.trim() || undefined,
    entityType: filters.entityType?.trim() || undefined,
    entityId: filters.entityId?.trim() || undefined,
    actor: filters.actor?.trim() || undefined,
    requestId: filters.requestId?.trim() || undefined,
    occurredFrom: filters.occurredFrom?.trim() || undefined,
    occurredTo: filters.occurredTo?.trim() || undefined,
    occurredBefore: filters.occurredBefore?.trim() || undefined,
    actorUserId: filters.actorUserId?.trim() || undefined,
  });
}

function auditCursorHash(filters: CoreAdminAuditEventFilters) {
  return createHash("sha256")
    .update(JSON.stringify(normalizeAuditFilters(filters)))
    .digest("hex");
}

function encodeAuditCursor(filters: CoreAdminAuditEventFilters, event: { occurredAt: Date; id: string }) {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      occurredAt: event.occurredAt.toISOString(),
      id: event.id,
      filterHash: auditCursorHash(filters),
    }),
  ).toString("base64url");
}

function decodeAuditCursor(cursor: string | undefined, filters: CoreAdminAuditEventFilters) {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      decoded.v !== 1 ||
      typeof decoded.occurredAt !== "string" ||
      typeof decoded.id !== "string" ||
      decoded.filterHash !== auditCursorHash(filters)
    ) {
      throw new Error("AUDIT_CURSOR_INVALID");
    }
    const occurredAt = new Date(decoded.occurredAt);
    if (Number.isNaN(occurredAt.getTime()) || !isUuid(decoded.id)) {
      throw new Error("AUDIT_CURSOR_INVALID");
    }
    return { occurredAt, id: decoded.id };
  } catch {
    throw new Error("AUDIT_CURSOR_INVALID");
  }
}

async function resolveCoreAdminAuditWhere(
  session: SessionContext,
  filters: CoreAdminAuditEventFilters,
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  const canViewTenantAudit = (
    await getGrantedPermissionCodes(session)
  ).includes(permissions.tenantRoleAdminister);
  const normalized = normalizeAuditFilters(filters);
  const query = normalized.query;
  const occurredFrom = parsedDate(normalized.occurredFrom);
  const occurredTo = parsedEndOfDay(normalized.occurredTo);
  const occurredBefore = parsedDate(normalized.occurredBefore);
  const queryConditions: AuditEventWhereInput[] = query
    ? [
        { eventType: { contains: query, mode: "insensitive" } },
        { entityType: { contains: query, mode: "insensitive" } },
        { requestId: { contains: query, mode: "insensitive" } },
        { actor: { is: { displayName: { contains: query, mode: "insensitive" } } } },
        { actor: { is: { email: { contains: query, mode: "insensitive" } } } },
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
  if (normalized.eventType) where.eventType = { contains: normalized.eventType, mode: "insensitive" };
  if (normalized.entityType) where.entityType = { contains: normalized.entityType, mode: "insensitive" };
  if (normalized.entityId) where.entityId = normalized.entityId;
  if (normalized.actor) {
    where.actor = { is: { OR: [
      { displayName: { contains: normalized.actor, mode: "insensitive" } },
      { email: { contains: normalized.actor, mode: "insensitive" } },
    ] } };
  }
  if (normalized.actorUserId) {
    const existingAnd = Array.isArray(where.AND)
      ? where.AND
      : where.AND
        ? [where.AND]
        : [];
    where.AND = [
      ...existingAnd,
      { actor: { is: { id: normalized.actorUserId } } },
    ];
  }
  if (normalized.requestId) where.requestId = { contains: normalized.requestId, mode: "insensitive" };
  if (occurredFrom || occurredTo || occurredBefore) {
    where.occurredAt = {
      ...(occurredFrom ? { gte: occurredFrom } : {}),
      ...(occurredTo ? { lte: occurredTo } : {}),
      ...(occurredBefore ? { lt: occurredBefore } : {}),
    };
  }
  if (queryConditions.length > 0) {
    const existingAnd = Array.isArray(where.AND)
      ? where.AND
      : where.AND
        ? [where.AND]
        : [];
    where.AND = [...existingAnd, { OR: queryConditions }];
  }
  return { where, normalized, canViewTenantAudit };
}

function projectAuditEvent(event: {
  id: string; eventType: string; entityType: string; entityId: string;
  actor: { displayName: string; email: string } | null;
  company: { tradingName: string | null; legalName: string } | null;
  occurredAt: Date; requestId: string | null; ipAddress: string | null;
  beforeData?: unknown; afterData?: unknown; metadata?: unknown;
}) {
  return {
    id: event.id,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorName: event.actor?.displayName ?? "System",
    actorEmail: "",
    companyName: event.company?.tradingName ?? event.company?.legalName ?? "Tenant-wide",
    occurredAt: event.occurredAt.toISOString(),
    requestId: event.requestId ?? "",
    ipAddress: "",
    ...(Object.prototype.hasOwnProperty.call(event, "beforeData")
      ? { beforeData: toSafeJsonRecord(event.beforeData), afterData: toSafeJsonRecord(event.afterData), metadata: toSafeJsonRecord(event.metadata) }
      : {}),
  };
}

export async function listCoreAdminAuditEventPage(
  session: SessionContext,
  input: CoreAdminAuditEventPageInput = {},
  options: { includeTotal?: boolean } = {},
) {
  const filters = normalizeAuditFilters(input);
  const values = auditPageInputSchema.parse({ pageSize: input.pageSize, cursor: input.cursor });
  const resolved = await resolveCoreAdminAuditWhere(session, filters);
  const cursor = decodeAuditCursor(values.cursor, filters);
  const cursorWhere = cursor
    ? { OR: [{ occurredAt: { lt: cursor.occurredAt } }, { occurredAt: cursor.occurredAt, id: { lt: cursor.id } }] }
    : undefined;
  const pageWhere = cursorWhere ? { AND: [resolved.where, cursorWhere] } : resolved.where;
  const [totalItems, events] = await Promise.all([
    options.includeTotal === false
      ? Promise.resolve(null)
      : prisma.auditEvent.count({ where: resolved.where }),
    prisma.auditEvent.findMany({
      where: pageWhere,
      include: { actor: true, company: true },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: values.pageSize + 1,
    }),
  ]);
  const hasMore = events.length > values.pageSize;
  const pageEvents = hasMore ? events.slice(0, values.pageSize) : events;
  return {
    items: pageEvents.map(projectAuditEvent),
    totalItems: totalItems ?? 0,
    pageSize: values.pageSize,
    hasMore,
    nextCursor: hasMore ? encodeAuditCursor(filters, pageEvents[pageEvents.length - 1]!) : null,
  };
}

export async function listCoreAdminUserAuditEventPage(
  session: SessionContext,
  userId: string,
  input: Omit<CoreAdminAuditEventPageInput, "actorUserId"> = {},
) {
  await assertTargetUserInCurrentCompany(session, userId);
  return listCoreAdminAuditEventPage(session, { ...input, actorUserId: userId });
}

export async function listCoreAdminAuditEvents(
  session: SessionContext,
  filters: CoreAdminAuditEventFilters = {},
  options: { maxRows?: number } = {},
) {
  const items: Awaited<ReturnType<typeof listCoreAdminAuditEventPage>>["items"] = [];
  let cursor: string | undefined;
  let includeTotal = true;
  do {
    const page = await listCoreAdminAuditEventPage(session, {
      ...filters,
      pageSize: 100,
      ...(cursor ? { cursor } : {}),
    }, { includeTotal });
    if (options.maxRows !== undefined && page.totalItems > options.maxRows) {
      throw new Error("REPORT_EXPORT_ROW_LIMIT_EXCEEDED");
    }
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
    includeTotal = false;
  } while (cursor);
  return items;
}

export async function getCoreAdminPermissionDetail(
  session: SessionContext,
  permissionId: string,
  input: { page?: number; pageSize?: number; query?: string } = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);

  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 10), 100);
  const requestedPage = Math.min(Math.max(input.page ?? 1, 1), 10_000);
  const query = input.query?.trim() ?? "";
  const now = new Date();
  const companyLocations = await prisma.location.findMany({
    where: { tenantId: session.context.tenantId, companyId: session.context.companyId, status: "ACTIVE" },
    select: { id: true },
  });
  const companyLocationIds = companyLocations.map((location) => location.id);
  const permission = await prisma.permission.findFirst({
    where: {
      id: permissionId,
      OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
    },
    select: { id: true, code: true, module: true, action: true, description: true },
  });

  if (!permission) {
    return null;
  }

  const roleWhere = {
    permissionId: permission.id,
    role: {
      tenantId: session.context.tenantId,
      ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { code: { contains: query, mode: "insensitive" as const } }] } : {}),
    },
  };
  const totalRoles = await prisma.rolePermission.count({ where: roleWhere });
  const pageCount = Math.max(1, Math.ceil(totalRoles / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const roleRows = await prisma.rolePermission.findMany({
    where: roleWhere,
    include: { role: { select: { id: true, name: true, code: true, status: true } } },
    orderBy: [{ role: { name: "asc" } }, { roleId: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const roles = await Promise.all(roleRows.map(async (rolePermission) => {
    const assignmentWhere = {
      roleId: rolePermission.role.id,
      role: { tenantId: session.context.tenantId, status: "ACTIVE" as const },
      status: "ACTIVE" as const,
      startsAt: { lte: now },
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      user: {
        tenantId: session.context.tenantId,
        status: "ACTIVE" as const,
        scopeAssignments: {
          some: {
            status: "ACTIVE" as const,
            startsAt: { lte: now },
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, { OR: [{ scopeType: "COMPANY" as const, scopeId: session.context.companyId }, { scopeType: "LOCATION" as const, scopeId: { in: companyLocationIds } }] }],
          },
        },
      },
    };
    const [assignedUserCount, assignments] = await Promise.all([
      prisma.userRoleAssignment.count({ where: assignmentWhere }),
      prisma.userRoleAssignment.findMany({
        where: assignmentWhere,
        select: { id: true, userId: true, user: { select: { displayName: true, email: true, scopeAssignments: { where: { status: "ACTIVE", startsAt: { lte: now }, AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, { OR: [{ scopeType: "COMPANY" as const, scopeId: session.context.companyId }, { scopeType: "LOCATION" as const, scopeId: { in: companyLocationIds } }] }] }, select: { id: true, scopeType: true, accessLevel: true }, orderBy: { startsAt: "asc" }, take: 5 } } } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: 5,
      }),
    ]);
    return {
      id: rolePermission.role.id,
      name: rolePermission.role.name,
      code: rolePermission.role.code,
      status: rolePermission.role.status,
      assignedUserCount,
      assignedUsers: assignments.map((assignment) => ({ id: assignment.id, userId: assignment.userId, displayName: assignment.user.displayName, email: assignment.user.email, scopes: assignment.user.scopeAssignments.map((scope) => ({ id: scope.id, type: scope.scopeType, accessLevel: scope.accessLevel })) })),
    };
  }));
  return {
    id: permission.id,
    code: permission.code,
    module: permission.module,
    action: permission.action,
    description: permission.description,
    roles,
    rolesPage: { page, pageSize, totalRoles, pageCount, query },
  };
}

export async function getCoreAdminCompanyDetail(
  session: SessionContext,
  companyId: string,
  input: {
    accessPage?: number;
    accessPageSize?: number;
    accessQuery?: string;
  } = {},
) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanAdministerTenantRoles(session);
  await assertCanManageCompanyScope(session, session.context.companyId);
  if (companyId !== session.context.companyId) {
    return null;
  }

  if (!z.string().uuid().safeParse(companyId).success) {
    return null;
  }

  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      tenantId: session.context.tenantId,
    },
    include: {
      _count: {
        select: {
          brands: true,
          locations: true,
        },
      },
    },
  });

  if (!company) {
    return null;
  }

  const rawAccessPageSize = Number(input.accessPageSize ?? 25);
  const rawAccessPage = Number(input.accessPage ?? 1);
  const accessPageSize = Number.isFinite(rawAccessPageSize)
    ? Math.min(100, Math.max(10, Math.floor(rawAccessPageSize)))
    : 25;
  const requestedAccessPage = Number.isFinite(rawAccessPage)
    ? Math.min(100_000, Math.max(1, Math.floor(rawAccessPage)))
    : 1;
  const accessQuery = typeof input.accessQuery === "string" ? input.accessQuery.trim().slice(0, 120) : "";
  const effectiveNow = new Date();
  const accessWhere = {
    scopeType: "COMPANY" as const,
    scopeId: company.id,
    status: "ACTIVE" as const,
    startsAt: { lte: effectiveNow },
    OR: [{ endsAt: null }, { endsAt: { gt: effectiveNow } }],
    user: {
      tenantId: session.context.tenantId,
      status: "ACTIVE" as const,
      ...(accessQuery
        ? {
            OR: [
              { displayName: { contains: accessQuery, mode: "insensitive" as const } },
              { email: { contains: accessQuery, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
  };
  const [companyScopeAssignmentTotal, purchaseRequests, auditEvents] =
    await Promise.all([
      prisma.userScopeAssignment.count({ where: accessWhere }),
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

  const accessPageCount = Math.max(1, Math.ceil(companyScopeAssignmentTotal / accessPageSize));
  const accessPage = Math.min(requestedAccessPage, accessPageCount);
  const companyScopeAssignments = await prisma.userScopeAssignment.findMany({
    where: accessWhere,
    select: {
      id: true,
      userId: true,
      startsAt: true,
      accessLevel: true,
      user: {
        select: {
          displayName: true,
          email: true,
          roleAssignments: {
            where: {
              status: "ACTIVE",
              startsAt: { lte: effectiveNow },
              OR: [{ endsAt: null }, { endsAt: { gt: effectiveNow } }],
              role: {
                status: "ACTIVE",
                OR: [{ tenantId: null }, { tenantId: session.context.tenantId }],
              },
            },
            select: { role: { select: { name: true } } },
            orderBy: { startsAt: "asc" },
            take: 8,
          },
        },
      },
    },
    orderBy: [{ userId: "asc" }, { id: "asc" }],
    skip: (accessPage - 1) * accessPageSize,
    take: accessPageSize,
  });

  return {
    id: company.id,
    legalName: company.legalName,
    tradingName: company.tradingName,
    displayName: company.tradingName ?? company.legalName,
    taxIdentifier: company.taxIdentifier,
    currencyCode: company.currencyCode,
    timezone: company.timezone,
    status: company.status,
    brands: { totalItems: company._count.brands },
    locations: { totalItems: company._count.locations },
    assignedUsersPage: {
      page: accessPage,
      pageSize: accessPageSize,
      totalItems: companyScopeAssignmentTotal,
      totalPages: accessPageCount,
      query: accessQuery,
    },
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
