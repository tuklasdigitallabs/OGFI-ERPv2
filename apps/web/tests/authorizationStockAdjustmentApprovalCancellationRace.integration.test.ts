import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@ogfi/database";
import { permissions } from "../src/server/services/authorization";
import type { SessionContext } from "../src/server/services/context";
import { approveStockAdjustment } from "../src/server/services/approvals";
import { cancelStockAdjustment } from "../src/server/services/stockAdjustments";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const mockContext = vi.hoisted(() => ({
  requireSessionContext: vi.fn()
}));

vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<
    typeof import("../src/server/services/context")
  >("../src/server/services/context");
  return {
    ...actual,
    requireSessionContext: mockContext.requireSessionContext
  };
});

const expectedDatabase =
  assertDisposableAuthorizationDatabaseConfigured(process.env);

describe(`stock-adjustment final approval versus cancellation (${expectedDatabase})`, () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenant: randomUUID(),
    company: randomUUID(),
    brand: randomUUID(),
    location: randomUUID(),
    inventoryLocation: randomUUID(),
    requester: randomUUID(),
    approver: randomUUID(),
    requesterRole: randomUUID(),
    approverRole: randomUUID(),
    requesterRoleAssignment: randomUUID(),
    approverRoleAssignment: randomUUID(),
    requesterScope: randomUUID(),
    approverScope: randomUUID(),
    requesterSession: randomUUID(),
    approverSession: randomUUID(),
    approvalRule: randomUUID(),
    adjustment: randomUUID(),
    approval: randomUUID(),
    step: randomUUID(),
    duplicateAdjustment: randomUUID()
  };

  const sessionExpiry = new Date(Date.now() + 60 * 60_000);
  const requesterSession: SessionContext = {
    user: {
      id: ids.requester,
      email: `stock-adjustment-requester-${suffix}@example.test`,
      displayName: "Stock Adjustment Requester",
      role: "Stock Adjustment Requester"
    },
    context: {
      tenantId: ids.tenant,
      companyId: ids.company,
      companyName: `Stock Adjustment Company ${suffix}`,
      brandId: ids.brand,
      brandName: `Stock Adjustment Brand ${suffix}`,
      locationId: ids.location,
      locationName: `Stock Adjustment Location ${suffix}`,
      locationType: "BRANCH"
    },
    authorizedLocations: [],
    permissionCodes: [permissions.stockAdjustmentCancel],
    authentication: {
      sessionId: ids.requesterSession,
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: new Date(),
      absoluteExpiresAt: sessionExpiry
    }
  };
  const approverSession: SessionContext = {
    ...requesterSession,
    user: {
      id: ids.approver,
      email: `stock-adjustment-approver-${suffix}@example.test`,
      displayName: "Stock Adjustment Approver",
      role: "Stock Adjustment Approver"
    },
    permissionCodes: [permissions.stockAdjustmentApprove],
    authentication: {
      sessionId: ids.approverSession,
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: new Date(),
      absoluteExpiresAt: sessionExpiry
    }
  };

  beforeAll(async () => {
    process.env.AUTH_MODE = "local";
    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    if (identity[0]?.currentDatabase !== expectedDatabase) {
      throw new Error("STOCK_ADJUSTMENT_RACE_DATABASE_IDENTITY_MISMATCH");
    }

    await prisma.tenant.create({
      data: {
        id: ids.tenant,
        name: `Stock Adjustment Race Tenant ${suffix}`,
        loginCode: `stock-adjustment-race-${suffix}`
      }
    });
    await prisma.company.create({
      data: {
        id: ids.company,
        tenantId: ids.tenant,
        code: `SAR-${suffix}`,
        legalName: `Stock Adjustment Race Company ${suffix}`,
        currencyCode: "PHP"
      }
    });
    await prisma.brand.create({
      data: {
        id: ids.brand,
        tenantId: ids.tenant,
        companyId: ids.company,
        code: `SAR-${suffix}`,
        name: `Stock Adjustment Race Brand ${suffix}`
      }
    });
    await prisma.location.create({
      data: {
        id: ids.location,
        tenantId: ids.tenant,
        companyId: ids.company,
        brandId: ids.brand,
        locationType: "BRANCH",
        code: `SAR-${suffix}`,
        name: `Stock Adjustment Race Location ${suffix}`
      }
    });
    await prisma.inventoryLocation.create({
      data: {
        id: ids.inventoryLocation,
        tenantId: ids.tenant,
        companyId: ids.company,
        locationId: ids.location,
        code: `SAR-${suffix}`,
        name: `Stock Adjustment Race Store ${suffix}`
      }
    });
    await prisma.user.createMany({
      data: [
        {
          id: ids.requester,
          tenantId: ids.tenant,
          email: requesterSession.user.email,
          displayName: requesterSession.user.displayName
        },
        {
          id: ids.approver,
          tenantId: ids.tenant,
          email: approverSession.user.email,
          displayName: approverSession.user.displayName
        }
      ]
    });
    await prisma.role.createMany({
      data: [
        {
          id: ids.requesterRole,
          tenantId: ids.tenant,
          code: `SAR_REQUESTER_${suffix}`,
          name: "Stock Adjustment Race Requester"
        },
        {
          id: ids.approverRole,
          tenantId: ids.tenant,
          code: `SAR_APPROVER_${suffix}`,
          name: "Stock Adjustment Race Approver"
        }
      ]
    });
    const cancelPermission = await prisma.permission.upsert({
      where: { code: permissions.stockAdjustmentCancel },
      update: {},
      create: {
        code: permissions.stockAdjustmentCancel,
        module: "inventory",
        action: "stock_adjustment.cancel"
      },
      select: { id: true }
    });
    const approvePermission = await prisma.permission.upsert({
      where: { code: permissions.stockAdjustmentApprove },
      update: {},
      create: {
        code: permissions.stockAdjustmentApprove,
        module: "inventory",
        action: "stock_adjustment.approve"
      },
      select: { id: true }
    });
    await prisma.rolePermission.createMany({
      data: [
        {
          roleId: ids.requesterRole,
          permissionId: cancelPermission.id
        },
        {
          roleId: ids.approverRole,
          permissionId: approvePermission.id
        }
      ]
    });
    await prisma.userRoleAssignment.createMany({
      data: [
        {
          id: ids.requesterRoleAssignment,
          userId: ids.requester,
          roleId: ids.requesterRole
        },
        {
          id: ids.approverRoleAssignment,
          userId: ids.approver,
          roleId: ids.approverRole
        }
      ]
    });
    await prisma.userScopeAssignment.createMany({
      data: [
        {
          id: ids.requesterScope,
          userId: ids.requester,
          scopeType: "LOCATION",
          scopeId: ids.location,
          accessLevel: "APPROVE"
        },
        {
          id: ids.approverScope,
          userId: ids.approver,
          scopeType: "LOCATION",
          scopeId: ids.location,
          accessLevel: "APPROVE"
        }
      ]
    });
    await prisma.authSession.createMany({
      data: [
        {
          id: ids.requesterSession,
          tenantId: ids.tenant,
          userId: ids.requester,
          tokenHash: `stock-adjustment-requester-${suffix}`,
          status: "ACTIVE",
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: new Date(),
          privilegeEpochAtIssue: 0,
          idleExpiresAt: sessionExpiry,
          absoluteExpiresAt: sessionExpiry
        },
        {
          id: ids.approverSession,
          tenantId: ids.tenant,
          userId: ids.approver,
          tokenHash: `stock-adjustment-approver-${suffix}`,
          status: "ACTIVE",
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: new Date(),
          privilegeEpochAtIssue: 0,
          idleExpiresAt: sessionExpiry,
          absoluteExpiresAt: sessionExpiry
        }
      ]
    });
    await prisma.approvalRule.create({
      data: {
        id: ids.approvalRule,
        tenantId: ids.tenant,
        companyId: ids.company,
        transactionType: "StockAdjustment",
        steps: {
          create: {
            stepOrder: 1,
            approverType: "USER",
            userId: ids.approver
          }
        }
      }
    });
    await prisma.stockAdjustment.createMany({
      data: [
        {
          id: ids.adjustment,
          tenantId: ids.tenant,
          companyId: ids.company,
          inventoryLocationId: ids.inventoryLocation,
          publicReference: `SA-RACE-${suffix}`,
          requestedByUserId: ids.requester,
          status: "PENDING_APPROVAL",
          adjustmentType: "INCREASE",
          reasonCode: "RACE_TEST",
          reasonDescription: "Disposable final approval cancellation race"
        },
        {
          id: ids.duplicateAdjustment,
          tenantId: ids.tenant,
          companyId: ids.company,
          inventoryLocationId: ids.inventoryLocation,
          publicReference: `SA-DUPLICATE-${suffix}`,
          requestedByUserId: ids.requester,
          status: "DRAFT",
          adjustmentType: "INCREASE",
          reasonCode: "DUPLICATE_TEST",
          reasonDescription: "Disposable duplicate cancellation test"
        }
      ]
    });
    await prisma.approvalInstance.create({
      data: {
        id: ids.approval,
        tenantId: ids.tenant,
        companyId: ids.company,
        documentType: "StockAdjustment",
        documentId: ids.adjustment,
        approvalRuleId: ids.approvalRule,
        status: "PENDING",
        currentStepOrder: 1,
        steps: {
          create: {
            id: ids.step,
            stepOrder: 1,
            assignedUserId: ids.approver,
            status: "PENDING"
          }
        }
      }
    });
  });

  afterAll(async () => {
    delete process.env.AUTH_MODE;
    await prisma.$disconnect();
  });

  it("commits exactly one atomic final approve or cancel outcome", async () => {
    let releaseBlocker!: () => void;
    let signalBlocked!: () => void;
    const blockerRelease = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const blockerLocked = new Promise<void>((resolve) => {
      signalBlocked = resolve;
    });
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT ai.id
          FROM "ApprovalInstance" ai
          JOIN "ApprovalInstanceStep" s
            ON s."approvalInstanceId" = ai.id
           AND s."stepOrder" = ai."currentStepOrder"
         WHERE ai.id = ${ids.approval}::uuid
           AND s.id = ${ids.step}::uuid
         FOR UPDATE OF ai, s
      `;
      signalBlocked();
      await blockerRelease;
    });
    await blockerLocked;

    mockContext.requireSessionContext
      .mockResolvedValueOnce(approverSession)
      .mockResolvedValueOnce(requesterSession);

    const approveForm = new FormData();
    approveForm.set("approvalInstanceId", ids.approval);
    approveForm.set("remarks", "Approved in disposable concurrency test.");
    const cancelForm = new FormData();
    cancelForm.set("id", ids.adjustment);
    cancelForm.set(
      "cancellationReason",
      "Cancelled in disposable concurrency test."
    );

    const approveOutcome = approveStockAdjustment(approveForm).then(
      () => ({ status: "fulfilled" as const, error: null }),
      (error: unknown) => ({ status: "rejected" as const, error })
    );
    const cancelOutcome = cancelStockAdjustment(cancelForm).then(
      () => ({ status: "fulfilled" as const, error: null }),
      (error: unknown) => ({ status: "rejected" as const, error })
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
    releaseBlocker();
    await blocker;
    const outcomes = await Promise.all([approveOutcome, cancelOutcome]);

    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const loser = outcomes.find(({ status }) => status === "rejected");
    expect(loser?.error).toBeInstanceOf(Error);
    expect((loser?.error as Error).message).toMatch(
      /^(APPROVAL_NOT_ACTIONABLE|STOCK_ADJUSTMENT_NOT_CANCELLABLE)$/
    );
    expect((loser?.error as Error).message).not.toMatch(
      /P2034|40P01|40001|deadlock|serialization/i
    );

    const [adjustment, approval, step, approvedAudits, cancelledAudits, notifications] =
      await Promise.all([
        prisma.stockAdjustment.findUniqueOrThrow({
          where: { id: ids.adjustment }
        }),
        prisma.approvalInstance.findUniqueOrThrow({
          where: { id: ids.approval }
        }),
        prisma.approvalInstanceStep.findUniqueOrThrow({
          where: { id: ids.step }
        }),
        prisma.auditEvent.count({
          where: {
            tenantId: ids.tenant,
            entityType: "StockAdjustment",
            entityId: ids.adjustment,
            eventType: "stock_adjustment.approved"
          }
        }),
        prisma.auditEvent.count({
          where: {
            tenantId: ids.tenant,
            entityType: "StockAdjustment",
            entityId: ids.adjustment,
            eventType: "stock_adjustment.cancelled"
          }
        }),
        prisma.notification.findMany({
          where: {
            tenantId: ids.tenant,
            entityType: "StockAdjustment",
            entityId: ids.adjustment,
            notificationType: {
              startsWith: "APPROVAL_OUTCOME_"
            }
          }
        })
      ]);

    if (adjustment.status === "APPROVED") {
      expect(approval.status).toBe("APPROVED");
      expect(approval.currentStepOrder).toBeNull();
      expect(step.status).toBe("APPROVED");
      expect(step.actedByUserId).toBe(ids.approver);
      expect(approvedAudits).toBe(1);
      expect(cancelledAudits).toBe(0);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.notificationType).toBe(
        "APPROVAL_OUTCOME_APPROVED"
      );
    } else {
      expect(adjustment.status).toBe("CANCELLED");
      expect(adjustment.cancelledByUserId).toBe(ids.requester);
      expect(approval.status).toBe("CANCELLED");
      expect(approval.currentStepOrder).toBeNull();
      expect(step.status).toBe("SKIPPED");
      expect(step.actedByUserId).toBeNull();
      expect(approvedAudits).toBe(0);
      expect(cancelledAudits).toBe(1);
      expect(notifications).toHaveLength(0);
    }
  });

  it("makes duplicate cancellation a safe no-op loser with one audit", async () => {
    mockContext.requireSessionContext.mockResolvedValue(requesterSession);
    const formData = new FormData();
    formData.set("id", ids.duplicateAdjustment);
    formData.set("cancellationReason", "Duplicate cancellation test reason.");

    await expect(cancelStockAdjustment(formData)).resolves.toBeUndefined();
    await expect(cancelStockAdjustment(formData)).rejects.toThrow(
      "STOCK_ADJUSTMENT_NOT_CANCELLABLE"
    );

    const [adjustment, audits, outcomeNotifications] = await Promise.all([
      prisma.stockAdjustment.findUniqueOrThrow({
        where: { id: ids.duplicateAdjustment }
      }),
      prisma.auditEvent.count({
        where: {
          tenantId: ids.tenant,
          entityType: "StockAdjustment",
          entityId: ids.duplicateAdjustment,
          eventType: "stock_adjustment.cancelled"
        }
      }),
      prisma.notification.count({
        where: {
          tenantId: ids.tenant,
          entityType: "StockAdjustment",
          entityId: ids.duplicateAdjustment,
          notificationType: { startsWith: "APPROVAL_OUTCOME_" }
        }
      })
    ]);
    expect(adjustment.status).toBe("CANCELLED");
    expect(adjustment.cancelledByUserId).toBe(ids.requester);
    expect(audits).toBe(1);
    expect(outcomeNotifications).toBe(0);
  });
});
