import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissions } from "./authorization";
import {
  cancelMaintenanceTicket,
  completeMaintenanceTicket,
  correctMaintenanceTicket,
  createMaintenanceTicket,
  filterMaintenanceTickets,
  getMaintenanceDashboard,
  getMaintenanceDashboardRead,
  getMaintenanceTicketDetail,
  maintenanceDashboardProfileWhere,
  maintenanceDashboardProfileHref,
  maintenanceDashboardProfilePageHref,
  maintenanceDetailHref,
  listMaintenanceTicketPage,
  listMaintenanceMyTaskPage,
  resolveMaintenanceDashboardRequest,
  resolveMaintenanceProfileReturnTo,
  type MaintenanceTicketSummary
} from "./maintenance";

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  maintenanceTicket: {
    aggregate: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn()
  },
  operationalIncident: {
    findFirst: vi.fn()
  },
  user: {
    findMany: vi.fn()
  },
  auditEvent: {
    findMany: vi.fn()
  },
  userRoleAssignment: {
    findMany: vi.fn()
  }
}));
const mockContext = vi.hoisted(() => ({
  requireSessionContext: vi.fn(),
  assertAuthorizedLocation: vi.fn()
}));

vi.mock("@ogfi/database", () => ({
  prisma: mockPrisma
}));

vi.mock("./context", async () => {
  const actual = await vi.importActual<typeof import("./context")>("./context");
  return {
    ...actual,
    requireSessionContext: mockContext.requireSessionContext,
    assertAuthorizedLocation: mockContext.assertAuthorizedLocation
  };
});

const serviceSource = readFileSync(new URL("./maintenance.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(
  path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
  "utf8"
);
const migrationSource = readFileSync(
  path.resolve(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20260703143000_phase2_maintenance_tickets/migration.sql"
  ),
  "utf8"
);
const detailPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/maintenance/[id]/page.tsx"),
  "utf8"
);
const listPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/maintenance/page.tsx"),
  "utf8"
);
const exportRouteSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/maintenance/export/route.ts"),
  "utf8"
);

const session = {
  user: {
    id: "00000000-0000-4000-8000-000000000101",
    email: "manager@example.test",
    displayName: "Branch Manager"
  },
  context: {
    tenantId: "00000000-0000-4000-8000-000000000001",
    companyId: "00000000-0000-4000-8000-000000000002",
    companyName: "One Gourmet Foods Inc.",
    brandId: "00000000-0000-4000-8000-000000000003",
    brandName: "Yakiniku Like",
    locationId: "00000000-0000-4000-8000-000000000004",
    locationName: "SM North Edsa",
    locationType: "BRANCH"
  },
  permissionCodes: [
    permissions.maintenanceCreate,
    permissions.maintenanceCorrect,
    permissions.incidentView
  ]
};

