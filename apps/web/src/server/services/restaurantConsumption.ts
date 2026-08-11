import { createHash, randomUUID } from "node:crypto";
import { prisma, Prisma } from "@ogfi/database";
import { z } from "zod";
import {
  permissions,
  requireAnyPermission,
  requirePermission,
} from "./authorization";
import {
  assertAuthorizedLocation,
  requireSessionContext,
  type SessionContext,
} from "./context";
import {
  lockInventoryLocationsForPosting,
  postInventoryMovementInTransaction,
} from "./inventory";
import { lockLiveInventoryActionAuthority } from "./inventoryActionAuthority";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";

const db = prisma as typeof prisma & Record<string, any>;
const MAX_LINES = 100;
const MAX_RECIPE_DEPTH = 12;
export const menuRecipePolicyPermissions = {
  adopt: permissions.menuRecipeAdopt,
  branchException: permissions.menuRecipeBranchException,
  rollout: permissions.menuRecipeRollout,
} as const;

const servicePeriodSchema = z.object({
  code: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

const sentinelRulesSchema = z.object({
  dailyCountItemIds: z.array(z.string().uuid()).max(200).default([]),
  pilotDailyCountDays: z.number().int().min(1).max(90).default(28),
  highRiskCountFrequencyDays: z.number().int().min(1).max(90).default(7),
  generalCountFrequencyDays: z.number().int().min(1).max(365).default(30),
});

const configureSchema = z.object({
  locationId: z.string().uuid(),
  defaultIssueInventoryLocationId: z.string().uuid(),
  servicePeriodMode: z.enum(["DAILY", "SHIFT"]),
  timezone: z.string().trim().min(3).max(80),
  servicePeriods: z.array(servicePeriodSchema).min(1).max(12),
  sentinelRules: sentinelRulesSchema.optional(),
  saveAsCompanyDefault: z.boolean().default(false),
  effectiveFrom: z.coerce.date(),
  reason: z.string().trim().min(5).max(500),
});

const assignmentSchema = z.object({
  locationId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  recipeVersionId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
  effectiveFrom: z.union([z.date(), z.string().trim().min(1)]),
  effectiveTo: z.union([z.date(), z.string().trim().min(1)]).optional(),
  reason: z.string().trim().min(5).max(500),
});

const effectiveRangeFields = {
  effectiveFrom: z.union([z.date(), z.string().trim().min(1)]),
  effectiveTo: z.union([z.date(), z.string().trim().min(1)]).optional(),
};

const brandMenuRecipeDefaultSchema = z.object({
  ...effectiveRangeFields,
  brandId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  recipeVersionId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
  reason: z.string().trim().min(5).max(500),
});

const locationMenuRecipeOverrideSchema = z.object({
  ...effectiveRangeFields,
  brandId: z.string().uuid(),
  locationId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  recipeVersionId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
  reason: z.string().trim().min(5).max(500),
});

const menuItemLocationAvailabilitySchema = z.object({
  ...effectiveRangeFields,
  brandId: z.string().uuid(),
  locationId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  state: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  idempotencyKey: z.string().trim().min(8).max(200),
  reason: z.string().trim().min(5).max(500),
});

const sharedRecipeBrandAdoptionSchema = z.object({
  ...effectiveRangeFields,
  brandId: z.string().uuid(),
  recipeId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
  reason: z.string().trim().min(5).max(500),
});

const endLocationMenuRecipeOverrideSchema = z.object({
  brandId: z.string().uuid(),
  locationId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  effectiveTo: z.union([z.date(), z.string().trim().min(1)]),
  idempotencyKey: z.string().trim().min(8).max(200),
  reason: z.string().trim().min(5).max(500),
});

const cancelFutureMenuPolicySchema = z.object({
  brandId: z.string().uuid(),
  targetType: z.enum([
    "RECIPE_BRAND_ADOPTION",
    "MENU_RECIPE_ASSIGNMENT",
    "MENU_ITEM_LOCATION_AVAILABILITY",
  ]),
  targetId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
  reason: z.string().trim().min(5).max(500),
});

const declarationLineSchema = z
  .object({
    menuItemId: z.string().uuid(),
    disposition: z.enum(["PAID", "COMPLIMENTARY"]),
    quantityServed: z.coerce.number().positive().max(1_000_000),
    complimentaryReason: z.string().trim().max(240).optional(),
    complimentaryReference: z.string().trim().max(240).optional(),
  })
  .superRefine((line, context) => {
    if (
      line.disposition === "COMPLIMENTARY" &&
      !line.complimentaryReason?.trim()
    ) {
      context.addIssue({
        code: "custom",
        path: ["complimentaryReason"],
        message: "COMPLIMENTARY_REASON_REQUIRED",
      });
    }
    if (
      line.disposition === "COMPLIMENTARY" &&
      !line.complimentaryReference?.trim()
    ) {
      context.addIssue({
        code: "custom",
        path: ["complimentaryReference"],
        message: "COMPLIMENTARY_REFERENCE_REQUIRED",
      });
    }
  });

const createDeclarationSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  servicePeriodCode: z.string().trim().min(1).max(40),
  idempotencyKey: z.string().trim().min(8).max(120),
  lines: z.array(declarationLineSchema).min(1).max(MAX_LINES),
});

const updateDeclarationSchema = createDeclarationSchema.extend({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const idActionSchema = z.object({
  id: z.string().uuid(),
});

const returnSchema = idActionSchema.extend({
  reason: z.string().trim().min(5).max(1000),
});

const reverseSchema = returnSchema.extend({
  idempotencyKey: z.string().trim().min(8).max(120),
});

const declarationStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "RETURNED",
  "DERIVATION_BLOCKED",
  "READY_TO_POST",
  "POSTING",
  "POSTED",
  "REVERSED",
  "CANCELLED",
]);

const workspaceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  query: z.string().trim().max(120).optional(),
  status: declarationStatusSchema.optional(),
  businessDateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  businessDateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type RestaurantConsumptionWorkspaceQuery = z.input<
  typeof workspaceQuerySchema
>;

const activateConfigurationSchema = idActionSchema.extend({
  reason: z.string().trim().min(5).max(500),
});

type ServicePeriod = z.infer<typeof servicePeriodSchema>;
type DerivedSnapshot = {
  declarationLineId: string;
  recipeVersionId: string;
  recipeLinePath: string;
  itemId: string;
  baseUomId: string;
  rawQuantityBaseUom: string;
  roundedQuantityBaseUom: string;
  conversionEvidence: Record<string, unknown>;
};

const defaultCompanySchedule = {
  mode: "SHIFT" as const,
  timezone: "Asia/Manila",
  periods: [
    { code: "OPEN", label: "Opening shift", start: "06:00", end: "14:00" },
    { code: "MID", label: "Mid shift", start: "14:00", end: "22:00" },
    { code: "LATE", label: "Late shift", start: "22:00", end: "06:00" },
  ],
};

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

type MenuRecipeAuthorityScope =
  | { mode: "BRAND_OR_COMPANY"; brandId: string }
  | {
      mode: "LOCATION_OR_PARENT";
      brandId: string;
      locationId: string;
    };

