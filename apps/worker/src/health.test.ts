import { describe, expect, it } from "vitest";
import { getWorkerHealth } from "./health";

describe("worker health", () => {
  it("reports worker service status", () => {
    expect(getWorkerHealth().service).toBe("worker");
  });
});
