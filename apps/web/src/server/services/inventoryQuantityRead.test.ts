import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma, type TransactionClient } from "@ogfi/database";
import { afterEach, describe, expect, test, vi } from "vitest";
import { permissions } from "./authorization";
import type { SessionContext } from "./context";
import { canExposeStockCountProtectedFacts } from "./stockCountConfidentiality";
import {
  assertInventoryQuantityReadAllowed,
  canReadCountDerivedAdjustment,
  INVENTORY_QUANTITY_READ_PROTECTED,
  redactProtectedInventoryAuditEvent,
  withInventoryQuantityRead,
} from "./inventoryQuantityRead";
import { getStockAdjustment, listStockAdjustments, listStockAdjustmentPage } from "./stockAdjustments";
import { resolveProjectRecordLinkSourceSummary } from "./projectRecordLinks";
import { exportErrorResponse } from "./exportErrors";

const session = {
  user: { id: "counter" },
  context: { tenantId: "tenant", companyId: "company", locationId: "location" },
  permissionCodes: [permissions.stockCountReview, permissions.stockAdjustmentCreate, permissions.inventoryBalanceView, permissions.inventoryLedgerView],
} as SessionContext;
const line = { countedQuantityBaseUom: 7, countedByUserId: "counter", countedAt: new Date() };
function count(status: string, actor = "counter") {
  return { status, blindCount: true, createdByUserId: actor, assignedToUserId: actor, lines: [{ ...line, countedByUserId: actor }] };
}
function transaction(counts: unknown[] = []) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "inventory-location" }]),
    stockCountSession: { findMany: vi.fn().mockResolvedValue(counts), findFirst: vi.fn() },
    stockCountAttempt: { findFirst: vi.fn() },
    stockAdjustment: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    inventoryBalance: { findMany: vi.fn(), findFirst: vi.fn() },
  };
}
function mockTransaction(tx: ReturnType<typeof transaction>) {
  vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: unknown) =>
    (callback as (tx: TransactionClient) => Promise<unknown>)(tx as unknown as TransactionClient));
}
afterEach(() => vi.restoreAllMocks());