export async function assertLiveMenuRecipeAuthority(
  tx: any,
  session: SessionContext,
  input: {
    permissionCodes: string[];
    scope: MenuRecipeAuthorityScope;
    staleErrorCode?: string;
  },
) {
  const staleErrorCode = input.staleErrorCode ?? "MENU_RECIPE_AUTHORITY_STALE";
  const now = new Date();
  const users = await tx.$queryRaw<
    Array<{ status: string; privilegeEpoch: number }>
  >`SELECT u.status, u."privilegeEpoch"
      FROM "User" u
     WHERE u.id = ${session.user.id}::uuid
       AND u."tenantId" = ${session.context.tenantId}::uuid
     FOR SHARE OF u`;
  const user = users[0];
  if (!user || user.status !== "ACTIVE" || !session.authentication?.sessionId) {
    throw new Error(staleErrorCode);
  }
  const authSessions = await tx.$queryRaw<
    Array<{
      status: string;
      privilegeEpochAtIssue: number;
      idleExpiresAt: Date;
      absoluteExpiresAt: Date;
    }>
  >`SELECT s.status, s."privilegeEpochAtIssue", s."idleExpiresAt", s."absoluteExpiresAt"
      FROM "AuthSession" s
     WHERE s.id = ${session.authentication.sessionId}::uuid
       AND s."tenantId" = ${session.context.tenantId}::uuid
       AND s."userId" = ${session.user.id}::uuid
     FOR SHARE OF s`;
  const authSession = authSessions[0];
  if (
    !authSession ||
    authSession.status !== "ACTIVE" ||
    authSession.privilegeEpochAtIssue !== user.privilegeEpoch ||
    authSession.idleExpiresAt <= now ||
    authSession.absoluteExpiresAt <= now
  ) {
    throw new Error(staleErrorCode);
  }
  for (const permissionCode of [...new Set(input.permissionCodes)]) {
    const roles = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT ura.id
        FROM "UserRoleAssignment" ura
        JOIN "Role" r ON r.id = ura."roleId"
        JOIN "RolePermission" rp ON rp."roleId" = r.id
        JOIN "Permission" p ON p.id = rp."permissionId"
       WHERE ura."userId" = ${session.user.id}::uuid
         AND ura.status = 'ACTIVE'
         AND ura."startsAt" <= ${now}
         AND (ura."endsAt" IS NULL OR ura."endsAt" > ${now})
         AND r.status = 'ACTIVE'
         AND (r."tenantId" IS NULL OR r."tenantId" = ${session.context.tenantId}::uuid)
         AND p.code = ${permissionCode}
         AND (p."tenantId" IS NULL OR p."tenantId" = ${session.context.tenantId}::uuid)
       FOR SHARE OF ura, r, rp, p`;
    if (roles.length === 0) throw new Error("PERMISSION_DENIED");
  }
  const parentScopes = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT usa.id
      FROM "UserScopeAssignment" usa
     WHERE usa."userId" = ${session.user.id}::uuid
       AND usa.status = 'ACTIVE'
       AND usa."accessLevel" = 'MANAGE'::"AccessLevel"
       AND usa."startsAt" <= ${now}
       AND (usa."endsAt" IS NULL OR usa."endsAt" > ${now})
       AND (
         (usa."scopeType" = 'COMPANY'::"ScopeType" AND usa."scopeId" = ${session.context.companyId}::uuid)
         OR
         (usa."scopeType" = 'BRAND'::"ScopeType" AND usa."scopeId" = ${input.scope.brandId}::uuid)
       )
     FOR SHARE OF usa`;
  let scopeAuthorized = parentScopes.length > 0;
  if (!scopeAuthorized && input.scope.mode === "LOCATION_OR_PARENT") {
    const locationScopes = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT usa.id
        FROM "UserScopeAssignment" usa
       WHERE usa."userId" = ${session.user.id}::uuid
         AND usa.status = 'ACTIVE'
         AND usa."accessLevel" = 'MANAGE'::"AccessLevel"
         AND usa."startsAt" <= ${now}
         AND (usa."endsAt" IS NULL OR usa."endsAt" > ${now})
         AND usa."scopeType" = 'LOCATION'::"ScopeType"
         AND usa."scopeId" = ${input.scope.locationId}::uuid
       FOR SHARE OF usa`;
    scopeAuthorized = locationScopes.length > 0;
  }
  if (!scopeAuthorized) throw new Error("MENU_RECIPE_MANAGE_SCOPE_REQUIRED");
}

async function loadMenuPolicyCommandReplay(
  tx: any,
  session: SessionContext,
  input: {
    brandId: string;
    idempotencyKey: string;
    requestHash: string;
  },
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${session.context.tenantId}:${session.context.companyId}:${input.brandId}:${input.idempotencyKey}:MENU_POLICY_COMMAND`}, 0))`;
  const command = await tx.restaurantMenuPolicyCommand.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: input.brandId,
      idempotencyKey: input.idempotencyKey,
    },
  });
  if (command && command.requestHash !== input.requestHash) {
    throw new Error("RESTAURANT_MENU_POLICY_IDEMPOTENCY_CONFLICT");
  }
  return command;
}

async function recordMenuPolicyCommand(
  tx: any,
  session: SessionContext,
  input: {
    brandId: string;
    locationId?: string | null;
    commandType: string;
    idempotencyKey: string;
    requestHash: string;
    targetType: string;
    targetId: string;
    previewSnapshotHash?: string | null;
    outcome: Record<string, unknown>;
  },
) {
  return tx.restaurantMenuPolicyCommand.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: input.brandId,
      locationId: input.locationId ?? null,
      commandType: input.commandType,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      targetType: input.targetType,
      targetId: input.targetId,
      previewSnapshotHash: input.previewSnapshotHash ?? null,
      outcome: input.outcome,
      actorUserId: session.user.id,
    },
  });
}

async function assertMenuPolicyMfa(
  tx: any,
  session: SessionContext,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    reason: string;
  },
) {
  await assertPrivilegedMfaForAction(
    session,
    {
      action: input.action,
      enforcementScope: "all_sensitive",
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      metadata: { sourceDecisionId: "DEC-0280" },
    },
    { transaction: tx, forceEnforcement: true },
  );
}

function datePartsInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localDateTimeToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0);
  let guess = new Date(target);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = datePartsInTimeZone(guess, timeZone);
    const displayed = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess = new Date(guess.getTime() + (target - displayed));
  }
  return guess;
}

export function parseCompanyLocalDateTime(
  value: Date | string,
  timeZone: string,
) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()))
      throw new Error("EFFECTIVE_DATE_INVALID");
    return value;
  }
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) {
    const instant = new Date(value);
    if (Number.isNaN(instant.getTime())) {
      throw new Error("EFFECTIVE_DATE_INVALID");
    }
    return instant;
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(value);
  if (!match) throw new Error("EFFECTIVE_DATE_INVALID");
  const instant = localDateTimeToUtc(match[1]!, match[2]!, timeZone);
  const roundTrip = datePartsInTimeZone(instant, timeZone);
  if (
    `${roundTrip.year}-${roundTrip.month}-${roundTrip.day}` !== match[1] ||
    `${roundTrip.hour}:${roundTrip.minute}` !== match[2]
  ) {
    throw new Error("EFFECTIVE_LOCAL_TIME_INVALID");
  }
  return instant;
}

async function normalizeMenuPolicyEffectiveRange(
  tx: any,
  session: SessionContext,
  input: {
    effectiveFrom: Date | string;
    effectiveTo?: Date | string | undefined;
  },
) {
  const company = await tx.company.findFirst({
    where: {
      id: session.context.companyId,
      tenantId: session.context.tenantId,
      status: "ACTIVE",
    },
    select: { timezone: true },
  });
  if (!company) throw new Error("MENU_RECIPE_BRAND_SCOPE_DENIED");
  const effectiveFrom = parseCompanyLocalDateTime(
    input.effectiveFrom,
    company.timezone,
  );
  const effectiveTo = input.effectiveTo
    ? parseCompanyLocalDateTime(input.effectiveTo, company.timezone)
    : undefined;
  if (effectiveTo && effectiveTo <= effectiveFrom) {
    throw new Error("EFFECTIVE_RANGE_INVALID");
  }
  return { effectiveFrom, effectiveTo, timezone: company.timezone };
}

function addDateDay(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function coverageForPeriod(
  businessDate: string,
  timeZone: string,
  period: ServicePeriod,
) {
  const crossesMidnight = period.end <= period.start;
  return {
    start: localDateTimeToUtc(businessDate, period.start, timeZone),
    end: localDateTimeToUtc(
      crossesMidnight ? addDateDay(businessDate) : businessDate,
      period.end,
      timeZone,
    ),
  };
}

function formJson<T>(formData: FormData, field: string): T {
  const raw = formData.get(field);
  if (typeof raw !== "string")
    throw new Error(`${field.toUpperCase()}_REQUIRED`);
  return JSON.parse(raw) as T;
}

function decimal(value: string | number | Prisma.Decimal) {
  return new Prisma.Decimal(value);
}

function periodMinute(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour! * 60 + minute!;
}

function validateServicePeriods(
  mode: z.infer<typeof configureSchema>["servicePeriodMode"],
  periods: ServicePeriod[],
) {
  if (new Set(periods.map((period) => period.code)).size !== periods.length) {
    throw new Error("SERVICE_PERIOD_CODE_DUPLICATE");
  }
  if (mode === "DAILY") {
    if (periods.length !== 1 || periods[0]!.code !== "DAILY") {
      throw new Error("DAILY_SERVICE_PERIOD_REQUIRED");
    }
    return;
  }
  const ranges = periods.map((period) => {
    const start = periodMinute(period.start);
    const endValue = periodMinute(period.end);
    if (start === endValue) throw new Error("SHIFT_SERVICE_PERIOD_ZERO_LENGTH");
    return {
      code: period.code,
      start,
      end: endValue <= start ? endValue + 1440 : endValue,
    };
  });
  for (let leftIndex = 0; leftIndex < ranges.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < ranges.length;
      rightIndex += 1
    ) {
      const left = ranges[leftIndex]!;
      const right = ranges[rightIndex]!;
      const overlaps = [-1440, 0, 1440].some(
        (offset) =>
          left.start < right.end + offset && right.start + offset < left.end,
      );
      if (overlaps) {
        throw new Error(`SERVICE_PERIOD_OVERLAP:${left.code}:${right.code}`);
      }
    }
  }
}

function rounded6(value: Prisma.Decimal) {
  return value.toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

async function currentConfiguration(session: SessionContext, tx: any = db) {
  return tx.restaurantConsumptionConfiguration.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: session.context.locationId,
      status: "ACTIVE",
      enabled: true,
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
    orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
    include: { defaultIssueInventoryLocation: true },
  });
}

type EffectiveMenuRecipeResolution = {
  availabilityState: "AVAILABLE" | "UNAVAILABLE";
  resolutionSource: "LOCATION_OVERRIDE" | "BRAND_DEFAULT" | null;
  assignment: any | null;
  availabilityPolicyId: string | null;
  brandAdoptionId: string | null;
  blockerCode: string | null;
};

function fullCoverageWhere(start: Date, end: Date) {
  return {
    effectiveFrom: { lte: start },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: end } }],
  };
}

function assertSessionBrand(session: SessionContext, brandId: string) {
  if (session.context.brandId && session.context.brandId !== brandId) {
    throw new Error("MENU_RECIPE_BRAND_SCOPE_DENIED");
  }
}

async function assertLocationBrandScope(
  tx: any,
  session: SessionContext,
  locationId: string,
  brandId: string,
) {
  assertAuthorizedLocation(session, locationId);
  const location = await tx.location.findFirst({
    where: {
      id: locationId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId,
      locationType: "BRANCH",
      status: "ACTIVE",
    },
    select: { id: true, brandId: true },
  });
  if (!location) throw new Error("MENU_RECIPE_BRAND_SCOPE_DENIED");
  return location;
}

async function assignmentRecipeIsAuthorized(
  tx: any,
  session: SessionContext,
  assignment: any,
  start: Date,
  end: Date,
) {
  const recipe = assignment?.recipeVersion?.recipe;
  if (!recipe || recipe.status !== "ACTIVE") {
    return { authorized: false, brandAdoptionId: null };
  }
  if (
    !(
      assignment.recipeVersion.status === "PUBLISHED" ||
      assignment.recipeVersion.status === "SUPERSEDED"
    )
  ) {
    return { authorized: false, brandAdoptionId: null };
  }
  if (recipe.brandId === session.context.brandId) {
    return { authorized: true, brandAdoptionId: null };
  }
  if (recipe.brandId !== null) {
    return { authorized: false, brandAdoptionId: null };
  }
  const adoption = await tx.recipeBrandAdoption.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: session.context.brandId,
      recipeId: recipe.id,
      status: "ACTIVE",
      ...fullCoverageWhere(start, end),
    },
    orderBy: { effectiveFrom: "desc" },
  });
  return {
    authorized: Boolean(adoption),
    brandAdoptionId: adoption?.id ?? null,
  };
}

/**
 * Resolves one menu item for the entire service interval. An explicit branch
 * unavailability always wins; otherwise a location override wins over the
 * inherited brand default. Shared recipes require an effective brand adoption.
 */
async function resolveEffectiveMenuRecipeAssignment(
  session: SessionContext,
  input: {
    menuItemId: string;
    coverageStartAt: Date;
    coverageEndAt: Date;
    locationId?: string;
  },
  tx: any = db,
): Promise<EffectiveMenuRecipeResolution> {
  const locationId = input.locationId ?? session.context.locationId;
  if (input.coverageEndAt <= input.coverageStartAt) {
    throw new Error("MENU_RECIPE_EFFECTIVE_INTERVAL_INVALID");
  }
  const [location, menuItem] = await Promise.all([
    tx.location.findFirst({
      where: {
        id: locationId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId,
        locationType: "BRANCH",
        status: "ACTIVE",
      },
      select: { id: true },
    }),
    tx.menuItem.findFirst({
      where: {
        id: input.menuItemId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId,
        status: "ACTIVE",
      },
      select: { id: true },
    }),
  ]);
  if (!location || !menuItem) {
    return {
      availabilityState: "UNAVAILABLE",
      resolutionSource: null,
      assignment: null,
      availabilityPolicyId: null,
      brandAdoptionId: null,
      blockerCode: "MENU_RECIPE_BRAND_SCOPE_DENIED",
    };
  }

  const unavailableDuringCoverage =
    await tx.menuItemLocationAvailability.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId,
        locationId,
        menuItemId: input.menuItemId,
        state: "UNAVAILABLE",
        status: "ACTIVE",
        effectiveFrom: { lt: input.coverageEndAt },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gt: input.coverageStartAt } },
        ],
      },
      orderBy: { effectiveFrom: "desc" },
    });
  if (unavailableDuringCoverage) {
    return {
      availabilityState: "UNAVAILABLE",
      resolutionSource: null,
      assignment: null,
      availabilityPolicyId: unavailableDuringCoverage.id,
      brandAdoptionId: null,
      blockerCode: "MENU_ITEM_LOCATION_UNAVAILABLE",
    };
  }

  const availableForCoverage = await tx.menuItemLocationAvailability.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: session.context.brandId,
      locationId,
      menuItemId: input.menuItemId,
      state: "AVAILABLE",
      status: "ACTIVE",
      ...fullCoverageWhere(input.coverageStartAt, input.coverageEndAt),
    },
    orderBy: { effectiveFrom: "desc" },
  });

  const include = { recipeVersion: { include: { recipe: true } } };
  const locationOverride = await tx.menuRecipeAssignment.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: session.context.brandId,
      locationId,
      menuItemId: input.menuItemId,
      scopeType: "LOCATION_OVERRIDE",
      status: "ACTIVE",
      ...fullCoverageWhere(input.coverageStartAt, input.coverageEndAt),
    },
    include,
    orderBy: { effectiveFrom: "desc" },
  });
  const brandDefault = locationOverride
    ? null
    : await tx.menuRecipeAssignment.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: session.context.brandId,
          locationId: null,
          menuItemId: input.menuItemId,
          scopeType: "BRAND_DEFAULT",
          status: "ACTIVE",
          ...fullCoverageWhere(input.coverageStartAt, input.coverageEndAt),
        },
        include,
        orderBy: { effectiveFrom: "desc" },
      });
  const assignment = locationOverride ?? brandDefault;
  if (!assignment) {
    return {
      availabilityState: "AVAILABLE",
      resolutionSource: null,
      assignment: null,
      availabilityPolicyId: availableForCoverage?.id ?? null,
      brandAdoptionId: null,
      blockerCode: "MENU_RECIPE_ASSIGNMENT_MISSING",
    };
  }
  const recipeAuthorization = await assignmentRecipeIsAuthorized(
    tx,
    session,
    assignment,
    input.coverageStartAt,
    input.coverageEndAt,
  );
  if (!recipeAuthorization.authorized) {
    return {
      availabilityState: "AVAILABLE",
      resolutionSource: null,
      assignment: null,
      availabilityPolicyId: availableForCoverage?.id ?? null,
      brandAdoptionId: null,
      blockerCode:
        assignment.recipeVersion?.recipe?.brandId === null
          ? "SHARED_RECIPE_BRAND_ADOPTION_REQUIRED"
          : "MENU_RECIPE_BRAND_SCOPE_DENIED",
    };
  }
  return {
    availabilityState: "AVAILABLE",
    resolutionSource: locationOverride ? "LOCATION_OVERRIDE" : "BRAND_DEFAULT",
    assignment,
    availabilityPolicyId: availableForCoverage?.id ?? null,
    brandAdoptionId: recipeAuthorization.brandAdoptionId,
    blockerCode: null,
  };
}

function restaurantConsumptionWhere(
  session: SessionContext,
  query: z.output<typeof workspaceQuerySchema>,
) {
  return {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    locationId: session.context.locationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.businessDateFrom || query.businessDateTo
      ? {
          businessDate: {
            ...(query.businessDateFrom
              ? { gte: new Date(`${query.businessDateFrom}T00:00:00.000Z`) }
              : {}),
            ...(query.businessDateTo
              ? { lte: new Date(`${query.businessDateTo}T00:00:00.000Z`) }
              : {}),
          },
        }
      : {}),
    ...(query.query
      ? {
          OR: [
            {
              servicePeriodCode: {
                contains: query.query,
                mode: "insensitive" as const,
              },
            },
            {
              lines: {
                some: {
                  OR: [
                    {
                      menuItemCodeSnapshot: {
                        contains: query.query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      menuItemNameSnapshot: {
                        contains: query.query,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };
}

export async function getRestaurantConsumptionWorkspace(
  session: SessionContext,
  input: RestaurantConsumptionWorkspaceQuery = {},
) {
  await requirePermission(session, permissions.consumptionView);
  const query = workspaceQuerySchema.parse(input);
  const where = restaurantConsumptionWhere(session, query);
  const [configuration, totalItems, declarations, statusGroups] =
    await Promise.all([
      currentConfiguration(session),
      db.servingDeclaration.count({ where }),
      db.servingDeclaration.findMany({
        where,
        orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          lines: true,
          posting: {
            include: { allocations: { select: { quantityBaseUom: true } } },
          },
        },
      }),
      db.servingDeclaration.groupBy({
        by: ["status"],
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          locationId: session.context.locationId,
        },
        _count: { _all: true },
      }),
    ]);
  return {
    configuration,
    declarations,
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
    filters: query,
    statusCounts: Object.fromEntries(
      statusGroups.map((group: any) => [group.status, group._count._all]),
    ) as Record<string, number>,
  };
}

export async function listRestaurantConsumptionExportRows(
  session: SessionContext,
  input: RestaurantConsumptionWorkspaceQuery = {},
  maxRows = 5_000,
) {
  await requirePermission(session, permissions.consumptionView);
  const query = workspaceQuerySchema.parse({
    ...input,
    page: 1,
    pageSize: Math.min(100, maxRows),
  });
  const declarations = await db.servingDeclaration.findMany({
    where: restaurantConsumptionWhere(session, query),
    orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
    take: maxRows,
    include: {
      lines: { orderBy: { lineNo: "asc" } },
      ingredientSnapshots: {
        orderBy: [{ declarationLineId: "asc" }, { recipeLinePath: "asc" }],
        include: {
          item: { select: { itemCode: true, itemName: true } },
          baseUom: { select: { uomCode: true } },
        },
      },
      posting: { include: { allocations: true } },
    },
  });
  return declarations
    .flatMap((declaration: any) => {
      const lineById = new Map(
        declaration.lines.map((line: any) => [line.id, line]),
      );
      if (declaration.ingredientSnapshots.length === 0) {
        return declaration.lines.map((line: any) => ({
          declaration,
          line,
          ingredient: null,
        }));
      }
      return declaration.ingredientSnapshots.map((ingredient: any) => ({
        declaration,
        line: lineById.get(ingredient.declarationLineId) ?? null,
        ingredient,
      }));
    })
    .slice(0, maxRows);
}

export async function getRestaurantConsumptionSettings(
  session: SessionContext,
) {
  await requireAnyPermission(session, [
    permissions.consumptionView,
    permissions.consumptionCreate,
    permissions.consumptionVerify,
    permissions.consumptionPost,
    permissions.consumptionReverse,
    permissions.consumptionConfigure,
    menuRecipePolicyPermissions.adopt,
    menuRecipePolicyPermissions.branchException,
    menuRecipePolicyPermissions.rollout,
  ]);
  const now = new Date();
  const [
    latestConfiguration,
    effectiveConfiguration,
    inventoryLocations,
    menuItems,
    publishedRecipes,
    brandDefaults,
    locationOverrides,
    locationAvailabilities,
    sharedRecipeAdoptions,
    sharedPublishedRecipes,
    inventoryItems,
    savedDefaultSchedule,
    company,
  ] = await Promise.all([
    db.restaurantConsumptionConfiguration.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
      },
      orderBy: { version: "desc" },
      include: { defaultIssueInventoryLocation: true },
    }),
    currentConfiguration(session),
    db.inventoryLocation.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: "ACTIVE",
      },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, storageType: true },
    }),
    db.menuItem.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId,
        status: "ACTIVE",
      },
      orderBy: [{ menuCategory: "asc" }, { menuItemName: "asc" }],
      select: {
        id: true,
        menuItemCode: true,
        menuItemName: true,
        menuCategory: true,
      },
    }),
    db.recipeVersion.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PUBLISHED",
        recipe: {
          status: "ACTIVE",
          OR: [
            { brandId: session.context.brandId },
            {
              brandId: null,
              brandAdoptions: {
                some: {
                  tenantId: session.context.tenantId,
                  companyId: session.context.companyId,
                  brandId: session.context.brandId,
                  status: "ACTIVE",
                  effectiveFrom: { lte: now },
                  OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
                },
              },
            },
          ],
        },
      },
      orderBy: [{ recipe: { recipeName: "asc" } }, { versionNo: "desc" }],
      include: {
        recipe: {
          select: {
            id: true,
            brandId: true,
            recipeCode: true,
            recipeName: true,
          },
        },
      },
    }),
    db.menuRecipeAssignment.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId,
        locationId: null,
        scopeType: "BRAND_DEFAULT",
        status: "ACTIVE",
      },
      include: {
        menuItem: { select: { menuItemCode: true, menuItemName: true } },
        recipeVersion: {
          include: {
            recipe: { select: { recipeCode: true, recipeName: true } },
          },
        },
      },
      orderBy: { menuItem: { menuItemName: "asc" } },
    }),
    db.menuRecipeAssignment.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId,
        locationId: session.context.locationId,
        scopeType: "LOCATION_OVERRIDE",
        status: "ACTIVE",
      },
      include: {
        menuItem: { select: { menuItemCode: true, menuItemName: true } },
        recipeVersion: {
          include: {
            recipe: { select: { recipeCode: true, recipeName: true } },
          },
        },
      },
      orderBy: { menuItem: { menuItemName: "asc" } },
    }),
    db.menuItemLocationAvailability.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId,
        locationId: session.context.locationId,
        status: "ACTIVE",
      },
      orderBy: [
        { menuItem: { menuItemName: "asc" } },
        { effectiveFrom: "desc" },
      ],
    }),
    db.recipeBrandAdoption.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId,
        status: "ACTIVE",
      },
      include: { recipe: { select: { recipeCode: true, recipeName: true } } },
      orderBy: [{ recipe: { recipeName: "asc" } }, { effectiveFrom: "desc" }],
    }),
    db.recipeVersion.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PUBLISHED",
        recipe: { status: "ACTIVE", brandId: null },
      },
      orderBy: [{ recipe: { recipeName: "asc" } }, { versionNo: "desc" }],
      include: {
        recipe: {
          select: {
            id: true,
            brandId: true,
            recipeCode: true,
            recipeName: true,
          },
        },
      },
    }),
    db.item.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
        trackInventory: true,
      },
      orderBy: [{ category: { categoryName: "asc" } }, { itemName: "asc" }],
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        category: { select: { categoryName: true } },
      },
    }),
    db.companyPolicySetting.findUnique({
      where: {
        companyId_key: {
          companyId: session.context.companyId,
          key: "restaurant.consumption.default_service_periods",
        },
      },
      select: { value: true, isDefault: true, updatedAt: true },
    }),
    db.company.findFirst({
      where: {
        id: session.context.companyId,
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
      select: { timezone: true },
    }),
  ]);
  const parsedDefaultSchedule = z
    .object({
      mode: z.enum(["DAILY", "SHIFT"]),
      timezone: z.string().trim().min(3).max(80),
      periods: z.array(servicePeriodSchema).min(1).max(12),
    })
    .safeParse(savedDefaultSchedule?.value ?? defaultCompanySchedule);
  const companyDefaultSchedule = parsedDefaultSchedule.success
    ? parsedDefaultSchedule.data
    : defaultCompanySchedule;
  validateServicePeriods(
    companyDefaultSchedule.mode,
    companyDefaultSchedule.periods,
  );
  const activationReadiness =
    latestConfiguration?.status === "DRAFT"
      ? await restaurantConsumptionConfigurationReadiness(
          db,
          session,
          latestConfiguration,
        )
      : { blockers: [] };
  const menuReadiness = await Promise.all(
    menuItems.map((menuItem: any) =>
      buildMenuReadinessRow(
        db,
        session,
        menuItem,
        now,
        new Date(now.getTime() + 1),
      ),
    ),
  );
  return {
    latestConfiguration,
    effectiveConfiguration,
    inventoryLocations,
    menuItems,
    publishedRecipes,
    assignments: [...brandDefaults, ...locationOverrides],
    brandDefaults,
    locationOverrides,
    locationAvailabilities,
    sharedRecipeAdoptions,
    sharedPublishedRecipes,
    menuReadiness,
    inventoryItems,
    companyDefaultSchedule,
    companyTimezone: company?.timezone ?? companyDefaultSchedule.timezone,
    companyDefaultScheduleIsConfigured: Boolean(savedDefaultSchedule),
    activationReadiness,
  };
}

export async function getServingDeclarationDetail(
  session: SessionContext,
  id: string,
) {
  await requirePermission(session, permissions.consumptionView);
  const [declaration, activity] = await Promise.all([
    db.servingDeclaration.findFirst({
      where: {
        id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
      },
      include: {
        configuration: { include: { defaultIssueInventoryLocation: true } },
        lines: { orderBy: { lineNo: "asc" } },
        ingredientSnapshots: {
          orderBy: [{ declarationLineId: "asc" }, { recipeLinePath: "asc" }],
          include: {
            item: { select: { itemCode: true, itemName: true } },
            baseUom: { select: { uomCode: true } },
          },
        },
        posting: {
          include: {
            allocations: {
              orderBy: { allocationNo: "asc" },
              include: {
                item: { select: { itemCode: true, itemName: true } },
                baseUom: { select: { uomCode: true } },
              },
            },
          },
        },
      },
    }),
    db.auditEvent.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        entityType: "ServingDeclaration",
        entityId: id,
      },
      orderBy: { occurredAt: "desc" },
      take: 100,
      include: {
        actor: { select: { email: true, displayName: true } },
      },
    }),
  ]);
  if (!declaration) throw new Error("SERVING_DECLARATION_NOT_FOUND");
  return { ...declaration, activity };
}

export async function listRestaurantConsumptionCatalog(
  session: SessionContext,
) {
  await requirePermission(session, permissions.consumptionCreate);
  const now = new Date();
  const coverageEndAt = new Date(now.getTime() + 1);
  const menuItems = await db.menuItem.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: session.context.brandId,
      status: "ACTIVE",
    },
    orderBy: [{ menuCategory: "asc" }, { menuItemName: "asc" }],
    select: {
      id: true,
      menuItemCode: true,
      menuItemName: true,
      menuCategory: true,
    },
  });
  const resolved = await Promise.all(
    menuItems.map(async (menuItem: any) => ({
      menuItem,
      readiness: await buildMenuReadinessRow(
        db,
        session,
        menuItem,
        now,
        coverageEndAt,
      ),
    })),
  );
  return resolved
    .filter(({ readiness }) => readiness.offerState !== "UNAVAILABLE")
    .map(({ menuItem, readiness }) => ({
      ...menuItem,
      offerState: readiness.offerState,
      resolutionSource: readiness.resolutionSource,
      assignmentId: readiness.assignmentId,
      recipeVersionId: readiness.recipeVersionId,
      recipeName: readiness.recipeName,
      versionNo: readiness.versionNo,
      quantityReadiness: readiness.quantityReadiness,
      quantityBlockers: readiness.quantityBlockers,
      pendingCostLineCount:
        readiness.costReadiness === "PENDING"
          ? readiness.costWarnings.length
          : 0,
      costWarnings: readiness.costWarnings,
    }));
}

export async function configureRestaurantConsumption(input: unknown) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.consumptionConfigure);
  const values = configureSchema.parse(input);
  assertAuthorizedLocation(session, values.locationId);
  const periods = values.servicePeriods.map((period) =>
    servicePeriodSchema.parse(period),
  );
  validateServicePeriods(values.servicePeriodMode, periods);
  return db.$transaction(async (tx: any) => {
    const location = await tx.inventoryLocation.findFirst({
      where: {
        id: values.defaultIssueInventoryLocationId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: values.locationId,
        status: "ACTIVE",
      },
    });
    if (!location) throw new Error("CONSUMPTION_ISSUE_LOCATION_SCOPE_DENIED");
    const sentinelItemIds = values.sentinelRules?.dailyCountItemIds ?? [];
    if (sentinelItemIds.length) {
      const eligibleSentinelCount = await tx.item.count({
        where: {
          id: { in: sentinelItemIds },
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE",
          trackInventory: true,
        },
      });
      if (eligibleSentinelCount !== new Set(sentinelItemIds).size) {
        throw new Error("CONSUMPTION_SENTINEL_ITEM_SCOPE_INVALID");
      }
    }
    const latest = await tx.restaurantConsumptionConfiguration.findFirst({
      where: {
        companyId: session.context.companyId,
        locationId: values.locationId,
      },
      orderBy: { version: "desc" },
    });
    if (latest && values.effectiveFrom <= latest.effectiveFrom) {
      throw new Error("CONSUMPTION_CONFIGURATION_EFFECTIVE_FROM_NOT_LATER");
    }
    const configuration = await tx.restaurantConsumptionConfiguration.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: values.locationId,
        defaultIssueInventoryLocationId: values.defaultIssueInventoryLocationId,
        version: (latest?.version ?? 0) + 1,
        status: "DRAFT",
        enabled: false,
        servicePeriodMode: values.servicePeriodMode,
        timezone: values.timezone,
        servicePeriods: periods,
        sentinelRules: values.sentinelRules ?? Prisma.JsonNull,
        effectiveFrom: values.effectiveFrom,
        reason: values.reason,
        createdByUserId: session.user.id,
        activatedByUserId: null,
      },
    });
    if (values.saveAsCompanyDefault) {
      const scheduleValue = {
        mode: values.servicePeriodMode,
        timezone: values.timezone,
        periods,
      };
      const savedDefault = await tx.companyPolicySetting.upsert({
        where: {
          companyId_key: {
            companyId: session.context.companyId,
            key: "restaurant.consumption.default_service_periods",
          },
        },
        create: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          key: "restaurant.consumption.default_service_periods",
          category: "restaurant",
          label: "Default serving-entry schedule",
          description:
            "Company default timezone and service periods copied into new branch consumption configurations.",
          value: scheduleValue,
          defaultValue: defaultCompanySchedule,
          valueType: "JSON",
          sourceDecisionId: "DEC-0279",
          isDefault:
            canonicalHash(scheduleValue) ===
            canonicalHash(defaultCompanySchedule),
          status: "ACTIVE",
          updatedByUserId: session.user.id,
        },
        update: {
          value: scheduleValue,
          sourceDecisionId: "DEC-0279",
          isDefault:
            canonicalHash(scheduleValue) ===
            canonicalHash(defaultCompanySchedule),
          status: "ACTIVE",
          updatedByUserId: session.user.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "company_policy_setting.updated",
          entityType: "CompanyPolicySetting",
          entityId: savedDefault.id,
          afterData: { key: savedDefault.key, value: scheduleValue },
          metadata: { reason: values.reason, sourceDecisionId: "DEC-0279" },
        },
      });
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "restaurant_consumption.configuration_created",
        entityType: "RestaurantConsumptionConfiguration",
        entityId: configuration.id,
        afterData: {
          version: configuration.version,
          enabled: false,
          locationId: values.locationId,
        },
        metadata: {
          reason: values.reason,
          savedAsCompanyDefault: values.saveAsCompanyDefault,
        },
      },
    });
    return configuration;
  });
}

export async function activateRestaurantConsumptionConfiguration(
  formData: FormData,
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.consumptionConfigure);
  const values = activateConfigurationSchema.parse(
    Object.fromEntries(formData),
  );
  return db.$transaction(
    async (tx: any) => {
      const rows = await tx.$queryRaw<
        any[]
      >`SELECT * FROM "RestaurantConsumptionConfiguration" WHERE id = ${values.id}::uuid AND "tenantId" = ${session.context.tenantId}::uuid AND "companyId" = ${session.context.companyId}::uuid AND "locationId" = ${session.context.locationId}::uuid FOR UPDATE`;
      const target = rows[0];
      if (!target || target.status !== "DRAFT" || target.enabled) {
        throw new Error("CONSUMPTION_CONFIGURATION_NOT_ACTIVATABLE");
      }
      const readiness = await restaurantConsumptionConfigurationReadiness(
        tx,
        session,
        target,
      );
      if (readiness.blockers.length > 0) {
        throw new Error("CONSUMPTION_CONFIGURATION_READINESS_BLOCKED");
      }
      await tx.restaurantConsumptionConfiguration.updateMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          locationId: session.context.locationId,
          status: "ACTIVE",
          enabled: true,
          effectiveTo: null,
        },
        data: { effectiveTo: target.effectiveFrom },
      });
      const activated = await tx.restaurantConsumptionConfiguration.update({
        where: { id: target.id },
        data: {
          status: "ACTIVE",
          enabled: true,
          activatedByUserId: session.user.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "restaurant_consumption.configuration_activated",
          entityType: "RestaurantConsumptionConfiguration",
          entityId: target.id,
          beforeData: { status: "DRAFT", enabled: false },
          afterData: {
            status: "ACTIVE",
            enabled: true,
            effectiveFrom: target.effectiveFrom,
          },
          metadata: { reason: values.reason },
        },
      });
      return activated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function scheduleEffectiveSuccessor(input: {
  tx: any;
  delegate: any;
  scopeWhere: Record<string, unknown>;
  createData: Record<string, unknown>;
  effectiveFrom: Date;
  effectiveTo?: Date | undefined;
}) {
  const records = await input.delegate.findMany({
    where: { ...input.scopeWhere, status: "ACTIVE" },
    orderBy: { effectiveFrom: "asc" },
  });
  const replay = records.find(
    (record: any) =>
      record.effectiveFrom.getTime() === input.effectiveFrom.getTime() &&
      (record.effectiveTo?.getTime() ?? null) ===
        (input.effectiveTo?.getTime() ?? null) &&
      Object.entries(input.createData).every(
        ([key, value]) =>
          key === "reason" ||
          key === "createdByUserId" ||
          record[key] === value,
      ),
  );
  if (replay) return { record: replay, predecessor: null, replayed: true };
  const conflictingFuture = records.find(
    (record: any) =>
      record.effectiveFrom >= input.effectiveFrom &&
      (!input.effectiveTo || record.effectiveFrom < input.effectiveTo),
  );
  if (conflictingFuture) {
    throw new Error("MENU_RECIPE_ASSIGNMENT_EFFECTIVE_RANGE_CONFLICT");
  }
  const predecessor = [...records]
    .reverse()
    .find(
      (record: any) =>
        record.effectiveFrom < input.effectiveFrom &&
        (!record.effectiveTo || record.effectiveTo > input.effectiveFrom),
    );
  if (predecessor) {
    await input.delegate.update({
      where: { id: predecessor.id },
      data: { effectiveTo: input.effectiveFrom },
    });
  }
  const record = await input.delegate.create({
    data: {
      ...input.createData,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      status: "ACTIVE",
    },
  });
  return { record, predecessor: predecessor ?? null, replayed: false };
}

async function loadAssignableMenuAndRecipe(
  tx: any,
  session: SessionContext,
  values: {
    brandId: string;
    menuItemId: string;
    recipeVersionId: string;
    effectiveFrom: Date;
    effectiveTo?: Date | undefined;
  },
) {
  assertSessionBrand(session, values.brandId);
  const [menuItem, recipeVersion] = await Promise.all([
    tx.menuItem.findFirst({
      where: {
        id: values.menuItemId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: values.brandId,
        status: "ACTIVE",
      },
    }),
    tx.recipeVersion.findFirst({
      where: {
        id: values.recipeVersionId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PUBLISHED",
        recipe: { status: "ACTIVE" },
      },
      include: { recipe: true },
    }),
  ]);
  if (!menuItem) throw new Error("MENU_RECIPE_BRAND_SCOPE_DENIED");
  if (!recipeVersion) throw new Error("MENU_RECIPE_NOT_QUANTITY_READY");
  if (recipeVersion.recipe.brandId !== values.brandId) {
    if (recipeVersion.recipe.brandId !== null) {
      throw new Error("MENU_RECIPE_BRAND_SCOPE_DENIED");
    }
    const adoption = await tx.recipeBrandAdoption.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: values.brandId,
        recipeId: recipeVersion.recipeId,
        status: "ACTIVE",
        ...fullCoverageWhere(
          values.effectiveFrom,
          values.effectiveTo ?? new Date("9999-12-31T23:59:59.999Z"),
        ),
      },
    });
    if (!adoption) throw new Error("SHARED_RECIPE_BRAND_ADOPTION_REQUIRED");
  }
  await assertRecipeVersionQuantityReadyForConsumption(
    tx,
    recipeVersion,
    values.menuItemId,
  );
  return { menuItem, recipeVersion };
}

export async function assignBrandMenuRecipeDefault(input: unknown) {
  const session = await requireSessionContext();
  await requirePermission(session, menuRecipePolicyPermissions.adopt);
  const parsedValues = brandMenuRecipeDefaultSchema.parse(input);
  return db.$transaction(
    async (tx: any) => {
      const values = {
        ...parsedValues,
        ...(await normalizeMenuPolicyEffectiveRange(tx, session, parsedValues)),
      };
      const requestHash = canonicalHash(values);
      assertSessionBrand(session, values.brandId);
      await assertLiveMenuRecipeAuthority(tx, session, {
        permissionCodes: [menuRecipePolicyPermissions.adopt],
        scope: { mode: "BRAND_OR_COMPANY", brandId: values.brandId },
      });
      await assertMenuPolicyMfa(tx, session, {
        action: "restaurant_menu_policy.set_brand_default",
        entityType: "MenuItem",
        entityId: values.menuItemId,
        reason: values.reason,
      });
      const commandReplay = await loadMenuPolicyCommandReplay(tx, session, {
        brandId: values.brandId,
        idempotencyKey: values.idempotencyKey,
        requestHash,
      });
      if (commandReplay) {
        return tx.menuRecipeAssignment.findUniqueOrThrow({
          where: { id: commandReplay.targetId },
        });
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${session.context.companyId}:${values.brandId}:${values.menuItemId}:BRAND_DEFAULT`}, 0))`;
      const { menuItem, recipeVersion } = await loadAssignableMenuAndRecipe(
        tx,
        session,
        values,
      );
      const scheduled = await scheduleEffectiveSuccessor({
        tx,
        delegate: tx.menuRecipeAssignment,
        scopeWhere: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: values.brandId,
          scopeType: "BRAND_DEFAULT",
          locationId: null,
          menuItemId: values.menuItemId,
        },
        createData: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: values.brandId,
          scopeType: "BRAND_DEFAULT",
          locationId: null,
          menuItemId: menuItem.id,
          recipeVersionId: recipeVersion.id,
          reason: values.reason,
          createdByUserId: session.user.id,
        },
        effectiveFrom: values.effectiveFrom,
        effectiveTo: values.effectiveTo,
      });
      const assignment = scheduled.record;
      if (!scheduled.replayed)
        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType:
              "restaurant_consumption.brand_menu_recipe_default_assigned",
            entityType: "MenuRecipeAssignment",
            entityId: assignment.id,
            beforeData: scheduled.predecessor
              ? {
                  assignmentId: scheduled.predecessor.id,
                  recipeVersionId: scheduled.predecessor.recipeVersionId,
                  effectiveTo: values.effectiveFrom,
                }
              : Prisma.JsonNull,
            afterData: {
              brandId: values.brandId,
              menuItemId: menuItem.id,
              recipeVersionId: recipeVersion.id,
              scopeType: "BRAND_DEFAULT",
              effectiveFrom: values.effectiveFrom,
              effectiveTo: values.effectiveTo ?? null,
            },
            metadata: { reason: values.reason, sourceDecisionId: "DEC-0280" },
          },
        });
      await recordMenuPolicyCommand(tx, session, {
        brandId: values.brandId,
        commandType: "SET_BRAND_DEFAULT",
        idempotencyKey: values.idempotencyKey,
        requestHash,
        targetType: "MENU_RECIPE_ASSIGNMENT",
        targetId: assignment.id,
        outcome: {
          assignmentId: assignment.id,
          recipeVersionId: recipeVersion.id,
          replayedExistingPolicy: scheduled.replayed,
        },
      });
      return assignment;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function assignLocationMenuRecipeOverride(input: unknown) {
  const session = await requireSessionContext();
  await requirePermission(session, menuRecipePolicyPermissions.branchException);
  await requirePermission(session, menuRecipePolicyPermissions.adopt);
  const parsedValues = locationMenuRecipeOverrideSchema.parse(input);
  return db.$transaction(
    async (tx: any) => {
      const values = {
        ...parsedValues,
        ...(await normalizeMenuPolicyEffectiveRange(tx, session, parsedValues)),
      };
      const requestHash = canonicalHash(values);
      assertSessionBrand(session, values.brandId);
      await assertLiveMenuRecipeAuthority(tx, session, {
        permissionCodes: [
          menuRecipePolicyPermissions.branchException,
          menuRecipePolicyPermissions.adopt,
        ],
        scope: { mode: "BRAND_OR_COMPANY", brandId: values.brandId },
      });
      await assertMenuPolicyMfa(tx, session, {
        action: "restaurant_menu_policy.set_location_override",
        entityType: "MenuItem",
        entityId: values.menuItemId,
        reason: values.reason,
      });
      await assertLocationBrandScope(
        tx,
        session,
        values.locationId,
        values.brandId,
      );
      const commandReplay = await loadMenuPolicyCommandReplay(tx, session, {
        brandId: values.brandId,
        idempotencyKey: values.idempotencyKey,
        requestHash,
      });
      if (commandReplay) {
        return tx.menuRecipeAssignment.findUniqueOrThrow({
          where: { id: commandReplay.targetId },
        });
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${session.context.companyId}:${values.locationId}:${values.menuItemId}:LOCATION_OVERRIDE`}, 0))`;
      const { menuItem, recipeVersion } = await loadAssignableMenuAndRecipe(
        tx,
        session,
        values,
      );
      const scheduled = await scheduleEffectiveSuccessor({
        tx,
        delegate: tx.menuRecipeAssignment,
        scopeWhere: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: values.brandId,
          scopeType: "LOCATION_OVERRIDE",
          locationId: values.locationId,
          menuItemId: values.menuItemId,
        },
        createData: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: values.brandId,
          scopeType: "LOCATION_OVERRIDE",
          locationId: values.locationId,
          menuItemId: menuItem.id,
          recipeVersionId: recipeVersion.id,
          reason: values.reason,
          createdByUserId: session.user.id,
        },
        effectiveFrom: values.effectiveFrom,
        effectiveTo: values.effectiveTo,
      });
      const assignment = scheduled.record;
      if (!scheduled.replayed)
        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType:
              "restaurant_consumption.location_menu_recipe_override_assigned",
            entityType: "MenuRecipeAssignment",
            entityId: assignment.id,
            beforeData: scheduled.predecessor
              ? {
                  assignmentId: scheduled.predecessor.id,
                  recipeVersionId: scheduled.predecessor.recipeVersionId,
                  effectiveTo: values.effectiveFrom,
                }
              : Prisma.JsonNull,
            afterData: {
              brandId: values.brandId,
              locationId: values.locationId,
              menuItemId: menuItem.id,
              recipeVersionId: recipeVersion.id,
              scopeType: "LOCATION_OVERRIDE",
            },
            metadata: { reason: values.reason, sourceDecisionId: "DEC-0280" },
          },
        });
      await recordMenuPolicyCommand(tx, session, {
        brandId: values.brandId,
        locationId: values.locationId,
        commandType: "SET_LOCATION_OVERRIDE",
        idempotencyKey: values.idempotencyKey,
        requestHash,
        targetType: "MENU_RECIPE_ASSIGNMENT",
        targetId: assignment.id,
        outcome: {
          assignmentId: assignment.id,
          recipeVersionId: recipeVersion.id,
          replayedExistingPolicy: scheduled.replayed,
        },
      });
      return assignment;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** Backward-compatible branch action; location assignments are now overrides. */
export async function assignMenuRecipe(input: unknown) {
  const values = assignmentSchema.parse(input);
  const session = await requireSessionContext();
  return assignLocationMenuRecipeOverride({
    ...values,
    brandId: session.context.brandId,
  });
}

export async function setMenuItemLocationAvailability(input: unknown) {
  const session = await requireSessionContext();
  await requirePermission(session, menuRecipePolicyPermissions.branchException);
  const parsedValues = menuItemLocationAvailabilitySchema.parse(input);
  return db.$transaction(
    async (tx: any) => {
      const values = {
        ...parsedValues,
        ...(await normalizeMenuPolicyEffectiveRange(tx, session, parsedValues)),
      };
      const requestHash = canonicalHash(values);
      assertSessionBrand(session, values.brandId);
      await assertLiveMenuRecipeAuthority(tx, session, {
        permissionCodes: [menuRecipePolicyPermissions.branchException],
        scope: {
          mode: "LOCATION_OR_PARENT",
          brandId: values.brandId,
          locationId: values.locationId,
        },
      });
      await assertMenuPolicyMfa(tx, session, {
        action: "restaurant_menu_policy.set_location_availability",
        entityType: "MenuItem",
        entityId: values.menuItemId,
        reason: values.reason,
      });
      await assertLocationBrandScope(
        tx,
        session,
        values.locationId,
        values.brandId,
      );
      const commandReplay = await loadMenuPolicyCommandReplay(tx, session, {
        brandId: values.brandId,
        idempotencyKey: values.idempotencyKey,
        requestHash,
      });
      if (commandReplay) {
        return tx.menuItemLocationAvailability.findUniqueOrThrow({
          where: { id: commandReplay.targetId },
        });
      }
      const menuItem = await tx.menuItem.findFirst({
        where: {
          id: values.menuItemId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: values.brandId,
          status: "ACTIVE",
        },
      });
      if (!menuItem) throw new Error("MENU_RECIPE_BRAND_SCOPE_DENIED");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${session.context.companyId}:${values.locationId}:${values.menuItemId}:AVAILABILITY`}, 0))`;
      const scheduled = await scheduleEffectiveSuccessor({
        tx,
        delegate: tx.menuItemLocationAvailability,
        scopeWhere: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: values.brandId,
          locationId: values.locationId,
          menuItemId: values.menuItemId,
        },
        createData: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: values.brandId,
          locationId: values.locationId,
          menuItemId: values.menuItemId,
          state: values.state,
          reason: values.reason,
          createdByUserId: session.user.id,
        },
        effectiveFrom: values.effectiveFrom,
        effectiveTo: values.effectiveTo,
      });
      const availability = scheduled.record;
      if (!scheduled.replayed)
        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType:
              "restaurant_consumption.menu_item_location_availability_changed",
            entityType: "MenuItemLocationAvailability",
            entityId: availability.id,
            beforeData: scheduled.predecessor
              ? {
                  availabilityId: scheduled.predecessor.id,
                  state: scheduled.predecessor.state,
                  effectiveTo: values.effectiveFrom,
                }
              : Prisma.JsonNull,
            afterData: {
              brandId: values.brandId,
              locationId: values.locationId,
              menuItemId: values.menuItemId,
              state: values.state,
              effectiveFrom: values.effectiveFrom,
              effectiveTo: values.effectiveTo ?? null,
            },
            metadata: { reason: values.reason, sourceDecisionId: "DEC-0280" },
          },
        });
      await recordMenuPolicyCommand(tx, session, {
        brandId: values.brandId,
        locationId: values.locationId,
        commandType: "SET_LOCATION_AVAILABILITY",
        idempotencyKey: values.idempotencyKey,
        requestHash,
        targetType: "MENU_ITEM_LOCATION_AVAILABILITY",
        targetId: availability.id,
        outcome: {
          availabilityId: availability.id,
          state: values.state,
          replayedExistingPolicy: scheduled.replayed,
        },
      });
      return availability;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function adoptSharedRecipeForBrand(input: unknown) {
  const session = await requireSessionContext();
  await requirePermission(session, menuRecipePolicyPermissions.adopt);
  const parsedValues = sharedRecipeBrandAdoptionSchema.parse(input);
  return db.$transaction(
    async (tx: any) => {
      const values = {
        ...parsedValues,
        ...(await normalizeMenuPolicyEffectiveRange(tx, session, parsedValues)),
      };
      const requestHash = canonicalHash(values);
      assertSessionBrand(session, values.brandId);
      await assertLiveMenuRecipeAuthority(tx, session, {
        permissionCodes: [menuRecipePolicyPermissions.adopt],
        scope: { mode: "BRAND_OR_COMPANY", brandId: values.brandId },
      });
      await assertMenuPolicyMfa(tx, session, {
        action: "restaurant_menu_policy.adopt_shared_recipe",
        entityType: "Recipe",
        entityId: values.recipeId,
        reason: values.reason,
      });
      const commandReplay = await loadMenuPolicyCommandReplay(tx, session, {
        brandId: values.brandId,
        idempotencyKey: values.idempotencyKey,
        requestHash,
      });
      if (commandReplay) {
        return tx.recipeBrandAdoption.findUniqueOrThrow({
          where: { id: commandReplay.targetId },
        });
      }
      const recipe = await tx.recipe.findFirst({
        where: {
          id: values.recipeId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: null,
          status: "ACTIVE",
        },
      });
      if (!recipe) throw new Error("SHARED_RECIPE_BRAND_ADOPTION_REQUIRED");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${session.context.companyId}:${values.brandId}:${values.recipeId}:ADOPTION`}, 0))`;
      const scheduled = await scheduleEffectiveSuccessor({
        tx,
        delegate: tx.recipeBrandAdoption,
        scopeWhere: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: values.brandId,
          recipeId: values.recipeId,
        },
        createData: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: values.brandId,
          recipeId: values.recipeId,
          reason: values.reason,
          createdByUserId: session.user.id,
        },
        effectiveFrom: values.effectiveFrom,
        effectiveTo: values.effectiveTo,
      });
      const adoption = scheduled.record;
      if (!scheduled.replayed)
        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType: "restaurant_consumption.shared_recipe_adopted_for_brand",
            entityType: "RecipeBrandAdoption",
            entityId: adoption.id,
            beforeData: scheduled.predecessor
              ? {
                  adoptionId: scheduled.predecessor.id,
                  effectiveTo: values.effectiveFrom,
                }
              : Prisma.JsonNull,
            afterData: {
              brandId: values.brandId,
              recipeId: values.recipeId,
              effectiveFrom: values.effectiveFrom,
              effectiveTo: values.effectiveTo ?? null,
            },
            metadata: { reason: values.reason, sourceDecisionId: "DEC-0280" },
          },
        });
      await recordMenuPolicyCommand(tx, session, {
        brandId: values.brandId,
        commandType: "ADOPT_SHARED_RECIPE",
        idempotencyKey: values.idempotencyKey,
        requestHash,
        targetType: "RECIPE_BRAND_ADOPTION",
        targetId: adoption.id,
        outcome: {
          adoptionId: adoption.id,
          recipeId: values.recipeId,
          replayedExistingPolicy: scheduled.replayed,
        },
      });
      return adoption;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function endLocationMenuRecipeOverride(input: unknown) {
  const session = await requireSessionContext();
  await requirePermission(session, menuRecipePolicyPermissions.branchException);
  await requirePermission(session, menuRecipePolicyPermissions.adopt);
  const parsedValues = endLocationMenuRecipeOverrideSchema.parse(input);
  return db.$transaction(
    async (tx: any) => {
      assertSessionBrand(session, parsedValues.brandId);
      const { effectiveFrom: effectiveTo, timezone } =
        await normalizeMenuPolicyEffectiveRange(tx, session, {
          effectiveFrom: parsedValues.effectiveTo,
        });
      const values = { ...parsedValues, effectiveTo, timezone };
      const requestHash = canonicalHash(values);
      await assertLiveMenuRecipeAuthority(tx, session, {
        permissionCodes: [
          menuRecipePolicyPermissions.branchException,
          menuRecipePolicyPermissions.adopt,
        ],
        scope: {
          mode: "BRAND_OR_COMPANY",
          brandId: values.brandId,
        },
      });
      await assertMenuPolicyMfa(tx, session, {
        action: "restaurant_menu_policy.end_location_override",
        entityType: "MenuRecipeAssignment",
        entityId: values.assignmentId,
        reason: values.reason,
      });
      await assertLocationBrandScope(
        tx,
        session,
        values.locationId,
        values.brandId,
      );
      const commandReplay = await loadMenuPolicyCommandReplay(tx, session, {
        brandId: values.brandId,
        idempotencyKey: values.idempotencyKey,
        requestHash,
      });
      if (commandReplay) {
        return tx.menuRecipeAssignment.findUniqueOrThrow({
          where: { id: commandReplay.targetId },
        });
      }
      const rows = await tx.$queryRaw<any[]>`
        SELECT * FROM "MenuRecipeAssignment"
         WHERE id = ${values.assignmentId}::uuid
           AND "tenantId" = ${session.context.tenantId}::uuid
           AND "companyId" = ${session.context.companyId}::uuid
           AND "brandId" = ${values.brandId}::uuid
           AND "locationId" = ${values.locationId}::uuid
           AND "scopeType" = 'LOCATION_OVERRIDE'::"MenuRecipeAssignmentScope"
           AND status = 'ACTIVE'
         FOR UPDATE`;
      const assignment = rows[0];
      if (!assignment)
        throw new Error("MENU_RECIPE_ASSIGNMENT_SCOPE_OR_STATE_INVALID");
      const now = new Date();
      if (
        values.effectiveTo < now ||
        values.effectiveTo <= assignment.effectiveFrom ||
        (assignment.effectiveTo && values.effectiveTo >= assignment.effectiveTo)
      ) {
        throw new Error("MENU_RECIPE_ASSIGNMENT_EFFECTIVE_FROM_NOT_LATER");
      }
      const ended = await tx.menuRecipeAssignment.update({
        where: { id: assignment.id },
        data: { effectiveTo: values.effectiveTo },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType:
            "restaurant_consumption.location_menu_recipe_override_ended",
          entityType: "MenuRecipeAssignment",
          entityId: assignment.id,
          beforeData: { effectiveTo: assignment.effectiveTo },
          afterData: { effectiveTo: values.effectiveTo },
          metadata: {
            reason: values.reason,
            sourceDecisionId: "DEC-0280",
            resolutionAfterEnd: "BRAND_DEFAULT",
          },
        },
      });
      await recordMenuPolicyCommand(tx, session, {
        brandId: values.brandId,
        locationId: values.locationId,
        commandType: "END_OVERRIDE",
        idempotencyKey: values.idempotencyKey,
        requestHash,
        targetType: "MENU_RECIPE_ASSIGNMENT",
        targetId: assignment.id,
        outcome: {
          assignmentId: assignment.id,
          effectiveTo: values.effectiveTo.toISOString(),
          resolutionAfterEnd: "BRAND_DEFAULT",
        },
      });
      return ended;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function cancelFutureRestaurantMenuPolicy(input: unknown) {
  const session = await requireSessionContext();
  await requireAnyPermission(session, [
    menuRecipePolicyPermissions.adopt,
    menuRecipePolicyPermissions.branchException,
  ]);
  const values = cancelFutureMenuPolicySchema.parse(input);
  const requestHash = canonicalHash(values);
  return db.$transaction(
    async (tx: any) => {
      assertSessionBrand(session, values.brandId);
      const delegate =
        values.targetType === "RECIPE_BRAND_ADOPTION"
          ? tx.recipeBrandAdoption
          : values.targetType === "MENU_ITEM_LOCATION_AVAILABILITY"
            ? tx.menuItemLocationAvailability
            : tx.menuRecipeAssignment;
      const target = await delegate.findFirst({
        where: {
          id: values.targetId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: values.brandId,
        },
      });
      if (!target)
        throw new Error("MENU_RECIPE_ASSIGNMENT_SCOPE_OR_STATE_INVALID");
      const isAvailability =
        values.targetType === "MENU_ITEM_LOCATION_AVAILABILITY";
      const isOverride =
        values.targetType === "MENU_RECIPE_ASSIGNMENT" &&
        target.scopeType === "LOCATION_OVERRIDE";
      const permissionCodes = isAvailability
        ? [menuRecipePolicyPermissions.branchException]
        : isOverride
          ? [
              menuRecipePolicyPermissions.branchException,
              menuRecipePolicyPermissions.adopt,
            ]
          : [menuRecipePolicyPermissions.adopt];
      for (const permissionCode of permissionCodes) {
        await requirePermission(session, permissionCode);
      }
      await assertLiveMenuRecipeAuthority(tx, session, {
        permissionCodes,
        scope:
          isAvailability && target.locationId
            ? {
                mode: "LOCATION_OR_PARENT",
                brandId: values.brandId,
                locationId: target.locationId,
              }
            : { mode: "BRAND_OR_COMPANY", brandId: values.brandId },
      });
      if (target.locationId) {
        await assertLocationBrandScope(
          tx,
          session,
          target.locationId,
          values.brandId,
        );
      }
      await assertMenuPolicyMfa(tx, session, {
        action: "restaurant_menu_policy.cancel_future",
        entityType: values.targetType,
        entityId: values.targetId,
        reason: values.reason,
      });
      const commandReplay = await loadMenuPolicyCommandReplay(tx, session, {
        brandId: values.brandId,
        idempotencyKey: values.idempotencyKey,
        requestHash,
      });
      if (commandReplay) return target;
      if (target.status !== "ACTIVE" || target.effectiveFrom <= new Date()) {
        throw new Error("MENU_RECIPE_FUTURE_POLICY_NOT_CANCELLABLE");
      }
      const cancelled = await delegate.update({
        where: { id: target.id },
        data: { status: "INACTIVE" },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "restaurant_consumption.future_menu_policy_cancelled",
          entityType: values.targetType,
          entityId: target.id,
          beforeData: {
            status: target.status,
            effectiveFrom: target.effectiveFrom,
          },
          afterData: { status: "INACTIVE" },
          metadata: { reason: values.reason, sourceDecisionId: "DEC-0280" },
        },
      });
      await recordMenuPolicyCommand(tx, session, {
        brandId: values.brandId,
        locationId: target.locationId ?? null,
        commandType: "CANCEL_FUTURE",
        idempotencyKey: values.idempotencyKey,
        requestHash,
        targetType: values.targetType,
        targetId: target.id,
        outcome: { targetId: target.id, status: "INACTIVE" },
      });
      return cancelled;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function createServingDeclaration(input: unknown) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.consumptionCreate);
  const values = createDeclarationSchema.parse(input);
  const configuration = await currentConfiguration(session);
  if (!configuration) throw new Error("CONSUMPTION_CONFIGURATION_NOT_ACTIVE");
  const periods = z
    .array(servicePeriodSchema)
    .parse(configuration.servicePeriods);
  const period = periods.find(
    (candidate) => candidate.code === values.servicePeriodCode,
  );
  if (!period) throw new Error("SERVICE_PERIOD_NOT_CONFIGURED");
  const coverage = coverageForPeriod(
    values.businessDate,
    configuration.timezone,
    period,
  );
  const requestHash = canonicalHash({
    locationId: session.context.locationId,
    ...values,
  });
  const existing = await db.servingDeclaration.findUnique({
    where: {
      tenantId_companyId_idempotencyKey: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        idempotencyKey: values.idempotencyKey,
      },
    },
  });
  if (existing) {
    if (existing.requestHash !== requestHash)
      throw new Error("SERVING_DECLARATION_IDEMPOTENCY_CONFLICT");
    return existing;
  }
  return db.$transaction(
    async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${session.context.tenantId}:${session.context.companyId}:${values.idempotencyKey}`}, 0))`;
      const replay = await tx.servingDeclaration.findUnique({
        where: {
          tenantId_companyId_idempotencyKey: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            idempotencyKey: values.idempotencyKey,
          },
        },
      });
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new Error("SERVING_DECLARATION_IDEMPOTENCY_CONFLICT");
        }
        return replay;
      }
      const menuItems = await tx.menuItem.findMany({
        where: {
          id: { in: [...new Set(values.lines.map((line) => line.menuItemId))] },
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: session.context.brandId,
          status: "ACTIVE",
        },
      });
      if (
        menuItems.length !==
        new Set(values.lines.map((line) => line.menuItemId)).size
      ) {
        throw new Error("MENU_ITEM_SCOPE_OR_STATUS_INVALID");
      }
      for (const menuItem of menuItems) {
        const resolution = await resolveEffectiveMenuRecipeAssignment(
          session,
          {
            menuItemId: menuItem.id,
            coverageStartAt: coverage.start,
            coverageEndAt: coverage.end,
          },
          tx,
        );
        if (resolution.blockerCode === "MENU_ITEM_LOCATION_UNAVAILABLE") {
          throw new Error(resolution.blockerCode);
        }
      }
      const byId = new Map(menuItems.map((item: any) => [item.id, item]));
      const declaration = await tx.servingDeclaration.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: session.context.brandId,
          locationId: session.context.locationId,
          configurationId: configuration.id,
          businessDate: new Date(`${values.businessDate}T00:00:00.000Z`),
          servicePeriodCode: period.code,
          coverageStartAt: coverage.start,
          coverageEndAt: coverage.end,
          sourceType: "MANUAL",
          idempotencyKey: values.idempotencyKey,
          requestHash,
          createdByUserId: session.user.id,
          lines: {
            create: values.lines.map((line, index) => {
              const item = byId.get(line.menuItemId) as any;
              return {
                tenantId: session.context.tenantId,
                companyId: session.context.companyId,
                lineNo: index + 1,
                menuItemId: item.id,
                disposition: line.disposition,
                quantityServed: line.quantityServed,
                complimentaryReason: line.complimentaryReason || null,
                complimentaryReference: line.complimentaryReference || null,
                menuItemCodeSnapshot: item.menuItemCode,
                menuItemNameSnapshot: item.menuItemName,
              };
            }),
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "serving_declaration.created",
          entityType: "ServingDeclaration",
          entityId: declaration.id,
          afterData: {
            status: "DRAFT",
            lineCount: values.lines.length,
            businessDate: values.businessDate,
            servicePeriodCode: period.code,
          },
        },
      });
      return declaration;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateServingDeclarationDraft(input: unknown) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.consumptionCreate);
  const values = updateDeclarationSchema.parse(input);
  const configuration = await currentConfiguration(session);
  if (!configuration) throw new Error("CONSUMPTION_CONFIGURATION_NOT_ACTIVE");
  const periods = z
    .array(servicePeriodSchema)
    .parse(configuration.servicePeriods);
  const period = periods.find(
    (candidate) => candidate.code === values.servicePeriodCode,
  );
  if (!period) throw new Error("SERVICE_PERIOD_NOT_CONFIGURED");
  const coverage = coverageForPeriod(
    values.businessDate,
    configuration.timezone,
    period,
  );
  return db.$transaction(
    async (tx: any) => {
      const rows = await tx.$queryRaw<
        any[]
      >`SELECT * FROM "ServingDeclaration" WHERE id = ${values.id}::uuid AND "tenantId" = ${session.context.tenantId}::uuid AND "companyId" = ${session.context.companyId}::uuid AND "locationId" = ${session.context.locationId}::uuid FOR UPDATE`;
      const source = rows[0];
      if (
        !source ||
        !(["DRAFT", "RETURNED"] as string[]).includes(source.status)
      ) {
        throw new Error("SERVING_DECLARATION_NOT_EDITABLE");
      }
      if (source.version !== values.version) {
        throw new Error("SERVING_DECLARATION_STALE_VERSION");
      }
      const distinctItemIds = [
        ...new Set(values.lines.map((line) => line.menuItemId)),
      ];
      const menuItems = await tx.menuItem.findMany({
        where: {
          id: { in: distinctItemIds },
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: session.context.brandId,
          status: "ACTIVE",
        },
      });
      if (menuItems.length !== distinctItemIds.length) {
        throw new Error("MENU_ITEM_SCOPE_OR_STATUS_INVALID");
      }
      for (const menuItem of menuItems) {
        const resolution = await resolveEffectiveMenuRecipeAssignment(
          session,
          {
            menuItemId: menuItem.id,
            coverageStartAt: coverage.start,
            coverageEndAt: coverage.end,
          },
          tx,
        );
        if (resolution.blockerCode === "MENU_ITEM_LOCATION_UNAVAILABLE") {
          throw new Error(resolution.blockerCode);
        }
      }
      const byId = new Map(menuItems.map((item: any) => [item.id, item]));
      await tx.servingDeclarationLine.deleteMany({
        where: { declarationId: values.id },
      });
      await tx.servingDeclarationLine.createMany({
        data: values.lines.map((line, index) => {
          const item = byId.get(line.menuItemId) as any;
          return {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            declarationId: values.id,
            lineNo: index + 1,
            menuItemId: item.id,
            disposition: line.disposition,
            quantityServed: line.quantityServed,
            complimentaryReason: line.complimentaryReason || null,
            complimentaryReference: line.complimentaryReference || null,
            menuItemCodeSnapshot: item.menuItemCode,
            menuItemNameSnapshot: item.menuItemName,
          };
        }),
      });
      const updated = await tx.servingDeclaration.update({
        where: { id: values.id },
        data: {
          configurationId: configuration.id,
          businessDate: new Date(`${values.businessDate}T00:00:00.000Z`),
          servicePeriodCode: period.code,
          coverageStartAt: coverage.start,
          coverageEndAt: coverage.end,
          status: "DRAFT",
          version: { increment: 1 },
          returnReason: null,
          returnedAt: null,
          returnedByUserId: null,
          verifiedAt: null,
          verifiedByUserId: null,
          derivationSnapshot: Prisma.JsonNull,
          derivationSnapshotHash: null,
          readinessBlockers: Prisma.JsonNull,
          requestHash: canonicalHash({
            locationId: session.context.locationId,
            ...values,
          }),
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "serving_declaration.draft_updated",
          entityType: "ServingDeclaration",
          entityId: values.id,
          beforeData: { version: source.version, status: source.status },
          afterData: {
            version: updated.version,
            status: updated.status,
            lineCount: values.lines.length,
          },
        },
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function submitServingDeclaration(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.consumptionCreate);
  const { id } = idActionSchema.parse(Object.fromEntries(formData));
  await db.$transaction(async (tx: any) => {
    const rows = await tx.$queryRaw<
      any[]
    >`SELECT * FROM "ServingDeclaration" WHERE id = ${id}::uuid AND "tenantId" = ${session.context.tenantId}::uuid AND "companyId" = ${session.context.companyId}::uuid AND "locationId" = ${session.context.locationId}::uuid FOR UPDATE`;
    const source = rows[0];
    if (!source) throw new Error("SERVING_DECLARATION_NOT_FOUND");
    if (!(["DRAFT", "RETURNED"] as string[]).includes(source.status))
      throw new Error("SERVING_DECLARATION_NOT_SUBMITTABLE");
    if (new Date() < source.coverageEndAt)
      throw new Error("SERVING_DECLARATION_PERIOD_NOT_CLOSED");
    const count = await tx.servingDeclarationLine.count({
      where: { declarationId: id },
    });
    if (count === 0) throw new Error("SERVING_DECLARATION_HAS_NO_LINES");
    await tx.servingDeclaration.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        submittedByUserId: session.user.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "serving_declaration.submitted",
        entityType: "ServingDeclaration",
        entityId: id,
        beforeData: { status: source.status },
        afterData: { status: "SUBMITTED" },
      },
    });
  });
}

export async function cancelServingDeclaration(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.consumptionCreate);
  const values = returnSchema.parse(Object.fromEntries(formData));
  await db.$transaction(async (tx: any) => {
    const updated = await tx.servingDeclaration.updateMany({
      where: {
        id: values.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: { in: ["DRAFT", "RETURNED"] },
      },
      data: { status: "CANCELLED" },
    });
    if (updated.count !== 1)
      throw new Error("SERVING_DECLARATION_NOT_CANCELLABLE");
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "serving_declaration.cancelled",
        entityType: "ServingDeclaration",
        entityId: values.id,
        afterData: { status: "CANCELLED" },
        metadata: { reason: values.reason },
      },
    });
  });
}

export async function cancelVerifiedServingDeclaration(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.consumptionVerify);
  const values = returnSchema.parse(Object.fromEntries(formData));
  await assertPrivilegedMfaForAction(session, {
    action: "serving_declaration.cancel_verified",
    enforcementScope: "all_sensitive",
    permissionCode: permissions.consumptionVerify,
    entityType: "ServingDeclaration",
    entityId: values.id,
    reason:
      "Cancelling verified serving facts requires fresh privileged evidence.",
  });
  await db.$transaction(async (tx: any) => {
    const rows = await tx.$queryRaw<
      any[]
    >`SELECT * FROM "ServingDeclaration" WHERE id = ${values.id}::uuid AND "tenantId" = ${session.context.tenantId}::uuid AND "companyId" = ${session.context.companyId}::uuid AND "locationId" = ${session.context.locationId}::uuid FOR UPDATE`;
    const source = rows[0];
    if (!source || source.status !== "READY_TO_POST") {
      throw new Error("SERVING_DECLARATION_VERIFIED_CANCELLATION_DENIED");
    }
    if (source.createdByUserId === session.user.id) {
      throw new Error("SERVING_DECLARATION_SELF_VERIFICATION_DENIED");
    }
    const updated = await tx.servingDeclaration.updateMany({
      where: {
        id: values.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: "READY_TO_POST",
      },
      data: { status: "CANCELLED" },
    });
    if (updated.count !== 1) {
      throw new Error("SERVING_DECLARATION_VERIFIED_CANCELLATION_DENIED");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "serving_declaration.verified_cancelled",
        entityType: "ServingDeclaration",
        entityId: values.id,
        beforeData: { status: "READY_TO_POST" },
        afterData: { status: "CANCELLED" },
        metadata: { reason: values.reason },
      },
    });
  });
}

export async function createServingCorrection(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.consumptionCreate);
  const { id } = idActionSchema.parse(Object.fromEntries(formData));
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (idempotencyKey.length < 8) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  const requestHash = canonicalHash({
    sourceDeclarationId: id,
    idempotencyKey,
  });
  return db.$transaction(
    async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${session.context.tenantId}:${session.context.companyId}:${idempotencyKey}`}, 0))`;
      const replay = await tx.servingDeclaration.findUnique({
        where: {
          tenantId_companyId_idempotencyKey: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            idempotencyKey,
          },
        },
      });
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new Error("SERVING_DECLARATION_IDEMPOTENCY_CONFLICT");
        }
        return replay;
      }
      const source = await tx.servingDeclaration.findFirst({
        where: {
          id,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          locationId: session.context.locationId,
          status: { in: ["REVERSED", "CANCELLED"] },
        },
        include: { lines: { orderBy: { lineNo: "asc" } } },
      });
      if (!source)
        throw new Error("SERVING_DECLARATION_CORRECTION_SOURCE_INVALID");
      const latest = await tx.servingDeclaration.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          locationId: session.context.locationId,
          businessDate: source.businessDate,
          servicePeriodCode: source.servicePeriodCode,
        },
        orderBy: { revisionNo: "desc" },
      });
      const correction = await tx.servingDeclaration.create({
        data: {
          tenantId: source.tenantId,
          companyId: source.companyId,
          brandId: source.brandId,
          locationId: source.locationId,
          configurationId: source.configurationId,
          businessDate: source.businessDate,
          servicePeriodCode: source.servicePeriodCode,
          coverageStartAt: source.coverageStartAt,
          coverageEndAt: source.coverageEndAt,
          sourceType: source.sourceType,
          sourceReference: source.sourceReference,
          revisionNo: (latest?.revisionNo ?? source.revisionNo) + 1,
          supersedesDeclarationId: source.id,
          idempotencyKey,
          requestHash,
          createdByUserId: session.user.id,
          lines: {
            create: source.lines.map((line: any) => ({
              tenantId: source.tenantId,
              companyId: source.companyId,
              lineNo: line.lineNo,
              menuItemId: line.menuItemId,
              disposition: line.disposition,
              quantityServed: line.quantityServed,
              complimentaryReason: line.complimentaryReason,
              complimentaryReference: line.complimentaryReference,
              menuItemCodeSnapshot: line.menuItemCodeSnapshot,
              menuItemNameSnapshot: line.menuItemNameSnapshot,
            })),
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "serving_declaration.correction_created",
          entityType: "ServingDeclaration",
          entityId: correction.id,
          afterData: {
            status: "DRAFT",
            supersedesDeclarationId: source.id,
            revisionNo: correction.revisionNo,
          },
        },
      });
      return correction;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function conversionFactor(tx: any, item: any, fromUomId: string) {
  if (fromUomId === item.baseUomId) return decimal(1);
  const conversion = await tx.itemUomConversion.findFirst({
    where: { itemId: item.id, fromUomId, toUomId: item.baseUomId },
  });
  if (!conversion)
    throw new Error(`UOM_CONVERSION_MISSING:${item.id}:${fromUomId}`);
  return decimal(conversion.conversionFactor);
}

async function flattenRecipe(
  tx: any,
  input: {
    recipeVersion: any;
    scale: Prisma.Decimal;
    declarationLineId: string;
    path: string;
    visited: Set<string>;
    allowedRootStatuses?: Set<string>;
  },
  output: DerivedSnapshot[],
) {
  if (
    input.visited.size >= MAX_RECIPE_DEPTH ||
    input.visited.has(input.recipeVersion.id)
  ) {
    throw new Error("RECIPE_SUBRECIPE_CYCLE_OR_DEPTH_INVALID");
  }
  const allowedStatuses =
    input.allowedRootStatuses ?? new Set(["PUBLISHED", "SUPERSEDED"]);
  if (!allowedStatuses.has(input.recipeVersion.status))
    throw new Error("RECIPE_VERSION_NOT_PUBLISHED");
  const visited = new Set(input.visited).add(input.recipeVersion.id);
  const lines = await tx.recipeLine.findMany({
    where: {
      recipeVersionId: input.recipeVersion.id,
      tenantId: input.recipeVersion.tenantId,
      companyId: input.recipeVersion.companyId,
    },
    orderBy: { lineNo: "asc" },
    include: { item: true, subRecipeVersion: true },
  });
  if (lines.length === 0) throw new Error("RECIPE_HAS_NO_LINES");
  for (const line of lines) {
    const path = `${input.path}.${line.lineNo}`;
    if (line.item) {
      if (!line.item.trackInventory || line.item.status !== "ACTIVE")
        throw new Error(`RECIPE_ITEM_NOT_POSTABLE:${line.item.id}`);
      const factor = await conversionFactor(tx, line.item, line.uomId);
      const raw = decimal(line.quantity).mul(input.scale).mul(factor);
      const rounded = rounded6(raw);
      if (rounded.lte(0)) throw new Error("RECIPE_DERIVATION_ROUNDS_TO_ZERO");
      output.push({
        declarationLineId: input.declarationLineId,
        recipeVersionId: input.recipeVersion.id,
        recipeLinePath: path,
        itemId: line.item.id,
        baseUomId: line.item.baseUomId,
        rawQuantityBaseUom: raw.toFixed(12),
        roundedQuantityBaseUom: rounded.toFixed(6),
        conversionEvidence: {
          fromUomId: line.uomId,
          toUomId: line.item.baseUomId,
          factor: factor.toFixed(6),
          aggregateRounding: "HALF_UP_6",
        },
      });
      continue;
    }
    if (!line.subRecipeVersion) throw new Error("RECIPE_LINE_SOURCE_INVALID");
    if (line.uomId !== line.subRecipeVersion.yieldUomId)
      throw new Error("SUBRECIPE_OUTPUT_UOM_MISMATCH");
    const subScale = decimal(line.quantity)
      .mul(input.scale)
      .div(decimal(line.subRecipeVersion.yieldQuantity));
    await flattenRecipe(
      tx,
      {
        recipeVersion: line.subRecipeVersion,
        scale: subScale,
        declarationLineId: input.declarationLineId,
        path,
        visited,
        allowedRootStatuses: new Set(["PUBLISHED", "SUPERSEDED"]),
      },
      output,
    );
  }
}

async function assertRecipeVersionQuantityReadyForConsumption(
  tx: any,
  recipeVersion: any,
  referenceId: string,
  options?: { allowApprovedRoot?: boolean },
) {
  if (recipeVersion.yieldUomId !== recipeVersion.servingUomId) {
    throw new Error("RECIPE_OUTPUT_UOM_CONVERSION_UNRESOLVED");
  }
  const snapshots: DerivedSnapshot[] = [];
  await flattenRecipe(
    tx,
    {
      recipeVersion,
      scale: decimal(recipeVersion.servingQuantity).div(
        decimal(recipeVersion.yieldQuantity),
      ),
      declarationLineId: referenceId,
      path: referenceId,
      visited: new Set(),
      allowedRootStatuses: options?.allowApprovedRoot
        ? new Set(["APPROVED", "PUBLISHED", "SUPERSEDED"])
        : new Set(["PUBLISHED", "SUPERSEDED"]),
    },
    snapshots,
  );
  if (snapshots.length === 0) throw new Error("RECIPE_HAS_NO_LINES");
  return snapshots;
}

async function buildMenuReadinessRow(
  tx: any,
  session: SessionContext,
  menuItem: any,
  coverageStartAt: Date,
  coverageEndAt: Date,
) {
  const resolution = await resolveEffectiveMenuRecipeAssignment(
    session,
    {
      menuItemId: menuItem.id,
      coverageStartAt,
      coverageEndAt,
    },
    tx,
  );
  const quantityBlockers: string[] = [];
  let costWarnings: string[] = [];
  let snapshots: DerivedSnapshot[] = [];
  if (resolution.blockerCode) {
    quantityBlockers.push(resolution.blockerCode);
  } else if (resolution.assignment) {
    try {
      snapshots = await assertRecipeVersionQuantityReadyForConsumption(
        tx,
        resolution.assignment.recipeVersion,
        menuItem.id,
      );
      const itemIds = [
        ...new Set(snapshots.map((snapshot) => snapshot.itemId)),
      ];
      if (itemIds.length > 0) {
        const priceRows = await tx.supplierPriceHistory.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            itemId: { in: itemIds },
            effectiveFrom: { lte: coverageStartAt },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gt: coverageStartAt } },
            ],
          },
          select: { itemId: true },
        });
        const pricedIds = new Set(priceRows.map((row: any) => row.itemId));
        if (itemIds.some((itemId) => !pricedIds.has(itemId))) {
          costWarnings = ["RECIPE_COST_BASIS_PENDING"];
        }
      }
    } catch (error) {
      quantityBlockers.push(
        error instanceof Error
          ? error.message
          : "MENU_RECIPE_NOT_QUANTITY_READY",
      );
    }
  }
  const assignment = resolution.assignment;
  return {
    menuItemId: menuItem.id,
    menuItemCode: menuItem.menuItemCode,
    menuItemName: menuItem.menuItemName,
    menuCategory: menuItem.menuCategory,
    offerState:
      resolution.availabilityState === "UNAVAILABLE"
        ? "UNAVAILABLE"
        : assignment
          ? "OFFERED"
          : "UNMAPPED",
    resolutionSource: resolution.resolutionSource,
    assignmentId: assignment?.id ?? null,
    recipeVersionId: assignment?.recipeVersionId ?? null,
    recipeName: assignment?.recipeVersion?.recipe?.recipeName ?? null,
    versionNo: assignment?.recipeVersion?.versionNo ?? null,
    effectiveFrom: assignment?.effectiveFrom ?? null,
    effectiveTo: assignment?.effectiveTo ?? null,
    quantityReadiness: quantityBlockers.length === 0 ? "READY" : "BLOCKED",
    quantityBlockers,
    costReadiness: costWarnings.length === 0 ? "READY" : "PENDING",
    costWarnings,
  };
}

async function restaurantConsumptionConfigurationReadiness(
  tx: any,
  session: SessionContext,
  configuration: {
    locationId: string;
    defaultIssueInventoryLocationId: string;
    effectiveFrom: Date;
  },
) {
  const blockers: string[] = [];
  const [issueLocation, menuItems] = await Promise.all([
    tx.inventoryLocation.findFirst({
      where: {
        id: configuration.defaultIssueInventoryLocationId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: configuration.locationId,
        status: "ACTIVE",
      },
    }),
    tx.menuItem.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId,
        status: "ACTIVE",
      },
      orderBy: { menuItemCode: "asc" },
      select: {
        id: true,
        menuItemCode: true,
        menuItemName: true,
        menuCategory: true,
      },
    }),
  ]);
  if (!issueLocation) blockers.push("ISSUE_LOCATION_NOT_ACTIVE");
  if (menuItems.length === 0) blockers.push("NO_ACTIVE_MENU_ITEMS");
  let offeredCount = 0;
  for (const menuItem of menuItems) {
    const readiness = await buildMenuReadinessRow(
      tx,
      session,
      menuItem,
      configuration.effectiveFrom,
      new Date(configuration.effectiveFrom.getTime() + 1),
    );
    if (readiness.offerState !== "OFFERED") {
      continue;
    }
    offeredCount += 1;
    for (const blocker of readiness.quantityBlockers) {
      blockers.push(
        `MENU_RECIPE_NOT_DERIVABLE:${menuItem.menuItemCode}:${blocker}`,
      );
    }
  }
  if (menuItems.length > 0 && offeredCount === 0) {
    blockers.push("NO_OFFERED_MENU_ITEMS");
  }
  return { blockers };
}

export async function verifyServingDeclaration(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.consumptionVerify);
  const { id } = idActionSchema.parse(Object.fromEntries(formData));
  const source = await getServingDeclarationDetail(
    {
      ...session,
      permissionCodes: [
        ...new Set([...session.permissionCodes, permissions.consumptionView]),
      ],
    },
    id,
  );
  if (source.createdByUserId === session.user.id)
    throw new Error("SERVING_DECLARATION_SELF_VERIFICATION_DENIED");
  await assertPrivilegedMfaForAction(session, {
    action: "serving_declaration.verify",
    enforcementScope: "all_sensitive",
    permissionCode: permissions.consumptionVerify,
    entityType: "ServingDeclaration",
    entityId: id,
    reason:
      "Verifying serving facts authorizes the immutable recipe derivation used for inventory posting.",
  });
  await db.$transaction(
    async (tx: any) => {
      const rows = await tx.$queryRaw<
        any[]
      >`SELECT * FROM "ServingDeclaration" WHERE id = ${id}::uuid AND "tenantId" = ${session.context.tenantId}::uuid AND "companyId" = ${session.context.companyId}::uuid AND "locationId" = ${session.context.locationId}::uuid FOR UPDATE`;
      const locked = rows[0];
      if (
        !locked ||
        !(["SUBMITTED", "DERIVATION_BLOCKED"] as string[]).includes(
          locked.status,
        )
      )
        throw new Error("SERVING_DECLARATION_NOT_VERIFIABLE");
      if (locked.createdByUserId === session.user.id) {
        throw new Error("SERVING_DECLARATION_SELF_VERIFICATION_DENIED");
      }
      const configuration =
        await tx.restaurantConsumptionConfiguration.findFirst({
          where: {
            id: locked.configurationId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            locationId: session.context.locationId,
            status: "ACTIVE",
            enabled: true,
          },
          include: { defaultIssueInventoryLocation: true },
        });
      if (!configuration) throw new Error("CONSUMPTION_CONFIGURATION_STALE");
      const liveSession = await lockLiveInventoryActionAuthority(tx, session, {
        inventoryLocationId: configuration.defaultIssueInventoryLocationId,
        permissionCode: permissions.consumptionVerify,
        staleErrorCode: "CONSUMPTION_VERIFICATION_AUTHORITY_STALE",
      });
      await assertPrivilegedMfaForAction(
        liveSession,
        {
          action: "serving_declaration.verify",
          enforcementScope: "all_sensitive",
          permissionCode: permissions.consumptionVerify,
          entityType: "ServingDeclaration",
          entityId: id,
          reason:
            "Serving fact verification requires fresh privileged evidence.",
        },
        { transaction: tx },
      );
      const lines = await tx.servingDeclarationLine.findMany({
        where: { declarationId: id },
        orderBy: { lineNo: "asc" },
      });
      const snapshots: DerivedSnapshot[] = [];
      const recipeResolutions: Array<{
        declarationLineId: string;
        resolutionSource: "LOCATION_OVERRIDE" | "BRAND_DEFAULT";
        recipeAssignmentId: string;
        recipeVersionId: string;
        availabilityPolicyId: string | null;
        recipeBrandAdoptionId: string | null;
      }> = [];
      const blockers: string[] = [];
      for (const line of lines) {
        try {
          const resolution = await resolveEffectiveMenuRecipeAssignment(
            liveSession,
            {
              menuItemId: line.menuItemId,
              locationId: session.context.locationId,
              coverageStartAt: locked.coverageStartAt,
              coverageEndAt: locked.coverageEndAt,
            },
            tx,
          );
          if (resolution.blockerCode) throw new Error(resolution.blockerCode);
          const assignment = resolution.assignment;
          if (!assignment) throw new Error("MENU_RECIPE_ASSIGNMENT_MISSING");
          if (
            assignment.recipeVersion.yieldUomId !==
            assignment.recipeVersion.servingUomId
          )
            throw new Error("RECIPE_OUTPUT_UOM_CONVERSION_UNRESOLVED");
          const scale = decimal(line.quantityServed)
            .mul(decimal(assignment.recipeVersion.servingQuantity))
            .div(decimal(assignment.recipeVersion.yieldQuantity));
          await flattenRecipe(
            tx,
            {
              recipeVersion: assignment.recipeVersion,
              scale,
              declarationLineId: line.id,
              path: String(line.lineNo),
              visited: new Set(),
            },
            snapshots,
          );
          await tx.servingDeclarationLine.update({
            where: { id: line.id },
            data: {
              recipeAssignmentId: assignment.id,
              recipeVersionId: assignment.recipeVersionId,
            },
          });
          recipeResolutions.push({
            declarationLineId: line.id,
            resolutionSource: resolution.resolutionSource!,
            recipeAssignmentId: assignment.id,
            recipeVersionId: assignment.recipeVersionId,
            availabilityPolicyId: resolution.availabilityPolicyId,
            recipeBrandAdoptionId: resolution.brandAdoptionId,
          });
        } catch (error) {
          blockers.push(
            `${line.lineNo}:${error instanceof Error ? error.message : "DERIVATION_FAILED"}`,
          );
        }
      }
      const snapshotPayload = {
        version: "DEC-0280-v1",
        resolverVersion: "DEC-0280-UNAVAILABLE-OVERRIDE-BRAND-v1",
        declarationId: id,
        coverageStartAt: locked.coverageStartAt,
        coverageEndAt: locked.coverageEndAt,
        recipeResolutions,
        lines: snapshots,
      };
      const snapshotHash = canonicalHash(snapshotPayload);
      if (blockers.length > 0) {
        await tx.servingDeclaration.update({
          where: { id },
          data: {
            status: "DERIVATION_BLOCKED",
            verifiedByUserId: session.user.id,
            verifiedAt: new Date(),
            derivationSnapshot: snapshotPayload,
            derivationSnapshotHash: snapshotHash,
            readinessBlockers: blockers,
          },
        });
      } else {
        await tx.servingIngredientSnapshot.createMany({
          data: snapshots.map((snapshot) => ({
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            declarationId: id,
            ...snapshot,
          })),
        });
        await tx.servingDeclaration.update({
          where: { id },
          data: {
            status: "READY_TO_POST",
            verifiedByUserId: session.user.id,
            verifiedAt: new Date(),
            derivationSnapshot: snapshotPayload,
            derivationSnapshotHash: snapshotHash,
            readinessBlockers: Prisma.JsonNull,
          },
        });
      }
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: blockers.length
            ? "serving_declaration.derivation_blocked"
            : "serving_declaration.fact_verified",
          entityType: "ServingDeclaration",
          entityId: id,
          beforeData: { status: locked.status },
          afterData: {
            status: blockers.length ? "DERIVATION_BLOCKED" : "READY_TO_POST",
            snapshotHash,
          },
          metadata: { blockerCount: blockers.length, blockers },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function returnServingDeclaration(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.consumptionVerify);
  const values = returnSchema.parse(Object.fromEntries(formData));
  await db.$transaction(async (tx: any) => {
    const updated = await tx.servingDeclaration.updateMany({
      where: {
        id: values.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: { in: ["SUBMITTED", "DERIVATION_BLOCKED"] },
      },
      data: {
        status: "RETURNED",
        returnedByUserId: session.user.id,
        returnedAt: new Date(),
        returnReason: values.reason,
      },
    });
    if (updated.count !== 1)
      throw new Error("SERVING_DECLARATION_NOT_RETURNABLE");
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "serving_declaration.returned",
        entityType: "ServingDeclaration",
        entityId: values.id,
        afterData: { status: "RETURNED" },
        metadata: { reason: values.reason },
      },
    });
  });
}

type BalanceRow = {
  itemId: string;
  baseUomId: string;
  lotKey: string;
  lotNumber: string | null;
  expiryDate: Date | null;
  qtyOnHand: Prisma.Decimal;
};

export async function postServingConsumption(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.consumptionPost);
  const { id } = idActionSchema.parse(Object.fromEntries(formData));
  await assertPrivilegedMfaForAction(session, {
    action: "serving_consumption.post",
    enforcementScope: "all_sensitive",
    permissionCode: permissions.consumptionPost,
    entityType: "ServingDeclaration",
    entityId: id,
    reason: "Posting recipe consumption changes inventory balances.",
  });
  await db.$transaction(
    async (tx: any) => {
      const rows = await tx.$queryRaw<
        any[]
      >`SELECT * FROM "ServingDeclaration" WHERE id = ${id}::uuid AND "tenantId" = ${session.context.tenantId}::uuid AND "companyId" = ${session.context.companyId}::uuid AND "locationId" = ${session.context.locationId}::uuid FOR UPDATE`;
      const source = rows[0];
      if (!source) throw new Error("SERVING_DECLARATION_NOT_FOUND");
      if (source.status === "POSTED") return;
      if (source.status !== "READY_TO_POST" || !source.derivationSnapshotHash)
        throw new Error("SERVING_DECLARATION_NOT_READY_TO_POST");
      if (
        !source.derivationSnapshot ||
        canonicalHash(source.derivationSnapshot) !==
          source.derivationSnapshotHash
      ) {
        throw new Error("CONSUMPTION_SNAPSHOT_HASH_INVALID");
      }
      if (source.createdByUserId === session.user.id)
        throw new Error("SERVING_DECLARATION_SELF_POST_DENIED");
      const configuration =
        await tx.restaurantConsumptionConfiguration.findFirst({
          where: {
            id: source.configurationId,
            status: "ACTIVE",
            enabled: true,
          },
          include: { defaultIssueInventoryLocation: true },
        });
      if (
        !configuration ||
        configuration.locationId !== session.context.locationId
      )
        throw new Error("CONSUMPTION_CONFIGURATION_STALE");
      const liveSession = await lockLiveInventoryActionAuthority(tx, session, {
        inventoryLocationId: configuration.defaultIssueInventoryLocationId,
        permissionCode: permissions.consumptionPost,
        staleErrorCode: "CONSUMPTION_POST_AUTHORITY_STALE",
      });
      await assertPrivilegedMfaForAction(
        liveSession,
        {
          action: "serving_consumption.post",
          enforcementScope: "all_sensitive",
          permissionCode: permissions.consumptionPost,
          entityType: "ServingDeclaration",
          entityId: id,
          reason: "Consumption posting requires fresh privileged evidence.",
        },
        { transaction: tx },
      );
      const locationLock = await lockInventoryLocationsForPosting(tx, session, [
        configuration.defaultIssueInventoryLocationId,
      ]);
      const laterCountCutoff = await tx.stockCountSession.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          inventoryLocationId: configuration.defaultIssueInventoryLocationId,
          status: { not: "CANCELLED" },
          cutoffAt: { gte: source.coverageEndAt },
        },
        orderBy: { cutoffAt: "asc" },
        select: { id: true },
      });
      if (laterCountCutoff) {
        throw new Error("CONSUMPTION_POST_AFTER_COUNT_CUTOFF_DENIED");
      }
      const closedAccountingPeriod = await tx.accountingPeriod.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          startDate: { lte: source.businessDate },
          endDate: { gte: source.businessDate },
          OR: [
            { status: { in: ["SOFT_CLOSED", "LOCKED"] } },
            {
              status: "REOPENED",
              reopenedUntil: { lte: new Date() },
            },
          ],
        },
        select: { id: true },
      });
      if (closedAccountingPeriod) {
        throw new Error("CONSUMPTION_POST_CLOSED_PERIOD_DENIED");
      }
      const snapshots = await tx.servingIngredientSnapshot.findMany({
        where: { declarationId: id },
        orderBy: [{ itemId: "asc" }, { recipeLinePath: "asc" }],
      });
      if (snapshots.length === 0) throw new Error("CONSUMPTION_SNAPSHOT_EMPTY");
      const totals = new Map<
        string,
        { itemId: string; baseUomId: string; quantity: Prisma.Decimal }
      >();
      for (const snapshot of snapshots) {
        const current = totals.get(snapshot.itemId) ?? {
          itemId: snapshot.itemId,
          baseUomId: snapshot.baseUomId,
          quantity: decimal(0),
        };
        current.quantity = current.quantity.add(
          decimal(snapshot.rawQuantityBaseUom),
        );
        totals.set(snapshot.itemId, current);
      }
      const itemIds = [...totals.keys()].sort();
      const balances = (await tx.$queryRaw(Prisma.sql`
      SELECT "itemId", "baseUomId", "lotKey", "lotNumber", "expiryDate", "qtyOnHand"
        FROM "InventoryBalance"
       WHERE "tenantId" = ${session.context.tenantId}::uuid
         AND "companyId" = ${session.context.companyId}::uuid
         AND "inventoryLocationId" = ${configuration.defaultIssueInventoryLocationId}::uuid
         AND "itemId" IN (${Prisma.join(itemIds.map((itemId) => Prisma.sql`${itemId}::uuid`))})
         AND "qtyOnHand" > 0
         AND ("expiryDate" IS NULL OR "expiryDate" > CURRENT_DATE)
       ORDER BY "itemId", "expiryDate" ASC NULLS LAST, "lotKey", id
    `)) as BalanceRow[];
      const allocations: Array<{
        itemId: string;
        baseUomId: string;
        quantity: Prisma.Decimal;
        lotKey: string;
        lotNumber: string | null;
        expiryDate: Date | null;
      }> = [];
      for (const total of [...totals.values()].sort((left, right) =>
        left.itemId.localeCompare(right.itemId),
      )) {
        let remaining = rounded6(total.quantity);
        for (const balance of balances.filter(
          (row) => row.itemId === total.itemId,
        )) {
          if (remaining.lte(0)) break;
          const available = decimal(balance.qtyOnHand);
          const allocated = available.lte(remaining) ? available : remaining;
          if (allocated.gt(0))
            allocations.push({
              itemId: total.itemId,
              baseUomId: total.baseUomId,
              quantity: allocated,
              lotKey: balance.lotKey,
              lotNumber: balance.lotNumber,
              expiryDate: balance.expiryDate,
            });
          remaining = remaining.sub(allocated);
        }
        if (remaining.gt(0))
          throw new Error(`CONSUMPTION_STOCK_INSUFFICIENT:${total.itemId}`);
      }
      const requestHash = canonicalHash({
        declarationId: id,
        snapshotHash: source.derivationSnapshotHash,
        inventoryLocationId: configuration.defaultIssueInventoryLocationId,
      });
      const posting = await tx.consumptionPosting.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          locationId: session.context.locationId,
          declarationId: id,
          inventoryLocationId: configuration.defaultIssueInventoryLocationId,
          status: "READY",
          snapshotHash: source.derivationSnapshotHash,
          idempotencyKey: `post:${id}:${source.derivationSnapshotHash}`,
          requestHash,
        },
      });
      await tx.consumptionPosting.update({
        where: { id: posting.id },
        data: { status: "POSTING" },
      });
      await tx.servingDeclaration.update({
        where: { id },
        data: { status: "POSTING" },
      });
      const movementIds: string[] = [];
      for (let index = 0; index < allocations.length; index += 1) {
        const allocation = allocations[index]!;
        const record = await tx.consumptionPostingAllocation.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            postingId: posting.id,
            itemId: allocation.itemId,
            baseUomId: allocation.baseUomId,
            allocationNo: index + 1,
            quantityBaseUom: allocation.quantity,
            lotKey: allocation.lotKey,
            lotNumber: allocation.lotNumber,
            expiryDate: allocation.expiryDate,
          },
        });
        const { movement } = await postInventoryMovementInTransaction(
          tx,
          session,
          locationLock,
          {
            inventoryLocationId: configuration.defaultIssueInventoryLocationId,
            itemId: allocation.itemId,
            movementType: "CONSUMPTION_OUT" as any,
            occurredAt: new Date(),
            enteredQuantity: allocation.quantity.toNumber(),
            enteredUomId: allocation.baseUomId,
            quantityDeltaBaseUom: allocation.quantity.neg().toNumber(),
            sourceDocumentType: "ConsumptionPosting",
            sourceDocumentId: posting.id,
            sourceDocumentLineId: record.id,
            sourceEventKey: `consumption_allocation:${record.id}:post`,
            lotNumber: allocation.lotNumber,
            expiryDate: allocation.expiryDate,
            reasonCode: "MENU_SERVING",
            notes: `Serving declaration ${id}`,
          },
        );
        await tx.consumptionPostingAllocation.update({
          where: { id: record.id },
          data: { postedMovementId: movement.id },
        });
        movementIds.push(movement.id);
      }
      const postedAt = new Date();
      await tx.consumptionPosting.update({
        where: { id: posting.id },
        data: { status: "POSTED", postedAt, postedByUserId: session.user.id },
      });
      await tx.servingDeclaration.update({
        where: { id },
        data: { status: "POSTED" },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "serving_consumption.posted",
          entityType: "ServingDeclaration",
          entityId: id,
          beforeData: { status: "READY_TO_POST" },
          afterData: { status: "POSTED", postingId: posting.id },
          metadata: {
            snapshotHash: source.derivationSnapshotHash,
            movementIds,
            allocationCount: allocations.length,
          },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function reverseServingConsumption(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.consumptionReverse);
  const values = reverseSchema.parse(Object.fromEntries(formData));
  await assertPrivilegedMfaForAction(session, {
    action: "serving_consumption.reverse",
    enforcementScope: "all_sensitive",
    permissionCode: permissions.consumptionReverse,
    entityType: "ServingDeclaration",
    entityId: values.id,
    reason:
      "Consumption reversal restores inventory and requires privileged evidence.",
  });
  await db.$transaction(
    async (tx: any) => {
      const declarationRows = await tx.$queryRaw<
        any[]
      >`SELECT * FROM "ServingDeclaration" WHERE id = ${values.id}::uuid AND "tenantId" = ${session.context.tenantId}::uuid AND "companyId" = ${session.context.companyId}::uuid AND "locationId" = ${session.context.locationId}::uuid FOR UPDATE`;
      const declaration = declarationRows[0];
      if (!declaration) throw new Error("SERVING_CONSUMPTION_NOT_REVERSIBLE");
      const posting = await tx.consumptionPosting.findFirst({
        where: { declarationId: values.id },
        include: { allocations: { include: { postedMovement: true } } },
      });
      const reversalRequestHash = canonicalHash({
        declarationId: values.id,
        reason: values.reason,
      });
      if (declaration.status === "REVERSED" && posting?.status === "REVERSED") {
        if (
          posting.reversalIdempotencyKey === values.idempotencyKey &&
          posting.reversalRequestHash === reversalRequestHash
        ) {
          return;
        }
        throw new Error("CONSUMPTION_REVERSAL_IDEMPOTENCY_CONFLICT");
      }
      if (declaration.status !== "POSTED")
        throw new Error("SERVING_CONSUMPTION_NOT_REVERSIBLE");
      if (
        !posting ||
        posting.allocations.length === 0 ||
        posting.allocations.some(
          (allocation: any) =>
            !allocation.postedMovementId || allocation.reversalMovementId,
        )
      )
        throw new Error("CONSUMPTION_POSTING_REVERSAL_STATE_INVALID");
      const liveSession = await lockLiveInventoryActionAuthority(tx, session, {
        inventoryLocationId: posting.inventoryLocationId,
        permissionCode: permissions.consumptionReverse,
        staleErrorCode: "CONSUMPTION_REVERSE_AUTHORITY_STALE",
      });
      await assertPrivilegedMfaForAction(
        liveSession,
        {
          action: "serving_consumption.reverse",
          enforcementScope: "all_sensitive",
          permissionCode: permissions.consumptionReverse,
          entityType: "ServingDeclaration",
          entityId: values.id,
          reason: "Consumption reversal requires fresh privileged evidence.",
        },
        { transaction: tx },
      );
      const locationLock = await lockInventoryLocationsForPosting(tx, session, [
        posting.inventoryLocationId,
      ]);
      await tx.consumptionPosting.update({
        where: { id: posting.id },
        data: {
          status: "REVERSING",
          reversalReason: values.reason,
          reversalIdempotencyKey: values.idempotencyKey,
          reversalRequestHash,
        },
      });
      const reversalIds: string[] = [];
      for (const allocation of posting.allocations) {
        const movement = allocation.postedMovement!;
        const result = await postInventoryMovementInTransaction(
          tx,
          session,
          locationLock,
          {
            inventoryLocationId: posting.inventoryLocationId,
            itemId: allocation.itemId,
            movementType: "REVERSAL",
            occurredAt: new Date(),
            enteredQuantity: Number(allocation.quantityBaseUom),
            enteredUomId: allocation.baseUomId,
            quantityDeltaBaseUom: Number(allocation.quantityBaseUom),
            sourceDocumentType: "ConsumptionPostingReversal",
            sourceDocumentId: posting.id,
            sourceDocumentLineId: allocation.id,
            sourceEventKey: `consumption_allocation:${allocation.id}:reverse`,
            lotNumber: allocation.lotNumber,
            expiryDate: allocation.expiryDate,
            reversalOfMovementId: movement.id,
            reasonCode: "CONSUMPTION_REVERSAL",
            notes: values.reason,
          },
        );
        await tx.consumptionPostingAllocation.update({
          where: { id: allocation.id },
          data: { reversalMovementId: result.movement.id },
        });
        reversalIds.push(result.movement.id);
      }
      const reversedAt = new Date();
      await tx.consumptionPosting.update({
        where: { id: posting.id },
        data: {
          status: "REVERSED",
          reversedAt,
          reversedByUserId: session.user.id,
          reversalReason: values.reason,
        },
      });
      await tx.servingDeclaration.update({
        where: { id: values.id },
        data: { status: "REVERSED" },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "serving_consumption.reversed",
          entityType: "ServingDeclaration",
          entityId: values.id,
          beforeData: { status: "POSTED" },
          afterData: { status: "REVERSED" },
          metadata: {
            reason: values.reason,
            reversalIds,
            idempotencyKey: values.idempotencyKey,
          },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export function parseRestaurantConsumptionForm(formData: FormData) {
  return createDeclarationSchema.parse({
    businessDate: formData.get("businessDate"),
    servicePeriodCode: formData.get("servicePeriodCode"),
    idempotencyKey: formData.get("idempotencyKey") || randomUUID(),
    lines: formJson<unknown[]>(formData, "lines"),
  });
}

export function parseRestaurantConsumptionConfigurationForm(
  formData: FormData,
) {
  return configureSchema.parse({
    locationId: formData.get("locationId"),
    defaultIssueInventoryLocationId: formData.get(
      "defaultIssueInventoryLocationId",
    ),
    servicePeriodMode: formData.get("servicePeriodMode"),
    timezone: formData.get("timezone"),
    servicePeriods: formJson<unknown[]>(formData, "servicePeriods"),
    sentinelRules: formData.get("sentinelRules")
      ? formJson<Record<string, unknown>>(formData, "sentinelRules")
      : undefined,
    saveAsCompanyDefault: formData.get("saveAsCompanyDefault") === "on",
    effectiveFrom: formData.get("effectiveFrom"),
    reason: formData.get("reason"),
  });
}

export function parseMenuRecipeAssignmentForm(formData: FormData) {
  return assignmentSchema.parse({
    locationId: formData.get("locationId"),
    menuItemId: formData.get("menuItemId"),
    recipeVersionId: formData.get("recipeVersionId"),
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo") || undefined,
    reason: formData.get("reason"),
  });
}
