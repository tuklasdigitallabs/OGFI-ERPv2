import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { prisma } from "@ogfi/database";
import { assertDisposableAuthorizationDatabaseConfigured, assertDisposableAuthorizationDatabaseMarker } from "./authorizationDatabaseSafety";
import { actionForm, createInventoryPilotApprovalPgFixture, type InventoryPilotApprovalPgFixture } from "./helpers/inventoryPilotApprovalPgFixtures";
const mockContext = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));
vi.mock("../src/server/services/context", async () => ({
  ...await vi.importActual<typeof import("../src/server/services/context")>("../src/server/services/context"),
  requireSessionContext: mockContext.requireSessionContext,
}));
import { permissions } from "../src/server/services/authorization";
import { withInventoryQuantityRead, INVENTORY_QUANTITY_READ_PROTECTED, redactProtectedInventoryAuditEvent } from "../src/server/services/inventoryQuantityRead";
import { getStockAdjustment, listStockAdjustments } from "../src/server/services/stockAdjustments";
import { listInventoryBalances, listInventoryMovements, listInventoryBalancePage } from "../src/server/services/inventory";
import { scheduleStockCount } from "../src/server/services/stockCounts";
import { resolveProjectRecordLinkSourceSummary } from "../src/server/services/projectRecordLinks";

