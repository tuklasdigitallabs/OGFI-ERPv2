import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissions } from "./authorization";
import { cancelStockAdjustment } from "./stockAdjustments";

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  userRoleAssignment: {
    findMany: vi.fn()
  },
  stockAdjustment: {
    findFirst: vi.fn()
  }
}));

const mockContext = vi.hoisted(() => ({
  requireSessionContext: vi.fn()
}));

const mockMfa = vi.hoisted(() => ({
  assertPrivilegedMfaForAction: vi.fn()
}));

vi.mock("@ogfi/database", () => ({
  prisma: mockPrisma
}));

vi.mock("./context", async () => {
  const actual = await vi.importActual<typeof import("./context")>("./context");
  return {
    ...actual,
    requireSessionContext: mockContext.requireSessionContext
  };
});

vi.mock("./privilegedMfaGuard", () => ({
  assertPrivilegedMfaForAction: mockMfa.assertPrivilegedMfaForAction
}));

const ids = {
  tenant: "00000000-0000-4000-8000-000000000001",
  company: "00000000-0000-4000-8000-000000000002",
  brand: "00000000-0000-4000-8000-000000000003",
  location: "00000000-0000-4000-8000-000000000004",
  actor: "00000000-0000-4000-8000-000000000005",
  requester: "00000000-0000-4000-8000-000000000006",
  adjustment: "00000000-0000-4000-8000-000000000007",
  inventoryLocation: "00000000-0000-4000-8000-000000000008",
  approval: "00000000-0000-4000-8000-000000000009",
  authSession: "00000000-0000-4000-8000-000000000010"
} as const;

const session = {
  user: {
    id: ids.actor,
    email: "inventory.manager@example.test",
    displayName: "Inventory Manager",
    role: "Inventory Manager"
  },
  context: {
    tenantId: ids.tenant,
    companyId: ids.company,
    companyName: "OGFI Foods",
    brandId: ids.brand,
    brandName: "OGFI",
    locationId: ids.location,
    locationName: "BGC",
    locationType: "BRANCH" as const
  },
  authorizedLocations: [],
  permissionCodes: [permissions.stockAdjustmentCancel]
};

function cancellationForm() {
  const formData = new FormData();
  formData.set("id", ids.adjustment);
  formData.set("cancellationReason", "Duplicate adjustment entered by mistake.");
  return formData;
}

function adjustment(status = "PENDING_APPROVAL") {
  return {
    id: ids.adjustment,
    tenantId: ids.tenant,
    companyId: ids.company,
    inventoryLocationId: ids.inventoryLocation,
    publicReference: "SA-2026-00001",
    requestedByUserId: ids.requester,
    status,
    adjustmentType: "INCREASE",
    inventoryLocation: {
      id: ids.inventoryLocation,
      locationId: ids.location,
      location: {
        id: ids.location,
        name: "BGC"
      }
    }
  };
}

function makeTransaction(input?: {
  lockedApprovals?: Array<{ id: string; currentStepOrder: number }>;
  sourceUpdateCount?: number;
  approvalUpdateCount?: number;
  livePermission?: boolean;
  liveScope?: boolean;
  liveInventoryLocation?: boolean;
}) {
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([
        { id: ids.actor, status: "ACTIVE", privilegeEpoch: 1 }
      ])
      .mockResolvedValueOnce([
        { id: ids.requester, status: "ACTIVE", privilegeEpoch: 0 }
      ])
      .mockResolvedValueOnce(
        input?.lockedApprovals ?? [{ id: ids.approval, currentStepOrder: 1 }]
      ),
    userRoleAssignment: {
      findFirst: vi
        .fn()
        .mockResolvedValue(input?.livePermission === false ? null : { id: "role" })
    },
    inventoryLocation: {
      findFirst: vi.fn().mockResolvedValue(
        input?.liveInventoryLocation === false
          ? null
          : { locationId: ids.location }
      )
    },
    userScopeAssignment: {
      findFirst: vi
        .fn()
        .mockResolvedValue(input?.liveScope === false ? null : { id: "scope" })
    },
    stockAdjustment: {
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: input?.sourceUpdateCount ?? 1 })
    },
    approvalInstance: {
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: input?.approvalUpdateCount ?? 1 })
    },
    approvalInstanceStep: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({ id: "audit-event" })
    },
    notification: {
      upsert: vi.fn().mockResolvedValue({ id: "notification" })
    }
  };
  return tx;
}

