import { afterEach, describe, expect, it } from "vitest";
import { getReleaseProfile, isInventoryControlPilot } from "./releaseProfile";

const originalReleaseProfile = process.env.OGFI_RELEASE_PROFILE;

afterEach(() => {
  if (originalReleaseProfile === undefined) {
    delete process.env.OGFI_RELEASE_PROFILE;
  } else {
    process.env.OGFI_RELEASE_PROFILE = originalReleaseProfile;
  }
});

describe("release profile", () => {
  it("preserves the standard application when no profile is configured", () => {
    delete process.env.OGFI_RELEASE_PROFILE;

    expect(getReleaseProfile()).toBe("standard");
    expect(isInventoryControlPilot()).toBe(false);
  });

  it("recognizes the bounded inventory control pilot", () => {
    process.env.OGFI_RELEASE_PROFILE = "inventory_control_pilot";

    expect(getReleaseProfile()).toBe("inventory_control_pilot");
    expect(isInventoryControlPilot()).toBe(true);
  });

  it("fails closed for an unknown release profile", () => {
    process.env.OGFI_RELEASE_PROFILE = "inventory-only";

    expect(() => getReleaseProfile()).toThrow("OGFI_RELEASE_PROFILE_INVALID");
  });
});
