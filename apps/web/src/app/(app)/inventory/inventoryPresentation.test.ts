import { describe, expect, test } from "vitest";
import {
  defaultInventoryTimeZone,
  formatInventoryUpdatedDate,
  resolveInventoryTimeZone
} from "./inventoryPresentation";

describe("Stock Balances date presentation", () => {
  test("uses a valid configured company timezone and defaults invalid values", () => {
    expect(resolveInventoryTimeZone("Pacific/Auckland")).toBe("Pacific/Auckland");
    expect(resolveInventoryTimeZone(undefined)).toBe(defaultInventoryTimeZone);
    expect(resolveInventoryTimeZone("Not/A_Timezone")).toBe(defaultInventoryTimeZone);
  });

  test("renders UTC-boundary dates in the selected company timezone", () => {
    const value = "2026-07-25T16:30:00.000Z";
    expect(formatInventoryUpdatedDate(value, "UTC")).toContain("Jul 25, 2026");
    expect(formatInventoryUpdatedDate(value, "Asia/Manila")).toContain("Jul 26, 2026");
    expect(formatInventoryUpdatedDate(value, "Pacific/Auckland")).toContain("Jul 26, 2026");
  });
});
