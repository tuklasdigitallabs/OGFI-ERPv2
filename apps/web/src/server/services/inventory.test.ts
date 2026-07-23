import { readFileSync } from "node:fs";
import path from "node:path";
import type { TransactionClient } from "@ogfi/database";
import { describe, expect, test, vi } from "vitest";
import {
  assertInventoryMovementsNotFrozen,
  assertInventoryMovementQuantities,
  buildInventoryLedgerVarianceQuery,
  buildInventoryLedgerVarianceTraceQuery,
  calculateInventoryBalanceVariance,
  calculateBalanceQuantity,
  getInventoryBalanceReconciliationStatus,
  inventoryDashboardProfileHref,
  inventoryLedgerTraceHref,
  inventoryMovementListWhere,
  lockInventoryLocationForPosting,
  lockInventoryLocationsForPosting,
  normalizeInventoryBalanceFilters,
  normalizeInventoryMovementFilters,
  normalizeInventoryLotKey,
  postInventoryMovementInTransaction,
  resolveInventoryDashboardProfile
} from "./inventory";
import type { SessionContext } from "./context";
import { inventoryItemLotExpiryRequirements } from "./policySettings";

describe("inventory ledger foundation rules", () => {
  test("inventory empty states match implemented posting sources", () => {
    const balancePage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/inventory/page.tsx"),
      "utf8"
    );
    const ledgerPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/inventory/ledger/page.tsx"),
      "utf8"
    );

    expect(balancePage).toContain("wastage posting");
    expect(balancePage).toContain("stock adjustment posting");
    expect(balancePage).toContain("getInventoryBalanceReconciliation");
    expect(balancePage).toContain("Ledger check");
    expect(ledgerPage).toContain("transfer dispatch and receipt");
    expect(balancePage).not.toContain(
      "Posted receiving or future controlled inventory movements"
    );
    expect(ledgerPage).not.toContain(
      "Posted receiving or future controlled inventory workflows"
    );
  });

  test("inventory pages show controlled search-length errors before querying", () => {
    const balancePage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/inventory/page.tsx"),
      "utf8"
    );
    const ledgerPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/inventory/ledger/page.tsx"),
      "utf8"
    );

    for (const source of [balancePage, ledgerPage]) {
      expect(source).toContain("maxInventorySearchLength");
      expect(source).toContain("Search is limited to");
      expect(source).toContain("? []");
    }
    expect(balancePage).toContain(
      "searchError\n    ? []\n    : await listInventoryBalances"
    );
    expect(ledgerPage).toContain("searchError || traceError");
    expect(ledgerPage).toContain(": await listInventoryMovements(session, filters)");
  });

  test("normalizes lot and expiry into a deterministic balance key", () => {
    expect(normalizeInventoryLotKey(null, null)).toBe("NOLOT|NOEXP");
    expect(
      normalizeInventoryLotKey(" LOT-001 ", new Date("2026-06-29T10:30:00.000Z"))
    ).toBe("LOT-001|2026-06-29");
  });

  test("lot and expiry requirements include configurable DEC-0036 category policy", () => {
    expect(
      inventoryItemLotExpiryRequirements(
        {
          trackLot: false,
          trackExpiry: false,
          category: { categoryCode: "BEEF_CUTS" }
        },
        { requiredCategoryCodes: ["BEEF_CUTS"] }
      )
    ).toEqual({
      requiresLot: true,
      requiresExpiry: true,
      requiredByCategoryPolicy: true
    });
    expect(
      inventoryItemLotExpiryRequirements(
        {
          trackLot: true,
          trackExpiry: false,
          category: { categoryCode: "DRY_GOODS" }
        },
        { requiredCategoryCodes: ["BEEF_CUTS"] }
      )
    ).toEqual({
      requiresLot: true,
      requiresExpiry: false,
      requiredByCategoryPolicy: false
    });

    const inventorySource = readFileSync(path.resolve(__dirname, "inventory.ts"), "utf8");
    const adjustmentSource = readFileSync(
      path.resolve(__dirname, "stockAdjustments.ts"),
      "utf8"
    );
    const wastageSource = readFileSync(path.resolve(__dirname, "wastage.ts"), "utf8");
    const policySource = readFileSync(
      path.resolve(__dirname, "policySettings.ts"),
      "utf8"
    );

    for (const source of [inventorySource, adjustmentSource, wastageSource]) {
      expect(source).toContain("getInventoryLotExpiryPolicy");
      expect(source).toContain("inventoryItemLotExpiryRequirements");
    }
    expect(policySource).toContain("inventory.lot_expiry.required_categories");
  });

  test("calculates balance reconciliation variance from cache minus ledger", () => {
    expect(calculateInventoryBalanceVariance(10, 10)).toBe(0);
    expect(calculateInventoryBalanceVariance(10, 9.5)).toBe(0.5);
    expect(calculateInventoryBalanceVariance(9.5, 10)).toBe(-0.5);
    expect(calculateInventoryBalanceVariance(1.1234567, 1.1234561)).toBe(0.000001);
  });

  test("flags only exact reconciled quantities as matched", () => {
    expect(getInventoryBalanceReconciliationStatus(4, 4)).toBe("MATCHED");
    expect(getInventoryBalanceReconciliationStatus(4, 3)).toBe("VARIANCE");
  });

  test("requires positive entered quantity and non-zero base delta", () => {
    expect(() => assertInventoryMovementQuantities(1, 1)).not.toThrow();
    expect(() => assertInventoryMovementQuantities(1, -1)).not.toThrow();
    expect(() => assertInventoryMovementQuantities(0, 1)).toThrow(
      "INVENTORY_MOVEMENT_ENTERED_QUANTITY_INVALID"
    );
    expect(() => assertInventoryMovementQuantities(1, 0)).toThrow(
      "INVENTORY_MOVEMENT_BASE_QUANTITY_INVALID"
    );
  });

  test("blocks inventory posting while a frozen stock count is active", () => {
    expect(() =>
      assertInventoryMovementsNotFrozen({ activeFrozenCountId: null })
    ).not.toThrow();
    expect(() =>
      assertInventoryMovementsNotFrozen({ activeFrozenCountId: "count-1" })
    ).toThrow("INVENTORY_MOVEMENT_FROZEN_BY_STOCK_COUNT");

    const source = readFileSync(path.resolve(__dirname, "inventory.ts"), "utf8");
    expect(source).toContain("tx.stockCountSession.findFirst");
    expect(source).toContain("freezeMovements: true");
    expect(source).toContain('status: { in: ["IN_PROGRESS", "RECOUNT_REQUESTED", "SUBMITTED"] }');
    expect(source.indexOf("assertInventoryMovementsNotFrozen")).toBeLessThan(
      source.indexOf("tx.inventoryMovement.create")
    );
  });

  test("prevents balance calculations from going negative", () => {
    expect(calculateBalanceQuantity(10, -3)).toBe(7);
    expect(calculateBalanceQuantity(10, 5)).toBe(15);
    expect(() => calculateBalanceQuantity(2, -3)).toThrow(
      "INVENTORY_BALANCE_NEGATIVE_NOT_ALLOWED"
    );
  });

  test("normalizes inventory movement ledger filters", () => {
    expect(
      normalizeInventoryMovementFilters({
        query: "  chicken  ",
        movementType: "OPENING_BALANCE_IN"
      })
    ).toEqual({
      query: "chicken",
      movementType: "OPENING_BALANCE_IN"
    });
    expect(
      normalizeInventoryMovementFilters({
        query: " ",
        movementType: "UNKNOWN"
      })
    ).toEqual({
      query: undefined,
      movementType: undefined
    });
  });

  test("caps inventory search filters before database queries", () => {
    const oversizedQuery = "x".repeat(121);

    expect(() =>
      normalizeInventoryBalanceFilters({ query: oversizedQuery })
    ).toThrow("INVENTORY_SEARCH_QUERY_TOO_LONG");
    expect(() =>
      normalizeInventoryMovementFilters({ query: oversizedQuery })
    ).toThrow("INVENTORY_SEARCH_QUERY_TOO_LONG");
  });

  test("resolves only the dedicated ledger-variance profile and stable links", () => {
    expect(resolveInventoryDashboardProfile("ledger-variance-v1")).toBe(
      "ledger-variance-v1"
    );
    expect(resolveInventoryDashboardProfile("variance")).toBeNull();
    expect(
      inventoryDashboardProfileHref("ledger-variance-v1", {
        page: 2,
        query: "grill lot"
      })
    ).toBe(
      "/inventory/reconciliation?dashboard=ledger-variance-v1&q=grill+lot&page=2"
    );
    expect(
      inventoryLedgerTraceHref({
        inventoryLocationId: "00000000-0000-4000-8000-000000000010",
        itemId: "00000000-0000-4000-8000-000000000020",
        lotKey: "LOT-1|2026-07-31"
      })
    ).toBe(
      "/inventory/ledger?inventoryLocationId=00000000-0000-4000-8000-000000000010&itemId=00000000-0000-4000-8000-000000000020&lotKey=LOT-1%7C2026-07-31"
    );
  });

  test("builds one parameterized, variance-only PostgreSQL reconciliation statement", () => {
    const scopedSession = {
      user: { id: "00000000-0000-4000-8000-000000000001" },
      context: {
        tenantId: "00000000-0000-4000-8000-000000000010",
        companyId: "00000000-0000-4000-8000-000000000020",
        locationId: "00000000-0000-4000-8000-000000000030"
      }
    } as SessionContext;
    const built = buildInventoryLedgerVarianceQuery(scopedSession, {
      page: 3,
      pageSize: 25,
      query: "grill_%"
    });
    const sql = built.query.sql;

    expect(sql).toContain("WITH balance_rows AS MATERIALIZED");
    expect(sql).toContain("ledger_rows AS MATERIALIZED");
    expect(sql).toContain("all_keys AS MATERIALIZED");
    expect(sql).toContain("UNION");
    expect(sql).toContain('ROUND(');
    expect(sql).toContain('r.\"varianceQuantity\" <> 0');
    expect(sql).toContain('il.\"locationId\" = ');
    expect(sql).toContain("CAST('ACTIVE' AS \"RecordStatus\")");
    expect(sql).toContain("LEFT JOIN LATERAL");
    expect(sql).toContain("LIMIT");
    expect(sql).toContain("statement_timestamp()");
    expect(sql).not.toContain('ABS(fv.\"varianceQuantity\")');
    expect(sql).not.toContain("grill_%");
    expect(built.query.values).toEqual(
      expect.arrayContaining([
        scopedSession.context.tenantId,
        scopedSession.context.companyId,
        scopedSession.context.locationId,
        "%grill\\_\\%%",
        3,
        25
      ])
    );
  });

  test("requires complete typed trace filters and ANDs them with current scope", () => {
    const scopedSession = {
      user: { id: "00000000-0000-4000-8000-000000000001" },
      context: {
        tenantId: "00000000-0000-4000-8000-000000000010",
        companyId: "00000000-0000-4000-8000-000000000020",
        locationId: "00000000-0000-4000-8000-000000000030"
      }
    } as SessionContext;
    const inventoryLocationId = "00000000-0000-4000-8000-000000000040";
    const itemId = "00000000-0000-4000-8000-000000000050";
    const expiryDate = new Date("2026-07-31T00:00:00.000Z");

    expect(() =>
      normalizeInventoryMovementFilters({ inventoryLocationId })
    ).toThrow("INVENTORY_LEDGER_TRACE_FILTER_INCOMPLETE");
    expect(() =>
      normalizeInventoryMovementFilters({
        inventoryLocationId: "not-a-uuid",
        itemId,
        lotKey: "LOT-1|2026-07-31"
      })
    ).toThrow("INVENTORY_LEDGER_TRACE_FILTER_INVALID");

    expect(
      inventoryMovementListWhere(scopedSession, {
        inventoryLocationId,
        itemId,
        lotKey: "LOT-1|2026-07-31"
      })
    ).toEqual({
      AND: [
        {
          tenantId: scopedSession.context.tenantId,
          companyId: scopedSession.context.companyId,
          inventoryLocation: {
            locationId: scopedSession.context.locationId,
            status: "ACTIVE"
          }
        },
        {
          inventoryLocationId,
          itemId,
          lotNumber: "LOT-1",
          expiryDate: {
            gte: expiryDate,
            lt: new Date("2026-08-01T00:00:00.000Z")
          }
        }
      ]
    });
    const source = readFileSync(path.resolve(__dirname, "inventory.ts"), "utf8");
    expect(source).toContain("COALESCE(NULLIF(BTRIM(m.\"lotNumber\"), ''), 'NOLOT')");
    expect(source).toContain('il.\"locationId\" = ${session.context.locationId}::uuid');
  });

  test("builds a deterministic counted trace page without silent truncation", () => {
    const scopedSession = {
      user: { id: "00000000-0000-4000-8000-000000000001" },
      context: {
        tenantId: "00000000-0000-4000-8000-000000000010",
        companyId: "00000000-0000-4000-8000-000000000020",
        locationId: "00000000-0000-4000-8000-000000000030"
      }
    } as SessionContext;
    const query = buildInventoryLedgerVarianceTraceQuery(scopedSession, {
      inventoryLocationId: "00000000-0000-4000-8000-000000000040",
      itemId: "00000000-0000-4000-8000-000000000050",
      lotKey: "LOT-1|2026-07-31",
      page: 4
    });

    expect(query.sql).toContain("COUNT(*) OVER()");
    expect(query.sql).toContain('ORDER BY tr.\"occurredAt\" DESC, tr.id DESC');
    expect(query.sql).toContain("LIMIT");
    expect(query.sql).not.toContain("LIMIT 100");
    expect(query.values).toEqual(
      expect.arrayContaining([
        scopedSession.context.tenantId,
        scopedSession.context.companyId,
        scopedSession.context.locationId,
        "00000000-0000-4000-8000-000000000040",
        "00000000-0000-4000-8000-000000000050",
        "LOT-1|2026-07-31",
        4,
        50
      ])
    );
  });

  test("keeps exact trace dual-authorized and rechecks current variance membership", () => {
    const source = readFileSync(path.resolve(__dirname, "inventory.ts"), "utf8");
    expect(source).toContain("getInventoryLedgerVarianceTracePage");
    expect(source).toContain("await requireInventoryLedgerVarianceRead(session)");
    expect(source).toContain("permissions.inventoryBalanceView");
    expect(source).toContain("permissions.inventoryLedgerView");
    expect(source).toContain("exactKey");
    expect(source).toContain("includeMatchedExact: true");
    expect(source).toContain("current !== null && current.varianceQuantity !== 0");
    expect(source).toContain("currentBalanceQuantity");
    expect(source).toContain("currentLedgerQuantity");
    expect(source).toContain("currentVarianceQuantity");
    expect(source).toContain("INVENTORY_LEDGER_TRACE_REQUIRES_DEDICATED_SERVICE");
  });

  test("narrows the shared reconciliation statement to the exact current key, including resolved membership", () => {
    const scopedSession = {
      user: { id: "00000000-0000-4000-8000-000000000001" },
      context: {
        tenantId: "00000000-0000-4000-8000-000000000010",
        companyId: "00000000-0000-4000-8000-000000000020",
        locationId: "00000000-0000-4000-8000-000000000030"
      }
    } as SessionContext;
    const exactKey = {
      inventoryLocationId: "00000000-0000-4000-8000-000000000040",
      itemId: "00000000-0000-4000-8000-000000000050",
      lotKey: "NOLOT|NOEXP"
    };
    const built = buildInventoryLedgerVarianceQuery(scopedSession, {
      pageSize: 1,
      exactKey,
      includeMatchedExact: true
    });

    expect(built.query.sql).toContain('r.\"inventoryLocationId\" = ');
    expect(built.query.sql).toContain('r.\"itemId\" = ');
    expect(built.query.sql).toContain('r.\"lotKey\" = ');
    expect(built.query.values).toEqual(
      expect.arrayContaining([
        exactKey.inventoryLocationId,
        exactKey.itemId,
        exactKey.lotKey,
        true
      ])
    );
    expect(() =>
      buildInventoryLedgerVarianceQuery(scopedSession, {
        includeMatchedExact: true
      })
    ).toThrow("INVENTORY_LEDGER_EXACT_KEY_REQUIRED");
  });

  test("reconciliation service is read-only, dual-permission gated, and SQL-owned", () => {
    const source = readFileSync(path.resolve(__dirname, "inventory.ts"), "utf8");

    expect(source).toContain("getInventoryBalanceReconciliation");
    expect(source).toContain("permissions.inventoryBalanceView");
    expect(source).toContain("requirePermission(session, permissions.inventoryLedgerView)");
    expect(source).toContain("buildInventoryLedgerVarianceQuery");
    expect(source).toContain("prisma.$queryRaw<InventoryLedgerVarianceRawRow[]>");
    expect(source).not.toContain("const rowsByKey = new Map");
    expect(source).not.toContain("lastReconciledAt");
  });
});

