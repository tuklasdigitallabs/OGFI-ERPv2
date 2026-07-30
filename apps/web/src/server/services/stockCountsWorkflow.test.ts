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
    approvalInstanceStep: {
      updateMany: vi.fn(),
      findFirst: vi.fn()
    },
    approvalInstance: { updateMany: vi.fn() },
    inventoryBalance: { findMany: vi.fn() },
    inventoryPilotFamilyActivation: { findUnique: vi.fn() },
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
    classifyStockCountAttemptForPilotApproval: vi.fn(),
    withApprovalProducerTransaction: vi.fn(),
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

vi.mock("./inventoryPilotApprovalPolicy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./inventoryPilotApprovalPolicy")>()),
  classifyStockCountAttemptForPilotApproval:
    mocks.classifyStockCountAttemptForPilotApproval
}));

vi.mock("./approvalProducerBarrier", () => ({
  withApprovalProducerTransaction: mocks.withApprovalProducerTransaction
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
    version: 7,
    currentAttemptVersion: 11,
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

function queuePilotAttemptLock(status: "IN_PROGRESS" | "SUBMITTED") {
  mocks.tx.$queryRaw
    .mockResolvedValueOnce([lockedCount({ status })])
    .mockResolvedValueOnce([{ id: ids.count, version: 11 }])
    .mockResolvedValueOnce([{
      id: ids.count,
      stockCountSessionId: ids.count,
      tenantId: ids.tenant,
      companyId: ids.company,
      inventoryLocationId: ids.inventoryLocation,
      status,
      version: 11,
      createdByUserId: "00000000-0000-4000-8000-000000000009",
      assignedToUserId: ids.user,
      evidenceReference: null
    }])
    .mockResolvedValueOnce([{
      id: ids.line,
      tenantId: ids.tenant,
      companyId: ids.company,
      inventoryLocationId: ids.inventoryLocation,
      itemId: "00000000-0000-4000-8000-000000000010",
      countedByUserId: "00000000-0000-4000-8000-000000000011",
      countedAt: databaseNow,
      countedQuantityBaseUom: 5
    }]);
}

describe("Stock Count workflow integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED", "false");
    mocks.withApprovalProducerTransaction.mockImplementation(
      (_input: unknown, action: (client: typeof mocks.tx) => unknown) =>
        mocks.prisma.$transaction(action)
    );
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
    mocks.tx.inventoryPilotFamilyActivation.findUnique.mockResolvedValue(null);
    mocks.tx.stockCountLine.count.mockResolvedValue(0);
    mocks.tx.stockCountLine.findMany.mockResolvedValue([]);
    mocks.tx.stockCountLine.createMany.mockResolvedValue({ count: 1 });
    mocks.tx.stockCountLine.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.approvalInstanceStep.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.approvalInstanceStep.findFirst.mockResolvedValue(null);
    mocks.tx.approvalInstance.updateMany.mockResolvedValue({ count: 1 });
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
          updatedAt,
          version: 7
        }),
        data: expect.objectContaining({
          status: "IN_PROGRESS",
          cutoffAt: databaseNow,
          version: { increment: 1 }
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

  test("relinks a locked legacy attempt within the start CAS instead of adding a second session write", async () => {
    mocks.tx.$queryRaw
      .mockResolvedValueOnce([
        lockedCount({ currentAttemptId: null, currentAttemptVersion: null })
      ])
      .mockResolvedValueOnce([{ id: ids.count, version: 13 }]);

    await startStockCount(actionForm());

    expect(mocks.tx.stockCountSession.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.tx.stockCountSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          currentAttemptId: null,
          version: 7
        }),
        data: expect.objectContaining({
          currentAttemptId: ids.count,
          version: { increment: 1 }
        })
      })
    );
    const attemptMutation = mocks.tx.$executeRaw.mock.calls.at(0)?.[0] as {
      strings: readonly string[];
    };
    expect(String(attemptMutation.strings.join(""))).toContain(
      "AND version = "
    );
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
          updatedAt,
          version: 7
        }),
        data: expect.objectContaining({
          status: "SUBMITTED",
          submittedAt: databaseNow,
          version: { increment: 1 }
        })
      })
    );
    expect(mocks.tx.stockCountSession.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 7 }),
        data: expect.objectContaining({ version: { increment: 1 } })
      })
    );
    const attemptMutation = mocks.tx.$executeRaw.mock.calls.at(-1)?.[0] as {
      strings: readonly string[];
    };
    expect(String(attemptMutation.strings.join(""))).toContain(
      "AND version = "
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
          updatedAt,
          version: 7
        }),
        data: expect.objectContaining({ version: { increment: 1 } })
      })
    );
    const aggregateAttemptMutation = mocks.tx.$executeRaw.mock.calls.at(-1)?.[0] as {
      strings: readonly string[];
    };
    expect(String(aggregateAttemptMutation.strings.join(""))).toContain(
      "version = version + 1"
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

  test("fails closed when recount is requested before recovery is enabled", async () => {
    await expect(reviewStockCount(actionForm({
      reviewAction: "RECOUNT",
      reviewNotes: "Recount requested"
    }))).rejects.toThrow("STOCK_COUNT_RECOUNT_DISABLED");
    expect(mocks.prisma.stockCountSession.findFirst).not.toHaveBeenCalled();
    expect(mocks.lockInventoryLocationForPosting).not.toHaveBeenCalled();
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

  test("mirrors cancellation to the current immutable attempt before audit", async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      lockedCount({ status: "IN_PROGRESS" })
    ]);

    await expect(cancelStockCount(actionForm({
      cancellationReason: "Count cancelled after scope correction"
    }))).resolves.toBeUndefined();

    const attemptMutation = mocks.tx.$executeRaw.mock.calls.at(-1)?.[0] as {
      strings: readonly string[];
    };
    expect(String(attemptMutation.strings.join(""))).toContain(
      'UPDATE "StockCountAttempt"'
    );
    expect(String(attemptMutation.strings.join(""))).toContain(
      "status = 'CANCELLED'"
    );
    expect(String(attemptMutation.strings.join(""))).toContain(
      "AND version = "
    );
    expect(mocks.tx.stockCountSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 7 }),
        data: expect.objectContaining({ version: { increment: 1 } })
      })
    );
    expect(mocks.tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "stock_count.cancelled" })
      })
    );
  });

  test("withholds cancellation audit when the immutable attempt CAS loses", async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      lockedCount({ status: "IN_PROGRESS" })
    ]);
    mocks.tx.$executeRaw.mockResolvedValueOnce(0);

    await expect(cancelStockCount(actionForm({
      cancellationReason: "Count cancelled after scope correction"
    }))).rejects.toThrow("STOCK_COUNT_ATTEMPT_CONCURRENT_MODIFICATION");
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  test("cancels an admitted review graph before cancelling the exact current attempt", async () => {
    const approvalInstanceId = "00000000-0000-4000-8000-000000000012";
    mocks.tx.$queryRaw.mockReset()
      .mockResolvedValueOnce([lockedCount({ status: "SUBMITTED" })])
      .mockResolvedValueOnce([{ id: ids.count, version: 11 }])
      .mockResolvedValueOnce([{
        id: "00000000-0000-4000-8000-000000000013",
        approvalInstanceId,
        stockCountAttemptId: ids.count,
        stockCountSessionId: ids.count,
        attemptVersionBefore: 10,
        attemptVersionAfter: 11,
        sessionVersionBefore: 6,
        sessionVersionAfter: 7,
        approvalDocumentType: "StockCountAttemptReview",
        activationFamily: "StockCountAttemptReview",
        activationStatus: "ACTIVE"
      }])
      .mockResolvedValueOnce([{ id: approvalInstanceId }])
      .mockResolvedValueOnce([{ id: approvalInstanceId, currentStepOrder: 1 }])
      .mockResolvedValueOnce([{
        id: "00000000-0000-4000-8000-000000000014",
        stepOrder: 1,
        status: "PENDING",
        actedAt: null,
        activatedAt: null,
        dueAt: null
      }]);

    await expect(cancelStockCount(actionForm({
      cancellationReason: "Count cancelled after a controlled correction"
    }))).resolves.toBeUndefined();

    expect(mocks.tx.approvalInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: approvalInstanceId,
          status: "PENDING"
        }),
        data: expect.objectContaining({ status: "CANCELLED" })
      })
    );
    expect(
      mocks.tx.approvalInstance.updateMany.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mocks.tx.stockCountSession.updateMany.mock.invocationCallOrder[0]!
    );
    expect(mocks.tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "stock_count.cancelled",
          metadata: expect.objectContaining({
            approvalInstanceId
          })
        })
      })
    );
  });

  test("fails closed without source mutation for an orphan pending pilot graph", async () => {
    mocks.tx.$queryRaw.mockReset()
      .mockResolvedValueOnce([lockedCount({ status: "SUBMITTED" })])
      .mockResolvedValueOnce([{ id: ids.count, version: 11 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: "00000000-0000-4000-8000-000000000015"
      }]);

    await expect(cancelStockCount(actionForm({
      cancellationReason: "Count cancelled after a controlled correction"
    }))).rejects.toThrow("STOCK_COUNT_CANCELLATION_APPROVAL_LINEAGE_CONFLICT");

    expect(mocks.tx.stockCountSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  test("allows direct review only while the ordinary-count approval family is disabled", async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      lockedCount({ status: "SUBMITTED" })
    ]);
    mocks.tx.stockCountLine.findMany.mockResolvedValueOnce([{
      countedQuantityBaseUom: 5,
      countedByUserId: "00000000-0000-4000-8000-000000000010",
      countedAt: databaseNow
    }]);

    await reviewStockCount(actionForm({
      reviewAction: "REVIEW",
      reviewNotes: "Verified independent count"
    }));

    expect(mocks.tx.stockCountSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 7 }),
        data: expect.objectContaining({ version: { increment: 1 } })
      })
    );
    const attemptMutation = mocks.tx.$executeRaw.mock.calls.at(-1)?.[0] as {
      strings: readonly string[];
    };
    expect(String(attemptMutation.strings.join(""))).toContain(
      "version = version + 1"
    );
    expect(String(attemptMutation.strings.join(""))).toContain(
      "AND version = "
    );
    expect(mocks.classifyStockCountAttemptForPilotApproval).not.toHaveBeenCalled();
  });

  test("rejects the direct-review bypass for an admitted pilot count without source mutation", async () => {
    vi.stubEnv("STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED", "true");
    mocks.tx.$queryRaw
      .mockResolvedValueOnce([lockedCount({ status: "SUBMITTED" })])
      .mockResolvedValueOnce([{ id: ids.count, version: 11 }])
      .mockResolvedValueOnce([{
        id: ids.count,
        stockCountSessionId: ids.count,
        tenantId: ids.tenant,
        companyId: ids.company,
        inventoryLocationId: ids.inventoryLocation,
        status: "SUBMITTED",
        version: 11,
        createdByUserId: "00000000-0000-4000-8000-000000000009",
        assignedToUserId: ids.user,
        evidenceReference: null
      }])
      .mockResolvedValueOnce([{
        id: ids.line,
        tenantId: ids.tenant,
        companyId: ids.company,
        inventoryLocationId: ids.inventoryLocation,
        itemId: "00000000-0000-4000-8000-000000000010",
        countedByUserId: "00000000-0000-4000-8000-000000000011",
        countedAt: databaseNow,
        countedQuantityBaseUom: 5
      }]);
    mocks.classifyStockCountAttemptForPilotApproval.mockResolvedValue({
      configurationRevisionId: "00000000-0000-4000-8000-000000000012",
      configurationRevisionNumber: 1,
      configurationDigest: "a".repeat(64),
      activationEventId: "00000000-0000-4000-8000-000000000013",
      activationGeneration: 1,
      family: "StockCountAttemptReview",
      itemDigest: "b".repeat(64)
    });

    await expect(reviewStockCount(actionForm({
      reviewAction: "REVIEW",
      reviewNotes: "Verified independent count"
    }))).rejects.toThrow("STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_REQUIRED");

    expect(mocks.classifyStockCountAttemptForPilotApproval).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "REVALIDATE" })
    );
    expect(mocks.tx.stockCountSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  test("keeps a database-active matching cohort denied when the environment switch is off", async () => {
    mocks.tx.inventoryPilotFamilyActivation.findUnique.mockResolvedValue({
      status: "ACTIVE"
    });
    queuePilotAttemptLock("SUBMITTED");
    mocks.classifyStockCountAttemptForPilotApproval.mockResolvedValue({});

    await expect(reviewStockCount(actionForm({
      reviewAction: "REVIEW",
      reviewNotes: "Verified independent count"
    }))).rejects.toThrow("INVENTORY_PILOT_APPROVAL_DISABLED");

    expect(mocks.classifyStockCountAttemptForPilotApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "REVALIDATE",
        environment: {
          STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED: "true"
        }
      })
    );
    expect(mocks.tx.stockCountSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  test("does not downgrade a matching active cohort during submission when the environment switch is off", async () => {
    mocks.tx.inventoryPilotFamilyActivation.findUnique.mockResolvedValue({
      status: "ACTIVE"
    });
    queuePilotAttemptLock("IN_PROGRESS");
    mocks.classifyStockCountAttemptForPilotApproval.mockResolvedValue({});

    await expect(submitStockCount(actionForm())).rejects.toThrow(
      "INVENTORY_PILOT_APPROVAL_DISABLED"
    );

    expect(mocks.classifyStockCountAttemptForPilotApproval).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "SUBMIT" })
    );
    expect(mocks.tx.stockCountSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  test("keeps an active non-cohort on the legacy review path but never masks a mixed cohort", async () => {
    mocks.tx.inventoryPilotFamilyActivation.findUnique.mockResolvedValue({
      status: "ACTIVE"
    });
    queuePilotAttemptLock("SUBMITTED");
    mocks.classifyStockCountAttemptForPilotApproval.mockRejectedValueOnce(
      new Error("INVENTORY_PILOT_SCOPE_MISMATCH")
    );
    mocks.tx.stockCountLine.findMany.mockResolvedValueOnce([{
      countedQuantityBaseUom: 5,
      countedByUserId: "00000000-0000-4000-8000-000000000010",
      countedAt: databaseNow
    }]);

    await expect(reviewStockCount(actionForm({
      reviewAction: "REVIEW",
      reviewNotes: "Verified independent count"
    }))).resolves.toBeUndefined();
    expect(mocks.tx.stockCountSession.updateMany).toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.requireSessionContext.mockResolvedValue(session);
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.prisma.stockCountSession.findFirst.mockResolvedValue({
      id: ids.count,
      inventoryLocationId: ids.inventoryLocation
    });
    mocks.lockInventoryLocationForPosting.mockResolvedValue({});
    mocks.withApprovalProducerTransaction.mockImplementation(
      (_input: unknown, action: (client: typeof mocks.tx) => unknown) =>
        mocks.prisma.$transaction(action)
    );
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx)
    );
    mocks.tx.inventoryPilotFamilyActivation.findUnique.mockResolvedValue({
      status: "ACTIVE"
    });
    mocks.tx.stockCountSession.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.$executeRaw.mockResolvedValue(1);
    queuePilotAttemptLock("SUBMITTED");
    mocks.classifyStockCountAttemptForPilotApproval.mockRejectedValueOnce(
      new Error("INVENTORY_PILOT_MIXED_ITEM_COHORT")
    );

    await expect(reviewStockCount(actionForm({
      reviewAction: "REVIEW",
      reviewNotes: "Verified independent count"
    }))).rejects.toThrow("INVENTORY_PILOT_MIXED_ITEM_COHORT");
    expect(mocks.tx.stockCountSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  test("keeps Count Variance generation disabled before any database mutation", async () => {
    await expect(
      generateStockCountVarianceAdjustment(actionForm())
    ).rejects.toThrow("STOCK_COUNT_VARIANCE_DISABLED");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.stockAdjustment.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.stockAdjustment.create).not.toHaveBeenCalled();
    expect(mocks.tx.stockAdjustmentLine.createMany).not.toHaveBeenCalled();
  });
});
