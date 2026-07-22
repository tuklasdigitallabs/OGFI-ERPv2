import { expect, test, type Locator, type Page } from "@playwright/test";

const approverEmail = process.env.DEMO_APPROVER_EMAIL ?? "approver@example.test";
const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@example.test";
const superUserEmail =
  process.env.DEMO_SUPER_USER_EMAIL ?? "super.admin@ogfi.example";
const requesterEmail = process.env.DEMO_USER_EMAIL ?? "user@example.test";
const seededSupplierCode = "OGF-BEEF-PRIME";
const seededSupplierName = "Prime Cut Foods Corporation";
const seededSupplierDisplayName = "Prime Cut Beef";
const seededItemCode = "BEEF-HARAMI-SKIRT-KG";

function futureDate(daysFromToday: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

async function clickAboveMobileNavigation(page: Page, locator: Locator) {
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await locator.evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "nearest" }),
    );
    await locator.evaluate((element) => (element as HTMLButtonElement).click());
    return;
  } else {
    await locator.scrollIntoViewIfNeeded();
  }
  await locator.click();
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

async function signInAs(
  page: Page,
  email: string,
  landingPath: string,
  landingHeading: string
) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expectDemoSession(page, email);
  await page.goto(landingPath);
  await expect(page.getByRole("heading", { name: landingHeading })).toBeVisible();
}

async function createDraftPurchaseRequest(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Create Draft PR" });
  await page
    .getByRole("button", { name: "Create Draft Purchase Request" })
    .click({ force: true });
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

async function openPurchaseRequestComposer(page: Page) {
  await page.getByRole("button", { name: "Create Purchase Request" }).click();
  await expect(page.getByRole("dialog", { name: "Create Draft PR" })).toBeVisible();
}

async function getCurrentPurchaseRequestReference(page: Page) {
  const referenceHeading = page.getByRole("heading", { level: 2, name: /^PR-/ });
  await expect(referenceHeading).toBeVisible();
  return (await referenceHeading.textContent())?.trim() ?? "";
}

async function openEntryDialog(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function gotoRowView(page: Page, row: Locator) {
  const href = await row.getByRole("link", { name: "View" }).getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href ?? "/purchase-requests");
}

async function gotoAdminUserAccess(page: Page, row: Locator) {
  const href = await row
    .getByRole("link", { name: "Manage Access" })
    .getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href ?? "/admin", { timeout: 30_000 });
}

async function gotoAuditEvent(page: Page, eventType: string) {
  await page.goto("/admin?tab=audit");
  await expect(page.getByRole("heading", { name: "Audit Trail", level: 2 })).toBeVisible();
  const href = await page
    .getByTestId("admin-audit-row")
    .filter({ hasText: eventType })
    .first()
    .getByRole("link", { name: "View Event" })
    .getAttribute("href");
  expect(href).toBeTruthy();
  expect(href).toMatch(/^\/admin\/audit\/[^/]+$/);
  await page.goto(href ?? "/admin");
  await expect(page.getByRole("heading", { name: "Audit Event" })).toBeVisible();
  await expect(page.getByText(eventType).first()).toBeVisible();
  await expect(page.getByText("Append-only")).toBeVisible();
}

async function gotoCoreAdmin(page: Page) {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Core Administration" })).toBeVisible();
}

