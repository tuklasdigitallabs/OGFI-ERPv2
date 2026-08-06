import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@example.test";

async function expectDemoSession(page: Page, email: string) {
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies();
      const value = cookies.find((cookie) => cookie.name === "ogfi_demo_session")?.value;
      return value ? decodeURIComponent(value) : value;
    })
    .toBe(email);
}

async function signInAsAdmin(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expectDemoSession(page, adminEmail);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth),
  ).toBe(true);
}

test("receiving register tabs and filters remain usable on desktop and mobile", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/receiving");

  await expect(page.getByRole("heading", { name: "Receiving", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Receiving Reports", level: 2 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create Draft Receipt" })).toBeVisible();
  await expect(page.getByPlaceholder("Search GRN, Purchase Order, or supplier")).toBeVisible();
  await expect(page.getByRole("link", { name: "All receipts" })).toBeVisible();
  await expect(page.locator('a[href="/receiving?tab=draft"]')).toBeVisible();
  await expect(page.locator('a[href="/receiving?tab=posted"]')).toBeVisible();
  await expect(page.locator('a[href="/receiving?tab=discrepancies"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const controls = page.locator("main .ogfi-data-surface input:visible, main .ogfi-data-surface select:visible, main .ogfi-data-surface button:visible");
  for (const control of await controls.all()) {
    const height = await control.evaluate((element) => element.getBoundingClientRect().height);
    if (height > 0) expect(height).toBeGreaterThanOrEqual(44);
  }
  for (const control of [
    page.getByRole("link", { name: "Create Draft Receipt", exact: true }),
    page.getByRole("link", { name: "Export CSV", exact: true }),
  ]) {
    expect(await control.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }

  await page.goto("/receiving?tab=draft&q=GRN");
  await expect(page.getByRole("link", { name: "Clear filters" })).toBeVisible();
  await expect(page.getByPlaceholder("Search GRN, Purchase Order, or supplier")).toHaveValue("GRN");
  await expectNoHorizontalOverflow(page);
});

test("create draft receiving task exposes scope, issued PO, and no-posting state", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/receiving/new");

  await expect(page.getByRole("heading", { name: "Create Draft Receipt" })).toBeVisible();
  await expect(page.getByText("Draft only", { exact: true })).toBeVisible();
  await expect(page.getByText("No inventory posting", { exact: true })).toBeVisible();
  await expect(page.getByText("Inventory changes only after the saved draft is posted from its detail page.")).toBeVisible();
  const issuedOrderSelect = page.getByLabel("Issued purchase order");
  if (await issuedOrderSelect.count()) {
    await expect(issuedOrderSelect).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Draft Receipt", exact: true })).toBeVisible();
  } else {
    await expect(page.getByText("No issued Purchase Orders are ready for receiving in this location.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Draft Receipt", exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: "Cancel and return to Receiving" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
