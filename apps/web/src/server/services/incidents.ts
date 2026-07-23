import { createHash } from "node:crypto";
import { prisma, type Prisma } from "@ogfi/database";
import { z } from "zod";
import {
  assertPermissionAllowed,
  canUseIncidents,
  permissions,
  requirePermission
} from "./authorization";
import {
  assertAuthorizedLocation,
  requireSessionContext,
  type SessionContext
} from "./context";
import { recordOperationalStatusTransition } from "./operationalWorkflow";
import {
  assertPhase2WorkflowTransitionAllowed,
  requiresPhase2IndependentReview
} from "./phase2WorkflowPolicy";
import { dateOnlyInTimeZone, parseDateOnlyUtc } from "./projectDates";
import {
  compareDashboardTaskOrder,
  dashboardTaskSources,
  type DashboardTaskCursor,
  type DashboardTaskPriority
} from "./dashboardTasks";

type OperationalIncidentWithLocation = Prisma.OperationalIncidentGetPayload<{
  include: {
    location: true;
  };
}>;

type IncidentSourceRecordType = (typeof incidentSourceRecordTypes)[number];

const incidentCategories = [
  "FOOD_SAFETY",
  "CUSTOMER_COMPLAINT",
  "EQUIPMENT",
  "INVENTORY",
  "SERVICE",
  "STAFFING",
  "OTHER"
] as const;

const incidentSeverities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const resolvableIncidentStatuses = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING_REVIEW"
] as const;
const incidentSourceRecordTypes = [
  "BranchOperationalChecklist",
  "FoodSafetyLog",
  "MaintenanceTicket"
] as const;

const createIncidentSchema = z
  .object({
    incidentDate: z.string().min(1),
    category: z.enum(incidentCategories),
    severity: z.enum(incidentSeverities),
    title: z.string().trim().min(3).max(160),
    summary: z.string().trim().min(10).max(2000),
    correctiveAction: z.string().trim().max(2000).optional(),
    evidenceReference: z.string().trim().max(255).optional(),
    dueAt: z.string().optional(),
    sourceRecordType: z
      .enum(incidentSourceRecordTypes)
      .or(z.literal(""))
      .optional(),
    sourceRecordId: z.string().trim().uuid().or(z.literal("")).optional()
  })
  .superRefine((values, context) => {
    const hasSourceType = Boolean(values.sourceRecordType);
    const hasSourceId = Boolean(values.sourceRecordId);
    if (hasSourceType !== hasSourceId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INCIDENT_SOURCE_LINK_INCOMPLETE",
        path: hasSourceType ? ["sourceRecordId"] : ["sourceRecordType"]
      });
    }
  });

const resolveIncidentSchema = z.object({
  incidentId: z.string().uuid(),
  resolvedAt: z.string().min(1),
  correctiveAction: z.string().trim().min(10).max(2000),
  evidenceReference: z.string().trim().min(3).max(255),
  idempotencyKey: z.string().trim().min(1).max(255).optional()
});

const cancelIncidentSchema = z.object({
  incidentId: z.string().uuid(),
  cancelReason: z.string().trim().min(10).max(1000),
  idempotencyKey: z.string().trim().min(1).max(255).optional()
});

const correctableIncidentStatuses = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING_REVIEW"
] as const;

const correctOperationalIncidentSchema = z.object({
  incidentId: z.string().uuid(),
  incidentDate: z.string().min(1),
  category: z.enum(incidentCategories),
  severity: z.enum(incidentSeverities),
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(10).max(2000),
  correctiveAction: z.string().trim().max(2000).optional(),
  evidenceReference: z.string().trim().max(255).optional(),
  dueAt: z.string().optional(),
  correctionReason: z.string().trim().min(10).max(1000),
  correctionEvidenceReference: z.string().trim().max(255).optional(),
  idempotencyKey: z.string().trim().min(1).max(255).optional()
});

export type OperationalIncidentSummary = {
  id: string;
  incidentNumber: string;
  incidentDate: string;
  category: string;
  severity: string;
  status: string;
  title: string;
  summary: string;
  locationName: string;
  reportedByName: string | null;
  hasReporter?: boolean;
  reportedByCurrentUser?: boolean;
  ownerName: string | null;
  sourceRecordType: string | null;
  sourceRecordId: string | null;
  correctiveAction: string | null;
  evidenceReference: string | null;
  dueAt: string | null;
  resolvedAt: string | null;
};

export type IncidentMyTaskPage = {
  totalCount: number;
  items: Array<{
    taskId: string;
    recordId: string;
    publicReference: string;
    status: string;
    severity: DashboardTaskPriority;
    dueAt: string | null;
    actionLabel: "Resolve incident";
    createdAt: string;
  }>;
  nextCursor: DashboardTaskCursor | null;
};

export type IncidentStatusCounts = Record<
  "OPEN" | "IN_PROGRESS" | "PENDING_REVIEW" | "RESOLVED" | "CANCELLED",
  number
>;

export type IncidentSeverityCounts = Record<
  "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  number
>;

