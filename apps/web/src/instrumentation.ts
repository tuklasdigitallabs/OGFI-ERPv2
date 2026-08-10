export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionAuthConfiguration } =
      await import("./server/services/authentication");
    const { assertProductionEvidenceStorageConfiguration } =
      await import("./server/services/evidenceStorageConfig");
    assertProductionAuthConfiguration();
    assertProductionEvidenceStorageConfiguration();

    if (process.env.OGFI_LOCAL_UAT_BASELINE_REQUIRED === "true") {
      const { assertLocalUatDatabaseAdmission } =
        await import("./server/services/localUatDatabaseAdmission");
      await assertLocalUatDatabaseAdmission();
    }
  }
}
