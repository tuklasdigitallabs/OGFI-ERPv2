import { randomUUID } from "node:crypto";
import { prisma } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { getBoundedInventoryUatApprovalReview } from "../src/server/services/boundedApprovalReview";
import { executeEligibleApprovalDecision } from "../src/server/services/approvals";
import type { SessionContext } from "../src/server/services/context";
import { submitStockCount } from "../src/server/services/stockCounts";
import { submitInventoryTransfer } from "../src/server/services/transfers";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";
import {
  createApprovalDecisionPgFixture,
  createSharedProcurementInventorySource,
  type ApprovalDecisionPgFixture,
  type SharedProcurementInventoryFamily,
} from "./helpers/approvalDecisionPgFixtures";
import {
  actionForm,
  createInventoryPilotApprovalPgFixture,
} from "./helpers/inventoryPilotApprovalPgFixtures";

const contextMock = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));
vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<
    typeof import("../src/server/services/context")
  >("../src/server/services/context");
  return { ...actual, requireSessionContext: contextMock.requireSessionContext };
});

const runPg = process.env.RUN_APPROVAL_ROUTING_PG_TESTS === "true";
const expectedDatabase = runPg
  ? assertDisposableAuthorizationDatabaseConfigured(process.env)
  : null;
const priorEnvironment = new Map<string, string | undefined>();
const admittedEnvironment = {
  NODE_ENV: "production",
  APP_ENV: "uat",
  CI: "true",
  AUTH_MODE: "local",
  AUTH_HARDENED_UAT_RUNTIME_ENABLED: "true",
  BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED: "true",
  APPROVAL_ROUTING_V1_ENABLED: "false",
  INVENTORY_TRANSFER_APPROVAL_V1_ENABLED: "true",
  STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED: "true",
  AUTH_SECRET: "approval-review-seven-family-pg-test-secret-20260806-only",
} as const;

type SharedBoundedFamily = Extract<
  SharedProcurementInventoryFamily,
  | "QuotationRecommendation"
  | "PurchaseOrder"
  | "WastageReport"
  | "StockAdjustment"
>;

const sharedFamilies = [
  "QuotationRecommendation",
  "PurchaseOrder",
  "WastageReport",
  "StockAdjustment",
] as const satisfies readonly SharedBoundedFamily[];

const expectedSharedStatus = {
  QuotationRecommendation: "APPROVED",
  PurchaseOrder: "APPROVED",
  WastageReport: "APPROVED",
  StockAdjustment: "APPROVED",
} as const;

function restoreEnvironment() {
  for (const [name, value] of priorEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function createLiveSession(
  fixture: ApprovalDecisionPgFixture,
): Promise<SessionContext> {
  const base = fixture.sessionFor(1);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: base.user.id },
    select: { privilegeEpoch: true },
  });
  const now = new Date();
  const authSession = await prisma.authSession.create({
    data: {
      tenantId: fixture.tenantId,
      userId: base.user.id,
      tokenHash: `approval-review-seven-family-${randomUUID()}`,
      status: "ACTIVE",
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: now,
      privilegeEpochAtIssue: user.privilegeEpoch,
      idleExpiresAt: new Date(now.getTime() + 30 * 60_000),
      absoluteExpiresAt: new Date(now.getTime() + 60 * 60_000),
    },
    select: { id: true, absoluteExpiresAt: true },
  });
  return {
    ...base,
    authentication: {
      sessionId: authSession.id,
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: now,
      absoluteExpiresAt: authSession.absoluteExpiresAt,
    },
  };
}

async function createSharedScenario(family: SharedBoundedFamily) {
  const fixture = await createApprovalDecisionPgFixture({
    family,
    steps: 1,
    createSource: (context) =>
      createSharedProcurementInventorySource(family, context),
  });
  if (family === "QuotationRecommendation") {
    const recommendation = await prisma.quotationRecommendation.findUniqueOrThrow({
      where: { id: fixture.sourceId },
      select: {
        selectedSupplierQuotationId: true,
        quotationRequest: {
          select: {
            purchaseRequest: {
              select: {
                lines: {
                  take: 1,
                  orderBy: { lineNumber: "asc" },
                  select: { id: true, itemId: true, uomId: true },
                },
              },
            },
          },
        },
      },
    });
    const sourceLine = recommendation.quotationRequest.purchaseRequest.lines[0];
    if (!sourceLine?.itemId || !sourceLine.uomId) {
      throw new Error("APPROVAL_REVIEW_QUOTE_LINE_FIXTURE_INCOMPLETE");
    }
    await prisma.supplierQuotationLine.create({
      data: {
        supplierQuotationId: recommendation.selectedSupplierQuotationId,
        sourcePrLineId: sourceLine.id,
        itemId: sourceLine.itemId,
        quantity: 10,
        uomId: sourceLine.uomId,
        unitPrice: 1,
        lineTotal: 10,
        availabilityStatus: "AVAILABLE",
      },
    });
  }
  return { fixture, session: await createLiveSession(fixture) };
}