export type IncidentDashboard = {
  locationName: string;
  totalIncidents: number;
  openIncidents: number;
  criticalIncidents: number;
  overdueIncidents: number;
  statusCounts: IncidentStatusCounts;
  severityCounts: IncidentSeverityCounts;
  incidents: OperationalIncidentSummary[];
};

export type IncidentDashboardCandidate = {
  id: string;
  incidentNumber: string;
  incidentDate: string;
  severity: string;
  status: string;
  title: string;
  ownerName: string | null;
  dueAt: string | null;
};

export type IncidentDashboardRead = {
  totalIncidents: number;
  openIncidents: number;
  criticalIncidents: number;
  overdueIncidents: number;
  statusCounts: IncidentStatusCounts;
  severityCounts: IncidentSeverityCounts;
  followUpCandidates: IncidentDashboardCandidate[];
};

export type IncidentExportFilters = {
  q?: string;
  status?: string;
  severity?: string;
  incidentDate?: string;
};

export type IncidentPage = {
  items: OperationalIncidentSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

function assertIncidentAccess(session: SessionContext) {
  if (!canUseIncidents(session.permissionCodes)) {
    assertPermissionAllowed(session.permissionCodes, permissions.incidentView);
  }
}

function assertIncidentCreateAccess(session: SessionContext) {
  assertPermissionAllowed(session.permissionCodes, permissions.incidentCreate);
}

async function assertIncidentSourceRecordVisible(
  tx: Prisma.TransactionClient,
  session: SessionContext,
  sourceRecordType: IncidentSourceRecordType | null,
  sourceRecordId: string | null
) {
  if (!sourceRecordType || !sourceRecordId) {
    return;
  }

  const requiredPermission =
    sourceRecordType === "BranchOperationalChecklist"
      ? permissions.branchOperationsView
      : sourceRecordType === "FoodSafetyLog"
        ? permissions.foodSafetyView
        : permissions.maintenanceView;
  assertPermissionAllowed(session.permissionCodes, requiredPermission);

  const where = {
    id: sourceRecordId,
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId
  };

  const source =
    sourceRecordType === "BranchOperationalChecklist"
      ? await tx.branchOperationalChecklist.findFirst({ where })
      : sourceRecordType === "FoodSafetyLog"
        ? await tx.foodSafetyLog.findFirst({ where })
        : await tx.maintenanceTicket.findFirst({ where });

  if (!source) {
    throw new Error("INCIDENT_SOURCE_RECORD_NOT_FOUND_OR_UNSCOPED");
  }
}

function assertIncidentResolveAccess(session: SessionContext) {
  assertPermissionAllowed(session.permissionCodes, permissions.incidentResolve);
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

function operationIdempotencyKey(
  incidentId: string,
  action: string,
  providedKey: string | undefined,
  payload: Record<string, unknown>,
  actorUserId: string
) {
  if (providedKey) {
    return providedKey;
  }
  const digest = createHash("sha256")
    .update(JSON.stringify({ actorUserId, payload }))
    .digest("hex");
  return `OperationalIncident:${incidentId}:${action}:${digest}`;
}

async function hasRecordedIncidentOperation(
  tx: Prisma.TransactionClient,
  session: SessionContext,
  incidentId: string,
  idempotencyKey: string
) {
  const txAny = tx as Prisma.TransactionClient & Record<string, any>;
  if (!txAny.operationalStatusTransition?.findFirst) {
    return false;
  }
  return Boolean(
    await txAny.operationalStatusTransition.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        targetEntityType: "OperationalIncident",
        targetEntityId: incidentId,
        idempotencyKey
      }
    })
  );
}