describe("stock-adjustment cancellation serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.requireSessionContext.mockResolvedValue(session);
    mockMfa.assertPrivilegedMfaForAction.mockResolvedValue(undefined);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: ids.tenant,
                code: permissions.stockAdjustmentCancel
              }
            }
          ]
        }
      }
    ]);
    mockPrisma.stockAdjustment.findFirst.mockResolvedValue(adjustment());
  });

  it("uses canonical user, session, approval, source, and audit order", async () => {
    const tx = makeTransaction();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(cancelStockAdjustment(cancellationForm())).resolves.toBeUndefined();

    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    const firstUserLockSql = tx.$queryRaw.mock.calls[0]?.[0].join(" ");
    const secondUserLockSql = tx.$queryRaw.mock.calls[1]?.[0].join(" ");
    const approvalLockSql = tx.$queryRaw.mock.calls[2]?.[0].join(" ");
    expect(firstUserLockSql).toContain('FROM "User"');
    expect(secondUserLockSql).toContain('FROM "User"');
    expect(tx.$queryRaw.mock.calls[0]?.[1]).toBe(ids.actor);
    expect(tx.$queryRaw.mock.calls[1]?.[1]).toBe(ids.requester);
    expect(approvalLockSql).toContain('JOIN "ApprovalInstanceStep"');
    expect(approvalLockSql).toContain("FOR UPDATE OF ai, s");

    expect(mockMfa.assertPrivilegedMfaForAction).toHaveBeenCalledWith(
      session,
      expect.objectContaining({
        action: "stock_adjustment.cancel",
        permissionCode: permissions.stockAdjustmentCancel
      })
    );
    expect(tx.stockAdjustment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: ids.adjustment,
          tenantId: ids.tenant,
          companyId: ids.company,
          inventoryLocationId: ids.inventoryLocation,
          status: "PENDING_APPROVAL",
          inventoryLocation: { locationId: ids.location }
        })
      })
    );

    const approvalLockOrder = tx.$queryRaw.mock.invocationCallOrder[2] ?? 0;
    const mfaOrder =
      mockMfa.assertPrivilegedMfaForAction.mock.invocationCallOrder[0] ?? 0;
    const sourceOrder =
      tx.stockAdjustment.updateMany.mock.invocationCallOrder[0] ?? 0;
    const auditOrder = tx.auditEvent.create.mock.invocationCallOrder[0] ?? 0;
    expect(approvalLockOrder).toBeLessThan(mfaOrder);
    expect(mfaOrder).toBeLessThan(sourceOrder);
    expect(sourceOrder).toBeLessThan(auditOrder);
    expect(tx.notification.upsert).not.toHaveBeenCalled();
  });

  it.each(["DRAFT", "SUBMITTED", "RETURNED"])(
    "cancels %s without requiring an approval row",
    async (status) => {
      mockPrisma.stockAdjustment.findFirst.mockResolvedValueOnce(adjustment(status));
      const tx = makeTransaction({ lockedApprovals: [] });
      mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

      await expect(cancelStockAdjustment(cancellationForm())).resolves.toBeUndefined();

      expect(tx.approvalInstance.updateMany).not.toHaveBeenCalled();
      expect(tx.approvalInstanceStep.updateMany).not.toHaveBeenCalled();
      expect(tx.stockAdjustment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status }) })
      );
      expect(tx.notification.upsert).not.toHaveBeenCalled();
    }
  );

  it("rejects a stale pending approval without touching source or history", async () => {
    const tx = makeTransaction({ lockedApprovals: [] });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(cancelStockAdjustment(cancellationForm())).rejects.toThrow(
      "STOCK_ADJUSTMENT_NOT_CANCELLABLE"
    );

    expect(tx.stockAdjustment.updateMany).not.toHaveBeenCalled();
    expect(tx.approvalInstance.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(tx.notification.upsert).not.toHaveBeenCalled();
  });

  it("rolls approval, step, audit, and notification back when the source CAS loses", async () => {
    const tx = makeTransaction({ sourceUpdateCount: 0 });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(cancelStockAdjustment(cancellationForm())).rejects.toThrow(
      "STOCK_ADJUSTMENT_NOT_CANCELLABLE"
    );

    expect(tx.approvalInstance.updateMany).not.toHaveBeenCalled();
    expect(tx.approvalInstanceStep.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(tx.notification.upsert).not.toHaveBeenCalled();
  });

  it("revalidates permission and exact company/location approval scope after locks", async () => {
    const permissionRevokedTx = makeTransaction({ livePermission: false });
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(permissionRevokedTx)
    );
    await expect(cancelStockAdjustment(cancellationForm())).rejects.toThrow(
      "PERMISSION_DENIED"
    );
    expect(permissionRevokedTx.stockAdjustment.updateMany).not.toHaveBeenCalled();

    const scopeRevokedTx = makeTransaction({ liveScope: false });
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(scopeRevokedTx)
    );
    await expect(cancelStockAdjustment(cancellationForm())).rejects.toThrow(
      "SCOPE_DENIED"
    );
    expect(scopeRevokedTx.stockAdjustment.updateMany).not.toHaveBeenCalled();

    const scopeFilter = scopeRevokedTx.userScopeAssignment.findFirst.mock.calls[0]?.[0];
    expect(scopeFilter.where.AND.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scopeType: "LOCATION",
          scopeId: ids.location,
          accessLevel: { in: ["APPROVE", "MANAGE"] }
        }),
        expect.objectContaining({
          scopeType: "COMPANY",
          scopeId: ids.company,
          accessLevel: { in: ["APPROVE", "MANAGE"] }
        })
      ])
    );
  });

  it("rechecks the live session epoch and expiry after locking approval rows", async () => {
    const expiredSession = {
      ...session,
      authentication: {
        sessionId: ids.authSession,
        assuranceLevel: "MFA",
        mfaAuthenticatedAt: new Date(),
        absoluteExpiresAt: new Date(Date.now() + 60_000)
      }
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(expiredSession);
    const tx = makeTransaction();
    tx.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([
        { id: ids.actor, status: "ACTIVE", privilegeEpoch: 2 }
      ])
      .mockResolvedValueOnce([
        { id: ids.requester, status: "ACTIVE", privilegeEpoch: 0 }
      ])
      .mockResolvedValueOnce([
        {
          status: "ACTIVE",
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: new Date(),
          privilegeEpochAtIssue: 1,
          idleExpiresAt: new Date(Date.now() + 60_000),
          absoluteExpiresAt: new Date(Date.now() + 60_000)
        }
      ])
      .mockResolvedValueOnce([{ id: ids.approval, currentStepOrder: 1 }]);
    mockPrisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(cancelStockAdjustment(cancellationForm())).rejects.toThrow(
      "STOCK_ADJUSTMENT_CANCELLATION_AUTHORITY_STALE"
    );

    const approvalLockSql = tx.$queryRaw.mock.calls[3]?.[0].join(" ");
    expect(approvalLockSql).toContain("FOR UPDATE OF ai, s");
    expect(mockMfa.assertPrivilegedMfaForAction).not.toHaveBeenCalled();
    expect(tx.stockAdjustment.updateMany).not.toHaveBeenCalled();
  });

  it("uses locked live MFA assurance and denies before source mutation", async () => {
    const authenticatedSession = {
      ...session,
      authentication: {
        sessionId: ids.authSession,
        assuranceLevel: "PASSWORD",
        mfaAuthenticatedAt: null,
        absoluteExpiresAt: new Date(Date.now() + 60_000)
      }
    };
    const liveMfaAt = new Date();
    mockContext.requireSessionContext.mockResolvedValueOnce(authenticatedSession);
    const tx = makeTransaction();
    tx.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([
        { id: ids.actor, status: "ACTIVE", privilegeEpoch: 1 }
      ])
      .mockResolvedValueOnce([
        { id: ids.requester, status: "ACTIVE", privilegeEpoch: 0 }
      ])
      .mockResolvedValueOnce([
        {
          status: "ACTIVE",
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: liveMfaAt,
          privilegeEpochAtIssue: 1,
          idleExpiresAt: new Date(Date.now() + 60_000),
          absoluteExpiresAt: new Date(Date.now() + 60_000)
        }
      ])
      .mockResolvedValueOnce([{ id: ids.approval, currentStepOrder: 1 }]);
    mockMfa.assertPrivilegedMfaForAction.mockRejectedValueOnce(
      new Error("PRIVILEGED_MFA_STEP_UP_REQUIRED")
    );
    mockPrisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(cancelStockAdjustment(cancellationForm())).rejects.toThrow(
      "PRIVILEGED_MFA_STEP_UP_REQUIRED"
    );

    const sessionLockSql = tx.$queryRaw.mock.calls[2]?.[0].join(" ");
    const approvalLockSql = tx.$queryRaw.mock.calls[3]?.[0].join(" ");
    expect(sessionLockSql).toContain('FROM "AuthSession"');
    expect(sessionLockSql).toContain('"assuranceLevel"');
    expect(sessionLockSql).toContain('"mfaAuthenticatedAt"');
    expect(approvalLockSql).toContain("FOR UPDATE OF ai, s");
    expect(mockMfa.assertPrivilegedMfaForAction).toHaveBeenCalledWith(
      expect.objectContaining({
        authentication: expect.objectContaining({
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: liveMfaAt
        })
      }),
      expect.objectContaining({ action: "stock_adjustment.cancel" })
    );
    expect(tx.stockAdjustment.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it.each([
    { code: "P2034" },
    { code: "40P01" },
    { code: "40001" },
    { meta: { code: "40P01" } },
    { meta: { code: "40001" } }
  ])("maps database transaction conflict $code$meta to a safe loser error", async (error) => {
    mockPrisma.$transaction.mockRejectedValueOnce(error);

    await expect(cancelStockAdjustment(cancellationForm())).rejects.toThrow(
      "STOCK_ADJUSTMENT_NOT_CANCELLABLE"
    );
  });
});
