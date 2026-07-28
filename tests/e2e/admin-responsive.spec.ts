import { expect, test } from "@playwright/test";

const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@example.test";

async function expectDemoSession(page: import("@playwright/test").Page, email: string) {
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies();
      const value = cookies.find((cookie) => cookie.name === "ogfi_demo_session")?.value;
      return value ? decodeURIComponent(value) : value;
    })
    .toBe(email);
}

async function signInAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expectDemoSession(page, adminEmail);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Core Administration" })).toBeVisible();
}

test("core administration workspaces remain usable at desktop and mobile widths", async ({ page }) => {
  await signInAsAdmin(page);

  const workspaces = [
    ["/admin?tab=users", "Users & Access", "Create User"],
    ["/admin?tab=roles", "Roles & Permissions", "Create Role"],
    ["/admin?tab=organization", "Organization Scope", "Organization sections"],
    ["/admin?tab=approval-rules", "Approval Rules", "Create Approval Rule"],
    ["/admin?tab=audit", "Audit Trail", "Read-only"],
  ] as const;

  for (const [href, heading, action] of workspaces) {
    await page.goto(href);
    await expect(page.getByRole("heading", { name: heading, level: 2 })).toBeVisible();
    if (action === "Organization sections") {
      await expect(page.getByRole("link", { name: "Selected company summary" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Brands" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Departments" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Locations" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Companies", level: 3 })).toBeVisible();
    } else {
      await expect(page.getByText(action, { exact: true }).first()).toBeVisible();
    }

    const tabs = page.getByRole("link", { name: /Users & Access|Roles & Permissions|Organization Scope|Approval Rules|Audit Trail/ });
    await expect(tabs).toHaveCount(5);
    expect(
      await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth),
    ).toBe(true);
    for (const tab of await tabs.all()) {
      expect(await tab.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(40);
    }
  }
});