async function nextIncidentNumber(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.operationalIncident.count({
    where: {
      companyId,
      incidentNumber: { startsWith: `INC-${year}-` }
    }
  });
  return `INC-${year}-${String(count + 1).padStart(5, "0")}`;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function normalizedFilterText(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function userDisplayNameById(
  users: Array<{ id: string; displayName: string; email: string }>
) {
  return new Map(users.map((user) => [user.id, user.displayName || user.email]));
}

export function filterIncidents(
  incidents: OperationalIncidentSummary[],
  filters: IncidentExportFilters = {}
) {
  const query = normalizedFilterText(filters.q);
  const status = filters.status && filters.status !== "ALL" ? filters.status : null;
  const severity =
    filters.severity && filters.severity !== "ALL" ? filters.severity : null;
  const incidentDate = filters.incidentDate?.trim() || null;

  return incidents.filter((incident) => {
    const matchesSearch =
      query.length === 0 ||
      [
        incident.incidentNumber,
        incident.title,
        incident.summary,
        incident.category,
        incident.reportedByName ?? "",
        incident.ownerName ?? "",
        incident.correctiveAction ?? "",
        incident.evidenceReference ?? "",
        incident.sourceRecordType ?? "",
        incident.sourceRecordId ?? ""
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesStatus = status === null || incident.status === status;
    const matchesSeverity = severity === null || incident.severity === severity;
    const matchesIncidentDate =
      incidentDate === null || incident.incidentDate === incidentDate;
    return matchesSearch && matchesStatus && matchesSeverity && matchesIncidentDate;
  });
}

export async function listIncidentPage(
  session: SessionContext,
  filters: IncidentExportFilters = {},
  input: { page?: number; pageSize?: number } = {}
): Promise<IncidentPage> {
  assertIncidentAccess(session);
  const rawPageSize = input.pageSize ?? 25;
  const pageSize = Number.isFinite(rawPageSize) ? Math.min(Math.max(Math.floor(rawPageSize), 1), 50) : 25;
  const rawPage = input.page ?? 1;
  const requestedPage = Number.isFinite(rawPage) ? Math.max(Math.floor(rawPage), 1) : 1;
  const query = normalizedFilterText(filters.q);
  const status = filters.status && filters.status !== "ALL" ? filters.status : null;
  const severity = filters.severity && filters.severity !== "ALL" ? filters.severity : null;
  const incidentDate = filters.incidentDate?.trim() || null;
  const date = incidentDate ? parseDateOnlyUtc(incidentDate) : null;
  if (incidentDate && !date) throw new Error("INCIDENT_DATE_INVALID");
  const where: Prisma.OperationalIncidentWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId,
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
    ...(date ? { incidentDate: date } : {}),
    ...(query ? { OR: [
      { incidentNumber: { contains: query, mode: "insensitive" } },
      { title: { contains: query, mode: "insensitive" } },
      { summary: { contains: query, mode: "insensitive" } },
      { category: { contains: query, mode: "insensitive" } },
      { correctiveAction: { contains: query, mode: "insensitive" } },
      { evidenceReference: { contains: query, mode: "insensitive" } },
      { sourceRecordType: { contains: query, mode: "insensitive" } },
      { sourceRecordId: { contains: query, mode: "insensitive" } }
    ] } : {})
  };
  const totalItems = await prisma.operationalIncident.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.operationalIncident.findMany({
    where,
    include: { location: true },
    orderBy: [{ incidentDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize
  }) as OperationalIncidentWithLocation[];
  const actorIds = Array.from(new Set(rows.flatMap((row) => [row.reportedByUserId, row.ownerUserId].filter((id): id is string => Boolean(id)))));
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds }, tenantId: session.context.tenantId }, select: { id: true, displayName: true, email: true } }) : [];
  const names = userDisplayNameById(actors);
  const items = rows.map((incident) => ({
    id: incident.id,
    incidentNumber: incident.incidentNumber,
    incidentDate: incident.incidentDate.toISOString().slice(0, 10),
    category: incident.category,
    severity: incident.severity,
    status: incident.status,
    title: incident.title,
    summary: incident.summary,
    locationName: incident.location.name,
    reportedByName: incident.reportedByUserId ? names.get(incident.reportedByUserId) ?? "Unknown user" : null,
    hasReporter: Boolean(incident.reportedByUserId),
    reportedByCurrentUser: incident.reportedByUserId === session.user.id,
    ownerName: incident.ownerUserId ? names.get(incident.ownerUserId) ?? "Unknown user" : null,
    sourceRecordType: incident.sourceRecordType,
    sourceRecordId: incident.sourceRecordId,
    correctiveAction: incident.correctiveAction,
    evidenceReference: incident.evidenceReference,
    dueAt: dateOrNull(incident.dueAt),
    resolvedAt: dateOrNull(incident.resolvedAt)
  }));
  return { items, page, pageSize, totalItems, totalPages };
}

