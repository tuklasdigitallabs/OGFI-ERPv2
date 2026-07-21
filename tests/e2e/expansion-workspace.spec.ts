import { expect, test, type Page } from "@playwright/test";

const superUserEmail = process.env.DEMO_SUPER_USER_EMAIL ?? "super.admin@ogfi.example";

async function signInAsSuperUser(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(superUserEmail);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies();
      const value = cookies.find((cookie) => cookie.name === "ogfi_demo_session")?.value;
      return value ? decodeURIComponent(value) : value;
    })
    .toBe(superUserEmail);
}

const expansionRoutes = [
  { path: "/expansion", heading: "Expansion Dashboard", action: "Open Site Pipeline", actionRole: "link" },
  { path: "/expansion/sites", heading: "Site Pipeline", action: "Create Site Project", actionRole: "button" },
  { path: "/expansion/playbooks", heading: "Opening Playbooks", action: "Create Opening Playbook", actionRole: "button" },
  { path: "/expansion/feasibility", heading: "Feasibility", action: "Create Review", actionRole: "button" },
  { path: "/expansion/capex-procurement", heading: "Capex & Procurement", action: "Create Item", actionRole: "button" },
  { path: "/expansion/gates", heading: "Lifecycle Gates", action: "Generate Gates", actionRole: "button" },
  { path: "/expansion/permits", heading: "Permits & Documents", action: "Create Requirement", actionRole: "button" },
  { path: "/expansion/construction", heading: "Construction Board", action: "Create Construction Task", actionRole: "button" },
  { path: "/expansion/readiness", heading: "Opening Readiness", action: "Create Readiness Item", actionRole: "button" },
  { path: "/expansion/punch-list", heading: "Punch List", action: "Create Punch Item", actionRole: "button" },
  { path: "/expansion/post-opening", heading: "Post-Opening Review", action: "Create Review", actionRole: "button" }
] as const;

test("Expansion workspace routes are available to the scoped super user", async ({ page }) => {
  test.setTimeout(180_000);
  await signInAsSuperUser(page);

  for (const route of expansionRoutes) {
    await page.goto(route.path);
    await expect(
      page.getByRole("heading", { name: route.heading, exact: true })
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Expansion lifecycle" })).toBeVisible();
    await expect(page.getByRole(route.actionRole, { name: route.action })).toBeVisible();
  }
});

test("Expansion lifecycle navigation exposes all working stages", async ({ page }) => {
  await signInAsSuperUser(page);
  await page.goto("/expansion");

  const lifecycleNav = page.getByRole("navigation", { name: "Expansion lifecycle" });
  const mobileDisclosure = lifecycleNav.locator("details");
  if ((page.viewportSize()?.width ?? 0) < 640) {
    const mobileSummary = mobileDisclosure.locator("summary");
    await expect(mobileSummary).toBeVisible();
    await mobileSummary.click();
    await expect(mobileDisclosure).toHaveAttribute("open", "");
  }
  for (const label of [
    "Dashboard",
    "Sites",
    "Opening Playbooks",
    "Project Tasks",
    "Project Calendar",
    "Feasibility",
    "Capex & Procurement",
    "Lifecycle Gates",
    "Permits & Documents",
    "Construction Board",
    "Opening Readiness",
    "Punch List",
    "Post-Opening Review"
  ]) {
    await expect(lifecycleNav.getByRole("link", { name: label })).toBeVisible();
  }
});