describe("Maintenance dashboard profiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.maintenanceTicket.aggregate.mockResolvedValue({
      _sum: { downtimeMinutes: null }
    });
    mockPrisma.maintenanceTicket.count.mockResolvedValue(0);
    mockPrisma.maintenanceTicket.findMany.mockResolvedValue([]);
    mockPrisma.maintenanceTicket.groupBy.mockResolvedValue([]);
    mockPrisma.operationalIncident.findFirst.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([]);
  });

  it("accepts only the four versioned profiles and validates the overdue cutoff", () => {
    for (const profile of [
      "maintenance-follow-up-v1",
      "maintenance-critical-v1",
      "maintenance-pending-vendor-v1"
    ]) {
      expect(resolveMaintenanceDashboardRequest(profile, undefined, undefined, "2026-07-26"))
        .toEqual({ profile, query: "", asOf: null, error: null });
    }
    expect(resolveMaintenanceDashboardRequest("maintenance-overdue-v1", " Grill ", "2026-07-25", "2026-07-26"))
      .toEqual({ profile: "maintenance-overdue-v1", query: "grill", asOf: "2026-07-25", error: null });
    expect(resolveMaintenanceDashboardRequest("", undefined, undefined, "2026-07-26").error).toBe("PROFILE_INVALID");
    expect(resolveMaintenanceDashboardRequest(["maintenance-follow-up-v1"], undefined, undefined, "2026-07-26").error).toBe("PROFILE_INVALID");
    expect(resolveMaintenanceDashboardRequest("maintenance-follow-up-v1", ["a"], undefined, "2026-07-26").error).toBe("SEARCH_INVALID");
    expect(resolveMaintenanceDashboardRequest("maintenance-overdue-v1", "x".repeat(121), "2026-07-25", "2026-07-26").error).toBe("SEARCH_INVALID");
    expect(resolveMaintenanceDashboardRequest("maintenance-overdue-v1", undefined, undefined, "2026-07-26").error).toBe("AS_OF_REQUIRED");
    expect(resolveMaintenanceDashboardRequest("maintenance-overdue-v1", undefined, "2026-02-30", "2026-07-26").error).toBe("AS_OF_INVALID");
    expect(resolveMaintenanceDashboardRequest("maintenance-overdue-v1", undefined, "2026-07-27", "2026-07-26").error).toBe("AS_OF_FUTURE");
    expect(resolveMaintenanceDashboardRequest("maintenance-follow-up-v1", undefined, "2026-07-25", "2026-07-26").error).toBe("AS_OF_INVALID");
  });

  it("builds strict canonical profile, pagination, return, and detail URLs", () => {
    const canonical = maintenanceDashboardProfilePageHref("maintenance-overdue-v1", {
      asOf: "2026-07-25", query: "grill", page: 2
    });
    expect(canonical).toBe("/maintenance?dashboard=maintenance-overdue-v1&asOf=2026-07-25&q=grill&page=2");
    expect(maintenanceDashboardProfileHref("maintenance-follow-up-v1"))
      .toBe("/maintenance?dashboard=maintenance-follow-up-v1");
    expect(resolveMaintenanceProfileReturnTo(canonical, "2026-07-26")).toBe(canonical);
    expect(resolveMaintenanceProfileReturnTo("/maintenance?q=grill&dashboard=maintenance-follow-up-v1", "2026-07-26")).toBeNull();
    expect(resolveMaintenanceProfileReturnTo("/maintenance?dashboard=maintenance-follow-up-v1&dashboard=maintenance-critical-v1", "2026-07-26")).toBeNull();
    expect(resolveMaintenanceProfileReturnTo([canonical, canonical], "2026-07-26")).toBeNull();
    expect(resolveMaintenanceProfileReturnTo("https://evil.test/maintenance?dashboard=maintenance-follow-up-v1", "2026-07-26")).toBeNull();
    expect(maintenanceDetailHref("ticket-1", canonical)).toBe(
      `/maintenance/ticket-1?returnTo=${encodeURIComponent(canonical)}`
    );
  });

  it("rejects invalid profile inputs before any query", async () => {
    const cases = [
      [{ dashboardProfile: "retired" as never }, {}],
      [{ dashboardProfile: "" as never }, {}],
      [{ dashboardProfile: "maintenance-follow-up-v1" as const }, { q: "x".repeat(121) }],
      [{ dashboardProfile: "maintenance-overdue-v1" as const }, {}],
      [{ dashboardProfile: "maintenance-overdue-v1" as const, asOf: "invalid" }, {}],
      [{ dashboardProfile: "maintenance-overdue-v1" as const, asOf: "2999-01-01" }, {}],
      [{ dashboardProfile: "maintenance-follow-up-v1" as const, asOf: "2026-07-25" }, {}]
    ] as const;
    for (const [input, filters] of cases) {
      await expect(listMaintenanceTicketPage(session as never, filters, input)).rejects.toThrow();
    }
    expect(mockPrisma.maintenanceTicket.count).not.toHaveBeenCalled();
    expect(mockPrisma.maintenanceTicket.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it("keeps exact-null scope, raw-facet immunity, bounded paging, and minimal profile projection", async () => {
    const nullBrandSession = {
      ...session,
      context: { ...session.context, brandId: "", brandName: "All Brands" }
    };
    mockPrisma.maintenanceTicket.count.mockResolvedValueOnce(26);
    mockPrisma.maintenanceTicket.findMany
      .mockResolvedValueOnce([{
      id: "profile-ticket-1",
      ticketNumber: "MT-PROFILE-1",
      requestedAt: new Date("2026-07-20T00:00:00.000Z"),
      category: "EQUIPMENT",
      assetName: "Grill 1",
      assetArea: "Dining",
      priority: "HIGH",
      status: "OPEN",
      title: "Igniter follow-up",
      location: { name: "SM North Edsa" },
      reportedByUserId: null,
      ownerUserId: null,
      sourceIncidentId: "00000000-0000-4000-8000-000000000901",
      downtimeMinutes: 10,
      targetDueAt: null,
      completedAt: null
      }])
      .mockResolvedValueOnce([{ id: "profile-ticket-1" }]);
    const page = await listMaintenanceTicketPage(
      nullBrandSession as never,
      { status: "CANCELLED", priority: "LOW", requestedAt: "2020-01-01" },
      { dashboardProfile: "maintenance-follow-up-v1", page: 2, pageSize: 25 }
    );
    const countWhere = mockPrisma.maintenanceTicket.count.mock.calls[0]![0].where;
    const listQuery = mockPrisma.maintenanceTicket.findMany.mock.calls[0]![0];
    expect(countWhere).toEqual({
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: null,
      locationId: session.context.locationId,
      status: { in: ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"] }
    });
    expect(listQuery.where).toEqual(countWhere);
    expect(listQuery).toMatchObject({ skip: 25, take: 25 });
    expect(listQuery.select).toEqual(expect.objectContaining({
      description: false,
      correctiveAction: false,
      evidenceReference: false,
      sourceIncidentId: false,
      downtimeMinutes: false
    }));
    expect(page).toMatchObject({ page: 2, totalItems: 26, totalPages: 2, dashboardProfile: "maintenance-follow-up-v1", profileAsOf: null });
    expect(page.items[0]).toMatchObject({
      hasSourceIncident: true,
      sourceIncidentId: null,
      downtimeMinutes: null,
      description: "",
      correctiveAction: null,
      evidenceReference: null
    });
    expect(mockPrisma.maintenanceTicket.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: null,
        locationId: session.context.locationId,
        id: { in: ["profile-ticket-1"] },
        sourceIncidentId: { not: null }
      },
      select: { id: true }
    });
  });

  it("applies shared predicates and display-name-only actor search", async () => {
    const cases = [
      ["maintenance-critical-v1", undefined, { priority: "CRITICAL" }],
      ["maintenance-pending-vendor-v1", undefined, { status: "PENDING_VENDOR" }],
      ["maintenance-overdue-v1", "2026-07-25", {
        targetDueAt: { lt: new Date("2026-07-25T00:00:00.000Z") },
        completedAt: null,
        status: { in: ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"] }
      }]
    ] as const;
    for (const [dashboardProfile, asOf, predicate] of cases) {
      vi.clearAllMocks();
      mockPrisma.maintenanceTicket.count.mockResolvedValue(0);
      mockPrisma.maintenanceTicket.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: "actor-1" }]);
      await listMaintenanceTicketPage(session as never, { q: "owner" }, {
        dashboardProfile,
        ...(asOf ? { asOf } : {})
      });
      const where = mockPrisma.maintenanceTicket.count.mock.calls[0]![0].where;
      expect(where).toMatchObject({
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId,
        locationId: session.context.locationId,
        ...predicate
      });
      expect(mockPrisma.maintenanceTicket.findMany.mock.calls[0]![0].where).toEqual(where);
      expect(where.OR).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ description: expect.anything() }),
        expect.objectContaining({ correctiveAction: expect.anything() }),
        expect.objectContaining({ evidenceReference: expect.anything() }),
        expect.objectContaining({ sourceIncidentId: expect.anything() })
      ]));
      expect(mockPrisma.user.findMany.mock.calls[0]![0]).toEqual({
        where: {
          tenantId: session.context.tenantId,
          displayName: { contains: "owner", mode: "insensitive" }
        },
        select: { id: true }
      });
    }
  });

  it("captures one cutoff and keeps dashboard/profile predicate parity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T01:00:00.000Z"));
    mockPrisma.maintenanceTicket.groupBy
      .mockResolvedValueOnce([{ status: "OPEN", _count: { _all: 2 } }])
      .mockResolvedValueOnce([{ priority: "CRITICAL", _count: { _all: 3 } }]);
    mockPrisma.maintenanceTicket.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    const result = await getMaintenanceDashboardRead(session as never);
    expect(result).toMatchObject({
      overdueAsOf: "2026-07-26", totalTickets: 10,
      openTickets: 2, criticalTickets: 3, overdueTickets: 1
    });
    expect(mockPrisma.maintenanceTicket.count.mock.calls.map(([query]) => query.where)).toEqual([
      expect.objectContaining({ brandId: session.context.brandId }),
      expect.objectContaining({ status: { in: ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"] } }),
      expect.objectContaining({ priority: "CRITICAL" }),
      expect.objectContaining({
        targetDueAt: { lt: new Date("2026-07-26T00:00:00.000Z") },
        completedAt: null,
        status: { in: ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"] }
      })
    ]);
    expect(mockPrisma.maintenanceTicket.findMany.mock.calls[0]![0].where)
      .toEqual(mockPrisma.maintenanceTicket.count.mock.calls[1]![0].where);
    vi.useRealTimers();
  });

  it("keeps saved overdue links current-record based and permits intentional profile overlap", () => {
    const overdue = maintenanceDashboardProfileWhere(
      session as never,
      "maintenance-overdue-v1",
      "2026-07-26"
    );
    expect(overdue).toEqual(expect.objectContaining({
      targetDueAt: { lt: new Date("2026-07-26T00:00:00.000Z") },
      completedAt: null,
      status: { in: ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"] }
    }));
    expect(overdue).not.toHaveProperty("createdAt");
    expect(overdue).not.toHaveProperty("requestedAt");

    const overlappingRecord = {
      priority: "CRITICAL",
      status: "PENDING_VENDOR",
      completedAt: null,
      targetDueAt: new Date("2026-07-25T23:59:59.999Z")
    };
    expect(overlappingRecord).toMatchObject({ priority: "CRITICAL", status: "PENDING_VENDOR", completedAt: null });
    expect(overlappingRecord.targetDueAt.getTime()).toBeLessThan(
      (overdue.targetDueAt as { lt: Date }).lt.getTime()
    );
  });
});

function maintenanceFormWithInvalidTargetDate() {
  const form = new FormData();
  form.set("requestedAt", "2026-07-03");
  form.set("targetDueAt", "2026-07-02");
  form.set("category", "EQUIPMENT");
  form.set("assetName", "Table Grill 4");
  form.set("assetArea", "Dining Room");
  form.set("priority", "HIGH");
  form.set("title", "Ignition issue");
  form.set("description", "Table grill ignition did not start during opening checks.");
  form.set("downtimeMinutes", "45");
  form.set("correctiveAction", "Technician to inspect igniter and gas connection.");
  form.set("evidenceReference", "GRILL-PHOTO-4");
  form.set("sourceIncidentId", "24000000-0000-4000-8000-000000000001");
  return form;
}

function validMaintenanceForm() {
  const form = new FormData();
  form.set("requestedAt", "2026-07-03");
  form.set("targetDueAt", "2026-07-04");
  form.set("category", "EQUIPMENT");
  form.set("assetName", "Table Grill 4");
  form.set("assetArea", "Dining Room");
  form.set("priority", "HIGH");
  form.set("title", "Ignition issue");
  form.set("description", "Table grill ignition did not start during opening checks.");
  form.set("downtimeMinutes", "45");
  form.set("correctiveAction", "Technician to inspect igniter and gas connection.");
  form.set("evidenceReference", "GRILL-PHOTO-4");
  form.set("sourceIncidentId", "24000000-0000-4000-8000-000000000001");
  return form;
}

function completeMaintenanceForm() {
  const form = new FormData();
  form.set("ticketId", "00000000-0000-4000-8000-000000000801");
  form.set("completedAt", "2026-07-04");
  form.set("downtimeMinutes", "35");
  form.set("correctiveAction", "Technician replaced igniter and verified grill startup.");
  form.set("evidenceReference", "MT-COMPLETE-4");
  return form;
}

function cancelMaintenanceForm() {
  const form = new FormData();
  form.set("ticketId", "00000000-0000-4000-8000-000000000801");
  form.set("cancelReason", "Duplicate ticket created for the same grill issue.");
  return form;
}

function correctMaintenanceForm() {
  const form = new FormData();
  form.set("ticketId", "00000000-0000-4000-8000-000000000801");
  form.set("requestedAt", "2026-07-05");
  form.set("targetDueAt", "2026-07-06");
  form.set("category", "EQUIPMENT");
  form.set("assetName", "Table Grill 4");
  form.set("assetArea", "Dining Room");
  form.set("priority", "CRITICAL");
  form.set("title", "Ignition issue corrected");
  form.set("description", "Corrected maintenance detail after vendor triage.");
  form.set("downtimeMinutes", "60");
  form.set("correctiveAction", "Vendor to replace ignition assembly.");
  form.set("evidenceReference", "MT-CORRECTED-4");
  form.set("correctionReason", "Vendor triage changed priority and target due date.");
  form.set("correctionEvidenceReference", "MT-CORRECTION-EVIDENCE-4");
  return form;
}

describe("Phase 2 maintenance foundation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.auditEvent.findMany.mockResolvedValue([]);
    mockContext.requireSessionContext.mockResolvedValue(session);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceCreate
              }
            },
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceCorrect
              }
            }
          ]
        }
      }
    ]);
    mockPrisma.maintenanceTicket.count.mockResolvedValue(12);
    mockPrisma.maintenanceTicket.findMany.mockResolvedValue([]);
    mockPrisma.maintenanceTicket.aggregate.mockResolvedValue({
      _sum: { downtimeMinutes: null }
    });
    mockPrisma.maintenanceTicket.groupBy.mockResolvedValue([]);
    mockPrisma.operationalIncident.findFirst.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([]);
  });

  it("uses one scoped predicate for count and bounded maintenance register rows", async () => {
    mockPrisma.maintenanceTicket.count.mockResolvedValueOnce(51);
    mockPrisma.maintenanceTicket.findMany.mockResolvedValueOnce([
      {
        id: "ticket-page-1",
        ticketNumber: "MT-001",
        requestedAt: new Date("2026-07-24T00:00:00.000Z"),
        category: "EQUIPMENT",
        assetName: "Freezer",
        assetArea: "Kitchen",
        priority: "HIGH",
        status: "OPEN",
        title: "Freezer alarm",
        description: "Temperature alarm requires inspection.",
        location: { name: "SM North Edsa" },
        reportedByUserId: "actor-1",
        ownerUserId: "actor-2",
        sourceIncidentId: null,
        downtimeMinutes: 10,
        targetDueAt: null,
        completedAt: null,
        correctiveAction: null,
        evidenceReference: null
      }
    ]);
    mockPrisma.user.findMany
      .mockResolvedValueOnce([{ id: "actor-1" }, { id: "actor-2" }])
      .mockResolvedValueOnce([
      { id: "actor-1", displayName: "Reporter", email: "reporter@example.test" },
      { id: "actor-2", displayName: "Owner", email: "owner@example.test" }
      ]);

    const result = await listMaintenanceTicketPage(session as never, {
      q: "reporter",
      requestedAt: "2026-07-24",
      status: "OPEN",
      priority: "HIGH"
    }, { page: 9, pageSize: 25 });

    expect(result).toMatchObject({ page: 3, pageSize: 25, totalItems: 51, totalPages: 3 });
    expect(result.items[0]).toMatchObject({ reportedByName: "Reporter", ownerName: "Owner" });
    const countWhere = mockPrisma.maintenanceTicket.count.mock.calls.at(-1)?.[0]?.where;
    const pageQuery = mockPrisma.maintenanceTicket.findMany.mock.calls.at(-1)?.[0];
    expect(pageQuery?.where).toEqual(countWhere);
    expect(pageQuery).toMatchObject({ skip: 50, take: 25, orderBy: [{ requestedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }] });
    expect(countWhere).toMatchObject({ tenantId: session.context.tenantId, companyId: session.context.companyId, brandId: session.context.brandId, locationId: session.context.locationId, status: "OPEN", priority: "HIGH" });
  });

  it("fails malformed requested-date filters with the stable user-safe code", async () => {
    await expect(listMaintenanceTicketPage(session as never, { requestedAt: "not-a-date" })).rejects.toThrow("MAINTENANCE_REQUESTED_AT_INVALID");
    expect(mockPrisma.maintenanceTicket.count).not.toHaveBeenCalled();
  });

  it("returns a bounded, exactly scoped completion queue with minimal fields", async () => {
    const completionSession = {
      ...session,
      permissionCodes: [permissions.maintenanceComplete]
    };
    mockPrisma.maintenanceTicket.count.mockResolvedValueOnce(4);
    mockPrisma.maintenanceTicket.findMany
      .mockResolvedValueOnce([
        {
          id: "critical-1",
          ticketNumber: "MT-CRITICAL-1",
          status: "OPEN",
          priority: "CRITICAL",
          targetDueAt: new Date("2026-07-23T00:00:00.000Z"),
          createdAt: new Date("2026-07-20T00:00:00.000Z")
        }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "medium-1",
          ticketNumber: "MT-MEDIUM-1",
          status: "PENDING_VENDOR",
          priority: "MEDIUM",
          targetDueAt: null,
          createdAt: new Date("2026-07-19T00:00:00.000Z")
        }
      ])
      .mockResolvedValueOnce([]);

    const page = await listMaintenanceMyTaskPage(completionSession as never, {
      take: 1
    });

    expect(page).toMatchObject({
      totalCount: 4,
      items: [
        {
          taskId: "maintenance-critical-1",
          recordId: "critical-1",
          priority: "CRITICAL",
          dueAt: "2026-07-23T00:00:00.000Z",
          actionLabel: "Complete maintenance ticket"
        }
      ],
      nextCursor: {
        priority: "CRITICAL",
        sourceType: "MAINTENANCE",
        recordId: "critical-1"
      }
    });
    expect(mockPrisma.maintenanceTicket.findMany).toHaveBeenCalledTimes(4);
    for (const [query] of mockPrisma.maintenanceTicket.findMany.mock.calls) {
      expect(query).toMatchObject({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: session.context.brandId,
          locationId: session.context.locationId,
          status: { in: ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"] },
          completedAt: null,
          OR: [
            { priority: { in: ["MEDIUM", "LOW"] } },
            {
              priority: { in: ["CRITICAL", "HIGH"] },
              reportedByUserId: { not: null },
              NOT: { reportedByUserId: session.user.id }
            }
          ]
        },
        select: {
          id: true,
          ticketNumber: true,
          status: true,
          priority: true,
          targetDueAt: true,
          createdAt: true
        },
        orderBy: [
          { targetDueAt: { sort: "asc", nulls: "last" } },
          { createdAt: "asc" },
          { id: "asc" }
        ],
        take: 2
      });
    }
  });

  it("seeks maintenance priority and due-date streams without rescanning earlier work", async () => {
    const completionSession = {
      ...session,
      permissionCodes: [permissions.maintenanceComplete]
    };
    mockPrisma.maintenanceTicket.count.mockResolvedValueOnce(0);

    await listMaintenanceMyTaskPage(completionSession as never, {
      take: 5,
      after: {
        priority: "HIGH",
        dueAt: "2026-07-24T00:00:00.000Z",
        createdAt: "2026-07-20T00:00:00.000Z",
        sourceType: "MAINTENANCE",
        recordId: "ticket-2"
      }
    });

    expect(mockPrisma.maintenanceTicket.findMany).toHaveBeenCalledTimes(3);
    expect(mockPrisma.maintenanceTicket.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          priority: "HIGH",
          AND: [
            {
              OR: [
                { targetDueAt: null },
                { targetDueAt: { gt: new Date("2026-07-24T00:00:00.000Z") } },
                {
                  targetDueAt: new Date("2026-07-24T00:00:00.000Z"),
                  AND: [
                    {
                      OR: [
                        { createdAt: { gt: new Date("2026-07-20T00:00:00.000Z") } },
                        {
                          createdAt: new Date("2026-07-20T00:00:00.000Z"),
                          id: { gt: "ticket-2" }
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        })
      })
    );
  });

  it("does not query maintenance tasks without completion authority", async () => {
    await expect(
      listMaintenanceMyTaskPage(
        { ...session, permissionCodes: [permissions.maintenanceView] } as never
      )
    ).resolves.toEqual({ totalCount: 0, items: [], nextCursor: null });
    expect(mockPrisma.maintenanceTicket.count).not.toHaveBeenCalled();
    expect(mockPrisma.maintenanceTicket.findMany).not.toHaveBeenCalled();
  });

  it("uses exact null-brand scope for dashboard, detail, history, and actor markers", async () => {
    const nullBrandSession = {
      ...session,
      context: { ...session.context, brandId: "", brandName: null },
      permissionCodes: [permissions.maintenanceView, permissions.incidentView]
    };
    const current = {
      id: "ticket-null-brand",
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: null,
      locationId: session.context.locationId,
      ticketNumber: "MT-NULL-1",
      requestedAt: new Date("2026-07-20T00:00:00.000Z"),
      category: "EQUIPMENT",
      assetName: "Grill 1",
      assetArea: "Dining",
      priority: "HIGH",
      status: "OPEN",
      title: "Igniter issue",
      description: "Igniter requires independent maintenance review.",
      reportedByUserId: session.user.id,
      ownerUserId: null,
      sourceIncidentId: "24000000-0000-4000-8000-000000000001",
      downtimeMinutes: 30,
      targetDueAt: null,
      completedAt: null,
      correctiveAction: null,
      evidenceReference: null,
      createdAt: new Date("2026-07-20T00:00:00.000Z"),
      updatedAt: new Date("2026-07-20T00:00:00.000Z"),
      location: { name: session.context.locationName }
    };
    mockPrisma.maintenanceTicket.findMany.mockResolvedValueOnce([]);
    await getMaintenanceDashboard(nullBrandSession as never);
    expect(mockPrisma.maintenanceTicket.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ brandId: null })
      })
    );

    mockPrisma.maintenanceTicket.count.mockResolvedValueOnce(0);
    mockPrisma.maintenanceTicket.findMany.mockResolvedValueOnce([]);
    await getMaintenanceDashboardRead(nullBrandSession as never);
    expect(mockPrisma.maintenanceTicket.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ brandId: null }) })
    );

    mockPrisma.maintenanceTicket.findFirst.mockResolvedValueOnce(current);
    mockPrisma.maintenanceTicket.findMany.mockResolvedValueOnce([]);
    mockPrisma.operationalIncident.findFirst.mockResolvedValueOnce({ id: current.sourceIncidentId });
    const detail = await getMaintenanceTicketDetail(
      nullBrandSession as never,
      current.id
    );
    expect(mockPrisma.maintenanceTicket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ brandId: null }) })
    );
    expect(mockPrisma.maintenanceTicket.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ brandId: null }) })
    );
    expect(detail).toMatchObject({
      hasReporter: true,
      reportedByCurrentUser: true,
      hasSourceIncident: true,
      sourceIncidentId: current.sourceIncidentId
    });
    expect(mockPrisma.operationalIncident.findFirst).toHaveBeenCalledWith({
      where: {
        id: current.sourceIncidentId,
        tenantId: current.tenantId,
        companyId: current.companyId,
        brandId: null,
        locationId: current.locationId
      },
      select: { id: true }
    });

    mockPrisma.maintenanceTicket.findFirst.mockResolvedValueOnce(current);
    mockPrisma.maintenanceTicket.findMany.mockResolvedValueOnce([]);
    mockPrisma.operationalIncident.findFirst.mockResolvedValueOnce(null);
    await expect(getMaintenanceTicketDetail(nullBrandSession as never, current.id))
      .resolves.toMatchObject({ hasSourceIncident: true, sourceIncidentId: null });
  });

  it("discloses a linked Incident only after permission and exact-scope reauthorization", async () => {
    const sourceIncidentId = "24000000-0000-4000-8000-000000000001";
    const current = {
      id: "ticket-source-auth",
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      brandId: session.context.brandId,
      locationId: session.context.locationId,
      ticketNumber: "MT-SOURCE-1",
      requestedAt: new Date("2026-07-20T00:00:00.000Z"),
      category: "SAFETY",
      assetName: "Dining exhaust",
      assetArea: "Dining",
      priority: "CRITICAL",
      status: "OPEN",
      title: "Investigate incident-linked exhaust fault",
      description: "The exhaust fault requires a controlled maintenance follow-up.",
      reportedByUserId: session.user.id,
      ownerUserId: null,
      sourceIncidentId,
      downtimeMinutes: 15,
      targetDueAt: new Date("2026-07-25T00:00:00.000Z"),
      completedAt: null,
      correctiveAction: null,
      evidenceReference: null,
      createdAt: new Date("2026-07-20T00:00:00.000Z"),
      updatedAt: new Date("2026-07-20T00:00:00.000Z"),
      location: { name: session.context.locationName }
    };
    const history = { ...current, id: "ticket-source-history", ticketNumber: "MT-SOURCE-0", requestedAt: new Date("2026-07-19T00:00:00.000Z") };

    mockPrisma.maintenanceTicket.findFirst.mockResolvedValueOnce(current);
    mockPrisma.maintenanceTicket.findMany.mockResolvedValueOnce([history]);
    mockPrisma.operationalIncident.findFirst.mockResolvedValueOnce({ id: sourceIncidentId });
    const resolveOnly = await getMaintenanceTicketDetail({
      ...session,
      permissionCodes: [permissions.maintenanceView, permissions.incidentResolve]
    } as never, current.id);
    expect(resolveOnly).toMatchObject({ hasSourceIncident: true, sourceIncidentId });
    expect(resolveOnly?.history[0]).toMatchObject({ hasSourceIncident: true, sourceIncidentId: null });

    const sourceLookups = mockPrisma.operationalIncident.findFirst.mock.calls.length;
    mockPrisma.maintenanceTicket.findFirst.mockResolvedValueOnce(current);
    mockPrisma.maintenanceTicket.findMany.mockResolvedValueOnce([history]);
    const noIncidentPermission = await getMaintenanceTicketDetail({
      ...session,
      permissionCodes: [permissions.maintenanceView]
    } as never, current.id);
    expect(noIncidentPermission).toMatchObject({ hasSourceIncident: true, sourceIncidentId: null });
    expect(mockPrisma.operationalIncident.findFirst).toHaveBeenCalledTimes(sourceLookups);

    mockPrisma.maintenanceTicket.findFirst.mockResolvedValueOnce(current);
    mockPrisma.maintenanceTicket.findMany.mockResolvedValueOnce([history]);
    mockPrisma.operationalIncident.findFirst.mockResolvedValueOnce(null);
    const outOfScope = await getMaintenanceTicketDetail({
      ...session,
      permissionCodes: [permissions.maintenanceView, permissions.incidentCreate]
    } as never, current.id);
    expect(outOfScope).toMatchObject({ hasSourceIncident: true, sourceIncidentId: null });
  });

  it("rejects maintenance target dates before the request date before writing", async () => {
    await expect(
      createMaintenanceTicket(maintenanceFormWithInvalidTargetDate())
    ).rejects.toThrow("MAINTENANCE_TARGET_DUE_AT_BEFORE_REQUESTED_AT");

    expect(mockContext.assertAuthorizedLocation).toHaveBeenCalledWith(
      session,
      session.context.locationId
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects maintenance source incidents that are missing or outside scope", async () => {
    const nullBrandSession = {
      ...session,
      context: { ...session.context, brandId: null, brandName: null }
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(nullBrandSession);
    const tx = {
      operationalIncident: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      maintenanceTicket: {
        create: vi.fn()
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(createMaintenanceTicket(validMaintenanceForm())).rejects.toThrow(
      "MAINTENANCE_SOURCE_INCIDENT_NOT_FOUND_OR_UNSCOPED"
    );

    expect(tx.operationalIncident.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "24000000-0000-4000-8000-000000000001",
          brandId: null,
          locationId: session.context.locationId
        })
      })
    );
    expect(tx.maintenanceTicket.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("requires permission to view the linked source incident", async () => {
    const tx = {
      operationalIncident: {
        findFirst: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );
    mockContext.requireSessionContext.mockResolvedValueOnce({
      ...session,
      permissionCodes: [permissions.maintenanceCreate]
    });

    await expect(createMaintenanceTicket(validMaintenanceForm())).rejects.toThrow(
      "PERMISSION_DENIED"
    );

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(tx.operationalIncident.findFirst).not.toHaveBeenCalled();
  });

  it("retries maintenance ticket creation after document-number collision", async () => {
    const firstTx = {
      operationalIncident: {
        findFirst: vi.fn().mockResolvedValue({ id: "source-incident" })
      },
      maintenanceTicket: {
        create: vi.fn().mockRejectedValue({ code: "P2002" })
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    const secondTx = {
      operationalIncident: {
        findFirst: vi.fn().mockResolvedValue({ id: "source-incident" })
      },
      maintenanceTicket: {
        create: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000601",
          locationId: session.context.locationId,
          ticketNumber: "MT-2026-00013",
          status: "OPEN",
          priority: "HIGH",
          category: "EQUIPMENT"
        })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction
      .mockImplementationOnce(async (callback) => callback(firstTx))
      .mockImplementationOnce(async (callback) => callback(secondTx));

    await expect(createMaintenanceTicket(validMaintenanceForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000601"
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(firstTx.operationalIncident.findFirst).toHaveBeenCalled();
    expect(secondTx.operationalIncident.findFirst).toHaveBeenCalled();
    expect(firstTx.auditEvent.create).not.toHaveBeenCalled();
    expect(secondTx.maintenanceTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketNumber: "MT-2026-00013",
          status: "OPEN",
          reportedByUserId: session.user.id,
          ownerUserId: session.user.id,
          sourceIncidentId: "24000000-0000-4000-8000-000000000001",
          downtimeMinutes: 45
        })
      })
    );
    expect(secondTx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "maintenance_ticket.created",
          entityId: "00000000-0000-4000-8000-000000000601",
          metadata: expect.objectContaining({
            locationId: session.context.locationId,
            sourceIncidentId: "24000000-0000-4000-8000-000000000001",
            boundary: "maintenance_create_only_no_source_mutation"
          })
        })
      })
    );
  });

  it("completes a maintenance ticket with optimistic status update and audit history", async () => {
    const completeSession = {
      ...session,
      permissionCodes: [permissions.maintenanceComplete]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(completeSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceComplete
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          requestedAt: new Date("2026-07-03T00:00:00.000Z"),
          updatedAt: new Date("2026-07-03T10:00:00.000Z"),
          status: "OPEN",
          completedAt: null,
          downtimeMinutes: 45,
          correctiveAction: "Technician assigned.",
          evidenceReference: "MT-OPEN-4"
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          locationId: session.context.locationId,
          status: "COMPLETED",
          completedAt: new Date("2026-07-04T00:00:00.000Z"),
          downtimeMinutes: 35,
          correctiveAction: "Technician replaced igniter and verified grill startup.",
          evidenceReference: "MT-COMPLETE-4"
        })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(completeMaintenanceTicket(completeMaintenanceForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000801"
    );

    expect(tx.maintenanceTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000801",
          completedAt: null,
          updatedAt: new Date("2026-07-03T10:00:00.000Z")
        }),
        data: expect.objectContaining({
          status: "COMPLETED",
          downtimeMinutes: 35,
          ownerUserId: session.user.id,
          evidenceReference: "MT-COMPLETE-4"
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "maintenance_ticket.completed",
          entityId: "00000000-0000-4000-8000-000000000801",
          metadata: expect.objectContaining({
            locationId: session.context.locationId,
            boundary: "maintenance_completion_only_no_source_mutation"
          })
        })
      })
    );
  });

  it("cancels a maintenance ticket with reason, audit history, and source boundaries", async () => {
    const cancelSession = {
      ...session,
      permissionCodes: [permissions.maintenanceComplete]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(cancelSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceComplete
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          requestedAt: new Date("2026-07-03T00:00:00.000Z"),
          updatedAt: new Date("2026-07-03T11:00:00.000Z"),
          status: "OPEN",
          completedAt: null,
          downtimeMinutes: 45,
          correctiveAction: "Technician assigned.",
          evidenceReference: "MT-OPEN-4"
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          locationId: session.context.locationId,
          sourceIncidentId: "24000000-0000-4000-8000-000000000001",
          status: "CANCELLED",
          completedAt: null,
          downtimeMinutes: 45,
          correctiveAction: "Duplicate ticket created for the same grill issue.",
          evidenceReference: "MT-OPEN-4"
        })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      },
      operationalStatusTransition: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(cancelMaintenanceTicket(cancelMaintenanceForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000801"
    );

    expect(tx.maintenanceTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000801",
          completedAt: null,
          updatedAt: new Date("2026-07-03T11:00:00.000Z")
        }),
        data: expect.objectContaining({
          status: "CANCELLED",
          ownerUserId: session.user.id,
          correctiveAction: "Duplicate ticket created for the same grill issue."
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "maintenance_ticket.cancelled",
          entityId: "00000000-0000-4000-8000-000000000801",
          metadata: expect.objectContaining({
            locationId: session.context.locationId,
            sourceIncidentId: "24000000-0000-4000-8000-000000000001",
            reason: "Duplicate ticket created for the same grill issue.",
            boundary: "maintenance_cancellation_only_no_source_mutation"
          })
        })
      })
    );
  });

  it("treats an already-recorded maintenance completion as idempotent before policy validation", async () => {
    const completeSession = {
      ...session,
      permissionCodes: [permissions.maintenanceComplete]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(completeSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceComplete
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          status: "COMPLETED"
        }),
        updateMany: vi.fn()
      },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue({ id: "existing-transition" }),
        create: vi.fn()
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(completeMaintenanceTicket(completeMaintenanceForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000801"
    );

    expect(tx.maintenanceTicket.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(tx.operationalStatusTransition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetEntityType: "MaintenanceTicket",
          targetEntityId: "00000000-0000-4000-8000-000000000801"
        })
      })
    );
  });

  it("denies high-priority ticket completion by the reporting user", async () => {
    const completeSession = {
      ...session,
      permissionCodes: [permissions.maintenanceComplete]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(completeSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceComplete
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          requestedAt: new Date("2026-07-03T00:00:00.000Z"),
          status: "OPEN",
          priority: "HIGH",
          reportedByUserId: session.user.id
        }),
        updateMany: vi.fn()
      },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn()
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(completeMaintenanceTicket(completeMaintenanceForm())).rejects.toThrow(
      "MAINTENANCE_TICKET_INDEPENDENT_REVIEW_REQUIRED"
    );

    expect(tx.maintenanceTicket.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it.each([
    ["completion", completeMaintenanceTicket, completeMaintenanceForm],
    ["cancellation", cancelMaintenanceTicket, cancelMaintenanceForm]
  ])("denies high-priority ticket %s when reporter lineage is missing", async (_label, action, form) => {
    const completionSession = {
      ...session,
      permissionCodes: [permissions.maintenanceComplete]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(completionSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceComplete
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          requestedAt: new Date("2026-07-03T00:00:00.000Z"),
          status: "OPEN",
          priority: "HIGH",
          reportedByUserId: null
        }),
        updateMany: vi.fn()
      },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn()
      },
      auditEvent: { create: vi.fn() }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(action(form())).rejects.toThrow(
      "MAINTENANCE_TICKET_INDEPENDENT_REVIEW_REQUIRED"
    );
    expect(tx.maintenanceTicket.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      "completion",
      completeMaintenanceTicket,
      completeMaintenanceForm,
      "MAINTENANCE_TICKET_COMPLETION_CONFLICT"
    ],
    [
      "cancellation",
      cancelMaintenanceTicket,
      cancelMaintenanceForm,
      "MAINTENANCE_TICKET_CANCELLATION_CONFLICT"
    ]
  ])("rolls back stale maintenance %s without audit history", async (_label, action, form, conflictCode) => {
    const completionSession = {
      ...session,
      permissionCodes: [permissions.maintenanceComplete]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(completionSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceComplete
              }
            }
          ]
        }
      }
    ]);
    const updatedAt = new Date("2026-07-03T14:00:00.000Z");
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          requestedAt: new Date("2026-07-03T00:00:00.000Z"),
          updatedAt,
          status: "OPEN",
          priority: "HIGH",
          reportedByUserId: "00000000-0000-4000-8000-000000000999"
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: vi.fn()
      },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn()
      },
      auditEvent: { create: vi.fn() }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(action(form())).rejects.toThrow(conflictCode);
    expect(tx.maintenanceTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000801",
          completedAt: null,
          updatedAt
        })
      })
    );
    expect(tx.maintenanceTicket.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(tx.operationalStatusTransition.create).not.toHaveBeenCalled();
  });

  it("does not allow create authority to substitute for maintenance correction", async () => {
    mockContext.requireSessionContext.mockResolvedValueOnce({
      ...session,
      permissionCodes: [permissions.maintenanceCreate]
    });
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceCreate
              }
            }
          ]
        }
      }
    ]);

    await expect(correctMaintenanceTicket(correctMaintenanceForm())).rejects.toThrow(
      "PERMISSION_DENIED"
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("corrects non-terminal maintenance ticket details with correction, audit, and transition history", async () => {
    mockContext.requireSessionContext.mockResolvedValueOnce({
      ...session,
      permissionCodes: [permissions.maintenanceCorrect]
    });
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceCorrect
              }
            }
          ]
        }
      }
    ]);
    const currentTicket = {
      id: "00000000-0000-4000-8000-000000000801",
      brandId: session.context.brandId,
      locationId: session.context.locationId,
      requestedAt: new Date("2026-07-03T00:00:00.000Z"),
      category: "EQUIPMENT",
      assetName: "Table Grill 4",
      assetArea: "Dining Room",
      priority: "HIGH",
      status: "OPEN",
      title: "Ignition issue",
      description: "Table grill ignition did not start during opening checks.",
      downtimeMinutes: 45,
      targetDueAt: new Date("2026-07-04T00:00:00.000Z"),
      completedAt: null,
      correctiveAction: "Technician assigned.",
      evidenceReference: "MT-OPEN-4",
      sourceIncidentId: "24000000-0000-4000-8000-000000000001",
      updatedAt: new Date("2026-07-03T12:00:00.000Z")
    };
    const updatedTicket = {
      ...currentTicket,
      requestedAt: new Date("2026-07-05T00:00:00.000Z"),
      priority: "CRITICAL",
      title: "Ignition issue corrected",
      description: "Corrected maintenance detail after vendor triage.",
      downtimeMinutes: 60,
      targetDueAt: new Date("2026-07-06T00:00:00.000Z"),
      correctiveAction: "Vendor to replace ignition assembly.",
      evidenceReference: "MT-CORRECTED-4"
    };
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue(currentTicket),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updatedTicket)
      },
      operationalCorrectionRecord: {
        create: vi.fn().mockResolvedValue({})
      },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({})
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(correctMaintenanceTicket(correctMaintenanceForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000801"
    );

    expect(tx.maintenanceTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: currentTicket.id,
          status: { in: ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"] },
          completedAt: null,
          updatedAt: currentTicket.updatedAt
        }),
        data: expect.objectContaining({
          requestedAt: new Date("2026-07-05T00:00:00.000Z"),
          priority: "CRITICAL",
          title: "Ignition issue corrected",
          ownerUserId: session.user.id
        })
      })
    );
    expect(tx.operationalCorrectionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEntityType: "MaintenanceTicket",
          targetEntityId: currentTicket.id,
          correctionType: "DETAIL_CORRECTION",
          status: "APPLIED",
          requestedByUserId: session.user.id,
          appliedByUserId: session.user.id,
          reason: "Vendor triage changed priority and target due date.",
          evidenceReference: "MT-CORRECTION-EVIDENCE-4"
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "maintenance_ticket.corrected",
          beforeData: expect.objectContaining({
            priority: "HIGH",
            title: "Ignition issue"
          }),
          afterData: expect.objectContaining({
            priority: "CRITICAL",
            title: "Ignition issue corrected"
          }),
          metadata: expect.objectContaining({
            reason: "Vendor triage changed priority and target due date.",
            evidenceReference: "MT-CORRECTION-EVIDENCE-4",
            boundary: "maintenance_detail_correction_no_source_mutation"
          })
        })
      })
    );
    expect(tx.operationalStatusTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEntityType: "MaintenanceTicket",
          targetEntityId: currentTicket.id,
          action: "DETAIL_CORRECTION",
          fromStatus: "OPEN",
          toStatus: "OPEN",
          reason: "Vendor triage changed priority and target due date.",
          evidenceReference: "MT-CORRECTION-EVIDENCE-4"
        })
      })
    );
  });

  it("blocks maintenance corrections for terminal statuses before mutation", async () => {
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          status: "COMPLETED"
        }),
        updateMany: vi.fn()
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(correctMaintenanceTicket(correctMaintenanceForm())).rejects.toThrow(
      "MAINTENANCE_TICKET_STATUS_NOT_CORRECTABLE"
    );

    expect(tx.maintenanceTicket.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects stale maintenance correction attempts without audit writes", async () => {
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          brandId: session.context.brandId,
          locationId: session.context.locationId,
          requestedAt: new Date("2026-07-03T00:00:00.000Z"),
          category: "EQUIPMENT",
          assetName: "Table Grill 4",
          assetArea: "Dining Room",
          priority: "HIGH",
          status: "OPEN",
          title: "Ignition issue",
          description: "Table grill ignition did not start during opening checks.",
          downtimeMinutes: 45,
          targetDueAt: new Date("2026-07-04T00:00:00.000Z"),
          updatedAt: new Date("2026-07-03T13:00:00.000Z"),
          completedAt: null,
          correctiveAction: "Technician assigned.",
          evidenceReference: "MT-OPEN-4"
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: vi.fn()
      },
      operationalCorrectionRecord: {
        create: vi.fn()
      },
      operationalStatusTransition: {
        create: vi.fn()
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(correctMaintenanceTicket(correctMaintenanceForm())).rejects.toThrow(
      "MAINTENANCE_TICKET_CORRECTION_CONFLICT"
    );

    expect(tx.maintenanceTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          updatedAt: new Date("2026-07-03T13:00:00.000Z")
        })
      })
    );
    expect(tx.operationalCorrectionRecord.create).not.toHaveBeenCalled();
    expect(tx.operationalStatusTransition.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("adds scoped maintenance ticket records", () => {
    expect(schemaSource).toContain("model MaintenanceTicket");
    expect(schemaSource).toContain("maintenanceTickets");
    expect(migrationSource).toContain(
      "MaintenanceTicket_companyId_ticketNumber_key"
    );
    expect(migrationSource).toContain("MaintenanceTicket_priority_status_idx");
  });

  it("keeps maintenance controlled and separate from purchasing, inventory, and incidents", () => {
    expect(serviceSource).toContain("getMaintenanceDashboard");
    expect(serviceSource).toContain("getMaintenanceDashboardRead");
    expect(serviceSource).toContain("followUpCandidates");
    expect(serviceSource).toContain("take: 3");
    expect(serviceSource).toContain("_sum: { downtimeMinutes: true }");
    expect(serviceSource).toContain("getMaintenanceTicketSummary");
    expect(serviceSource).toContain("getMaintenanceTicketDetail");
    expect(serviceSource).toContain("buildMaintenanceExportRows");
    expect(serviceSource).toContain("filterMaintenanceTickets");
    expect(serviceSource).toContain("filters.requestedAt");
    expect(serviceSource).toContain("prisma.user.findMany");
    expect(serviceSource).toContain("reportedByName");
    expect(serviceSource).toContain("ownerName");
    expect(serviceSource).toContain("dateOnlyInTimeZone(new Date())");
    expect(serviceSource).toContain("dateOrNull(ticket.targetDueAt)! < todayDate");
    expect(serviceSource).toContain("statusCounts");
    expect(serviceSource).toContain("priorityCounts");
    expect(serviceSource).toContain("Open Count");
    expect(serviceSource).toContain("Critical Count");
    expect(serviceSource).toContain("createMaintenanceTicket");
    expect(serviceSource).toContain("assertSourceIncidentVisible");
    expect(serviceSource).toContain("MAINTENANCE_SOURCE_INCIDENT_NOT_FOUND_OR_UNSCOPED");
    expect(serviceSource).toContain("requirePermission(session, permissions.maintenanceCreate)");
    expect(serviceSource).toContain("assertAuthorizedLocation(session, session.context.locationId)");
    expect(serviceSource).toContain("MAINTENANCE_TARGET_DUE_AT_BEFORE_REQUESTED_AT");
    expect(serviceSource).toContain("targetDueAt && targetDueAt < requestedAt");
    expect(serviceSource).toContain("maintenance_ticket.created");
    expect(serviceSource).toContain("recordOperationalStatusTransition");
    expect(serviceSource).toContain('targetEntityType: "MaintenanceTicket"');
    expect(serviceSource).toContain('action: "CREATE_OPEN"');
    expect(serviceSource).toContain('action: "COMPLETE"');
    expect(serviceSource).toContain('action: "CANCEL"');
    expect(serviceSource).toContain("maintenance_create_only_no_source_mutation");
    expect(serviceSource).toContain("completeMaintenanceTicket");
    expect(serviceSource).toContain("requirePermission(session, permissions.maintenanceComplete)");
    expect(serviceSource).toContain("completableMaintenanceStatuses");
    expect(serviceSource).toContain("MAINTENANCE_COMPLETED_AT_BEFORE_REQUESTED_AT");
    expect(serviceSource).toContain("MAINTENANCE_TICKET_COMPLETION_CONFLICT");
    expect(serviceSource).toContain("maintenance_ticket.completed");
    expect(serviceSource).toContain("maintenance_completion_only_no_source_mutation");
    expect(serviceSource).toContain("cancelMaintenanceTicket");
    expect(serviceSource).toContain("MAINTENANCE_TICKET_STATUS_NOT_CANCELLABLE");
    expect(serviceSource).toContain("MAINTENANCE_TICKET_CANCELLATION_CONFLICT");
    expect(serviceSource).toContain("maintenance_ticket.cancelled");
    expect(serviceSource).toContain("maintenance_cancellation_only_no_source_mutation");
    expect(serviceSource).toContain("correctMaintenanceTicket");
    expect(serviceSource).toContain("correctMaintenanceTicketSchema");
    expect(serviceSource).toContain("correctableMaintenanceStatuses");
    expect(serviceSource).toContain("requirePermission(session, permissions.maintenanceCorrect)");
    expect(serviceSource).toContain("MAINTENANCE_TICKET_STATUS_NOT_CORRECTABLE");
    expect(serviceSource).toContain("MAINTENANCE_TICKET_CORRECTION_CONFLICT");
    expect(serviceSource).toContain("maintenance_ticket.corrected");
    expect(serviceSource).toContain("operationalCorrectionRecord");
    expect(serviceSource).toContain('targetEntityType: "MaintenanceTicket"');
    expect(serviceSource).toContain('correctionType: "DETAIL_CORRECTION"');
    expect(serviceSource).toContain('action: "DETAIL_CORRECTION"');
    expect(serviceSource).toContain("maintenance_detail_correction_no_source_mutation");
    expect(serviceSource).toContain("canUseMaintenance");
    expect(serviceSource).toContain("prisma.maintenanceTicket.findMany");
    expect(serviceSource).toContain("tx.maintenanceTicket.updateMany");
    expect(serviceSource).toContain("locationId: session.context.locationId");
    expect(serviceSource).not.toContain("inventoryMovement.create");
    expect(serviceSource).not.toContain("purchaseOrder.create");
    expect(serviceSource).not.toContain("operationalIncident.update");
  });

  it("provides a scoped maintenance detail view with controlled completion", () => {
    expect(detailPageSource).toContain("getMaintenanceTicketDetail(session, id)");
    expect(detailPageSource).toContain("this detail view tracks the");
    expect(detailPageSource).toContain("notFound()");
    expect(detailPageSource).toContain("completeMaintenanceTicketAction");
    expect(detailPageSource).toContain("cancelMaintenanceTicketAction");
    expect(detailPageSource).toContain("correctMaintenanceTicketAction");
    expect(detailPageSource).toContain("correctMaintenanceTicket");
    expect(detailPageSource).toContain("permissions.maintenanceComplete");
    expect(detailPageSource).toContain("permissions.maintenanceCorrect");
    expect(detailPageSource).toContain("<EntryModal title=\"Complete Maintenance Ticket\"");
    expect(detailPageSource).toContain("<EntryModal title=\"Cancel Maintenance Ticket\"");
    expect(detailPageSource).toContain("Correct Maintenance Details");
    expect(detailPageSource).toContain("Save Maintenance Correction");
    expect(detailPageSource).toContain('name="completedAt"');
    expect(detailPageSource).toContain('name="cancelReason"');
    expect(detailPageSource).toContain('name="correctiveAction"');
    expect(detailPageSource).toContain('name="evidenceReference"');
    expect(detailPageSource).toContain('name="correctionReason"');
    expect(detailPageSource).toContain('name="correctionEvidenceReference"');
    expect(detailPageSource).toContain('name="downtimeMinutes"');
    expect(detailPageSource).toContain("ticket.reportedByName");
    expect(detailPageSource).toContain("ticket.ownerName");
    expect(detailPageSource).toContain("ticket.sourceIncidentId");
    expect(detailPageSource).toContain('status === "PENDING_VENDOR"');
    expect(detailPageSource).toContain('status === "COMPLETED"');
    expect(detailPageSource).toContain("sourceIncidentHref");
    expect(detailPageSource).toContain("/incidents/${sourceIncidentId}");
    expect(detailPageSource).toContain("Source incident (read-only reference)");
    expect(detailPageSource).toContain("Open Source Incident");
    expect(detailPageSource).toContain("canUseIncidents(permissionCodes)");
    expect(detailPageSource).toContain('triggerClassName="min-h-11');
    expect(detailPageSource).toContain('className="ogfi-chip mt-3 min-h-11"');
    expect(detailPageSource).toContain('className="ogfi-chip min-h-11"');
    expect(detailPageSource).toContain("values.length === 1 ? values[0] : values");
    expect(detailPageSource).toContain("maintenanceDetailHref(id, returnTo)");
    expect(detailPageSource).toContain("maintenanceDetailHref(ticketId, returnTo)");
    expect(detailPageSource).not.toContain("purchaseOrder.create");
  });

  it("keeps every Maintenance dashboard-profile visible surface read-only, canonical, responsive, and touch-safe", () => {
    expect(listPageSource).toContain('dashboardProfile === "maintenance-follow-up-v1"');
    expect(listPageSource).toContain('dashboardProfile === "maintenance-critical-v1"');
    expect(listPageSource).toContain('dashboardProfile === "maintenance-pending-vendor-v1"');
    expect(listPageSource).toContain('"Overdue Maintenance Tickets"');
    expect(listPageSource).toContain("including completed and cancelled history");
    expect(listPageSource).toContain("It is not a personal assignment queue");
    expect(listPageSource).toContain("ticket status, completion, cancellation, and corrected target dates reflect current records; this is not a historical snapshot");
    expect(listPageSource).toContain("Dashboard profiles are overlapping operational lenses; their counts must not be added together");
    expect(listPageSource).toContain("{!dashboardProfile ? <div");
    expect(listPageSource).toContain("{canCreate && !dashboardProfile ? (");
    expect(listPageSource).toContain("{canExport ? (!dashboardProfile ? (");
    expect(listPageSource).toContain('<input name="dashboard" type="hidden" value={dashboardProfile} />');
    expect(listPageSource).toContain('<input name="asOf" type="hidden" value={dashboardRequest.asOf} />');
    expect(listPageSource).toContain('name="q"');
    expect(listPageSource).toContain("maintenanceDashboardProfilePageHref(dashboardProfile");
    expect(listPageSource).toContain("maintenanceDetailHref(ticketId, pageHref(workspace.page))");
    expect(listPageSource).toContain("xl:hidden");
    expect(listPageSource).toContain("hidden overflow-x-auto xl:block");
    expect(listPageSource).toContain('className="min-h-11"');

    expect(detailPageSource.match(/name="returnTo"/g)?.length).toBe(3);
    expect(detailPageSource).toContain("maintenanceDetailHref(historyTicket.id, returnTo)");
    expect(detailPageSource).toContain("canUseIncidents(permissionCodes)");
    expect(detailPageSource).toContain('triggerClassName="min-h-11');
    expect(detailPageSource).toContain('className="ogfi-chip mt-3 min-h-11"');
    expect(detailPageSource).toContain('className="ogfi-chip min-h-11"');
  });

  it("shows scoped same-location and same-asset maintenance history", () => {
    expect(serviceSource).toContain("locationId: current.locationId");
    expect(serviceSource).toContain("assetName: current.assetName");
    expect(serviceSource).toContain("assetArea: current.assetArea");
    expect(serviceSource).toContain("requestedAt: { lt: current.requestedAt }");
    expect(detailPageSource).toContain("Same Asset History");
    expect(detailPageSource).toContain("ticket.history.map");
    expect(detailPageSource).toContain("historyTicket.status");
    expect(detailPageSource).toContain("historyTicket.downtimeMinutes");
    expect(detailPageSource).toContain("historyTicket.correctiveAction");
    expect(detailPageSource).toContain("historyTicket.evidenceReference");
    expect(detailPageSource).toContain("maintenanceDetailHref(historyTicket.id, returnTo)");
  });

  it("provides maintenance queue search and filters without mutating source records", () => {
    expect(listPageSource).toContain("searchParams");
    expect(listPageSource).toContain('name="q"');
    expect(listPageSource).toContain('name="requestedAt"');
    expect(listPageSource).toContain('name="status"');
    expect(listPageSource).toContain('name="priority"');
    expect(listPageSource).toContain("<TaskSheet");
    expect(listPageSource).toContain('title="Create Maintenance Ticket"');
    expect(listPageSource).toContain("createMaintenanceTicketAction");
    expect(listPageSource).toContain("permissions.maintenanceCreate");
    expect(listPageSource).toContain('name="requestedAt"');
    expect(listPageSource).toContain('name="assetName"');
    expect(listPageSource).toContain('name="downtimeMinutes"');
    expect(listPageSource).toContain('name="sourceIncidentId"');
    expect(listPageSource).toContain("workspace");
    expect(listPageSource).toContain("PAGE_SIZE = 25");
    expect(listPageSource).toContain("normalizePage");
    expect(listPageSource).toContain("paginatedTickets");
    expect(listPageSource).toContain("pageHref");
    expect(listPageSource).toContain("workspace.page");
    expect(listPageSource).toContain("Page {workspace.page} of {workspace.totalPages}");
    expect(listPageSource).toContain("listMaintenanceTicketPage");
    expect(listPageSource).toContain("ticket.ownerName");
    expect(listPageSource).toContain("buildQueryHref(\"/maintenance/export\"");
    expect(exportRouteSource).toContain("getStrictDateSearchParam");
    expect(exportRouteSource).toContain('"requestedAt"');
    expect(exportRouteSource).toContain("MAINTENANCE_REQUESTED_AT_FILTER_INVALID");
    expect(serviceSource).toContain('"Reported By"');
    expect(serviceSource).toContain('"Owner"');
    expect(serviceSource).toContain('"Source Incident ID"');
    expect(serviceSource).toContain('"Cancelled Count"');
    expect(listPageSource).toContain('"CANCELLED"');
    expect(listPageSource).not.toContain('"CLOSED"');
    expect(listPageSource).toContain('status === "PENDING_VENDOR"');
    expect(listPageSource).toContain('status === "COMPLETED"');
    expect(listPageSource).toContain('status === "CANCELLED"');
    expect(listPageSource).toContain("sourceIncidentHref");
    expect(listPageSource).toContain("/incidents/${sourceIncidentId}");
    expect(listPageSource).toContain("Source");
    expect(listPageSource).toContain("No tickets match the filters");
    expect(listPageSource).toContain("getMaintenanceDashboardRead(session)");
    expect(listPageSource).toContain("dashboardRequest.error");
    expect(listPageSource).toContain("canUseIncidents(permissionCodes)");
    expect(listPageSource).toContain("{canExport ? (!dashboardProfile ? (");
    expect(listPageSource).toContain("{canCreate && !dashboardProfile ? (");
    expect(listPageSource).toContain("{!dashboardProfile ? <Badge");
    expect(listPageSource).toContain("xl:hidden");
    expect(listPageSource).toContain("hidden overflow-x-auto xl:block");
    expect(listPageSource).not.toContain("maintenanceTicket.update");
    expect(serviceSource).not.toContain("operationalIncident.update");
  });

  it("filters maintenance tickets by actors, asset context, and combined queue facets", () => {
    const tickets: MaintenanceTicketSummary[] = [
      {
        id: "ticket-1",
        ticketNumber: "MT-001",
        requestedAt: "2026-07-03",
        category: "EQUIPMENT",
        assetName: "Grill table 4",
        assetArea: "Dining",
        priority: "CRITICAL",
        status: "OPEN",
        title: "Ignition issue",
        description: "Pilot will not light during opening checks",
        locationName: "SM North Edsa",
        reportedByName: "Bianca Reyes",
        hasReporter: true,
        reportedByCurrentUser: false,
        ownerName: "Alyssa Tan",
        hasSourceIncident: true,
        sourceIncidentId: "24000000-0000-4000-8000-000000000001",
        downtimeMinutes: 45,
        targetDueAt: "2026-07-03",
        completedAt: null,
        correctiveAction: null,
        evidenceReference: "grill-photo-4"
      },
      {
        id: "ticket-2",
        ticketNumber: "MT-002",
        requestedAt: "2026-07-04",
        category: "FACILITY",
        assetName: "Dining exhaust fan",
        assetArea: "Dining",
        priority: "HIGH",
        status: "COMPLETED",
        title: "Noisy exhaust fan",
        description: "Fan vibration near counter seats",
        locationName: "SM Mall of Asia",
        reportedByName: "Paolo Cruz",
        hasReporter: true,
        reportedByCurrentUser: false,
        ownerName: "Marco Santos",
        hasSourceIncident: true,
        sourceIncidentId: "24000000-0000-4000-8000-000000000002",
        downtimeMinutes: 20,
        targetDueAt: "2026-07-04",
        completedAt: "2026-07-04",
        correctiveAction: "Vendor tightened loose bracket",
        evidenceReference: "vendor-report-44"
      },
      {
        id: "ticket-3",
        ticketNumber: "MT-003",
        requestedAt: "2026-07-05",
        category: "OTHER",
        assetName: "Duplicate asset",
        assetArea: "Back Office",
        priority: "LOW",
        status: "CANCELLED",
        title: "Duplicate ticket",
        description: "Duplicate maintenance ticket was cancelled",
        locationName: "SM North Edsa",
        reportedByName: "Lia Mendoza",
        hasReporter: true,
        reportedByCurrentUser: false,
        ownerName: "Nico Valdez",
        hasSourceIncident: false,
        sourceIncidentId: null,
        downtimeMinutes: 0,
        targetDueAt: null,
        completedAt: null,
        correctiveAction: "Duplicate record cancelled.",
        evidenceReference: null
      }
    ];

    expect(
      filterMaintenanceTickets(tickets, { q: "alyssa" }).map((ticket) => ticket.id)
    ).toEqual(["ticket-1"]);
    expect(
      filterMaintenanceTickets(tickets, { q: "exhaust" }).map(
        (ticket) => ticket.id
      )
    ).toEqual(["ticket-2"]);
    expect(
      filterMaintenanceTickets(tickets, { q: "24000000-0000" }).map(
        (ticket) => ticket.id
      )
    ).toEqual(["ticket-1", "ticket-2"]);
    expect(
      filterMaintenanceTickets(tickets, {
        requestedAt: "2026-07-03",
        priority: "CRITICAL",
        status: "OPEN"
      }).map((ticket) => ticket.id)
    ).toEqual(["ticket-1"]);
    expect(
      filterMaintenanceTickets(tickets, { status: "CANCELLED" }).map(
        (ticket) => ticket.id
      )
    ).toEqual(["ticket-3"]);
    expect(
      filterMaintenanceTickets(tickets, {
        requestedAt: "2026-07-03",
        priority: "HIGH",
        status: "OPEN"
      })
    ).toEqual([]);
    expect(
      filterMaintenanceTickets(tickets, {
        q: "",
        priority: "ALL",
        status: "ALL"
      }).map((ticket) => ticket.id)
    ).toEqual(["ticket-1", "ticket-2", "ticket-3"]);
  });
});
