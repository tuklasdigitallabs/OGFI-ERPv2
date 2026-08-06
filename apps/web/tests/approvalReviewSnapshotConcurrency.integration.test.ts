import { randomUUID } from "node:crypto";
import { prisma, type TransactionClient } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
  acquireApprovalReviewAggregateFence,
  approvalReviewSourceFrozenError,
  assertApprovalReviewEvidenceSourceMutable,
  assertApprovalReviewQuotationRequestMutable,
} from "../src/server/services/approvalReviewAggregateFence";
import { executeEligibleApprovalDecision } from "../src/server/services/approvals";
import { getBoundedInventoryUatApprovalReview } from "../src/server/services/boundedApprovalReview";
import type { SessionContext } from "../src/server/services/context";
import {
  createApprovalDecisionPgFixture,
  createSharedProcurementInventorySource,
  type ApprovalDecisionPgFixture,
} from "./helpers/approvalDecisionPgFixtures";

const contextMock = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));
vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<
    typeof import("../src/server/services/context")
  >("../src/server/services/context");
  return { ...actual, requireSessionContext: contextMock.requireSessionContext };
});

const runPg = process.env.RUN_APPROVAL_ROUTING_PG_TESTS === "true";
const admittedEnvironment = {
  NODE_ENV: "production",
  APP_ENV: "uat",
  CI: "true",
  AUTH_MODE: "local",
  AUTH_HARDENED_UAT_RUNTIME_ENABLED: "true",
  BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED: "true",
  APPROVAL_ROUTING_V1_ENABLED: "false",
  AUTH_SECRET: "approval-review-concurrency-test-secret-20260806-only",
} as const;
const priorEnvironment = new Map<string, string | undefined>();

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitForBlockedPid(blockerPid: number, excludedPids: number[] = []) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ pid: number }>>`
      SELECT activity.pid
        FROM pg_stat_activity activity
       WHERE activity.datname = current_database()
         AND activity.pid <> pg_backend_pid()
         AND ${blockerPid}::int = ANY(pg_blocking_pids(activity.pid))
       ORDER BY activity.pid ASC
    `;
    const blocked = rows.find(({ pid }) => !excludedPids.includes(pid));
    if (blocked) return blocked.pid;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`POSTGRES_BLOCKED_PID_NOT_OBSERVED:${blockerPid}`);
}

async function createLiveSession(fixture: ApprovalDecisionPgFixture) {
  const base = fixture.sessionFor(1);
  const now = new Date();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: base.user.id },
    select: { privilegeEpoch: true },
  });
  const authSession = await prisma.authSession.create({
    data: {
      tenantId: fixture.tenantId,
      userId: base.user.id,
      tokenHash: `approval-review-concurrency-${randomUUID()}`,
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
  } satisfies SessionContext;
}

async function createScenario() {
  const fixture = await createApprovalDecisionPgFixture({
    family: "PurchaseRequest",
    steps: 1,
    createSource: async (context) => prisma.purchaseRequest.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        brandId: context.brandId,
        requestLocationId: context.locationId,
        requesterUserId: context.requesterUserId,
        publicReference: `PR-REVIEW-RACE-${context.suffix}`,
        requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60_000),
        urgency: "HIGH",
        justification: "Reviewed-state PostgreSQL concurrency acceptance",
        status: "PENDING_APPROVAL",
        currentApprovalStep: 1,
        lines: {
          create: {
            lineNumber: 1,
            description: "High-risk beef inventory",
            requestedQty: 12.5,
            estimatedUnitCost: 500,
            estimatedLineTotal: 6_250,
            uomCode: "KG",
            purpose: "Branch opening stock control",
          },
        },
      },
      select: { id: true },
    }),
  });
  return { fixture, session: await createLiveSession(fixture) };
}

