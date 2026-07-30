import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);
const baseURL = "https://127.0.0.1:3443";

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
  testMatch: "production-authenticated.spec.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  forbidOnly: true,
  retries: 0,
  workers: 1,
  // Keep raw Playwright artifacts separate from reporter output. Playwright
  // clears the HTML reporter directory before writing it and rejects a parent
  // or child relationship that could delete retained test evidence.
  outputDir: "test-results/production-auth-artifacts",
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "test-results/production-auth-html" }],
    ["junit", { outputFile: "test-results/production-auth-junit.xml" }],
  ],
  use: {
    baseURL,
    // Authentication fixtures type per-run passwords and TOTP material. Retain
    // machine-readable reports only; browser captures could expose secrets.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "production-auth-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "production-auth-mobile", use: { ...devices["Pixel 7"] } },
  ],
  globalTeardown: "../../scripts/production-auth-e2e-teardown.mjs",
  webServer: {
    command: "node ../../scripts/production-auth-e2e-runner.mjs",
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
