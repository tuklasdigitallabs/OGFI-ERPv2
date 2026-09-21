import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@example.test";

async function signInAs(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies();
      return cookies.find((cookie) => cookie.name === "ogfi_demo_session")?.value;
    })
    .toBeTruthy();
}

test("modernized project, board, and finance workspaces stay readable", async ({ page }) => {
  await signInAs(page, adminEmail);

  for (const workspace of [
    ["/projects", "Projects Tracker"],
    ["/work-boards", "Work Boards"],
    ["/finance/general-ledger", "General Ledger"],
  ] as const) {
    await page.goto(workspace[0]);
    await expect(page.getByRole("heading", { name: workspace[1] })).toBeVisible();
    expect(
      await page
        .locator("html")
        .evaluate((documentElement: HTMLElement) => documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
