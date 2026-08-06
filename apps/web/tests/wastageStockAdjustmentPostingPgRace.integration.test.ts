import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { prisma } from "@ogfi/database";
import { permissions } from "../src/server/services/authorization";
import {
  approveStockAdjustment,
  approveWastageReport,
} from "../src/server/services/approvals";
import type { SessionContext } from "../src/server/services/context";
import {
  postStockAdjustment,
  reverseStockAdjustment,
} from "../src/server/services/stockAdjustments";
import {
  postWastageReport,
  reverseWastageReport,
} from "../src/server/services/wastage";
import {
  lockInventoryLocationForPosting,
  postInventoryMovementInTransaction,
} from "../src/server/services/inventory";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";
import { assertPrivilegedMfaForAction } from "../src/server/services/privilegedMfaGuard";
import {
  createApprovalDecisionPgFixture,
  createSharedProcurementInventorySource,
  type ApprovalDecisionPgFixture,
} from "./helpers/approvalDecisionPgFixtures";

const mockContext = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));

vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<typeof import("../src/server/services/context")>(
    "../src/server/services/context",
  );
  return { ...actual, requireSessionContext: mockContext.requireSessionContext };
});

const runPg = process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes";
const pgDescribe = runPg ? describe : describe.skip;
const expectedDatabase = runPg
  ? assertDisposableAuthorizationDatabaseConfigured(process.env)
  : null;

function actionForm(id: string, field?: [string, string]) {
  const form = new FormData();
  form.set("id", id);
  if (field) form.set(field[0], field[1]);
  return form;
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function holdWastageOrAdjustmentSource(
  fixture: ApprovalDecisionPgFixture,
  family: "WastageReport" | "StockAdjustment",
) {
  const ready = deferred<void>();
  const release = deferred<void>();
  let blockerPid = 0;
  const blocker = prisma.$transaction(async (tx) => {
    try {
      [{ blockerPid }] = await tx.$queryRaw<Array<{ blockerPid: number }>>`
        SELECT pg_backend_pid() AS "blockerPid"
      `;
      if (family === "WastageReport") {
        await tx.$queryRaw`SELECT id FROM "WastageReport" WHERE id = ${fixture.sourceId}::uuid FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT id FROM "StockAdjustment" WHERE id = ${fixture.sourceId}::uuid FOR UPDATE`;
      }
      ready.resolve();
      await release.promise;
    } catch (error) {
      ready.reject(error);
      throw error;
    }
  }, { timeout: 15_000 });
  await ready.promise;
  return { blocker, blockerPid, release };
}

async function waitForSourceLockBlock(
  blockerPid: number,
  family: "WastageReport" | "StockAdjustment",
) {
  const deadline = Date.now() + 3_000;
  const relation = family === "WastageReport" ? "WastageReport" : "StockAdjustment";
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ query: string }>>`
      SELECT activity.query
        FROM pg_stat_activity activity
       WHERE activity.datname = current_database()
         AND activity.pid <> pg_backend_pid()
         AND ${blockerPid}::int = ANY(pg_blocking_pids(activity.pid))
    `;
    if (rows.some(({ query }) => new RegExp(`FROM "${relation}"[\\s\\S]*FOR UPDATE`, "i").test(query))) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`POSTING_SOURCE_LOCK_NOT_OBSERVED:${family}:${blockerPid}`);
}

