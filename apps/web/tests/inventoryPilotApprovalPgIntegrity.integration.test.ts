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

import { approveApproval } from "../src/server/services/approvals";
import { cancelStockCount, submitStockCount } from "../src/server/services/stockCounts";
import {
  cancelInventoryTransfer,
  receiveInventoryTransfer,
  submitInventoryTransfer,
} from "../src/server/services/transfers";

const runPg = process.env.RUN_INVENTORY_PILOT_APPROVAL_PG_TESTS === "true";
const pgDescribe = runPg ? describe : describe.skip;
const expectedDatabase = runPg
  ? assertDisposableAuthorizationDatabaseConfigured(process.env)
  : null;

function form(values: Record<string, string>) {
  return actionForm(values);
}

function decisionForm(approvalInstanceId: string) {
  return form({ approvalInstanceId, remarks: "Independent integrity review." });
}

function restoreEnvironmentValue(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function currentApproval(input: {
  tenantId: string;
  companyId: string;
  documentType: "InventoryTransfer" | "StockCountAttemptReview";
  documentId: string;
}) {
  return prisma.approvalInstance.findFirstOrThrow({
    where: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      documentType: input.documentType,
      documentId: input.documentId,
    },
    orderBy: { createdAt: "desc" },
  });
}

async function grantRolePermission(roleId: string, permissionCode: string) {
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { code: permissionCode },
    select: { id: true },
  });
  await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } });
}

