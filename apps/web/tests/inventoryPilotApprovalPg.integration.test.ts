import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { prisma } from "@ogfi/database";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";
import {
  actionForm,
  createInventoryPilotApprovalPgFixture,
} from "./helpers/inventoryPilotApprovalPgFixtures";

const mockContext = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));

vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<typeof import("../src/server/services/context")>(
    "../src/server/services/context",
  );
  return { ...actual, requireSessionContext: mockContext.requireSessionContext };
});

import {
  approveApproval,
  rejectApproval,
  returnApproval,
} from "../src/server/services/approvals";
import {
  cancelStockCount,
  reviewStockCount,
  submitStockCount,
} from "../src/server/services/stockCounts";
import {
  cancelInventoryTransfer,
  dispatchInventoryTransfer,
  submitInventoryTransfer,
} from "../src/server/services/transfers";

const runPg = process.env.RUN_INVENTORY_PILOT_APPROVAL_PG_TESTS === "true";
const pgDescribe = runPg ? describe : describe.skip;
const expectedDatabase = runPg
  ? assertDisposableAuthorizationDatabaseConfigured(process.env)
  : null;

function transferSubmitForm(id: string, idempotencyKey: string) {
  return actionForm({ id, idempotencyKey });
}

function stockCountSubmitForm(id: string, idempotencyKey: string) {
  return actionForm({ id, idempotencyKey });
}

function decisionForm(approvalInstanceId: string, remarks = "Independent review accepted.") {
  return actionForm({ approvalInstanceId, remarks });
}

function restoreEnvironmentValue(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function currentTransferApproval(input: { tenantId: string; companyId: string; transferId: string }) {
  return prisma.approvalInstance.findFirstOrThrow({
    where: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      documentType: "InventoryTransfer",
      documentId: input.transferId,
    },
    orderBy: { createdAt: "desc" },
    include: {
      steps: {
        include: { scopeGroups: { include: { targets: true } }, prohibitedActors: true },
      },
    },
  });
}

async function currentCountApproval(input: { tenantId: string; companyId: string; attemptId: string }) {
  return prisma.approvalInstance.findFirstOrThrow({
    where: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      documentType: "StockCountAttemptReview",
      documentId: input.attemptId,
    },
    orderBy: { createdAt: "desc" },
    include: {
      steps: {
        include: { scopeGroups: { include: { targets: true } }, prohibitedActors: true },
      },
    },
  });
}

