import { describe, expect, it, vi } from "vitest";
import {
  getItemOptionCatalogAdmissionConfig,
  getItemOptionCatalogAdmissionStaticReadiness,
  ItemOptionCatalogAdmissionGate,
  ItemOptionCatalogRateLimitedError,
  resetItemOptionCatalogAdmissionForTest,
  runWithItemOptionCatalogAdmission,
} from "./itemOptionCatalogAdmission";

describe("item option catalog admission", () => {
  it("requires bounded explicit production configuration", () => {
    expect(() => getItemOptionCatalogAdmissionConfig({ APP_ENV: "production", NODE_ENV: "test" })).toThrow(
      "ITEM_OPTION_CATALOG_MAX_IN_FLIGHT_INVALID",
    );
    expect(getItemOptionCatalogAdmissionConfig({
      APP_ENV: "production",
      NODE_ENV: "test",
      ITEM_OPTION_CATALOG_MAX_IN_FLIGHT: "8",
      ITEM_OPTION_CATALOG_BUSY_RETRY_SECONDS: "3",
    })).toEqual({ maxInFlight: 8, retryAfterSeconds: 3 });
    expect(() => getItemOptionCatalogAdmissionConfig({
      APP_ENV: "production",
      NODE_ENV: "test",
      ITEM_OPTION_CATALOG_MAX_IN_FLIGHT: "65",
      ITEM_OPTION_CATALOG_BUSY_RETRY_SECONDS: "3",
    })).toThrow("ITEM_OPTION_CATALOG_MAX_IN_FLIGHT_INVALID");
    expect(getItemOptionCatalogAdmissionStaticReadiness({ APP_ENV: "production", NODE_ENV: "test" })).toEqual({
      status: "degraded",
      issues: ["ITEM_OPTION_CATALOG_MAX_IN_FLIGHT_INVALID"],
    });
  });

  it("rejects immediately at capacity and releases exactly once", () => {
    const gate = new ItemOptionCatalogAdmissionGate(1, 2);
    const release = gate.tryAcquire();
    expect(release).toBeTypeOf("function");
    expect(gate.tryAcquire()).toBeNull();
    release!("item", "SUCCESS");
    expect(() => release!("item", "SUCCESS")).toThrow(
      "ITEM_OPTION_CATALOG_ADMISSION_RELEASE_DUPLICATE",
    );
    const next = gate.tryAcquire();
    expect(next).toBeTypeOf("function");
    next!("uom", "DENIED");

    expect(gate.drainMetrics()).toMatchObject({
      capacity: 1,
      active: 0,
      maximumActive: 1,
      admitted: 2,
      rejected: 1,
      completed: 2,
      outcomes: { SUCCESS: 1, DENIED: 1 },
      kinds: { item: 1, uom: 1 },
    });
  });

  it("drains fixed-cardinality aggregates without request identifiers", () => {
    const gate = new ItemOptionCatalogAdmissionGate(2, 2);
    const release = gate.tryAcquire()!;
    release("category", "INVALID");
    gate.drainMetrics();
    expect(gate.drainMetrics()).toEqual({
      capacity: 2,
      active: 0,
      maximumActive: 0,
      admitted: 0,
      rejected: 0,
      completed: 0,
      totalDurationMs: 0,
      maximumDurationMs: 0,
      outcomes: { SUCCESS: 0, INVALID: 0, UNAUTHENTICATED: 0, DENIED: 0, UNAVAILABLE: 0 },
      kinds: { item: 0, uom: 0, category: 0, unknown: 0 },
    });
  });

  it("runs admitted catalog work and rejects saturated work without queueing", async () => {
    resetItemOptionCatalogAdmissionForTest();
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      ITEM_OPTION_CATALOG_MAX_IN_FLIGHT: "1",
      ITEM_OPTION_CATALOG_BUSY_RETRY_SECONDS: "4",
    };
    let finish!: () => void;
    const held = runWithItemOptionCatalogAdmission("item", () => new Promise<void>((resolve) => {
      finish = resolve;
    }), environment);
    const rejectedWork = vi.fn(async () => undefined);
    await expect(runWithItemOptionCatalogAdmission("uom", rejectedWork, environment))
      .rejects.toEqual(expect.objectContaining({
        name: "ItemOptionCatalogRateLimitedError",
        retryAfterSeconds: 4,
      } satisfies Partial<ItemOptionCatalogRateLimitedError>));
    expect(rejectedWork).not.toHaveBeenCalled();
    finish();
    await held;
    await expect(runWithItemOptionCatalogAdmission("category", async () => "ok", environment))
      .resolves.toBe("ok");
    resetItemOptionCatalogAdmissionForTest();
  });
});
