export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionAuthConfiguration } =
      await import("./server/services/authentication");
    assertProductionAuthConfiguration();
  }
}