pgDescribe.sequential("DEC-0260/0261 inventory-pilot approval PostgreSQL acceptance", () => {
  const originalEnvironment = {
    authMode: process.env.AUTH_MODE,
    routing: process.env.APPROVAL_ROUTING_V1_ENABLED,
    transfer: process.env.INVENTORY_TRANSFER_APPROVAL_V1_ENABLED,
    count: process.env.STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED,
  };

  beforeAll(async () => {
    process.env.AUTH_MODE = "local";
    process.env.APPROVAL_ROUTING_V1_ENABLED = "true";
    process.env.INVENTORY_TRANSFER_APPROVAL_V1_ENABLED = "true";
    process.env.STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED = "true";
    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const database = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    expect(database).toEqual([{ currentDatabase: expectedDatabase }]);
  });

  afterAll(async () => {
    restoreEnvironmentValue("AUTH_MODE", originalEnvironment.authMode);
    restoreEnvironmentValue("APPROVAL_ROUTING_V1_ENABLED", originalEnvironment.routing);
    restoreEnvironmentValue("INVENTORY_TRANSFER_APPROVAL_V1_ENABLED", originalEnvironment.transfer);
    restoreEnvironmentValue("STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED", originalEnvironment.count);
    await prisma.$disconnect();
  });

  test("atomically admits a transfer, records the exact graph/intent/audit/notification, and rejects an idempotency conflict", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const transferId = await fixture.createDraftTransfer();
    const idempotencyKey = `transfer-admission-${fixture.tenantId}`;
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);

    await submitInventoryTransfer(transferSubmitForm(transferId, idempotencyKey));
    const approval = await currentTransferApproval({
      tenantId: fixture.tenantId, companyId: fixture.companyId, transferId,
    });
    const source = await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } });
    const intent = await prisma.inventoryTransferApprovalSubmissionIntent.findFirstOrThrow({
      where: {
        tenantId: fixture.tenantId,
        companyId: fixture.companyId,
        idempotencyKey,
      },
    });
    expect(source).toMatchObject({ status: "PENDING_APPROVAL", version: 2 });
    expect(approval).toMatchObject({ status: "PENDING", currentStepOrder: 1 });
    expect(intent).toMatchObject({
      inventoryTransferId: transferId, approvalInstanceId: approval.id,
      approvalDocumentType: "InventoryTransfer", activationFamily: "InventoryTransfer",
      sourceVersionBefore: 1, sourceVersionAfter: 2,
    });
    expect(approval.steps).toHaveLength(1);
    expect(
      approval.steps[0]?.scopeGroups
        .slice()
        .sort((left, right) => left.groupOrder - right.groupOrder)
        .map((group) => group.targets[0]?.locationId),
    ).toEqual([fixture.sourceLocationId, fixture.destinationLocationId]);
    expect(approval.steps[0]?.prohibitedActors).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: fixture.requesterUserId, reasonCode: "REQUESTER" })]),
    );
    await expect(prisma.inventoryMovement.count({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, sourceDocumentId: transferId },
    })).resolves.toBe(0);
    await expect(prisma.auditEvent.count({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, entityType: "InventoryTransfer", entityId: transferId, eventType: "inventory_transfer.approval_submitted" },
    })).resolves.toBe(1);
    await expect(prisma.notification.count({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, entityType: "InventoryTransfer", entityId: transferId },
    })).resolves.toBeGreaterThan(0);

    await submitInventoryTransfer(transferSubmitForm(transferId, idempotencyKey));
    await expect(prisma.approvalInstance.count({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, documentType: "InventoryTransfer", documentId: transferId },
    })).resolves.toBe(1);
    expect((await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).version).toBe(2);

    const otherTransferId = await fixture.createDraftTransfer();
    await expect(submitInventoryTransfer(transferSubmitForm(otherTransferId, idempotencyKey))).rejects.toThrow(
      "TRANSFER_APPROVAL_SUBMISSION_IDEMPOTENCY_CONFLICT",
    );
    expect((await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: otherTransferId } })).status).toBe("DRAFT");
  });

  test("atomically admits a count review, protects its current attempt, and rejects an idempotency conflict", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const count = await fixture.createInProgressStockCount();
    const idempotencyKey = `count-admission-${fixture.tenantId}`;
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);

    await submitStockCount(stockCountSubmitForm(count.sessionId, idempotencyKey));
    const approval = await currentCountApproval({
      tenantId: fixture.tenantId, companyId: fixture.companyId, attemptId: count.attemptId,
    });
    const [session, attempt, intent] = await Promise.all([
      prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } }),
      prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: count.attemptId } }),
      prisma.stockCountReviewSubmissionIntent.findFirstOrThrow({
        where: {
          tenantId: fixture.tenantId,
          companyId: fixture.companyId,
          idempotencyKey,
        },
      }),
    ]);
    expect(session).toMatchObject({ status: "SUBMITTED", currentAttemptId: count.attemptId, version: 2 });
    expect(attempt).toMatchObject({ status: "SUBMITTED", version: 2 });
    expect(intent).toMatchObject({
      stockCountSessionId: count.sessionId, stockCountAttemptId: count.attemptId,
      approvalInstanceId: approval.id, approvalDocumentType: "StockCountAttemptReview",
      attemptVersionBefore: 1, attemptVersionAfter: 2, sessionVersionBefore: 1, sessionVersionAfter: 2,
    });
    expect(approval.steps[0]?.scopeGroups).toHaveLength(1);
    expect(approval.steps[0]?.scopeGroups[0]?.targets[0]?.locationId).toBe(fixture.destinationLocationId);
    expect(approval.steps[0]?.prohibitedActors.map((actor) => actor.userId)).toContain(fixture.requesterUserId);
    await expect(prisma.inventoryMovement.count({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, sourceDocumentId: { in: [count.sessionId, count.attemptId] } },
    })).resolves.toBe(0);

    await submitStockCount(stockCountSubmitForm(count.sessionId, idempotencyKey));
    await expect(prisma.approvalInstance.count({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, documentType: "StockCountAttemptReview", documentId: count.attemptId },
    })).resolves.toBe(1);

    const other = await fixture.createInProgressStockCount();
    await expect(submitStockCount(stockCountSubmitForm(other.sessionId, idempotencyKey))).rejects.toThrow(
      "STOCK_COUNT_APPROVAL_IDEMPOTENCY_CONFLICT",
    );
    expect((await prisma.stockCountSession.findUniqueOrThrow({ where: { id: other.sessionId } })).status).toBe("IN_PROGRESS");
  });

  test("final transfer approval has no inventory movement, enforces custody separation, and permits a fresh returned-cycle submission", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const approvedTransferId = await fixture.createDraftTransfer();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitInventoryTransfer(transferSubmitForm(approvedTransferId, `transfer-final-${fixture.tenantId}`));
    const approvedGraph = await currentTransferApproval({
      tenantId: fixture.tenantId, companyId: fixture.companyId, transferId: approvedTransferId,
    });
    mockContext.requireSessionContext.mockResolvedValue(fixture.approverSession);
    await approveApproval(decisionForm(approvedGraph.id));
    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: approvedTransferId } })).toMatchObject({ status: "REQUESTED", version: 3 });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: approvedGraph.id } })).toMatchObject({ status: "APPROVED" });
    await expect(dispatchInventoryTransfer(actionForm({ id: approvedTransferId }))).rejects.toThrow("TRANSFER_APPROVER_CANNOT_DISPATCH");
    await expect(prisma.inventoryMovement.count({ where: { sourceDocumentId: approvedTransferId } })).resolves.toBe(0);

    const returnedTransferId = await fixture.createDraftTransfer();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitInventoryTransfer(transferSubmitForm(returnedTransferId, `transfer-return-${fixture.tenantId}`));
    const returnedGraph = await currentTransferApproval({
      tenantId: fixture.tenantId, companyId: fixture.companyId, transferId: returnedTransferId,
    });
    mockContext.requireSessionContext.mockResolvedValue(fixture.approverSession);
    await returnApproval(decisionForm(returnedGraph.id, "Return for correction."));
    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: returnedTransferId } })).toMatchObject({ status: "RETURNED" });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: returnedGraph.id } })).toMatchObject({ status: "RETURNED" });
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitInventoryTransfer(transferSubmitForm(returnedTransferId, `transfer-resubmit-${fixture.tenantId}`));
    await expect(prisma.approvalInstance.count({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, documentType: "InventoryTransfer", documentId: returnedTransferId },
    })).resolves.toBe(2);
    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: returnedTransferId } })).toMatchObject({ status: "PENDING_APPROVAL" });
  });

  test("count terminal approval only reviews the pinned current attempt; generic return/reject/review are unsupported or blocked", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const approved = await fixture.createInProgressStockCount();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitStockCount(stockCountSubmitForm(approved.sessionId, `count-final-${fixture.tenantId}`));
    const approvedGraph = await currentCountApproval({ tenantId: fixture.tenantId, companyId: fixture.companyId, attemptId: approved.attemptId });
    mockContext.requireSessionContext.mockResolvedValue(fixture.approverSession);
    await approveApproval(decisionForm(approvedGraph.id));
    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: approved.sessionId } })).toMatchObject({ status: "REVIEWED", currentAttemptId: approved.attemptId, version: 3 });
    expect(await prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: approved.attemptId } })).toMatchObject({ status: "REVIEWED", version: 3 });
    await expect(prisma.inventoryMovement.count({ where: { sourceDocumentId: { in: [approved.sessionId, approved.attemptId] } } })).resolves.toBe(0);

    const pending = await fixture.createInProgressStockCount();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitStockCount(stockCountSubmitForm(pending.sessionId, `count-pending-${fixture.tenantId}`));
    const pendingGraph = await currentCountApproval({ tenantId: fixture.tenantId, companyId: fixture.companyId, attemptId: pending.attemptId });
    mockContext.requireSessionContext.mockResolvedValue(fixture.approverSession);
    await expect(returnApproval(decisionForm(pendingGraph.id, "No count return path."))).rejects.toThrow("STOCK_COUNT_ATTEMPT_REVIEW_RETURN_NOT_SUPPORTED");
    await expect(rejectApproval(decisionForm(pendingGraph.id, "No count reject path."))).rejects.toThrow("STOCK_COUNT_ATTEMPT_REVIEW_REJECT_NOT_SUPPORTED");
    mockContext.requireSessionContext.mockResolvedValue({
      ...fixture.approverSession,
      context: {
        ...fixture.approverSession.context,
        locationId: fixture.destinationLocationId,
        locationName: "Pilot destination",
      },
    });
    await expect(reviewStockCount(actionForm({ id: pending.sessionId, reviewAction: "REVIEW", reviewNotes: "Must use the approval route." }))).rejects.toThrow("STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_REQUIRED");
    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: pending.sessionId } })).toMatchObject({ status: "SUBMITTED", currentAttemptId: pending.attemptId, version: 2 });
    expect(await prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: pending.attemptId } })).toMatchObject({ status: "SUBMITTED", version: 2 });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: pendingGraph.id } })).toMatchObject({ status: "PENDING" });
  });

  test("pending transfer and count cancellation terminate their exact active approval graphs", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const transferId = await fixture.createDraftTransfer();
    const count = await fixture.createInProgressStockCount();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitInventoryTransfer(transferSubmitForm(transferId, `transfer-cancel-${fixture.tenantId}`));
    await submitStockCount(stockCountSubmitForm(count.sessionId, `count-cancel-${fixture.tenantId}`));
    const [transferGraph, countGraph] = await Promise.all([
      currentTransferApproval({ tenantId: fixture.tenantId, companyId: fixture.companyId, transferId }),
      currentCountApproval({ tenantId: fixture.tenantId, companyId: fixture.companyId, attemptId: count.attemptId }),
    ]);
    await cancelInventoryTransfer(actionForm({ id: transferId, cancellationReason: "Pilot acceptance cancellation." }));
    await cancelStockCount(actionForm({ id: count.sessionId, cancellationReason: "Pilot acceptance cancellation." }));
    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).toMatchObject({ status: "CANCELLED" });
    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } })).toMatchObject({ status: "CANCELLED", currentAttemptId: count.attemptId });
    expect(await prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: count.attemptId } })).toMatchObject({ status: "CANCELLED" });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: transferGraph.id } })).toMatchObject({ status: "CANCELLED" });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: countGraph.id } })).toMatchObject({ status: "CANCELLED" });
  });

  test("an active database cohort fails closed when rollout flags are turned off", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const transferId = await fixture.createDraftTransfer();
    const count = await fixture.createInProgressStockCount();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    process.env.INVENTORY_TRANSFER_APPROVAL_V1_ENABLED = "false";
    await expect(submitInventoryTransfer(transferSubmitForm(transferId, `transfer-disabled-${fixture.tenantId}`))).rejects.toThrow("INVENTORY_PILOT_APPROVAL_DISABLED");
    process.env.STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED = "false";
    await expect(submitStockCount(stockCountSubmitForm(count.sessionId, `count-disabled-${fixture.tenantId}`))).rejects.toThrow("INVENTORY_PILOT_APPROVAL_DISABLED");
    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).toMatchObject({ status: "DRAFT", version: 1 });
    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } })).toMatchObject({ status: "IN_PROGRESS", version: 1 });
    process.env.INVENTORY_TRANSFER_APPROVAL_V1_ENABLED = "true";
    process.env.STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED = "true";
  });
});
