import { createHash } from "node:crypto";
import { prisma, type Prisma } from "@ogfi/database";
import { z } from "zod";
import {
  assertPermissionAllowed,
  canUseMaintenance,
  permissions,
  requirePermission
} from "./authorization";
import {
  assertAuthorizedLocation,
  requireSessionContext,
  type SessionContext
} from "./context";
import {
  compareDashboardTaskOrder,
  dashboardTaskSources,
  type DashboardTaskCursor,
  type DashboardTaskPriority
} from "./dashboardTasks";
import { recordOperationalStatusTransition } from "./operationalWorkflow";
import {
  assertPhase2WorkflowTransitionAllowed,
  requiresPhase2IndependentReview
} from "./phase2WorkflowPolicy";
import { dateOnlyInTimeZone, parseDateOnlyUtc } from "./projectDates";

type MaintenanceTicketWithLocation = Prisma.MaintenanceTicketGetPayload<{
  include: {
    location: true;
  };
}>;

const maintenanceTicketInclude = {
  location: true
} satisfies Prisma.MaintenanceTicketInclude;

const maintenanceCategories = [
  "EQUIPMENT",
  "FACILITY",
  "UTILITIES",
  "CLEANING",
  "SAFETY",
  "OTHER"
] as const;

const maintenancePriorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const completableMaintenanceStatuses = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING_VENDOR"
] as const;

const createMaintenanceTicketSchema = z.object({
  requestedAt: z.string().min(1),
  category: z.enum(maintenanceCategories),
  assetName: z.string().trim().min(2).max(160),
  assetArea: z.string().trim().min(2).max(120),
  priority: z.enum(maintenancePriorities),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(2000),
  downtimeMinutes: z.coerce.number().int().min(0).max(10080).optional(),
  targetDueAt: z.string().optional(),
  correctiveAction: z.string().trim().max(2000).optional(),
  evidenceReference: z.string().trim().max(255).optional(),
  sourceIncidentId: z.string().trim().uuid().or(z.literal("")).optional()
});

const completeMaintenanceTicketSchema = z.object({
  ticketId: z.string().uuid(),
  completedAt: z.string().min(1),
  downtimeMinutes: z.coerce.number().int().min(0).max(10080).optional(),
  correctiveAction: z.string().trim().min(10).max(2000),
  evidenceReference: z.string().trim().min(3).max(255),
  idempotencyKey: z.string().trim().min(1).max(255).optional()
});

const cancelMaintenanceTicketSchema = z.object({
  ticketId: z.string().uuid(),
  cancelReason: z.string().trim().min(10).max(1000),
  idempotencyKey: z.string().trim().min(1).max(255).optional()
});

const correctableMaintenanceStatuses = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING_VENDOR"
] as const;

const correctMaintenanceTicketSchema = z.object({
  ticketId: z.string().uuid(),
  requestedAt: z.string().min(1),
  category: z.enum(maintenanceCategories),
  assetName: z.string().trim().min(2).max(160),
  assetArea: z.string().trim().min(2).max(120),
  priority: z.enum(maintenancePriorities),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(2000),
  downtimeMinutes: z.coerce.number().int().min(0).max(10080).optional(),
  targetDueAt: z.string().optional(),
  correctiveAction: z.string().trim().max(2000).optional(),
  evidenceReference: z.string().trim().max(255).optional(),
  correctionReason: z.string().trim().min(10).max(1000),
  correctionEvidenceReference: z.string().trim().max(255).optional(),
  idempotencyKey: z.string().trim().min(1).max(255).optional()
});

export type MaintenanceTicketSummary = {
  id: string;
  ticketNumber: string;
  requestedAt: string;
  category: string;
  assetName: string;
  assetArea: string;
  priority: string;
  status: string;
  title: string;
  description: string;
  locationName: string;
  reportedByName: string | null;
  hasReporter: boolean;
  reportedByCurrentUser: boolean;
  ownerName: string | null;
  sourceIncidentId: string | null;
  downtimeMinutes: number | null;
  targetDueAt: string | null;
  completedAt: string | null;
  correctiveAction: string | null;
  evidenceReference: string | null;
};

export type MaintenanceTicketDetail = MaintenanceTicketSummary & {
  history: MaintenanceTicketSummary[];
};

export type MaintenanceMyTaskPage = {
  totalCount: number;
  items: Array<{
    taskId: string;
    recordId: string;
    publicReference: string;
    status: string;
    priority: DashboardTaskPriority;
    dueAt: string | null;
    actionLabel: "Complete maintenance ticket";
    createdAt: string;
  }>;
  nextCursor: DashboardTaskCursor | null;
};

export type MaintenanceStatusCounts = Record<
  "OPEN" | "IN_PROGRESS" | "PENDING_VENDOR" | "COMPLETED" | "CANCELLED",
  number
>;

export type MaintenancePriorityCounts = Record<
  "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  number
>;

export type MaintenanceDashboard = {
  locationName: string;
  totalTickets: number;
  openTickets: number;
  criticalTickets: number;
  overdueTickets: number;
  downtimeMinutes: number;
  statusCounts: MaintenanceStatusCounts;
  priorityCounts: MaintenancePriorityCounts;
  tickets: MaintenanceTicketSummary[];
};

