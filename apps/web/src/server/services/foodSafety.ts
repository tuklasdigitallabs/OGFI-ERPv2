import { prisma, type Prisma } from "@ogfi/database";
import { z } from "zod";
import {
  assertPermissionAllowed,
  canUseFoodSafety,
  permissions,
  requirePermission
} from "./authorization";
import {
  assertAuthorizedLocation,
  requireSessionContext,
  type SessionContext
} from "./context";
import { recordOperationalStatusTransition } from "./operationalWorkflow";
import { parseDateOnlyUtc } from "./projectDates";
import {
  dashboardTaskAfterWhere,
  type DashboardTaskCursor,
  type DashboardTaskFilter
} from "./dashboardTasks";

type FoodSafetyLogWithReadings = Prisma.FoodSafetyLogGetPayload<{
  include: {
    location: true;
    readings: true;
  };
}>;

export type FoodSafetyReadingSummary = {
  id: string;
  lineNo: number;
  station: string;
  readingType: string;
  readingValue: number | null;
  readingUom: string | null;
  expectedMinValue: number | null;
  expectedMaxValue: number | null;
  result: string;
  severity: string;
  correctiveAction: string | null;
  evidenceReference: string | null;
};

export type FoodSafetyLogSummary = {
  id: string;
  title: string;
  locationName: string;
  businessDate: string;
  logType: string;
  status: string;
  recordedByUserId?: string | null;
  reviewedByUserId?: string | null;
  recordedByName: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  exceptionCount: number;
  readingCount?: number;
  readings: FoodSafetyReadingSummary[];
  auditEvents?: Array<{ id: string; eventType: string; occurredAt: string }>;
};

export type FoodSafetyStatusCounts = Record<
  | "DRAFT"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "RETURNED"
  | "REVIEWED"
  | "CLOSED"
  | "EXCEPTION_OPEN"
  | "EXCEPTION_REVIEW",
  number
>;

export type FoodSafetySeverityCounts = Record<
  "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NORMAL",
  number
>;

export type FoodSafetyDashboard = {
  locationName: string;
  businessDate: string | null;
  totalLogs: number;
  reviewedLogs: number;
  totalReadings: number;
  exceptionCount: number;
  criticalExceptions: number;
  statusCounts: FoodSafetyStatusCounts;
  severityCounts: FoodSafetySeverityCounts;
  logs: FoodSafetyLogSummary[];
};

export type FoodSafetyDashboardCandidate = {
  id: string;
  title: string;
  businessDate: string;
  logType: string;
  status: string;
  exceptionCount: number;
  hasCriticalException: boolean;
};

export type FoodSafetyDashboardRead = {
  locationName: string;
  businessDate: string | null;
  totalLogs: number;
  reviewedLogs: number;
  totalReadings: number;
  exceptionCount: number;
  statusCounts: FoodSafetyStatusCounts;
  severityCounts: FoodSafetySeverityCounts;
  reviewCandidates: FoodSafetyDashboardCandidate[];
  exceptionCandidates: FoodSafetyDashboardCandidate[];
};

export type FoodSafetyExportFilters = {
  q?: string;
  type?: string;
  status?: string;
  businessDate?: string;
};

