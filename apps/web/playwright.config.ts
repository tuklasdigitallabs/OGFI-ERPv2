import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "../../tests/e2e",
  timeout: 60_000,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: isCi ? 1 : undefined,
  reporter: isCi
    ? [
        ["line"],
        ["html", { open: "never" }],
        ["junit", { outputFile: "test-results/e2e-junit.xml" }],
      ]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: isCi
      ? "pnpm --filter @ogfi/web exec next start -H 127.0.0.1 -p 3100"
      : "pnpm --filter @ogfi/web exec next dev -H 127.0.0.1 -p 3100",
    env: {
      ...process.env,
      NODE_ENV: isCi ? "production" : process.env.NODE_ENV,
      NEXT_DIST_DIR: isCi
        ? (process.env.NEXT_DIST_DIR ?? ".next-ogfi")
        : ".next-e2e",
    },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
  },
});
