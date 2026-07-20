import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../../tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: "pnpm --filter @ogfi/web exec next dev -H 127.0.0.1 -p 3100",
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-e2e"
    },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false
  }
});
