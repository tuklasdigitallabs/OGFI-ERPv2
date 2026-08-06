import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma } from "../../packages/database/src/client";

const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@example.test";
const tenantId = "00000000-0000-4000-8000-000000000001";
const companyId = "00000000-0000-4000-8000-000000000002";
const seededSupplierCode = "OGF-BEEF-PRIME";
const emptySupplierId = "24200000-0000-4000-8000-000000000001";
const inactiveSupplierId = "24200000-0000-4000-8000-000000000002";
const inactiveEmptySupplierId = "24200000-0000-4000-8000-000000000003";
const inactiveSupplierLinkId = "24200000-0000-4000-8000-000000000004";

async function signInAsAdmin(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect.poll(async () => {
    const cookies = await page.context().cookies();
    return cookies.find((cookie) => cookie.name === "ogfi_demo_session")?.value
      ? decodeURIComponent(cookies.find((cookie) => cookie.name === "ogfi_demo_session")!.value)
      : undefined;
  }).toBe(adminEmail);
}

async function seedReadOnlySuppliers() {
  await prisma.supplier.upsert({
    where: { id: emptySupplierId },
    create: {
      id: emptySupplierId,
      tenantId,
      companyId,
      supplierCode: "DEC0242-EMPTY",
      legalName: "DEC-0242 Empty Catalog Supplier",
      tradingName: "Empty Catalog Supplier",
      paymentTerms: "Confidential Net 30",
      status: "ACTIVE",
      accreditationStatus: "APPROVED"
    },
    update: {
      legalName: "DEC-0242 Empty Catalog Supplier",
      tradingName: "Empty Catalog Supplier",
      paymentTerms: "Confidential Net 30",
      status: "ACTIVE",
      accreditationStatus: "APPROVED"
    }
  });
  await prisma.supplier.upsert({
    where: { id: inactiveSupplierId },
    create: {
      id: inactiveSupplierId,
      tenantId,
      companyId,
      supplierCode: "DEC0242-INACTIVE",
      legalName: "DEC-0242 Inactive Supplier",
      status: "INACTIVE",
      accreditationStatus: "SUSPENDED"
    },
    update: { status: "INACTIVE", accreditationStatus: "SUSPENDED" }
  });
  await prisma.supplier.upsert({
    where: { id: inactiveEmptySupplierId },
    create: {
      id: inactiveEmptySupplierId,
      tenantId,
      companyId,
      supplierCode: "DEC0242-INACTIVE-EMPTY",
      legalName: "DEC-0242 Inactive Empty Supplier",
      status: "INACTIVE",
      accreditationStatus: "SUSPENDED"
    },
    update: { status: "INACTIVE", accreditationStatus: "SUSPENDED" }
  });
  const referenceLink = await prisma.supplierItemLink.findFirstOrThrow({
    where: { tenantId, companyId, status: "ACTIVE" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  await prisma.supplierItemLink.upsert({
    where: { id: inactiveSupplierLinkId },
    create: {
      id: inactiveSupplierLinkId,
      tenantId,
      companyId,
      supplierId: inactiveSupplierId,
      itemId: referenceLink.itemId,
      purchaseUomId: referenceLink.purchaseUomId,
      supplierSku: "DEC0242-INACTIVE-LINK",
      status: "ACTIVE"
    },
    update: { status: "ACTIVE" }
  });
}

async function seededCatalogContext() {
  const supplier = await prisma.supplier.findUniqueOrThrow({
    where: { companyId_supplierCode: { companyId, supplierCode: seededSupplierCode } },
    include: {
      itemLinks: {
        where: { status: "ACTIVE" },
        include: { item: true },
        orderBy: { createdAt: "asc" },
        take: 1
      }
    }
  });
  const link = supplier.itemLinks[0];
  if (!link) throw new Error("DEC0242_ACTIVE_SUPPLIER_LINK_FIXTURE_REQUIRED");
  return { supplier, link };
}

async function seedActionSupplier(withLink = false) {
  const [item, uom] = await Promise.all([
    prisma.item.findFirstOrThrow({
      where: { tenantId, companyId, status: "ACTIVE" },
      orderBy: [{ itemName: "asc" }, { id: "asc" }]
    }),
    prisma.uom.findFirstOrThrow({
      where: { tenantId, companyId, status: "ACTIVE" },
      orderBy: [{ uomCode: "asc" }, { id: "asc" }]
    })
  ]);
  const supplier = await prisma.supplier.create({
    data: {
      id: randomUUID(),
      tenantId,
      companyId,
      supplierCode: `D24-${randomUUID().slice(0, 8).toUpperCase()}`,
      legalName: "DEC-0242 Action Supplier",
      status: "ACTIVE",
      accreditationStatus: "APPROVED"
    }
  });
  const link = withLink
    ? await prisma.supplierItemLink.create({
        data: {
          id: randomUUID(),
          tenantId,
          companyId,
          supplierId: supplier.id,
          itemId: item.id,
          purchaseUomId: uom.id,
          supplierSku: `D24-${randomUUID().slice(0, 8)}`
        }
      })
    : null;
  return { supplier, item, uom, link };
}

function catalogHref(supplierId: string, extra: Record<string, string> = {}) {
  return `/suppliers?${new URLSearchParams({
    query: seededSupplierCode,
    status: "ACTIVE",
    accreditationStatus: "APPROVED",
    page: "1",
    supplier: supplierId,
    tab: "catalog",
    catalogStatus: "ACTIVE",
    catalogPage: "1",
    ...extra
  }).toString()}`;
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectTouchTargetsAtLeast44(locator: Locator) {
  const controls = locator.locator("a:visible, button:visible, input:visible, select:visible");
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index);
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
}

for (const layout of [
  { name: "desktop-1366", width: 1366, height: 1000, table: true },
  { name: "desktop-1024", width: 1024, height: 1000, table: true },
  { name: "tablet", width: 900, height: 1100, table: false },
  { name: "mobile-390", width: 390, height: 844, table: false },
  { name: "mobile-320", width: 320, height: 800, table: false }
] as const) {
  test(`supplier catalog renders one equivalent ${layout.name} presentation without overflow`, async ({ page }, testInfo) => {
    test.skip(
      (layout.table && testInfo.project.name !== "chromium") ||
        (!layout.table && testInfo.project.name !== "mobile"),
      "Each responsive presentation runs under its matching desktop or touch browser profile."
    );
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await signInAsAdmin(page);
    const { supplier, link } = await seededCatalogContext();
    await page.goto(catalogHref(supplier.id, { catalogQuery: link.item.itemCode }));

    const desktopTable = page.getByTestId("supplier-catalog-desktop-table");
    const responsiveCards = page.getByTestId("supplier-catalog-responsive-cards");
    await expect(layout.table ? desktopTable : responsiveCards).toBeVisible();
    await expect(layout.table ? responsiveCards : desktopTable).toBeHidden();
    await expect(page.getByTestId(layout.table ? "supplier-catalog-desktop-table" : "supplier-catalog-responsive-cards")).toContainText(link.item.itemCode);
    await expect(page.getByTestId("supplier-catalog-workspace").getByText("Restricted").first()).toBeVisible();
    await expect(page.getByTestId("supplier-catalog-workspace").getByText(/Showing \d+–\d+ of \d+ filtered catalog items/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectTouchTargetsAtLeast44(page.getByTestId("supplier-catalog-workspace"));
    await expectTouchTargetsAtLeast44(page.getByTestId("selected-supplier-workspace"));

    if (!layout.table) {
      await expect(
        page.getByRole("dialog", { name: supplier.tradingName ?? supplier.legalName })
          .getByTestId("supplier-catalog-workspace")
      ).toBeVisible();
    }
  });
}

for (const layout of [
  { name: "desktop", width: 1366, height: 900, testId: "supplier-row", stateAttribute: "aria-selected" },
  { name: "mobile", width: 390, height: 844, testId: "supplier-card", stateAttribute: "aria-pressed" }
] as const) {
  test(`supplier register uses whole-${layout.name === "desktop" ? "row" : "card"} toggle selection and opens the exact supplier`, async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== (layout.name === "desktop" ? "chromium" : "mobile"),
      "Desktop rows and mobile cards run under their matching browser profile."
    );
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await signInAsAdmin(page);
    const { supplier } = await seededCatalogContext();
    await page.goto(`/suppliers?query=${encodeURIComponent(supplier.supplierCode)}`);

    const openSupplier = page.getByRole("button", { name: "Open supplier", exact: true });
    const selectable = page
      .getByTestId(layout.testId)
      .filter({ hasText: supplier.supplierCode })
      .first();

    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(openSupplier).toBeDisabled();
    await selectable.click();
    await expect(selectable).toHaveAttribute(layout.stateAttribute, "true");
    await expect(openSupplier).toBeEnabled();

    await selectable.click();
    await expect(selectable).toHaveAttribute(layout.stateAttribute, "false");
    await expect(openSupplier).toBeDisabled();

    await selectable.focus();
    await selectable.press("Enter");
    await expect(selectable).toHaveAttribute(layout.stateAttribute, "true");

    await openSupplier.click();
    await expect(page).toHaveURL((url) =>
      url.pathname === "/suppliers" &&
      url.searchParams.get("query") === supplier.supplierCode &&
      url.searchParams.get("supplier") === supplier.id &&
      url.searchParams.get("tab") === "overview"
    );
    await expect(
      page.getByRole("dialog", { name: supplier.tradingName ?? supplier.legalName })
    ).toBeVisible();
    await expect(page.getByTestId("selected-supplier-workspace")).toContainText(supplier.supplierCode);
    await expect(page.getByText("Opening supplier…")).toHaveCount(0);
  });
}

test("Catalog Apply, Clear, and paging retain register and selected-supplier URL context", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAsAdmin(page);
  const { supplier, link } = await seededCatalogContext();
  await page.goto(catalogHref(supplier.id));

  await page.getByLabel("Search catalog").fill(link.item.itemCode);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL((url) =>
    url.searchParams.get("supplier") === supplier.id &&
    url.searchParams.get("tab") === "catalog" &&
    url.searchParams.get("query") === seededSupplierCode &&
    url.searchParams.get("status") === "ACTIVE" &&
    url.searchParams.get("accreditationStatus") === "APPROVED" &&
    !url.searchParams.has("page") &&
    url.searchParams.get("catalogQuery") === link.item.itemCode &&
    !url.searchParams.has("catalogPage")
  );

  await page.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(page).toHaveURL((url) =>
    url.searchParams.get("supplier") === supplier.id &&
    url.searchParams.get("tab") === "catalog" &&
    url.searchParams.get("query") === seededSupplierCode &&
    !url.searchParams.has("page") &&
    !url.searchParams.has("catalogQuery") &&
    !url.searchParams.has("catalogStatus") &&
    !url.searchParams.has("catalogCategory") &&
    !url.searchParams.has("catalogCategoryQuery") &&
    !url.searchParams.has("catalogCategoryPage") &&
    !url.searchParams.has("catalogPage")
  );

  const next = page.getByRole("link", { name: "Next", exact: true });
  if (await next.isVisible()) {
    await next.click();
    await expect(page).toHaveURL((url) => url.searchParams.get("supplier") === supplier.id && url.searchParams.get("tab") === "catalog" && url.searchParams.get("query") === seededSupplierCode && url.searchParams.get("catalogPage") === "2");
  }
});

test("active link TaskSheet closes to URL context and restores the visible originating control", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await signInAsAdmin(page);
  const { supplier, link } = await seededCatalogContext();
  await page.goto(catalogHref(supplier.id, { catalogQuery: link.item.itemCode, selectedSupplierItemLinkId: link.id }));

  const sheet = page.getByRole("dialog", { name: "Deactivate supplier-item link" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL((url) => url.searchParams.get("supplier") === supplier.id && url.searchParams.get("tab") === "catalog" && url.searchParams.get("catalogQuery") === link.item.itemCode && !url.searchParams.has("selectedSupplierItemLinkId"));
  await expect(page.locator(`[data-focus-key="supplier-link-control-${link.id}"]:visible`)).toBeFocused();
});

test("create-link TaskSheet is focused, URL-owned, and suppresses confidential inputs", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1100 });
  await signInAsAdmin(page);
  const { supplier } = await seededCatalogContext();
  await page.goto(catalogHref(supplier.id, { linkAction: "create", itemLinkQuery: "beef" }));

  const sheet = page.getByRole("dialog", { name: "Create supplier-item link" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Reference price: Restricted")).toBeVisible();
  await expect(sheet.locator('input[name="unitPrice"], input[name="effectiveFrom"]')).toHaveCount(0);
  await expectTouchTargetsAtLeast44(sheet);
  const itemSelect = sheet.locator('select[name="itemId"]');
  const uomSelect = sheet.locator('select[name="purchaseUomId"]');
  await itemSelect.selectOption({ index: 1 });
  await uomSelect.selectOption({ index: 1 });
  const selectedItemId = await itemSelect.inputValue();
  const selectedUomId = await uomSelect.inputValue();
  await sheet.getByLabel("Supplier SKU").fill("DEC0242-LOOKUP-DRAFT");
  await sheet.getByLabel("Search item").fill("DEC0242-NO-OTHER-ITEM");
  await sheet.getByLabel("Search purchase UOM").fill("DEC0242-NO-OTHER-UOM");
  await sheet.getByRole("button", { name: "Search lookups" }).click();
  await expect(page).toHaveURL((url) =>
    url.searchParams.get("selectedItemId") === selectedItemId &&
    url.searchParams.get("selectedUomId") === selectedUomId
  );
  await expect(sheet.locator('select[name="itemId"]')).toHaveValue(selectedItemId);
  await expect(sheet.locator('select[name="purchaseUomId"]')).toHaveValue(selectedUomId);
  await expect(sheet.getByLabel("Supplier SKU")).toHaveValue("DEC0242-LOOKUP-DRAFT");
  page.once("dialog", (dialog) => dialog.accept());
  await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL((url) => url.searchParams.get("supplier") === supplier.id && url.searchParams.get("tab") === "catalog" && !url.searchParams.has("linkAction") && !url.searchParams.has("itemLinkQuery"));
  await expect(page.locator("#create-supplier-link-trigger")).toBeFocused();
});

test("create-link rejection retains the full draft and successful retry restores context", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsAdmin(page);
  const { supplier, item, uom } = await seedActionSupplier();
  await prisma.supplierItemLink.create({
    data: {
      id: randomUUID(), tenantId, companyId, supplierId: supplier.id,
      itemId: item.id, purchaseUomId: uom.id
    }
  });
  await page.goto(catalogHref(supplier.id, {
    linkAction: "create",
    selectedItemId: item.id,
    selectedUomId: uom.id
  }));
  const sheet = page.getByRole("dialog", { name: "Create supplier-item link" });
  const draft = {
    supplierSku: `RETRY-${randomUUID().slice(0, 6)}`,
    supplierItemName: "Retained supplier item",
    leadTimeDays: "3",
    preferredRank: "2",
    minOrderQty: "4.5",
    reason: "Retain this rejected action draft"
  };
  for (const [name, value] of Object.entries(draft)) {
    await sheet.locator(`[name="${name}"]`).fill(value);
  }
  await sheet.getByRole("button", { name: "Link supplier item", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Action not completed" })).toBeVisible();
  for (const [name, value] of Object.entries(draft)) {
    await expect(sheet.locator(`[name="${name}"]`)).toHaveValue(value);
  }
  await prisma.supplierItemLink.deleteMany({
    where: { supplierId: supplier.id, itemId: item.id, purchaseUomId: uom.id }
  });
  const submit = sheet.getByRole("button", { name: "Link supplier item", exact: true });
  await submit.click();
  await expect(page.getByRole("status").filter({ hasText: "Action completed" })).toBeVisible();
  await expect(sheet).toBeHidden({ timeout: 5_000 });
  await expect(page.locator("#create-supplier-link-trigger")).toBeFocused();
  await expect.poll(() => prisma.supplierItemLink.count({
    where: { supplierId: supplier.id, itemId: item.id, purchaseUomId: uom.id }
  })).toBe(1);
});

test("dirty-state edits retain focus and link deactivation handles stale error then successful retry", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await signInAsAdmin(page);
  const { supplier, item, link } = await seedActionSupplier(true);
  if (!link) throw new Error("DEC0242_LINK_FIXTURE_REQUIRED");
  await page.goto(catalogHref(supplier.id, {
    catalogQuery: item.itemCode,
    selectedSupplierItemLinkId: link.id
  }));
  const sheet = page.getByRole("dialog", { name: "Deactivate supplier-item link" });
  const reason = sheet.getByLabel("Deactivation reason", { exact: true });
  await expect(reason).toBeFocused();
  await reason.fill("Stale deactivation reason retained");
  await expect(reason).toBeFocused();
  await prisma.supplierItemLink.update({ where: { id: link.id }, data: { status: "INACTIVE" } });
  await sheet.getByRole("button", { name: "Deactivate link", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Action not completed" })).toBeVisible();
  await expect(reason).toHaveValue("Stale deactivation reason retained");
  await prisma.supplierItemLink.update({ where: { id: link.id }, data: { status: "ACTIVE" } });
  await sheet.getByRole("button", { name: "Deactivate link", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Action completed" })).toBeVisible();
  await expect(sheet).toBeHidden({ timeout: 5_000 });
  await expect(page.getByRole("heading", { name: /Catalog$/ })).toBeFocused();
  await expect.poll(async () => (await prisma.supplierItemLink.findUniqueOrThrow({ where: { id: link.id } })).status).toBe("INACTIVE");
});

test("true-empty, filtered-empty, and inactive retained states remain distinct", async ({ page }) => {
  await seedReadOnlySuppliers();
  await page.setViewportSize({ width: 412, height: 915 });
  await signInAsAdmin(page);

  await page.goto(`/suppliers?supplier=${emptySupplierId}&tab=catalog`);
  await expect(page.getByTestId("supplier-catalog-responsive-cards").getByText("No catalog links configured")).toBeVisible();
  await page.goto(catalogHref((await seededCatalogContext()).supplier.id, { catalogQuery: "DEC0242-NO-MATCH" }));
  await expect(page.getByTestId("supplier-catalog-responsive-cards").getByText("No catalog links match the current filters")).toBeVisible();
  await page.goto("/suppliers?query=DEC0242-NO-SUPPLIER-MATCH");
  await expect(page.getByText("No suppliers match the current filters")).toBeVisible();
  await page.goto("/suppliers?query=DEC0242-INACTIVE&status=INACTIVE");
  const inactiveCard = page.getByTestId("supplier-card").filter({ hasText: "DEC-0242 Inactive Supplier" });
  await expect(inactiveCard).toContainText("Inactive supplier retained as read-only history.");
  await expect(inactiveCard.getByRole("link", { name: "Deactivate" })).toHaveCount(0);
  await page.goto(`/suppliers?supplier=${inactiveSupplierId}&tab=catalog`);
  const inactiveCatalog = page.getByTestId("supplier-catalog-workspace");
  await expect(inactiveCatalog.getByRole("link", { name: "Create supplier-item link" })).toHaveCount(0);
  await expect(inactiveCatalog.getByRole("link", { name: "Open controls" })).toHaveCount(0);
  await expect(inactiveCatalog.getByText("Supplier and catalog links are retained as read-only history.")).toBeVisible();
  await page.goto(`/suppliers?supplier=${inactiveEmptySupplierId}&tab=catalog`);
  await expect(page.getByTestId("supplier-catalog-responsive-cards").getByText("This inactive supplier has no catalog history. New links are unavailable.")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("user-controlled success URLs do not claim a completed Supplier mutation", async ({ page }) => {
  await signInAsAdmin(page);
  const { supplier } = await seededCatalogContext();
  await page.goto(catalogHref(supplier.id, { success: "SUPPLIER_ITEM_LINK_CREATED" }));
  await expect(page.getByText("Action completed")).toHaveCount(0);
  await page.goto(catalogHref(supplier.id, { success: "SUPPLIER_ITEM_LINK_DEACTIVATED" }));
  await expect(page.getByText("Action completed")).toHaveCount(0);
});
