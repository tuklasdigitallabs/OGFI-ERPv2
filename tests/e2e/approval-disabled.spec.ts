import { expect, test } from "@playwright/test";

const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "erp.admin@ogfi.example";

test("disabled approval inbox is explicit and exposes no legacy actions", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();

  await page.goto("/approvals");
  await expect(page.getByRole("heading", { name: "Approval Inbox unavailable" })).toBeVisible();
  await expect(page.getByText(/normalized approval routing is not enabled/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /approve|reject|review/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /approve|reject|review/i })).toHaveCount(0);
});