export type FoodSafetyLogPage = {
  items: FoodSafetyLogSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type FoodSafetyMyTaskPage = {
  totalCount: number;
  items: Array<{
    taskId: string;
    recordId: string;
    publicReference: string;
    status: string;
    actionLabel: "Review food-safety log" | "Correct and resubmit food-safety log";
    locationName: string;
    businessDate: string;
    logType: string;
    createdAt: string;
  }>;
  nextCursor: DashboardTaskCursor | null;
};

const reviewableFoodSafetyStatuses = ["SUBMITTED", "EXCEPTION_REVIEW"] as const;
const closeableFoodSafetyStatuses = ["REVIEWED", "EXCEPTION_OPEN"] as const;
const foodSafetyLogTypes = ["TEMPERATURE", "SANITATION", "OPENING", "CLOSING"] as const;
const foodSafetyReadingResults = ["PASS", "EXCEPTION", "NOT_APPLICABLE"] as const;
const foodSafetyReadingSeverities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NORMAL"] as const;

const createFoodSafetyLogSchema = z.object({
  businessDate: z.string().min(1),
  logType: z.enum(foodSafetyLogTypes),
  title: z.string().trim().min(3).max(160)
});

const createFoodSafetyReadingSchema = z.object({
  station: z.string().trim().min(2).max(120),
  readingType: z.string().trim().min(2).max(120),
  readingValue: z.string().trim().optional(),
  readingUom: z.string().trim().max(30).optional(),
  expectedMinValue: z.string().trim().optional(),
  expectedMaxValue: z.string().trim().optional(),
  result: z.enum(foodSafetyReadingResults),
  severity: z.enum(foodSafetyReadingSeverities),
  correctiveAction: z.string().trim().max(1000).optional(),
  evidenceReference: z.string().trim().max(255).optional()
});

function emptyStatusCounts(): FoodSafetyStatusCounts {
  return {
    DRAFT: 0,
    IN_PROGRESS: 0,
    SUBMITTED: 0,
    RETURNED: 0,
    REVIEWED: 0,
    CLOSED: 0,
    EXCEPTION_OPEN: 0,
    EXCEPTION_REVIEW: 0
  };
}

function emptySeverityCounts(): FoodSafetySeverityCounts {
  return {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    NORMAL: 0
  };
}

const reviewFoodSafetyLogSchema = z.object({
  logId: z.string().uuid(),
  reviewedAt: z.string().min(1),
  outcome: z.enum(["REVIEWED", "EXCEPTION_OPEN"]),
  reviewNote: z.string().trim().min(5).max(1000)
});

const closeFoodSafetyLogSchema = z.object({
  logId: z.string().uuid(),
  closeReason: z.string().trim().min(10).max(1000)
});

const returnFoodSafetyCorrectionSchema = z.object({
  logId: z.string().uuid(),
  correctionReason: z.string().trim().min(10).max(1000),
  evidenceReference: z.string().trim().max(255).optional()
});

const applyFoodSafetyCorrectionSchema = z.object({
  logId: z.string().uuid(),
  correctionReason: z.string().trim().min(10).max(1000),
  evidenceReference: z.string().trim().max(255).optional()
});

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assertFoodSafetyAccess(session: SessionContext) {
  if (!canUseFoodSafety(session.permissionCodes)) {
    assertPermissionAllowed(session.permissionCodes, permissions.foodSafetyView);
  }
}

function assertFoodSafetyReviewAccess(session: SessionContext) {
  assertPermissionAllowed(session.permissionCodes, permissions.foodSafetyReview);
}

function assertFoodSafetyCreateAccess(session: SessionContext) {
  assertPermissionAllowed(session.permissionCodes, permissions.foodSafetyCreate);
}

function assertFoodSafetyCorrectionAccess(session: SessionContext) {
  assertPermissionAllowed(session.permissionCodes, permissions.foodSafetyCorrect);
}

function dateOrNull(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function dateFromDateInput(value: string, fieldName: string) {
  const parsed = parseDateOnlyUtc(value);
  if (!parsed) {
    throw new Error(`${fieldName}_INVALID`);
  }
  return parsed;
}

function normalizedFilterText(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function userDisplayNameById(
  users: Array<{ id: string; displayName: string; email: string }>
) {
  return new Map(users.map((user) => [user.id, user.displayName || user.email]));
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function hasFormValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function activeContiguousReadingNumbers(
  formData: FormData,
  requiredFields: string[],
  maxReadings: number,
  errorCode: string
) {
  const activeReadingNumbers = new Set<number>();

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("reading.") || !hasFormValue(value)) {
      continue;
    }
    const match = key.match(/^reading\.(\d+)\.[A-Za-z0-9]+$/);
    if (!match) {
      throw new Error(errorCode);
    }
    const lineNo = Number(match[1]);
    if (!Number.isInteger(lineNo) || lineNo < 1 || lineNo > maxReadings) {
      throw new Error(errorCode);
    }
    if (
      requiredFields.some((field) =>
        hasFormValue(formData.get(`reading.${lineNo}.${field}`))
      )
    ) {
      activeReadingNumbers.add(lineNo);
    }
  }

  const sortedReadingNumbers = [...activeReadingNumbers].sort((a, b) => a - b);
  for (let index = 0; index < sortedReadingNumbers.length; index += 1) {
    if (sortedReadingNumbers[index] !== index + 1) {
      throw new Error(errorCode);
    }
  }

  return sortedReadingNumbers;
}

function decimalStringOrNull(value?: string) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("FOOD_SAFETY_READING_VALUE_INVALID");
  }
  return value;
}

function parseFoodSafetyReadings(formData: FormData) {
  const readings = [];
  const readingNumbers = activeContiguousReadingNumbers(
    formData,
    ["station", "readingType"],
    20,
    "FOOD_SAFETY_READING_INDEX_INVALID"
  );
  for (const lineNo of readingNumbers) {
    const station = formData.get(`reading.${lineNo}.station`);
    const readingType = formData.get(`reading.${lineNo}.readingType`);
    const reading = createFoodSafetyReadingSchema.parse({
      station,
      readingType,
      readingValue: formData.get(`reading.${lineNo}.readingValue`) || undefined,
      readingUom: formData.get(`reading.${lineNo}.readingUom`) || undefined,
      expectedMinValue:
        formData.get(`reading.${lineNo}.expectedMinValue`) || undefined,
      expectedMaxValue:
        formData.get(`reading.${lineNo}.expectedMaxValue`) || undefined,
      result: formData.get(`reading.${lineNo}.result`) ?? "PASS",
      severity: formData.get(`reading.${lineNo}.severity`) ?? "NORMAL",
      correctiveAction:
        formData.get(`reading.${lineNo}.correctiveAction`) || undefined,
      evidenceReference:
        formData.get(`reading.${lineNo}.evidenceReference`) || undefined
    });
    readings.push({
      lineNo,
      ...reading,
      readingValue: decimalStringOrNull(reading.readingValue),
      expectedMinValue: decimalStringOrNull(reading.expectedMinValue),
      expectedMaxValue: decimalStringOrNull(reading.expectedMaxValue)
    });
  }
  if (readings.length === 0) {
    throw new Error("FOOD_SAFETY_READINGS_REQUIRED");
  }
  return readings;
}

function parseFoodSafetyCorrectionReadings(
  formData: FormData,
  expectedReadingCount: number
) {
  const readings = [];
  for (let lineNo = 1; lineNo <= expectedReadingCount; lineNo += 1) {
    const reading = createFoodSafetyReadingSchema.parse({
      station: formData.get(`reading.${lineNo}.station`),
      readingType: formData.get(`reading.${lineNo}.readingType`),
      readingValue: formData.get(`reading.${lineNo}.readingValue`) || undefined,
      readingUom: formData.get(`reading.${lineNo}.readingUom`) || undefined,
      expectedMinValue:
        formData.get(`reading.${lineNo}.expectedMinValue`) || undefined,
      expectedMaxValue:
        formData.get(`reading.${lineNo}.expectedMaxValue`) || undefined,
      result: formData.get(`reading.${lineNo}.result`) ?? "PASS",
      severity: formData.get(`reading.${lineNo}.severity`) ?? "NORMAL",
      correctiveAction:
        formData.get(`reading.${lineNo}.correctiveAction`) || undefined,
      evidenceReference:
        formData.get(`reading.${lineNo}.evidenceReference`) || undefined
    });
    readings.push({
      lineNo,
      ...reading,
      readingValue: decimalStringOrNull(reading.readingValue),
      expectedMinValue: decimalStringOrNull(reading.expectedMinValue),
      expectedMaxValue: decimalStringOrNull(reading.expectedMaxValue)
    });
  }
  return readings;
}

