import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { permissions } from "./authorization";
import {
  assertStockCountCanCancel,
  assertStockCountCanEnter,
  assertStockCountCanGenerateAdjustment,
  assertStockCountCanReview,
  assertStockCountCanStart,
  assertStockCountCanSubmit,
  assertStockCountReviewerSegregation,
  calculateCountVariance,
  filterCountVarianceLines,
  getStockCount,
  getStockCountDashboardRead,
  recommendedStockCountCadenceDays
} from "./stockCounts";

const mockPrisma = vi.hoisted(() => ({
  stockCountSession: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  auditEvent: { findMany: vi.fn() },
  userRoleAssignment: { findMany: vi.fn() }
}));

vi.mock("@ogfi/database", () => ({ prisma: mockPrisma }));

const dashboardSession = {
  user: {
    id: "00000000-0000-4000-8000-000000000005",
    email: "counter@example.test",
    displayName: "Counter",
    role: "Counter"
  },
  context: {
    tenantId: "00000000-0000-4000-8000-000000000001",
    companyId: "00000000-0000-4000-8000-000000000002",
    companyName: "OGFI Foods",
    brandId: "00000000-0000-4000-8000-000000000003",
    brandName: "OGFI",
    locationId: "00000000-0000-4000-8000-000000000004",
    locationName: "BGC",
    locationType: "BRANCH" as const
  },
  authorizedLocations: [],
  permissionCodes: [permissions.stockCountView]
};

