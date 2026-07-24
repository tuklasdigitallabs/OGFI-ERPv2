import { beforeEach, describe, expect, test, vi } from "vitest";
import { permissions } from "./authorization";
import {
  cancelStockCount,
  generateStockCountVarianceAdjustment,
  reviewStockCount,
  saveStockCountEntries,
  startStockCount,
  submitStockCount
} from "./stockCounts";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    stockCountSession: { updateMany: vi.fn() },
    stockCountLine: {
      count: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn()
    },
    inventoryBalance: { findMany: vi.fn() },
    stockAdjustment: { findFirst: vi.fn(), create: vi.fn() },
    stockAdjustmentLine: { createMany: vi.fn() },
    auditEvent: { create: vi.fn() }
  };
  const prisma = {
    stockCountSession: {
      findFirst: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn()
    },
    auditEvent: { create: vi.fn(), findMany: vi.fn() },
    userRoleAssignment: { findMany: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    )
  };
  return {
    prisma,
    tx,
    requirePermission: vi.fn(),
    requireSessionContext: vi.fn(),
    lockInventoryLocationForPosting: vi.fn()
  };
});

vi.mock("@ogfi/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ogfi/database")>()),
  prisma: mocks.prisma
}));

vi.mock("./authorization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./authorization")>()),
  requirePermission: mocks.requirePermission
}));

vi.mock("./context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./context")>()),
  requireSessionContext: mocks.requireSessionContext
}));

vi.mock("./inventory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./inventory")>()),
  lockInventoryLocationForPosting: mocks.lockInventoryLocationForPosting
}));

const ids = {
  tenant: "00000000-0000-4000-8000-000000000001",
  company: "00000000-0000-4000-8000-000000000002",
  location: "00000000-0000-4000-8000-000000000003",
  user: "00000000-0000-4000-8000-000000000004",
  count: "00000000-0000-4000-8000-000000000005",
  inventoryLocation: "00000000-0000-4000-8000-000000000006",
  line: "00000000-0000-4000-8000-000000000007"
};

const session = {
  user: {
    id: ids.user,
    email: "counter@example.test",
    displayName: "Counter",
    role: "Counter"
  },
  context: {
    tenantId: ids.tenant,
    companyId: ids.company,
    companyName: "OGFI",
    brandId: null,
    brandName: null,
    locationId: ids.location,
    locationName: "Branch",
    locationType: "BRANCH" as const
  },
  authorizedLocations: [],
  permissionCodes: [
    permissions.stockCountEnter,
    permissions.stockCountSubmit,
    permissions.stockCountReview,
    permissions.stockCountCancel
  ]
};

const databaseNow = new Date("2026-07-23T08:00:00.000Z");
const updatedAt = new Date("2026-07-23T07:00:00.000Z");

function lockedCount(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.count,
    currentAttemptId: ids.count,
    inventoryLocationId: ids.inventoryLocation,
    status: "DRAFT",
    blindCount: true,
    scheduledDate: null,
    createdByUserId: "00000000-0000-4000-8000-000000000009",
    assignedToUserId: ids.user,
    updatedAt,
    databaseNow,
    ...overrides
  };
}

