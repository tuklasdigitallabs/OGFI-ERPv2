import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@ogfi/database";
import { permissions } from "../src/server/services/authorization";
import { exportLowStockRows, getLowStockDashboardRead, listLowStockPage, saveLowStockThreshold } from "../src/server/services/lowStock";
import { lockInventoryLocationsForPosting, postInventoryMovementInTransaction } from "../src/server/services/inventory";
import { assertDisposableAuthorizationDatabaseConfigured, assertDisposableAuthorizationDatabaseMarker } from "./authorizationDatabaseSafety";
import { createInventoryPilotApprovalPgFixture } from "./helpers/inventoryPilotApprovalPgFixtures";

const suite = process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes" ? describe : describe.skip;
async function fixture() {
  const f = await createInventoryPilotApprovalPgFixture(prisma, { requesterIsApprover: true });
  const codes = [permissions.itemMasterEdit, permissions.inventoryBalanceView];
  const role = await prisma.userRoleAssignment.findFirstOrThrow({ where: { userId: f.requesterUserId, role: { name: "Pilot requester" } } });
  const grants = await prisma.permission.findMany({ where: { code: { in: codes } } });
  expect(grants).toHaveLength(codes.length);
  await prisma.rolePermission.createMany({ data: grants.map(permission => ({ roleId: role.roleId, permissionId: permission.id })), skipDuplicates: true });
  await prisma.userScopeAssignment.updateMany({ where: { userId: f.requesterUserId }, data: { accessLevel: "MANAGE" } });
  f.requesterSession.permissionCodes.push(...codes);
  return f;
}

