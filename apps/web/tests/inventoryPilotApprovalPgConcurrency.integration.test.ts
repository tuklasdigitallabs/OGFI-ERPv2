import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { prisma } from "@ogfi/database";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";
import {
  actionForm,
  createInventoryPilotApprovalPgFixture,
  type InventoryPilotApprovalPgFixture,
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
  returnApproval,
} from "../src/server/services/approvals";
import {
  cancelStockCount,
  submitStockCount,
} from "../src/server/services/stockCounts";
import {
  cancelInventoryTransfer,
  submitInventoryTransfer,
} from "../src/server/services/transfers";

const runPg = process.env.RUN_INVENTORY_PILOT_APPROVAL_PG_TESTS === "true";
const pgDescribe = runPg ? describe : describe.skip;
const expectedDatabase = runPg
  ? assertDisposableAuthorizationDatabaseConfigured(process.env)
  : null;

function submissionForm(id: string, idempotencyKey: string) {
  return actionForm({ id, idempotencyKey });
}

function decisionForm(approvalInstanceId: string, remarks = "Independent race acceptance review.") {
  return actionForm({ approvalInstanceId, remarks });
}

function cancellationForm(id: string) {
  return actionForm({ id, cancellationReason: "Disposable concurrency acceptance cancellation." });
}