export type MaintenanceDashboardCandidate = {
  id: string;
  ticketNumber: string;
  requestedAt: string;
  priority: string;
  status: string;
  assetName: string;
  ownerName: string | null;
  targetDueAt: string | null;
};

export type MaintenanceDashboardRead = {
  totalTickets: number;
  openTickets: number;
  criticalTickets: number;
  overdueTickets: number;
  downtimeMinutes: number;
  statusCounts: MaintenanceStatusCounts;
  priorityCounts: MaintenancePriorityCounts;
  followUpCandidates: MaintenanceDashboardCandidate[];
};

export type MaintenanceExportFilters = {
  q?: string;
  status?: string;
  priority?: string;
  requestedAt?: string;
};

export type MaintenanceTicketPage = {
  items: MaintenanceTicketSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

function assertMaintenanceAccess(session: SessionContext) {
  if (!canUseMaintenance(session.permissionCodes)) {
    assertPermissionAllowed(session.permissionCodes, permissions.maintenanceView);
  }
}

function assertMaintenanceCreateAccess(session: SessionContext) {
  assertPermissionAllowed(session.permissionCodes, permissions.maintenanceCreate);
}

function assertMaintenanceCompleteAccess(session: SessionContext) {
  assertPermissionAllowed(session.permissionCodes, permissions.maintenanceComplete);
}

function assertMaintenanceCorrectAccess(session: SessionContext) {
  assertPermissionAllowed(session.permissionCodes, permissions.maintenanceCorrect);
}

async function assertSourceIncidentVisible(
  tx: Prisma.TransactionClient,
  session: SessionContext,
  sourceIncidentId: string | null
) {
  if (!sourceIncidentId) {
    return;
  }

  assertPermissionAllowed(session.permissionCodes, permissions.incidentView);

  const sourceIncident = await tx.operationalIncident.findFirst({
    where: {
      id: sourceIncidentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: session.context.brandId ?? null,
      locationId: session.context.locationId
    }
  });

  if (!sourceIncident) {
    throw new Error("MAINTENANCE_SOURCE_INCIDENT_NOT_FOUND_OR_UNSCOPED");
  }
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
  ticketId: string,
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
  return `MaintenanceTicket:${ticketId}:${action}:${digest}`;
}

async function hasRecordedMaintenanceOperation(
  tx: Prisma.TransactionClient,
  session: SessionContext,
  ticketId: string,
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
        targetEntityType: "MaintenanceTicket",
        targetEntityId: ticketId,
        idempotencyKey
      }
    })
  );
}

async function nextMaintenanceTicketNumber(companyId: string) {
  const year = new Date().getUTCFullYear();
  const count = await prisma.maintenanceTicket.count({
    where: {
      companyId,
      ticketNumber: { startsWith: `MT-${year}-` }
    }
  });
  return `MT-${year}-${String(count + 1).padStart(5, "0")}`;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function summarizeMaintenanceTicket(
  ticket: MaintenanceTicketWithLocation,
  actorNameById: Map<string, string>,
  currentUserId: string
): MaintenanceTicketSummary {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    requestedAt: ticket.requestedAt.toISOString().slice(0, 10),
    category: ticket.category,
    assetName: ticket.assetName,
    assetArea: ticket.assetArea,
    priority: ticket.priority,
    status: ticket.status,
    title: ticket.title,
    description: ticket.description,
    locationName: ticket.location.name,
    reportedByName: ticket.reportedByUserId
      ? actorNameById.get(ticket.reportedByUserId) ?? "Unknown user"
      : null,
    hasReporter: Boolean(ticket.reportedByUserId),
    reportedByCurrentUser: ticket.reportedByUserId === currentUserId,
    ownerName: ticket.ownerUserId
      ? actorNameById.get(ticket.ownerUserId) ?? "Unknown user"
      : null,
    sourceIncidentId: ticket.sourceIncidentId,
    downtimeMinutes: ticket.downtimeMinutes,
    targetDueAt: dateOrNull(ticket.targetDueAt),
    completedAt: dateOrNull(ticket.completedAt),
    correctiveAction: ticket.correctiveAction,
    evidenceReference: ticket.evidenceReference
  };
}

