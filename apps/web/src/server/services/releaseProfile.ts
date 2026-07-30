export type ReleaseProfile = "standard" | "inventory_control_pilot";

export function getReleaseProfile(): ReleaseProfile {
  const configuredProfile = process.env.OGFI_RELEASE_PROFILE?.trim();

  if (!configuredProfile) {
    return "standard";
  }

  if (
    configuredProfile === "standard" ||
    configuredProfile === "inventory_control_pilot"
  ) {
    return configuredProfile;
  }

  throw new Error("OGFI_RELEASE_PROFILE_INVALID");
}

export function isInventoryControlPilot(): boolean {
  return getReleaseProfile() === "inventory_control_pilot";
}
