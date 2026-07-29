import { expect, test, type Page } from "@playwright/test";

const requesterEmail = process.env.DEMO_USER_EMAIL ?? "user@example.test";

async function signInAsRequester(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(requesterEmail);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto("/maintenance");
  await expect(page.getByRole("heading", { name: "Maintenance", exact: true })).toBeVisible();
}

test("Maintenance register remains scoped and readable responsively", async ({ page }) => {
  await signInAsRequester(page);
  await expect(page.getByText("Phase II boundary:")).toBeVisible();
  await expect(page.getByLabel("Search")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();
  if ((await page.evaluate(() => window.innerWidth)) < 1280) {
    await expect(page.getByRole("link", { name: "Open Maintenance Ticket" }).first()).toBeVisible();
    await expect(page.locator("dt:visible", { hasText: "Location" }).first()).toBeVisible();
    await expect(page.locator("dt:visible", { hasText: "Target due / next action" }).first()).toBeVisible();
  } else {
    await expect(page.getByText("Ticket", { exact: true })).toBeVisible();
    await expect(page.getByText("Action", { exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
});

test("Maintenance follow-up dashboard profile is explicitly read-only", async ({ page }) => {
  await signInAsRequester(page);
  await page.goto("/maintenance?dashboard=maintenance-follow-up-v1");
  await expect(page.getByRole("heading", { name: "Maintenance Follow-up" }).first()).toBeVisible();
  await expect(page.getByText("This read-only oversight view contains all").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit dashboard view" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Ticket" })).not.toBeVisible();
});