export function filterFoodSafetyLogs(
  logs: FoodSafetyLogSummary[],
  filters: FoodSafetyExportFilters = {}
) {
  const query = normalizedFilterText(filters.q);
  const logType = filters.type && filters.type !== "ALL" ? filters.type : null;
  const status = filters.status && filters.status !== "ALL" ? filters.status : null;
  const businessDate = filters.businessDate?.trim() || null;

  return logs.filter((log) => {
    const matchesSearch =
      query.length === 0 ||
      [
        log.title,
        log.businessDate,
        log.logType,
        log.status,
        log.recordedByName ?? "",
        log.reviewedByName ?? "",
        ...log.readings.flatMap((reading) => [
          reading.station,
          reading.readingType,
          reading.result,
          reading.severity,
          reading.correctiveAction ?? "",
          reading.evidenceReference ?? ""
        ])
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesType = logType === null || log.logType === logType;
    const matchesStatus = status === null || log.status === status;
    const matchesBusinessDate =
      businessDate === null || log.businessDate === businessDate;
    return matchesSearch && matchesType && matchesStatus && matchesBusinessDate;
  });
}

export async function listFoodSafetyLogPage(
  session: SessionContext,
  filters: FoodSafetyExportFilters = {},
  input: { page?: number; pageSize?: number } = {}
): Promise<FoodSafetyLogPage> {
  assertFoodSafetyAccess(session);
  const rawPageSize = input.pageSize ?? 25;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(Math.max(Math.floor(rawPageSize), 1), 50)
    : 25;
  const rawPage = input.page ?? 1;
  const requestedPage = Number.isFinite(rawPage) ? Math.max(Math.floor(rawPage), 1) : 1;
  const query = normalizedFilterText(filters.q);
  const logType = filters.type && filters.type !== "ALL" ? filters.type : null;
  const status = filters.status && filters.status !== "ALL" ? filters.status : null;
  const businessDate = filters.businessDate?.trim() || null;
  const date = businessDate ? parseDateOnlyUtc(businessDate) : null;
  if (businessDate && !date) {
    throw new Error("FOOD_SAFETY_BUSINESS_DATE_INVALID");
  }
  const actorMatches = query
    ? await prisma.user.findMany({
        where: {
          tenantId: session.context.tenantId,
          OR: [
            { displayName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } }
          ]
        },
        select: { id: true }
      })
    : [];
  const where: Prisma.FoodSafetyLogWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId,
    ...(logType ? { logType } : {}),
    ...(status ? { status } : {}),
    ...(date ? { businessDate: date } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { logType: { contains: query, mode: "insensitive" } },
            { status: { contains: query, mode: "insensitive" } },
            { recordedByUserId: { in: actorMatches.map((row) => row.id) } },
            { reviewedByUserId: { in: actorMatches.map((row) => row.id) } },
            { readings: { some: { OR: [
              { station: { contains: query, mode: "insensitive" } },
              { readingType: { contains: query, mode: "insensitive" } },
              { result: { contains: query, mode: "insensitive" } },
              { severity: { contains: query, mode: "insensitive" } },
              { correctiveAction: { contains: query, mode: "insensitive" } },
              { evidenceReference: { contains: query, mode: "insensitive" } }
            ] } } }
          ]
        }
      : {})
  };
  const totalItems = await prisma.foodSafetyLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.foodSafetyLog.findMany({
    where,
    include: { location: true, readings: { select: { id: true } } },
    orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize
  }) as FoodSafetyLogWithReadings[];
  const actorIds = Array.from(new Set(rows.flatMap((row) => [row.recordedByUserId, row.reviewedByUserId].filter((id): id is string => Boolean(id)))));
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds }, tenantId: session.context.tenantId }, select: { id: true, displayName: true, email: true } })
    : [];
  const actorNameById = userDisplayNameById(actors);
  const items = rows.map((log): FoodSafetyLogSummary => ({
    id: log.id,
    title: log.title,
    locationName: log.location.name,
    businessDate: log.businessDate.toISOString().slice(0, 10),
    logType: log.logType,
    status: log.status,
    recordedByUserId: log.recordedByUserId,
    reviewedByUserId: log.reviewedByUserId,
    recordedByName: log.recordedByUserId ? actorNameById.get(log.recordedByUserId) ?? "Unknown user" : null,
    reviewedByName: log.reviewedByUserId ? actorNameById.get(log.reviewedByUserId) ?? "Unknown user" : null,
    reviewedAt: dateOrNull(log.reviewedAt),
    exceptionCount: log.exceptionCount,
    readingCount: log.readings.length,
    readings: []
  }));
  return { items, page, pageSize, totalItems, totalPages };
}