async function createQuotationScenario() {
  const fixture = await createApprovalDecisionPgFixture({
    family: "QuotationRecommendation",
    steps: 1,
    createSource: (context) =>
      createSharedProcurementInventorySource(
        "QuotationRecommendation",
        context,
      ),
  });
  const recommendation = await prisma.quotationRecommendation.findUniqueOrThrow({
    where: { id: fixture.sourceId },
    select: {
      quotationRequestId: true,
      selectedSupplierQuotationId: true,
      quotationRequest: {
        select: {
          purchaseRequestId: true,
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
  const supplier = await prisma.supplier.create({
    data: {
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      supplierCode: `RACE-${fixture.sourceId.slice(0, 8)}`,
      legalName: "Concurrent quotation writer",
    },
    select: { id: true },
  });
  return {
    fixture,
    session: await createLiveSession(fixture),
    quotationRequestId: recommendation.quotationRequestId,
    purchaseRequestId: recommendation.quotationRequest.purchaseRequestId,
    supplierId: supplier.id,
  };
}

async function outcomeSnapshot(input: {
  tenantId: string;
  companyId: string;
  sourceId: string;
  approvalInstanceId: string;
}) {
  const [source, approval, steps, comments, reviewAudits, outcomeAudits,
    commentAudits, notifications, movements, balances] = await Promise.all([
    prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: input.sourceId },
      select: { status: true, version: true, currentApprovalStep: true },
    }),
    prisma.approvalInstance.findUniqueOrThrow({
      where: { id: input.approvalInstanceId },
      select: { status: true, currentStepOrder: true },
    }),
    prisma.approvalInstanceStep.findMany({
      where: { approvalInstanceId: input.approvalInstanceId },
      select: { status: true, actedAt: true, actedByUserId: true },
      orderBy: { stepOrder: "asc" },
    }),
    prisma.purchaseRequestComment.count({
      where: { purchaseRequestId: input.sourceId },
    }),
    prisma.auditEvent.count({
      where: {
        tenantId: input.tenantId,
        entityType: "ApprovalInstance",
        entityId: input.approvalInstanceId,
        eventType: "approval.review_snapshot_verified",
      },
    }),
    prisma.auditEvent.count({
      where: {
        tenantId: input.tenantId,
        entityType: "PurchaseRequest",
        entityId: input.sourceId,
        eventType: "purchase_request.approved",
      },
    }),
    prisma.auditEvent.count({
      where: {
        tenantId: input.tenantId,
        entityType: "PurchaseRequest",
        entityId: input.sourceId,
        eventType: "purchase_request.comment_added",
      },
    }),
    prisma.notification.count({
      where: {
        tenantId: input.tenantId,
        entityType: "PurchaseRequest",
        entityId: input.sourceId,
      },
    }),
    prisma.inventoryMovement.count({
      where: { tenantId: input.tenantId, companyId: input.companyId },
    }),
    prisma.inventoryBalance.count({
      where: { tenantId: input.tenantId, companyId: input.companyId },
    }),
  ]);
  return {
    source,
    approval,
    steps,
    comments,
    reviewAudits,
    outcomeAudits,
    commentAudits,
    notifications,
    movements,
    balances,
  };
}

type QuotationScenario = Awaited<ReturnType<typeof createQuotationScenario>>;

async function quotationOutcomeSnapshot(scenario: QuotationScenario) {
  const [source, approval, steps, quotes, reviewAudits, outcomeAudits,
    writerAudits, notifications, movements, balances] = await Promise.all([
    prisma.quotationRecommendation.findUniqueOrThrow({
      where: { id: scenario.fixture.sourceId },
      select: { status: true, version: true },
    }),
    prisma.approvalInstance.findUniqueOrThrow({
      where: { id: scenario.fixture.approvalInstanceId },
      select: { status: true, currentStepOrder: true },
    }),
    prisma.approvalInstanceStep.findMany({
      where: { approvalInstanceId: scenario.fixture.approvalInstanceId },
      select: { status: true, actedAt: true, actedByUserId: true },
      orderBy: { stepOrder: "asc" },
    }),
    prisma.supplierQuotation.count({
      where: { quotationRequestId: scenario.quotationRequestId },
    }),
    prisma.auditEvent.count({
      where: {
        tenantId: scenario.fixture.tenantId,
        entityType: "ApprovalInstance",
        entityId: scenario.fixture.approvalInstanceId,
        eventType: "approval.review_snapshot_verified",
      },
    }),
    prisma.auditEvent.count({
      where: {
        tenantId: scenario.fixture.tenantId,
        entityType: "PurchaseRequest",
        entityId: scenario.purchaseRequestId,
        eventType: "quotation_recommendation.approved",
      },
    }),
    prisma.auditEvent.count({
      where: {
        tenantId: scenario.fixture.tenantId,
        entityType: "PurchaseRequest",
        entityId: scenario.purchaseRequestId,
        eventType: "supplier_quote.created",
      },
    }),
    prisma.notification.count({
      where: {
        tenantId: scenario.fixture.tenantId,
        entityType: "PurchaseRequest",
        entityId: scenario.purchaseRequestId,
      },
    }),
    prisma.inventoryMovement.count({
      where: {
        tenantId: scenario.fixture.tenantId,
        companyId: scenario.fixture.companyId,
      },
    }),
    prisma.inventoryBalance.count({
      where: {
        tenantId: scenario.fixture.tenantId,
        companyId: scenario.fixture.companyId,
      },
    }),
  ]);
  return {
    source,
    approval,
    steps,
    quotes,
    reviewAudits,
    outcomeAudits,
    writerAudits,
    notifications,
    movements,
    balances,
  };
}

async function insertConcurrentSupplierQuotation(
  tx: TransactionClient,
  scenario: QuotationScenario,
) {
  await assertApprovalReviewQuotationRequestMutable(tx, {
    tenantId: scenario.fixture.tenantId,
    companyId: scenario.fixture.companyId,
    quotationRequestId: scenario.quotationRequestId,
  });
  const quote = await tx.supplierQuotation.create({
    data: {
      quotationRequestId: scenario.quotationRequestId,
      tenantId: scenario.fixture.tenantId,
      companyId: scenario.fixture.companyId,
      supplierId: scenario.supplierId,
      quoteReference: `SQ-RACE-${randomUUID().slice(0, 8)}`,
      quoteDate: new Date(),
      currencyCode: "PHP",
      totalAmount: 9,
    },
    select: { id: true },
  });
  await tx.auditEvent.create({
    data: {
      tenantId: scenario.fixture.tenantId,
      companyId: scenario.fixture.companyId,
      actorUserId: scenario.fixture.requesterUserId,
      eventType: "supplier_quote.created",
      entityType: "PurchaseRequest",
      entityId: scenario.purchaseRequestId,
      metadata: {
        quotationRequestId: scenario.quotationRequestId,
        supplierQuotationId: quote.id,
        source: "approval-review-concurrency-acceptance",
      },
    },
  });
  return quote.id;
}

async function reviewedDecision(
  session: SessionContext,
  approvalInstanceId: string,
) {
  const review = await getBoundedInventoryUatApprovalReview(
    session,
    approvalInstanceId,
  );
  contextMock.requireSessionContext.mockResolvedValue(session);
  return executeEligibleApprovalDecision({
    approvalInstanceId,
    decision: "APPROVE",
    remarks: "Reviewed current bounded Purchase Request snapshot.",
    reviewToken: review.reviewToken,
  });
}

describe.skipIf(!runPg).sequential(
  "DEC-0270 reviewed-state PostgreSQL concurrency acceptance",
  () => {
    beforeAll(() => {
      for (const [name, value] of Object.entries(admittedEnvironment)) {
        priorEnvironment.set(name, process.env[name]);
        process.env[name] = value;
      }
    });

    afterAll(async () => {
      for (const [name, value] of priorEnvironment) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      await prisma.$disconnect();
    });

    test("rejects a decision when a canonical PR comment changed after review", async () => {
      const { fixture, session } = await createScenario();
      const review = await getBoundedInventoryUatApprovalReview(
        session,
        fixture.approvalInstanceId,
      );
      await prisma.purchaseRequestComment.create({
        data: {
          purchaseRequestId: fixture.sourceId,
          tenantId: fixture.tenantId,
          companyId: fixture.companyId,
          authorUserId: fixture.requesterUserId,
          body: "Committed canonical drift after the approver reviewed the request.",
        },
      });
      const beforeDecision = await outcomeSnapshot({
        tenantId: fixture.tenantId,
        companyId: fixture.companyId,
        sourceId: fixture.sourceId,
        approvalInstanceId: fixture.approvalInstanceId,
      });
      contextMock.requireSessionContext.mockResolvedValue(session);

      await expect(executeEligibleApprovalDecision({
        approvalInstanceId: fixture.approvalInstanceId,
        decision: "APPROVE",
        reviewToken: review.reviewToken,
      })).rejects.toThrow("APPROVAL_REVIEW_STALE");

      expect(await outcomeSnapshot({
        tenantId: fixture.tenantId,
        companyId: fixture.companyId,
        sourceId: fixture.sourceId,
        approvalInstanceId: fixture.approvalInstanceId,
      })).toEqual(beforeDecision);
      expect(beforeDecision).toMatchObject({
        comments: 1,
        reviewAudits: 0,
        outcomeAudits: 0,
        commentAudits: 0,
        notifications: 0,
        movements: 0,
        balances: 0,
      });
    }, 15_000);

    test("writer fence first freezes the reviewed aggregate and one decision commits", async () => {
      const { fixture, session } = await createScenario();
      const writerLocked = deferred();
      const releaseWriter = deferred();
      let writerPid = 0;
      const writer = prisma.$transaction(async (tx) => {
        [{ pid: writerPid }] = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid() AS pid
        `;
        await acquireApprovalReviewAggregateFence(tx, {
          tenantId: fixture.tenantId,
          companyId: fixture.companyId,
          sourceType: "PURCHASE_REQUEST",
          sourceRecordId: fixture.sourceId,
        });
        writerLocked.resolve();
        await releaseWriter.promise;
        await assertApprovalReviewEvidenceSourceMutable(tx, {
          tenantId: fixture.tenantId,
          companyId: fixture.companyId,
          sourceType: "PURCHASE_REQUEST",
          sourceRecordId: fixture.sourceId,
        });
        await tx.purchaseRequestComment.create({
          data: {
            purchaseRequestId: fixture.sourceId,
            tenantId: fixture.tenantId,
            companyId: fixture.companyId,
            authorUserId: fixture.requesterUserId,
            body: "This writer must remain frozen during reviewed approval.",
          },
        });
      }, { timeout: 15_000 });
      await writerLocked.promise;
      const decision = reviewedDecision(session, fixture.approvalInstanceId);
      try {
        await waitForBlockedPid(writerPid);
      } finally {
        releaseWriter.resolve();
      }

      const results = await Promise.allSettled([writer, decision]);
      expect(results[0]).toMatchObject({ status: "rejected" });
      expect(String((results[0] as PromiseRejectedResult).reason)).toContain(
        approvalReviewSourceFrozenError,
      );
      expect(results[1]).toMatchObject({ status: "fulfilled" });
      expect(await outcomeSnapshot({
        tenantId: fixture.tenantId,
        companyId: fixture.companyId,
        sourceId: fixture.sourceId,
        approvalInstanceId: fixture.approvalInstanceId,
      })).toMatchObject({
        source: { status: "APPROVED" },
        approval: { status: "APPROVED", currentStepOrder: null },
        steps: [{ status: "APPROVED" }],
        comments: 0,
        reviewAudits: 1,
        outcomeAudits: 1,
        commentAudits: 0,
        notifications: 1,
        movements: 0,
        balances: 0,
      });
    }, 15_000);

    test("decision fence first commits once and the waiting writer remains frozen", async () => {
      const { fixture, session } = await createScenario();
      const auditLocked = deferred();
      const releaseAudit = deferred();
      let auditBlockerPid = 0;
      const auditBlocker = prisma.$transaction(async (tx) => {
        [{ pid: auditBlockerPid }] = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid() AS pid
        `;
        await tx.$executeRaw`LOCK TABLE "AuditEvent" IN ACCESS EXCLUSIVE MODE`;
        auditLocked.resolve();
        await releaseAudit.promise;
      }, { timeout: 15_000 });
      await auditLocked.promise;

      const decision = reviewedDecision(session, fixture.approvalInstanceId);
      let decisionPid = 0;
      try {
        decisionPid = await waitForBlockedPid(auditBlockerPid);
      } catch (error) {
        releaseAudit.resolve();
        await auditBlocker;
        throw error;
      }
      const writer = prisma.$transaction(async (tx) => {
        await assertApprovalReviewEvidenceSourceMutable(tx, {
          tenantId: fixture.tenantId,
          companyId: fixture.companyId,
          sourceType: "PURCHASE_REQUEST",
          sourceRecordId: fixture.sourceId,
        });
        await tx.purchaseRequestComment.create({
          data: {
            purchaseRequestId: fixture.sourceId,
            tenantId: fixture.tenantId,
            companyId: fixture.companyId,
            authorUserId: fixture.requesterUserId,
            body: "This writer must remain frozen after reviewed approval.",
          },
        });
      });
      try {
        await waitForBlockedPid(decisionPid, [auditBlockerPid]);
      } finally {
        releaseAudit.resolve();
      }

      await auditBlocker;
      const results = await Promise.allSettled([decision, writer]);
      expect(results[0]).toMatchObject({ status: "fulfilled" });
      expect(results[1]).toMatchObject({ status: "rejected" });
      expect(String((results[1] as PromiseRejectedResult).reason)).toContain(
        approvalReviewSourceFrozenError,
      );
      expect(await outcomeSnapshot({
        tenantId: fixture.tenantId,
        companyId: fixture.companyId,
        sourceId: fixture.sourceId,
        approvalInstanceId: fixture.approvalInstanceId,
      })).toMatchObject({
        source: { status: "APPROVED" },
        approval: { status: "APPROVED", currentStepOrder: null },
        steps: [{ status: "APPROVED" }],
        comments: 0,
        reviewAudits: 1,
        outcomeAudits: 1,
        commentAudits: 0,
        notifications: 1,
        movements: 0,
        balances: 0,
      });
    }, 15_000);

    test("quotation writer fence first rejects a new quote and one reviewed recommendation commits", async () => {
      const scenario = await createQuotationScenario();
      const writerLocked = deferred();
      const releaseWriter = deferred();
      let writerPid = 0;
      const writer = prisma.$transaction(async (tx) => {
        [{ pid: writerPid }] = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid() AS pid
        `;
        await acquireApprovalReviewAggregateFence(tx, {
          tenantId: scenario.fixture.tenantId,
          companyId: scenario.fixture.companyId,
          sourceType: "QUOTATION_REQUEST",
          sourceRecordId: scenario.quotationRequestId,
        });
        writerLocked.resolve();
        await releaseWriter.promise;
        return insertConcurrentSupplierQuotation(tx, scenario);
      }, { timeout: 15_000 });
      await writerLocked.promise;
      const decision = reviewedDecision(
        scenario.session,
        scenario.fixture.approvalInstanceId,
      );
      try {
        await waitForBlockedPid(writerPid);
      } finally {
        releaseWriter.resolve();
      }

      const results = await Promise.allSettled([writer, decision]);
      expect(results[0]).toMatchObject({ status: "rejected" });
      expect(String((results[0] as PromiseRejectedResult).reason)).toContain(
        approvalReviewSourceFrozenError,
      );
      expect(results[1]).toMatchObject({ status: "fulfilled" });
      expect(await quotationOutcomeSnapshot(scenario)).toMatchObject({
        source: { status: "APPROVED" },
        approval: { status: "APPROVED", currentStepOrder: null },
        steps: [{ status: "APPROVED" }],
        quotes: 1,
        reviewAudits: 1,
        outcomeAudits: 1,
        writerAudits: 0,
        notifications: 1,
        movements: 0,
        balances: 0,
      });
    }, 15_000);

    test("quotation decision fence first commits once and rejects the waiting new quote", async () => {
      const scenario = await createQuotationScenario();
      const auditLocked = deferred();
      const releaseAudit = deferred();
      let auditBlockerPid = 0;
      const auditBlocker = prisma.$transaction(async (tx) => {
        [{ pid: auditBlockerPid }] = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid() AS pid
        `;
        await tx.$executeRaw`LOCK TABLE "AuditEvent" IN ACCESS EXCLUSIVE MODE`;
        auditLocked.resolve();
        await releaseAudit.promise;
      }, { timeout: 15_000 });
      await auditLocked.promise;

      const decision = reviewedDecision(
        scenario.session,
        scenario.fixture.approvalInstanceId,
      );
      let decisionPid = 0;
      try {
        decisionPid = await waitForBlockedPid(auditBlockerPid);
      } catch (error) {
        releaseAudit.resolve();
        await auditBlocker;
        throw error;
      }
      const writer = prisma.$transaction(
        (tx) => insertConcurrentSupplierQuotation(tx, scenario),
        { timeout: 15_000 },
      );
      try {
        await waitForBlockedPid(decisionPid, [auditBlockerPid]);
      } finally {
        releaseAudit.resolve();
      }

      await auditBlocker;
      const results = await Promise.allSettled([decision, writer]);
      expect(results[0]).toMatchObject({ status: "fulfilled" });
      expect(results[1]).toMatchObject({ status: "rejected" });
      expect(String((results[1] as PromiseRejectedResult).reason)).toContain(
        approvalReviewSourceFrozenError,
      );
      expect(await quotationOutcomeSnapshot(scenario)).toMatchObject({
        source: { status: "APPROVED" },
        approval: { status: "APPROVED", currentStepOrder: null },
        steps: [{ status: "APPROVED" }],
        quotes: 1,
        reviewAudits: 1,
        outcomeAudits: 1,
        writerAudits: 0,
        notifications: 1,
        movements: 0,
        balances: 0,
      });
    }, 15_000);
  },
);