suite.sequential("location-aware low stock on PostgreSQL", () => {
  const authMode = process.env.AUTH_MODE;
  beforeAll(async () => {
    process.env.AUTH_MODE = "local";
    assertDisposableAuthorizationDatabaseConfigured(process.env);
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
  });
  afterAll(async () => {
    if (authMode === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = authMode;
    await prisma.$disconnect();
  });

  test("aggregates lots, includes zero/no-row, respects equality and inactive flags, and matches dashboard/export pages", async () => {
    const f = await fixture();
    const session = f.requesterSession;
    const template = await prisma.item.findUniqueOrThrow({ where: { id: f.itemId } });
    for (const [code, quantities, active, status] of [
      ["ABOVE", [4, 7], true, "ACTIVE"], ["EQUAL", [4, 6], true, "ACTIVE"],
      ["BELOW", [1, 2], true, "ACTIVE"], ["NO-ROW", [], true, "ACTIVE"],
      ["ZERO", [1, -1], true, "ACTIVE"], ["DISABLED", [], false, "ACTIVE"],
      ["INACTIVE", [], true, "INACTIVE"],
    ] as const) {
      const item = await prisma.item.create({ data: { tenantId: f.tenantId, companyId: f.companyId, itemCode: code, itemName: code, itemCategoryId: template.itemCategoryId, itemType: "INVENTORY", baseUomId: f.uomId } });
      for (const [index, qty] of quantities.entries()) await prisma.$transaction(async tx => {
        const lock = await lockInventoryLocationsForPosting(tx, session, [f.destinationInventoryLocationId]);
        await postInventoryMovementInTransaction(tx, session, lock, {
          inventoryLocationId: f.destinationInventoryLocationId, itemId: item.id, movementType: qty > 0 ? "RECEIPT_IN" : "ADJUSTMENT_OUT",
          occurredAt: new Date(), enteredQuantity: Math.abs(qty), enteredUomId: f.uomId, quantityDeltaBaseUom: qty,
          sourceDocumentType: "TEST_LOW_STOCK", sourceDocumentId: randomUUID(), sourceEventKey: `${code}-${index}`,
          lotNumber: code === "ZERO" ? null : `LOT-${index}`,
        });
      });
      await saveLowStockThreshold(session, { inventoryLocationId: f.destinationInventoryLocationId, itemCode: code, thresholdQuantity: code === "ZERO" ? "0" : "10", active, expectedVersion: 0, reason: "Reviewed test reorder threshold" });
      if (status === "INACTIVE") await prisma.item.update({ where: { id: item.id }, data: { status } });
    }
    const movements = await prisma.inventoryMovement.count({ where: { tenantId: f.tenantId } });
    const page = await listLowStockPage(session, { pageSize: 100 });
    expect(page.items.map(row => row.itemCode)).toEqual(["BELOW", "EQUAL", "NO-ROW", "ZERO"]);
    expect(page.totalItems).toBe(4);
    expect(page.items.find(row => row.itemCode === "EQUAL")).toMatchObject({ recordedOnHand: "10.000000", balanceRows: 2 });
    expect(page.items.find(row => row.itemCode === "NO-ROW")).toMatchObject({ recordedOnHand: "0", balanceRows: 0 });
    expect(page.items.find(row => row.itemCode === "ZERO")).toMatchObject({ recordedOnHand: "0.000000", balanceRows: 1 });
    expect((await getLowStockDashboardRead(session)).items).toEqual(page.items);
    expect(await exportLowStockRows(session, { maxRows: 100 })).toEqual(page.items);
    expect((await listLowStockPage(session, { pageSize: 2, page: 2 })).items.map(row => row.itemCode)).toEqual(["NO-ROW", "ZERO"]);
    expect((await listLowStockPage(session, { query: "equal" })).totalItems).toBe(1);
    expect((await listLowStockPage(session, { alertsOnly: false })).totalItems).toBe(7);
    await expect(exportLowStockRows(session, { maxRows: 2 })).rejects.toThrow("REPORT_EXPORT_ROW_LIMIT_EXCEEDED");
    const warehouse = { ...session, context: { ...session.context, locationId: f.sourceLocationId } };
    expect((await getLowStockDashboardRead(warehouse)).totalItems).toBe(0);
    await saveLowStockThreshold(warehouse, { inventoryLocationId: f.sourceInventoryLocationId, itemCode: "EQUAL", thresholdQuantity: "100", active: true, expectedVersion: 0, reason: "Independent warehouse threshold" });
    expect((await getLowStockDashboardRead(warehouse)).items[0]).toMatchObject({ thresholdQuantity: "100.000000", balanceRows: 0 });
    expect((await getLowStockDashboardRead(session)).totalItems).toBe(4);
    expect(await prisma.inventoryMovement.count({ where: { tenantId: f.tenantId } })).toBe(movements);
  }, 120_000);

  test("MANAGE, selected scope, precision, audited CAS and deactivation are enforced without movements", async () => {
    const f = await fixture(); const session = f.requesterSession;
    const item = await prisma.item.findUniqueOrThrow({ where: { id: f.itemId } });
    const input = { inventoryLocationId: f.destinationInventoryLocationId, itemCode: item.itemCode, thresholdQuantity: "1.234567", active: true, expectedVersion: 0, reason: "Reviewed threshold" };
    for (const value of ["-1", "1.2345678", "1000000000000", "NaN", "Infinity"]) await expect(saveLowStockThreshold(session, { ...input, thresholdQuantity: value })).rejects.toThrow();
    await expect(saveLowStockThreshold(session, { ...input, inventoryLocationId: f.sourceInventoryLocationId })).rejects.toThrow("SCOPE_DENIED");
    await prisma.userScopeAssignment.updateMany({ where: { userId: session.user.id }, data: { accessLevel: "VIEW" } });
    await expect(saveLowStockThreshold(session, input)).rejects.toThrow("SCOPE_DENIED");
    await prisma.userScopeAssignment.updateMany({ where: { userId: session.user.id }, data: { accessLevel: "MANAGE" } });
    expect(await prisma.inventoryLowStockThreshold.count({ where: { companyId: f.companyId } })).toBe(0);
    const created = await saveLowStockThreshold(session, input);
    await expect(saveLowStockThreshold(session, input)).rejects.toThrow("LOW_STOCK_THRESHOLD_STALE");
    const results = await Promise.allSettled([
      saveLowStockThreshold(session, { ...input, expectedVersion: 1, thresholdQuantity: "2" }),
      saveLowStockThreshold(session, { ...input, expectedVersion: 1, thresholdQuantity: "3" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.auditEvent.count({ where: { entityId: created.id } })).toBe(2);
    await saveLowStockThreshold(session, { ...input, expectedVersion: 2, active: false });
    expect((await listLowStockPage(session)).totalItems).toBe(0);
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { entityId: created.id, eventType: "inventory.low_stock_threshold.updated" }, orderBy: { occurredAt: "desc" } });
    expect(audit.afterData).toMatchObject({ active: false, version: 3 });
    expect(audit.metadata).toMatchObject({ reason: "Reviewed threshold", measure: "RECORDED_ON_HAND" });
    expect(await prisma.inventoryMovement.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await prisma.inventoryBalance.count({ where: { tenantId: f.tenantId } })).toBe(0);
    await expect(listLowStockPage({ ...session, context: { ...session.context, locationId: randomUUID() } })).rejects.toThrow("SCOPE_DENIED");
  }, 120_000);

  test("a combined requester/reviewer cannot infer stock from alert membership, totals or exports during blind counts", async () => {
    const f = await fixture(); const session = f.requesterSession;
    const item = await prisma.item.findUniqueOrThrow({ where: { id: f.itemId } });
    await saveLowStockThreshold(session, { inventoryLocationId: f.destinationInventoryLocationId, itemCode: item.itemCode, thresholdQuantity: "10", active: true, expectedVersion: 0, reason: "Test confidentiality" });
    expect((await getLowStockDashboardRead(session)).totalItems).toBe(1);
    await f.createInProgressStockCount();
    for (const read of [() => getLowStockDashboardRead(session), () => listLowStockPage(session), () => listLowStockPage(session, { alertsOnly: false }), () => exportLowStockRows(session, { maxRows: 100 })]) await expect(read()).rejects.toThrow("INVENTORY_QUANTITY_READ_PROTECTED");
    expect(await prisma.inventoryMovement.count({ where: { tenantId: f.tenantId } })).toBe(0);
  }, 120_000);
});