export async function getFoodSafetyDashboard(
  session: SessionContext
): Promise<FoodSafetyDashboard> {
  assertFoodSafetyAccess(session);

  const where: Prisma.FoodSafetyLogWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId
  };
  const logs = await prisma.foodSafetyLog.findMany({
    where,
    include: {
      location: true,
      readings: {
        orderBy: { lineNo: "asc" }
      }
    },
    orderBy: [{ businessDate: "desc" }, { logType: "asc" }]
  }) as FoodSafetyLogWithReadings[];

  const actorIds = Array.from(
    new Set(
      logs.flatMap((log) =>
        [log.recordedByUserId, log.reviewedByUserId].filter(
          (id): id is string => Boolean(id)
        )
      )
    )
  );
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: actorIds },
          tenantId: session.context.tenantId
        },
        select: { id: true, displayName: true, email: true }
      })
    : [];
  const actorNameById = userDisplayNameById(actors);

  const summaries = logs.map((log): FoodSafetyLogSummary => ({
    id: log.id,
    title: log.title,
    locationName: log.location.name,
    businessDate: log.businessDate.toISOString().slice(0, 10),
    logType: log.logType,
    status: log.status,
    recordedByUserId: log.recordedByUserId,
    reviewedByUserId: log.reviewedByUserId,
    recordedByName: log.recordedByUserId
      ? actorNameById.get(log.recordedByUserId) ?? "Unknown user"
      : null,
    reviewedByName: log.reviewedByUserId
      ? actorNameById.get(log.reviewedByUserId) ?? "Unknown user"
      : null,
    reviewedAt: dateOrNull(log.reviewedAt),
    exceptionCount: log.exceptionCount,
    readings: log.readings.map((reading) => ({
      id: reading.id,
      lineNo: reading.lineNo,
      station: reading.station,
      readingType: reading.readingType,
      readingValue: numberOrNull(reading.readingValue),
      readingUom: reading.readingUom,
      expectedMinValue: numberOrNull(reading.expectedMinValue),
      expectedMaxValue: numberOrNull(reading.expectedMaxValue),
      result: reading.result,
      severity: reading.severity,
      correctiveAction: reading.correctiveAction,
      evidenceReference: reading.evidenceReference
    }))
  }));

  const exceptionCount = summaries.reduce(
    (total, log) => total + log.exceptionCount,
    0
  );
  const criticalExceptions = summaries.reduce(
    (total, log) =>
      total +
      log.readings.filter(
        (reading) =>
          reading.result === "EXCEPTION" && reading.severity === "CRITICAL"
      ).length,
    0
  );
  const statusCounts = summaries.reduce((counts, log) => {
    if (log.status in counts) {
      counts[log.status as keyof FoodSafetyStatusCounts] += 1;
    }
    return counts;
  }, emptyStatusCounts());
  const severityCounts = summaries.reduce((counts, log) => {
    for (const reading of log.readings) {
      if (reading.result === "EXCEPTION" && reading.severity in counts) {
        counts[reading.severity as keyof FoodSafetySeverityCounts] += 1;
      }
    }
    return counts;
  }, emptySeverityCounts());

  return {
    locationName: session.context.locationName,
    businessDate: summaries[0]?.businessDate ?? null,
    totalLogs: summaries.length,
    reviewedLogs: statusCounts.REVIEWED + statusCounts.CLOSED,
    totalReadings: summaries.reduce(
      (total, log) => total + log.readings.length,
      0
    ),
    exceptionCount,
    criticalExceptions,
    statusCounts,
    severityCounts,
    logs: summaries
  };
}

export async function getFoodSafetyDashboardRead(
  session: SessionContext
): Promise<FoodSafetyDashboardRead> {
  assertFoodSafetyAccess(session);

  const where: Prisma.FoodSafetyLogWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId
  };
  const scopedReadingWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId
  };
  const [summary, statusRows, totalLogs, latestLog, totalReadings, criticalExceptions, reviewRows, exceptionRows] =
    await Promise.all([
      prisma.foodSafetyLog.aggregate({
        where,
        _sum: { exceptionCount: true }
      }),
      prisma.foodSafetyLog.groupBy({
        by: ["status"],
        where,
        _count: { _all: true }
      }),
      prisma.foodSafetyLog.count({ where }),
      prisma.foodSafetyLog.findFirst({ where, orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }, { id: "desc" }], select: { businessDate: true } }),
      prisma.foodSafetyReading.count({ where: scopedReadingWhere }),
      prisma.foodSafetyReading.count({
        where: { ...scopedReadingWhere, result: "EXCEPTION", severity: "CRITICAL" }
      }),
      prisma.foodSafetyLog.findMany({
        where: { ...where, status: { in: [...reviewableFoodSafetyStatuses] } },
        orderBy: [{ businessDate: "desc" }, { logType: "asc" }],
        take: 3,
        select: {
          id: true,
          title: true,
          businessDate: true,
          logType: true,
          status: true,
          exceptionCount: true,
          readings: {
            where: { result: "EXCEPTION", severity: "CRITICAL" },
            select: { id: true },
            take: 1
          }
        }
      }),
      prisma.foodSafetyLog.findMany({
        where: { ...where, exceptionCount: { gt: 0 } },
        orderBy: [{ businessDate: "desc" }, { logType: "asc" }],
        take: 3,
        select: {
          id: true,
          title: true,
          businessDate: true,
          logType: true,
          status: true,
          exceptionCount: true,
          readings: {
            where: { result: "EXCEPTION", severity: "CRITICAL" },
            select: { id: true },
            take: 1
          }
        }
      })
    ]);
  const statusCounts = emptyStatusCounts();
  for (const row of statusRows) {
    if (row.status in statusCounts) {
      statusCounts[row.status as keyof FoodSafetyStatusCounts] = row._count._all;
    }
  }
  const toCandidate = (row: (typeof reviewRows)[number]): FoodSafetyDashboardCandidate => ({
    id: row.id,
    title: row.title,
    businessDate: row.businessDate.toISOString().slice(0, 10),
    logType: row.logType,
    status: row.status,
    exceptionCount: row.exceptionCount,
    hasCriticalException: row.readings.length > 0
  });

  return {
    locationName: session.context.locationName,
    businessDate: latestLog?.businessDate.toISOString().slice(0, 10) ?? null,
    totalLogs,
    reviewedLogs: statusCounts.REVIEWED + statusCounts.CLOSED,
    totalReadings,
    exceptionCount: summary._sum.exceptionCount ?? 0,
    statusCounts,
    severityCounts: { ...emptySeverityCounts(), CRITICAL: criticalExceptions },
    reviewCandidates: reviewRows.map(toCandidate),
    exceptionCandidates: exceptionRows.map(toCandidate)
  };
}