test("dashboard keeps the priority preview readable at desktop and mobile widths", async ({ page }) => {
  await signInAs(page, requesterEmail, "/dashboard", "Company Overview");

  await expect(page.getByRole("heading", { name: "Today’s work" })).toBeVisible();
  await expect(page.getByText("A bounded priority preview of records assigned to you or requiring attention in the selected scope.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Assigned approvals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operational exceptions" })).toBeVisible();
  expect(
    await page
      .locator("html")
      .evaluate((documentElement: HTMLElement) => documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("non-admin users cannot open core administration", async ({ page }) => {
  await signInAs(
    page,
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Core Administration" })).not.toBeVisible();

  await page.goto("/admin/users/00000000-0000-4000-8000-000000000006");
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "User Access" })).not.toBeVisible();

  await page.goto("/suppliers");
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Suppliers" })).not.toBeVisible();

  await page.goto("/items");
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Item Master" })).not.toBeVisible();

  await page.goto("/quotes");
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Supplier Quotes" })).not.toBeVisible();
});

test("returned purchase requests can be reopened as draft", async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);

  await signInAs(
    page,
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );

  const marker = `Returned PR ${testInfo.project.name} ${Date.now()} ${Math.random()
    .toString(16)
    .slice(2, 8)}`;
  await openPurchaseRequestComposer(page);
  await page.getByLabel("Required date").fill(futureDate(7));
  await page.getByLabel("Urgency").selectOption("Normal");
  await page.getByLabel("Justification").fill(`Return/reopen validation for ${marker}`);
  await page.getByLabel("Catalog item").selectOption({ index: 1 });
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Purpose / notes").fill(marker);
  await createDraftPurchaseRequest(page);
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  const requestReference = await getCurrentPurchaseRequestReference(page);

  await page.getByRole("button", { name: "Submit for Approval" }).click();
  await expect(page.getByText("PENDING APPROVAL")).toBeVisible();

  await signInAs(page, approverEmail, "/approvals", "Approval Inbox");
  const approvalRow = page.getByTestId("approval-row").filter({ hasText: requestReference });
  await approvalRow.getByRole("link", { name: "Review" }).click();
  const approverComment = `Approver comment ${marker}`;
  await page.getByLabel("Add comment").fill(approverComment);
  await page.getByRole("button", { name: "Add Comment" }).click();
  await expect(page.getByTestId("approval-comment").filter({ hasText: approverComment })).toBeVisible();
  await page.getByLabel("Decision remarks").fill(`Return for revision ${marker}`);
  await page.getByRole("button", { name: "Return for Revision" }).click();
  await expect(page.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();

  await signInAs(
    page,
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );
  const requestRow = page.getByTestId("purchase-request-row").filter({ hasText: requestReference });
  await expect(requestRow.getByText("RETURNED", { exact: true })).toBeVisible();
  await gotoRowView(page, requestRow);
  await expect(page.getByTestId("purchase-request-comment").filter({ hasText: approverComment })).toBeVisible();
  await expect(page.getByText("purchase_request.returned")).toBeVisible();
  await page.getByRole("button", { name: "Reopen as Draft" }).click();
  await expect(page.getByText("DRAFT", { exact: true })).toBeVisible();
  await expect(page.getByText("purchase_request.reopened")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for Approval" })).toBeVisible();
});

test("draft purchase requests can be cancelled with audit history", async ({
  page
}, testInfo) => {
  await signInAs(
    page,
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );

  const marker = `Cancelled PR ${testInfo.project.name} ${Date.now()} ${Math.random()
    .toString(16)
    .slice(2, 8)}`;
  await openPurchaseRequestComposer(page);
  await page.getByLabel("Required date").fill(futureDate(8));
  await page.getByLabel("Urgency").selectOption("Normal");
  await page.getByLabel("Justification").fill(`Cancellation validation for ${marker}`);
  await page.getByLabel("Catalog item").selectOption({ index: 1 });
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Purpose / notes").fill(marker);
  await createDraftPurchaseRequest(page);
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  const comment = `Draft comment ${marker}`;
  await page.getByLabel("Add comment").fill(comment);
  await page.getByRole("button", { name: "Add Comment" }).click();
  await expect(page.getByTestId("purchase-request-comment").filter({ hasText: comment })).toBeVisible();
  await expect(page.getByText("purchase_request.comment_added")).toBeVisible();
  await page.getByLabel("Cancellation reason").fill(`Cancel validation ${marker}`);
  await page.getByRole("button", { name: "Cancel Purchase Request" }).click();
  await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
  await expect(page.getByText("purchase_request.cancelled")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for Approval" })).not.toBeVisible();
});

test("purchase requests can be rejected with remarks and action history", async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);

  await signInAs(
    page,
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );

  const marker = `Rejected PR ${testInfo.project.name} ${Date.now()} ${Math.random()
    .toString(16)
    .slice(2, 8)}`;
  await openPurchaseRequestComposer(page);
  await page.getByLabel("Required date").fill(futureDate(9));
  await page.getByLabel("Urgency").selectOption("Normal");
  await page.getByLabel("Justification").fill(`Rejection validation for ${marker}`);
  await page.getByLabel("Catalog item").selectOption({ index: 1 });
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Purpose / notes").fill(marker);
  await createDraftPurchaseRequest(page);
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  const requestReference = await getCurrentPurchaseRequestReference(page);
  await page.getByRole("button", { name: "Submit for Approval" }).click();
  await expect(page.getByText("PENDING APPROVAL")).toBeVisible();

  await signInAs(page, approverEmail, "/approvals", "Approval Inbox");
  await page
    .getByTestId("approval-row")
    .filter({ hasText: requestReference })
    .getByRole("link", { name: "Review" })
    .click();
  const rejectRemarks = `Reject validation ${marker}`;
  await page.getByLabel("Decision remarks").fill(rejectRemarks);
  await page.getByRole("button", { name: "Reject Purchase Request" }).click();
  await expect(page.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();

  await signInAs(
    page,
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );
  const rejectedRow = page.getByTestId("purchase-request-row").filter({ hasText: requestReference });
  await expect(rejectedRow.getByText("REJECTED", { exact: true })).toBeVisible();
  await gotoRowView(page, rejectedRow);
  await expect(page.getByText("purchase_request.rejected")).toBeVisible();
  await expect(
    page
      .getByTestId("purchase-request-approval-action")
      .filter({ hasText: "REJECTED" })
      .filter({ hasText: "Alyssa Tan" })
      .filter({ hasText: rejectRemarks })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for Approval" })).not.toBeVisible();
});

test("first milestone purchase request path works end to end", async ({
  page
}, testInfo) => {
  test.setTimeout(360_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);

  await signInAs(
    page,
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );

  const marker = `Test PR ${testInfo.project.name} ${Date.now()} ${Math.random()
    .toString(16)
    .slice(2, 8)}`;
  const scopeCandidateName =
    testInfo.project.name === "mobile" ? "Lia Mendoza" : "Paolo Cruz";
  await openPurchaseRequestComposer(page);
  await page.getByLabel("Required date").fill(futureDate(10));
  await page.getByLabel("Urgency").selectOption("Normal");
  await page.getByLabel("Justification").fill(`Local milestone validation for ${marker}`);
  await page.getByLabel("Catalog item").selectOption({ index: 1 });
  await page.getByLabel("Quantity").fill("3");
  await page.getByLabel("Purpose / notes").fill(marker);
  await createDraftPurchaseRequest(page);

  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  const requestReference = await getCurrentPurchaseRequestReference(page);
  await expect(page.getByText("purchase_request.created")).toBeVisible();

  await page.getByRole("button", { name: "Submit for Approval" }).click();
  await expect(page.getByText("PENDING APPROVAL")).toBeVisible();
  await expect(page.getByText("purchase_request.submitted")).toBeVisible();

  await page.goto("/approvals");
  await expect(page.getByRole("heading", { name: "Company Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approval Inbox" })).not.toBeVisible();

  await signInAs(page, approverEmail, "/approvals", "Approval Inbox");
  const approvalRow = page.getByTestId("approval-row").filter({ hasText: requestReference });
  await approvalRow.getByRole("link", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Approval Review" })).toBeVisible();
  await page.getByRole("button", { name: "Approve Purchase Request" }).click();
  await expect(page.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();

  await page.goto("/purchase-requests");
  await page.getByLabel("Search").fill(marker);
  await page.getByLabel("Status").selectOption("APPROVED");
  await page.getByRole("button", { name: "Apply Filters" }).click({ force: true });
  const approvedRequestRow = page.getByTestId("purchase-request-row").filter({ hasText: marker });
  await expect(approvedRequestRow.getByText("APPROVED")).toBeVisible();
  const exportResponse = await page.request.get(
    `/purchase-requests/export?search=${encodeURIComponent(marker)}&status=APPROVED`
  );
  expect(exportResponse.ok()).toBe(true);
  const exportCsv = await exportResponse.text();
  expect(exportCsv).toContain(marker);
  expect(exportCsv).toContain("APPROVED");
  await approvedRequestRow.getByRole("link", { name: "View" }).click();
  await expect(
    page.getByTestId("purchase-request-approval-action").filter({ hasText: "APPROVED" }).filter({ hasText: "Alyssa Tan" })
  ).toBeVisible();

  await signInAs(page, adminEmail, "/admin", "Core Administration");
  await page.goto("/quotes");
  await expect(page.getByRole("heading", { name: "Supplier Quotes" })).toBeVisible();
  await page.getByRole("button", { name: "Record Supplier Quote" }).click();
  const quoteDialog = page.getByRole("dialog", { name: "Record Supplier Quote" });
  await expect(quoteDialog).toBeVisible();
  const quoteRequestSelect = quoteDialog.locator('select[name="purchaseRequestId"]');
  await expect(quoteRequestSelect).toContainText(requestReference);
  const quoteRequestOptionValue = await quoteRequestSelect
    .locator("option", { hasText: requestReference })
    .first()
    .getAttribute("value");
  expect(quoteRequestOptionValue).toBeTruthy();
  await quoteRequestSelect.selectOption(quoteRequestOptionValue ?? "");
  await page
    .locator('select[name="supplierId"]')
    .selectOption({ label: `${seededSupplierCode} / ${seededSupplierName}` });
  const quoteReference = `QUOTE-${testInfo.project.name.toUpperCase()}-${Date.now()}`;
  await page.getByLabel("Quote reference").fill(quoteReference);
  await page.getByLabel("Quote date").fill("2026-07-02");
  await page.getByLabel("Valid until").fill("2026-07-31");
  await quoteDialog.getByLabel("Quoted quantity").fill("3");
  await quoteDialog.getByLabel("Unit price").fill("42.5");
  await quoteDialog.getByLabel("Lead days").fill("2");
  await quoteDialog.getByLabel("Availability").fill("Available");
  await quoteDialog.getByLabel("Terms").fill("Net 15");
  await quoteDialog.getByLabel("Notes").fill(`E2E quote note for ${marker}`);
  await quoteDialog.getByLabel("Recording reason").fill(`E2E quote capture for ${marker}`);
  await quoteDialog.getByRole("button", { name: "Record Supplier Quote", exact: true }).click();
  const currentQuoteRequestRow = page.getByTestId("quote-request-row").filter({ hasText: requestReference });
  const supplierQuoteRow = currentQuoteRequestRow
    .getByTestId("supplier-quote-row")
    .filter({ hasText: quoteReference });
  await expect(supplierQuoteRow.filter({ hasText: seededSupplierDisplayName })).toBeVisible();
  await expect(supplierQuoteRow.filter({ hasText: "PHP 127.50" })).toBeVisible();
  await expect(supplierQuoteRow.filter({ hasText: "Lowest recorded cost" })).toBeVisible();
  await currentQuoteRequestRow
    .locator('select[name="selectedSupplierQuotationId"]')
    .selectOption({ label: `${seededSupplierDisplayName} / ${quoteReference} / PHP 127.50` });
  await currentQuoteRequestRow
    .getByLabel("Selection reason")
    .fill(`Recommended supplier for ${marker}`);
  await currentQuoteRequestRow
    .getByLabel("Single-source justification")
    .fill(`Only recorded quote for ${marker}`);
  await clickAboveMobileNavigation(
    page,
    currentQuoteRequestRow.getByRole("button", { name: "Record Recommendation" }),
  );
  const recommendation = currentQuoteRequestRow
    .getByTestId("quotation-recommendation")
    .filter({ hasText: quoteReference });
  await expect(recommendation.filter({ hasText: seededSupplierDisplayName })).toBeVisible();
  await expect(recommendation.filter({ hasText: `Recommended supplier for ${marker}` })).toBeVisible();
  await expect(recommendation.filter({ hasText: `Only recorded quote for ${marker}` })).toBeVisible();
  await currentQuoteRequestRow
    .getByRole("button", { name: "Submit Recommendation" })
    .click();
  await expect(currentQuoteRequestRow.getByText("PENDING APPROVAL")).toBeVisible({
    timeout: 15_000
  });

  await signInAs(page, approverEmail, "/approvals", "Approval Inbox");
  const recommendationApprovalRow = page
    .getByTestId("approval-row")
    .filter({ hasText: quoteReference })
    .filter({ hasText: "QuotationRecommendation" });
  await recommendationApprovalRow.getByRole("link", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Approval Review" })).toBeVisible();
  await expect(page.getByText("Quotation Recommendation Approval")).toBeVisible();
  await expect(page.getByText(seededSupplierDisplayName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve Recommendation" }).click();
  await expect(page.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();

  await signInAs(page, adminEmail, "/quotes", "Supplier Quotes");
  await expect(
    page
      .getByTestId("quote-request-row")
      .filter({ hasText: requestReference })
      .getByTestId("quotation-recommendation")
      .filter({ hasText: quoteReference })
      .filter({ hasText: seededSupplierDisplayName })
  ).toBeVisible();
  await expect(
    page
      .getByTestId("quote-request-row")
      .filter({ hasText: requestReference })
      .getByTestId("quotation-recommendation-status")
      .getByText("APPROVED")
  ).toBeVisible();
  const quoteExportResponse = await page.request.get("/quotes/export");
  expect(quoteExportResponse.ok()).toBe(true);
  const quoteExportCsv = await quoteExportResponse.text();
  expect(quoteExportCsv).toContain(quoteReference);
  expect(quoteExportCsv).toContain(seededSupplierDisplayName);
  expect(quoteExportCsv).toContain("true");
  await signInAs(
    page,
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );
  await page.getByLabel("Search").fill(marker);
  await page.getByLabel("Status").selectOption("APPROVED");
  await page.getByRole("button", { name: "Apply Filters" }).click({ force: true });
  const approvedRequestHref = await page
    .getByTestId("purchase-request-row")
    .filter({ hasText: marker })
    .getByRole("link", { name: "View" })
    .getAttribute("href");
  expect(approvedRequestHref).toBeTruthy();
  await page.goto(approvedRequestHref ?? "/purchase-requests");
  const requestQuoteRow = page.getByTestId("purchase-request-quote-row").filter({ hasText: quoteReference });
  await expect(requestQuoteRow.filter({ hasText: seededSupplierDisplayName })).toBeVisible();
  await expect(requestQuoteRow.filter({ hasText: "PHP 127.50" })).toBeVisible();

  await signInAs(page, adminEmail, "/admin", "Core Administration");
  await expect(page.getByRole("heading", { name: "Core Administration" })).toBeVisible();
  await expect(page.getByLabel("Location context")).toHaveValue(
    "00000000-0000-4000-8000-000000000004"
  );
  await expect(page.getByLabel("Location context")).toContainText("Yakiniku Like SM North Edsa");
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByRole("heading", { name: "Core Administration" })).toBeVisible();
  await expect(
    page.getByTestId("admin-user-row").filter({ hasText: "Nico Valdez" })
  ).toBeVisible();
  await page.goto("/suppliers");
  await expect(page.getByRole("heading", { name: "Suppliers" })).toBeVisible();
  await expect(
    page.getByTestId("supplier-row").filter({ hasText: seededSupplierCode })
  ).toBeVisible();
  const supplierCode = `E2E-${testInfo.project.name.toUpperCase()}-${Date.now()}`;
  const supplierDialog = await openEntryDialog(page, "Create Supplier");
  await page.getByLabel("Supplier code").fill(supplierCode);
  await page.getByLabel("Legal name").fill(`${marker} Supplier Legal`);
  await page.getByLabel("Trading name").fill(`${marker} Supplier`);
  await page.getByLabel("Payment terms").fill("Net 15");
  await page.getByLabel("Primary contact").fill("E2E Contact");
  await page.getByLabel("Contact role").fill("Sales");
  await page.getByLabel("Contact email").fill("e2e-supplier@example.test");
  await page.getByLabel("Creation reason").fill(`E2E supplier setup for ${marker}`);
  await supplierDialog.getByRole("button", { name: "Create Supplier", exact: true }).click();
  const supplierRow = page.getByTestId("supplier-row").filter({ hasText: supplierCode });
  await expect(supplierRow).toBeVisible();
  await supplierRow.getByRole("button", { name: "Deactivate", exact: true }).click();
  const supplierDeactivationDialog = page.getByRole("dialog", { name: "Deactivate Supplier" });
  await supplierDeactivationDialog
    .getByLabel("Deactivation reason")
    .fill(`E2E supplier deactivation for ${marker}`);
  await supplierDeactivationDialog
    .getByRole("button", { name: "Deactivate Supplier", exact: true })
    .click();
  await expect(page.getByTestId("supplier-row").filter({ hasText: supplierCode }).getByText("INACTIVE")).toBeVisible();
  await page.goto("/items");
  await expect(page.getByRole("heading", { name: "Item Master" })).toBeVisible();
  await expect(
    page.getByTestId("item-row").filter({ hasText: seededItemCode })
  ).toBeVisible();
  const itemStamp = `${testInfo.project.name.toUpperCase()}-${Date.now()}`;
  const categoryCode = `CAT-${itemStamp}`;
  const uomCode = `UOM-${itemStamp}`;
  const itemCode = `ITEM-${itemStamp}`;
  const itemName = `${marker} Item`;
  await page.locator('a[href="/items?tab=categories"]').click();
  await page.waitForURL(/\/items\?tab=categories$/);
  const categoryDialog = await openEntryDialog(page, "Create Category");
  await page.getByLabel("Category code").fill(categoryCode);
  await page.getByLabel("Category name").fill(`${marker} Category`);
  await page.getByLabel("Inventory class").selectOption("RAW_MATERIAL");
  await page.getByLabel("Category creation reason").fill(`E2E category setup for ${marker}`);
  await categoryDialog.getByRole("button", { name: "Create Category", exact: true }).click();
  await expect(page.getByTestId("item-category-row").filter({ hasText: categoryCode })).toBeVisible();
  await page.locator('a[href="/items?tab=uoms"]').click();
  await page.waitForURL(/\/items\?tab=uoms$/);
  const uomDialog = await openEntryDialog(page, "Create UOM");
  await page.getByLabel("UOM code").fill(uomCode);
  await page.getByLabel("UOM name").fill(`${marker} Unit`);
  await page.getByLabel("UOM type").selectOption("count");
  await page.getByLabel("UOM creation reason").fill(`E2E UOM setup for ${marker}`);
  await uomDialog.getByRole("button", { name: "Create UOM", exact: true }).click();
  await expect(page.getByTestId("uom-row").filter({ hasText: uomCode })).toBeVisible();
  await page.locator('a[href="/items?tab=items"]').click();
  await page.waitForURL(/\/items\?tab=items$/);
  const itemDialog = await openEntryDialog(page, "Create Item");
  await page.getByLabel("Item code").fill(itemCode);
  await page.getByLabel("Item name").fill(itemName);
  await page.locator('select[name="itemCategoryId"]').selectOption({ label: `${marker} Category` });
  await page.locator('select[name="baseUomId"]').selectOption({ label: uomCode });
  await page.getByLabel("Creation reason").first().fill(`E2E item setup for ${marker}`);
  await itemDialog.getByRole("button", { name: "Create Item", exact: true }).click();
  await expect(page.getByTestId("item-row").filter({ hasText: itemCode })).toBeVisible({
    timeout: 15_000,
  });
  await page.locator('a[href="/items?tab=conversions"]').click();
  await page.waitForURL(/\/items\?tab=conversions$/);
  const conversionDialog = await openEntryDialog(page, "Create Conversion");
  await page.locator('select[name="itemId"]').selectOption({ label: itemName });
  await page.locator('select[name="fromUomId"]').selectOption({ label: `From ${uomCode}` });
  await page.locator('select[name="toUomId"]').selectOption({ label: "To KG" });
  await page.getByLabel("Conversion factor").fill("1");
  await page.getByLabel("Conversion creation reason").fill(`E2E conversion setup for ${marker}`);
  await conversionDialog.getByRole("button", { name: "Create Conversion", exact: true }).click();
  await expect(page.getByTestId("conversion-row").filter({ hasText: itemName })).toBeVisible({
    timeout: 15000
  });

  await page.goto("/suppliers");
  await expect(page.getByRole("heading", { name: "Suppliers" })).toBeVisible();
  const linkDialog = await openEntryDialog(page, "Link Supplier Item");
  await page
    .locator('select[name="supplierId"]')
    .selectOption({ label: `${seededSupplierCode} / ${seededSupplierName}` });
  await page.locator('select[name="itemId"]').selectOption({ label: `${itemName} / ${itemCode}` });
  await page.locator('select[name="purchaseUomId"]').selectOption({ label: `${uomCode} / ${marker} Unit` });
  const supplierSku = `SKU-${itemCode}`;
  await page.getByLabel("Supplier SKU").fill(supplierSku);
  await page.getByLabel("Supplier item name").fill(`${marker} Supplier Item`);
  await page.getByLabel("Lead days").fill("2");
  await page.getByLabel("Rank").fill("1");
  await page.getByLabel("MOQ").fill("1");
  await page.getByLabel("Reference price").fill("12.5");
  await page.getByLabel("Price effective from").fill("2026-07-01");
  await page.getByLabel("Link reason").fill(`E2E supplier item link for ${marker}`);
  await linkDialog.getByRole("button", { name: "Link Supplier Item", exact: true }).click();
  await page
    .getByTestId("supplier-row")
    .filter({ hasText: seededSupplierCode })
    .getByRole("link", { name: "View catalog" })
    .click();
  await page.getByLabel("Search catalog").fill(supplierSku);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const supplierItemLinkRow = page
    .getByRole("row")
    .filter({ hasText: supplierSku });
  await expect(supplierItemLinkRow).toBeVisible();
  await supplierItemLinkRow.getByRole("button", { name: "Deactivate", exact: true }).click();
  const linkDeactivationDialog = page.getByRole("dialog", {
    name: "Deactivate Supplier Item Link"
  });
  await linkDeactivationDialog
    .getByLabel("Deactivation reason")
    .fill(`E2E supplier item link deactivation for ${marker}`);
  await linkDeactivationDialog
    .getByRole("button", { name: "Deactivate Link", exact: true })
    .click();
  await page.getByLabel("Search catalog").fill(supplierSku);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: supplierSku })
      .getByText("INACTIVE")
  ).toBeVisible();

  await signInAs(
    page,
    requesterEmail,
    "/purchase-requests",
    "Purchase Requests"
  );
  const catalogMarker = `${marker} Catalog PR`;
  await openPurchaseRequestComposer(page);
  await page.getByLabel("Required date").fill(futureDate(11));
  await page.getByLabel("Urgency").selectOption("Normal");
  await page.getByLabel("Justification").fill(`Catalog item validation for ${marker}`);
  await page.getByLabel("Catalog item").selectOption({ label: `${itemName} / ${itemCode}` });
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Purpose / notes").fill(catalogMarker);
  await createDraftPurchaseRequest(page);
  await expect(page.getByText(itemName, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(catalogMarker)).toBeVisible();
  await expect(page.getByText(`2 ${uomCode}`)).toBeVisible();

  await signInAs(page, adminEmail, "/items", "Item Master");
  await expect(page.getByRole("heading", { name: "Item Master" })).toBeVisible();
  const itemRow = page.getByTestId("item-row").filter({ hasText: itemCode });
  await itemRow.locator("summary").click();
  await itemRow.getByRole("button", { name: "Deactivate", exact: true }).click();
  const itemDeactivationDialog = page.getByRole("dialog", { name: "Deactivate Item" });
  await itemDeactivationDialog
    .getByLabel("Item deactivation reason")
    .fill(`E2E item deactivation for ${marker}`);
  await itemDeactivationDialog
    .getByRole("button", { name: "Deactivate Item", exact: true })
    .click();
  await expect(page.getByTestId("item-row").filter({ hasText: itemCode }).getByText("INACTIVE")).toBeVisible();
  await page.locator('a[href="/items?tab=categories"]').click();
  await page.waitForURL(/\/items\?tab=categories$/);
  const categoryRow = page.getByTestId("item-category-row").filter({ hasText: categoryCode });
  await categoryRow.locator("summary").click();
  await categoryRow.getByRole("button", { name: "Deactivate", exact: true }).click();
  const categoryDeactivationDialog = page.getByRole("dialog", { name: "Deactivate Category" });
  await categoryDeactivationDialog
    .getByLabel("Category deactivation reason")
    .fill(`E2E category deactivation for ${marker}`);
  await categoryDeactivationDialog
    .getByRole("button", { name: "Deactivate Category", exact: true })
    .click();
  await expect(
    page.getByTestId("item-category-row").filter({ hasText: categoryCode }).getByText("INACTIVE")
  ).toBeVisible();
  await page.locator('a[href="/items?tab=uoms"]').click();
  await page.waitForURL(/\/items\?tab=uoms$/);
  const uomRow = page.getByTestId("uom-row").filter({ hasText: uomCode });
  await uomRow.locator("summary").click();
  await uomRow.getByRole("button", { name: "Deactivate", exact: true }).click();
  const uomDeactivationDialog = page.getByRole("dialog", { name: "Deactivate UOM" });
  await uomDeactivationDialog
    .getByLabel("UOM deactivation reason")
    .fill(`E2E UOM deactivation for ${marker}`);
  await uomDeactivationDialog
    .getByRole("button", { name: "Deactivate UOM", exact: true })
    .click();
  await expect(page.getByTestId("uom-row").filter({ hasText: uomCode }).getByText("INACTIVE")).toBeVisible();
  await page.goto("/admin");
  await gotoAdminUserAccess(
    page,
    page.getByTestId("admin-user-row").filter({ hasText: "Nico Valdez" }),
  );
  await expect(page.getByRole("heading", { name: "User Access" })).toBeVisible();
  await expect(page.getByText(/^Nico Valdez \/ /)).toBeVisible();
  await expect(page.getByRole("main").getByText("ERP Administrator", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText("Self protected").first()).toBeVisible();
  await gotoCoreAdmin(page);
  await gotoAdminUserAccess(
    page,
    page.getByTestId("admin-user-row").filter({ hasText: "Bianca Reyes" }),
  );
  await expect(page.getByRole("heading", { name: "User Access" })).toBeVisible();
  await expect(page.getByText(/^Bianca Reyes \/ /)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Assign Location Scope" })).toBeVisible();
  await gotoCoreAdmin(page);
  await gotoAdminUserAccess(
    page,
    page.getByTestId("admin-user-row").filter({ hasText: scopeCandidateName }),
  );
  await expect(page.getByRole("heading", { name: "User Access" })).toBeVisible();
  await expect(page.getByText("No active roles are assigned.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("No effective permissions from active roles.")).toBeVisible();
  await expect(page.getByText("No active scopes are assigned.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Assign Location Scope" })).toBeVisible();
  const assignScopeButton = page.getByRole("button", { name: "Assign Scope" });
  if ((await assignScopeButton.count()) > 0) {
    await assignScopeButton.click();
    const scopeAssignmentDialog = page.getByRole("dialog", {
      name: "Assign Location Scope"
    });
    await expect(scopeAssignmentDialog).toBeVisible();
    await scopeAssignmentDialog
      .getByLabel("Scope assignment reason")
      .fill(`E2E scope assignment for ${marker}`);
    await scopeAssignmentDialog
      .getByRole("button", { name: "Assign Scope", exact: true })
      .click();
  }
  const assignedScopeRow = page
    .getByTestId("admin-user-scope-row")
    .filter({ hasText: "LOCATION" })
    .filter({ hasText: "VIEW" });
  await expect(assignedScopeRow).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Controlled Role Requests" }),
  ).toBeVisible();
  const roleRequestDialog = await openEntryDialog(
    page,
    "Request Controlled Role",
  );
  const requesterRoleOption = roleRequestDialog
    .locator('select[name="roleId"] option')
    .filter({ hasText: "Branch Storekeeper" });
  const requesterRoleId = await requesterRoleOption.getAttribute("value");
  expect(requesterRoleId).toBeTruthy();
  await roleRequestDialog
    .locator('select[name="roleId"]')
    .selectOption(requesterRoleId ?? "");
  await roleRequestDialog
    .getByLabel("Business reason")
    .fill(`E2E controlled role request for ${marker}`);
  await roleRequestDialog
    .getByLabel("Evidence reference")
    .fill(`E2E-ROLE-${marker}`);
  await roleRequestDialog
    .getByRole("button", { name: "Submit Controlled Role Request" })
    .click();

  await signInAs(page, superUserEmail, "/admin", "Core Administration");
  await gotoAdminUserAccess(
    page,
    page.getByTestId("admin-user-row").filter({ hasText: scopeCandidateName }),
  );
  const controlledRequestRow = page
    .getByText(`E2E controlled role request for ${marker}`)
    .locator("xpath=ancestor::div[contains(@class,'ogfi-list-row')][1]");
  await expect(controlledRequestRow).toBeVisible();
  const approveControlledRoleButton = controlledRequestRow.getByRole("button", {
    name: "Approve",
    exact: true,
  });
  await expect(approveControlledRoleButton).toBeEnabled({ timeout: 15_000 });
  await clickAboveMobileNavigation(page, approveControlledRoleButton);
  const roleApprovalDialog = page.getByRole("dialog", {
    name: "Approve Controlled Role",
  });
  await roleApprovalDialog
    .getByLabel("Approval reason")
    .fill(`E2E independent role approval for ${marker}`);
  await roleApprovalDialog
    .getByRole("button", { name: "Approve Role", exact: true })
    .click();
  const assignedRoleRow = page
    .getByTestId("admin-user-role-row")
    .filter({ hasText: "Branch Storekeeper" });
  await expect(assignedRoleRow).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText("Create purchase requests", { exact: true }).first(),
  ).toBeVisible();
  await clickAboveMobileNavigation(
    page,
    assignedRoleRow.getByRole("button", { name: "Deactivate Role", exact: true }),
  );
  const roleDeactivationDialog = page.getByRole("dialog", { name: "Deactivate Role" });
  await roleDeactivationDialog
    .getByLabel("Role deactivation reason")
    .fill(`E2E role deactivation for ${marker}`);
  await roleDeactivationDialog
    .getByRole("button", { name: "Deactivate Role", exact: true })
    .click();
  await expect(page.getByText("No active roles are assigned.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: "Request Controlled Role" }),
  ).toBeVisible();
  await clickAboveMobileNavigation(
    page,
    assignedScopeRow.getByRole("button", { name: "Deactivate Scope", exact: true }),
  );
  const scopeDeactivationDialog = page.getByRole("dialog", { name: "Deactivate Scope" });
  await scopeDeactivationDialog
    .getByLabel("Deactivation reason")
    .fill(`E2E scope deactivation for ${marker}`);
  await scopeDeactivationDialog
    .getByRole("button", { name: "Deactivate Scope", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Assign Scope" })).toBeVisible({
    timeout: 15_000,
  });
  await gotoCoreAdmin(page);
  await page.locator('a[href="/admin?tab=roles"]').click();
  const roleAccessHref = await page
    .getByTestId("admin-role-row")
    .filter({ hasText: "ERP Administrator" })
    .getByRole("link", { name: "Configure Role" })
    .getAttribute("href");
  expect(roleAccessHref).toBeTruthy();
  await page.goto(roleAccessHref ?? "/admin", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Role Access" })).toBeVisible();
  await expect(page.getByText("ERP Administrator / CONFIGURED_ADMIN")).toBeVisible();
  await expect(
    page
      .getByTestId("admin-role-permission-toggle")
      .filter({ hasText: "Administer core setup" })
  ).toBeVisible();
  await gotoCoreAdmin(page);
  await page.goto("/admin/permissions/00000000-0000-4000-8000-000000000016", {
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: "Permission Access" })).toBeVisible();
  await expect(page.getByTestId("admin-permission-role-row").filter({ hasText: "ERP Administrator" })).toBeVisible();
  await gotoCoreAdmin(page);
  await page.goto("/admin/companies/00000000-0000-4000-8000-000000000002", {
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: "Company Context" })).toBeVisible();
  await expect(page.getByTestId("admin-company-user-row").filter({ hasText: "Nico Valdez" })).toBeVisible();
  await expect(page.getByTestId("admin-company-location-row").filter({ hasText: "Yakiniku Like SM North Edsa" })).toBeVisible();
  await gotoCoreAdmin(page);
  await page.goto("/admin/approval-rules/00000000-0000-4000-8000-000000000010", {
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: "Approval Rule" })).toBeVisible();
  await expect(
    page.getByTestId("admin-rule-step-row").filter({ hasText: "Operations Approver" })
  ).toBeVisible();
  await gotoCoreAdmin(page);
  await page.goto("/admin/locations/00000000-0000-4000-8000-000000000004");
  await expect(page.getByRole("heading", { name: "Location Context" })).toBeVisible();
  await expect(page.getByText("One Gourmet Foods Inc. / Yakiniku Like / Yakiniku Like SM North Edsa")).toBeVisible();
  await expect(page.getByTestId("admin-location-user-row").filter({ hasText: "Nico Valdez" })).toBeVisible();
  await gotoCoreAdmin(page);
  await page.locator('a[href="/admin?tab=audit"]').click();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "purchase_request.approved" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "user_scope_assignment.deactivated" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "user_role_assignment.deactivated" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "supplier.created" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "supplier_quote.created" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "supplier.deactivated" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "item.created" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "item_uom_conversion.created" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "item.deactivated" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "item_category.deactivated" }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("admin-audit-row").filter({ hasText: "uom.deactivated" }).first()
  ).toBeVisible();
  await gotoAuditEvent(page, "user_scope_assignment.deactivated");
  await gotoCoreAdmin(page);
  await gotoAuditEvent(page, "purchase_request.approved");
});
