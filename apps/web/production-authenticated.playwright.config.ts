import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);
const baseURL = "https://127.0.0.1:3443";
const evidenceLane =
  process.env.APP_ENV === "uat" ? "bounded-uat" : "production";
const useExternalServer =
  process.env.OGFI_PRODUCTION_AUTH_E2E_EXTERNAL_SERVER === "true";

if (!isCi) {
  throw new Error("PRODUCTION_AUTH_E2E_CI_REQUIRED");
}

if (process.env.AUTH_MODE !== "local") {
  throw new Error("PRODUCTION_AUTH_E2E_LOCAL_AUTH_REQUIRED");
}

if (process.env.APP_URL !== baseURL) {
  throw new Error("PRODUCTION_AUTH_E2E_HTTPS_ORIGIN_REQUIRED");
}

if (!process.env.OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE) {
  throw new Error("PRODUCTION_AUTH_E2E_FIXTURE_FILE_REQUIRED");
}

export default defineConfig({
  testDir: "../../tests/e2e",
  testMatch: [
    "production-authenticated.spec.ts",
    "inventory-pilot-setup.production-authenticated.spec.ts",
    "inventory-approval-worklist.production-authenticated.spec.ts",
  ],
  timeout: 120_000,
  expect: { timeout: 20_000 },
  forbidOnly: true,
  retries: 0,
  workers: 1,
  // Keep raw Playwright artifacts separate from reporter output. Playwright
  // clears the HTML reporter directory before writing it and rejects a parent
  // or child relationship that could delete retained test evidence.
  outputDir: `test-results/production-auth-${evidenceLane}-artifacts`,
  reporter: [
    ["line"],
    [
      "html",
      {
        open: "never",
        outputFolder: `test-results/production-auth-${evidenceLane}-html`,
      },
    ],
    [
      "junit",
      {
        outputFile: `test-results/production-auth-${evidenceLane}-junit.xml`,
      },
    ],
  ],
  use: {
    baseURL,
    // Authentication fixtures type per-run passwords and TOTP material. Retain
    // machine-readable reports only; browser captures could expose secrets.
    trace: "off",
    screenshot: "off",
    video: "off",
    ignoreHTTPSErrors: false,
  },
  projects: [
    { name: "production-auth-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "production-auth-mobile", use: { ...devices["Pixel 7"] } },
  ],
  globalTeardown: "../../scripts/production-auth-e2e-teardown.mjs",
  webServer: useExternalServer
    ? undefined
    : {
        command: "node ../../scripts/production-auth-e2e-runner.mjs",
        url: baseURL,
        timeout: 180_000,
        reuseExistingServer: false,
        // The runner must stop the app/proxy namespace, authenticate the
        // private-database stop request, and verify the disposable teardown
        // receipt before Playwright may terminate it.
        gracefulShutdown: { signal: "SIGTERM", timeout: 180_000 },
      },
});