describe("inventory-location posting serialization", () => {
  const locationA = "00000000-0000-4000-8000-000000000001";
  const locationB = "00000000-0000-4000-8000-000000000002";
  const tenantId = "00000000-0000-4000-8000-000000000010";
  const companyId = "00000000-0000-4000-8000-000000000020";
  const session = {
    user: { id: "00000000-0000-4000-8000-000000000030" },
    context: {
      tenantId,
      companyId,
      locationId: "00000000-0000-4000-8000-000000000040"
    }
  } as SessionContext;

  function transactionWithLockedLocations(ids: string[]) {
    return {
      $queryRaw: vi.fn().mockResolvedValue(ids.map((id) => ({ id })))
    } as unknown as TransactionClient;
  }

  test("deduplicates and locks the complete scoped UUID set in one canonical query", async () => {
    const tx = transactionWithLockedLocations([locationA, locationB]);

    const lock = await lockInventoryLocationsForPosting(tx, session, [
      locationB,
      locationA,
      locationB
    ]);

    expect(lock).toBeDefined();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const query = vi.mocked(tx.$queryRaw).mock.calls[0]?.[0] as {
      sql: string;
      values: unknown[];
    };
    expect(query.sql).toContain('FROM "InventoryLocation" il');
    expect(query.sql).toContain("ORDER BY il.id ASC");
    expect(query.sql).toContain("FOR UPDATE OF il");
    expect(query.values).toEqual([locationA, locationB, tenantId, companyId]);
  });

  test("rejects empty and incomplete tenant-company lock sets", async () => {
    const emptyTx = transactionWithLockedLocations([]);
    await expect(
      lockInventoryLocationsForPosting(emptyTx, session, [])
    ).rejects.toThrow("INVENTORY_LOCATION_POSTING_LOCK_SET_EMPTY");
    expect(emptyTx.$queryRaw).not.toHaveBeenCalled();

    const incompleteTx = transactionWithLockedLocations([locationA]);
    await expect(
      lockInventoryLocationsForPosting(incompleteTx, session, [
        locationA,
        locationB
      ])
    ).rejects.toThrow("INVENTORY_LOCATION_POSTING_LOCK_SCOPE_DENIED");
  });

  test("singular wrapper locks one inventory location", async () => {
    const tx = transactionWithLockedLocations([locationA]);
    await expect(
      lockInventoryLocationForPosting(tx, session, locationA)
    ).resolves.toBeDefined();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  test("posting rejects a lock from another transaction or incomplete set", async () => {
    const lockingTx = transactionWithLockedLocations([locationA]);
    const lock = await lockInventoryLocationForPosting(
      lockingTx,
      session,
      locationA
    );
    const otherTx = transactionWithLockedLocations([]);
    const input = {
      inventoryLocationId: locationA,
      relatedInventoryLocationId: locationB,
      itemId: "00000000-0000-4000-8000-000000000050",
      movementType: "TRANSFER_OUT" as const,
      occurredAt: new Date("2026-07-23T00:00:00.000Z"),
      enteredQuantity: 1,
      enteredUomId: "00000000-0000-4000-8000-000000000060",
      quantityDeltaBaseUom: -1,
      sourceDocumentType: "InventoryTransfer",
      sourceDocumentId: "00000000-0000-4000-8000-000000000070",
      sourceEventKey: "dispatch:line-1"
    };

    await expect(
      postInventoryMovementInTransaction(otherTx, session, lock, input)
    ).rejects.toThrow("INVENTORY_LOCATION_POSTING_LOCK_REQUIRED");
    await expect(
      postInventoryMovementInTransaction(lockingTx, session, lock, input)
    ).rejects.toThrow("INVENTORY_LOCATION_POSTING_LOCK_REQUIRED");
  });

  test("nested movement services prelock once and pass the branded token", () => {
    const sources = [
      "receiving.ts",
      "transfers.ts",
      "wastage.ts",
      "stockAdjustments.ts"
    ].map((file) => readFileSync(path.resolve(__dirname, file), "utf8"));

    for (const source of sources) {
      expect(source).toContain("lockInventoryLocationsForPosting");
      expect(source).toMatch(
        /postInventoryMovementInTransaction\(\s*tx,\s*session,\s*inventoryLocationLock[!,]*/
      );
    }
    expect(sources[1]).toMatch(
      /flatMap\(\(line\) => \[\s*line\.sourceInventoryLocationId,\s*line\.destinationInventoryLocationId/
    );
  });
});
