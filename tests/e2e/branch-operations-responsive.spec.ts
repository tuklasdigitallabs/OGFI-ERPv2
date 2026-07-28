import { expect, test } from "@playwright/test";

const requesterEmail = process.env.DEMO_USER_EMAIL ?? "user@example.test";

function futureDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function signInAsRequester(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(requesterEmail);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto("/branch-operations");
  await expect(page.getByRole("heading", { name: "Branch Operations" })).toBeVisible();
}

test("Branch Operations register remains scoped and task-focused on mobile", async ({ page }) => {
  await signInAsRequester(page);
  await expect(page.getByText("Read-only branch controls")).toBeVisible();
  await expect(page.getByLabel("Search")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();
  if ((await page.evaluate(() => window.innerWidth)) < 1024) {
    await expect(page.locator("dt:visible", { hasText: "Location" })).toBeVisible();
    await expect(page.locator("dt:visible", { hasText: "Next action" })).toBeVisible();
  } else {
    await expect(page.getByText("Checklist", { exact: true })).toBeVisible();
    await expect(page.getByText("Action", { exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("Branch Operations dashboard profile is explicitly read-only", async ({ page }) => {
  await signInAsRequester(page);
  await page.goto("/branch-operations?dashboard=branch-checklist-reviews-v1");
  await expect(page.getByRole("heading", { name: "Checklist Reviews" }).first()).toBeVisible();
  await expect(page.getByText("server-owned read-only dashboard destination.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit dashboard view" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Checklist" })).not.toBeVisible();
});

test("requester can create a submitted Branch Operations checklist", async ({ page }, testInfo) => {
  await signInAsRequester(page);
  const checklistName = `Responsive branch readiness ${Date.now()}`;
  await page.getByRole("button", { name: "Create Checklist" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Branch Checklist" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Business date").fill(futureDate(testInfo.project.name === "mobile" ? 15 : 14));
  await dialog.getByLabel("Shift").selectOption("CLOSING");
  await dialog.getByLabel("Checklist name").fill(checklistName);
  await dialog.getByLabel("Area").fill("Dining room");
  await dialog.getByLabel("Check", { exact: true }).fill("Tables ready");
  await dialog.getByLabel("Expected result").fill("Clean and ready");
  await dialog.getByLabel("Evidence reference").fill("responsive-e2e");
  await dialog.getByLabel("Notes").fill("Created during responsive acceptance");
  await page.getByRole("button", { name: "Create Branch Checklist", exact: true }).click();
  await expect(page).toHaveURL(/\/branch-operations\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: checklistName })).toBeVisible();
  await expect(page.getByText("submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("responsive-e2e", { exact: true })).toBeVisible();
});
