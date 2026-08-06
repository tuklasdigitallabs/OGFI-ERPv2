import { expect, test, type Page } from "@playwright/test";

async function signInAsAdmin(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(process.env.DEMO_ADMIN_EMAIL ?? "admin@example.test");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
}

test("procurement workspaces expose scoped actions and safe read-only states", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsAdmin(page);

  await page.goto("/purchase-requests");
  await expect(page.getByRole("heading", { name: "Purchase Requests", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Purchase Request", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create Purchase Request", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Create Draft PR" })).toBeVisible();
  await expect(page.getByText("Build and review request lines before creating the draft.")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/purchase-orders");
  await expect(page.getByRole("heading", { name: "Purchase Orders", exact: true })).toBeVisible();
  await expect(page.getByText("Purchase Orders are supplier commitments from approved sourcing.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Draft PO", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/quotes");
  await expect(page.getByRole("heading", { name: "Supplier Quotes", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Record Supplier Quote", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