async function makePostingReadyFixture(
  family: "WastageReport" | "StockAdjustment",
): Promise<{ fixture: ApprovalDecisionPgFixture; session: SessionContext }> {
  const postingPermission = family === "WastageReport"
    ? permissions.wastagePost
    : permissions.stockAdjustmentPost;
  const reversalPermission = family === "WastageReport"
    ? permissions.wastageReverse
    : permissions.stockAdjustmentReverse;
  const fixture = await createApprovalDecisionPgFixture({
    family,
    extraPermissionCodes: [postingPermission, reversalPermission],
    createSource: (context) => createSharedProcurementInventorySource(family, context),
  });
  const session = fixture.sessionFor(1);
  const sessionId = randomUUID();
  const mfaAuthenticatedAt = new Date();
  const expiry = new Date(Date.now() + 60 * 60_000);
  const actor = await prisma.user.findUniqueOrThrow({
    where: { id: fixture.approverUserIds[0] },
    select: { privilegeEpoch: true },
  });
  await prisma.authSession.create({
    data: {
      id: sessionId,
      tenantId: fixture.tenantId,
      userId: fixture.approverUserIds[0],
      tokenHash: `posting-race-${sessionId}`,
      status: "ACTIVE",
      assuranceLevel: "MFA",
      mfaAuthenticatedAt,
      privilegeEpochAtIssue: actor.privilegeEpoch,
      idleExpiresAt: expiry,
      absoluteExpiresAt: expiry,
    },
  });
  // The approval and posting races use one live MFA session. This verifies the
  // real guard without a test-only bypass and retains the same authority
  // snapshot through both controlled actions.
  session.authentication = {
    sessionId,
    assuranceLevel: "MFA",
    mfaAuthenticatedAt,
    absoluteExpiresAt: expiry,
  };
  mockContext.requireSessionContext.mockResolvedValue(session);
  const approval = new FormData();
  approval.set("approvalInstanceId", fixture.approvalInstanceId);
  approval.set("remarks", "Approve disposable posting race fixture.");
  if (family === "WastageReport") await approveWastageReport(approval);
  else await approveStockAdjustment(approval);

  if (family === "WastageReport") {
    const report = await prisma.wastageReport.findUniqueOrThrow({
      where: { id: fixture.sourceId },
      include: { lines: { include: { item: true } } },
    });
    const line = report.lines[0];
    if (!line) throw new Error("POSTING_RACE_WASTAGE_LINE_MISSING");
    // The baseline is fixture-only: it represents stock already present before
    // the report and keeps the ledger and derived balance mutually consistent.
    await prisma.$transaction(async (tx) => {
      const lock = await lockInventoryLocationForPosting(
        tx,
        session,
        line.inventoryLocationId,
      );
      await postInventoryMovementInTransaction(tx, session, lock, {
        inventoryLocationId: line.inventoryLocationId,
        itemId: line.itemId,
        movementType: "ADJUSTMENT_IN",
        occurredAt: new Date(),
        enteredQuantity: 10,
        enteredUomId: line.uomId,
        quantityDeltaBaseUom: 10,
        sourceDocumentType: "DisposablePostingRaceBaseline",
        sourceDocumentId: randomUUID(),
        sourceEventKey: `wastage-baseline-${fixture.sourceId}`,
        reasonCode: "TEST_BASELINE",
      });
    });
  }
  return { fixture, session };
}

async function expectExactlyOneMovementPerDirection(
  fixture: ApprovalDecisionPgFixture,
  sourceDocumentType: "WastageReport" | "StockAdjustment",
) {
  const movements = await prisma.inventoryMovement.findMany({
    where: {
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      sourceDocumentType,
      sourceDocumentId: fixture.sourceId,
    },
    orderBy: { createdAt: "asc" },
  });
  expect(movements).toHaveLength(2);
  expect(movements.filter((movement) => movement.movementType === "REVERSAL")).toHaveLength(1);
  expect(movements.filter((movement) => movement.movementType !== "REVERSAL")).toHaveLength(1);
  expect(movements[1]?.reversalOfMovementId).toBe(movements[0]?.id);
}

async function inventoryBalanceSnapshot(
  fixture: ApprovalDecisionPgFixture,
  family: "WastageReport" | "StockAdjustment",
) {
  const line = family === "WastageReport"
    ? await prisma.wastageLine.findFirstOrThrow({ where: { wastageReportId: fixture.sourceId }, select: { inventoryLocationId: true, itemId: true } })
    : await prisma.stockAdjustmentLine.findFirstOrThrow({ where: { stockAdjustmentId: fixture.sourceId }, select: { inventoryLocationId: true, itemId: true, lotKey: true } });
  const lotKey = family === "WastageReport"
    ? "NOLOT|NOEXP"
    : "lotKey" in line
      ? line.lotKey
      : "NOLOT|NOEXP";
  return prisma.inventoryBalance.findUnique({
    where: {
      inventoryLocationId_itemId_lotKey: {
        inventoryLocationId: line.inventoryLocationId,
        itemId: line.itemId,
        lotKey,
      },
    },
    select: { qtyOnHand: true, version: true },
  });
}