export async function getIncidentDashboard(
  session: SessionContext
): Promise<IncidentDashboard> {
  assertIncidentAccess(session);

  const where: Prisma.OperationalIncidentWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId
  };
  const incidents = await prisma.operationalIncident.findMany({
    where,
    include: {
      location: true
    },
    orderBy: [{ incidentDate: "desc" }, { severity: "desc" }]
  }) as OperationalIncidentWithLocation[];

  const actorIds = Array.from(
    new Set(
      incidents.flatMap((incident) =>
        [incident.reportedByUserId, incident.ownerUserId].filter(
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

  const todayDate = dateOnlyInTimeZone(new Date());
  const summaries = incidents.map((incident): OperationalIncidentSummary => ({
    id: incident.id,
    incidentNumber: incident.incidentNumber,
    incidentDate: incident.incidentDate.toISOString().slice(0, 10),
    category: incident.category,
    severity: incident.severity,
    status: incident.status,
    title: incident.title,
    summary: incident.summary,
    locationName: incident.location.name,
    reportedByName: incident.reportedByUserId
      ? actorNameById.get(incident.reportedByUserId) ?? "Unknown user"
      : null,
    hasReporter: Boolean(incident.reportedByUserId),
    reportedByCurrentUser: incident.reportedByUserId === session.user.id,
    ownerName: incident.ownerUserId
      ? actorNameById.get(incident.ownerUserId) ?? "Unknown user"
      : null,
    sourceRecordType: incident.sourceRecordType,
    sourceRecordId: incident.sourceRecordId,
    correctiveAction: incident.correctiveAction,
    evidenceReference: incident.evidenceReference,
    dueAt: dateOrNull(incident.dueAt),
    resolvedAt: dateOrNull(incident.resolvedAt)
  }));
  const statusCounts = summaries.reduce<IncidentStatusCounts>(
    (counts, incident) => {
      if (incident.status in counts) {
        counts[incident.status as keyof IncidentStatusCounts] += 1;
      }
      return counts;
    },
    {
      OPEN: 0,
      IN_PROGRESS: 0,
      PENDING_REVIEW: 0,
      RESOLVED: 0,
      CANCELLED: 0
    }
  );
  const severityCounts = summaries.reduce<IncidentSeverityCounts>(
    (counts, incident) => {
      if (incident.severity in counts) {
        counts[incident.severity as keyof IncidentSeverityCounts] += 1;
      }
      return counts;
    },
    {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0
    }
  );

  return {
    locationName: session.context.locationName,
    totalIncidents: summaries.length,
    openIncidents:
      statusCounts.OPEN + statusCounts.IN_PROGRESS + statusCounts.PENDING_REVIEW,
    criticalIncidents: severityCounts.CRITICAL,
    overdueIncidents: incidents.filter(
      (incident) =>
        incident.dueAt !== null &&
        incident.resolvedAt === null &&
        incident.status !== "CANCELLED" &&
        dateOrNull(incident.dueAt)! < todayDate
    ).length,
    statusCounts,
    severityCounts,
    incidents: summaries
  };
}

export async function getIncidentDashboardRead(
  session: SessionContext
): Promise<IncidentDashboardRead> {
  assertIncidentAccess(session);
  const where: Prisma.OperationalIncidentWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId
  };
  const todayDate = dateOnlyInTimeZone(new Date());
  const [statusRows, severityRows, totalIncidents, overdueIncidents, candidates] = await Promise.all([
    prisma.operationalIncident.groupBy({
      by: ["status"],
      where,
      _count: { _all: true }
    }),
    prisma.operationalIncident.groupBy({
      by: ["severity"],
      where,
      _count: { _all: true }
    }),
    prisma.operationalIncident.count({ where }),
    prisma.operationalIncident.count({
      where: {
        ...where,
        dueAt: { lt: new Date(`${todayDate}T00:00:00.000Z`) },
        resolvedAt: null,
        status: { not: "CANCELLED" }
      }
    }),
    prisma.operationalIncident.findMany({
      where: { ...where, status: { in: [...resolvableIncidentStatuses] } },
      orderBy: [{ severity: "desc" }, { incidentDate: "desc" }],
      take: 3,
      select: {
        id: true,
        incidentNumber: true,
        incidentDate: true,
        severity: true,
        status: true,
        title: true,
        ownerUserId: true,
        dueAt: true
      }
    })
  ]);
  const statusCounts: IncidentStatusCounts = {
    OPEN: 0,
    IN_PROGRESS: 0,
    PENDING_REVIEW: 0,
    RESOLVED: 0,
    CANCELLED: 0
  };
  for (const row of statusRows) {
    if (row.status in statusCounts) {
      statusCounts[row.status as keyof IncidentStatusCounts] = row._count._all;
    }
  }
  const severityCounts: IncidentSeverityCounts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0
  };
  for (const row of severityRows) {
    if (row.severity in severityCounts) {
      severityCounts[row.severity as keyof IncidentSeverityCounts] = row._count._all;
    }
  }
  const ownerIds = candidates.flatMap((candidate) =>
    candidate.ownerUserId ? [candidate.ownerUserId] : []
  );
  const owners = ownerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: ownerIds }, tenantId: session.context.tenantId },
        select: { id: true, displayName: true, email: true }
      })
    : [];
  const ownerNameById = userDisplayNameById(owners);

  return {
    totalIncidents,
    openIncidents: statusCounts.OPEN + statusCounts.IN_PROGRESS + statusCounts.PENDING_REVIEW,
    criticalIncidents: severityCounts.CRITICAL,
    overdueIncidents,
    statusCounts,
    severityCounts,
    followUpCandidates: candidates.map((candidate) => ({
      id: candidate.id,
      incidentNumber: candidate.incidentNumber,
      incidentDate: candidate.incidentDate.toISOString().slice(0, 10),
      severity: candidate.severity,
      status: candidate.status,
      title: candidate.title,
      ownerName: candidate.ownerUserId
        ? ownerNameById.get(candidate.ownerUserId) ?? "Unknown user"
        : null,
      dueAt: dateOrNull(candidate.dueAt)
    }))
  };
}

const incidentTaskPriorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

function incidentCreatedAfterWhere(cursor: DashboardTaskCursor) {
  const cursorDate = new Date(cursor.createdAt);
  const incidentRank = dashboardTaskSources.indexOf("INCIDENT");
  const cursorRank = dashboardTaskSources.indexOf(cursor.sourceType);
  return {
    OR: [
      { createdAt: { gt: cursorDate } },
      ...(incidentRank > cursorRank
        ? [{ createdAt: cursorDate }]
        : incidentRank === cursorRank
          ? [{ createdAt: cursorDate, id: { gt: cursor.recordId } }]
          : [])
    ]
  } satisfies Prisma.OperationalIncidentWhereInput;
}