function restoreEnvironmentValue(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function rejectionMessages(results: PromiseSettledResult<unknown>[]) {
  return results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map(({ reason }) => reason instanceof Error ? reason.message : String(reason));
}

function expectExactlyOneSuccess(results: PromiseSettledResult<unknown>[]) {
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
}

async function transferGraph(fixture: InventoryPilotApprovalPgFixture, transferId: string) {
  return prisma.approvalInstance.findFirstOrThrow({
    where: {
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      documentType: "InventoryTransfer",
      documentId: transferId,
    },
    orderBy: { createdAt: "desc" },
  });
}

async function countGraph(fixture: InventoryPilotApprovalPgFixture, attemptId: string) {
  return prisma.approvalInstance.findFirstOrThrow({
    where: {
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      documentType: "StockCountAttemptReview",
      documentId: attemptId,
    },
    orderBy: { createdAt: "desc" },
  });
}

async function assertNoPilotInventoryMovement(fixture: InventoryPilotApprovalPgFixture, sourceIds: string[]) {
  await expect(prisma.inventoryMovement.count({
    where: {
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      sourceDocumentId: { in: sourceIds },
    },
  })).resolves.toBe(0);
}

async function submitTransferForDecision(fixture: InventoryPilotApprovalPgFixture) {
  const transferId = await fixture.createDraftTransfer();
  mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
  await submitInventoryTransfer(submissionForm(transferId, `transfer-terminal-${fixture.tenantId}-${transferId}`));
  return { transferId, graph: await transferGraph(fixture, transferId) };
}

async function submitCountForDecision(fixture: InventoryPilotApprovalPgFixture) {
  const count = await fixture.createInProgressStockCount();
  mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
  await submitStockCount(submissionForm(count.sessionId, `count-terminal-${fixture.tenantId}-${count.sessionId}`));
  return { count, graph: await countGraph(fixture, count.attemptId) };
}

pgDescribe.sequential("DEC-0260/0261 inventory-pilot approval PostgreSQL concurrency acceptance", () => {
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

  test("serializes same-source same-key transfer and count submissions as exact replays", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const [transferId, count] = await Promise.all([
      fixture.createDraftTransfer(),
      fixture.createInProgressStockCount(),
    ]);
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);

    const transferKey = `transfer-same-key-${fixture.tenantId}`;
    const transferResults = await Promise.allSettled([
      submitInventoryTransfer(submissionForm(transferId, transferKey)),
      submitInventoryTransfer(submissionForm(transferId, transferKey)),
    ]);
    expect(transferResults.every((result) => result.status === "fulfilled")).toBe(true);

    const countKey = `count-same-key-${fixture.tenantId}`;
    const countResults = await Promise.allSettled([
      submitStockCount(submissionForm(count.sessionId, countKey)),
      submitStockCount(submissionForm(count.sessionId, countKey)),
    ]);
    expect(countResults.every((result) => result.status === "fulfilled")).toBe(true);

    const [transfer, transferApprovalCount, transferIntentCount, transferAuditCount, stockSession, attempt, countApprovalCount, countIntentCount, countAuditCount] = await Promise.all([
      prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } }),
      prisma.approvalInstance.count({ where: { tenantId: fixture.tenantId, companyId: fixture.companyId, documentType: "InventoryTransfer", documentId: transferId } }),
      prisma.inventoryTransferApprovalSubmissionIntent.count({ where: { tenantId: fixture.tenantId, companyId: fixture.companyId, inventoryTransferId: transferId } }),
      prisma.auditEvent.count({ where: { tenantId: fixture.tenantId, companyId: fixture.companyId, entityType: "InventoryTransfer", entityId: transferId, eventType: "inventory_transfer.approval_submitted" } }),
      prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } }),
      prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: count.attemptId } }),
      prisma.approvalInstance.count({ where: { tenantId: fixture.tenantId, companyId: fixture.companyId, documentType: "StockCountAttemptReview", documentId: count.attemptId } }),
      prisma.stockCountReviewSubmissionIntent.count({ where: { tenantId: fixture.tenantId, companyId: fixture.companyId, stockCountAttemptId: count.attemptId } }),
      prisma.auditEvent.count({ where: { tenantId: fixture.tenantId, companyId: fixture.companyId, entityType: "StockCountAttempt", entityId: count.attemptId, eventType: "stock_count.submitted" } }),
    ]);
    expect(transfer).toMatchObject({ status: "PENDING_APPROVAL", version: 2 });
    expect([transferApprovalCount, transferIntentCount, transferAuditCount]).toEqual([1, 1, 1]);
    expect(stockSession).toMatchObject({ status: "SUBMITTED", version: 2, currentAttemptId: count.attemptId });
    expect(attempt).toMatchObject({ status: "SUBMITTED", version: 2 });
    expect([countApprovalCount, countIntentCount, countAuditCount]).toEqual([1, 1, 1]);
    await assertNoPilotInventoryMovement(fixture, [transferId, count.sessionId, count.attemptId]);
  });

  test("rejects a different-key loser without creating a second transfer or count graph", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const [transferId, count] = await Promise.all([
      fixture.createDraftTransfer(),
      fixture.createInProgressStockCount(),
    ]);
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);

    const transferResults = await Promise.allSettled([
      submitInventoryTransfer(submissionForm(transferId, `transfer-first-${fixture.tenantId}`)),
      submitInventoryTransfer(submissionForm(transferId, `transfer-second-${fixture.tenantId}`)),
    ]);
    expectExactlyOneSuccess(transferResults);
    expect(rejectionMessages(transferResults)).toEqual(["TRANSFER_APPROVAL_SUBMISSION_IDEMPOTENCY_CONFLICT"]);

    const countResults = await Promise.allSettled([
      submitStockCount(submissionForm(count.sessionId, `count-first-${fixture.tenantId}`)),
      submitStockCount(submissionForm(count.sessionId, `count-second-${fixture.tenantId}`)),
    ]);
    expectExactlyOneSuccess(countResults);
    expect(rejectionMessages(countResults)).toEqual(["STOCK_COUNT_NOT_OPEN_FOR_SUBMIT"]);

    await expect(prisma.approvalInstance.count({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, documentType: "InventoryTransfer", documentId: transferId },
    })).resolves.toBe(1);
    await expect(prisma.approvalInstance.count({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, documentType: "StockCountAttemptReview", documentId: count.attemptId },
    })).resolves.toBe(1);
    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).toMatchObject({ status: "PENDING_APPROVAL", version: 2 });
    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } })).toMatchObject({ status: "SUBMITTED", version: 2 });
    expect(await prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: count.attemptId } })).toMatchObject({ status: "SUBMITTED", version: 2 });
    await assertNoPilotInventoryMovement(fixture, [transferId, count.sessionId, count.attemptId]);
  });

  test("serializes competing terminal decisions and preserves one exact transfer outcome", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const approved = await submitTransferForDecision(fixture);
    mockContext.requireSessionContext.mockResolvedValue(fixture.approverSession);
    const approvalResults = await Promise.allSettled([
      approveApproval(decisionForm(approved.graph.id)),
      approveApproval(decisionForm(approved.graph.id)),
    ]);
    expectExactlyOneSuccess(approvalResults);
    expect(rejectionMessages(approvalResults)).toEqual(["INVENTORY_TRANSFER_NOT_PENDING_APPROVAL"]);
    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: approved.transferId } })).toMatchObject({ status: "REQUESTED", version: 3 });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: approved.graph.id } })).toMatchObject({ status: "APPROVED" });
    await expect(prisma.auditEvent.count({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, entityType: "InventoryTransfer", entityId: approved.transferId, eventType: "inventory_transfer.approved" },
    })).resolves.toBe(1);

    const opposed = await submitTransferForDecision(fixture);
    mockContext.requireSessionContext.mockResolvedValue(fixture.approverSession);
    const opposedResults = await Promise.allSettled([
      approveApproval(decisionForm(opposed.graph.id)),
      returnApproval(decisionForm(opposed.graph.id, "Concurrent correction return.")),
    ]);
    expectExactlyOneSuccess(opposedResults);
    expect(rejectionMessages(opposedResults)).toEqual(["INVENTORY_TRANSFER_NOT_PENDING_APPROVAL"]);
    const [opposedSource, opposedGraph, approvedAuditCount, returnedAuditCount] = await Promise.all([
      prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: opposed.transferId } }),
      prisma.approvalInstance.findUniqueOrThrow({ where: { id: opposed.graph.id } }),
      prisma.auditEvent.count({ where: { tenantId: fixture.tenantId, companyId: fixture.companyId, entityType: "InventoryTransfer", entityId: opposed.transferId, eventType: "inventory_transfer.approved" } }),
      prisma.auditEvent.count({ where: { tenantId: fixture.tenantId, companyId: fixture.companyId, entityType: "InventoryTransfer", entityId: opposed.transferId, eventType: "inventory_transfer.returned" } }),
    ]);
    expect(opposedSource.version).toBe(3);
    expect(["REQUESTED", "RETURNED"]).toContain(opposedSource.status);
    expect(opposedGraph.status).toBe(opposedSource.status === "REQUESTED" ? "APPROVED" : "RETURNED");
    expect(approvedAuditCount + returnedAuditCount).toBe(1);
    await assertNoPilotInventoryMovement(fixture, [approved.transferId, opposed.transferId]);
  });

  test("serializes competing count approval and updates the current attempt exactly once", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const submitted = await submitCountForDecision(fixture);
    mockContext.requireSessionContext.mockResolvedValue(fixture.approverSession);
    const results = await Promise.allSettled([
      approveApproval(decisionForm(submitted.graph.id)),
      approveApproval(decisionForm(submitted.graph.id)),
    ]);
    expectExactlyOneSuccess(results);
    expect(rejectionMessages(results)).toEqual(["STOCK_COUNT_ATTEMPT_REVIEW_NOT_ACTIONABLE"]);
    const [session, attempt, graph, auditCount] = await Promise.all([
      prisma.stockCountSession.findUniqueOrThrow({ where: { id: submitted.count.sessionId } }),
      prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: submitted.count.attemptId } }),
      prisma.approvalInstance.findUniqueOrThrow({ where: { id: submitted.graph.id } }),
      prisma.auditEvent.count({ where: { tenantId: fixture.tenantId, companyId: fixture.companyId, entityType: "StockCountAttempt", entityId: submitted.count.attemptId, eventType: "stock_count.attempt_review_approved" } }),
    ]);
    expect(session).toMatchObject({ status: "REVIEWED", version: 3, currentAttemptId: submitted.count.attemptId });
    expect(attempt).toMatchObject({ status: "REVIEWED", version: 3 });
    expect(graph).toMatchObject({ status: "APPROVED" });
    expect(auditCount).toBe(1);
    await assertNoPilotInventoryMovement(fixture, [submitted.count.sessionId, submitted.count.attemptId]);
  });

  test("cancel versus terminal decision leaves one coherent typed graph for transfer and count", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const transfer = await submitTransferForDecision(fixture);
    mockContext.requireSessionContext
      .mockResolvedValueOnce(fixture.requesterSession)
      .mockResolvedValueOnce(fixture.approverSession);
    const transferResults = await Promise.allSettled([
      cancelInventoryTransfer(cancellationForm(transfer.transferId)),
      approveApproval(decisionForm(transfer.graph.id)),
    ]);
    expectExactlyOneSuccess(transferResults);
    const [transferSource, transferGraph] = await Promise.all([
      prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transfer.transferId } }),
      prisma.approvalInstance.findUniqueOrThrow({ where: { id: transfer.graph.id } }),
    ]);
    expect(transferSource.version).toBe(3);
    expect(["CANCELLED", "REQUESTED"]).toContain(transferSource.status);
    expect(transferGraph.status).toBe(transferSource.status === "CANCELLED" ? "CANCELLED" : "APPROVED");
    const transferRejections = rejectionMessages(transferResults);
    expect(transferRejections).toHaveLength(1);
    expect(
      transferSource.status === "CANCELLED"
        ? ["INVENTORY_TRANSFER_NOT_PENDING_APPROVAL", "PERMISSION_DENIED"]
        : ["TRANSFER_NOT_CANCELLABLE"],
    ).toContain(transferRejections[0]);

    const count = await submitCountForDecision(fixture);
    mockContext.requireSessionContext
      .mockResolvedValueOnce(fixture.requesterSession)
      .mockResolvedValueOnce(fixture.approverSession);
    const countResults = await Promise.allSettled([
      cancelStockCount(cancellationForm(count.count.sessionId)),
      approveApproval(decisionForm(count.graph.id)),
    ]);
    expectExactlyOneSuccess(countResults);
    const [countSession, countAttempt, countGraph] = await Promise.all([
      prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.count.sessionId } }),
      prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: count.count.attemptId } }),
      prisma.approvalInstance.findUniqueOrThrow({ where: { id: count.graph.id } }),
    ]);
    expect(countSession.version).toBe(3);
    expect(countAttempt.version).toBe(3);
    expect(["CANCELLED", "REVIEWED"]).toContain(countSession.status);
    expect(countAttempt.status).toBe(countSession.status);
    expect(countGraph.status).toBe(countSession.status === "CANCELLED" ? "CANCELLED" : "APPROVED");
    const countRejections = rejectionMessages(countResults);
    expect(countRejections).toHaveLength(1);
    expect(
      countSession.status === "CANCELLED"
        ? ["STOCK_COUNT_ATTEMPT_REVIEW_NOT_ACTIONABLE", "PERMISSION_DENIED"]
        : ["STOCK_COUNT_NOT_CANCELLABLE"],
    ).toContain(countRejections[0]);
    await assertNoPilotInventoryMovement(fixture, [transfer.transferId, count.count.sessionId, count.count.attemptId]);
  });
});