/**
 * Returns only food-safety work with a currently executable focused action.
 * Review requires known non-self recorder lineage. Returned corrections are
 * pooled work for scoped creators. Final close remains excluded pending a
 * confirmed final-signoff and self-action policy.
 */
export async function listFoodSafetyMyTaskPage(
  session: SessionContext,
  input: { after?: DashboardTaskCursor; take?: number; filter?: DashboardTaskFilter } = {}
): Promise<FoodSafetyMyTaskPage> {
  assertFoodSafetyAccess(session);
  const actionPredicates: Prisma.FoodSafetyLogWhereInput[] = [
    ...(session.permissionCodes.includes(permissions.foodSafetyReview)
      ? [{
          status: { in: [...reviewableFoodSafetyStatuses] },
          recordedByUserId: { not: null },
          NOT: { recordedByUserId: session.user.id }
        } satisfies Prisma.FoodSafetyLogWhereInput]
      : []),
    ...(session.permissionCodes.includes(permissions.foodSafetyCreate)
      ? [{ status: "RETURNED" } satisfies Prisma.FoodSafetyLogWhereInput]
      : [])
  ];
  const filteredActionPredicates = input.filter?.status
    ? actionPredicates.filter((_predicate, index) => input.filter?.status === "RETURNED" ? index === 1 : index === 0)
    : actionPredicates;
  if (filteredActionPredicates.length === 0) {
    return { totalCount: 0, items: [], nextCursor: null };
  }
  if (input.filter?.priority && input.filter.priority !== "HIGH") return { totalCount: 0, items: [], nextCursor: null };
  if (input.filter?.due && input.filter.due.kind !== "NO_DUE") return { totalCount: 0, items: [], nextCursor: null };
  if (input.filter?.status && !["SUBMITTED", "EXCEPTION_REVIEW", "RETURNED"].includes(input.filter.status)) return { totalCount: 0, items: [], nextCursor: null };

  const take = Math.min(Math.max(input.take ?? 25, 1), 50);
  const afterWhere = dashboardTaskAfterWhere("FOOD_SAFETY", input.after);
  const baseWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId,
    ...(input.filter?.status ? { status: input.filter.status } : {}),
    OR: filteredActionPredicates
  } satisfies Prisma.FoodSafetyLogWhereInput;
  const [totalCount, rows] = await Promise.all([
    prisma.foodSafetyLog.count({ where: baseWhere }),
    prisma.foodSafetyLog.findMany({
      where: afterWhere ? { ...baseWhere, AND: [afterWhere] } : baseWhere,
      select: {
        id: true,
        title: true,
        status: true,
        businessDate: true,
        logType: true,
        createdAt: true,
        location: { select: { name: true } }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: take + 1
    })
  ]);
  const hasMore = rows.length > take;
  const items = rows.slice(0, take).map((row) => ({
    taskId: `food-safety-${row.id}`,
    recordId: row.id,
    publicReference: row.title,
    status: row.status,
    actionLabel: row.status === "RETURNED"
      ? "Correct and resubmit food-safety log" as const
      : "Review food-safety log" as const,
    locationName: row.location.name,
    businessDate: row.businessDate.toISOString().slice(0, 10),
    logType: row.logType,
    createdAt: row.createdAt.toISOString()
  }));
  const last = items.at(-1);
  return {
    totalCount,
    items,
    nextCursor: hasMore && last
      ? { createdAt: last.createdAt, sourceType: "FOOD_SAFETY", recordId: last.recordId }
      : null
  };
}

export async function getFoodSafetyLogSummary(
  session: SessionContext,
  logId: string
) {
  assertFoodSafetyAccess(session);
  const log = await prisma.foodSafetyLog.findFirst({
    where: {
      id: logId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
      locationId: session.context.locationId
    },
    include: { location: true, readings: { orderBy: { lineNo: "asc" } } }
  }) as FoodSafetyLogWithReadings | null;
  if (!log) return null;
  const actorIds = [log.recordedByUserId, log.reviewedByUserId].filter((id): id is string => Boolean(id));
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds }, tenantId: session.context.tenantId }, select: { id: true, displayName: true, email: true } })
    : [];
  const names = userDisplayNameById(actors);
  const auditEvents = await prisma.auditEvent.findMany({
    where: { tenantId: log.tenantId, companyId: log.companyId, entityType: "FoodSafetyLog", entityId: log.id },
    orderBy: { occurredAt: "asc" },
    select: { id: true, eventType: true, occurredAt: true }
  });
  return {
    id: log.id,
    title: log.title,
    locationName: log.location.name,
    businessDate: log.businessDate.toISOString().slice(0, 10),
    logType: log.logType,
    status: log.status,
    recordedByUserId: log.recordedByUserId,
    reviewedByUserId: log.reviewedByUserId,
    recordedByName: log.recordedByUserId ? names.get(log.recordedByUserId) ?? "Unknown user" : null,
    reviewedByName: log.reviewedByUserId ? names.get(log.reviewedByUserId) ?? "Unknown user" : null,
    reviewedAt: dateOrNull(log.reviewedAt),
    exceptionCount: log.exceptionCount,
    readings: log.readings.map((reading) => ({
      id: reading.id,
      lineNo: reading.lineNo,
      station: reading.station,
      readingType: reading.readingType,
      readingValue: numberOrNull(reading.readingValue),
      readingUom: reading.readingUom,
      expectedMinValue: numberOrNull(reading.expectedMinValue),
      expectedMaxValue: numberOrNull(reading.expectedMaxValue),
      result: reading.result,
      severity: reading.severity,
      correctiveAction: reading.correctiveAction,
      evidenceReference: reading.evidenceReference
    })),
    auditEvents: auditEvents.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() }))
  } satisfies FoodSafetyLogSummary;
}

