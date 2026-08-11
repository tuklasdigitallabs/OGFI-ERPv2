import { describe, expect, it } from "vitest";
import { getWorkerHealth } from "./health";

describe("worker health", () => {
  it("reports worker service status", () => {
    expect(getWorkerHealth().service).toBe("worker");
  });

  it("reports the opening-inventory executor without exposing its credential", () => {
    const health = getWorkerHealth({
      OPENING_INVENTORY_EXECUTOR_ENABLED: "true",
      OPENING_STOCK_EXECUTOR_DATABASE_URL:
        "postgresql://executor:secret@postgres/ogfi",
    });
    expect(health.checks.openingInventoryExecutorEnabled).toBe(true);
    expect(health.checks.openingStockExecutorCredentialConfigured).toBe(true);
    expect(JSON.stringify(health)).not.toContain("secret");
  });
});