function incidentTaskAfterWhere(
  severity: DashboardTaskPriority,
  cursor: DashboardTaskCursor | undefined
) {
  if (!cursor) return null;
  const severityRank = incidentTaskPriorities.indexOf(severity);
  const cursorRank = incidentTaskPriorities.indexOf(cursor.priority ?? "HIGH");
  if (severityRank < cursorRank) return false;
  if (severityRank > cursorRank) return null;

  const createdAfter = incidentCreatedAfterWhere(cursor);
  if (!cursor.dueAt) {
    return { dueAt: null, AND: [createdAfter] } satisfies Prisma.OperationalIncidentWhereInput;
  }
  const cursorDueAt = new Date(cursor.dueAt);
  return {
    OR: [
      { dueAt: null },
      { dueAt: { gt: cursorDueAt } },
      { dueAt: cursorDueAt, AND: [createdAfter] }
    ]
  } satisfies Prisma.OperationalIncidentWhereInput;
}

/** Returns one role-pooled, currently executable resolution obligation per incident. */
export async function listIncidentMyTaskPage(
  session: SessionContext,
  input: { after?: DashboardTaskCursor; take?: number } = {}
): Promise<IncidentMyTaskPage> {
  assertIncidentAccess(session);
  if (!session.permissionCodes.includes(permissions.incidentResolve)) {
    return { totalCount: 0, items: [], nextCursor: null };
  }
  const take = Math.min(Math.max(input.take ?? 25, 1), 50);
  const baseWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    brandId: session.context.brandId ?? null,
    locationId: session.context.locationId,
    status: { in: [...resolvableIncidentStatuses] },
    resolvedAt: null,
    OR: [
      { severity: { in: ["MEDIUM", "LOW"] } },
      {
        severity: { in: ["CRITICAL", "HIGH"] },
        reportedByUserId: { not: null },
        NOT: { reportedByUserId: session.user.id }
      }
    ]
  } satisfies Prisma.OperationalIncidentWhereInput;
  const select = {
    id: true,
    incidentNumber: true,
    status: true,
    severity: true,
    dueAt: true,
    createdAt: true
  } satisfies Prisma.OperationalIncidentSelect;
  const [totalCount, ...severityRows] = await Promise.all([
    prisma.operationalIncident.count({ where: baseWhere }),
    ...incidentTaskPriorities.map((severity) => {
      const afterWhere = incidentTaskAfterWhere(severity, input.after);
      if (afterWhere === false) return Promise.resolve([]);
      return prisma.operationalIncident.findMany({
        where: {
          ...baseWhere,
          severity,
          ...(afterWhere ? { AND: [afterWhere] } : {})
        },
        select,
        orderBy: [
          { dueAt: { sort: "asc", nulls: "last" } },
          { createdAt: "asc" },
          { id: "asc" }
        ],
        take: take + 1
      });
    })
  ]);
  const merged = severityRows
    .flat()
    .map((row) => ({
      taskId: `incident-${row.id}`,
      recordId: row.id,
      publicReference: row.incidentNumber,
      status: row.status,
      severity: row.severity as DashboardTaskPriority,
      priority: row.severity as DashboardTaskPriority,
      dueAt: row.dueAt?.toISOString() ?? null,
      actionLabel: "Resolve incident" as const,
      createdAt: row.createdAt.toISOString(),
      sourceType: "INCIDENT" as const
    }))
    .sort(compareDashboardTaskOrder);
  const items = merged.slice(0, take);
  const last = items.at(-1);
  return {
    totalCount,
    items,
    nextCursor: merged.length > take && last
      ? {
          priority: last.priority,
          dueAt: last.dueAt,
          createdAt: last.createdAt,
          sourceType: "INCIDENT",
          recordId: last.recordId
        }
      : null
  };
}

export async function getOperationalIncidentSummary(
  session: SessionContext,
  incidentId: string
) {
  const scopedTarget = await prisma.operationalIncident.findFirst({
    where: {
      id: incidentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: session.context.brandId ?? null,
      locationId: session.context.locationId
    },
    select: { id: true }
  });
  if (!scopedTarget) return null;
  const dashboard = await getIncidentDashboard(session);
  return dashboard.incidents.find((incident) => incident.id === incidentId) ?? null;
}

