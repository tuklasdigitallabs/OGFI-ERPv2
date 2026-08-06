import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approvalWorklistMode,
  boundedInventoryUatApprovalWorklistEnabled,
} from "./boundedApprovalWorklist";

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubAdmittedEvidenceLane() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_ENV", "uat");
  vi.stubEnv("CI", "true");
  vi.stubEnv("AUTH_MODE", "local");
  vi.stubEnv("AUTH_HARDENED_UAT_RUNTIME_ENABLED", "true");
  vi.stubEnv("BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED", "true");
  vi.stubEnv("APPROVAL_ROUTING_V1_ENABLED", "false");
}

describe("bounded Inventory Control UAT approval worklist gate", () => {
  it("opens only for the exact hardened evidence runtime", () => {
    stubAdmittedEvidenceLane();
    expect(boundedInventoryUatApprovalWorklistEnabled()).toBe(true);
    expect(approvalWorklistMode()).toBe("BOUNDED_UAT");
  });

  it.each([
    ["NODE_ENV", "development"],
    ["APP_ENV", "controlled-uat"],
    ["CI", "false"],
    ["AUTH_MODE", "demo"],
    ["AUTH_HARDENED_UAT_RUNTIME_ENABLED", "false"],
    ["BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED", "false"],
  ])("fails closed when %s is %s", (name, value) => {
    stubAdmittedEvidenceLane();
    vi.stubEnv(name, value);
    expect(boundedInventoryUatApprovalWorklistEnabled()).toBe(false);
  });

  it("never overlays the global normalized worklist", () => {
    stubAdmittedEvidenceLane();
    vi.stubEnv("APPROVAL_ROUTING_V1_ENABLED", "true");
    expect(boundedInventoryUatApprovalWorklistEnabled()).toBe(false);
    expect(approvalWorklistMode()).toBe("DISABLED");
  });

  it.each(["", "false"])(
    "never exposes global routing when the hardened evidence identity has bounded=%s",
    (boundedFlag) => {
      stubAdmittedEvidenceLane();
      vi.stubEnv(
        "BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED",
        boundedFlag,
      );
      vi.stubEnv("APPROVAL_ROUTING_V1_ENABLED", "true");
      expect(approvalWorklistMode()).toBe("DISABLED");
    },
  );

  it.each(["production", "staging", "test", "development", ""])(
    "does not admit APP_ENV=%s",
    (appEnv) => {
      stubAdmittedEvidenceLane();
      vi.stubEnv("APP_ENV", appEnv);
      expect(boundedInventoryUatApprovalWorklistEnabled()).toBe(false);
    },
  );
});