async function readSharedStatus(family: SharedBoundedFamily, sourceId: string) {
  if (family === "QuotationRecommendation") {
    return (await prisma.quotationRecommendation.findUniqueOrThrow({
      where: { id: sourceId },
      select: { status: true },
    })).status;
  }
  if (family === "PurchaseOrder") {
    return (await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: sourceId },
      select: { status: true },
    })).status;
  }
  if (family === "WastageReport") {
    return (await prisma.wastageReport.findUniqueOrThrow({
      where: { id: sourceId },
      select: { status: true },
    })).status;
  }
  return (await prisma.stockAdjustment.findUniqueOrThrow({
    where: { id: sourceId },
    select: { status: true },
  })).status;
}

async function scopedInventoryCounts(input: {
  tenantId: string;
  companyId: string;
}) {
  const where = { tenantId: input.tenantId, companyId: input.companyId };
  const [movements, balances] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryBalance.count({ where }),
  ]);
  return { movements, balances };
}

async function reviewedDecision(input: {
  session: SessionContext;
  approvalInstanceId: string;
}) {
  const review = await getBoundedInventoryUatApprovalReview(
    input.session,
    input.approvalInstanceId,
  );
  contextMock.requireSessionContext.mockResolvedValue(input.session);
  await executeEligibleApprovalDecision({
    approvalInstanceId: input.approvalInstanceId,
    decision: "APPROVE",
    remarks: `Reviewed current ${review.family} snapshot.`,
    reviewToken: review.reviewToken,
  });
  return review;
}

async function expectReviewAudit(input: {
  tenantId: string;
  approvalInstanceId: string;
  family: string;
  reviewDigest: string;
  reviewToken: string;
}) {
  const [events, allAuditMetadata] = await Promise.all([
    prisma.auditEvent.findMany({
      where: {
        tenantId: input.tenantId,
        entityType: "ApprovalInstance",
        entityId: input.approvalInstanceId,
        eventType: "approval.review_snapshot_verified",
      },
      select: { metadata: true },
    }),
    prisma.auditEvent.findMany({
      where: { tenantId: input.tenantId },
      select: { metadata: true },
    }),
  ]);
  expect(events).toHaveLength(1);
  expect(events[0]?.metadata).toEqual(expect.objectContaining({
    approvalReviewFamily: input.family,
    approvalReviewDigest: input.reviewDigest,
    reviewTokenPersisted: false,
  }));
  expect(JSON.stringify(allAuditMetadata)).not.toContain(input.reviewToken);
}

function reviewAuditCount(input: {
  tenantId: string;
  approvalInstanceId: string;
}) {
  return prisma.auditEvent.count({
    where: {
      tenantId: input.tenantId,
      entityType: "ApprovalInstance",
      entityId: input.approvalInstanceId,
      eventType: "approval.review_snapshot_verified",
    },
  });
}

async function withGlobalRoutingForAdmission<T>(operation: () => Promise<T>) {
  process.env.APPROVAL_ROUTING_V1_ENABLED = "true";
  try {
    return await operation();
  } finally {
    process.env.APPROVAL_ROUTING_V1_ENABLED = "false";
  }
}