pgDescribe.sequential("wastage and stock-adjustment PostgreSQL posting races", () => {
  const originalAuthMode = process.env.AUTH_MODE;
  const originalMfaStepUpMinutes = process.env.AUTH_MFA_STEP_UP_MINUTES;

  beforeAll(async () => {
    process.env.AUTH_MODE = "local";
    process.env.AUTH_MFA_STEP_UP_MINUTES = "60";
    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const database = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    expect(database).toEqual([{ currentDatabase: expectedDatabase }]);
    for (const [code, action] of [
      [permissions.wastagePost, "wastage.post"],
      [permissions.wastageReverse, "wastage.reverse"],
      [permissions.stockAdjustmentPost, "stock_adjustment.post"],
      [permissions.stockAdjustmentReverse, "stock_adjustment.reverse"],
    ] as const) {
      await prisma.permission.upsert({
        where: { code }, update: {}, create: { code, module: "inventory", action },
      });
    }
  });

  afterAll(async () => {
    if (originalAuthMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = originalAuthMode;
    if (originalMfaStepUpMinutes === undefined) delete process.env.AUTH_MFA_STEP_UP_MINUTES;
    else process.env.AUTH_MFA_STEP_UP_MINUTES = originalMfaStepUpMinutes;
    await prisma.$disconnect();
  });

  test.each([
    ["wastage", "WastageReport" as const],
    ["stock adjustment", "StockAdjustment" as const],
  ])("serializes concurrent %s post and reversal attempts", async (_label, family) => {
    const { fixture, session } = await makePostingReadyFixture(family);
    mockContext.requireSessionContext.mockResolvedValue(session);
    const post = family === "WastageReport" ? postWastageReport : postStockAdjustment;
    const reverse = family === "WastageReport" ? reverseWastageReport : reverseStockAdjustment;
    await expect(assertPrivilegedMfaForAction(session, {
      action: family === "WastageReport" ? "wastage_report.post" : "stock_adjustment.post",
      enforcementScope: "all_sensitive",
      permissionCode: family === "WastageReport" ? permissions.wastagePost : permissions.stockAdjustmentPost,
      entityType: family,
      entityId: fixture.sourceId,
      reason: "Validate disposable MFA fixture before racing posting.",
    })).resolves.toMatchObject({ required: true });

    const postResults = await Promise.allSettled([
      post(actionForm(fixture.sourceId)),
      post(actionForm(fixture.sourceId)),
    ]);
    if (postResults.some((result) => result.status === "rejected")) {
      throw new Error(
        postResults
          .map((result) => result.status === "rejected" ? String(result.reason) : result.status)
          .join(" | "),
      );
    }

    const posted = family === "WastageReport"
      ? await prisma.wastageReport.findUniqueOrThrow({ where: { id: fixture.sourceId } })
      : await prisma.stockAdjustment.findUniqueOrThrow({ where: { id: fixture.sourceId } });
    expect(posted.status).toBe("POSTED");
    expect(posted.postedAt).not.toBeNull();

    const reverseResults = await Promise.allSettled([
      reverse(actionForm(fixture.sourceId, ["reversalReason", "Dispose duplicate reversal race safely."])),
      reverse(actionForm(fixture.sourceId, ["reversalReason", "Dispose duplicate reversal race safely."])),
    ]);
    if (reverseResults.some((result) => result.status === "rejected")) {
      throw new Error(
        reverseResults
          .map((result) => result.status === "rejected" ? String(result.reason) : result.status)
          .join(" | "),
      );
    }

    const reversed = family === "WastageReport"
      ? await prisma.wastageReport.findUniqueOrThrow({ where: { id: fixture.sourceId } })
      : await prisma.stockAdjustment.findUniqueOrThrow({ where: { id: fixture.sourceId } });
    expect(reversed.status).toBe("REVERSED");
    expect(reversed.reversedAt).not.toBeNull();
    await expectExactlyOneMovementPerDirection(fixture, family);
  });

  test.each([
    ["wastage", "WastageReport" as const],
    ["stock adjustment", "StockAdjustment" as const],
  ])("denies %s posting after live permission revocation without mutation", async (_label, family) => {
    const { fixture, session } = await makePostingReadyFixture(family);
    mockContext.requireSessionContext.mockResolvedValue(session);
    await prisma.userRoleAssignment.updateMany({
      where: { userId: session.user.id, status: "ACTIVE" },
      data: { status: "INACTIVE", endsAt: new Date() },
    });

    const sourceBefore = family === "WastageReport"
      ? await prisma.wastageReport.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, postedAt: true } })
      : await prisma.stockAdjustment.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, postedAt: true } });
    const movementCountBefore = await prisma.inventoryMovement.count({
      where: { sourceDocumentType: family, sourceDocumentId: fixture.sourceId },
    });
    const balanceBefore = await inventoryBalanceSnapshot(fixture, family);
    const auditCountBefore = await prisma.auditEvent.count({
      where: { entityType: family, entityId: fixture.sourceId },
    });
    const notificationCountBefore = await prisma.notification.count({
      where: { entityType: family, entityId: fixture.sourceId },
    });
    const post = family === "WastageReport" ? postWastageReport : postStockAdjustment;
    await expect(post(actionForm(fixture.sourceId))).rejects.toThrow(/AUTHORITY_STALE|PERMISSION_DENIED/);
    const sourceAfter = family === "WastageReport"
      ? await prisma.wastageReport.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, postedAt: true } })
      : await prisma.stockAdjustment.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, postedAt: true } });
    expect(sourceAfter).toEqual(sourceBefore);
    await expect(prisma.inventoryMovement.count({
      where: { sourceDocumentType: family, sourceDocumentId: fixture.sourceId },
    })).resolves.toBe(movementCountBefore);
    await expect(inventoryBalanceSnapshot(fixture, family)).resolves.toEqual(balanceBefore);
    await expect(prisma.auditEvent.count({
      where: { entityType: family, entityId: fixture.sourceId },
    })).resolves.toBe(auditCountBefore);
    await expect(prisma.notification.count({
      where: { entityType: family, entityId: fixture.sourceId },
    })).resolves.toBe(notificationCountBefore);
  });

  test.each([
    ["wastage", "WastageReport" as const],
    ["stock adjustment", "StockAdjustment" as const],
  ])("denies %s posting when permission is revoked during source-lock wait", async (_label, family) => {
    const { fixture, session } = await makePostingReadyFixture(family);
    mockContext.requireSessionContext.mockResolvedValue(session);
    const post = family === "WastageReport" ? postWastageReport : postStockAdjustment;
    const sourceBefore = family === "WastageReport"
      ? await prisma.wastageReport.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, postedAt: true } })
      : await prisma.stockAdjustment.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, postedAt: true } });
    const balanceBefore = await inventoryBalanceSnapshot(fixture, family);
    const movementCountBefore = await prisma.inventoryMovement.count({ where: { sourceDocumentType: family, sourceDocumentId: fixture.sourceId } });
    const blocker = await holdWastageOrAdjustmentSource(fixture, family);
    const postPromise = post(actionForm(fixture.sourceId));
    try {
      await waitForSourceLockBlock(blocker.blockerPid, family);
      await prisma.userRoleAssignment.updateMany({
        where: { userId: session.user.id, status: "ACTIVE" },
        data: { status: "INACTIVE", endsAt: new Date() },
      });
    } catch (error) {
      blocker.release.resolve();
      await Promise.allSettled([postPromise, blocker.blocker]);
      throw error;
    }
    blocker.release.resolve();
    await expect(postPromise).rejects.toThrow(/AUTHORITY_STALE|PERMISSION_DENIED/);
    await blocker.blocker;
    const sourceAfter = family === "WastageReport"
      ? await prisma.wastageReport.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, postedAt: true } })
      : await prisma.stockAdjustment.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, postedAt: true } });
    expect(sourceAfter).toEqual(sourceBefore);
    await expect(prisma.inventoryMovement.count({ where: { sourceDocumentType: family, sourceDocumentId: fixture.sourceId } })).resolves.toBe(movementCountBefore);
    await expect(inventoryBalanceSnapshot(fixture, family)).resolves.toEqual(balanceBefore);
  });

  test.each([
    ["wastage", "WastageReport" as const],
    ["stock adjustment", "StockAdjustment" as const],
  ])("denies %s reversal after live session revocation without mutation", async (_label, family) => {
    const { fixture, session } = await makePostingReadyFixture(family);
    mockContext.requireSessionContext.mockResolvedValue(session);
    const post = family === "WastageReport" ? postWastageReport : postStockAdjustment;
    const reverse = family === "WastageReport" ? reverseWastageReport : reverseStockAdjustment;
    await post(actionForm(fixture.sourceId));
    const before = await prisma.inventoryMovement.findMany({
      where: { sourceDocumentType: family, sourceDocumentId: fixture.sourceId },
      orderBy: { createdAt: "asc" },
      select: { id: true, movementType: true, quantityDeltaBaseUom: true, reversalOfMovementId: true },
    });
    const balanceBefore = await inventoryBalanceSnapshot(fixture, family);
    const auditCountBefore = await prisma.auditEvent.count({
      where: { entityType: family, entityId: fixture.sourceId },
    });
    const notificationCountBefore = await prisma.notification.count({
      where: { entityType: family, entityId: fixture.sourceId },
    });
    await prisma.authSession.update({
      where: { id: session.authentication!.sessionId },
      data: { status: "REVOKED", revokedAt: new Date(), revocationReason: "Disposable reversal revocation race" },
    });
    await expect(reverse(actionForm(fixture.sourceId, ["reversalReason", "Revocation must prevent reversal."]))).rejects.toThrow(/AUTHORITY_STALE|PERMISSION_DENIED/);
    const after = await prisma.inventoryMovement.findMany({
      where: { sourceDocumentType: family, sourceDocumentId: fixture.sourceId },
      orderBy: { createdAt: "asc" },
      select: { id: true, movementType: true, quantityDeltaBaseUom: true, reversalOfMovementId: true },
    });
    expect(after).toEqual(before);
    await expect(inventoryBalanceSnapshot(fixture, family)).resolves.toEqual(balanceBefore);
    await expect(prisma.auditEvent.count({
      where: { entityType: family, entityId: fixture.sourceId },
    })).resolves.toBe(auditCountBefore);
    await expect(prisma.notification.count({
      where: { entityType: family, entityId: fixture.sourceId },
    })).resolves.toBe(notificationCountBefore);
    const source = family === "WastageReport"
      ? await prisma.wastageReport.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, reversedAt: true } })
      : await prisma.stockAdjustment.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, reversedAt: true } });
    expect(source.status).toBe("POSTED");
    expect(source.reversedAt).toBeNull();
  });

  test.each([
    ["wastage", "WastageReport" as const],
    ["stock adjustment", "StockAdjustment" as const],
  ])("denies %s reversal when session is revoked during source-lock wait", async (_label, family) => {
    const { fixture, session } = await makePostingReadyFixture(family);
    mockContext.requireSessionContext.mockResolvedValue(session);
    const post = family === "WastageReport" ? postWastageReport : postStockAdjustment;
    const reverse = family === "WastageReport" ? reverseWastageReport : reverseStockAdjustment;
    await post(actionForm(fixture.sourceId));
    const sourceBefore = family === "WastageReport"
      ? await prisma.wastageReport.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, reversedAt: true } })
      : await prisma.stockAdjustment.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, reversedAt: true } });
    const movementBefore = await prisma.inventoryMovement.findMany({
      where: { sourceDocumentType: family, sourceDocumentId: fixture.sourceId },
      orderBy: { createdAt: "asc" },
      select: { id: true, movementType: true, quantityDeltaBaseUom: true, reversalOfMovementId: true },
    });
    const balanceBefore = await inventoryBalanceSnapshot(fixture, family);
    const blocker = await holdWastageOrAdjustmentSource(fixture, family);
    const reversePromise = reverse(actionForm(fixture.sourceId, ["reversalReason", "Revocation must prevent reversal while waiting."]));
    try {
      await waitForSourceLockBlock(blocker.blockerPid, family);
      await prisma.authSession.update({
        where: { id: session.authentication!.sessionId },
        data: { status: "REVOKED", revokedAt: new Date(), revocationReason: "Disposable lock-wait session revocation" },
      });
    } catch (error) {
      blocker.release.resolve();
      await Promise.allSettled([reversePromise, blocker.blocker]);
      throw error;
    }
    blocker.release.resolve();
    await expect(reversePromise).rejects.toThrow(/AUTHORITY_STALE|PERMISSION_DENIED/);
    await blocker.blocker;
    const sourceAfter = family === "WastageReport"
      ? await prisma.wastageReport.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, reversedAt: true } })
      : await prisma.stockAdjustment.findUniqueOrThrow({ where: { id: fixture.sourceId }, select: { status: true, reversedAt: true } });
    expect(sourceAfter).toEqual(sourceBefore);
    await expect(prisma.inventoryMovement.findMany({
      where: { sourceDocumentType: family, sourceDocumentId: fixture.sourceId },
      orderBy: { createdAt: "asc" },
      select: { id: true, movementType: true, quantityDeltaBaseUom: true, reversalOfMovementId: true },
    })).resolves.toEqual(movementBefore);
    await expect(inventoryBalanceSnapshot(fixture, family)).resolves.toEqual(balanceBefore);
  });
});
