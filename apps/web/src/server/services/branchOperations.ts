import { prisma, type Prisma } from "@ogfi/database";
import { z } from "zod";
import {
  assertPermissionAllowed,
  canUseBranchOperations,
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

type BranchOperationalChecklistWithLines =
  Prisma.BranchOperationalChecklistGetPayload<{
    include: {
      location: true;
      lines: true;
    };
  }>;

export type BranchOperationChecklistLineSummary = {
  id: string;
  lineNo: number;
  area: string;
  checkName: string;
  expectedResult: string;
  result: string;
  severity: string;
  evidenceReference: string | null;
  notes: string | null;
};

export type BranchOperationChecklistSummary = {
  id: string;
  checklistName: string;
  locationName: string;
  businessDate: string;
  shiftType: string;
  status: string;
  openedByUserId?: string | null;
  submittedByUserId?: string | null;
  reviewedByUserId?: string | null;
  openedByName: string | null;
  submittedByName: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  exceptionCount: number;
  completionPercent: number;
  lines: BranchOperationChecklistLineSummary[];
};

export type BranchChecklistStatusCounts = Record<
  | "DRAFT"
  | "IN_PROGRESS"
  | "EXCEPTION_OPEN"
  | "MANAGER_REVIEW"
  | "SUBMITTED"
  | "RETURNED"
  | "REVIEWED"
  | "CLOSED",
  number
>;

export type BranchChecklistSeverityCounts = Record<
  "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NORMAL",
  number
>;

export type BranchOperationsDashboard = {
  locationName: string;
  businessDate: string | null;
  totalChecklists: number;
  completedChecklists: number;
  openExceptions: number;
  criticalExceptions: number;
  statusCounts: BranchChecklistStatusCounts;
  severityCounts: BranchChecklistSeverityCounts;
  averageCompletionPercent: number;
  checklists: BranchOperationChecklistSummary[];
};

export type BranchOperationsDashboardCandidate = {
  id: string;
  checklistName: string;
  businessDate: string;
  shiftType: string;
  status: string;
  exceptionCount: number;
  hasCriticalException: boolean;
};

export type BranchOperationsDashboardRead = {
  locationName: string;
  businessDate: string | null;
  totalChecklists: number;
  completedChecklists: number;
  openExceptions: number;
  statusCounts: BranchChecklistStatusCounts;
  severityCounts: BranchChecklistSeverityCounts;
  averageCompletionPercent: number;
  reviewCandidates: BranchOperationsDashboardCandidate[];
  exceptionCandidates: BranchOperationsDashboardCandidate[];
};

export type BranchOperationsExportFilters = {
  q?: string;
  shift?: string;
  status?: string;
  businessDate?: string;
};

export type BranchOperationChecklistPage = {
  items: BranchOperationChecklistSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type BranchOperationMyTaskPage = {
  totalCount: number;
  items: Array<{
    taskId: string;
    recordId: string;
    publicReference: string;
    status: string;
    actionLabel: "Review branch checklist" | "Correct and resubmit checklist";
    locationName: string;
    businessDate: string;
    shiftType: string;
    createdAt: string;
  }>;
  nextCursor: DashboardTaskCursor | null;
};

const reviewableChecklistStatuses = [
  "SUBMITTED",
  "MANAGER_REVIEW"
] as const;
const closeableChecklistStatuses = ["REVIEWED", "EXCEPTION_OPEN"] as const;
const branchChecklistShiftTypes = ["OPENING", "CLOSING", "MIDSHIFT"] as const;
const checklistLineResults = ["PASS", "EXCEPTION", "NOT_APPLICABLE"] as const;
const checklistLineSeverities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NORMAL"] as const;

const createBranchChecklistSchema = z.object({
  businessDate: z.string().min(1),
  shiftType: z.enum(branchChecklistShiftTypes),
  checklistName: z.string().trim().min(3).max(160)
});

const createBranchChecklistLineSchema = z.object({
  area: z.string().trim().min(2).max(120),
  checkName: z.string().trim().min(3).max(160),
  expectedResult: z.string().trim().min(3).max(300),
  result: z.enum(checklistLineResults),
  severity: z.enum(checklistLineSeverities),
  evidenceReference: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(1000).optional()
});

function emptyStatusCounts(): BranchChecklistStatusCounts {
  return {
    DRAFT: 0,
    IN_PROGRESS: 0,
    EXCEPTION_OPEN: 0,
    MANAGER_REVIEW: 0,
    SUBMITTED: 0,
    RETURNED: 0,
    REVIEWED: 0,
    CLOSED: 0
  };
}

function emptySeverityCounts(): BranchChecklistSeverityCounts {
  return {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    NORMAL: 0
  };
}

const reviewBranchChecklistSchema = z.object({
  checklistId: z.string().uuid(),
  reviewedAt: z.string().min(1),
  outcome: z.enum(["REVIEWED", "EXCEPTION_OPEN"]),
  reviewNote: z.string().trim().min(5).max(1000)
});

const closeBranchChecklistSchema = z.object({
  checklistId: z.string().uuid(),
  closeReason: z.string().trim().min(10).max(1000)
});

const returnBranchChecklistCorrectionSchema = z.object({
  checklistId: z.string().uuid(),
  correctionReason: z.string().trim().min(10).max(1000),
  evidenceReference: z.string().trim().max(255).optional()
});

const applyBranchChecklistCorrectionSchema = z.object({
  checklistId: z.string().uuid(),
  correctionReason: z.string().trim().min(10).max(1000),
  evidenceReference: z.string().trim().max(255).optional()
});

function assertBranchOperationsAccess(session: SessionContext) {
  if (!canUseBranchOperations(session.permissionCodes)) {
    assertPermissionAllowed(session.permissionCodes, permissions.branchOperationsView);
  }
}

function assertBranchOperationsReviewAccess(session: SessionContext) {
  assertPermissionAllowed(
    session.permissionCodes,
    permissions.branchOperationsReview
  );
}

function assertBranchOperationsCreateAccess(session: SessionContext) {
  assertPermissionAllowed(
    session.permissionCodes,
    permissions.branchOperationsCreate
  );
}

function assertBranchOperationsCorrectionAccess(session: SessionContext) {
  assertPermissionAllowed(
    session.permissionCodes,
    permissions.branchOperationsCorrect
  );
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

function activeContiguousLineNumbers(
  formData: FormData,
  prefix: "line",
  requiredFields: string[],
  maxLines: number,
  errorCode: string
) {
  const activeLineNumbers = new Set<number>();

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(`${prefix}.`) || !hasFormValue(value)) {
      continue;
    }
    const match = key.match(/^line\.(\d+)\.[A-Za-z0-9]+$/);
    if (!match) {
      throw new Error(errorCode);
    }
    const lineNo = Number(match[1]);
    if (!Number.isInteger(lineNo) || lineNo < 1 || lineNo > maxLines) {
      throw new Error(errorCode);
    }
    if (
      requiredFields.some((field) =>
        hasFormValue(formData.get(`${prefix}.${lineNo}.${field}`))
      )
    ) {
      activeLineNumbers.add(lineNo);
    }
  }

  const sortedLineNumbers = [...activeLineNumbers].sort((a, b) => a - b);
  for (let index = 0; index < sortedLineNumbers.length; index += 1) {
    if (sortedLineNumbers[index] !== index + 1) {
      throw new Error(errorCode);
    }
  }

  return sortedLineNumbers;
}

function parseBranchChecklistLines(formData: FormData) {
  const lines = [];
  const lineNumbers = activeContiguousLineNumbers(
    formData,
    "line",
    ["area", "checkName", "expectedResult"],
    20,
    "BRANCH_CHECKLIST_LINE_INDEX_INVALID"
  );
  for (const lineNo of lineNumbers) {
    const area = formData.get(`line.${lineNo}.area`);
    const checkName = formData.get(`line.${lineNo}.checkName`);
    const expectedResult = formData.get(`line.${lineNo}.expectedResult`);
    lines.push({
      lineNo,
      ...createBranchChecklistLineSchema.parse({
        area,
        checkName,
        expectedResult,
        result: formData.get(`line.${lineNo}.result`) ?? "PASS",
        severity: formData.get(`line.${lineNo}.severity`) ?? "NORMAL",
        evidenceReference:
          formData.get(`line.${lineNo}.evidenceReference`) || undefined,
        notes: formData.get(`line.${lineNo}.notes`) || undefined
      })
    });
  }
  if (lines.length === 0) {
    throw new Error("BRANCH_CHECKLIST_LINES_REQUIRED");
  }
  return lines;
}

function parseBranchChecklistCorrectionLines(
  formData: FormData,
  expectedLineCount: number
) {
  const lines = [];
  for (let lineNo = 1; lineNo <= expectedLineCount; lineNo += 1) {
    lines.push({
      lineNo,
      ...createBranchChecklistLineSchema.parse({
        area: formData.get(`line.${lineNo}.area`),
        checkName: formData.get(`line.${lineNo}.checkName`),
        expectedResult: formData.get(`line.${lineNo}.expectedResult`),
        result: formData.get(`line.${lineNo}.result`) ?? "PASS",
        severity: formData.get(`line.${lineNo}.severity`) ?? "NORMAL",
        evidenceReference:
          formData.get(`line.${lineNo}.evidenceReference`) || undefined,
        notes: formData.get(`line.${lineNo}.notes`) || undefined
      })
    });
  }
  return lines;
}

export function filterBranchOperationChecklists(
  checklists: BranchOperationChecklistSummary[],
  filters: BranchOperationsExportFilters = {}
) {
  const query = normalizedFilterText(filters.q);
  const shift = filters.shift && filters.shift !== "ALL" ? filters.shift : null;
  const status = filters.status && filters.status !== "ALL" ? filters.status : null;
  const businessDate = filters.businessDate?.trim() || null;

  return checklists.filter((checklist) => {
    const matchesSearch =
      query.length === 0 ||
      [
        checklist.checklistName,
        checklist.businessDate,
        checklist.shiftType,
        checklist.status,
        ...checklist.lines.flatMap((line) => [
          line.area,
          line.checkName,
          line.expectedResult,
          checklist.openedByName ?? "",
          checklist.submittedByName ?? "",
          checklist.reviewedByName ?? "",
          line.notes ?? "",
          line.evidenceReference ?? ""
        ])
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesShift = shift === null || checklist.shiftType === shift;
    const matchesStatus = status === null || checklist.status === status;
    const matchesBusinessDate =
      businessDate === null || checklist.businessDate === businessDate;
    return matchesSearch && matchesShift && matchesStatus && matchesBusinessDate;
  });
}

export async function listBranchOperationChecklistPage(
  session: SessionContext,
  filters: BranchOperationsExportFilters = {},
  input: { page?: number; pageSize?: number } = {}
): Promise<BranchOperationChecklistPage> {
  assertBranchOperationsAccess(session);
  const rawPageSize = input.pageSize ?? 25;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(Math.max(Math.floor(rawPageSize), 1), 50)
    : 25;
  const rawPage = input.page ?? 1;
  const requestedPage = Number.isFinite(rawPage)
    ? Math.max(Math.floor(rawPage), 1)
    : 1;
  const query = normalizedFilterText(filters.q);
  const shift = filters.shift && filters.shift !== "ALL" ? filters.shift : null;
  const status = filters.status && filters.status !== "ALL" ? filters.status : null;
  const businessDate = filters.businessDate?.trim() || null;
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
  const date = businessDate ? parseDateOnlyUtc(businessDate) : null;
  if (businessDate && !date) {
    throw new Error("BRANCH_OPERATIONS_BUSINESS_DATE_INVALID");
  }
  const where: Prisma.BranchOperationalChecklistWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId,
    ...(shift ? { shiftType: shift } : {}),
    ...(status ? { status } : {}),
    ...(date ? { businessDate: date } : {}),
    ...(query
      ? {
          OR: [
            { checklistName: { contains: query, mode: "insensitive" } },
            { shiftType: { contains: query, mode: "insensitive" } },
            { status: { contains: query, mode: "insensitive" } },
            { openedByUserId: { in: actorMatches.map((row) => row.id) } },
            { submittedByUserId: { in: actorMatches.map((row) => row.id) } },
            { reviewedByUserId: { in: actorMatches.map((row) => row.id) } },
            { lines: { some: { OR: [
              { area: { contains: query, mode: "insensitive" } },
              { checkName: { contains: query, mode: "insensitive" } },
              { expectedResult: { contains: query, mode: "insensitive" } },
              { notes: { contains: query, mode: "insensitive" } },
              { evidenceReference: { contains: query, mode: "insensitive" } }
            ] } } }
          ]
        }
      : {})
  };
  const totalItems = await prisma.branchOperationalChecklist.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.branchOperationalChecklist.findMany({
    where,
    include: { location: true, lines: { orderBy: { lineNo: "asc" } } },
    orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize
  }) as BranchOperationalChecklistWithLines[];
  const actorIds = Array.from(new Set(rows.flatMap((row) => [row.openedByUserId, row.submittedByUserId, row.reviewedByUserId].filter((id): id is string => Boolean(id)))));
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds }, tenantId: session.context.tenantId }, select: { id: true, displayName: true, email: true } }) : [];
  const actorNameById = userDisplayNameById(actors);
  const items = rows.map((checklist) => ({
    id: checklist.id,
    checklistName: checklist.checklistName,
    locationName: checklist.location.name,
    businessDate: checklist.businessDate.toISOString().slice(0, 10),
    shiftType: checklist.shiftType,
    status: checklist.status,
    openedByUserId: checklist.openedByUserId,
    submittedByUserId: checklist.submittedByUserId,
    reviewedByUserId: checklist.reviewedByUserId,
    openedByName: checklist.openedByUserId ? actorNameById.get(checklist.openedByUserId) ?? "Unknown user" : null,
    submittedByName: checklist.submittedByUserId ? actorNameById.get(checklist.submittedByUserId) ?? "Unknown user" : null,
    reviewedByName: checklist.reviewedByUserId ? actorNameById.get(checklist.reviewedByUserId) ?? "Unknown user" : null,
    reviewedAt: dateOrNull(checklist.reviewedAt),
    exceptionCount: checklist.exceptionCount,
    completionPercent: Number(checklist.completionPercent),
    lines: checklist.lines.map((line) => ({ id: line.id, lineNo: line.lineNo, area: line.area, checkName: line.checkName, expectedResult: line.expectedResult, result: line.result, severity: line.severity, evidenceReference: line.evidenceReference, notes: line.notes }))
  }));
  return { items, page, pageSize, totalItems, totalPages };
}

