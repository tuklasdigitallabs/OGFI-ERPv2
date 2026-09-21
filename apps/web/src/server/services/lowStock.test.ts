import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "./context";

const mocks = vi.hoisted(() => ({ query: vi.fn(), fence: vi.fn(), permission: vi.fn(), scope: vi.fn(), transaction: vi.fn() }));
vi.mock("@ogfi/database", async () => ({ ...await vi.importActual<typeof import("@ogfi/database")>("@ogfi/database"), prisma: { $transaction: mocks.transaction } }));
vi.mock("./authorization", async () => ({ ...await vi.importActual<typeof import("./authorization")>("./authorization"), requirePermission: mocks.permission, requireActiveScopeAssignment: mocks.scope }));
vi.mock("./inventoryQuantityRead", () => ({ withInventoryQuantityRead: mocks.fence }));
import { exportLowStockRows, getLowStockDashboardRead, listLowStockPage, lowStockThresholdInput, saveLowStockThreshold } from "./lowStock";

const session = { user: { id: "00000000-0000-4000-8000-000000000001" }, context: { tenantId: "00000000-0000-4000-8000-000000000002", companyId: "00000000-0000-4000-8000-000000000003", locationId: "00000000-0000-4000-8000-000000000004" } } as SessionContext;
const input = { inventoryLocationId: "00000000-0000-4000-8000-000000000005", itemCode: "KARUBI", thresholdQuantity: "10.123456", active: true, expectedVersion: 0, reason: "Initial threshold" };

describe("low stock service boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.permission.mockResolvedValue(undefined); mocks.scope.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue([{ totalItems: 0n, items: [] }]);
    mocks.fence.mockImplementation(async (_session, read) => read({ $queryRaw: mocks.query }));
  });
  it.each(["-1", "NaN", "Infinity", "1.0000001", "1000000000000", "1e3", ""])("rejects invalid threshold %s before writes", async thresholdQuantity => {
    await expect(saveLowStockThreshold(session, { ...input, thresholdQuantity })).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("accepts explicit zero and six-place decimals without floating-point conversion", () => {
    expect(lowStockThresholdInput.parse({ ...input, thresholdQuantity: "0" }).thresholdQuantity).toBe("0");
    expect(lowStockThresholdInput.parse(input).thresholdQuantity).toBe("10.123456");
  });
  it("requires permission and selected scope before opening the quantity fence", async () => {
    mocks.scope.mockRejectedValueOnce(new Error("SCOPE_DENIED"));
    await expect(listLowStockPage(session)).rejects.toThrow("SCOPE_DENIED");
    expect(mocks.scope).toHaveBeenCalledWith(session, { scopeType: "LOCATION", scopeId: session.context.locationId, allowCompanyManage: true });
    expect(mocks.fence).not.toHaveBeenCalled();
  });
  it("uses the same fenced aggregate for dashboard, page and export, with scoped parameters", async () => {
    await getLowStockDashboardRead(session); await listLowStockPage(session); await exportLowStockRows(session, { maxRows: 100 });
    expect(mocks.fence).toHaveBeenCalledTimes(3);
    for (const [query] of mocks.query.mock.calls) {
      expect(query.values).toEqual(expect.arrayContaining([session.context.tenantId, session.context.companyId, session.context.locationId]));
      expect(query.sql).toContain('COALESCE(SUM(b."qtyOnHand"), 0)');
      expect(query.sql).toContain('"recordedOnHand" <= "thresholdQuantity"');
      expect(query.sql).toContain('LEFT JOIN "InventoryBalance"');
      expect(query.sql).toContain('active AND eligible');
    }
  });
  it("does not query or return alert counts when the blind-count fence denies", async () => {
    mocks.fence.mockRejectedValue(new Error("INVENTORY_QUANTITY_READ_PROTECTED"));
    for (const read of [() => getLowStockDashboardRead(session), () => listLowStockPage(session), () => exportLowStockRows(session, { maxRows: 100 })]) await expect(read()).rejects.toThrow("INVENTORY_QUANTITY_READ_PROTECTED");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("fails oversized exports without returning a partial population", async () => {
    mocks.query.mockResolvedValue([{ totalItems: 101n, items: [] }]);
    await expect(exportLowStockRows(session, { maxRows: 100 })).rejects.toThrow("REPORT_EXPORT_ROW_LIMIT_EXCEEDED");
  });
});