export async function createFoodSafetyLog(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.foodSafetyCreate);
  assertFoodSafetyCreateAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = createFoodSafetyLogSchema.parse(Object.fromEntries(formData));
  const businessDate = dateFromDateInput(values.businessDate, "FOOD_SAFETY_BUSINESS_DATE");
  const actionAt = new Date();
  const readings = parseFoodSafetyReadings(formData);
  const exceptionCount = readings.filter(
    (reading) => reading.result === "EXCEPTION"
  ).length;

  const log = await prisma.$transaction(async (tx) => {
    let created;
    try {
      created = await tx.foodSafetyLog.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: session.context.brandId || null,
          locationId: session.context.locationId,
          businessDate,
          logType: values.logType,
          status: "SUBMITTED",
          title: values.title,
          recordedByUserId: session.user.id,
          exceptionCount,
          readings: {
            create: readings.map((reading) => ({
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              brandId: session.context.brandId || null,
              locationId: session.context.locationId,
              lineNo: reading.lineNo,
              station: reading.station,
              readingType: reading.readingType,
              readingValue: reading.readingValue,
              readingUom: reading.readingUom || null,
              expectedMinValue: reading.expectedMinValue,
              expectedMaxValue: reading.expectedMaxValue,
              result: reading.result,
            severity: reading.severity,
            correctiveAction: reading.correctiveAction || null,
            evidenceReference: reading.evidenceReference || null,
            recordedAt: actionAt
          }))
          }
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("FOOD_SAFETY_LOG_ALREADY_EXISTS");
      }
      throw error;
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "food_safety_log.created",
        entityType: "FoodSafetyLog",
        entityId: created.id,
        afterData: {
          status: created.status,
          businessDate: dateOrNull(created.businessDate),
          logType: created.logType,
          exceptionCount: created.exceptionCount
        },
        metadata: {
          locationId: session.context.locationId,
          readingCount: readings.length,
          boundary: "food_safety_create_only_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "FoodSafetyLog",
      targetEntityId: created.id,
      action: "CREATE_SUBMITTED",
      fromStatus: "NONE",
      toStatus: created.status,
      brandId: created.brandId,
      locationId: created.locationId,
      evidenceReference:
        readings.find((reading) => reading.evidenceReference)?.evidenceReference ??
        null
    });

    return created;
  });

  return log.id;
}

export async function reviewFoodSafetyLog(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.foodSafetyReview);
  assertFoodSafetyReviewAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = reviewFoodSafetyLogSchema.parse(Object.fromEntries(formData));
  const reviewedAt = dateFromDateInput(values.reviewedAt, "FOOD_SAFETY_REVIEWED_AT");

  const log = await prisma.$transaction(async (tx) => {
    const current = await tx.foodSafetyLog.findFirst({
      where: {
        id: values.logId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
        locationId: session.context.locationId
      }
    });

    if (!current) {
      throw new Error("FOOD_SAFETY_LOG_NOT_FOUND");
    }
    if (!(reviewableFoodSafetyStatuses as readonly string[]).includes(current.status)) {
      throw new Error("FOOD_SAFETY_LOG_STATUS_NOT_REVIEWABLE");
    }
    if (!current.recordedByUserId) {
      throw new Error("FOOD_SAFETY_RECORDER_LINEAGE_REQUIRED");
    }
    if (reviewedAt < current.businessDate) {
      throw new Error("FOOD_SAFETY_REVIEWED_AT_BEFORE_BUSINESS_DATE");
    }
    if (current.recordedByUserId === session.user.id) {
      throw new Error("FOOD_SAFETY_SELF_REVIEW_BLOCKED");
    }
    if (values.outcome === "REVIEWED" && current.exceptionCount > 0) {
      throw new Error("FOOD_SAFETY_EXCEPTION_REVIEW_REQUIRED");
    }

    const result = await tx.foodSafetyLog.updateMany({
      where: {
        id: current.id,
        status: { in: [...reviewableFoodSafetyStatuses] },
        reviewedAt: null
      },
      data: {
        status: values.outcome,
        reviewedByUserId: session.user.id,
        reviewedAt
      }
    });
    if (result.count !== 1) {
      throw new Error("FOOD_SAFETY_REVIEW_CONFLICT");
    }

    const updated = await tx.foodSafetyLog.findUniqueOrThrow({
      where: { id: current.id }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "food_safety_log.reviewed",
        entityType: "FoodSafetyLog",
        entityId: updated.id,
        beforeData: {
          status: current.status,
          reviewedAt: dateOrNull(current.reviewedAt),
          reviewedByUserId: current.reviewedByUserId,
          exceptionCount: current.exceptionCount
        },
        afterData: {
          status: updated.status,
          reviewedAt: dateOrNull(updated.reviewedAt),
          reviewedByUserId: updated.reviewedByUserId,
          exceptionCount: updated.exceptionCount
        },
        metadata: {
          locationId: updated.locationId,
          outcome: values.outcome,
          reviewNote: values.reviewNote,
          boundary: "food_safety_review_only_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "FoodSafetyLog",
      targetEntityId: updated.id,
      action: "REVIEW",
      fromStatus: current.status,
      toStatus: updated.status,
      brandId: updated.brandId,
      locationId: updated.locationId,
      reason: values.reviewNote
    });

    return updated;
  });

  return log.id;
}