export async function getBranchOperationsDashboard(
  session: SessionContext
): Promise<BranchOperationsDashboard> {
  assertBranchOperationsAccess(session);

  const where: Prisma.BranchOperationalChecklistWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId
  };
  const checklists = await prisma.branchOperationalChecklist.findMany({
    where,
    include: {
      location: true,
      lines: {
        orderBy: { lineNo: "asc" }
      }
    },
    orderBy: [{ businessDate: "desc" }, { shiftType: "asc" }]
  }) as BranchOperationalChecklistWithLines[];

  const actorIds = Array.from(
    new Set(
      checklists.flatMap((checklist) =>
        [
          checklist.openedByUserId,
          checklist.submittedByUserId,
          checklist.reviewedByUserId
        ].filter((id): id is string => Boolean(id))
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

  const summaries = checklists.map((checklist): BranchOperationChecklistSummary => ({
    id: checklist.id,
    checklistName: checklist.checklistName,
    locationName: checklist.location.name,
    businessDate: checklist.businessDate.toISOString().slice(0, 10),
    shiftType: checklist.shiftType,
    status: checklist.status,
    openedByUserId: checklist.openedByUserId,
    submittedByUserId: checklist.submittedByUserId,
    reviewedByUserId: checklist.reviewedByUserId,
    openedByName: checklist.openedByUserId
      ? actorNameById.get(checklist.openedByUserId) ?? "Unknown user"
      : null,
    submittedByName: checklist.submittedByUserId
      ? actorNameById.get(checklist.submittedByUserId) ?? "Unknown user"
      : null,
    reviewedByName: checklist.reviewedByUserId
      ? actorNameById.get(checklist.reviewedByUserId) ?? "Unknown user"
      : null,
    reviewedAt: dateOrNull(checklist.reviewedAt),
    exceptionCount: checklist.exceptionCount,
    completionPercent: Number(checklist.completionPercent),
    lines: checklist.lines.map((line) => ({
      id: line.id,
      lineNo: line.lineNo,
      area: line.area,
      checkName: line.checkName,
      expectedResult: line.expectedResult,
      result: line.result,
      severity: line.severity,
      evidenceReference: line.evidenceReference,
      notes: line.notes
    }))
  }));

  const openExceptions = summaries.reduce(
    (total, checklist) => total + checklist.exceptionCount,
    0
  );
  const criticalExceptions = summaries.reduce(
    (total, checklist) =>
      total +
      checklist.lines.filter(
        (line) => line.result === "EXCEPTION" && line.severity === "CRITICAL"
      ).length,
    0
  );
  const statusCounts = summaries.reduce((counts, checklist) => {
    if (checklist.status in counts) {
      counts[checklist.status as keyof BranchChecklistStatusCounts] += 1;
    }
    return counts;
  }, emptyStatusCounts());
  const severityCounts = summaries.reduce((counts, checklist) => {
    for (const line of checklist.lines) {
      if (line.result === "EXCEPTION" && line.severity in counts) {
        counts[line.severity as keyof BranchChecklistSeverityCounts] += 1;
      }
    }
    return counts;
  }, emptySeverityCounts());
  const averageCompletionPercent =
    summaries.length === 0
      ? 0
      : Number(
          (
            summaries.reduce(
              (total, checklist) => total + checklist.completionPercent,
              0
            ) / summaries.length
          ).toFixed(2)
        );

  return {
    locationName: session.context.locationName,
    businessDate: summaries[0]?.businessDate ?? null,
    totalChecklists: summaries.length,
    completedChecklists:
      statusCounts.SUBMITTED + statusCounts.REVIEWED + statusCounts.CLOSED,
    openExceptions,
    criticalExceptions,
    statusCounts,
    severityCounts,
    averageCompletionPercent,
    checklists: summaries
  };
}

export async function getBranchOperationsDashboardRead(
  session: SessionContext
): Promise<BranchOperationsDashboardRead> {
  assertBranchOperationsAccess(session);

  const where: Prisma.BranchOperationalChecklistWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId
  };
  const [summary, statusRows, totalChecklists, latestChecklist, criticalExceptions, reviewRows, exceptionRows] =
    await Promise.all([
      prisma.branchOperationalChecklist.aggregate({
        where,
        _sum: { exceptionCount: true },
        _avg: { completionPercent: true }
      }),
      prisma.branchOperationalChecklist.groupBy({
        by: ["status"],
        where,
        _count: { _all: true }
      }),
      prisma.branchOperationalChecklist.count({ where }),
      prisma.branchOperationalChecklist.findFirst({ where, orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }, { id: "desc" }], select: { businessDate: true } }),
      prisma.branchOperationalChecklistLine.count({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
          locationId: session.context.locationId,
          result: "EXCEPTION",
          severity: "CRITICAL"
        }
      }),
      prisma.branchOperationalChecklist.findMany({
        where: { ...where, status: { in: [...reviewableChecklistStatuses] } },
        orderBy: [{ businessDate: "desc" }, { shiftType: "asc" }],
        take: 3,
        select: {
          id: true,
          checklistName: true,
          businessDate: true,
          shiftType: true,
          status: true,
          exceptionCount: true,
          lines: {
            where: { result: "EXCEPTION", severity: "CRITICAL" },
            select: { id: true },
            take: 1
          }
        }
      }),
      prisma.branchOperationalChecklist.findMany({
        where: { ...where, exceptionCount: { gt: 0 } },
        orderBy: [{ businessDate: "desc" }, { shiftType: "asc" }],
        take: 3,
        select: {
          id: true,
          checklistName: true,
          businessDate: true,
          shiftType: true,
          status: true,
          exceptionCount: true,
          lines: {
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
      statusCounts[row.status as keyof BranchChecklistStatusCounts] = row._count._all;
    }
  }
  const toCandidate = (row: (typeof reviewRows)[number]): BranchOperationsDashboardCandidate => ({
    id: row.id,
    checklistName: row.checklistName,
    businessDate: row.businessDate.toISOString().slice(0, 10),
    shiftType: row.shiftType,
    status: row.status,
    exceptionCount: row.exceptionCount,
    hasCriticalException: row.lines.length > 0
  });

  return {
    locationName: session.context.locationName,
    businessDate: latestChecklist?.businessDate.toISOString().slice(0, 10) ?? null,
    totalChecklists,
    completedChecklists:
      statusCounts.SUBMITTED + statusCounts.REVIEWED + statusCounts.CLOSED,
    openExceptions: summary._sum.exceptionCount ?? 0,
    statusCounts,
    severityCounts: {
      ...emptySeverityCounts(),
      CRITICAL: criticalExceptions
    },
    averageCompletionPercent: Number(summary._avg.completionPercent ?? 0),
    reviewCandidates: reviewRows.map(toCandidate),
    exceptionCandidates: exceptionRows.map(toCandidate)
  };
}

/**
 * Returns only branch-checklist work with a currently executable focused
 * action. Review tasks fail closed when actor lineage is incomplete and never
 * include the opener or latest submitter. Returned corrections remain pooled
 * work for scoped creators because the source workflow has no assignee field.
 * Final close is intentionally excluded pending a confirmed self-action policy.
 */
export async function listBranchOperationMyTaskPage(
  session: SessionContext,
  input: { after?: DashboardTaskCursor; take?: number; filter?: DashboardTaskFilter } = {}
): Promise<BranchOperationMyTaskPage> {
  assertBranchOperationsAccess(session);

  const actionPredicates: Prisma.BranchOperationalChecklistWhereInput[] = [
    ...(session.permissionCodes.includes(permissions.branchOperationsReview)
      ? [{
          status: { in: [...reviewableChecklistStatuses] },
          openedByUserId: { not: null },
          submittedByUserId: { not: null },
          NOT: [
            { openedByUserId: session.user.id },
            { submittedByUserId: session.user.id }
          ]
        } satisfies Prisma.BranchOperationalChecklistWhereInput]
      : []),
    ...(session.permissionCodes.includes(permissions.branchOperationsCreate)
      ? [{ status: "RETURNED" } satisfies Prisma.BranchOperationalChecklistWhereInput]
      : [])
  ];
  if (input.filter?.priority && input.filter.priority !== "HIGH") return { totalCount: 0, items: [], nextCursor: null };
  if (input.filter?.status && !["SUBMITTED", "MANAGER_REVIEW", "RETURNED"].includes(input.filter.status)) return { totalCount: 0, items: [], nextCursor: null };
  const filteredActionPredicates = input.filter?.status
    ? actionPredicates.filter((_predicate, index) => input.filter?.status === "RETURNED" ? index === 1 : index === 0)
    : actionPredicates;
  if (filteredActionPredicates.length === 0) {
    return { totalCount: 0, items: [], nextCursor: null };
  }

  const take = Math.min(Math.max(input.take ?? 25, 1), 50);
  const afterWhere = dashboardTaskAfterWhere("BRANCH_OPERATION", input.after);
  const baseWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId,
    ...(input.filter?.status ? { status: input.filter.status } : {}),
    OR: filteredActionPredicates
  } satisfies Prisma.BranchOperationalChecklistWhereInput;
  const [totalCount, rows] = await Promise.all([
    prisma.branchOperationalChecklist.count({ where: baseWhere }),
    prisma.branchOperationalChecklist.findMany({
      where: afterWhere ? { ...baseWhere, AND: [afterWhere] } : baseWhere,
      select: {
        id: true,
        checklistName: true,
        status: true,
        businessDate: true,
        shiftType: true,
        createdAt: true,
        location: { select: { name: true } }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: take + 1
    })
  ]);
  const hasMore = rows.length > take;
  const items = rows.slice(0, take).map((row) => ({
    taskId: `branch-operation-${row.id}`,
    recordId: row.id,
    publicReference: row.checklistName,
    status: row.status,
    actionLabel: row.status === "RETURNED"
      ? "Correct and resubmit checklist" as const
      : "Review branch checklist" as const,
    locationName: row.location.name,
    businessDate: row.businessDate.toISOString().slice(0, 10),
    shiftType: row.shiftType,
    createdAt: row.createdAt.toISOString()
  }));
  const last = items.at(-1);

  return {
    totalCount,
    items,
    nextCursor: hasMore && last
      ? { createdAt: last.createdAt, sourceType: "BRANCH_OPERATION", recordId: last.recordId }
      : null
  };
}

export async function getBranchOperationChecklistSummary(
  session: SessionContext,
  checklistId: string
) {
  const dashboard = await getBranchOperationsDashboard(session);
  return dashboard.checklists.find((checklist) => checklist.id === checklistId) ?? null;
}

export async function createBranchOperationChecklist(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.branchOperationsCreate);
  assertBranchOperationsCreateAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = createBranchChecklistSchema.parse(Object.fromEntries(formData));
  const businessDate = dateFromDateInput(values.businessDate, "BRANCH_BUSINESS_DATE");
  const actionAt = new Date();
  const lines = parseBranchChecklistLines(formData);
  const exceptionCount = lines.filter((line) => line.result === "EXCEPTION").length;
  const completionPercent = 100;

  const checklist = await prisma.$transaction(async (tx) => {
    let created;
    try {
      created = await tx.branchOperationalChecklist.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: session.context.brandId || null,
          locationId: session.context.locationId,
          businessDate,
          shiftType: values.shiftType,
          status: "SUBMITTED",
        checklistName: values.checklistName,
        openedByUserId: session.user.id,
        submittedByUserId: session.user.id,
        submittedAt: actionAt,
          exceptionCount,
          completionPercent,
          lines: {
            create: lines.map((line) => ({
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              brandId: session.context.brandId || null,
              locationId: session.context.locationId,
              lineNo: line.lineNo,
              area: line.area,
              checkName: line.checkName,
              expectedResult: line.expectedResult,
              result: line.result,
              severity: line.severity,
              evidenceReference: line.evidenceReference || null,
            notes: line.notes || null,
            completedByUserId: session.user.id,
            completedAt: actionAt
          }))
          }
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("BRANCH_CHECKLIST_ALREADY_EXISTS");
      }
      throw error;
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "branch_checklist.created",
        entityType: "BranchOperationalChecklist",
        entityId: created.id,
        afterData: {
          status: created.status,
          businessDate: dateOrNull(created.businessDate),
          shiftType: created.shiftType,
          exceptionCount: created.exceptionCount,
          completionPercent: Number(created.completionPercent)
        },
        metadata: {
          locationId: session.context.locationId,
          lineCount: lines.length,
          boundary: "branch_checklist_create_only_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "BranchOperationalChecklist",
      targetEntityId: created.id,
      action: "CREATE_SUBMITTED",
      fromStatus: "NONE",
      toStatus: created.status,
      brandId: created.brandId,
      locationId: created.locationId,
      evidenceReference:
        lines.find((line) => line.evidenceReference)?.evidenceReference ?? null
    });

    return created;
  });

  return checklist.id;
}

