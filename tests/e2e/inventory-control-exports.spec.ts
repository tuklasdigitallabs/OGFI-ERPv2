import { expect, test, type Page } from "@playwright/test";

async function signInAsAdmin(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(process.env.DEMO_ADMIN_EMAIL ?? "admin@example.test");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();
}

test("inventory-control export routes return bounded CSV responses", async ({ page }) => {
  await signInAsAdmin(page);
  const routes = [
    "/inventory/export",
    "/inventory/ledger/export",
    "/inventory/reconciliation/export?dashboard=ledger-variance-v1",
    "/receiving/export",
    "/transfers/export",
    "/counts/export",
    "/wastage/export",
    "/adjustments/export",
    "/purchase-requests/export",
    "/purchase-orders/export",
    "/quotes/export",
  ];

  for (const route of routes) {
    const response = await page.request.get(route);
    expect(response.ok(), `${route} should return a successful export response`).toBe(true);
    expect(response.headers()["content-type"] ?? "").toContain("text/csv");
    const body = await response.text();
    expect(body.length, `${route} should return a bounded CSV body`).toBeGreaterThan(0);
    expect(body.split("\n").length).toBeLessThanOrEqual(501);
  }
});