export async function createOperationalIncident(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.incidentCreate);
  assertIncidentCreateAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = createIncidentSchema.parse(Object.fromEntries(formData));
  const incidentDate = dateFromDateInput(values.incidentDate, "INCIDENT_DATE");
  const dueAt = values.dueAt ? dateFromDateInput(values.dueAt, "INCIDENT_DUE_DATE") : null;
  if (dueAt && dueAt < incidentDate) {
    throw new Error("INCIDENT_DUE_AT_BEFORE_INCIDENT_DATE");
  }
  const correctiveAction = values.correctiveAction || null;
  const evidenceReference = values.evidenceReference || null;
  const sourceRecordType = values.sourceRecordType || null;
  const sourceRecordId = values.sourceRecordId || null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const incident = await prisma.$transaction(async (tx) => {
        await assertIncidentSourceRecordVisible(
          tx,
          session,
          sourceRecordType,
          sourceRecordId
        );

        const created = await tx.operationalIncident.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            brandId: session.context.brandId || null,
            locationId: session.context.locationId,
            incidentNumber: await nextIncidentNumber(session.context.companyId),
            incidentDate,
            category: values.category,
            severity: values.severity,
            status: "OPEN",
            title: values.title,
            summary: values.summary,
            reportedByUserId: session.user.id,
            ownerUserId: session.user.id,
            sourceRecordType,
            sourceRecordId,
            correctiveAction,
            evidenceReference,
            dueAt
          }
        });

        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType: "operational_incident.created",
            entityType: "OperationalIncident",
            entityId: created.id,
            afterData: {
              incidentNumber: created.incidentNumber,
              status: created.status,
              severity: created.severity,
              category: created.category
            },
            metadata: {
              locationId: session.context.locationId,
              sourceRecordType,
              sourceRecordId,
              evidenceReference,
              boundary: "incident_create_only_no_source_mutation"
            }
          }
        });

        await recordOperationalStatusTransition(tx, session, {
          targetEntityType: "OperationalIncident",
          targetEntityId: created.id,
          action: "CREATE_OPEN",
          fromStatus: "NONE",
          toStatus: created.status,
          brandId: created.brandId,
          locationId: created.locationId,
          reason: created.summary,
          evidenceReference: created.evidenceReference
        });

        return created;
      });

      return incident.id;
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 5) {
        throw error;
      }
    }
  }

  throw new Error("INCIDENT_NUMBER_GENERATION_FAILED");
}

export async function resolveOperationalIncident(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.incidentResolve);
  assertIncidentResolveAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = resolveIncidentSchema.parse(Object.fromEntries(formData));
  const resolvedAt = dateFromDateInput(values.resolvedAt, "INCIDENT_RESOLVED_AT");
  const idempotencyKey = operationIdempotencyKey(
    values.incidentId,
    "RESOLVE",
    values.idempotencyKey,
    {
      resolvedAt: values.resolvedAt,
      correctiveAction: values.correctiveAction,
      evidenceReference: values.evidenceReference
    },
    session.user.id
  );

  const incident = await prisma.$transaction(async (tx) => {
    const current = await tx.operationalIncident.findFirst({
      where: {
        id: values.incidentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId ?? null,
        locationId: session.context.locationId
      }
    });

    if (!current) {
      throw new Error("INCIDENT_NOT_FOUND");
    }
    if (await hasRecordedIncidentOperation(tx, session, current.id, idempotencyKey)) {
      return current;
    }
    const transition = assertPhase2WorkflowTransitionAllowed({
      domain: "OPERATIONAL_INCIDENT",
      action: "RESOLVE",
      fromStatus: current.status,
      permissionCodes: session.permissionCodes,
      reason: values.correctiveAction,
      evidenceReference: values.evidenceReference
    });
    if (
      requiresPhase2IndependentReview({
        domain: "OPERATIONAL_INCIDENT",
        action: "RESOLVE",
        riskLevel: current.severity
      }) &&
      (!current.reportedByUserId || current.reportedByUserId === session.user.id)
    ) {
      throw new Error("INCIDENT_INDEPENDENT_REVIEW_REQUIRED");
    }
    if (resolvedAt < current.incidentDate) {
      throw new Error("INCIDENT_RESOLVED_AT_BEFORE_INCIDENT_DATE");
    }

    const result = await tx.operationalIncident.updateMany({
      where: {
        id: current.id,
        status: { in: [...resolvableIncidentStatuses] },
        resolvedAt: null
      },
      data: {
        status: transition.toStatus,
        resolvedAt,
        correctiveAction: values.correctiveAction,
        evidenceReference: values.evidenceReference,
        ownerUserId: session.user.id
      }
    });
    if (result.count !== 1) {
      throw new Error("INCIDENT_RESOLUTION_CONFLICT");
    }

    const updated = await tx.operationalIncident.findUniqueOrThrow({
      where: { id: current.id }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "operational_incident.resolved",
        entityType: "OperationalIncident",
        entityId: updated.id,
        beforeData: {
          status: current.status,
          resolvedAt: dateOrNull(current.resolvedAt),
          correctiveAction: current.correctiveAction,
          evidenceReference: current.evidenceReference
        },
        afterData: {
          status: updated.status,
          resolvedAt: dateOrNull(updated.resolvedAt),
          correctiveAction: updated.correctiveAction,
          evidenceReference: updated.evidenceReference
        },
        metadata: {
          locationId: updated.locationId,
          sourceRecordType: updated.sourceRecordType,
          sourceRecordId: updated.sourceRecordId,
          boundary: "incident_resolution_only_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "OperationalIncident",
      targetEntityId: updated.id,
      action: "RESOLVE",
      fromStatus: current.status,
      toStatus: updated.status,
      brandId: updated.brandId,
      locationId: updated.locationId,
      reason: values.correctiveAction,
      evidenceReference: values.evidenceReference,
      idempotencyKey,
      required: true
    });

    return updated;
  });

  return incident.id;
}