const run = process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes";
const expectedDatabase = run ? assertDisposableAuthorizationDatabaseConfigured(process.env) : null;
const pg = run ? describe : describe.skip;
async function fixture() {
  const f = await createInventoryPilotApprovalPgFixture(prisma, { requesterIsApprover: true });
  const codes = [permissions.stockCountCreate, permissions.stockCountEnter, permissions.stockAdjustmentCreate, permissions.inventoryBalanceView, permissions.inventoryLedgerView];
  const role = await prisma.userRoleAssignment.findFirstOrThrow({ where: { userId: f.requesterUserId, role: { name: "Pilot requester" } }, select: { roleId: true } });
  const grants = await prisma.permission.findMany({ where: { code: { in: codes } } });
  expect(grants).toHaveLength(codes.length);
  await prisma.rolePermission.createMany({ data: grants.map(permission => ({ roleId: role.roleId, permissionId: permission.id })), skipDuplicates: true });
  f.requesterSession.permissionCodes = [...new Set([...f.requesterSession.permissionCodes, ...codes])];
  return f;
}
async function adjustment(f: InventoryPilotApprovalPgFixture) {
  return prisma.stockAdjustment.create({ data: {
    tenantId: f.tenantId, companyId: f.companyId, inventoryLocationId: f.destinationInventoryLocationId,
    publicReference: `READ-${randomUUID()}`, requestedByUserId: f.requesterUserId, adjustmentType: "INCREASE",
    reasonCode: "CORRECTION", reasonDescription: "Disposable confidentiality fixture", totalEstimatedValueImpact: 1,
    lines: { create: { tenantId: f.tenantId, companyId: f.companyId, inventoryLocationId: f.destinationInventoryLocationId,
      itemId: f.itemId, uomId: f.uomId, lineNumber: 1, reasonCode: "CORRECTION", systemQuantityBaseUom: 42,
      quantityDeltaBaseUom: 1, unitCost: 1, estimatedValueImpact: 1 } },
  } });
}
pg("quantity read PostgreSQL fences", () => {
  const authMode = process.env.AUTH_MODE;
  beforeAll(async () => {
    process.env.AUTH_MODE = "local";
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    expect(await prisma.$queryRaw`SELECT current_database() AS "currentDatabase"`).toEqual([{ currentDatabase: expectedDatabase }]);
  });
  afterAll(async () => {
    if (authMode === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = authMode;
    await prisma.$disconnect();
  });

  test("combined pilot requester/reviewer cannot obtain saved quantities via detail, balance, ledger, exports, audit or links", async () => {
    const f = await fixture(); const source = await adjustment(f);
    expect((await getStockAdjustment(f.requesterSession, source.id))?.lines[0]?.systemQuantityBaseUom).toBe(42);
    await f.createInProgressStockCount();
    const before = await prisma.inventoryMovement.count({ where: { tenantId: f.tenantId } });
    for (const read of [
      () => getStockAdjustment(f.requesterSession, source.id),
      () => listStockAdjustments(f.requesterSession, undefined, { maxRows: 10 }),
      () => listInventoryBalancePage(f.requesterSession),
      () => listInventoryBalances(f.requesterSession, {}, { maxRows: 10 }),
      () => listInventoryMovements(f.requesterSession, {}, { maxRows: 10 }),
    ]) await expect(read()).rejects.toThrow(INVENTORY_QUANTITY_READ_PROTECTED);
    expect((await resolveProjectRecordLinkSourceSummary(f.requesterSession, "STOCK_ADJUSTMENT", source.id)).visible).toBe(false);
    const event = await prisma.auditEvent.create({ data: { tenantId: f.tenantId, companyId: f.companyId, actorUserId: f.requesterUserId,
      entityType: "StockAdjustment", entityId: source.id, eventType: "stock_adjustment.created", metadata: { systemQuantityBaseUom: 42 } } });
    expect((await redactProtectedInventoryAuditEvent(f.requesterSession, event)).entityId).toBe("");
    expect((await prisma.auditEvent.findUniqueOrThrow({ where: { id: event.id } })).metadata).toEqual({ systemQuantityBaseUom: 42 });
    expect(await prisma.inventoryMovement.count({ where: { tenantId: f.tenantId } })).toBe(before);
    // Different assigned location is unaffected; caller still needs its existing read authority.
    await expect(withInventoryQuantityRead({ ...f.requesterSession, context: { ...f.requesterSession.context, locationId: f.sourceLocationId } }, async () => "source-only")).resolves.toBe("source-only");
  }, 60_000);

  test("schedule waits for the complete read projection, and the next read observes protection", async () => {
    const f = await fixture(); mockContext.requireSessionContext.mockResolvedValue(f.requesterSession);
    let started!: () => void; let release!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const read = withInventoryQuantityRead(f.requesterSession, async () => { started(); await gate; return "read-before-schedule"; });
    await entered;
    let finished = false;
    const schedule = scheduleStockCount(actionForm({ inventoryLocationId: f.destinationInventoryLocationId, countType: "CYCLE", blindCount: "true" }))
      .then(result => { finished = true; return result; });
    try {
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(finished).toBe(false);
      expect(await prisma.stockCountSession.count({ where: { tenantId: f.tenantId } })).toBe(0);
    } finally { release(); }
    await expect(read).resolves.toBe("read-before-schedule"); await schedule;
    await expect(withInventoryQuantityRead(f.requesterSession, async () => "must not leak")).rejects.toThrow(INVENTORY_QUANTITY_READ_PROTECTED);
    expect(await prisma.auditEvent.count({ where: { tenantId: f.tenantId, eventType: "stock_count.scheduled" } })).toBe(1);
  }, 60_000);

  test("failed reads release the fence without mutation and ordered multi-location readers cannot deadlock", async () => {
    const f = await fixture();
    await expect(withInventoryQuantityRead(f.requesterSession, async () => { throw new Error("PROJECTION_FAILED"); })).rejects.toThrow("PROJECTION_FAILED");
    const ids = [f.sourceInventoryLocationId, f.destinationInventoryLocationId];
    await expect(Promise.all([
      withInventoryQuantityRead(f.requesterSession, async () => "a", { inventoryLocationIds: ids }),
      withInventoryQuantityRead(f.requesterSession, async () => "b", { inventoryLocationIds: [...ids].reverse() }),
    ])).resolves.toEqual(["a", "b"]);
    expect(await prisma.stockCountSession.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await prisma.inventoryMovement.count({ where: { tenantId: f.tenantId } })).toBe(0);
  }, 60_000);
});
