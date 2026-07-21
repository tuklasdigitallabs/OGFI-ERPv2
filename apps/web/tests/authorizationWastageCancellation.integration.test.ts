import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@ogfi/database";
import { permissions } from "../src/server/services/authorization";
import { cancelWastageReport } from "../src/server/services/wastage";
import { assertDisposableAuthorizationDatabaseConfigured } from "./authorizationDatabaseSafety";

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

describe(`wastage cancellation database concurrency (${expectedDatabase})`, () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenant: "00000000-0000-4000-8000-000000000001",
    company: "00000000-0000-4000-8000-000000000002",
    brand: "00000000-0000-4000-8000-000000000003",
    location: "00000000-0000-4000-8000-000000000004",
    inventoryLocation: "00000000-0000-4000-8000-000000000039",
    adminUser: "00000000-0000-4000-8000-000000000014",
    approvalRule: "00000000-0000-4000-8000-000000000066",
    report: randomUUID(),
    approval: randomUUID(),
    step: randomUUID()
  } as const;

  const session = {
    user: {
      id: ids.adminUser,
      email: "erp.admin@ogfi.example",
      displayName: "ERP Administrator",
      role: "ERP Administrator"
    },
    context: {
      tenantId: ids.tenant,
      companyId: ids.company,
      companyName: "OGFI Foods Corporation",
      brandId: ids.brand,
      brandName: "Golden Spoon Bistro",
      locationId: ids.location,
      locationName: "Golden Spoon - BGC",
      locationType: "BRANCH" as const
    },
    authorizedLocations: [],
    permissionCodes: [permissions.wastageCancel]
  };

  beforeAll(async () => {
    await prisma.$connect();
    mockContext.requireSessionContext.mockResolvedValue(session);
    await prisma.wastageReport.create({
      data: {
        id: ids.report,
        tenantId: ids.tenant,
        companyId: ids.company,
        inventoryLocationId: ids.inventoryLocation,
        publicReference: `WR-RACE-${suffix}`,
        reportedByUserId: ids.adminUser,
        status: "PENDING_APPROVAL",
        wastageType: "OPERATIONAL",
        reasonCode: "RACE_TEST",
        evidenceSatisfied: true
      }
    });
    await prisma.approvalInstance.create({
      data: {
        id: ids.approval,
        tenantId: ids.tenant,
        companyId: ids.company,
        documentType: "WastageReport",
        documentId: ids.report,
        approvalRuleId: ids.approvalRule,
        status: "PENDING",
        currentStepOrder: 1,
        steps: {
          create: {
            id: ids.step,
            stepOrder: 1,
            assignedUserId: ids.adminUser,
            status: "PENDING"
          }
        }
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lets a locked approval decision win without a partial cancellation", async () => {
    let releaseApproval!: () => void;
    let signalApprovalLocked!: () => void;
    const approvalRelease = new Promise<void>((resolve) => {
      releaseApproval = resolve;
    });
    const approvalLocked = new Promise<void>((resolve) => {
      signalApprovalLocked = resolve;
    });

    const approvalDecision = prisma.$transaction(async (tx) => {
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
      signalApprovalLocked();
      await approvalRelease;

      const acted = await tx.approvalInstanceStep.updateMany({
        where: { id: ids.step, status: "PENDING" },
        data: {
          status: "APPROVED",
          actedAt: new Date(),
          actedByUserId: ids.adminUser
        }
      });
      expect(acted.count).toBe(1);
      const approved = await tx.approvalInstance.updateMany({
        where: { id: ids.approval, status: "PENDING", currentStepOrder: 1 },
        data: { status: "APPROVED", currentStepOrder: null }
      });
      expect(approved.count).toBe(1);
      const sourceApproved = await tx.wastageReport.updateMany({
        where: { id: ids.report, status: "PENDING_APPROVAL" },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedByUserId: ids.adminUser
        }
      });
      expect(sourceApproved.count).toBe(1);
      await tx.auditEvent.create({
        data: {
          tenantId: ids.tenant,
          companyId: ids.company,
          actorUserId: ids.adminUser,
          eventType: "wastage_report.approved",
          entityType: "WastageReport",
          entityId: ids.report,
          beforeData: { status: "PENDING_APPROVAL" },
          afterData: { status: "APPROVED" },
          metadata: { testRun: suffix }
        }
      });
    });
    await approvalLocked;

    const formData = new FormData();
    formData.set("id", ids.report);
    formData.set(
      "cancellationReason",
      "Concurrent cancellation must lose to approval."
    );
    let cancellationSettled = false;
    const cancellationOutcome = cancelWastageReport(formData).then(
      () => ({ status: "fulfilled" as const, error: null }),
      (error: unknown) => ({ status: "rejected" as const, error })
    );
    void cancellationOutcome.then(() => {
      cancellationSettled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(cancellationSettled).toBe(false);
    releaseApproval();
    await approvalDecision;

    const outcome = await cancellationOutcome;
    expect(outcome.status).toBe("rejected");
    expect(outcome.error).toBeInstanceOf(Error);
    expect((outcome.error as Error).message).toBe("WASTAGE_NOT_CANCELLABLE");

    const [report, approval, steps, cancellationAudits] = await Promise.all([
      prisma.wastageReport.findUniqueOrThrow({ where: { id: ids.report } }),
      prisma.approvalInstance.findUniqueOrThrow({ where: { id: ids.approval } }),
      prisma.approvalInstanceStep.findMany({
        where: { approvalInstanceId: ids.approval }
      }),
      prisma.auditEvent.count({
        where: {
          tenantId: ids.tenant,
          entityType: "WastageReport",
          entityId: ids.report,
          eventType: "wastage_report.cancelled"
        }
      })
    ]);
    expect(report.status).toBe("APPROVED");
    expect(report.cancelledAt).toBeNull();
    expect(report.cancellationReason).toBeNull();
    expect(approval.status).toBe("APPROVED");
    expect(steps.map(({ status }) => status)).toEqual(["APPROVED"]);
    expect(cancellationAudits).toBe(0);
  });
});