describe.skipIf(!runPg).sequential(
  "DEC-0270 seven-family reviewed-decision PostgreSQL acceptance",
  () => {
    beforeAll(async () => {
      for (const [name, value] of Object.entries(admittedEnvironment)) {
        priorEnvironment.set(name, process.env[name]);
        process.env[name] = value;
      }
      await prisma.$connect();
      await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
      const database = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
        SELECT current_database() AS "currentDatabase"
      `;
      expect(database).toEqual([{ currentDatabase: expectedDatabase }]);
    });

    afterAll(async () => {
      restoreEnvironment();
      await prisma.$disconnect();
    });

    test.each(sharedFamilies)(
      "%s approves exactly once from a signed current review without posting inventory",
      async (family) => {
        const { fixture, session } = await createSharedScenario(family);
        const beforeInventory = await scopedInventoryCounts(fixture);
        const review = await reviewedDecision({
          session,
          approvalInstanceId: fixture.approvalInstanceId,
        });

        expect(await readSharedStatus(family, fixture.sourceId))
          .toBe(expectedSharedStatus[family]);
        await expect(prisma.approvalInstance.findUniqueOrThrow({
          where: { id: fixture.approvalInstanceId },
          select: { status: true, currentStepOrder: true },
        })).resolves.toEqual({ status: "APPROVED", currentStepOrder: null });
        await expect(scopedInventoryCounts(fixture)).resolves.toEqual(beforeInventory);
        await expectReviewAudit({
          tenantId: fixture.tenantId,
          approvalInstanceId: fixture.approvalInstanceId,
          family,
          reviewDigest: "reviewDigest" in review
            ? review.reviewDigest
            : review.snapshotDigest,
          reviewToken: review.reviewToken,
        });

        const committed = {
          sourceStatus: await readSharedStatus(family, fixture.sourceId),
          approval: await prisma.approvalInstance.findUniqueOrThrow({
            where: { id: fixture.approvalInstanceId },
          }),
          inventory: await scopedInventoryCounts(fixture),
          reviewAudits: await reviewAuditCount({
            tenantId: fixture.tenantId,
            approvalInstanceId: fixture.approvalInstanceId,
          }),
        };
        contextMock.requireSessionContext.mockResolvedValue(session);
        await expect(executeEligibleApprovalDecision({
          approvalInstanceId: fixture.approvalInstanceId,
          decision: "APPROVE",
          reviewToken: review.reviewToken,
        })).rejects.toThrow("APPROVAL_WORKLIST_ITEM_UNAVAILABLE");
        expect({
          sourceStatus: await readSharedStatus(family, fixture.sourceId),
          approval: await prisma.approvalInstance.findUniqueOrThrow({
            where: { id: fixture.approvalInstanceId },
          }),
          inventory: await scopedInventoryCounts(fixture),
          reviewAudits: await reviewAuditCount({
            tenantId: fixture.tenantId,
            approvalInstanceId: fixture.approvalInstanceId,
          }),
        }).toEqual(committed);
      },
      30_000,
    );

    test("InventoryTransfer approves exactly once without custody or ledger movement", async () => {
      const fixture = await createInventoryPilotApprovalPgFixture();
      const transferId = await fixture.createDraftTransfer();
      contextMock.requireSessionContext.mockResolvedValue(fixture.requesterSession);
      await withGlobalRoutingForAdmission(() => submitInventoryTransfer(actionForm({
        id: transferId,
        idempotencyKey: `review-transfer-${fixture.tenantId}`,
      })));
      const approval = await prisma.approvalInstance.findFirstOrThrow({
        where: {
          tenantId: fixture.tenantId,
          companyId: fixture.companyId,
          documentType: "InventoryTransfer",
          documentId: transferId,
        },
        select: { id: true },
      });
      const beforeInventory = await scopedInventoryCounts(fixture);
      const review = await reviewedDecision({
        session: fixture.approverSession,
        approvalInstanceId: approval.id,
      });
      if (review.family !== "InventoryTransfer") {
        throw new Error("APPROVAL_REVIEW_FAMILY_MISMATCH");
      }

      await expect(prisma.inventoryTransfer.findUniqueOrThrow({
        where: { id: transferId },
        select: {
          status: true,
          version: true,
          dispatchedAt: true,
          receivedAt: true,
        },
      })).resolves.toEqual({
        status: "REQUESTED",
        version: 3,
        dispatchedAt: null,
        receivedAt: null,
      });
      await expect(scopedInventoryCounts(fixture)).resolves.toEqual(beforeInventory);
      await expect(prisma.approvalInstance.findUniqueOrThrow({
        where: { id: approval.id },
        select: { status: true, currentStepOrder: true },
      })).resolves.toEqual({ status: "APPROVED", currentStepOrder: null });
      await expectReviewAudit({
        tenantId: fixture.tenantId,
        approvalInstanceId: approval.id,
        family: "InventoryTransfer",
        reviewDigest: review.snapshotDigest,
        reviewToken: review.reviewToken,
      });
      contextMock.requireSessionContext.mockResolvedValue(fixture.approverSession);
      await expect(executeEligibleApprovalDecision({
        approvalInstanceId: approval.id,
        decision: "APPROVE",
        reviewToken: review.reviewToken,
      })).rejects.toThrow("APPROVAL_WORKLIST_ITEM_UNAVAILABLE");
      await expect(scopedInventoryCounts(fixture)).resolves.toEqual(beforeInventory);
      await expect(reviewAuditCount({
        tenantId: fixture.tenantId,
        approvalInstanceId: approval.id,
      })).resolves.toBe(1);
    }, 30_000);

    test("StockCountAttemptReview approves the pinned attempt exactly once without posting variance", async () => {
      const fixture = await createInventoryPilotApprovalPgFixture();
      const count = await fixture.createInProgressStockCount();
      contextMock.requireSessionContext.mockResolvedValue(fixture.requesterSession);
      await withGlobalRoutingForAdmission(() => submitStockCount(actionForm({
        id: count.sessionId,
        idempotencyKey: `review-count-${fixture.tenantId}`,
      })));
      const approval = await prisma.approvalInstance.findFirstOrThrow({
        where: {
          tenantId: fixture.tenantId,
          companyId: fixture.companyId,
          documentType: "StockCountAttemptReview",
          documentId: count.attemptId,
        },
        select: { id: true },
      });
      const beforeInventory = await scopedInventoryCounts(fixture);
      const review = await reviewedDecision({
        session: fixture.approverSession,
        approvalInstanceId: approval.id,
      });
      if (review.family !== "StockCountAttemptReview") {
        throw new Error("APPROVAL_REVIEW_FAMILY_MISMATCH");
      }

      await expect(prisma.stockCountSession.findUniqueOrThrow({
        where: { id: count.sessionId },
        select: { status: true, version: true, currentAttemptId: true },
      })).resolves.toEqual({
        status: "REVIEWED",
        version: 3,
        currentAttemptId: count.attemptId,
      });
      await expect(prisma.stockCountAttempt.findUniqueOrThrow({
        where: { id: count.attemptId },
        select: { status: true, version: true },
      })).resolves.toEqual({ status: "REVIEWED", version: 3 });
      await expect(scopedInventoryCounts(fixture)).resolves.toEqual(beforeInventory);
      await expect(prisma.approvalInstance.findUniqueOrThrow({
        where: { id: approval.id },
        select: { status: true, currentStepOrder: true },
      })).resolves.toEqual({ status: "APPROVED", currentStepOrder: null });
      await expectReviewAudit({
        tenantId: fixture.tenantId,
        approvalInstanceId: approval.id,
        family: "StockCountAttemptReview",
        reviewDigest: review.snapshotDigest,
        reviewToken: review.reviewToken,
      });
      contextMock.requireSessionContext.mockResolvedValue(fixture.approverSession);
      await expect(executeEligibleApprovalDecision({
        approvalInstanceId: approval.id,
        decision: "APPROVE",
        reviewToken: review.reviewToken,
      })).rejects.toThrow("APPROVAL_WORKLIST_ITEM_UNAVAILABLE");
      await expect(scopedInventoryCounts(fixture)).resolves.toEqual(beforeInventory);
      await expect(reviewAuditCount({
        tenantId: fixture.tenantId,
        approvalInstanceId: approval.id,
      })).resolves.toBe(1);
    }, 30_000);

    test("stale StockAdjustment review is denied with zero approval or inventory mutation", async () => {
      const { fixture, session } = await createSharedScenario("StockAdjustment");
      const review = await getBoundedInventoryUatApprovalReview(
        session,
        fixture.approvalInstanceId,
      );
      await prisma.stockAdjustment.update({
        where: { id: fixture.sourceId },
        data: { reasonDescription: "Canonical source changed after review." },
      });
      const before = {
        source: await prisma.stockAdjustment.findUniqueOrThrow({
          where: { id: fixture.sourceId },
        }),
        approval: await prisma.approvalInstance.findUniqueOrThrow({
          where: { id: fixture.approvalInstanceId },
        }),
        inventory: await scopedInventoryCounts(fixture),
      };
      contextMock.requireSessionContext.mockResolvedValue(session);

      await expect(executeEligibleApprovalDecision({
        approvalInstanceId: fixture.approvalInstanceId,
        decision: "APPROVE",
        reviewToken: review.reviewToken,
      })).rejects.toThrow("APPROVAL_REVIEW_STALE");
      expect({
        source: await prisma.stockAdjustment.findUniqueOrThrow({
          where: { id: fixture.sourceId },
        }),
        approval: await prisma.approvalInstance.findUniqueOrThrow({
          where: { id: fixture.approvalInstanceId },
        }),
        inventory: await scopedInventoryCounts(fixture),
      }).toEqual(before);
      await expect(prisma.auditEvent.count({
        where: {
          tenantId: fixture.tenantId,
          entityType: "ApprovalInstance",
          entityId: fixture.approvalInstanceId,
          eventType: "approval.review_snapshot_verified",
        },
      })).resolves.toBe(0);
    }, 30_000);

    // Live permission/scope/SOD revocation is exercised with zero mutation by
    // approvalDecisionRevocationPg.integration.test.ts and
    // inventoryPilotApprovalPgIntegrity.integration.test.ts. This suite adds
    // the reviewed-snapshot stale-source denial rather than duplicating those
    // more exhaustive lock-order matrices for every bounded family.
  },
);