describe("blind quantity read boundary", () => {
  test.each(["SCHEDULED", "DRAFT", "IN_PROGRESS", "SUBMITTED", "RECOUNT", "RECOUNT_REQUIRED"])("combined counter/reviewer cannot read %s protected facts", async (status) => {
    const current = count(status);
    const tx = transaction([{ ...current, currentAttempt: current }]);
    mockTransaction(tx);
    const read = vi.fn();
    await expect(withInventoryQuantityRead(session, read)).rejects.toThrow(INVENTORY_QUANTITY_READ_PROTECTED);
    expect(read).not.toHaveBeenCalled();
    expect(tx.stockCountSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant", companyId: "company", inventoryLocationId: { in: ["inventory-location"] } }) }));
  });

  test("assigned reviewer cannot bypass segregation even when creator and recorded line actor differ", () => {
    expect(canExposeStockCountProtectedFacts(session, { ...count("SUBMITTED", "other"), assignedToUserId: session.user.id })).toBe(false);
  });

  test("independent reviewer can read a fully submitted count; missing current lineage fails closed", async () => {
    const current = count("SUBMITTED", "other");
    const tx = transaction([{ ...current, currentAttempt: current }]);
    await expect(assertInventoryQuantityReadAllowed(tx as unknown as TransactionClient, session, ["inventory-location"])).resolves.toBeUndefined();
    tx.stockCountSession.findMany.mockResolvedValue([{ ...current, currentAttempt: null }]);
    await expect(assertInventoryQuantityReadAllowed(tx as unknown as TransactionClient, session, ["inventory-location"])).rejects.toThrow(INVENTORY_QUANTITY_READ_PROTECTED);
  });

  test("the location fence remains held until asynchronous read projection finishes and releases on failure", async () => {
    const order: string[] = [];
    const tx = transaction();
    tx.$queryRaw.mockImplementation(async () => { order.push("lock"); return [{ id: "inventory-location" }]; });
    vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: unknown) => {
      try { return await (callback as (tx: TransactionClient) => Promise<unknown>)(tx as unknown as TransactionClient); }
      finally { order.push("release"); }
    });
    await expect(withInventoryQuantityRead(session, async (client) => {
      expect(client).toBe(tx); order.push("read"); await Promise.resolve(); order.push("project"); throw new Error("READ_FAILED");
    })).rejects.toThrow("READ_FAILED");
    expect(order).toEqual(["lock", "read", "project", "release"]);
    const query = tx.$queryRaw.mock.calls[0]![0] as { sql: string; values: unknown[] };
    expect(query.sql).toContain("ORDER BY il.id ASC FOR SHARE OF il");
    expect(query.values).toEqual(expect.arrayContaining(["tenant", "company", "location"]));
  });

  test("actual synthetic requester grants include the original adjustment creation leak", () => {
    const fixture = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../../scripts/fixtures/inventory-pilot.synthetic.local-only.json"), "utf8"));
    const text = JSON.stringify(fixture);
    expect(text).toContain(permissions.stockAdjustmentCreate);
    expect(text).toContain(permissions.stockCountCreate);
  });

  test.each([
    ["detail", () => getStockAdjustment(session, "adjustment")],
    ["page", () => listStockAdjustmentPage(session)],
    ["export", () => listStockAdjustments(session, undefined, { maxRows: 100 })],
  ] as const)("adjustment %s stops before reading stored system quantities", async (_name, read) => {
    const current = count("IN_PROGRESS"); const tx = transaction([{ ...current, currentAttempt: current }]); mockTransaction(tx);
    await expect(read()).rejects.toThrow(INVENTORY_QUANTITY_READ_PROTECTED);
    expect(tx.stockAdjustment.findFirst).not.toHaveBeenCalled();
    expect(tx.stockAdjustment.findMany).not.toHaveBeenCalled();
  });

  test("historical count adjustment provenance remains protected after the active count ends", async () => {
    const tx = transaction();
    const source = { adjustmentType: "COUNT_VARIANCE", sourceDocumentType: "StockCountSession", sourceDocumentId: "count", sourceStockCountSessionId: "count", sourceStockCountAttemptId: "attempt", inventoryLocationId: "inventory-location" };
    tx.stockCountAttempt.findFirst.mockResolvedValue(count("REVIEWED"));
    const nonReviewer = { ...session, permissionCodes: [permissions.stockAdjustmentCreate] };
    expect(await canReadCountDerivedAdjustment(tx as unknown as TransactionClient, nonReviewer, source)).toBe(false);
    tx.stockAdjustment.findMany.mockResolvedValue([source]); mockTransaction(tx);
    await expect(listStockAdjustments(nonReviewer, undefined, { maxRows: 100 })).rejects.toThrow(INVENTORY_QUANTITY_READ_PROTECTED);
  });

  test("linked balance/adjustment and audit summaries do not disclose protected values or labels", async () => {
    const current = count("IN_PROGRESS"); const tx = transaction([{ ...current, currentAttempt: current }]); mockTransaction(tx);
    const summary = await resolveProjectRecordLinkSourceSummary(session, "INVENTORY_BALANCE", "balance");
    expect(summary.visible).toBe(false);
    expect(tx.inventoryBalance.findFirst).not.toHaveBeenCalled();
    const event = { companyId: "company", entityType: "StockAdjustment", entityId: "adjustment", eventType: "count.negative_variance", metadata: { systemQty: 42, notes: "42 expected" }, beforeData: { amount: 123 }, afterData: null };
    const copy = JSON.stringify(event);
    const result = await redactProtectedInventoryAuditEvent(session, event);
    expect(result.entityId).toBe(""); expect(result.eventType).toBe("inventory.protected_activity");
    expect(JSON.stringify(result)).not.toContain("42"); expect(JSON.stringify(result)).not.toContain("negative_variance");
    expect(JSON.stringify(event)).toBe(copy);
    expect((await redactProtectedInventoryAuditEvent(session, { ...event, companyId: "other-company" })).entityId).toBe("");
  });

  test("exports return a deliberate no-store 403 with an explanation", async () => {
    const response = exportErrorResponse(new Error(INVENTORY_QUANTITY_READ_PROTECTED))!;
    expect(response.status).toBe(403); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: INVENTORY_QUANTITY_READ_PROTECTED, message: expect.stringContaining("blind-count confidentiality") });
  });
});