export async function reviewBranchOperationChecklist(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.branchOperationsReview);
  assertBranchOperationsReviewAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = reviewBranchChecklistSchema.parse(Object.fromEntries(formData));
  const reviewedAt = dateFromDateInput(values.reviewedAt, "BRANCH_REVIEWED_AT");

  const checklist = await prisma.$transaction(async (tx) => {
    const current = await tx.branchOperationalChecklist.findFirst({
      where: {
        id: values.checklistId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
        locationId: session.context.locationId
      }
    });

    if (!current) {
      throw new Error("BRANCH_CHECKLIST_NOT_FOUND");
    }
    if (!(reviewableChecklistStatuses as readonly string[]).includes(current.status)) {
      throw new Error("BRANCH_CHECKLIST_STATUS_NOT_REVIEWABLE");
    }
    if (!current.openedByUserId || !current.submittedByUserId) {
      throw new Error("BRANCH_CHECKLIST_ACTOR_LINEAGE_REQUIRED");
    }
    if (reviewedAt < current.businessDate) {
      throw new Error("BRANCH_REVIEWED_AT_BEFORE_BUSINESS_DATE");
    }
    if (
      current.openedByUserId === session.user.id ||
      current.submittedByUserId === session.user.id
    ) {
      throw new Error("BRANCH_CHECKLIST_SELF_REVIEW_BLOCKED");
    }
    if (values.outcome === "REVIEWED" && current.exceptionCount > 0) {
      throw new Error("BRANCH_CHECKLIST_EXCEPTION_REVIEW_REQUIRED");
    }

    const result = await tx.branchOperationalChecklist.updateMany({
      where: {
        id: current.id,
        status: { in: [...reviewableChecklistStatuses] },
        reviewedAt: null
      },
      data: {
        status: values.outcome,
        reviewedByUserId: session.user.id,
        reviewedAt
      }
    });
    if (result.count !== 1) {
      throw new Error("BRANCH_CHECKLIST_REVIEW_CONFLICT");
    }

    const updated = await tx.branchOperationalChecklist.findUniqueOrThrow({
      where: { id: current.id }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "branch_checklist.reviewed",
        entityType: "BranchOperationalChecklist",
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
          boundary: "branch_checklist_review_only_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "BranchOperationalChecklist",
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

  return checklist.id;
}

export async function returnBranchOperationChecklistForCorrection(
  formData: FormData
) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.branchOperationsCorrect);
  assertBranchOperationsCorrectionAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = returnBranchChecklistCorrectionSchema.parse(
    Object.fromEntries(formData)
  );

  const checklist = await prisma.$transaction(async (tx) => {
    const current = await tx.branchOperationalChecklist.findFirst({
      where: {
        id: values.checklistId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
        locationId: session.context.locationId
      }
    });

    if (!current) {
      throw new Error("BRANCH_CHECKLIST_NOT_FOUND");
    }
    if (!(reviewableChecklistStatuses as readonly string[]).includes(current.status)) {
      throw new Error("BRANCH_CHECKLIST_STATUS_NOT_REVIEWABLE");
    }
    if (!current.openedByUserId || !current.submittedByUserId) {
      throw new Error("BRANCH_CHECKLIST_ACTOR_LINEAGE_REQUIRED");
    }
    if (
      current.openedByUserId === session.user.id ||
      current.submittedByUserId === session.user.id
    ) {
      throw new Error("BRANCH_CHECKLIST_SELF_REVIEW_BLOCKED");
    }
    const operationIdempotencyKey =
      `BranchOperationalChecklist:${current.id}:RETURN_FOR_CORRECTION:${current.updatedAt.toISOString()}`;

    const result = await tx.branchOperationalChecklist.updateMany({
      where: {
        id: current.id,
        status: { in: [...reviewableChecklistStatuses] }
      },
      data: {
        status: "RETURNED"
      }
    });
    if (result.count !== 1) {
      throw new Error("BRANCH_CHECKLIST_REVIEW_CONFLICT");
    }

    const updated = await tx.branchOperationalChecklist.findUniqueOrThrow({
      where: { id: current.id }
    });

    await tx.operationalCorrectionRecord.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: updated.brandId,
        locationId: updated.locationId,
        targetEntityType: "BranchOperationalChecklist",
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
        eventType: "branch_checklist.returned_for_correction",
        entityType: "BranchOperationalChecklist",
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
          boundary: "branch_checklist_return_correction_only_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "BranchOperationalChecklist",
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

  return checklist.id;
}

export async function applyBranchOperationChecklistCorrection(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.branchOperationsCreate);
  assertBranchOperationsCreateAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = applyBranchChecklistCorrectionSchema.parse(
    Object.fromEntries(formData)
  );
  const actionAt = new Date();

  const checklist = await prisma.$transaction(async (tx) => {
    const current = await tx.branchOperationalChecklist.findFirst({
      where: {
        id: values.checklistId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
        locationId: session.context.locationId
      },
      include: { lines: { orderBy: { lineNo: "asc" } } }
    });

    if (!current) {
      throw new Error("BRANCH_CHECKLIST_NOT_FOUND");
    }
    if (current.status !== "RETURNED") {
      throw new Error("BRANCH_CHECKLIST_STATUS_NOT_CORRECTABLE");
    }
    const operationIdempotencyKey =
      `BranchOperationalChecklist:${current.id}:APPLY_CORRECTION:${current.updatedAt.toISOString()}`;

    const lines = parseBranchChecklistCorrectionLines(
      formData,
      current.lines.length
    );
    const exceptionCount = lines.filter((line) => line.result === "EXCEPTION")
      .length;
    const completionPercent = 100;

    const result = await tx.branchOperationalChecklist.updateMany({
      where: { id: current.id, status: "RETURNED" },
      data: {
        status: "SUBMITTED",
        submittedByUserId: session.user.id,
        submittedAt: actionAt,
        reviewedByUserId: null,
        reviewedAt: null,
        exceptionCount,
        completionPercent
      }
    });
    if (result.count !== 1) {
      throw new Error("BRANCH_CHECKLIST_CORRECTION_CONFLICT");
    }

    for (const line of lines) {
      await tx.branchOperationalChecklistLine.updateMany({
        where: {
          checklistId: current.id,
          lineNo: line.lineNo,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
          locationId: session.context.locationId
        },
        data: {
          area: line.area,
          checkName: line.checkName,
          expectedResult: line.expectedResult,
          result: line.result,
          severity: line.severity,
          evidenceReference: line.evidenceReference || null,
          notes: line.notes || null,
          completedByUserId: session.user.id,
          completedAt: actionAt
        }
      });
    }

    const updated = await tx.branchOperationalChecklist.findUniqueOrThrow({
      where: { id: current.id },
      include: { lines: { orderBy: { lineNo: "asc" } } }
    });
    await tx.operationalCorrectionRecord.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: updated.brandId,
        locationId: updated.locationId,
        targetEntityType: "BranchOperationalChecklist",
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
        eventType: "branch_checklist.correction_applied",
        entityType: "BranchOperationalChecklist",
        entityId: updated.id,
        beforeData: {
          status: current.status,
          exceptionCount: current.exceptionCount,
          completionPercent: Number(current.completionPercent),
          lines: current.lines.map((line) => ({
            lineNo: line.lineNo,
            area: line.area,
            checkName: line.checkName,
            expectedResult: line.expectedResult,
            result: line.result,
            severity: line.severity,
            evidenceReference: line.evidenceReference,
            notes: line.notes
          }))
        },
        afterData: {
          status: updated.status,
          exceptionCount: updated.exceptionCount,
          completionPercent: Number(updated.completionPercent),
          lines: updated.lines.map((line) => ({
            lineNo: line.lineNo,
            area: line.area,
            checkName: line.checkName,
            expectedResult: line.expectedResult,
            result: line.result,
            severity: line.severity,
            evidenceReference: line.evidenceReference,
            notes: line.notes
          }))
        },
        metadata: {
          locationId: updated.locationId,
          reason: values.correctionReason,
          evidenceReference: values.evidenceReference || null,
          boundary: "branch_checklist_correction_no_inventory_finance_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "BranchOperationalChecklist",
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

  return checklist.id;
}

export async function closeBranchOperationChecklist(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.branchOperationsReview);
  assertBranchOperationsReviewAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = closeBranchChecklistSchema.parse(Object.fromEntries(formData));

  const checklist = await prisma.$transaction(async (tx) => {
    const current = await tx.branchOperationalChecklist.findFirst({
      where: {
        id: values.checklistId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
        locationId: session.context.locationId
      }
    });

    if (!current) {
      throw new Error("BRANCH_CHECKLIST_NOT_FOUND");
    }
    if (
      !(closeableChecklistStatuses as readonly string[]).includes(current.status)
    ) {
      throw new Error("BRANCH_CHECKLIST_STATUS_NOT_CLOSABLE");
    }

    const result = await tx.branchOperationalChecklist.updateMany({
      where: {
        id: current.id,
        status: { in: [...closeableChecklistStatuses] }
      },
      data: {
        status: "CLOSED"
      }
    });
    if (result.count !== 1) {
      throw new Error("BRANCH_CHECKLIST_CLOSE_CONFLICT");
    }

    const updated = await tx.branchOperationalChecklist.findUniqueOrThrow({
      where: { id: current.id }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "branch_checklist.closed",
        entityType: "BranchOperationalChecklist",
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
          boundary: "branch_checklist_close_only_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "BranchOperationalChecklist",
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

  return checklist.id;
}

export async function buildBranchOperationsExportRows(
  session: SessionContext,
  filters: BranchOperationsExportFilters = {}
) {
  const dashboard = await getBranchOperationsDashboard(session);
  const checklists = filterBranchOperationChecklists(dashboard.checklists, filters);
  return [
    [
      "Location",
      "Business Date",
      "Checklist",
      "Shift",
      "Status",
      "Opened By",
      "Submitted By",
      "Reviewed By",
      "Reviewed At",
      "Completion Percent",
      "Exception Count",
      "Draft Count",
      "In Progress Count",
      "Exception Open Count",
      "Manager Review Count",
      "Submitted Count",
      "Reviewed Count",
      "Closed Count",
      "Critical Exception Count",
      "High Exception Count",
      "Line No",
      "Area",
      "Check",
      "Expected Result",
      "Result",
      "Severity",
      "Evidence Reference",
      "Notes"
    ],
    ...checklists.flatMap((checklist) =>
      checklist.lines.map((line) => [
        checklist.locationName,
        checklist.businessDate,
        checklist.checklistName,
        checklist.shiftType,
        checklist.status,
        checklist.openedByName ?? "",
        checklist.submittedByName ?? "",
        checklist.reviewedByName ?? "",
        checklist.reviewedAt ?? "",
        checklist.completionPercent,
        checklist.exceptionCount,
        dashboard.statusCounts.DRAFT,
        dashboard.statusCounts.IN_PROGRESS,
        dashboard.statusCounts.EXCEPTION_OPEN,
        dashboard.statusCounts.MANAGER_REVIEW,
        dashboard.statusCounts.SUBMITTED,
        dashboard.statusCounts.REVIEWED,
        dashboard.statusCounts.CLOSED,
        dashboard.severityCounts.CRITICAL,
        dashboard.severityCounts.HIGH,
        line.lineNo,
        line.area,
        line.checkName,
        line.expectedResult,
        line.result,
        line.severity,
        line.evidenceReference ?? "",
        line.notes ?? ""
      ])
    )
  ];
}