export async function returnFoodSafetyLogForCorrection(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.foodSafetyCorrect);
  assertFoodSafetyCorrectionAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = returnFoodSafetyCorrectionSchema.parse(Object.fromEntries(formData));

  const log = await prisma.$transaction(async (tx) => {
    const current = await tx.foodSafetyLog.findFirst({
      where: {
        id: values.logId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
        locationId: session.context.locationId
      }
    });

    if (!current) {
      throw new Error("FOOD_SAFETY_LOG_NOT_FOUND");
    }
    if (!(reviewableFoodSafetyStatuses as readonly string[]).includes(current.status)) {
      throw new Error("FOOD_SAFETY_LOG_STATUS_NOT_REVIEWABLE");
    }
    if (!current.recordedByUserId) {
      throw new Error("FOOD_SAFETY_RECORDER_LINEAGE_REQUIRED");
    }
    if (current.recordedByUserId === session.user.id) {
      throw new Error("FOOD_SAFETY_SELF_REVIEW_BLOCKED");
    }
    const operationIdempotencyKey =
      `FoodSafetyLog:${current.id}:RETURN_FOR_CORRECTION:${current.updatedAt.toISOString()}`;

    const result = await tx.foodSafetyLog.updateMany({
      where: {
        id: current.id,
        status: { in: [...reviewableFoodSafetyStatuses] }
      },
      data: {
        status: "RETURNED"
      }
    });
    if (result.count !== 1) {
      throw new Error("FOOD_SAFETY_REVIEW_CONFLICT");
    }

    const updated = await tx.foodSafetyLog.findUniqueOrThrow({
      where: { id: current.id }
    });

    await tx.operationalCorrectionRecord.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: updated.brandId,
        locationId: updated.locationId,
        targetEntityType: "FoodSafetyLog",
        targetEntityId: updated.id,
        correctionType: "RETURN_FOR_CORRECTION",
        status: "REQUESTED",
        requestedByUserId: session.user.id,
        reason: values.correctionReason,
        evidenceReference: values.evidenceReference || null,
        idempotencyKey: operationIdempotencyKey
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "food_safety_log.returned_for_correction",
        entityType: "FoodSafetyLog",
        entityId: updated.id,
        beforeData: {
          status: current.status,
          reviewedAt: dateOrNull(current.reviewedAt),
          reviewedByUserId: current.reviewedByUserId
        },
        afterData: {
          status: updated.status,
          reviewedAt: dateOrNull(updated.reviewedAt),
          reviewedByUserId: updated.reviewedByUserId
        },
        metadata: {
          locationId: updated.locationId,
          reason: values.correctionReason,
          evidenceReference: values.evidenceReference,
          boundary: "food_safety_return_correction_only_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "FoodSafetyLog",
      targetEntityId: updated.id,
      action: "RETURN_FOR_CORRECTION",
      fromStatus: current.status,
      toStatus: updated.status,
      brandId: updated.brandId,
      locationId: updated.locationId,
      reason: values.correctionReason,
      evidenceReference: values.evidenceReference || null,
      idempotencyKey: operationIdempotencyKey,
      required: true
    });

    return updated;
  });

  return log.id;
}

export async function applyFoodSafetyLogCorrection(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.foodSafetyCreate);
  assertFoodSafetyCreateAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = applyFoodSafetyCorrectionSchema.parse(Object.fromEntries(formData));
  const actionAt = new Date();

  const log = await prisma.$transaction(async (tx) => {
    const current = await tx.foodSafetyLog.findFirst({
      where: {
        id: values.logId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
        locationId: session.context.locationId
      },
      include: { readings: { orderBy: { lineNo: "asc" } } }
    });

    if (!current) {
      throw new Error("FOOD_SAFETY_LOG_NOT_FOUND");
    }
    if (current.status !== "RETURNED") {
      throw new Error("FOOD_SAFETY_LOG_STATUS_NOT_CORRECTABLE");
    }
    const operationIdempotencyKey =
      `FoodSafetyLog:${current.id}:APPLY_CORRECTION:${current.updatedAt.toISOString()}`;

    const readings = parseFoodSafetyCorrectionReadings(
      formData,
      current.readings.length
    );
    const exceptionCount = readings.filter(
      (reading) => reading.result === "EXCEPTION"
    ).length;

    const result = await tx.foodSafetyLog.updateMany({
      where: { id: current.id, status: "RETURNED" },
      data: {
        status: "SUBMITTED",
        recordedByUserId: session.user.id,
        reviewedByUserId: null,
        reviewedAt: null,
        exceptionCount
      }
    });
    if (result.count !== 1) {
      throw new Error("FOOD_SAFETY_CORRECTION_CONFLICT");
    }

    for (const reading of readings) {
      await tx.foodSafetyReading.updateMany({
        where: {
          logId: current.id,
          lineNo: reading.lineNo,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
          locationId: session.context.locationId
        },
        data: {
          station: reading.station,
          readingType: reading.readingType,
          readingValue: reading.readingValue,
          readingUom: reading.readingUom || null,
          expectedMinValue: reading.expectedMinValue,
          expectedMaxValue: reading.expectedMaxValue,
          result: reading.result,
          severity: reading.severity,
          correctiveAction: reading.correctiveAction || null,
          evidenceReference: reading.evidenceReference || null,
          recordedAt: actionAt
        }
      });
    }

    const updated = await tx.foodSafetyLog.findUniqueOrThrow({
      where: { id: current.id },
      include: { readings: { orderBy: { lineNo: "asc" } } }
    });
    await tx.operationalCorrectionRecord.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: updated.brandId,
        locationId: updated.locationId,
        targetEntityType: "FoodSafetyLog",
        targetEntityId: updated.id,
        correctionType: "APPLY_CORRECTION",
        status: "APPLIED",
        requestedByUserId: session.user.id,
        appliedByUserId: session.user.id,
        appliedAt: actionAt,
        reason: values.correctionReason,
        evidenceReference: values.evidenceReference || null,
        idempotencyKey: operationIdempotencyKey
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "food_safety_log.correction_applied",
        entityType: "FoodSafetyLog",
        entityId: updated.id,
        beforeData: {
          status: current.status,
          exceptionCount: current.exceptionCount,
          readings: current.readings.map((reading) => ({
            lineNo: reading.lineNo,
            station: reading.station,
            readingType: reading.readingType,
            readingValue: reading.readingValue,
            readingUom: reading.readingUom,
            expectedMinValue: reading.expectedMinValue,
            expectedMaxValue: reading.expectedMaxValue,
            result: reading.result,
            severity: reading.severity,
            correctiveAction: reading.correctiveAction,
            evidenceReference: reading.evidenceReference
          }))
        },
        afterData: {
          status: updated.status,
          exceptionCount: updated.exceptionCount,
          readings: updated.readings.map((reading) => ({
            lineNo: reading.lineNo,
            station: reading.station,
            readingType: reading.readingType,
            readingValue: reading.readingValue,
            readingUom: reading.readingUom,
            expectedMinValue: reading.expectedMinValue,
            expectedMaxValue: reading.expectedMaxValue,
            result: reading.result,
            severity: reading.severity,
            correctiveAction: reading.correctiveAction,
            evidenceReference: reading.evidenceReference
          }))
        },
        metadata: {
          locationId: updated.locationId,
          reason: values.correctionReason,
          evidenceReference: values.evidenceReference || null,
          boundary: "food_safety_correction_no_inventory_finance_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "FoodSafetyLog",
      targetEntityId: updated.id,
      action: "APPLY_CORRECTION",
      fromStatus: current.status,
      toStatus: updated.status,
      brandId: updated.brandId,
      locationId: updated.locationId,
      reason: values.correctionReason,
      evidenceReference: values.evidenceReference || null,
      idempotencyKey: operationIdempotencyKey,
      required: true
    });

    return updated;
  });

  return log.id;
}

