export function isExplicitHardenedUatAuthenticationRuntime() {
  return (
    process.env.APP_ENV?.trim().toLowerCase() === "uat" &&
    process.env.NODE_ENV === "production" &&
    process.env.AUTH_HARDENED_UAT_RUNTIME_ENABLED === "true"
  );
}

export function isHardenedUatEvidenceRuntimeIdentity() {
  return (
    isExplicitHardenedUatAuthenticationRuntime() &&
    process.env.CI === "true" &&
    process.env.AUTH_MODE === "local"
  );
}

export function isBoundedUatEvidenceRuntimeRequested() {
  return (
    isHardenedUatEvidenceRuntimeIdentity() &&
    process.env.BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED === "true"
  );
}
