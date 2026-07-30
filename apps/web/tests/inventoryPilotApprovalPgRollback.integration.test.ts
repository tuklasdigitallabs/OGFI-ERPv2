import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { Prisma, prisma } from "@ogfi/database";
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
  submitInventoryTransfer,
} from "../src/server/services/transfers";

const runPg = process.env.RUN_INVENTORY_PILOT_APPROVAL_PG_TESTS === "true";
const pgDescribe = runPg ? describe : describe.skip;
const expectedDatabase = runPg
  ? assertDisposableAuthorizationDatabaseConfigured(process.env)
  : null;

function action(data: Record<string, string>) {
  return actionForm(data);
}

function restoreEnvironmentValue(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/**
 * The disposable runner installs one fixed trigger after the production role
 * contract passes. Runtime can arm only an exact entity/event row; it cannot
 * create DDL or execute the trigger routine directly.
 */
async function withLateAuditFailure<T>(input: {
  entityId: string;
  eventType: string;
  run: () => Promise<T>;
}) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO ogfi_disposable_control.inventory_pilot_audit_failure
      (entity_id, event_type)
    VALUES (${input.entityId}::uuid, ${input.eventType})
  `);
  try {
    return await input.run();
  } finally {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM ogfi_disposable_control.inventory_pilot_audit_failure
       WHERE entity_id = ${input.entityId}::uuid
         AND event_type = ${input.eventType}
    `).catch(() => undefined);
  }
}

async function transferGraphCounts(input: { tenantId: string; companyId: string; transferId: string }) {
  const graphWhere = {
    tenantId: input.tenantId,
    companyId: input.companyId,
    documentType: "InventoryTransfer",
    documentId: input.transferId,
  };
  const graphs = await prisma.approvalInstance.findMany({
    where: graphWhere,
    select: { id: true, status: true, currentStepOrder: true },
  });
  const graphIds = graphs.map(({ id }) => id);
  return {
    graphs,
    steps: graphIds.length === 0
      ? []
      : await prisma.approvalInstanceStep.findMany({
          where: { approvalInstanceId: { in: graphIds } },
          select: { id: true, approvalInstanceId: true, status: true, actedByUserId: true, actedAt: true },
        }),
    intents: await prisma.inventoryTransferApprovalSubmissionIntent.count({
      where: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        inventoryTransferId: input.transferId,
      },
    }),
    audits: await prisma.auditEvent.count({
      where: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        entityType: "InventoryTransfer",
        entityId: input.transferId,
      },
    }),
    notifications: await prisma.notification.count({
      where: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        entityType: "InventoryTransfer",
        entityId: input.transferId,
      },
    }),
  };
}

async function countGraphCounts(input: { tenantId: string; companyId: string; sessionId: string; attemptId: string }) {
  const graphs = await prisma.approvalInstance.findMany({
    where: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      documentType: "StockCountAttemptReview",
      documentId: input.attemptId,
    },
    select: { id: true, status: true, currentStepOrder: true },
  });
  const graphIds = graphs.map(({ id }) => id);
  return {
    graphs,
    steps: graphIds.length === 0
      ? []
      : await prisma.approvalInstanceStep.findMany({
          where: { approvalInstanceId: { in: graphIds } },
          select: { id: true, approvalInstanceId: true, status: true, actedByUserId: true, actedAt: true },
        }),
    intents: await prisma.stockCountReviewSubmissionIntent.count({
      where: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        stockCountSessionId: input.sessionId,
        stockCountAttemptId: input.attemptId,
      },
    }),
    audits: await prisma.auditEvent.count({
      where: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        entityType: { in: ["StockCountSession", "StockCountAttempt"] },
        entityId: { in: [input.sessionId, input.attemptId] },
      },
    }),
    notifications: await prisma.notification.count({
      where: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        entityType: { in: ["StockCountSession", "StockCountAttempt"] },
        entityId: { in: [input.sessionId, input.attemptId] },
      },
    }),
  };
}

