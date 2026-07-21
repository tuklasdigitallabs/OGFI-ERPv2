export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionAuthConfiguration } =
      await import("./server/services/authentication");
    const { assertProductionEvidenceStorageConfiguration } =
      await import("./server/services/evidenceStorageConfig");
    assertProductionAuthConfiguration();
    assertProductionEvidenceStorageConfiguration();
  }
}