export async function cancelOperationalIncident(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.incidentResolve);
  assertIncidentResolveAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = cancelIncidentSchema.parse(Object.fromEntries(formData));
  const idempotencyKey = operationIdempotencyKey(
    values.incidentId,
    "CANCEL",
    values.idempotencyKey,
    { cancelReason: values.cancelReason },
    session.user.id
  );

  const incident = await prisma.$transaction(async (tx) => {
    const current = await tx.operationalIncident.findFirst({
      where: {
        id: values.incidentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId ?? null,
        locationId: session.context.locationId
      }
    });

    if (!current) {
      throw new Error("INCIDENT_NOT_FOUND");
    }
    if (await hasRecordedIncidentOperation(tx, session, current.id, idempotencyKey)) {
      return current;
    }
    if (!resolvableIncidentStatuses.includes(current.status as (typeof resolvableIncidentStatuses)[number])) {
      throw new Error("INCIDENT_STATUS_NOT_CANCELLABLE");
    }
    const transition = assertPhase2WorkflowTransitionAllowed({
      domain: "OPERATIONAL_INCIDENT",
      action: "CANCEL",
      fromStatus: current.status,
      permissionCodes: session.permissionCodes,
      reason: values.cancelReason
    });
    if (
      requiresPhase2IndependentReview({
        domain: "OPERATIONAL_INCIDENT",
        action: "CANCEL",
        riskLevel: current.severity
      }) &&
      (!current.reportedByUserId || current.reportedByUserId === session.user.id)
    ) {
      throw new Error("INCIDENT_INDEPENDENT_REVIEW_REQUIRED");
    }

    const result = await tx.operationalIncident.updateMany({
      where: {
        id: current.id,
        status: { in: [...resolvableIncidentStatuses] },
        resolvedAt: null
      },
      data: {
        status: transition.toStatus,
        correctiveAction: values.cancelReason,
        ownerUserId: session.user.id
      }
    });
    if (result.count !== 1) {
      throw new Error("INCIDENT_CANCELLATION_CONFLICT");
    }

    const updated = await tx.operationalIncident.findUniqueOrThrow({
      where: { id: current.id }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "operational_incident.cancelled",
        entityType: "OperationalIncident",
        entityId: updated.id,
        beforeData: {
          status: current.status,
          resolvedAt: dateOrNull(current.resolvedAt),
          correctiveAction: current.correctiveAction
        },
        afterData: {
          status: updated.status,
          correctiveAction: updated.correctiveAction
        },
        metadata: {
          locationId: updated.locationId,
          sourceRecordType: updated.sourceRecordType,
          sourceRecordId: updated.sourceRecordId,
          reason: values.cancelReason,
          boundary: "incident_cancellation_only_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "OperationalIncident",
      targetEntityId: updated.id,
      action: "CANCEL",
      fromStatus: current.status,
      toStatus: updated.status,
      brandId: updated.brandId,
      locationId: updated.locationId,
      reason: values.cancelReason,
      idempotencyKey,
      required: true
    });

    return updated;
  });

  return incident.id;
}