function actionForm(extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("id", ids.count);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

describe("Stock Count workflow integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionContext.mockResolvedValue(session);
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.prisma.stockCountSession.findFirst.mockResolvedValue({
      id: ids.count,
      inventoryLocationId: ids.inventoryLocation
    });
    mocks.lockInventoryLocationForPosting.mockResolvedValue({});
    mocks.tx.$queryRaw.mockResolvedValue([lockedCount()]);
    mocks.tx.$executeRaw.mockResolvedValue(1);
    mocks.tx.stockCountSession.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.stockCountLine.count.mockResolvedValue(0);
    mocks.tx.stockCountLine.findMany.mockResolvedValue([]);
    mocks.tx.stockCountLine.createMany.mockResolvedValue({ count: 1 });
    mocks.tx.stockCountLine.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.inventoryBalance.findMany.mockResolvedValue([{
      itemId: "00000000-0000-4000-8000-000000000010",
      baseUomId: "00000000-0000-4000-8000-000000000011",
      lotKey: "NOLOT|NOEXP",
      lotNumber: null,
      expiryDate: null,
      qtyOnHand: 5,
      item: { itemName: "Rice" }
    }]);
    mocks.tx.auditEvent.create.mockResolvedValue({ id: "audit-1" });
    mocks.tx.stockAdjustment.findFirst.mockResolvedValue(null);
  });

  test("starts atomically after location then scoped count locks with a database cutoff and fresh authority", async () => {
    await startStockCount(actionForm());

    expect(mocks.requirePermission).toHaveBeenCalledTimes(2);
    expect(mocks.requirePermission).toHaveBeenLastCalledWith(
      session,
      permissions.stockCountEnter
    );
    expect(mocks.lockInventoryLocationForPosting).toHaveBeenCalledWith(
      mocks.tx,
      session,
      ids.inventoryLocation
    );
    expect(
      mocks.lockInventoryLocationForPosting.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.tx.$queryRaw.mock.invocationCallOrder[0]!);
    expect(mocks.tx.inventoryBalance.findMany).toHaveBeenCalled();
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.tx.stockCountSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignedToUserId: ids.user,
          status: "DRAFT",
          updatedAt
        }),
        data: expect.objectContaining({
          status: "IN_PROGRESS",
          cutoffAt: databaseNow
        })
      })
    );
    expect(mocks.tx.stockCountLine.createMany).toHaveBeenCalled();
    expect(mocks.tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "stock_count.started" })
      })
    );
  });

  test("fails closed when authority is revoked while waiting for the locks", async () => {
    mocks.requirePermission
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("PERMISSION_DENIED"));

    await expect(startStockCount(actionForm())).rejects.toThrow("PERMISSION_DENIED");
    expect(mocks.lockInventoryLocationForPosting).toHaveBeenCalled();
    expect(mocks.tx.$queryRaw).toHaveBeenCalled();
    expect(mocks.tx.stockCountSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.stockCountLine.createMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  test("rejects an unassigned start without snapshot, status, or audit effects", async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      lockedCount({ assignedToUserId: null })
    ]);

    await expect(startStockCount(actionForm())).rejects.toThrow(
      "STOCK_COUNT_NOT_ASSIGNED_TO_ACTOR"
    );
    expect(mocks.tx.inventoryBalance.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.stockCountSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  test("rejects an empty balance snapshot and rolls back all workflow effects", async () => {
    mocks.tx.inventoryBalance.findMany.mockResolvedValueOnce([]);

    await expect(startStockCount(actionForm())).rejects.toThrow(
      "STOCK_COUNT_HAS_NO_BALANCES"
    );
    expect(mocks.tx.stockCountSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.stockCountLine.createMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  test("submission accepts only assigned first-pass complete lineage and audits the CAS transition", async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      lockedCount({ status: "IN_PROGRESS" })
    ]);
    mocks.tx.stockCountLine.findMany.mockResolvedValueOnce([{
      countedQuantityBaseUom: 5,
      countedByUserId: ids.user,
      countedAt: databaseNow
    }]);

    await submitStockCount(actionForm());

    expect(mocks.requirePermission).toHaveBeenCalledTimes(2);
    expect(mocks.tx.stockCountSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignedToUserId: ids.user,
          status: "IN_PROGRESS",
          updatedAt
        }),
        data: { status: "SUBMITTED", submittedAt: databaseNow }
      })
    );
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "stock_count.submitted" })
      })
    );
  });

  test("saves only scoped assigned first-pass lines with line and session CAS guards", async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      lockedCount({ status: "IN_PROGRESS" })
    ]);
    mocks.tx.stockCountLine.findMany.mockResolvedValueOnce([{
      id: ids.line,
      systemQuantityBaseUom: 7,
      updatedAt
    }]);

    await saveStockCountEntries({
      id: ids.count,
      lines: [{
        lineId: ids.line,
        countedQuantityBaseUom: 5,
        notes: "Verified shelf count"
      }]
    });

    expect(mocks.requirePermission).toHaveBeenCalledTimes(2);
    expect(mocks.tx.stockCountLine.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: ids.line,
          stockCountSessionId: ids.count,
          updatedAt
        }),
        data: expect.objectContaining({
          countedQuantityBaseUom: 5,
          varianceQuantityBaseUom: -2,
          countedByUserId: ids.user,
          countedAt: databaseNow
        })
      })
    );
    expect(mocks.tx.stockCountSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignedToUserId: ids.user,
          status: "IN_PROGRESS",
          updatedAt
        })
      })
    );
    expect(mocks.tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "stock_count.entries_saved" })
      })
    );
  });

  test("blocks recount submission and fail-closed review lineage without audit effects", async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      lockedCount({ status: "RECOUNT_REQUESTED" })
    ]);
    await expect(submitStockCount(actionForm())).rejects.toThrow(
      "STOCK_COUNT_NOT_OPEN_FOR_SUBMIT"
    );
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.requireSessionContext.mockResolvedValue(session);
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.prisma.stockCountSession.findFirst.mockResolvedValue({
      id: ids.count,
      inventoryLocationId: ids.inventoryLocation
    });
    mocks.lockInventoryLocationForPosting.mockResolvedValue({});
    mocks.tx.$queryRaw.mockResolvedValue([lockedCount({ status: "SUBMITTED" })]);
    mocks.tx.stockCountLine.findMany.mockResolvedValue([{
      countedQuantityBaseUom: 5,
      countedByUserId: null,
      countedAt: databaseNow
    }]);
    await expect(reviewStockCount(actionForm({
      reviewAction: "REVIEW",
      reviewNotes: "Verified independent count"
    }))).rejects.toThrow("STOCK_COUNT_REVIEW_LINEAGE_INCOMPLETE");
    expect(mocks.tx.stockCountSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  test("serializes cancellation behind the location/count locks and withholds audit on CAS conflict", async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      lockedCount({ status: "IN_PROGRESS" })
    ]);
    mocks.tx.stockCountSession.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(cancelStockCount(actionForm({
      cancellationReason: "Count cancelled after scope correction"
    }))).rejects.toThrow("STOCK_COUNT_CONCURRENT_MODIFICATION");
    expect(
      mocks.lockInventoryLocationForPosting.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.tx.$queryRaw.mock.invocationCallOrder[0]!);
    expect(mocks.requirePermission).toHaveBeenCalledTimes(2);
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  test("serializes variance-adjustment lookup and returns the idempotent existing result", async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      lockedCount({ status: "REVIEWED" })
    ]);
    mocks.tx.stockAdjustment.findFirst.mockResolvedValueOnce({
      id: "existing-adjustment"
    });

    await expect(
      generateStockCountVarianceAdjustment(actionForm())
    ).resolves.toBe("existing-adjustment");
    expect(
      mocks.lockInventoryLocationForPosting.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.tx.$queryRaw.mock.invocationCallOrder[0]!);
    expect(mocks.requirePermission).toHaveBeenCalledTimes(2);
    expect(mocks.tx.stockAdjustment.create).not.toHaveBeenCalled();
    expect(mocks.tx.stockAdjustmentLine.createMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();
  });
});