function normalizedFilterText(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function userDisplayNameById(
  users: Array<{ id: string; displayName: string; email: string }>
) {
  return new Map(users.map((user) => [user.id, user.displayName || user.email]));
}

export function filterMaintenanceTickets(
  tickets: MaintenanceTicketSummary[],
  filters: MaintenanceExportFilters = {}
) {
  const query = normalizedFilterText(filters.q);
  const status = filters.status && filters.status !== "ALL" ? filters.status : null;
  const priority =
    filters.priority && filters.priority !== "ALL" ? filters.priority : null;
  const requestedAt = filters.requestedAt?.trim() || null;

  return tickets.filter((ticket) => {
    const matchesSearch =
      query.length === 0 ||
      [
        ticket.ticketNumber,
        ticket.title,
        ticket.description,
        ticket.category,
        ticket.assetName,
        ticket.assetArea,
        ticket.reportedByName ?? "",
        ticket.ownerName ?? "",
        ticket.correctiveAction ?? "",
        ticket.evidenceReference ?? "",
        ticket.sourceIncidentId ?? ""
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesStatus = status === null || ticket.status === status;
    const matchesPriority = priority === null || ticket.priority === priority;
    const matchesRequestedAt =
      requestedAt === null || ticket.requestedAt === requestedAt;
    return matchesSearch && matchesStatus && matchesPriority && matchesRequestedAt;
  });
}

export async function listMaintenanceTicketPage(
  session: SessionContext,
  filters: MaintenanceExportFilters = {},
  input: { page?: number; pageSize?: number } = {}
): Promise<MaintenanceTicketPage> {
  assertMaintenanceAccess(session);
  const rawPageSize = input.pageSize ?? 25;
  const pageSize = Number.isFinite(rawPageSize) ? Math.min(Math.max(Math.floor(rawPageSize), 1), 50) : 25;
  const rawPage = input.page ?? 1;
  const requestedPage = Number.isFinite(rawPage) ? Math.max(Math.floor(rawPage), 1) : 1;
  const query = normalizedFilterText(filters.q);
  const status = filters.status && filters.status !== "ALL" ? filters.status : null;
  const priority = filters.priority && filters.priority !== "ALL" ? filters.priority : null;
  const requestedAt = filters.requestedAt?.trim() || null;
  const date = requestedAt ? parseDateOnlyUtc(requestedAt) : null;
  if (requestedAt && !date) throw new Error("MAINTENANCE_REQUESTED_AT_INVALID");
  const sourceIncidentFilter = /^[0-9a-f-]{36}$/i.test(query) ? [{ sourceIncidentId: query }] : [];
  const actorMatches = query
    ? await prisma.user.findMany({
        where: { tenantId: session.context.tenantId, OR: [
          { displayName: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } }
        ] },
        select: { id: true }
      })
    : [];
  const where: Prisma.MaintenanceTicketWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    brandId: session.context.brandId ?? null,
    locationId: session.context.locationId,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(date ? { requestedAt: date } : {}),
    ...(query ? { OR: [
      { ticketNumber: { contains: query, mode: "insensitive" } },
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { category: { contains: query, mode: "insensitive" } },
      { assetName: { contains: query, mode: "insensitive" } },
      { assetArea: { contains: query, mode: "insensitive" } },
      { correctiveAction: { contains: query, mode: "insensitive" } },
      { evidenceReference: { contains: query, mode: "insensitive" } },
      ...sourceIncidentFilter,
      { reportedByUserId: { in: actorMatches.map((row) => row.id) } },
      { ownerUserId: { in: actorMatches.map((row) => row.id) } }
    ] } : {})
  };
  const totalItems = await prisma.maintenanceTicket.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.maintenanceTicket.findMany({
    where,
    include: { location: true },
    orderBy: [{ requestedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize
  }) as MaintenanceTicketWithLocation[];
  const actorIds = Array.from(new Set(rows.flatMap((row) => [row.reportedByUserId, row.ownerUserId].filter((id): id is string => Boolean(id)))));
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds }, tenantId: session.context.tenantId }, select: { id: true, displayName: true, email: true } }) : [];
  const names = userDisplayNameById(actors);
  const items = rows.map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    requestedAt: ticket.requestedAt.toISOString().slice(0, 10),
    category: ticket.category,
    assetName: ticket.assetName,
    assetArea: ticket.assetArea,
    priority: ticket.priority,
    status: ticket.status,
    title: ticket.title,
    description: ticket.description,
    locationName: ticket.location.name,
    reportedByName: ticket.reportedByUserId ? names.get(ticket.reportedByUserId) ?? "Unknown user" : null,
    hasReporter: Boolean(ticket.reportedByUserId),
    reportedByCurrentUser: ticket.reportedByUserId === session.user.id,
    ownerName: ticket.ownerUserId ? names.get(ticket.ownerUserId) ?? "Unknown user" : null,
    sourceIncidentId: ticket.sourceIncidentId,
    downtimeMinutes: ticket.downtimeMinutes,
    targetDueAt: dateOrNull(ticket.targetDueAt),
    completedAt: dateOrNull(ticket.completedAt),
    correctiveAction: ticket.correctiveAction,
    evidenceReference: ticket.evidenceReference
  }));
  return { items, page, pageSize, totalItems, totalPages };
}

