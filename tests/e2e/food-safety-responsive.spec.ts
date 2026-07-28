import { expect, test, type Page } from "@playwright/test";

const requesterEmail = process.env.DEMO_USER_EMAIL ?? "user@example.test";

async function signInAsRequester(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(requesterEmail);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto("/food-safety");
  await expect(page.getByRole("heading", { name: "Food Safety", exact: true })).toBeVisible();
}

test("Food Safety register remains scoped and readable responsively", async ({ page }) => {
  await signInAsRequester(page);
  await expect(page.getByText("Read-only compliance foundation")).toBeVisible();
  await expect(page.getByLabel("Search")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();
  if ((await page.evaluate(() => window.innerWidth)) < 1024) {
    await expect(page.locator("dt:visible", { hasText: "Readings" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Source Log" }).first()).toBeVisible();
  } else {
    await expect(page.getByText("Log", { exact: true })).toBeVisible();
    await expect(page.getByText("Action", { exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("Food Safety Reviews dashboard profile is explicitly read-only", async ({ page }) => {
  await signInAsRequester(page);
  await page.goto("/food-safety?dashboard=food-safety-reviews-v1");
  await expect(page.getByRole("heading", { name: "Food Safety Reviews" }).first()).toBeVisible();
  await expect(page.getByText("server-owned read-only dashboard destination.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit dashboard view" })).toBeVisible();
});
