import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../../packages/database/src/client";

const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@example.test";
const tenantId = "00000000-0000-4000-8000-000000000001";
const companyId = "00000000-0000-4000-8000-000000000002";
const itemCategoryId = "00000000-0000-4000-8000-000000000021";
const kilogramUomId = "00000000-0000-4000-8000-000000000022";
const gramUomId = "00000000-0000-4000-8000-000000000023";

type FixtureStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
type FixtureScenario =
  | "open-close"
  | "dirty-close"
  | "save"
  | "conflict"
  | "audit"
  | "inactive"
  | "archived"
  | "mobile";

const scenarioIds: Record<FixtureScenario, number> = {
  "open-close": 101,
  "dirty-close": 102,
  save: 103,
  conflict: 104,
  audit: 105,
  inactive: 106,
  archived: 107,
  mobile: 108
};

function projectOffset(projectName: string) {
  return projectName === "mobile" ? 200 : 100;
}

function fixtureId(projectName: string, scenario: FixtureScenario) {
  const suffix = scenarioIds[scenario] + projectOffset(projectName);
  return `24100000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function fixtureCode(projectName: string, scenario: FixtureScenario) {
  const project = projectName === "mobile" ? "MOBILE" : "CHROMIUM";
  return `DEC0241-${project}-${scenario.toUpperCase()}`;
}

async function resetItemFixture(
  projectName: string,
  scenario: FixtureScenario,
  status: FixtureStatus = "ACTIVE"
) {
  const id = fixtureId(projectName, scenario);
  const itemCode = fixtureCode(projectName, scenario);
  const itemName = `DEC-0241 ${scenario} item`;
  const data = {
    tenantId,
    companyId,
    itemCode,
    itemName,
    itemCategoryId,
    itemType: "inventory",
    baseUomId: kilogramUomId,
    purchaseUomId: kilogramUomId,
    issueUomId: gramUomId,
    trackInventory: true,
    trackExpiry: true,
    trackLot: true,
    requiresReceivingInspection: true,
    status
  } as const;

  await prisma.item.upsert({
    where: { id },
    create: { id, ...data },
    update: data
  });

  return { id, itemCode, itemName };
}

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

function itemSheetHref(item: { id: string; itemCode: string }, status: FixtureStatus) {
  const query = new URLSearchParams({
    tab: "items",
    itemQuery: item.itemCode,
    itemStatus: status,
    itemPage: "1",
    itemId: item.id
  });
  return `/items?${query.toString()}`;
}

async function expectPreservedRegisterContext(
  page: Page,
  item: { itemCode: string },
  status: FixtureStatus
) {
  await expect(page).toHaveURL((url) => {
    return url.pathname === "/items" &&
      url.searchParams.get("tab") === "items" &&
      url.searchParams.get("itemQuery") === item.itemCode &&
      url.searchParams.get("itemStatus") === status &&
      url.searchParams.get("itemPage") === "1" &&
      !url.searchParams.has("itemId");
  });
}

test("URL-selected active item opens a name-only sheet and closes to preserved register context", async ({
  page
}, testInfo) => {
  const item = await resetItemFixture(testInfo.project.name, "open-close");
  await signInAsAdmin(page);
  await page.goto(itemSheetHref(item, "ACTIVE"));

  const sheet = page.getByRole("dialog", { name: "Correct Item Name" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(item.itemCode, { exact: false }).first()).toBeVisible();
  await expect(sheet.getByLabel("Item name", { exact: true })).toBeEditable();
  await expect(sheet.getByLabel("Item name", { exact: true })).toBeFocused();
  await expect(sheet.getByLabel("Item code")).toBeDisabled();
  await expect(sheet.getByLabel("Correction reason")).toBeEditable();
  await expect(sheet.getByRole("heading", { name: "Governed fields are read-only" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Deactivate Item" })).toBeDisabled();
  await expect(sheet.getByText("no deactivation request is recorded here", { exact: false })).toBeVisible();
  await expect(sheet.locator("select:visible, input[type=checkbox]:visible")).toHaveCount(0);

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
  await expectPreservedRegisterContext(page, item, "ACTIVE");
  await expect(page.locator("#item-register-heading")).toBeFocused();
});

test("dirty Cancel, close button, and Escape require confirmation", async ({ page }, testInfo) => {
  const item = await resetItemFixture(testInfo.project.name, "dirty-close");
  await signInAsAdmin(page);
  const href = itemSheetHref(item, "ACTIVE");
  await page.goto(href);

  const sheet = page.getByRole("dialog", { name: "Correct Item Name" });
  await sheet.getByLabel("Item name", { exact: true }).fill(`${item.itemName} draft`);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Discard the item-name correction draft?");
    await dialog.dismiss();
  });
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Discard the information entered in this form?");
    await dialog.dismiss();
  });
  await sheet.getByRole("button", { name: "Close Correct Item Name" }).click();
  await expect(sheet).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Discard the information entered in this form?");
    await dialog.accept();
  });
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expectPreservedRegisterContext(page, item, "ACTIVE");
});

test("name correction announces success and suppresses duplicate submission while pending", async ({
  page
}, testInfo) => {
  const item = await resetItemFixture(testInfo.project.name, "save");
  await signInAsAdmin(page);
  await page.goto(itemSheetHref(item, "ACTIVE"));

  let actionPosts = 0;
  await page.route("**/items*", async (route) => {
    if (route.request().method() === "POST") {
      actionPosts += 1;
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });

  const sheet = page.getByRole("dialog", { name: "Correct Item Name" });
  const correctedName = `${item.itemName} corrected`;
  const itemNameInput = sheet.getByLabel("Item name", { exact: true });
  const reasonInput = sheet.getByLabel("Correction reason");
  await expect(itemNameInput).toBeEditable();
  await expect(itemNameInput).toBeFocused();
  await expect(reasonInput).toBeEditable();
  await itemNameInput.fill(correctedName);
  await reasonInput.fill("Correct the item display label");
  await expect(itemNameInput).toHaveValue(correctedName);
  await expect(reasonInput).toHaveValue("Correct the item display label");
  const saveButton = sheet.getByRole("button", { name: "Save Item Name" });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(sheet.getByRole("button", { name: "Saving Item Name…" })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: "Close Correct Item Name" })).toBeDisabled();
  await sheet.getByRole("button", { name: "Saving Item Name…" }).evaluate((button) =>
    (button as HTMLButtonElement).click()
  );

  const success = sheet.getByRole("status");
  await expect(success).toContainText(`Item name saved: ${item.itemCode} / ${correctedName}`);
  await expect(success).toContainText("recorded together in audit history");
  expect(actionPosts).toBe(1);
  await sheet.getByRole("button", { name: "Return to Item Register" }).click();
  await expectPreservedRegisterContext(page, item, "ACTIVE");
  await expect(page.locator("#item-register-heading")).toBeFocused();
});

test("stale correction fails safely, keeps the draft, and focuses recovery feedback", async ({
  page
}, testInfo) => {
  const item = await resetItemFixture(testInfo.project.name, "conflict");
  await signInAsAdmin(page);
  await page.goto(itemSheetHref(item, "ACTIVE"));

  let actionPosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/items")) actionPosts += 1;
  });

  await prisma.item.update({
    where: { id: item.id },
    data: { itemName: `${item.itemName} externally changed` }
  });

  const sheet = page.getByRole("dialog", { name: "Correct Item Name" });
  const draftName = `${item.itemName} stale draft`;
  await sheet.getByLabel("Item name", { exact: true }).fill(draftName);
  await sheet.getByLabel("Correction reason").fill("Attempt a stale item correction");
  await sheet.getByRole("button", { name: "Save Item Name" }).click();

  const alert = sheet.getByRole("alert");
  await expect(alert).toContainText("This item changed while you were editing");
  await expect(alert).toContainText("Return to the refreshed register");
  await expect(alert).toBeFocused();
  await expect(sheet.getByLabel("Item name", { exact: true })).toHaveValue(draftName);
  await expect(sheet.getByLabel("Item name", { exact: true })).toBeDisabled();
  await expect(sheet.getByLabel("Correction reason")).toBeDisabled();
  expect(actionPosts).toBe(1);
  await page.keyboard.press("Enter");
  await expect.poll(() => actionPosts).toBe(1);
  await sheet.getByRole("button", { name: "Return to refreshed register" }).click();
  await expectPreservedRegisterContext(page, item, "ACTIVE");
  await expect(page.locator("#item-register-heading")).toBeFocused();
});

test("audit history handoff opens the authoritative filtered audit view in a new tab", async ({
  page
}, testInfo) => {
  const item = await resetItemFixture(testInfo.project.name, "audit");
  await signInAsAdmin(page);
  await page.goto(itemSheetHref(item, "ACTIVE"));

  const link = page.getByRole("link", {
    name: "View authoritative item audit history (opens in new tab)"
  });
  const draftName = `${item.itemName} audit draft`;
  await page.getByRole("dialog", { name: "Correct Item Name" }).getByLabel("Item name", { exact: true }).fill(draftName);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  const [auditPage] = await Promise.all([page.waitForEvent("popup"), link.click()]);
  await expect(auditPage).toHaveURL((url) =>
    url.pathname === "/admin" &&
    url.searchParams.get("tab") === "audit" &&
    url.searchParams.get("entityType") === "Item" &&
    url.searchParams.get("entityId") === item.id
  );
  await auditPage.close();
  await expect(page.getByRole("dialog", { name: "Correct Item Name" }).getByLabel("Item name", { exact: true })).toHaveValue(
    draftName
  );
});

for (const status of ["INACTIVE", "ARCHIVED"] as const) {
  test(`${status.toLowerCase()} item opens as retained read-only history`, async ({
    page
  }, testInfo) => {
    const scenario = status === "INACTIVE" ? "inactive" : "archived";
    const item = await resetItemFixture(testInfo.project.name, scenario, status);
    await signInAsAdmin(page);
    await page.goto(itemSheetHref(item, status));

    const sheet = page.getByRole("dialog", { name: "Item details" });
    await expect(sheet.getByRole("heading", { name: `Read-only ${status.toLowerCase()} item` })).toBeVisible();
    await expect(sheet.getByText("preserve historical transaction and audit references", { exact: false })).toBeVisible();
    await expect(sheet.getByLabel("Item name", { exact: true })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: /Save Item Name|Deactivate Item/ })).toHaveCount(0);
    await expect(sheet.getByRole("link", { name: "View item audit history" })).toHaveAttribute(
      "href",
      `/admin?tab=audit&entityType=Item&entityId=${item.id}`
    );
    await sheet.getByRole("button", { name: "Close Item Details" }).click();
    await expectPreservedRegisterContext(page, item, status);
  });
}

test("unavailable selection discloses no item facts and returns to preserved context", async ({
  page
}) => {
  await signInAsAdmin(page);
  const missingId = "24100000-0000-4000-8000-000000009999";
  const itemCode = "DEC0241-MISSING";
  await page.goto(
    `/items?tab=items&itemQuery=${itemCode}&itemStatus=ACTIVE&itemPage=1&itemId=${missingId}`
  );

  const sheet = page.getByRole("dialog", { name: "Item details unavailable" });
  await expect(sheet).toContainText("unavailable, outside the selected company scope, or no longer exists");
  await expect(sheet).not.toContainText(missingId);
  await expect(sheet).not.toContainText(tenantId);
  await expect(sheet).not.toContainText(companyId);
  await sheet.getByRole("button", { name: "Return to Item Register" }).click();
  await expectPreservedRegisterContext(page, { itemCode }, "ACTIVE");
  await expect(page.locator("#item-register-heading")).toBeFocused();
});

test("mobile selected-item sheet stays task-focused without horizontal overflow", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Covered by the dedicated mobile project.");
  const item = await resetItemFixture(testInfo.project.name, "mobile");
  await signInAsAdmin(page);
  await page.goto(itemSheetHref(item, "ACTIVE"));

  const sheet = page.getByRole("dialog", { name: "Correct Item Name" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Item name", { exact: true })).toBeFocused();
  await expect(sheet.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Save Item Name" })).toBeVisible();
  expect(
    await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth)
  ).toBe(true);
  expect(
    await page.locator("html").evaluate(
      (documentElement: HTMLElement) => documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