export async function getMaintenanceDashboard(
  session: SessionContext
): Promise<MaintenanceDashboard> {
  assertMaintenanceAccess(session);

  const where: Prisma.MaintenanceTicketWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    brandId: session.context.brandId ?? null,
    locationId: session.context.locationId
  };
  const tickets = await prisma.maintenanceTicket.findMany({
    where,
    include: maintenanceTicketInclude,
    orderBy: [{ requestedAt: "desc" }, { priority: "desc" }]
  }) as MaintenanceTicketWithLocation[];

  const actorIds = Array.from(
    new Set(
      tickets.flatMap((ticket) =>
        [ticket.reportedByUserId, ticket.ownerUserId].filter(
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
  const summaries = tickets.map((ticket) =>
    summarizeMaintenanceTicket(ticket, actorNameById, session.user.id)
  );
  const statusCounts = summaries.reduce<MaintenanceStatusCounts>(
    (counts, ticket) => {
      if (ticket.status in counts) {
        counts[ticket.status as keyof MaintenanceStatusCounts] += 1;
      }
      return counts;
    },
    {
      OPEN: 0,
      IN_PROGRESS: 0,
      PENDING_VENDOR: 0,
      COMPLETED: 0,
      CANCELLED: 0
    }
  );
  const priorityCounts = summaries.reduce<MaintenancePriorityCounts>(
    (counts, ticket) => {
      if (ticket.priority in counts) {
        counts[ticket.priority as keyof MaintenancePriorityCounts] += 1;
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
    totalTickets: summaries.length,
    openTickets:
      statusCounts.OPEN + statusCounts.IN_PROGRESS + statusCounts.PENDING_VENDOR,
    criticalTickets: priorityCounts.CRITICAL,
    overdueTickets: tickets.filter(
      (ticket) =>
        ticket.targetDueAt !== null &&
        ticket.completedAt === null &&
        dateOrNull(ticket.targetDueAt)! < todayDate
    ).length,
    downtimeMinutes: tickets.reduce(
      (total, ticket) => total + (ticket.downtimeMinutes ?? 0),
      0
    ),
    statusCounts,
    priorityCounts,
    tickets: summaries
  };
}

export async function getMaintenanceDashboardRead(
  session: SessionContext
): Promise<MaintenanceDashboardRead> {
  assertMaintenanceAccess(session);
  const where: Prisma.MaintenanceTicketWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    brandId: session.context.brandId ?? null,
    locationId: session.context.locationId
  };
  const todayDate = dateOnlyInTimeZone(new Date());
  const [summary, statusRows, priorityRows, totalTickets, overdueTickets, candidates] = await Promise.all([
    prisma.maintenanceTicket.aggregate({ where, _sum: { downtimeMinutes: true } }),
    prisma.maintenanceTicket.groupBy({
      by: ["status"],
      where,
      _count: { _all: true }
    }),
    prisma.maintenanceTicket.groupBy({
      by: ["priority"],
      where,
      _count: { _all: true }
    }),
    prisma.maintenanceTicket.count({ where }),
    prisma.maintenanceTicket.count({
      where: {
        ...where,
        targetDueAt: { lt: new Date(`${todayDate}T00:00:00.000Z`) },
        completedAt: null
      }
    }),
    prisma.maintenanceTicket.findMany({
      where: { ...where, status: { in: ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"] } },
      orderBy: [{ priority: "desc" }, { requestedAt: "desc" }],
      take: 3,
      select: {
        id: true,
        ticketNumber: true,
        requestedAt: true,
        priority: true,
        status: true,
        assetName: true,
        ownerUserId: true,
        targetDueAt: true
      }
    })
  ]);
  const statusCounts: MaintenanceStatusCounts = {
    OPEN: 0,
    IN_PROGRESS: 0,
    PENDING_VENDOR: 0,
    COMPLETED: 0,
    CANCELLED: 0
  };
  for (const row of statusRows) {
    if (row.status in statusCounts) {
      statusCounts[row.status as keyof MaintenanceStatusCounts] = row._count._all;
    }
  }
  const priorityCounts: MaintenancePriorityCounts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0
  };
  for (const row of priorityRows) {
    if (row.priority in priorityCounts) {
      priorityCounts[row.priority as keyof MaintenancePriorityCounts] = row._count._all;
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
    totalTickets,
    openTickets: statusCounts.OPEN + statusCounts.IN_PROGRESS + statusCounts.PENDING_VENDOR,
    criticalTickets: priorityCounts.CRITICAL,
    overdueTickets,
    downtimeMinutes: summary._sum.downtimeMinutes ?? 0,
    statusCounts,
    priorityCounts,
    followUpCandidates: candidates.map((candidate) => ({
      id: candidate.id,
      ticketNumber: candidate.ticketNumber,
      requestedAt: candidate.requestedAt.toISOString().slice(0, 10),
      priority: candidate.priority,
      status: candidate.status,
      assetName: candidate.assetName,
      ownerName: candidate.ownerUserId
        ? ownerNameById.get(candidate.ownerUserId) ?? "Unknown user"
        : null,
      targetDueAt: dateOrNull(candidate.targetDueAt)
    }))
  };
}

const maintenanceTaskPriorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

function maintenanceCreatedAfterWhere(cursor: DashboardTaskCursor) {
  const cursorDate = new Date(cursor.createdAt);
  const maintenanceRank = dashboardTaskSources.indexOf("MAINTENANCE");
  const cursorRank = dashboardTaskSources.indexOf(cursor.sourceType);
  return {
    OR: [
      { createdAt: { gt: cursorDate } },
      ...(maintenanceRank > cursorRank
        ? [{ createdAt: cursorDate }]
        : maintenanceRank === cursorRank
          ? [{ createdAt: cursorDate, id: { gt: cursor.recordId } }]
          : [])
    ]
  } satisfies Prisma.MaintenanceTicketWhereInput;
}

function maintenanceTaskAfterWhere(
  priority: DashboardTaskPriority,
  cursor: DashboardTaskCursor | undefined
) {
  if (!cursor) return null;
  const priorityRank = maintenanceTaskPriorities.indexOf(priority);
  const cursorRank = maintenanceTaskPriorities.indexOf(cursor.priority ?? "HIGH");
  if (priorityRank < cursorRank) return false;
  if (priorityRank > cursorRank) return null;

  const createdAfter = maintenanceCreatedAfterWhere(cursor);
  if (!cursor.dueAt) {
    return {
      targetDueAt: null,
      AND: [createdAfter]
    } satisfies Prisma.MaintenanceTicketWhereInput;
  }
  const cursorDueAt = new Date(cursor.dueAt);
  return {
    OR: [
      { targetDueAt: null },
      { targetDueAt: { gt: cursorDueAt } },
      { targetDueAt: cursorDueAt, AND: [createdAfter] }
    ]
  } satisfies Prisma.MaintenanceTicketWhereInput;
}

/** Returns one role-pooled, currently executable completion obligation per ticket. */
export async function listMaintenanceMyTaskPage(
  session: SessionContext,
  input: { after?: DashboardTaskCursor; take?: number } = {}
): Promise<MaintenanceMyTaskPage> {
  assertMaintenanceAccess(session);
  if (!session.permissionCodes.includes(permissions.maintenanceComplete)) {
    return { totalCount: 0, items: [], nextCursor: null };
  }
  const take = Math.min(Math.max(input.take ?? 25, 1), 50);
  const baseWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    brandId: session.context.brandId ?? null,
    locationId: session.context.locationId,
    status: { in: [...completableMaintenanceStatuses] },
    completedAt: null,
    OR: [
      { priority: { in: ["MEDIUM", "LOW"] } },
      {
        priority: { in: ["CRITICAL", "HIGH"] },
        reportedByUserId: { not: null },
        NOT: { reportedByUserId: session.user.id }
      }
    ]
  } satisfies Prisma.MaintenanceTicketWhereInput;
  const select = {
    id: true,
    ticketNumber: true,
    status: true,
    priority: true,
    targetDueAt: true,
    createdAt: true
  } satisfies Prisma.MaintenanceTicketSelect;
  const [totalCount, ...priorityRows] = await Promise.all([
    prisma.maintenanceTicket.count({ where: baseWhere }),
    ...maintenanceTaskPriorities.map((priority) => {
      const afterWhere = maintenanceTaskAfterWhere(priority, input.after);
      if (afterWhere === false) return Promise.resolve([]);
      return prisma.maintenanceTicket.findMany({
        where: {
          ...baseWhere,
          priority,
          ...(afterWhere ? { AND: [afterWhere] } : {})
        },
        select,
        orderBy: [
          { targetDueAt: { sort: "asc", nulls: "last" } },
          { createdAt: "asc" },
          { id: "asc" }
        ],
        take: take + 1
      });
    })
  ]);
  const merged = priorityRows
    .flat()
    .map((row) => ({
      taskId: `maintenance-${row.id}`,
      recordId: row.id,
      publicReference: row.ticketNumber,
      status: row.status,
      priority: row.priority as DashboardTaskPriority,
      dueAt: row.targetDueAt?.toISOString() ?? null,
      actionLabel: "Complete maintenance ticket" as const,
      createdAt: row.createdAt.toISOString(),
      sourceType: "MAINTENANCE" as const
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
          sourceType: "MAINTENANCE",
          recordId: last.recordId
        }
      : null
  };
}

export async function getMaintenanceTicketSummary(
  session: SessionContext,
  ticketId: string
) {
  const ticket = await getMaintenanceTicketDetail(session, ticketId);
  if (!ticket) {
    return null;
  }
  const { history: _history, ...summary } = ticket;
  return summary;
}

export async function getMaintenanceTicketDetail(
  session: SessionContext,
  ticketId: string
): Promise<MaintenanceTicketDetail | null> {
  assertMaintenanceAccess(session);

  const current = await prisma.maintenanceTicket.findFirst({
    where: {
      id: ticketId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: session.context.brandId ?? null,
      locationId: session.context.locationId
    },
    include: maintenanceTicketInclude
  }) as MaintenanceTicketWithLocation | null;

  if (!current) {
    return null;
  }

  const history = await prisma.maintenanceTicket.findMany({
    where: {
      tenantId: current.tenantId,
      companyId: current.companyId,
      brandId: current.brandId,
      locationId: current.locationId,
      assetName: current.assetName,
      assetArea: current.assetArea,
      id: { not: current.id },
      requestedAt: { lt: current.requestedAt }
    },
    include: maintenanceTicketInclude,
    orderBy: [{ requestedAt: "desc" }, { ticketNumber: "desc" }],
    take: 6
  }) as MaintenanceTicketWithLocation[];

  const actorIds = Array.from(
    new Set(
      [current, ...history].flatMap((ticket) =>
        [ticket.reportedByUserId, ticket.ownerUserId].filter(
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

  return {
    ...summarizeMaintenanceTicket(current, actorNameById, session.user.id),
    history: history.map((ticket) =>
      summarizeMaintenanceTicket(ticket, actorNameById, session.user.id)
    )
  };
}

export async function createMaintenanceTicket(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.maintenanceCreate);
  assertMaintenanceCreateAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = createMaintenanceTicketSchema.parse(Object.fromEntries(formData));
  const requestedAt = dateFromDateInput(values.requestedAt, "MAINTENANCE_REQUESTED_AT");
  const targetDueAt = values.targetDueAt
    ? dateFromDateInput(values.targetDueAt, "MAINTENANCE_TARGET_DUE_AT")
    : null;
  if (targetDueAt && targetDueAt < requestedAt) {
    throw new Error("MAINTENANCE_TARGET_DUE_AT_BEFORE_REQUESTED_AT");
  }
  const correctiveAction = values.correctiveAction || null;
  const evidenceReference = values.evidenceReference || null;
  const sourceIncidentId = values.sourceIncidentId || null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const ticket = await prisma.$transaction(async (tx) => {
        await assertSourceIncidentVisible(tx, session, sourceIncidentId);

        const created = await tx.maintenanceTicket.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            brandId: session.context.brandId || null,
            locationId: session.context.locationId,
            ticketNumber: await nextMaintenanceTicketNumber(session.context.companyId),
            requestedAt,
            category: values.category,
            assetName: values.assetName,
            assetArea: values.assetArea,
            priority: values.priority,
            status: "OPEN",
            title: values.title,
            description: values.description,
            reportedByUserId: session.user.id,
            ownerUserId: session.user.id,
            sourceIncidentId,
            downtimeMinutes: values.downtimeMinutes ?? 0,
            targetDueAt,
            correctiveAction,
            evidenceReference
          }
        });

        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType: "maintenance_ticket.created",
            entityType: "MaintenanceTicket",
            entityId: created.id,
            afterData: {
              ticketNumber: created.ticketNumber,
              status: created.status,
              priority: created.priority,
              category: created.category
            },
            metadata: {
              locationId: created.locationId,
              sourceIncidentId,
              boundary: "maintenance_create_only_no_source_mutation"
            }
          }
        });

        await recordOperationalStatusTransition(tx, session, {
          targetEntityType: "MaintenanceTicket",
          targetEntityId: created.id,
          action: "CREATE_OPEN",
          fromStatus: "NONE",
          toStatus: created.status,
          brandId: created.brandId,
          locationId: created.locationId,
          reason: created.description,
          evidenceReference: created.evidenceReference
        });

        return created;
      });
      return ticket.id;
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < 5) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("MAINTENANCE_TICKET_NUMBER_RETRY_EXHAUSTED");
}

export async function completeMaintenanceTicket(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.maintenanceComplete);
  assertMaintenanceCompleteAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = completeMaintenanceTicketSchema.parse(Object.fromEntries(formData));
  const completedAt = dateFromDateInput(
    values.completedAt,
    "MAINTENANCE_COMPLETED_AT"
  );
  const idempotencyKey = operationIdempotencyKey(
    values.ticketId,
    "COMPLETE",
    values.idempotencyKey,
    {
      completedAt: values.completedAt,
      downtimeMinutes: values.downtimeMinutes,
      correctiveAction: values.correctiveAction,
      evidenceReference: values.evidenceReference
    },
    session.user.id
  );

  const ticket = await prisma.$transaction(async (tx) => {
    const current = await tx.maintenanceTicket.findFirst({
      where: {
        id: values.ticketId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId ?? null,
        locationId: session.context.locationId
      }
    });

    if (!current) {
      throw new Error("MAINTENANCE_TICKET_NOT_FOUND");
    }
    if (await hasRecordedMaintenanceOperation(tx, session, current.id, idempotencyKey)) {
      return current;
    }
    if (!(completableMaintenanceStatuses as readonly string[]).includes(current.status)) {
      throw new Error("MAINTENANCE_TICKET_STATUS_NOT_COMPLETABLE");
    }
    const transition = assertPhase2WorkflowTransitionAllowed({
      domain: "MAINTENANCE_TICKET",
      action: "COMPLETE",
      fromStatus: current.status,
      permissionCodes: session.permissionCodes,
      reason: values.correctiveAction,
      evidenceReference: values.evidenceReference
    });
    if (
      requiresPhase2IndependentReview({
        domain: "MAINTENANCE_TICKET",
        action: "COMPLETE",
        riskLevel: current.priority
      }) &&
      (!current.reportedByUserId || current.reportedByUserId === session.user.id)
    ) {
      throw new Error("MAINTENANCE_TICKET_INDEPENDENT_REVIEW_REQUIRED");
    }
    if (completedAt < current.requestedAt) {
      throw new Error("MAINTENANCE_COMPLETED_AT_BEFORE_REQUESTED_AT");
    }

    const result = await tx.maintenanceTicket.updateMany({
      where: {
        id: current.id,
        status: { in: [...completableMaintenanceStatuses] },
        completedAt: null,
        updatedAt: current.updatedAt
      },
      data: {
        status: transition.toStatus,
        completedAt,
        downtimeMinutes: values.downtimeMinutes ?? current.downtimeMinutes ?? 0,
        correctiveAction: values.correctiveAction,
        evidenceReference: values.evidenceReference,
        ownerUserId: session.user.id
      }
    });
    if (result.count !== 1) {
      throw new Error("MAINTENANCE_TICKET_COMPLETION_CONFLICT");
    }

    const updated = await tx.maintenanceTicket.findUniqueOrThrow({
      where: { id: current.id }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "maintenance_ticket.completed",
        entityType: "MaintenanceTicket",
        entityId: updated.id,
        beforeData: {
          status: current.status,
          completedAt: dateOrNull(current.completedAt),
          downtimeMinutes: current.downtimeMinutes,
          correctiveAction: current.correctiveAction,
          evidenceReference: current.evidenceReference
        },
        afterData: {
          status: updated.status,
          completedAt: dateOrNull(updated.completedAt),
          downtimeMinutes: updated.downtimeMinutes,
          correctiveAction: updated.correctiveAction,
          evidenceReference: updated.evidenceReference
        },
        metadata: {
          locationId: updated.locationId,
          boundary: "maintenance_completion_only_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "MaintenanceTicket",
      targetEntityId: updated.id,
      action: "COMPLETE",
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

  return ticket.id;
}

export async function cancelMaintenanceTicket(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.maintenanceComplete);
  assertMaintenanceCompleteAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = cancelMaintenanceTicketSchema.parse(Object.fromEntries(formData));
  const idempotencyKey = operationIdempotencyKey(
    values.ticketId,
    "CANCEL",
    values.idempotencyKey,
    { cancelReason: values.cancelReason },
    session.user.id
  );

  const ticket = await prisma.$transaction(async (tx) => {
    const current = await tx.maintenanceTicket.findFirst({
      where: {
        id: values.ticketId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId ?? null,
        locationId: session.context.locationId
      }
    });

    if (!current) {
      throw new Error("MAINTENANCE_TICKET_NOT_FOUND");
    }
    if (await hasRecordedMaintenanceOperation(tx, session, current.id, idempotencyKey)) {
      return current;
    }
    if (
      !(completableMaintenanceStatuses as readonly string[]).includes(
        current.status
      )
    ) {
      throw new Error("MAINTENANCE_TICKET_STATUS_NOT_CANCELLABLE");
    }
    const transition = assertPhase2WorkflowTransitionAllowed({
      domain: "MAINTENANCE_TICKET",
      action: "CANCEL",
      fromStatus: current.status,
      permissionCodes: session.permissionCodes,
      reason: values.cancelReason
    });
    if (
      requiresPhase2IndependentReview({
        domain: "MAINTENANCE_TICKET",
        action: "CANCEL",
        riskLevel: current.priority
      }) &&
      (!current.reportedByUserId || current.reportedByUserId === session.user.id)
    ) {
      throw new Error("MAINTENANCE_TICKET_INDEPENDENT_REVIEW_REQUIRED");
    }

    const result = await tx.maintenanceTicket.updateMany({
      where: {
        id: current.id,
        status: { in: [...completableMaintenanceStatuses] },
        completedAt: null,
        updatedAt: current.updatedAt
      },
      data: {
        status: transition.toStatus,
        correctiveAction: values.cancelReason,
        ownerUserId: session.user.id
      }
    });
    if (result.count !== 1) {
      throw new Error("MAINTENANCE_TICKET_CANCELLATION_CONFLICT");
    }

    const updated = await tx.maintenanceTicket.findUniqueOrThrow({
      where: { id: current.id }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "maintenance_ticket.cancelled",
        entityType: "MaintenanceTicket",
        entityId: updated.id,
        beforeData: {
          status: current.status,
          completedAt: dateOrNull(current.completedAt),
          correctiveAction: current.correctiveAction
        },
        afterData: {
          status: updated.status,
          correctiveAction: updated.correctiveAction
        },
        metadata: {
          locationId: updated.locationId,
          sourceIncidentId: updated.sourceIncidentId,
          reason: values.cancelReason,
          boundary: "maintenance_cancellation_only_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "MaintenanceTicket",
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

  return ticket.id;
}

export async function correctMaintenanceTicket(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.maintenanceCorrect);
  assertMaintenanceCorrectAccess(session);
  assertAuthorizedLocation(session, session.context.locationId);

  const values = correctMaintenanceTicketSchema.parse(Object.fromEntries(formData));
  const requestedAt = dateFromDateInput(
    values.requestedAt,
    "MAINTENANCE_REQUESTED_AT"
  );
  const targetDueAt = values.targetDueAt
    ? dateFromDateInput(values.targetDueAt, "MAINTENANCE_TARGET_DUE_AT")
    : null;
  if (targetDueAt && targetDueAt < requestedAt) {
    throw new Error("MAINTENANCE_TARGET_DUE_AT_BEFORE_REQUESTED_AT");
  }
  const actionAt = new Date();
  const idempotencyKey = operationIdempotencyKey(
    values.ticketId,
    "DETAIL_CORRECTION",
    values.idempotencyKey,
    {
      requestedAt: values.requestedAt,
      category: values.category,
      assetName: values.assetName,
      assetArea: values.assetArea,
      priority: values.priority,
      title: values.title,
      description: values.description,
      downtimeMinutes: values.downtimeMinutes,
      targetDueAt: values.targetDueAt,
      correctiveAction: values.correctiveAction,
      evidenceReference: values.evidenceReference,
      correctionReason: values.correctionReason,
      correctionEvidenceReference: values.correctionEvidenceReference
    },
    session.user.id
  );

  const ticket = await prisma.$transaction(async (tx) => {
    const current = await tx.maintenanceTicket.findFirst({
      where: {
        id: values.ticketId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId ?? null,
        locationId: session.context.locationId
      }
    });

    if (!current) {
      throw new Error("MAINTENANCE_TICKET_NOT_FOUND");
    }
    if (await hasRecordedMaintenanceOperation(tx, session, current.id, idempotencyKey)) {
      return current;
    }
    if (
      !(correctableMaintenanceStatuses as readonly string[]).includes(
        current.status
      )
    ) {
      throw new Error("MAINTENANCE_TICKET_STATUS_NOT_CORRECTABLE");
    }
    const transition = assertPhase2WorkflowTransitionAllowed({
      domain: "MAINTENANCE_TICKET",
      action: "DETAIL_CORRECTION",
      fromStatus: current.status,
      permissionCodes: session.permissionCodes,
      reason: values.correctionReason,
      evidenceReference: values.correctionEvidenceReference ?? null
    });

    const result = await tx.maintenanceTicket.updateMany({
      where: {
        id: current.id,
        status: { in: [...correctableMaintenanceStatuses] },
        completedAt: null,
        updatedAt: current.updatedAt
      },
      data: {
        status: transition.toStatus,
        requestedAt,
        category: values.category,
        assetName: values.assetName,
        assetArea: values.assetArea,
        priority: values.priority,
        title: values.title,
        description: values.description,
        downtimeMinutes: values.downtimeMinutes ?? null,
        targetDueAt,
        correctiveAction: values.correctiveAction || null,
        evidenceReference: values.evidenceReference || null,
        ownerUserId: session.user.id
      }
    });
    if (result.count !== 1) {
      throw new Error("MAINTENANCE_TICKET_CORRECTION_CONFLICT");
    }

    const updated = await tx.maintenanceTicket.findUniqueOrThrow({
      where: { id: current.id }
    });
    const txAny = tx as Prisma.TransactionClient & Record<string, any>;
    await txAny.operationalCorrectionRecord?.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: updated.brandId,
        locationId: updated.locationId,
        targetEntityType: "MaintenanceTicket",
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
        eventType: "maintenance_ticket.corrected",
        entityType: "MaintenanceTicket",
        entityId: updated.id,
        beforeData: {
          status: current.status,
          requestedAt: dateOrNull(current.requestedAt),
          category: current.category,
          assetName: current.assetName,
          assetArea: current.assetArea,
          priority: current.priority,
          title: current.title,
          description: current.description,
          downtimeMinutes: current.downtimeMinutes,
          targetDueAt: dateOrNull(current.targetDueAt),
          correctiveAction: current.correctiveAction,
          evidenceReference: current.evidenceReference
        },
        afterData: {
          status: updated.status,
          requestedAt: dateOrNull(updated.requestedAt),
          category: updated.category,
          assetName: updated.assetName,
          assetArea: updated.assetArea,
          priority: updated.priority,
          title: updated.title,
          description: updated.description,
          downtimeMinutes: updated.downtimeMinutes,
          targetDueAt: dateOrNull(updated.targetDueAt),
          correctiveAction: updated.correctiveAction,
          evidenceReference: updated.evidenceReference
        },
        metadata: {
          locationId: updated.locationId,
          sourceIncidentId: updated.sourceIncidentId,
          reason: values.correctionReason,
          evidenceReference: values.correctionEvidenceReference || null,
          boundary: "maintenance_detail_correction_no_source_mutation"
        }
      }
    });

    await recordOperationalStatusTransition(tx, session, {
      targetEntityType: "MaintenanceTicket",
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

  return ticket.id;
}

export async function buildMaintenanceExportRows(
  session: SessionContext,
  filters: MaintenanceExportFilters = {}
) {
  const dashboard = await getMaintenanceDashboard(session);
  const tickets = filterMaintenanceTickets(dashboard.tickets, filters);
  return [
    [
      "Location",
      "Ticket Number",
      "Requested At",
      "Category",
      "Asset",
      "Area",
      "Priority",
      "Status",
      "Reported By",
      "Owner",
      "Source Incident ID",
      "Title",
      "Description",
      "Downtime Minutes",
      "SLA Due At",
      "Completed At",
      "Corrective Action",
      "Open Count",
      "In Progress Count",
      "Pending Vendor Count",
      "Completed Count",
      "Cancelled Count",
      "Critical Count",
      "High Count",
      "Evidence Reference"
    ],
    ...tickets.map((ticket) => [
      ticket.locationName,
      ticket.ticketNumber,
      ticket.requestedAt,
      ticket.category,
      ticket.assetName,
      ticket.assetArea,
      ticket.priority,
      ticket.status,
      ticket.reportedByName ?? "",
      ticket.ownerName ?? "",
      ticket.sourceIncidentId ?? "",
      ticket.title,
      ticket.description,
      ticket.downtimeMinutes ?? "",
      ticket.targetDueAt ?? "",
      ticket.completedAt ?? "",
      ticket.correctiveAction ?? "",
      dashboard.statusCounts.OPEN,
      dashboard.statusCounts.IN_PROGRESS,
      dashboard.statusCounts.PENDING_VENDOR,
      dashboard.statusCounts.COMPLETED,
      dashboard.statusCounts.CANCELLED,
      dashboard.priorityCounts.CRITICAL,
      dashboard.priorityCounts.HIGH,
      ticket.evidenceReference ?? ""
    ])
  ];
}