pgDescribe.sequential("DEC-0261 inventory-pilot PostgreSQL rollback integrity", () => {
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

  test("rolls back every transfer admission write when its late audit write fails", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const transferId = await fixture.createDraftTransfer();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);

    await expect(withLateAuditFailure({
      entityId: transferId,
      eventType: "inventory_transfer.approval_submitted",
      run: () => submitInventoryTransfer(action({ id: transferId, idempotencyKey: `rollback-transfer-admit-${fixture.tenantId}` })),
    })).rejects.toThrow("INVENTORY_PILOT_ROLLBACK_INJECTED");

    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).toMatchObject({
      status: "DRAFT", version: 1,
    });
    expect(await transferGraphCounts({
      tenantId: fixture.tenantId, companyId: fixture.companyId, transferId,
    })).toEqual({ graphs: [], steps: [], intents: 0, audits: 0, notifications: 0 });
    await expect(prisma.inventoryMovement.count({ where: { sourceDocumentId: transferId } })).resolves.toBe(0);
  });

  test("rolls back every count admission write when its late audit write fails", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const count = await fixture.createInProgressStockCount();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);

    await expect(withLateAuditFailure({
      entityId: count.attemptId,
      eventType: "stock_count.submitted",
      run: () => submitStockCount(action({ id: count.sessionId, idempotencyKey: `rollback-count-admit-${fixture.tenantId}` })),
    })).rejects.toThrow("INVENTORY_PILOT_ROLLBACK_INJECTED");

    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } })).toMatchObject({
      status: "IN_PROGRESS", version: 1, currentAttemptId: count.attemptId,
    });
    expect(await prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: count.attemptId } })).toMatchObject({
      status: "IN_PROGRESS", version: 1,
    });
    expect(await countGraphCounts({
      tenantId: fixture.tenantId, companyId: fixture.companyId, sessionId: count.sessionId, attemptId: count.attemptId,
    })).toEqual({ graphs: [], steps: [], intents: 0, audits: 0, notifications: 0 });
    await expect(prisma.inventoryMovement.count({ where: { sourceDocumentId: { in: [count.sessionId, count.attemptId] } } })).resolves.toBe(0);
  });

  test("rolls back final transfer approval, including the completed graph and source transition", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const transferId = await fixture.createDraftTransfer();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitInventoryTransfer(action({ id: transferId, idempotencyKey: `rollback-transfer-final-${fixture.tenantId}` }));
    const graph = await prisma.approvalInstance.findFirstOrThrow({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, documentType: "InventoryTransfer", documentId: transferId },
    });
    const before = await transferGraphCounts({ tenantId: fixture.tenantId, companyId: fixture.companyId, transferId });
    mockContext.requireSessionContext.mockResolvedValue(fixture.approverSession);

    await expect(withLateAuditFailure({
      entityId: transferId,
      eventType: "inventory_transfer.approved",
      run: () => approveApproval(action({ approvalInstanceId: graph.id, remarks: "Injected terminal rollback." })),
    })).rejects.toThrow("INVENTORY_PILOT_ROLLBACK_INJECTED");

    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).toMatchObject({
      status: "PENDING_APPROVAL", version: 2,
    });
    expect(await transferGraphCounts({ tenantId: fixture.tenantId, companyId: fixture.companyId, transferId })).toEqual(before);
    await expect(prisma.inventoryMovement.count({ where: { sourceDocumentId: transferId } })).resolves.toBe(0);
  });

  test("rolls back final count approval, including both source versions and graph decision", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const count = await fixture.createInProgressStockCount();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitStockCount(action({ id: count.sessionId, idempotencyKey: `rollback-count-final-${fixture.tenantId}` }));
    const graph = await prisma.approvalInstance.findFirstOrThrow({
      where: { tenantId: fixture.tenantId, companyId: fixture.companyId, documentType: "StockCountAttemptReview", documentId: count.attemptId },
    });
    const before = await countGraphCounts({
      tenantId: fixture.tenantId, companyId: fixture.companyId, sessionId: count.sessionId, attemptId: count.attemptId,
    });
    mockContext.requireSessionContext.mockResolvedValue(fixture.approverSession);

    await expect(withLateAuditFailure({
      entityId: count.attemptId,
      eventType: "stock_count.attempt_review_approved",
      run: () => approveApproval(action({ approvalInstanceId: graph.id, remarks: "Injected terminal rollback." })),
    })).rejects.toThrow("INVENTORY_PILOT_ROLLBACK_INJECTED");

    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } })).toMatchObject({
      status: "SUBMITTED", version: 2, currentAttemptId: count.attemptId,
    });
    expect(await prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: count.attemptId } })).toMatchObject({
      status: "SUBMITTED", version: 2,
    });
    expect(await countGraphCounts({
      tenantId: fixture.tenantId, companyId: fixture.companyId, sessionId: count.sessionId, attemptId: count.attemptId,
    })).toEqual(before);
    await expect(prisma.inventoryMovement.count({ where: { sourceDocumentId: { in: [count.sessionId, count.attemptId] } } })).resolves.toBe(0);
  });

  test("rolls back transfer cancellation after it has terminated the pending approval graph", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const transferId = await fixture.createDraftTransfer();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitInventoryTransfer(action({ id: transferId, idempotencyKey: `rollback-transfer-cancel-${fixture.tenantId}` }));
    const before = await transferGraphCounts({ tenantId: fixture.tenantId, companyId: fixture.companyId, transferId });

    await expect(withLateAuditFailure({
      entityId: transferId,
      eventType: "inventory_transfer.cancelled",
      run: () => cancelInventoryTransfer(action({ id: transferId, cancellationReason: "Injected cancellation rollback." })),
    })).rejects.toThrow("INVENTORY_PILOT_ROLLBACK_INJECTED");

    expect(await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId } })).toMatchObject({
      status: "PENDING_APPROVAL", version: 2,
    });
    expect(await transferGraphCounts({ tenantId: fixture.tenantId, companyId: fixture.companyId, transferId })).toEqual(before);
    await expect(prisma.inventoryMovement.count({ where: { sourceDocumentId: transferId } })).resolves.toBe(0);
  });

  test("rolls back count cancellation after it has terminated the pending approval graph", async () => {
    const fixture = await createInventoryPilotApprovalPgFixture();
    const count = await fixture.createInProgressStockCount();
    mockContext.requireSessionContext.mockResolvedValue(fixture.requesterSession);
    await submitStockCount(action({ id: count.sessionId, idempotencyKey: `rollback-count-cancel-${fixture.tenantId}` }));
    const before = await countGraphCounts({
      tenantId: fixture.tenantId, companyId: fixture.companyId, sessionId: count.sessionId, attemptId: count.attemptId,
    });

    await expect(withLateAuditFailure({
      entityId: count.sessionId,
      eventType: "stock_count.cancelled",
      run: () => cancelStockCount(action({ id: count.sessionId, cancellationReason: "Injected cancellation rollback." })),
    })).rejects.toThrow("INVENTORY_PILOT_ROLLBACK_INJECTED");

    expect(await prisma.stockCountSession.findUniqueOrThrow({ where: { id: count.sessionId } })).toMatchObject({
      status: "SUBMITTED", version: 2, currentAttemptId: count.attemptId,
    });
    expect(await prisma.stockCountAttempt.findUniqueOrThrow({ where: { id: count.attemptId } })).toMatchObject({
      status: "SUBMITTED", version: 2,
    });
    expect(await countGraphCounts({
      tenantId: fixture.tenantId, companyId: fixture.companyId, sessionId: count.sessionId, attemptId: count.attemptId,
    })).toEqual(before);
    await expect(prisma.inventoryMovement.count({ where: { sourceDocumentId: { in: [count.sessionId, count.attemptId] } } })).resolves.toBe(0);
  });
});
