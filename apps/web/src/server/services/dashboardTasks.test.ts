import { describe, expect, test } from "vitest";
import {
  compareDashboardTaskOrder,
  dashboardTaskAfterWhere
} from "./dashboardTasks";

describe("dashboard task ordering", () => {
  const cursor = {
    createdAt: "2026-07-20T00:00:00.000Z",
    sourceType: "WASTAGE" as const,
    recordId: "wastage-2"
  };

  test("keeps same-timestamp rows after the global cursor without skipping another source", () => {
    expect(dashboardTaskAfterWhere("TRANSFER", cursor)).toEqual({
      OR: [{ createdAt: { gt: new Date(cursor.createdAt) } }]
    });
    expect(dashboardTaskAfterWhere("WASTAGE", cursor)).toEqual({
      OR: [
        { createdAt: { gt: new Date(cursor.createdAt) } },
        { createdAt: new Date(cursor.createdAt), id: { gt: "wastage-2" } }
      ]
    });
    expect(dashboardTaskAfterWhere("STOCK_ADJUSTMENT", cursor)).toEqual({
      OR: [
        { createdAt: { gt: new Date(cursor.createdAt) } },
        { createdAt: new Date(cursor.createdAt) }
      ]
    });
    expect(dashboardTaskAfterWhere("FOOD_SAFETY", cursor)).toEqual({
      OR: [
        { createdAt: { gt: new Date(cursor.createdAt) } },
        { createdAt: new Date(cursor.createdAt) }
      ]
    });
  });

  test("orders ties by source rank and source record ID", () => {
    expect(
      compareDashboardTaskOrder(
        { ...cursor, sourceType: "TRANSFER", recordId: "transfer-1" },
        cursor
      )
    ).toBeLessThan(0);
    expect(
      compareDashboardTaskOrder(
        { ...cursor, recordId: "wastage-3" },
        cursor
      )
    ).toBeGreaterThan(0);
  });
});