describe("stock count foundation rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.userRoleAssignment.findMany.mockResolvedValue([]);
  });

  test("list page gate allows every stock-count action permission", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../app/(app)/counts/page.tsx"),
      "utf8"
    );

    expect(source).toContain("canUseStockCounts(session.permissionCodes)");
  });

  test("service read gate allows every stock-count action permission", () => {
    const source = readFileSync(path.resolve(__dirname, "stockCounts.ts"), "utf8");

    expect(source).toContain("canUseStockCounts(session.permissionCodes)");
  });

  test("dashboard read requires stock-count review permission and returns bounded header-only candidates", async () => {
    mockPrisma.stockCountSession.count.mockResolvedValue(3);
    mockPrisma.stockCountSession.findMany.mockResolvedValue([
      {
        id: "count-1",
        publicReference: "SC-2026-00001",
        status: "SUBMITTED",
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        inventoryLocation: { name: "BGC Store" },
        _count: { lines: 2 }
      }
    ]);

    const reviewerSession = {
      ...dashboardSession,
      permissionCodes: [permissions.stockCountReview]
    };
    mockPrisma.userRoleAssignment.findMany.mockResolvedValue([{
      role: {
        permissions: [{
          permission: {
            tenantId: reviewerSession.context.tenantId,
            code: permissions.stockCountReview
          }
        }]
      }
    }]);
    await expect(getStockCountDashboardRead(reviewerSession as never)).resolves.toMatchObject({
      varianceCount: 3,
      taskCandidates: [{ inventoryLocationName: "BGC Store", varianceLineCount: 2 }]
    });
    expect(mockPrisma.stockCountSession.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: reviewerSession.context.tenantId,
        companyId: reviewerSession.context.companyId,
        inventoryLocation: { locationId: reviewerSession.context.locationId },
        lines: { some: { varianceQuantityBaseUom: { not: 0 } } }
      })
    });
    expect(mockPrisma.stockCountSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 8,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: expect.not.objectContaining({ lines: expect.anything() })
      })
    );
  });

  test("dashboard read rejects non-review stock-count callers before querying", async () => {
    await expect(
      getStockCountDashboardRead(dashboardSession as never)
    ).rejects.toThrow("PERMISSION_DENIED");
    expect(mockPrisma.stockCountSession.count).not.toHaveBeenCalled();
  });

  test("stock count detail redacts blind-count and variance facts for non-review callers", async () => {
    mockPrisma.stockCountSession.findFirst.mockResolvedValue({
      id: "count-1",
      publicReference: "SC-2026-00001",
      status: "SUBMITTED",
      countType: "FULL",
      blindCount: true,
      freezeMovements: false,
      inventoryLocationId: "inventory-location-1",
      inventoryLocation: { name: "BGC Store", location: { name: "BGC" } },
      createdBy: { displayName: "Creator" },
      assignedTo: null,
      reviewedBy: { displayName: "Reviewer" },
      scheduledDate: null,
      cutoffAt: null,
      startedAt: null,
      submittedAt: null,
      reviewedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      reviewNotes: "Variance checked",
      stockAdjustments: [],
      lines: [{
        id: "line-1",
        lineNumber: 1,
        item: { itemCode: "RICE", itemName: "Rice" },
        uom: { uomCode: "KG" },
        lotNumber: null,
        expiryDate: null,
        systemQuantityBaseUom: 12,
        countedQuantityBaseUom: 10,
        varianceQuantityBaseUom: -2,
        notes: "physical count",
        countedBy: { displayName: "Counter" },
        countedAt: new Date("2026-07-20T00:00:00.000Z")
      }]
    });
    mockPrisma.auditEvent.findMany.mockResolvedValue([{
      id: "audit-1",
      eventType: "stock_count.reviewed",
      occurredAt: new Date("2026-07-20T01:00:00.000Z"),
      metadata: { reviewNotes: "Variance checked", varianceQuantityBaseUom: -2 }
    }]);

    const count = await getStockCount(dashboardSession as never, "count-1");

    expect(count).toMatchObject({
      reviewNotes: null,
      canShowSystemQuantity: false,
      lines: [{
        systemQuantityBaseUom: null,
        countedQuantityBaseUom: 10,
        varianceQuantityBaseUom: null
      }],
      auditEvents: []
    });
  });

  test("stock count cadence reads configurable DEC-0036 policy", () => {
    expect(
      recommendedStockCountCadenceDays("HIGH_VALUE", {
        standardFrequencyDays: 30,
        highRiskFrequencyDays: 7
      })
    ).toBe(7);
    expect(
      recommendedStockCountCadenceDays("CYCLE", {
        standardFrequencyDays: 30,
        highRiskFrequencyDays: 7
      })
    ).toBe(30);

    const source = readFileSync(path.resolve(__dirname, "stockCounts.ts"), "utf8");
    const policySource = readFileSync(
      path.resolve(__dirname, "policySettings.ts"),
      "utf8"
    );
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/counts/page.tsx"),
      "utf8"
    );

    expect(source).toContain("getStockCountCadencePolicy");
    expect(source).toContain("recommendedCadenceDays");
    expect(source).toContain("cadencePolicy");
    expect(policySource).toContain("inventory.stock_count.standard_frequency_days");
    expect(policySource).toContain("inventory.stock_count.high_risk_frequency_days");
    expect(pageSource).toContain("Current count cadence policy");
    expect(pageSource).toContain("recommendedCadenceDays");
  });

  test("starts draft counts only", () => {
    expect(() => assertStockCountCanStart("DRAFT")).not.toThrow();
    expect(() => assertStockCountCanStart("IN_PROGRESS")).toThrow(
      "STOCK_COUNT_NOT_DRAFT_FOR_START"
    );
  });

  test("allows entry and submit only while open", () => {
    expect(() => assertStockCountCanEnter("IN_PROGRESS")).not.toThrow();
    expect(() => assertStockCountCanEnter("RECOUNT_REQUESTED")).not.toThrow();
    expect(() => assertStockCountCanEnter("SUBMITTED")).toThrow(
      "STOCK_COUNT_NOT_OPEN_FOR_ENTRY"
    );

    expect(() => assertStockCountCanSubmit("IN_PROGRESS")).not.toThrow();
    expect(() => assertStockCountCanSubmit("RECOUNT_REQUESTED")).not.toThrow();
    expect(() => assertStockCountCanSubmit("REVIEWED")).toThrow(
      "STOCK_COUNT_NOT_OPEN_FOR_SUBMIT"
    );
  });

  test("reviews submitted counts only", () => {
    expect(() => assertStockCountCanReview("SUBMITTED")).not.toThrow();
    expect(() => assertStockCountCanReview("IN_PROGRESS")).toThrow(
      "STOCK_COUNT_NOT_SUBMITTED_FOR_REVIEW"
    );
  });

  test("blocks creator or counter from reviewing their own count", () => {
    expect(() =>
      assertStockCountReviewerSegregation({
        reviewerUserId: "reviewer-1",
        createdByUserId: "creator-1",
        countedByUserIds: ["counter-1", null]
      })
    ).not.toThrow();

    expect(() =>
      assertStockCountReviewerSegregation({
        reviewerUserId: "user-1",
        createdByUserId: "user-1",
        countedByUserIds: ["counter-1"]
      })
    ).toThrow("STOCK_COUNT_SELF_REVIEW_BLOCKED");

    expect(() =>
      assertStockCountReviewerSegregation({
        reviewerUserId: "counter-1",
        createdByUserId: "creator-1",
        countedByUserIds: ["counter-1"]
      })
    ).toThrow("STOCK_COUNT_SELF_REVIEW_BLOCKED");
  });

  test("generates variance adjustments from reviewed counts only", () => {
    expect(() => assertStockCountCanGenerateAdjustment("REVIEWED")).not.toThrow();
    expect(() => assertStockCountCanGenerateAdjustment("SUBMITTED")).toThrow(
      "STOCK_COUNT_NOT_REVIEWED_FOR_ADJUSTMENT"
    );
  });

  test("blocks cancellation after review or cancellation", () => {
    expect(() => assertStockCountCanCancel("DRAFT")).not.toThrow();
    expect(() => assertStockCountCanCancel("SUBMITTED")).not.toThrow();
    expect(() => assertStockCountCanCancel("REVIEWED")).toThrow(
      "STOCK_COUNT_NOT_CANCELLABLE"
    );
    expect(() => assertStockCountCanCancel("CANCELLED")).toThrow(
      "STOCK_COUNT_NOT_CANCELLABLE"
    );
  });

  test("calculates variance from immutable snapshot", () => {
    expect(calculateCountVariance(8, 10)).toBe(-2);
    expect(calculateCountVariance(12, 10)).toBe(2);
    expect(calculateCountVariance(10, 10)).toBe(0);
    expect(() => calculateCountVariance(-1, 10)).toThrow(
      "STOCK_COUNT_QUANTITY_INVALID"
    );
  });

  test("filters only counted non-zero variance lines", () => {
    const lines = [
      {
        countedQuantityBaseUom: 10,
        varianceQuantityBaseUom: 0
      },
      {
        countedQuantityBaseUom: 8,
        varianceQuantityBaseUom: -2
      },
      {
        countedQuantityBaseUom: 12,
        varianceQuantityBaseUom: 2
      }
    ];

    expect(filterCountVarianceLines(lines)).toHaveLength(2);
    expect(() =>
      filterCountVarianceLines([
        {
          countedQuantityBaseUom: null,
          varianceQuantityBaseUom: null
        }
      ])
    ).toThrow("STOCK_COUNT_HAS_UNCOUNTED_LINES");
  });

  test("migration guards count-derived adjustments against duplicates", () => {
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260701001000_stock_count_variance_adjustment_bridge/migration.sql"
      ),
      "utf8"
    );

    expect(migration).toContain("COUNT_VARIANCE");
    expect(migration).toContain(
      '"StockAdjustment_sourceStockCountSessionId_key"'
    );
    expect(migration).toContain(
      '"StockAdjustmentLine_sourceStockCountLineId_key"'
    );
    expect(migration).toContain(
      '"sourceDocumentType" = \'StockCountSession\''
    );
  });

  test("stock count export includes line variance detail without breaking blind-count review controls", () => {
    const source = readFileSync(path.resolve(__dirname, "stockCounts.ts"), "utf8");
    const route = readFileSync(
      path.resolve(__dirname, "../../app/(app)/counts/export/route.ts"),
      "utf8"
    );

    expect(source).toContain("buildStockCountExportRows");
    expect(source).toContain('"System Qty"');
    expect(source).toContain('"Counted Qty"');
    expect(source).toContain('"Variance Qty"');
    expect(source).toContain("permissions.stockCountReview");
    expect(source).toContain("canShowSystemQuantity ? Number(line.systemQuantityBaseUom) : \"\"");
    expect(source).toContain(
      "canShowSystemQuantity && line.varianceQuantityBaseUom !== null"
    );
    expect(route).toContain("buildStockCountExportRows(session)");
    expect(route).toContain("exportErrorResponse(error)");
  });
});
