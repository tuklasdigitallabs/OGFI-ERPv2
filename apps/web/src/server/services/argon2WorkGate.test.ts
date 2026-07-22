import { describe, expect, it } from "vitest";
import {
  assertProductionArgon2WorkGateConfiguration,
  createArgon2WorkGate,
  loadArgon2WorkGateCapacity,
} from "./argon2WorkGate";

const environment = (
  values: Record<string, string> = {},
): NodeJS.ProcessEnv => ({ NODE_ENV: "test", ...values });

describe("Argon2 work gate", () => {
  it("validates a bounded configuration and requires an explicit hosted value", () => {
    expect(loadArgon2WorkGateCapacity(environment())).toBe(2);
    expect(
      assertProductionArgon2WorkGateConfiguration(environment({
        DEPLOYMENT_ENVIRONMENT: "production",
        AUTH_ARGON2_MAX_CONCURRENCY: "1",
      })),
    ).toBe(1);
    expect(() =>
      assertProductionArgon2WorkGateConfiguration(environment({
        DEPLOYMENT_ENVIRONMENT: "staging",
      })),
    ).toThrow("AUTH_ARGON2_MAX_CONCURRENCY_REQUIRED");
    for (const value of ["0", "5", "1.5", "invalid"]) {
      expect(() =>
        loadArgon2WorkGateCapacity(environment({
          AUTH_ARGON2_MAX_CONCURRENCY: value,
        })),
      ).toThrow("AUTH_ARGON2_MAX_CONCURRENCY_INVALID");
    }
  });

  it("rejects without queueing and releases capacity in finally", async () => {
    const gate = createArgon2WorkGate(1);
    let release!: () => void;
    const held = gate.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await expect(gate.run(async () => undefined)).rejects.toThrow(
      "AUTH_ARGON2_CAPACITY_EXCEEDED",
    );
    release();
    await held;
    await expect(
      gate.run(async () => {
        throw new Error("EXPECTED_WORK_FAILURE");
      }),
    ).rejects.toThrow("EXPECTED_WORK_FAILURE");
    await expect(gate.run(async () => "ok")).resolves.toBe("ok");
    expect(gate.snapshot()).toMatchObject({
      capacity: 1,
      active: 0,
      maximumActive: 1,
      rejected: 1,
      completed: 3,
    });
  });

  it("returns and resets only bounded aggregate metrics", async () => {
    const gate = createArgon2WorkGate(2);
    await Promise.all([gate.run(async () => 1), gate.run(async () => 2)]);
    const interval = gate.drainMetrics();
    expect(interval).toMatchObject({
      capacity: 2,
      active: 0,
      maximumActive: 2,
      rejected: 0,
      completed: 2,
    });
    expect(Object.keys(interval).sort()).toEqual(
      [
        "active",
        "capacity",
        "completed",
        "maximumActive",
        "maximumDurationMs",
        "rejected",
        "totalDurationMs",
      ].sort(),
    );
    expect(gate.snapshot()).toMatchObject({
      active: 0,
      maximumActive: 0,
      rejected: 0,
      completed: 0,
      totalDurationMs: 0,
      maximumDurationMs: 0,
    });
  });
});
