import { describe, expect, it, vi } from "vitest";
import { permissions } from "./authorization";
import { getPurchaseRequestDashboardRead } from "./purchaseRequests";
import { getPurchaseOrderDashboardRead } from "./purchaseOrders";
import { getStockAdjustmentDashboardRead } from "./stockAdjustments";
import { getWastageDashboardRead } from "./wastage";

const mockPrisma = vi.hoisted(() => ({
  purchaseRequest: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  purchaseOrder: {
    count: vi.fn(),
    aggregate: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  purchaseOrderLine: {
    findMany: vi.fn(),
  },
  wastageReport: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  stockAdjustment: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@ogfi/database", () => ({ prisma: mockPrisma }));

const session = {
  user: {
    id: "00000000-0000-4000-8000-000000000005",
    email: "inventory.manager@example.test",
    displayName: "Inventory Manager",
    role: "Inventory Manager",
  },
  context: {
    tenantId: "00000000-0000-4000-8000-000000000001",
    companyId: "00000000-0000-4000-8000-000000000002",
    companyName: "OGFI Foods",
    brandId: "00000000-0000-4000-8000-000000000003",
    brandName: "OGFI",
    locationId: "00000000-0000-4000-8000-000000000004",
    locationName: "BGC",
    locationType: "BRANCH" as const,
  },
  authorizedLocations: [],
  permissionCodes: [
    permissions.purchaseRequestCreate,
    permissions.purchaseOrderView,
    permissions.wastageView,
    permissions.stockAdjustmentView,
  ],
};

describe("bounded operational dashboard reads", () => {
  it("uses scoped PO aggregates, narrow fulfillment values, and a bounded overdue preview", async () => {
    mockPrisma.purchaseOrder.count.mockResolvedValue(4);
    mockPrisma.purchaseOrder.aggregate.mockResolvedValue({
      _sum: { totalAmount: 1200 },
    });
    mockPrisma.purchaseOrderLine.findMany.mockResolvedValue([
      { orderedQty: 10, receivedQty: 4, cancelledQty: 1, unitPrice: 100 },
    ]);
    mockPrisma.purchaseOrder.findMany.mockResolvedValue([
      {
        id: "po-1",
        publicReference: "PO-2026-00001",
        status: "ISSUED",
        expectedDeliveryDate: new Date("2026-07-20T00:00:00.000Z"),
        supplier: { legalName: "Demo Supplier", tradingName: null },
      },
    ]);
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ currencyCode: "PHP" });

    await expect(getPurchaseOrderDashboardRead(session as never)).resolves.toEqual(
      expect.objectContaining({
        openCount: 4,
        committedValue: 1200,
        openValue: 500,
        receivedValue: 400,
        overdueCandidates: [expect.objectContaining({ id: "po-1" })],
      }),
    );
    expect(mockPrisma.purchaseOrder.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        deliveryLocationId: session.context.locationId,
      }),
    });
    expect(mockPrisma.purchaseOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 8,
        select: expect.not.objectContaining({ lines: expect.anything() }),
      }),
    );
  });

  it("uses an exact scoped count and bounded header-only purchase-request candidates", async () => {
    mockPrisma.purchaseRequest.count.mockResolvedValue(7);
    mockPrisma.purchaseRequest.findMany.mockResolvedValue([
      {
        id: "pr-1",
        publicReference: "PR-2026-00001",
        status: "PENDING_APPROVAL",
        urgency: "Emergency",
        requiredDate: new Date("2026-07-24T00:00:00.000Z"),
        createdAt: new Date("2026-07-23T00:00:00.000Z"),
      },
    ]);

    await expect(getPurchaseRequestDashboardRead(session as never)).resolves.toEqual({
      openCount: 7,
      taskCandidates: [
        expect.objectContaining({
          id: "pr-1",
          requiredDate: "2026-07-24T00:00:00.000Z",
        }),
      ],
    });
    expect(mockPrisma.purchaseRequest.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        requestLocationId: session.context.locationId,
        status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "RETURNED"] },
      }),
    });
    expect(mockPrisma.purchaseRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 8,
        select: expect.not.objectContaining({ lines: expect.anything() }),
      }),
    );
  });

  it("keeps wastage exception count and candidates on the authorized inventory location", async () => {
    mockPrisma.wastageReport.count.mockResolvedValue(3);
    mockPrisma.wastageReport.findMany.mockResolvedValue([
      {
        id: "wr-1",
        publicReference: "WR-2026-00001",
        status: "PENDING_APPROVAL",
        wastageType: "DAMAGE",
        evidenceRequired: true,
        evidenceSatisfied: false,
        createdAt: new Date("2026-07-23T00:00:00.000Z"),
        inventoryLocation: { name: "BGC Store" },
        _count: { lines: 2 },
      },
    ]);

    await expect(getWastageDashboardRead(session as never)).resolves.toMatchObject({
      exceptionCount: 3,
      taskCandidates: [{ inventoryLocationName: "BGC Store", lineCount: 2 }],
    });
    expect(mockPrisma.wastageReport.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocation: { locationId: session.context.locationId },
        OR: [
          { status: { in: ["PENDING_APPROVAL", "APPROVED", "POSTING", "RETURNED"] } },
          { evidenceRequired: true, evidenceSatisfied: false },
        ],
      }),
    });
    expect(mockPrisma.wastageReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 8 }),
    );
  });

  it("keeps stock-adjustment exception reads scoped and never expands lines", async () => {
    mockPrisma.stockAdjustment.count.mockResolvedValue(2);
    mockPrisma.stockAdjustment.findMany.mockResolvedValue([
      {
        id: "sa-1",
        publicReference: "SA-2026-00001",
        status: "APPROVED",
        adjustmentType: "DECREASE",
        createdAt: new Date("2026-07-23T00:00:00.000Z"),
        inventoryLocation: { name: "BGC Store" },
        _count: { lines: 1 },
      },
    ]);

    await expect(getStockAdjustmentDashboardRead(session as never)).resolves.toMatchObject({
      exceptionCount: 2,
      taskCandidates: [{ adjustmentType: "DECREASE", lineCount: 1 }],
    });
    expect(mockPrisma.stockAdjustment.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocation: { locationId: session.context.locationId },
      }),
    });
    expect(mockPrisma.stockAdjustment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 8,
        select: expect.not.objectContaining({ lines: expect.anything() }),
      }),
    );
  });
});