export async function correctOperationalIncident(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.incidentCreate);
  assertIncidentCreateAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = correctOperationalIncidentSchema.parse(
    Object.fromEntries(formData)
  );
  const incidentDate = dateFromDateInput(
    values.incidentDate,
    "INCIDENT_DATE"
  );
  const dueAt = values.dueAt
    ? dateFromDateInput(values.dueAt, "INCIDENT_DUE_DATE")
    : null;
  if (dueAt && dueAt < incidentDate) {
    throw new Error("INCIDENT_DUE_AT_BEFORE_INCIDENT_DATE");
  }
  const actionAt = new Date();
  const idempotencyKey = operationIdempotencyKey(
    values.incidentId,
    "DETAIL_CORRECTION",
    values.idempotencyKey,
    {
      incidentDate: values.incidentDate,
      category: values.category,
      severity: values.severity,
      title: values.title,
      summary: values.summary,
      correctiveAction: values.correctiveAction,
      evidenceReference: values.evidenceReference,
      dueAt: values.dueAt,
      correctionReason: values.correctionReason,
      correctionEvidenceReference: values.correctionEvidenceReference
    },
    session.user.id
  );

  const incident = await prisma.$transaction(async (tx) => {
    const current = await tx.operationalIncident.findFirst({
      where: {
        id: values.incidentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId ?? null,
        locationId: session.context.locationId
      }
    });

    if (!current) {
      throw new Error("INCIDENT_NOT_FOUND");
    }
    if (await hasRecordedIncidentOperation(tx, session, current.id, idempotencyKey)) {
      return current;
    }
    if (!correctableIncidentStatuses.includes(current.status as (typeof correctableIncidentStatuses)[number])) {
      throw new Error("INCIDENT_STATUS_NOT_CORRECTABLE");
    }
    const transition = assertPhase2WorkflowTransitionAllowed({
      domain: "OPERATIONAL_INCIDENT",
      action: "DETAIL_CORRECTION",
      fromStatus: current.status,
      permissionCodes: session.permissionCodes,
      reason: values.correctionReason,
      evidenceReference: values.correctionEvidenceReference ?? null
    });

    const result = await tx.operationalIncident.updateMany({
      where: {
        id: current.id,
        status: { in: [...correctableIncidentStatuses] },
        resolvedAt: null
      },
      data: {
        status: transition.toStatus,
        incidentDate,
        category: values.category,
        severity: values.severity,
        title: values.title,
        summary: values.summary,
        correctiveAction: values.correctiveAction || null,
        evidenceReference: values.evidenceReference || null,
        dueAt,
        ownerUserId: session.user.id
      }
    });
    if (result.count !== 1) {
      throw new Error("INCIDENT_CORRECTION_CONFLICT");
    }

    const updated = await tx.operationalIncident.findUniqueOrThrow({
      where: { id: current.id }
    });
    const txAny = tx as Prisma.TransactionClient & Record<string, any>;
    await txAny.operationalCorrectionRecord?.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: updated.brandId,
        locationId: updated.locationId,
        targetEntityType: "OperationalIncident",
        targetEntityId: updated.id,
        correctionType: "DETAIL_CORRECTION",
        status: "APPLIED",
        requestedByUserId: session.user.id,
        appliedByUserId: session.user.id,
        appliedAt: actionAt,
        reason: values.correctionReason,
        evidenceReference: values.correctionEvidenceReference || null,
        idempotencyKey
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "operational_incident.corrected",
        entityType: "OperationalIncident",
        entityId: updated.id,
        beforeData: {
          status: current.status,
          incidentDate: dateOrNull(current.incidentDate),
          category: current.category,
          severity: current.severity,
          title: current.title,
          summary: current.summary,
          correctiveAction: current.correctiveAction,
          evidenceReference: current.evidenceReference,
          dueAt: dateOrNull(current.dueAt)
        },
        afterData: {
          status: updated.status,
          incidentDate: dateOrNull(updated.incidentDate),
          category: updated.category,
          severity: updated.severity,
          title: updated.title,
          summary: updated.summary,
          correctiveAction: updated.correctiveAction,
          evidenceReference: updated.evidenceReference,
          dueAt: dateOrNull(updated.dueAt)
        },
        metadata: {
          locationId: updated.locationId,
          sourceRecordType: updated.sourceRecordType,
          sourceRecordId: updated.sourceRecordId,
          reason: values.correctionReason,
          evidenceReference: values.correctionEvidenceReference || null,
          boundary: "incident_detail_correction_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "OperationalIncident",
      targetEntityId: updated.id,
      action: "DETAIL_CORRECTION",
      fromStatus: current.status,
      toStatus: updated.status,
      brandId: updated.brandId,
      locationId: updated.locationId,
      reason: values.correctionReason,
      evidenceReference: values.correctionEvidenceReference || null,
      idempotencyKey,
      required: true
    });

    return updated;
  });

  return incident.id;
}

export async function buildIncidentExportRows(
  session: SessionContext,
  filters: IncidentExportFilters = {}
) {
  const dashboard = await getIncidentDashboard(session);
  const incidents = filterIncidents(dashboard.incidents, filters);
  return [
    [
      "Location",
      "Incident Number",
      "Incident Date",
      "Category",
      "Severity",
      "Status",
      "Reported By",
      "Owner",
      "Title",
      "Summary",
      "Source Record Type",
      "Source Record ID",
      "Corrective Action",
      "Due At",
      "Resolved At",
      "Open Count",
      "In Progress Count",
      "Pending Review Count",
      "Resolved Count",
      "Cancelled Count",
      "Critical Count",
      "High Count",
      "Evidence Reference"
    ],
    ...incidents.map((incident) => [
      incident.locationName,
      incident.incidentNumber,
      incident.incidentDate,
      incident.category,
      incident.severity,
      incident.status,
      incident.reportedByName ?? "",
      incident.ownerName ?? "",
      incident.title,
      incident.summary,
      incident.sourceRecordType ?? "",
      incident.sourceRecordId ?? "",
      incident.correctiveAction ?? "",
      incident.dueAt ?? "",
      incident.resolvedAt ?? "",
      dashboard.statusCounts.OPEN,
      dashboard.statusCounts.IN_PROGRESS,
      dashboard.statusCounts.PENDING_REVIEW,
      dashboard.statusCounts.RESOLVED,
      dashboard.statusCounts.CANCELLED,
      dashboard.severityCounts.CRITICAL,
      dashboard.severityCounts.HIGH,
      incident.evidenceReference ?? ""
    ])
  ];
}