pgDescribe.sequential("DEC-0261 inventory-pilot PostgreSQL integrity boundaries", () => {
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

  test("activation rollover makes an admitted transfer replay and terminal approval fail closed, while exact cancellation remains coherent", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const transferId = await fixture.createDraftTransfer();
    const key = `transfer-rollover-${fixture.tenantId}`;
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitInventoryTransfer(form({ id: transferId, idempotencyKey: key }));
    const graph = await currentApproval({
      tenantId: fixture.tenantId, companyId: fixture.companyId,
      documentType: "InventoryTransfer", documentId: transferId,
    });

    await fixture.rollOverActivation("InventoryTransfer");
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await expect(submitInventoryTransfer(form({ id: transferId, idempotencyKey: key }))).rejects.toThrow(
      "TRANSFER_APPROVAL_SUBMISSION_IDEMPOTENCY_CONFLICT",
    );
    mockContext.requireSessionContext.mockResolvedValue(fixture.approverSession);
    await expect(approveApproval(decisionForm(graph.id))).rejects.toThrow(
      "INVENTORY_PILOT_CONFIGURATION_STALE",
    );
    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).toMatchObject({
      status: "PENDING_APPROVAL", version: 2,
    });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: graph.id } })).toMatchObject({
      status: "PENDING", currentStepOrder: 1,
    });

    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await cancelInventoryTransfer(form({ id: transferId, cancellationReason: "Rollover cancellation remains safe." }));
    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).toMatchObject({ status: "CANCELLED" });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: graph.id } })).toMatchObject({ status: "CANCELLED" });
  });

  test("activation rollover makes an admitted count replay and terminal approval fail closed, while exact cancellation remains coherent", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const count = await fixture.createInProgressStockCount();
    const key = `count-rollover-${fixture.tenantId}`;
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitStockCount(form({ id: count.sessionId, idempotencyKey: key }));
    const graph = await currentApproval({
      tenantId: fixture.tenantId, companyId: fixture.companyId,
      documentType: "StockCountAttemptReview", documentId: count.attemptId,
    });

    await fixture.rollOverActivation("StockCountAttemptReview");
    await expect(submitStockCount(form({ id: count.sessionId, idempotencyKey: key }))).rejects.toThrow(
      "STOCK_COUNT_APPROVAL_IDEMPOTENCY_CONFLICT",
    );
    mockContext.requireSessionContext.mockResolvedValue(fixture.approverSession);
    await expect(approveApproval(decisionForm(graph.id))).rejects.toThrow(
      "INVENTORY_PILOT_CONFIGURATION_STALE",
    );
    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } })).toMatchObject({
      status: "SUBMITTED", version: 2, currentAttemptId: count.attemptId,
    });
    expect(await prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: count.attemptId } })).toMatchObject({
      status: "SUBMITTED", version: 2,
    });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: graph.id } })).toMatchObject({ status: "PENDING" });

    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await cancelStockCount(form({ id: count.sessionId, cancellationReason: "Rollover cancellation remains safe." }));
    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } })).toMatchObject({ status: "CANCELLED" });
    expect(await prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: count.attemptId } })).toMatchObject({ status: "CANCELLED" });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: graph.id } })).toMatchObject({ status: "CANCELLED" });
  });

  test("live permission and exact location-scope revocation deny pending decisions without moving the source or graph", async () => {
    const transferFixture = await createInventoryPilotApprovalPgFixture();
    const transferId = await transferFixture.createDraftTransfer();
    mockContext.requireSessionContext.mockResolvedValue(transferFixture.requesterSession);
    await submitInventoryTransfer(form({ id: transferId, idempotencyKey: `transfer-permission-${transferFixture.tenantId}` }));
    const transferGraph = await currentApproval({
      tenantId: transferFixture.tenantId, companyId: transferFixture.companyId,
      documentType: "InventoryTransfer", documentId: transferId,
    });
    await prisma.userRoleAssignment.updateMany({
      where: { userId: transferFixture.approverUserId, roleId: transferFixture.approverRoleId },
      data: { status: "INACTIVE" },
    });
    mockContext.requireSessionContext.mockResolvedValue(transferFixture.approverSession);
    await expect(approveApproval(decisionForm(transferGraph.id))).rejects.toThrow("PERMISSION_DENIED");
    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).toMatchObject({ status: "PENDING_APPROVAL", version: 2 });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: transferGraph.id } })).toMatchObject({ status: "PENDING" });

    const countFixture = await createInventoryPilotApprovalPgFixture();
    const count = await countFixture.createInProgressStockCount();
    mockContext.requireSessionContext.mockResolvedValue(countFixture.requesterSession);
    await submitStockCount(form({ id: count.sessionId, idempotencyKey: `count-scope-${countFixture.tenantId}` }));
    const countGraph = await currentApproval({
      tenantId: countFixture.tenantId, companyId: countFixture.companyId,
      documentType: "StockCountAttemptReview", documentId: count.attemptId,
    });
    await prisma.userScopeAssignment.updateMany({
      where: {
        userId: countFixture.approverUserId,
        scopeType: "LOCATION",
        scopeId: countFixture.destinationLocationId,
      },
      data: { status: "INACTIVE" },
    });
    mockContext.requireSessionContext.mockResolvedValue(countFixture.approverSession);
    await expect(approveApproval(decisionForm(countGraph.id))).rejects.toThrow("APPROVAL_AUTHORITY_STALE");
    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } })).toMatchObject({ status: "SUBMITTED", version: 2 });
    expect(await prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: count.attemptId } })).toMatchObject({ status: "SUBMITTED", version: 2 });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: countGraph.id } })).toMatchObject({ status: "PENDING" });
  });

  test("requesters and counters cannot self-approve immutable transfer or count graphs", async () => {
    const transferFixture = await createInventoryPilotApprovalPgFixture(undefined, {
      requesterIsApprover: true,
    });
    const transferId = await transferFixture.createDraftTransfer();
    mockContext.requireSessionContext.mockResolvedValue(transferFixture.requesterSession);
    await submitInventoryTransfer(form({ id: transferId, idempotencyKey: `transfer-self-${transferFixture.tenantId}` }));
    const transferGraph = await currentApproval({
      tenantId: transferFixture.tenantId, companyId: transferFixture.companyId,
      documentType: "InventoryTransfer", documentId: transferId,
    });
    expect(transferFixture.approverUserId).not.toBe(transferFixture.requesterUserId);
    const transferStep = await prisma.approvalInstanceStep.findFirstOrThrow({
      where: { approvalInstanceId: transferGraph.id, stepOrder: 1 },
      include: { prohibitedActors: true },
    });
    expect(transferStep.assignedUserId).toBeNull();
    expect(transferStep.assignedRoleId).toBe(transferFixture.approverRoleId);
    expect(transferStep.prohibitedActors).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: transferFixture.requesterUserId, reasonCode: "REQUESTER" }),
    ]));
    mockContext.requireSessionContext.mockResolvedValue(transferFixture.requesterSession);
    await expect(approveApproval(decisionForm(transferGraph.id))).rejects.toThrow("SELF_APPROVAL_BLOCKED");
    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).toMatchObject({ status: "PENDING_APPROVAL", version: 2 });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: transferGraph.id } })).toMatchObject({ status: "PENDING" });

    const countFixture = await createInventoryPilotApprovalPgFixture(undefined, {
      requesterIsApprover: true,
    });
    const count = await countFixture.createInProgressStockCount();
    mockContext.requireSessionContext.mockResolvedValue(countFixture.requesterSession);
    await submitStockCount(form({ id: count.sessionId, idempotencyKey: `count-self-${countFixture.tenantId}` }));
    const countGraph = await currentApproval({
      tenantId: countFixture.tenantId, companyId: countFixture.companyId,
      documentType: "StockCountAttemptReview", documentId: count.attemptId,
    });
    expect(countFixture.approverUserId).not.toBe(countFixture.requesterUserId);
    const countStep = await prisma.approvalInstanceStep.findFirstOrThrow({
      where: { approvalInstanceId: countGraph.id, stepOrder: 1 },
      include: { prohibitedActors: true },
    });
    expect(countStep.assignedUserId).toBeNull();
    expect(countStep.assignedRoleId).toBe(countFixture.approverRoleId);
    expect(countStep.prohibitedActors).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: countFixture.requesterUserId, reasonCode: "COUNTER" }),
    ]));
    mockContext.requireSessionContext.mockResolvedValue(countFixture.requesterSession);
    await expect(approveApproval(decisionForm(countGraph.id))).rejects.toThrow("SELF_APPROVAL_BLOCKED");
    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } })).toMatchObject({ status: "SUBMITTED", version: 2 });
    expect(await prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: count.attemptId } })).toMatchObject({ status: "SUBMITTED", version: 2 });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: countGraph.id } })).toMatchObject({ status: "PENDING" });
  });

  test("a transfer approver remains barred from receipt custody after final approval", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const transferId = await fixture.createDraftTransfer();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitInventoryTransfer(form({ id: transferId, idempotencyKey: `transfer-receive-${fixture.tenantId}` }));
    const graph = await currentApproval({
      tenantId: fixture.tenantId, companyId: fixture.companyId,
      documentType: "InventoryTransfer", documentId: transferId,
    });
    mockContext.requireSessionContext.mockResolvedValue(fixture.approverSession);
    await approveApproval(decisionForm(graph.id));
    await grantRolePermission(fixture.approverRoleId, "inventory.transfer.receive");
    await prisma.inventoryTransfer.update({
      where: { id: transferId },
      data: { status: "DISPATCHED", dispatchedAt: new Date(), dispatchedByUserId: fixture.requesterUserId },
    });
    const line = await prisma.inventoryTransferLine.findFirstOrThrow({
      where: { inventoryTransferId: transferId },
      select: { id: true },
    });
    const receiverSession = {
      ...fixture.approverSession,
      context: {
        ...fixture.approverSession.context,
        locationId: fixture.destinationLocationId,
        locationName: "Pilot destination",
      },
    };
    mockContext.requireSessionContext.mockResolvedValue(receiverSession);
    await expect(receiveInventoryTransfer(form({
      id: transferId,
      idempotencyKey: `receipt-denied-${fixture.tenantId}`,
      [`lines.${line.id}.acceptedQty`]: "2",
    }))).rejects.toThrow("TRANSFER_APPROVER_CANNOT_RECEIVE");
    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).toMatchObject({ status: "DISPATCHED" });
    await expect(prisma.inventoryTransferReceipt.count({ where: { inventoryTransferId: transferId } })).resolves.toBe(0);
    await expect(prisma.inventoryMovement.count({ where: { sourceDocumentId: transferId } })).resolves.toBe(0);
  });

  test("adjacent-location and cross-tenant identifiers fail closed with zero source mutation", async () => {
    const target = await createInventoryPilotApprovalPgFixture();
    const foreign = await createInventoryPilotApprovalPgFixture();
    const transferId = await target.createDraftTransfer();
    const count = await target.createInProgressStockCount();

    mockContext.requireSessionContext.mockResolvedValue(foreign.requesterSession);
    await expect(submitInventoryTransfer(form({
      id: transferId,
      idempotencyKey: `cross-tenant-transfer-${target.tenantId}`,
    }))).rejects.toThrow(/TRANSFER_NOT_FOUND|PERMISSION_DENIED/);
    await expect(submitStockCount(form({
      id: count.sessionId,
      idempotencyKey: `cross-tenant-count-${target.tenantId}`,
    }))).rejects.toThrow(/STOCK_COUNT_NOT_FOUND|PERMISSION_DENIED/);

    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).toMatchObject({
      status: "DRAFT", version: 1,
    });
    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } })).toMatchObject({
      status: "IN_PROGRESS", version: 1,
    });
    await expect(prisma.approvalInstance.count({
      where: { tenantId: target.tenantId, documentId: { in: [transferId, count.attemptId] } },
    })).resolves.toBe(0);
    await expect(prisma.inventoryMovement.count({
      where: { tenantId: target.tenantId, sourceDocumentId: { in: [transferId, count.sessionId] } },
    })).resolves.toBe(0);

    await grantRolePermission(target.approverRoleId, "inventory.stock_count.submit");
    const adjacentLocationSession = {
      ...target.approverSession,
      permissionCodes: [...target.approverSession.permissionCodes, "inventory.stock_count.submit"],
      context: {
        ...target.approverSession.context,
        locationId: target.sourceLocationId,
        locationName: "Pilot source",
      },
    };
    mockContext.requireSessionContext.mockResolvedValue(adjacentLocationSession);
    await expect(submitStockCount(form({
      id: count.sessionId,
      idempotencyKey: `adjacent-count-${target.tenantId}`,
    }))).rejects.toThrow("STOCK_COUNT_NOT_FOUND");
    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } })).toMatchObject({
      status: "IN_PROGRESS", version: 1,
    });

    mockContext.requireSessionContext.mockResolvedValue(target.requesterSession);
    await submitInventoryTransfer(form({
      id: transferId,
      idempotencyKey: `target-transfer-${target.tenantId}`,
    }));
    const graph = await currentApproval({
      tenantId: target.tenantId,
      companyId: target.companyId,
      documentType: "InventoryTransfer",
      documentId: transferId,
    });
    const auditCountBefore = await prisma.auditEvent.count({
      where: { tenantId: target.tenantId, entityId: transferId },
    });
    const notificationCountBefore = await prisma.notification.count({
      where: { tenantId: target.tenantId, entityId: transferId },
    });

    mockContext.requireSessionContext.mockResolvedValue(foreign.approverSession);
    await expect(approveApproval(decisionForm(graph.id))).rejects.toThrow(
      /APPROVAL_NOT_ACTIONABLE|APPROVAL_NOT_FOUND|PERMISSION_DENIED/,
    );
    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).toMatchObject({
      status: "PENDING_APPROVAL", version: 2,
    });
    expect(await prisma.approvalInstance.findUniqueOrThrow({ where: { id: graph.id } })).toMatchObject({
      status: "PENDING", currentStepOrder: 1,
    });
    await expect(prisma.auditEvent.count({
      where: { tenantId: target.tenantId, entityId: transferId },
    })).resolves.toBe(auditCountBefore);
    await expect(prisma.notification.count({
      where: { tenantId: target.tenantId, entityId: transferId },
    })).resolves.toBe(notificationCountBefore);
    await expect(prisma.inventoryMovement.count({ where: { sourceDocumentId: transferId } })).resolves.toBe(0);
  });

  test("submitted-count cancellation is the only guarded terminal update and preserves immutable evidence", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const cancelled = await fixture.createInProgressStockCount();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitStockCount(form({
      id: cancelled.sessionId,
      idempotencyKey: `guard-cancel-${fixture.tenantId}`,
    }));

    await expect(prisma.$executeRaw`
      UPDATE "StockCountAttempt"
         SET "evidenceReference" = 'forged-after-submit'
       WHERE id = ${cancelled.attemptId}::uuid
    `).rejects.toThrow("Terminal stock count attempt evidence is immutable");

    await cancelStockCount(form({
      id: cancelled.sessionId,
      cancellationReason: "Controlled cancellation after immutable submission.",
    }));
    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: cancelled.sessionId } })).toMatchObject({
      status: "CANCELLED", version: 3,
    });
    expect(await prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: cancelled.attemptId } })).toMatchObject({
      status: "CANCELLED", version: 3,
      cancellationReason: "Controlled cancellation after immutable submission.",
    });
    await expect(prisma.$executeRaw`
      UPDATE "StockCountAttempt"
         SET "cancellationReason" = 'forged-after-cancellation'
       WHERE id = ${cancelled.attemptId}::uuid
    `).rejects.toThrow("Terminal stock count attempt evidence is immutable");

    const reviewed = await fixture.createInProgressStockCount();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitStockCount(form({
      id: reviewed.sessionId,
      idempotencyKey: `guard-review-${fixture.tenantId}`,
    }));
    const reviewedGraph = await currentApproval({
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      documentType: "StockCountAttemptReview",
      documentId: reviewed.attemptId,
    });
    mockContext.requireSessionContext.mockResolvedValue(fixture.approverSession);
    await approveApproval(decisionForm(reviewedGraph.id));
    expect(await prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: reviewed.attemptId } })).toMatchObject({
      status: "REVIEWED", version: 3,
    });
    await expect(prisma.$executeRaw`
      UPDATE "StockCountAttempt"
         SET "reviewNotes" = 'forged-after-review'
       WHERE id = ${reviewed.attemptId}::uuid
    `).rejects.toThrow("Terminal stock count attempt evidence is immutable");
    await expect(prisma.inventoryMovement.count({
      where: { tenantId: fixture.tenantId, sourceDocumentId: { in: [cancelled.sessionId, reviewed.sessionId] } },
    })).resolves.toBe(0);
  });
});