export async function closeFoodSafetyLog(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.foodSafetyReview);
  assertFoodSafetyReviewAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = closeFoodSafetyLogSchema.parse(Object.fromEntries(formData));

  const log = await prisma.$transaction(async (tx) => {
    const current = await tx.foodSafetyLog.findFirst({
      where: {
        id: values.logId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
        locationId: session.context.locationId
      }
    });

    if (!current) {
      throw new Error("FOOD_SAFETY_LOG_NOT_FOUND");
    }
    if (
      !(closeableFoodSafetyStatuses as readonly string[]).includes(current.status)
    ) {
      throw new Error("FOOD_SAFETY_LOG_STATUS_NOT_CLOSABLE");
    }

    const result = await tx.foodSafetyLog.updateMany({
      where: {
        id: current.id,
        status: { in: [...closeableFoodSafetyStatuses] }
      },
      data: {
        status: "CLOSED"
      }
    });
    if (result.count !== 1) {
      throw new Error("FOOD_SAFETY_CLOSE_CONFLICT");
    }

    const updated = await tx.foodSafetyLog.findUniqueOrThrow({
      where: { id: current.id }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "food_safety_log.closed",
        entityType: "FoodSafetyLog",
        entityId: updated.id,
        beforeData: {
          status: current.status,
          reviewedAt: dateOrNull(current.reviewedAt),
          reviewedByUserId: current.reviewedByUserId
        },
        afterData: {
          status: updated.status,
          reviewedAt: dateOrNull(updated.reviewedAt),
          reviewedByUserId: updated.reviewedByUserId
        },
        metadata: {
          locationId: updated.locationId,
          reason: values.closeReason,
          boundary: "food_safety_close_only_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "FoodSafetyLog",
      targetEntityId: updated.id,
      action: "CLOSE",
      fromStatus: current.status,
      toStatus: updated.status,
      brandId: updated.brandId,
      locationId: updated.locationId,
      reason: values.closeReason
    });

    return updated;
  });

  return log.id;
}

export async function buildFoodSafetyExportRows(
  session: SessionContext,
  filters: FoodSafetyExportFilters = {}
) {
  const dashboard = await getFoodSafetyDashboard(session);
  const logs = filterFoodSafetyLogs(dashboard.logs, filters);
  return [
    [
      "Location",
      "Business Date",
      "Log",
      "Log Type",
      "Status",
      "Recorded By",
      "Reviewed By",
      "Reviewed At",
      "Exception Count",
      "Draft Count",
      "In Progress Count",
      "Submitted Count",
      "Reviewed Count",
      "Closed Count",
      "Exception Open Count",
      "Exception Review Count",
      "Critical Exception Count",
      "High Exception Count",
      "Line No",
      "Station",
      "Reading Type",
      "Reading Value",
      "Reading UOM",
      "Expected Min",
      "Expected Max",
      "Result",
      "Severity",
      "Corrective Action",
      "Evidence Reference"
    ],
    ...logs.flatMap((log) =>
      log.readings.map((reading) => [
        log.locationName,
        log.businessDate,
        log.title,
        log.logType,
        log.status,
        log.recordedByName ?? "",
        log.reviewedByName ?? "",
        log.reviewedAt ?? "",
        log.exceptionCount,
        dashboard.statusCounts.DRAFT,
        dashboard.statusCounts.IN_PROGRESS,
        dashboard.statusCounts.SUBMITTED,
        dashboard.statusCounts.REVIEWED,
        dashboard.statusCounts.CLOSED,
        dashboard.statusCounts.EXCEPTION_OPEN,
        dashboard.statusCounts.EXCEPTION_REVIEW,
        dashboard.severityCounts.CRITICAL,
        dashboard.severityCounts.HIGH,
        reading.lineNo,
        reading.station,
        reading.readingType,
        reading.readingValue ?? "",
        reading.readingUom ?? "",
        reading.expectedMinValue ?? "",
        reading.expectedMaxValue ?? "",
        reading.result,
        reading.severity,
        reading.correctiveAction ?? "",
        reading.evidenceReference ?? ""
      ])
    )
  ];
}
