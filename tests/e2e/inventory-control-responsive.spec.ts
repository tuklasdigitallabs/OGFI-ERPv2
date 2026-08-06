import { expect, test } from "@playwright/test";

async function signInAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(process.env.DEMO_ADMIN_EMAIL ?? "admin@example.test");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  expect(
    await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth),
  ).toBe(true);
}

test.describe("inventory control visible surfaces", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsAdmin(page);
  });

  test("wastage register exposes controlled create, export, and exception context", async ({ page }) => {
    await page.goto("/wastage");
    await expect(page.getByRole("heading", { name: "Wastage", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log Wastage", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Export CSV", exact: true })).toBeVisible();
    await expect(page.getByText("Wastage requires documented reason and policy evidence.")).toBeVisible();
    await page.getByRole("button", { name: "Log Wastage", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Log Wastage", exact: true })).toBeVisible();
    await expect(page.getByLabel("Report evidence reference")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Draft Report", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("stock adjustments expose controlled create, export, and non-posting approval state", async ({ page }) => {
    await page.goto("/adjustments");
    await expect(page.getByRole("heading", { name: "Stock Adjustments", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Adjustment", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Export CSV", exact: true })).toBeVisible();
    await expect(page.getByText("Adjustments are controlled correction requests.")).toBeVisible();
    await expect(page.getByText("Approval is non-posting; stock changes only after the separate Post Adjustment action.")).toBeVisible();
    await page.getByRole("button", { name: "Create Adjustment", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create Adjustment", exact: true })).toBeVisible();
    await expect(page.getByLabel("Reason description")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Adjustment", exact: true }).last()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("stock counts expose schedule, export, and no-direct-posting state", async ({ page }) => {
    await page.goto("/counts");
    await expect(page.getByRole("heading", { name: "Stock Counts", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Schedule Count", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Export CSV", exact: true })).toBeVisible();
    await expect(page.getByText("Counts do not post stock directly.")).toBeVisible();
    await page.getByRole("button", { name: "Schedule Count", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Schedule Count", exact: true })).toBeVisible();
    await expect(page.getByLabel("Count type")).toBeVisible();
    await expect(page.getByRole("button", { name: "Schedule Count", exact: true }).last()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("reconciliation exposes read-only variance context and capped export", async ({ page }) => {
    await page.goto("/inventory/reconciliation?dashboard=ledger-variance-v1");
    await expect(page.getByRole("heading", { name: "Ledger Variance Reconciliation", exact: true })).toBeVisible();
    await expect(page.getByText("Read-only comparison of cached balances with the authoritative ledger")).toBeVisible();
    await expect(page.getByRole("link", { name: "Export diagnostic CSV", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
