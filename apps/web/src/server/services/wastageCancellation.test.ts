import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissions } from "./authorization";
import { cancelWastageReport } from "./wastage";

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  userRoleAssignment: {
    findMany: vi.fn()
  },
  wastageReport: {
    findFirst: vi.fn()
  }
}));

const mockContext = vi.hoisted(() => ({
  requireSessionContext: vi.fn()
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

const ids = {
  tenant: "00000000-0000-4000-8000-000000000001",
  company: "00000000-0000-4000-8000-000000000002",
  brand: "00000000-0000-4000-8000-000000000003",
  location: "00000000-0000-4000-8000-000000000004",
  user: "00000000-0000-4000-8000-000000000005",
  report: "00000000-0000-4000-8000-000000000006",
  approval: "00000000-0000-4000-8000-000000000007",
  authSession: "00000000-0000-4000-8000-000000000008"
} as const;

const session = {
  user: {
    id: ids.user,
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
  permissionCodes: [permissions.wastageCancel]
};

function cancellationForm() {
  const formData = new FormData();
  formData.set("id", ids.report);
  formData.set("cancellationReason", "Duplicate report entered by mistake.");
  return formData;
}

function makeTransaction(input?: {
  lockedApprovals?: Array<{ id: string; currentStepOrder: number }>;
  approvalUpdateCount?: number;
  reportUpdateCount?: number;
  livePermission?: boolean;
  liveScope?: boolean;
}) {
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([{ status: "ACTIVE", privilegeEpoch: 1 }])
      .mockResolvedValueOnce(
        input?.lockedApprovals ?? [{ id: ids.approval, currentStepOrder: 1 }]
      ),
    userRoleAssignment: {
      findFirst: vi
        .fn()
        .mockResolvedValue(input?.livePermission === false ? null : { id: "role-assignment" })
    },
    userScopeAssignment: {
      findFirst: vi
        .fn()
        .mockResolvedValue(input?.liveScope === false ? null : { id: "scope-assignment" })
    },
    approvalInstance: {
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: input?.approvalUpdateCount ?? 1 })
    },
    approvalInstanceStep: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    wastageReport: {
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: input?.reportUpdateCount ?? 1 })
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({ id: "audit-event" })
    }
  };
  return tx;
}

describe("wastage cancellation concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.requireSessionContext.mockResolvedValue(session);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: ids.tenant,
                code: permissions.wastageCancel
              }
            }
          ]
        }
      }
    ]);
    mockPrisma.wastageReport.findFirst.mockResolvedValue({
      id: ids.report,
      status: "PENDING_APPROVAL"
    });
  });

  it("locks and cancels the pending approval before changing the source report", async () => {
    const tx = makeTransaction();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(cancelWastageReport(cancellationForm())).resolves.toBeUndefined();

    const approvalLockSql = tx.$queryRaw.mock.calls[1]?.[0].join(" ");
    expect(approvalLockSql).toContain('JOIN "ApprovalInstanceStep"');
    expect(approvalLockSql).toContain("FOR UPDATE OF ai, s");
    expect(tx.approvalInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: ids.approval,
          tenantId: ids.tenant,
          companyId: ids.company,
          status: "PENDING",
          currentStepOrder: 1
        })
      })
    );
    const approvalUpdateOrder =
      tx.approvalInstance.updateMany.mock.invocationCallOrder[0];
    const reportUpdateOrder =
      tx.wastageReport.updateMany.mock.invocationCallOrder[0];
    expect(approvalUpdateOrder).toBeDefined();
    expect(reportUpdateOrder).toBeDefined();
    expect(approvalUpdateOrder ?? 0).toBeLessThan(reportUpdateOrder ?? 0);
    expect(tx.wastageReport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: ids.report,
          tenantId: ids.tenant,
          companyId: ids.company,
          status: "PENDING_APPROVAL",
          inventoryLocation: { locationId: ids.location }
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it.each(["APPROVED", "RETURNED", "REJECTED"])(
    "does not overwrite a concurrent %s approval decision",
    async () => {
      const tx = makeTransaction({ lockedApprovals: [] });
      mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

      await expect(cancelWastageReport(cancellationForm())).rejects.toThrow(
        "WASTAGE_NOT_CANCELLABLE"
      );

      expect(tx.approvalInstance.updateMany).not.toHaveBeenCalled();
      expect(tx.wastageReport.updateMany).not.toHaveBeenCalled();
      expect(tx.auditEvent.create).not.toHaveBeenCalled();
    }
  );

  it("rejects a stale source CAS so approval and step changes roll back atomically", async () => {
    const tx = makeTransaction({ reportUpdateCount: 0 });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(cancelWastageReport(cancellationForm())).rejects.toThrow(
      "WASTAGE_NOT_CANCELLABLE"
    );

    expect(tx.approvalInstance.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.approvalInstanceStep.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("revalidates live permission and location scope after locking approvals", async () => {
    const permissionRevokedTx = makeTransaction({ livePermission: false });
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(permissionRevokedTx)
    );
    await expect(cancelWastageReport(cancellationForm())).rejects.toThrow(
      "PERMISSION_DENIED"
    );
    expect(permissionRevokedTx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(permissionRevokedTx.wastageReport.updateMany).not.toHaveBeenCalled();

    const scopeRevokedTx = makeTransaction({ liveScope: false });
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(scopeRevokedTx)
    );
    await expect(cancelWastageReport(cancellationForm())).rejects.toThrow(
      "SCOPE_DENIED"
    );
    expect(scopeRevokedTx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(scopeRevokedTx.wastageReport.updateMany).not.toHaveBeenCalled();
  });

  it("rechecks session expiry after acquiring the approval lock", async () => {
    const tx = makeTransaction();
    tx.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ status: "ACTIVE", privilegeEpoch: 1 }])
      .mockResolvedValueOnce([
        {
          status: "ACTIVE",
          privilegeEpochAtIssue: 1,
          idleExpiresAt: new Date(Date.now() - 1),
          absoluteExpiresAt: new Date(Date.now() + 60_000)
        }
      ])
      .mockResolvedValueOnce([{ id: ids.approval, currentStepOrder: 1 }]);
    mockContext.requireSessionContext.mockResolvedValueOnce({
      ...session,
      authentication: {
        sessionId: ids.authSession,
        assuranceLevel: "MFA",
        mfaAuthenticatedAt: new Date(),
        absoluteExpiresAt: new Date(Date.now() + 60_000)
      }
    });
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(cancelWastageReport(cancellationForm())).rejects.toThrow(
      "WASTAGE_CANCELLATION_AUTHORITY_STALE"
    );

    const approvalLockSql = tx.$queryRaw.mock.calls[2]?.[0].join(" ");
    expect(approvalLockSql).toContain("FOR UPDATE OF ai, s");
    expect(tx.userRoleAssignment.findFirst).not.toHaveBeenCalled();
    expect(tx.approvalInstance.updateMany).not.toHaveBeenCalled();
    expect(tx.wastageReport.updateMany).not.toHaveBeenCalled();
  });
});
