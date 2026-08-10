import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertProductionAuthConfiguration: vi.fn(),
  assertProductionEvidenceStorageConfiguration: vi.fn(),
  assertLocalUatDatabaseAdmission: vi.fn(),
}));

vi.mock("./server/services/authentication", () => ({
  assertProductionAuthConfiguration: mocks.assertProductionAuthConfiguration,
}));
vi.mock("./server/services/evidenceStorageConfig", () => ({
  assertProductionEvidenceStorageConfiguration:
    mocks.assertProductionEvidenceStorageConfiguration,
}));
vi.mock("./server/services/localUatDatabaseAdmission", () => ({
  assertLocalUatDatabaseAdmission: mocks.assertLocalUatDatabaseAdmission,
}));

import { register } from "./instrumentation";

const originalNextRuntime = process.env.NEXT_RUNTIME;
const originalAdmissionFlag = process.env.OGFI_LOCAL_UAT_BASELINE_REQUIRED;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("runtime instrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.OGFI_LOCAL_UAT_BASELINE_REQUIRED;
  });

  afterEach(() => {
    restoreEnvironment("NEXT_RUNTIME", originalNextRuntime);
    restoreEnvironment(
      "OGFI_LOCAL_UAT_BASELINE_REQUIRED",
      originalAdmissionFlag,
    );
  });

  test("does not load the Local-UAT admission query outside explicit Local-UAT", async () => {
    await register();
    process.env.OGFI_LOCAL_UAT_BASELINE_REQUIRED = "false";
    await register();

    expect(mocks.assertProductionAuthConfiguration).toHaveBeenCalledTimes(2);
    expect(
      mocks.assertProductionEvidenceStorageConfiguration,
    ).toHaveBeenCalledTimes(2);
    expect(mocks.assertLocalUatDatabaseAdmission).not.toHaveBeenCalled();
  });

  test("awaits Local-UAT database admission when explicitly enabled", async () => {
    process.env.OGFI_LOCAL_UAT_BASELINE_REQUIRED = "true";
    await register();

    expect(mocks.assertLocalUatDatabaseAdmission).toHaveBeenCalledTimes(1);
  });

  test("does not run startup guards outside the Node runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    process.env.OGFI_LOCAL_UAT_BASELINE_REQUIRED = "true";
    await register();

    expect(mocks.assertProductionAuthConfiguration).not.toHaveBeenCalled();
    expect(
      mocks.assertProductionEvidenceStorageConfiguration,
    ).not.toHaveBeenCalled();
    expect(mocks.assertLocalUatDatabaseAdmission).not.toHaveBeenCalled();
  });
});
